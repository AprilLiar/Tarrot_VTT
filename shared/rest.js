import { effectiveMaxHp } from './effects.js';

// Rests and Rest Points (see the README, "Rests"): a character has Rest Points (RP) up to its Strength score (at least 1). A Short Rest
// or a Long Rest spends RP to heal, 1 RP for 1 HP (never past the maximum HP); a Long Rest then gives back 1 RP at its end. Rests are
// taken outside combat, by the character's player or the GM.
export const REST_KINDS = ['short', 'long'];

export const restMax = (sheet) => Math.max(1, sheet?.stats?.strength ?? 0);

// The most RP a rest can spend now (each heals 1 HP, up to the maximum HP).
export const restSpendMax = (sheet) => Math.max(0, Math.min(sheet.rest?.current ?? 0, effectiveMaxHp(sheet) - (sheet.hp?.current ?? 0)));

// -> { hp, rp } after the rest, or a problem: 'bad_kind' | 'bad_spend'.
export function takeRest(sheet, kind, spend) {
  if (!REST_KINDS.includes(kind)) return { problem: 'bad_kind' };
  if (!Number.isInteger(spend) || spend < 0 || spend > restSpendMax(sheet)) return { problem: 'bad_spend' };
  const hp = sheet.hp.current + spend;
  let rp = sheet.rest.current - spend;
  if (kind === 'long') rp = Math.min(restMax(sheet), rp + 1);
  return { hp, rp };
}
