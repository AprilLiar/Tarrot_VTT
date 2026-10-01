// The settings of a device. Each lives in the browser's storage, and the GM can push his value of one to everybody
// (the server relays it, see `settings:force`). One list for the server (what it accepts) and the client (the defaults).
export const LANG_VALUES = ['en', 'ru'];

export const SETTINGS = {
  lang: { type: 'choice', values: LANG_VALUES },
  // Area tool: the Deadzone starts this many times the area's size away from where the drag began (1.1 to 3).
  deadzone: { type: 'number', min: 1.1, max: 3, step: 0.1, default: 1.5 },
};

// -> the value in its proper form, or null when it is not valid for that setting
export function cleanSetting(key, value) {
  const def = SETTINGS[key];
  if (!def) return null;
  if (def.type === 'choice') return def.values.includes(value) ? value : null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value * 10) / 10;
  return n >= def.min && n <= def.max ? n : null;
}
