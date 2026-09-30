import { useId, useRef } from 'react';
import { KIND_COLORS, KIND_LABELS, layoutScheme, stoneInfo } from '../../../../shared/spells.js';
import { useT } from '../../i18n.jsx';

const C = 72; // pixels of one cell in the drawing
const R = 27; // radius of a stone

// A spell scheme drawn as a table: Bases on top, Modifiers and Links below, the Release at the bottom, with
// arrows between the stones. It is only a drawing: the parent decides what a tap means.
//   selected / source: highlighted stones; noteOpen: the stone whose note is shown
//   onStone(id), onStoneTwice(id): a tap and a quick second tap on a stone
//   mini: the small snapshot shown in the compendium (no labels, not clickable)
export function SchemeView({ scheme, selected = null, source = null, noteOpen = null, onStone, onStoneTwice, mini = false }) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const last = useRef({ id: null, at: 0 });
  const { pos, width, height, lanes } = layoutScheme(scheme);
  const tints = { base: KIND_COLORS.base, mid: '#3b82f6', release: KIND_COLORS.release };
  const laneLabel = { base: t('Bases'), mid: t('Modifiers and Links'), release: t('Release') };
  const byId = new Map(scheme.stones.map((s) => [s.id, s]));

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

  return (
    <svg viewBox={`0 0 ${width * C} ${height * C}`} className={mini ? 'h-40 w-full' : 'w-full'} style={mini ? undefined : { maxHeight: '28rem' }} data-testid={mini ? 'scheme-mini' : 'scheme'} role="img" aria-label={t('Spell scheme')}>
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
            data-selected={selected === s.id || source === s.id ? 'true' : 'false'}
            style={mini ? { pointerEvents: 'none' } : { cursor: 'pointer' }}
            onClick={mini ? undefined : () => tap(s.id)}
          >
            {hasNote && <circle r={R + 2} fill="#3b82f6" filter={`url(#${uid}-g)`} opacity="0.95" />}
            <circle r={R} fill="#14111d" stroke={color} strokeWidth="4" />
            {(selected === s.id || source === s.id) && <circle r={R + 6} fill="none" stroke={source === s.id ? '#fbbf24' : '#ffffff'} strokeWidth="2.5" strokeDasharray="5 4" />}
            <text textAnchor="middle" dominantBaseline="central" fontSize="30" fill="#f8fafc">
              {info.glyph}
            </text>
            {hasNote && !mini && (
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
      {noteOpen && byId.get(noteOpen)?.note.trim() && !mini && (
        <foreignObject x={Math.min(pos.get(noteOpen).x * C + R - 4, width * C - 176)} y={Math.max(0, pos.get(noteOpen).y * C - R - 6)} width="170" height="120" style={{ overflow: 'visible' }}>
          <div className="rounded-lg border border-blue-400 bg-[#1e293b] p-2 text-xs text-white shadow-lg" data-testid="stone-note" xmlns="http://www.w3.org/1999/xhtml">
            {byId.get(noteOpen).note}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

export const kindName = (kind) => KIND_LABELS[kind];
