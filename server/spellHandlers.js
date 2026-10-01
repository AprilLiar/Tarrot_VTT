import { randomUUID } from 'node:crypto';
import * as sheets from './sheet.js';
import { buildRoll } from './rolls.js';
import { AppError } from './errors.js';
import { listLocks, lockedError } from './locks.js';
import { magicLocked, stonesLocked, combinationsLocked } from '../shared/locks.js';
import { createJournal } from './journal.js';
import { T } from '../shared/localization.js';
import { validateScheme, stonesNeeded, usesFor, stoneInfo, normalizeSpell, normalizeEffect, MAX_SPELLS, STABILIZATION_START } from '../shared/spells.js';

// Socket events for finished spells (see the Magic tab in the README).
//  - spell:craft   { characterId, draftId }  turns a legal draft into a spell: spends the stones and posts a
//                  Magic roll (against nothing, for the GM to judge the crafter's skill).
//  - spell:update  { characterId, id, patch } the owner changes name, description, icon and effect; the GM also
//                  uses, Stabilization and the Spell tattoo tag.
//  - spell:grant   (GM) { characterId, spell }   gives a character a finished spell.
//  - spell:remove  { characterId, id }
export function registerSpellHandlers(ctx) {
  const { io, db, on, requireControl, emitSheet, effects, authorName, shared, isGm, rooms } = ctx;
  const { CHAT_ROOM } = rooms;

  const find = (sheet, id) => {
    const sp = sheet.spells.find((x) => x.id === id);
    if (!sp) throw new AppError('not_found', 'That spell no longer exists.');
    return sp;
  };

  on('spell:craft', { needsIdentity: true }, async (p) => {
    const c = await requireControl(p.characterId);
    if (!isGm()) {
      const locks = await listLocks(db);
      if (magicLocked(locks) || stonesLocked(locks) || combinationsLocked(locks)) throw lockedError();
    }
    const before = await sheets.getSheet(db, c.id);
    const draft = before.spellDrafts.find((d) => d.id === p.draftId);
    if (!draft) throw new AppError('not_found', 'That draft no longer exists.');
    if (!validateScheme(draft.scheme).ok) throw new AppError('illegal', 'This scheme is illegal, so it cannot be crafted.');
    if (before.spells.length >= MAX_SPELLS) throw new AppError('limit', 'Too many spells.');

    let spell;
    const journal = createJournal();
    const sheet = await journal.update(db, c.id, (s) => {
      const next = structuredClone(s);
      for (const [sign, need] of Object.entries(stonesNeeded(draft.scheme))) {
        if (next.stones[sign] < need) {
          throw new AppError('not_enough_stones', 'You need {need} {stone} stones and have {have}.', { need, stone: { t: stoneInfo(sign).name }, have: next.stones[sign] });
        }
        next.stones[sign] -= need;
      }
      const uses = usesFor(draft.scheme);
      const id = randomUUID();
      spell = { ...normalizeSpell({ name: draft.name, description: draft.description, uses: { current: uses, max: uses }, stabilization: STABILIZATION_START }, id), id };
      next.spells.push(spell);
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, sheet);

    // The crafting roll is only for the GM to see how skilled the crafter was.
    const roll = buildRoll(sheet, { kind: 'mastery', key: 'magic' });
    roll.title = T('Spell crafting (Magic Roll)');
    const author = await authorName();
    const card = shared.chat.add({ type: 'roll', author, characterId: c.id, characterName: c.name, roll });
    io.to(CHAT_ROOM).emit('chat:message', card);
    effects.post({
      kind: 'craft',
      blocks: [{ name: c.name, rows: [{ key: '{label} {spell}.', params: { label: { t: 'Crafts', c: 'spell' }, spell: { v: spell.name, c: 'spell' } } }] }],
      journal,
    });
    return { spell };
  });

  on('spell:update', { needsIdentity: true }, async (p) => {
    const c = await requireControl(p.characterId);
    if (!isGm() && magicLocked(await listLocks(db))) throw lockedError();
    const patch = p.patch && typeof p.patch === 'object' ? p.patch : {};
    const gm = isGm();
    const gmOnly = ['uses', 'stabilization', 'tattoo'];
    if (!gm && gmOnly.some((k) => patch[k] !== undefined)) throw new AppError('forbidden', 'Only the GM can change that.');
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const next = structuredClone(s);
      const sp = find(next, p.id);
      if (sp.destroyed && !gm) throw new AppError('destroyed', 'A destroyed spell cannot be changed.');
      const merged = { ...sp, ...patch };
      if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) throw new AppError('bad_name', 'A name is required.');
      if (patch.effect !== undefined) merged.effect = normalizeEffect(patch.effect, sp.id);
      if (patch.uses !== undefined) merged.uses = { ...sp.uses, ...patch.uses };
      if (patch.uses !== undefined && merged.uses.current > 0) merged.destroyed = false;
      next.spells[next.spells.findIndex((x) => x.id === sp.id)] = { ...normalizeSpell(merged, sp.id), id: sp.id };
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, sheet);
    return { sheet };
  });

  on('spell:grant', { gmOnly: true }, async (p) => {
    const c = await requireControl(p.characterId);
    const raw = p.spell && typeof p.spell === 'object' ? p.spell : {};
    if (typeof raw.name !== 'string' || !raw.name.trim()) throw new AppError('bad_name', 'A name is required.');
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      if (s.spells.length >= MAX_SPELLS) throw new AppError('limit', 'Too many spells.');
      const next = structuredClone(s);
      const id = randomUUID();
      next.spells.push({ ...normalizeSpell(raw, id), id });
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, sheet);
    return { sheet };
  });

  on('spell:remove', { needsIdentity: true }, async (p) => {
    const c = await requireControl(p.characterId);
    if (!isGm() && magicLocked(await listLocks(db))) throw lockedError();
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const next = structuredClone(s);
      find(next, p.id);
      next.spells = next.spells.filter((x) => x.id !== p.id);
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, sheet);
    return { sheet };
  });
}
