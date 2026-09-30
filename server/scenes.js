import { AppError } from './errors.js';
import { cleanName } from './roster.js';
import { makeFolders } from './folders.js';
import { deleteImageIfUnused } from './images.js';

// Scenes, the stage (who is summoned onto the active scene), temp NPCs and
// character pictures. Pictures are one collection per character or temp NPC,
// used both as Scene art and (Phase 5) as Battle tokens.

export const MAX_PICTURES = 20;
export const SCALE_MIN = 0.3;
export const SCALE_MAX = 2;

export const SCENE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scene_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     parent_id INTEGER REFERENCES scene_folders(id),
     name TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS scenes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     folder_id INTEGER REFERENCES scene_folders(id),
     scene_image_id TEXT,
     battle_image_id TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS scene_state (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     active_scene_id INTEGER
   )`,
  'INSERT OR IGNORE INTO scene_state (id, active_scene_id) VALUES (1, NULL)',
  `CREATE TABLE IF NOT EXISTS temp_npc_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     parent_id INTEGER REFERENCES temp_npc_folders(id),
     name TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS temp_npcs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     folder_id INTEGER REFERENCES temp_npc_folders(id),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS pictures (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     character_id INTEGER,
     temp_npc_id INTEGER,
     image_id TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '',
     position INTEGER NOT NULL DEFAULT 0,
     CHECK ((character_id IS NULL) != (temp_npc_id IS NULL))
   )`,
  `CREATE TABLE IF NOT EXISTS stage_summons (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     scene_id INTEGER NOT NULL,
     character_id INTEGER,
     temp_npc_id INTEGER,
     picture_id INTEGER,
     position INTEGER NOT NULL DEFAULT 0,
     scale REAL NOT NULL DEFAULT 1,
     hidden INTEGER NOT NULL DEFAULT 0,
     CHECK ((character_id IS NULL) != (temp_npc_id IS NULL))
   )`,
];

export const sceneFolders = makeFolders({ folderTable: 'scene_folders', itemTable: 'scenes', label: 'folder' });
export const tempNpcFolders = makeFolders({ folderTable: 'temp_npc_folders', itemTable: 'temp_npcs', label: 'folder' });

const n = (v) => (v == null ? null : Number(v));

// An owner is { characterId } or { tempNpcId }.
export function ownerOf(p) {
  const hasC = Number.isInteger(p?.characterId);
  const hasT = Number.isInteger(p?.tempNpcId);
  if (hasC === hasT) throw new AppError('bad_id', 'Choose a character or a temp NPC.');
  return hasC ? { kind: 'character', id: p.characterId } : { kind: 'temp_npc', id: p.tempNpcId };
}

const ownerColumn = (o) => (o.kind === 'character' ? 'character_id' : 'temp_npc_id');

export async function requireOwner(db, o) {
  const table = o.kind === 'character' ? 'characters' : 'temp_npcs';
  const r = await db.execute({ sql: `SELECT id, name FROM ${table} WHERE id = ?`, args: [o.id] });
  if (!r.rows.length) throw new AppError('not_found', 'That character no longer exists.');
  return { ...o, name: r.rows[0].name };
}

// ---- Pictures ---------------------------------------------------------------

const toPicture = (r) => ({
  id: Number(r.id),
  ownerKind: r.character_id != null ? 'character' : 'temp_npc',
  ownerId: n(r.character_id ?? r.temp_npc_id),
  imageId: r.image_id,
  name: r.name,
});

export async function listPictures(db, owner) {
  const r = await db.execute({
    sql: `SELECT * FROM pictures WHERE ${ownerColumn(owner)} = ? ORDER BY position, id`,
    args: [owner.id],
  });
  return r.rows.map(toPicture);
}

export async function getPicture(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid picture.');
  const r = await db.execute({ sql: 'SELECT * FROM pictures WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That picture no longer exists.');
  return toPicture(r.rows[0]);
}

export async function addPicture(db, owner, imageId, name) {
  await requireOwner(db, owner);
  const count = Number((await db.execute({
    sql: `SELECT COUNT(*) AS n FROM pictures WHERE ${ownerColumn(owner)} = ?`,
    args: [owner.id],
  })).rows[0].n);
  if (count >= MAX_PICTURES) throw new AppError('limit', `At most ${MAX_PICTURES} pictures each.`);
  const label = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  const r = await db.execute({
    sql: `INSERT INTO pictures (${ownerColumn(owner)}, image_id, name, position) VALUES (?, ?, ?, ?)`,
    args: [owner.id, imageId, label, count],
  });
  return Number(r.lastInsertRowid);
}

export async function renamePicture(db, id, name) {
  await getPicture(db, id);
  const label = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  await db.execute({ sql: 'UPDATE pictures SET name = ? WHERE id = ?', args: [label, id] });
}

// Deleting a picture that is on stage swaps the summon to the owner's first
// remaining picture, or takes the summon off stage when there is none.
export async function deletePicture(db, id) {
  const pic = await getPicture(db, id);
  await db.execute({ sql: 'DELETE FROM pictures WHERE id = ?', args: [id] });
  const remaining = await listPictures(db, { kind: pic.ownerKind, id: pic.ownerId });
  if (remaining.length) {
    await db.execute({ sql: 'UPDATE stage_summons SET picture_id = ? WHERE picture_id = ?', args: [remaining[0].id, id] });
  } else {
    await db.execute({ sql: 'DELETE FROM stage_summons WHERE picture_id = ?', args: [id] });
  }
  if (remaining.length) {
    await db.execute({ sql: 'UPDATE battle_tokens SET picture_id = ? WHERE picture_id = ?', args: [remaining[0].id, id] });
  } else {
    await db.execute({ sql: 'DELETE FROM battle_tokens WHERE picture_id = ?', args: [id] });
  }
  await deleteImageIfUnused(db, pic.imageId);
  return pic;
}

// Everything belonging to an owner that is going away.
export async function removeOwnerArt(db, owner) {
  const pics = await listPictures(db, owner);
  await db.execute({ sql: `DELETE FROM stage_summons WHERE ${ownerColumn(owner)} = ?`, args: [owner.id] });
  await db.execute({ sql: `DELETE FROM battle_tokens WHERE ${ownerColumn(owner)} = ?`, args: [owner.id] });
  await db.execute({ sql: `DELETE FROM pictures WHERE ${ownerColumn(owner)} = ?`, args: [owner.id] });
  for (const p of pics) await deleteImageIfUnused(db, p.imageId);
}

// ---- Temp NPCs ----------------------------------------------------------------

const toTempNpc = (r) => ({
  id: Number(r.id),
  name: r.name,
  folderId: n(r.folder_id),
  isProp: Number(r.is_prop) === 1,
  size: r.size == null ? 1 : Number(r.size),
});

export async function listTempNpcs(db) {
  const r = await db.execute('SELECT id, name, folder_id, is_prop, size FROM temp_npcs ORDER BY name COLLATE NOCASE');
  return r.rows.map(toTempNpc);
}

export const SIZE_MAX = 6;

function cleanSize(size) {
  if (!Number.isInteger(size) || size < 1 || size > SIZE_MAX) throw new AppError('bad_value', `Size must be from 1 to ${SIZE_MAX} squares.`);
  return size;
}

// A prop is a temp NPC that is a thing rather than a creature (a crate, a wall, a tree).
export async function createTempNpc(db, { name, folderId = null, isProp = false, size = 1 }) {
  const clean = cleanName(name);
  const folder = await tempNpcFolders.orRoot(db, folderId);
  const r = await db.execute({
    sql: 'INSERT INTO temp_npcs (name, folder_id, is_prop, size) VALUES (?, ?, ?, ?)',
    args: [clean, folder, isProp === true ? 1 : 0, cleanSize(size)],
  });
  return Number(r.lastInsertRowid);
}

export async function setTempNpcSize(db, id, size) {
  await requireOwner(db, { kind: 'temp_npc', id });
  await db.execute({ sql: 'UPDATE temp_npcs SET size = ? WHERE id = ?', args: [cleanSize(size), id] });
}

export async function renameTempNpc(db, id, name) {
  await requireOwner(db, { kind: 'temp_npc', id });
  await db.execute({ sql: 'UPDATE temp_npcs SET name = ? WHERE id = ?', args: [cleanName(name), id] });
}

export async function moveTempNpc(db, id, folderId) {
  await requireOwner(db, { kind: 'temp_npc', id });
  const folder = await tempNpcFolders.orRoot(db, folderId);
  await db.execute({ sql: 'UPDATE temp_npcs SET folder_id = ? WHERE id = ?', args: [folder, id] });
}

export async function deleteTempNpc(db, id) {
  await requireOwner(db, { kind: 'temp_npc', id });
  await removeOwnerArt(db, { kind: 'temp_npc', id });
  await db.execute({ sql: 'DELETE FROM temp_npcs WHERE id = ?', args: [id] });
}

// ---- Scenes -------------------------------------------------------------------

// Grid defaults: a cell is 5% of the picture's width; the grid starts at the top left corner.
export const DEFAULT_GRID = { cell: 0.05, ox: 0, oy: 0 };
export const CELL_MIN = 0.01;
export const CELL_MAX = 0.3;

const toScene = (r) => ({
  id: Number(r.id),
  name: r.name,
  folderId: n(r.folder_id),
  imageId: r.scene_image_id ?? null,
  battleImageId: r.battle_image_id ?? null,
  // width / height of the battle picture, sent by the browser when it is uploaded
  battleAspect: r.battle_aspect == null ? null : Number(r.battle_aspect),
  grid: {
    cell: r.grid_cell == null ? DEFAULT_GRID.cell : Number(r.grid_cell),
    ox: r.grid_ox == null ? DEFAULT_GRID.ox : Number(r.grid_ox),
    oy: r.grid_oy == null ? DEFAULT_GRID.oy : Number(r.grid_oy),
  },
});

const SCENE_COLUMNS = 'id, name, folder_id, scene_image_id, battle_image_id, battle_aspect, grid_cell, grid_ox, grid_oy';

// How many whole cells fit on the battle picture with the current grid.
export function gridSize(scene) {
  if (!scene.battleAspect) return { cols: 0, rows: 0 };
  const { cell, ox, oy } = scene.grid;
  const cellH = cell * scene.battleAspect; // fraction of the picture's height
  return {
    cols: Math.max(0, Math.floor((1 - ox) / cell + 1e-9)),
    rows: Math.max(0, Math.floor((1 - oy) / cellH + 1e-9)),
  };
}

export async function listScenes(db) {
  const r = await db.execute(`SELECT ${SCENE_COLUMNS} FROM scenes ORDER BY name COLLATE NOCASE`);
  return r.rows.map(toScene);
}

export async function getScene(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid scene.');
  const r = await db.execute({ sql: `SELECT ${SCENE_COLUMNS} FROM scenes WHERE id = ?`, args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That scene no longer exists.');
  return toScene(r.rows[0]);
}

export async function createScene(db, { name, folderId = null, imageId = null }) {
  const clean = cleanName(name);
  const folder = await sceneFolders.orRoot(db, folderId);
  const r = await db.execute({
    sql: 'INSERT INTO scenes (name, folder_id, scene_image_id) VALUES (?, ?, ?)',
    args: [clean, folder, imageId],
  });
  return Number(r.lastInsertRowid);
}

export async function renameScene(db, id, name) {
  await getScene(db, id);
  await db.execute({ sql: 'UPDATE scenes SET name = ? WHERE id = ?', args: [cleanName(name), id] });
}

export async function moveScene(db, id, folderId) {
  await getScene(db, id);
  const folder = await sceneFolders.orRoot(db, folderId);
  await db.execute({ sql: 'UPDATE scenes SET folder_id = ? WHERE id = ?', args: [folder, id] });
}

export async function setSceneImage(db, id, imageId) {
  const scene = await getScene(db, id);
  await db.execute({ sql: 'UPDATE scenes SET scene_image_id = ? WHERE id = ?', args: [imageId, id] });
  await deleteImageIfUnused(db, scene.imageId);
}

export async function setBattleImage(db, id, imageId, aspect) {
  const scene = await getScene(db, id);
  if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5) throw new AppError('bad_value', 'The picture has an unusable shape.');
  await db.execute({
    sql: 'UPDATE scenes SET battle_image_id = ?, battle_aspect = ? WHERE id = ?',
    args: [imageId, aspect, id],
  });
  await deleteImageIfUnused(db, scene.battleImageId);
}

// A new grid keeps every token inside the picture: anything outside is pulled back in.
export async function setGrid(db, id, { cell, ox, oy }) {
  const scene = await getScene(db, id);
  const ok = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!ok(cell, CELL_MIN, CELL_MAX) || !ok(ox, 0, 1) || !ok(oy, 0, 1)) throw new AppError('bad_value', 'That grid does not fit.');
  const next = { ...scene, grid: { cell, ox, oy } };
  const { cols, rows } = gridSize(next);
  if (scene.battleAspect && (cols < 1 || rows < 1)) throw new AppError('bad_value', 'That grid leaves no room on the picture.');
  await db.execute({ sql: 'UPDATE scenes SET grid_cell = ?, grid_ox = ?, grid_oy = ? WHERE id = ?', args: [cell, ox, oy, id] });
  return { cols, rows };
}

export async function deleteScene(db, id) {
  const scene = await getScene(db, id);
  await db.execute({ sql: 'DELETE FROM stage_summons WHERE scene_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM battle_tokens WHERE scene_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM battle_marks WHERE scene_id = ?', args: [id] });
  await db.execute({ sql: 'UPDATE scene_state SET active_scene_id = NULL WHERE active_scene_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM scenes WHERE id = ?', args: [id] });
  await deleteImageIfUnused(db, scene.imageId);
  await deleteImageIfUnused(db, scene.battleImageId);
}

export async function getActiveSceneId(db) {
  const r = await db.execute('SELECT active_scene_id FROM scene_state WHERE id = 1');
  return r.rows.length ? n(r.rows[0].active_scene_id) : null;
}

export async function getMode(db) {
  const r = await db.execute('SELECT mode FROM scene_state WHERE id = 1');
  return r.rows.length && r.rows[0].mode === 'battle' ? 'battle' : 'scene';
}

export async function setMode(db, mode) {
  if (mode !== 'scene' && mode !== 'battle') throw new AppError('bad_value', 'Unknown mode.');
  await db.execute({ sql: 'UPDATE scene_state SET mode = ? WHERE id = 1', args: [mode] });
}

export async function setActiveScene(db, id) {
  if (id != null) await getScene(db, id);
  await db.execute({ sql: 'UPDATE scene_state SET active_scene_id = ? WHERE id = 1', args: [id] });
}

// ---- Stage --------------------------------------------------------------------

// PCs stand on the left; NPCs and temp NPCs on the right.
const sideOf = (r) => (r.character_id != null && r.ctype === 'pc' ? 'left' : 'right');

// Figures stand anywhere on the scene picture: (x, y) is the middle of their feet, as fractions of
// the picture's width and height (0..1 is inside the picture; a figure may be dragged outside it).
// A figure nobody has dragged yet has no spot (x and y are null): each screen puts it in the visible
// part of the picture, PCs from the left and everyone else from the right, by `slot`.
export const POS_MIN = -1;
export const POS_MAX = 2;

// The stage as one audience sees it. Hidden summons are removed for everyone
// but the GM, on the server, so they are never sent to a player's screen.
export async function buildStage(db, { forGm }) {
  const sceneId = await getActiveSceneId(db);
  if (sceneId == null) return { scene: null, summons: [] };
  const scene = await getScene(db, sceneId).catch(() => null);
  if (!scene) return { scene: null, summons: [] };
  const r = await db.execute({
    sql: `SELECT s.id, s.character_id, s.temp_npc_id, s.picture_id, s.scale, s.hidden, s.pos_x, s.pos_y,
                 c.name AS cname, c.type AS ctype, t.name AS tname, p.image_id AS image_id
          FROM stage_summons s
          LEFT JOIN characters c ON c.id = s.character_id
          LEFT JOIN temp_npcs t ON t.id = s.temp_npc_id
          LEFT JOIN pictures p ON p.id = s.picture_id
          WHERE s.scene_id = ?
          ORDER BY s.position, s.id`,
    args: [sceneId],
  });
  const seen = { left: 0, right: 0 };
  const summons = r.rows
    .map((row) => {
      const side = sideOf(row);
      return { row, side, slot: seen[side]++ };
    })
    .map(({ row, side, slot }) => ({
      id: Number(row.id),
      ownerKind: row.character_id != null ? 'character' : 'temp_npc',
      ownerId: n(row.character_id ?? row.temp_npc_id),
      name: row.cname ?? row.tname ?? '?',
      side,
      slot,
      x: row.pos_x == null ? null : Number(row.pos_x),
      y: row.pos_y == null ? null : Number(row.pos_y),
      pictureId: n(row.picture_id),
      imageId: row.image_id ?? null,
      scale: Number(row.scale),
      hidden: Number(row.hidden) === 1,
    }))
    .filter((s) => forGm || !s.hidden);
  return { scene: { id: scene.id, name: scene.name, imageId: scene.imageId }, summons };
}

async function getSummon(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid stage entry.');
  const r = await db.execute({ sql: 'SELECT * FROM stage_summons WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That character is no longer on stage.');
  return r.rows[0];
}

export async function summon(db, owner, pictureId) {
  const sceneId = await getActiveSceneId(db);
  if (sceneId == null) throw new AppError('no_scene', 'There is no active scene.');
  await requireOwner(db, owner);
  const pictures = await listPictures(db, owner);
  if (!pictures.length) throw new AppError('no_picture', 'Add a picture first.');
  let picture = pictures[0];
  if (pictureId != null) {
    picture = pictures.find((p) => p.id === pictureId);
    if (!picture) throw new AppError('bad_id', 'That picture does not belong to this character.');
  }
  const existing = await db.execute({
    sql: `SELECT id FROM stage_summons WHERE scene_id = ? AND ${ownerColumn(owner)} = ?`,
    args: [sceneId, owner.id],
  });
  if (existing.rows.length) throw new AppError('already_on_stage', 'Already on stage.');
  const pos = Number((await db.execute({
    sql: 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM stage_summons WHERE scene_id = ?',
    args: [sceneId],
  })).rows[0].p);
  const r = await db.execute({
    sql: `INSERT INTO stage_summons (scene_id, ${ownerColumn(owner)}, picture_id, position) VALUES (?, ?, ?, ?)`,
    args: [sceneId, owner.id, picture.id, pos],
  });
  return Number(r.lastInsertRowid);
}

// Moves a figure to (x, y) and brings it to the front. `reset` takes its spot away, so it goes back
// to the entry spot of its side.
export async function moveSummon(db, id, { x, y, reset }) {
  await getSummon(db, id);
  if (reset === true) {
    await db.execute({ sql: 'UPDATE stage_summons SET pos_x = NULL, pos_y = NULL WHERE id = ?', args: [id] });
    return;
  }
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= POS_MIN && v <= POS_MAX;
  if (!ok(x) || !ok(y)) throw new AppError('bad_value', 'That spot is too far from the scene.');
  const top = Number((await db.execute({ sql: 'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM stage_summons', args: [] })).rows[0].p);
  await db.execute({
    sql: 'UPDATE stage_summons SET pos_x = ?, pos_y = ?, position = ? WHERE id = ?',
    args: [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, top, id],
  });
}

export async function summonOwner(db, id) {
  const row = await getSummon(db, id);
  return row.character_id != null
    ? { kind: 'character', id: Number(row.character_id) }
    : { kind: 'temp_npc', id: Number(row.temp_npc_id) };
}

export async function dismiss(db, id) {
  await getSummon(db, id);
  await db.execute({ sql: 'DELETE FROM stage_summons WHERE id = ?', args: [id] });
}

export async function updateSummon(db, id, { pictureId, scale, hidden }) {
  const row = await getSummon(db, id);
  if (pictureId !== undefined) {
    const owner = await summonOwner(db, id);
    const pictures = await listPictures(db, owner);
    if (!pictures.some((p) => p.id === pictureId)) throw new AppError('bad_id', 'That picture does not belong to this character.');
    await db.execute({ sql: 'UPDATE stage_summons SET picture_id = ? WHERE id = ?', args: [pictureId, id] });
  }
  if (scale !== undefined) {
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < SCALE_MIN || scale > SCALE_MAX) {
      throw new AppError('bad_value', `Size must be between ${SCALE_MIN} and ${SCALE_MAX}.`);
    }
    await db.execute({ sql: 'UPDATE stage_summons SET scale = ? WHERE id = ?', args: [scale, id] });
  }
  if (hidden !== undefined) {
    if (typeof hidden !== 'boolean') throw new AppError('bad_value', 'Hidden must be true or false.');
    await db.execute({ sql: 'UPDATE stage_summons SET hidden = ? WHERE id = ?', args: [hidden ? 1 : 0, id] });
  }
  return row;
}
