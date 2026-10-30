import { useId, useRef } from 'react';
import { KIND_COLORS, KIND_LABELS, circleOf, layoutScheme, stoneInfo } from '../../../../shared/spells.js';
import { useT } from '../../i18n.jsx';

const C = 72; // pixels of one cell in the drawing
const R = 27; // radius of a stone

// A spell scheme drawn as a table: Bases on top, Modifiers and Links below, the Release at the bottom, with
// arrows between the stones. It is only a drawing: the parent decides what a tap means.
//   selected / source: highlighted stones; noteOpen: the stone whose note is shown
//   onStone(id), onStoneTwice(id): a tap and a quick second tap on a stone
//   mini: the small snapshot shown in the compendium (no labels); only the stones with a note can be tapped, to show it
//   big: no height limit (the spell shown large)     activeCircle: the Circle being worked on gets a dashed outline
// With several Circles they are drawn one under the other, and the Release of every Circle but the last has a faded glow in the colour of
// the Bases: it is the special Base of the Circle below it.
export function SchemeView({ scheme, selected = null, source = null, noteOpen = null, onStone, onStoneTwice, mini = false, big = false, activeCircle = null }) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const last = useRef({ id: null, at: 0 });
  const { pos, width, height, lanes, parts, circles } = layoutScheme(scheme);
  const many = circles > 1;
  const tints = { base: KIND_COLORS.base, mid: '#3b82f6', release: KIND_COLORS.release };
  const laneLabel = { base: t('Bases'), mid: t('Modifiers and Links'), release: t('Release') };
  const byId = new Map(scheme.stones.map((s) => [s.id, s]));
  const special = new Set(scheme.stones.filter((s) => stoneInfo(s.sign).kind === 'release' && circleOf(s) < circles).map((s) => s.id));

  function tap(id) {
    const now = Date.now();
    if (last.current.id === id && now - last.current.at < 400) {
      last.current = { id: null, at: 0 };
      onStoneTwice?.(id);
    } else {
      last.current = { id, at: now };
      onStone?.(id);
    }
  }

  const svg = (
    <svg viewBox={`0 0 ${width * C} ${height * C}`} className={mini ? 'h-40 w-full' : 'w-full'} style={mini ? undefined : big ? { maxHeight: '75vh' } : many ? undefined : { maxHeight: '28rem' }} data-testid={mini ? 'scheme-mini' : 'scheme'} role="img" aria-label={t('Spell scheme')}>
      <defs>
        <marker id={`${uid}-a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#e2e8f0" />
        </marker>
        <filter id={`${uid}-g`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {lanes.map((l) => (
        <g key={l.kind}>
          <rect x="0" y={l.y * C} width={width * C} height={l.height * C} fill={tints[l.kind]} fillOpacity="0.13" />
          {!mini && (
            <text x="6" y={l.y * C + 14} fontSize="12" fill="#e2e8f0" fillOpacity="0.55">
              {laneLabel[l.kind]}
            </text>
          )}
          {many && l.kind === 'release' && (
            <text x="6" y={(l.y + l.height) * C - 6} fontSize="13" fontWeight="600" fill="#e2e8f0" fillOpacity="0.8" data-testid="scheme-circle-label">
              {t('Circle {n}', { n: l.circle })}
            </text>
          )}
        </g>
      ))}
      {many &&
        parts.map((p) => (
          <g key={p.circle} data-testid="scheme-circle" data-circle={p.circle}>
            {p.circle > 1 && <line x1="0" x2={width * C} y1={p.y * C} y2={p.y * C} stroke="#e2e8f0" strokeOpacity="0.4" strokeWidth="2" />}
            {activeCircle === p.circle && <rect x="2" y={p.y * C + 2} width={width * C - 4} height={p.height * C - 4} fill="none" stroke="#a78bfa" strokeOpacity="0.8" strokeWidth="2.5" strokeDasharray="7 5" />}
          </g>
        ))}
      {scheme.arrows.map((a) => {
        const p = pos.get(a.from);
        const q = pos.get(a.to);
        const dx = (q.x - p.x) * C;
        const dy = (q.y - p.y) * C;
        const len = Math.hypot(dx, dy) || 1;
        const sx = p.x * C + (dx / len) * R;
        const sy = p.y * C + (dy / len) * R;
        const ex = q.x * C - (dx / len) * (R + 4);
        const ey = q.y * C - (dy / len) * (R + 4);
        return <line key={`${a.from}>${a.to}`} data-testid="scheme-arrow" data-from={a.from} data-to={a.to} x1={sx} y1={sy} x2={ex} y2={ey} stroke="#e2e8f0" strokeWidth="2.5" markerEnd={`url(#${uid}-a)`} />;
      })}
      {scheme.stones.map((s) => {
        const p = pos.get(s.id);
        const info = stoneInfo(s.sign);
        const color = KIND_COLORS[info.kind];
        const hasNote = s.note.trim().length > 0;
        return (
          <g
            key={s.id}
            transform={`translate(${p.x * C} ${p.y * C})`}
            data-testid="scheme-stone"
            data-id={s.id}
            data-sign={s.sign}
            data-note={hasNote ? 'true' : 'false'}
            data-circle={circleOf(s)}
            data-base={special.has(s.id) ? 'true' : 'false'}
            data-selected={selected === s.id || source === s.id ? 'true' : 'false'}
            style={mini && !(hasNote && onStone) ? { pointerEvents: 'none' } : { cursor: 'pointer' }}
            onClick={mini ? (hasNote && onStone ? () => onStone(s.id) : undefined) : () => tap(s.id)}
          >
            {special.has(s.id) && <circle r={R + 5} fill={KIND_COLORS.base} filter={`url(#${uid}-g)`} opacity="0.6" data-testid="special-base-glow" />}
            {hasNote && <circle r={R + 2} fill="#3b82f6" filter={`url(#${uid}-g)`} opacity="0.95" />}
            <circle r={R} fill="#14111d" stroke={color} strokeWidth="4" />
            {(selected === s.id || source === s.id) && <circle r={R + 6} fill="none" stroke={source === s.id ? '#fbbf24' : '#ffffff'} strokeWidth="2.5" strokeDasharray="5 4" />}
            <text textAnchor="middle" dominantBaseline="central" fontSize="30" fill="#f8fafc">
              {info.glyph}
            </text>
            {hasNote && (
              <g transform={`translate(${R - 4} ${-R + 4})`} data-testid="stone-note-badge">
                <circle r="10" fill="#3b82f6" />
                <text textAnchor="middle" dominantBaseline="central" fontSize="13" fill="#fff">
                  1
                </text>
              </g>
            )}
          </g>
        );
      })}
      {noteOpen && !mini && byId.get(noteOpen)?.note.trim() && (
        <foreignObject x={Math.min(pos.get(noteOpen).x * C + R - 4, width * C - 176)} y={Math.max(0, pos.get(noteOpen).y * C - R - 6)} width="170" height="120" style={{ overflow: 'visible' }}>
          <div className="rounded-lg border border-blue-400 bg-[#1e293b] p-2 text-base text-white shadow-lg" data-testid="stone-note" xmlns="http://www.w3.org/1999/xhtml">
            {byId.get(noteOpen).note}
          </div>
        </foreignObject>
      )}
    </svg>
  );
  if (!mini) return svg;
  // The small snapshot is scaled down, so its note is an ordinary box over it (a note drawn inside the picture would shrink
  // with it): the standard text size of the interface.
  return (
    <div className="relative">
      {svg}
      {noteOpen && byId.get(noteOpen)?.note.trim() && (
        <div className="absolute inset-x-1 top-1 z-10 max-h-full overflow-auto whitespace-pre-wrap rounded-lg border border-blue-400 bg-[#1e293b] p-2 text-base text-white shadow-lg" data-testid="stone-note">
          {byId.get(noteOpen).note}
        </div>
      )}
    </div>
  );
}

export const kindName = (kind) => KIND_LABELS[kind];
