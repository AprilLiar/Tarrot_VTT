import { useT } from '../../i18n.jsx';

// Action Points as cubes, filled from left to right: a filled cube is an AP the character has, an empty one is
// an AP it does not have (4 cubes, or 2 for a Minion). Small arrow buttons beside them change the amount.
// A cube is drawn wire-frame with all eight corners; a filled one is tinted with the UI colour.
const FRONT = [[3, 9], [19, 9], [19, 25], [3, 25]];
const BACK = [[10, 2], [26, 2], [26, 18], [10, 18]];
const line = ([x1, y1], [x2, y2]) => ({ x1, y1, x2, y2 });

function Cube({ filled }) {
  const edges = [
    ...FRONT.map((p, i) => line(p, FRONT[(i + 1) % 4])),
    ...BACK.map((p, i) => line(p, BACK[(i + 1) % 4])),
    ...FRONT.map((p, i) => line(p, BACK[i])),
  ];
  return (
    <svg width="30" height="30" viewBox="0 0 28 28" data-testid="ap-cube" data-filled={filled ? 'true' : 'false'} aria-hidden="true">
      {/* The outline of the whole cube carries the fill. */}
      <polygon points="3,25 3,9 10,2 26,2 26,18 19,25" fill={filled ? '#7c3aed' : 'none'} fillOpacity="0.85" />
      {edges.map((e, i) => (
        <line key={i} {...e} stroke={filled ? '#c4b5fd' : '#94a3b8'} strokeWidth="1.6" strokeLinecap="round" />
      ))}
      {[...FRONT, ...BACK].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill={filled ? '#ede9fe' : '#94a3b8'} />
      ))}
    </svg>
  );
}

// `onChange(n)` makes the arrows appear; without it the cubes are only shown.
export default function ApCubes({ current, max, onChange, testId = 'ap-cubes' }) {
  const t = useT();
  const arrow = (dir, disabled, id) => (
    <button
      type="button"
      data-testid={id}
      disabled={disabled}
      aria-label={dir < 0 ? t('Less AP') : t('More AP')}
      className="flex h-9 w-7 items-center justify-center rounded-md bg-white/10 active:bg-white/20 disabled:opacity-30"
      onClick={() => onChange(current + dir)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d={dir < 0 ? 'M8 1L3 6l5 5' : 'M4 1l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('AP: {current} of {max}', { current, max })} data-testid={testId} data-current={current} data-max={max}>
      {onChange && arrow(-1, current <= 0, 'ap-down')}
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) =>
          onChange ? (
            // Tapping a cube fills the AP up to it (including it); this never sets 0, the arrows do that.
            <button key={i} type="button" data-testid="ap-cube-set" aria-label={t('Set AP to {n}', { n: i + 1 })} className="rounded-md p-0.5 active:bg-white/15" onClick={() => onChange(i + 1)}>
              <Cube filled={i < current} />
            </button>
          ) : (
            <Cube key={i} filled={i < current} />
          ),
        )}
      </div>
      {onChange && arrow(1, current >= max, 'ap-up')}
    </div>
  );
}
