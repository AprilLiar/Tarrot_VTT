import { describe, it, expect } from 'vitest';
import { defaultSheet, normalizeSheet, applySet, applyList, takeItem, giveItem, apMax } from '../sheet.js';

describe('normalizeSheet', () => {
  it('fills a full valid sheet from nothing and clamps garbage', () => {
    const s = normalizeSheet({ stats: { strength: 99, dexterity: 'x' }, experience: 0, skills: { speed: 50 } });
    expect(s.stats.strength).toBe(7);
    expect(s.stats.dexterity).toBe(0);
    expect(s.experience).toBe(1);
    expect(s.skills.speed).toBe(10);
    expect(s.ap.current).toBe(4);
    expect(Object.keys(s.stats)).toEqual(['strength', 'dexterity', 'intelligence', 'spirit', 'luck']);
    expect(Object.keys(s.xDefence)).toEqual(['strength', 'dexterity', 'intelligence', 'spirit']);
  });
});

describe('applySet', () => {
  it('validates ranges', () => {
    const s = defaultSheet();
    expect(applySet(s, 'stats.strength', 7).stats.strength).toBe(7);
    expect(applySet(s, 'stats.strength', -2).stats.strength).toBe(-2);
    expect(() => applySet(s, 'stats.strength', 8)).toThrow();
    expect(() => applySet(s, 'stats.strength', 1.5)).toThrow();
    expect(() => applySet(s, 'masteries.magic', 0)).toThrow();
    expect(() => applySet(s, 'skills.speed', 11)).toThrow();
    expect(() => applySet(s, 'experience', 11)).toThrow();
  });

  it('rejects unknown paths and Luck defence', () => {
    const s = defaultSheet();
    expect(() => applySet(s, 'stats.charisma', 1)).toThrow(/Unknown/);
    expect(() => applySet(s, 'xDefence.luck', 1)).toThrow(/Unknown/);
    expect(() => applySet(s, '__proto__.x', 1)).toThrow();
  });

  it('does not mutate its input', () => {
    const s = defaultSheet();
    applySet(s, 'stats.strength', 3);
    expect(s.stats.strength).toBe(0);
  });

  it('Minion is NPC-only and lowers max AP', () => {
    const s = defaultSheet();
    expect(() => applySet(s, 'ap.minion', true, { type: 'pc' })).toThrow(/NPC/);
    const m = applySet(s, 'ap.minion', true, { type: 'npc' });
    expect(apMax(m)).toBe(2);
    expect(m.ap.current).toBe(2);
    expect(() => applySet(m, 'ap.current', 3)).toThrow();
  });

  it('stores resistances and drops empty ones', () => {
    let s = applySet(defaultSheet(), 'resistances.fire', { flat: 2, half: true });
    expect(s.resistances.fire).toMatchObject({ flat: 2, half: true, double: false });
    s = applySet(s, 'resistances.fire', { flat: 0, half: false });
    expect(s.resistances.fire).toBeUndefined();
    expect(() => applySet(s, 'resistances.love', { flat: 1 })).toThrow();
  });

  it('handles statuses: stacks only where they stack', () => {
    let s = applySet(defaultSheet(), 'statuses.bleeding', 3);
    expect(s.statuses.bleeding).toBe(3);
    s = applySet(s, 'statuses.blinded', 5);
    expect(s.statuses.blinded).toBe(1);
    s = applySet(s, 'statuses.bleeding', 0);
    expect(s.statuses.bleeding).toBeUndefined();
    expect(() => applySet(s, 'statuses.nope', 1)).toThrow();
  });
});

describe('features and items', () => {
  it('adds, updates and removes features', () => {
    let s = applyList(defaultSheet(), 'features', 'add', { name: 'Keen Eye', description: 'See far' });
    const id = s.features[0].id;
    s = applyList(s, 'features', 'update', { id, description: 'See very far' });
    expect(s.features[0]).toMatchObject({ name: 'Keen Eye', description: 'See very far' });
    s = applyList(s, 'features', 'remove', { id });
    expect(s.features).toHaveLength(0);
    expect(() => applyList(s, 'features', 'add', { name: '  ' })).toThrow();
  });

  it('spends uses down to 0, stays at 0, and refills', () => {
    let s = applyList(defaultSheet(), 'items', 'add', { name: 'Potion', usesMax: 2 });
    const id = s.items[0].id;
    s = applyList(s, 'items', 'use', { id });
    s = applyList(s, 'items', 'use', { id });
    expect(s.items[0].uses).toEqual({ current: 0, max: 2 });
    expect(() => applyList(s, 'items', 'use', { id })).toThrow(/No uses/);
    s = applyList(s, 'items', 'update', { id, usesCurrent: 2 });
    expect(s.items[0].uses.current).toBe(2);
    expect(() => applyList(s, 'items', 'update', { id, usesCurrent: 3 })).toThrow();
    expect(() => applyList(s, 'items', 'update', { id, usesMax: 101 })).toThrow();
  });

  it('lowering max uses clamps current', () => {
    let s = applyList(defaultSheet(), 'items', 'add', { name: 'Arrows', usesMax: 20 });
    s = applyList(s, 'items', 'update', { id: s.items[0].id, usesMax: 5 });
    expect(s.items[0].uses).toEqual({ current: 5, max: 5 });
  });

  it('keeps state within the item-specific options', () => {
    let s = applyList(defaultSheet(), 'items', 'add', { name: 'Sword' });
    const id = s.items[0].id;
    s = applyList(s, 'items', 'update', { id, states: ['Sheathed', 'Drawn'], state: 'Drawn' });
    expect(s.items[0].state).toBe('Drawn');
    s = applyList(s, 'items', 'update', { id, states: ['Sheathed'] });
    expect(s.items[0].state).toBe('');
  });

  it('copies with the same name and a new id; same-named items stay distinct', () => {
    let s = applyList(defaultSheet(), 'items', 'add', { name: 'Rope' });
    s = applyList(s, 'items', 'copy', { id: s.items[0].id });
    expect(s.items).toHaveLength(2);
    expect(s.items[0].name).toBe(s.items[1].name);
    expect(s.items[0].id).not.toBe(s.items[1].id);
  });

  it('moves an item between sheets with a fresh id', () => {
    const a = applyList(defaultSheet(), 'items', 'add', { name: 'Gem' });
    const { sheet: a2, item } = takeItem(a, a.items[0].id);
    const b = giveItem(defaultSheet(), item);
    expect(a2.items).toHaveLength(0);
    expect(b.items[0].name).toBe('Gem');
    expect(b.items[0].id).not.toBe(item.id);
  });
});
