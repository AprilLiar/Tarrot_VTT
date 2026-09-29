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
  await s.call('identity:set', { role: 'gm' });
  return s;
}

async function player(characterId) {
  const s = await client();
  const r = await s.call('identity:set', { role: 'player', characterId });
  expect(r.ok).toBe(true);
  return s;
}

async function pc(g, name) {
  return (await g.call('character:create', { name, type: 'pc' })).id;
}

describe('sheet access', () => {
  it('gives a fresh character a full default sheet', async () => {
    const g = await gm();
    const id = await pc(g, 'Aria');
    const r = await g.call('sheet:get', { characterId: id });
    expect(r.sheet.ap).toEqual({ current: 4, minion: false });
    expect(r.sheet.stats.luck).toBe(0);
  });

  it('lets the owner and the GM edit a PC, and nobody else', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bob = await pc(g, 'Bob');
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;

    const a = await player(aria);
    expect((await a.call('sheet:set', { characterId: aria, path: 'stats.strength', value: 3 })).ok).toBe(true);
    expect(await a.call('sheet:set', { characterId: bob, path: 'stats.strength', value: 3 })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await a.call('sheet:get', { characterId: bob })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('sheet:get', { characterId: npc })).toMatchObject({ ok: false, code: 'forbidden' });

    expect((await g.call('sheet:set', { characterId: aria, path: 'stats.strength', value: 4 })).ok).toBe(true);
    expect((await g.call('sheet:set', { characterId: npc, path: 'ap.minion', value: true })).ok).toBe(true);
    expect(await g.call('sheet:set', { characterId: aria, path: 'ap.minion', value: true })).toMatchObject({
      ok: false,
      code: 'npc_only',
    });

    const anon = await client();
    expect(await anon.call('sheet:get', { characterId: aria })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('persists edits and pushes them live to the owner and GM only', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bob = await pc(g, 'Bob');
    const a = await player(aria);
    const b = await player(bob);
    const seenByGm = new Promise((resolve) => g.once('sheet:updated', resolve));
    let bobSaw = false;
    b.on('sheet:updated', () => (bobSaw = true));

    await a.call('sheet:set', { characterId: aria, path: 'hp.max', value: 20 });
    expect((await seenByGm).sheet.hp.max).toBe(20);
    expect(bobSaw).toBe(false);
    expect((await g.call('sheet:get', { characterId: aria })).sheet.hp.max).toBe(20);
  });

  it('keeps concurrent edits from clobbering each other', async () => {
    const g = await gm();
    const id = await pc(g, 'Aria');
    await Promise.all([
      g.call('sheet:set', { characterId: id, path: 'stats.strength', value: 2 }),
      g.call('sheet:set', { characterId: id, path: 'stats.dexterity', value: 3 }),
      g.call('sheet:list', { characterId: id, list: 'features', action: 'add', name: 'A' }),
      g.call('sheet:list', { characterId: id, list: 'features', action: 'add', name: 'B' }),
    ]);
    const { sheet } = await g.call('sheet:get', { characterId: id });
    expect(sheet.stats).toMatchObject({ strength: 2, dexterity: 3 });
    expect(sheet.features.map((f) => f.name).sort()).toEqual(['A', 'B']);
  });
});

describe('rolls and chat', () => {
  it('posts a roll to everyone and requires control of the character', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bob = await pc(g, 'Bob');
    const a = await player(aria);
    const b = await player(bob);
    await a.call('sheet:set', { characterId: aria, path: 'stats.dexterity', value: 3 });

    const bobSees = new Promise((resolve) => b.once('chat:message', resolve));
    const r = await a.call('roll:make', { characterId: aria, kind: 'attribute', key: 'dexterity' });
    expect(r.ok).toBe(true);
    const msg = await bobSees;
    expect(msg).toMatchObject({ type: 'roll', characterName: 'Aria', author: { role: 'player', name: 'Aria' } });
    expect(msg.roll.expression).toMatch(/^1d20 \+ 3\(Dexterity\)$/);
    expect(msg.roll.total).toBe(msg.roll.natural + 3);

    expect(await a.call('roll:make', { characterId: bob, kind: 'attribute', key: 'dexterity' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
  });

  it('lets the GM roll for an NPC, posted as the GM', async () => {
    const g = await gm();
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;
    const r = await g.call('roll:make', { characterId: npc, kind: 'skill', key: 'speed' });
    expect(r.message).toMatchObject({ author: { role: 'gm', name: 'GM' }, characterName: 'Goblin' });
  });

  it('shares text chat, sends history, and only the GM can clear it', async () => {
    const g = await gm();
    await g.call('chat:clear'); // the log is per server instance, shared by earlier tests
    const aria = await pc(g, 'Aria');
    const a = await player(aria);
    expect((await a.call('chat:send', { text: '  hello  ' })).ok).toBe(true);
    expect(await a.call('chat:send', { text: '   ' })).toMatchObject({ ok: false, code: 'bad_text' });

    const late = await g.call('chat:get');
    expect(late.messages.map((m) => m.text)).toEqual(['hello']);
    expect(late.messages[0].author).toEqual({ role: 'player', name: 'Aria' });

    expect(await a.call('chat:clear')).toMatchObject({ ok: false, code: 'forbidden' });
    const cleared = new Promise((resolve) => a.once('chat:cleared', resolve));
    expect((await g.call('chat:clear')).ok).toBe(true);
    await cleared;
    expect((await g.call('chat:get')).messages).toEqual([]);
  });

  it('refuses chat from a socket with no identity', async () => {
    const anon = await client();
    expect(await anon.call('chat:send', { text: 'hi' })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('item transfers', () => {
  async function withItem(g, characterId, name = 'Gem') {
    const { sheet } = await g.call('sheet:list', { characterId, list: 'items', action: 'add', name });
    return sheet.items.at(-1).id;
  }

  it('moves an item only after the receiving player accepts', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bob = await pc(g, 'Bob');
    const a = await player(aria);
    const b = await player(bob);
    const itemId = await withItem(g, aria);

    const offered = new Promise((resolve) => b.once('trade:offered', resolve));
    const o = await a.call('trade:offer', { fromId: aria, toId: bob, itemId });
    expect(o.ok).toBe(true);
    const seen = await offered;
    expect(seen).toMatchObject({ fromName: 'Aria', itemName: 'Gem', offerId: o.offerId });

    // Nothing moves until acceptance, and only the receiver can answer.
    expect((await g.call('sheet:get', { characterId: aria })).sheet.items).toHaveLength(1);
    expect(await a.call('trade:respond', { offerId: o.offerId, accept: true })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });

    expect((await b.call('trade:respond', { offerId: o.offerId, accept: true })).accepted).toBe(true);
    expect((await g.call('sheet:get', { characterId: aria })).sheet.items).toHaveLength(0);
    const bobItems = (await g.call('sheet:get', { characterId: bob })).sheet.items;
    expect(bobItems.map((i) => i.name)).toEqual(['Gem']);
    expect(bobItems[0].id).not.toBe(itemId);
  });

  it('does nothing when the offer is declined', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bob = await pc(g, 'Bob');
    const a = await player(aria);
    const b = await player(bob);
    const itemId = await withItem(g, aria);
    const o = await a.call('trade:offer', { fromId: aria, toId: bob, itemId });
    expect((await b.call('trade:respond', { offerId: o.offerId, accept: false })).accepted).toBe(false);
    expect((await g.call('sheet:get', { characterId: aria })).sheet.items).toHaveLength(1);
    expect((await g.call('sheet:get', { characterId: bob })).sheet.items).toHaveLength(0);
    expect(await b.call('trade:respond', { offerId: o.offerId, accept: true })).toMatchObject({ ok: false });
  });

  it('refuses offers to NPCs, to yourself, or of items you do not have', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;
    const a = await player(aria);
    const itemId = await withItem(g, aria);
    expect((await a.call('trade:offer', { fromId: aria, toId: npc, itemId })).ok).toBe(false);
    expect((await a.call('trade:offer', { fromId: aria, toId: aria, itemId })).ok).toBe(false);
    const bob = await pc(g, 'Bob');
    expect((await a.call('trade:offer', { fromId: aria, toId: bob, itemId: 'nope' })).ok).toBe(false);
  });

  it('lets the GM transfer straight between PCs and NPCs', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;
    const itemId = await withItem(g, npc, 'Dagger');
    expect((await g.call('item:transfer', { fromId: npc, toId: aria, itemId })).ok).toBe(true);
    expect((await g.call('sheet:get', { characterId: aria })).sheet.items[0].name).toBe('Dagger');

    const a = await player(aria);
    expect(await a.call('item:transfer', { fromId: aria, toId: npc, itemId })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
  });
});
