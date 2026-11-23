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

  it('rolls the Dice Tray on the server, and posts pictures and GIFs that go when the chat is cleared', async () => {
    const g = await gm();
    await g.call('chat:clear');
    const aria = await pc(g, 'Aria');
    const a = await player(aria);
    expect((await a.call('dice:roll', { dice: [6, 20, 6], modifier: -2 })).ok).toBe(true);
    expect(await a.call('dice:roll', { dice: [7], modifier: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await a.call('dice:roll', { dice: [], modifier: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await a.call('dice:roll', { dice: [4], modifier: 1.5 })).toMatchObject({ ok: false, code: 'bad_value' });
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]);
    expect((await a.call('chat:picture', { data: gif, text: 'look' })).ok).toBe(true);
    const [dice, picture] = (await g.call('chat:get')).messages;
    expect(dice).toMatchObject({ type: 'dice', modifier: -2, author: { name: 'Aria' } });
    expect(dice.dice.map((d) => d.sides)).toEqual([6, 6, 20]);
    expect(dice.dice.every((d) => d.value >= 1 && d.value <= d.sides)).toBe(true);
    expect(dice.total).toBe(dice.dice.reduce((s, d) => s + d.value, 0) - 2);
    expect(picture).toMatchObject({ type: 'picture', text: 'look' });
    expect((await fetch(`${base}/api/images/${picture.imageId}`)).headers.get('content-type')).toContain('image/gif');
    // A GIF is only accepted in the chat.
    expect(await g.call('portrait:set', { characterId: aria, data: gif })).toMatchObject({ ok: false, code: 'bad_image' });
    await g.call('chat:clear');
    await new Promise((r) => setTimeout(r, 50));
    expect((await fetch(`${base}/api/images/${picture.imageId}`)).status).toBe(404);
  });

  it('counters: the GM makes them and their Gates; the player moves them, never sees a secret Gate, and a Gate reached is told', async () => {
    const g = await gm();
    await g.call('chat:clear');
    const aria = await pc(g, 'Aria');
    const a = await player(aria);
    expect(await a.call('counter:create', { characterId: aria, name: 'Doom', pips: 4 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('counter:create', { characterId: aria, name: 'Doom', pips: 1 })).toMatchObject({ ok: false, code: 'bad_value' });
    const { id } = await g.call('counter:create', { characterId: aria, name: 'Doom', pips: 4 });
    const gates = [
      { pip: 2, name: 'Omen', text: 'The sky darkens.' },
      { pip: 3, name: 'Trap', text: 'secret', secret: true },
      { pip: 9, name: 'Nowhere' },
    ];
    expect((await g.call('counter:update', { id, gates })).ok).toBe(true);
    expect((await g.call('counter:list', { characterId: aria })).counters[0].gates.map((x) => x.name)).toEqual(['Omen', 'Trap']);
    expect((await a.call('counter:list', { characterId: aria })).counters[0].gates.map((x) => x.name)).toEqual(['Omen']);

    const secret = new Promise((resolve) => g.once('counter:secret_gate', resolve));
    for (let i = 0; i < 3; i++) expect((await a.call('counter:step', { id, by: 1 })).ok).toBe(true);
    expect(await secret).toMatchObject({ gate: 'Trap', counter: 'Doom' });
    const lines = (await g.call('chat:get')).messages.map((m) => m.text);
    expect(lines).toEqual(['Aria reached Omen on Doom: The sky darkens.']);
    // Going down and up again tells it again; the value stays within 0 and the pips.
    await a.call('counter:step', { id, by: 1 });
    await a.call('counter:step', { id, by: 1 });
    expect((await a.call('counter:list', { characterId: aria })).counters[0].value).toBe(4);
    expect(await a.call('counter:step', { id, by: 2 })).toMatchObject({ ok: false, code: 'bad_value' });
    // Fewer pips cut the value and drop the Gates past the end.
    await g.call('counter:update', { id, pips: 2 });
    const [doom] = (await g.call('counter:list', { characterId: aria })).counters;
    expect(doom).toMatchObject({ pips: 2, value: 2 });
    expect(doom.gates.map((x) => x.name)).toEqual(['Omen']);
    expect((await g.call('counter:delete', { id })).ok).toBe(true);
    expect((await g.call('counter:list', { characterId: aria })).counters).toEqual([]);
  });

  it('the Events board: GM lanes for Everyone or the GM only; notes by anyone, edited by their author or the GM, moved by anyone', async () => {
    const g = await gm();
    for (const l of (await g.call('events:get')).lanes) await g.call('lane:delete', { id: l.id });
    const aria = await pc(g, 'Aria');
    const bran = await pc(g, 'Bran');
    const a = await player(aria);
    const b = await player(bran);
    expect(await a.call('lane:create', { name: 'Rumours', visibility: 'all' })).toMatchObject({ ok: false, code: 'forbidden' });
    const open = (await g.call('lane:create', { name: 'Rumours', visibility: 'all' })).id;
    const later = (await g.call('lane:create', { name: 'Later', visibility: 'all' })).id;
    const secret = (await g.call('lane:create', { name: 'Plots', visibility: 'gm' })).id;
    expect((await a.call('events:get')).lanes.map((l) => l.name)).toEqual(['Rumours', 'Later']);
    expect((await g.call('events:get')).lanes.map((l) => l.name)).toEqual(['Rumours', 'Later', 'Plots']);

    expect(await a.call('event_note:create', { laneId: secret, text: 'hi', color: 'pink' })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await a.call('event_note:create', { laneId: open, text: 'x'.repeat(281), color: 'pink' })).toMatchObject({ ok: false, code: 'bad_text' });
    expect(await a.call('event_note:create', { laneId: open, text: 'hi', color: 'orange' })).toMatchObject({ ok: false, code: 'bad_value' });
    const changed = new Promise((resolve) => b.once('events:changed', resolve));
    const n1 = (await a.call('event_note:create', { laneId: open, text: 'The mill burned', color: 'pink' })).id;
    await changed;
    const n2 = (await b.call('event_note:create', { laneId: open, text: 'A stranger came', color: 'blue' })).id;
    const n3 = (await g.call('event_note:create', { laneId: secret, text: 'He did it', color: 'violet' })).id;
    const [note] = (await b.call('events:get')).notes;
    expect(note).toMatchObject({ text: 'The mill burned', author: { role: 'player', name: 'Aria' } });

    // Only the author or the GM edits or deletes; anyone moves.
    expect(await b.call('event_note:update', { id: n1, text: 'no' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await a.call('event_note:update', { id: n1, text: 'The old mill burned', color: 'green' })).ok).toBe(true);
    expect((await g.call('event_note:update', { id: n2, text: 'Two strangers came' })).ok).toBe(true);
    expect((await b.call('event_note:move', { id: n1, laneId: open, index: 1 })).ok).toBe(true);
    expect((await g.call('events:get')).notes.filter((n) => n.laneId === open).map((n) => n.id)).toEqual([n2, n1]);
    expect((await b.call('event_note:move', { id: n1, laneId: later, index: 0 })).ok).toBe(true);
    expect(await b.call('event_note:move', { id: n1, laneId: secret, index: 0 })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await b.call('event_note:move', { id: n3, laneId: open, index: 0 })).toMatchObject({ ok: false, code: 'not_found' });
    expect((await a.call('events:get')).notes.map((n) => [n.laneId, n.text]).sort((x, y) => x[0] - y[0])).toEqual([
      [open, 'Two strangers came'],
      [later, 'The old mill burned'],
    ]);
    expect(await b.call('event_note:delete', { id: n1 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('event_note:delete', { id: n1 })).ok).toBe(true);
    // Lanes: moved, made GM only (players no longer see them), deleted with their notes.
    await g.call('lane:shift', { id: later, by: -1 });
    expect((await g.call('events:get')).lanes.map((l) => l.name)).toEqual(['Later', 'Rumours', 'Plots']);
    await g.call('lane:update', { id: open, visibility: 'gm' });
    expect((await a.call('events:get')).notes).toEqual([]);
    await g.call('lane:delete', { id: open });
    expect((await g.call('events:get')).notes.map((n) => n.text)).toEqual(['He did it']);
  });

  it('the Relationships board: the PC itself, cards and arrows, only for its player and the GM', async () => {
    const g = await gm();
    const aria = await pc(g, 'Aria');
    const bran = await pc(g, 'Bran');
    const npc = (await g.call('character:create', { name: 'Goblin', type: 'npc' })).id;
    const a = await player(aria);
    const b = await player(bran);
    const board = await a.call('rel:get', { pcId: aria });
    expect(board.cards).toMatchObject([{ self: true, name: 'Aria', kind: 'pc' }]);
    expect(await b.call('rel:get', { pcId: aria })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('rel:get', { pcId: npc })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await a.call('rel:card_add', { pcId: aria, characterId: npc })).toMatchObject({ ok: false, code: 'forbidden' });
    const brn = (await a.call('rel:card_add', { pcId: aria, characterId: bran, x: 100, y: 100 })).id;
    expect(await a.call('rel:card_add', { pcId: aria, characterId: bran })).toMatchObject({ ok: false, code: 'duplicate' });
    const mum = (await a.call('rel:card_add', { pcId: aria, name: 'Old Mum' })).id;
    const gob = (await g.call('rel:card_add', { pcId: aria, characterId: npc })).id;
    const self = board.cards[0].id;
    expect(await a.call('rel:arrow_add', { pcId: aria, from: self, to: self, label: 'x' })).toMatchObject({ ok: false, code: 'bad_value' });
    const loves = (await a.call('rel:arrow_add', { pcId: aria, from: self, to: mum, label: 'loves', color: 'green' })).id;
    await a.call('rel:arrow_add', { pcId: aria, from: gob, to: self, label: 'hunts', color: 'red' });
    expect(await b.call('rel:arrow_update', { id: loves, label: 'hates' })).toMatchObject({ ok: false, code: 'forbidden' });
    await a.call('rel:arrow_update', { id: loves, note: 'Since forever' });
    await a.call('rel:card_update', { id: brn, x: 9999, note: 'Owes me' });
    let now = await g.call('rel:get', { pcId: aria });
    expect(now.cards.map((c) => c.name)).toEqual(['Aria', 'Bran', 'Old Mum', 'Goblin']);
    expect(now.cards[1]).toMatchObject({ x: 1600, note: 'Owes me' });
    expect(now.arrows.map((x) => [x.label, x.color, x.note])).toEqual([
      ['loves', 'green', 'Since forever'],
      ['hunts', 'red', ''],
    ]);
    expect(await a.call('rel:card_delete', { id: self })).toMatchObject({ ok: false, code: 'bad_value' });
    await a.call('rel:card_delete', { id: gob });
    now = await a.call('rel:get', { pcId: aria });
    expect(now.arrows.map((x) => x.label)).toEqual(['loves']);
  });

  it('search: the GM finds everything, a player only their own character and its sheet', async () => {
    const g = await gm();
    const aria = await pc(g, 'Zorya');
    const bran = await pc(g, 'Zoltan');
    await g.call('sheet:list', { characterId: aria, list: 'items', action: 'add', name: 'Zircon ring' });
    await g.call('sheet:list', { characterId: bran, list: 'items', action: 'add', name: 'Zither' });
    await g.call('scene:create', { name: 'Zenith tower' });
    const a = await player(aria);
    const names = async (s, q) => (await s.call('search', { q })).results.map((r) => `${r.kind}:${r.name}`);
    expect(await names(g, 'z')).toEqual([]); // two letters at least
    const all = await names(g, 'zi');
    expect(all).toEqual(expect.arrayContaining(['item:Zircon ring', 'item:Zither']));
    expect(await names(g, 'zenith')).toEqual(['scene:Zenith tower']);
    expect(await names(a, 'zi')).toEqual(['item:Zircon ring']);
    expect(await names(a, 'zo')).toEqual(['character:Zorya']);
    expect(await names(a, 'zenith')).toEqual([]);
    const [ring] = (await a.call('search', { q: 'ring' })).results;
    expect(ring).toMatchObject({ kind: 'item', characterId: aria, owner: 'Zorya' });
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
