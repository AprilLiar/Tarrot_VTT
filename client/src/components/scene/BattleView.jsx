import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { imageUrl } from '../../lib/image.js';
import { useZoomPan } from '../../lib/useZoomPan.js';
import { useElementSize } from '../../lib/useElementSize.js';
import { cellAt, cellToUnits, distanceSquares, dropCell, templateShape, toUnits } from '../../lib/battleMath.js';
import Dialog, { btn, btnDanger } from '../Dialog.jsx';
import { usePictures } from './Pictures.jsx';
import { TokenMenu } from './TokenMenu.jsx';

// Battle mode: the battle picture with a square grid, tokens, and (for the GM and the
// Display) drawing, pings, a ruler and spell templates. Players on a desktop only watch.

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#ffffff'];
const RING = { pc: '#34d399', npc: '#f87171', prop: '#94a3b8' };
const DRAG_THRESHOLD = 6;

function TokenSettings({ token, onClose }) {
  const { toast } = useApp();
  const owner = token.ownerKind === 'character' ? { characterId: token.ownerId } : { tempNpcId: token.ownerId };
  const pictures = usePictures(owner);
  return (
    <Dialog title={`Token Settings: ${token.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm opacity-70">Picture</div>
          <div className="grid grid-cols-4 gap-2">
            {pictures?.map((p) => (
              <button
                key={p.id}
                data-testid="pick-token-picture"
                aria-label={p.name || 'Picture'}
                aria-pressed={p.id === token.pictureId}
                className={`flex h-20 items-center justify-center overflow-hidden rounded bg-white/5 ${p.id === token.pictureId ? 'ring-2 ring-violet-500' : ''}`}
                onClick={async () => {
                  const r = await call('battle:update', { id: token.id, pictureId: p.id });
                  if (!r.ok) toast(r.error);
                }}
              >
                <img src={imageUrl(p.imageId)} alt="" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm opacity-70">
          Size: {token.size} x {token.size} squares (set on the character sheet or the temp NPC).
          {token.ownerKind === 'character' && ` Banked Movement: ${token.bank}.`}
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <button
            className={btnDanger}
            data-testid="remove-token"
            onClick={async () => {
              await call('battle:remove', { id: token.id });
              onClose();
            }}
          >
            Remove from the map
          </button>
          {token.ownerKind === 'character' && (
            <button className={btn} onClick={() => call('battle:clear_bank', { id: token.id })}>
              Clear banked Movement
            </button>
          )}
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function GridPanel({ scene, battle, onClose }) {
  const { toast } = useApp();
  const [g, setG] = useState(battle.grid);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  function change(patch) {
    const next = { ...g, ...patch };
    setG(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await call('scene:set_grid', { id: scene.id, ...next });
      if (!r.ok) toast(r.error);
    }, 250);
  }
  const row = (label, key, min, max, step) => (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label}: {(g[key] * 100).toFixed(1)}%
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={g[key]}
        data-testid={`grid-${key}`}
        onChange={(e) => change({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="absolute bottom-16 left-2 z-30 w-72 rounded-xl bg-[#1a1626]/95 p-3 shadow-xl" data-no-pan data-testid="grid-panel">
      <div className="mb-2 flex items-center justify-between">
        <strong>Grid</strong>
        <button className={`${btn} min-h-9 px-3`} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mb-2 text-xs opacity-70" data-testid="grid-size">
        {battle.cols} x {battle.rows} squares. Line the grid up with the map; sizes are a share of the picture's width.
      </p>
      <div className="flex flex-col gap-2">
        {row('Square size', 'cell', 0.01, 0.3, 0.001)}
        {row('Shift right', 'ox', 0, 0.3, 0.001)}
        {row('Shift down', 'oy', 0, 0.3, 0.001)}
      </div>
    </div>
  );
}

function Ping({ ping, unit }) {
  return (
    <circle cx={ping.x} cy={ping.y} r={unit * 0.6} fill="none" stroke="#fbbf24" strokeWidth={unit * 0.15} className="battle-ping" />
  );
}

export default function BattleView() {
  const { identity, stage, toast } = useApp();
  const isGm = identity.role === 'gm';
  const tools = isGm || identity.role === 'display';
  const battle = stage.battle;
  const scene = stage.scene;
  const { ref, view, bind, zoomBy, reset } = useZoomPan();
  const viewRef = useRef(view);
  viewRef.current = view;
  const { w, h } = useElementSize(ref);
  const mapRef = useRef(null);

  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(0.004);
  const [shape, setShape] = useState('cone');
  const [tsize, setTsize] = useState(4);
  const [showGrid, setShowGrid] = useState(true);
  const [gridOpen, setGridOpen] = useState(false);
  const [draft, setDraft] = useState(null); // in-progress stroke, ruler or template
  const [pings, setPings] = useState([]);
  const [menu, setMenu] = useState(null);
  const [settings, setSettings] = useState(null);
  const [drag, setDrag] = useState(null); // { id, u, v } a token being dragged (picture fractions)

  const aspect = battle?.aspect ?? 1;
  const ready = !!(scene && battle?.imageId);
  // The picture is shown whole, as large as fits.
  const fw = Math.min(w, h * aspect);
  const fh = fw / aspect;
  const unit = battle ? battle.grid.cell : 0.05; // one square, in picture widths
  const ppu = fw || 1; // pixels per picture width

  useEffect(() => {
    const onPing = (p) => {
      const id = Math.random();
      setPings((list) => [...list, { id, ...p }]);
      setTimeout(() => setPings((list) => list.filter((x) => x.id !== id)), 2500);
    };
    socket.on('battle:pinged', onPing);
    return () => socket.off('battle:pinged', onPing);
  }, []);

  const menuToken = menu && battle?.tokens.find((t) => t.id === menu.id);

  // Picture fractions under a pointer.
  function toFractions(e) {
    const r = mapRef.current.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  }
  const inside = ({ u, v }) => u >= 0 && u <= 1 && v >= 0 && v <= 1;

  // ---- tools on the map surface ------------------------------------------------
  function surfaceDown(e) {
    if (!tools || tool === 'select' || !ready || e.button === 2) return;
    const f = toFractions(e);
    if (!inside(f)) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tool === 'ping') {
      call('battle:ping', { x: f.u, y: f.v });
    } else if (tool === 'draw') {
      setDraft({ kind: 'draw', points: [[f.u, f.v]] });
    } else if (tool === 'ruler') {
      const c = cellAt(f.u, f.v, battle.grid, aspect);
      setDraft({ kind: 'ruler', a: c, b: c });
    } else if (tool === 'template') {
      const cx = Math.round(((f.u - battle.grid.ox) / battle.grid.cell) * 2) / 2;
      const cy = Math.round(((f.v - battle.grid.oy) / (battle.grid.cell * aspect)) * 2) / 2;
      setDraft({ kind: 'template', x: cx, y: cy, angle: 0, sx: e.clientX, sy: e.clientY });
    }
  }
  function surfaceMove(e) {
    if (!draft) return;
    const f = toFractions(e);
    if (draft.kind === 'draw') {
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot((f.u - last[0]) * aspect, f.v - last[1]) * 1 > 0.004 && inside(f) && draft.points.length < 500) {
        setDraft({ ...draft, points: [...draft.points, [f.u, f.v]] });
      }
    } else if (draft.kind === 'ruler') {
      setDraft({ ...draft, b: cellAt(f.u, f.v, battle.grid, aspect) });
    } else if (draft.kind === 'template') {
      const dx = e.clientX - draft.sx;
      const dy = e.clientY - draft.sy;
      if (Math.hypot(dx, dy) > 8) setDraft({ ...draft, angle: (Math.atan2(dy, dx) * 180) / Math.PI });
    }
  }
  async function surfaceUp() {
    const d = draft;
    setDraft(null);
    if (!d) return;
    if (d.kind === 'draw') {
      const pts = d.points.length >= 2 ? d.points : [d.points[0], [d.points[0][0] + 0.001, d.points[0][1]]];
      const r = await call('mark:add', { kind: 'draw', data: { color, width: Math.round(width * 1000), points: pts } });
      if (!r.ok) toast(r.error);
    } else if (d.kind === 'template') {
      const r = await call('mark:add', { kind: 'template', data: { shape, x: d.x, y: d.y, size: tsize, angle: d.angle, color } });
      if (!r.ok) toast(r.error);
    }
  }

  // ---- dragging tokens (GM and Display) -------------------------------------------
  const dragState = useRef(null);
  function tokenDown(e, t) {
    if (e.button === 2) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragState.current = { id: t.id, x: e.clientX, y: e.clientY, moved: false };
  }
  function tokenMove(e, t) {
    const d = dragState.current;
    if (!d || d.id !== t.id || !tools) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
    d.moved = true;
    const f = toFractions(e);
    setDrag({ id: t.id, u: f.u, v: f.v });
  }
  async function tokenUp(e, t) {
    const d = dragState.current;
    dragState.current = null;
    if (!d || d.id !== t.id) return;
    if (d.moved && tools) {
      const f = toFractions(e);
      setDrag(null);
      const cell = dropCell(f.u, f.v, t.size, battle.grid, aspect, battle.cols, battle.rows);
      const r = await call('battle:place', { id: t.id, ...cell });
      if (!r.ok) toast(r.error);
    } else if (!d.moved && isGm) {
      setMenu({ id: t.id, anchor: e.currentTarget });
    }
  }

  const cellPx = (v) => `${v * 100}%`;
  const tokenBox = (t) => {
    const pos = drag?.id === t.id ? dropCell(drag.u, drag.v, t.size, battle.grid, aspect, battle.cols, battle.rows) : { col: t.col, row: t.row };
    return {
      left: cellPx(battle.grid.ox + pos.col * battle.grid.cell),
      top: cellPx(battle.grid.oy + pos.row * battle.grid.cell * aspect),
      width: cellPx(t.size * battle.grid.cell),
      height: cellPx(t.size * battle.grid.cell * aspect),
    };
  };

  const gridLines = useMemo(() => {
    if (!battle) return [];
    const lines = [];
    const { grid, cols, rows } = battle;
    const x0 = grid.ox;
    const y0 = grid.oy / aspect;
    const x1 = x0 + cols * grid.cell;
    const y1 = y0 + rows * grid.cell;
    for (let i = 0; i <= cols; i++) lines.push(<line key={`c${i}`} x1={x0 + i * grid.cell} y1={y0} x2={x0 + i * grid.cell} y2={y1} />);
    for (let j = 0; j <= rows; j++) lines.push(<line key={`r${j}`} x1={x0} y1={y0 + j * grid.cell} x2={x1} y2={y0 + j * grid.cell} />);
    return lines;
  }, [battle, aspect]);

  const eraseMode = tool === 'erase' && tools;
  const ruler = draft?.kind === 'ruler' ? draft : null;

  return (
    <div ref={ref} className="absolute inset-0 touch-none select-none overflow-hidden bg-black" data-testid="battle-view" {...bind}>
      <div
        className="absolute inset-0 flex origin-top-left items-center justify-center"
        data-testid="scene-world"
        data-pan-surface
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {ready && fw > 0 && (
          <div
            ref={mapRef}
            className="relative shrink-0"
            data-testid="battle-map"
            style={{ width: fw, height: fh, '--map-w': `${fw}px`, cursor: tools && tool !== 'select' ? 'crosshair' : undefined }}
            onPointerDown={surfaceDown}
            onPointerMove={surfaceMove}
            onPointerUp={surfaceUp}
            onPointerCancel={() => setDraft(null)}
            data-pan-surface
          >
            <img src={imageUrl(battle.imageId)} alt="" draggable={false} className="absolute inset-0 h-full w-full" data-testid="battle-background" />

            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 1 ${1 / aspect}`}
              data-testid="battle-overlay"
              style={{ pointerEvents: eraseMode ? 'auto' : 'none' }}
            >
              {showGrid && (
                <g stroke="#ffffff" strokeOpacity={gridOpen ? 0.7 : 0.28} strokeWidth={unit * 0.03} data-testid="battle-grid">
                  {gridLines}
                </g>
              )}
              {battle.marks
                .filter((m) => m.kind === 'template')
                .map((m) => {
                  const sh = templateShape(m, battle.grid, aspect);
                  const common = {
                    key: m.id,
                    fill: m.color,
                    fillOpacity: 0.3,
                    stroke: m.color,
                    strokeWidth: unit * 0.06,
                    'data-testid': 'battle-template',
                    style: eraseMode ? { cursor: 'pointer', pointerEvents: 'all' } : undefined,
                    onClick: eraseMode ? () => call('mark:remove', { id: m.id }) : undefined,
                  };
                  if (sh.type === 'circle') return <circle {...common} cx={sh.cx} cy={sh.cy} r={sh.r} />;
                  if (sh.type === 'rect') return <rect {...common} x={sh.x} y={sh.y} width={sh.size} height={sh.size} />;
                  if (sh.type === 'polygon') return <polygon {...common} points={sh.points} />;
                  return <path {...common} d={sh.d} />;
                })}
              {battle.marks
                .filter((m) => m.kind === 'draw')
                .map((m) => (
                  <polyline
                    key={m.id}
                    data-testid="battle-drawing"
                    points={m.points.map((p) => `${p[0]},${p[1] / aspect}`).join(' ')}
                    fill="none"
                    stroke={m.color}
                    strokeWidth={m.width / 1000}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={eraseMode ? { cursor: 'pointer', pointerEvents: 'stroke' } : undefined}
                    onClick={eraseMode ? () => call('mark:remove', { id: m.id }) : undefined}
                  />
                ))}
              {draft?.kind === 'draw' && (
                <polyline points={draft.points.map((p) => `${p[0]},${p[1] / aspect}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {draft?.kind === 'template' &&
                (() => {
                  const sh = templateShape({ shape, x: draft.x, y: draft.y, size: tsize, angle: draft.angle }, battle.grid, aspect);
                  const c = { fill: color, fillOpacity: 0.25, stroke: color, strokeWidth: unit * 0.06, strokeDasharray: `${unit * 0.2}` };
                  if (sh.type === 'circle') return <circle {...c} cx={sh.cx} cy={sh.cy} r={sh.r} />;
                  if (sh.type === 'rect') return <rect {...c} x={sh.x} y={sh.y} width={sh.size} height={sh.size} />;
                  if (sh.type === 'polygon') return <polygon {...c} points={sh.points} />;
                  return <path {...c} d={sh.d} />;
                })()}
              {ruler &&
                (() => {
                  const a = cellToUnits(ruler.a.col + 0.5, ruler.a.row + 0.5, battle.grid, aspect);
                  const b = cellToUnits(ruler.b.col + 0.5, ruler.b.row + 0.5, battle.grid, aspect);
                  return (
                    <g>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={unit * 0.1} strokeLinecap="round" />
                      <circle cx={a.x} cy={a.y} r={unit * 0.18} fill="#fbbf24" />
                      <circle cx={b.x} cy={b.y} r={unit * 0.18} fill="#fbbf24" />
                    </g>
                  );
                })()}
              {pings.map((p) => {
                const pt = toUnits(p.x, p.y, aspect);
                return <Ping key={p.id} ping={{ x: pt.x, y: pt.y }} unit={unit} />;
              })}
            </svg>

            {battle.tokens.map((t) => (
              <div
                key={t.id}
                data-testid="battle-token"
                data-name={t.name}
                data-kind={t.kind}
                data-hidden={t.hidden ? 'true' : 'false'}
                data-col={t.col}
                data-row={t.row}
                data-size={t.size}
                data-targeted={t.targetedBy.length > 0 ? 'true' : 'false'}
                data-no-pan
                className={`absolute select-none ${t.hidden ? 'opacity-50' : ''} ${tools && tool === 'select' ? 'cursor-grab' : ''}`}
                style={{ ...tokenBox(t), zIndex: drag?.id === t.id ? 20 : 5, pointerEvents: tool === 'select' || !tools ? 'auto' : 'none', touchAction: 'none' }}
                onPointerDown={(e) => tokenDown(e, t)}
                onPointerMove={(e) => tokenMove(e, t)}
                onPointerUp={(e) => tokenUp(e, t)}
                onPointerCancel={() => {
                  dragState.current = null;
                  setDrag(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (isGm) setMenu({ id: t.id, anchor: e.currentTarget });
                }}
              >
                <div
                  className="absolute inset-[6%] overflow-hidden rounded-full bg-black/35"
                  style={{ boxShadow: `0 0 0 ${Math.max(2, ppu * unit * 0.06)}px ${t.targetedBy.length ? '#fbbf24' : RING[t.kind]}` }}
                >
                  <img src={imageUrl(t.imageId)} alt={t.name} draggable={false} className="h-full w-full object-contain" />
                </div>
                {t.targetedBy.length > 0 && <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full border-2 border-dashed border-amber-300" />}
                <div
                  data-testid="token-name"
                  className="pointer-events-none absolute left-1/2 top-full mt-px -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-white"
                  style={{ fontSize: `calc(var(--map-w) * ${unit * 0.32})` }}
                >
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" data-testid="no-battle-map">
          <p className="text-lg opacity-70">
            {!scene
              ? isGm
                ? 'No scene is active. Open Scenes to start one.'
                : 'Waiting for the GM to start a scene.'
              : isGm
                ? 'This scene has no battle map yet. Open Scenes, choose the scene and add a Battle map.'
                : 'The GM has not set up a battle map for this scene yet.'}
          </p>
        </div>
      )}

      {ruler && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1 text-lg" data-testid="ruler-distance">
          {distanceSquares(ruler.a, ruler.b)} squares
        </div>
      )}

      {/* Overlays live outside the zoomed world so they stay put. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2" data-no-pan>
        <div className="pointer-events-auto flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
          <button className="h-10 w-10 rounded-full active:bg-white/20" aria-label="Zoom out" data-testid="zoom-out" onClick={() => zoomBy(0.8)}>
            -
          </button>
          <button className="h-10 rounded-full px-3 text-xs active:bg-white/20" data-testid="zoom-reset" onClick={reset}>
            {Math.round(view.scale * 100)}%
          </button>
          <button className="h-10 w-10 rounded-full active:bg-white/20" aria-label="Zoom in" data-testid="zoom-in" onClick={() => zoomBy(1.25)}>
            +
          </button>
        </div>
      </div>

      {tools && ready && (
        <div className="absolute left-2 top-1/2 z-20 flex max-h-[60%] -translate-y-1/2 flex-col gap-1 overflow-y-auto rounded-xl bg-black/55 p-1 backdrop-blur" data-no-pan data-testid="battle-tools">
          {[
            ['select', 'Move'],
            ['draw', 'Draw'],
            ['ping', 'Ping'],
            ['ruler', 'Ruler'],
            ['template', 'Area'],
            ['erase', 'Erase'],
          ].map(([id, label]) => (
            <button
              key={id}
              data-testid={`tool-${id}`}
              aria-pressed={tool === id}
              className={`min-h-10 rounded-lg px-3 text-sm ${tool === id ? 'bg-violet-700' : 'bg-white/10 active:bg-white/20'}`}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
          {(tool === 'draw' || tool === 'template') && (
            <div className="flex flex-wrap gap-1 p-1" data-testid="tool-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          )}
          {tool === 'draw' && (
            <div className="flex gap-1 p-1">
              {[0.002, 0.004, 0.008].map((wd) => (
                <button key={wd} aria-pressed={width === wd} className={`min-h-8 flex-1 rounded ${width === wd ? 'bg-violet-700' : 'bg-white/10'}`} onClick={() => setWidth(wd)}>
                  {wd === 0.002 ? 'S' : wd === 0.004 ? 'M' : 'L'}
                </button>
              ))}
            </div>
          )}
          {tool === 'template' && (
            <div className="flex flex-col gap-1 p-1 text-xs">
              <select className="min-h-9 rounded bg-white/10 px-1" aria-label="Shape" data-testid="template-shape" value={shape} onChange={(e) => setShape(e.target.value)}>
                <option value="circle">Circle</option>
                <option value="cone">Cone</option>
                <option value="line">Line</option>
                <option value="square">Square</option>
              </select>
              <label className="flex items-center gap-1">
                Squares
                <input
                  type="number"
                  min="1"
                  max="60"
                  aria-label="Template size"
                  data-testid="template-size"
                  className="min-h-9 w-14 rounded bg-black/40 px-1 text-center"
                  value={tsize}
                  onChange={(e) => setTsize(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                />
              </label>
              <span className="opacity-70">Press for the start, drag for the direction.</span>
            </div>
          )}
          <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" aria-pressed={showGrid} data-testid="toggle-grid" onClick={() => setShowGrid(!showGrid)}>
            Grid {showGrid ? 'on' : 'off'}
          </button>
          {isGm && (
            <>
              <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" data-testid="open-grid" onClick={() => setGridOpen(!gridOpen)}>
                Set grid
              </button>
              <button className="min-h-9 rounded-lg bg-white/10 px-3 text-xs" data-testid="clear-drawings" onClick={() => call('mark:clear', { kind: 'draw' })}>
                Clear drawings
              </button>
              <button className="min-h-9 rounded-lg bg-white/10 px-3 text-xs" data-testid="clear-templates" onClick={() => call('mark:clear', { kind: 'template' })}>
                Clear areas
              </button>
            </>
          )}
        </div>
      )}

      {isGm && gridOpen && ready && <GridPanel scene={scene} battle={battle} onClose={() => setGridOpen(false)} />}

      {menuToken && (
        <TokenMenu
          s={menuToken}
          anchor={menu.anchor}
          containerRef={ref}
          onClose={() => setMenu(null)}
          onSettings={() => {
            setSettings(menuToken);
            setMenu(null);
          }}
          onToggleHidden={async () => {
            await call('battle:update', { id: menuToken.id, hidden: !menuToken.hidden });
            setMenu(null);
          }}
        />
      )}
      {settings && <TokenSettings token={battle.tokens.find((t) => t.id === settings.id) ?? settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
