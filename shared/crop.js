// Crops for round pictures (see the README, Crop editor): a Portrait's round thumbnail and a default Battle token.
// A crop is { x, y, zoom } relative to a base square (the automatic cut): the square is the base side / zoom, and its centre is moved by
// x and y base sides. null is the automatic cut itself.
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
export const SHIFT_MAX = 3;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A crop as sent by a client, checked: null (automatic) or numbers inside their ranges. Anything else is null.
export function cleanCrop(c) {
  if (c == null || typeof c !== 'object') return null;
  const x = Number(c.x);
  const y = Number(c.y);
  const zoom = Number(c.zoom);
  if (![x, y, zoom].every(Number.isFinite)) return null;
  const out = { x: clamp(x, -SHIFT_MAX, SHIFT_MAX), y: clamp(y, -SHIFT_MAX, SHIFT_MAX), zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) };
  return out.x === 0 && out.y === 0 && out.zoom === 1 ? null : out;
}

export function parseCrop(text) {
  if (!text) return null;
  try {
    return cleanCrop(JSON.parse(text));
  } catch {
    return null;
  }
}

// The square that is shown, in the picture's pixels: { cx, cy, side }.
export function cropSquare(base, crop) {
  if (!crop) return base;
  return { cx: base.cx + crop.x * base.side, cy: base.cy + crop.y * base.side, side: base.side / crop.zoom };
}

// A Portrait's base: as wide as the picture's shorter side, centred, from the top (where a face is).
export function portraitBase(w, h) {
  const side = Math.min(w, h);
  return { cx: w / 2, cy: side / 2, side };
}

// The style of an <img> (natural size w x h) inside a square frame, showing `square`: sizes in % of the frame.
export function squareStyle(w, square) {
  return {
    position: 'absolute',
    maxWidth: 'none',
    width: `${(w / square.side) * 100}%`,
    left: `${(-(square.cx - square.side / 2) / square.side) * 100}%`,
    top: `${(-(square.cy - square.side / 2) / square.side) * 100}%`,
  };
}
