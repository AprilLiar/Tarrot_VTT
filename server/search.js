import * as roster from './roster.js';
import * as sheets from './sheet.js';
import * as scenes from './scenes.js';
import * as stanceStore from './stances.js';
import * as fxRuntime from './effectRuntime.js';
import { listLocks } from './locks.js';
import { redactSheet, stancesLocked } from '../shared/locks.js';
import { visibleStances } from '../shared/stances.js';

// Search (see the README, "Search"): one box for everyone that finds by name characters, items, spells, Stances, Effects, Tarot cards and
// scenes. The GM finds everything; a player only what they may see: their own character and what is on its sheet (with the Arcane locks
// and hidden Tarot cards left out), and the Stances they know. Each result says where it opens.
export const SEARCH_MAX = 30;

export async function search(db, { q, gm, characterId }) {
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
  if (needle.length < 2) return [];
  const hit = (name) => typeof name === 'string' && name.toLowerCase().includes(needle);
  const out = [];
  const locks = gm ? [] : await listLocks(db);

  const characters = gm ? (await roster.listRoster(db)).characters : [await roster.getCharacter(db, characterId)].filter(Boolean);
  for (const c of characters) {
    if (hit(c.name)) out.push({ kind: 'character', id: c.id, name: c.name, characterId: c.id, owner: c.name, type: c.type });
    let sheet = await sheets.getSheet(db, c.id);
    if (!gm) sheet = redactSheet(sheet, locks, c.id);
    for (const it of sheet.items ?? []) if (hit(it.name)) out.push({ kind: 'item', id: it.id, name: it.name, characterId: c.id, owner: c.name });
    for (const sp of sheet.spells ?? []) if (hit(sp.name)) out.push({ kind: 'spell', id: sp.id, name: sp.name, characterId: c.id, owner: c.name });
    for (const card of sheet.tarot?.cards ?? []) if ((gm || !card.hidden) && hit(card.name)) out.push({ kind: 'tarot', id: card.id, name: card.name, characterId: c.id, owner: c.name });
    for (const e of sheet.effects ?? []) if (hit(e.name)) out.push({ kind: 'effect', id: e.id, name: e.name, characterId: c.id, owner: c.name });
    for (const e of sheet.effectDefs ?? []) if (hit(e.name)) out.push({ kind: 'effect', id: e.id, name: e.name, characterId: c.id, owner: c.name, library: true });
  }

  const allStances = await stanceStore.listAll(db);
  const stances = gm ? allStances : visibleStances(allStances, characterId).filter((s) => !stancesLocked(locks, s.sign));
  for (const s of stances) if (hit(s.name)) out.push({ kind: 'stance', id: s.id, name: s.name });

  if (gm) {
    for (const e of await fxRuntime.listGlobal(db)) if (hit(e.name)) out.push({ kind: 'effect', id: e.id, name: e.name, library: true });
    for (const s of await scenes.listScenes(db)) if (hit(s.name)) out.push({ kind: 'scene', id: s.id, name: s.name });
  }

  // Names that start with the text first, then the rest; each group in alphabetical order.
  const starts = (r) => (r.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return out.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name)).slice(0, SEARCH_MAX);
}
