import { describe, it, expect } from 'vitest';
import { normalizeSheet } from '../sheet.js';
import { planRoll } from '../../shared/roll-plan.js';
import { restMax, restSpendMax, takeRest } from '../../shared/rest.js';
import { oxLevels, oxLimit, oxState, bleedProblem } from '../../shared/oxidization.js';

const withOx = (ox, extra = {}) => normalizeSheet({ stats: { strength: 2 }, hp: { current: 10, max: 10 }, ap: { current: 4 }, statuses: ox ? { blood_oxidization: ox } : {}, ...extra });
const net = (sheet, req) => planRoll(sheet, req).net;

describe('Blood Oxidization', () => {
  it('the limit is Strength, at least 1; over it a coma, over double it death', () => {
    expect(oxLimit(withOx(0))).toBe(2);
    expect(oxLimit(normalizeSheet({ stats: { strength: -1 } }))).toBe(1);
    expect(oxState(withOx(2))).toBe('ok');
    expect(oxState(withOx(3))).toBe('coma');
    expect(oxState(withOx(4))).toBe('coma');
    expect(oxState(withOx(5))).toBe('dead');
  });

  it('1 Ox: Disadvantage on Checks (Skill, Attribute, Magic, Stance) but not Saves, Luck or Attacks', () => {
    const s = withOx(1);
    expect(net(s, { kind: 'skill', key: 'awareness' })).toBe(-1);
    expect(net(s, { kind: 'attribute', key: 'strength' })).toBe(-1);
    expect(net(s, { kind: 'mastery', key: 'magic' })).toBe(-1);
    expect(net(s, { kind: 'mastery', key: 'stances' })).toBe(-1);
    expect(net(s, { kind: 'mastery', key: 'manifestation' })).toBe(0);
    expect(net(s, { kind: 'save', key: 'strength' })).toBe(0);
    expect(net(s, { kind: 'attribute', key: 'luck' })).toBe(0);
    expect(net(s, { kind: 'weapon', key: 'prime', attack: 'weapon' })).toBe(0);
  });

  it('2 Ox: Slowed and Disadvantage on Attacks; 3 Ox and more: Disadvantage Ox - 1', () => {
    const two = withOx(2);
    expect(two.statuses.slowed).toBe(1);
    expect(net(two, { kind: 'weapon', key: 'prime', attack: 'weapon' })).toBe(-1);
    expect(net(two, { kind: 'mastery', key: 'magic', attack: 'magic' })).toBe(-1);
    const big = normalizeSheet({ stats: { strength: 6 }, statuses: { blood_oxidization: 4 } });
    expect(oxLevels(big, { kind: 'skill', key: 'awareness' })).toBe(-3);
    expect(oxLevels(big, { kind: 'weapon', attack: 'weapon' })).toBe(-3);
  });

  it('puts on Slowed and Unconscious by itself and takes off only what it put on', () => {
    const coma = withOx(3);
    expect(coma.statuses).toMatchObject({ slowed: 1, unconscious: 1 });
    const back = normalizeSheet({ ...coma, statuses: { ...coma.statuses, blood_oxidization: 1 } });
    expect(back.statuses.slowed).toBeUndefined();
    expect(back.statuses.unconscious).toBeUndefined();
    // Slowed the character had before stays.
    const own = normalizeSheet({ stats: { strength: 2 }, statuses: { slowed: 2 } });
    const up = normalizeSheet({ ...own, statuses: { ...own.statuses, blood_oxidization: 2 } });
    const down = normalizeSheet({ ...up, statuses: { ...up.statuses, blood_oxidization: 0 } });
    expect(down.statuses.slowed).toBe(2);
  });

  it('letting blood needs Ox, HP left above 0 and, in combat, 1 AP', () => {
    expect(bleedProblem(withOx(0), { inCombat: false })).toBe('no_ox');
    expect(bleedProblem(withOx(1), { inCombat: false })).toBeNull();
    expect(bleedProblem(withOx(1, { hp: { current: 3, max: 10 } }), { inCombat: false })).toBe('low_hp');
    expect(bleedProblem(withOx(1, { ap: { current: 0 } }), { inCombat: true })).toBe('no_ap');
    expect(bleedProblem(withOx(1, { ap: { current: 0 } }), { inCombat: false })).toBeNull();
  });
});


describe('Rests', () => {
  const sheet = (extra) => normalizeSheet({ stats: { strength: 3 }, hp: { current: 5, max: 7 }, ...extra });
  it('Rest Points go up to Strength (at least 1) and start full', () => {
    expect(restMax(sheet())).toBe(3);
    expect(sheet().rest.current).toBe(3);
    expect(restMax(normalizeSheet({ stats: { strength: -2 } }))).toBe(1);
    expect(normalizeSheet({ stats: { strength: 2 }, rest: { current: 9 } }).rest.current).toBe(2);
  });
  it('a rest spends RP for HP, never past the maximum; a Long Rest gives 1 RP back at the end', () => {
    expect(restSpendMax(sheet())).toBe(2); // 2 HP missing
    expect(takeRest(sheet(), 'short', 2)).toEqual({ hp: 7, rp: 1 });
    expect(takeRest(sheet(), 'long', 2)).toEqual({ hp: 7, rp: 2 });
    expect(takeRest(sheet(), 'long', 0)).toEqual({ hp: 5, rp: 3 }); // already full: stays at the maximum
    expect(takeRest(sheet(), 'short', 3)).toEqual({ problem: 'bad_spend' });
    expect(takeRest(sheet(), 'nap', 1)).toEqual({ problem: 'bad_kind' });
  });
});
