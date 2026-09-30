import { randomUUID } from 'node:crypto';
import { normalizeEnhancement, MAX_ENHANCEMENTS } from '../shared/arcane.js';
import { AppError } from './errors.js';

// Global Enhancements: made by the GM in the general Arcane tab and available to every character.
// (A character's own Enhancements live in its sheet.)

export const ARCANE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS arcane_enhancements (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     position INTEGER NOT NULL
   )`,
];

export async function listGlobal(db) {
  const r = await db.execute('SELECT id, data FROM arcane_enhancements ORDER BY position, id');
  return r.rows.map((row) => {
    let raw = {};
    try {
      raw = JSON.parse(row.data);
    } catch {}
    return { ...normalizeEnhancement(raw, row.id), id: row.id };
  });
}

// Adds (no id) or replaces (id) a global Enhancement.
export async function saveGlobal(db, id, raw) {
  if (id == null) {
    const count = (await db.execute('SELECT COUNT(*) AS n FROM arcane_enhancements')).rows[0].n;
    if (Number(count) >= MAX_ENHANCEMENTS) throw new AppError('limit', 'Too many Enhancements.');
    const fresh = randomUUID();
    const clean = { ...normalizeEnhancement(raw, fresh), id: fresh };
    const pos = (await db.execute('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM arcane_enhancements')).rows[0].p;
    await db.execute({ sql: 'INSERT INTO arcane_enhancements (id, data, position) VALUES (?, ?, ?)', args: [fresh, JSON.stringify(clean), Number(pos)] });
    return clean;
  }
  const have = await db.execute({ sql: 'SELECT id FROM arcane_enhancements WHERE id = ?', args: [String(id)] });
  if (!have.rows.length) throw new AppError('not_found', 'That entry no longer exists.');
  const clean = { ...normalizeEnhancement(raw, String(id)), id: String(id) };
  await db.execute({ sql: 'UPDATE arcane_enhancements SET data = ? WHERE id = ?', args: [JSON.stringify(clean), String(id)] });
  return clean;
}

export async function deleteGlobal(db, id) {
  const r = await db.execute({ sql: 'DELETE FROM arcane_enhancements WHERE id = ?', args: [String(id)] });
  if (!r.rowsAffected) throw new AppError('not_found', 'That entry no longer exists.');
}
