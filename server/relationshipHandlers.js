import * as rel from './relationships.js';
import * as roster from './roster.js';
import { AppError } from './errors.js';

// Socket events for the Relationships board (server/relationships.js). A board is the PC's player's and the GM's only; a change is told
// with `rel:changed` { pcId } to those two, who ask for the board again.
export function registerRelationshipHandlers({ io, db, on, isGm, requireControl, rooms: { GM_ROOM, charRoom } }) {
  async function requireBoard(pcId) {
    const c = await requireControl(pcId);
    if (c.type !== 'pc') throw new AppError('bad_value', 'Only a PC has a Relationships board.');
    return c.id;
  }
  const changed = (pcId) => io.to(GM_ROOM).to(charRoom(pcId)).emit('rel:changed', { pcId });

  on('rel:get', { needsIdentity: true }, async ({ pcId }) => rel.getBoard(db, await requireBoard(pcId)));

  // A player puts PCs and made-up people on their board; NPCs of the roster are added by the GM (a player does not see the roster).
  on('rel:card_add', { needsIdentity: true }, async ({ pcId, characterId, name, x, y }) => {
    const id = await requireBoard(pcId);
    if (characterId != null) {
      const c = await roster.getCharacter(db, characterId);
      if (!c) throw new AppError('not_found', 'That character no longer exists.');
      if (!isGm() && c.type !== 'pc') throw new AppError('forbidden', 'Only the GM can put an NPC on the board.');
    }
    const cardId = await rel.addCard(db, id, { characterId: characterId ?? null, name, x, y });
    changed(id);
    return { id: cardId };
  });
  on('rel:card_update', { needsIdentity: true }, async ({ id, name, note, x, y }) => {
    const pcId = await requireBoard(await rel.nodeBoard(db, id));
    await rel.updateCard(db, id, { name, note, x, y });
    changed(pcId);
  });
  on('rel:card_delete', { needsIdentity: true }, async ({ id }) => {
    const pcId = await requireBoard(await rel.nodeBoard(db, id));
    await rel.deleteCard(db, id);
    changed(pcId);
  });
  on('rel:arrow_add', { needsIdentity: true }, async ({ pcId, from, to, label, color, note }) => {
    const id = await requireBoard(pcId);
    const arrowId = await rel.addArrow(db, id, { from, to, label, color, note });
    changed(id);
    return { id: arrowId };
  });
  on('rel:arrow_update', { needsIdentity: true }, async ({ id, label, color, note }) => {
    const pcId = await requireBoard(await rel.edgeBoard(db, id));
    await rel.updateArrow(db, id, { label, color, note });
    changed(pcId);
  });
  on('rel:arrow_delete', { needsIdentity: true }, async ({ id }) => {
    const pcId = await requireBoard(await rel.edgeBoard(db, id));
    await rel.deleteArrow(db, id);
    changed(pcId);
  });
}
