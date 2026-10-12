// The gold star beside a character's name on the maps opens the info of its selected Tarot Card. The dialog itself lives in Shell
// (outside the zoomed map); the star only asks for it with openTarot(characterId).
const listeners = new Set();
export const openTarot = (characterId) => listeners.forEach((fn) => fn(characterId));
export const onOpenTarot = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
