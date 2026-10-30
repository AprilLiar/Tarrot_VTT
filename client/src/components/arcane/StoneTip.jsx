import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KIND_COLORS, KIND_LABELS, stoneInfo } from '../../../../shared/spells.js';
import { useT } from '../../i18n.jsx';

const WIDTH = 256; // pixels (16rem)

// The description of a Spell Stone, shown beside the mouse pointer. Only a mouse hovers: a touch screen shows nothing.
function StoneTip({ sign, x, y }) {
  const t = useT();
  const info = stoneInfo(sign);
  const below = y < window.innerHeight - 140;
  return createPortal(
    <div
      role="tooltip"
      data-testid="stone-tip"
      data-sign={sign}
      className="pointer-events-none fixed z-[100] rounded-lg border border-white/20 bg-[#1e1b2e] px-3 py-2 text-sm text-white shadow-lg"
      style={{ width: WIDTH, left: Math.max(4, Math.min(x + 14, window.innerWidth - WIDTH - 4)), top: below ? y + 18 : y - 14, transform: below ? undefined : 'translateY(-100%)' }}
    >
      <div className="flex items-center gap-2 font-semibold">
        <span className="text-xl leading-none" style={{ color: KIND_COLORS[info.kind] }} aria-hidden="true">
          {info.glyph}
        </span>
        <span>{t(info.name)}</span>
        <span className="ml-auto text-xs font-normal opacity-60">
          {t(KIND_LABELS[info.kind])}
        </span>
      </div>
      <div className="mt-1 text-xs leading-snug opacity-90">{t(info.text)}</div>
    </div>,
    document.body,
  );
}

// `[tip, over]`: render `tip` once somewhere, and spread `over(sign)` on every element that stands for that stone.
export function useStoneTip() {
  const [at, setAt] = useState(null); // { sign, x, y }
  const show = (sign) => (e) => {
    if (e.pointerType === 'mouse') setAt({ sign, x: e.clientX, y: e.clientY });
  };
  const over = (sign) => ({ onPointerEnter: show(sign), onPointerMove: show(sign), onPointerDown: () => setAt(null), onPointerLeave: () => setAt(null) });
  return [at && <StoneTip {...at} />, over];
}
