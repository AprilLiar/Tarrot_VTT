import { normalizeWeapon, normalizeEnhancement } from './arcane.js';
import * as D from './rules-data.js';
import { normalizeChain } from './runes.js';

// Spell Stones, spell schemes, and the rules for a legal scheme. Shared by the server (which checks a
// scheme before crafting) and the client (which draws and checks it as the player builds it).

export const KINDS = ['base', 'modifier', 'link', 'release'];
export const KIND_LABELS = { base: 'Base', modifier: 'Modifier', link: 'Link', release: 'Release' };
// Ring colours of the stones, and the tints of the table's lanes.
export const KIND_COLORS = { base: '#a21caf', modifier: '#22c7d6', link: '#4f46e5', release: '#e11d74' };

// The glyph is followed by U+FE0E so phones draw it as plain text, not as a coloured emoji.
export const STONES = [
  { sign: 'cancer', name: 'Cancer', kind: 'base', glyph: '♋︎', text: 'Records an emotional phenomenon and feelings.' },
  { sign: 'virgo', name: 'Virgo', kind: 'base', glyph: '♍︎', text: 'Records a physical phenomenon.' },
  { sign: 'taurus', name: 'Taurus', kind: 'modifier', glyph: '♉︎', text: 'Stabilizes the effect by reducing its power by several Spell Levels, but granting additional uses.' },
  { sign: 'leo', name: 'Leo', kind: 'modifier', glyph: '♌︎', text: 'Creates a positive version of the recorded effect.' },
  { sign: 'scorpio', name: 'Scorpio', kind: 'modifier', glyph: '♏︎', text: 'Makes the effect weaker but longer-lasting.' },
  { sign: 'sagittarius', name: 'Sagittarius', kind: 'modifier', glyph: '♐︎', text: 'Makes the effect weaker but with much greater range.' },
  { sign: 'pisces', name: 'Pisces', kind: 'modifier', glyph: '♓︎', text: 'The effect envelops the mage and makes them immune to it.' },
  { sign: 'libra', name: 'Libra', kind: 'link', glyph: '♎︎', text: 'Combines two different effects, halving the strength of each.' },
  { sign: 'capricorn', name: 'Capricorn', kind: 'link', glyph: '♑︎', text: 'Slightly weakens the effects but lets one act as a catalyst for the other.' },
  { sign: 'aries', name: 'Aries', kind: 'release', glyph: '♈︎', text: 'Aggressive release of the recorded phenomenon.' },
  { sign: 'gemini', name: 'Gemini', kind: 'release', glyph: '♊︎', text: 'Stealthy release suited for traps, but it takes time to charge.' },
  { sign: 'aquarius', name: 'Aquarius', kind: 'release', glyph: '♒︎', text: 'Precise, targeted release that grows stronger the more restrictions are placed on it.' },
];
export const SIGNS = STONES.map((s) => s.sign);
export const stoneInfo = (sign) => STONES.find((s) => s.sign === sign);

export const MAX_STONES_IN_SCHEME = 24; // in one Circle
export const MAX_CIRCLES = 9;
export const MAX_STONE_COUNT = 99;
export const MAX_NOTE = 500;
export const MAX_SPELLS = 200;
export const STABILIZATION_START = 10;
export const STABILIZATION_STEP = 3;
export const TATTOO_STATUS = 'blood_oxidization';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// { circles, stones: [{ id, sign, note, circle }], arrows: [{ from, to }] }. A spell has 1 to MAX_CIRCLES Circles (see the README, "Spell
// Circles"): every stone belongs to one of them (Circle 1 for everything made before Circles existed), and the Release of a Circle is the
// special Base of the next one. A stone's place in the table follows from its Circle, its type (Bases in one row, Modifiers and Links one
// to a row, then the Release) and the order they were added.
export function normalizeScheme(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const circles = Number.isInteger(r.circles) ? Math.min(MAX_CIRCLES, Math.max(1, r.circles)) : 1;
  const ids = new Set();
  const stones = [];
  const perCircle = new Array(circles + 1).fill(0);
  for (const s of Array.isArray(r.stones) ? r.stones : []) {
    const circle = Number.isInteger(s?.circle) ? Math.min(circles, Math.max(1, s.circle)) : 1;
    if (perCircle[circle] >= MAX_STONES_IN_SCHEME) continue;
    const id = typeof s?.id === 'string' ? s.id.slice(0, 20) : '';
    if (!id || ids.has(id) || !SIGNS.includes(s.sign)) continue;
    ids.add(id);
    perCircle[circle]++;
    stones.push({ id, sign: s.sign, note: text(s.note, MAX_NOTE), circle });
  }
  const seen = new Set();
  const arrows = [];
  for (const a of Array.isArray(r.arrows) ? r.arrows : []) {
    if (!ids.has(a?.from) || !ids.has(a?.to) || a.from === a.to) continue;
    const key = `${a.from}>${a.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    arrows.push({ from: a.from, to: a.to });
  }
  return { circles, stones, arrows };
}

export const circleOf = (stone) => (Number.isInteger(stone?.circle) && stone.circle >= 1 ? stone.circle : 1);
export const circlesOf = (scheme) => Math.max(Number.isInteger(scheme?.circles) ? scheme.circles : 1, 1, ...(scheme?.stones ?? []).map(circleOf));

// Where every stone stands: for each Circle (one under the other) the Bases side by side in a row, then one Modifier or Link to a row
// (with one empty row left under the last), and the Release alone at the bottom. Units are stone cells. `parts` gives each Circle's
// rows ({ circle, y, height }); a stone's `level` is its row, and arrows only go to a deeper row.
export function layoutScheme(scheme) {
  const circles = circlesOf(scheme);
  const kindOf = (s) => stoneInfo(s.sign).kind;
  const per = Array.from({ length: circles }, (_, i) => scheme.stones.filter((s) => circleOf(s) === i + 1));
  const width = Math.max(3, ...per.map((stones) => stones.filter((s) => kindOf(s) === 'base').length));
  const pos = new Map();
  const lanes = [];
  const parts = [];
  let row = 0;
  per.forEach((stones, i) => {
    const bases = stones.filter((s) => kindOf(s) === 'base');
    const mids = stones.filter((s) => ['modifier', 'link'].includes(kindOf(s)));
    const releases = stones.filter((s) => kindOf(s) === 'release');
    const top = row;
    bases.forEach((s, j) => pos.set(s.id, { x: ((j + 0.5) * width) / bases.length, y: row + 0.5, level: row }));
    lanes.push({ kind: 'base', y: row, height: 1, circle: i + 1 });
    row += 1;
    mids.forEach((s, j) => pos.set(s.id, { x: width / 2, y: row + 0.5 + j, level: row + j }));
    const midRows = mids.length + 1; // the empty row
    lanes.push({ kind: 'mid', y: row, height: midRows, circle: i + 1 });
    row += midRows;
    releases.forEach((s, j) => pos.set(s.id, { x: ((j + 0.5) * width) / releases.length, y: row + 0.5, level: row }));
    lanes.push({ kind: 'release', y: row, height: 1, circle: i + 1 });
    row += 1;
    parts.push({ circle: i + 1, y: top, height: row - top });
  });
  return { pos, width, height: row, lanes, parts, circles };
}

// -> { ok, errors: [message] }  each message is { key, params }; params name stones as { t: 'Virgo' }.
// With more than one Circle every Circle has to be legal on its own: it needs exactly one Release, and the Release of a Circle is the special
// Base of the next one (exactly one arrow leaves it, into the next Circle). Arrows never reach into a Circle from anywhere else.
export function validateScheme(rawScheme) {
  const scheme = normalizeScheme(rawScheme);
  const errors = [];
  // (named `fail` so the localization scan finds the messages)
  const fail = (key, params) => errors.push({ key, params });
  const kindOf = (s) => stoneInfo(s.sign).kind;
  const nameOf = (s) => ({ t: stoneInfo(s.sign).name });
  const { pos } = layoutScheme(scheme);
  const byId = new Map(scheme.stones.map((s) => [s.id, s]));
  const inn = (id) => scheme.arrows.filter((a) => a.to === id);
  const out = (id) => scheme.arrows.filter((a) => a.from === id);
  const many = scheme.circles > 1;

  for (let c = 1; c <= scheme.circles; c++) {
    const here = scheme.stones.filter((s) => circleOf(s) === c);
    // The first Circle needs a Base of its own; a higher one has the Release of the one below.
    if (c === 1 && !here.some((s) => kindOf(s) === 'base')) fail('Add at least one Base stone.');
    if (here.filter((s) => kindOf(s) === 'release').length !== 1) {
      if (many) fail('Circle {n} needs exactly one Release stone.', { n: c });
      else fail('Add exactly one Release stone.');
    }
  }

  // Arrows only go down: toward the Release, never up and never sideways.
  for (const a of scheme.arrows) {
    if (pos.get(a.to).level <= pos.get(a.from).level) {
      fail('An arrow from {from} to {to} must go down toward the Release, not up or sideways.', { from: nameOf(byId.get(a.from)), to: nameOf(byId.get(a.to)) });
    }
    // A Circle only reaches into the next one, through its Release.
    const from = byId.get(a.from);
    const to = byId.get(a.to);
    const lead = circleOf(to) === circleOf(from) + 1 && kindOf(from) === 'release';
    if (circleOf(from) !== circleOf(to) && !lead) {
      fail('An arrow from {from} to {to} reaches into another Circle: only the Release of a Circle leads on, into the next one.', { from: nameOf(from), to: nameOf(to) });
    }
  }
  for (const s of scheme.stones) {
    const kind = kindOf(s);
    const nIn = inn(s.id).length;
    const nOut = out(s.id).length;
    const top = circleOf(s) === scheme.circles;
    if (kind === 'base' && nIn > 0) fail('{stone} is a Base and cannot have an arrow into it.', { stone: nameOf(s) });
    if (kind === 'modifier' && nIn !== 1) fail('{stone} is a Modifier and needs exactly one arrow into it.', { stone: nameOf(s) });
    if (kind === 'link' && nIn < 2) fail('{stone} is a Link and needs two or more arrows into it.', { stone: nameOf(s) });
    if (kind === 'release' && nIn !== 1) fail('The Release needs exactly one arrow into it.');
    if (kind === 'release' && top && nOut > 0) fail('The Release cannot have an arrow leaving it.');
    if (kind === 'release' && !top && nOut !== 1) fail('The Release of Circle {n} is the Base of the next Circle and needs exactly one arrow leaving it.', { n: circleOf(s) });
    if (kind !== 'release' && nOut !== 1) fail('{stone} needs exactly one arrow leaving it.', { stone: nameOf(s) });
  }
  // Two Bases can only meet in a Link: that follows from a Modifier taking exactly one arrow.
  return { ok: errors.length === 0, errors };
}

// The stones a scheme needs to be crafted: { sign: count }.
export function stonesNeeded(scheme) {
  const need = {};
  for (const s of normalizeScheme(scheme).stones) need[s.sign] = (need[s.sign] ?? 0) + 1;
  return need;
}

export const usesFor = (scheme) => (scheme.stones.some((s) => s.sign === 'taurus') ? 5 : 1);

// ---- What a sheet keeps -------------------------------------------------------------------------------------

// Spell Fine Tuning is one row of runes per Circle: [[Circle 1's runes], [Circle 2's runes], ...]. A flat chain (stored before Circles
// existed) is the row of Circle 1. The result has exactly `circles` rows.
export function normalizeRows(raw, circles) {
  const list = Array.isArray(raw) ? raw : [];
  const rows = list.length && !list.some((x) => Array.isArray(x)) ? [normalizeChain(list)] : list.map((row) => normalizeChain(row));
  while (rows.length < circles) rows.push([]);
  return rows.slice(0, circles);
}

export function normalizeDraft(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const scheme = normalizeScheme(r.scheme);
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX).trim() || 'Spell',
    description: text(r.description, D.TEXT_MAX),
    scheme,
    runes: normalizeRows(r.runes, scheme.circles),
  };
}

// The effect of a finished spell: a Weapon or an Enhancement, in the same shapes as elsewhere.
export function normalizeEffect(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return r.kind === 'enhancement'
    ? { kind: 'enhancement', enhancement: normalizeEnhancement(r.enhancement, id) }
    : { kind: 'weapon', weapon: normalizeWeapon(r.weapon) };
}

export function normalizeSpell(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const circles = Number.isInteger(r.circles) ? Math.min(MAX_CIRCLES, Math.max(1, r.circles)) : 1;
  const tattoo = r.tattoo === true;
  const maxUses = tattoo ? 1 : Math.min(D.ITEM_USES_MAX, Math.max(1, Number.isInteger(r.uses?.max) ? r.uses.max : 1));
  const destroyed = !tattoo && r.destroyed === true;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX).trim() || 'Spell',
    description: text(r.description, D.TEXT_MAX),
    icon: D.DAMAGE_TYPES.includes(r.icon) ? r.icon : 'fire',
    effect: normalizeEffect(r.effect, id),
    uses: { current: destroyed ? 0 : Math.min(maxUses, Math.max(0, Number.isInteger(r.uses?.current) ? r.uses.current : maxUses)), max: maxUses },
    // The Circles of the spell (1 for every spell made before Circles existed), and its Spell Fine Tuning: one row per Circle, the same as
    // the rows of the draft the spell was crafted from (kept in step with them, for the Circles the spell has).
    circles,
    draftId: typeof r.draftId === 'string' && r.draftId ? r.draftId : null,
    runes: normalizeRows(r.runes, circles),
    stabilization: Math.min(999, Math.max(0, Number.isInteger(r.stabilization) ? r.stabilization : STABILIZATION_START)),
    tattoo,
    destroyed,
  };
}

export const usable = (spell) => !spell.destroyed && (spell.tattoo || spell.uses.current > 0);

// Terms the data adds to LOCALIZATION.md (the sign names, the kinds and what each stone does).
export function spellTermKeys() {
  const keys = [];
  for (const s of STONES) keys.push(s.name, s.text);
  for (const k of KINDS) keys.push(KIND_LABELS[k]);
  return keys;
}
