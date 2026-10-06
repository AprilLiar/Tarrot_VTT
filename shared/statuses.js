import * as D from './rules-data.js';
import { T } from './localization.js';
import { combatMods } from './effects.js';

// Which Save a status asks for when it is put on somebody. Every status not listed asks for a Physical Save.
const MENTAL = ['dazed', 'charmed', 'disoriented', 'doomed', 'frightened', 'intimidated', 'taunted', 'terrified'];
const NONE = ['blood_oxidization', 'fully_concealed', 'half_cover', 'hidden', 'invisible', 'partially_concealed', 'surprised', '3_4_cover', 'unheard', 'unseen'];

// -> 'mental' | 'physical' | null (no Save)
export function statusSave(key) {
  if (NONE.includes(key)) return null;
  return MENTAL.includes(key) ? 'mental' : 'physical';
}

// How long a status lasts (chosen when it is set up):
//   round:    removed when the character it is on ends their turn
//   minute:   5 rounds (counted at the end of each of their turns), each application with its own timer
//   long:     until it is removed by hand
//   repeated: at the end of each of their turns they make the Save against it; passing removes it
export const DURATIONS = ['round', 'minute', 'long', 'repeated'];
export const DURATION_LABELS = { round: T('1 Round'), minute: T('1 Minute'), long: T('Long'), repeated: T('Repeated') };
export const MINUTE_ROUNDS = 5;
export const DC_MIN = 1;
export const DC_MAX = 99;
export const DEFAULT_DURATION = 'long';

export const statusInfo = (key) => D.STATUSES.find((s) => s.key === key) ?? null;

// A status put on somebody, from anywhere: { key, stacks, duration, dc }. `dc` is 'auto' (8 + the source's Experience Modifier + Prime)
// or a number typed by hand. Repeated needs a Save, so a status without one cannot be Repeated.
export function normalizeApply(raw) {
  const info = statusInfo(raw?.key);
  if (!info) return null;
  const save = statusSave(info.key);
  let duration = DURATIONS.includes(raw.duration) ? raw.duration : DEFAULT_DURATION;
  if (duration === 'repeated' && !save) duration = DEFAULT_DURATION;
  const n = Number(raw.stacks);
  const stacks = info.stackable ? Math.max(1, Math.min(10, Number.isInteger(n) ? n : 1)) : 1;
  const manual = Number.isInteger(raw.dc) && raw.dc >= DC_MIN && raw.dc <= DC_MAX;
  return { key: info.key, stacks, duration, dc: manual ? raw.dc : 'auto' };
}

// The Difficulty Class of an Automatic Save: 8 + the source's Experience Modifier + the source's Prime (its highest stat).
export function autoDc(sheet) {
  return 8 + sheet.experience + D.skillStat(sheet.stats, { scaling: { prime: true } }).value + combatMods(sheet).dc;
}

// ---- A character's statuses in groups ---------------------------------------------------------------------
// The sheet keeps `statuses` { key: stacks } (the total, used by every rule) and `statusGroups`, the same stacks split by
// how they last: [{ id, key, stacks, duration, rounds?, dc? }]. Stacks of one Duration merge into one group (a Repeated one
// keeps the highest DC); only 1 Minute stacks stay separate, each with its own timer (`rounds` left). The total of a status
// that does not stack is 1.
export const total = (info, groups) => {
  const sum = groups.reduce((n, g) => n + g.stacks, 0);
  return info.stackable ? sum : sum > 0 ? 1 : 0;
};

// What a manual change of a total takes from: the Long stacks first, then Repeated, then 1 Minute, then 1 Round.
const TAKE_ORDER = ['long', 'repeated', 'minute', 'round'];

// Makes the groups agree with the totals in `statuses`: a total higher than the groups hold adds Long stacks, a lower one takes
// stacks away in TAKE_ORDER. `newId()` makes the id of a group that has to be made. -> the groups
export function reconcileGroups(statuses, groups, newId) {
  const out = groups.map((g) => ({ ...g }));
  for (const info of D.STATUSES) {
    const want = statuses[info.key] ?? 0;
    const mine = out.filter((g) => g.key === info.key);
    const have = total(info, mine);
    if (want === have) continue;
    if (want > have) {
      const long = mine.find((g) => g.duration === 'long');
      if (long) long.stacks += want - have;
      else out.push({ id: newId(), key: info.key, stacks: info.stackable ? want - have : 1, duration: 'long' });
      continue;
    }
    let remove = info.stackable ? have - want : mine.reduce((n, g) => n + g.stacks, 0);
    for (const duration of TAKE_ORDER) {
      for (const g of mine.filter((x) => x.duration === duration)) {
        const take = Math.min(g.stacks, remove);
        g.stacks -= take;
        remove -= take;
      }
    }
  }
  return out.filter((g) => g.stacks > 0);
}

// Puts a status on a character's groups (the totals are made from the groups afterwards).
export function addToGroups(groups, apply, dc, newId) {
  const info = statusInfo(apply.key);
  const next = groups.map((g) => ({ ...g }));
  const same = apply.duration === 'minute' ? null : next.find((g) => g.key === apply.key && g.duration === apply.duration);
  if (same) {
    same.stacks = info.stackable ? Math.min(99, same.stacks + apply.stacks) : 1;
    if (apply.duration === 'repeated') same.dc = Math.max(same.dc ?? 0, dc);
    return { groups: next, id: same.id };
  }
  const g = { id: newId(), key: apply.key, stacks: apply.stacks, duration: apply.duration };
  if (apply.duration === 'minute') g.rounds = MINUTE_ROUNDS;
  if (apply.duration === 'repeated') g.dc = dc;
  next.push(g);
  return { groups: next, id: g.id };
}

// The totals of a list of groups: { key: stacks }.
export function totalsOf(groups) {
  const out = {};
  for (const info of D.STATUSES) {
    const n = total(info, groups.filter((g) => g.key === info.key));
    if (n > 0) out[info.key] = n;
  }
  return out;
}

// The end of the character's turn for the groups: 1 Round stacks go, 1 Minute stacks lose a round and go with the last one.
// -> { groups, ended: the groups that ended }
export function tickGroups(groups) {
  const kept = [];
  const ended = [];
  for (const g of groups) {
    if (g.duration === 'round') ended.push(g);
    else if (g.duration === 'minute') {
      const rounds = (g.rounds ?? MINUTE_ROUNDS) - 1;
      if (rounds <= 0) ended.push(g);
      else kept.push({ ...g, rounds });
    } else kept.push(g);
  }
  return { groups: kept, ended };
}
