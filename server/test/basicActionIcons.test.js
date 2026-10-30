import { describe, it, expect } from 'vitest';
import { ACTION_ICON_KEYS, DEFAULT_ACTIONS, DEFAULT_ACTION_ICONS, normalizeAction } from '../../shared/basicActions.js';
import { ACTION_ICONS } from '../../client/src/components/effects/basicActionIconData.js';

describe('the icons of the Basic Actions', () => {
  it('every icon key has a drawing and every drawing has a key', () => {
    expect(Object.keys(ACTION_ICONS).sort()).toEqual([...ACTION_ICON_KEYS].sort());
    for (const [key, body] of Object.entries(ACTION_ICONS)) {
      expect(body, key).toMatch(/^(<path d="[^"]+"\/>)+$/);
      expect(body, key).not.toContain('M0 0h512v512H0z'); // no background square
    }
  });

  it('every shipped Basic Action has the icon the Foundry DC20 system gives it', () => {
    for (const a of DEFAULT_ACTIONS) expect(ACTION_ICON_KEYS, a.name).toContain(a.icon);
    const byName = Object.fromEntries(DEFAULT_ACTIONS.map((a) => [a.name, a.icon]));
    expect(byName).toMatchObject({
      Attack: 'sword',
      Move: 'wingfoot',
      Spell: 'explosion',
      Dodge: 'paralysis',
      'Full Dodge': 'paralysis',
      Disengage: 'combat',
      'Full Disengage': 'combat',
      Hide: 'cowled',
      Help: 'dice-target',
      Object: 'chest',
      Feint: 'ice-aura',
      Taunt: 'eye',
      Intimidate: 'terror',
      Grapple: 'grappled',
      Shove: 'thrust',
      Tackle: 'falling',
      Throw: 'acid',
      Disarm: 'lever',
      'Analyze Creature': 'book',
      'Calm Animal': 'pawprint',
      'Combat Insight': 'light',
      Conceal: 'item-bag',
      Investigate: 'village',
      Search: 'cave',
      Medicine: 'regen',
      'Pass Through': 'door-exit',
      'Extend Jump': 'upgrade',
    });
    expect(Object.keys(DEFAULT_ACTION_ICONS)).toHaveLength(DEFAULT_ACTIONS.length);
  });

  it('an action keeps a known icon, and an unknown one is dropped', () => {
    expect(normalizeAction({ name: 'A', icon: 'sword' }, 'x').icon).toBe('sword');
    expect(normalizeAction({ name: 'A', icon: 'no-such-icon' }, 'x').icon).toBe('');
    expect(normalizeAction({ name: 'A' }, 'x').icon).toBe('');
  });
});
