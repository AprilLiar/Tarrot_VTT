import { T } from './localization.js';

// How a Scene picture or a Battle map is fitted to a screen whose shape differs from the picture's (see the README, "Fit").
//  fit     Best Fit: the whole picture is visible, black bars fill the rest (the default)
//  fill    the picture covers the whole screen; what sticks out is cut off
//  stretch the picture takes the screen's shape (Scenes only: it would make a Battle grid's squares into rectangles)
export const SCENE_FITS = ['fit', 'fill', 'stretch'];
export const BATTLE_FITS = ['fit', 'fill'];
export const DEFAULT_FIT = 'fit';
export const FIT_LABELS = { fit: T('Best Fit'), fill: T('Fill'), stretch: T('Stretch') };

export const cleanFit = (v, allowed) => (allowed.includes(v) ? v : DEFAULT_FIT);
