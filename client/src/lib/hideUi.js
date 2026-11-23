import { useEffect, useSyncExternalStore } from 'react';

// Hide interface (see the README): on the Scene page anyone can hide the controls over the picture on their own screen (cinematic mode).
// Every control that hides carries the class `ui-chrome`; index.css hides them while <html data-hide-ui="true">, which is set only while
// the Scene page is open. Remembered on this device.
const KEY = 'tarrot.hideUi';
const listeners = new Set();
let hidden = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export function setUiHidden(value) {
  hidden = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {}
  listeners.forEach((f) => f());
}

export const useUiHidden = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => hidden,
  );

// The Scene page applies it while it is open.
export function useApplyHideUi() {
  const value = useUiHidden();
  useEffect(() => {
    document.documentElement.dataset.hideUi = value ? 'true' : 'false';
    return () => {
      delete document.documentElement.dataset.hideUi;
    };
  }, [value]);
  return value;
}
