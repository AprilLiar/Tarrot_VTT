import { describe, it, expect } from 'vitest';
import { buildRoll } from '../rolls.js';
import { defaultSheet, applySet } from '../sheet.js';

function sheetWith(sets) {
  return Object.entries(sets).reduce((s, [path, value]) => applySet(s, path, value), defaultSheet());
}

const fixed = (...values) => {
  const queue = [...values];
  return () => queue.shift();
};

describe('attribute rolls', () => {
  it('rolls d20 plus the stat and formats the breakdown', () => {
    const sheet = sheetWith({ 'stats.dexterity': 3 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'dexterity' }, fixed(12));
    expect(r).toMatchObject({ title: 'Dexterity Attribute Roll', natural: 12, total: 15 });
    expect(r.expression).toBe('1d20 + 3(Dexterity)');
  });

  it('shows negative stats and Luck as an attribute', () => {
    const sheet = sheetWith({ 'stats.luck': -2 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'luck' }, fixed(10));
    expect(r.total).toBe(8);
    expect(r.expression).toBe('1d20 - 2(Luck)');
  });
});

describe('saves', () => {
  it('adds the stat and its X Defence', () => {
    const sheet = sheetWith({ 'stats.strength': 2, 'xDefence.strength': 3 });
    const r = buildRoll(sheet, { kind: 'save', key: 'strength' }, fixed(10));
    expect(r.total).toBe(15);
    expect(r.expression).toBe('1d20 + 2(Strength) + 3(Strength Defence)');
  });

  it('refuses a Luck save', () => {
    expect(() => buildRoll(defaultSheet(), { kind: 'save', key: 'luck' })).toThrow(/no Save/);
  });

  it('Physical Save uses the better of stat + X Defence', () => {
    const sheet = sheetWith({
      'stats.strength': 4,
      'stats.dexterity': 2,
      'xDefence.dexterity': 3,
    });
    const r = buildRoll(sheet, { kind: 'save', key: 'physical' }, fixed(10));
    // Dexterity 2 + 3 = 5 beats Strength 4 + 0.
    expect(r.title).toBe('Physical Save');
    expect(r.expression).toBe('1d20 + 2(Dexterity) + 3(Dexterity Defence)');
    expect(r.total).toBe(15);
  });

  it('Mental Save picks between Intelligence and Spirit', () => {
    const sheet = sheetWith({ 'stats.intelligence': 1, 'stats.spirit': 3 });
    const r = buildRoll(sheet, { kind: 'save', key: 'mental' }, fixed(5));
    expect(r.expression).toBe('1d20 + 3(Spirit)');
  });
});

describe('skill rolls', () => {
  it('adds the scaling stat and Mastery tier', () => {
    const sheet = sheetWith({ 'stats.dexterity': 3, 'skills.fine_motor_skills': 1 });
    const r = buildRoll(sheet, { kind: 'skill', key: 'fine_motor_skills' }, fixed(8));
    expect(r.expression).toBe('1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills)');
    expect(r.total).toBe(12);
  });

  it('Awareness scales from the highest stat', () => {
    const sheet = sheetWith({ 'stats.strength': 1, 'stats.luck': 5 });
    const r = buildRoll(sheet, { kind: 'skill', key: 'awareness' }, fixed(1));
    expect(r.expression).toBe('1d20 + 5(Prime: Luck)');
  });

  it('Body Movement uses the higher of Strength and Dexterity', () => {
    const sheet = sheetWith({ 'stats.strength': 2, 'stats.dexterity': 4, 'skills.body_movement': 3 });
    const r = buildRoll(sheet, { kind: 'skill', key: 'body_movement' }, fixed(10));
    expect(r.expression).toBe('1d20 + 4(Dexterity) + 3(Mastery: Body Movement)');
  });

  it('Likability uses the higher of Spirit and Intelligence', () => {
    const sheet = sheetWith({ 'stats.spirit': 1, 'stats.intelligence': 2 });
    const r = buildRoll(sheet, { kind: 'skill', key: 'likability' }, fixed(10));
    expect(r.expression).toBe('1d20 + 2(Intelligence)');
  });
});

describe('modes, modifiers and naturals', () => {
  it('takes the higher die with advantage and the lower with disadvantage', () => {
    const sheet = defaultSheet();
    const adv = buildRoll(sheet, { kind: 'attribute', key: 'strength', mode: 'advantage' }, fixed(14, 7));
    expect(adv).toMatchObject({ dice: [14, 7], natural: 14 });
    const dis = buildRoll(sheet, { kind: 'attribute', key: 'strength', mode: 'disadvantage' }, fixed(14, 7));
    expect(dis).toMatchObject({ dice: [14, 7], natural: 7 });
  });

  it('adds a custom modifier as its own term and rejects bad ones', () => {
    const sheet = sheetWith({ 'stats.strength': 1 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'strength', modifier: -2 }, fixed(10));
    expect(r.expression).toBe('1d20 + 1(Strength) - 2(Custom)');
    expect(r.total).toBe(9);
    expect(() => buildRoll(sheet, { kind: 'attribute', key: 'strength', modifier: 1.5 })).toThrow();
    expect(() => buildRoll(sheet, { kind: 'attribute', key: 'strength', mode: 'lucky' })).toThrow();
  });

  it('flags natural 20 and natural 1 on any roll', () => {
    const sheet = defaultSheet();
    expect(buildRoll(sheet, { kind: 'attribute', key: 'strength' }, fixed(20)).flags).toEqual(['critical']);
    expect(buildRoll(sheet, { kind: 'skill', key: 'speed' }, fixed(1)).flags).toEqual(['critical_failure']);
    expect(buildRoll(sheet, { kind: 'attribute', key: 'strength' }, fixed(11)).flags).toEqual([]);
  });

  it('rejects unknown kinds and keys', () => {
    expect(() => buildRoll(defaultSheet(), { kind: 'attack', key: 'x' })).toThrow();
    expect(() => buildRoll(defaultSheet(), { kind: 'skill', key: 'nope' })).toThrow();
  });
});
