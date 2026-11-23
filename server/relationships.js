import { AppError } from './errors.js';

// The Relationships board (see the README, "Relationships board"): one per PC, seen only by its player and the GM. Cards are characters
// of the roster (the PC itself is always there) or people made up on the board; arrows between two cards have a name, a colour and a note,
// and point one way (both ways is two arrows).

export const ARROW_COLORS = ['green', 'red', 'amber', 'blue', 'violet', 'slate'];
export const BOARD_W = 1600;
export const BOARD_H = 1000;
const MAX_NODES = 60;
const MAX_EDGES = 150;
const NAME_MAX = 60;
const LABEL_MAX = 60;
const NOTE_MAX = 1000;

export const RELATIONSHIP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rel_nodes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pc_id INTEGER NOT NULL,
     character_id INTEGER,
     name TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     x REAL NOT NULL DEFAULT 0,
     y REAL NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS rel_edges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pc_id INTEGER NOT NULL,
     from_id INTEGER NOT NULL,
     to_id INTEGER NOT NULL,
     label TEXT NOT NULL DEFAULT '',
     color TEXT NOT NULL DEFAULT 'slate',
     note TEXT NOT NULL DEFAULT ''
   )`,
];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampX = (v) => Math.min(BOARD_W, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : BOARD_W / 2));
const clampY = (v) => Math.min(BOARD_H, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : BOARD_H / 2));

function cleanColor(v) {
  if (!ARROW_COLORS.includes(v)) throw new AppError('bad_value', 'Choose one of the arrow colours.');
  return v;
}

// The board, with each roster card's current name and Portrait. Cards of deleted characters are dropped (with their arrows).
export async function getBoard(db, pcId) {
  await ensureSelf(db, pcId);
  const [nodes, edges] = await Promise.all([
    db.execute({
      sql: `SELECT n.*, c.name AS cname, c.type AS ctype, c.portrait_image_id AS cportrait, c.portrait_crop AS ccrop
            FROM rel_nodes n LEFT JOIN characters c ON c.id = n.character_id WHERE n.pc_id = ? ORDER BY n.id`,
      args: [pcId],
    }),
    db.execute({ sql: 'SELECT * FROM rel_edges WHERE pc_id = ? ORDER BY id', args: [pcId] }),
  ]);
  const cards = [];
  for (const r of nodes.rows) {
    const characterId = r.character_id == null ? null : Number(r.character_id);
    if (characterId != null && r.cname == null) continue; // that character was deleted
    let crop = null;
    try {
      crop = r.ccrop ? JSON.parse(r.ccrop) : null;
    } catch {}
    cards.push({
      id: Number(r.id),
      characterId,
      self: characterId === pcId,
      kind: characterId == null ? 'person' : r.ctype,
      name: characterId == null ? r.name : r.cname,
      portraitImageId: r.cportrait ?? null,
      portraitCrop: crop,
      note: r.note,
      x: Number(r.x),
      y: Number(r.y),
    });
  }
  const ids = new Set(cards.map((c) => c.id));
  const arrows = edges.rows
    .map((r) => ({ id: Number(r.id), from: Number(r.from_id), to: Number(r.to_id), label: r.label, color: ARROW_COLORS.includes(r.color) ? r.color : 'slate', note: r.note }))
    .filter((e) => ids.has(e.from) && ids.has(e.to));
  return { cards, arrows };
}

// The PC's own card is always on its board, in the middle at first.
async function ensureSelf(db, pcId) {
  const r = await db.execute({ sql: 'SELECT id FROM rel_nodes WHERE pc_id = ? AND character_id = ?', args: [pcId, pcId] });
  if (r.rows.length) return;
  await db.execute({ sql: 'INSERT INTO rel_nodes (pc_id, character_id, x, y) VALUES (?, ?, ?, ?)', args: [pcId, pcId, BOARD_W / 2, BOARD_H / 2] });
}

async function getNode(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid card.');
  const r = await db.execute({ sql: 'SELECT * FROM rel_nodes WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That card no longer exists.');
  const n = r.rows[0];
  return { id: Number(n.id), pcId: Number(n.pc_id), characterId: n.character_id == null ? null : Number(n.character_id) };
}

async function getEdge(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid arrow.');
  const r = await db.execute({ sql: 'SELECT * FROM rel_edges WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That arrow no longer exists.');
  return { id: Number(r.rows[0].id), pcId: Number(r.rows[0].pc_id) };
}

// -> the board (PC) a card or an arrow belongs to, so the caller can check who may change it.
export const nodeBoard = async (db, id) => (await getNode(db, id)).pcId;
export const edgeBoard = async (db, id) => (await getEdge(db, id)).pcId;

// A card for a roster character (`characterId`) or a made-up person (`name`).
export async function addCard(db, pcId, { characterId, name, x, y }) {
  const count = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM rel_nodes WHERE pc_id = ?', args: [pcId] });
  if (Number(count.rows[0].n) >= MAX_NODES) throw new AppError('limit', 'A board can have at most {n} cards.', { n: MAX_NODES });
  if (characterId != null) {
    if (!Number.isInteger(characterId)) throw new AppError('bad_id', 'Invalid card.');
    const dup = await db.execute({ sql: 'SELECT id FROM rel_nodes WHERE pc_id = ? AND character_id = ?', args: [pcId, characterId] });
    if (dup.rows.length) throw new AppError('duplicate', 'That character is already on the board.');
  } else if (!str(name, NAME_MAX)) throw new AppError('bad_value', 'Give the person a name.');
  const r = await db.execute({
    sql: 'INSERT INTO rel_nodes (pc_id, character_id, name, x, y) VALUES (?, ?, ?, ?, ?)',
    args: [pcId, characterId ?? null, characterId != null ? '' : str(name, NAME_MAX), clampX(x), clampY(y)],
  });
  return Number(r.lastInsertRowid);
}

export async function updateCard(db, id, { name, note, x, y }) {
  const n = await getNode(db, id);
  const sets = [];
  const args = [];
  if (name !== undefined && n.characterId == null) {
    const clean = str(name, NAME_MAX);
    if (!clean) throw new AppError('bad_value', 'Give the person a name.');
    sets.push('name = ?');
    args.push(clean);
  }
  if (note !== undefined) {
    sets.push('note = ?');
    args.push(typeof note === 'string' ? note.slice(0, NOTE_MAX) : '');
  }
  if (x !== undefined) {
    sets.push('x = ?');
    args.push(clampX(x));
  }
  if (y !== undefined) {
    sets.push('y = ?');
    args.push(clampY(y));
  }
  if (sets.length) await db.execute({ sql: `UPDATE rel_nodes SET ${sets.join(', ')} WHERE id = ?`, args: [...args, id] });
}

export async function deleteCard(db, id) {
  const n = await getNode(db, id);
  if (n.characterId === n.pcId) throw new AppError('bad_value', 'The character itself stays on its board.');
  await db.batch(
    [
      { sql: 'DELETE FROM rel_edges WHERE from_id = ? OR to_id = ?', args: [id, id] },
      { sql: 'DELETE FROM rel_nodes WHERE id = ?', args: [id] },
    ],
    'write',
  );
}

export async function addArrow(db, pcId, { from, to, label, color, note }) {
  const [a, b] = await Promise.all([getNode(db, from), getNode(db, to)]);
  if (a.pcId !== pcId || b.pcId !== pcId) throw new AppError('not_found', 'That card no longer exists.');
  if (a.id === b.id) throw new AppError('bad_value', 'An arrow joins two different cards.');
  const count = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM rel_edges WHERE pc_id = ?', args: [pcId] });
  if (Number(count.rows[0].n) >= MAX_EDGES) throw new AppError('limit', 'A board can have at most {n} arrows.', { n: MAX_EDGES });
  const r = await db.execute({
    sql: 'INSERT INTO rel_edges (pc_id, from_id, to_id, label, color, note) VALUES (?, ?, ?, ?, ?, ?)',
    args: [pcId, a.id, b.id, str(label, LABEL_MAX), cleanColor(color ?? 'slate'), typeof note === 'string' ? note.slice(0, NOTE_MAX) : ''],
  });
  return Number(r.lastInsertRowid);
}

export async function updateArrow(db, id, { label, color, note }) {
  await getEdge(db, id);
  const r = await db.execute({ sql: 'SELECT * FROM rel_edges WHERE id = ?', args: [id] });
  const e = r.rows[0];
  await db.execute({
    sql: 'UPDATE rel_edges SET label = ?, color = ?, note = ? WHERE id = ?',
    args: [
      label === undefined ? e.label : str(label, LABEL_MAX),
      color === undefined ? e.color : cleanColor(color),
      note === undefined ? e.note : typeof note === 'string' ? note.slice(0, NOTE_MAX) : '',
      id,
    ],
  });
}

export async function deleteArrow(db, id) {
  await getEdge(db, id);
  await db.execute({ sql: 'DELETE FROM rel_edges WHERE id = ?', args: [id] });
}

export async function deleteBoardOf(db, characterId) {
  await db.batch(
    [
      { sql: 'DELETE FROM rel_edges WHERE pc_id = ?', args: [characterId] },
      { sql: 'DELETE FROM rel_nodes WHERE pc_id = ?', args: [characterId] },
    ],
    'write',
  );
}
