import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { BANDS, defaultTable, groupTable, normalizeTable, resolveBand, visibleStances, defaultBase, normalizeStance, blankEffect } from '../../shared/stances.js';
import { planAttack, enhancementCatalog } from '../../shared/arcane.js';
import { defaultSheet } from '../sheet.js';

describe('a Stance\'s Cost', () => {
  it('is set per Stance, defaults to nothing and is cleaned like an Enhancement cost', () => {
    const base = defaultBase('aries');
    expect(base.cost).toEqual({ ap: 0, damage: null, statuses: [], item: null });
    const next = normalizeStance({ cost: { ap: 2, damage: { amount: 3, kind: 'fire' }, statuses: [{ key: 'bleeding', stacks: 1 }] } }, base);
    expect(next.cost).toMatchObject({ ap: 2, damage: { amount: 3, kind: 'fire' }, statuses: [{ key: 'bleeding', stacks: 1 }] });
    expect(normalizeStance({ name: 'X' }, next).cost.ap).toBe(2); // untouched when not sent
  });

  it('joins the attack like an Enhancement cost: AP, damage and statuses', () => {
    const sheet = defaultSheet();
    const catalog = enhancementCatalog([], sheet);
    const cost = normalizeStance({ cost: { ap: 2, damage: { amount: 1, kind: 'true' }, statuses: [{ key: 'bleeding', stacks: 1 }] } }, defaultBase('aries')).cost;
    const plan = planAttack(sheet, catalog, { weapon: { kind: 'unarmed' }, enhancements: [] }, [{ name: 'Aries', effect: blankEffect(), cost }]);
    expect(plan.ok).toBe(true);
    expect(plan.ap).toBe(3); // the Unarmed Attack's 1 AP and the Stance's 2
    expect(plan.costs.damage).toEqual([{ amount: 1, kind: 'true' }]);
    expect(plan.costs.statuses).toEqual([{ key: 'bleeding', stacks: 1 }]);
  });
});

describe('the band tables', () => {
  it('has six bands and starts as a cumulative +1 per band', () => {
    expect(BANDS.map((b) => b.label)).toEqual(['Less than 10', '10-14', '15-19', '20-24', '25-29', '30 or more']);
    expect(defaultTable().map((r) => r.effect.bonus)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('finds the band of a Stance roll', () => {
    const table = defaultTable();
    const at = (total) => resolveBand(table, total).band;
    expect([at(-3), at(9), at(10), at(14), at(15), at(24), at(25), at(29), at(30), at(45)]).toEqual([0, 0, 1, 1, 2, 3, 4, 4, 5, 5]);
  });

  it('a "-" row continues the effect above it, and merges into one cell', () => {
    const table = normalizeTable([{ effect: { damage: 1 } }, { same: true }, { effect: { damage: 2 } }, { same: true }, { same: true }, { effect: { damage: 3 } }]);
    expect(resolveBand(table, 12)).toMatchObject({ band: 1, source: 0, effect: { damage: 1 } });
    expect(resolveBand(table, 27)).toMatchObject({ band: 4, source: 2, effect: { damage: 2 } });
    expect(groupTable(table).map((g) => [g.from, g.span])).toEqual([[0, 2], [2, 3], [5, 1]]);
    // The first row can never be "-".
    expect(normalizeTable([{ same: true }])[0].same).toBe(false);
  });

  it('players see only what their character knows or has learned', () => {
    const all = [{ id: 'a', known: true, learned: [] }, { id: 'b', known: false, learned: [7] }, { id: 'c', known: false, learned: [] }];
    expect(visibleStances(all, 7)).toEqual([{ id: 'a', known: true, usable: false }, { id: 'b', known: false, usable: true }]);
    expect(defaultBase('leo')).toMatchObject({ id: 'base:leo', name: 'Leo', color: '#ffffff', known: true, learned: [] });
  });
});

// ---- sockets --------------------------------------------------------------------------------

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
    ['DELETE FROM battle_tokens', 'DELETE FROM battle_marks', 'DELETE FROM stage_summons', 'DELETE FROM pictures', 'DELETE FROM scenes', 'DELETE FROM temp_npcs', 'DELETE FROM images', 'DELETE FROM characters', 'DELETE FROM arcane_enhancements', 'DELETE FROM stances', 'DELETE FROM stance_vibes', "UPDATE scene_state SET active_scene_id = NULL, mode = 'scene'"],
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
async function gm() {
  const s = await client();
  await s.call('identity:set', { role: 'gm' });
  return s;
}
async function player(characterId) {
  const s = await client();
  await s.call('identity:set', { role: 'player', characterId });
  return s;
}
const texts = () => server.shared.chat.history().filter((m) => m.type === 'text' || m.type === 'effects').map((m) => m.text);
const flat = { same: false, effect: { damage: 2, advantage: 0 } };
// The same effect in every band, so the random Stance roll cannot change what a test sees.
const sameEverywhere = (effect) => [{ effect }, ...Array.from({ length: 5 }, () => ({ same: true }))];

describe('Stance handlers', () => {
  it('lists a base Stance for each of the twelve signs, with the default table', async () => {
    const g = await gm();
    const r = await g.call('stance:list');
    expect(r.stances).toHaveLength(12);
    expect(r.stances.find((s) => s.sign === 'virgo')).toMatchObject({ id: 'base:virgo', name: 'Virgo', color: '#ffffff', known: true, learned: [], parentId: null });
    expect(r.stances[0].table.map((x) => x.effect.bonus)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.vibes).toEqual({});
  });

  it('only the GM configures Stances; a change is stored and reaches everyone', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const p = await player(id);
    expect(await p.call('stance:save', { id: 'base:aries', stance: { name: 'X' } })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await p.call('stance:vibe', { sign: 'aries', vibe: 'x' })).toMatchObject({ ok: false, code: 'forbidden' });
    const changed = new Promise((resolve) => p.once('stances:changed', resolve));
    const r = await g.call('stance:save', { id: 'base:aries', stance: { name: 'Charge', description: 'Forward!', color: '#ff0000', table: sameEverywhere({ bonus: 3 }) } });
    await changed;
    expect(r.stance).toMatchObject({ id: 'base:aries', name: 'Charge', color: '#ff0000' });
    expect((await g.call('stance:list')).stances.find((s) => s.id === 'base:aries')).toMatchObject({ name: 'Charge', description: 'Forward!' });
    await g.call('stance:vibe', { sign: 'aries', vibe: 'Rush.' });
    expect((await g.call('stance:list')).vibes).toEqual({ aries: 'Rush.' });
    await g.call('stance:vibe', { sign: 'aries', vibe: '' });
    expect((await g.call('stance:list')).vibes).toEqual({});
  });

  it('a variation hangs from one parent, is hidden until known, and deleting takes its children', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const p = await player(id);
    const a = (await g.call('stance:save', { sign: 'leo', parentId: 'base:leo', stance: { name: 'Roar', color: '#ffaa00' } })).stance;
    const b = (await g.call('stance:save', { sign: 'leo', parentId: a.id, stance: { name: 'Roar II' } })).stance;
    expect(a).toMatchObject({ parentId: 'base:leo', known: false, color: '#ffaa00' });
    expect(await g.call('stance:save', { sign: 'leo', parentId: 'base:aries', stance: { name: 'Bad' } })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await g.call('stance:save', { sign: 'leo', parentId: a.id, stance: { name: ' ' } })).toMatchObject({ ok: false, code: 'bad_name' });
    // A player sees the bases, but not a variation nobody has seen.
    expect((await p.call('stance:list')).stances.map((s) => s.id)).not.toContain(a.id);
    await g.call('stance:save', { id: a.id, stance: { known: true } });
    const seen = (await p.call('stance:list')).stances.find((s) => s.id === a.id);
    expect(seen).toMatchObject({ name: 'Roar', usable: false });
    expect(seen.learned).toBeUndefined(); // who learned it is the GM's business
    await g.call('stance:save', { id: a.id, stance: { learned: [id] } });
    expect((await p.call('stance:list')).stances.find((s) => s.id === a.id).usable).toBe(true);
    expect((await g.call('stance:delete', { id: 'base:leo' })).ok).toBe(false);
    await g.call('stance:delete', { id: a.id });
    expect((await g.call('stance:list')).stances.some((s) => [a.id, b.id].includes(s.id))).toBe(false);
  });
});

describe('attacking with a Stance', () => {
  async function fight() {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const p = await player(id);
    const scene = (await g.call('scene:create', { name: 'Arena', data: png() })).id;
    await g.call('scene:set_battle_image', { id: scene, data: png(), aspect: 2 });
    await g.call('scene:set_grid', { id: scene, cell: 0.1, ox: 0, oy: 0 });
    await g.call('scene:activate', { id: scene });
    await g.call('battle:mode', { mode: 'battle' });
    await g.call('picture:add', { characterId: id, data: png() });
    await g.call('battle:add', { characterId: id });
    const foe = (await g.call('character:create', { name: 'Ogre', type: 'npc' })).id;
    await g.call('picture:add', { characterId: foe, data: png() });
    const foeToken = (await g.call('battle:add', { characterId: foe })).id;
    await p.call('battle:target', { characterId: id, tokenId: foeToken });
    return { g, p, id };
  }
  const seenPending = (g) => new Promise((resolve) => g.once('attack:pending', resolve));
  const attack = (p, id, extra = {}) => p.call('attack:roll', { characterId: id, weapon: { kind: 'unarmed' }, enhancements: [], ...extra });

  it('needs the Stance to be learned by that character', async () => {
    const { g, p, id } = await fight();
    expect(await attack(p, id, { stance: 'base:aries' })).toMatchObject({ ok: false, code: 'forbidden' }); // even a base one
    expect(await attack(p, id, { stance: 'nope' })).toMatchObject({ ok: false, code: 'not_found' });
    await g.call('stance:save', { id: 'base:aries', stance: { learned: [id] } });
    expect((await attack(p, id, { stance: 'base:aries' })).ok).toBe(true);
  });

  it('rolls the Stance first, and the band effect joins the attack', async () => {
    const { g, p, id } = await fight();
    const effect = { bonus: 2, damage: 3, advantage: 1, range: 4, statuses: [{ key: 'burning', stacks: 2 }], unique: [{ name: 'Rush', text: 'Moves 2 Spaces.' }], dice: [{ sides: 4, sign: 1 }] };
    await g.call('stance:save', { id: 'base:aries', stance: { name: 'Charge', learned: [id], table: sameEverywhere(effect) } });
    const seen = seenPending(g);
    expect((await attack(p, id, { stance: 'base:aries' })).ok).toBe(true);
    const pending = await seen;
    expect(pending.stance).toMatchObject({ name: 'Charge' });
    expect(pending).toMatchObject({ base: 3, statuses: [{ key: 'burning', stacks: 2 }] });
    expect(pending.unique).toEqual([{ name: 'Rush', text: 'Moves 2 Spaces.', source: 'Charge' }]);
    expect(pending.roll.advantage.net).toBe(1);
    expect(pending.roll.terms.some((t) => t.label === 'Charge' && t.value === 2)).toBe(true);
    expect(pending.roll.terms.some((t) => t.label === 'Charge (d4)')).toBe(true);
    const cards = server.shared.chat.history().filter((m) => m.type === 'roll').map((m) => m.roll.title);
    expect(cards).toEqual(['Stance roll', 'Weapon Attack Roll']);
    expect(texts().some((t) => /Mira uses the Charge Stance: rolled -?\d+, band/.test(t))).toBe(true);
    // The Stance roll is d20 + Stances Mastery + Experience Modifier.
    const stanceCard = server.shared.chat.history().find((m) => m.roll?.title === 'Stance roll');
    expect(stanceCard.roll.terms.map((t) => t.label)).toEqual(['Mastery: Stances', 'Experience Modifier']);
  });

  it('the range check ignores the band, and no Stance is rolled while the player is still deciding', async () => {
    const { g, p, id } = await fight();
    await g.call('stance:save', { id: 'base:aries', stance: { learned: [id] } });
    const item = (await g.call('sheet:list', { characterId: id, list: 'items', action: 'add', name: 'Spear', weapon: { range: 0 } })).sheet.items[0];
    const first = await attack(p, id, { stance: 'base:aries', weapon: { kind: 'item', itemId: item.id } });
    expect(first.needsConfirm).toBeTruthy();
    expect(server.shared.chat.history().filter((m) => m.type === 'roll')).toHaveLength(0);
  });
});
