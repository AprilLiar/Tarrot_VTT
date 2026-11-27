import { T } from '../../../shared/localization.js';

// What the picker says about the latest update (see the README, "Patch note"). EVERY push to main bumps `version` (the patch number; both
// package.json files and their lockfiles carry the same) and rewrites `note`: one sentence on what that push changed, with its Russian row
// in LOCALIZATION.md. server/test/patchNotes.test.js checks that the versions match.
export const PATCH = {
  version: '0.2.2',
  note: T('A combat card on a double-click of a token or a combat row, scene notes readable in a bubble on hover, spell items that show the spell and its tree of stones, and Body Movement moved between Stamina and Speed.'),
};
