import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { normalizeCost } from '../shared/arcane.js';
import { SIGNS } from '../shared/spells.js';
import { baseId, isBaseId, defaultBase, defaultTable, normalizeStance, MAX_VARIATIONS } from '../shared/stances.js';

const variationDefaults = () => ({ name: 'Stance', description: '', color: '#ffffff', known: false, learned: [], cost: normalizeCost(null), table: defaultTable() });

// Stances live in the database for everyone (the GM configures them). A base Stance exists for every sign
// without a stored row (its defaults); it is stored once the GM changes it.

export const STANCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stances (
     id TEXT PRIMARY KEY,
     sign TEXT NOT NULL,
     parent_id TEXT,
     data TEXT NOT NULL,
     position INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS stance_vibes (
     sign TEXT PRIMARY KEY,
     vibe TEXT NOT NULL
   )`,
];

const parse = (row) => {
  let raw = {};
  try {
    raw = JSON.parse(row.data);
  } catch {}
  const isBase = isBaseId(row.id);
  const fallback = isBase ? defaultBase(row.sign) : variationDefaults();
  return { id: row.id, sign: row.sign, parentId: row.parent_id ?? null, ...normalizeStance(raw, fallback) };
};

// Every Stance: a base for each sign (stored or default) and all variations.
export async function listAll(db) {
  const rows = (await db.execute('SELECT id, sign, parent_id, data FROM stances ORDER BY position, id')).rows;
  const stored = rows.map(parse);
  const bases = SIGNS.map((sign) => stored.find((s) => s.id === baseId(sign)) ?? defaultBase(sign));
  return [...bases, ...stored.filter((s) => !isBaseId(s.id))];
}

export async function getStance(db, id) {
  const found = (await listAll(db)).find((s) => s.id === id);
  if (!found) throw new AppError('not_found', 'That Stance no longer exists.');
  return found;
}

// Vibe texts the GM wrote, by sign (a sign without one shows the default).
export async function listVibes(db) {
  const rows = (await db.execute('SELECT sign, vibe FROM stance_vibes')).rows;
  return Object.fromEntries(rows.map((r) => [r.sign, r.vibe]));
}

export async function setVibe(db, sign, vibe) {
  if (!SIGNS.includes(sign)) throw new AppError('bad_value', 'Unknown sign.');
  const v = typeof vibe === 'string' ? vibe.slice(0, 500).trim() : '';
  if (!v) await db.execute({ sql: 'DELETE FROM stance_vibes WHERE sign = ?', args: [sign] });
  else await db.execute({ sql: 'INSERT INTO stance_vibes (sign, vibe) VALUES (?, ?) ON CONFLICT(sign) DO UPDATE SET vibe = excluded.vibe', args: [sign, v] });
}

const store = (row) => JSON.stringify({ name: row.name, description: row.description, color: row.color, known: row.known, learned: row.learned, cost: row.cost, table: row.table });

// Changes a Stance (a base one is created on the first change) or adds a variation under `parentId`.
export async function saveStance(db, { id, sign, parentId, stance }) {
  const all = await listAll(db);
  if (id != null) {
    const current = all.find((s) => s.id === id);
    if (!current) throw new AppError('not_found', 'That Stance no longer exists.');
    if (stance?.name !== undefined && (typeof stance.name !== 'string' || !stance.name.trim())) throw new AppError('bad_name', 'A name is required.');
    const next = { ...current, ...normalizeStance(stance, current) };
    await db.execute({
      sql: 'INSERT INTO stances (id, sign, parent_id, data, position) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      args: [id, current.sign, current.parentId, store(next), all.indexOf(current)],
    });
    return next;
  }
  if (!SIGNS.includes(sign)) throw new AppError('bad_value', 'Unknown sign.');
  const parent = all.find((s) => s.id === parentId);
  if (!parent || parent.sign !== sign) throw new AppError('not_found', 'That Stance no longer exists.');
  if (all.length >= 12 + MAX_VARIATIONS) throw new AppError('limit', 'Too many Stances.');
  if (typeof stance?.name !== 'string' || !stance.name.trim()) throw new AppError('bad_name', 'A name is required.');
  const fresh = randomUUID();
  const make = { id: fresh, sign, parentId: parent.id, ...normalizeStance(stance, variationDefaults()) };
  const pos = Number((await db.execute('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM stances')).rows[0].p) + 12;
  await db.execute({ sql: 'INSERT INTO stances (id, sign, parent_id, data, position) VALUES (?, ?, ?, ?, ?)', args: [fresh, sign, parent.id, store(make), pos] });
  return make;
}

// Deletes a variation and everything hanging from it. A base Stance cannot be deleted.
export async function deleteStance(db, id) {
  if (isBaseId(id)) throw new AppError('bad_value', 'A base Stance cannot be deleted.');
  const all = await listAll(db);
  if (!all.some((s) => s.id === id)) throw new AppError('not_found', 'That Stance no longer exists.');
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of all) if (s.parentId && gone.has(s.parentId) && !gone.has(s.id)) (gone.add(s.id), (grew = true));
  }
  for (const g of gone) await db.execute({ sql: 'DELETE FROM stances WHERE id = ?', args: [g] });
}
