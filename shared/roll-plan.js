import * as D from './rules-data.js';
import { resolveStat, statusEffects } from './status-effects.js';
import { T } from './localization.js';

// Works out what a roll will be, before any die is thrown: its title, every
// bonus with its source, and how many d20 are rolled. The server uses it to make
// the roll; the client uses it to preview the formula in the roll dialog, so
// what you see is what gets rolled.

export const MAX_MANUAL_LEVELS = 10;
// The total of all Advantage / Disadvantage levels is capped, so no roll ever exceeds 11 dice.
export const MAX_NET_LEVELS = 10;

// "1d20 + 3(Dexterity) - 1(Custom)"
export function formatExpression(terms) {
  return ['1d20', ...terms.map((t) => `${t.value < 0 ? '-' : '+'} ${Math.abs(t.value)}(${t.label})`)].join(' ');
}

// request: { kind: 'attribute'|'save'|'skill'|'mastery'|'weapon', key, advantage?, modifier?, dice? }
// `bonuses` are extra flat terms [{ label, value }]. `dice` are Dice Roll Bonuses [{ sides, sign, source }]: each is rolled next to the d20 and added
// (sign 1) or subtracted (sign -1). Their values are only known when the server rolls them.
// `advantage` is the roller's own extra Advantage levels (negative = Disadvantage)
// on top of whatever the character's statuses apply automatically.
// -> { ok: true, title, terms, sources, net, mode, diceCount, expression } | { ok: false, error }
export function planRoll(sheet, request) {
  const { kind, key } = request;
  const manual = request.advantage ?? 0;
  const modifier = request.modifier ?? 0;
  const fail = (error, params) => ({ ok: false, error, params });

  if (!Number.isInteger(manual) || Math.abs(manual) > MAX_MANUAL_LEVELS) {
    return fail('Advantage levels must be a whole number from -{max} to {max}.', { max: MAX_MANUAL_LEVELS });
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
    terms.push({ label: T('Experience Modifier'), value: sheet.experience });
  } else if (kind === 'weapon') {
    // A basic weapon attack (an item weapon or Unarmed): the Prime stat plus the Experience Modifier.
    title = 'Weapon Attack Roll';
    const prime = D.skillStat(sheet.stats, { scaling: { prime: true } });
    terms.push({ label: prime.label, value: prime.value });
    terms.push({ label: T('Experience Modifier'), value: sheet.experience });
  } else {
    return fail('Unknown roll type.');
  }

  // Statuses apply on their own, even to a quick roll.
  const fx = statusEffects(sheet.statuses, kind, resolveStat(sheet, kind, key), key);
  for (const m of fx.modifiers) terms.push(m);
  if (modifier !== 0) terms.push({ label: T('Custom'), value: modifier });
  // Roll bonuses that come from elsewhere (a Stance's band): [{ label, value }].
  for (const b of Array.isArray(request.bonuses) ? request.bonuses : []) {
    if (Number.isInteger(b?.value) && b.value !== 0) terms.push({ label: String(b.label), value: b.value });
  }

  const bonusDice = Array.isArray(request.dice) ? request.dice : [];

  const sources = [...fx.levels];
  if (manual !== 0) sources.push({ label: T('Manual'), levels: manual });
  const net = Math.max(-MAX_NET_LEVELS, Math.min(MAX_NET_LEVELS, sources.reduce((sum, s) => sum + s.levels, 0)));
  const mode = net > 0 ? 'advantage' : net < 0 ? 'disadvantage' : 'normal';

  return {
    ok: true,
    title,
    terms,
    sources,
    net,
    mode,
    diceCount: 1 + Math.abs(net),
    bonusDice,
    expression: [formatExpression(terms), ...bonusDice.map((d) => `${d.sign < 0 ? '-' : '+'} 1d${d.sides}(${d.source})`)].join(' '),
  };
}
