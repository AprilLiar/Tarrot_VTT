import { T } from '../../../shared/localization.js';

// What the picker says about the latest update (see the README, "Patch note"). EVERY push to main bumps `version` (the patch number; both
// package.json files and their lockfiles carry the same) and rewrites `note`: one sentence on what that push changed, with its Russian row
// in LOCALIZATION.md. server/test/patchNotes.test.js checks that the versions match.
export const PATCH = {
  version: '0.2.1',
  note: T('Blood Oxidization as a meter with its penalties and Let blood, Rest Points with Short and Long Rests, spells as Inventory items with signatures, Learned Spells with tattoo Coverage, a pop-out sheet and map tools for players, and the skills reordered without Mental Resolve.'),
};
