import { useCallback, useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call } from '../../AppContext.jsx';

// The Stances this viewer may see (the GM sees all), the GM's vibe texts, and a reload that follows every change.
export function useStances() {
  const [data, setData] = useState({ stances: [], vibes: {}, ready: false });
  const load = useCallback(
    () =>
      call('stance:list').then((r) => {
        if (r.ok) setData({ stances: r.stances, vibes: r.vibes, ready: true });
      }),
    [],
  );
  useEffect(() => {
    load();
    socket.on('connect', load);
    socket.on('stances:changed', load);
    return () => {
      socket.off('connect', load);
      socket.off('stances:changed', load);
    };
  }, [load]);
  return data;
}
