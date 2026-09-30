import * as audio from './audio.js';
import { AppError } from './errors.js';

// Socket events for the shared soundtrack. Only the GM sets it up and controls
// it. Only GMs and Display Screens can listen: the client asks to join the
// 'audio' room, and the server checks the identity. Phones never listen.

export const AUDIO_ROOM = 'audio';

export function registerAudioHandlers(ctx) {
  const { io, socket, db, on, isGm, isDisplay, rooms, shared } = ctx;
  const player = shared.audio;
  const fetchTitle = shared.fetchTitle ?? audio.fetchYouTubeTitle;

  const broadcastState = () => io.to(AUDIO_ROOM).emit('audio:state', player.snapshot());
  const broadcastLibrary = async () => io.to(rooms.GM_ROOM).emit('music:updated', { playlists: await audio.listLibrary(db) });

  async function tracksOf(playlistId) {
    return playlistId == null ? [] : audio.listTracks(db, playlistId);
  }

  async function startTrack(track) {
    player.play(track);
    broadcastState();
  }

  // Moves on after a track ends or fails; stops when there is nothing next.
  async function advance() {
    const tracks = await tracksOf(player.state.playlistId);
    const next = player.next(tracks);
    if (next) await startTrack(next);
    else {
      player.stop();
      broadcastState();
    }
  }

  // --- listening -------------------------------------------------------------

  // Clock alignment: the only audio event with no permission check (no data, no state).
  socket.on('audio:ping', (payload, ack) => {
    if (typeof ack === 'function') ack({ ok: true, t0: payload?.t0 ?? null, serverMs: Date.now() });
  });

  on('audio:listen', { needsIdentity: true }, ({ on: listen }) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM and the Display play music.');
    if (listen === false) socket.leave(AUDIO_ROOM);
    else socket.join(AUDIO_ROOM);
    return { state: player.snapshot() };
  });

  // --- reports from listeners ---------------------------------------------------

  // Every listener reports the end of a track; the anchor id lets the first
  // report advance and turns the duplicates into no-ops.
  on('audio:track_ended', { needsIdentity: true }, async ({ trackId, anchorId }) => {
    if (!socket.rooms.has(AUDIO_ROOM)) return;
    if (trackId !== player.state.trackId || anchorId !== player.state.anchorId || !player.state.isPlaying) return;
    await advance();
  });

  on('audio:duration', { needsIdentity: true }, async ({ trackId, durationMs }) => {
    if (!socket.rooms.has(AUDIO_ROOM)) return;
    const saved = await audio.reportDuration(db, trackId, durationMs);
    if (saved != null && trackId === player.state.trackId) {
      player.state.durationMs = saved;
      player.noteLoaded();
      broadcastState();
    }
  });

  // A video YouTube refuses to embed skips itself on the first report.
  on('audio:error', { needsIdentity: true }, async ({ trackId, anchorId, code }) => {
    if (!socket.rooms.has(AUDIO_ROOM)) return;
    if (!audio.UNPLAYABLE_CODES.includes(code)) return;
    if (trackId !== player.state.trackId || anchorId !== player.state.anchorId) return;
    io.to(rooms.GM_ROOM).emit('audio:track_unplayable', { trackId, name: player.state.name, code });
    const tracks = await tracksOf(player.state.playlistId);
    // If every track in the playlist fails in a row, stop instead of looping.
    if (player.noteError() > tracks.length) {
      player.stop();
      broadcastState();
      return;
    }
    await advance();
  });

  // --- GM controls -----------------------------------------------------------------

  on('audio:play', { gmOnly: true }, async ({ trackId }) => {
    await startTrack(await audio.getTrack(db, trackId));
  });
  on('audio:pause', { gmOnly: true }, () => {
    if (player.pause()) broadcastState();
  });
  on('audio:resume', { gmOnly: true }, () => {
    if (player.resume()) broadcastState();
  });
  on('audio:stop', { gmOnly: true }, () => {
    player.stop();
    broadcastState();
  });
  on('audio:seek', { gmOnly: true }, ({ positionMs }) => {
    if (!Number.isFinite(positionMs)) throw new AppError('bad_value', 'Invalid position.');
    if (player.seek(positionMs)) broadcastState();
  });
  on('audio:next', { gmOnly: true }, async () => {
    if (player.current == null) return;
    const tracks = await tracksOf(player.state.playlistId);
    // A manual skip never repeats the same track, unlike the end of a track under "repeat one".
    const mode = player.state.repeatMode;
    if (mode === 'one') player.setMode({ repeatMode: 'all' });
    const next = player.next(tracks);
    if (mode === 'one') player.setMode({ repeatMode: 'one' });
    if (next) await startTrack(next);
    else {
      player.stop();
      broadcastState();
    }
  });
  on('audio:previous', { gmOnly: true }, async () => {
    if (player.current == null) return;
    const track = player.previous(await tracksOf(player.state.playlistId));
    if (track) await startTrack(track);
  });
  on('audio:set_mode', { gmOnly: true }, (p) => {
    player.setMode({ repeatMode: p.repeatMode, shuffle: p.shuffle });
    broadcastState();
  });

  // --- library (GM) -------------------------------------------------------------------

  const gmLibrary = (event, fn) =>
    on(event, { gmOnly: true }, async (p) => {
      const result = await fn(p);
      await broadcastLibrary();
      return result;
    });

  on('music:get', { gmOnly: true }, async () => ({ playlists: await audio.listLibrary(db) }));

  gmLibrary('playlist:create', async (p) => ({ id: await audio.createPlaylist(db, p.name) }));
  gmLibrary('playlist:rename', (p) => audio.renamePlaylist(db, p.id, p.name));
  gmLibrary('playlist:delete', async (p) => {
    // Deleting the playlist that is playing stops the music.
    if (player.state.playlistId === p.id) {
      player.stop();
      broadcastState();
    }
    await audio.deletePlaylist(db, p.id);
  });
  gmLibrary('track:create', async (p) => ({ id: await audio.createTrack(db, p) }));
  gmLibrary('track:rename', async (p) => {
    await audio.renameTrack(db, p.id, p.name);
    if (player.state.trackId === p.id) {
      player.state.name = p.name.trim();
      broadcastState();
    }
  });
  gmLibrary('track:delete', async (p) => {
    const t = await audio.deleteTrack(db, p.id);
    if (player.state.trackId === t.id) {
      player.stop();
      broadcastState();
    }
  });
  gmLibrary('track:reorder', (p) => audio.reorderTracks(db, p.playlistId, p.ids));

  // The title is a suggestion for an untouched name field, never a requirement.
  on('audio:lookup_title', { gmOnly: true }, async ({ url }) => {
    const id = audio.parseYouTubeId(url);
    if (!id) throw new AppError('not_youtube', 'That is not a YouTube video link.');
    return { youtubeId: id, title: await fetchTitle(id) };
  });
}
