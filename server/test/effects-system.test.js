import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import * as E from '../../shared/effects.js';
import { planRoll } from '../../shared/roll-plan.js';
import { computeTarget } from '../../shared/damage.js';
import { autoDc } from '../../shared/statuses.js';
import { normalizeSheet, apMax } from '../sheet.js';
import { sheetDelta, revertDelta } from '../journal.js';
import { putOn } from '../effectRuntime.js';
import { startOfTurn } from '../combat.js';
import { normalizeAction } from '../../shared/basicActions.js';
import { bandParts } from '../../client/src/components/arcane/summaries.js';

let n = 0;
const newId = () => `x${++n}`;
const def = (over = {}) => E.normalizeDefinition({ name: 'Test', ...over }, newId());
const sheetWith = (effects, extra = {}) => normalizeSheet({ hp: { current: 10, max: 10 }, ...extra, effects });
const inst = (over) => E.instantiate(def(over), '', newId);

describe('Effect definitions', () => {
  it('are cleaned, and a part that changes nothing is dropped', () => {
    const d = E.normalizeDefinition({ name: '  Dodge ', duration: 'weekly', uses: 99, parts: [{ type: 'against', adv: -1 }, { type: 'against' }, { type: 'nope' }, { type: 'roll', scope: 'bad', adv: 2 }] }, 'id1');
    expect(d).toMatchObject({ name: 'Dodge', duration: 'long', uses: 10 });
    expect(d.parts).toEqual([{ type: 'against', adv: -1, bonus: 0 }, { type: 'roll', scope: 'all', adv: 2, bonus: 0, dice: [] }]);
    expect(E.normalizeDefinition({ name: 'x', uses: null }, 'i').uses).toBeNull();
  });
});

describe('what a running Effect does to rolls', () => {
  const rollReq = { kind: 'attribute', key: 'strength' };

  it('scopes pick the rolls they touch', () => {
    const m = (scope, req) => E.scopeMatches(scope, req);
    expect(m('all', rollReq)).toBe(true);
    expect(m('attributes', rollReq)).toBe(true);
    expect(m('stat:strength', rollReq)).toBe(true);
    expect(m('stat:dexterity', rollReq)).toBe(false);
    expect(m('saves', rollReq)).toBe(false);
    expect(m('save:physical', { kind: 'save', key: 'physical' })).toBe(true);
    expect(m('skill:speed', { kind: 'skill', key: 'speed' })).toBe(true);
    expect(m('attacks', { kind: 'weapon', key: 'prime', attack: 'weapon' })).toBe(true);
    expect(m('attack:magic', { kind: 'mastery', key: 'magic', attack: 'weapon' })).toBe(false);
    expect(m('masteries', { kind: 'mastery', key: 'magic', attack: 'magic' })).toBe(false); // an attack, not a Mastery roll
    expect(m('mastery:stances', { kind: 'mastery', key: 'stances' })).toBe(true);
    expect(m('initiative', { kind: 'skill', key: 'speed', initiative: true })).toBe(true);
  });

  it('add Advantage levels, a bonus and a die to the plan of a roll', () => {
    const e = inst({ name: 'Blessing', parts: [{ type: 'roll', scope: 'attributes', adv: 2, bonus: 3, dice: [{ sides: 6, sign: 1 }] }] });
    const sheet = sheetWith([e], { stats: { strength: 2 } });
    const plan = planRoll(sheet, rollReq);
    expect(plan.net).toBe(2);
    expect(plan.terms).toContainEqual({ label: 'Blessing', value: 3 });
    expect(plan.bonusDice).toEqual([{ sides: 6, sign: 1, source: 'Blessing' }]);
    // Not a Dexterity roll... but a Save is not an Attribute roll either.
    expect(planRoll(sheet, { kind: 'save', key: 'strength' }).net).toBe(0);
  });

  it('take Effects of the targets into account only as far as all targets share them', () => {
    const dodge = (name) => ({ name, mods: E.againstMods(sheetWith([inst({ name: 'Dodge', parts: [{ type: 'against', adv: -1 }] })])) });
    const none = { name: 'Ogre', mods: E.againstMods(sheetWith([])) };
    const both = E.sharedAgainst([dodge('A'), dodge('B')]);
    expect(both.levels).toEqual([{ label: 'Dodge', levels: -1 }]);
    expect(both.notes).toEqual([]);
    const some = E.sharedAgainst([dodge('A'), none]);
    expect(some.levels).toEqual([]);
    expect(some.notes).toEqual([{ name: 'A', label: 'Dodge' }]);
    expect(some.used).toEqual({});
  });

  it('the attacker\'s roll plan gets the shared levels', () => {
    const plan = planRoll(sheetWith([]), { kind: 'weapon', key: 'prime', attack: 'weapon', against: { levels: [{ label: 'Dodge', levels: -1 }], terms: [] } });
    expect(plan.net).toBe(-1);
    expect(plan.mode).toBe('disadvantage');
  });

  it('report the Effects with Uses that touched a roll', () => {
    const e = inst({ uses: 1, parts: [{ type: 'roll', scope: 'all', adv: 1 }] });
    expect(planRoll(sheetWith([e]), rollReq).used).toEqual([e.id]);
    expect(planRoll(sheetWith([inst({ parts: [{ type: 'roll', scope: 'all', adv: 1 }] })]), rollReq).used).toEqual([]);
  });
});

describe('the other levers', () => {
  it('Defence, Movement, maximum AP and HP, resistances, damage and the DC', () => {
    const e = inst({
      parts: [
        { type: 'defence', physical: 2, mental: -1 },
        { type: 'stats', movement: 2, maxAp: 1, maxHp: 5 },
        { type: 'resist', kind: 'fire', mode: 'flat', flat: 2 },
        { type: 'resist', kind: 'cold', mode: 'immunity' },
        { type: 'combat', damageDealt: 1, damageTaken: -1, crit: -1, dc: 2 },
      ],
    });
    const sheet = sheetWith([e], { defence: { physical: 10, mental: 10 }, movement: 5, hp: { current: 10, max: 10 }, experience: 1 });
    expect(E.effectiveDefence(sheet)).toEqual({ physical: 12, mental: 9 });
    expect(E.effectiveMovement(sheet)).toBe(7);
    expect(apMax(sheet)).toBe(5);
    expect(E.effectiveMaxHp(sheet)).toBe(15);
    expect(E.effectiveResistances(sheet).fire.flat).toBe(2);
    expect(E.effectiveResistances(sheet).cold.immunity).toBe(true);
    expect(E.combatMods(sheet)).toEqual({ damageDealt: 1, damageTaken: -1, crit: -1, dc: 2 });
    expect(autoDc(sheet)).toBe(autoDc(sheetWith([])) + 2);
    // Damage taken: flat, after resistances, never below 0.
    const hit = computeTarget({ total: 12, natural: 10, defence: 10, base: 3, kind: 'slashing', taken: -1 });
    expect(hit.damage).toBe(2);
    expect(computeTarget({ total: 12, natural: 10, defence: 10, base: 1, kind: 'slashing', taken: -5 }).damage).toBe(0);
  });
});

describe('putting Effects on, and time', () => {
  it('the same Effect again refreshes it; it never stacks', () => {
    const d = def({ name: 'Rage', parts: [{ type: 'roll', scope: 'all', bonus: 1 }] });
    const once = putOn(sheetWith([]), { ...d, id: 'lib1' }, 'Mira');
    expect(once.sheet.effects).toHaveLength(1);
    expect(once.rows[0].params.label.t).toBe('Gains');
    const twice = putOn(once.sheet, { ...d, id: 'lib1' }, 'Mira');
    expect(twice.sheet.effects).toHaveLength(1);
    expect(twice.rows[0].params.label.t).toBe('Refreshes');
  });

  it('gives what it starts with: statuses (with its Duration) and Temp HP', () => {
    const d = def({ duration: 'minute', parts: [{ type: 'grant', statuses: [{ key: 'dazed', stacks: 2 }], temp: 4 }] });
    const out = putOn(sheetWith([]), d, '').sheet;
    expect(out.statuses.dazed).toBe(2);
    expect(out.statusGroups[0].duration).toBe('minute');
    expect(out.hp.temp).toBe(4);
  });

  it('turn end, next turn and 1 Minute end at the right moments', () => {
    const list = [inst({ name: 'A', duration: 'turn_end' }), inst({ name: 'B', duration: 'next_turn' }), inst({ name: 'C', duration: 'minute' }), inst({ name: 'D', duration: 'long' })];
    const start = E.tickStart(list);
    expect(start.ended.map((e) => e.name)).toEqual(['B']);
    let { effects, ended } = E.tickEnd(start.effects);
    expect(ended.map((e) => e.name)).toEqual(['A']);
    expect(effects.map((e) => e.name)).toEqual(['C', 'D']);
    expect(effects[0].rounds).toBe(E.EFFECT_ROUNDS - 1);
    for (let i = 0; i < E.EFFECT_ROUNDS - 1; i++) ({ effects, ended } = E.tickEnd(effects));
    expect(effects.map((e) => e.name)).toEqual(['D']);
    expect(ended.map((e) => e.name)).toEqual(['C']);
  });

  it('the start of a turn drops "until start of next turn" and says so', () => {
    const out = startOfTurn(sheetWith([inst({ name: 'Dodge', duration: 'next_turn' })]), 'Mira');
    expect(out.sheet.effects).toEqual([]);
    expect(out.lines[0].key).toBe('{effect} ends.');
  });
});

describe('Revert of Effects', () => {
  it('takes away what a card added and brings back what it removed, and returns spent uses', () => {
    const base = sheetWith([inst({ name: 'Old', uses: 2, parts: [{ type: 'roll', scope: 'all', adv: 1 }] })]);
    const old = base.effects[0];
    const added = putOn(base, def({ name: 'New' }), '').sheet;
    const delta = sheetDelta(base, added);
    expect(delta.fxAdded.map((e) => e.name)).toEqual(['New']);
    expect(revertDelta(added, delta).effects.map((e) => e.name)).toEqual(['Old']);

    const spent = normalizeSheet({ ...base, effects: [{ ...old, uses: { current: 1, max: 2 } }] });
    const d2 = sheetDelta(base, spent);
    expect(d2.fxUses).toEqual({ [old.id]: -1 });
    expect(revertDelta(spent, d2).effects[0].uses.current).toBe(2);

    const gone = normalizeSheet({ ...base, effects: [] });
    const d3 = sheetDelta(base, gone);
    expect(revertDelta(gone, d3).effects.map((e) => e.name)).toEqual(['Old']);
  });
});

// ---- Through the sockets -------------------------------------------------------------------------------------

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
  await db.batch(['DELETE FROM characters', "DELETE FROM effect_defs WHERE id NOT LIKE 'default:%'"], 'write');
  server.shared.chat.clear();
});
async function client(identity) {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  await s.call('identity:set', identity);
  return s;
}
const sheetOf = async (s, id) => (await s.call('sheet:get', { characterId: id })).sheet;

describe('Effects over the sockets', () => {
  it('the GM keeps a global library; a player puts one on their own PC, and Revert takes it back', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const saved = await g.call('effect:save', { effect: { name: 'Parry', duration: 'next_turn', uses: 1, parts: [{ type: 'against', adv: -1 }] } });
    expect(saved.ok).toBe(true);
    const p = await client({ role: 'player', characterId: id });
    const lib = (await p.call('effect:library')).effects;
    expect(lib.map((e) => e.name)).toContain('Parry');
    expect(lib.map((e) => e.name)).toContain('Dodge'); // shipped with the app
    expect((await p.call('effect:save', { effect: { name: 'x' } })).ok).toBe(false); // GM only

    expect((await p.call('effect:give', { characterId: id, effectId: saved.effect.id })).ok).toBe(true);
    const s = await sheetOf(g, id);
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0]).toMatchObject({ name: 'Parry', duration: 'next_turn', uses: { current: 1, max: 1 } });
    const card = server.shared.chat.history().find((m) => m.type === 'effects');
    expect(card.reversible).toBe(true);
    expect((await g.call('effects:revert', { messageId: card.id })).ok).toBe(true);
    expect((await sheetOf(g, id)).effects).toEqual([]);
  });

  it('a roll that an Effect with one use touched spends it, and the Effect ends', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const e = (await g.call('effect:save', { effect: { name: 'Focus', uses: 1, parts: [{ type: 'roll', scope: 'attributes', adv: 1 }] } })).effect;
    await g.call('effect:give', { characterId: id, effectId: e.id });
    const roll = (await g.call('roll:make', { characterId: id, kind: 'attribute', key: 'strength' })).message.roll;
    expect(roll.advantage.net).toBe(1);
    expect((await sheetOf(g, id)).effects).toEqual([]);
  });

  it('an Effect can also be removed by hand', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    await g.call('sheet:list', { characterId: id, list: 'effectDefs', action: 'add', effect: { name: 'Own', parts: [{ type: 'text', text: 'hello' }] } });
    const own = (await sheetOf(g, id)).effectDefs[0];
    await g.call('effect:give', { characterId: id, effectId: own.id });
    const running = (await sheetOf(g, id)).effects[0];
    expect((await g.call('effect:remove', { characterId: id, id: running.id })).ok).toBe(true);
    expect((await sheetOf(g, id)).effects).toEqual([]);
  });
});

describe('Effects of items', () => {
  it('using an item puts its Effects on the user, with a card', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const e = (await g.call('effect:save', { effect: { name: 'Shielded', parts: [{ type: 'defence', physical: 2 }] } })).effect;
    await g.call('sheet:list', { characterId: id, list: 'items', action: 'add', name: 'Charm', usesMax: 2, effects: [{ id: e.id, to: 'target' }] });
    const item = (await sheetOf(g, id)).items[0];
    expect(item.effects).toEqual([{ id: e.id, to: 'self' }]); // items only act on their user
    await g.call('sheet:list', { characterId: id, list: 'items', action: 'use', id: item.id });
    const s = await sheetOf(g, id);
    expect(s.items[0].uses.current).toBe(1);
    expect(s.effects.map((x) => x.name)).toEqual(['Shielded']);
    expect(E.effectiveDefence(s).physical).toBe(2);
  });
});

describe('Basic Actions', () => {
  it('ship with the DC20 list, which the GM can edit, add to and delete from', async () => {
    const g = await client({ role: 'gm' });
    const list = (await g.call('basic:list')).actions;
    const names = list.map((a) => a.name);
    for (const n of ['Dodge', 'Full Dodge', 'Disengage', 'Help', 'Grapple', 'Shove', 'Hide', 'Search']) expect(names).toContain(n);
    const dodge = list.find((a) => a.name === 'Dodge');
    expect(dodge).toMatchObject({ ap: 1, effects: [{ id: 'default:dodge', to: 'self' }] });
    const saved = await g.call('basic:save', { id: dodge.id, action: { ...dodge, ap: 2 } });
    expect(saved.action.ap).toBe(2);
    const fresh = await g.call('basic:save', { action: { name: 'Shout', ap: 1, roll: { kind: 'skill', key: 'likability' } } });
    expect(fresh.action.roll).toEqual({ kind: 'skill', key: 'likability' });
    expect((await g.call('basic:delete', { id: fresh.action.id })).ok).toBe(true);
    const p = await client({ role: 'gm' }); // (a second GM device sees the same list)
    expect((await p.call('basic:list')).actions.find((a) => a.id === dodge.id).ap).toBe(2);
    await g.call('basic:save', { id: dodge.id, action: { ...dodge, ap: 1 } });
  });

  it('Dodge spends the AP, puts its Effect on the user, and Revert gives it all back', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 4 });
    const p = await client({ role: 'player', characterId: id });
    const dodge = (await p.call('basic:list')).actions.find((a) => a.name === 'Dodge');
    expect((await p.call('basic:use', { characterId: id, actionId: dodge.id })).ok).toBe(true);
    const s = await sheetOf(g, id);
    expect(s.ap.current).toBe(3);
    expect(s.effects.map((e) => e.name)).toEqual(['Dodge']);
    const card = server.shared.chat.history().filter((m) => m.type === 'effects').at(-1);
    expect(card.kind).toBe('action');
    expect((await g.call('effects:revert', { messageId: card.id })).ok).toBe(true);
    const back = await sheetOf(g, id);
    expect(back.ap.current).toBe(4);
    expect(back.effects).toEqual([]);
  });

  it('refuses without the AP, and Help needs a target', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const list = (await g.call('basic:list')).actions;
    await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 1 });
    const full = list.find((a) => a.name === 'Full Dodge');
    expect((await g.call('basic:use', { characterId: id, actionId: full.id })).ok).toBe(false);
    const help = list.find((a) => a.name === 'Help');
    const r = await g.call('basic:use', { characterId: id, actionId: help.id });
    expect(r.ok).toBe(false);
    expect((await sheetOf(g, id)).ap.current).toBe(1); // nothing was spent
  });

  it('can put statuses (conditions) on the user or the targets; one with no Save lands at once', async () => {
    const a = normalizeAction({ name: 'Duck', statuses: [{ key: 'hidden', to: 'self' }, { key: 'bleeding', stacks: 2, duration: 'minute', to: 'target' }, { key: 'nope' }] }, 'x');
    expect(a.statuses).toEqual([
      { key: 'hidden', stacks: 1, duration: 'long', dc: 'auto', to: 'self' },
      { key: 'bleeding', stacks: 2, duration: 'minute', dc: 'auto', to: 'target' },
    ]);
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 4 });
    const saved = await g.call('basic:save', { action: { name: 'Duck', ap: 1, statuses: [{ key: 'hidden', to: 'self' }] } });
    expect((await g.call('basic:use', { characterId: id, actionId: saved.action.id })).ok).toBe(true);
    expect((await sheetOf(g, id)).statuses.hidden).toBe(1);
    // One that aims at others needs a target.
    const aimed = await g.call('basic:save', { action: { name: 'Hex', ap: 1, statuses: [{ key: 'bleeding', to: 'target' }] } });
    expect((await g.call('basic:use', { characterId: id, actionId: aimed.action.id })).ok).toBe(false);
  });

  it('a Stance band lists the Effects it puts on', () => {
    const t = (text, p = {}) => text.replace(/\{(\w+)\}/g, (_, k) => (typeof p[k] === 'object' ? p[k].t : p[k]));
    const parts = bandParts({ bonus: 1, advantage: 0, range: 0, damage: 0, statuses: [], dice: [], unique: [], effects: [{ id: 'e1', to: 'target' }, { id: 'e2', to: 'self' }] }, t, (id) => (id === 'e1' ? 'Rage' : 'Calm'));
    expect(parts).toEqual(['Roll +1', 'Rage (on the targets)', 'Calm (on the user)']);
  });

  it('a rolled action posts its roll', async () => {
    const g = await client({ role: 'gm' });
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 4 });
    const shove = (await g.call('basic:list')).actions.find((a) => a.name === 'Shove');
    expect((await g.call('basic:use', { characterId: id, actionId: shove.id })).ok).toBe(true);
    const roll = server.shared.chat.history().filter((m) => m.type === 'roll').at(-1);
    expect(roll.roll.title).toMatch(/^Shove: /);
  });
});
