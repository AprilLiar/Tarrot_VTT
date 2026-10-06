import { describe, it, expect } from 'vitest';
import * as D from '../../shared/rules-data.js';
import { cleanSetting } from '../../shared/settings.js';
import { STATUS_ICONS } from '../../client/src/components/scene/statusIconData.js';
import { iconGrid } from '../../client/src/lib/statusIconGrid.js';
import { tokenStatuses } from '../battle.js';

describe('status icons on tokens', () => {
  it('every status has an icon', () => {
    for (const s of D.STATUSES) expect(STATUS_ICONS[s.key], s.key).toBeTruthy();
  });

  it('lists a character\'s statuses in the order they were first applied, with their totals', () => {
    const sheet = {
      statuses: { burning: 3, blinded: 1, prone: 1 },
      statusGroups: [
        { id: 'a', key: 'prone', stacks: 1, duration: 'long' },
        { id: 'b', key: 'burning', stacks: 2, duration: 'round' },
        { id: 'c', key: 'blinded', stacks: 1, duration: 'long' },
        { id: 'd', key: 'burning', stacks: 1, duration: 'long' },
      ],
    };
    expect(tokenStatuses(JSON.stringify(sheet))).toEqual([
      { key: 'prone', stacks: 1 },
      { key: 'burning', stacks: 3 },
      { key: 'blinded', stacks: 1 },
    ]);
    expect(tokenStatuses(null)).toEqual([]);
    expect(tokenStatuses('not json')).toEqual([]);
  });

  it('fits whole icons only, in columns', () => {
    expect(iconGrid(0.25)).toEqual({ rows: 4, max: 16 });
    expect(iconGrid(0.3)).toEqual({ rows: 3, max: 9 });
    expect(iconGrid(0.5)).toEqual({ rows: 2, max: 4 });
    expect(iconGrid(1.2)).toEqual({ rows: 0, max: 0 });
  });

  it('the size setting is a percentage from 10 to 50', () => {
    expect(cleanSetting('statusIconSize', 25)).toBe(25);
    expect(cleanSetting('statusIconSize', 5)).toBeNull();
    expect(cleanSetting('statusIconSize', 60)).toBeNull();
  });
});
