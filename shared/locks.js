import { SIGNS } from './spells.js';

// What the GM can lock in the Arcane tab (see the README). A lock is one setting for everyone and applies to
// player characters only: the GM (and every NPC, which the GM controls) sees everything.
export const TAB_LOCKS = ['tab:magic', 'tab:stances', 'tab:manifest'];
export const PART_LOCKS = ['tarot', 'manifestations', 'stones', 'combinations', 'fine_tuning', ...SIGNS.map((s) => `stances:${s}`)];
export const LOCK_KEYS = [...TAB_LOCKS, ...PART_LOCKS];
export const isLockKey = (k) => LOCK_KEYS.includes(k);

const has = (locks, key) => locks.includes(key);

// The parts of the Arcane tab a player cannot use, given the list of lock keys.
export const magicLocked = (locks) => has(locks, 'tab:magic');
export const stonesLocked = (locks) => magicLocked(locks) || has(locks, 'stones');
export const combinationsLocked = (locks) => magicLocked(locks) || has(locks, 'combinations');
export const fineTuningLocked = (locks) => combinationsLocked(locks) || has(locks, 'fine_tuning');
export const stancesLocked = (locks, sign) => has(locks, 'tab:stances') || (sign != null && has(locks, `stances:${sign}`));
export const tarotLocked = (locks) => has(locks, 'tab:manifest') || has(locks, 'tarot');
export const manifestationsLocked = (locks) => has(locks, 'tab:manifest') || has(locks, 'manifestations');

// The sheet as a player may see it: what is locked is emptied (the client shows a blurred picture instead).
export function redactSheet(sheet, locks) {
  if (!locks.length) return sheet;
  const out = { ...sheet };
  if (stonesLocked(locks)) out.stones = Object.fromEntries(Object.keys(sheet.stones).map((k) => [k, 0]));
  if (combinationsLocked(locks)) out.spellDrafts = [];
  if (fineTuningLocked(locks)) {
    if (!combinationsLocked(locks)) out.spellDrafts = sheet.spellDrafts.map((d) => ({ ...d, runes: [] }));
    out.spells = sheet.spells.map((sp) => ({ ...sp, runes: [] }));
  }
  if (magicLocked(locks)) out.spells = [];
  if (tarotLocked(locks)) out.tarot = { cards: [], active: null };
  if (manifestationsLocked(locks)) out.manifestations = [];
  return out;
}
