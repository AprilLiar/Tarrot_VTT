import * as D from './rules-data.js';
import { T } from './localization.js';

// Effects: named bundles of modifiers a character can have for a while (a Dodge, a blessing, a curse). They are like
// statuses, but made of "parts" the GM and the players compose freely. This file is the whole system, shared by the
// server (which applies them and works their numbers into rolls, Defences and damage) and the client (which previews them).
//
//   definition (library: the GM's global table and a character's own list):
//     { id, name, description, icon, duration, uses, parts: [part] }
//   instance (on a sheet, `sheet.effects`): the definition's data copied when it was put on, so later edits of the
//     library never change what is already running:
//     { id, defId, name, description, icon, duration, rounds?, uses: { current, max } | null, parts, source }
//
// Parts (the levers):
//   roll     { scope, adv, bonus, dice }   Advantage levels, a flat bonus and Dice Roll Bonuses on the rolls of a scope
//   against  { adv, bonus }                the same on attacks made AGAINST the one who has the Effect
//   defence  { physical, mental }          flat change of Physical / Mental Defence
//   stats    { movement, maxAp, maxHp }    flat change of Movement (squares per AP), maximum AP and maximum HP
//   combat   { damageDealt, damageTaken, crit, dc }
//                                          damage the bearer deals / takes (flat, per instance), the natural roll that is a
//                                          Critical Hit (negative lowers it) and the DC of the Saves the bearer's statuses ask for
//   resist   { kind, mode, flat }          a temporary Resistance to a damage type (flat X, Half, Double, Immunity)
//   grant    { statuses, temp }            statuses put on the bearer, and Temp HP gained, when the Effect starts
//   text     { text }                      a note for the table, never automated

export const MAX_PARTS = 20;
export const MAX_EFFECTS_LIBRARY = 100; // per character, and for everyone
export const MAX_ACTIVE = 50; // effects running on one character
export const MAX_USES = 10;
export const DICE_SIDES = [4, 6, 8, 10, 12, 20];

// How long an Effect lasts (chosen in the library, default Long):
//   turn_end   until the end of the bearer's turn
//   next_turn  until the start of the bearer's next turn (a Dodge)
//   minute     5 rounds, counted at the end of each of the bearer's turns
//   long       until it is removed by hand
export const DURATIONS = ['turn_end', 'next_turn', 'minute', 'long'];
export const DURATION_LABELS = { turn_end: T('Until end of turn'), next_turn: T('Until start of next turn'), minute: T('1 Minute'), long: T('Long') };
export const DEFAULT_DURATION = 'long';
export const EFFECT_ROUNDS = 5;

export const PART_TYPES = ['roll', 'against', 'defence', 'stats', 'combat', 'resist', 'grant', 'text'];
export const PART_LABELS = {
  roll: T('Rolls'),
  against: T('Against the bearer'),
  defence: T('Defence'),
  stats: T('Movement, AP and HP'),
  combat: T('Damage, Crit and DC'),
  resist: T('Resistance'),
  grant: T('Starts with'),
  text: T('Note'),
};

// ---- Scopes: which rolls a `roll` part touches ---------------------------------------------------------------------
// A roll is described by a request { kind: 'attribute'|'save'|'skill'|'mastery'|'weapon', key, attack?, initiative? }:
// `attack` is 'weapon' | 'magic' | 'manifestation' for the attack of the Arcane tab, `initiative` is true for Initiative.
export const SCOPE_GROUPS = ['all', 'attributes', 'saves', 'skills', 'masteries', 'attacks', 'attack:weapon', 'attack:magic', 'attack:manifestation', 'initiative'];
export const SCOPE_GROUP_LABELS = {
  all: T('All rolls'),
  attributes: T('All Attribute rolls'),
  saves: T('All Saves'),
  skills: T('All Skill rolls'),
  masteries: T('All Combat Mastery rolls'),
  attacks: T('All attacks'),
  'attack:weapon': T('Weapon attacks'),
  'attack:magic': T('Magic attacks'),
  'attack:manifestation': T('Manifest attacks'),
  initiative: T('Initiative'),
};
export const SAVE_SCOPE_KEYS = [...D.SAVE_STATS, 'physical', 'mental'];

const stats = () => D.STATS.map((s) => `stat:${s}`);
const saves = () => SAVE_SCOPE_KEYS.map((s) => `save:${s}`);
const skills = () => D.SKILLS.map((s) => `skill:${s.key}`);
const masteries = () => D.MASTERIES.map((m) => `mastery:${m}`);
export const allScopes = () => [...SCOPE_GROUPS, ...stats(), ...saves(), ...skills(), ...masteries()];
export const isScope = (s) => allScopes().includes(s);

export function scopeMatches(scope, req) {
  if (scope === 'all') return true;
  const attack = req.attack ?? null;
  if (scope === 'attributes') return req.kind === 'attribute';
  if (scope === 'saves') return req.kind === 'save';
  if (scope === 'skills') return req.kind === 'skill';
  if (scope === 'masteries') return req.kind === 'mastery' && !attack;
  if (scope === 'attacks') return !!attack;
  if (scope === 'initiative') return !!req.initiative;
  if (scope.startsWith('attack:')) return attack === scope.slice(7);
  const [kind, key] = scope.split(':');
  if (kind === 'stat') return req.kind === 'attribute' && req.key === key;
  if (kind === 'save') return req.kind === 'save' && req.key === key;
  if (kind === 'skill') return req.kind === 'skill' && req.key === key;
  if (kind === 'mastery') return req.kind === 'mastery' && !attack && req.key === key;
  return false;
}

// ---- Normalising ------------------------------------------------------------------------------------------------------

const isInt = Number.isInteger;
const clampInt = (v, min, max, fallback = 0) => (isInt(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);

function normalizeDice(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((d) => DICE_SIDES.includes(d?.sides))
    .slice(0, 10)
    .map((d) => ({ sides: d.sides, sign: d.sign === -1 ? -1 : 1 }));
}

function normalizeGrantStatuses(raw) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    const info = D.STATUSES.find((x) => x.key === s?.key);
    if (!info || seen.has(info.key) || out.length >= 10) continue;
    seen.add(info.key);
    out.push({ key: info.key, stacks: info.stackable ? clampInt(s.stacks, 1, 10, 1) : 1 });
  }
  return out;
}

export function normalizePart(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  switch (r.type) {
    case 'roll':
      return { type: 'roll', scope: isScope(r.scope) ? r.scope : 'all', adv: clampInt(r.adv, -10, 10), bonus: clampInt(r.bonus, -99, 99), dice: normalizeDice(r.dice) };
    case 'against':
      return { type: 'against', adv: clampInt(r.adv, -10, 10), bonus: clampInt(r.bonus, -99, 99) };
    case 'defence':
      return { type: 'defence', physical: clampInt(r.physical, -99, 99), mental: clampInt(r.mental, -99, 99) };
    case 'stats':
      return { type: 'stats', movement: clampInt(r.movement, -99, 99), maxAp: clampInt(r.maxAp, -10, 10), maxHp: clampInt(r.maxHp, -999, 999) };
    case 'combat':
      return {
        type: 'combat',
        damageDealt: clampInt(r.damageDealt, -99, 99),
        damageTaken: clampInt(r.damageTaken, -99, 99),
        crit: clampInt(r.crit, -19, 19),
        dc: clampInt(r.dc, -99, 99),
      };
    case 'resist': {
      const mode = ['flat', 'half', 'double', 'immunity'].includes(r.mode) ? r.mode : 'flat';
      return { type: 'resist', kind: D.DAMAGE_TYPES.includes(r.kind) ? r.kind : D.DAMAGE_TYPES[0], mode, flat: mode === 'flat' ? clampInt(r.flat, -99, 99, 1) : 0 };
    }
    case 'grant':
      return { type: 'grant', statuses: normalizeGrantStatuses(r.statuses), temp: clampInt(r.temp, 0, 999) };
    case 'text':
      return { type: 'text', text: text(r.text, D.TEXT_MAX) };
    default:
      return null;
  }
}

// A part that changes nothing is left out, so a definition only holds what it does.
export function partIsEmpty(p) {
  switch (p.type) {
    case 'roll': return !p.adv && !p.bonus && !p.dice.length;
    case 'against': return !p.adv && !p.bonus;
    case 'defence': return !p.physical && !p.mental;
    case 'stats': return !p.movement && !p.maxAp && !p.maxHp;
    case 'combat': return !p.damageDealt && !p.damageTaken && !p.crit && !p.dc;
    case 'resist': return p.mode === 'flat' && !p.flat;
    case 'grant': return !p.statuses.length && !p.temp;
    case 'text': return !p.text.trim();
    default: return true;
  }
}

export function normalizeParts(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_PARTS).map(normalizePart).filter((p) => p && !partIsEmpty(p));
}

// A library definition. `id` is used when the raw one is missing.
export function normalizeDefinition(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX, 'Effect').trim() || 'Effect',
    description: text(r.description, D.TEXT_MAX),
    icon: typeof r.icon === 'string' && r.icon ? r.icon.slice(0, 40) : '',
    duration: DURATIONS.includes(r.duration) ? r.duration : DEFAULT_DURATION,
    // Optional: how many attacks the Effect lasts for (made against the bearer, or by it, whichever its parts touch).
    uses: r.uses == null || r.uses === '' ? null : clampInt(r.uses, 1, MAX_USES, 1),
    parts: normalizeParts(r.parts),
  };
}

// An instance on a sheet.
export function normalizeInstance(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const def = normalizeDefinition(r, id);
  const max = r.uses && typeof r.uses === 'object' ? clampInt(r.uses.max, 1, MAX_USES, 1) : null;
  return {
    id: def.id,
    defId: typeof r.defId === 'string' ? r.defId : '',
    name: def.name,
    description: def.description,
    icon: def.icon,
    duration: def.duration,
    rounds: def.duration === 'minute' ? clampInt(r.rounds, 1, EFFECT_ROUNDS, EFFECT_ROUNDS) : null,
    uses: max == null ? null : { current: clampInt(r.uses.current, 0, max, max), max },
    parts: def.parts,
    source: text(r.source, D.NAME_MAX),
  };
}

export function normalizeInstances(raw, newId) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_ACTIVE).map((e) => normalizeInstance(e, newId())).filter((e) => !e.uses || e.uses.current > 0);
}

// ---- Putting an Effect on, and taking time off it ----------------------------------------------------------------------

export function instantiate(def, source, newId) {
  const d = normalizeDefinition(def, newId());
  return {
    id: newId(),
    defId: def.id ?? '',
    name: d.name,
    description: d.description,
    icon: d.icon,
    duration: d.duration,
    rounds: d.duration === 'minute' ? EFFECT_ROUNDS : null,
    uses: d.uses == null ? null : { current: d.uses, max: d.uses },
    parts: d.parts,
    source: text(source, D.NAME_MAX),
  };
}

// The same Effect put on again refreshes the running one (its duration and uses start over); it never stacks.
// -> { effects, replaced: instance | null }
export function putEffect(effects, instance) {
  const same = (e) => (instance.defId ? e.defId === instance.defId : e.defId === '' && e.name === instance.name);
  const old = effects.find(same) ?? null;
  const rest = effects.filter((e) => !same(e));
  return { effects: [...rest, instance].slice(-MAX_ACTIVE), replaced: old };
}

// End of the bearer's turn: "until end of turn" ones end, 1 Minute ones lose a round. -> { effects, ended }
export function tickEnd(effects) {
  const ended = [];
  const out = [];
  for (const e of effects) {
    if (e.duration === 'turn_end') ended.push(e);
    else if (e.duration === 'minute') {
      const rounds = (e.rounds ?? EFFECT_ROUNDS) - 1;
      if (rounds <= 0) ended.push(e);
      else out.push({ ...e, rounds });
    } else out.push(e);
  }
  return { effects: out, ended };
}

// Start of the bearer's turn: "until start of next turn" ones end. -> { effects, ended }
export function tickStart(effects) {
  const ended = effects.filter((e) => e.duration === 'next_turn');
  return { effects: effects.filter((e) => e.duration !== 'next_turn'), ended };
}

// ---- What the running Effects do ------------------------------------------------------------------------------------------

const list = (sheet) => (Array.isArray(sheet?.effects) ? sheet.effects : []);

// The statuses a grant part gives, as statuses with the Effect's Duration, for when the Effect is put on.
export const grantDuration = (effect) => (effect.duration === 'minute' ? 'minute' : effect.duration === 'long' ? 'long' : 'round');

// Rolls made BY the bearer. -> { levels: [{ label, levels, id }], terms: [{ label, value }], dice: [{ sides, sign, source }], used: [id] }
// `used` are the Effects with Uses that touched the roll (the caller spends one use of each).
export function rollMods(sheet, req) {
  const out = { levels: [], terms: [], dice: [], used: [] };
  for (const e of list(sheet)) {
    let touched = false;
    for (const p of e.parts) {
      if (p.type !== 'roll' || !scopeMatches(p.scope, req)) continue;
      touched = true;
      if (p.adv) out.levels.push({ label: e.name, levels: p.adv, id: e.id });
      if (p.bonus) out.terms.push({ label: e.name, value: p.bonus });
      for (const d of p.dice) out.dice.push({ sides: d.sides, sign: d.sign, source: e.name });
    }
    if (touched && e.uses) out.used.push(e.id);
  }
  return out;
}

// Attacks made against the bearer: what its Effects add to the ATTACKER's roll.
// -> { levels: [{ label, levels, id }], terms: [{ label, value }], used: [id] }
export function againstMods(sheet) {
  const out = { levels: [], terms: [], used: [] };
  for (const e of list(sheet)) {
    let touched = false;
    for (const p of e.parts) {
      if (p.type !== 'against') continue;
      touched = true;
      if (p.adv) out.levels.push({ label: e.name, levels: p.adv, id: e.id });
      if (p.bonus) out.terms.push({ label: e.name, value: p.bonus });
    }
    if (touched && e.uses) out.used.push(e.id);
  }
  return out;
}

// What the targets of one attack share, so the one roll can take it: the levels and the bonus every target has (the smallest
// in size, same sign), and a note of what only some have. `perTarget` is [{ name, mods }] from againstMods.
// -> { levels: [{ label, levels }], terms: [{ label, value }], notes: [{ name, label }], used: { [targetIndex]: [id] } }
export function sharedAgainst(perTarget) {
  const out = { levels: [], terms: [], notes: [], used: {} };
  if (!perTarget.length) return out;
  const sum = (m) => m.levels.reduce((n, l) => n + l.levels, 0);
  const bonus = (m) => m.terms.reduce((n, t) => n + t.value, 0);
  const share = (pick) => {
    const vals = perTarget.map((t) => pick(t.mods));
    if (vals.every((v) => v > 0)) return Math.min(...vals);
    if (vals.every((v) => v < 0)) return Math.max(...vals);
    return 0;
  };
  const levels = share(sum);
  const terms = share(bonus);
  const names = (t) => t.mods.levels.map((l) => l.label).concat(t.mods.terms.map((x) => x.label));
  if (levels) out.levels.push({ label: [...new Set(perTarget.flatMap(names))].join(', '), levels });
  if (terms) out.terms.push({ label: [...new Set(perTarget.flatMap(names))].join(', '), value: terms });
  for (const t of perTarget) {
    const mine = { levels: sum(t.mods), bonus: bonus(t.mods) };
    if ((mine.levels !== 0 && mine.levels !== levels) || (mine.bonus !== 0 && mine.bonus !== terms)) {
      out.notes.push({ name: t.name, label: [...new Set(names(t))].join(', ') });
    }
  }
  // Uses are only spent where the shared Effect really touched the roll.
  if (out.levels.length || out.terms.length) {
    perTarget.forEach((t, i) => {
      if (t.mods.used.length) out.used[i] = t.mods.used;
    });
  }
  return out;
}

export function defenceMods(sheet) {
  const out = { physical: 0, mental: 0 };
  for (const e of list(sheet)) for (const p of e.parts) if (p.type === 'defence') (out.physical += p.physical, (out.mental += p.mental));
  return out;
}

// The sheet's Defences with the Effects' changes (never below 0).
export const effectiveDefence = (sheet) => {
  const m = defenceMods(sheet);
  return { physical: Math.max(0, sheet.defence.physical + m.physical), mental: Math.max(0, sheet.defence.mental + m.mental) };
};

export function statMods(sheet) {
  const out = { movement: 0, maxAp: 0, maxHp: 0 };
  for (const e of list(sheet)) for (const p of e.parts) if (p.type === 'stats') (out.movement += p.movement, (out.maxAp += p.maxAp), (out.maxHp += p.maxHp));
  return out;
}

export const effectiveMovement = (sheet) => Math.max(0, sheet.movement + statMods(sheet).movement);
export const effectiveMaxHp = (sheet) => Math.max(0, sheet.hp.max + statMods(sheet).maxHp);
// The hp object with the maximum the Effects make of it, for shared/hp.js.
export const hpOf = (sheet) => ({ ...sheet.hp, max: effectiveMaxHp(sheet) });

export function combatMods(sheet) {
  const out = { damageDealt: 0, damageTaken: 0, crit: 0, dc: 0 };
  for (const e of list(sheet)) for (const p of e.parts) if (p.type === 'combat') for (const k of Object.keys(out)) out[k] += p[k];
  return out;
}

// The sheet's resistance record per damage type with the Effects' temporary Resistances laid over it.
export function effectiveResistances(sheet) {
  const base = sheet.resistances ?? {};
  const out = { ...base };
  for (const e of list(sheet)) {
    for (const p of e.parts) {
      if (p.type !== 'resist') continue;
      const r = { flat: 0, half: false, double: false, immunity: false, consumption: false, ...out[p.kind] };
      if (p.mode === 'flat') r.flat += p.flat;
      else if (p.mode === 'half') r.half = true;
      else if (p.mode === 'double') r.double = true;
      else r.immunity = true;
      out[p.kind] = r;
    }
  }
  return out;
}

// Text of the notes of the running Effects, for the sheet and the chat.
export const notesOf = (e) => e.parts.filter((p) => p.type === 'text').map((p) => p.text);
