// The attack being drafted in the Arcane footer is { weapon, counts, stance, advantage, modifier } (see ArcanePage); these turn it
// into what the server asks for.

// What the draft's weapon points at, in the shape the server understands.
export function weaponChoice(draft) {
  if (draft.weapon === 'unarmed') return { kind: 'unarmed' };
  if (draft.weapon.startsWith('spell:')) return { kind: 'spell', spellId: draft.weapon.slice('spell:'.length) };
  if (draft.weapon.startsWith('manifest:')) return { kind: 'manifestation', manifestationId: draft.weapon.slice('manifest:'.length) };
  return { kind: 'item', itemId: draft.weapon };
}

// The body of `attack:roll` for a draft (without the character and the Help Dice).
export function attackRequest(draft) {
  return {
    weapon: weaponChoice(draft),
    enhancements: Object.entries(draft.counts)
      .filter(([, n]) => n > 0)
      .map(([id, count]) => ({ id, count })),
    stance: draft.stance,
    advantage: draft.advantage,
    modifier: Number(draft.modifier),
  };
}
