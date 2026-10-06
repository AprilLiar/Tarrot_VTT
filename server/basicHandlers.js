import * as roster from './roster.js';
import * as sheets from './sheet.js';
import * as battle from './battle.js';
import * as actions from './basicActions.js';
import * as attack from './attack.js';
import * as library from './effectRuntime.js';
import { buildRoll } from './rolls.js';
import { createJournal } from './journal.js';
import { AppError } from './errors.js';
import { autoDc } from '../shared/statuses.js';

// Socket events for Basic Actions (shared/basicActions.js).
//  - basic:list                    the actions (everyone); `basic:actions` is sent again after every change
//  - basic:save / basic:delete     the GM edits the list
//  - basic:use { characterId, actionId }   spends the AP, makes the action's roll, puts its Effects on the user or the selected targets
//                                  and gives its Help Die: at once, as one chat card with Revert. The GM or the player of the character.
export function registerBasicHandlers({ io, db, on, requireControl, emitSheet, effects: cards, saves, authorName, shared, rooms }) {
  const send = async () => io.emit('basic:actions', { actions: await actions.listActions(db) });

  on('basic:list', { needsIdentity: true }, async () => ({ actions: await actions.listActions(db) }));
  on('basic:save', { gmOnly: true }, async (p) => {
    const saved = await actions.saveAction(db, p.id ?? null, p.action);
    await send();
    return { action: saved };
  });
  on('basic:delete', { gmOnly: true }, async (p) => {
    await actions.deleteAction(db, p.id);
    await send();
  });

  on('basic:use', { needsIdentity: true }, async ({ characterId, actionId }) => {
    const c = await requireControl(characterId);
    const action = (await actions.listActions(db)).find((a) => a.id === actionId);
    if (!action) throw new AppError('not_found', 'That Basic Action no longer exists.');
    const sheet = await sheets.getSheet(db, c.id);
    if (sheet.ap.current < action.ap) throw new AppError('no_ap', 'Not enough AP: this action costs {cost} and you have {have}.', { cost: action.ap, have: sheet.ap.current });

    // Who it is aimed at (only needed when something goes to the targets).
    const toTargets = action.effects.filter((r) => r.to === 'target');
    const needsTargets = !!action.help || toTargets.length > 0 || action.statuses.some((s) => s.to === 'target');
    const targets = [];
    if (needsTargets) {
      for (const id of await battle.effectiveTargets(db, shared, c.id)) {
        try {
          targets.push(await attack.targetInfo(db, id));
        } catch {
          // A token that has left the map is dropped.
        }
      }
      if (!targets.length) throw new AppError('no_target', 'Select at least one target first.');
    }

    const journal = createJournal();
    const own = { name: c.name, rows: [] };
    const blocks = [own];
    const spent = await journal.update(db, c.id, (s) => {
      const next = structuredClone(s);
      next.ap.current = Math.max(0, next.ap.current - action.ap);
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, spent);
    if (action.ap > 0) own.rows.push({ key: '{label} {n}.', params: { label: { t: 'AP spent', c: 'ap' }, n: { v: action.ap, c: 'ap' } } });

    // The roll, shown in the chat like any roll; what it means (a contest, a DC) is for the GM to judge.
    if (action.roll) {
      const roll = buildRoll(sheet, { kind: action.roll.kind, key: action.roll.key, ...(action.roll.kind === 'weapon' ? { attack: 'weapon' } : {}) });
      roll.title = `${action.name}: ${roll.title}`;
      await library.spendRollUses(db, c.id, roll, emitSheet);
      const message = shared.chat.add({ type: 'roll', author: await authorName(), characterId: c.id, characterName: c.name, roll });
      io.to(rooms.CHAT_ROOM).emit('chat:message', message);
    }

    // The Effects: the library resolves them (global, and the character's own).
    const cat = library.catalog(await library.listGlobal(db), sheet);
    for (const r of action.effects) {
      const def = cat.find((e) => e.id === r.id);
      if (!def) continue;
      if (r.to === 'self') {
        own.rows.push(...(await library.giveEffect(db, journal, c.id, def, action.name, emitSheet)).rows);
        continue;
      }
      for (const t of targets) {
        const token = await battle.getToken(db, t.tokenId);
        if (token.ownerKind !== 'character') continue;
        let block = blocks.find((b) => b.tokenId === t.tokenId);
        if (!block) blocks.push((block = { name: token.name, hidden: token.hidden, rows: [], tokenId: t.tokenId }));
        block.rows.push(...(await library.giveEffect(db, journal, token.ownerId, def, action.name, emitSheet)).rows);
      }
    }
    // The statuses (conditions): each lands at once, or after the Save its status asks for.
    const rolls = [];
    for (const st of action.statuses) {
      const { to: toWho, ...apply } = st;
      const who = toWho === 'self' ? [{ id: c.id, name: c.name, hidden: false, tokenId: null }] : [];
      if (toWho !== 'self') {
        for (const t of targets) {
          const token = await battle.getToken(db, t.tokenId);
          if (token.ownerKind === 'character') who.push({ id: token.ownerId, name: token.name, hidden: token.hidden, tokenId: t.tokenId });
        }
      }
      for (const w of who) {
        const dc = apply.dc === 'auto' ? autoDc(sheet) : apply.dc;
        const out = await saves.begin(journal, { characterId: w.id, name: w.name, hidden: w.hidden, apply, dc, source: action.name });
        let block = w.tokenId == null ? own : blocks.find((b) => b.tokenId === w.tokenId);
        if (!block) blocks.push((block = { name: w.name, hidden: w.hidden, rows: [], tokenId: w.tokenId }));
        block.rows.push(...out.rows);
        for (const r of out.rolls) rolls.push({ ...r, characterId: w.id });
      }
    }
    for (const r of rolls) {
      const message = shared.chat.add({ type: 'roll', author: { role: 'player', name: r.name }, characterId: r.characterId, characterName: r.name, roll: r.roll });
      io.to(rooms.CHAT_ROOM).emit('chat:message', message);
    }
    if (action.help) {
      for (const t of targets) {
        const token = await battle.getToken(db, t.tokenId);
        if (token.ownerKind !== 'character') continue;
        let block = blocks.find((b) => b.tokenId === t.tokenId);
        if (!block) blocks.push((block = { name: token.name, hidden: token.hidden, rows: [], tokenId: t.tokenId }));
        block.rows.push(...(await attack.grantBenefits(db, journal, token.ownerId, token.name, { help: { sides: action.help.sides } }, emitSheet)));
      }
    }
    const name = (await roster.getCharacter(db, c.id)).name;
    cards.post({ kind: 'action', title: { key: '{name} uses {action}.', params: { name, action: { t: action.name, c: 'effect' } } }, blocks, journal });
    return { ok: true };
  });
}
