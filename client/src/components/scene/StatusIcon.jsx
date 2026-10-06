import { STATUS_ICONS } from './statusIconData.js';
import { statusInfo } from '../../../../shared/statuses.js';
import { iconGrid } from '../../lib/statusIconGrid.js';
import { useT } from '../../i18n.jsx';

// One status as a picture: a black glyph with a white outline and, for a status that stacks, the stacks as a small red
// number with a black outline in the bottom-right quarter.
export function StatusIcon({ statusKey, stacks, style }) {
  const t = useT();
  const icon = STATUS_ICONS[statusKey];
  const info = statusInfo(statusKey);
  if (!icon) return null;
  const name = t(info?.name ?? statusKey);
  return (
    <svg viewBox="0 0 512 512" style={style} data-testid="token-status" data-status={statusKey} data-stacks={stacks} role="img" aria-label={info?.stackable ? `${name} ${stacks}` : name}>
      <title>{info?.stackable ? `${name} ${stacks}` : name}</title>
      <g transform="translate(256 256) scale(.86) translate(-256 -256)">
        <g fill="#fff" stroke="#fff" strokeWidth="40" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icon[1] }} />
        <g fill="#000" dangerouslySetInnerHTML={{ __html: icon[1] }} />
      </g>
      {info?.stackable && (
        <text x="506" y="500" textAnchor="end" fontSize="250" fontWeight="800" fontFamily="sans-serif" fill="#ef1c1c" stroke="#000" strokeWidth="46" strokeLinejoin="round" paintOrder="stroke" data-testid="token-status-stacks">
          {stacks}
        </text>
      )}
    </svg>
  );
}

// The statuses of one token, from the top-left going down, then the next column. `size` is the icon's side as a fraction of
// the token's side. Only as many as fit are shown (the first applied).
export function TokenStatuses({ statuses, size }) {
  if (!statuses?.length) return null;
  const { rows, max } = iconGrid(size);
  if (rows < 1) return null;
  const pct = 100 * size;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="token-statuses" data-shown={Math.min(max, statuses.length)}>
      {statuses.slice(0, max).map((s, i) => (
        <StatusIcon key={s.key} statusKey={s.key} stacks={s.stacks} style={{ position: 'absolute', left: `${Math.floor(i / rows) * pct}%`, top: `${(i % rows) * pct}%`, width: `${pct}%`, height: `${pct}%` }} />
      ))}
    </div>
  );
}
