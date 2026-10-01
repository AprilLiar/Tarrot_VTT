// Help Dice: a general mechanic. A character holds up to 5 of them (d4 to d12); before a roll the player may spend
// any of them, and each spent die is rolled with the d20 and added like a Dice Roll Bonus. A die is used once.
export const HELP_SIDES = [4, 6, 8, 10, 12];
export const MAX_HELP = 5;
export const HELP_SOURCE = 'Help Die';

export const normalizeHelp = (raw) => (Array.isArray(raw) ? raw : []).filter((n) => HELP_SIDES.includes(n)).slice(0, MAX_HELP);

// A character gains a die. With room it is added; when the track is full a die that is larger than the smallest one
// held takes its place (the smallest goes), otherwise the new die is lost.
// -> { dice, outcome: 'added' | 'replaced' | 'lost', replaced?: sides }
export function addHelpDie(dice, sides) {
  const have = normalizeHelp(dice);
  if (have.length < MAX_HELP) return { dice: [...have, sides], outcome: 'added' };
  const smallest = Math.min(...have);
  if (sides <= smallest) return { dice: have, outcome: 'lost' };
  const i = have.indexOf(smallest);
  return { dice: [...have.slice(0, i), ...have.slice(i + 1), sides], outcome: 'replaced', replaced: smallest };
}
