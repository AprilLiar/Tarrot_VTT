import { randomInt } from 'node:crypto';
import { planRoll, formatExpression, MAX_NET_LEVELS } from '../shared/roll-plan.js';
import { T } from '../shared/localization.js';
import { AppError } from './errors.js';

// Rolls are made on the server from the stored sheet, so a result and its
// breakdown can never disagree with the sheet (and nobody can fake a roll).
// Every roll is d20 + modifiers. The plan (title, bonuses, dice count) comes
// from shared/roll-plan.js, which the client also uses to preview the formula.

export const rollD20 = () => randomInt(1, 21);
export { formatExpression };

export function buildRoll(sheet, request, rng = rollD20) {
  const plan = planRoll(sheet, request);
  if (!plan.ok) throw new AppError('bad_roll', plan.error, plan.params);

  const dice = Array.from({ length: plan.diceCount }, () => rng());
  const natural = plan.net < 0 ? Math.min(...dice) : Math.max(...dice);
  // Dice Roll Bonuses are rolled with the d20 and added or subtracted like any other bonus.
  const terms = [...plan.terms, ...plan.bonusDice.map((d) => ({ label: `${d.source} (d${d.sides})`, value: d.sign * randomInt(1, d.sides + 1) }))];
  const total = natural + terms.reduce((sum, t) => sum + t.value, 0);
  const flags = [];
  if (natural === 20) flags.push('critical');
  if (natural === 1) flags.push('critical_failure');

  return {
    title: plan.title,
    mode: plan.mode,
    advantage: { net: plan.net, sources: plan.sources },
    dice,
    natural,
    terms,
    total,
    expression: plan.expression,
    flags,
    // The Effects with Uses this roll took one use from (the caller spends them, see effectRuntime.js).
    effectsUsed: plan.used,
  };
}

// The GM gives an already rolled d20 Advantage (levels > 0) or Disadvantage (levels < 0): the d20 that counted stays, `levels`
// more d20s join it, and the highest (Advantage) or lowest (Disadvantage) counts. Every earlier die and every earlier
// Advantage or Disadvantage is forgotten; the bonuses and Dice Roll Bonuses stay as rolled.
export function adjustLevels(roll, levels, rng = rollD20) {
  if (!Number.isInteger(levels) || levels === 0 || Math.abs(levels) > MAX_NET_LEVELS) {
    throw new AppError('bad_value', 'Advantage levels must be a whole number from -{max} to {max}.', { max: MAX_NET_LEVELS });
  }
  const dice = [roll.natural, ...Array.from({ length: Math.abs(levels) }, () => rng())];
  const natural = levels < 0 ? Math.min(...dice) : Math.max(...dice);
  const flags = roll.flags.filter((f) => f !== 'critical' && f !== 'critical_failure');
  if (natural === 20) flags.push('critical');
  if (natural === 1) flags.push('critical_failure');
  return {
    ...roll,
    mode: levels > 0 ? 'advantage' : 'disadvantage',
    advantage: { net: levels, sources: [{ label: T('Set by the GM'), levels }] },
    dice,
    natural,
    total: roll.total - roll.natural + natural,
    flags,
  };
}
