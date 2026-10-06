import { createContext, useContext } from 'react';

// The character's own Effects (sheet.effectDefs) of the Arcane tab that is open, offered next to the global ones wherever Effects are picked.
export const OwnEffectsContext = createContext([]);
export const useOwnEffects = () => useContext(OwnEffectsContext);
