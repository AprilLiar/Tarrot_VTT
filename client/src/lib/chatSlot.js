import { useSyncExternalStore } from 'react';

// A place the chat button can sit instead of floating at the bottom right: the Arcane tab's footer row offers
// one so the button lines up with the other footer buttons.
let slot = null;
const listeners = new Set();

export function setChatSlot(el) {
  if (slot === el) return;
  slot = el;
  listeners.forEach((l) => l());
}

export const useChatSlot = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => slot,
  );
