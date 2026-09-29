import { AppError } from './errors.js';
import { cleanName } from './roster.js';

// A nested folder tree for one kind of item (scenes, temp NPCs). The table
// names come from code, never from a client, so building SQL with them is safe.
// Foreign keys are not enforced by SQLite here, so the rules live in this file:
// no cycles, and only empty folders can be deleted.

export function makeFolders({ folderTable, itemTable, itemFolderColumn = 'folder_id', label = 'folder' }) {
  const toFolder = (r) => ({
    id: Number(r.id),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    name: r.name,
  });

  async function get(db, id) {
    const r = await db.execute({ sql: `SELECT id, parent_id, name FROM ${folderTable} WHERE id = ?`, args: [id] });
    return r.rows.length ? toFolder(r.rows[0]) : null;
  }

  async function require(db, id) {
    if (!Number.isInteger(id)) throw new AppError('bad_id', `Invalid ${label}.`);
    const f = await get(db, id);
    if (!f) throw new AppError('not_found', `That ${label} no longer exists.`);
    return f;
  }

  async function orRoot(db, id) {
    if (id == null) return null;
    await require(db, id);
    return id;
  }

  return {
    orRoot,

    async list(db) {
      const r = await db.execute(`SELECT id, parent_id, name FROM ${folderTable} ORDER BY name COLLATE NOCASE`);
      return r.rows.map(toFolder);
    },

    async create(db, { name, parentId = null }) {
      const clean = cleanName(name);
      const parent = await orRoot(db, parentId);
      const r = await db.execute({
        sql: `INSERT INTO ${folderTable} (name, parent_id) VALUES (?, ?)`,
        args: [clean, parent],
      });
      return Number(r.lastInsertRowid);
    },

    async rename(db, id, name) {
      await require(db, id);
      await db.execute({ sql: `UPDATE ${folderTable} SET name = ? WHERE id = ?`, args: [cleanName(name), id] });
    },

    async move(db, id, parentId) {
      await require(db, id);
      const parent = await orRoot(db, parentId);
      for (let cur = parent; cur != null; ) {
        if (cur === id) throw new AppError('cycle', 'A folder cannot be moved inside itself.');
        cur = (await get(db, cur)).parentId;
      }
      await db.execute({ sql: `UPDATE ${folderTable} SET parent_id = ? WHERE id = ?`, args: [parent, id] });
    },

    async remove(db, id) {
      await require(db, id);
      const inside = await db.batch(
        [
          { sql: `SELECT COUNT(*) AS n FROM ${folderTable} WHERE parent_id = ?`, args: [id] },
          { sql: `SELECT COUNT(*) AS n FROM ${itemTable} WHERE ${itemFolderColumn} = ?`, args: [id] },
        ],
        'read',
      );
      if (Number(inside[0].rows[0].n) + Number(inside[1].rows[0].n) > 0) {
        throw new AppError('not_empty', 'Move or delete what is inside this folder first.');
      }
      await db.execute({ sql: `DELETE FROM ${folderTable} WHERE id = ?`, args: [id] });
    },
  };
}
