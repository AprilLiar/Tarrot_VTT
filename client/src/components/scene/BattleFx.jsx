import { useEffect, useRef, useState } from 'react';
import { socket } from '../../socket.js';
import { StatusIcon } from './StatusIcon.jsx';
import { useT } from '../../i18n.jsx';

// Board animations (see the README): what the server tells every screen ('battle:fx', server/fx.js) drawn over the map for a moment.
//  - An attack is ONE combined animation, whatever it used: the attacker charges up (0.6 s) with a layer for each source, all at once and
//    each in its own place so they never cover each other (a Stance: a red sigil on the ground under the token; a Spell: a violet rune
//    circle turning round it; a Manifestation: a golden halo behind it), then ONE streak flies to each target, braided from the colours of
//    the sources used (white for a plain attack), and one burst of the same colours lands on impact (at 0.85 s).
//  - Whatever happens to a target of that attack (its outcome, HP, statuses, Saves) waits for the impact, so it reads as one story.
//  - HP: a red number (and a blue one for the Temp HP part) and a flash; healing a green number. Statuses: the icon pops with + or -, side
//    by side. Miss: "MISS" sweeps past; Critical: "CRITICAL" and a gold burst. Saves: a blue shield (passed) or red cracks (failed).
//    A turn: a gold ring round the token and its name over the map.
const COLORS = { stance: '#ef4444', spell: '#a78bfa', manifestation: '#fbbf24' };
const PLAIN = '#f8fafc';
const IMPACT_MS = 850;
const LIFE = { attack: 1500, outcome: 1300, hp: 1400, status: 1300, save: 1100, turn: 1600 };

export function BattleFx({ tokens, boxOf, width, height }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const impacts = useRef(new Map()); // tokenId -> when the attack on it lands

  useEffect(() => {
    let seq = 0;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const add = (item) => {
      const id = ++seq;
      setItems((list) => [...list, { ...item, id }]);
      later(() => setItems((list) => list.filter((x) => x.id !== id)), LIFE[item.kind] ?? 1200);
    };
    const onFx = (f) => {
      const now = Date.now();
      if (f.kind === 'attack') {
        for (const id of f.to) impacts.current.set(id, now + IMPACT_MS);
        add(f);
        return;
      }
      const tokenId = f.tokenId ?? tokensRef.current.find((tk) => tk.ownerKind === 'character' && tk.ownerId === f.characterId)?.id;
      if (tokenId == null) return;
      const wait = Math.max(0, (impacts.current.get(tokenId) ?? 0) - now);
      later(() => add({ ...f, tokenId }), wait);
    };
    socket.on('battle:fx', onFx);
    return () => {
      socket.off('battle:fx', onFx);
      timers.forEach(clearTimeout);
    };
  }, []);

  const tokenById = new Map(tokens.map((tk) => [tk.id, tk]));
  const centre = (id) => {
    const tk = tokenById.get(id);
    if (!tk) return null;
    const b = boxOf(tk);
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2, b };
  };
  // Status pops of one token stand side by side, in the order they came.
  const popIndex = (item) => items.filter((x) => x.kind === 'status' && x.tokenId === item.tokenId && x.id <= item.id).length - 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="battle-fx">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <radialGradient id="fx-halo">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
        </defs>
        {items.map((item) => {
          if (item.kind === 'attack') return <AttackFx key={item.id} item={item} centre={centre} />;
          const c = centre(item.tokenId);
          if (!c) return null;
          if (item.kind === 'outcome' && item.outcome === 'crit')
            return <circle key={item.id} className="fx-part fx-burst" style={{ animationDelay: '0s' }} cx={c.x} cy={c.y} r={c.r * 1.8} fill="none" stroke="#fbbf24" strokeWidth={c.r * 0.25} data-testid="fx-crit-burst" />;
          if (item.kind === 'save')
            return item.passed ? (
              <circle key={item.id} className="fx-part fx-ring fx-once" cx={c.x} cy={c.y} r={c.r * 1.15} fill="#60a5fa33" stroke="#93c5fd" strokeWidth={c.r * 0.12} data-testid="fx-save" data-passed="true" />
            ) : (
              <g key={item.id} data-testid="fx-save" data-passed="false">
                {[-1, 0, 1].map((k) => (
                  <polyline
                    key={k}
                    className="fx-crack"
                    pathLength="1"
                    points={`${c.x + k * c.r * 0.35},${c.y - c.r * 0.9} ${c.x + k * c.r * 0.35 + c.r * 0.15},${c.y - c.r * 0.3} ${c.x + k * c.r * 0.35 - c.r * 0.12},${c.y + c.r * 0.2} ${c.x + k * c.r * 0.35 + c.r * 0.1},${c.y + c.r * 0.85}`}
                    fill="none"
                    stroke="#f87171"
                    strokeWidth={c.r * 0.08}
                  />
                ))}
              </g>
            );
          if (item.kind === 'turn') return <circle key={item.id} className="fx-part fx-ring" cx={c.x} cy={c.y} r={c.r * 1.2} fill="none" stroke="#fbbf24" strokeWidth={c.r * 0.14} data-testid="fx-turn" />;
          if (item.kind === 'hp' && (item.loss || item.tempLoss)) return <circle key={item.id} className="fx-flash" cx={c.x} cy={c.y} r={c.r * 0.95} fill="#ef4444" />;
          return null;
        })}
      </svg>

      {items.map((item) => {
        const c = item.tokenId != null ? centre(item.tokenId) : null;
        if (!c) return null;
        const size = Math.max(12, c.r * 0.75);
        const at = { position: 'absolute', left: c.x, top: c.b.top, fontSize: size };
        if (item.kind === 'hp')
          return (
            <div key={item.id} className="fx-float flex gap-1 whitespace-nowrap font-extrabold drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]" style={at} data-testid="fx-hp" data-loss={item.loss} data-temp={item.tempLoss} data-heal={item.heal}>
              {item.loss > 0 && <span className="text-red-500">-{item.loss}</span>}
              {item.tempLoss > 0 && <span className="text-sky-400">-{item.tempLoss}</span>}
              {item.heal > 0 && <span className="text-green-400">+{item.heal}</span>}
            </div>
          );
        if (item.kind === 'status') {
          const icon = c.r * 0.9;
          const i = popIndex(item);
          return (
            <div key={item.id} className="fx-pop absolute" style={{ left: c.x - icon / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * icon * 1.05, top: c.b.top - icon * 1.1, width: icon, height: icon }} data-testid="fx-status" data-status={item.key} data-delta={item.delta}>
              <StatusIcon statusKey={item.key} stacks={0} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              <span className={`absolute -right-1 -top-1 font-black ${item.delta > 0 ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: icon * 0.45 }}>
                {item.delta > 0 ? '+' : '-'}
              </span>
            </div>
          );
        }
        if (item.kind === 'outcome' && item.outcome !== 'hit')
          return (
            <div
              key={item.id}
              className={`${item.outcome === 'crit' ? 'fx-crit text-amber-300' : 'fx-miss text-slate-200'} absolute whitespace-nowrap font-black italic tracking-wide drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)]`}
              style={{ left: c.x, top: c.y, fontSize: size * (item.outcome === 'crit' ? 1.1 : 0.9) }}
              data-testid={item.outcome === 'crit' ? 'fx-crit' : 'fx-miss'}
            >
              {item.outcome === 'crit' ? t('CRITICAL') : t('MISS')}
            </div>
          );
        return null;
      })}

      {items
        .filter((x) => x.kind === 'turn')
        .slice(-1)
        .map((item) => (
          <div key={item.id} className="fx-banner absolute left-1/2 top-3 rounded-full bg-black/70 px-4 py-1 text-lg font-semibold text-amber-200" data-testid="fx-turn-banner">
            {item.name}
          </div>
        ))}
    </div>
  );
}

// The combined strike (see the comment at the top): every layer shares one timeline, so any mix of sources reads as one animation.
function AttackFx({ item, centre }) {
  const from = item.from != null ? centre(item.from) : null;
  const colors = item.sources.length ? item.sources.map((s) => COLORS[s]) : [PLAIN];
  const has = (s) => item.sources.includes(s);
  return (
    <g data-testid="fx-attack" data-sources={item.sources.join(' ')}>
      {from && (
        <>
          {has('manifestation') && <circle className="fx-part fx-charge" cx={from.x} cy={from.y} r={from.r * 1.55} fill="url(#fx-halo)" data-testid="fx-layer-manifestation" />}
          {has('stance') && (
            <g className="fx-part fx-charge" data-testid="fx-layer-stance">
              <ellipse cx={from.x} cy={from.y + from.r * 0.95} rx={from.r * 1.05} ry={from.r * 0.32} fill="#ef444433" stroke={COLORS.stance} strokeWidth={from.r * 0.07} strokeDasharray={`${from.r * 0.3} ${from.r * 0.12}`} />
            </g>
          )}
          {has('spell') && (
            <circle
              className="fx-part fx-spin"
              cx={from.x}
              cy={from.y}
              r={from.r * 1.22}
              fill="none"
              stroke={COLORS.spell}
              strokeWidth={from.r * 0.08}
              strokeDasharray={`${from.r * 0.18} ${from.r * 0.1}`}
              data-testid="fx-layer-spell"
            />
          )}
        </>
      )}
      {item.to.map((id) => {
        const to = centre(id);
        if (!to) return null;
        return (
          <g key={id}>
            {from &&
              (() => {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const gap = from.r * 0.16;
                return colors.map((c, i) => {
                  const off = (i - (colors.length - 1) / 2) * gap;
                  return (
                    <line
                      key={c}
                      className="fx-streak"
                      style={{ '--len': len, strokeDasharray: len }}
                      x1={from.x + nx * off}
                      y1={from.y + ny * off}
                      x2={to.x + nx * off}
                      y2={to.y + ny * off}
                      stroke={c}
                      strokeWidth={from.r * 0.11}
                      strokeLinecap="round"
                      data-testid="fx-streak"
                    />
                  );
                });
              })()}
            {colors.map((c, i) => (
              <circle key={c} className="fx-part fx-burst" cx={to.x} cy={to.y} r={to.r * (1.15 + i * 0.28)} fill="none" stroke={c} strokeWidth={to.r * 0.12} data-testid="fx-burst" />
            ))}
          </g>
        );
      })}
    </g>
  );
}
