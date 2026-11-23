import { AppError } from './errors.js';

// Counters (see the README, "Counters"): named clocks of 2 to 20 pips on a character's sheet. The GM makes, renames and deletes them and
// marks pips as Gates (a name and a text, optionally secret from the player); the GM and the player of a PC move them with + and -.
// Reaching a Gate (the counter filling up to its pip) is told to the table, unless the Gate is secret.

export const PIPS_MIN = 2;
export const PIPS_MAX = 20;
export const MAX_COUNTERS = 12;
const MAX_NAME = 60;
const MAX_TEXT = 500;

export const COUNTER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS counters (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     character_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     pips INTEGER NOT NULL,
     value INTEGER NOT NULL DEFAULT 0,
     gates TEXT NOT NULL DEFAULT '[]'
   )`,
];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanName(v) {
  const name = str(v, MAX_NAME);
  if (!name) throw new AppError('bad_value', 'Give the counter a name.');
  return name;
}

function cleanPips(v) {
  if (!Number.isInteger(v) || v < PIPS_MIN || v > PIPS_MAX) throw new AppError('bad_value', 'A counter has from {min} to {max} pips.', { min: PIPS_MIN, max: PIPS_MAX });
  return v;
}

// A Gate sits on one pip (1 = the first); one Gate per pip.
function cleanGates(list, pips) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const g of list) {
    const pip = Number(g?.pip);
    if (!Number.isInteger(pip) || pip < 1 || pip > pips || seen.has(pip)) continue;
    const name = str(g.name, MAX_NAME);
    if (!name) continue;
    seen.add(pip);
    out.push({ pip, name, text: str(g.text, MAX_TEXT), secret: g.secret === true });
  }
  return out.sort((a, b) => a.pip - b.pip);
}

function parseGates(json, pips) {
  try {
    return cleanGates(JSON.parse(json), pips);
  } catch {
    return [];
  }
}

const toCounter = (r) => {
  const pips = Number(r.pips);
  return { id: Number(r.id), characterId: Number(r.character_id), name: r.name, pips, value: Number(r.value), gates: parseGates(r.gates, pips) };
};

export async function listCounters(db, characterId) {
  const r = await db.execute({ sql: 'SELECT * FROM counters WHERE character_id = ? ORDER BY id', args: [characterId] });
  return r.rows.map(toCounter);
}

export async function getCounter(db, id) {
  if (!Number.isInteger(id)) throw new AppError('bad_id', 'Invalid counter.');
  const r = await db.execute({ sql: 'SELECT * FROM counters WHERE id = ?', args: [id] });
  if (!r.rows.length) throw new AppError('not_found', 'That counter no longer exists.');
  return toCounter(r.rows[0]);
}

export async function createCounter(db, characterId, { name, pips }) {
  const clean = { name: cleanName(name), pips: cleanPips(pips) };
  if ((await listCounters(db, characterId)).length >= MAX_COUNTERS) throw new AppError('limit', 'A character can have at most {n} counters.', { n: MAX_COUNTERS });
  const r = await db.execute({ sql: 'INSERT INTO counters (character_id, name, pips) VALUES (?, ?, ?)', args: [characterId, clean.name, clean.pips] });
  return Number(r.lastInsertRowid);
}

// Name, pips and Gates (GM). Fewer pips cut the value and drop the Gates past the end.
export async function updateCounter(db, id, { name, pips, gates }) {
  const c = await getCounter(db, id);
  const n = pips === undefined ? c.pips : cleanPips(pips);
  const next = {
    name: name === undefined ? c.name : cleanName(name),
    pips: n,
    value: Math.min(c.value, n),
    gates: cleanGates(gates === undefined ? c.gates : gates, n),
  };
  await db.execute({ sql: 'UPDATE counters SET name = ?, pips = ?, value = ?, gates = ? WHERE id = ?', args: [next.name, next.pips, next.value, JSON.stringify(next.gates), id] });
  return { ...c, ...next };
}

// + or - one pip. -> { counter, reached: the Gates filled by this step }
export async function stepCounter(db, id, by) {
  if (by !== 1 && by !== -1) throw new AppError('bad_value', 'A counter moves one pip at a time.');
  const c = await getCounter(db, id);
  const value = Math.min(c.pips, Math.max(0, c.value + by));
  await db.execute({ sql: 'UPDATE counters SET value = ? WHERE id = ?', args: [value, id] });
  const reached = value > c.value ? c.gates.filter((g) => g.pip === value) : [];
  return { counter: { ...c, value }, reached };
}

export async function deleteCounter(db, id) {
  await getCounter(db, id);
  await db.execute({ sql: 'DELETE FROM counters WHERE id = ?', args: [id] });
}

export async function deleteCharacterCounters(db, characterId) {
  await db.execute({ sql: 'DELETE FROM counters WHERE character_id = ?', args: [characterId] });
}

// What a player sees: secret Gates are left out entirely.
export const forPlayer = (list) => list.map((c) => ({ ...c, gates: c.gates.filter((g) => !g.secret) }));
