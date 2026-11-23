import { useRef, useState } from 'react';
import { imageUrl } from '../lib/image.js';
import { useOpaqueBounds } from '../lib/opaqueBounds.js';
import { cropSquare, portraitBase, squareStyle, cleanCrop, ZOOM_MIN, ZOOM_MAX } from '../../../shared/crop.js';
import { call, useApp } from '../AppContext.jsx';
import { useT } from '../i18n.jsx';
import Dialog, { btn, btnPrimary } from './Dialog.jsx';

// Round pictures with a crop (see the README, Crop editor, and shared/crop.js):
//  - a Portrait's thumbnail: the base is the top square of the picture (where a face is);
//  - a default Battle token: the base is the top square of the visible character (head and shoulders; transparent edges left out).

// The base square of a picture, in its pixels, once it is known (null while loading).
function useBase(url, kind, nat) {
  const bounds = useOpaqueBounds(kind === 'token' ? url : null);
  if (!nat) return null;
  if (kind === 'portrait') return portraitBase(nat.w, nat.h);
  if (!bounds) return null;
  const vw = (bounds.x1 - bounds.x0) * nat.w; // the visible character, in the picture's pixels
  const vh = (bounds.y1 - bounds.y0) * nat.h;
  const side = Math.max(1, Math.min(vw, vh));
  return { cx: ((bounds.x0 + bounds.x1) / 2) * nat.w, cy: bounds.y0 * nat.h + side / 2, side };
}

// The picture cropped to fill its parent (a square frame with `relative overflow-hidden`).
export function CroppedImage({ imageId, kind, crop, alt = '', testId, kindAttr }) {
  const url = imageId ? imageUrl(imageId) : null;
  const [nat, setNat] = useState(null);
  const base = useBase(url, kind, nat);
  if (!url) return null;
  const onLoad = (e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  if (!base) return <img src={url} alt={alt} draggable={false} onLoad={onLoad} className="h-full w-full object-cover opacity-0" data-testid={testId} data-kind={kindAttr} />;
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      onLoad={onLoad}
      style={squareStyle(nat.w, cropSquare(base, crop))}
      data-testid={testId}
      data-kind={kindAttr}
      data-crop={crop ? 'custom' : 'auto'}
    />
  );
}

// The Crop editor: drag the picture inside the circle to move it, the slider (or the mouse wheel) to zoom; Reset brings back the automatic cut.
export function CropDialog({ characterId, which, imageId, crop: start, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [crop, setCrop] = useState(start ?? { x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const frame = useRef(null);
  const drag = useRef(null);
  const FRAME = 240;

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: crop };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    // A pixel of the frame is 1 / (FRAME * zoom) base sides; the picture follows the finger, so the crop moves the other way.
    const k = 1 / (FRAME * d.from.zoom);
    setCrop({ ...d.from, x: d.from.x - (e.clientX - d.x) * k, y: d.from.y - (e.clientY - d.y) * k });
  };
  const up = () => {
    drag.current = null;
  };
  const zoomTo = (z) => setCrop((c) => ({ ...c, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) }));

  async function save() {
    setBusy(true);
    const r = await call('crop:set', { characterId, which, crop: cleanCrop(crop) });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    onClose();
  }

  return (
    <Dialog title={which === 'portrait' ? t('Crop the Portrait') : t('Crop the token')}>
      <div className="flex flex-col items-center gap-3" data-testid="crop-dialog" data-which={which}>
        <div
          ref={frame}
          className="relative cursor-grab touch-none overflow-hidden rounded-full bg-black/40 ring-2 ring-white/30"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => zoomTo(crop.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
          data-testid="crop-frame"
        >
          <CroppedImage imageId={imageId} kind={which} crop={crop} testId="crop-image" />
        </div>
        <label className="flex w-full items-center gap-3 text-sm">
          <span className="opacity-70">{t('Zoom')}</span>
          <input
            type="range"
            className="flex-1"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.05"
            value={crop.zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            data-testid="crop-zoom"
          />
        </label>
        <p className="text-xs opacity-60">{t('Drag the picture to move it.')}</p>
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button className={btn} data-testid="crop-reset" onClick={() => setCrop({ x: 0, y: 0, zoom: 1 })}>
            {t('Reset')}
          </button>
          <button className={btn} data-testid="crop-cancel" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} disabled={busy} data-testid="crop-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
