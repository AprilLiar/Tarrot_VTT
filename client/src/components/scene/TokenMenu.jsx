import { useLayoutEffect, useState } from 'react';

const CIRCLE = 64; // px (h-16 w-16)
const GAP = 8;
const circle =
  'flex h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-black/45 text-center text-xs font-medium leading-tight text-white backdrop-blur active:bg-black/70';

// The half-transparent circles beside a character (Foundry style). They stand on the two sides of the
// token, up to two per side, each column centred on the middle of the token, so nothing hangs below it.
// `options`: [{ key, label, testId, onClick }]. With an odd number the extra one goes on the right.
export function TokenMenu({ anchor, containerRef, options, onClose }) {
  const [pos, setPos] = useState(null);
  const left = options.slice(0, Math.floor(options.length / 2));
  const right = options.slice(left.length);

  useLayoutEffect(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const colHeight = (n) => n * CIRCLE + Math.max(0, n - 1) * GAP;
    const centreY = r.top - box.top + r.height / 2;
    const clampTop = (n) => Math.min(Math.max(centreY - colHeight(n) / 2, 8), Math.max(8, box.height - colHeight(n) - 8));
    let leftX = r.left - box.left - GAP - CIRCLE;
    let rightX = r.right - box.left + GAP;
    // Next to a screen edge there is no room on that side: its column goes beside the other one.
    if (leftX < 8) leftX = rightX + CIRCLE + GAP;
    else if (rightX > box.width - CIRCLE - 8) rightX = leftX - CIRCLE - GAP;
    setPos({
      leftX: Math.min(Math.max(leftX, 8), box.width - CIRCLE - 8),
      rightX: Math.min(Math.max(rightX, 8), box.width - CIRCLE - 8),
      leftTop: clampTop(left.length),
      rightTop: clampTop(right.length),
    });
  }, [anchor, containerRef, left.length, right.length]);
  if (!pos) return null;

  const column = (items, x, top, testId) =>
    items.length > 0 && (
      <div className="absolute z-40 flex flex-col" style={{ left: x, top, gap: GAP }} data-testid={testId}>
        {items.map((o) => (
          <button key={o.key} className={circle} data-testid={o.testId} onClick={o.onClick}>
            {o.label}
          </button>
        ))}
      </div>
    );

  return (
    <>
      <div className="absolute inset-0 z-30" data-testid="token-menu-backdrop" onPointerDown={onClose} />
      <div data-testid="token-menu">
        {column(left, pos.leftX, pos.leftTop, 'token-menu-left')}
        {column(right, pos.rightX, pos.rightTop, 'token-menu-right')}
      </div>
    </>
  );
}
