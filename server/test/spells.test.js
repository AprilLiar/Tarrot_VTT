import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { validateScheme, stonesNeeded, usesFor, layoutScheme } from '../../shared/spells.js';

const st = (id, sign) => ({ id, sign, note: '' });
const ar = (from, to) => ({ from, to });
// Two Virgo Bases meet in a Libra Link, a Taurus Modifier changes it, an Aries Release lets it go.
const good = () => ({
  stones: [st('b1', 'virgo'), st('b2', 'virgo'), st('l', 'libra'), st('m', 'taurus'), st('r', 'aries')],
  arrows: [ar('b1', 'l'), ar('b2', 'l'), ar('l', 'm'), ar('m', 'r')],
});
const reasons = (scheme) => validateScheme(scheme).errors.map((e) => e.key);

describe('spell schemes', () => {
  it('accepts a legal scheme and counts the stones it needs', () => {
    expect(validateScheme(good())).toEqual({ ok: true, errors: [] });
    expect(stonesNeeded(good())).toEqual({ virgo: 2, libra: 1, taurus: 1, aries: 1 });
    expect(usesFor(good())).toBe(5); // Taurus grants extra uses
    expect(usesFor({ stones: [st('a', 'virgo')] })).toBe(1);
  });

  it('a Base can go straight into a Release', () => {
    expect(validateScheme({ stones: [st('b', 'cancer'), st('r', 'gemini')], arrows: [ar('b', 'r')] }).ok).toBe(true);
  });

  it('needs a Base and exactly one Release', () => {
    expect(reasons({ stones: [], arrows: [] })).toEqual(['Add at least one Base stone.', 'Add exactly one Release stone.']);
    const two = { stones: [st('b', 'virgo'), st('r1', 'aries'), st('r2', 'gemini')], arrows: [ar('b', 'r1'), ar('b', 'r2')] };
    expect(reasons(two)).toContain('Add exactly one Release stone.');
  });

  it('a Link needs two or more arrows in, a Modifier exactly one', () => {
    const lone = { stones: [st('b', 'virgo'), st('l', 'libra'), st('r', 'aries')], arrows: [ar('b', 'l'), ar('l', 'r')] };
    expect(reasons(lone)).toContain('{stone} is a Link and needs two or more arrows into it.');
    const two = { stones: [st('a', 'virgo'), st('b', 'cancer'), st('m', 'leo'), st('r', 'aries')], arrows: [ar('a', 'm'), ar('b', 'm'), ar('m', 'r')] };
    expect(reasons(two)).toContain('{stone} is a Modifier and needs exactly one arrow into it.');
  });

  it('every stone needs exactly one arrow out, and arrows only go down', () => {
    const stray = { stones: [st('a', 'virgo'), st('b', 'cancer'), st('r', 'aries')], arrows: [ar('a', 'r')] };
    expect(reasons(stray)).toContain('{stone} needs exactly one arrow leaving it.');
    const up = { stones: [st('b', 'virgo'), st('m', 'leo'), st('r', 'aries')], arrows: [ar('b', 'r'), ar('r', 'm')] };
    expect(reasons(up)).toContain('An arrow from {from} to {to} must go down toward the Release, not up or sideways.');
  });

  it('lays Bases side by side, one Modifier or Link to a row, and the Release last', () => {
    const { pos, lanes } = layoutScheme(good());
    expect(pos.get('b1').y).toBe(pos.get('b2').y);
    expect(pos.get('b1').x).toBeLessThan(pos.get('b2').x);
    expect(pos.get('l').y).toBeLessThan(pos.get('m').y);
    expect(pos.get('m').y).toBeLessThan(pos.get('r').y);
    expect(lanes.map((l) => l.kind)).toEqual(['base', 'mid', 'release']);
    expect(lanes[1].height).toBe(3); // two stones and one empty row under them
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
    ['DELETE FROM battle_tokens', 'DELETE FROM battle_marks', 'DELETE FROM stage_summons', 'DELETE FROM pictures', 'DELETE FROM scenes', 'DELETE FROM temp_npcs', 'DELETE FROM images', 'DELETE FROM characters', 'DELETE FROM arcane_enhancements', "UPDATE scene_state SET active_scene_id = NULL, mode = 'scene'"],
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
const sheetOf = async (g, id) => (await g.call('sheet:get', { characterId: id })).sheet;
const texts = () => server.shared.chat.history().filter((m) => m.type === 'text' || m.type === 'effects').map((m) => m.text);

async function setup() {
  const g = await gm();
  const id = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
  const p = await player(id);
  return { g, p, id };
}
const addDraft = (s, id, scheme = good(), name = 'Fire Bolt') => s.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name, description: 'A bolt', scheme } });

describe('crafting', () => {
  it('spends the stones, makes a Magic roll and adds a spell with 5 uses because of Taurus', async () => {
    const { g, p, id } = await setup();
    const draft = (await addDraft(p, id)).sheet.spellDrafts[0];
    expect(await p.call('spell:craft', { characterId: id, draftId: draft.id })).toMatchObject({ ok: false, code: 'not_enough_stones' });
    for (const [sign, n] of Object.entries({ virgo: 3, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    const r = await p.call('spell:craft', { characterId: id, draftId: draft.id });
    expect(r.ok).toBe(true);
    const sheet = await sheetOf(g, id);
    expect(sheet.stones).toMatchObject({ virgo: 1, libra: 0, taurus: 0, aries: 0 });
    expect(sheet.spells[0]).toMatchObject({ name: 'Fire Bolt', uses: { current: 5, max: 5 }, stabilization: 10, tattoo: false, destroyed: false });
    expect(sheet.spellDrafts).toHaveLength(1); // the draft stays
    const card = server.shared.chat.history().find((m) => m.type === 'roll');
    expect(card.roll.title).toBe('Spell crafting (Magic Roll)');
    expect(texts().some((t) => /Mira: Crafts Fire Bolt/.test(t))).toBe(true);
  });

  it('reverting the crafting card refunds the stones and removes the spell, unless it was used', async () => {
    const { g, p, id } = await setup();
    const draft = (await addDraft(p, id)).sheet.spellDrafts[0];
    for (const [sign, n] of Object.entries({ virgo: 3, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    await p.call('spell:craft', { characterId: id, draftId: draft.id });
    const card = server.shared.chat.history().find((m) => m.type === 'effects' && m.kind === 'craft');
    expect(card).toMatchObject({ reversible: true, editable: false });
    expect((await g.call('effects:revert', { messageId: card.id })).ok).toBe(true);
    const sheet = await sheetOf(g, id);
    expect(sheet.spells).toHaveLength(0);
    expect(sheet.stones).toMatchObject({ virgo: 3, libra: 1, taurus: 1, aries: 1 });

    // A spell that has been used cannot be un-crafted.
    await p.call('spell:craft', { characterId: id, draftId: draft.id });
    const second = server.shared.chat.history().filter((m) => m.kind === 'craft').at(-1);
    const spell = (await sheetOf(g, id)).spells[0];
    await g.call('spell:update', { characterId: id, id: spell.id, patch: { uses: { current: 4 } } });
    expect(await g.call('effects:revert', { messageId: second.id })).toMatchObject({ ok: false, code: 'cannot_revert' });
    expect((await sheetOf(g, id)).spells).toHaveLength(1);
  });

  it('refuses an illegal scheme, but an illegal draft can still be saved', async () => {
    const { p, id } = await setup();
    const draft = (await addDraft(p, id, { stones: [st('a', 'virgo')], arrows: [] })).sheet.spellDrafts[0];
    expect(await p.call('spell:craft', { characterId: id, draftId: draft.id })).toMatchObject({ ok: false, code: 'illegal' });
  });

  it('keeps the rune order and cleans up a scheme', async () => {
    const { p, id } = await setup();
    const scheme = { stones: [st('a', 'virgo'), st('a', 'leo'), { id: 'x', sign: 'nope' }], arrows: [ar('a', 'ghost')] };
    const d = (await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'X', scheme, runes: ['fire', 'if', 'stone_aries'] } })).sheet.spellDrafts[0];
    expect(d.scheme).toEqual({ stones: [{ id: 'a', sign: 'virgo', note: '' }], arrows: [] });
    expect(d.runes).toEqual(['fire', 'if', 'stone_aries']);
    expect((await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: ' ' } })).ok).toBe(false);
  });
});

describe('rune chains', () => {
  it('keeps only known runes, in the order typed, at most 99, and the same rune can repeat', async () => {
    const { p, id } = await setup();
    const many = Array.from({ length: 120 }, (_, i) => (i % 2 ? 'fire' : 'stone_taurus'));
    const d = (await addDraft(p, id, good(), 'Long')).sheet.spellDrafts[0];
    const r = await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: d.id, draft: { name: 'Long', scheme: good(), runes: ['if', 'nope', 'if', 7, 'stone_leo', ...many] } });
    const runes = r.sheet.spellDrafts[0].runes;
    expect(runes).toHaveLength(99);
    expect(runes.slice(0, 3)).toEqual(['if', 'if', 'stone_leo']);
    expect(runes.every((x) => typeof x === 'string' && x !== 'nope')).toBe(true);
    expect(r.sheet.spellDrafts[0].runes).not.toContain('1');
  });

  it('a crafted spell shows the chain of its draft and follows later edits of the draft', async () => {
    const { g, p, id } = await setup();
    const draft = (await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'Fire Bolt', description: '', scheme: good(), runes: ['fire', 'then', 'stone_aries'] } })).sheet.spellDrafts[0];
    for (const [sign, n] of Object.entries({ virgo: 3, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    await p.call('spell:craft', { characterId: id, draftId: draft.id });
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ draftId: draft.id, runes: ['fire', 'then', 'stone_aries'] });
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: draft.id, draft: { name: 'Fire Bolt', scheme: good(), runes: ['water'] } });
    expect((await sheetOf(g, id)).spells[0].runes).toEqual(['water']);
    // The spell keeps the last chain when its draft is deleted.
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'remove', id: draft.id });
    expect((await sheetOf(g, id)).spells[0].runes).toEqual(['water']);
  });
});

describe('finished spells', () => {
  const grant = (g, id, extra = {}) => g.call('spell:grant', { characterId: id, spell: { name: 'Ember', description: 'Hot', icon: 'fire', effect: { kind: 'weapon', weapon: { base: 4, kind: 'fire', ap: 1 } }, uses: { max: 2 }, ...extra } });

  it('the GM grants spells; the owner edits the effect but not the GM-only fields', async () => {
    const { g, p, id } = await setup();
    const spell = (await grant(g, id)).sheet.spells[0];
    expect(spell).toMatchObject({ name: 'Ember', icon: 'fire', uses: { current: 2, max: 2 } });
    expect(await p.call('spell:grant', { characterId: id, spell: { name: 'X' } })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await p.call('spell:update', { characterId: id, id: spell.id, patch: { tattoo: true } })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await p.call('spell:update', { characterId: id, id: spell.id, patch: { stabilization: 99 } })).toMatchObject({ ok: false, code: 'forbidden' });
    const r = await p.call('spell:update', { characterId: id, id: spell.id, patch: { name: 'Cinder', icon: 'cold', effect: { kind: 'enhancement', enhancement: { name: 'x', effect: { damage: 3 } } } } });
    expect(r.sheet.spells[0]).toMatchObject({ name: 'Cinder', icon: 'cold', effect: { kind: 'enhancement' } });
    const t = await g.call('spell:update', { characterId: id, id: spell.id, patch: { tattoo: true } });
    expect(t.sheet.spells[0]).toMatchObject({ tattoo: true, uses: { max: 1 } });
    expect((await p.call('spell:remove', { characterId: id, id: spell.id })).sheet.spells).toHaveLength(0);
  });

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
    return { ...ctx, foeToken };
  }
  const seenPending = (g) => new Promise((resolve) => g.once('attack:pending', resolve));
  const apply = (g, pending) => g.call('attack:apply', { id: pending.id, total: 20, base: pending.base, kind: pending.kind, ap: pending.ap, statuses: [] });

  it('a spell weapon rolls Magic; when it holds, Stabilization rises by 3', async () => {
    const { g, p, id } = await fight();
    const spell = (await grant(g, id, { stabilization: 0 })).sheet.spells[0];
    const seen = seenPending(g);
    expect((await p.call('attack:roll', { characterId: id, weapon: { kind: 'spell', spellId: spell.id }, enhancements: [] })).ok).toBe(true);
    const pending = await seen;
    expect(pending).toMatchObject({ weaponName: 'Ember', base: 4, kind: 'fire', spells: [spell.id] });
    expect(pending.roll.title).toBe('Magic attack');
    expect(pending.roll.terms.some((t) => t.label === 'Mastery: Magic')).toBe(true);
    await apply(g, pending);
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ stabilization: 3, uses: { current: 2 } });
    expect(server.shared.chat.history().filter((m) => m.type === 'roll').some((m) => m.roll.against?.label === 'Stabilization')).toBe(true);
  });

  it('when it fails the spell loses a use and resets; at 0 uses it is destroyed and cannot be used', async () => {
    const { g, p, id } = await fight();
    const spell = (await grant(g, id, { stabilization: 999, uses: { max: 2 } })).sheet.spells[0];
    const attack = async () => {
      const seen = seenPending(g);
      const r = await p.call('attack:roll', { characterId: id, weapon: { kind: 'spell', spellId: spell.id }, enhancements: [] });
      if (!r.ok) return r;
      const pending = await seen;
      await apply(g, pending);
      await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 4 });
      return r;
    };
    await attack();
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ stabilization: 10, uses: { current: 1 }, destroyed: false });
    await g.call('spell:update', { characterId: id, id: spell.id, patch: { stabilization: 999 } });
    await attack();
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ uses: { current: 0 }, destroyed: true });
    expect(texts().some((t) => /Ember falters and is destroyed/.test(t))).toBe(true);
    expect(await attack()).toMatchObject({ ok: false, code: 'bad_value' }); // no longer a weapon
    expect(await p.call('spell:update', { characterId: id, id: spell.id, patch: { name: 'Again' } })).toMatchObject({ ok: false, code: 'destroyed' });
    expect((await p.call('spell:remove', { characterId: id, id: spell.id })).ok).toBe(true);
  });

  it('a Spell tattoo has no uses: a failed Strength Save adds Blood Oxydization instead', async () => {
    const { g, p, id } = await fight();
    const spell = (await grant(g, id, { tattoo: true, stabilization: 999 })).sheet.spells[0];
    for (let i = 0; i < 2; i++) {
      const seen = seenPending(g);
      await p.call('attack:roll', { characterId: id, weapon: { kind: 'spell', spellId: spell.id }, enhancements: [] });
      await apply(g, await seen);
      await g.call('spell:update', { characterId: id, id: spell.id, patch: { stabilization: 999 } });
      await g.call('sheet:set', { characterId: id, path: 'ap.current', value: 4 });
    }
    const sheet = await sheetOf(g, id);
    expect(sheet.statuses.blood_oxydization).toBe(2); // stacks
    expect(sheet.spells[0]).toMatchObject({ tattoo: true, destroyed: false });
  });

  it('an Enhancement spell adds its effect to a weapon attack', async () => {
    const { g, p, id } = await fight();
    const spell = (await grant(g, id, { effect: { kind: 'enhancement', enhancement: { name: 'ignored', cost: { ap: 1 }, effect: { damage: 3 } } } })).sheet.spells[0];
    const seen = seenPending(g);
    await p.call('attack:roll', { characterId: id, weapon: { kind: 'unarmed' }, enhancements: [{ id: `spell:${spell.id}`, count: 1 }] });
    const pending = await seen;
    expect(pending).toMatchObject({ weaponName: 'Unarmed Attack', ap: 2, base: 3, spells: [spell.id] });
    expect(pending.enhancements).toEqual([{ name: 'Ember', count: 1 }]);
  });
});
