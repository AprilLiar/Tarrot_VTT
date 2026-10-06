import { randomUUID } from 'node:crypto';
import { normalizeAction, MAX_ACTIONS } from '../shared/basicActions.js';
import { ensureDefaults } from './defaults.js';
import { AppError } from './errors.js';

// Basic Actions (shared/basicActions.js) live in the database for everyone; the GM edits them.
export const ACTION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS basic_actions (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     position INTEGER NOT NULL
   )`,
];

export async function listActions(db) {
  await ensureDefaults(db);
  const r = await db.execute('SELECT id, data FROM basic_actions ORDER BY position, id');
  return r.rows.map((row) => {
    let raw = {};
    try {
      raw = JSON.parse(row.data);
    } catch {}
    return { ...normalizeAction(raw, row.id), id: row.id };
  });
}

// Adds (no id) or replaces (id) an action.
export async function saveAction(db, id, raw) {
  await ensureDefaults(db);
  if (id == null) {
    const count = (await db.execute('SELECT COUNT(*) AS n FROM basic_actions')).rows[0].n;
    if (Number(count) >= MAX_ACTIONS) throw new AppError('limit', 'Too many Basic Actions.');
    const fresh = randomUUID();
    const clean = { ...normalizeAction(raw, fresh), id: fresh };
    const pos = (await db.execute('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM basic_actions')).rows[0].p;
    await db.execute({ sql: 'INSERT INTO basic_actions (id, data, position) VALUES (?, ?, ?)', args: [fresh, JSON.stringify(clean), Number(pos)] });
    return clean;
  }
  const have = await db.execute({ sql: 'SELECT id FROM basic_actions WHERE id = ?', args: [String(id)] });
  if (!have.rows.length) throw new AppError('not_found', 'That entry no longer exists.');
  const clean = { ...normalizeAction(raw, String(id)), id: String(id) };
  await db.execute({ sql: 'UPDATE basic_actions SET data = ? WHERE id = ?', args: [JSON.stringify(clean), String(id)] });
  return clean;
}

export async function deleteAction(db, id) {
  const r = await db.execute({ sql: 'DELETE FROM basic_actions WHERE id = ?', args: [String(id)] });
  if (!r.rowsAffected) throw new AppError('not_found', 'That entry no longer exists.');
}
