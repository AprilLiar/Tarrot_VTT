import { useLayoutEffect, useState } from 'react';

// The half-transparent circles next to a character (Foundry style).
export function TokenMenu({ s, anchor, containerRef, onSettings, onToggleHidden, onClose }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const onLeft = r.left + r.width / 2 < box.left + box.width / 2;
    setPos({
      top: Math.min(Math.max(r.top - box.top + r.height / 2 - 60, 8), box.height - 130),
      left: onLeft ? Math.min(r.right - box.left + 8, box.width - 80) : Math.max(r.left - box.left - 72, 8),
    });
  }, [anchor, containerRef, s.id]);
  if (!pos) return null;
  const circle =
    'flex h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-black/45 text-center text-xs font-medium leading-tight text-white backdrop-blur active:bg-black/70';
  return (
    <>
      <div className="absolute inset-0 z-30" data-testid="token-menu-backdrop" onPointerDown={onClose} />
      <div className="absolute z-40 flex flex-col gap-2" style={pos} data-testid="token-menu">
        <button className={circle} data-testid="menu-settings" onClick={onSettings}>
          Token Settings
        </button>
        <button className={circle} data-testid="menu-hide" onClick={onToggleHidden}>
          {s.hidden ? 'Reveal' : 'Hide'}
        </button>
      </div>
    </>
  );
}

