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


import { statusSave, normalizeApply, autoDc, reconcileGroups, addToGroups, tickGroups, totalsOf, MINUTE_ROUNDS } from '../../shared/statuses.js';
import { normalizeSheet } from '../sheet.js';

const cards = () => server.shared.chat.history().filter((m) => m.type === 'effects');
let counter = 0;
const newId = () => `g${++counter}`;

describe('which Save a status asks for', () => {
  it('lists the Mental ones, the ones without a Save, and makes every other one Physical', () => {
    for (const k of ['dazed', 'charmed', 'disoriented', 'doomed', 'frightened', 'intimidated', 'taunted', 'terrified']) expect(statusSave(k)).toBe('mental');
    for (const k of ['blood_oxidization', 'fully_concealed', 'half_cover', 'hidden', 'invisible', 'partially_concealed', 'surprised', '3_4_cover', 'unheard', 'unseen']) expect(statusSave(k)).toBeNull();
    for (const k of ['bleeding', 'burning', 'blinded', 'prone', 'stunned', 'exposed', 'weakened']) expect(statusSave(k)).toBe('physical');
  });

  it('cleans an application: Repeated needs a Save, DC is Automatic or a number', () => {
    expect(normalizeApply({ key: 'bleeding', stacks: 3, duration: 'repeated', dc: 14 })).toEqual({ key: 'bleeding', stacks: 3, duration: 'repeated', dc: 14 });
    expect(normalizeApply({ key: 'hidden', stacks: 5, duration: 'repeated' })).toEqual({ key: 'hidden', stacks: 1, duration: 'long', dc: 'auto' });
    expect(normalizeApply({ key: 'dazed', stacks: 2, duration: 'weekly', dc: 0 })).toEqual({ key: 'dazed', stacks: 2, duration: 'long', dc: 'auto' });
    expect(normalizeApply({ key: 'nope' })).toBeNull();
  });

  it('the Automatic DC is 8 + the Experience Modifier + the Prime (the highest stat)', () => {
    const sheet = normalizeSheet({ experience: 2, stats: { strength: 1, dexterity: 3, intelligence: 2, spirit: 0, luck: 1 } });
    expect(autoDc(sheet)).toBe(8 + 2 + 3);
  });
});

describe('groups of status stacks', () => {
  it('merge by Duration, a Repeated group keeps the highest DC, 1 Minute stacks keep their own timers', () => {
    let groups = [];
    groups = addToGroups(groups, { key: 'bleeding', stacks: 2, duration: 'repeated' }, 12, newId).groups;
    groups = addToGroups(groups, { key: 'bleeding', stacks: 3, duration: 'repeated' }, 15, newId).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ stacks: 5, dc: 15, duration: 'repeated' });
    groups = addToGroups(groups, { key: 'bleeding', stacks: 2, duration: 'minute' }, 0, newId).groups;
    groups = addToGroups(groups, { key: 'bleeding', stacks: 1, duration: 'minute' }, 0, newId).groups;
    expect(groups.filter((g) => g.duration === 'minute')).toHaveLength(2); // separate timers
    expect(totalsOf(groups)).toEqual({ bleeding: 8 }); // the effect is still combined
    // A status that does not stack stays at 1 however many groups hold it.
    const frightened = addToGroups(addToGroups([], { key: 'frightened', stacks: 1, duration: 'long' }, 0, newId).groups, { key: 'frightened', stacks: 1, duration: 'minute' }, 0, newId).groups;
    expect(totalsOf(frightened)).toEqual({ frightened: 1 });
  });

  it('a manual change of a total adds to Long, and takes Long first, then Repeated, 1 Minute, 1 Round', () => {
    let groups = [];
    for (const [duration, stacks] of [['round', 1], ['minute', 1], ['repeated', 1], ['long', 1]]) groups = addToGroups(groups, { key: 'dazed', stacks, duration }, 10, newId).groups;
    expect(reconcileGroups({ dazed: 6 }, groups, newId).find((g) => g.duration === 'long').stacks).toBe(3);
    let left = reconcileGroups({ dazed: 3 }, groups, newId);
    expect(left.map((g) => g.duration).sort()).toEqual(['minute', 'repeated', 'round']);
    left = reconcileGroups({ dazed: 1 }, groups, newId);
    expect(left.map((g) => g.duration)).toEqual(['round']);
    expect(reconcileGroups({}, groups, newId)).toEqual([]);
  });

  it('the end of a turn removes 1 Round stacks and counts 1 Minute down over 5 turns', () => {
    let groups = addToGroups(addToGroups([], { key: 'impaired', stacks: 2, duration: 'round' }, 0, newId).groups, { key: 'impaired', stacks: 1, duration: 'minute' }, 0, newId).groups;
    ({ groups } = tickGroups(groups));
    expect(groups).toHaveLength(1);
    expect(groups[0].rounds).toBe(MINUTE_ROUNDS - 1);
    for (let i = 0; i < MINUTE_ROUNDS - 2; i++) ({ groups } = tickGroups(groups));
    expect(groups[0].rounds).toBe(1);
    const last = tickGroups(groups);
    expect(last.groups).toEqual([]);
    expect(last.ended).toHaveLength(1);
  });
});
const sheetOf2 = async (s, id) => (await s.call('sheet:get', { characterId: id })).sheet;

// Puts a status on one target through a Spontaneous Action and applies the card (a sure hit).
async function statusOn(ctx, tokenId, status, ap = 1) {
  await ctx.p.call('battle:target', { characterId: ctx.a, tokenId: null });
  await ctx.p.call('battle:target', { characterId: ctx.a, tokenId });
  const seen = seenPending(ctx.g);
  const r = await act(ctx.g, ctx, { ap, effects: { status } });
  expect(r.ok).toBe(true);
  const pending = await seen;
  server.shared.attacks.get(pending.id).roll.natural = 10;
  const applied = await ctx.g.call('attack:apply', { id: pending.id, total: 30, base: 0, kind: 'true', ap, statuses: pending.statuses });
  expect(applied.ok).toBe(true);
  return pending;
}
const groupsOf = async (ctx, id) => (await sheetOf2(ctx.g, id)).statusGroups;

describe('a status with a Save put on a non-player character', () => {
  it('the Save is rolled at once: it lands on a failure, with its Duration, and is resisted on a pass', async () => {
    const ctx = await fight();
    await statusOn(ctx, ctx.foeToken, { key: 'burning', stacks: 2, duration: 'minute', dc: 99 });
    expect(await groupsOf(ctx, ctx.foe)).toMatchObject([{ key: 'burning', stacks: 2, duration: 'minute', rounds: 5 }]);
    expect((await sheetOf2(ctx.g, ctx.foe)).statuses.burning).toBe(2);
    expect(server.shared.chat.history().some((m) => m.type === 'roll' && m.roll.against?.label === 'DC' && m.roll.title === 'Physical Save')).toBe(true);
    const card = cards().at(-1);
    expect(card.text).toMatch(/Physical Save against Burning 2 \(1 Minute\): \d+ vs DC 99, Failed/);

    await statusOn(ctx, ctx.foeToken, { key: 'bleeding', stacks: 1, duration: 'long', dc: 1 }); // any roll beats DC 1
    expect((await sheetOf2(ctx.g, ctx.foe)).statuses.bleeding).toBeUndefined();
    expect(cards().at(-1).text).toMatch(/Resisted/);
  });

  it('a status without a Save lands at once and Mental statuses roll a Mental Save', async () => {
    const ctx = await fight();
    await statusOn(ctx, ctx.foeToken, { key: 'hidden', duration: 'round' });
    expect(await groupsOf(ctx, ctx.foe)).toMatchObject([{ key: 'hidden', stacks: 1, duration: 'round' }]);
    await statusOn(ctx, ctx.foeToken, { key: 'dazed', stacks: 2, duration: 'long', dc: 99 });
    expect(server.shared.chat.history().some((m) => m.type === 'roll' && m.roll.title === 'Mental Save')).toBe(true);
  });

  it('Revert takes back only the stacks of the card, keeping other groups', async () => {
    const ctx = await fight();
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'burning', stacks: 1, duration: 'long' });
    await statusOn(ctx, ctx.foeToken, { key: 'burning', stacks: 2, duration: 'repeated', dc: 99 });
    expect((await sheetOf2(ctx.g, ctx.foe)).statuses.burning).toBe(3);
    await ctx.g.call('effects:revert', { messageId: cards().find((c) => c.kind === 'attack').id });
    expect(await groupsOf(ctx, ctx.foe)).toMatchObject([{ key: 'burning', stacks: 1, duration: 'long' }]);
  });
});

describe('a status with a Save put on a player character', () => {
  it('the player is asked (with the Save, the DC and their modifiers), pays AP for Advantage, and the result lands after the answer', async () => {
    const ctx = await fight();
    const bram = await player(ctx.ally);
    await ctx.g.call('status:add', { characterId: ctx.ally, key: 'weakened', stacks: 1, duration: 'long' }); // Disadvantage 1 on physical saves
    const asked = new Promise((resolve) => bram.once('save:ask', resolve));
    await statusOn(ctx, ctx.allyToken, { key: 'burning', stacks: 2, duration: 'repeated', dc: 99 });
    const ask = await asked;
    expect(ask).toMatchObject({ characterId: ctx.ally, save: 'physical', dc: 99, kind: 'apply', apply: { key: 'burning', stacks: 2, duration: 'repeated' }, net: -1, apMax: 4 });
    expect(ask.sources.length).toBeGreaterThan(0);
    expect((await sheetOf2(ctx.g, ctx.ally)).statuses.burning).toBeUndefined(); // nothing yet: the card says it is waiting
    expect(cards().find((c) => c.kind === 'attack').text).toMatch(/waiting for Bram/);
    expect((await ctx.g.call('save:list')).saves).toHaveLength(1);

    expect(await ctx.p.call('save:answer', { id: ask.id, ap: 0 })).toMatchObject({ ok: false, code: 'forbidden' }); // not their character
    const done = new Promise((resolve) => bram.once('save:resolved', resolve));
    expect((await bram.call('save:answer', { id: ask.id, ap: 2 })).ok).toBe(true);
    await done;
    const sheet = await sheetOf2(ctx.g, ctx.ally);
    expect(sheet.ap.current).toBe(2); // 2 AP spent for 2 levels of Advantage
    expect(sheet.statusGroups.find((g) => g.key === 'burning')).toMatchObject({ stacks: 2, duration: 'repeated', dc: 99 });
    expect(sheet.statusGroups.find((g) => g.key === 'weakened')).toMatchObject({ stacks: 1, duration: 'long' });
    const roll = server.shared.chat.history().filter((m) => m.type === 'roll').at(-1).roll;
    expect(roll.advantage.net).toBe(1); // Weakened's Disadvantage 1 and 2 levels bought
    expect(cards().at(-1)).toMatchObject({ kind: 'save', reversible: true });
    await bram.call('save:answer', { id: ask.id, ap: 0 }).then((r) => expect(r.ok).toBe(false));
  });

  it('the GM can answer for a player who is not there, and no AP is spent', async () => {
    const ctx = await fight();
    await statusOn(ctx, ctx.allyToken, { key: 'bleeding', stacks: 1, duration: 'long', dc: 99 });
    const [ask] = (await ctx.g.call('save:list')).saves;
    expect((await ctx.g.call('save:answer', { id: ask.id, ap: 3 })).ok).toBe(true);
    const sheet = await sheetOf2(ctx.g, ctx.ally);
    expect(sheet.ap.current).toBe(4);
    expect(sheet.statuses.bleeding).toBe(1);
  });
});

describe('statuses added by hand, and the end of a turn', () => {
  it('status:add takes a Duration; Repeated needs a Save and a DC; no Save is rolled', async () => {
    const ctx = await fight();
    expect(await ctx.g.call('status:add', { characterId: ctx.foe, key: 'hidden', duration: 'repeated', dc: 10 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', duration: 'repeated' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect((await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', stacks: 2, duration: 'repeated', dc: 12 })).ok).toBe(true);
    expect((await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', stacks: 3, duration: 'repeated', dc: 15 })).ok).toBe(true);
    expect(await groupsOf(ctx, ctx.foe)).toMatchObject([{ key: 'bleeding', stacks: 5, duration: 'repeated', dc: 15 }]);
    // Only the Spontaneous...: the player cannot add to somebody else's sheet.
    expect(await ctx.p.call('status:add', { characterId: ctx.foe, key: 'prone' })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('at the end of a turn 1 Round statuses end, 1 Minute ones count down, and an NPC rolls the Repeated Save once for all stacks', async () => {
    const ctx = await fight();
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'impaired', stacks: 2, duration: 'round' });
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', stacks: 2, duration: 'repeated', dc: 1 }); // always passes
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', stacks: 3, duration: 'repeated', dc: 99 }); // the same group: DC 99
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'bleeding', stacks: 1, duration: 'minute' });
    await ctx.g.call('status:add', { characterId: ctx.foe, key: 'dazed', stacks: 1, duration: 'repeated', dc: 1 }); // a Mental Save that passes
    await ctx.g.call('combat:start');
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.foeToken, value: 20 });
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.aToken, value: 10 });
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.allyToken, value: 5 });
    await ctx.g.call('combat:begin');
    server.shared.chat.clear();
    expect((await ctx.g.call('combat:next')).ok).toBe(true);
    const groups = await groupsOf(ctx, ctx.foe);
    expect(groups.find((g) => g.key === 'impaired')).toBeUndefined(); // 1 Round: gone
    expect(groups.find((g) => g.key === 'dazed')).toBeUndefined(); // a passed Repeated Save removes it
    expect(groups.find((g) => g.key === 'bleeding' && g.duration === 'repeated')).toMatchObject({ stacks: 5, dc: 99 }); // DC 99: failed, it stays
    expect(groups.find((g) => g.key === 'bleeding' && g.duration === 'minute').rounds).toBe(4);
    const saves = server.shared.chat.history().filter((m) => m.type === 'roll' && m.roll.against?.label === 'DC');
    expect(saves.map((m) => m.roll.title).sort()).toEqual(['Mental Save', 'Physical Save']); // one Save per status, not per stack
    const card = cards().find((c) => c.kind === 'turn' && /Impaired 2 \(1 Round\) ends/.test(c.text));
    expect(card).toBeTruthy();
    // Reverting the card brings the ended status back.
    await ctx.g.call('effects:revert', { messageId: card.id });
    expect((await sheetOf2(ctx.g, ctx.foe)).statuses.impaired).toBe(2);
  });

  it('a player is asked for the Repeated Save at the end of their turn, and a pass removes the status', async () => {
    const ctx = await fight();
    const bram = await player(ctx.ally);
    await ctx.g.call('status:add', { characterId: ctx.ally, key: 'bleeding', stacks: 2, duration: 'repeated', dc: 1 });
    await ctx.g.call('combat:start');
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.allyToken, value: 20 });
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.aToken, value: 10 });
    await ctx.g.call('combat:set_initiative', { tokenId: ctx.foeToken, value: 5 });
    await ctx.g.call('combat:begin');
    const asked = new Promise((resolve) => bram.once('save:ask', resolve));
    expect((await bram.call('combat:next')).ok).toBe(true); // the turn passes at once
    const ask = await asked;
    expect(ask).toMatchObject({ kind: 'repeated', dc: 1, save: 'physical', apply: { key: 'bleeding', stacks: 2 } });
    expect((await sheetOf2(ctx.g, ctx.ally)).statuses.bleeding).toBe(2);
    expect((await bram.call('save:answer', { id: ask.id, ap: 0 })).ok).toBe(true);
    expect((await sheetOf2(ctx.g, ctx.ally)).statuses.bleeding).toBeUndefined();
  });
});
