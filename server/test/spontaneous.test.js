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
const act = (g, ctx, extra = {}) => g.call('spontaneous:do', { characterId: ctx.a, ap: 1, targetMode: 'none', roll: 'magic', defence: 'physical', effects: { help: { sides: 6 } }, ...extra });

describe('Spontaneous Action', () => {
  it('is GM only and checks what it is given', async () => {
    const ctx = await fight();
    expect(await act(ctx.p, ctx)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await act(ctx.g, ctx, { ap: 3 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await act(ctx.g, ctx, { targetMode: 'some' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await act(ctx.g, ctx, { effects: {} })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await act(ctx.g, ctx, { effects: { help: { sides: 20 } } })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await act(ctx.g, ctx, { effects: { damage: { amount: 3, kind: 'love' } } })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await act(ctx.g, ctx, { effects: { status: { key: 'nope', stacks: 1 } } })).toMatchObject({ ok: false, code: 'bad_value' });
    await ctx.g.call('sheet:set', { characterId: ctx.a, path: 'ap.current', value: 1 });
    expect(await act(ctx.g, ctx, { ap: 2 })).toMatchObject({ ok: false, code: 'no_ap' });
  });

  it('a Help Die and Temp HP alone are given at once, to the actor when there are no targets', async () => {
    const ctx = await fight();
    const r = await act(ctx.g, ctx, { ap: 2, effects: { help: { sides: 8 }, temp: { value: 6 } } });
    expect(r).toMatchObject({ ok: true, instant: true });
    const sheet = await sheetOf(ctx.g, ctx.a);
    expect(sheet.helpDice).toEqual([8]);
    expect(sheet.hp.temp).toBe(6);
    expect(sheet.ap.current).toBe(2);
    expect(texts().some((t) => /Mira uses a Spontaneous Action \(2 AP\)/.test(t))).toBe(true);
    expect(texts().some((t) => /Help Die: a d8 joins the track/.test(t))).toBe(true);
    expect((await ctx.g.call('attack:list')).attacks).toHaveLength(0);
    // Temp HP does not stack: a smaller shield changes nothing.
    await act(ctx.g, ctx, { effects: { temp: { value: 2 } } });
    expect((await sheetOf(ctx.g, ctx.a)).hp.temp).toBe(6);
    await act(ctx.g, ctx, { effects: { temp: { value: 9 } } });
    expect((await sheetOf(ctx.g, ctx.a)).hp.temp).toBe(9);
  });

  it('goes to the selected targets instead, and the target count is enforced', async () => {
    const ctx = await fight();
    expect(await act(ctx.g, ctx, { targetMode: 'one' })).toMatchObject({ ok: false, code: 'no_target' });
    await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.allyToken });
    await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.foeToken });
    expect(await act(ctx.g, ctx, { targetMode: 'one' })).toMatchObject({ ok: false, code: 'no_target' }); // two are selected
    expect((await act(ctx.g, ctx, { targetMode: 'many', effects: { temp: { value: 4 } } })).ok).toBe(true);
    expect((await sheetOf(ctx.g, ctx.ally)).hp.temp).toBe(4);
    expect((await sheetOf(ctx.g, ctx.foe)).hp.temp).toBe(4);
    expect((await sheetOf(ctx.g, ctx.a)).hp.temp).toBe(0); // the actor is not a target
    expect((await act(ctx.g, ctx, { targetMode: 'none', effects: { temp: { value: 3 } } })).ok).toBe(true); // 'none' ignores the selection
    expect((await sheetOf(ctx.g, ctx.a)).hp.temp).toBe(3);
  });

  it('a combination with Damage or Status is rolled and confirmed on the card, then everything is applied', async () => {
    const ctx = await fight();
    await ctx.g.call('sheet:set', { characterId: ctx.foe, path: 'hp.temp', value: 3 });
    await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.foeToken });
    const seen = seenPending(ctx.g);
    const r = await act(ctx.g, ctx, { ap: 2, targetMode: 'one', roll: 'stances', defence: 'physical', effects: { damage: { amount: 5, kind: 'fire' }, status: { key: 'burning', stacks: 2 }, help: { sides: 6 }, temp: { value: 9 } } });
    expect(r.ok).toBe(true);
    const pending = await seen;
    expect(pending).toMatchObject({ weaponName: 'Spontaneous Action', ap: 2, base: 5, kind: 'fire', defenceKind: 'physical', statuses: [{ key: 'burning', stacks: 2 }] });
    expect(pending.spontaneous).toEqual({ help: { sides: 6 }, temp: { value: 9 } });
    expect(pending.roll.title).toBe('Stances attack');
    expect(pending.roll.against.targets).toEqual([{ name: 'Ogre', value: 5 }]);
    server.shared.attacks.get(pending.id).roll.natural = 10;
    expect((await ctx.g.call('attack:apply', { id: pending.id, total: 20, base: 5, kind: 'fire', ap: 2, statuses: [{ key: 'burning', stacks: 2 }] })).ok).toBe(true);
    const foe = await sheetOf(ctx.g, ctx.foe);
    // 5 + 2 (a Heavy Hit, 15 over) = 7 damage: 3 Temp HP absorb 3, 4 reach HP; then the new Temp HP and Help Die arrive.
    expect(foe.hp.current).toBe(16);
    expect(foe.hp.temp).toBe(9);
    expect(foe.helpDice).toEqual([6]);
    expect(foe.statuses.burning).toBe(2);
    expect((await sheetOf(ctx.g, ctx.a)).ap.current).toBe(2);
    expect(texts().some((t) => /Temp HP absorbs 3/.test(t))).toBe(true);
  });

  it('with no target selected the actor is the target of a rolled action', async () => {
    const ctx = await fight();
    const seen = seenPending(ctx.g);
    await act(ctx.g, ctx, { effects: { status: { key: 'dazed', stacks: 1 } } });
    const pending = await seen;
    expect(pending.targets).toEqual([ctx.aToken]);
    expect(pending.base).toBe(0);
    expect(pending.kind).toBe('true');
  });
});

describe('spending Help Dice', () => {
  async function withDice(dice) {
    const ctx = await fight();
    for (const sides of dice) await ctx.g.call('sheet:list', { characterId: ctx.a, list: 'helpDice', action: 'add', sides });
    return ctx;
  }

  it('the chosen dice are rolled as bonuses and used up; no choice uses none', async () => {
    const ctx = await withDice([6, 4, 10]);
    const r = await ctx.p.call('roll:make', { characterId: ctx.a, kind: 'attribute', key: 'luck', help: [0, 2] });
    expect(r.ok).toBe(true);
    const labels = r.message.roll.terms.map((t) => t.label);
    expect(labels).toContain('Help Die (d6)');
    expect(labels).toContain('Help Die (d10)');
    expect(labels).not.toContain('Help Die (d4)');
    expect((await sheetOf(ctx.p, ctx.a)).helpDice).toEqual([4]);
    expect((await ctx.p.call('roll:make', { characterId: ctx.a, kind: 'attribute', key: 'luck', help: [] })).ok).toBe(true);
    expect((await sheetOf(ctx.p, ctx.a)).helpDice).toEqual([4]);
  });

  it('refuses dice that are not there, or a die chosen twice, and uses nothing then', async () => {
    const ctx = await withDice([6]);
    expect(await ctx.p.call('roll:make', { characterId: ctx.a, kind: 'attribute', key: 'luck', help: [1] })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await ctx.p.call('roll:make', { characterId: ctx.a, kind: 'attribute', key: 'luck', help: [0, 0] })).toMatchObject({ ok: false, code: 'bad_value' });
    expect((await sheetOf(ctx.p, ctx.a)).helpDice).toEqual([6]);
  });

  it('works on the attack roll too, and a track of five takes no more by hand', async () => {
    const ctx = await withDice([4, 4, 4, 4, 4]);
    expect(await ctx.g.call('sheet:list', { characterId: ctx.a, list: 'helpDice', action: 'add', sides: 6 })).toMatchObject({ ok: false, code: 'limit' });
    await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: ctx.foeToken });
    const seen = seenPending(ctx.g);
    expect((await ctx.p.call('attack:roll', { characterId: ctx.a, weapon: { kind: 'unarmed' }, enhancements: [], help: [4] })).ok).toBe(true);
    const pending = await seen;
    expect(pending.roll.terms.some((t) => t.label === 'Help Die (d4)')).toBe(true);
    expect((await sheetOf(ctx.p, ctx.a)).helpDice).toEqual([4, 4, 4, 4]);
  });

  it('initiative can spend them as well', async () => {
    const ctx = await withDice([8]);
    await ctx.g.call('combat:start');
    expect((await ctx.p.call('combat:roll', { tokenId: ctx.aToken, help: [0] })).ok).toBe(true);
    expect((await sheetOf(ctx.p, ctx.a)).helpDice).toEqual([]);
    expect(server.shared.chat.history().some((m) => m.roll?.terms?.some((t) => t.label === 'Help Die (d8)'))).toBe(true);
  });
});
