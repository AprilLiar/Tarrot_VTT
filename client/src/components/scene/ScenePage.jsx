import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlayerSceneTools } from './PopOut.jsx';
import { useFocusRequest } from '../../lib/searchFocus.js';
import { StageView, call, useApp } from '../../AppContext.jsx';
import { imageUrl } from '../../lib/image.js';
import { useZoomPan } from '../../lib/useZoomPan.js';
import { useElementSize } from '../../lib/useElementSize.js';
import { useOpaqueBounds } from '../../lib/opaqueBounds.js';
import { setUiHidden, useApplyHideUi } from '../../lib/hideUi.js';
import Dialog, { btn, btnDanger, input } from '../Dialog.jsx';
import { usePictures } from './Pictures.jsx';
import { CastDrawer, ScenesDrawer } from './SceneDrawers.jsx';
import { SceneNotes } from './SceneNotes.jsx';
import { GmTools } from './GmTools.jsx';
import BattleView from './BattleView.jsx';
import { TokenMenu } from './TokenMenu.jsx';
import { TarotStar } from '../TarotStar.jsx';
import { useT } from '../../i18n.jsx';

// The scene: a fullscreen picture with characters standing on it in the style of a
// light novel. Each character has its own spot, given as fractions of the background
// picture (the picture is scaled to cover the screen), and can stand outside it.
//
//  - Display Screen and desktop players see it without hidden characters (the
//    server never sends them). The GM sees hidden characters half-transparent.
//  - Everyone can zoom and pan their own view. The GM and the Display can drag any
//    character anywhere, a player can drag their own PC; the GM can also open a menu.

const DRAG_THRESHOLD = 6;

const POS_MIN = -1;
const POS_MAX = 2;
const FIGURE_HEIGHT = 0.7; // of the picture's height, at size 1
const SILHOUETTE_NAME = '???'; // a silhouette is called this on every screen

// Where the visible character is drawn inside the figure (px, figure coordinates): the picture is fitted into the <img> box (centred,
// at the bottom), and only its non-transparent part counts. Until that is known, the whole <img> box.
function useHitBox(imgRef, url, loaded) {
  const bounds = useOpaqueBounds(url);
  const size = useElementSize(imgRef);
  const [hit, setHit] = useState(null);
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !size.w || !size.h) return;
    const box = { left: img.offsetLeft, top: img.offsetTop, width: size.w, height: size.h };
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!bounds || !nw || !nh) {
      setHit(box);
      return;
    }
    const k = Math.min(size.w / nw, size.h / nh);
    const rw = nw * k;
    const rh = nh * k;
    const rx = box.left + (size.w - rw) / 2;
    const ry = box.top + (size.h - rh);
    setHit({ left: rx + bounds.x0 * rw, top: ry + bounds.y0 * rh, width: (bounds.x1 - bounds.x0) * rw, height: (bounds.y1 - bounds.y0) * rh });
  }, [imgRef, bounds, size.w, size.h, loaded]);
  return hit;
}

// `stageBox`: the picture's size on screen (unzoomed). A figure is anchored at the middle of its feet.
// Only the rectangle around the visible character takes clicks and drags (cut-out pictures have wide transparent edges); the picture, the
// name plaque and the feet are drawn as before, and a click beside the character reaches the scene (or another figure) behind it.
function Figure({ s, spot, stageBox, canDrag, menuOpen, onMenu, zoomRef }) {
  const [pending, setPending] = useState(null); // { x, y } while dragging and until the server answers
  const drag = useRef(null);
  const [entered, setEntered] = useState(false);
  const [loaded, setLoaded] = useState(0); // bumps when the picture has loaded, so its own size is known
  const imgRef = useRef(null);
  const hit = useHitBox(imgRef, s.imageId ? imageUrl(s.imageId) : null, loaded);
  const { toast } = useApp();
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);
  // The server's answer replaces the local position.
  useEffect(() => {
    setPending(null);
  }, [s.x, s.y]);

  const clamp = (v) => Math.min(POS_MAX, Math.max(POS_MIN, v));
  function down(e) {
    if (e.button === 2) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { cx: e.clientX, cy: e.clientY, moved: false, x: spot.x, y: spot.y };
  }
  function at(e, d) {
    const k = zoomRef.current.scale;
    return {
      x: clamp(d.x + (e.clientX - d.cx) / k / (stageBox.w || 1)),
      y: clamp(d.y + (e.clientY - d.cy) / k / (stageBox.h || 1)),
    };
  }
  function move(e) {
    const d = drag.current;
    if (!d || !canDrag) return;
    if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPending(at(e, d));
  }
  async function up(e) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && canDrag) {
      const spot = at(e, d);
      setPending(spot);
      const r = await call('stage:move', { id: s.id, ...spot });
      if (!r.ok) {
        toast(r.error);
        setPending(null);
      }
    } else if (!d.moved) {
      onMenu?.(s, e.currentTarget);
    }
  }

  const pos = pending ?? spot;
  const dragging = !!drag.current?.moved;
  return (
    <figure
      data-no-pan
      data-testid="stage-figure"
      data-summon-id={s.id}
      data-name={s.name}
      data-silhouette={s.silhouette ? 'true' : 'false'}
      data-x={pos.x.toFixed(3)}
      data-y={pos.y.toFixed(3)}
      data-free={s.x != null}
      data-hidden={s.hidden ? 'true' : 'false'}
      className={`pointer-events-none absolute flex touch-none select-none flex-col items-center ${s.hidden ? 'opacity-50' : ''}`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        height: `${s.scale * FIGURE_HEIGHT * 100}%`,
        // An absolute box is as wide as the room it has left of its spot, so a figure near the right end would be squeezed smaller:
        // it is as wide as its content wherever it stands.
        width: 'max-content',
        transform: 'translate(-50%, -100%)',
        opacity: entered ? undefined : 0,
        transition: dragging || pending ? 'none' : 'opacity 0.5s ease-out',
        zIndex: dragging || menuOpen ? 1000 : undefined,
      }}
    >
      <figcaption
        data-testid="name-plaque"
        className="mb-1 max-w-full shrink-0 truncate rounded bg-black/65 px-3 py-0.5 text-sm text-white"
      >
        <span>{s.silhouette ? SILHOUETTE_NAME : s.name}</span>
        {s.tarot && !s.silhouette && <TarotStar characterId={s.ownerId} />}
      </figcaption>
      <img
        ref={imgRef}
        src={imageUrl(s.imageId)}
        alt={s.silhouette ? SILHOUETTE_NAME : s.name}
        draggable={false}
        onLoad={() => setLoaded((n) => n + 1)}
        className="min-h-0 flex-1 object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
        // A silhouette: every pixel of the picture fully black (its shape stays, its transparency too).
        style={s.silhouette ? { filter: 'brightness(0)' } : undefined}
      />
      {hit && (
        <div
          data-testid="figure-hit"
          className={`pointer-events-auto absolute touch-none ${canDrag ? 'cursor-grab' : ''}`}
          style={hit}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            drag.current = null;
            setPending(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onMenu?.(s, e.currentTarget);
          }}
        />
      )}
    </figure>
  );
}

function TokenSettings({ s, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const owner = s.ownerKind === 'character' ? { characterId: s.ownerId } : { tempNpcId: s.ownerId };
  const pictures = usePictures(owner);
  const [scale, setScale] = useState(s.scale);
  // The size belongs to the picture: it changes when the picture does, or when someone else resizes it.
  useEffect(() => {
    setScale(s.scale);
  }, [s.scale]);

  async function update(patch) {
    const r = await call('stage:update', { id: s.id, ...patch });
    if (!r.ok) toast(r.error);
    return r;
  }

  return (
    <Dialog title={t('Token Settings: {name}', { name: s.name })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm opacity-70">{t('Picture')}</div>
          <div className="grid grid-cols-4 gap-2">
            {pictures?.map((p) => (
              <button
                key={p.id}
                data-testid="pick-picture"
                aria-label={p.name || t('Picture')}
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
          {t('Size: {n}', { n: scale.toFixed(2) })}
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
          <span className="text-xs opacity-60">{t('The size is saved with the picture, for every scene.')}</span>
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
            {t('Remove from stage')}
          </button>
          <button className={btn} data-testid="reset-position" onClick={async () => {
              const r = await call('stage:move', { id: s.id, reset: true });
              if (!r.ok) toast(r.error);
            }}>
            {t('Reset position')}
          </button>
          <button className={btn} onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// `chrome`: false on the Display Screen (no drawers). `onExit`: how the Display gets back to the picker.
function SceneView() {
  const t = useT();
  const { identity, stage } = useApp();
  const isGm = identity.role === 'gm';
  const isDisplay = identity.role === 'display';
  const { ref, view, bind, zoomBy, reset } = useZoomPan();
  const viewRef = useRef(view);
  viewRef.current = view;
  const { w, h } = useElementSize(ref);
  const [nat, setNat] = useState(null); // the background picture's own size
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [settings, setSettings] = useState(null);

  const summons = stage.summons;
  const menuTarget = menu && summons.find((x) => x.id === menu.id);
  const canDragFigure = (sum) =>
    isGm || isDisplay || (identity.role === 'player' && sum.ownerKind === 'character' && sum.ownerId === identity.characterId);

  useEffect(() => {
    setNat(null);
  }, [stage.scene?.imageId]);

  // The picture is fitted to the screen as the scene says (shared/fits.js): Best Fit (all of it, black bars), Fill (covers the screen,
  // cropped) or Stretch (the screen's shape). Figures are placed on that picture.
  const fit = stage.scene?.fit ?? 'fit';
  const k = nat && w && h ? (fit === 'fill' ? Math.max(w / nat.w, h / nat.h) : Math.min(w / nat.w, h / nat.h)) : null;
  const box =
    k && fit !== 'stretch'
      ? { w: nat.w * k, h: nat.h * k, left: (w - nat.w * k) / 2, top: (h - nat.h * k) / 2 }
      : { w, h, left: 0, top: 0 };

  // A figure nobody has dragged yet stands in the visible part of the picture: PCs from the left,
  // everyone else from the right, one slot after another.
  const spotOf = (sum) => {
    if (sum.x != null && sum.y != null) return { x: sum.x, y: sum.y };
    const x0 = Math.max(0, -box.left / (box.w || 1));
    const x1 = Math.min(1, (w - box.left) / (box.w || 1));
    const y0 = Math.max(0, -box.top / (box.h || 1));
    const y1 = Math.min(1, (h - box.top) / (box.h || 1));
    const along = 0.1 + 0.09 * (sum.slot % 8);
    return {
      x: sum.side === 'left' ? x0 + (x1 - x0) * along : x1 - (x1 - x0) * along,
      y: y1 - (y1 - y0) * 0.04,
    };
  };

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
        data-fit={fit}
        data-pan-surface
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {stage.scene?.imageId ? (
          <img
            src={imageUrl(stage.scene.imageId)}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{ left: box.left, top: box.top, width: box.w || '100%', height: box.h || '100%' }}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            data-testid="scene-background"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black" />
        )}
        {stage.scene && (
          <div className="absolute" style={{ left: box.left, top: box.top, width: box.w, height: box.h }} data-testid="scene-stage">
            {summons.map((sum) => (
              <Figure
                key={sum.id}
                s={sum}
                spot={spotOf(sum)}
                stageBox={box}
                canDrag={canDragFigure(sum)}
                zoomRef={viewRef}
                menuOpen={menu?.id === sum.id}
                onMenu={isGm || isDisplay ? (x, anchor) => setMenu({ id: x.id, anchor }) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {!stage.scene && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" data-testid="no-scene">
          <p className="text-lg opacity-70">{isGm ? t('No scene is active. Open Scenes to start one.') : t('Waiting for the GM to start a scene.')}</p>
        </div>
      )}

      {/* Overlays live outside the zoomed world so they stay put. */}
      <div className="ui-chrome pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2" data-no-pan>
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

      {menuTarget && (
        <TokenMenu
          anchor={menu.anchor}
          containerRef={ref}
          onClose={() => setMenu(null)}
          options={[
            {
              key: 'settings',
              label: t('Token Settings'),
              testId: 'menu-settings',
              onClick: () => {
                setSettings(menuTarget);
                setMenu(null);
              },
            },
            {
              key: 'hide',
              label: menuTarget.hidden ? t('Reveal') : t('Hide'),
              testId: 'menu-hide',
              onClick: async () => {
                await call('stage:update', { id: menuTarget.id, hidden: !menuTarget.hidden });
                setMenu(null);
              },
            },
            {
              key: 'remove',
              label: t('Remove'),
              testId: 'menu-remove',
              onClick: async () => {
                await call('stage:dismiss', { id: menuTarget.id });
                setMenu(null);
              },
            },
          ]}
        />
      )}

      {settings && <TokenSettings s={summons.find((x) => x.id === settings.id) ?? settings} onClose={() => setSettings(null)} />}
    </div>
  );
}

// The GM's buttons over the picture (Cast, Scenes, Scene/Battle) and the Display's way out.
function SceneChrome({ chrome, onExit }) {
  const t = useT();
  const { identity, stage } = useApp();
  const isGm = identity.role === 'gm';
  const [drawer, setDrawer] = useState(null); // 'cast' | 'scenes' | null
  // A scene found with Search opens the Scenes list.
  const focus = useFocusRequest();
  useEffect(() => {
    if (focus?.scenes && isGm) setDrawer('scenes');
  }, [focus, isGm]);
  const battle = stage.mode === 'battle';
  return (
    <>
      {isGm && chrome && (
        <div className="ui-chrome pointer-events-none absolute inset-x-0 top-2 z-30 flex items-start justify-between px-2">
          <button className={`${btn} pointer-events-auto bg-black/50 backdrop-blur`} data-testid="open-cast" onClick={() => setDrawer('cast')}>
            {t('Cast')}
          </button>
          <div className="pointer-events-auto flex flex-col items-center gap-1">
            <div className="rounded-full bg-black/50 px-3 py-1 text-sm backdrop-blur" data-testid="scene-title">
              {stage.scene?.name ?? t('No scene')}
            </div>
            <div className="flex rounded-full bg-black/50 p-0.5 text-xs backdrop-blur" role="radiogroup" aria-label={t('Mode')}>
              {[
                ['scene', t('Scene')],
                ['battle', t('Battle')],
              ].map(([m, text]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={(battle ? 'battle' : 'scene') === m}
                  data-testid={`mode-${m}`}
                  className={`min-h-8 rounded-full px-3 ${(battle ? 'battle' : 'scene') === m ? 'bg-violet-700' : ''}`}
                  onClick={() => call('battle:mode', { mode: m })}
                >
                  {text}
                </button>
              ))}
            </div>
            {stage.scene && <SceneNotes sceneId={stage.scene.id} />}
          </div>
          <button className={`${btn} pointer-events-auto bg-black/50 backdrop-blur`} data-testid="open-scenes" onClick={() => setDrawer('scenes')}>
            {t('Scenes')}
          </button>
        </div>
      )}

      {!chrome && onExit && (
        <button
          className="ui-chrome absolute left-2 top-2 z-30 rounded-full bg-black/40 px-3 py-1 text-xs opacity-30 transition-opacity hover:opacity-100 focus:opacity-100"
          data-testid="display-exit"
          onClick={onExit}
        >
          {t('Switch')}
        </button>
      )}

      {drawer === 'cast' && <CastDrawer onClose={() => setDrawer(null)} />}
      {drawer === 'scenes' && <ScenesDrawer onClose={() => setDrawer(null)} />}
    </>
  );
}

// A change of scene or of mode fades: the old view goes to black (half the time, still showing the old scene), then the new one comes
// out of it (the other half): 1 second in all. Anything else (a figure moving, a token) shows at once.
const FADE_HALF_MS = 500;

function useSceneFade(stage) {
  const key = `${stage.mode}:${stage.scene?.id ?? ''}`;
  const [shown, setShown] = useState({ key, stage });
  const [dark, setDark] = useState(false);
  const latest = useRef(stage);
  latest.current = stage;
  useEffect(() => {
    if (key === shown.key) {
      setDark(false);
      return undefined;
    }
    setDark(true);
    const timer = setTimeout(() => {
      setShown({ key, stage: latest.current });
      setDark(false);
    }, FADE_HALF_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { view: shown.key === key ? stage : shown.stage, dark };
}

// `chrome`: false on the Display Screen (no drawers). `onExit`: how the Display gets back to the picker.
// The eye at the bottom left: hides (and brings back) every control over the scene on this screen only.
function HideUiButton() {
  const t = useT();
  const hidden = useApplyHideUi();
  return (
    <button
      className={`absolute bottom-3 left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur active:bg-black/70 ${hidden ? 'opacity-30 hover:opacity-100' : ''}`}
      data-testid="hide-ui"
      data-hidden={hidden ? 'true' : 'false'}
      aria-label={hidden ? t('Show the interface') : t('Hide the interface')}
      title={hidden ? t('Show the interface') : t('Hide the interface')}
      onClick={() => setUiHidden(!hidden)}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}

export default function ScenePage({ chrome = true, onExit }) {
  const { stage, identity } = useApp();
  const { view, dark } = useSceneFade(stage);
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <StageView stage={view}>{view.mode === 'battle' ? <BattleView /> : <SceneView />}</StageView>
      <div
        className="pointer-events-none absolute inset-0 z-20 bg-black transition-opacity ease-in-out"
        style={{ opacity: dark ? 1 : 0, transitionDuration: `${FADE_HALF_MS}ms` }}
        data-testid="scene-fade"
        data-dark={dark ? 'true' : 'false'}
      />
      <SceneChrome chrome={chrome} onExit={onExit} />
      <HideUiButton />
      {chrome && identity.role === 'gm' && <GmTools />}
      {identity.role === 'player' && view.mode !== 'battle' && <PlayerSceneTools />}
    </div>
  );
}
