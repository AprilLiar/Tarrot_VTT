import { normalizeStatuses, normalizeDice, normalizeUnique, normalizeCost } from './arcane.js';
import { SIGNS, stoneInfo } from './spells.js';
import * as D from './rules-data.js';

// Stances: one base Stance per Zodiac sign and variations the GM hangs on it as a tree. A Stance is a special
// Enhancement: it needs its own roll, and the result picks a band of its table, whose effect joins the attack.

// The bands of a Stance roll, from the lowest result up.
export const BANDS = [
  { id: 'lt10', label: 'Less than 10', min: -Infinity },
  { id: '10-14', label: '10-14', min: 10 },
  { id: '15-19', label: '15-19', min: 15 },
  { id: '20-24', label: '20-24', min: 20 },
  { id: '25-29', label: '25-29', min: 25 },
  { id: '30+', label: '30 or more', min: 30 },
];
export const MAX_LEARNED = 500;
export const MAX_VARIATIONS = 200;
export const baseId = (sign) => `base:${sign}`;
export const isBaseId = (id) => typeof id === 'string' && id.startsWith('base:') && SIGNS.includes(id.slice(5));

// Short default "vibe" texts of the twelve signs (the GM can replace them; a replaced text is not translated).
export const SIGN_VIBES = {
  aries: 'Bold and headlong: strike first and think later.',
  taurus: 'Patient and unshakable: hold the ground and outlast.',
  gemini: 'Quick and doubled: two moves where others make one.',
  cancer: 'Protective and tidal: feelings shape the fight.',
  leo: 'Proud and radiant: fight as if the world is watching.',
  virgo: 'Precise and careful: every motion is measured.',
  libra: 'Balanced and poised: answer force with force.',
  scorpio: 'Patient and venomous: wait, then strike deep.',
  sagittarius: 'Free and far-reaching: strike from a distance.',
  capricorn: 'Disciplined and enduring: a steady climb, no shortcuts.',
  aquarius: 'Odd and inventive: break the pattern.',
  pisces: 'Fluid and elusive: slip away and give way.',
};

const isInt = Number.isInteger;
const clampInt = (v, min, max, fallback) => (isInt(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);

// The effect of one band: a roll bonus, Advantage levels, Range, extra Damage, statuses, Dice Roll Bonuses and Unique Effects.
export const blankEffect = () => ({ bonus: 0, advantage: 0, range: 0, damage: 0, statuses: [], dice: [], unique: [] });

export function normalizeBandEffect(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    bonus: clampInt(r.bonus, -99, 99, 0),
    advantage: clampInt(r.advantage, -10, 10, 0),
    range: clampInt(r.range, -99, 99, 0),
    damage: clampInt(r.damage, -99, 99, 0),
    statuses: normalizeStatuses(r.statuses),
    dice: normalizeDice(r.dice),
    unique: normalizeUnique(r.unique),
  };
}

// A table: one row per band. A row is { same: false, effect } or { same: true } ("-": the row above still applies).
// The first row can never be "-".
export function normalizeTable(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return BANDS.map((_, i) => {
    const r = rows[i];
    if (i > 0 && r?.same === true) return { same: true };
    return { same: false, effect: normalizeBandEffect(r?.effect) };
  });
}

// The default table of a base Stance: a cumulative +1 roll bonus per band (+1, +2, ... +6).
export const defaultTable = () => BANDS.map((_, i) => ({ same: false, effect: { ...blankEffect(), bonus: i + 1 } }));

export function normalizeStance(raw, fallback) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const learned = [...new Set((Array.isArray(r.learned) ? r.learned : []).filter((n) => isInt(n) && n > 0))].slice(0, MAX_LEARNED);
  return {
    name: text(r.name, D.NAME_MAX, fallback.name).trim() || fallback.name,
    description: text(r.description, D.TEXT_MAX, fallback.description),
    color: typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color.toLowerCase() : fallback.color,
    known: r.known === undefined ? fallback.known : r.known === true,
    learned: r.learned === undefined ? fallback.learned : learned,
    // What using this Stance costs (set by the GM for each unique Stance, not for the whole Zodiac), like an Enhancement's cost.
    cost: r.cost === undefined ? fallback.cost : normalizeCost(r.cost),
    table: r.table === undefined ? fallback.table : normalizeTable(r.table),
  };
}

// What a base Stance is until the GM changes it.
export const defaultBase = (sign) => ({ id: baseId(sign), sign, parentId: null, name: stoneInfo(sign).name, description: '', color: '#ffffff', known: true, learned: [], cost: normalizeCost(null), table: defaultTable() });

// The band a Stance roll total falls in, and the row whose effect applies (a "-" row follows the one above).
// -> { band: index, source: index, effect }
export function resolveBand(table, total) {
  let band = 0;
  BANDS.forEach((b, i) => {
    if (total >= b.min) band = i;
  });
  let source = band;
  while (source > 0 && table[source].same) source -= 1;
  return { band, source, effect: table[source].effect ?? blankEffect() };
}

// Groups a table into merged cells: [{ from, span, effect }] where span counts the "-" rows that follow.
export function groupTable(table) {
  const groups = [];
  table.forEach((row, i) => {
    if (row.same && groups.length) groups[groups.length - 1].span += 1;
    else groups.push({ from: i, span: 1, effect: row.effect ?? blankEffect() });
  });
  return groups;
}

// What a player may see of the Stances: the ones their character knows or has learned, without the list of who
// learned them. `usable` says whether they can attack with it. The GM sees everything.
export function visibleStances(all, characterId) {
  return all
    .filter((s) => s.known || s.learned.includes(characterId))
    .map(({ learned, ...s }) => ({ ...s, usable: learned.includes(characterId) }));
}

// Terms the data adds to LOCALIZATION.md.
export function stanceTermKeys() {
  const keys = ['Stance roll', ...Object.values(SIGN_VIBES)];
  for (const b of BANDS) keys.push(b.label);
  return keys;
}
