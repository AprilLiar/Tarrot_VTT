import { useCallback, useEffect, useRef, useState } from 'react';

// Zoom and pan for a fixed-size box: mouse wheel and drag on desktop, pinch and
// one-finger drag on touch. The view is local to each screen; nothing is shared.
// Mark the zoomed picture with `data-pan-surface`, and anything on it that must not
// start a pan (a draggable character) with `data-no-pan`.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

const clampView = (v, w, h) => {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  return {
    scale,
    x: Math.min(0, Math.max(w - w * scale, v.x)),
    y: Math.min(0, Math.max(h - h * scale, v.y)),
  };
};

export function useZoomPan() {
  const ref = useRef(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const size = () => {
    const r = ref.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  // Zoom keeping the point (cx, cy), in box coordinates, still.
  const zoomAt = useCallback((factor, cx, cy) => {
    const { w, h } = size();
    const v = viewRef.current;
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
    const k = scale / v.scale;
    setView(clampView({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, w, h));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      // Only the picture zooms: drawers and dialogs on top of it must still scroll.
      if (!e.target.closest?.('[data-pan-surface]')) return;
      e.preventDefault();
      const { left, top } = size();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - left, e.clientY - top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const bind = {
    onPointerDown(e) {
      // Only a drag that starts on the picture pans it. Menus, drawers and dialogs
      // sit inside the same element but must keep their own clicks.
      if (!e.target.closest('[data-pan-surface]') || e.target.closest('[data-no-pan]')) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      const v = viewRef.current;
      if (pts.length === 1) gesture.current = { type: 'pan', sx: pts[0].x, sy: pts[0].y, vx: v.x, vy: v.y };
      else if (pts.length === 2) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        gesture.current = { type: 'pinch', d, scale: v.scale };
      }
    },
    onPointerMove(e) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      const g = gesture.current;
      const { w, h, left, top } = size();
      if (g?.type === 'pan' && pts.length === 1) {
        setView(clampView({ ...viewRef.current, x: g.vx + (pts[0].x - g.sx), y: g.vy + (pts[0].y - g.sy) }, w, h));
      } else if (g?.type === 'pinch' && pts.length === 2) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const cx = (pts[0].x + pts[1].x) / 2 - left;
        const cy = (pts[0].y + pts[1].y) / 2 - top;
        const target = g.scale * (d / g.d);
        zoomAt(target / viewRef.current.scale, cx, cy);
      }
    },
    onPointerUp(e) {
      pointers.current.delete(e.pointerId);
      gesture.current = null;
    },
    onPointerCancel(e) {
      pointers.current.delete(e.pointerId);
      gesture.current = null;
    },
  };

  const zoomBy = (factor) => {
    const { w, h } = size();
    zoomAt(factor, w / 2, h / 2);
  };
  const reset = () => setView({ scale: 1, x: 0, y: 0 });

  return { ref, view, bind, zoomBy, reset };
}
