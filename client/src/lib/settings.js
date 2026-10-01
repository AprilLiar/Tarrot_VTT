import { useSyncExternalStore } from 'react';
import { socket } from '../socket.js';
import { SETTINGS, cleanSetting } from '../../../shared/settings.js';

// Device settings other than the language (which lives in i18n.jsx): kept in the browser's storage as `tarrot.<key>`,
// read anywhere with useSetting(key). The GM can push his value to every device (`setting:forced`).
const listeners = new Set();
const cache = new Map();

function read(key) {
  if (cache.has(key)) return cache.get(key);
  let value = SETTINGS[key].default;
  try {
    const saved = JSON.parse(localStorage.getItem(`tarrot.${key}`));
    const ok = cleanSetting(key, saved);
    if (ok != null) value = ok;
  } catch {}
  cache.set(key, value);
  return value;
}

export function setSetting(key, value) {
  const ok = cleanSetting(key, value);
  if (ok == null) return;
  cache.set(key, ok);
  try {
    localStorage.setItem(`tarrot.${key}`, JSON.stringify(ok));
  } catch {}
  listeners.forEach((fn) => fn());
}

export function useSetting(key) {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => read(key),
  );
  return [value, (v) => setSetting(key, v)];
}

// The GM pushed a value: take it (the language is handled in i18n.jsx).
socket.on('setting:forced', ({ key, value }) => {
  if (key !== 'lang') setSetting(key, value);
});
