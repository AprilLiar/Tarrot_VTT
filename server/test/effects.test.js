import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';

let db, server, base;
const sockets = [];
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), Buffer.alloc(4)]);

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
  await db.batch(
    ['DELETE FROM battle_tokens', 'DELETE FROM battle_marks', 'DELETE FROM stage_summons', 'DELETE FROM pictures', 'DELETE FROM scenes', 'DELETE FROM temp_npcs', 'DELETE FROM images', 'DELETE FROM characters', "UPDATE scene_state SET active_scene_id = NULL, mode = 'scene'"],
    'write',
  );
  server.shared.targets.clear();
  server.shared.attacks.clear();
  server.shared.combat = null;
  server.shared.chat.clear();
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
const player = async (characterId) => {
  const s = await client();
  await s.call('identity:set', { role: 'player', characterId });
  return s;
};
const sheetOf = async (s, id) => (await s.call('sheet:get', { characterId: id })).sheet;
const texts = () => server.shared.chat.history().filter((m) => m.type === 'text' || m.type === 'effects').map((m) => m.text);
const seenPending = (g) => new Promise((resolve) => g.once('attack:pending', resolve));

async function fight() {
  const g = await gm();
  const a = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
  const p = await player(a);
  const scene = (await g.call('scene:create', { name: 'Arena', data: png() })).id;
  await g.call('scene:set_battle_image', { id: scene, data: png(), aspect: 2 });
  await g.call('scene:set_grid', { id: scene, cell: 0.1, ox: 0, oy: 0 });
  await g.call('scene:activate', { id: scene });
  await g.call('battle:mode', { mode: 'battle' });
  await g.call('picture:add', { characterId: a, data: png() });
  const aToken = (await g.call('battle:add', { characterId: a })).id;
  const foe = (await g.call('character:create', { name: 'Ogre', type: 'npc' })).id;
  await g.call('picture:add', { characterId: foe, data: png() });
  const foeToken = (await g.call('battle:add', { characterId: foe })).id;
  const ally = (await g.call('character:create', { name: 'Bram', type: 'pc' })).id;
  await g.call('picture:add', { characterId: ally, data: png() });
  const allyToken = (await g.call('battle:add', { characterId: ally })).id;
  for (const id of [foe, ally]) {
    await g.call('sheet:set', { characterId: id, path: 'hp.max', value: 20 });
    await g.call('sheet:set', { characterId: id, path: 'hp.current', value: 20 });
  }
  await g.call('sheet:set', { characterId: foe, path: 'defence.physical', value: 5 });
  return { g, p, a, aToken, foe, foeToken, ally, allyToken };
}
const act = (g, ctx, extra = {}) => g.call('spontaneous:do', { characterId: ctx.a, ap: 1, roll: 'magic', defence: 'physical', effects: { help: { sides: 6 } }, ...extra });

const cards = () => server.shared.chat.history().filter((m) => m.type === 'effects');
const lastCard = () => cards().at(-1);
// Applies a Spontaneous Action with damage on the Ogre (a natural 10, total 20: a Heavy Hit).
async function applyOnFoe(ctx, apply = {}) {
  await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.foeToken });
  const seen = seenPending(ctx.g);
  await act(ctx.g, ctx, { ap: 2, roll: 'stances', effects: { damage: { amount: 5, kind: 'fire' }, status: { key: 'burning', stacks: 2 }, temp: { value: 4 } } });
  const pending = await seen;
  server.shared.attacks.get(pending.id).roll.natural = 10;
  const r = await ctx.g.call('attack:apply', { id: pending.id, total: 20, base: 5, kind: 'fire', ap: 2, statuses: [{ key: 'burning', stacks: 2 }], ...apply });
  expect(r.ok).toBe(true);
  return pending;
}

describe('Revert and Edit on effect cards', () => {
  it('an applied attack is one card with a block per character, and the GM can revert it', async () => {
    const ctx = await fight();
    await applyOnFoe(ctx);
    expect(cards()).toHaveLength(1);
    const card = lastCard();
    expect(card).toMatchObject({ kind: 'attack', status: 'applied', reversible: true, editable: true });
    expect(card.blocks.map((b) => b.name)).toEqual(['Ogre', 'Mira']);
    // Colour categories travel with the parameters.
    expect(JSON.stringify(card.blocks)).toContain('"c":"status"');
    const foe = await sheetOf(ctx.g, ctx.foe);
    expect(foe.hp.current).toBe(13);
    expect(foe.statuses.burning).toBe(2);
    expect(foe.hp.temp).toBe(4);
    expect((await sheetOf(ctx.g, ctx.a)).ap.current).toBe(2);

    expect(await ctx.p.call('effects:revert', { messageId: card.id })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await ctx.g.call('effects:revert', { messageId: card.id })).ok).toBe(true);
    const after = await sheetOf(ctx.g, ctx.foe);
    expect(after.hp.current).toBe(20);
    expect(after.statuses.burning).toBeUndefined();
    expect(after.hp.temp).toBe(0);
    expect((await sheetOf(ctx.g, ctx.a)).ap.current).toBe(4);
    expect(lastCard().status).toBe('reverted');
    expect(await ctx.g.call('effects:revert', { messageId: card.id })).toMatchObject({ ok: false, code: 'already_reverted' });
  });

  it('a revert takes away only what the card did, so later changes stay', async () => {
    const ctx = await fight();
    await applyOnFoe(ctx);
    await ctx.g.call('sheet:set', { characterId: ctx.foe, path: 'hp.current', value: 10 }); // 3 more damage by hand
    await ctx.g.call('effects:revert', { messageId: lastCard().id });
    expect((await sheetOf(ctx.g, ctx.foe)).hp.current).toBe(17); // 10 plus the 7 the card dealt
  });

  it('Edit reverts, reopens the confirm card with what was applied, and the new result replaces the old card', async () => {
    const ctx = await fight();
    await applyOnFoe(ctx);
    const first = lastCard();
    const seen = seenPending(ctx.g);
    const r = await ctx.g.call('effects:edit', { messageId: first.id });
    expect(r.ok).toBe(true);
    const pending = await seen;
    expect(pending).toMatchObject({ base: 5, kind: 'fire', ap: 2, total: 20, statuses: [{ key: 'burning', stacks: 2 }] });
    expect((await sheetOf(ctx.g, ctx.foe)).hp.current).toBe(20);
    expect(cards()[0].status).toBe('replaced');
    // The GM changes the damage and drops the status.
    expect((await ctx.g.call('attack:apply', { id: pending.id, total: 20, base: 9, kind: 'fire', ap: 2, statuses: [] })).ok).toBe(true);
    const foe = await sheetOf(ctx.g, ctx.foe);
    expect(foe.hp.current).toBe(9); // 9 + 2 = 11 damage
    expect(foe.statuses.burning).toBeUndefined();
    expect(cards()).toHaveLength(2);
    expect(lastCard()).toMatchObject({ status: 'applied', editable: true });
  });

  it('Advantage keeps the d20 that counted, adds d20s, and drops every other earlier die', async () => {
    const ctx = await fight();
    await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.foeToken });
    const seen = seenPending(ctx.g);
    await act(ctx.g, ctx, { roll: 'stances', effects: { damage: { amount: 5, kind: 'fire' } } });
    const pending = await seen;
    const entry = server.shared.attacks.get(pending.id);
    entry.roll.natural = 7;
    entry.roll.total = 7 + (entry.roll.total - pending.roll.natural);
    const before = entry.roll.total;
    const again = seenPending(ctx.g);
    expect(await ctx.p.call('attack:advantage', { id: pending.id, levels: 2 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await ctx.g.call('attack:advantage', { id: pending.id, levels: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect((await ctx.g.call('attack:advantage', { id: pending.id, levels: 2 })).ok).toBe(true);
    const updated = await again;
    expect(updated.roll.dice).toHaveLength(3);
    expect(updated.roll.dice).toContain(7);
    expect(updated.roll.natural).toBe(Math.max(...updated.roll.dice));
    expect(updated.roll.natural).toBeGreaterThanOrEqual(7);
    expect(updated.roll.total).toBe(before - 7 + updated.roll.natural);
    expect(updated.roll.advantage.net).toBe(2);
    // Disadvantage from there keeps the d20 that counted now and takes the lowest.
    const kept = updated.roll.natural;
    const down = seenPending(ctx.g);
    await ctx.g.call('attack:advantage', { id: pending.id, levels: -1 });
    const lower = await down;
    expect(lower.roll.dice).toHaveLength(2);
    expect(lower.roll.dice).toContain(kept);
    expect(lower.roll.natural).toBe(Math.min(...lower.roll.dice));
    expect(server.shared.chat.history().filter((m) => m.type === 'roll' && m.roll.title === 'Attack roll (set by the GM)')).toHaveLength(2);
  });

  it('a Spontaneous Action without a roll gets a card too, with Revert but no Edit', async () => {
    const ctx = await fight();
    await act(ctx.g, ctx, { ap: 2, effects: { help: { sides: 8 }, temp: { value: 6 } } });
    const card = lastCard();
    expect(card).toMatchObject({ kind: 'spontaneous', reversible: true, editable: false });
    expect(await ctx.g.call('effects:edit', { messageId: card.id })).toMatchObject({ ok: false, code: 'not_found' });
    await ctx.g.call('effects:revert', { messageId: card.id });
    const sheet = await sheetOf(ctx.g, ctx.a);
    expect(sheet.helpDice).toEqual([]);
    expect(sheet.hp.temp).toBe(0);
    expect(sheet.ap.current).toBe(4);
  });
});
