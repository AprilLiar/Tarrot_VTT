import { DEFAULT_ACTIONS, DEFAULT_EFFECTS } from '../shared/basicActions.js';

// The Basic Actions and the Effects of some of them are shipped with the app, and kept in the database like the GM's own so they can be
// edited and deleted. They are put in once (a row in `meta` remembers it), so a deleted default stays deleted.
const KEY = 'defaults_seeded_v1';
const done = new WeakSet();

export async function ensureDefaults(db) {
  if (done.has(db)) return;
  const have = await db.execute({ sql: 'SELECT value FROM meta WHERE key = ?', args: [KEY] });
  if (!have.rows.length) {
    const statements = [];
    DEFAULT_EFFECTS.forEach((e, i) => statements.push({ sql: 'INSERT OR IGNORE INTO effect_defs (id, data, position) VALUES (?, ?, ?)', args: [e.id, JSON.stringify(e), i + 1] }));
    DEFAULT_ACTIONS.forEach((a, i) => statements.push({ sql: 'INSERT OR IGNORE INTO basic_actions (id, data, position) VALUES (?, ?, ?)', args: [a.id, JSON.stringify(a), i + 1] }));
    statements.push({ sql: 'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', args: [KEY, '1'] });
    await db.batch(statements, 'write');
  }
  done.add(db);
}
