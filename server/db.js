import { createClient } from '@libsql/client';
import { ROSTER_SCHEMA } from './roster.js';
import { IMAGE_SCHEMA } from './images.js';
import { SCENE_SCHEMA } from './scenes.js';
import { AUDIO_SCHEMA } from './audio.js';
import { BATTLE_SCHEMA } from './battle.js';
import { ARCANE_SCHEMA } from './arcane.js';

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
  ...IMAGE_SCHEMA,
  ...SCENE_SCHEMA,
  ...AUDIO_SCHEMA,
  ...BATTLE_SCHEMA,
  ...ARCANE_SCHEMA,
];

// New columns on existing tables cannot use IF NOT EXISTS, so each one is
// added only when PRAGMA table_info shows it missing.
const COLUMNS = [
  { table: 'characters', column: 'sheet', ddl: 'sheet TEXT' },
  { table: 'scenes', column: 'battle_aspect', ddl: 'battle_aspect REAL' },
  { table: 'scenes', column: 'grid_cell', ddl: 'grid_cell REAL' },
  { table: 'scenes', column: 'grid_ox', ddl: 'grid_ox REAL' },
  { table: 'scenes', column: 'grid_oy', ddl: 'grid_oy REAL' },
  { table: 'scene_state', column: 'mode', ddl: "mode TEXT NOT NULL DEFAULT 'scene'" },
  { table: 'stage_summons', column: 'pos_x', ddl: 'pos_x REAL' },
  { table: 'stage_summons', column: 'pos_y', ddl: 'pos_y REAL' },
  { table: 'battle_tokens', column: 'height', ddl: 'height INTEGER NOT NULL DEFAULT 0' },
  { table: 'temp_npcs', column: 'is_prop', ddl: 'is_prop INTEGER NOT NULL DEFAULT 0' },
  { table: 'temp_npcs', column: 'size', ddl: 'size INTEGER NOT NULL DEFAULT 1' },
];

export async function initSchema(db) {
  await db.batch(SCHEMA, 'write');
  for (const { table, column, ddl } of COLUMNS) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    if (!info.rows.some((r) => r.name === column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
}
