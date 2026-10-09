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
import { HeightControl } from './HeightControl.jsx';
import { CombatBar } from './CombatBar.jsx';
import { useT } from '../../i18n.jsx';
import { useSetting } from '../../lib/settings.js';
import { TokenStatuses } from './StatusIcon.jsx';
import { areaName } from '../../lib/areaName.js';
import { membersOf } from '../../../../shared/templates.js';

// Battle mode: the battle picture with a square grid, tokens, and (for the GM and the
// Display) drawing, pings, a ruler and spell templates. Players on a desktop only watch.

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#ffffff'];
const RING = { pc: '#34d399', npc: '#f87171', prop: '#94a3b8' };
const DRAG_THRESHOLD = 6;

function TokenSettings({ token, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const owner = token.ownerKind === 'character' ? { characterId: token.ownerId } : { tempNpcId: token.ownerId };
  const pictures = usePictures(owner);
  return (
    <Dialog title={t('Token Settings: {name}', { name: token.name })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm opacity-70">{t('Picture')}</div>
          <div className="grid grid-cols-4 gap-2">
            {pictures?.map((p) => (
              <button
                key={p.id}
                data-testid="pick-token-picture"
                aria-label={p.name || t('Picture')}
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
          {t('Size: {n} x {n} squares (set on the character sheet or the temp NPC).', { n: token.size })}
          {token.ownerKind === 'character' && ` ${t('Banked Movement: {n}.', { n: token.bank })}`}
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
            {t('Remove from the map')}
          </button>
          {token.ownerKind === 'character' && (
            <button className={btn} onClick={() => call('battle:clear_bank', { id: token.id })}>
              {t('Clear banked Movement')}
            </button>
          )}
          <button className={btn} onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// The grid setting, in pixels of the battle picture itself: the side of a square, and how far the grid is shifted
// right and down (negative shifts start it before the picture's corner, so the grid can extend beyond the map;
// only its lines over the picture are drawn). Ctrl + mouse wheel changes the size by 1 pixel while this is open.
function GridPanel({ scene, battle, natural, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [g, setG] = useState(battle.grid);
  const timer = useRef(null);
  const latest = useRef(g);
  latest.current = g;
  const natW = natural.w || 1000;
  const natH = natural.h || natW / (battle.aspect || 1);
  useEffect(() => () => clearTimeout(timer.current), []);

  function change(patch) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setG(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await call('scene:set_grid', { id: scene.id, ...latest.current });
      if (!r.ok) toast(r.error);
    }, 250);
  }
  const sizePx = Math.round(g.cell * natW);
  const setSize = (px) => px >= 1 && change({ cell: Math.min(0.3, Math.max(0.01, px / natW)) });

  // Ctrl + wheel over the page changes the size by one pixel (and keeps the browser from zooming).
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setSize(Math.round(latest.current.cell * natW) + (e.deltaY < 0 ? 1 : -1));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // A number in pixels with - and + buttons.
  const field = (text, value, set, testId, min) => (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1">{text}</span>
      <button type="button" aria-label={t('Less')} className="h-9 w-9 rounded-lg bg-white/10 active:bg-white/20" data-testid={`${testId}-down`} onClick={() => set(value - 1)}>
        -
      </button>
      <input
        type="number"
        className="h-9 w-20 rounded-lg border border-white/20 bg-black/30 px-2 text-center"
        aria-label={text}
        data-testid={testId}
        min={min}
        value={value}
        onChange={(e) => e.target.value !== '' && set(Math.round(Number(e.target.value)))}
      />
      <button type="button" aria-label={t('More')} className="h-9 w-9 rounded-lg bg-white/10 active:bg-white/20" data-testid={`${testId}-up`} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
  return (
    <div className="absolute bottom-16 left-2 z-30 w-80 rounded-xl bg-[#1a1626]/95 p-3 shadow-xl" data-no-pan data-testid="grid-panel">
      <div className="mb-2 flex items-center justify-between">
        <strong>{t('Grid')}</strong>
        <button className={`${btn} min-h-9 px-3`} onClick={onClose}>
          {t('Close')}
        </button>
      </div>
      <p className="mb-2 text-xs opacity-70" data-testid="grid-size">
        {t('{cols} x {rows} squares. Line the grid up with the map. Sizes are in pixels of the map picture; Ctrl + mouse wheel changes the square size by 1. The grid may reach past the picture, only its lines over the picture are shown.', { cols: battle.cols, rows: battle.rows })}
      </p>
      <div className="flex flex-col gap-2">
        {field(t('Square size (px)'), sizePx, setSize, 'grid-cell', 1)}
        {field(t('Shift right (px)'), Math.round(g.ox * natW), (px) => change({ ox: px / natW }), 'grid-ox')}
        {field(t('Shift down (px)'), Math.round(g.oy * natH), (px) => change({ oy: px / natH }), 'grid-oy')}
      </div>
    </div>
  );
}

// How many Spaces a character is in the air ("+X sp." above the token): Up, Down and Reset buttons.
function HeightDialog({ token, onClose }) {
  const t = useT();
  return (
    <Dialog title={t('Height: {name}', { name: token.name })} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <HeightControl token={token} />
        <button className={btn} data-testid="height-close" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
    </Dialog>
  );
}

function Ping({ ping, unit }) {
  return (
    <circle cx={ping.x} cy={ping.y} r={unit * 0.6} fill="none" stroke="#fbbf24" strokeWidth={unit * 0.15} className="battle-ping" />
  );
}

export default function BattleView() {
  const t = useT();
  const { identity, stage, toast } = useApp();
  const isGm = identity.role === 'gm';
  const tools = isGm || identity.role === 'display';
  // A player drags and opens the menu for their own character only; the GM and the Display for everyone.
  const isOwn = (tk) => identity.role === 'player' && tk.ownerKind === 'character' && tk.ownerId === identity.characterId;
  const canDragToken = (tk) => tools || isOwn(tk);
  const canOpenMenu = (tk) => tools || isOwn(tk);
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
  // Area tool toggles (only here, on the Battle screen): make the area from the token the press starts on, include that token (its "self")
  // among the area's characters, and let the area follow that token when it moves.
  const [fromToken, setFromToken] = useState(true);
  const [includeSelf, setIncludeSelf] = useState(false);
  const [follow, setFollow] = useState(false);
  const [moveMode, setMoveMode] = useState(false); // Area tool: "Move" (drag areas around, turn the selected one with the wheel)
  const [selArea, setSelArea] = useState(null); // the area selected in Move mode
  const [edit, setEdit] = useState(null); // { id, x, y, angle }: an area being moved or turned, until the server has it
  const editRef = useRef(null);
  const editTimer = useRef(null);
  const moveDrag = useRef(null); // { id, offX, offY }
  const [iconPct] = useSetting('statusIconSize'); // status icons on tokens, % of one square (setting)
  const [deadzone] = useSetting('deadzone'); // times the area's size from where the drag began (setting)
  const [natural, setNatural] = useState({ w: 0, h: 0 }); // the battle picture's own size in pixels
  const [gridOpen, setGridOpen] = useState(false);
  const [draft, setDraft] = useState(null); // in-progress stroke, ruler or template
  const [pings, setPings] = useState([]);
  const [menu, setMenu] = useState(null);
  const [settings, setSettings] = useState(null);
  const [drag, setDrag] = useState(null); // { id, u, v } a token being dragged (picture fractions)
  const [drawMode, setDrawMode] = useState('pen'); // 'pen' | 'eraser'
  const [heightFor, setHeightFor] = useState(null); // id of the token whose height is being set
  const erasing = useRef({ busy: false, pending: null, last: null });

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

  const menuToken = menu && battle?.tokens.find((tk) => tk.id === menu.id);
  const openHeight = () => {
    setHeightFor(menu.id);
    setMenu(null);
  };

  // Picture fractions under a pointer.
  function toFractions(e) {
    const r = mapRef.current.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  }
  const inside = ({ u, v }) => u >= 0 && u <= 1 && v >= 0 && v <= 1;

  // ---- tools on the map surface ------------------------------------------------

  // The eraser rubs out parts of drawings. Calls are sent one at a time, newest position last.
  const eraserRadius = () => width * 4; // picture widths
  function eraseAt(f) {
    const st = erasing.current;
    const r = eraserRadius();
    if (st.last && Math.hypot(f.u - st.last.u, (f.v - st.last.v) / aspect) < r / 3) return;
    st.last = f;
    st.pending = { x: f.u, y: f.v, r };
    if (st.busy) return;
    st.busy = true;
    (async () => {
      while (st.pending) {
        const args = st.pending;
        st.pending = null;
        await call('mark:erase', args);
      }
      st.busy = false;
    })();
  }
  // ---- Move mode of the Area tool ---------------------------------------------------------------
  const isMove = !!tools && tool === 'template' && moveMode;
  const saveEdit = (now) => {
    clearTimeout(editTimer.current);
    const run = async () => {
      editTimer.current = null;
      const v = editRef.current;
      if (!v) return;
      const r = await call('mark:update', { id: v.id, x: v.x, y: v.y, angle: v.angle });
      if (!r.ok) toast(r.error);
      if (!editTimer.current && !moveDrag.current) {
        editRef.current = null;
        setEdit(null);
      }
    };
    if (now) run();
    else editTimer.current = setTimeout(run, 150);
  };
  const shown = (m) => (edit?.id === m.id ? { ...m, ...edit } : m);
  const areaMark = (id) => battle?.marks.find((m) => m.id === id && m.kind === 'template');
  function areaDown(e, m) {
    if (!isMove || e.button === 2) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const f = toFractions(e);
    const cur = shown(m);
    moveDrag.current = { id: m.id, offX: (f.u - battle.grid.ox) / battle.grid.cell - cur.x, offY: (f.v - battle.grid.oy) / (battle.grid.cell * aspect) - cur.y, moved: false };
    setSelArea(m.id);
  }
  // Ctrl + wheel turns the selected area by 1 degree, Shift + wheel by 15 (the wheel up turns it counter-clockwise).
  useEffect(() => {
    if (!isMove || selArea == null) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.shiftKey) return;
      const m = areaMark(selArea);
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      const d = e.deltaY || e.deltaX;
      if (!d) return;
      const cur = editRef.current?.id === m.id ? editRef.current : { id: m.id, x: m.x, y: m.y, angle: m.angle };
      const next = { ...cur, angle: (((cur.angle + Math.sign(d) * (e.ctrlKey ? 1 : 15)) % 360) + 360) % 360 };
      editRef.current = next;
      setEdit(next);
      saveEdit(false);
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // The size of the area being made: the number of squares, plus (size - 1) when it is made from a token (at most 60).
  const draftSize = (d) => Math.min(60, tsize + (d?.bonus ?? 0));

  function surfaceDown(e) {
    if (tools && tool === 'template' && moveMode) {
      // A press on the empty map in Move mode only drops the selection.
      if (e.button !== 2) setSelArea(null);
      return;
    }
    // Erase works by clicking the marks themselves, so the map must not capture the pointer.
    if (!tools || tool === 'select' || tool === 'erase' || !ready || e.button === 2) return;
    const f = toFractions(e);
    if (!inside(f)) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tool === 'ping') {
      call('battle:ping', { x: f.u, y: f.v });
    } else if (tool === 'draw' && drawMode === 'eraser') {
      erasing.current.last = null;
      setDraft({ kind: 'erase', u: f.u, v: f.v });
      eraseAt(f);
    } else if (tool === 'draw') {
      setDraft({ kind: 'draw', points: [[f.u, f.v]] });
    } else if (tool === 'ruler') {
      const c = cellAt(f.u, f.v, battle.grid, aspect);
      setDraft({ kind: 'ruler', a: c, b: c });
    } else if (tool === 'template') {
      let cx = Math.round(((f.u - battle.grid.ox) / battle.grid.cell) * 2) / 2;
      let cy = Math.round(((f.v - battle.grid.oy) / (battle.grid.cell * aspect)) * 2) / 2;
      // From Token: a press inside the bounds of any token locks the area to that token: its start is the token's centre, the token is
      // the area's "self", and the area is bigger by (size - 1) squares so a big token reaches as far past its edge as a small one.
      let self = null;
      let bonus = 0;
      if (fromToken) {
        const c = cellAt(f.u, f.v, battle.grid, aspect);
        const tk = battle.tokens.find((x) => c.col >= x.col && c.col < x.col + x.size && c.row >= x.row && c.row < x.row + x.size);
        if (tk) {
          cx = tk.col + tk.size / 2;
          cy = tk.row + tk.size / 2;
          self = tk.id;
          bonus = tk.size - 1;
        }
      }
      setDraft({ kind: 'template', x: cx, y: cy, angle: 0, sx: e.clientX, sy: e.clientY, self, bonus });
    }
  }
  function surfaceMove(e) {
    const md = moveDrag.current;
    if (md) {
      const f = toFractions(e);
      const m = areaMark(md.id);
      if (!m) return;
      const x = Math.round(((f.u - battle.grid.ox) / battle.grid.cell - md.offX) * 2) / 2;
      const y = Math.round(((f.v - battle.grid.oy) / (battle.grid.cell * aspect) - md.offY) * 2) / 2;
      const cur = editRef.current?.id === m.id ? editRef.current : { id: m.id, x: m.x, y: m.y, angle: m.angle };
      if (x !== cur.x || y !== cur.y) {
        md.moved = true;
        editRef.current = { ...cur, x, y };
        setEdit(editRef.current);
      }
      return;
    }
    if (!draft) return;
    const f = toFractions(e);
    if (draft.kind === 'draw') {
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot((f.u - last[0]) * aspect, f.v - last[1]) * 1 > 0.004 && inside(f) && draft.points.length < 500) {
        setDraft({ ...draft, points: [...draft.points, [f.u, f.v]] });
      }
    } else if (draft.kind === 'erase') {
      setDraft({ ...draft, u: f.u, v: f.v });
      if (inside(f)) eraseAt(f);
    } else if (draft.kind === 'ruler') {
      setDraft({ ...draft, b: cellAt(f.u, f.v, battle.grid, aspect) });
    } else if (draft.kind === 'template') {
      const dx = e.clientX - draft.sx;
      const dy = e.clientY - draft.sy;
      // The Deadzone: farther than `deadzone` times the area's size from where it began. Letting go there cancels it.
      const o = cellToUnits(draft.x, draft.y, battle.grid, aspect);
      const p = toUnits(f.u, f.v, aspect);
      const dead = Math.hypot(p.x - o.x, p.y - o.y) > deadzone * draftSize(draft) * unit;
      // The direction: from where the press began, or from the token's centre for an area locked to a token.
      const aim = draft.self != null ? (Math.hypot(p.x - o.x, p.y - o.y) > unit * 0.3 ? (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI : null) : Math.hypot(dx, dy) > 8 ? (Math.atan2(dy, dx) * 180) / Math.PI : null;
      setDraft({ ...draft, dead, ...(aim != null ? { angle: aim } : {}) });
    }
  }
  async function surfaceUp() {
    if (moveDrag.current) {
      const md = moveDrag.current;
      moveDrag.current = null;
      if (md.moved) saveEdit(true);
      return;
    }
    const d = draft;
    setDraft(null);
    if (!d || d.kind === 'erase') return;
    if (d.kind === 'draw') {
      const pts = d.points.length >= 2 ? d.points : [d.points[0], [d.points[0][0] + 0.001, d.points[0][1]]];
      const r = await call('mark:add', { kind: 'draw', data: { color, width: Math.round(width * 1000), points: pts } });
      if (!r.ok) toast(r.error);
    } else if (d.kind === 'template') {
      if (d.dead) return; // released in the Deadzone: the area is not created
      const r = await call('mark:add', { kind: 'template', data: { shape, x: d.x, y: d.y, size: draftSize(d), angle: d.angle, color, selfTokenId: d.self, includeSelf, follow: follow && d.self != null } });
      if (!r.ok) toast(r.error);
    }
  }

  // ---- dragging tokens (GM and Display) -------------------------------------------
  const dragState = useRef(null);
  function tokenDown(e, tk) {
    if (e.button === 2) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragState.current = { id: tk.id, x: e.clientX, y: e.clientY, moved: false };
  }
  function tokenMove(e, tk) {
    const d = dragState.current;
    if (!d || d.id !== tk.id || !canDragToken(tk)) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
    d.moved = true;
    const f = toFractions(e);
    setDrag({ id: tk.id, u: f.u, v: f.v });
  }
  async function tokenUp(e, tk) {
    const d = dragState.current;
    dragState.current = null;
    if (!d || d.id !== tk.id) return;
    if (d.moved && canDragToken(tk)) {
      const f = toFractions(e);
      setDrag(null);
      const cell = dropCell(f.u, f.v, tk.size, battle.grid, aspect, battle.cols, battle.rows);
      const r = await call('battle:place', { id: tk.id, ...cell });
      if (!r.ok) toast(r.error);
    } else if (!d.moved && canOpenMenu(tk)) {
      setMenu({ id: tk.id, anchor: e.currentTarget });
    }
  }

  const cellPx = (v) => `${v * 100}%`;
  const tokenBox = (tk) => {
    const pos = drag?.id === tk.id ? dropCell(drag.u, drag.v, tk.size, battle.grid, aspect, battle.cols, battle.rows) : { col: tk.col, row: tk.row };
    return {
      left: cellPx(battle.grid.ox + pos.col * battle.grid.cell),
      top: cellPx(battle.grid.oy + pos.row * battle.grid.cell * aspect),
      width: cellPx(tk.size * battle.grid.cell),
      height: cellPx(tk.size * battle.grid.cell * aspect),
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
  // While an area is being drawn, the characters that would be inside it are lit up (gone again once it is created).
  const inDraft =
    draft?.kind === 'template' && !draft.dead && battle
      ? new Set(membersOf({ shape, x: draft.x, y: draft.y, size: draftSize(draft), angle: draft.angle, selfTokenId: draft.self, includeSelf }, battle.tokens, battle.grid, aspect).map((tk) => tk.id))
      : null;

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
            <img src={imageUrl(battle.imageId)} alt="" draggable={false} className="absolute inset-0 h-full w-full" data-testid="battle-background" onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />

            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 1 ${1 / aspect}`}
              data-testid="battle-overlay"
              style={{ pointerEvents: eraseMode || isMove ? 'auto' : 'none' }}
            >
              {battle.showGrid && (
                <g stroke="#ffffff" strokeOpacity={gridOpen ? 0.7 : 0.28} strokeWidth={unit * 0.03} data-testid="battle-grid">
                  {gridLines}
                </g>
              )}
              {battle.marks
                .filter((m) => m.kind === 'template')
                .map((original) => {
                  const m = shown(original);
                  const sh = templateShape(m, battle.grid, aspect);
                  const common = {
                    key: m.id,
                    fill: m.color,
                    fillOpacity: selArea === m.id && isMove ? 0.45 : 0.3,
                    stroke: selArea === m.id && isMove ? '#ffffff' : m.color,
                    strokeWidth: unit * (selArea === m.id && isMove ? 0.1 : 0.06),
                    'data-testid': 'battle-template',
                    'data-selected': selArea === m.id && isMove ? 'true' : 'false',
                    'data-angle': m.angle,
                    'data-x': m.x,
                    'data-y': m.y,
                    style: eraseMode ? { cursor: 'pointer', pointerEvents: 'all' } : isMove ? { cursor: 'move', pointerEvents: 'all' } : undefined,
                    onClick: eraseMode ? () => call('mark:remove', { id: m.id }) : undefined,
                    onPointerDown: isMove ? (e) => areaDown(e, original) : undefined,
                  };
                  if (sh.type === 'circle') return <circle {...common} cx={sh.cx} cy={sh.cy} r={sh.r} />;
                  if (sh.type === 'rect') return <rect {...common} x={sh.x} y={sh.y} width={sh.size} height={sh.size} />;
                  if (sh.type === 'polygon') return <polygon {...common} points={sh.points} />;
                  return <path {...common} d={sh.d} />;
                })}
              {battle.marks
                .filter((m) => m.kind === 'template')
                .map((original) => {
                  const m = shown(original);
                  const o = cellToUnits(m.x, m.y, battle.grid, aspect);
                  return (
                    <text key={`n${m.id}`} data-testid="battle-template-name" x={o.x} y={o.y} textAnchor="middle" dominantBaseline="central" fontSize={unit * 0.4} fill="#ffffff" stroke="#000000" strokeWidth={unit * 0.06} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                      {areaName(m, t)}
                    </text>
                  );
                })}
              {battle.marks
                .filter((m) => m.kind === 'draw')
                .map((m) => (
                  <g key={m.id}>
                  {eraseMode && (
                    // A wide invisible line so a thin drawing is easy to click.
                    <polyline
                      points={m.points.map((p) => `${p[0]},${p[1] / aspect}`).join(' ')}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(m.width / 1000, unit * 0.4)}
                      strokeLinecap="round"
                      style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                      onClick={() => call('mark:remove', { id: m.id })}
                    />
                  )}
                  <polyline
                    data-testid="battle-drawing"
                    points={m.points.map((p) => `${p[0]},${p[1] / aspect}`).join(' ')}
                    fill="none"
                    stroke={m.color}
                    strokeWidth={m.width / 1000}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'none' }}
                  />
                  </g>
                ))}
              {draft?.kind === 'erase' && (
                <circle cx={draft.u} cy={draft.v / aspect} r={eraserRadius()} fill="#ffffff" fillOpacity={0.15} stroke="#ffffff" strokeWidth={unit * 0.03} />
              )}
              {draft?.kind === 'draw' && (
                <polyline points={draft.points.map((p) => `${p[0]},${p[1] / aspect}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {draft?.kind === 'template' &&
                (() => {
                  const sh = templateShape({ shape, x: draft.x, y: draft.y, size: draftSize(draft), angle: draft.angle }, battle.grid, aspect);
                  const c = { fill: color, fillOpacity: draft.dead ? 0.08 : 0.25, stroke: color, strokeOpacity: draft.dead ? 0.4 : 1, strokeWidth: unit * 0.06, strokeDasharray: `${unit * 0.2}` };
                  const o = cellToUnits(draft.x, draft.y, battle.grid, aspect);
                  const R = deadzone * draftSize(draft) * unit;
                  return (
                    <g>
                      {/* The Deadzone: striped and half transparent, everything farther than R from where the drag began. */}
                      <defs>
                        <pattern id="deadzone-stripes" patternUnits="userSpaceOnUse" width={unit * 0.4} height={unit * 0.4} patternTransform="rotate(45)">
                          <rect width={unit * 0.2} height={unit * 0.4} fill="#ef4444" fillOpacity="0.5" />
                        </pattern>
                      </defs>
                      <path
                        data-testid="deadzone"
                        data-active={draft.dead ? 'true' : 'false'}
                        fillRule="evenodd"
                        fill="url(#deadzone-stripes)"
                        fillOpacity={draft.dead ? 1 : 0.6}
                        d={`M0 0H1V${1 / aspect}H0Z M${o.x - R} ${o.y} a${R} ${R} 0 1 0 ${2 * R} 0 a${R} ${R} 0 1 0 ${-2 * R} 0Z`}
                      />
                      {sh.type === 'circle' && <circle {...c} cx={sh.cx} cy={sh.cy} r={sh.r} />}
                      {sh.type === 'rect' && <rect {...c} x={sh.x} y={sh.y} width={sh.size} height={sh.size} />}
                      {sh.type === 'polygon' && <polygon {...c} points={sh.points} />}
                      {sh.type === 'path' && <path {...c} d={sh.d} />}
                    </g>
                  );
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

            {battle.tokens.map((tk) => (
              <div
                key={tk.id}
                data-testid="battle-token"
                data-name={tk.name}
                data-kind={tk.kind}
                data-hidden={tk.hidden ? 'true' : 'false'}
                data-col={tk.col}
                data-row={tk.row}
                data-size={tk.size}
                data-height={tk.height}
                data-targeted={tk.targetedBy.length > 0 ? 'true' : 'false'}
                data-no-pan
                className={`absolute select-none ${tk.hidden ? 'opacity-50' : ''} ${canDragToken(tk) && tool === 'select' ? 'cursor-grab' : ''}`}
                style={{ ...tokenBox(tk), zIndex: drag?.id === tk.id ? 20 : 5, pointerEvents: tool === 'select' || !tools ? 'auto' : 'none', touchAction: 'none' }}
                onPointerDown={(e) => tokenDown(e, tk)}
                onPointerMove={(e) => tokenMove(e, tk)}
                onPointerUp={(e) => tokenUp(e, tk)}
                onPointerCancel={() => {
                  dragState.current = null;
                  setDrag(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (canOpenMenu(tk)) setMenu({ id: tk.id, anchor: e.currentTarget });
                }}
              >
                <div
                  className="absolute inset-[6%] overflow-hidden rounded-full bg-black/35"
                  style={{ boxShadow: `0 0 0 ${Math.max(2, ppu * unit * 0.06)}px ${tk.targetedBy.length ? '#fbbf24' : RING[tk.kind]}` }}
                >
                  <img src={imageUrl(tk.imageId)} alt={tk.name} draggable={false} className="h-full w-full object-contain" />
                </div>
                {tk.targetedBy.length > 0 && <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full border-2 border-dashed border-amber-300" />}
                {inDraft?.has(tk.id) && <div data-testid="token-in-area" className="pointer-events-none absolute -inset-1 rounded-full border-4 border-cyan-300 shadow-[0_0_14px_6px_rgba(103,232,249,0.85)]" />}
                {tk.height > 0 && (
                  <div
                    data-testid="token-height"
                    className="pointer-events-none absolute bottom-full left-1/2 mb-px -translate-x-1/2 whitespace-nowrap rounded bg-sky-700/90 px-1 text-white"
                    style={{ fontSize: `calc(var(--map-w) * ${unit * 0.32})` }}
                  >
                    {t('+{n} sp.', { n: tk.height })}
                  </div>
                )}
                <TokenStatuses statuses={tk.statuses} effects={tk.effects} size={(iconPct / 100) / tk.size} />
                <div
                  data-testid="token-name"
                  className="pointer-events-none absolute left-1/2 top-full mt-px -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-white"
                  style={{ fontSize: `calc(var(--map-w) * ${unit * 0.32})` }}
                >
                  {tk.name}
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
                ? t('No scene is active. Open Scenes to start one.')
                : t('Waiting for the GM to start a scene.')
              : isGm
                ? t('This scene has no battle map yet. Open Scenes, choose the scene and add a Battle map.')
                : t('The GM has not set up a battle map for this scene yet.')}
          </p>
        </div>
      )}

      {ruler && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1 text-lg" data-testid="ruler-distance">
          {t('{n} squares', { n: distanceSquares(ruler.a, ruler.b) })}
        </div>
      )}

      {/* Overlays live outside the zoomed world so they stay put. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2" data-no-pan>
        <div className="pointer-events-auto flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
          <button className="h-10 w-10 rounded-full active:bg-white/20" aria-label={t('Zoom out')} data-testid="zoom-out" onClick={() => zoomBy(0.8)}>
            -
          </button>
          <button className="h-10 rounded-full px-3 text-xs active:bg-white/20" data-testid="zoom-reset" onClick={reset}>
            {Math.round(view.scale * 100)}%
          </button>
          <button className="h-10 w-10 rounded-full active:bg-white/20" aria-label={t('Zoom in')} data-testid="zoom-in" onClick={() => zoomBy(1.25)}>
            +
          </button>
        </div>
      </div>

      {ready && <CombatBar battle={battle} />}

      {tools && ready && (
        <>
          {/* The tool bar never changes; a tool's options open in their own panel beside it. */}
          <div
            className="absolute left-2 top-1/2 z-20 flex max-h-[80%] w-24 -translate-y-1/2 flex-col gap-1 overflow-y-auto rounded-xl bg-black/55 p-1 backdrop-blur"
            data-no-pan
            data-testid="battle-tools"
          >
            {[
              ['select', t('Move')],
              ['draw', t('Draw')],
              ['ping', t('Ping')],
              ['ruler', t('Ruler')],
              ['template', t('Area')],
              ['erase', t('Erase')],
            ].map(([id, label]) => (
              <button
                key={id}
                data-testid={`tool-${id}`}
                aria-pressed={tool === id}
                className={`min-h-10 rounded-lg px-3 text-sm ${tool === id ? 'bg-violet-700' : 'bg-white/10 active:bg-white/20'}`}
                onClick={() => {
                  setTool(id);
                  if (id !== 'template') {
                    setMoveMode(false);
                    setSelArea(null);
                  }
                }}
              >
                {label}
              </button>
            ))}
            <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" aria-pressed={battle.showGrid} data-testid="toggle-grid" onClick={() => call('scene:show_grid', { id: scene.id, show: !battle.showGrid })}>
              {battle.showGrid ? t('Grid on') : t('Grid off')}
            </button>
            {isGm && (
              <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" data-testid="open-grid" onClick={() => setGridOpen(!gridOpen)}>
                {t('Set grid')}
              </button>
            )}
          </div>

          {(tool === 'draw' || tool === 'template' || tool === 'erase') && (
            <div
              className="absolute left-28 top-1/2 z-20 flex max-h-[80%] w-44 -translate-y-1/2 flex-col gap-2 overflow-y-auto rounded-xl bg-black/55 p-2 text-xs backdrop-blur"
              data-no-pan
              data-testid="tool-options"
            >
              {tool === 'draw' && (
                <div className="flex gap-1" role="radiogroup" aria-label={t('Drawing mode')}>
                  {[
                    ['pen', t('Pen')],
                    ['eraser', t('Eraser')],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={drawMode === id}
                      data-testid={`draw-mode-${id}`}
                      className={`min-h-9 flex-1 rounded-lg ${drawMode === id ? 'bg-violet-700' : 'bg-white/10'}`}
                      onClick={() => setDrawMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {((tool === 'draw' && drawMode === 'pen') || tool === 'template') && (
                <div className="flex flex-wrap gap-1" data-testid="tool-colors">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={t('Colour {c}', { c })}
                      aria-pressed={color === c}
                      className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              )}
              {tool === 'draw' && (
                <div className="flex gap-1">
                  {[0.002, 0.004, 0.008].map((wd) => (
                    <button key={wd} aria-pressed={width === wd} aria-label={drawMode === 'eraser' ? t('Eraser size') : t('Line width')} className={`min-h-8 flex-1 rounded ${width === wd ? 'bg-violet-700' : 'bg-white/10'}`} onClick={() => setWidth(wd)}>
                      {wd === 0.002 ? 'S' : wd === 0.004 ? 'M' : 'L'}
                    </button>
                  ))}
                </div>
              )}
              {tool === 'draw' && (
                <>
                  <span className="opacity-70">{drawMode === 'eraser' ? t('Drag over a drawing to rub it out.') : t('Press and drag to draw.')}</span>
                  <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" data-testid="clear-drawings" onClick={() => call('mark:clear', { kind: 'draw' })}>
                    {t('Clean')}
                  </button>
                </>
              )}
              {tool === 'template' && (
                <>
                  <select className="min-h-9 rounded bg-white/10 px-1" aria-label={t('Shape')} data-testid="template-shape" value={shape} onChange={(e) => setShape(e.target.value)}>
                    <option value="circle">{t('Circle')}</option>
                    <option value="cone">{t('Cone')}</option>
                    <option value="arc">{t('Arc')}</option>
                    <option value="line">{t('Line')}</option>
                    <option value="square">{t('Square')}</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <span>{t('Squares')}</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      aria-label={t('Template size')}
                      data-testid="template-size"
                      className="min-h-9 w-12 rounded bg-black/40 px-1 text-center"
                      value={tsize}
                      onChange={(e) => setTsize(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                    />
                    {/* Arrows to the right of the field, big enough to press on a touch screen. */}
                    <div className="flex flex-col gap-0.5">
                      {[
                        ['up', 1, 'M4 10l4-4 4 4'],
                        ['down', -1, 'M4 6l4 4 4-4'],
                      ].map(([id, step, path]) => (
                        <button
                          key={id}
                          type="button"
                          aria-label={id === 'up' ? t('More squares') : t('Fewer squares')}
                          data-testid={`template-size-${id}`}
                          className="flex h-6 w-10 items-center justify-center rounded bg-white/15 active:bg-white/30"
                          onClick={() => setTsize(Math.max(1, Math.min(60, tsize + step)))}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={path} />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" aria-pressed={moveMode} className={`min-h-9 rounded-lg px-3 text-sm ${moveMode ? 'bg-violet-700' : 'bg-white/10 active:bg-white/20'}`} data-testid="template-move" onClick={() => { setMoveMode(!moveMode); setSelArea(null); }}>
                    {t('Move')}
                  </button>
                  {!moveMode && (
                    <>
                      {[
                        ['from-token', t('From Token'), fromToken, setFromToken],
                        ['include-self', t('Include Self'), includeSelf, setIncludeSelf],
                        ['follow', t('Follow Token'), follow, setFollow],
                      ].map(([id, text, on, set]) => (
                        <button key={id} type="button" role="switch" aria-checked={on} className={`min-h-9 rounded-lg px-3 text-sm ${on ? 'bg-violet-700' : 'bg-white/10 active:bg-white/20'}`} data-testid={`template-${id}`} onClick={() => set(!on)}>
                          {text}
                        </button>
                      ))}
                    </>
                  )}
                  <span className="opacity-70">
                    {moveMode ? t('Drag an area to move it. With an area selected, Ctrl + mouse wheel turns it by 1 degree and Shift + mouse wheel by 15.') : fromToken ? t('Press on a token to make the area from it, drag for the direction. Press elsewhere to start it there.') : t('Press for the start, drag for the direction.')}
                  </span>
                  <button className="min-h-9 rounded-lg bg-white/10 px-3 text-sm" data-testid="clear-templates" onClick={() => call('mark:clear', { kind: 'template' })}>
                    {t('Clean')}
                  </button>
                </>
              )}
              {tool === 'erase' && <span className="opacity-70">{t('Click a drawing or an area to remove it.')}</span>}
            </div>
          )}
        </>
      )}

      {isGm && gridOpen && ready && <GridPanel scene={scene} battle={battle} natural={natural} onClose={() => setGridOpen(false)} />}

      {menuToken && (
        <TokenMenu
          anchor={menu.anchor}
          containerRef={ref}
          onClose={() => setMenu(null)}
          options={
            // The GM and the Display get every circle; a player only Set Height, for their own character.
            tools
              ? [
                  {
                    key: 'settings',
                    label: t('Token Settings'),
                    testId: 'menu-settings',
                    onClick: () => {
                      setSettings(menuToken);
                      setMenu(null);
                    },
                  },
                  {
                    key: 'hide',
                    label: menuToken.hidden ? t('Reveal') : t('Hide'),
                    testId: 'menu-hide',
                    onClick: async () => {
                      await call('battle:update', { id: menuToken.id, hidden: !menuToken.hidden });
                      setMenu(null);
                    },
                  },
                  { key: 'height', label: t('Set Height'), testId: 'menu-height', onClick: openHeight },
                  {
                    key: 'remove',
                    label: t('Remove'),
                    testId: 'menu-remove',
                    onClick: async () => {
                      const r = await call('battle:remove', { id: menuToken.id });
                      if (!r.ok) toast(r.error);
                      setMenu(null);
                    },
                  },
                ]
              : [{ key: 'height', label: t('Set Height'), testId: 'menu-height', onClick: openHeight }]
          }
        />
      )}
      {heightFor != null && battle.tokens.find((tk) => tk.id === heightFor) && (
        <HeightDialog token={battle.tokens.find((tk) => tk.id === heightFor)} onClose={() => setHeightFor(null)} />
      )}
      {settings && <TokenSettings token={battle.tokens.find((tk) => tk.id === settings.id) ?? settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
