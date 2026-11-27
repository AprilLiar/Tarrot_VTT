// Blood Oxidization (see the README, "Blood Oxidization"): the stacks of the `blood_oxidization` status are the character's Oxidization
// (Ox). Casting a Learned Spell adds Ox equal to its Circles. The Oxidization Limit is the Strength score (at least 1).
//  - Penalties within the limit: 1 Ox gives Disadvantage on Checks (Skill rolls, Attribute rolls, Magic and Stance rolls); from 2 Ox the
//    character is also Slowed and has Disadvantage on Attacks; from 3 Ox each of those is Disadvantage (Ox - 1).
//  - Over the limit: a deep coma (Unconscious, put on and taken off automatically). Over double the limit: dead, dissolved in acid.
//  - Letting blood removes 1 Ox for 3 HP (never down to 0 HP; 1 AP in combat).
export const OX_STATUS = 'blood_oxidization';
export const BLEED_HP = 3;
export const BLEED_AP = 1;

export const oxOf = (sheet) => Math.max(0, sheet?.statuses?.[OX_STATUS] ?? 0);
export const oxLimit = (sheet) => Math.max(1, sheet?.stats?.strength ?? 0);

// 'ok' | 'coma' | 'dead'
export function oxState(sheet) {
  const ox = oxOf(sheet);
  const limit = oxLimit(sheet);
  if (ox > 2 * limit) return 'dead';
  if (ox > limit) return 'coma';
  return 'ok';
}

// The statuses Ox puts on by itself: Slowed from 2 Ox, Unconscious over the limit.
export function oxStatuses(sheet) {
  const out = [];
  const ox = oxOf(sheet);
  if (ox >= 2) out.push('slowed');
  if (oxState(sheet) !== 'ok') out.push('unconscious');
  return out;
}

// A roll is an attack when it is rolled as one (`attack`) or against targets (`against`).
const CHECK_MASTERIES = ['magic', 'stances'];

// -> Disadvantage levels (negative) that Ox puts on this roll, 0 for none.
export function oxLevels(sheet, request) {
  const ox = oxOf(sheet);
  if (!ox) return 0;
  const { kind, key } = request;
  const attack = !!request.attack || request.against != null;
  if (attack) return ox >= 2 ? -(ox - 1) : 0;
  const check = kind === 'skill' || (kind === 'attribute' && key !== 'luck') || (kind === 'mastery' && CHECK_MASTERIES.includes(key));
  return check ? -Math.max(1, ox - 1) : 0;
}

// Letting blood once: null when it is allowed, or why not.
export function bleedProblem(sheet, { inCombat }) {
  if (oxOf(sheet) < 1) return 'no_ox';
  if ((sheet.hp?.current ?? 0) - BLEED_HP <= 0) return 'low_hp';
  if (inCombat && (sheet.ap?.current ?? 0) < BLEED_AP) return 'no_ap';
  return null;
}
