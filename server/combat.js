import * as D from '../shared/rules-data.js';
import { apMax, normalizeSheet } from './sheet.js';
import { applyResistance } from '../shared/damage.js';
import { joinMsgs } from '../shared/localization.js';
import { AppError } from './errors.js';

// The combat tracker. The state lives in server memory (`shared.combat`) and is tied to the
// active scene: it is dropped when another scene is activated. Pure functions only, so the rules
// can be tested without a database; the socket handlers do the saving and the chat lines.
//
//   combat = { sceneId, phase: 'rolling' | 'active', round, activeIndex,
//              order: [{ tokenId, ownerKind, ownerId, initiative: number | null }] }
//
// 'rolling': initiative is being rolled (players roll their own, the GM the rest).
// 'active':  the order is fixed (the GM can still reorder) and turns are running.

const isCombatant = (t) => t.kind !== 'prop';

export function newCombat(sceneId, tokens) {
  const order = tokens
    .filter(isCombatant)
    .map((t) => ({ tokenId: t.id, ownerKind: t.ownerKind, ownerId: t.ownerId, initiative: null }));
  if (!order.length) throw new AppError('no_combatants', 'There are no characters on the map to fight.');
  return { sceneId, phase: 'rolling', round: 0, activeIndex: -1, order };
}

export const findEntry = (combat, tokenId) => combat.order.find((e) => e.tokenId === tokenId);

export const activeEntry = (combat) => (combat?.phase === 'active' ? combat.order[combat.activeIndex] ?? null : null);

// Highest first; nobody rolled yet goes last; ties keep their current order.
function sortOrder(order) {
  return order
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.initiative ?? -Infinity) - (a.e.initiative ?? -Infinity) || a.i - b.i)
    .map((x) => x.e);
}

export function setInitiative(combat, tokenId, value) {
  const entry = findEntry(combat, tokenId);
  if (!entry) throw new AppError('not_found', 'That character is not in the combat.');
  if (!Number.isInteger(value) || value < -99 || value > 999) throw new AppError('bad_value', 'Initiative must be a whole number.');
  entry.initiative = value;
  // Once turns are running the order changes only when the GM says so (reorder), never by itself.
}

// Starts the turns: sorts by initiative, round 1, first in the list is up.
export function begin(combat) {
  if (combat.phase !== 'rolling') throw new AppError('bad_phase', 'Combat has already begun.');
  combat.order = sortOrder(combat.order);
  combat.phase = 'active';
  combat.round = 1;
  combat.activeIndex = 0;
}

export function advance(combat) {
  if (combat.phase !== 'active') throw new AppError('bad_phase', 'Combat has not begun.');
  combat.activeIndex += 1;
  if (combat.activeIndex >= combat.order.length) {
    combat.activeIndex = 0;
    combat.round += 1;
  }
}

// The GM's new order: `ids` must be exactly the tokens in the combat. The active one stays active.
export function reorder(combat, ids) {
  if (!Array.isArray(ids) || ids.length !== combat.order.length || new Set(ids).size !== ids.length || !ids.every((id) => findEntry(combat, id))) {
    throw new AppError('bad_order', 'The order must list everyone in the combat exactly once.');
  }
  const active = activeEntry(combat);
  combat.order = ids.map((id) => findEntry(combat, id));
  if (active) combat.activeIndex = combat.order.indexOf(active);
}

export function addCombatant(combat, token) {
  if (!isCombatant(token)) throw new AppError('bad_value', 'Props cannot fight.');
  if (findEntry(combat, token.id)) throw new AppError('already_in_combat', 'That character is already in the combat.');
  combat.order.push({ tokenId: token.id, ownerKind: token.ownerKind, ownerId: token.ownerId, initiative: null });
}

// Removes a combatant. Returns true when it was the active one (the next in line is now up).
export function removeCombatant(combat, tokenId) {
  const i = combat.order.findIndex((e) => e.tokenId === tokenId);
  if (i < 0) return false;
  combat.order.splice(i, 1);
  if (combat.phase !== 'active') return false;
  if (i < combat.activeIndex) combat.activeIndex -= 1;
  else if (i === combat.activeIndex) {
    if (combat.activeIndex >= combat.order.length) {
      combat.activeIndex = 0;
      combat.round += 1;
    }
    return true;
  }
  return false;
}

// Keeps the combat in step with the map: anyone whose token is gone (or became a prop) drops out.
export function reconcile(combat, tokens) {
  const alive = new Set(tokens.filter(isCombatant).map((t) => t.id));
  const gone = combat.order.filter((e) => !alive.has(e.tokenId)).map((e) => e.tokenId);
  let activeRemoved = false;
  for (const id of gone) activeRemoved = removeCombatant(combat, id) || activeRemoved;
  return { gone, activeRemoved };
}

// ---- Damage through the resistance table (shared/damage.js) -------------------------

export { applyResistance };

// ---- Turn start and turn end on a sheet ----------------------------------------------

// Start of a character's turn: Bleeding (true damage) and Burning (fire, through the resistance
// table) hurt, and Stunned X and Surprised lower the AP they start with.
// -> { sheet, lines }  (`lines` are chat messages { key, params }, with the numbers and where they came from)
export function startOfTurn(sheet, name) {
  const next = structuredClone(sheet);
  const lines = [];
  const hurt = (amount, source, detail) => {
    const before = next.hp.current;
    next.hp.current = Math.max(0, before - amount);
    lines.push({
      key: '{name} takes {amount} damage from {source} ({detail}). HP {from} to {to}.',
      params: { name, amount, source, detail, from: before, to: next.hp.current },
    });
  };
  const bleeding = next.statuses?.bleeding ?? 0;
  if (bleeding > 0) hurt(bleeding, { t: `Bleeding ${bleeding}` }, { key: 'true damage' });
  const burning = next.statuses?.burning ?? 0;
  if (burning > 0) {
    const out = applyResistance(next.resistances?.fire, burning);
    const source = { t: `Burning ${burning}` };
    const detail = joinMsgs([{ t: 'Fire' }, ...out.steps]);
    if (out.heal > 0) {
      const before = next.hp.current;
      next.hp.current = Math.min(next.hp.max, before + out.heal);
      lines.push({
        key: '{name} is healed {n} by {source} ({detail}). HP {from} to {to}.',
        params: { name, n: out.heal, source, detail, from: before, to: next.hp.current },
      });
    } else if (out.damage > 0) {
      hurt(out.damage, source, detail);
    } else {
      lines.push({ key: '{name} takes no damage from {source} ({detail}).', params: { name, source, detail } });
    }
  }
  const stunned = next.statuses?.stunned ?? 0;
  const surprised = next.statuses?.surprised ? 2 : 0;
  if (stunned + surprised > 0) {
    const max = apMax(next);
    next.ap.current = Math.max(0, max - stunned - surprised);
    const reasons = [];
    if (stunned) reasons.push({ t: `Stunned ${stunned}` });
    if (surprised) reasons.push({ t: 'Surprised 2' });
    lines.push({
      key: '{name} starts with {ap} AP instead of {max} ({reasons}).',
      params: { name, ap: next.ap.current, max, reasons: joinMsgs(reasons) },
    });
  }
  return { sheet: normalizeSheet(next), lines };
}

// End of a character's turn: AP refilled, Surprised wears off.
export function endOfTurn(sheet) {
  const next = structuredClone(sheet);
  next.ap.current = apMax(next);
  if (next.statuses) delete next.statuses.surprised;
  return normalizeSheet(next);
}

export const SPEED_ROLL = { kind: 'skill', key: 'speed' };
export const INITIATIVE_LABEL = D.SKILLS.find((s) => s.key === 'speed')?.label ?? 'Speed';

// What clients see: the order joined with the tokens they may see (hidden ones are not in `tokens`).
export function combatView(combat, tokens) {
  if (!combat) return null;
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const entries = combat.order
    .filter((e) => byId.has(e.tokenId))
    .map((e) => {
      const t = byId.get(e.tokenId);
      return { tokenId: e.tokenId, ownerKind: e.ownerKind, ownerId: e.ownerId, name: t.name, imageId: t.imageId, kind: t.kind, initiative: e.initiative };
    });
  const active = activeEntry(combat);
  return {
    phase: combat.phase,
    round: combat.round,
    activeTokenId: active && byId.has(active.tokenId) ? active.tokenId : null,
    order: entries,
  };
}
