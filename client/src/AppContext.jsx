import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';

// Identity is remembered per device in localStorage; the server re-validates
// it on every (re)connect and is the only authority on what it may do.
const STORAGE_KEY = 'tarrot.identity';

function loadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v?.role === 'gm') return { role: 'gm' };
    if (v?.role === 'player' && Number.isInteger(v.characterId)) return v;
  } catch {}
  return null;
}

function persist(identity) {
  try {
    if (identity) localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Promise wrapper around a Socket.io emit-with-ack.
export function call(event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [identity, setIdentity] = useState(loadSaved);
  const identityRef = useRef(identity);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [pcs, setPcs] = useState([]);
  const [roster, setRoster] = useState(null);
  const [notice, setNotice] = useState(null);

  const updateIdentity = useCallback((next) => {
    identityRef.current = next;
    persist(next);
    setIdentity(next);
    if (next?.role !== 'gm') setRoster(null);
  }, []);

  const loadRoster = useCallback(async () => {
    const r = await call('roster:get');
    if (r.ok) setRoster(r.roster);
  }, []);

  const loadPcs = useCallback(async () => {
    try {
      const res = await fetch('/api/pcs');
      if (res.ok) setPcs(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    // Runs on every (re)connect: the server forgets identities when a socket dies.
    async function claim() {
      setConnected(true);
      loadPcs();
      const saved = identityRef.current;
      if (saved) {
        const r = await call('identity:set', saved);
        if (!r.ok && r.code === 'gone') {
          updateIdentity(null);
          setNotice('Your character is no longer available. Please choose again.');
        } else if (r.ok && saved.role === 'gm') {
          await loadRoster();
        }
      }
      setReady(true);
    }
    const onDisconnect = () => setConnected(false);
    const onPcs = (list) => setPcs(list);
    const onRoster = (r) => setRoster(r);
    const onRevoked = ({ name }) => {
      updateIdentity(null);
      setNotice(`${name} was deleted by the GM. Please choose again.`);
    };

    socket.on('connect', claim);
    socket.on('disconnect', onDisconnect);
    socket.on('pcs:updated', onPcs);
    socket.on('roster:updated', onRoster);
    socket.on('identity:revoked', onRevoked);
    if (socket.connected) claim();
    return () => {
      socket.off('connect', claim);
      socket.off('disconnect', onDisconnect);
      socket.off('pcs:updated', onPcs);
      socket.off('roster:updated', onRoster);
      socket.off('identity:revoked', onRevoked);
    };
  }, [loadPcs, loadRoster, updateIdentity]);

  const choose = useCallback(
    async (next) => {
      const r = await call('identity:set', next);
      if (r.ok) {
        setNotice(null);
        updateIdentity(next);
        if (next.role === 'gm') await loadRoster();
      } else {
        setNotice('That character is not available any more.');
      }
      return r;
    },
    [loadRoster, updateIdentity],
  );

  const switchIdentity = useCallback(async () => {
    await call('identity:clear');
    updateIdentity(null);
  }, [updateIdentity]);

  const value = {
    identity,
    ready,
    connected,
    pcs,
    roster,
    notice,
    dismissNotice: () => setNotice(null),
    choose,
    switchIdentity,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
