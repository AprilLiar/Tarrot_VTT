import { AppError } from './errors.js';

// Scene notes (see the README, "Scene notes and Cards"): up to 9 per scene, the GM's only, numbered 1 to 9 in the order they were made
// (deleting one moves the later ones down a number). A note is `kind` 'note' (a text: `body`) or 'card' (a cutscene card played to
// everyone: a big `title` and an optional smaller line, `body`).

export const MAX_NOTES = 9;
export const NOTE_KINDS = ['note', 'card'];
const MAX_TITLE = 120;
const MAX_BODY = 4000;

export const SCENE_NOTE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scene_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     scene_id INTEGER NOT NULL,
     position INTEGER NOT NULL,
     kind TEXT NOT NULL DEFAULT 'note',
     title TEXT NOT NULL DEFAULT '',
     body TEXT NOT NULL DEFAULT ''
   )`,
];

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const toNote = (r) => ({ id: Number(r.id), sceneId: Number(r.scene_id), number: Number(r.position), kind: r.kind === 'card' ? 'card' : 'note', title: r.title, body: r.body });

export async function listNotes(db, sceneId) {
  const r = await db.execute({ sql: 'SELECT * FROM scene_notes WHERE scene_id = ? ORDER BY position', args: [sceneId] });
  return r.rows.map(toNote);
}

export async function getNote(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid note.');
  const r = await db.execute({ sql: 'SELECT * FROM scene_notes WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That note no longer exists.');
  return toNote(r.rows[0]);
}

function clean({ kind, title, body }) {
  if (!NOTE_KINDS.includes(kind)) throw new AppError('bad_value', 'A note is a Note or a Card.');
  const t = text(title, MAX_TITLE).trim();
  if (kind === 'card' && !t) throw new AppError('bad_value', 'A Card needs a title.');
  return { kind, title: kind === 'card' ? t : '', body: text(body, MAX_BODY) };
}

export async function createNote(db, sceneId, raw) {
  const n = clean(raw);
  const count = (await listNotes(db, sceneId)).length;
  if (count >= MAX_NOTES) throw new AppError('limit', 'A scene can have at most {n} notes.', { n: MAX_NOTES });
  const r = await db.execute({
    sql: 'INSERT INTO scene_notes (scene_id, position, kind, title, body) VALUES (?, ?, ?, ?, ?)',
    args: [sceneId, count + 1, n.kind, n.title, n.body],
  });
  return Number(r.lastInsertRowid);
}

export async function updateNote(db, id, raw) {
  await getNote(db, id);
  const n = clean(raw);
  await db.execute({ sql: 'UPDATE scene_notes SET kind = ?, title = ?, body = ? WHERE id = ?', args: [n.kind, n.title, n.body, id] });
}

export async function deleteNote(db, id) {
  const note = await getNote(db, id);
  await db.execute({ sql: 'DELETE FROM scene_notes WHERE id = ?', args: [id] });
  await db.execute({ sql: 'UPDATE scene_notes SET position = position - 1 WHERE scene_id = ? AND position > ?', args: [note.sceneId, note.number] });
  return note;
}

export async function deleteSceneNotes(db, sceneId) {
  await db.execute({ sql: 'DELETE FROM scene_notes WHERE scene_id = ?', args: [sceneId] });
}
