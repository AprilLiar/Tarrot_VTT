import * as D from '../shared/rules-data.js';
import { takeDamage, gainTemp } from '../shared/hp.js';
import { addHelpDie } from '../shared/help.js';
import { computeTarget, applyResistance, hitParam, DAMAGE_KINDS, DEFAULT_CRIT } from '../shared/damage.js';
import { joinMsgs } from '../shared/localization.js';
import { normalizeApply, autoDc } from '../shared/statuses.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import { buildRoll } from './rolls.js';
import { AppError } from './errors.js';
import { STABILIZATION_START, STABILIZATION_STEP, TATTOO_STATUS, usable } from '../shared/spells.js';

// Attacks. A player (or the GM, for an NPC) drafts a weapon and Enhancements in the Arcane tab and rolls; the roll waits as a
// "pending attack" in server memory until the GM confirms it on a card. The card carries every number
// (roll, Defence, base damage, damage type, AP, statuses, targets) and the GM can change any of them.
// Applying works the damage out per target through that target's resistances and updates the sheets.

export const MAX_PENDING = 30;
export const MAX_TARGETS = 30;
// A temporary NPC has no sheet, so no Defence: it gets a fixed one.
export const TEMP_NPC_DEFENCE = 10;
const int = (v, min, max, what) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new AppError('bad_value', '{what} must be a whole number from {min} to {max}.', { what: { t: what }, min, max });
  return v;
};

// The numbers the card needs about a target token: its name, Defences, resistances and HP.
export async function targetInfo(db, tokenId) {
  const token = await battle.getToken(db, tokenId);
  const base = { tokenId: token.id, name: token.name, ownerKind: token.ownerKind, hidden: token.hidden };
  if (token.ownerKind !== 'character') return { ...base, sheet: false, defence: { physical: TEMP_NPC_DEFENCE, mental: TEMP_NPC_DEFENCE } };
  const sheet = await sheets.getSheet(db, token.ownerId);
  return { ...base, sheet: true, defence: sheet.defence, resistances: sheet.resistances, hp: sheet.hp };
}

// Checks and cleans what the GM sends from the card: only the total, the base damage, the damage type,
// the AP cost and the statuses. Everything else comes from the roll itself and from the targets the
// player selected (`targets` here are worked out by the caller, with each target's Defence).
export function cleanApply(pending, input, targets) {
  const i = input ?? {};
  if (!DAMAGE_KINDS.includes(i.kind)) throw new AppError('bad_value', 'Choose a damage type.');
  if (!targets.length) throw new AppError('no_target', 'None of the targets is on the map any more.');
  const statuses = (Array.isArray(i.statuses) ? i.statuses : []).map((s) => {
    const apply = normalizeApply(s);
    if (!apply) throw new AppError('bad_value', 'Unknown status.');
    return { ...apply, name: D.STATUSES.find((x) => x.key === apply.key).name, stackable: D.STATUSES.find((x) => x.key === apply.key).stackable };
  });
  const natural = pending.roll.natural;
  return {
    total: int(i.total ?? pending.roll.total, -999, 999, 'Attack total'),
    natural,
    critThreshold: DEFAULT_CRIT,
    base: int(i.base, 0, 999, 'Base damage'),
    kind: i.kind,
    ap: int(i.ap ?? pending.ap, 0, 20, 'AP cost'),
    exposed: natural === 1, // a natural 1 exposes the attacker
    statuses,
    targets: targets.map((t) => ({ tokenId: t.tokenId, defenceKind: pending.defenceKind, defence: t.defence[pending.defenceKind], override: null })),
  };
}

const capitalise = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Keywords of the chat cards: a parameter carries its category so the card can colour it (see renderParts).
const kw = (text, c) => ({ t: text, c });
const num = (v, c) => ({ v, c });

// Gives a character what a Spontaneous Action grants: a Help Die and/or Temp HP (`benefits` = { help: { sides },
// temp: { value } }). Temp HP does not stack and a full Help Die track keeps only the better dice (shared/help.js).
// The change is noted in the journal. -> rows (chat messages { key, params })
export async function grantBenefits(db, journal, characterId, name, benefits, emitSheet) {
  const rows = [];
  const sheet = await journal.update(db, characterId, (s) => {
    const next = structuredClone(s);
    if (benefits.help) {
      const r = addHelpDie(next.helpDice, benefits.help.sides);
      next.helpDice = r.dice;
      const sides = num(benefits.help.sides, 'help');
      if (r.outcome === 'added') rows.push({ key: '{label}: a d{sides} joins the track.', params: { label: { t: 'Help Die', c: 'help' }, sides } });
      else if (r.outcome === 'replaced') rows.push({ key: '{label}: a d{sides} in place of a d{old}.', params: { label: { t: 'Help Die', c: 'help' }, sides, old: num(r.replaced, 'help') } });
      else rows.push({ key: '{label}: the track is full, the new d{sides} is lost.', params: { label: { t: 'Help Die', c: 'help' }, sides } });
    }
    if (benefits.temp) {
      const had = next.hp.temp ?? 0;
      next.hp.temp = gainTemp(had, benefits.temp.value);
      if (next.hp.temp > had) rows.push({ key: '{label}: {n}.', params: { label: { t: 'Temp HP', c: 'temp' }, n: num(next.hp.temp, 'temp') } });
      else rows.push({ key: '{label}: already {have}, the new {n} does not stack.', params: { label: { t: 'Temp HP', c: 'temp' }, have: num(had, 'temp'), n: benefits.temp.value } });
    }
    return sheets.normalizeSheet(next);
  });
  emitSheet(characterId, sheet);
  return rows;
}

// Applies a confirmed attack. `emitSheet(characterId, sheet)` tells the sheets' viewers; `journal` notes every change so the
// card can be reverted. -> { blocks, rolls }: what happened to each character as blocks of rows (the card shows them
// in the chat), and the durability rolls to post as roll cards.
export async function applyAttack(db, pending, clean, { emitSheet, journal, saves }) {
  const blocks = [];
  const rolls = []; // [{ roll, name, characterId }]: the rolls to post as roll cards
  const attackerName = pending.characterName;
  const attackerSheet = pending.characterId != null ? await sheets.getSheet(db, pending.characterId) : null;
  const sourceName = `${attackerName} (${pending.weaponName})`;

  for (const t of clean.targets) {
    const token = await battle.getToken(db, t.tokenId);
    let hp = null;
    let result;
    const isChar = token.ownerKind === 'character';
    const work = (resistance) =>
      computeTarget({ total: clean.total, natural: clean.natural, critThreshold: clean.critThreshold, defence: t.defence, base: clean.base, kind: clean.kind, resistance, override: t.override });

    if (isChar) {
      const sheet = await journal.update(db, token.ownerId, (s) => {
        result = work(s.resistances?.[clean.kind]);
        const next = structuredClone(s);
        if (result.hit) {
          const before = next.hp.current;
          const out = takeDamage(next.hp, result.damage, result.heal);
          next.hp.current = out.current;
          next.hp.temp = out.temp;
          hp = { before, after: next.hp.current, absorbed: out.absorbed };
        }
        return sheets.normalizeSheet(next);
      });
      emitSheet(token.ownerId, sheet);
    } else {
      result = work(null);
    }

    // One row per fact, so each reader gets them in their own language.
    const rows = [
      {
        key: '{total} vs {defence} {value}: {result}.',
        params: {
          total: num(clean.total, 'num'),
          defence: { t: `${capitalise(t.defenceKind)} Defence` },
          value: num(t.defence, 'num'),
          result: { ...hitParam(result), c: result.critical ? 'crit' : result.hit ? 'hit' : 'miss' },
        },
      },
    ];
    if (result.hit) {
      const formula = result.bonus ? `${clean.base} + ${result.bonus} = ${result.raw}` : `${clean.base} = ${result.raw}`;
      const kind = clean.kind === 'true' ? { t: 'True', c: 'damage' } : kw(capitalise(clean.kind), 'damage');
      rows.push({ key: '{label}: {formula} {kind}.', params: { label: { t: 'Damage', c: 'damage' }, formula: num(formula, 'damage'), kind } });
      if (result.steps.length) rows.push({ key: 'After resistances: {steps}.', params: { steps: { ...joinMsgs(result.steps), c: 'resist' } } });
      if (result.overridden) rows.push({ key: 'Set by the GM to {n}.', params: { n: num(result.damage, 'num') } });
      rows.push(
        result.heal
          ? { key: '{label} {n}.', params: { label: { t: 'Heals', c: 'heal' }, n: num(result.heal, 'heal') } }
          : { key: '{n} damage.', params: { n: num(result.damage, 'damage') } },
      );
      if (hp?.absorbed) rows.push({ key: '{label} absorbs {n}.', params: { label: { t: 'Temp HP', c: 'temp' }, n: num(hp.absorbed, 'temp') } });
      if (hp) rows.push({ key: '{label} {from} to {to}.', params: { label: { t: 'HP', c: 'hp' }, from: num(hp.before, 'hp'), to: num(hp.after, 'hp') } });
      else if (!isChar) rows.push({ key: '(temporary NPC: no sheet, apply by hand)' });
      // The statuses: each lands at once, or after the Save its status asks for (see server/saves.js).
      if (isChar) {
        for (const st of clean.statuses) {
          const dc = st.dc === 'auto' ? (attackerSheet ? autoDc(attackerSheet) : 10) : st.dc;
          const out = await saves.begin(journal, { characterId: token.ownerId, name: token.name, hidden: token.hidden, apply: st, dc, source: sourceName });
          rows.push(...out.rows);
          for (const r of out.rolls) rolls.push({ ...r, characterId: token.ownerId });
        }
      }
    }
    blocks.push({ name: token.name, rows, hidden: token.hidden, tokenId: t.tokenId });
  }

  // What a Spontaneous Action also grants (a Help Die, Temp HP): to every target, hit or not.
  const gains = pending.spontaneous;
  if (gains && (gains.help || gains.temp)) {
    for (const t of clean.targets) {
      const token = await battle.getToken(db, t.tokenId);
      if (token.ownerKind !== 'character') continue;
      const block = blocks.find((b) => b.tokenId === t.tokenId);
      block.rows.push(...(await grantBenefits(db, journal, token.ownerId, token.name, gains, emitSheet)));
    }
  }

  // The attacker pays: AP, the Enhancements' costs (damage, statuses, item uses), and on a natural 1 gains Exposed.
  const own = { name: attackerName, rows: [], hidden: false };
  const costs = pending.costs ?? { damage: [], statuses: [], items: [] };
  const pays = clean.ap > 0 || clean.exposed || costs.damage.length || costs.statuses.length || costs.items.length;
  if (pending.characterId != null && pays) {
    const sheet = await journal.update(db, pending.characterId, (s) => {
      const next = structuredClone(s);
      next.ap.current = Math.max(0, next.ap.current - clean.ap);
      if (clean.exposed) next.statuses = { ...next.statuses, exposed: (next.statuses?.exposed ?? 0) + 1 };
      for (const d of costs.damage) {
        const res = d.kind === 'true' ? { damage: d.amount, heal: 0 } : applyResistance(next.resistances?.[d.kind], d.amount);
        const before = next.hp.current;
        const out = takeDamage(next.hp, res.damage, res.heal);
        next.hp.current = out.current;
        next.hp.temp = out.temp;
        own.rows.push({ key: '{label} {n} {kind} damage as a cost (HP {from} to {to}).', params: { label: { t: 'Takes', c: 'damage' }, n: num(res.damage, 'damage'), kind: kw(d.kind === 'true' ? 'True' : capitalise(d.kind), 'damage'), from: before, to: next.hp.current } });
      }
      for (const st of costs.statuses) {
        const info = D.STATUSES.find((x) => x.key === st.key);
        if (!info) continue;
        const have = next.statuses?.[st.key] ?? 0;
        next.statuses = { ...next.statuses, [st.key]: info.stackable ? have + st.stacks : 1 };
        own.rows.push({ key: '{label} {status} as a cost.', params: { label: { t: 'Gains', c: 'status' }, status: kw(info.stackable ? `${info.name} ${st.stacks}` : info.name, 'status') } });
      }
      for (const c of costs.items) {
        const item = next.items.find((i) => i.id === c.itemId);
        if (!item) continue;
        item.uses.current = Math.max(0, item.uses.current - c.uses);
        own.rows.push({ key: '{label} {n} uses of {item}.', params: { label: { t: 'Spends', c: 'item' }, n: num(c.uses, 'item'), item: item.name } });
      }
      return sheets.normalizeSheet(next);
    });
    emitSheet(pending.characterId, sheet);
    if (clean.ap > 0) own.rows.unshift({ key: '{label} {n}.', params: { label: { t: 'AP spent', c: 'ap' }, n: num(clean.ap, 'ap') } });
    if (clean.exposed) own.rows.push({ key: '{label} 1 (natural 1).', params: { label: { t: 'Gains Exposed', c: 'status' } } });
  }
  // Every spell used loses a little durability: a Magic roll against its Stabilization (a Spell tattoo
  // uses a Strength Save instead). The spell itself worked either way.
  if (pending.characterId != null && (pending.spells ?? []).length) {
    const sheet = await journal.update(db, pending.characterId, (s) => {
      const next = structuredClone(s);
      for (const id of pending.spells) {
        const sp = next.spells.find((x) => x.id === id);
        if (!sp || !usable(sp)) continue;
        const roll = sp.tattoo ? buildRoll(next, { kind: 'save', key: 'strength' }) : buildRoll(next, { kind: 'mastery', key: 'magic' });
        roll.against = { label: 'Stabilization', targets: [{ name: sp.name, value: sp.stabilization }] };
        rolls.push({ roll, name: attackerName, characterId: pending.characterId });
        if (roll.total >= sp.stabilization) {
          sp.stabilization += STABILIZATION_STEP;
          own.rows.push({ key: '{spell} holds: Stabilization rises to {n}.', params: { spell: kw(sp.name, 'spell'), n: num(sp.stabilization, 'num') } });
        } else if (sp.tattoo) {
          sp.stabilization = STABILIZATION_START;
          next.statuses = { ...next.statuses, [TATTOO_STATUS]: (next.statuses?.[TATTOO_STATUS] ?? 0) + 1 };
          own.rows.push({ key: '{spell} bites {name}: Blood Oxidization {n}.', params: { spell: kw(sp.name, 'spell'), name: attackerName, n: num(next.statuses[TATTOO_STATUS], 'status') } });
        } else {
          sp.stabilization = STABILIZATION_START;
          sp.uses.current = Math.max(0, sp.uses.current - 1);
          if (sp.uses.current === 0) sp.destroyed = true;
          own.rows.push(
            sp.destroyed
              ? { key: '{spell} falters and is destroyed.', params: { spell: kw(sp.name, 'spell') } }
              : { key: '{spell} falters: Stabilization resets to {n} and it loses a use ({left} left).', params: { spell: kw(sp.name, 'spell'), n: sp.stabilization, left: sp.uses.current } },
          );
        }
      }
      return sheets.normalizeSheet(next);
    });
    emitSheet(pending.characterId, sheet);
  }
  // Unique Effects have no automation: they are only told to the table.
  for (const u of pending.unique ?? []) {
    own.rows.push({ key: '{source}: {name}. {text}', params: { source: u.source, name: u.name, text: u.text } });
  }
  if (own.rows.length) blocks.push(own);
  return { blocks, rolls };
}
