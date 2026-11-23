import { useSyncExternalStore } from 'react';

// The token waiting to be placed in Battle mode: a tap on a row in the Cast list sets it ({ key: { characterId } | { tempNpcId }, name }),
// and the next tap on the map places it there (BattleView). Kept outside React's tree because the Cast list and the map are far apart.
let current = null;
const listeners = new Set();

export function setPlacing(value) {
  current = value;
  listeners.forEach((f) => f());
}

export const usePlacing = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
  );
