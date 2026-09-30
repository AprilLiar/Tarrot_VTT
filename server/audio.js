import { AppError } from './errors.js';
import { cleanName } from './roster.js';

// The shared soundtrack. Tracks are YouTube links, never uploaded audio, so
// the free database stays small. Playlists and tracks are kept in the
// database. What is playing right now is held in server memory only (it stops
// when the server restarts).
//
// The server stores an ANCHOR, not a running position: "at server time T the
// music was at position P and playing". Any screen, including one that joins
// late, can work out where the music is now from that, so all stay in sync.

export const AUDIO_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS audio_playlists (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS audio_tracks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     playlist_id INTEGER NOT NULL,
     youtube_id TEXT NOT NULL,
     name TEXT NOT NULL,
     duration_ms INTEGER,
     position INTEGER NOT NULL DEFAULT 0
   )`,
];

export const REPEAT_MODES = ['off', 'one', 'all'];
export const MIN_DURATION_MS = 5000; // shorter reports are usually an advert
export const PREVIOUS_RESTARTS_AFTER_MS = 3000;
// YouTube error codes for a video that cannot be embedded or does not exist.
export const UNPLAYABLE_CODES = [2, 100, 101, 150];

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Accepts a YouTube link (watch, youtu.be, embed, shorts, live, music.youtube.com) or a bare id.
export function parseYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (ID_RE.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

// ---- Library (database) --------------------------------------------------------

const toTrack = (r) => ({
  id: Number(r.id),
  playlistId: Number(r.playlist_id),
  youtubeId: r.youtube_id,
  name: r.name,
  durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
});

export async function listLibrary(db) {
  const [pl, tr] = await Promise.all([
    db.execute('SELECT id, name FROM audio_playlists ORDER BY position, id'),
    db.execute('SELECT * FROM audio_tracks ORDER BY position, id'),
  ]);
  const tracks = tr.rows.map(toTrack);
  return pl.rows.map((p) => ({
    id: Number(p.id),
    name: p.name,
    tracks: tracks.filter((t) => t.playlistId === Number(p.id)),
  }));
}

export async function listTracks(db, playlistId) {
  const r = await db.execute({
    sql: 'SELECT * FROM audio_tracks WHERE playlist_id = ? ORDER BY position, id',
    args: [playlistId],
  });
  return r.rows.map(toTrack);
}

export async function getTrack(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid track.');
  const r = await db.execute({ sql: 'SELECT * FROM audio_tracks WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That track no longer exists.');
  return toTrack(r.rows[0]);
}

async function requirePlaylist(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid playlist.');
  const r = await db.execute({ sql: 'SELECT id, name FROM audio_playlists WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That playlist no longer exists.');
  return { id: Number(r.rows[0].id), name: r.rows[0].name };
}

export async function createPlaylist(db, name) {
  const clean = cleanName(name);
  const next = Number((await db.execute('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM audio_playlists')).rows[0].p);
  const r = await db.execute({ sql: 'INSERT INTO audio_playlists (name, position) VALUES (?, ?)', args: [clean, next] });
  return Number(r.lastInsertRowid);
}

export async function renamePlaylist(db, id, name) {
  await requirePlaylist(db, id);
  await db.execute({ sql: 'UPDATE audio_playlists SET name = ? WHERE id = ?', args: [cleanName(name), id] });
}

export async function deletePlaylist(db, id) {
  await requirePlaylist(db, id);
  await db.execute({ sql: 'DELETE FROM audio_tracks WHERE playlist_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM audio_playlists WHERE id = ?', args: [id] });
}

export const MAX_TRACKS_PER_PLAYLIST = 200;

export async function createTrack(db, { playlistId, url, name }) {
  await requirePlaylist(db, playlistId);
  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) throw new AppError('not_youtube', 'That is not a YouTube video link.');
  const label = typeof name === 'string' && name.trim() ? cleanName(name) : `YouTube ${youtubeId}`;
  const count = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM audio_tracks WHERE playlist_id = ?', args: [playlistId] })).rows[0].n);
  if (count >= MAX_TRACKS_PER_PLAYLIST) throw new AppError('limit', 'At most {max} tracks per playlist.', { max: MAX_TRACKS_PER_PLAYLIST });
  const r = await db.execute({
    sql: 'INSERT INTO audio_tracks (playlist_id, youtube_id, name, position) VALUES (?, ?, ?, ?)',
    args: [playlistId, youtubeId, label, count],
  });
  return Number(r.lastInsertRowid);
}

export async function renameTrack(db, id, name) {
  await getTrack(db, id);
  await db.execute({ sql: 'UPDATE audio_tracks SET name = ? WHERE id = ?', args: [cleanName(name), id] });
}

export async function deleteTrack(db, id) {
  const t = await getTrack(db, id);
  await db.execute({ sql: 'DELETE FROM audio_tracks WHERE id = ?', args: [id] });
  return t;
}

// `ids` is the full ordered list of the playlist's track ids.
export async function reorderTracks(db, playlistId, ids) {
  await requirePlaylist(db, playlistId);
  const current = (await listTracks(db, playlistId)).map((t) => t.id);
  if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((i) => !current.includes(i))) {
    throw new AppError('bad_id', 'The order must list every track once.');
  }
  await db.batch(ids.map((id, position) => ({ sql: 'UPDATE audio_tracks SET position = ? WHERE id = ?', args: [position, id] })), 'write');
}

// Keeps the largest reported duration (an advert can report a short one first).
export async function reportDuration(db, trackId, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < MIN_DURATION_MS) return null;
  const t = await getTrack(db, trackId).catch(() => null);
  if (!t) return null;
  const ms = Math.round(durationMs);
  if (t.durationMs == null || ms > t.durationMs) {
    await db.execute({ sql: 'UPDATE audio_tracks SET duration_ms = ? WHERE id = ?', args: [ms, trackId] });
    return ms;
  }
  return t.durationMs;
}

// ---- Playback state (memory) ------------------------------------------------------

export function createPlayer({ now = Date.now, random = Math.random } = {}) {
  const s = {
    trackId: null,
    youtubeId: null,
    name: '',
    playlistId: null,
    durationMs: null,
    isPlaying: false,
    positionMs: 0,
    anchoredAtMs: 0,
    anchorId: 0,
    repeatMode: 'off',
    shuffle: false,
    errorStreak: 0,
  };

  const positionNow = () => (s.isPlaying ? s.positionMs + (now() - s.anchoredAtMs) : s.positionMs);
  const anchor = (positionMs, isPlaying) => {
    s.positionMs = Math.max(0, Math.round(positionMs));
    s.isPlaying = isPlaying;
    s.anchoredAtMs = now();
    s.anchorId += 1;
  };

  return {
    // What clients receive. `serverMs` lets them line up their clocks.
    snapshot() {
      const { errorStreak, ...rest } = s;
      return { ...rest, serverMs: now() };
    },
    positionNow,
    get current() {
      return s.trackId;
    },
    get state() {
      return s;
    },
    play(track) {
      s.trackId = track.id;
      s.youtubeId = track.youtubeId;
      s.name = track.name;
      s.playlistId = track.playlistId;
      s.durationMs = track.durationMs;
      anchor(0, true);
    },
    pause() {
      if (s.trackId == null || !s.isPlaying) return false;
      anchor(positionNow(), false);
      return true;
    },
    resume() {
      if (s.trackId == null || s.isPlaying) return false;
      anchor(s.positionMs, true);
      return true;
    },
    stop() {
      s.trackId = null;
      s.youtubeId = null;
      s.name = '';
      s.playlistId = null;
      s.durationMs = null;
      s.errorStreak = 0;
      anchor(0, false);
    },
    seek(ms) {
      if (s.trackId == null) return false;
      const max = s.durationMs ?? Number.MAX_SAFE_INTEGER;
      anchor(Math.min(Math.max(0, ms), max), s.isPlaying);
      return true;
    },
    // Repeat and shuffle never disturb what is playing (no anchor change).
    setMode({ repeatMode, shuffle }) {
      if (repeatMode !== undefined) {
        if (!REPEAT_MODES.includes(repeatMode)) throw new AppError('bad_value', 'Unknown repeat mode.');
        s.repeatMode = repeatMode;
      }
      if (shuffle !== undefined) {
        if (typeof shuffle !== 'boolean') throw new AppError('bad_value', 'Shuffle must be on or off.');
        s.shuffle = shuffle;
      }
    },
    // The track that follows the current one, or null when the music should stop.
    next(tracks) {
      if (!tracks.length) return null;
      const i = tracks.findIndex((t) => t.id === s.trackId);
      if (s.repeatMode === 'one' && i >= 0) return tracks[i];
      if (s.shuffle) {
        const others = tracks.filter((t) => t.id !== s.trackId);
        if (!others.length) return s.repeatMode === 'all' ? tracks[0] : null;
        return others[Math.floor(random() * others.length)];
      }
      if (i < 0) return tracks[0];
      if (i + 1 < tracks.length) return tracks[i + 1];
      return s.repeatMode === 'all' ? tracks[0] : null;
    },
    // More than 3 seconds in restarts the current track, as every media player does.
    previous(tracks) {
      const i = tracks.findIndex((t) => t.id === s.trackId);
      if (i < 0) return tracks[0] ?? null;
      if (positionNow() > PREVIOUS_RESTARTS_AFTER_MS || i === 0) return tracks[i];
      return tracks[i - 1];
    },
    noteError() {
      s.errorStreak += 1;
      return s.errorStreak;
    },
    noteLoaded() {
      s.errorStreak = 0;
    },
  };
}

// The title of a YouTube video through its public oEmbed endpoint, done on the
// server because a browser would be blocked by CORS. A failure is not an error:
// the title is only a convenience.
export async function fetchYouTubeTitle(youtubeId, fetchImpl = fetch) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}&format=json`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === 'string' ? data.title.slice(0, 60) : null;
  } catch {
    return null;
  }
}
