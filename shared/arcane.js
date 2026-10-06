import * as D from './rules-data.js';
import { normalizeApply } from './statuses.js';
import { T } from './localization.js';

// Weapons, Enhancements and the attack drafted from them (the Arcane tab). Pure functions shared by the
// server (which makes and applies the attack) and the client (which previews it in the footer), so what
// the footer shows is what gets rolled.

export const DICE_SIDES = [4, 6, 8, 10, 12, 20];
export const MAX_LIST = 10; // statuses, dice and unique effects per weapon or Enhancement
export const MAX_ENHANCEMENTS = 100; // per character, and for everyone
export const MAX_COUNT = 10; // times one Repeatable Enhancement can be used in one attack
export const MAX_AP_COST = 20;
export const DEFAULT_ENHANCEMENT_PREFIX = 'default:';

const isInt = Number.isInteger;
const clampInt = (v, min, max, fallback) => (isInt(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
const isKind = (k) => D.DAMAGE_TYPES.includes(k);

// ---- Normalising (always returns a complete, valid shape) --------------------------------------

// Statuses put on somebody: { key, stacks, duration, dc } (shared/statuses.js). `plain` is for the statuses a character gains by
// itself (an Enhancement's cost): only { key, stacks }, they never need a Save and are Long.
export function normalizeStatuses(raw, { plain = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    const apply = normalizeApply(s);
    if (!apply || seen.has(apply.key) || out.length >= MAX_LIST) continue;
    seen.add(apply.key);
    out.push(plain ? { key: apply.key, stacks: apply.stacks } : apply);
  }
  return out;
}

// A Dice Roll Bonus: a die rolled next to the d20 and added (sign 1) or subtracted (sign -1).
export function normalizeDice(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((d) => DICE_SIDES.includes(d?.sides))
    .slice(0, MAX_LIST)
    .map((d) => ({ sides: d.sides, sign: d.sign === -1 ? -1 : 1 }));
}

// A Unique Effect: a name and a description shown in the chat, never automated.
export function normalizeUnique(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((u) => u && typeof u.name === 'string' && u.name.trim())
    .slice(0, MAX_LIST)
    .map((u) => ({ name: text(u.name, D.NAME_MAX).trim(), text: text(u.text, D.TEXT_MAX) }));
}

export const defaultWeapon = () => ({ base: 1, kind: 'slashing', defence: 'physical', ap: 1, range: null, statuses: [], dice: [], unique: [] });
export const defaultUnarmed = () => ({ ...defaultWeapon(), base: 0, kind: 'bludgeoning' });

export function normalizeWeapon(raw, fallback = defaultWeapon()) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    base: clampInt(r.base, 0, 999, fallback.base),
    kind: isKind(r.kind) ? r.kind : fallback.kind,
    defence: r.defence === 'mental' ? 'mental' : r.defence === 'physical' ? 'physical' : fallback.defence,
    ap: clampInt(r.ap, 0, MAX_AP_COST, fallback.ap),
    range: r.range == null ? null : clampInt(r.range, 0, 999, null),
    statuses: normalizeStatuses(r.statuses),
    dice: normalizeDice(r.dice),
    unique: normalizeUnique(r.unique),
  };
}

const blankEffect = () => ({ damage: 0, range: 0, advantage: 0, statuses: [], dice: [], unique: [] });

// An Enhancement: an augmentation of an attack with a cost and an effect.
//   cost:   ap, damage (taken by the user), statuses (put on the user), item (uses spent from an item)
//   effect: damage (added to the weapon's damage of its own type), range (Spaces), advantage (levels),
//           statuses, dice (Dice Roll Bonuses), unique (Unique Effects)
export function normalizeEnhancement(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const cost = r.cost && typeof r.cost === 'object' ? r.cost : {};
  const eff = r.effect && typeof r.effect === 'object' ? r.effect : {};
  const damage = cost.damage && typeof cost.damage === 'object' && isInt(cost.damage.amount) && cost.damage.amount > 0
    ? { amount: clampInt(cost.damage.amount, 1, 999, 1), kind: D.DAMAGE_TYPES.includes(cost.damage.kind) || cost.damage.kind === 'true' ? cost.damage.kind : 'true' }
    : null;
  const item = cost.item && typeof cost.item === 'object' && typeof cost.item.itemId === 'string' && cost.item.itemId
    ? { itemId: cost.item.itemId, uses: clampInt(cost.item.uses, 1, D.ITEM_USES_MAX, 1) }
    : null;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX, 'Enhancement').trim() || 'Enhancement',
    description: text(r.description, D.TEXT_MAX),
    repeatable: r.repeatable === true,
    cost: { ap: clampInt(cost.ap, 0, MAX_AP_COST, 0), damage, statuses: normalizeStatuses(cost.statuses, { plain: true }), item },
    effect: {
      ...blankEffect(),
      damage: clampInt(eff.damage, -99, 99, 0),
      range: clampInt(eff.range, -99, 99, 0),
      advantage: clampInt(eff.advantage, -10, 10, 0),
      statuses: normalizeStatuses(eff.statuses),
      dice: normalizeDice(eff.dice),
      unique: normalizeUnique(eff.unique),
    },
  };
}

// Available to every character, and not removable.
export const DEFAULT_ENHANCEMENTS = [
  {
    ...normalizeEnhancement({ name: 'Power Attack', description: 'Adds 1 damage of the weapon\'s damage type.', repeatable: true, cost: { ap: 1 }, effect: { damage: 1 } }, `${DEFAULT_ENHANCEMENT_PREFIX}power`),
    origin: 'default',
  },
  {
    ...normalizeEnhancement({ name: 'Precise Attack', description: 'Adds 1 Advantage to the attack.', repeatable: true, cost: { ap: 1 }, effect: { advantage: 1 } }, `${DEFAULT_ENHANCEMENT_PREFIX}precise`),
    origin: 'default',
  },
];

// A spell can be used while it is not destroyed and has uses left (a Spell tattoo has no uses).
const spellUsable = (sp) => !sp.destroyed && (sp.tattoo || sp.uses.current > 0);
export const SPELL_PREFIX = 'spell:';
export const MANIFEST_PREFIX = 'manifest:';

// Every Enhancement a character can pick: the defaults, the global ones, the character's own, and its
// finished spells whose effect is an Enhancement (used like any other, once per attack).
export function enhancementCatalog(globals, sheet) {
  return [
    ...DEFAULT_ENHANCEMENTS,
    ...(globals ?? []).map((e) => ({ ...e, origin: 'global' })),
    ...(sheet?.enhancements ?? []).map((e) => ({ ...e, origin: 'character' })),
    ...(sheet?.spells ?? [])
      .filter((sp) => sp.effect.kind === 'enhancement' && spellUsable(sp))
      .map((sp) => ({ ...sp.effect.enhancement, id: `${SPELL_PREFIX}${sp.id}`, name: sp.name, description: sp.description, repeatable: false, origin: 'spell', spellId: sp.id })),
    ...(sheet?.manifestations ?? [])
      .filter((m) => m.effect.kind === 'enhancement')
      .map((m) => ({ ...m.effect.enhancement, id: `${MANIFEST_PREFIX}${m.id}`, name: m.name, description: m.description, repeatable: false, origin: 'manifestation', manifestationId: m.id })),
  ];
}

// ---- Distance -------------------------------------------------------------------------------------

// Squares between two cells when diagonals alternate 1 and 2 (what the Ruler shows).
export function distanceSquares(a, b) {
  const dx = Math.abs(b.col - a.col);
  const dy = Math.abs(b.row - a.row);
  const diagonals = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonals;
  return straight + diagonals + Math.floor(diagonals / 2);
}

// Spaces between two tokens ({ col, row, size, height }), measured between their centre squares. At the
// same height it is what the Ruler shows; at different heights it is the straight line (Pythagoras,
// 1 height = 1 Space), rounded to the nearest whole Space.
export function tokenDistance(a, b) {
  const centre = (t) => ({ col: t.col + Math.floor(((t.size ?? 1) - 1) / 2), row: t.row + Math.floor(((t.size ?? 1) - 1) / 2) });
  const flat = distanceSquares(centre(a), centre(b));
  const up = Math.abs((a.height ?? 0) - (b.height ?? 0));
  return up === 0 ? flat : Math.round(Math.hypot(flat, up));
}

// ---- Planning an attack ------------------------------------------------------------------------

// The weapon a choice points at: { name, cfg, ... } or null. A spell rolls the Magic Mastery (`mastery`),
// the others the Prime stat.
export function findWeapon(sheet, weapon) {
  if (weapon?.kind === 'manifestation') {
    const m = (sheet.manifestations ?? []).find((x) => x.id === weapon.manifestationId);
    if (m && m.effect.kind === 'weapon') return { name: m.name, cfg: m.effect.weapon, manifestationId: m.id, mastery: 'manifestation' };
    return null;
  }
  if (weapon?.kind === 'spell') {
    const sp = (sheet.spells ?? []).find((x) => x.id === weapon.spellId);
    if (sp && sp.effect.kind === 'weapon' && spellUsable(sp)) return { name: sp.name, cfg: sp.effect.weapon, spellId: sp.id, mastery: 'magic' };
    return null;
  }
  if (weapon?.kind === 'unarmed') return { name: T('Unarmed Attack'), cfg: sheet.unarmed, unarmed: true };
  if (weapon?.kind === 'item') {
    const item = sheet.items.find((i) => i.id === weapon.itemId);
    if (item?.weapon) return { name: item.name, cfg: item.weapon, itemId: item.id };
  }
  return null;
}

// choice: { weapon: { kind: 'unarmed' } | { kind: 'item', itemId } | { kind: 'spell', spellId }, enhancements: [{ id, count }] }
// -> { ok: true, weapon, ap, base, kind, defence, range, advantage, statuses, dice, unique, costs, chosen }
//  | { ok: false, error, params }
// `extras` are effects that join the attack without being chosen from the list: [{ name, effect }], such as the
// band a Stance roll landed in (its effect may also carry a roll `bonus`).
export function planAttack(sheet, catalog, choice, extras = []) {
  const fail = (error, params) => ({ ok: false, error, params });
  const w = findWeapon(sheet, choice?.weapon);
  if (!w) return fail('Choose a weapon first.');

  const picked = [];
  const seen = new Set();
  for (const c of Array.isArray(choice?.enhancements) ? choice.enhancements : []) {
    const e = catalog.find((x) => x.id === c?.id);
    if (!e) return fail('That Enhancement no longer exists.');
    if (seen.has(e.id)) return fail('Each Enhancement is listed once; set how many times to use it.');
    seen.add(e.id);
    const count = c.count ?? 1;
    if (!isInt(count) || count < 1 || count > (e.repeatable ? MAX_COUNT : 1)) {
      return fail('{name} can be used at most {max} times per attack.', { name: e.name, max: e.repeatable ? MAX_COUNT : 1 });
    }
    picked.push({ e, count });
  }

  let ap = w.cfg.ap;
  let base = w.cfg.base;
  let range = w.cfg.range;
  let advantage = 0;
  const statuses = [...w.cfg.statuses.map((s) => ({ ...s }))];
  const dice = w.cfg.dice.map((d) => ({ ...d, source: w.name }));
  const unique = w.cfg.unique.map((u) => ({ ...u, source: w.name }));
  const costs = { damage: [], statuses: [], items: [] };
  const bonuses = [];

  for (const { e, count } of picked) {
    ap += e.cost.ap * count;
    base += e.effect.damage * count;
    if (range != null) range += e.effect.range * count;
    advantage += e.effect.advantage * count;
    for (const s of e.effect.statuses) statuses.push({ ...s });
    for (let i = 0; i < count; i++) for (const d of e.effect.dice) dice.push({ ...d, source: e.name });
    for (const u of e.effect.unique) unique.push({ ...u, source: e.name });
    if (e.cost.damage) costs.damage.push({ amount: e.cost.damage.amount * count, kind: e.cost.damage.kind });
    for (const s of e.cost.statuses) costs.statuses.push({ ...s });
    if (e.cost.item) costs.items.push({ itemId: e.cost.item.itemId, uses: e.cost.item.uses * count });
  }

  for (const x of extras) {
    base += x.effect.damage ?? 0;
    if (range != null) range += x.effect.range ?? 0;
    advantage += x.effect.advantage ?? 0;
    if (x.effect.bonus) bonuses.push({ label: x.name, value: x.effect.bonus });
    for (const st of x.effect.statuses ?? []) statuses.push({ ...st });
    for (const d of x.effect.dice ?? []) dice.push({ ...d, source: x.name });
    for (const u of x.effect.unique ?? []) unique.push({ ...u, source: x.name });
  }

  // Each item must exist and have enough uses left for everything that spends from it.
  const spent = new Map();
  for (const c of costs.items) spent.set(c.itemId, (spent.get(c.itemId) ?? 0) + c.uses);
  for (const [itemId, uses] of spent) {
    const item = sheet.items.find((i) => i.id === itemId);
    if (!item) return fail('An item this Enhancement needs is no longer on the sheet.');
    if (item.uses.current < uses) return fail('{name} has {have} uses left and this attack needs {need}.', { name: item.name, have: item.uses.current, need: uses });
  }
  if (ap > MAX_AP_COST) return fail('That is too much AP for one attack.');

  // The same status from several sources, lasting the same way and with the same DC, adds up (a status that does not stack
  // stays at 1); another Duration or DC stays an application of its own.
  const merged = [];
  for (const s of statuses) {
    const info = D.STATUSES.find((x) => x.key === s.key);
    const have = merged.find((m) => m.key === s.key && m.duration === s.duration && m.dc === s.dc);
    if (have) have.stacks = info.stackable ? Math.min(10, have.stacks + s.stacks) : 1;
    else merged.push({ ...s });
  }

  return {
    ok: true,
    weapon: w,
    ap,
    base: Math.max(0, base),
    kind: w.cfg.kind,
    defence: w.cfg.defence,
    range,
    advantage,
    statuses: merged,
    dice,
    bonuses,
    unique,
    costs,
    chosen: picked.map(({ e, count }) => ({ id: e.id, name: e.name, count })),
    // The spells this attack uses up a little of (durability is checked when the attack is applied).
    manifestationIds: [...(w.manifestationId ? [w.manifestationId] : []), ...picked.filter(({ e }) => e.manifestationId).map(({ e }) => e.manifestationId)],
    spellIds: [...(w.spellId ? [w.spellId] : []), ...picked.filter(({ e }) => e.spellId).map(({ e }) => e.spellId)],
  };
}

// The roll a weapon makes: default weapons and Unarmed use the Prime stat and the Experience Modifier.
export const weaponRoll = () => ({ kind: 'weapon', key: 'prime' });
