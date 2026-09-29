// Character roster: folders and characters (PC / NPC). Sheet contents arrive
// in Phase 3; for now a character is a name, a type and a folder.
//
// SQLite does not enforce foreign keys by default, so every relationship
// rule (no cycles, no deleting non-empty folders) is checked here.

export const NAME_MAX = 60;
export const TYPES = ['pc', 'npc'];

export class RosterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ROSTER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS character_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     parent_id INTEGER REFERENCES character_folders(id),
     name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS characters (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('pc', 'npc')),
     folder_id INTEGER REFERENCES character_folders(id),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

export function cleanName(value) {
  if (typeof value !== 'string') throw new RosterError('bad_name', 'A name is required.');
  const name = value.trim();
  if (!name) throw new RosterError('bad_name', 'A name is required.');
  if (name.length > NAME_MAX) {
    throw new RosterError('bad_name', `Names can be at most ${NAME_MAX} characters.`);
  }
  return name;
}

function cleanId(value, what) {
  if (!Number.isInteger(value)) throw new RosterError('bad_id', `Invalid ${what}.`);
  return value;
}

const toFolder = (r) => ({
  id: Number(r.id),
  parentId: r.parent_id == null ? null : Number(r.parent_id),
  name: r.name,
});
const toCharacter = (r) => ({
  id: Number(r.id),
  name: r.name,
  type: r.type,
  folderId: r.folder_id == null ? null : Number(r.folder_id),
});

export async function listRoster(db) {
  const [folders, characters] = await Promise.all([
    db.execute('SELECT id, parent_id, name FROM character_folders ORDER BY name COLLATE NOCASE'),
    db.execute('SELECT id, name, type, folder_id FROM characters ORDER BY name COLLATE NOCASE'),
  ]);
  return { folders: folders.rows.map(toFolder), characters: characters.rows.map(toCharacter) };
}

// What the picker needs: PCs only, never NPCs.
export async function listPcs(db) {
  const r = await db.execute(
    "SELECT id, name FROM characters WHERE type = 'pc' ORDER BY name COLLATE NOCASE",
  );
  return r.rows.map((row) => ({ id: Number(row.id), name: row.name }));
}

export async function getCharacter(db, id) {
  if (!Number.isInteger(id)) return null;
  const r = await db.execute({
    sql: 'SELECT id, name, type, folder_id FROM characters WHERE id = ?',
    args: [id],
  });
  return r.rows.length ? toCharacter(r.rows[0]) : null;
}

async function getFolder(db, id) {
  const r = await db.execute({
    sql: 'SELECT id, parent_id, name FROM character_folders WHERE id = ?',
    args: [id],
  });
  return r.rows.length ? toFolder(r.rows[0]) : null;
}

async function requireFolderOrRoot(db, folderId) {
  if (folderId == null) return null;
  cleanId(folderId, 'folder');
  if (!(await getFolder(db, folderId))) {
    throw new RosterError('not_found', 'That folder no longer exists.');
  }
  return folderId;
}

async function requireFolder(db, id) {
  cleanId(id, 'folder');
  const f = await getFolder(db, id);
  if (!f) throw new RosterError('not_found', 'That folder no longer exists.');
  return f;
}

async function requireCharacter(db, id) {
  const c = await getCharacter(db, id);
  if (!c) throw new RosterError('not_found', 'That character no longer exists.');
  return c;
}

export async function createCharacter(db, { name, type, folderId = null }) {
  const clean = cleanName(name);
  if (!TYPES.includes(type)) throw new RosterError('bad_type', 'Type must be PC or NPC.');
  const folder = await requireFolderOrRoot(db, folderId);
  const r = await db.execute({
    sql: 'INSERT INTO characters (name, type, folder_id) VALUES (?, ?, ?)',
    args: [clean, type, folder],
  });
  return Number(r.lastInsertRowid);
}

export async function renameCharacter(db, id, name) {
  await requireCharacter(db, id);
  await db.execute({
    sql: 'UPDATE characters SET name = ? WHERE id = ?',
    args: [cleanName(name), id],
  });
}

export async function moveCharacter(db, id, folderId) {
  await requireCharacter(db, id);
  const folder = await requireFolderOrRoot(db, folderId);
  await db.execute({ sql: 'UPDATE characters SET folder_id = ? WHERE id = ?', args: [folder, id] });
}

// Permanent. The caller must type the character's exact name.
export async function deleteCharacter(db, id, confirmName) {
  const c = await requireCharacter(db, id);
  if (typeof confirmName !== 'string' || confirmName.trim() !== c.name) {
    throw new RosterError('confirm_mismatch', 'Type the exact name to confirm deletion.');
  }
  await db.execute({ sql: 'DELETE FROM characters WHERE id = ?', args: [id] });
  return c;
}

export async function createFolder(db, { name, parentId = null }) {
  const clean = cleanName(name);
  const parent = await requireFolderOrRoot(db, parentId);
  const r = await db.execute({
    sql: 'INSERT INTO character_folders (name, parent_id) VALUES (?, ?)',
    args: [clean, parent],
  });
  return Number(r.lastInsertRowid);
}

export async function renameFolder(db, id, name) {
  await requireFolder(db, id);
  await db.execute({
    sql: 'UPDATE character_folders SET name = ? WHERE id = ?',
    args: [cleanName(name), id],
  });
}

export async function moveFolder(db, id, parentId) {
  await requireFolder(db, id);
  const parent = await requireFolderOrRoot(db, parentId);
  // A folder cannot move into itself or any of its own descendants.
  for (let cur = parent; cur != null; ) {
    if (cur === id) throw new RosterError('cycle', 'A folder cannot be moved inside itself.');
    cur = (await getFolder(db, cur)).parentId;
  }
  await db.execute({
    sql: 'UPDATE character_folders SET parent_id = ? WHERE id = ?',
    args: [parent, id],
  });
}

// Only empty folders can be deleted, so nothing is lost by accident.
export async function deleteFolder(db, id) {
  await requireFolder(db, id);
  const inside = await db.batch(
    [
      { sql: 'SELECT COUNT(*) AS n FROM character_folders WHERE parent_id = ?', args: [id] },
      { sql: 'SELECT COUNT(*) AS n FROM characters WHERE folder_id = ?', args: [id] },
    ],
    'read',
  );
  if (Number(inside[0].rows[0].n) + Number(inside[1].rows[0].n) > 0) {
    throw new RosterError('not_empty', 'Move or delete what is inside this folder first.');
  }
  await db.execute({ sql: 'DELETE FROM character_folders WHERE id = ?', args: [id] });
}
