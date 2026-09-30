import { AppError } from './errors.js';
import * as scenes from './scenes.js';
import { combatView } from './combat.js';
import * as sheets from './sheet.js';

// Battle mode: tokens on a square grid over the scene's battle picture, shared
// drawings and spell templates, and the movement rules.
//
// Positions are whole cells (col, row) counted from the grid's top left corner.
// A token of size N covers N x N cells, with (col, row) as its top left cell.

export const BATTLE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS battle_tokens (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     scene_id INTEGER NOT NULL,
     character_id INTEGER,
     temp_npc_id INTEGER,
     picture_id INTEGER,
     col INTEGER NOT NULL DEFAULT 0,
     row INTEGER NOT NULL DEFAULT 0,
     hidden INTEGER NOT NULL DEFAULT 0,
     bank INTEGER NOT NULL DEFAULT 0,
     diagonals INTEGER NOT NULL DEFAULT 0,
     CHECK ((character_id IS NULL) != (temp_npc_id IS NULL))
   )`,
  `CREATE TABLE IF NOT EXISTS battle_marks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     scene_id INTEGER NOT NULL,
     kind TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
];

const n = (v) => (v == null ? null : Number(v));
const ownerColumn = (o) => (o.kind === 'character' ? 'character_id' : 'temp_npc_id');
const clampSize = (v) => (Number.isInteger(v) && v >= 1 && v <= scenes.SIZE_MAX ? v : 1);

// ---- Tokens ---------------------------------------------------------------------

function sheetSize(json) {
  try {
    return clampSize(JSON.parse(json ?? '{}').size);
  } catch {
    return 1;
  }
}

const TOKEN_SQL = `SELECT t.id, t.scene_id, t.character_id, t.temp_npc_id, t.picture_id, t.col, t.row, t.hidden, t.bank, t.diagonals, t.height,
                          c.name AS cname, c.type AS ctype, c.sheet AS csheet,
                          tn.name AS tname, tn.size AS tsize, tn.is_prop AS tprop,
                          p.image_id AS image_id
                   FROM battle_tokens t
                   LEFT JOIN characters c ON c.id = t.character_id
                   LEFT JOIN temp_npcs tn ON tn.id = t.temp_npc_id
                   LEFT JOIN pictures p ON p.id = t.picture_id`;

function toToken(r, targets) {
  const isChar = r.character_id != null;
  const ownerId = Number(isChar ? r.character_id : r.temp_npc_id);
  return {
    id: Number(r.id),
    sceneId: Number(r.scene_id),
    ownerKind: isChar ? 'character' : 'temp_npc',
    ownerId,
    kind: isChar ? (r.ctype === 'pc' ? 'pc' : 'npc') : Number(r.tprop) === 1 ? 'prop' : 'npc',
    name: (isChar ? r.cname : r.tname) ?? '?',
    size: isChar ? sheetSize(r.csheet) : clampSize(Number(r.tsize)),
    col: Number(r.col),
    row: Number(r.row),
    pictureId: n(r.picture_id),
    imageId: r.image_id ?? null,
    hidden: Number(r.hidden) === 1,
    bank: Number(r.bank),
    diagonals: Number(r.diagonals),
    // Spaces the character is in the air (shown above the token).
    height: Number(r.height ?? 0),
    // Characters that currently have this token targeted (set from the remote).
    targetedBy: targets ? [...targets.entries()].filter(([, set]) => set.has(Number(r.id))).map(([who]) => who) : [],
  };
}

export async function listTokens(db, sceneId, { forGm, targets } = {}) {
  const r = await db.execute({ sql: `${TOKEN_SQL} WHERE t.scene_id = ? ORDER BY t.id`, args: [sceneId] });
  return r.rows.map((row) => toToken(row, targets)).filter((t) => forGm || !t.hidden);
}

export async function getToken(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid token.');
  const r = await db.execute({ sql: `${TOKEN_SQL} WHERE t.id = ?`, args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That token is no longer on the map.');
  return toToken(r.rows[0]);
}

export async function tokenForCharacter(db, sceneId, characterId) {
  const r = await db.execute({ sql: `${TOKEN_SQL} WHERE t.scene_id = ? AND t.character_id = ?`, args: [sceneId, characterId] });
  return r.rows.length ? toToken(r.rows[0]) : null;
}

async function activeBattleScene(db) {
  const id = await scenes.getActiveSceneId(db);
  if (id == null) throw new AppError('no_scene', 'There is no active scene.');
  const scene = await scenes.getScene(db, id);
  if (!scene.battleImageId || !scene.battleAspect) throw new AppError('no_battle_map', 'This scene has no battle map yet.');
  return scene;
}

const inBounds = (scene, size, col, row) => {
  const { cols, rows } = scenes.gridSize(scene);
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col + size <= cols && row + size <= rows;
};

// The first free spot scanning from the top left, so a new token never lands on another.
function freeSpot(scene, tokens, size) {
  const { cols, rows } = scenes.gridSize(scene);
  const taken = (c, r) => tokens.some((t) => c < t.col + t.size && t.col < c + size && r < t.row + t.size && t.row < r + size);
  for (let r = 0; r + size <= rows; r++) for (let c = 0; c + size <= cols; c++) if (!taken(c, r)) return { col: c, row: r };
  return { col: 0, row: 0 };
}

export async function addToken(db, owner, pictureId) {
  const scene = await activeBattleScene(db);
  await scenes.requireOwner(db, owner);
  const pictures = await scenes.listPictures(db, owner);
  if (!pictures.length) throw new AppError('no_picture', 'Add a picture first.');
  let picture = pictures[0];
  if (pictureId != null) {
    picture = pictures.find((p) => p.id === pictureId);
    if (!picture) throw new AppError('bad_id', 'That picture does not belong to this character.');
  }
  const exists = await db.execute({
    sql: `SELECT id FROM battle_tokens WHERE scene_id = ? AND ${ownerColumn(owner)} = ?`,
    args: [scene.id, owner.id],
  });
  if (exists.rows.length) throw new AppError('already_on_map', 'Already on the map.');
  const tokens = await listTokens(db, scene.id, { forGm: true });
  // The size comes from the sheet (or the temp NPC), so ask what the token would look like.
  const size = owner.kind === 'character' ? (await sheets.getSheet(db, owner.id)).size : (await scenes.listTempNpcs(db)).find((t) => t.id === owner.id)?.size ?? 1;
  const spot = freeSpot(scene, tokens, size);
  const r = await db.execute({
    sql: `INSERT INTO battle_tokens (scene_id, ${ownerColumn(owner)}, picture_id, col, row) VALUES (?, ?, ?, ?, ?)`,
    args: [scene.id, owner.id, picture.id, spot.col, spot.row],
  });
  return Number(r.lastInsertRowid);
}

export async function removeToken(db, id) {
  await getToken(db, id);
  await db.execute({ sql: 'DELETE FROM battle_tokens WHERE id = ?', args: [id] });
}

// Dragging: free, and never touches AP or Movement.
export async function placeToken(db, id, col, row) {
  const token = await getToken(db, id);
  const scene = await scenes.getScene(db, token.sceneId);
  if (!inBounds(scene, token.size, col, row)) throw new AppError('out_of_bounds', 'That is off the map.');
  await db.execute({ sql: 'UPDATE battle_tokens SET col = ?, row = ? WHERE id = ?', args: [col, row, id] });
}

export const HEIGHT_MAX = 99;

export async function updateToken(db, id, { pictureId, hidden, height }) {
  const token = await getToken(db, id);
  if (pictureId !== undefined) {
    const pictures = await scenes.listPictures(db, { kind: token.ownerKind, id: token.ownerId });
    if (!pictures.some((p) => p.id === pictureId)) throw new AppError('bad_id', 'That picture does not belong to this character.');
    await db.execute({ sql: 'UPDATE battle_tokens SET picture_id = ? WHERE id = ?', args: [pictureId, id] });
  }
  if (hidden !== undefined) {
    if (typeof hidden !== 'boolean') throw new AppError('bad_value', 'Hidden must be true or false.');
    await db.execute({ sql: 'UPDATE battle_tokens SET hidden = ? WHERE id = ?', args: [hidden ? 1 : 0, id] });
  }
  if (height !== undefined) {
    if (!Number.isInteger(height) || height < 0 || height > HEIGHT_MAX) throw new AppError('bad_value', `Height must be from 0 to ${HEIGHT_MAX} Spaces.`);
    await db.execute({ sql: 'UPDATE battle_tokens SET height = ? WHERE id = ?', args: [height, id] });
  }
}

export async function clearBank(db, id) {
  await getToken(db, id);
  await db.execute({ sql: 'UPDATE battle_tokens SET bank = 0, diagonals = 0 WHERE id = ?', args: [id] });
}

// After a new grid or picture, keep every token on the map.
export async function clampTokens(db, sceneId) {
  const scene = await scenes.getScene(db, sceneId);
  const { cols, rows } = scenes.gridSize(scene);
  const tokens = await listTokens(db, sceneId, { forGm: true });
  for (const t of tokens) {
    const col = Math.max(0, Math.min(t.col, Math.max(0, cols - t.size)));
    const row = Math.max(0, Math.min(t.row, Math.max(0, rows - t.size)));
    if (col !== t.col || row !== t.row) {
      await db.execute({ sql: 'UPDATE battle_tokens SET col = ?, row = ? WHERE id = ?', args: [col, row, t.id] });
    }
  }
}

// ---- Movement rules --------------------------------------------------------------

// A straight step costs 1. Diagonal steps alternate: the first costs 1, the second 2, and so on.
export function stepCost(diagonals, dc, dr) {
  if (dc !== 0 && dr !== 0) return { cost: diagonals % 2 === 0 ? 1 : 2, diagonals: diagonals + 1 };
  return { cost: 1, diagonals };
}

// Works out one step of the D-pad.
//  - free (the checkbox, or outside the character's own turn): nothing is spent.
//  - otherwise the step is paid from the banked Movement; if that is not enough, AP is spent
//    to bank more (each AP banks `movement` squares), but only after the player confirms.
// -> { free } | { needsConfirm, aps, movement } | { bank, diagonals, apSpent, cost }
export function planMove({ bank, diagonals, movement, ap }, { dc, dr, free, confirmAp }) {
  if (free) return { free: true };
  const { cost, diagonals: nextDiagonals } = stepCost(diagonals, dc, dr);
  if (bank >= cost) return { bank: bank - cost, diagonals: nextDiagonals, apSpent: 0, cost };
  if (movement <= 0) throw new AppError('no_movement', 'This character has no Movement.');
  const aps = Math.ceil((cost - bank) / movement);
  if (aps > ap) throw new AppError('no_ap', 'Not enough AP left to move.');
  if (!confirmAp) return { needsConfirm: true, aps, movement: aps * movement, cost };
  return { bank: bank + aps * movement - cost, diagonals: nextDiagonals, apSpent: aps, cost };
}

// One D-pad step for a character's token. `isOwnTurn` is decided by the combat tracker
// (null when there is no combat: every move is free then).
export async function moveStep(db, { token, dc, dr, freeChecked, confirmAp, isOwnTurn }) {
  if (![-1, 0, 1].includes(dc) || ![-1, 0, 1].includes(dr) || (dc === 0 && dr === 0)) {
    throw new AppError('bad_value', 'A step is one square in one of eight directions.');
  }
  const scene = await scenes.getScene(db, token.sceneId);
  const col = token.col + dc;
  const row = token.row + dr;
  if (!inBounds(scene, token.size, col, row)) throw new AppError('out_of_bounds', 'That is off the map.');

  // Only a character on its own turn pays for movement; anyone else moves free.
  const free = freeChecked === true || !isOwnTurn || token.ownerKind !== 'character';
  if (free) {
    await db.execute({ sql: 'UPDATE battle_tokens SET col = ?, row = ? WHERE id = ?', args: [col, row, token.id] });
    return { moved: true, free: true };
  }

  return sheets.withLock(token.ownerId, async () => {
    const sheet = await sheets.getSheet(db, token.ownerId);
    const plan = planMove({ bank: token.bank, diagonals: token.diagonals, movement: sheet.movement, ap: sheet.ap.current }, { dc, dr, free: false, confirmAp });
    if (plan.needsConfirm) return { moved: false, needsConfirm: { aps: plan.aps, movement: plan.movement } };
    if (plan.apSpent > 0) {
      const next = structuredClone(sheet);
      next.ap.current -= plan.apSpent;
      await sheets.saveSheet(db, token.ownerId, sheets.normalizeSheet(next));
    }
    await db.execute({
      sql: 'UPDATE battle_tokens SET col = ?, row = ?, bank = ?, diagonals = ? WHERE id = ?',
      args: [col, row, plan.bank, plan.diagonals, token.id],
    });
    return { moved: true, free: false, apSpent: plan.apSpent, sheetChanged: plan.apSpent > 0 };
  });
}

// ---- Drawings and templates --------------------------------------------------------

export const MAX_MARKS = 300;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHAPES = ['circle', 'cone', 'arc', 'line', 'square'];
const bad = (m) => new AppError('bad_mark', m);

export function cleanMark(kind, data) {
  if (!data || typeof data !== 'object') throw bad('Invalid mark.');
  if (kind === 'draw') {
    const { color, width, points } = data;
    if (!HEX.test(color ?? '')) throw bad('Invalid colour.');
    if (!(typeof width === 'number' && width >= 1 && width <= 16)) throw bad('Invalid line width.');
    if (!Array.isArray(points) || points.length < 2 || points.length > 500) throw bad('A line needs 2 to 500 points.');
    const pts = points.map((p) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && v >= 0 && v <= 1)) throw bad('Points must lie on the map.');
      return [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000];
    });
    return { color, width, points: pts };
  }
  if (kind === 'template') {
    const { shape, x, y, size, angle, color } = data;
    if (!SHAPES.includes(shape)) throw bad('Unknown shape.');
    if (!HEX.test(color ?? '')) throw bad('Invalid colour.');
    if (!(Number.isInteger(size) && size >= 1 && size <= 60)) throw bad('Size must be 1 to 60 squares.');
    if (![x, y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 500)) throw bad('Invalid position.');
    if (!(typeof angle === 'number' && Number.isFinite(angle))) throw bad('Invalid direction.');
    return { shape, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, size, angle: ((Math.round(angle) % 360) + 360) % 360, color };
  }
  throw bad('Unknown kind of mark.');
}

export async function listMarks(db, sceneId) {
  const r = await db.execute({ sql: 'SELECT id, kind, data FROM battle_marks WHERE scene_id = ? ORDER BY id', args: [sceneId] });
  return r.rows.map((row) => ({ id: Number(row.id), kind: row.kind, ...JSON.parse(row.data) }));
}

export async function addMark(db, kind, data) {
  const scene = await activeBattleScene(db);
  const clean = cleanMark(kind, data);
  const count = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM battle_marks WHERE scene_id = ?', args: [scene.id] })).rows[0].n);
  if (count >= MAX_MARKS) throw new AppError('limit', `At most ${MAX_MARKS} drawings and templates. Clear some first.`);
  const r = await db.execute({ sql: 'INSERT INTO battle_marks (scene_id, kind, data) VALUES (?, ?, ?)', args: [scene.id, kind, JSON.stringify(clean)] });
  return Number(r.lastInsertRowid);
}

export async function removeMark(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid mark.');
  await db.execute({ sql: 'DELETE FROM battle_marks WHERE id = ?', args: [id] });
}

// The eraser. Removes the parts of every drawing that pass within `r` (picture widths) of (x, y),
// which are fractions of the picture. A drawing that is cut in the middle becomes two drawings.
// -> true when something was erased
export async function eraseMarksAt(db, { x, y, r }) {
  const ok = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!ok(x, 0, 1) || !ok(y, 0, 1) || !ok(r, 0.001, 0.2)) throw new AppError('bad_value', 'Erase on the map.');
  const scene = await activeBattleScene(db);
  const marks = (await listMarks(db, scene.id)).filter((m) => m.kind === 'draw');
  const aspect = scene.battleAspect;
  // Distances are measured in picture widths, so the eraser is round.
  const dist = (p) => Math.hypot(p[0] - x, (p[1] - y) / aspect);
  const segmentDist = (a, b) => {
    const ax = a[0] - x, ay = (a[1] - y) / aspect, bx = b[0] - x, by = (b[1] - y) / aspect;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  let changed = false;
  for (const m of marks) {
    const pts = m.points;
    const pieces = [];
    let cur = [];
    for (let i = 0; i < pts.length; i++) {
      const inside = dist(pts[i]) <= r;
      if (inside) {
        if (cur.length) pieces.push(cur);
        cur = [];
        continue;
      }
      cur.push(pts[i]);
      // A long segment can pass through the eraser without a point inside it: cut there too.
      if (i + 1 < pts.length && dist(pts[i + 1]) > r && segmentDist(pts[i], pts[i + 1]) <= r) {
        pieces.push(cur);
        cur = [];
      }
    }
    if (cur.length) pieces.push(cur);
    const kept = pieces.filter((p) => p.length >= 2);
    const untouched = kept.length === 1 && kept[0].length === pts.length;
    if (untouched) continue;
    changed = true;
    await db.execute({ sql: 'DELETE FROM battle_marks WHERE id = ?', args: [m.id] });
    for (const piece of kept) {
      const data = { color: m.color, width: m.width, points: piece };
      await db.execute({ sql: 'INSERT INTO battle_marks (scene_id, kind, data) VALUES (?, ?, ?)', args: [scene.id, 'draw', JSON.stringify(data)] });
    }
  }
  return changed;
}

export async function clearMarks(db, kind) {
  const sceneId = await scenes.getActiveSceneId(db);
  if (sceneId == null) return;
  if (kind === 'draw' || kind === 'template') {
    await db.execute({ sql: 'DELETE FROM battle_marks WHERE scene_id = ? AND kind = ?', args: [sceneId, kind] });
  } else {
    await db.execute({ sql: 'DELETE FROM battle_marks WHERE scene_id = ?', args: [sceneId] });
  }
}

// ---- What clients see ----------------------------------------------------------------

// The battle part of the stage. Hidden tokens are left out for everyone but the GM.
export async function buildBattle(db, { forGm, targets, combat = null }) {
  const sceneId = await scenes.getActiveSceneId(db);
  if (sceneId == null) return null;
  const scene = await scenes.getScene(db, sceneId).catch(() => null);
  if (!scene) return null;
  const { cols, rows } = scenes.gridSize(scene);
  const [tokens, marks] = await Promise.all([listTokens(db, sceneId, { forGm, targets }), listMarks(db, sceneId)]);
  return {
    imageId: scene.battleImageId,
    aspect: scene.battleAspect,
    grid: scene.grid,
    cols,
    rows,
    tokens,
    marks,
    combat: combatView(combat, tokens),
  };
}
