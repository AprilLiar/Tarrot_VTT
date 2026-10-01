import * as sheets from './sheet.js';
import { AppError } from './errors.js';
import { HELP_SIDES, MAX_HELP } from '../shared/help.js';
import { STABILIZATION_START } from '../shared/spells.js';

// A journal records what one chat card did to the sheets, as deltas (how much each number moved), so that
// Revert can take exactly that away again while keeping everything that happened afterwards:
//   delta = { hp, temp, ap, statuses: { key: n }, stones: { sign: n }, items: { id: n },
//             spells: { id: { stab, uses, destroyed } }, spellsAdded: [id], helpAdded: [sides], helpRemoved: [sides] }
// Only the fields a card can change are tracked.

const diffMap = (a = {}, b = {}) => {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (d) out[k] = d;
  }
  return out;
};

const sumMap = (a = {}, b = {}) => {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const n = (a[k] ?? 0) + (b[k] ?? 0);
    if (n) out[k] = n;
  }
  return out;
};

// The dice in `after` that `before` does not have, and the other way round (as multisets).
function diceDiff(before, after) {
  const left = [...before];
  const added = [];
  for (const d of after) {
    const i = left.indexOf(d);
    if (i >= 0) left.splice(i, 1);
    else added.push(d);
  }
  return { added, removed: left };
}

export function sheetDelta(before, after) {
  const delta = {};
  const num = (key, d) => d && (delta[key] = d);
  num('hp', after.hp.current - before.hp.current);
  num('temp', (after.hp.temp ?? 0) - (before.hp.temp ?? 0));
  num('ap', after.ap.current - before.ap.current);
  const statuses = diffMap(before.statuses, after.statuses);
  if (Object.keys(statuses).length) delta.statuses = statuses;
  const stones = diffMap(before.stones, after.stones);
  if (Object.keys(stones).length) delta.stones = stones;
  const items = {};
  for (const it of after.items) {
    const was = before.items.find((x) => x.id === it.id);
    if (was && it.uses.current !== was.uses.current) items[it.id] = it.uses.current - was.uses.current;
  }
  if (Object.keys(items).length) delta.items = items;
  const spells = {};
  for (const sp of after.spells) {
    const was = before.spells.find((x) => x.id === sp.id);
    if (!was) continue;
    const d = { stab: sp.stabilization - was.stabilization, uses: sp.uses.current - was.uses.current, destroyed: !was.destroyed && !!sp.destroyed };
    if (d.stab || d.uses || d.destroyed) spells[sp.id] = d;
  }
  if (Object.keys(spells).length) delta.spells = spells;
  const added = after.spells.filter((sp) => !before.spells.some((x) => x.id === sp.id)).map((sp) => sp.id);
  if (added.length) delta.spellsAdded = added;
  const help = diceDiff(before.helpDice ?? [], after.helpDice ?? []);
  if (help.added.length) delta.helpAdded = help.added;
  if (help.removed.length) delta.helpRemoved = help.removed;
  return delta;
}

export const isEmpty = (delta) => !delta || Object.keys(delta).length === 0;

// Two deltas of the same character, one after the other.
export function mergeDelta(a = {}, b = {}) {
  const out = { ...a };
  for (const k of ['hp', 'temp', 'ap']) if (b[k]) out[k] = (out[k] ?? 0) + b[k];
  for (const k of ['statuses', 'stones', 'items']) if (b[k]) out[k] = sumMap(a[k], b[k]);
  if (b.spells) {
    out.spells = { ...a.spells };
    for (const [id, d] of Object.entries(b.spells)) {
      const o = out.spells[id] ?? { stab: 0, uses: 0, destroyed: false };
      out.spells[id] = { stab: o.stab + d.stab, uses: o.uses + d.uses, destroyed: o.destroyed || d.destroyed };
    }
  }
  for (const k of ['spellsAdded', 'helpAdded', 'helpRemoved']) if (b[k]) out[k] = [...(a[k] ?? []), ...b[k]];
  for (const k of Object.keys(out)) if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && Object.keys(out[k]).length === 0) delete out[k];
  return out;
}

// The sheet with a delta taken away. A crafted spell is only removed while it is untouched.
export function revertDelta(sheet, delta) {
  const next = structuredClone(sheet);
  if (delta.hp) next.hp.current = Math.max(0, Math.min(next.hp.max, next.hp.current - delta.hp));
  if (delta.temp) next.hp.temp = Math.max(0, (next.hp.temp ?? 0) - delta.temp);
  if (delta.ap) next.ap.current = Math.max(0, next.ap.current - delta.ap);
  for (const [k, d] of Object.entries(delta.statuses ?? {})) {
    const v = (next.statuses?.[k] ?? 0) - d;
    next.statuses = { ...next.statuses };
    if (v > 0) next.statuses[k] = v;
    else delete next.statuses[k];
  }
  for (const [sign, d] of Object.entries(delta.stones ?? {})) next.stones[sign] = Math.max(0, (next.stones[sign] ?? 0) - d);
  for (const [id, d] of Object.entries(delta.items ?? {})) {
    const it = next.items.find((x) => x.id === id);
    if (it) it.uses.current = Math.max(0, Math.min(it.uses.max, it.uses.current - d));
  }
  for (const [id, d] of Object.entries(delta.spells ?? {})) {
    const sp = next.spells.find((x) => x.id === id);
    if (!sp) continue;
    sp.stabilization -= d.stab;
    sp.uses.current = Math.max(0, Math.min(sp.uses.max, sp.uses.current - d.uses));
    if (d.destroyed && sp.uses.current > 0) sp.destroyed = false;
  }
  for (const id of delta.spellsAdded ?? []) {
    const sp = next.spells.find((x) => x.id === id);
    if (!sp) continue;
    if (sp.uses.current !== sp.uses.max || sp.stabilization !== STABILIZATION_START) throw new AppError('cannot_revert', 'The spell {name} has been used since it was crafted, so crafting cannot be reverted.', { name: sp.name });
    next.spells = next.spells.filter((x) => x.id !== id);
  }
  let dice = [...(next.helpDice ?? [])];
  for (const d of delta.helpAdded ?? []) {
    const i = dice.indexOf(d);
    if (i >= 0) dice.splice(i, 1);
  }
  for (const d of delta.helpRemoved ?? []) if (HELP_SIDES.includes(d) && dice.length < MAX_HELP) dice.push(d);
  next.helpDice = dice;
  return sheets.normalizeSheet(next);
}

// A journal for one card: `update(db, characterId, fn)` works like sheets.updateSheet and notes the change.
export function createJournal() {
  const deltas = new Map();
  return {
    deltas,
    async update(db, characterId, fn) {
      let before;
      const after = await sheets.updateSheet(db, characterId, async (s) => {
        before = s;
        return fn(s);
      });
      const d = sheetDelta(before, after);
      if (!isEmpty(d)) deltas.set(characterId, mergeDelta(deltas.get(characterId), d));
      return after;
    },
    empty: () => [...deltas.values()].every(isEmpty),
    toJSON: () => Object.fromEntries(deltas),
  };
}
