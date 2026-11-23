import * as board from './eventsBoard.js';
import { AppError } from './errors.js';

// Socket events for the Events board (server/eventsBoard.js). Any change is told with `events:changed` (no data), and each screen asks
// for the board again with `events:get`, so nobody is ever sent a lane they may not see.
export function registerEventsHandlers({ io, db, on, isGm, isPlayer, identity, authorName }) {
  const changed = () => io.emit('events:changed');
  const requireSeat = () => {
    if (!isGm() && !isPlayer()) throw new AppError('forbidden', 'The Display Screen has no Events board.');
  };
  const requireEdit = async (id) => {
    const note = await board.getNote(db, id);
    await board.laneFor(db, note.laneId, isGm());
    if (!board.mayEdit(note, identity())) throw new AppError('forbidden', 'Only its author or the GM can change this note.');
    return note;
  };

  on('events:get', { needsIdentity: true }, () => {
    requireSeat();
    return board.getBoard(db, { gm: isGm() });
  });

  on('lane:create', { gmOnly: true }, async ({ name, visibility }) => {
    const id = await board.createLane(db, { name, visibility });
    changed();
    return { id };
  });
  on('lane:update', { gmOnly: true }, async ({ id, name, visibility }) => {
    await board.updateLane(db, id, { name, visibility });
    changed();
  });
  on('lane:shift', { gmOnly: true }, async ({ id, by }) => {
    await board.shiftLane(db, id, by);
    changed();
  });
  on('lane:delete', { gmOnly: true }, async ({ id }) => {
    await board.deleteLane(db, id);
    changed();
  });

  on('event_note:create', { needsIdentity: true }, async ({ laneId, text, color }) => {
    requireSeat();
    await board.laneFor(db, laneId, isGm());
    const author = { ...(await authorName()), characterId: identity().characterId ?? null };
    const id = await board.createNote(db, laneId, { text, color }, author);
    changed();
    return { id };
  });
  on('event_note:update', { needsIdentity: true }, async ({ id, text, color }) => {
    requireSeat();
    await requireEdit(id);
    await board.updateNote(db, id, { text, color });
    changed();
  });
  on('event_note:delete', { needsIdentity: true }, async ({ id }) => {
    requireSeat();
    await requireEdit(id);
    await board.deleteNote(db, id);
    changed();
  });
  // Anyone moves any note they can see, into any lane they can see.
  on('event_note:move', { needsIdentity: true }, async ({ id, laneId, index }) => {
    requireSeat();
    const note = await board.getNote(db, id);
    await board.laneFor(db, note.laneId, isGm());
    await board.laneFor(db, laneId, isGm());
    await board.moveNote(db, id, laneId, index);
    changed();
  });
}
