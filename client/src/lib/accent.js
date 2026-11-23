import { useEffect } from 'react';
import { useSetting } from './settings.js';
import { SETTINGS } from '../../../shared/settings.js';

// The accent colour (Settings, per device). The interface is drawn with Tailwind's violet shades; they are CSS variables
// (--color-violet-50 ... -950), so a chosen colour replaces them all: each shade keeps violet's lightness, takes the chosen colour's hue,
// and its strength in proportion (a greyish colour gives greyish shades).
const LADDER = {
  50: [0.969, 0.016],
  100: [0.943, 0.029],
  200: [0.894, 0.057],
  300: [0.811, 0.111],
  400: [0.702, 0.183],
  500: [0.606, 0.25],
  600: [0.541, 0.281],
  700: [0.491, 0.27],
  800: [0.432, 0.232],
  900: [0.38, 0.189],
  950: [0.283, 0.141],
};
const VIOLET_CHROMA = 0.25; // violet-500's strength: a colour as strong as this keeps the ladder's strengths

// #rrggbb -> [chroma, hue in degrees] in OKLCH.
export function hexToLch(hex) {
  const lin = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

export function accentShades(hex) {
  const [c, h] = hexToLch(hex);
  const k = Math.min(1.1, c / VIOLET_CHROMA);
  return Object.fromEntries(Object.entries(LADDER).map(([n, [L, C]]) => [n, `oklch(${(L * 100).toFixed(1)}% ${(C * k).toFixed(3)} ${h.toFixed(1)})`]));
}

export function useApplyAccent() {
  const [accent] = useSetting('accent');
  useEffect(() => {
    const root = document.documentElement;
    const isDefault = accent === SETTINGS.accent.default;
    for (const [n, value] of Object.entries(accentShades(accent))) {
      if (isDefault) root.style.removeProperty(`--color-violet-${n}`);
      else root.style.setProperty(`--color-violet-${n}`, value);
    }
    root.dataset.accent = accent;
  }, [accent]);
}
