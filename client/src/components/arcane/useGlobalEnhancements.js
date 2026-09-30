import { useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call } from '../../AppContext.jsx';

// The Enhancements the GM made for everyone; kept up to date while the GM edits them.
export function useGlobalEnhancements() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      call('arcane:enhancements').then((r) => {
        if (alive && r.ok) setList(r.enhancements);
      });
    const onList = (m) => setList(m.enhancements);
    load();
    socket.on('connect', load);
    socket.on('arcane:enhancements', onList);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('arcane:enhancements', onList);
    };
  }, []);
  return list;
}
