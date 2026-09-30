import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { imageUrl } from '../../lib/image.js';
import { useZoomPan } from '../../lib/useZoomPan.js';
import Dialog, { btn, btnDanger, input } from '../Dialog.jsx';
import { usePictures } from './Pictures.jsx';
import { CastDrawer, ScenesDrawer } from './SceneDrawers.jsx';

// The scene: a fullscreen picture with characters standing along the bottom in
// the style of a light novel. PCs stand on the left, NPCs on the right.
//
//  - Display Screen and desktop players see it without hidden characters (the
//    server never sends them). The GM sees hidden characters half-transparent.
//  - Everyone can zoom and pan their own view. The GM and the Display can drag a
//    character to reorder its side; the GM can also open a character's menu.

const DRAG_THRESHOLD = 6;

function Figure({ s, index, canDrag, menuOpen, onMenu, onDragEnd, zoomRef }) {
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  function down(e) {
    if (e.button === 2) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, moved: false };
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientX - d.x;
    if (!d.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
    if (!canDrag) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    setDx(delta / zoomRef.current.scale);
  }
  function up(e) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && canDrag) {
      onDragEnd(s, e.clientX);
      setDx(0);
      setDragging(false);
    } else if (!d.moved) {
      onMenu?.(s, e.currentTarget);
    }
  }

  const from = s.side === 'left' ? '-40%' : '40%';
  return (
    <figure
      data-no-pan
      data-testid="stage-figure"
      data-summon-id={s.id}
      data-name={s.name}
      data-hidden={s.hidden ? 'true' : 'false'}
      className={`relative flex h-full shrink-0 touch-none select-none flex-col items-center ${canDrag ? 'cursor-grab' : ''} ${
        s.hidden ? 'opacity-50' : ''
      }`}
      style={{
        height: `${s.scale * 100}%`,
        transform: entered ? `translateX(${dx}px)` : `translateX(${from})`,
        opacity: entered ? undefined : 0,
        transition: dragging ? 'none' : 'transform 0.5s ease-out, opacity 0.5s ease-out',
        zIndex: dragging || menuOpen ? 20 : index,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        setDx(0);
        setDragging(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu?.(s, e.currentTarget);
      }}
    >
      <img
        src={imageUrl(s.imageId)}
        alt={s.name}
        draggable={false}
        className="min-h-0 flex-1 object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
      />
      <figcaption
        data-testid="name-plaque"
        className="mt-1 max-w-full shrink-0 truncate rounded bg-black/65 px-3 py-0.5 text-sm text-white"
      >
        {s.name}
      </figcaption>
    </figure>
  );
}

// The half-transparent circles next to a character (Foundry style).
function TokenMenu({ s, anchor, containerRef, onSettings, onToggleHidden, onClose }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const onLeft = r.left + r.width / 2 < box.left + box.width / 2;
    setPos({
      top: Math.min(Math.max(r.top - box.top + r.height / 2 - 60, 8), box.height - 130),
      left: onLeft ? Math.min(r.right - box.left + 8, box.width - 80) : Math.max(r.left - box.left - 72, 8),
    });
  }, [anchor, containerRef, s.id]);
  if (!pos) return null;
  const circle =
    'flex h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-black/45 text-center text-xs font-medium leading-tight text-white backdrop-blur active:bg-black/70';
  return (
    <>
      <div className="absolute inset-0 z-30" data-testid="token-menu-backdrop" onPointerDown={onClose} />
      <div className="absolute z-40 flex flex-col gap-2" style={pos} data-testid="token-menu">
        <button className={circle} data-testid="menu-settings" onClick={onSettings}>
          Token Settings
        </button>
        <button className={circle} data-testid="menu-hide" onClick={onToggleHidden}>
          {s.hidden ? 'Reveal' : 'Hide'}
        </button>
      </div>
    </>
  );
}

function TokenSettings({ s, onClose }) {
  const { toast } = useApp();
  const owner = s.ownerKind === 'character' ? { characterId: s.ownerId } : { tempNpcId: s.ownerId };
  const pictures = usePictures(owner);
  const [scale, setScale] = useState(s.scale);

  async function update(patch) {
    const r = await call('stage:update', { id: s.id, ...patch });
    if (!r.ok) toast(r.error);
    return r;
  }

  return (
    <Dialog title={`Token Settings: ${s.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm opacity-70">Picture</div>
          <div className="grid grid-cols-4 gap-2">
            {pictures?.map((p) => (
              <button
                key={p.id}
                data-testid="pick-picture"
                aria-label={p.name || 'Picture'}
                aria-pressed={p.id === s.pictureId}
                className={`flex h-20 items-center justify-center overflow-hidden rounded bg-white/5 ${p.id === s.pictureId ? 'ring-2 ring-violet-500' : ''}`}
                onClick={() => update({ pictureId: p.id })}
              >
                <img src={imageUrl(p.imageId)} alt="" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Size: {scale.toFixed(2)}
          <input
            type="range"
            min="0.3"
            max="2"
            step="0.05"
            value={scale}
            data-testid="scale-slider"
            onChange={(e) => setScale(Number(e.target.value))}
            onPointerUp={() => update({ scale })}
            onKeyUp={() => update({ scale })}
            onBlur={() => update({ scale })}
          />
        </label>
        <div className="flex justify-between gap-2">
          <button
            className={btnDanger}
            data-testid="dismiss"
            onClick={async () => {
              const r = await call('stage:dismiss', { id: s.id });
              if (!r.ok) toast(r.error);
              onClose();
            }}
          >
            Remove from stage
          </button>
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// `chrome`: false on the Display Screen (no drawers). `onExit`: how the Display gets back to the picker.
export default function ScenePage({ chrome = true, onExit }) {
  const { identity, stage } = useApp();
  const isGm = identity.role === 'gm';
  const canDrag = isGm || identity.role === 'display';
  const { ref, view, bind, zoomBy, reset } = useZoomPan();
  const viewRef = useRef(view);
  viewRef.current = view;
  const figures = useRef(new Map());
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [settings, setSettings] = useState(null);
  const [drawer, setDrawer] = useState(null); // 'cast' | 'scenes' | null

  const summons = stage.summons;
  const bySide = (side) => summons.filter((x) => x.side === side);
  const menuTarget = menu && summons.find((x) => x.id === menu.id);

  // Drop: put the dragged figure where its centre now is, among its side's figures.
  function onDragEnd(s, clientX) {
    const others = bySide(s.side).filter((x) => x.id !== s.id);
    let index = 0;
    for (const o of others) {
      const el = figures.current.get(o.id);
      const r = el?.getBoundingClientRect();
      if (!r) continue;
      const centre = r.left + r.width / 2;
      // The right side is laid out right to left, so its order runs the other way.
      if (s.side === 'left' ? clientX > centre : clientX < centre) index += 1;
    }
    const ids = others.map((x) => x.id);
    ids.splice(index, 0, s.id);
    call('stage:reorder', { side: s.side, ids });
  }

  function renderSide(side) {
    const list = bySide(side);
    return (
      <div
        className={`absolute bottom-0 flex h-[76%] max-w-[48%] items-end gap-2 px-4 pb-16 ${side === 'left' ? 'left-0' : 'right-0 flex-row-reverse'}`}
        data-testid={`side-${side}`}
      >
        {list.map((s, i) => (
          <div key={s.id} ref={(el) => (el ? figures.current.set(s.id, el) : figures.current.delete(s.id))} className="h-full">
            <Figure
              s={s}
              index={i}
              canDrag={canDrag}
              zoomRef={viewRef}
              menuOpen={menu?.id === s.id}
              onDragEnd={onDragEnd}
              onMenu={isGm ? (sum, anchor) => setMenu({ id: sum.id, anchor }) : undefined}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-black"
      data-testid="scene-page"
      {...bind}
    >
      <div
        className="absolute inset-0 origin-top-left"
        data-testid="scene-world"
        data-pan-surface
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {stage.scene?.imageId ? (
          <img src={imageUrl(stage.scene.imageId)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" data-testid="scene-background" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black" />
        )}
        {stage.scene && (
          <>
            {renderSide('left')}
            {renderSide('right')}
          </>
        )}
      </div>

      {!stage.scene && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" data-testid="no-scene">
          <p className="text-lg opacity-70">{isGm ? 'No scene is active. Open Scenes to start one.' : 'Waiting for the GM to start a scene.'}</p>
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

      {isGm && chrome && (
        <div className="absolute inset-x-0 top-2 flex justify-between px-2" data-no-pan>
          <button className={`${btn} bg-black/50 backdrop-blur`} data-testid="open-cast" onClick={() => setDrawer('cast')}>
            Cast
          </button>
          <div className="self-center rounded-full bg-black/50 px-3 py-1 text-sm backdrop-blur" data-testid="scene-title">
            {stage.scene?.name ?? 'No scene'}
          </div>
          <button className={`${btn} bg-black/50 backdrop-blur`} data-testid="open-scenes" onClick={() => setDrawer('scenes')}>
            Scenes
          </button>
        </div>
      )}

      {!chrome && onExit && (
        <button
          className="absolute left-2 top-2 rounded-full bg-black/40 px-3 py-1 text-xs opacity-30 transition-opacity hover:opacity-100 focus:opacity-100"
          data-no-pan
          data-testid="display-exit"
          onClick={onExit}
        >
          Switch
        </button>
      )}

      {menuTarget && (
        <TokenMenu
          s={menuTarget}
          anchor={menu.anchor}
          containerRef={ref}
          onClose={() => setMenu(null)}
          onSettings={() => {
            setSettings(menuTarget);
            setMenu(null);
          }}
          onToggleHidden={async () => {
            await call('stage:update', { id: menuTarget.id, hidden: !menuTarget.hidden });
            setMenu(null);
          }}
        />
      )}

      {settings && <TokenSettings s={summons.find((x) => x.id === settings.id) ?? settings} onClose={() => setSettings(null)} />}
      {drawer === 'cast' && <CastDrawer onClose={() => setDrawer(null)} />}
      {drawer === 'scenes' && <ScenesDrawer onClose={() => setDrawer(null)} />}
    </div>
  );
}
