import { randomInt } from 'node:crypto';
import { planRoll, formatExpression } from '../shared/roll-plan.js';
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
  };
}
