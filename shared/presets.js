import { MAX_COUNT, spellUsable } from './arcane.js';
import { MAX_MANUAL_LEVELS } from './roll-plan.js';

// Attack Presets (see the README): a saved attack setup, kept by NAMES and not by ids. A weapon, an Enhancement or a Stance
// is found again by its name when the preset is used, so a destroyed spell, an edited Stance or a deleted-and-remade item
// never corrupts a preset: whatever has the same name at that moment is used. Targets are never part of a preset.

export const MAX_PRESETS = 50;
export const MAX_PRESET_NAME = 60;
const MAX_PRESET_ENHANCEMENTS = 40;
const WEAPON_KINDS = ['unarmed', 'item', 'spell', 'manifestation'];
const ORIGINS = ['default', 'global', 'character', 'spell', 'manifestation'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Names are compared ignoring case and the spaces around them.
export const sameName = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
const clampInt = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);

// A preset as stored: { id, name, weapon: { kind, name }, enhancements: [{ name, origin, count }], stance: { name, sign } | null,
// advantage, modifier }. Returns null for something that is not a usable preset.
export function normalizePreset(raw, id) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = WEAPON_KINDS.includes(raw.weapon?.kind) ? raw.weapon.kind : null;
  if (!kind) return null;
  const weaponName = kind === 'unarmed' ? '' : str(raw.weapon?.name, MAX_PRESET_NAME);
  if (kind !== 'unarmed' && !weaponName) return null;
  const seen = new Set();
  const enhancements = [];
  for (const e of Array.isArray(raw.enhancements) ? raw.enhancements.slice(0, MAX_PRESET_ENHANCEMENTS) : []) {
    const name = str(e?.name, MAX_PRESET_NAME);
    const count = clampInt(e?.count, 1, MAX_COUNT, 0);
    if (!name || !count || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    enhancements.push({ name, origin: ORIGINS.includes(e?.origin) ? e.origin : 'default', count });
  }
  const stanceName = str(raw.stance?.name, MAX_PRESET_NAME);
  const name = str(raw.name, MAX_PRESET_NAME);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : id,
    name: name || 'Attack',
    weapon: { kind, name: weaponName },
    enhancements,
    stance: stanceName ? { name: stanceName, sign: str(raw.stance?.sign, 20) } : null,
    advantage: clampInt(raw.advantage, -MAX_MANUAL_LEVELS, MAX_MANUAL_LEVELS, 0),
    modifier: clampInt(raw.modifier, -99, 99, 0),
  };
}

export function normalizePresets(raw, makeId) {
  const out = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, MAX_PRESETS) : []) {
    const p = normalizePreset(r, makeId());
    if (p) out.push(p);
  }
  return out;
}

// What makes two presets the same attack (the name of the preset itself does not count): used to light the star and to
// refuse saving the same setup twice.
export function presetKey(p) {
  const enh = [...p.enhancements].map((e) => `${e.name.toLowerCase()}*${e.count}`).sort();
  return JSON.stringify([p.weapon.kind, p.weapon.name.toLowerCase(), enh, p.stance ? p.stance.name.toLowerCase() : null, p.advantage, p.modifier]);
}

// ---- The footer's draft <-> a preset --------------------------------------------------------------------------------

// The draft is { weapon: 'unarmed' | itemId | 'spell:<id>' | 'manifest:<id>', counts: { <enhancement id>: n }, stance: id | null,
// advantage, modifier: '<text>' }. `ctx` = { sheet, catalog, stances } (the catalog is `enhancementCatalog(...)`).
// Returns a preset (without id and name) for the draft, or null when a part of it cannot be named.
export function presetFromDraft(draft, ctx) {
  const { sheet, catalog, stances } = ctx;
  let weapon;
  if (draft.weapon === 'unarmed') weapon = { kind: 'unarmed', name: '' };
  else if (draft.weapon.startsWith('spell:')) {
    const sp = sheet.spells.find((x) => x.id === draft.weapon.slice('spell:'.length));
    weapon = sp && { kind: 'spell', name: sp.name };
  } else if (draft.weapon.startsWith('manifest:')) {
    const m = sheet.manifestations.find((x) => x.id === draft.weapon.slice('manifest:'.length));
    weapon = m && { kind: 'manifestation', name: m.name };
  } else {
    const item = sheet.items.find((x) => x.id === draft.weapon);
    weapon = item && { kind: 'item', name: item.name };
  }
  if (!weapon) return null;
  const enhancements = [];
  for (const [id, count] of Object.entries(draft.counts ?? {})) {
    if (!(count > 0)) continue;
    const e = catalog.find((x) => x.id === id);
    if (!e) return null;
    enhancements.push({ name: e.name, origin: e.origin, count });
  }
  let stance = null;
  if (draft.stance) {
    const st = stances.find((x) => x.id === draft.stance);
    if (!st) return null;
    stance = { name: st.name, sign: st.sign ?? '' };
  }
  return normalizePreset({ name: 'Attack', weapon, enhancements, stance, advantage: draft.advantage, modifier: Number(draft.modifier) }, 'new');
}

// Finds a preset's parts again by name. `ctx` = { sheet, catalog, stances, canUse(stance) } (`canUse`: this character may use the
// Stance). Returns { draft, missing: [{ kind: 'weapon' | 'enhancement' | 'stance', name }] }: `draft` holds every part that was found
// (a weapon that was not found leaves the draft with no weapon chosen), and `missing` lists the names that were not.
export function resolvePreset(preset, ctx) {
  const { sheet, catalog, stances, canUse } = ctx;
  const missing = [];
  const draft = { weapon: '', counts: {}, stance: null, advantage: preset.advantage, modifier: String(preset.modifier) };

  const w = preset.weapon;
  if (w.kind === 'unarmed') draft.weapon = 'unarmed';
  else if (w.kind === 'item') {
    const item = sheet.items.find((i) => i.weapon && sameName(i.name, w.name));
    if (item) draft.weapon = item.id;
  } else if (w.kind === 'spell') {
    const named = sheet.spells.filter((sp) => sp.effect.kind === 'weapon' && sameName(sp.name, w.name));
    const sp = named.find(spellUsable); // a destroyed spell is passed over for a new one with the same name
    if (sp) draft.weapon = `spell:${sp.id}`;
  } else {
    const m = sheet.manifestations.find((x) => x.effect.kind === 'weapon' && sameName(x.name, w.name));
    if (m) draft.weapon = `manifest:${m.id}`;
  }
  if (!draft.weapon) missing.push({ kind: 'weapon', name: w.name });

  for (const want of preset.enhancements) {
    const named = catalog.filter((e) => sameName(e.name, want.name));
    const e = named.find((x) => x.origin === want.origin) ?? named[0];
    if (!e) {
      missing.push({ kind: 'enhancement', name: want.name });
      continue;
    }
    // An Enhancement that is no longer repeatable can only be used once.
    draft.counts[e.id] = Math.min(want.count, e.repeatable ? MAX_COUNT : 1);
  }

  if (preset.stance) {
    const named = stances.filter((st) => sameName(st.name, preset.stance.name) && canUse(st));
    const st = named.find((x) => x.sign === preset.stance.sign) ?? named[0];
    if (st) draft.stance = st.id;
    else missing.push({ kind: 'stance', name: preset.stance.name });
  }
  return { draft, missing };
}
