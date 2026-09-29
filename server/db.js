import { createClient } from '@libsql/client';
import { ROSTER_SCHEMA } from './roster.js';

// Turso in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN); a local libSQL
// file otherwise. Same client and same SQL either way.
export function createDb({ url, authToken } = {}) {
  return createClient({
    url: url || process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: authToken || process.env.TURSO_AUTH_TOKEN,
  });
}

// Schema additions must always use CREATE TABLE IF NOT EXISTS: the server
// creates missing tables at every boot. Sent as one batch (one round trip).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  ...ROSTER_SCHEMA,
];

export async function initSchema(db) {
  await db.batch(SCHEMA, 'write');
}
