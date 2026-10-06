import { randomUUID } from 'node:crypto';
import * as sheets from './sheet.js';
import { AppError } from './errors.js';
import { ensureDefaults } from './defaults.js';
import { putStatus, statusMsg } from './saves.js';
import { gainTemp } from '../shared/hp.js';
import { instantiate, normalizeDefinition, putEffect, grantDuration, MAX_EFFECTS_LIBRARY } from '../shared/effects.js';

// Effects at run time (the data and the numbers are in shared/effects.js): the GM's global library in the database, putting an
// Effect on a character, and spending Uses. Everything that changes a sheet goes through a journal, so a card can Revert it.

export const EFFECT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS effect_defs (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     position INTEGER NOT NULL
   )`,
];

export async function listGlobal(db) {
  await ensureDefaults(db);
  const r = await db.execute('SELECT id, data FROM effect_defs ORDER BY position, id');
  return r.rows.map((row) => {
    let raw = {};
    try {
      raw = JSON.parse(row.data);
    } catch {}
    return { ...normalizeDefinition(raw, row.id), id: row.id };
  });
}

// Adds (no id) or replaces (id) a global Effect.
export async function saveGlobal(db, id, raw) {
  if (id == null) {
    const count = (await db.execute('SELECT COUNT(*) AS n FROM effect_defs')).rows[0].n;
    if (Number(count) >= MAX_EFFECTS_LIBRARY) throw new AppError('limit', 'Too many Effects.');
    const fresh = randomUUID();
    const clean = { ...normalizeDefinition(raw, fresh), id: fresh };
    const pos = (await db.execute('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM effect_defs')).rows[0].p;
    await db.execute({ sql: 'INSERT INTO effect_defs (id, data, position) VALUES (?, ?, ?)', args: [fresh, JSON.stringify(clean), Number(pos)] });
    return clean;
  }
  const have = await db.execute({ sql: 'SELECT id FROM effect_defs WHERE id = ?', args: [String(id)] });
  if (!have.rows.length) throw new AppError('not_found', 'That entry no longer exists.');
  const clean = { ...normalizeDefinition(raw, String(id)), id: String(id) };
  await db.execute({ sql: 'UPDATE effect_defs SET data = ? WHERE id = ?', args: [JSON.stringify(clean), String(id)] });
  return clean;
}

export async function deleteGlobal(db, id) {
  const r = await db.execute({ sql: 'DELETE FROM effect_defs WHERE id = ?', args: [String(id)] });
  if (!r.rowsAffected) throw new AppError('not_found', 'That entry no longer exists.');
}

// Every Effect a character can use: the global ones and its own. `globals` = await listGlobal(db).
export const catalog = (globals, sheet) => [...globals.map((e) => ({ ...e, origin: 'global' })), ...(sheet?.effectDefs ?? []).map((e) => ({ ...e, origin: 'character' }))];

const keyword = (name) => ({ t: name, c: 'effect' });

// An Effect put on a sheet (a pure function): the instance joins the running ones (the same Effect again refreshes), and what the
// Effect starts with is given: statuses (with the Effect's duration, no Save) and Temp HP. -> { sheet, rows }
export function putOn(sheet, def, source) {
  let next = structuredClone(sheet);
  const inst = instantiate(def, source, randomUUID);
  const { effects, replaced } = putEffect(next.effects ?? [], inst);
  next.effects = effects;
  const rows = [
    replaced
      ? { key: '{label} {effect} (started again).', params: { label: { t: 'Refreshes', c: 'effect' }, effect: keyword(inst.name) } }
      : { key: '{label} {effect}.', params: { label: { t: 'Gains', c: 'effect' }, effect: keyword(inst.name) } },
  ];
  for (const p of inst.parts) {
    if (p.type !== 'grant') continue;
    for (const st of p.statuses) {
      next = putStatus(next, { key: st.key, stacks: st.stacks, duration: grantDuration(inst) }, 10);
      rows.push({ key: '{label} {list}.', params: { label: { t: 'Adds', c: 'status' }, list: statusMsg({ key: st.key, stacks: st.stacks, duration: grantDuration(inst) }) } });
    }
    if (p.temp) {
      const had = next.hp.temp ?? 0;
      next.hp.temp = gainTemp(had, p.temp);
      if (next.hp.temp > had) rows.push({ key: '{label}: {n}.', params: { label: { t: 'Temp HP', c: 'temp' }, n: { v: next.hp.temp, c: 'temp' } } });
    }
  }
  return { sheet: sheets.normalizeSheet(next), rows, instance: inst };
}

// Puts an Effect on a character and notes the change in `journal`. -> { rows }
export async function giveEffect(db, journal, characterId, def, source, emitSheet) {
  let rows = [];
  const out = await journal.update(db, characterId, (s) => {
    const r = putOn(s, def, source);
    rows = r.rows;
    return r.sheet;
  });
  emitSheet(characterId, out);
  return { rows };
}

// Spends one use of each Effect in `ids` on a character (an Effect with no uses left ends). With a `journal` the change can be
// reverted. -> { rows } (one per Effect that ended)
export async function spendUses(db, journal, characterId, ids, emitSheet) {
  const rows = [];
  if (!ids?.length) return { rows };
  const update = journal ? (fn) => journal.update(db, characterId, fn) : (fn) => sheets.updateSheet(db, characterId, fn);
  const out = await update((s) => {
    const next = structuredClone(s);
    for (const id of ids) {
      const e = next.effects.find((x) => x.id === id);
      if (!e?.uses) continue;
      e.uses.current -= 1;
      if (e.uses.current <= 0) {
        next.effects = next.effects.filter((x) => x.id !== id);
        rows.push({ key: '{effect} ends (no uses left).', params: { effect: keyword(e.name) } });
      }
    }
    return sheets.normalizeSheet(next);
  });
  emitSheet(characterId, out);
  return { rows };
}

// Spends the uses of the Effects a roll took (roll.effectsUsed, see server/rolls.js), without a card.
export const spendRollUses = (db, characterId, roll, emitSheet) => spendUses(db, null, characterId, roll.effectsUsed, emitSheet);

export const effectKeyword = keyword;
