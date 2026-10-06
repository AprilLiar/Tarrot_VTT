import { useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call } from '../../AppContext.jsx';

// The Effects the GM made for everyone; kept up to date while the GM edits them.
export function useEffectLibrary() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      call('effect:library').then((r) => {
        if (alive && r.ok) setList(r.effects);
      });
    const onList = (m) => setList(m.effects);
    load();
    socket.on('connect', load);
    socket.on('effect:library', onList);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('effect:library', onList);
    };
  }, []);
  return list;
}

// Global and own Effects together, as a character sees them: [{ ...definition, origin: 'global' | 'character' }].
export const effectCatalog = (globals, sheet) => [...globals.map((e) => ({ ...e, origin: 'global' })), ...(sheet?.effectDefs ?? []).map((e) => ({ ...e, origin: 'character' }))];
