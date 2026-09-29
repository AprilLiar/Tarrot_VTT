import { randomInt } from 'node:crypto';
import * as D from '../shared/rules-data.js';
import { AppError } from './errors.js';

// Rolls are made on the server from the stored sheet, so a result and its
// breakdown can never disagree with the sheet (and nobody can fake a roll).
// Every roll is d20 + modifiers.

export const rollD20 = () => randomInt(1, 21);

const MODES = ['normal', 'advantage', 'disadvantage'];

const bad = (message, code = 'bad_roll') => new AppError(code, message);

// "1d20 + 3(Dexterity) - 1(Custom)". Zero-valued bonuses are left out,
// except the stat itself which is always shown.
export function formatExpression(terms) {
  return ['1d20', ...terms.map((t) => `${t.value < 0 ? '-' : '+'} ${Math.abs(t.value)}(${t.label})`)].join(' ');
}

// request: { kind: 'attribute'|'save'|'skill', key, mode?, modifier? }
export function buildRoll(sheet, request, rng = rollD20) {
  const { kind, key } = request;
  const mode = request.mode ?? 'normal';
  const modifier = request.modifier ?? 0;
  if (!MODES.includes(mode)) throw bad('Unknown roll mode.');
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
    let stat = key;
    if (D.GROUP_SAVES[key]) {
      // Group saves use the better of (stat + that stat's X Defence).
      const total = (s) => sheet.stats[s] + sheet.xDefence[s];
      const options = D.GROUP_SAVES[key].stats;
      stat = options.reduce((best, s) => (total(s) > total(best) ? s : best), options[0]);
      title = `${D.GROUP_SAVES[key].label} Save`;
    } else {
      if (!D.SAVE_STATS.includes(key)) throw bad('That stat has no Save.');
      title = `${D.STAT_LABELS[key]} Save`;
    }
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
  } else {
    throw bad('Unknown roll type.');
  }

  if (modifier !== 0) terms.push({ label: 'Custom', value: modifier });

  const dice = mode === 'normal' ? [rng()] : [rng(), rng()];
  const natural = mode === 'disadvantage' ? Math.min(...dice) : Math.max(...dice);
  const total = natural + terms.reduce((sum, t) => sum + t.value, 0);
  const flags = [];
  if (natural === 20) flags.push('critical');
  if (natural === 1) flags.push('critical_failure');

  return { title, mode, dice, natural, terms, total, expression: formatExpression(terms), flags };
}
