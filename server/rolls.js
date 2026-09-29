import { randomInt } from 'node:crypto';
import * as D from '../shared/rules-data.js';
import { resolveStat, statusEffects } from '../shared/status-effects.js';
import { AppError } from './errors.js';

// Rolls are made on the server from the stored sheet, so a result and its
// breakdown can never disagree with the sheet (and nobody can fake a roll).
// Every roll is d20 + modifiers.

export const rollD20 = () => randomInt(1, 21);

const MAX_MANUAL_LEVELS = 5;

const bad = (message, code = 'bad_roll') => new AppError(code, message);

// "1d20 + 3(Dexterity) - 1(Custom)". Zero-valued bonuses are left out,
// except the stat itself which is always shown.
export function formatExpression(terms) {
  return ['1d20', ...terms.map((t) => `${t.value < 0 ? '-' : '+'} ${Math.abs(t.value)}(${t.label})`)].join(' ');
}

// request: { kind: 'attribute'|'save'|'skill'|'mastery', key, advantage?, modifier? }
// `advantage` is the roller's own extra Advantage levels (negative = Disadvantage), on
// top of whatever the character's statuses apply automatically.
export function buildRoll(sheet, request, rng = rollD20) {
  const { kind, key } = request;
  const manual = request.advantage ?? 0;
  const modifier = request.modifier ?? 0;
  if (!Number.isInteger(manual) || Math.abs(manual) > MAX_MANUAL_LEVELS) {
    throw bad(`Advantage levels must be a whole number from -${MAX_MANUAL_LEVELS} to ${MAX_MANUAL_LEVELS}.`);
  }
  if (!Number.isInteger(modifier) || Math.abs(modifier) > 99) {
    throw bad('The custom modifier must be a whole number from -99 to 99.');
  }

  let title;
  const terms = [];

  if (kind === 'attribute') {
    if (!D.STATS.includes(key)) throw bad('Unknown stat.');
    title = `${D.STAT_LABELS[key]} Attribute Roll`;
    terms.push({ label: D.STAT_LABELS[key], value: sheet.stats[key] });
  } else if (kind === 'save') {
    const stat = resolveStat(sheet, 'save', key);
    if (!stat) throw bad('That stat has no Save.');
    title = D.GROUP_SAVES[key] ? `${D.GROUP_SAVES[key].label} Save` : `${D.STAT_LABELS[key]} Save`;
    terms.push({ label: D.STAT_LABELS[stat], value: sheet.stats[stat] });
    if (sheet.xDefence[stat] !== 0) {
      terms.push({ label: `${D.STAT_LABELS[stat]} Defence`, value: sheet.xDefence[stat] });
    }
  } else if (kind === 'skill') {
    const skill = D.SKILLS.find((s) => s.key === key);
    if (!skill) throw bad('Unknown skill.');
    title = `${skill.label} (Skill Roll)`;
    const st = D.skillStat(sheet.stats, skill);
    terms.push({ label: st.label, value: st.value });
    if (sheet.skills[key] !== 0) terms.push({ label: `Mastery: ${skill.label}`, value: sheet.skills[key] });
  } else if (kind === 'mastery') {
    // A combat roll: the Combat Mastery plus the Experience Modifier.
    if (!D.MASTERIES.includes(key)) throw bad('Unknown Combat Mastery.');
    title = `${D.MASTERY_LABELS[key]} (Combat Mastery Roll)`;
    terms.push({ label: `Mastery: ${D.MASTERY_LABELS[key]}`, value: sheet.masteries[key] });
    terms.push({ label: 'Experience Modifier', value: sheet.experience });
  } else {
    throw bad('Unknown roll type.');
  }

  // Statuses apply on their own, even to a quick roll.
  const fx = statusEffects(sheet.statuses, kind, resolveStat(sheet, kind, key));
  for (const m of fx.modifiers) terms.push(m);
  if (modifier !== 0) terms.push({ label: 'Custom', value: modifier });

  const sources = [...fx.levels];
  if (manual !== 0) sources.push({ label: 'Manual', levels: manual });
  const net = sources.reduce((sum, s) => sum + s.levels, 0);
  const mode = net > 0 ? 'advantage' : net < 0 ? 'disadvantage' : 'normal';

  const dice = Array.from({ length: 1 + Math.abs(net) }, () => rng());
  const natural = net < 0 ? Math.min(...dice) : Math.max(...dice);
  const total = natural + terms.reduce((sum, t) => sum + t.value, 0);
  const flags = [];
  if (natural === 20) flags.push('critical');
  if (natural === 1) flags.push('critical_failure');

  return {
    title,
    mode,
    advantage: { net, sources },
    dice,
    natural,
    terms,
    total,
    expression: formatExpression(terms),
    flags,
  };
}
