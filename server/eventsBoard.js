import { AppError } from './errors.js';

// The Events board (see the README, "Events board"): lanes of sticky notes. The GM makes the lanes, each seen by Everyone or by the GM
// only. Anyone writes notes (up to 280 characters, one of five colours) in the lanes they can see; the author or the GM edits or deletes a
// note; anyone drags notes within and between the lanes they can see.

export const NOTE_MAX = 280;
export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'violet'];
export const LANE_VISIBILITY = ['all', 'gm'];
const LANE_NAME_MAX = 60;
const MAX_LANES = 12;
const MAX_NOTES = 400;

export const EVENTS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS event_lanes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     position INTEGER NOT NULL,
     visibility TEXT NOT NULL DEFAULT 'all'
   )`,
  `CREATE TABLE IF NOT EXISTS event_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     lane_id INTEGER NOT NULL,
     position INTEGER NOT NULL,
     text TEXT NOT NULL,
     color TEXT NOT NULL DEFAULT 'yellow',
     author_role TEXT NOT NULL,
     author_character_id INTEGER,
     author_name TEXT NOT NULL
   )`,
];

const toLane = (r) => ({ id: Number(r.id), name: r.name, position: Number(r.position), visibility: r.visibility === 'gm' ? 'gm' : 'all' });
const toNote = (r) => ({
  id: Number(r.id),
  laneId: Number(r.lane_id),
  position: Number(r.position),
  text: r.text,
  color: NOTE_COLORS.includes(r.color) ? r.color : 'yellow',
  author: { role: r.author_role, characterId: r.author_character_id == null ? null : Number(r.author_character_id), name: r.author_name },
});

function cleanLaneName(v) {
  const name = typeof v === 'string' ? v.trim().slice(0, LANE_NAME_MAX) : '';
  if (!name) throw new AppError('bad_value', 'Give the lane a name.');
  return name;
}

function cleanVisibility(v) {
  if (!LANE_VISIBILITY.includes(v)) throw new AppError('bad_value', 'A lane is for Everyone or for the GM only.');
  return v;
}

function cleanText(v) {
  const text = typeof v === 'string' ? v.trim() : '';
  if (!text) throw new AppError('bad_text', 'Write something first.');
  if (text.length > NOTE_MAX) throw new AppError('bad_text', 'A note can be at most {max} characters.', { max: NOTE_MAX });
  return text;
}

function cleanColor(v) {
  if (!NOTE_COLORS.includes(v)) throw new AppError('bad_value', 'Choose one of the five colours.');
  return v;
}

// The board as someone sees it: the GM everything, anyone else the lanes for Everyone and their notes.
export async function getBoard(db, { gm }) {
  const [lanes, notes] = await Promise.all([
    db.execute('SELECT * FROM event_lanes ORDER BY position, id'),
    db.execute('SELECT * FROM event_notes ORDER BY position, id'),
  ]);
  const visible = lanes.rows.map(toLane).filter((l) => gm || l.visibility === 'all');
  const ids = new Set(visible.map((l) => l.id));
  return { lanes: visible, notes: notes.rows.map(toNote).filter((n) => ids.has(n.laneId)) };
}

export async function getLane(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid lane.');
  const r = await db.execute({ sql: 'SELECT * FROM event_lanes WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That lane no longer exists.');
  return toLane(r.rows[0]);
}

export async function getNote(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid note.');
  const r = await db.execute({ sql: 'SELECT * FROM event_notes WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That note no longer exists.');
  return toNote(r.rows[0]);
}

// A lane someone may use: a GM-only lane is invisible (not found) to anyone but the GM.
export async function laneFor(db, id, gm) {
  const lane = await getLane(db, id);
  if (!gm && lane.visibility !== 'all') throw new AppError('not_found', 'That lane no longer exists.');
  return lane;
}

export async function createLane(db, { name, visibility }) {
  const clean = { name: cleanLaneName(name), visibility: cleanVisibility(visibility) };
  const r = await db.execute('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM event_lanes');
  if (Number(r.rows[0].n) >= MAX_LANES) throw new AppError('limit', 'The board can have at most {n} lanes.', { n: MAX_LANES });
  const ins = await db.execute({ sql: 'INSERT INTO event_lanes (name, position, visibility) VALUES (?, ?, ?)', args: [clean.name, Number(r.rows[0].p) + 1, clean.visibility] });
  return Number(ins.lastInsertRowid);
}

export async function updateLane(db, id, { name, visibility }) {
  const lane = await getLane(db, id);
  await db.execute({
    sql: 'UPDATE event_lanes SET name = ?, visibility = ? WHERE id = ?',
    args: [name === undefined ? lane.name : cleanLaneName(name), visibility === undefined ? lane.visibility : cleanVisibility(visibility), id],
  });
}

// Moves a lane one place left (-1) or right (+1).
export async function shiftLane(db, id, by) {
  if (by !== 1 && by !== -1) throw new AppError('bad_value', 'A lane moves one place at a time.');
  await getLane(db, id);
  const lanes = (await db.execute('SELECT * FROM event_lanes ORDER BY position, id')).rows.map(toLane);
  const i = lanes.findIndex((l) => l.id === id);
  const j = i + by;
  if (j < 0 || j >= lanes.length) return;
  [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  await db.batch(
    lanes.map((l, k) => ({ sql: 'UPDATE event_lanes SET position = ? WHERE id = ?', args: [k + 1, l.id] })),
    'write',
  );
}

export async function deleteLane(db, id) {
  await getLane(db, id);
  await db.batch(
    [
      { sql: 'DELETE FROM event_notes WHERE lane_id = ?', args: [id] },
      { sql: 'DELETE FROM event_lanes WHERE id = ?', args: [id] },
    ],
    'write',
  );
}

export async function createNote(db, laneId, { text, color }, author) {
  const clean = { text: cleanText(text), color: cleanColor(color) };
  const r = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM event_notes', args: [] });
  if (Number(r.rows[0].n) >= MAX_NOTES) throw new AppError('limit', 'The board can have at most {n} notes.', { n: MAX_NOTES });
  const p = await db.execute({ sql: 'SELECT COALESCE(MAX(position), 0) AS p FROM event_notes WHERE lane_id = ?', args: [laneId] });
  const ins = await db.execute({
    sql: 'INSERT INTO event_notes (lane_id, position, text, color, author_role, author_character_id, author_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [laneId, Number(p.rows[0].p) + 1, clean.text, clean.color, author.role, author.characterId ?? null, author.name],
  });
  return Number(ins.lastInsertRowid);
}

export async function updateNote(db, id, { text, color }) {
  const note = await getNote(db, id);
  await db.execute({
    sql: 'UPDATE event_notes SET text = ?, color = ? WHERE id = ?',
    args: [text === undefined ? note.text : cleanText(text), color === undefined ? note.color : cleanColor(color), id],
  });
}

export async function deleteNote(db, id) {
  await getNote(db, id);
  await db.execute({ sql: 'DELETE FROM event_notes WHERE id = ?', args: [id] });
}

// Puts a note into a lane at `index` (0 = the top); the notes of both lanes are numbered again.
export async function moveNote(db, id, laneId, index) {
  const note = await getNote(db, id);
  const others = (await db.execute({ sql: 'SELECT * FROM event_notes WHERE lane_id = ? AND id != ? ORDER BY position, id', args: [laneId, id] })).rows.map(toNote);
  const at = Math.max(0, Math.min(others.length, Number.isInteger(index) ? index : others.length));
  others.splice(at, 0, { ...note, laneId });
  const stmts = others.map((n, k) => ({ sql: 'UPDATE event_notes SET lane_id = ?, position = ? WHERE id = ?', args: [laneId, k + 1, n.id] }));
  await db.batch(stmts, 'write');
}

// The author of a note, or the GM.
export const mayEdit = (note, identity) => identity?.role === 'gm' || (identity?.role === 'player' && note.author.role === 'player' && note.author.characterId === identity.characterId);
