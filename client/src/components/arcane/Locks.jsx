import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';

// Locks (see the README): the GM locks tabs and parts of the Arcane tab for everyone. A player sees a heavily
// blurred picture with "You have not learned what this means for now" in place of what is locked; the GM (and
// an NPC's sheet, which is the GM's) sees everything, with a small lock on what is locked.

const LockContext = createContext({ locks: [], gm: false, locking: false, has: () => false, toggle: () => {} });
export const useLocks = () => useContext(LockContext);

export function LockProvider({ locking = false, children }) {
  const { identity, toast } = useApp();
  const [locks, setLocks] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      call('lock:list').then((r) => {
        if (alive && r.ok) setLocks(r.locks);
      });
    const onChanged = (m) => setLocks(m.locks);
    load();
    socket.on('connect', load);
    socket.on('locks:changed', onChanged);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('locks:changed', onChanged);
    };
  }, []);
  const toggle = useCallback(
    async (key) => {
      const r = await call('lock:toggle', { key });
      if (!r.ok) toast(r.error);
    },
    [toast],
  );
  const value = useMemo(() => ({ locks, gm: identity?.role === 'gm', locking, has: (k) => locks.includes(k), toggle }), [locks, identity, locking, toggle]);
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function LockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" data-testid="lock-icon" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// What a player sees instead of a locked part: nothing real, just a blur.
export function Blurred() {
  const t = useT();
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10" data-testid="locked" role="note">
      <div className="h-40 w-full blur-xl" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #0ea5e9 35%, #f59e0b 65%, #ec4899 100%)', opacity: 0.55 }} aria-hidden="true" />
      <p className="absolute inset-0 flex items-center justify-center bg-black/40 px-4 text-center text-sm font-medium">{t('You have not learned what this means for now')}</p>
    </div>
  );
}

// Wraps a part that can be locked: a player gets the blur, the GM the part with a small lock on it.
export function Lockable({ id, children }) {
  const { has, gm } = useLocks();
  if (!has(id)) return children;
  if (!gm) return <Blurred />;
  return (
    <div className="relative" data-testid="lock-marked" data-lock={id}>
      <span className="absolute right-1 top-1 z-10 rounded bg-black/60 p-1 text-amber-300">
        <LockIcon />
      </span>
      {children}
    </div>
  );
}

// A part of a tab that has nothing to show without a character, as a tile the GM can lock in locking mode.
export function LockTile({ id, label }) {
  const t = useT();
  const { has, locking, toggle } = useLocks();
  const on = has(id);
  return (
    <button
      type="button"
      data-testid={`lock-tile-${id}`}
      data-locked={on ? 'true' : 'false'}
      aria-pressed={on}
      disabled={!locking}
      className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-amber-400/60 bg-amber-500/15' : 'border-white/10 bg-white/5'} disabled:opacity-100`}
      onClick={() => toggle(id)}
    >
      <span className={on ? 'text-amber-300' : 'opacity-40'}>
        <LockIcon size={18} />
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-xs opacity-60">{on ? t('Locked') : t('Open')}</span>
    </button>
  );
}
