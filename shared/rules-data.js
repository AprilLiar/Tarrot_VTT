// Hard-coded rules data shared by server and client. Design source of truth
// is README.md ("Game rules"); server/test/rulesData.test.js checks that the
// status table below still matches the README table.

export const STATS = ['strength', 'dexterity', 'intelligence', 'spirit', 'luck'];
export const STAT_LABELS = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  intelligence: 'Intelligence',
  spirit: 'Spirit',
  luck: 'Luck',
};
// Luck has no Save and no X Defence.
export const SAVE_STATS = ['strength', 'dexterity', 'intelligence', 'spirit'];
export const STAT_MIN = -2;
export const STAT_MAX = 7;

// Group saves take the better of two stats.
export const GROUP_SAVES = {
  physical: { label: 'Physical', stats: ['strength', 'dexterity'] },
  mental: { label: 'Mental', stats: ['intelligence', 'spirit'] },
};

export const MASTERIES = ['magic', 'stances', 'manifestation'];
export const MASTERY_LABELS = { magic: 'Magic', stances: 'Stances', manifestation: 'Manifest' };
export const MASTERY_MIN = 1;
export const MASTERY_MAX = 10;
export const EXPERIENCE_MIN = 1;
export const EXPERIENCE_MAX = 10;

// scaling: { prime: true } = highest of all stats; { stats: [...] } = highest of the listed stats.
export const SKILLS = [
  { key: 'awareness', label: 'Awareness', scaling: { prime: true } },
  { key: 'weight_manipulation', label: 'Weight Manipulation', scaling: { stats: ['strength'] } },
  { key: 'stamina', label: 'Stamina', scaling: { stats: ['strength'] } },
  { key: 'speed', label: 'Speed', scaling: { stats: ['dexterity'] } },
  { key: 'fine_motor_skills', label: 'Fine Motor Skills', scaling: { stats: ['dexterity'] } },
  { key: 'mental_resolve', label: 'Mental Resolve', scaling: { stats: ['spirit'] } },
  { key: 'soul_control', label: 'Soul Control', scaling: { stats: ['spirit'] } },
  { key: 'astrology', label: 'Astrology', scaling: { stats: ['intelligence'] } },
  { key: 'symbolism', label: 'Symbolism', scaling: { stats: ['intelligence'] } },
  { key: 'body_movement', label: 'Body Movement', scaling: { stats: ['strength', 'dexterity'] } },
  { key: 'likability', label: 'Likability', scaling: { stats: ['spirit', 'intelligence'] } },
];
export const SKILL_TIER_MAX = 10;

// The stat a skill scales from, given a stats map. Ties keep the first listed stat.
export function skillStat(stats, skill) {
  const candidates = skill.scaling.prime ? STATS : skill.scaling.stats;
  let best = candidates[0];
  for (const s of candidates) if (stats[s] > stats[best]) best = s;
  const label = skill.scaling.prime ? `Prime: ${STAT_LABELS[best]}` : STAT_LABELS[best];
  return { stat: best, value: stats[best], label };
}

export const DAMAGE_TYPES = [
  'fire', 'cold', 'acid', 'poison', 'lightning', 'sound',
  'bludgeoning', 'slashing', 'piercing', 'soul', 'decay', 'psychic',
];

export const AP_MAX = 4;
export const AP_MAX_MINION = 2;
export const ITEM_USES_MAX = 100;
export const NAME_MAX = 60;
export const TEXT_MAX = 2000;

// All DC20 Foundry statuses, remapped to Tarrot stats. Automation comes later:
// for now a status is a name, a stack count where it stacks, and rule text.
export const STATUSES = [
  { key: "bleeding", name: "Bleeding", stackable: true, text: "X true damage at turn start. Removed only by healing, or by using a helpful item for 1 AP (wording only; item use is not automated)." },
  { key: "blinded", name: "Blinded", stackable: false, text: "Cannot see; terrain is difficult unless guided. Auto-fail Awareness (sight). Attacks have Disadvantage; attackers have Advantage." },
  { key: "burning", name: "Burning", stackable: true, text: "X fire damage at turn start. Ends when doused. A nearby creature can spend 1 AP to remove 1 stack." },
  { key: "charmed", name: "Charmed", stackable: false, text: "Charmer has Advantage on Spirit checks against you. You cannot target the charmer with harmful attacks or effects." },
  { key: "dazed", name: "Dazed", stackable: true, text: "Disadvantage X on mental checks (Intelligence, Spirit)." },
  { key: "deafened", name: "Deafened", stackable: false, text: "Cannot hear. Auto-fail hearing-based Awareness. Flanking melee attackers have Advantage." },
  { key: "disoriented", name: "Disoriented", stackable: true, text: "Disadvantage X on mental saves." },
  { key: "doomed", name: "Doomed", stackable: true, text: "Current and max HP reduced by X. Healing received reduced by X." },
  { key: "exhaustion", name: "Exhaustion", stackable: true, text: "Penalty X on all checks and saves. Speed and Save DC reduced by X. Death at 6 stacks." },
  { key: "exposed", name: "Exposed", stackable: true, text: "Attacks against you have Advantage X. (Natural 1 gives one stack that ends after the first Attack roll against you.)" },
  { key: "frightened", name: "Frightened", stackable: false, text: "Cannot willingly move closer to the source. Disadvantage on all checks against the source." },
  { key: "fully_concealed", name: "Fully Concealed", stackable: false, text: "Creatures treat you as Blinded to see you. Attackers have Disadvantage; you have Advantage. Auto-fail Awareness to see you." },
  { key: "fully_stunned", name: "Fully Stunned", stackable: false, text: "Incapacitated. Attacks against you have Advantage. Auto-fail Physical Saves (except poison/disease). Cannot go below 0 AP." },
  { key: "grappled", name: "Grappled", stackable: false, text: "Immobilized, Disadvantage on Dexterity Saves. Escape with a Body Movement roll against the grappler's Weight Manipulation, 1 AP." },
  { key: "half_cover", name: "Half Cover", stackable: false, text: "All Attacks and Spell Checks against you have -2." },
  { key: "hidden", name: "Hidden", stackable: false, text: "Unseen and Unheard. Attackers have Disadvantage; you have Advantage on attacks." },
  { key: "hindered", name: "Hindered", stackable: true, text: "Disadvantage X on attacks." },
  { key: "immobilized", name: "Immobilized", stackable: false, text: "Cannot move. Disadvantage on Dexterity Saves." },
  { key: "impaired", name: "Impaired", stackable: true, text: "Disadvantage X on physical checks (Strength, Dexterity)." },
  { key: "incapacitated", name: "Incapacitated", stackable: false, text: "Cannot move or speak. Cannot spend AP or use Minor Actions. Movement 0." },
  { key: "intimidated", name: "Intimidated", stackable: false, text: "Disadvantage on all checks against the source." },
  { key: "invisible", name: "Invisible", stackable: false, text: "Creatures cannot see you unless they perceive invisibility. You have Advantage on attacks; attackers have Disadvantage." },
  { key: "paralyzed", name: "Paralyzed", stackable: false, text: "Incapacitated. Auto-fail Physical Saves. Attacks against you have Advantage. Melee attacks within 1 Space are critical hits." },
  { key: "partially_concealed", name: "Partially Concealed", stackable: false, text: "Creatures have Disadvantage on Awareness to see you." },
  { key: "petrified", name: "Petrified", stackable: false, text: "Incapacitated, 10x heavier, unaware. Auto-fail Physical Saves. Vulnerable to bludgeoning, resistant to other damage. Other statuses suspended; immune to new ones." },
  { key: "prone", name: "Prone", stackable: false, text: "Disadvantage on attacks. Ranged attacks against you have Disadvantage; melee have Advantage. Movement costs +1 per space. Standing costs 2 movement." },
  { key: "restrained", name: "Restrained", stackable: false, text: "Immobilized, Disadvantage on Dexterity Saves. Attacks by you have Disadvantage; attackers have Advantage." },
  { key: "slowed", name: "Slowed", stackable: true, text: "Each space of movement costs X additional spaces." },
  { key: "stunned", name: "Stunned", stackable: true, text: "Current and max AP reduced by X. At 4 or more: Incapacitated, attacks against you have Advantage, auto-fail Physical Saves." },
  { key: "surprised", name: "Surprised", stackable: false, text: "Current and max AP reduced by 2." },
  { key: "taunted", name: "Taunted", stackable: false, text: "Disadvantage on attacks against targets other than the source." },
  { key: "terrified", name: "Terrified", stackable: false, text: "Must spend turns moving away from the source. Only actions: Move to flee, or Dodge if cornered." },
  { key: "tethered", name: "Tethered", stackable: false, text: "Cannot move farther than a set number of spaces from the tether point or creature." },
  { key: "3_4_cover", name: "3/4 Cover", stackable: false, text: "All Attacks and Spell Checks against you have -5." },
  { key: "unconscious", name: "Unconscious", stackable: false, text: "Incapacitated and Prone. Unaware. Auto-fail Physical Saves. Attacks against you have Advantage; melee within 1 Space are critical hits." },
  { key: "unheard", name: "Unheard", stackable: false, text: "Advantage on melee attacks against flanked enemies who cannot hear you." },
  { key: "unseen", name: "Unseen", stackable: false, text: "Advantage on your attacks; attackers have Disadvantage." },
  { key: "weakened", name: "Weakened", stackable: true, text: "Disadvantage X on physical saves (Strength, Dexterity)." },
];
