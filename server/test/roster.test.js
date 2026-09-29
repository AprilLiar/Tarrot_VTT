import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';

let db, server, base;
const sockets = [];

beforeAll(async () => {
  db = createDb({ url: 'file::memory:' });
  await initSchema(db);
  server = createServer({ db });
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
  await db.batch(['DELETE FROM characters', 'DELETE FROM character_folders'], 'write');
});

async function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  return s;
}

async function gm() {
  const s = await client();
  expect((await s.call('identity:set', { role: 'gm' })).ok).toBe(true);
  return s;
}

describe('identity', () => {
  it('lets a player pick a PC but not an NPC', async () => {
    const g = await gm();
    const pc = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;

    const p = await client();
    const ok = await p.call('identity:set', { role: 'player', characterId: pc });
    expect(ok).toMatchObject({ ok: true, identity: { role: 'player', characterId: pc } });

    const bad = await p.call('identity:set', { role: 'player', characterId: npc });
    expect(bad).toMatchObject({ ok: false, code: 'gone' });
  });

  it('serves only PCs to the picker', async () => {
    const g = await gm();
    await g.call('character:create', { name: 'Aria', type: 'pc' });
    await g.call('character:create', { name: 'Goblin', type: 'npc' });
    const list = await (await fetch(`${base}/api/pcs`)).json();
    expect(list.map((c) => c.name)).toEqual(['Aria']);
  });
});

describe('permissions', () => {
  it('rejects roster writes from players and from unidentified sockets', async () => {
    const g = await gm();
    const pc = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;

    const anon = await client();
    expect(await anon.call('character:create', { name: 'X', type: 'pc' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });

    const p = await client();
    await p.call('identity:set', { role: 'player', characterId: pc });
    expect(await p.call('character:delete', { id: pc, confirmName: 'Aria' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await p.call('roster:get')).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('drops GM rights when a socket switches to a player', async () => {
    const g = await gm();
    const pc = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    await g.call('identity:set', { role: 'player', characterId: pc });
    expect(await g.call('character:create', { name: 'X', type: 'pc' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
  });
});

describe('characters', () => {
  it('validates names', async () => {
    const g = await gm();
    expect(await g.call('character:create', { name: '   ', type: 'pc' })).toMatchObject({
      ok: false,
      code: 'bad_name',
    });
    expect(await g.call('character:create', { name: 'x'.repeat(61), type: 'pc' })).toMatchObject({
      ok: false,
      code: 'bad_name',
    });
    expect(await g.call('character:create', { name: 'Ok', type: 'wizard' })).toMatchObject({
      ok: false,
      code: 'bad_type',
    });
  });

  it('allows duplicate names as distinct characters', async () => {
    const g = await gm();
    const a = await g.call('character:create', { name: 'Twin', type: 'npc' });
    const b = await g.call('character:create', { name: 'Twin', type: 'npc' });
    expect(a.id).not.toBe(b.id);
  });

  it('renames and moves', async () => {
    const g = await gm();
    const folder = (await g.call('folder:create', { name: 'Act 1' })).id;
    const id = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    expect((await g.call('character:rename', { id, name: 'Aria II' })).ok).toBe(true);
    expect((await g.call('character:move', { id, folderId: folder })).ok).toBe(true);
    const { roster } = await g.call('roster:get');
    expect(roster.characters[0]).toMatchObject({ name: 'Aria II', folderId: folder });
  });

  it('requires the exact name to delete, then revokes the player', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const p = await client();
    await p.call('identity:set', { role: 'player', characterId: id });
    const revoked = new Promise((resolve) => p.on('identity:revoked', resolve));

    expect(await g.call('character:delete', { id, confirmName: 'aria' })).toMatchObject({
      ok: false,
      code: 'confirm_mismatch',
    });
    expect((await g.call('character:delete', { id, confirmName: 'Aria' })).ok).toBe(true);
    expect(await revoked).toMatchObject({ characterId: id, name: 'Aria' });
    expect(await p.call('identity:set', { role: 'player', characterId: id })).toMatchObject({
      ok: false,
      code: 'gone',
    });
  });
});

describe('folders', () => {
  it('nests, refuses cycles, and only deletes empty folders', async () => {
    const g = await gm();
    const a = (await g.call('folder:create', { name: 'A' })).id;
    const b = (await g.call('folder:create', { name: 'B', parentId: a })).id;
    const c = (await g.call('folder:create', { name: 'C', parentId: b })).id;

    expect(await g.call('folder:move', { id: a, parentId: c })).toMatchObject({ ok: false, code: 'cycle' });
    expect(await g.call('folder:move', { id: a, parentId: a })).toMatchObject({ ok: false, code: 'cycle' });
    expect(await g.call('folder:delete', { id: a })).toMatchObject({ ok: false, code: 'not_empty' });

    await g.call('character:create', { name: 'Aria', type: 'pc', folderId: c });
    expect(await g.call('folder:delete', { id: c })).toMatchObject({ ok: false, code: 'not_empty' });

    expect((await g.call('folder:move', { id: c, parentId: null })).ok).toBe(true);
  });
});

describe('live updates', () => {
  it('pushes the PC list to everyone and the full roster to the GM only', async () => {
    const g = await gm();
    const watcher = await client();
    const gotPcs = new Promise((resolve) => watcher.once('pcs:updated', resolve));
    const gotRosterGm = new Promise((resolve) => g.once('roster:updated', resolve));
    let watcherSawRoster = false;
    watcher.on('roster:updated', () => (watcherSawRoster = true));

    await g.call('character:create', { name: 'Aria', type: 'pc' });
    expect((await gotPcs).map((c) => c.name)).toEqual(['Aria']);
    expect((await gotRosterGm).characters).toHaveLength(1);
    expect(watcherSawRoster).toBe(false);
  });
});
