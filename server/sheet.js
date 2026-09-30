import { randomUUID } from 'node:crypto';
import * as D from '../shared/rules-data.js';
import { T } from '../shared/localization.js';
import { AppError } from './errors.js';
import { normalizeWeapon, normalizeEnhancement, defaultUnarmed, MAX_ENHANCEMENTS } from '../shared/arcane.js';
import { SIGNS, MAX_STONE_COUNT, MAX_SPELLS, normalizeDraft, normalizeSpell } from '../shared/spells.js';

// The character sheet lives as one JSON document per character
// (characters.sheet). Every write goes through `normalizeSheet`, so a sheet
// read from the database always has the full, valid shape, and adding a field
// later never needs a migration.

const MAX_FEATURES = 200;
const MAX_ITEMS = 500;
const MAX_STATES = 20;

const bad = (message, code = 'bad_value', params) => new AppError(code, message, params);

export const apMax = (sheet) => (sheet.ap.minion ? D.AP_MAX_MINION : D.AP_MAX);

const isInt = (v) => Number.isInteger(v);
const clampInt = (v, min, max, fallback) =>
  isInt(v) ? Math.min(max, Math.max(min, v)) : fallback;

function text(v, max, fallback = '') {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

export function defaultResistance() {
  return { flat: 0, half: false, double: false, immunity: false, consumption: false };
}

function normalizeResistance(r) {
  const out = defaultResistance();
  if (r && typeof r === 'object') {
    out.flat = clampInt(r.flat, -99, 99, 0);
    out.half = r.half === true;
    out.double = r.double === true;
    out.immunity = r.immunity === true;
    out.consumption = r.consumption === true;
  }
  return out;
}

const isDefaultResistance = (r) =>
  r.flat === 0 && !r.half && !r.double && !r.immunity && !r.consumption;

function normalizeItem(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const max = clampInt(r.uses?.max, 1, D.ITEM_USES_MAX, 1);
  const states = Array.isArray(r.states)
    ? [...new Set(r.states.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, D.NAME_MAX)))].slice(
        0,
        MAX_STATES,
      )
    : [];
  return {
    id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
    name: text(r.name, D.NAME_MAX, 'Item').trim() || 'Item',
    description: text(r.description, D.TEXT_MAX),
    uses: { current: clampInt(r.uses?.current, 0, max, max), max },
    states,
    state: states.includes(r.state) ? r.state : '',
    // A Weapon item shows up in the Arcane tab (General); null for an ordinary item.
    weapon: r.weapon && typeof r.weapon === 'object' ? normalizeWeapon(r.weapon) : null,
  };
}

function normalizeFeature(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
    name: text(r.name, D.NAME_MAX, 'Feature').trim() || 'Feature',
    description: text(r.description, D.TEXT_MAX),
  };
}

export function defaultSheet() {
  return normalizeSheet({});
}

export function normalizeSheet(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sheet = {
    ap: { current: 0, minion: r.ap?.minion === true },
    hp: {
      current: clampInt(r.hp?.current, -99, 9999, 0),
      max: clampInt(r.hp?.max, 0, 9999, 0),
    },
    defence: {
      physical: clampInt(r.defence?.physical, 0, 99, 0),
      mental: clampInt(r.defence?.mental, 0, 99, 0),
    },
    experience: clampInt(r.experience, D.EXPERIENCE_MIN, D.EXPERIENCE_MAX, D.EXPERIENCE_MIN),
    // Squares this character can move for 1 AP, and the size of its token (N x N squares).
    movement: clampInt(r.movement, 0, D.MOVEMENT_MAX, D.MOVEMENT_DEFAULT),
    size: clampInt(r.size, 1, D.SIZE_MAX, 1),
    stats: {},
    xDefence: {},
    masteries: {},
    skills: {},
    features: (Array.isArray(r.features) ? r.features : []).slice(0, MAX_FEATURES).map(normalizeFeature),
    items: (Array.isArray(r.items) ? r.items : []).slice(0, MAX_ITEMS).map(normalizeItem),
    // The Unarmed Attack every character has (it can be changed, never removed) and the character's own Enhancements.
    unarmed: normalizeWeapon(r.unarmed, defaultUnarmed()),
    enhancements: (Array.isArray(r.enhancements) ? r.enhancements : []).slice(0, MAX_ENHANCEMENTS).map((e) => normalizeEnhancement(e, randomUUID())),
    // Magic: how many Spell Stones of each sign, the schemes saved as drafts, and the finished spells.
    stones: {},
    spellDrafts: (Array.isArray(r.spellDrafts) ? r.spellDrafts : []).slice(0, MAX_SPELLS).map((d) => normalizeDraft(d, randomUUID())),
    spells: (Array.isArray(r.spells) ? r.spells : []).slice(0, MAX_SPELLS).map((sp) => normalizeSpell(sp, randomUUID())),
    resistances: {},
    statuses: {},
  };
  for (const sign of SIGNS) sheet.stones[sign] = clampInt(r.stones?.[sign], 0, MAX_STONE_COUNT, 0);
  sheet.ap.current = clampInt(r.ap?.current, 0, apMax(sheet), apMax(sheet));
  for (const s of D.STATS) sheet.stats[s] = clampInt(r.stats?.[s], D.STAT_MIN, D.STAT_MAX, 0);
  for (const s of D.SAVE_STATS) sheet.xDefence[s] = clampInt(r.xDefence?.[s], -20, 20, 0);
  for (const m of D.MASTERIES) {
    sheet.masteries[m] = clampInt(r.masteries?.[m], D.MASTERY_MIN, D.MASTERY_MAX, D.MASTERY_MIN);
  }
  for (const sk of D.SKILLS) sheet.skills[sk.key] = clampInt(r.skills?.[sk.key], 0, D.SKILL_TIER_MAX, 0);
  for (const t of D.DAMAGE_TYPES) {
    const res = normalizeResistance(r.resistances?.[t]);
    if (!isDefaultResistance(res)) sheet.resistances[t] = res;
  }
  for (const st of D.STATUSES) {
    const n = clampInt(r.statuses?.[st.key], 0, 99, 0);
    if (n > 0) sheet.statuses[st.key] = st.stackable ? n : 1;
  }
  return sheet;
}

function intIn(value, min, max, what) {
  if (!isInt(value) || value < min || value > max) {
    throw bad('{what} must be a whole number from {min} to {max}.', 'bad_value', { what: { t: what }, min, max });
  }
  return value;
}

// Sets one leaf of the sheet. `character` ({ type }) is needed for NPC-only fields.
export function applySet(sheet, path, value, character) {
  const next = structuredClone(sheet);
  const [a, b] = String(path).split('.');
  const unknownKey = (list) => {
    if (!list.includes(b)) throw bad('Unknown field.', 'bad_path');
  };

  switch (a) {
    case 'ap':
      if (b === 'current') next.ap.current = intIn(value, 0, apMax(next), T('AP'));
      else if (b === 'minion') {
        if (character?.type !== 'npc') throw bad('Only NPCs can be Minions.', 'npc_only');
        if (typeof value !== 'boolean') throw bad('Minion must be true or false.');
        next.ap.minion = value;
        next.ap.current = Math.min(next.ap.current, apMax(next));
      } else throw bad('Unknown field.', 'bad_path');
      break;
    case 'hp':
      if (b === 'current') next.hp.current = intIn(value, -99, 9999, T('HP'));
      else if (b === 'max') next.hp.max = intIn(value, 0, 9999, T('Max HP'));
      else throw bad('Unknown field.', 'bad_path');
      break;
    case 'defence':
      unknownKey(['physical', 'mental']);
      next.defence[b] = intIn(value, 0, 99, T('Defence'));
      break;
    case 'movement':
      next.movement = intIn(value, 0, D.MOVEMENT_MAX, T('Movement'));
      break;
    case 'size':
      next.size = intIn(value, 1, D.SIZE_MAX, T('Size'));
      break;
    case 'experience':
      next.experience = intIn(value, D.EXPERIENCE_MIN, D.EXPERIENCE_MAX, T('Experience Modifier'));
      break;
    case 'stones':
      unknownKey(SIGNS);
      next.stones[b] = intIn(value, 0, MAX_STONE_COUNT, T('Spell Stones'));
      break;
    case 'unarmed':
      if (!value || typeof value !== 'object') throw bad('Invalid weapon.');
      next.unarmed = normalizeWeapon(value, defaultUnarmed());
      break;
    case 'stats':
      unknownKey(D.STATS);
      next.stats[b] = intIn(value, D.STAT_MIN, D.STAT_MAX, T('Stat'));
      break;
    case 'xDefence':
      unknownKey(D.SAVE_STATS);
      next.xDefence[b] = intIn(value, -20, 20, T('Defence'));
      break;
    case 'masteries':
      unknownKey(D.MASTERIES);
      next.masteries[b] = intIn(value, D.MASTERY_MIN, D.MASTERY_MAX, T('Combat Mastery'));
      break;
    case 'skills':
      unknownKey(D.SKILLS.map((s) => s.key));
      next.skills[b] = intIn(value, 0, D.SKILL_TIER_MAX, T('Mastery tier'));
      break;
    case 'resistances': {
      unknownKey(D.DAMAGE_TYPES);
      if (!value || typeof value !== 'object') throw bad('Invalid resistance.');
      const res = normalizeResistance({ ...next.resistances[b], ...value });
      if (value.flat !== undefined) intIn(value.flat, -99, 99, T('Resistance'));
      if (isDefaultResistance(res)) delete next.resistances[b];
      else next.resistances[b] = res;
      break;
    }
    case 'statuses': {
      const st = D.STATUSES.find((s) => s.key === b);
      if (!st) throw bad('Unknown status.', 'bad_path');
      intIn(value, 0, 99, T('Stacks'));
      if (value === 0) delete next.statuses[b];
      else next.statuses[b] = st.stackable ? value : 1;
      break;
    }
    default:
      throw bad('Unknown field.', 'bad_path');
  }
  return normalizeSheet(next);
}

function name(v) {
  if (typeof v !== 'string' || !v.trim()) throw bad('A name is required.', 'bad_name');
  if (v.trim().length > D.NAME_MAX) throw bad('Names can be at most {max} characters.', 'bad_name', { max: D.NAME_MAX });
  return v.trim();
}

const desc = (v) => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length > D.TEXT_MAX) throw bad('Text can be at most {max} characters.', 'bad_value', { max: D.TEXT_MAX });
  return v;
};

function find(list, id) {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw bad('That entry no longer exists.', 'not_found');
  return i;
}

// List edits for features and items. Returns the new sheet.
export function applyList(sheet, list, action, p = {}) {
  const next = structuredClone(sheet);

  if (list === 'features') {
    const arr = next.features;
    if (action === 'add') {
      if (arr.length >= MAX_FEATURES) throw bad('Too many features.', 'limit');
      arr.push({ id: randomUUID(), name: name(p.name), description: desc(p.description) ?? '' });
    } else if (action === 'update') {
      const f = arr[find(arr, p.id)];
      if (p.name !== undefined) f.name = name(p.name);
      if (p.description !== undefined) f.description = desc(p.description);
    } else if (action === 'remove') {
      arr.splice(find(arr, p.id), 1);
    } else throw bad('Unknown action.', 'bad_action');
    return normalizeSheet(next);
  }

  if (list === 'items') {
    const arr = next.items;
    if (action === 'add') {
      if (arr.length >= MAX_ITEMS) throw bad('Too many items.', 'limit');
      const max = p.usesMax === undefined ? 1 : intIn(p.usesMax, 1, D.ITEM_USES_MAX, T('Max uses'));
      arr.push({
        id: randomUUID(),
        name: name(p.name),
        description: desc(p.description) ?? '',
        uses: { current: max, max },
        states: [],
        state: '',
        weapon: p.weapon ? normalizeWeapon(p.weapon) : null,
      });
    } else if (action === 'update') {
      const it = arr[find(arr, p.id)];
      if (p.name !== undefined) it.name = name(p.name);
      if (p.description !== undefined) it.description = desc(p.description);
      if (p.usesMax !== undefined) {
        it.uses.max = intIn(p.usesMax, 1, D.ITEM_USES_MAX, T('Max uses'));
        it.uses.current = Math.min(it.uses.current, it.uses.max);
      }
      if (p.usesCurrent !== undefined) it.uses.current = intIn(p.usesCurrent, 0, it.uses.max, T('Uses'));
      if (p.states !== undefined) {
        if (!Array.isArray(p.states) || p.states.some((s) => typeof s !== 'string')) throw bad('Invalid states.');
        it.states = p.states;
      }
      if (p.state !== undefined) {
        if (typeof p.state !== 'string') throw bad('Invalid state.');
        it.state = p.state;
      }
      if (p.weapon !== undefined) it.weapon = p.weapon ? normalizeWeapon(p.weapon) : null;
    } else if (action === 'use') {
      const it = arr[find(arr, p.id)];
      if (it.uses.current <= 0) throw bad('No uses left.', 'no_uses');
      it.uses.current -= 1;
    } else if (action === 'copy') {
      if (arr.length >= MAX_ITEMS) throw bad('Too many items.', 'limit');
      const i = find(arr, p.id);
      arr.splice(i + 1, 0, { ...structuredClone(arr[i]), id: randomUUID() });
    } else if (action === 'remove') {
      arr.splice(find(arr, p.id), 1);
    } else throw bad('Unknown action.', 'bad_action');
    return normalizeSheet(next);
  }

  if (list === 'enhancements') {
    const arr = next.enhancements;
    if (action === 'add') {
      if (arr.length >= MAX_ENHANCEMENTS) throw bad('Too many Enhancements.', 'limit');
      arr.push(normalizeEnhancement(p.enhancement, randomUUID()));
      arr[arr.length - 1].id = randomUUID();
    } else if (action === 'update') {
      const i = find(arr, p.id);
      arr[i] = { ...normalizeEnhancement(p.enhancement, p.id), id: p.id };
    } else if (action === 'remove') {
      arr.splice(find(arr, p.id), 1);
    } else throw bad('Unknown action.', 'bad_action');
    return normalizeSheet(next);
  }

  if (list === 'spellDrafts') {
    const arr = next.spellDrafts;
    if (action === 'add') {
      if (arr.length >= MAX_SPELLS) throw bad('Too many spells.', 'limit');
      const d = normalizeDraft({ ...p.draft, id: undefined }, randomUUID());
      d.id = randomUUID();
      d.name = name(p.draft?.name);
      arr.push(d);
    } else if (action === 'update') {
      const i = find(arr, p.id);
      name(p.draft?.name);
      arr[i] = { ...normalizeDraft(p.draft, p.id), id: p.id };
    } else if (action === 'remove') {
      arr.splice(find(arr, p.id), 1);
    } else throw bad('Unknown action.', 'bad_action');
    return normalizeSheet(next);
  }

  throw bad('Unknown list.', 'bad_list');
}

// Item transfer helpers: the item leaves one sheet and arrives on another with
// a fresh id (same-named items are distinct, never merged).
export function takeItem(sheet, itemId) {
  const next = structuredClone(sheet);
  const [item] = next.items.splice(find(next.items, itemId), 1);
  return { sheet: normalizeSheet(next), item };
}

export function giveItem(sheet, item) {
  const next = structuredClone(sheet);
  if (next.items.length >= MAX_ITEMS) throw bad('Too many items.', 'limit');
  next.items.push({ ...structuredClone(item), id: randomUUID() });
  return normalizeSheet(next);
}

// ---- Storage --------------------------------------------------------------

const chains = new Map();

// Serialises read-modify-write cycles per character so two devices editing at
// the same moment cannot overwrite each other's change.
export function withLock(id, fn) {
  const prev = chains.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  chains.set(id, tail);
  tail.then(() => {
    if (chains.get(id) === tail) chains.delete(id);
  });
  return run;
}

export async function getSheet(db, id) {
  const r = await db.execute({ sql: 'SELECT sheet FROM characters WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That character no longer exists.');
  let raw = {};
  try {
    raw = JSON.parse(r.rows[0].sheet ?? '{}');
  } catch {}
  return normalizeSheet(raw);
}

export async function saveSheet(db, id, sheet) {
  await db.execute({
    sql: 'UPDATE characters SET sheet = ? WHERE id = ?',
    args: [JSON.stringify(sheet), id],
  });
}

// Read, change, save: returns the saved sheet.
export function updateSheet(db, id, fn) {
  return withLock(id, async () => {
    const next = await fn(await getSheet(db, id));
    await saveSheet(db, id, next);
    return next;
  });
}
