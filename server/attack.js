import * as D from '../shared/rules-data.js';
import { computeTarget, DAMAGE_KINDS, DEFAULT_CRIT } from '../shared/damage.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import { AppError } from './errors.js';

// Attacks. A player (or the GM, for an NPC) rolls a Combat Mastery from the sheet; the roll waits as a
// "pending attack" in server memory until the GM confirms it on a card. The card carries every number
// (roll, Defence, base damage, damage type, AP, statuses, targets) and the GM can change any of them.
// Applying works the damage out per target through that target's resistances and updates the sheets.

export const MAX_PENDING = 30;
export const MAX_TARGETS = 30;
const int = (v, min, max, what) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new AppError('bad_value', `${what} must be a whole number from ${min} to ${max}.`);
  return v;
};

// The numbers the card needs about a target token: its name, Defences, resistances and HP.
export async function targetInfo(db, tokenId) {
  const token = await battle.getToken(db, tokenId);
  const base = { tokenId: token.id, name: token.name, ownerKind: token.ownerKind, hidden: token.hidden };
  if (token.ownerKind !== 'character') return { ...base, sheet: false };
  const sheet = await sheets.getSheet(db, token.ownerId);
  return { ...base, sheet: true, defence: sheet.defence, resistances: sheet.resistances, hp: sheet.hp };
}

// Checks and cleans what the GM sends from the card.
export function cleanApply(pending, input) {
  const i = input ?? {};
  const kind = i.kind;
  if (!DAMAGE_KINDS.includes(kind)) throw new AppError('bad_value', 'Choose a damage type.');
  if (!Array.isArray(i.targets) || i.targets.length < 1 || i.targets.length > MAX_TARGETS) {
    throw new AppError('bad_value', `An attack needs 1 to ${MAX_TARGETS} targets.`);
  }
  const seen = new Set();
  const targets = i.targets.map((t) => {
    if (!Number.isInteger(t?.tokenId) || seen.has(t.tokenId)) throw new AppError('bad_value', 'Each target can be listed once.');
    seen.add(t.tokenId);
    if (t.defenceKind !== 'physical' && t.defenceKind !== 'mental') throw new AppError('bad_value', 'Defence must be Physical or Mental.');
    return {
      tokenId: t.tokenId,
      defenceKind: t.defenceKind,
      defence: int(t.defence, -99, 999, 'Defence'),
      override: t.override == null ? null : int(t.override, 0, 9999, 'Damage'),
    };
  });
  const statuses = (Array.isArray(i.statuses) ? i.statuses : []).map((s) => {
    const info = D.STATUSES.find((x) => x.key === s?.key);
    if (!info) throw new AppError('bad_value', 'Unknown status.');
    return { key: info.key, name: info.name, stackable: info.stackable, stacks: int(s.stacks, 1, 10, 'Status stacks') };
  });
  return {
    total: int(i.total ?? pending.roll.total, -999, 999, 'Attack total'),
    natural: int(i.natural ?? pending.roll.natural, 1, 20, 'Natural roll'),
    critThreshold: int(i.critThreshold ?? DEFAULT_CRIT, 2, 20, 'Critical range'),
    base: int(i.base, 0, 999, 'Base damage'),
    kind,
    ap: int(i.ap ?? pending.ap, 0, 20, 'AP cost'),
    exposed: i.exposed === true,
    statuses,
    targets,
  };
}

const capitalise = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Applies a confirmed attack. `emitSheet(characterId, sheet)` tells the sheets' viewers.
// -> { lines: [{ text, hidden }] }  the result lines for the chat
export async function applyAttack(db, pending, clean, { emitSheet }) {
  const lines = [];
  const attackerName = pending.characterName;

  for (const t of clean.targets) {
    const token = await battle.getToken(db, t.tokenId);
    const label = `${capitalise(t.defenceKind)} Defence`;
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

    let text = `${attackerName} attacks ${token.name} (${pending.masteryLabel}): ${clean.total} vs ${label} ${t.defence}, ${result.label}.`;
    if (result.hit) {
      const bonus = result.bonus ? ` + ${result.bonus}` : '';
      text += ` Damage ${clean.base}${bonus} = ${result.raw}`;
      if (clean.kind !== 'true') text += ` ${clean.kind}`;
      if (result.steps.length) text += ` (${result.steps.join(', ')})`;
      if (result.overridden) text += `, set by the GM to ${result.damage}`;
      text += result.heal ? `. Heals ${result.heal}.` : `. ${result.damage} damage.`;
      if (hp) text += ` HP ${hp.before} to ${hp.after}.`;
      else if (!isChar) text += ' (temporary NPC: no sheet, apply by hand)';
      if (isChar && clean.statuses.length) text += ` Adds ${clean.statuses.map((s) => (s.stackable ? `${s.name} ${s.stacks}` : s.name)).join(', ')}.`;
    }
    lines.push({ text, hidden: token.hidden });
  }

  // The attacker pays AP and, on a natural 1, may gain Exposed.
  if (pending.characterId != null && (clean.ap > 0 || clean.exposed)) {
    const sheet = await sheets.updateSheet(db, pending.characterId, (s) => {
      const next = structuredClone(s);
      next.ap.current = Math.max(0, next.ap.current - clean.ap);
      if (clean.exposed) next.statuses = { ...next.statuses, exposed: (next.statuses?.exposed ?? 0) + 1 };
      return sheets.normalizeSheet(next);
    });
    emitSheet(pending.characterId, sheet);
    if (clean.ap > 0) lines.push({ text: `${attackerName} spends ${clean.ap} AP.`, hidden: false });
    if (clean.exposed) lines.push({ text: `${attackerName} gains Exposed 1 (natural 1).`, hidden: false });
  }
  return { lines };
}
