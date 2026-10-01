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
    const adv = buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: 1 }, fixed(14, 7));
    expect(adv).toMatchObject({ dice: [14, 7], natural: 14, mode: 'advantage' });
    const dis = buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: -1 }, fixed(14, 7));
    expect(dis).toMatchObject({ dice: [14, 7], natural: 7, mode: 'disadvantage' });
  });

  it('allows up to 10 manual levels and caps the total at 10', () => {
    const sheet = defaultSheet();
    expect(buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: 10 }, () => 5).dice).toHaveLength(11);
    expect(buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: -10 }, () => 5).dice).toHaveLength(11);
    // Statuses plus manual levels never go beyond 10 levels (11 dice).
    const dazed = applySet(sheetWith({}), 'statuses.dazed', 30);
    const r = buildRoll(dazed, { kind: 'attribute', key: 'spirit', advantage: -5 }, () => 5);
    expect(r.advantage.net).toBe(-10);
    expect(r.dice).toHaveLength(11);
  });

  it('each level adds one die', () => {
    const r = buildRoll(defaultSheet(), { kind: 'attribute', key: 'strength', advantage: 2 }, fixed(3, 17, 9));
    expect(r.dice).toEqual([3, 17, 9]);
    expect(r.natural).toBe(17);
  });

  it('adds a custom modifier as its own term and rejects bad ones', () => {
    const sheet = sheetWith({ 'stats.strength': 1 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'strength', modifier: -2 }, fixed(10));
    expect(r.expression).toBe('1d20 + 1(Strength) - 2(Custom)');
    expect(r.total).toBe(9);
    expect(() => buildRoll(sheet, { kind: 'attribute', key: 'strength', modifier: 1.5 })).toThrow();
    expect(() => buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: 11 })).toThrow();
    expect(() => buildRoll(sheet, { kind: 'attribute', key: 'strength', advantage: 0.5 })).toThrow();
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

describe('combat mastery rolls', () => {
  it('adds the Mastery and the Experience Modifier', () => {
    const sheet = sheetWith({ 'masteries.magic': 4, experience: 3 });
    const r = buildRoll(sheet, { kind: 'mastery', key: 'magic' }, fixed(10));
    expect(r.title).toBe('Magic (Combat Mastery Roll)');
    expect(r.expression).toBe('1d20 + 4(Mastery: Magic) + 3(Experience Modifier)');
    expect(r.total).toBe(17);
    expect(() => buildRoll(sheet, { kind: 'mastery', key: 'luck' })).toThrow();
  });
});

describe('statuses apply automatically', () => {
  const withStatus = (sets, statuses) =>
    Object.entries(statuses).reduce((s, [k, v]) => applySet(s, `statuses.${k}`, v), sheetWith(sets));

  it('Dazed (2) gives 2 levels of Disadvantage on an Intelligence check', () => {
    const sheet = withStatus({ 'stats.intelligence': 2 }, { dazed: 2 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'intelligence' }, fixed(15, 4, 9));
    expect(r.dice).toEqual([15, 4, 9]);
    expect(r.natural).toBe(4);
    expect(r.advantage).toEqual({ net: -2, sources: [{ label: 'Dazed 2', levels: -2 }] });
  });

  it('Dazed does not touch physical checks or saves', () => {
    const sheet = withStatus({}, { dazed: 2 });
    expect(buildRoll(sheet, { kind: 'attribute', key: 'strength' }, fixed(10)).advantage.net).toBe(0);
    expect(buildRoll(sheet, { kind: 'save', key: 'intelligence' }, fixed(10)).advantage.net).toBe(0);
  });

  it('applies to skills through the stat they resolve to', () => {
    const sheet = withStatus({ 'stats.spirit': 3 }, { dazed: 1, impaired: 1 });
    expect(buildRoll(sheet, { kind: 'skill', key: 'mental_resolve' }, fixed(10, 5)).advantage.net).toBe(-1);
    expect(buildRoll(sheet, { kind: 'skill', key: 'speed' }, fixed(10, 5)).advantage.net).toBe(-1);
    expect(buildRoll(sheet, { kind: 'skill', key: 'astrology' }, fixed(10, 5)).advantage.net).toBe(-1);
  });

  it('Weakened hits physical saves and Disoriented hits mental saves', () => {
    const sheet = withStatus({}, { weakened: 1, disoriented: 2 });
    expect(buildRoll(sheet, { kind: 'save', key: 'physical' }, fixed(1, 2)).advantage.net).toBe(-1);
    expect(buildRoll(sheet, { kind: 'save', key: 'mental' }, fixed(1, 2, 3)).advantage.net).toBe(-2);
    expect(buildRoll(sheet, { kind: 'save', key: 'spirit' }, fixed(1, 2, 3)).advantage.net).toBe(-2);
  });

  it('Grappled gives Disadvantage on Dexterity saves only', () => {
    const sheet = withStatus({}, { grappled: 1 });
    expect(buildRoll(sheet, { kind: 'save', key: 'dexterity' }, fixed(10, 3)).advantage.net).toBe(-1);
    expect(buildRoll(sheet, { kind: 'save', key: 'strength' }, fixed(10)).advantage.net).toBe(0);
  });

  it('Exhaustion is a flat penalty on every check and save, shown in the breakdown', () => {
    const sheet = withStatus({ 'stats.strength': 2 }, { exhaustion: 2 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'strength' }, fixed(10));
    expect(r.expression).toBe('1d20 + 2(Strength) - 2(Exhaustion)');
    expect(r.total).toBe(10);
  });

  it('manual levels stack with statuses and can cancel them', () => {
    const sheet = withStatus({}, { dazed: 1 });
    const r = buildRoll(sheet, { kind: 'attribute', key: 'spirit', advantage: 1 }, fixed(9));
    expect(r.advantage.net).toBe(0);
    expect(r.dice).toEqual([9]);
    expect(r.mode).toBe('normal');
    expect(r.advantage.sources.map((x) => x.label)).toEqual(['Dazed 1', 'Manual']);
  });
});

describe('statuses on Combat Mastery rolls', () => {
  const rolled = (sets, key) => {
    const sheet = sheetWith(sets);
    return buildRoll(sheet, { kind: 'mastery', key }, fixed(10, 15, 3));
  };

  it('Impaired and Hindered weigh on Stance rolls, as Disadvantage levels', () => {
    const r = rolled({ 'statuses.impaired': 1, 'statuses.hindered': 1 }, 'stances');
    expect(r.advantage.net).toBe(-2);
    expect(r.mode).toBe('disadvantage');
    expect(r.dice).toHaveLength(3);
  });

  it('Dazed weighs on Manifest rolls but not on Stance rolls', () => {
    expect(rolled({ 'statuses.dazed': 2 }, 'manifestation').advantage.net).toBe(-2);
    expect(rolled({ 'statuses.dazed': 2 }, 'stances').advantage.net).toBe(0);
  });

  it('nothing changes a Magic roll', () => {
    const r = rolled({ 'statuses.impaired': 2, 'statuses.hindered': 2, 'statuses.dazed': 2, 'statuses.exhaustion': 3 }, 'magic');
    expect(r.advantage.net).toBe(0);
    expect(r.terms.map((t) => t.label)).toEqual(['Mastery: Magic', 'Experience Modifier']);
  });

  it('Exhaustion is a penalty on Stance and Manifest rolls too', () => {
    const r = rolled({ 'statuses.exhaustion': 2 }, 'stances');
    expect(r.terms.find((t) => t.label === 'Exhaustion')).toMatchObject({ value: -2 });
    expect(rolled({ 'statuses.exhaustion': 2 }, 'manifestation').terms.some((t) => t.label === 'Exhaustion')).toBe(true);
  });

  it('weapon attack rolls are not touched by these statuses', () => {
    const r = buildRoll(sheetWith({ 'statuses.impaired': 2, 'statuses.hindered': 2 }), { kind: 'weapon', key: 'prime' }, fixed(10));
    expect(r.advantage.net).toBe(0);
  });
});
