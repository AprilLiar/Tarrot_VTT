import * as locks from './locks.js';
import * as roster from './roster.js';
import * as sheets from './sheet.js';

// Socket events for locks. `lock:list` -> { locks: [key] } for anyone; `lock:toggle` { key } is GM only and
// tells everyone with `locks:changed` { locks }.
export function registerLockHandlers(ctx) {
  const { io, db, on, emitSheet } = ctx;
  on('lock:list', { needsIdentity: true }, async () => ({ locks: await locks.listLocks(db) }));
  on('lock:toggle', { gmOnly: true }, async (p) => {
    const list = await locks.toggleLock(db, p.key);
    io.emit('locks:changed', { locks: list });
    // The players' sheets are sent again, emptied or filled as the locks now say.
    for (const pc of await roster.listPcs(db)) emitSheet(pc.id, await sheets.getSheet(db, pc.id));
    return { locks: list };
  });
}
