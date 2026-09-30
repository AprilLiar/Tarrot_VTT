import { normalizeWeapon, normalizeEnhancement } from './arcane.js';
import * as D from './rules-data.js';

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

export const MAX_STONES_IN_SCHEME = 24;
export const MAX_STONE_COUNT = 99;
export const MAX_NOTE = 500;
export const MAX_SPELLS = 200;
export const RUNES = ['1', '2', '3']; // placeholder Spell Fine Tuning
export const STABILIZATION_START = 10;
export const STABILIZATION_STEP = 3;
export const TATTOO_STATUS = 'blood_oxydization';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// { stones: [{ id, sign, note }], arrows: [{ from, to }] }. A stone's place in the table follows from its
// type (Bases in one row, Modifiers and Links one to a row, then the Release) and the order they were added.
export function normalizeScheme(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = new Set();
  const stones = [];
  for (const s of Array.isArray(r.stones) ? r.stones : []) {
    if (stones.length >= MAX_STONES_IN_SCHEME) break;
    const id = typeof s?.id === 'string' ? s.id.slice(0, 20) : '';
    if (!id || ids.has(id) || !SIGNS.includes(s.sign)) continue;
    ids.add(id);
    stones.push({ id, sign: s.sign, note: text(s.note, MAX_NOTE) });
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
  return { stones, arrows };
}

// Where every stone stands: Bases side by side in the top row, then one Modifier or Link to a row (with one
// empty row left under the last), and the Release alone at the bottom. Units are stone cells.
export function layoutScheme(scheme) {
  const bases = scheme.stones.filter((s) => stoneInfo(s.sign).kind === 'base');
  const mids = scheme.stones.filter((s) => ['modifier', 'link'].includes(stoneInfo(s.sign).kind));
  const releases = scheme.stones.filter((s) => stoneInfo(s.sign).kind === 'release');
  const width = Math.max(3, bases.length);
  const pos = new Map();
  bases.forEach((s, i) => pos.set(s.id, { x: ((i + 0.5) * width) / bases.length, y: 0.5, level: 0 }));
  mids.forEach((s, i) => pos.set(s.id, { x: width / 2, y: 1.5 + i, level: 1 + i }));
  const midRows = mids.length + 1; // the empty row
  releases.forEach((s, i) => pos.set(s.id, { x: ((i + 0.5) * width) / releases.length, y: 1 + midRows + 0.5, level: 1 + mids.length }));
  const lanes = [
    { kind: 'base', y: 0, height: 1 },
    { kind: 'mid', y: 1, height: midRows },
    { kind: 'release', y: 1 + midRows, height: 1 },
  ];
  return { pos, width, height: 2 + midRows, lanes };
}

// -> { ok, errors: [message] }  each message is { key, params }; params name stones as { t: 'Virgo' }.
export function validateScheme(rawScheme) {
  const scheme = normalizeScheme(rawScheme);
  const errors = [];
  const add = (key, params) => errors.push({ key, params });
  const kindOf = (s) => stoneInfo(s.sign).kind;
  const nameOf = (s) => ({ t: stoneInfo(s.sign).name });
  const { pos } = layoutScheme(scheme);
  const byId = new Map(scheme.stones.map((s) => [s.id, s]));
  const inn = (id) => scheme.arrows.filter((a) => a.to === id);
  const out = (id) => scheme.arrows.filter((a) => a.from === id);

  if (!scheme.stones.some((s) => kindOf(s) === 'base')) add('Add at least one Base stone.');
  if (scheme.stones.filter((s) => kindOf(s) === 'release').length !== 1) add('Add exactly one Release stone.');

  // Arrows only go down: toward the Release, never up and never sideways.
  for (const a of scheme.arrows) {
    if (pos.get(a.to).level <= pos.get(a.from).level) {
      add('An arrow from {from} to {to} must go down toward the Release, not up or sideways.', { from: nameOf(byId.get(a.from)), to: nameOf(byId.get(a.to)) });
    }
  }
  for (const s of scheme.stones) {
    const kind = kindOf(s);
    const nIn = inn(s.id).length;
    const nOut = out(s.id).length;
    if (kind === 'base' && nIn > 0) add('{stone} is a Base and cannot have an arrow into it.', { stone: nameOf(s) });
    if (kind === 'modifier' && nIn !== 1) add('{stone} is a Modifier and needs exactly one arrow into it.', { stone: nameOf(s) });
    if (kind === 'link' && nIn < 2) add('{stone} is a Link and needs two or more arrows into it.', { stone: nameOf(s) });
    if (kind === 'release' && nIn !== 1) add('The Release needs exactly one arrow into it.');
    if (kind === 'release' && nOut > 0) add('The Release cannot have an arrow leaving it.');
    if (kind !== 'release' && nOut !== 1) add('{stone} needs exactly one arrow leaving it.', { stone: nameOf(s) });
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

export function normalizeDraft(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const runes = Array.isArray(r.runes) && r.runes.length === RUNES.length && RUNES.every((x) => r.runes.includes(x)) ? [...r.runes] : [...RUNES];
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX).trim() || 'Spell',
    description: text(r.description, D.TEXT_MAX),
    scheme: normalizeScheme(r.scheme),
    runes,
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
