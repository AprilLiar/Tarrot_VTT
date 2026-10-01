import { describe, it, expect } from 'vitest';
import { takeDamage, gainTemp } from '../../shared/hp.js';
import { addHelpDie, normalizeHelp, MAX_HELP } from '../../shared/help.js';
import { buildRoll } from '../rolls.js';
import { defaultSheet, normalizeSheet, applySet, applyList } from '../sheet.js';
import { startOfTurn } from '../combat.js';

describe('Temp HP', () => {
  it('takes damage before HP, and only the overkill reaches HP', () => {
    expect(takeDamage({ current: 10, max: 12, temp: 5 }, 3)).toMatchObject({ current: 10, temp: 2, absorbed: 3, rest: 0 });
    expect(takeDamage({ current: 10, max: 12, temp: 5 }, 8)).toMatchObject({ current: 7, temp: 0, absorbed: 5, rest: 3 });
    expect(takeDamage({ current: 4, max: 12, temp: 0 }, 9)).toMatchObject({ current: 0, temp: 0 });
  });

  it('healing never touches it, and HP stays within its maximum', () => {
    expect(takeDamage({ current: 4, max: 12, temp: 3 }, 0, 20)).toMatchObject({ current: 12, temp: 3 });
  });

  it('cannot stack: gaining keeps the larger value', () => {
    expect(gainTemp(5, 7)).toBe(7);
    expect(gainTemp(5, 2)).toBe(5);
    expect(gainTemp(0, 4)).toBe(4);
  });

  it('is on the sheet (0 to 9999, set by hand) and shields from Bleeding at the start of a turn', () => {
    const sheet = applySet(normalizeSheet({ hp: { current: 10, max: 12, temp: 0 } }), 'hp.temp', 3);
    expect(sheet.hp.temp).toBe(3);
    expect(() => applySet(sheet, 'hp.temp', -1)).toThrow();
    const out = startOfTurn(applySet(sheet, 'statuses.bleeding', 5), 'Aria');
    expect(out.sheet.hp).toMatchObject({ current: 8, temp: 0 }); // 3 absorbed, 2 through
  });
});

describe('Help Dice', () => {
  it('keeps up to five dice from d4 to d12', () => {
    expect(normalizeHelp([4, 6, 7, 20, 12, 8, 8, 8])).toEqual([4, 6, 12, 8, 8]);
    expect(normalizeSheet({ helpDice: [6, 6] }).helpDice).toEqual([6, 6]);
  });

  it('a gained die is added; with a full track a larger die replaces the smallest, otherwise it is lost', () => {
    expect(addHelpDie([4], 8)).toEqual({ dice: [4, 8], outcome: 'added' });
    const full = [6, 4, 8, 10, 6];
    expect(addHelpDie(full, 12)).toEqual({ dice: [6, 8, 10, 6, 12], outcome: 'replaced', replaced: 4 });
    expect(addHelpDie(full, 4)).toMatchObject({ outcome: 'lost', dice: full });
    expect(addHelpDie(full, 4).dice).toHaveLength(MAX_HELP);
  });

  it('can be added and removed by hand on the sheet', () => {
    let s = applyList(defaultSheet(), 'helpDice', 'add', { sides: 8 });
    s = applyList(s, 'helpDice', 'add', { sides: 4 });
    expect(s.helpDice).toEqual([8, 4]);
    expect(() => applyList(s, 'helpDice', 'add', { sides: 20 })).toThrow();
    s = applyList(s, 'helpDice', 'remove', { index: 0 });
    expect(s.helpDice).toEqual([4]);
    expect(() => applyList(s, 'helpDice', 'remove', { index: 3 })).toThrow();
  });

  it('a spent die is rolled with the d20, like a Dice Roll Bonus', () => {
    const r = buildRoll(defaultSheet(), { kind: 'attribute', key: 'strength', dice: [{ sides: 6, sign: 1, source: 'Help Die' }] }, () => 10);
    const term = r.terms.find((t) => t.label === 'Help Die (d6)');
    expect(term.value).toBeGreaterThanOrEqual(1);
    expect(term.value).toBeLessThanOrEqual(6);
    expect(r.total).toBe(10 + 0 + term.value);
  });
});
