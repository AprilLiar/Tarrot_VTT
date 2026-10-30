import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { validateScheme, stonesNeeded, usesFor, layoutScheme, normalizeScheme, normalizeRows, MAX_CIRCLES, STONES, KINDS, KIND_LABELS } from '../../shared/spells.js';
import { runeSentence } from '../../shared/runes.js';

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

// ---- Spell Circles -----------------------------------------------------------------------------------------------------

const c2 = (id, sign) => ({ id, sign, note: '', circle: 2 });
// good() is Circle 1 (its Aries Release is the special Base of Circle 2); Circle 2 is a Leo Modifier and a Gemini Release.
const twoCircles = () => {
  const g1 = good();
  return { circles: 2, stones: [...g1.stones, c2('m2', 'leo'), c2('r2', 'gemini')], arrows: [...g1.arrows, ar('r', 'm2'), ar('m2', 'r2')] };
};

describe('spell Circles', () => {
  it('everything made before Circles existed is Circle 1', () => {
    const n = normalizeScheme(good());
    expect(n.circles).toBe(1);
    expect(n.stones.every((x) => x.circle === 1)).toBe(true);
    expect(validateScheme(good()).ok).toBe(true);
  });

  it('keeps 1 to 9 Circles, each stone in a Circle that exists, and at most 24 stones in one Circle', () => {
    expect(normalizeScheme({ circles: 99, stones: [] }).circles).toBe(MAX_CIRCLES);
    expect(normalizeScheme({ circles: 0, stones: [] }).circles).toBe(1);
    expect(normalizeScheme({ circles: 2, stones: [{ id: 'a', sign: 'virgo', circle: 7 }, { id: 'b', sign: 'virgo', circle: 'x' }] }).stones.map((x) => x.circle)).toEqual([2, 1]);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, sign: 'virgo', circle: 1 }));
    expect(normalizeScheme({ circles: 2, stones: [...many, c2('z', 'leo')] }).stones).toHaveLength(25); // 24 in Circle 1, 1 in Circle 2
  });

  it('lays the Circles one under the other; the Release of a Circle stands in the Bases row of the next one', () => {
    const { pos, parts, lanes, height } = layoutScheme(twoCircles());
    expect(parts.map((x) => x.circle)).toEqual([1, 2]);
    // Only the last Circle has a Release row: the Release of the one above is the special Base in its Bases row.
    expect(lanes.map((l) => `${l.circle}${l.kind}`)).toEqual(['1base', '1mid', '2base', '2mid', '2release']);
    const basesOf2 = lanes.find((l) => l.circle === 2 && l.kind === 'base');
    expect(pos.get('r').y).toBe(basesOf2.y + 0.5);
    expect(pos.get('m').y).toBeLessThan(pos.get('r').y); // the stones of Circle 1 are above its Release
    expect(pos.get('m2').y).toBeGreaterThan(pos.get('r').y); // and Circle 2's own stones are below it
    expect(pos.get('r2').y).toBeGreaterThan(pos.get('m2').y);
    expect(height).toBe(parts[0].height + parts[1].height);
    // Circle 2's own Bases stand beside the special Base, which comes first.
    const g1 = good();
    const wide = layoutScheme({ circles: 2, stones: [...g1.stones, c2('b3', 'cancer'), c2('r2', 'gemini')], arrows: g1.arrows });
    expect(wide.pos.get('r').y).toBe(wide.pos.get('b3').y);
    expect(wide.pos.get('r').x).toBeLessThan(wide.pos.get('b3').x);
  });

  it('is legal when the Release of a Circle leads into the next one, which needs no Base of its own', () => {
    expect(validateScheme(twoCircles())).toEqual({ ok: true, errors: [] });
    // Circle 2 may also have Bases of its own, met with the special Base in a Link.
    const g1 = good();
    const withBase = { circles: 2, stones: [...g1.stones, c2('b3', 'cancer'), c2('l2', 'libra'), c2('r2', 'gemini')], arrows: [...g1.arrows, ar('r', 'l2'), ar('b3', 'l2'), ar('l2', 'r2')] };
    expect(validateScheme(withBase).ok).toBe(true);
    // The Release of Circle 2 can lead straight from the special Base.
    expect(validateScheme({ circles: 2, stones: [...g1.stones, c2('r2', 'gemini')], arrows: [...g1.arrows, ar('r', 'r2')] }).ok).toBe(true);
  });

  it('says what is wrong with a Circle', () => {
    const g1 = good();
    // The Release of Circle 1 leads nowhere: it has to be the Base of Circle 2.
    expect(reasons({ circles: 2, stones: [...g1.stones, c2('r2', 'gemini')], arrows: g1.arrows })).toContain('The Release of Circle {n} is the Base of the next Circle and needs exactly one arrow leaving it.');
    // A Circle needs its own Release.
    expect(reasons({ circles: 2, stones: [...g1.stones, c2('m2', 'leo')], arrows: [...g1.arrows, ar('r', 'm2')] })).toContain('Circle {n} needs exactly one Release stone.');
    // Only the Release of a Circle leads on: a Modifier of Circle 1 cannot reach into Circle 2.
    const reach = { circles: 2, stones: [...g1.stones, c2('r2', 'gemini')], arrows: [...g1.arrows.filter((a) => a.from !== 'm'), ar('m', 'r2'), ar('r', 'r2')] };
    expect(reasons(reach)).toContain('An arrow from {from} to {to} reaches into another Circle: only the Release of a Circle leads on, into the next one.');
    // A single Circle keeps the messages it always had.
    expect(reasons({ stones: [st('b', 'virgo')], arrows: [] })).toContain('Add exactly one Release stone.');
    // The Release of the top Circle still cannot lead on.
    const back = twoCircles();
    back.arrows.push(ar('r2', 'm2'));
    expect(reasons(back)).toContain('The Release cannot have an arrow leaving it.');
  });

  it('needs the stones of every Circle, and Taurus anywhere gives the extra uses', () => {
    expect(stonesNeeded(twoCircles())).toEqual({ virgo: 2, libra: 1, taurus: 1, aries: 1, leo: 1, gemini: 1 });
    const g = { circles: 2, stones: [st('b', 'virgo'), st('r', 'aries'), c2('t', 'taurus'), c2('r2', 'gemini')], arrows: [] };
    expect(usesFor(g)).toBe(5);
  });

  it('Spell Fine Tuning is one row per Circle; a flat chain is the row of Circle 1', () => {
    expect(normalizeRows(['fire', 'if'], 1)).toEqual([['fire', 'if']]);
    expect(normalizeRows(['fire'], 3)).toEqual([['fire'], [], []]);
    expect(normalizeRows([['fire'], ['if', 'nope']], 2)).toEqual([['fire'], ['if']]);
    expect(normalizeRows([['fire'], ['if'], ['or']], 2)).toEqual([['fire'], ['if']]);
    expect(normalizeRows(undefined, 2)).toEqual([[], []]);
    expect(normalizeRows([], 1)).toEqual([[]]);
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
    expect(d.scheme).toEqual({ circles: 1, stones: [{ id: 'a', sign: 'virgo', note: '', circle: 1 }], arrows: [] });
    expect(d.runes).toEqual([['fire', 'if', 'stone_aries']]); // one row per Circle (a flat chain is the row of Circle 1)
    expect((await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: ' ' } })).ok).toBe(false);
  });
});

describe('crafting a spell of several Circles', () => {
  const addCircles = (s, id, scheme, runes, name = 'Twin') => s.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name, scheme, runes } });

  it('spends the stones of every Circle at once, rolls Magic once per Circle in order, and gives one Circle 2 spell', async () => {
    const { g, p, id } = await setup();
    const draft = (await addCircles(p, id, twoCircles(), [['fire'], ['if', 'then']])).sheet.spellDrafts[0];
    expect(draft).toMatchObject({ runes: [['fire'], ['if', 'then']], scheme: { circles: 2 } });
    // Without the stones of Circle 2 nothing is spent.
    for (const [sign, n] of Object.entries({ virgo: 2, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    expect(await p.call('spell:craft', { characterId: id, draftId: draft.id })).toMatchObject({ ok: false, code: 'not_enough_stones' });
    expect((await sheetOf(g, id)).stones).toMatchObject({ virgo: 2, libra: 1, taurus: 1, aries: 1 });
    for (const [sign, n] of Object.entries({ leo: 1, gemini: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    expect((await p.call('spell:craft', { characterId: id, draftId: draft.id })).ok).toBe(true);
    const sheet = await sheetOf(g, id);
    expect(sheet.stones).toMatchObject({ virgo: 0, libra: 0, taurus: 0, aries: 0, leo: 0, gemini: 0 });
    expect(sheet.spells[0]).toMatchObject({ name: 'Twin', circles: 2, uses: { current: 5, max: 5 }, runes: [['fire'], ['if', 'then']] });
    const titles = server.shared.chat.history().filter((m) => m.type === 'roll').map((m) => m.roll.title);
    expect(titles).toEqual(['Spell crafting, Circle 1 (Magic Roll)', 'Spell crafting, Circle 2 (Magic Roll)']);
  });

  it('refuses a draft whose higher Circle is illegal', async () => {
    const { p, id } = await setup();
    const bad = { circles: 2, stones: [...good().stones, c2('r2', 'gemini')], arrows: good().arrows }; // the Release of Circle 1 leads nowhere
    const draft = (await addCircles(p, id, bad, [])).sheet.spellDrafts[0];
    expect(await p.call('spell:craft', { characterId: id, draftId: draft.id })).toMatchObject({ ok: false, code: 'illegal' });
  });

  it('a spell crafted from a draft that later gets another Circle stays what it was and follows only the rows it has', async () => {
    const { g, p, id } = await setup();
    const draft = (await addCircles(p, id, good(), [['fire']], 'Bolt')).sheet.spellDrafts[0];
    for (const [sign, n] of Object.entries({ virgo: 2, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    await p.call('spell:craft', { characterId: id, draftId: draft.id });
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ circles: 1, runes: [['fire']] });
    // The draft is upgraded in place to two Circles, with a rune row for each.
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: draft.id, draft: { name: 'Bolt', scheme: twoCircles(), runes: [['water'], ['if']] } });
    const sheet = await sheetOf(g, id);
    expect(sheet.spellDrafts[0]).toMatchObject({ scheme: { circles: 2 }, runes: [['water'], ['if']] });
    expect(sheet.spells[0]).toMatchObject({ circles: 1, runes: [['water']] });
  });

  it('a locked Fine Tuning leaves the rows of every Circle where they were', async () => {
    const { g, p, id } = await setup();
    const draft = (await addCircles(p, id, twoCircles(), [['fire'], ['if']])).sheet.spellDrafts[0];
    await g.call('lock:toggle', { key: 'fine_tuning' });
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: draft.id, draft: { name: 'Twin', scheme: twoCircles(), runes: [['x'], ['y']] } });
    expect((await sheetOf(g, id)).spellDrafts[0].runes).toEqual([['fire'], ['if']]);
    await g.call('lock:toggle', { key: 'fine_tuning' });
  });
});

describe('what a Spell Stone says on hover', () => {
  it('every one of the twelve stones has a description and a known kind', () => {
    expect(STONES).toHaveLength(12);
    for (const x of STONES) {
      expect(x.text.trim().length, x.sign).toBeGreaterThan(10);
      expect(KINDS).toContain(x.kind);
      expect(KIND_LABELS[x.kind]).toBeTruthy();
    }
  });
});

describe('the rune chain read as a sentence', () => {
  it('joins the names, a capital letter first and a full stop last', () => {
    expect(runeSentence(['If', 'Fire', 'Then', 'Increase', 'Greater than'])).toBe('If fire then increase greater than.');
    expect(runeSentence(['Если', 'Огонь'])).toBe('Если огонь.');
  });

  it('reads a rune with two names by the first, and says nothing for an empty chain', () => {
    expect(runeSentence(['Force / Strength', 'Increase'])).toBe('Force increase.');
    expect(runeSentence(['Сила / Мощь', 'Огонь'])).toBe('Сила огонь.');
    expect(runeSentence([])).toBe('');
    expect(runeSentence(['', ' '])).toBe('');
  });
});

describe('rune chains', () => {
  it('keeps only known runes, in the order typed, at most 99, and the same rune can repeat', async () => {
    const { p, id } = await setup();
    const many = Array.from({ length: 120 }, (_, i) => (i % 2 ? 'fire' : 'stone_taurus'));
    const d = (await addDraft(p, id, good(), 'Long')).sheet.spellDrafts[0];
    const r = await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: d.id, draft: { name: 'Long', scheme: good(), runes: ['if', 'nope', 'if', 7, 'stone_leo', ...many] } });
    const runes = r.sheet.spellDrafts[0].runes[0];
    expect(runes).toHaveLength(99);
    expect(runes.slice(0, 3)).toEqual(['if', 'if', 'stone_leo']);
    expect(runes.every((x) => typeof x === 'string' && x !== 'nope')).toBe(true);
    expect(runes).not.toContain('1');
  });

  it('a crafted spell shows the chain of its draft and follows later edits of the draft', async () => {
    const { g, p, id } = await setup();
    const draft = (await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'add', draft: { name: 'Fire Bolt', description: '', scheme: good(), runes: ['fire', 'then', 'stone_aries'] } })).sheet.spellDrafts[0];
    for (const [sign, n] of Object.entries({ virgo: 3, libra: 1, taurus: 1, aries: 1 })) await g.call('sheet:set', { characterId: id, path: `stones.${sign}`, value: n });
    await p.call('spell:craft', { characterId: id, draftId: draft.id });
    expect((await sheetOf(g, id)).spells[0]).toMatchObject({ draftId: draft.id, circles: 1, runes: [['fire', 'then', 'stone_aries']] });
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'update', id: draft.id, draft: { name: 'Fire Bolt', scheme: good(), runes: ['water'] } });
    expect((await sheetOf(g, id)).spells[0].runes).toEqual([['water']]);
    // The spell keeps the last chain when its draft is deleted.
    await p.call('sheet:list', { characterId: id, list: 'spellDrafts', action: 'remove', id: draft.id });
    expect((await sheetOf(g, id)).spells[0].runes).toEqual([['water']]);
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

  it('a Spell tattoo has no uses: a failed Strength Save adds Blood Oxidization instead', async () => {
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
    expect(sheet.statuses.blood_oxidization).toBe(2); // stacks
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
