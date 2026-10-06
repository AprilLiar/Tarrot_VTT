import { STATUS_ICONS } from './statusIconData.js';
import { EFFECT_ICONS } from './effectIconData.js';
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

// One running Effect as a picture: the icon the Effect chose (a sparkle by default), black with a white outline.
export function EffectIcon({ effect, style }) {
  const body = EFFECT_ICONS[effect.icon] ?? EFFECT_ICONS.sparkles;
  return (
    <svg viewBox="0 0 512 512" style={style} data-testid="token-effect" data-effect={effect.name} role="img" aria-label={effect.name}>
      <title>{effect.name}</title>
      <g transform="translate(256 256) scale(.86) translate(-256 -256)">
        <g fill="#fff" stroke="#fff" strokeWidth="40" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: body }} />
        <g fill="#000" dangerouslySetInnerHTML={{ __html: body }} />
      </g>
    </svg>
  );
}

// The statuses and the Effects of one token, from the top-left going down, then the next column: the statuses first (in the order
// they were applied), then the Effects. `size` is the icon's side as a fraction of the token's side. Only as many as fit are shown.
export function TokenStatuses({ statuses = [], effects = [], size }) {
  const items = [...statuses.map((s) => ({ kind: 'status', key: s.key, s })), ...effects.map((e) => ({ kind: 'effect', key: e.id, e }))];
  if (!items.length) return null;
  const { rows, max } = iconGrid(size);
  if (rows < 1) return null;
  const pct = 100 * size;
  const at = (i) => ({ position: 'absolute', left: `${Math.floor(i / rows) * pct}%`, top: `${(i % rows) * pct}%`, width: `${pct}%`, height: `${pct}%` });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="token-statuses" data-shown={Math.min(max, items.length)}>
      {items.slice(0, max).map((x, i) =>
        x.kind === 'status' ? <StatusIcon key={`s${x.key}`} statusKey={x.s.key} stacks={x.s.stacks} style={at(i)} /> : <EffectIcon key={`e${x.key}`} effect={x.e} style={at(i)} />,
      )}
    </div>
  );
}
