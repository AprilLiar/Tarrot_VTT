import { useEffect, useState } from 'react';

function useQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e) => setMatches(e.matches);
    mq.addEventListener('change', on);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// Desktop-sized screens: players get the Scene here; phones get only the controls.
export const useIsDesktop = () => useQuery('(min-width: 1024px)');
export const useIsTouch = () => useQuery('(pointer: coarse)');
