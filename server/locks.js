import { AppError } from './errors.js';
import { isLockKey, LOCK_KEYS } from '../shared/locks.js';

// The locks the GM set in the Arcane tab (see shared/locks.js): one row per locked key.
export const LOCK_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS arcane_locks (
     key TEXT PRIMARY KEY
   )`,
];

export async function listLocks(db) {
  const rows = (await db.execute('SELECT key FROM arcane_locks')).rows.map((r) => r.key);
  return LOCK_KEYS.filter((k) => rows.includes(k));
}

// Flips a lock; returns the new list.
export async function toggleLock(db, key) {
  if (!isLockKey(key)) throw new AppError('bad_value', 'Unknown lock.');
  const have = (await db.execute({ sql: 'SELECT key FROM arcane_locks WHERE key = ?', args: [key] })).rows.length > 0;
  if (have) await db.execute({ sql: 'DELETE FROM arcane_locks WHERE key = ?', args: [key] });
  else await db.execute({ sql: 'INSERT INTO arcane_locks (key) VALUES (?)', args: [key] });
  return listLocks(db);
}

export const lockedError = () => new AppError('locked', 'That part of the Arcane tab is locked.');
