import { T } from '../../../shared/localization.js';

// The name of an area on the map: its shape and its number, "Arc (3)". The number is given by the server when the area is
// created and never changes (see battle.js).
export const AREA_SHAPES = { circle: T('Circle'), cone: T('Cone'), arc: T('Arc'), line: T('Line'), square: T('Square') };
export const areaName = (mark, t) => `${t(AREA_SHAPES[mark.shape])} (${mark.n})`;
