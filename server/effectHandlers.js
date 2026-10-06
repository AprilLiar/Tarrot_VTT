import * as roster from './roster.js';
import * as sheets from './sheet.js';
import * as library from './effectRuntime.js';
import { createJournal } from './journal.js';
import { AppError } from './errors.js';

// Socket events for Effects (see shared/effects.js and server/effectRuntime.js).
//  - effect:library                      the global Effects (everyone); `effect:library` is sent again after every change
//  - effect:save / effect:delete         the GM edits the global library
//  - effect:give   { characterId, effectId }   put an Effect from the library (global or the character's own) on a character: the GM
//                                        on anyone, a player on their own PC. Posts a card with Revert.
//  - effect:remove { characterId, id }   take a running Effect off by hand
export function registerEffectHandlers({ io, db, on, requireControl, emitSheet, effects: cards }) {
  const send = async () => io.emit('effect:library', { effects: await library.listGlobal(db) });

  on('effect:library', { needsIdentity: true }, async () => ({ effects: await library.listGlobal(db) }));
  on('effect:save', { gmOnly: true }, async (p) => {
    const saved = await library.saveGlobal(db, p.id ?? null, p.effect);
    await send();
    return { effect: saved };
  });
  on('effect:delete', { gmOnly: true }, async (p) => {
    await library.deleteGlobal(db, p.id);
    await send();
  });

  on('effect:give', { needsIdentity: true }, async ({ characterId, effectId }) => {
    const c = await requireControl(characterId);
    const sheet = await sheets.getSheet(db, c.id);
    const def = library.catalog(await library.listGlobal(db), sheet).find((e) => e.id === effectId);
    if (!def) throw new AppError('not_found', 'That Effect no longer exists.');
    const journal = createJournal();
    const { rows } = await library.giveEffect(db, journal, c.id, def, '', emitSheet);
    cards.post({ kind: 'effect', blocks: [{ name: (await roster.getCharacter(db, c.id)).name, rows }], journal });
  });

  on('effect:remove', { needsIdentity: true }, async ({ characterId, id }) => {
    const c = await requireControl(characterId);
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      if (!s.effects.some((e) => e.id === id)) throw new AppError('not_found', 'That Effect is no longer running.');
      return sheets.normalizeSheet({ ...s, effects: s.effects.filter((e) => e.id !== id) });
    });
    emitSheet(c.id, sheet);
  });
}
