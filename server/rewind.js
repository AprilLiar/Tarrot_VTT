import { AppError } from './errors.js';
import * as scenes from './scenes.js';

// GM Rewind (see the README): before every applied attack, token move and Next turn, the active battle is saved: its tokens (squares,
// banked Movement, height, hidden...), its drawings and areas, the sheets of every character on the map (HP, AP, statuses...) and the
// combat (order, round, whose turn). Rewind puts the newest back; up to REWIND_STEPS in a row. Held in server memory, like the combat;
// cleared when a combat ends or another scene is activated. Chat cards stay (their Revert still works on what is left).
export const REWIND_STEPS = 5;

const rowsOf = async (db, sql, args) => (await db.execute({ sql, args })).rows.map((r) => ({ ...r }));

async function snapshot(db, sceneId, combat) {
  const tokens = await rowsOf(db, 'SELECT * FROM battle_tokens WHERE scene_id = ?', [sceneId]);
  const marks = await rowsOf(db, 'SELECT * FROM battle_marks WHERE scene_id = ?', [sceneId]);
  const sheets = {};
  for (const t of tokens) {
    if (t.character_id == null) continue;
    const r = await db.execute({ sql: 'SELECT sheet FROM characters WHERE id = ?', args: [t.character_id] });
    if (r.rows.length) sheets[Number(t.character_id)] = r.rows[0].sheet;
  }
  return { sceneId, tokens, marks, sheets, combat: combat ? structuredClone(combat) : null };
}

async function putBack(db, table, sceneId, rows) {
  await db.execute({ sql: `DELETE FROM ${table} WHERE scene_id = ?`, args: [sceneId] });
  for (const row of rows) {
    const cols = Object.keys(row);
    await db.execute({ sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, args: cols.map((c) => row[c]) });
  }
}

// Saves the active battle before a step. `label` is a chat-style message ({ key, params }) naming the step.
export async function record(db, shared, label) {
  const sceneId = await scenes.getActiveSceneId(db);
  if (sceneId == null || (await scenes.getMode(db)) !== 'battle') return;
  const list = (shared.rewind ??= []);
  list.push({ label, ...(await snapshot(db, sceneId, shared.combat ?? null)) });
  while (list.length > REWIND_STEPS) list.shift();
}

// Forgets the newest saved step (the step it was saved for did not happen after all).
export function dropLast(shared) {
  shared.rewind?.pop();
}

// Saves, runs `fn`, and forgets the save again when `fn` fails.
export async function around(db, shared, label, fn) {
  await record(db, shared, label);
  try {
    return await fn();
  } catch (err) {
    dropLast(shared);
    throw err;
  }
}

export const labels = (shared) => [...(shared.rewind ?? [])].reverse().map((s) => s.label);

export function clear(shared) {
  shared.rewind = [];
}

// Puts the newest saved step back. Returns the ids of the characters whose sheets changed.
export async function rewind(db, shared) {
  const list = shared.rewind ?? [];
  const snap = list.at(-1);
  if (!snap) throw new AppError('nothing_to_rewind', 'There is nothing to rewind.');
  if (snap.sceneId !== (await scenes.getActiveSceneId(db))) {
    clear(shared);
    throw new AppError('nothing_to_rewind', 'There is nothing to rewind.');
  }
  list.pop();
  // Characters deleted since then are left out.
  const alive = async (id) => (await db.execute({ sql: 'SELECT id FROM characters WHERE id = ?', args: [id] })).rows.length > 0;
  const tokens = [];
  for (const t of snap.tokens) if (t.character_id == null || (await alive(t.character_id))) tokens.push(t);
  await putBack(db, 'battle_tokens', snap.sceneId, tokens);
  await putBack(db, 'battle_marks', snap.sceneId, snap.marks);
  const changed = [];
  for (const [id, json] of Object.entries(snap.sheets)) {
    if (!(await alive(Number(id)))) continue;
    await db.execute({ sql: 'UPDATE characters SET sheet = ? WHERE id = ?', args: [json, Number(id)] });
    changed.push(Number(id));
  }
  shared.combat = snap.combat;
  return changed;
}
