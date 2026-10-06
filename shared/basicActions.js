import * as D from './rules-data.js';
import { T } from './localization.js';
import { normalizeEffectRefs, MAX_AP_COST } from './arcane.js';
import { normalizeDefinition } from './effects.js';
import { HELP_SIDES } from './help.js';

// Basic Actions (from DC20): the things anybody can do on their turn. A Basic Action costs AP, may make a roll (shown in the chat; contested
// and DC results are judged by the GM, nothing is decided for them), may put Effects (shared/effects.js) on the user or the selected
// targets, and may give a Help Die to the selected targets. The GM edits the list in the general Arcane tab.
//   { id, name, description, ap, roll: null | { kind: 'skill'|'attribute'|'weapon'|'mastery', key }, effects: [{ id, to }], help: null | { sides } }

export const MAX_ACTIONS = 100;
export const DEFAULT_ACTION_PREFIX = 'default:';

const isInt = Number.isInteger;
const clampInt = (v, min, max, fallback) => (isInt(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);

// The rolls an action can make: the same kinds as the sheet's rolls (shared/roll-plan.js).
export function normalizeActionRoll(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'weapon') return { kind: 'weapon', key: 'prime' };
  if (raw.kind === 'attribute' && D.STATS.includes(raw.key)) return { kind: 'attribute', key: raw.key };
  if (raw.kind === 'skill' && D.SKILLS.some((s) => s.key === raw.key)) return { kind: 'skill', key: raw.key };
  if (raw.kind === 'mastery' && D.MASTERIES.includes(raw.key)) return { kind: 'mastery', key: raw.key };
  return null;
}

export function normalizeAction(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX, 'Action').trim() || 'Action',
    description: text(r.description, D.TEXT_MAX),
    ap: clampInt(r.ap, 0, MAX_AP_COST, 1),
    roll: normalizeActionRoll(r.roll),
    effects: normalizeEffectRefs(r.effects),
    help: r.help && HELP_SIDES.includes(r.help.sides) ? { sides: r.help.sides } : null,
  };
}

// ---- The defaults (the DC20 Basic Actions, in Tarrot's terms) -------------------------------------------------------------
// The Effects some of them put on are global Effects of their own ('default:...'), which the GM can edit like any other.

const fx = (id, e) => ({ id: `${DEFAULT_ACTION_PREFIX}${id}`, ...e });

export const DEFAULT_EFFECTS = [
  fx('dodge', { name: T('Dodge'), description: T('The next attack made against you before your next turn starts has Disadvantage.'), duration: 'next_turn', uses: 1, parts: [{ type: 'against', adv: -1 }] }),
  fx('full_dodge', { name: T('Full Dodge'), description: T('Every attack made against you until your next turn starts has Disadvantage.'), duration: 'next_turn', uses: null, parts: [{ type: 'against', adv: -1 }] }),
  fx('disengage', { name: T('Disengage'), description: T('Opportunity Attacks against you have Disadvantage until your next turn starts.'), duration: 'next_turn', uses: null, parts: [{ type: 'text', text: T('Opportunity Attacks against you have Disadvantage.') }] }),
  fx('full_disengage', { name: T('Full Disengage'), description: T('You are immune to Opportunity Attacks until your next turn starts.'), duration: 'next_turn', uses: null, parts: [{ type: 'text', text: T('Immune to Opportunity Attacks.') }] }),
].map((e) => normalizeDefinition(e, e.id));

const eff = (id) => [{ id: `${DEFAULT_ACTION_PREFIX}${id}`, to: 'self' }];
const skill = (key) => ({ kind: 'skill', key });
const a = (id, name, description, ap, extra = {}) => normalizeAction({ id: `${DEFAULT_ACTION_PREFIX}${id}`, name, description, ap, ...extra }, `${DEFAULT_ACTION_PREFIX}${id}`);

export const DEFAULT_ACTIONS = [
  a('attack', T('Attack'), T('Make an attack from the footer of the Arcane tab. Its AP is the cost of the weapon and the Enhancements you choose.'), 0),
  a('move', T('Move'), T('Spend 1 AP to move up to your Movement in Spaces. Use the D-pad or drag your token; the AP is spent for you.'), 0),
  a('spell', T('Spell'), T('Spend AP to cast a crafted spell: choose it as the weapon in the Magic tab and attack.'), 0),
  a('dodge', T('Dodge'), T('Spend 1 AP: the next attack made against you before the start of your next turn has Disadvantage.'), 1, { effects: eff('dodge') }),
  a('full_dodge', T('Full Dodge'), T('Spend 2 AP: all attacks made against you until the start of your next turn have Disadvantage.'), 2, { effects: eff('full_dodge') }),
  a('disengage', T('Disengage'), T('Spend 1 AP: Opportunity Attacks against you have Disadvantage until the start of your next turn.'), 1, { effects: eff('disengage') }),
  a('full_disengage', T('Full Disengage'), T('Spend 2 AP: you are immune to Opportunity Attacks until the start of your next turn.'), 2, { effects: eff('full_disengage') }),
  a('hide', T('Hide'), T('Spend 1 AP to hide from creatures that cannot see you. Roll against their Awareness; on a success you become Hidden (add the status).'), 1, { roll: skill('body_movement') }),
  a('help', T('Help'), T('Spend 1 AP to give another creature a d8 Help Die until the start of your next turn. Select the creature first.'), 1, { help: { sides: 8 } }),
  a('object', T('Object'), T('Spend 1 AP to drink or give a potion, work a lock or a mechanism, or hand an item to another creature.'), 1, { roll: skill('fine_motor_skills') }),
  a('feint', T('Feint'), T('Spend 1 AP and roll against the target\'s Awareness. On a success the next attack against the target before the start of your next turn has Advantage and +1 damage.'), 1, { roll: skill('fine_motor_skills') }),
  a('taunt', T('Taunt'), T('Spend 1 AP to taunt a creature that can see or hear you within 10 Spaces. Roll against its Mental Save; on a success it is Taunted for 1 Round.'), 1, { roll: skill('likability') }),
  a('intimidate', T('Intimidate'), T('Spend 1 AP to intimidate a creature that can see or hear you within 10 Spaces. Roll against its Mental Save; on a success it is Intimidated until the end of your next turn.'), 1, { roll: skill('likability') }),
  a('grapple', T('Grapple'), T('With a free hand, spend 1 AP to grab a creature within 1 Space. Roll against its Body Movement or Weight Manipulation; on a success it is Grappled.'), 1, { roll: skill('weight_manipulation') }),
  a('shove', T('Shove'), T('Spend 1 AP to push a creature within 1 Space. Roll against its Body Movement or Weight Manipulation; on a success it is pushed 1 Space (1 more for every 5 over), or knocked Prone instead.'), 1, { roll: skill('weight_manipulation') }),
  a('tackle', T('Tackle'), T('After moving at least 2 Spaces in a straight line, spend 1 AP to tackle a creature your size or smaller. Roll against its Body Movement or Weight Manipulation; on a success you Grapple it and you both fall Prone.'), 1, { roll: skill('weight_manipulation') }),
  a('throw', T('Throw'), T('Spend 1 AP to throw an object, or a creature you have Grappled. The distance depends on your Strength; a throw at a target is a ranged attack.'), 1, { roll: skill('weight_manipulation') }),
  a('disarm', T('Disarm'), T('Spend 1 AP to make an attack roll against a creature\'s Body Movement, Weight Manipulation or Fine Motor Skills (its choice). On a success the object it holds falls within 1 Space.'), 1, { roll: { kind: 'weapon', key: 'prime' } }),
  a('analyze', T('Analyze Creature'), T('Spend 1 AP to recall or discern information about a creature you can see or hear. Roll a DC 10 Symbolism check; each 5 over teaches one more statistic.'), 1, { roll: skill('symbolism') }),
  a('calm_animal', T('Calm Animal'), T('Spend 1 AP to beguile a beast that can see or hear you. Roll against its Mental Save; on a success it is Taunted by you for 1 minute.'), 1, { roll: skill('likability') }),
  a('combat_insight', T('Combat Insight'), T('Spend 1 AP to discern what a creature will do on its next turn. Roll against its Likability or Fine Motor Skills; on a success you learn whether it attacks, casts or flees.'), 1, { roll: skill('awareness') }),
  a('conceal', T('Conceal'), T('Spend 1 AP to hide an object on yourself or nearby. Roll Fine Motor Skills against the Awareness of creatures that can see you; on a success it is Hidden from those you beat.'), 1, { roll: skill('fine_motor_skills') }),
  a('investigate', T('Investigate'), T('Spend 1 AP to uncover a concealed object, a secret compartment or the function of a mechanism within 1 Space. Roll Awareness against the concealing roll or a DC.'), 1, { roll: skill('awareness') }),
  a('search', T('Search'), T('Spend 1 AP to locate hidden creatures and concealed objects in your line of sight. Roll Awareness against their hiding roll.'), 1, { roll: skill('awareness') }),
  a('medicine', T('Medicine'), T('Spend 1 AP to tend to a creature you touch. Roll a DC 10 Symbolism check. Success: you stop its Bleeding or stabilize it; each 5 over gives it 1 Temp HP.'), 1, { roll: skill('symbolism') }),
  a('pass_through', T('Pass Through'), T('Spend 1 AP to move through the Space of a hostile creature within 1 size of you. Roll against it; on a success its Space is difficult terrain for you (no penalty if you beat it by 5).'), 1, { roll: skill('body_movement') }),
  a('extend_jump', T('Extend Jump'), T('When you jump, spend 1 AP to increase the distance. Roll a DC 10 Body Movement check: on a failure +1, on a success +2, and +1 more for every 5 over.'), 1, { roll: skill('body_movement') }),
];
