import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { LOCK_KEYS, redactSheet, stancesLocked, tarotLocked, fineTuningLocked } from '../../shared/locks.js';
import { normalizeSheet } from '../sheet.js';

describe('lock rules', () => {
  it('knows every lockable thing: 3 tabs, 5 parts and one Stance lock per sign', () => {
    expect(LOCK_KEYS).toHaveLength(3 + 5 + 12);
    expect(LOCK_KEYS).toContain('stances:aries');
  });

  it('a locked tab covers the parts inside it', () => {
    expect(tarotLocked(['tab:manifest'])).toBe(true);
    expect(tarotLocked(['manifestations'])).toBe(false);
    expect(fineTuningLocked(['combinations'])).toBe(true);
    expect(fineTuningLocked(['stones'])).toBe(false);
    expect(stancesLocked(['stances:leo'], 'leo')).toBe(true);
    expect(stancesLocked(['stances:leo'], 'aries')).toBe(false);
    expect(stancesLocked(['tab:stances'], 'aries')).toBe(true);
  });

  it('empties what is locked in a sheet, and only that', () => {
    const sheet = normalizeSheet({ stones: { virgo: 3 }, spellDrafts: [{ name: 'A', runes: ['life', 'if', 'stone_leo'] }], spells: [{ name: 'S' }], tarot: { cards: [{ id: 'c', name: 'Fool' }], active: 'c' }, manifestations: [{ name: 'Gift' }] });
    expect(redactSheet(sheet, [])).toBe(sheet);
    const a = redactSheet(sheet, ['stones', 'tarot', 'manifestations']);
    expect(a.stones.virgo).toBe(0);
    expect(a.tarot).toEqual({ cards: [], active: null });
    expect(a.manifestations).toEqual([]);
    expect(a.spellDrafts).toHaveLength(1);
    expect(redactSheet(sheet, ['fine_tuning']).spellDrafts[0].runes).toEqual([]);
    const magic = redactSheet(sheet, ['tab:magic']);
    expect(magic).toMatchObject({ spells: [], spellDrafts: [] });
    expect(magic.stones.virgo).toBe(0);
    expect(sheet.stones.virgo).toBe(3); // the stored sheet is never changed
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
    ['DELETE FROM battle_tokens', 'DELETE FROM battle_marks', 'DELETE FROM stage_summons', 'DELETE FROM pictures', 'DELETE FROM scenes', 'DELETE FROM temp_npcs', 'DELETE FROM images', 'DELETE FROM characters', 'DELETE FROM arcane_enhancements', 'DELETE FROM stances', 'DELETE FROM stance_vibes', 'DELETE FROM arcane_locks', "UPDATE scene_state SET active_scene_id = NULL, mode = 'scene'"],
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
const sheetOf = async (s, id) => (await s.call('sheet:get', { characterId: id })).sheet;

async function setup() {
  const g = await gm();
  const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
  const p = await player(id);
  return { g, p, id };
}
const st = (id, sign) => ({ id, sign, note: '' });
const good = () => ({
  stones: [st('b1', 'virgo'), st('l', 'leo'), st('r', 'aries')],
  arrows: [{ from: 'b1', to: 'l' }, { from: 'l', to: 'r' }],
});
const seenPending = (g) => new Promise((resolve) => g.once('attack:pending', resolve));

describe('locks', () => {
  it('everyone can read them, only the GM flips them, and everyone hears about it', async () => {
    const { g, p } = await setup();
    expect((await p.call('lock:list')).locks).toEqual([]);
    expect(await p.call('lock:toggle', { key: 'stones' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('lock:toggle', { key: 'nope' })).toMatchObject({ ok: false, code: 'bad_value' });
    const heard = new Promise((resolve) => p.once('locks:changed', resolve));
    expect((await g.call('lock:toggle', { key: 'stones' })).locks).toEqual(['stones']);
    expect((await heard).locks).toEqual(['stones']);
    expect((await g.call('lock:toggle', { key: 'stones' })).locks).toEqual([]);
  });

  it('a player gets a sheet with the locked parts emptied; the GM still sees everything', async () => {
    const { g, p, id } = await setup();
    await g.call('sheet:set', { characterId: id, path: 'stones.virgo', value: 4 });
    await g.call('tarot:add', { characterId: id, card: { name: 'Fool', description: 'Begin.' } });
    await g.call('lock:toggle', { key: 'stones' });
    await g.call('lock:toggle', { key: 'tarot' });
    const seen = await sheetOf(p, id);
    expect(seen.stones.virgo).toBe(0);
    expect(seen.tarot.cards).toEqual([]);
    const full = await sheetOf(g, id);
    expect(full.stones.virgo).toBe(4);
    expect(full.tarot.cards).toHaveLength(1);
    // The live update the player's devices get is emptied too.
    const update = new Promise((resolve) => p.once('sheet:updated', resolve));
    await g.call('sheet:set', { characterId: id, path: 'hp.max', value: 12 });
    const u = await update;
    expect(u.sheet.hp.max).toBe(12);
    expect(u.sheet.stones.virgo).toBe(0);
  });

  it('a player cannot change locked stones or drafts, but the GM can', async () => {
    const { g, p, id } = await setup();
    await g.call('lock:toggle', { key: 'stones' });
    expect(await p.call('sheet:set', { characterId: id, path: 'stones.virgo', value: 1 })).toMatchObject({ ok: false, code: 'locked' });
    expect((await g.call('sheet:set', { characterId: id, path: 'stones.virgo', value: 1 })).ok).toBe(true);
    await g.call('lock:toggle', { key: 'stones' });
    await g.call('lock:toggle', { key: 'combinations' });
    expect(await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'X', scheme: good() } })).toMatchObject({ ok: false, code: 'locked' });
    expect((await g.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'X', scheme: good() } })).ok).toBe(true);
  });

  it('a locked Fine Tuning keeps the runes where they were', async () => {
    const { g, p, id } = await setup();
    const draft = (await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'X', scheme: good(), runes: ['if', 'then', 'or'] } })).sheet.spellDrafts[0];
    await g.call('lock:toggle', { key: 'fine_tuning' });
    const r = await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: draft.id, draft: { name: 'Y', scheme: good(), runes: ['or', 'then', 'if'] } });
    expect(r.ok).toBe(true);
    expect((await sheetOf(g, id)).spellDrafts[0]).toMatchObject({ name: 'Y', runes: ['if', 'then', 'or'] });
  });

  it('a locked Magic tab stops crafting, and a locked Stance stops attacks that use it', async () => {
    const { g, p, id } = await setup();
    for (const sign of ['virgo', 'leo', 'aries']) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: 1 });
    const draft = (await g.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'Bolt', scheme: good() } })).sheet.spellDrafts[0];
    await g.call('lock:toggle', { key: 'tab:magic' });
    expect(await p.call('spell:craft', { characterId: id, draftId: draft.id })).toMatchObject({ ok: false, code: 'locked' });
    expect((await g.call('spell:craft', { characterId: id, draftId: draft.id })).ok).toBe(true);
    const spell = (await sheetOf(g, id)).spells[0];
    expect(await p.call('spell:update', { characterId: id, id: spell.id, patch: { name: 'Z' } })).toMatchObject({ ok: false, code: 'locked' });
    expect((await sheetOf(p, id)).spells).toEqual([]);

    // Stances: hidden from the player's list and refused in an attack while their sign is locked.
    await g.call('stance:save', { id: 'base:aries', stance: { learned: [id] } });
    expect((await p.call('stance:list')).stances.some((s) => s.sign === 'aries')).toBe(true);
    await g.call('lock:toggle', { key: 'stances:aries' });
    expect((await p.call('stance:list')).stances.some((s) => s.sign === 'aries')).toBe(false);
    expect((await g.call('stance:list')).stances.some((s) => s.sign === 'aries')).toBe(true);
  });
});

describe('Tarot Cards', () => {
  it('only the GM makes them; the first is active and a player can swap', async () => {
    const { g, p, id } = await setup();
    expect(await p.call('tarot:add', { characterId: id, card: { name: 'X' } })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('tarot:add', { characterId: id, card: { name: ' ' } })).toMatchObject({ ok: false, code: 'bad_name' });
    await g.call('tarot:add', { characterId: id, card: { name: 'Fool', description: 'A leap.' } });
    await g.call('tarot:add', { characterId: id, card: { name: 'Tower' } });
    let tarot = (await sheetOf(p, id)).tarot;
    expect(tarot.cards.map((c) => c.name)).toEqual(['Fool', 'Tower']);
    expect(tarot.active).toBe(tarot.cards[0].id);
    expect((await p.call('tarot:swap', { characterId: id, id: tarot.cards[1].id })).ok).toBe(true);
    tarot = (await sheetOf(p, id)).tarot;
    expect(tarot.active).toBe(tarot.cards[1].id);
    expect(await p.call('tarot:swap', { characterId: id, id: 'nope' })).toMatchObject({ ok: false, code: 'not_found' });
    await g.call('lock:toggle', { key: 'tarot' });
    expect(await p.call('tarot:swap', { characterId: id, id: tarot.cards[0].id })).toMatchObject({ ok: false, code: 'locked' });
  });

  it('the GM transfers a card to another character, and deleting the active card clears it', async () => {
    const { g, id } = await setup();
    const other = (await g.call('character:create', { name: 'Bram', type: 'npc' })).id;
    await g.call('tarot:add', { characterId: id, card: { name: 'Fool' } });
    await g.call('tarot:add', { characterId: id, card: { name: 'Tower' } });
    const [fool, tower] = (await sheetOf(g, id)).tarot.cards;
    expect((await g.call('tarot:transfer', { fromId: id, toId: id, id: fool.id })).ok).toBe(false);
    expect((await g.call('tarot:transfer', { fromId: id, toId: other, id: fool.id })).ok).toBe(true);
    expect((await sheetOf(g, id)).tarot).toMatchObject({ cards: [{ name: 'Tower' }], active: null });
    expect((await sheetOf(g, other)).tarot.cards.map((c) => c.name)).toEqual(['Fool']);
    await g.call('tarot:update', { characterId: id, id: tower.id, card: { name: 'Star', description: 'Hope.' } });
    expect((await sheetOf(g, id)).tarot.cards[0]).toMatchObject({ name: 'Star', description: 'Hope.' });
    await g.call('tarot:swap', { characterId: id, id: tower.id });
    await g.call('tarot:remove', { characterId: id, id: tower.id });
    expect((await sheetOf(g, id)).tarot).toEqual({ cards: [], active: null });
  });
});

describe('Manifestations', () => {
  const add = (g, id, extra = {}) => g.call('manifestation:add', { characterId: id, manifestation: { name: 'Sunbrand', description: 'A god\'s gift', effect: { kind: 'weapon', weapon: { base: 5, kind: 'fire', ap: 2 } }, ...extra } });

  async function fight() {
    const ctx = await setup();
    const { g, p, id } = ctx;
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
    return ctx;
  }

  it('only the GM makes them', async () => {
    const { g, p, id } = await setup();
    expect(await p.call('manifestation:add', { characterId: id, manifestation: { name: 'X' } })).toMatchObject({ ok: false, code: 'forbidden' });
    const m = (await add(g, id)).sheet.manifestations[0];
    expect(m).toMatchObject({ name: 'Sunbrand', effect: { kind: 'weapon', weapon: { base: 5, kind: 'fire' } } });
    await g.call('manifestation:update', { characterId: id, id: m.id, manifestation: { name: 'Moonbrand', effect: { kind: 'enhancement', enhancement: { effect: { damage: 2 } } } } });
    expect((await sheetOf(p, id)).manifestations[0]).toMatchObject({ name: 'Moonbrand', effect: { kind: 'enhancement' } });
    await g.call('manifestation:remove', { characterId: id, id: m.id });
    expect((await sheetOf(g, id)).manifestations).toEqual([]);
  });

  it('a Manifestation weapon rolls the Manifest Mastery; an Enhancement one joins the attack', async () => {
    const { g, p, id } = await fight();
    const weapon = (await add(g, id)).sheet.manifestations[0];
    let seen = seenPending(g);
    expect((await p.call('attack:roll', { characterId: id, weapon: { kind: 'manifestation', manifestationId: weapon.id }, enhancements: [] })).ok).toBe(true);
    let pending = await seen;
    expect(pending).toMatchObject({ weaponName: 'Sunbrand', base: 5, kind: 'fire', ap: 2 });
    expect(pending.roll.title).toBe('Manifest attack');
    expect(pending.roll.terms.some((t) => t.label === 'Mastery: Manifest')).toBe(true);
    await g.call('attack:cancel', { id: pending.id });

    const boon = (await add(g, id, { name: 'Boon', effect: { kind: 'enhancement', enhancement: { cost: { ap: 1 }, effect: { damage: 3 } } } })).sheet.manifestations[1];
    seen = seenPending(g);
    await p.call('attack:roll', { characterId: id, weapon: { kind: 'unarmed' }, enhancements: [{ id: `manifest:${boon.id}`, count: 1 }] });
    pending = await seen;
    expect(pending).toMatchObject({ weaponName: 'Unarmed Attack', ap: 2, base: 3 });
    expect(pending.enhancements).toEqual([{ name: 'Boon', count: 1 }]);
  });

  it('a locked Manifest tab stops a player from using them; the GM is not held back', async () => {
    const { g, p, id } = await fight();
    const weapon = (await add(g, id)).sheet.manifestations[0];
    await g.call('lock:toggle', { key: 'manifestations' });
    expect(await p.call('attack:roll', { characterId: id, weapon: { kind: 'manifestation', manifestationId: weapon.id }, enhancements: [] })).toMatchObject({ ok: false, code: 'locked' });
    expect((await sheetOf(p, id)).manifestations).toEqual([]);
    const seen = seenPending(g);
    expect((await g.call('attack:roll', { characterId: id, weapon: { kind: 'manifestation', manifestationId: weapon.id }, enhancements: [] })).ok).toBe(true);
    await seen;
  });

  it('a locked Zodiac stops attacks with its Stance, and a locked Magic tab those with a spell', async () => {
    const { g, p, id } = await fight();
    await g.call('stance:save', { id: 'base:aries', stance: { learned: [id] } });
    await g.call('lock:toggle', { key: 'stances:aries' });
    expect(await p.call('attack:roll', { characterId: id, weapon: { kind: 'unarmed' }, enhancements: [], stance: 'base:aries' })).toMatchObject({ ok: false, code: 'locked' });
    await g.call('lock:toggle', { key: 'stances:aries' });
    const spell = (await g.call('spell:grant', { characterId: id, spell: { name: 'Ember', effect: { kind: 'weapon', weapon: { base: 2, kind: 'fire' } } } })).sheet.spells[0];
    await g.call('lock:toggle', { key: 'tab:magic' });
    expect(await p.call('attack:roll', { characterId: id, weapon: { kind: 'spell', spellId: spell.id }, enhancements: [] })).toMatchObject({ ok: false, code: 'locked' });
  });
});
