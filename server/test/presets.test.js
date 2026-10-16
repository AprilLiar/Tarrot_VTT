import { describe, it, expect } from 'vitest';
import { normalizeSheet, applyList } from '../sheet.js';
import { enhancementCatalog, planAttack } from '../../shared/arcane.js';
import { normalizePreset, presetKey, presetFromDraft, resolvePreset, MAX_PRESETS } from '../../shared/presets.js';

// A character with a Blade, a spell weapon and a spell Enhancement, a Manifestation weapon and an Enhancement of its own.
function sheetWith(extra = {}) {
  return normalizeSheet({
    items: [{ id: 'i1', name: 'Blade', weapon: { base: 2, kind: 'slashing', ap: 1 } }, { id: 'i2', name: 'Rock' }],
    spells: [
      { id: 'sp1', name: 'Fireball', effect: { kind: 'weapon', weapon: { base: 3, kind: 'fire', ap: 2 } }, uses: { current: 3, max: 3 } },
      { id: 'sp2', name: 'Shield Charm', effect: { kind: 'enhancement', enhancement: { name: 'x', cost: { ap: 1 }, effect: { damage: 1 } } }, uses: { current: 1, max: 1 } },
    ],
    manifestations: [{ id: 'm1', name: 'Sunbrand', effect: { kind: 'weapon', weapon: { base: 1, kind: 'fire', ap: 1 } } }],
    enhancements: [{ id: 'e1', name: 'Sharpen', repeatable: true, cost: { ap: 1 }, effect: { damage: 1 } }],
    ...extra,
  });
}

const stances = [
  { id: 'st1', name: 'Charge', sign: 'aries', learned: ['c1'], cost: { ap: 0, damage: null, statuses: [], item: null } },
  { id: 'st2', name: 'Charge', sign: 'taurus', learned: [], cost: { ap: 0, damage: null, statuses: [], item: null } },
];
const ctxFor = (sheet, st = stances) => ({ sheet, catalog: enhancementCatalog([], sheet), stances: st, canUse: (x) => x.learned.includes('c1') });
const idOf = (catalog, name) => catalog.find((e) => e.name === name).id;

describe('saving and finding a preset by name', () => {
  it('saves the names of the draft, and finds the same parts again', () => {
    const sheet = sheetWith();
    const ctx = ctxFor(sheet);
    const draft = { weapon: 'spell:sp1', counts: { [idOf(ctx.catalog, 'Power Attack')]: 2, [idOf(ctx.catalog, 'Sharpen')]: 1 }, stance: 'st1', advantage: 2, modifier: '-1' };
    const preset = presetFromDraft(draft, ctx);
    expect(preset.weapon).toEqual({ kind: 'spell', name: 'Fireball' });
    expect(preset.enhancements.map((e) => [e.name, e.count])).toEqual([['Power Attack', 2], ['Sharpen', 1]]);
    expect(preset.stance).toEqual({ name: 'Charge', sign: 'aries' });
    expect([preset.advantage, preset.modifier]).toEqual([2, -1]);
    expect(JSON.stringify(preset)).not.toContain('sp1'); // no ids anywhere
    expect(JSON.stringify(preset)).not.toContain('st1');

    const back = resolvePreset(preset, ctx);
    expect(back.missing).toEqual([]);
    expect(back.draft).toEqual(draft);
    expect(planAttack(sheet, ctx.catalog, { weapon: { kind: 'spell', spellId: 'sp1' }, enhancements: Object.entries(back.draft.counts).map(([id, count]) => ({ id, count })) }).ok).toBe(true);
  });

  it('a weapon item, a Manifestation weapon and an Enhancement spell are found by name', () => {
    const sheet = sheetWith();
    const ctx = ctxFor(sheet);
    const preset = presetFromDraft({ weapon: 'manifest:m1', counts: { 'spell:sp2': 1 }, stance: null, advantage: 0, modifier: '0' }, ctx);
    expect(preset.weapon).toEqual({ kind: 'manifestation', name: 'Sunbrand' });
    expect(preset.enhancements[0]).toMatchObject({ name: 'Shield Charm', origin: 'spell' });
    expect(resolvePreset(preset, ctx).draft.weapon).toBe('manifest:m1');
    expect(resolvePreset(presetFromDraft({ weapon: 'i1', counts: {}, stance: null, advantage: 0, modifier: '0' }, ctx), ctx).draft.weapon).toBe('i1');
  });

  it('a destroyed spell is passed over for a new one with the same name, and the old one alone is missing', () => {
    const sheet = sheetWith();
    const preset = presetFromDraft({ weapon: 'spell:sp1', counts: {}, stance: null, advantage: 0, modifier: '0' }, ctxFor(sheet));

    const destroyed = sheetWith({ spells: [{ ...sheet.spells[0], destroyed: true }] });
    const gone = resolvePreset(preset, ctxFor(destroyed));
    expect(gone.missing).toEqual([{ kind: 'weapon', name: 'Fireball' }]);
    expect(gone.draft.weapon).toBe('');

    const remade = sheetWith({ spells: [{ ...sheet.spells[0], destroyed: true }, { ...sheet.spells[0], id: 'sp9' }] });
    const found = resolvePreset(preset, ctxFor(remade));
    expect(found.missing).toEqual([]);
    expect(found.draft.weapon).toBe('spell:sp9');
  });

  it('names match ignoring case; an edited Stance with the same name is still found; an unlearned one is missing', () => {
    const sheet = sheetWith();
    const preset = presetFromDraft({ weapon: 'unarmed', counts: {}, stance: 'st1', advantage: 0, modifier: '0' }, ctxFor(sheet));
    const edited = [{ ...stances[0], id: 'st-new', name: 'charge ' }, stances[1]];
    expect(resolvePreset(preset, ctxFor(sheet, edited)).draft.stance).toBe('st-new');
    // The other sign's Stance with the same name is not learned, so it is not used.
    expect(resolvePreset(preset, ctxFor(sheet, [stances[1]])).missing).toEqual([{ kind: 'stance', name: 'Charge' }]);
    // Same-named Stances: the one of the saved sign wins when both can be used.
    const both = [{ ...stances[1], learned: ['c1'] }, stances[0]];
    expect(resolvePreset(preset, ctxFor(sheet, both)).draft.stance).toBe('st1');
  });

  it('an Enhancement that is no longer repeatable is used once; a missing one is listed and the rest is kept', () => {
    const sheet = sheetWith();
    const ctx = ctxFor(sheet);
    const preset = presetFromDraft({ weapon: 'i1', counts: { [idOf(ctx.catalog, 'Sharpen')]: 3 }, stance: null, advantage: 0, modifier: '0' }, ctx);
    const single = sheetWith({ enhancements: [{ id: 'e1', name: 'Sharpen', repeatable: false, cost: { ap: 1 }, effect: { damage: 1 } }] });
    expect(Object.values(resolvePreset(preset, ctxFor(single)).draft.counts)).toEqual([1]);
    const none = sheetWith({ enhancements: [] });
    const r = resolvePreset(preset, ctxFor(none));
    expect(r.missing).toEqual([{ kind: 'enhancement', name: 'Sharpen' }]);
    expect(r.draft.weapon).toBe('i1');
  });

  it('two setups are the same preset whatever their order or name', () => {
    const a = normalizePreset({ name: 'One', weapon: { kind: 'item', name: 'Blade' }, enhancements: [{ name: 'A', count: 1 }, { name: 'B', count: 2 }] }, 'x');
    const b = normalizePreset({ name: 'Two', weapon: { kind: 'item', name: 'blade' }, enhancements: [{ name: 'b', count: 2 }, { name: 'a', count: 1 }] }, 'y');
    const c = normalizePreset({ name: 'Two', weapon: { kind: 'item', name: 'Blade' }, enhancements: [{ name: 'B', count: 3 }, { name: 'A', count: 1 }] }, 'z');
    expect(presetKey(a)).toBe(presetKey(b));
    expect(presetKey(a)).not.toBe(presetKey(c));
  });

  it('refuses something that is not a preset', () => {
    expect(normalizePreset(null, 'x')).toBeNull();
    expect(normalizePreset({ weapon: { kind: 'sword', name: 'x' } }, 'x')).toBeNull();
    expect(normalizePreset({ weapon: { kind: 'item', name: '  ' } }, 'x')).toBeNull();
    expect(normalizePreset({ weapon: { kind: 'unarmed' }, advantage: 99, modifier: -500 }, 'x')).toMatchObject({ advantage: 10, modifier: -99 });
  });
});

describe('the preset list of a sheet', () => {
  const draft = (name) => ({ weapon: { kind: 'item', name }, enhancements: [], stance: null, advantage: 0, modifier: 0, name: `${name} attack` });

  it('adds, renames and removes; the same setup is not saved twice', () => {
    let sheet = sheetWith();
    sheet = applyList(sheet, 'attackPresets', 'add', { preset: draft('Blade') });
    sheet = applyList(sheet, 'attackPresets', 'add', { preset: { ...draft('Blade'), name: 'Again' } });
    expect(sheet.attackPresets).toHaveLength(1);
    const { id } = sheet.attackPresets[0];
    expect(id).toBeTruthy();
    sheet = applyList(sheet, 'attackPresets', 'rename', { id, name: '  My cut ' });
    expect(sheet.attackPresets[0].name).toBe('My cut');
    expect(() => applyList(sheet, 'attackPresets', 'rename', { id, name: '  ' })).toThrow();
    sheet = applyList(sheet, 'attackPresets', 'remove', { id });
    expect(sheet.attackPresets).toEqual([]);
    expect(() => applyList(sheet, 'attackPresets', 'remove', { id })).toThrow();
  });

  it('refuses a bad preset and too many', () => {
    let sheet = sheetWith();
    expect(() => applyList(sheet, 'attackPresets', 'add', { preset: { weapon: { kind: 'x' } } })).toThrow();
    for (let i = 0; i < MAX_PRESETS; i++) sheet = applyList(sheet, 'attackPresets', 'add', { preset: draft(`W${i}`) });
    expect(() => applyList(sheet, 'attackPresets', 'add', { preset: draft('one more') })).toThrow(/Too many/);
  });

  it('survives normalising the sheet', () => {
    let sheet = applyList(sheetWith(), 'attackPresets', 'add', { preset: draft('Blade') });
    sheet = normalizeSheet(JSON.parse(JSON.stringify(sheet)));
    expect(sheet.attackPresets[0]).toMatchObject({ name: 'Blade attack', weapon: { kind: 'item', name: 'Blade' } });
    expect(normalizeSheet({}).attackPresets).toEqual([]);
  });
});
