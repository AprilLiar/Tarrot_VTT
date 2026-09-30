import * as stances from './stances.js';
import { visibleStances } from '../shared/stances.js';
import { listLocks } from './locks.js';
import { stancesLocked } from '../shared/locks.js';

// Socket events for Stances (see the Stances tab in the README).
//  - stance:list   { signs (the GM's vibe texts), stances }  the GM gets everything, a player only the Stances
//                  their character knows or has learned (and `usable` when learned).
//  - stance:save   (GM) { id } to change, or { sign, parentId } to add a variation, with `stance`
//  - stance:delete (GM) { id }     a variation and everything hanging from it
//  - stance:vibe   (GM) { sign, vibe }
// After every change all clients get `stances:changed` and ask again.
export function registerStanceHandlers(ctx) {
  const { io, db, on, isGm, identity } = ctx;
  const changed = () => io.emit('stances:changed');

  on('stance:list', { needsIdentity: true }, async () => {
    const all = await stances.listAll(db);
    const vibes = await stances.listVibes(db);
    if (isGm()) return { vibes, stances: all };
    // What is locked is left out for players (the client draws a blurred picture in its place).
    const locks = await listLocks(db);
    return { vibes, stances: visibleStances(all, identity().characterId).filter((s) => !stancesLocked(locks, s.sign)) };
  });
  on('stance:save', { gmOnly: true }, async (p) => {
    const stance = await stances.saveStance(db, p);
    changed();
    return { stance };
  });
  on('stance:delete', { gmOnly: true }, async (p) => {
    await stances.deleteStance(db, p.id);
    changed();
  });
  on('stance:vibe', { gmOnly: true }, async (p) => {
    await stances.setVibe(db, p.sign, p.vibe);
    changed();
  });
}
