import { createClient } from '@libsql/client';
import { ROSTER_SCHEMA } from './roster.js';
import { IMAGE_SCHEMA } from './images.js';
import { SCENE_SCHEMA } from './scenes.js';
import { AUDIO_SCHEMA } from './audio.js';
import { BATTLE_SCHEMA } from './battle.js';
import { ARCANE_SCHEMA } from './arcane.js';
import { STANCE_SCHEMA } from './stances.js';
import { EFFECT_SCHEMA } from './effectRuntime.js';
import { ACTION_SCHEMA } from './basicActions.js';
import { LOCK_SCHEMA } from './locks.js';

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
  ...STANCE_SCHEMA,
  ...EFFECT_SCHEMA,
  ...ACTION_SCHEMA,
  ...LOCK_SCHEMA,
];

// New columns on existing tables cannot use IF NOT EXISTS, so each one is
// added only when PRAGMA table_info shows it missing.
const COLUMNS = [
  { table: 'characters', column: 'sheet', ddl: 'sheet TEXT' },
  { table: 'characters', column: 'portrait_image_id', ddl: 'portrait_image_id TEXT' },
  { table: 'characters', column: 'token_image_id', ddl: 'token_image_id TEXT' }, // a custom Battle token (null: the default one)
  { table: 'scenes', column: 'battle_aspect', ddl: 'battle_aspect REAL' },
  { table: 'scenes', column: 'grid_cell', ddl: 'grid_cell REAL' },
  { table: 'scenes', column: 'grid_ox', ddl: 'grid_ox REAL' },
  { table: 'scenes', column: 'grid_oy', ddl: 'grid_oy REAL' },
  { table: 'scenes', column: 'show_grid', ddl: 'show_grid INTEGER NOT NULL DEFAULT 1' },
  { table: 'scene_state', column: 'mode', ddl: "mode TEXT NOT NULL DEFAULT 'scene'" },
  { table: 'stage_summons', column: 'pos_x', ddl: 'pos_x REAL' },
  { table: 'stage_summons', column: 'pos_y', ddl: 'pos_y REAL' },
  { table: 'battle_tokens', column: 'height', ddl: 'height INTEGER NOT NULL DEFAULT 0' },
  { table: 'temp_npcs', column: 'is_prop', ddl: 'is_prop INTEGER NOT NULL DEFAULT 0' },
  { table: 'temp_npcs', column: 'size', ddl: 'size INTEGER NOT NULL DEFAULT 1' },
  // The size of a figure on the Scene belongs to its picture (every figure using the picture, in any scene, is that big). Before this column
  // the size was kept on each figure: a picture takes the size of the latest figure that used it, the others start at 1.
  {
    table: 'pictures',
    column: 'scale',
    ddl: 'scale REAL NOT NULL DEFAULT 1',
    after: 'UPDATE pictures SET scale = COALESCE((SELECT s.scale FROM stage_summons s WHERE s.picture_id = pictures.id ORDER BY s.id DESC LIMIT 1), 1)',
  },
  { table: 'stage_summons', column: 'silhouette', ddl: 'silhouette INTEGER NOT NULL DEFAULT 0' },
  // How the Scene picture and the Battle map fit a screen of another shape (shared/fits.js): Best Fit for every scene at first.
  { table: 'scenes', column: 'scene_fit', ddl: "scene_fit TEXT NOT NULL DEFAULT 'fit'" },
  { table: 'scenes', column: 'battle_fit', ddl: "battle_fit TEXT NOT NULL DEFAULT 'fit'" },
  // The track a scene plays (looped) in Scene mode, and the one for Battle mode (see the README, "Scene music").
  { table: 'scenes', column: 'music_track_id', ddl: 'music_track_id INTEGER' },
  { table: 'scenes', column: 'battle_music_track_id', ddl: 'battle_music_track_id INTEGER' },
];

export async function initSchema(db) {
  await db.batch(SCHEMA, 'write');
  for (const { table, column, ddl, after } of COLUMNS) {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    if (!info.rows.some((r) => r.name === column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      if (after) await db.execute(after); // only when the column has just been added
    }
  }
}
