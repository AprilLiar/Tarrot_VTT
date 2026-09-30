import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { createPlayer, parseYouTubeId, fetchYouTubeTitle } from '../audio.js';

describe('parseYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it('reads every common link shape and a bare id', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s&list=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=xyz`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `youtube.com/watch?v=${id}`,
      id,
      `  ${id}  `,
    ]) {
      expect(parseYouTubeId(url), url).toBe(id);
    }
  });

  it('rejects everything else', () => {
    for (const bad of ['', 'hello', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=short', null, 42]) {
      expect(parseYouTubeId(bad), String(bad)).toBeNull();
    }
  });
});

describe('the player state', () => {
  const tracks = [1, 2, 3].map((n) => ({ id: n, youtubeId: `id${n}`.padEnd(11, 'x'), name: `T${n}`, playlistId: 1, durationMs: null }));
  const make = (opts) => {
    const clock = { t: 1000 };
    const p = createPlayer({ now: () => clock.t, ...opts });
    return { p, clock };
  };

  it('stores an anchor and works out the position from it', () => {
    const { p, clock } = make();
    p.play(tracks[0]);
    clock.t += 4000;
    expect(p.positionNow()).toBe(4000);
    p.pause();
    clock.t += 9000;
    expect(p.positionNow()).toBe(4000); // paused where the music actually was
    p.resume();
    clock.t += 1000;
    expect(p.positionNow()).toBe(5000);
  });

  it('bumps the anchor on every playback change but not on repeat or shuffle', () => {
    const { p } = make();
    p.play(tracks[0]);
    const a = p.state.anchorId;
    p.seek(30000);
    expect(p.state.anchorId).toBe(a + 1);
    expect(p.state.positionMs).toBe(30000);
    p.setMode({ repeatMode: 'all', shuffle: true });
    expect(p.state.anchorId).toBe(a + 1);
    expect(() => p.setMode({ repeatMode: 'sometimes' })).toThrow();
    expect(() => p.setMode({ shuffle: 'yes' })).toThrow();
  });

  it('moves to the next track and stops at the end unless repeating', () => {
    const { p } = make();
    p.play(tracks[1]);
    expect(p.next(tracks).id).toBe(3);
    p.play(tracks[2]);
    expect(p.next(tracks)).toBeNull();
    p.setMode({ repeatMode: 'all' });
    expect(p.next(tracks).id).toBe(1);
    p.setMode({ repeatMode: 'one' });
    expect(p.next(tracks).id).toBe(3);
  });

  it('shuffle picks a different track', () => {
    const { p } = make({ random: () => 0 });
    p.play(tracks[0]);
    p.setMode({ shuffle: true });
    expect(p.next(tracks).id).toBe(2);
    p.play(tracks[0]);
    expect(p.next([tracks[0]])).toBeNull();
    p.setMode({ repeatMode: 'all' });
    expect(p.next([tracks[0]]).id).toBe(1);
  });

  it('previous restarts the track after 3 seconds, otherwise goes back', () => {
    const { p, clock } = make();
    p.play(tracks[1]);
    clock.t += 2000;
    expect(p.previous(tracks).id).toBe(1);
    clock.t += 2000;
    expect(p.previous(tracks).id).toBe(2);
    p.play(tracks[0]);
    expect(p.previous(tracks).id).toBe(1);
  });

  it('clamps a seek to the known duration', () => {
    const { p } = make();
    p.play({ ...tracks[0], durationMs: 60000 });
    p.seek(999999);
    expect(p.state.positionMs).toBe(60000);
    p.seek(-5);
    expect(p.state.positionMs).toBe(0);
  });
});

describe('the title lookup', () => {
  it('returns the title, or null on any failure', async () => {
    const ok = async () => ({ ok: true, json: async () => ({ title: 'Battle Theme' }) });
    expect(await fetchYouTubeTitle('dQw4w9WgXcQ', ok)).toBe('Battle Theme');
    expect(await fetchYouTubeTitle('dQw4w9WgXcQ', async () => ({ ok: false }))).toBeNull();
    expect(await fetchYouTubeTitle('dQw4w9WgXcQ', async () => { throw new Error('offline'); })).toBeNull();
  });
});

// ---- over sockets -------------------------------------------------------------------

let db, server, base;
const sockets = [];
const ID1 = 'aaaaaaaaaaa';
const ID2 = 'bbbbbbbbbbb';
const ID3 = 'ccccccccccc';

beforeAll(async () => {
  db = createDb({ url: 'file::memory:' });
  await initSchema(db);
  server = createServer({ db, fetchTitle: async (id) => `Title of ${id}` });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  db.close();
});

beforeEach(async () => {
  await db.batch(['DELETE FROM audio_tracks', 'DELETE FROM audio_playlists', 'DELETE FROM characters', 'DELETE FROM character_folders'], 'write');
  // The player is per server instance, so start every test from a quiet one.
  const g = await gm();
  await g.call('audio:stop', {});
  await g.call('audio:set_mode', { repeatMode: 'off', shuffle: false });
  g.close();
});

async function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  return s;
}
const gm = async () => {
  const s = await client();
  await s.call('identity:set', { role: 'gm' });
  return s;
};
const display = async () => {
  const s = await client();
  await s.call('identity:set', { role: 'display' });
  return s;
};

// Resolves with the next audio:state that satisfies `pred`.
const stateWhere = (sock, pred) =>
  new Promise((resolve) => {
    const on = (st) => {
      if (pred(st)) {
        sock.off('audio:state', on);
        resolve(st);
      }
    };
    sock.on('audio:state', on);
  });

async function library(g) {
  const pl = (await g.call('playlist:create', { name: 'Battle' })).id;
  const ids = [];
  for (const y of [ID1, ID2, ID3]) ids.push((await g.call('track:create', { playlistId: pl, url: `https://youtu.be/${y}`, name: `Song ${y[0]}` })).id);
  return { pl, ids };
}

describe('library', () => {
  it('is GM only and validates links', async () => {
    const g = await gm();
    const d = await display();
    expect(await d.call('playlist:create', { name: 'x' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('music:get')).toMatchObject({ ok: false, code: 'forbidden' });
    const pl = (await g.call('playlist:create', { name: 'Calm' })).id;
    expect(await g.call('track:create', { playlistId: pl, url: 'https://example.com/x' })).toMatchObject({ ok: false, code: 'not_youtube' });
    expect((await g.call('track:create', { playlistId: pl, url: `https://youtu.be/${ID1}` })).ok).toBe(true);
    const got = (await g.call('music:get')).playlists;
    expect(got[0].tracks[0]).toMatchObject({ youtubeId: ID1, name: `YouTube ${ID1}` });
  });

  it('looks up a title for a link', async () => {
    const g = await gm();
    expect(await g.call('audio:lookup_title', { url: `https://youtu.be/${ID1}` })).toMatchObject({ ok: true, title: `Title of ${ID1}` });
    expect(await g.call('audio:lookup_title', { url: 'nope' })).toMatchObject({ ok: false, code: 'not_youtube' });
  });

  it('reorders tracks only with a complete list', async () => {
    const g = await gm();
    const { pl, ids } = await library(g);
    expect(await g.call('track:reorder', { playlistId: pl, ids: [ids[0]] })).toMatchObject({ ok: false, code: 'bad_id' });
    expect(await g.call('track:reorder', { playlistId: pl, ids: [ids[0], ids[0], ids[1]] })).toMatchObject({ ok: false });
    expect((await g.call('track:reorder', { playlistId: pl, ids: [...ids].reverse() })).ok).toBe(true);
    expect((await g.call('music:get')).playlists[0].tracks.map((t) => t.id)).toEqual([...ids].reverse());
  });

  it('pushes library changes to the GM only', async () => {
    const g = await gm();
    const d = await display();
    let displaySaw = false;
    d.on('music:updated', () => (displaySaw = true));
    const seen = new Promise((resolve) => g.once('music:updated', resolve));
    await g.call('playlist:create', { name: 'Tavern' });
    expect((await seen).playlists[0].name).toBe('Tavern');
    await new Promise((r) => setTimeout(r, 50));
    expect(displaySaw).toBe(false);
  });
});

describe('who can listen and control', () => {
  it('lets the GM and the Display listen, not a player or an anonymous socket', async () => {
    const g = await gm();
    const pcId = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const p = await client();
    await p.call('identity:set', { role: 'player', characterId: pcId });
    expect(await p.call('audio:listen', { on: true })).toMatchObject({ ok: false, code: 'forbidden' });
    const anon = await client();
    expect(await anon.call('audio:listen', { on: true })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('audio:listen', { on: true })).ok).toBe(true);
    expect((await (await display()).call('audio:listen', { on: true })).ok).toBe(true);
  });

  it('lets only the GM control playback', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    for (const event of ['audio:pause', 'audio:resume', 'audio:stop', 'audio:next', 'audio:previous']) {
      expect(await d.call(event, {}), event).toMatchObject({ ok: false, code: 'forbidden' });
    }
    expect(await d.call('audio:play', { trackId: ids[0] })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('audio:seek', { positionMs: 5 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('audio:set_mode', { shuffle: true })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('answers a clock ping for anyone', async () => {
    const s = await client();
    const r = await s.call('audio:ping', { t0: 123 });
    expect(r.t0).toBe(123);
    expect(Math.abs(r.serverMs - Date.now())).toBeLessThan(2000);
  });
});

describe('playback', () => {
  it('broadcasts state to listeners only, and tells a late joiner where the music is', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    const bystander = await client();
    let heard = false;
    bystander.on('audio:state', () => (heard = true));

    const playing = stateWhere(d, (s) => s.isPlaying && s.trackId === ids[0]);
    expect((await g.call('audio:play', { trackId: ids[0] })).ok).toBe(true);
    expect(await playing).toMatchObject({ youtubeId: ID1, name: `Song ${ID1[0]}`, positionMs: 0 });

    await new Promise((r) => setTimeout(r, 30));
    const late = await display();
    const joined = (await late.call('audio:listen', { on: true })).state;
    expect(joined).toMatchObject({ trackId: ids[0], isPlaying: true });
    expect(joined.serverMs).toBeGreaterThanOrEqual(joined.anchoredAtMs);
    expect(heard).toBe(false);
  });

  it('pauses, resumes, seeks and stops', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:play', { trackId: ids[0] });
    const paused = stateWhere(d, (s) => !s.isPlaying && s.trackId === ids[0]);
    await g.call('audio:pause', {});
    const p = await paused;
    expect(p.positionMs).toBeGreaterThanOrEqual(0);
    const sought = stateWhere(d, (s) => s.positionMs === 42000);
    await g.call('audio:seek', { positionMs: 42000 });
    await sought;
    const resumed = stateWhere(d, (s) => s.isPlaying && s.positionMs === 42000);
    await g.call('audio:resume', {});
    await resumed;
    const stopped = stateWhere(d, (s) => s.trackId === null);
    await g.call('audio:stop', {});
    expect(await stopped).toMatchObject({ isPlaying: false, name: '' });
    expect(await g.call('audio:seek', { positionMs: 'soon' })).toMatchObject({ ok: false, code: 'bad_value' });
  });

  it('a track that ends advances once, however many listeners report it', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:listen', { on: true });
    const first = stateWhere(d, (s) => s.trackId === ids[0] && s.isPlaying);
    await g.call('audio:play', { trackId: ids[0] });
    const { anchorId } = await first;

    const second = stateWhere(d, (s) => s.trackId === ids[1]);
    await Promise.all([
      d.call('audio:track_ended', { trackId: ids[0], anchorId }),
      g.call('audio:track_ended', { trackId: ids[0], anchorId }),
    ]);
    const s2 = await second;
    // The duplicate report used the old anchor and must not skip a second track.
    await new Promise((r) => setTimeout(r, 80));
    const now = (await d.call('audio:listen', { on: true })).state;
    expect(now.trackId).toBe(ids[1]);
    expect(s2.anchorId).toBeGreaterThan(anchorId);
  });

  it('ignores an end report from a socket that is not listening or has an old anchor', async () => {
    const g = await gm();
    const { ids } = await library(g);
    await g.call('audio:play', { trackId: ids[0] });
    await g.call('audio:track_ended', { trackId: ids[0], anchorId: 1 });
    const d = await display(); // never called audio:listen
    await d.call('audio:track_ended', { trackId: ids[0], anchorId: 1 });
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBe(ids[0]);
  });

  it('stops at the end of the playlist, wraps with repeat all, replays with repeat one', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });

    async function end(trackId) {
      const cur = (await d.call('audio:listen', { on: true })).state;
      await d.call('audio:track_ended', { trackId, anchorId: cur.anchorId });
      await new Promise((r) => setTimeout(r, 40));
      return (await d.call('audio:listen', { on: true })).state;
    }

    await g.call('audio:play', { trackId: ids[2] });
    expect((await end(ids[2])).trackId).toBeNull();
    await g.call('audio:set_mode', { repeatMode: 'all' });
    await g.call('audio:play', { trackId: ids[2] });
    expect((await end(ids[2])).trackId).toBe(ids[0]);
    await g.call('audio:set_mode', { repeatMode: 'one' });
    expect((await end(ids[0])).trackId).toBe(ids[0]);
  });

  it('a manual Next always leaves the current track, even under repeat one', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:set_mode', { repeatMode: 'one' });
    await g.call('audio:play', { trackId: ids[0] });
    await g.call('audio:next', {});
    const s = (await d.call('audio:listen', { on: true })).state;
    expect(s.trackId).toBe(ids[1]);
    expect(s.repeatMode).toBe('one');
  });

  it('skips a video that cannot be embedded on the first report and warns the GM', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:play', { trackId: ids[0] });
    const cur = (await d.call('audio:listen', { on: true })).state;
    const warned = new Promise((resolve) => g.once('audio:track_unplayable', resolve));
    await d.call('audio:error', { trackId: ids[0], anchorId: cur.anchorId, code: 150 });
    expect(await warned).toMatchObject({ trackId: ids[0], code: 150 });
    await new Promise((r) => setTimeout(r, 40));
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBe(ids[1]);
    // A transient error (code 5) is not a reason to skip.
    const cur2 = (await d.call('audio:listen', { on: true })).state;
    await d.call('audio:error', { trackId: ids[1], anchorId: cur2.anchorId, code: 5 });
    await new Promise((r) => setTimeout(r, 40));
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBe(ids[1]);
  });

  it('stops instead of looping when every track fails', async () => {
    const g = await gm();
    const d = await display();
    const { ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:set_mode', { repeatMode: 'all' });
    await g.call('audio:play', { trackId: ids[0] });
    for (let i = 0; i < 6; i++) {
      const cur = (await d.call('audio:listen', { on: true })).state;
      if (cur.trackId == null) break;
      await d.call('audio:error', { trackId: cur.trackId, anchorId: cur.anchorId, code: 101 });
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBeNull();
  });

  it('keeps the largest reported duration and ignores adverts', async () => {
    const g = await gm();
    const d = await display();
    const { pl, ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:play', { trackId: ids[0] });
    await d.call('audio:duration', { trackId: ids[0], durationMs: 3000 });
    await d.call('audio:duration', { trackId: ids[0], durationMs: 180000 });
    await d.call('audio:duration', { trackId: ids[0], durationMs: 15000 });
    await new Promise((r) => setTimeout(r, 40));
    const tracks = (await g.call('music:get')).playlists.find((p) => p.id === pl).tracks;
    expect(tracks.find((t) => t.id === ids[0]).durationMs).toBe(180000);
  });

  it('stops the music when the playing track or playlist is deleted', async () => {
    const g = await gm();
    const d = await display();
    const { pl, ids } = await library(g);
    await d.call('audio:listen', { on: true });
    await g.call('audio:play', { trackId: ids[1] });
    await g.call('track:delete', { id: ids[1] });
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBeNull();
    await g.call('audio:play', { trackId: ids[0] });
    await g.call('playlist:delete', { id: pl });
    expect((await d.call('audio:listen', { on: true })).state.trackId).toBeNull();
  });
});
