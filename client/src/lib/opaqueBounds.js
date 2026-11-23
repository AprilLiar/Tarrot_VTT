import { useEffect, useState } from 'react';

// The part of a picture that is not transparent, as { x0, y0, x1, y1 }: fractions of the picture's width and height. Character art is
// mostly a cut-out PNG, so this is where the character really is (the whole picture when it has no transparency or cannot be read).
// Worked out once per picture in the browser, on a small copy, and kept for the rest of the visit.

const WHOLE = { x0: 0, y0: 0, x1: 1, y1: 1 };
const SIDE = 256; // the copy that is scanned is at most this many pixels on its longer side
const SOLID = 16; // a pixel more opaque than this (of 255) is part of the character
const cache = new Map();

async function scan(url) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > SOLID) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return WHOLE;
    return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
  } catch {
    return WHOLE;
  }
}

export function opaqueBounds(url) {
  if (!cache.has(url)) cache.set(url, scan(url));
  return cache.get(url);
}

// The same as a hook: null until it is known.
export function useOpaqueBounds(url) {
  const [bounds, setBounds] = useState(null);
  useEffect(() => {
    let live = true;
    setBounds(null);
    if (url) opaqueBounds(url).then((b) => live && setBounds(b));
    return () => {
      live = false;
    };
  }, [url]);
  return bounds;
}
