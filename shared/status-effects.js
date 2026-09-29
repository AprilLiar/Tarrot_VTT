import * as D from './rules-data.js';

// How statuses change Attribute, Save and Skill rolls. Used by the server (which
// makes every roll) and by the client (to preview the effects in the roll dialog).
// Effects that need judgement (auto-fail, attacks, "against the source") are not
// automated; attack-related statuses arrive with attacks in Phase 6.
//
// Advantage and Disadvantage work in levels, as in DC20: each level adds one
// d20 to the roll, and the roll keeps the highest (net Advantage) or the lowest
// (net Disadvantage). Advantage and Disadvantage levels cancel each other out.

const PHYSICAL = ['strength', 'dexterity'];
const MENTAL = ['intelligence', 'spirit'];

// `scales`: the effect is X levels for a stack of X; otherwise it is 1 level.
// `kinds` are roll kinds; `stats` restricts by the stat the roll ends up using.
// `levels` is negative for Disadvantage. `modifier` is a flat change (negative = penalty).
const EFFECTS = [
  { status: 'dazed', kinds: ['attribute', 'skill'], stats: MENTAL, levels: -1, scales: true },
  { status: 'disoriented', kinds: ['save'], stats: MENTAL, levels: -1, scales: true },
  { status: 'impaired', kinds: ['attribute', 'skill'], stats: PHYSICAL, levels: -1, scales: true },
  { status: 'weakened', kinds: ['save'], stats: PHYSICAL, levels: -1, scales: true },
  { status: 'grappled', kinds: ['save'], stats: ['dexterity'], levels: -1 },
  { status: 'immobilized', kinds: ['save'], stats: ['dexterity'], levels: -1 },
  { status: 'restrained', kinds: ['save'], stats: ['dexterity'], levels: -1 },
  { status: 'exhaustion', kinds: ['attribute', 'save', 'skill'], modifier: -1, scales: true },
];

// The stat a roll ends up using (after "higher of" and Prime rules), or null.
export function resolveStat(sheet, kind, key) {
  if (kind === 'attribute') return D.STATS.includes(key) ? key : null;
  if (kind === 'save') {
    const group = D.GROUP_SAVES[key];
    if (group) {
      const total = (s) => sheet.stats[s] + sheet.xDefence[s];
      return group.stats.reduce((best, s) => (total(s) > total(best) ? s : best), group.stats[0]);
    }
    return D.SAVE_STATS.includes(key) ? key : null;
  }
  if (kind === 'skill') {
    const skill = D.SKILLS.find((s) => s.key === key);
    return skill ? D.skillStat(sheet.stats, skill).stat : null;
  }
  return null;
}

// -> { levels: [{ label, levels }], modifiers: [{ label, value }] }
export function statusEffects(statuses, kind, stat) {
  const out = { levels: [], modifiers: [] };
  for (const e of EFFECTS) {
    const stacks = statuses?.[e.status];
    if (!stacks || !e.kinds.includes(kind)) continue;
    if (e.stats && !e.stats.includes(stat)) continue;
    const info = D.STATUSES.find((s) => s.key === e.status);
    const n = e.scales ? stacks : 1;
    const label = info.stackable ? `${info.name} ${stacks}` : info.name;
    if (e.levels) out.levels.push({ label, levels: e.levels * n });
    if (e.modifier) out.modifiers.push({ label: info.name, value: e.modifier * n });
  }
  return out;
}
