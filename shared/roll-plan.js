import * as D from './rules-data.js';
import { resolveStat, statusEffects } from './status-effects.js';

// Works out what a roll will be, before any die is thrown: its title, every
// bonus with its source, and how many d20 are rolled. The server uses it to make
// the roll; the client uses it to preview the formula in the roll dialog, so
// what you see is what gets rolled.

export const MAX_MANUAL_LEVELS = 5;

// "1d20 + 3(Dexterity) - 1(Custom)"
export function formatExpression(terms) {
  return ['1d20', ...terms.map((t) => `${t.value < 0 ? '-' : '+'} ${Math.abs(t.value)}(${t.label})`)].join(' ');
}

// request: { kind: 'attribute'|'save'|'skill'|'mastery', key, advantage?, modifier? }
// `advantage` is the roller's own extra Advantage levels (negative = Disadvantage)
// on top of whatever the character's statuses apply automatically.
// -> { ok: true, title, terms, sources, net, mode, diceCount, expression } | { ok: false, error }
export function planRoll(sheet, request) {
  const { kind, key } = request;
  const manual = request.advantage ?? 0;
  const modifier = request.modifier ?? 0;
  const fail = (error) => ({ ok: false, error });

  if (!Number.isInteger(manual) || Math.abs(manual) > MAX_MANUAL_LEVELS) {
    return fail(`Advantage levels must be a whole number from -${MAX_MANUAL_LEVELS} to ${MAX_MANUAL_LEVELS}.`);
  }
  if (!Number.isInteger(modifier) || Math.abs(modifier) > 99) {
    return fail('The custom modifier must be a whole number from -99 to 99.');
  }

  let title;
  const terms = [];

  if (kind === 'attribute') {
    if (!D.STATS.includes(key)) return fail('Unknown stat.');
    title = `${D.STAT_LABELS[key]} Attribute Roll`;
    terms.push({ label: D.STAT_LABELS[key], value: sheet.stats[key] });
  } else if (kind === 'save') {
    const stat = resolveStat(sheet, 'save', key);
    if (!stat) return fail('That stat has no Save.');
    title = D.GROUP_SAVES[key] ? `${D.GROUP_SAVES[key].label} Save` : `${D.STAT_LABELS[key]} Save`;
    terms.push({ label: D.STAT_LABELS[stat], value: sheet.stats[stat] });
    if (sheet.xDefence[stat] !== 0) {
      terms.push({ label: `${D.STAT_LABELS[stat]} Defence`, value: sheet.xDefence[stat] });
    }
  } else if (kind === 'skill') {
    const skill = D.SKILLS.find((s) => s.key === key);
    if (!skill) return fail('Unknown skill.');
    title = `${skill.label} (Skill Roll)`;
    const st = D.skillStat(sheet.stats, skill);
    terms.push({ label: st.label, value: st.value });
    if (sheet.skills[key] !== 0) terms.push({ label: `Mastery: ${skill.label}`, value: sheet.skills[key] });
  } else if (kind === 'mastery') {
    // A combat roll: the Combat Mastery plus the Experience Modifier.
    if (!D.MASTERIES.includes(key)) return fail('Unknown Combat Mastery.');
    title = `${D.MASTERY_LABELS[key]} (Combat Mastery Roll)`;
    terms.push({ label: `Mastery: ${D.MASTERY_LABELS[key]}`, value: sheet.masteries[key] });
    terms.push({ label: 'Experience Modifier', value: sheet.experience });
  } else {
    return fail('Unknown roll type.');
  }

  // Statuses apply on their own, even to a quick roll.
  const fx = statusEffects(sheet.statuses, kind, resolveStat(sheet, kind, key));
  for (const m of fx.modifiers) terms.push(m);
  if (modifier !== 0) terms.push({ label: 'Custom', value: modifier });

  const sources = [...fx.levels];
  if (manual !== 0) sources.push({ label: 'Manual', levels: manual });
  const net = sources.reduce((sum, s) => sum + s.levels, 0);
  const mode = net > 0 ? 'advantage' : net < 0 ? 'disadvantage' : 'normal';

  return {
    ok: true,
    title,
    terms,
    sources,
    net,
    mode,
    diceCount: 1 + Math.abs(net),
    expression: formatExpression(terms),
  };
}
