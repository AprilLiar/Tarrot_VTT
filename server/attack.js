import * as D from '../shared/rules-data.js';
import { computeTarget, applyResistance, hitParam, DAMAGE_KINDS, DEFAULT_CRIT } from '../shared/damage.js';
import { joinMsgs } from '../shared/localization.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import { AppError } from './errors.js';

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
    const info = D.STATUSES.find((x) => x.key === s?.key);
    if (!info) throw new AppError('bad_value', 'Unknown status.');
    return { key: info.key, name: info.name, stackable: info.stackable, stacks: int(s.stacks, 1, 10, 'Status stacks') };
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

// Applies a confirmed attack. `emitSheet(characterId, sheet)` tells the sheets' viewers.
// -> { lines: [{ message, hidden }] }  the result lines for the chat, as messages { key, params }
export async function applyAttack(db, pending, clean, { emitSheet }) {
  const lines = [];
  const attackerName = pending.characterName;

  for (const t of clean.targets) {
    const token = await battle.getToken(db, t.tokenId);
    let hp = null;
    let result;
    const isChar = token.ownerKind === 'character';
    const work = (resistance) =>
      computeTarget({ total: clean.total, natural: clean.natural, critThreshold: clean.critThreshold, defence: t.defence, base: clean.base, kind: clean.kind, resistance, override: t.override });

    if (isChar) {
      const sheet = await sheets.updateSheet(db, token.ownerId, (s) => {
        result = work(s.resistances?.[clean.kind]);
        const next = structuredClone(s);
        if (result.hit) {
          const before = next.hp.current;
          next.hp.current = Math.min(next.hp.max, Math.max(0, before - result.damage + result.heal));
          hp = { before, after: next.hp.current };
          for (const st of clean.statuses) {
            const have = next.statuses?.[st.key] ?? 0;
            next.statuses = { ...next.statuses, [st.key]: st.stackable ? have + st.stacks : 1 };
          }
        }
        return sheets.normalizeSheet(next);
      });
      emitSheet(token.ownerId, sheet);
    } else {
      result = work(null);
    }

    // One chat line, built from sentences so every reader gets it in their own language.
    const sentences = [
      {
        key: '{attacker} attacks {target} with {weapon}: {total} vs {defence} {value}, {result}.',
        params: {
          attacker: attackerName,
          target: token.name,
          weapon: pending.weaponName,
          total: clean.total,
          defence: { t: `${capitalise(t.defenceKind)} Defence` },
          value: t.defence,
          result: hitParam(result),
        },
      },
    ];
    if (result.hit) {
      const formula = result.bonus ? `${clean.base} + ${result.bonus} = ${result.raw}` : `${clean.base} = ${result.raw}`;
      sentences.push(
        clean.kind === 'true'
          ? { key: 'Damage {formula}.', params: { formula } }
          : { key: 'Damage {formula} {kind}.', params: { formula, kind: { t: capitalise(clean.kind) } } },
      );
      if (result.steps.length) sentences.push({ key: 'After resistances: {steps}.', params: { steps: joinMsgs(result.steps) } });
      if (result.overridden) sentences.push({ key: 'Set by the GM to {n}.', params: { n: result.damage } });
      sentences.push(result.heal ? { key: 'Heals {n}.', params: { n: result.heal } } : { key: '{n} damage.', params: { n: result.damage } });
      if (hp) sentences.push({ key: 'HP {from} to {to}.', params: { from: hp.before, to: hp.after } });
      else if (!isChar) sentences.push({ key: '(temporary NPC: no sheet, apply by hand)' });
      if (isChar && clean.statuses.length) {
        const list = clean.statuses.map((s) => ({ t: s.stackable ? `${s.name} ${s.stacks}` : s.name }));
        sentences.push({ key: 'Adds {list}.', params: { list: joinMsgs(list) } });
      }
    }
    lines.push({ message: joinSentences(sentences), hidden: token.hidden });
  }

  // The attacker pays: AP, the Enhancements' costs (damage, statuses, item uses), and on a natural 1 gains Exposed.
  const costs = pending.costs ?? { damage: [], statuses: [], items: [] };
  const pays = clean.ap > 0 || clean.exposed || costs.damage.length || costs.statuses.length || costs.items.length;
  if (pending.characterId != null && pays) {
    const notes = [];
    const sheet = await sheets.updateSheet(db, pending.characterId, (s) => {
      const next = structuredClone(s);
      next.ap.current = Math.max(0, next.ap.current - clean.ap);
      if (clean.exposed) next.statuses = { ...next.statuses, exposed: (next.statuses?.exposed ?? 0) + 1 };
      for (const d of costs.damage) {
        const res = d.kind === 'true' ? { damage: d.amount, heal: 0 } : applyResistance(next.resistances?.[d.kind], d.amount);
        const before = next.hp.current;
        next.hp.current = Math.min(next.hp.max, Math.max(0, before - res.damage + res.heal));
        notes.push({ key: '{name} takes {n} {kind} damage as a cost (HP {from} to {to}).', params: { name: attackerName, n: res.damage, kind: { t: d.kind === 'true' ? 'True' : capitalise(d.kind) }, from: before, to: next.hp.current } });
      }
      for (const st of costs.statuses) {
        const info = D.STATUSES.find((x) => x.key === st.key);
        if (!info) continue;
        const have = next.statuses?.[st.key] ?? 0;
        next.statuses = { ...next.statuses, [st.key]: info.stackable ? have + st.stacks : 1 };
        notes.push({ key: '{name} gains {status} as a cost.', params: { name: attackerName, status: { t: info.stackable ? `${info.name} ${st.stacks}` : info.name } } });
      }
      for (const c of costs.items) {
        const item = next.items.find((i) => i.id === c.itemId);
        if (!item) continue;
        item.uses.current = Math.max(0, item.uses.current - c.uses);
        notes.push({ key: '{name} spends {n} uses of {item}.', params: { name: attackerName, n: c.uses, item: item.name } });
      }
      return sheets.normalizeSheet(next);
    });
    emitSheet(pending.characterId, sheet);
    if (clean.ap > 0) lines.push({ message: { key: '{name} spends {n} AP.', params: { name: attackerName, n: clean.ap } }, hidden: false });
    for (const m of notes) lines.push({ message: m, hidden: false });
    if (clean.exposed) lines.push({ message: { key: '{name} gains Exposed 1 (natural 1).', params: { name: attackerName } }, hidden: false });
  }
  // Unique Effects have no automation: they are only told to the table.
  for (const u of pending.unique ?? []) {
    lines.push({ message: { key: '{source}: {name}. {text}', params: { source: u.source, name: u.name, text: u.text } }, hidden: false });
  }
  return { lines };
}

// Sentences joined into one message: "first. second. third."
const joinSentences = (list) => joinMsgs(list.map((m) => ({ key: m.key, params: m.params })), ' ');
