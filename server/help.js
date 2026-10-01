import * as sheets from './sheet.js';
import { AppError } from './errors.js';
import { HELP_SOURCE } from '../shared/help.js';

// Spending Help Dice (see shared/help.js). The player picks dice by their place in the track; the chosen dice become
// Dice Roll Bonuses of the roll (the same mechanism as a weapon's bonus die) and are used up once the roll is made.

const cleanIndices = (indices, sheet) => {
  if (indices == null) return [];
  if (!Array.isArray(indices) || indices.length > sheet.helpDice.length) throw new AppError('bad_value', 'Those Help Dice are not available.');
  const unique = [...new Set(indices)];
  if (unique.length !== indices.length || unique.some((i) => !Number.isInteger(i) || i < 0 || i >= sheet.helpDice.length)) {
    throw new AppError('bad_value', 'Those Help Dice are not available.');
  }
  return unique;
};

// The Dice Roll Bonuses the chosen dice make: [{ sides, sign, source }] (nothing is used up yet).
export function helpDiceFor(sheet, indices) {
  return cleanIndices(indices, sheet).map((i) => ({ sides: sheet.helpDice[i], sign: 1, source: HELP_SOURCE }));
}

// Uses the chosen dice up. `emitSheet(characterId, sheet)` tells the sheet's viewers.
export async function spendHelp(db, characterId, indices, emitSheet) {
  if (indices == null || (Array.isArray(indices) && !indices.length)) return;
  const sheet = await sheets.updateSheet(db, characterId, (s) => {
    const chosen = new Set(cleanIndices(indices, s));
    const next = structuredClone(s);
    next.helpDice = next.helpDice.filter((_, i) => !chosen.has(i));
    return sheets.normalizeSheet(next);
  });
  emitSheet(characterId, sheet);
}
