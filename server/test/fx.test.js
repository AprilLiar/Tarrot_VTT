import { describe, it, expect } from 'vitest';
import { sheetFx } from '../fx.js';

describe('board animations from a sheet change', () => {
  const sheet = (hp, statuses = {}) => ({ hp, statuses });
  it('says nothing the first time a sheet is seen', () => {
    expect(sheetFx(1, undefined, sheet({ current: 5, temp: 0 }))).toEqual([]);
  });
  it('HP lost (and the Temp HP part), healing, and statuses gained or lost', () => {
    expect(sheetFx(1, sheet({ current: 10, temp: 3 }), sheet({ current: 6, temp: 0 }))).toEqual([{ kind: 'hp', characterId: 1, loss: 4, tempLoss: 3, heal: 0 }]);
    expect(sheetFx(1, sheet({ current: 2, temp: 0 }), sheet({ current: 7, temp: 0 }))).toEqual([{ kind: 'hp', characterId: 1, loss: 0, tempLoss: 0, heal: 5 }]);
    expect(sheetFx(1, sheet({ current: 5, temp: 0 }, { bleeding: 1, prone: 1 }), sheet({ current: 5, temp: 0 }, { bleeding: 3 }))).toEqual([
      { kind: 'status', characterId: 1, key: 'bleeding', delta: 2 },
      { kind: 'status', characterId: 1, key: 'prone', delta: -1 },
    ]);
    expect(sheetFx(1, sheet({ current: 5, temp: 0 }), sheet({ current: 5, temp: 0 }))).toEqual([]);
  });
});
