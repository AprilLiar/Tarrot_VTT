import { createContext, useContext } from 'react';
import { useApp } from '../AppContext.jsx';
import { useIsDesktop } from '../lib/useMedia.js';
import { useMusic } from './useMusic.js';

// Music is only for the GM on a desktop screen and for the Display Screen.
// Phones and players get no player, no sound and no controls at all.
const MusicContext = createContext({ enabled: false });
export const useMusicContext = () => useContext(MusicContext);

export function MusicProvider({ children }) {
  const { identity, ready } = useApp();
  const desktop = useIsDesktop();
  const enabled = ready && ((identity?.role === 'gm' && desktop) || identity?.role === 'display');
  const music = useMusic({ enabled });
  return <MusicContext.Provider value={music}>{children}</MusicContext.Provider>;
}
