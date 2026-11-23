import { T } from '../../../shared/localization.js';

// What the picker says about the latest update (see the README, "Patch note"). EVERY push to main bumps `version` (the patch number; both
// package.json files and their lockfiles carry the same) and rewrites `note`: one sentence on what that push changed, with its Russian row
// in LOCALIZATION.md. server/test/patchNotes.test.js checks that the versions match.
export const PATCH = {
  version: '0.2.0',
  note: T('Scene notes and cutscene cards, GM Rewind, board animations, a crop editor, an accent colour, a Dice Tray and pictures in the chat, counters, an Events board, a Relationships board and Search.'),
};
