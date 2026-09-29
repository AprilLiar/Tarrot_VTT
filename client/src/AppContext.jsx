import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';

// Identity is remembered per device in localStorage; the server re-validates
// it on every (re)connect and is the only authority on what it may do.
const STORAGE_KEY = 'tarrot.identity';

function loadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v?.role === 'gm') return { role: 'gm' };
    if (v?.role === 'display') return { role: 'display' };
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

let toastSeq = 0;

export function AppProvider({ children }) {
  const [identity, setIdentity] = useState(loadSaved);
  const identityRef = useRef(identity);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [pcs, setPcs] = useState([]);
  const [roster, setRoster] = useState(null);
  const [stage, setStage] = useState({ scene: null, summons: [] });
  const [library, setLibrary] = useState(null);
  const [notice, setNotice] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [unread, setUnread] = useState(0);
  const [offers, setOffers] = useState([]);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((text) => {
    const id = ++toastSeq;
    setToasts((list) => [...list, { id, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);

  const setChatOpenBoth = useCallback((open) => {
    chatOpenRef.current = open;
    setChatOpen(open);
    if (open) setUnread(0);
  }, []);

  const updateIdentity = useCallback((next) => {
    identityRef.current = next;
    persist(next);
    setIdentity(next);
    if (next?.role !== 'gm') {
      setRoster(null);
      setLibrary(null);
    }
    if (!next) {
      setMessages([]);
      setOffers([]);
      chatOpenRef.current = false;
      setChatOpen(false);
      setUnread(0);
    }
  }, []);

  const loadRoster = useCallback(async () => {
    const r = await call('roster:get');
    if (r.ok) setRoster(r.roster);
  }, []);

  const loadLibrary = useCallback(async () => {
    const r = await call('library:get');
    if (r.ok) setLibrary(r.library);
  }, []);

  const loadStage = useCallback(async () => {
    const r = await call('stage:get');
    if (r.ok) setStage(r.stage);
  }, []);

  const loadPcs = useCallback(async () => {
    try {
      const res = await fetch('/api/pcs');
      if (res.ok) setPcs(await res.json());
    } catch {}
  }, []);

  const loadChat = useCallback(async () => {
    const r = await call('chat:get');
    if (r.ok) setMessages(r.messages);
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
        } else if (r.ok) {
          if (saved.role === 'gm') {
            await Promise.all([loadRoster(), loadLibrary()]);
          }
          if (saved.role !== 'display') await loadChat();
          await loadStage();
        }
      }
      setReady(true);
    }
    const onDisconnect = () => setConnected(false);
    const onPcs = (list) => setPcs(list);
    const onRoster = (r) => setRoster(r);
    const onStage = (st) => setStage(st);
    const onLibrary = (lib) => setLibrary(lib);
    const onRevoked = ({ name }) => {
      updateIdentity(null);
      setNotice(`${name} was deleted by the GM. Please choose again.`);
    };
    const onMessage = (m) => {
      setMessages((list) => [...list, m]);
      if (!chatOpenRef.current) setUnread((n) => n + 1);
    };
    const onCleared = () => {
      setMessages([]);
      setUnread(0);
    };
    const onOffered = (o) => setOffers((list) => [...list, o]);
    const onResolved = (o) => {
      setOffers((list) => list.filter((x) => x.offerId !== o.offerId));
      const me = identityRef.current;
      if (me?.role !== 'player') return;
      toast(
        o.accepted
          ? `${o.toName} accepted ${o.itemName} from ${o.fromName}.`
          : `${o.toName} declined ${o.itemName} from ${o.fromName}.`,
      );
    };

    socket.on('connect', claim);
    socket.on('disconnect', onDisconnect);
    socket.on('pcs:updated', onPcs);
    socket.on('roster:updated', onRoster);
    socket.on('stage:updated', onStage);
    socket.on('library:updated', onLibrary);
    socket.on('identity:revoked', onRevoked);
    socket.on('chat:message', onMessage);
    socket.on('chat:cleared', onCleared);
    socket.on('trade:offered', onOffered);
    socket.on('trade:resolved', onResolved);
    if (socket.connected) claim();
    return () => {
      socket.off('connect', claim);
      socket.off('disconnect', onDisconnect);
      socket.off('pcs:updated', onPcs);
      socket.off('roster:updated', onRoster);
      socket.off('stage:updated', onStage);
      socket.off('library:updated', onLibrary);
      socket.off('identity:revoked', onRevoked);
      socket.off('chat:message', onMessage);
      socket.off('chat:cleared', onCleared);
      socket.off('trade:offered', onOffered);
      socket.off('trade:resolved', onResolved);
    };
  }, [loadPcs, loadRoster, loadLibrary, loadStage, loadChat, updateIdentity, toast]);

  const choose = useCallback(
    async (next) => {
      const r = await call('identity:set', next);
      if (r.ok) {
        setNotice(null);
        updateIdentity(next);
        if (next.role === 'gm') await Promise.all([loadRoster(), loadLibrary()]);
        if (next.role !== 'display') await loadChat();
        await loadStage();
      } else {
        setNotice('That character is not available any more.');
      }
      return r;
    },
    [loadRoster, loadLibrary, loadStage, loadChat, updateIdentity],
  );

  const switchIdentity = useCallback(async () => {
    await call('identity:clear');
    updateIdentity(null);
  }, [updateIdentity]);

  const respondTrade = useCallback(async (offerId, accept) => {
    setOffers((list) => list.filter((o) => o.offerId !== offerId));
    const r = await call('trade:respond', { offerId, accept });
    if (!r.ok) toast(r.error ?? 'That offer is no longer available.');
  }, [toast]);

  const value = {
    identity,
    ready,
    connected,
    pcs,
    roster,
    stage,
    library,
    notice,
    dismissNotice: () => setNotice(null),
    choose,
    switchIdentity,
    messages,
    chatOpen,
    setChatOpen: setChatOpenBoth,
    unread,
    offers,
    respondTrade,
    toasts,
    toast,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
