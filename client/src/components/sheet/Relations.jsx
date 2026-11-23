import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { Avatar } from '../Avatar.jsx';

// The Relationships board of a PC (see the README, "Relationships board"), seen by its player and the GM only. Cards can be dragged
// around; a tap on a card opens its note. Connect: tap the card an arrow starts from, then the one it points to. A tap on an arrow's name
// opens the arrow.
const W = 1600;
const H = 1000;
const CARD = 120; // a card's width, in board pixels
const DRAG_PX = 6;
export const ARROW_COLORS = { green: '#4ade80', red: '#f87171', amber: '#fbbf24', blue: '#60a5fa', violet: '#a78bfa', slate: '#94a3b8' };

export function Relations({ pcId }) {
  const t = useT();
  const { identity, pcs, roster, toast } = useApp();
  const gm = identity?.role === 'gm';
  const [board, setBoard] = useState({ cards: [], arrows: [] });
  const [connect, setConnect] = useState(null); // null | 'pick' | { from }
  const [cardDialog, setCardDialog] = useState(null);
  const [arrowDialog, setArrowDialog] = useState(null); // an arrow, or { from, to } for a new one
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(null); // { id, x, y }
  const dragRef = useRef(null);
  const wrap = useRef(null);

  const load = useCallback(async () => {
    const r = await call('rel:get', { pcId });
    if (r.ok) setBoard({ cards: r.cards, arrows: r.arrows });
  }, [pcId]);
  useEffect(() => {
    load();
    const onChange = (p) => p.pcId === pcId && load();
    socket.on('rel:changed', onChange);
    return () => socket.off('rel:changed', onChange);
  }, [load, pcId]);

  const pos = (c) => (drag?.id === c.id ? drag : c);

  // At first the board is scrolled to the PC's own card.
  const centred = useRef(false);
  useEffect(() => {
    const self = board.cards.find((c) => c.self);
    const el = wrap.current;
    if (centred.current || !self || !el) return;
    centred.current = true;
    el.scrollLeft = self.x + CARD / 2 - el.clientWidth / 2;
    el.scrollTop = self.y + CARD / 2 - el.clientHeight / 2;
  }, [board.cards]);

  function down(e, card) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: card.id, sx: e.clientX, sy: e.clientY, x0: card.x, y0: card.y, moved: false };
  }
  function move(e) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return;
    d.moved = true;
    const x = Math.min(W, Math.max(0, d.x0 + e.clientX - d.sx));
    const y = Math.min(H, Math.max(0, d.y0 + e.clientY - d.sy));
    setDrag({ id: d.id, x, y });
  }
  async function up(card) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const at = drag ?? card;
      setBoard((b) => ({ ...b, cards: b.cards.map((c) => (c.id === card.id ? { ...c, x: at.x, y: at.y } : c)) }));
      setDrag(null);
      const r = await call('rel:card_update', { id: card.id, x: at.x, y: at.y });
      if (!r.ok) toast(r.error);
      return;
    }
    setDrag(null);
    if (connect === 'pick') return setConnect({ from: card.id });
    if (connect?.from) {
      if (connect.from !== card.id) setArrowDialog({ from: connect.from, to: card.id });
      return setConnect(null);
    }
    setCardDialog(card);
  }

  // Where a new card goes: round the visible middle of the board, each one a step further round so they do not cover each other.
  const middle = () => {
    const el = wrap.current;
    const cx = el ? el.scrollLeft + el.clientWidth / 2 - CARD / 2 : W / 2;
    const cy = el ? el.scrollTop + el.clientHeight / 2 - CARD / 2 : H / 2;
    const n = board.cards.length;
    const a = n * 1.3;
    const r = 150 + 20 * Math.floor(n / 5);
    return { x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) };
  };

  const byId = new Map(board.cards.map((c) => [c.id, c]));
  const onBoard = new Set(board.cards.map((c) => c.characterId).filter((x) => x != null));
  // A player can add PCs; the GM any character of the roster.
  const choices = (gm ? (roster?.characters ?? []) : pcs).filter((c) => !onBoard.has(c.id));

  return (
    <section className="flex flex-col gap-2 pb-24" aria-label={t('Relationships')} data-testid="relations">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} data-testid="rel-add" onClick={() => setAdding(true)}>
          {t('Add a card')}
        </button>
        <button className={`${btn} ${connect ? 'ring-2 ring-violet-400' : ''}`} aria-pressed={!!connect} data-testid="rel-connect" onClick={() => setConnect(connect ? null : 'pick')}>
          {t('Connect')}
        </button>
        {connect && (
          <span className="text-sm opacity-80" data-testid="rel-connect-hint">
            {connect === 'pick' ? t('Tap the card the arrow starts from.') : t('Now tap the card it points to.')}
          </span>
        )}
      </div>
      <div ref={wrap} className="relative h-[70dvh] overflow-auto rounded-xl border border-white/10 bg-black/30">
        <div className="relative" style={{ width: W + CARD, height: H + CARD }} data-testid="rel-board">
          <svg className="absolute inset-0" width={W + CARD} height={H + CARD}>
            <defs>
              {Object.entries(ARROW_COLORS).map(([k, c]) => (
                <marker key={k} id={`rel-head-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill={c} />
                </marker>
              ))}
            </defs>
            {board.arrows.map((a) => {
              const from = byId.get(a.from);
              const to = byId.get(a.to);
              if (!from || !to) return null;
              const [p, q] = [pos(from), pos(to)];
              const ends = arrowEnds(p, q, board.arrows.some((x) => x.from === a.to && x.to === a.from));
              return (
                <line key={a.id} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} stroke={ARROW_COLORS[a.color]} strokeWidth="3" markerEnd={`url(#rel-head-${a.color})`} data-testid="rel-arrow" data-label={a.label} />
              );
            })}
          </svg>
          {board.arrows.map((a) => {
            const from = byId.get(a.from);
            const to = byId.get(a.to);
            if (!from || !to || !a.label) return null;
            const ends = arrowEnds(pos(from), pos(to), board.arrows.some((x) => x.from === a.to && x.to === a.from));
            return (
              <button
                key={a.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-0.5 text-xs font-semibold"
                style={{ left: (ends.x1 + ends.x2) / 2, top: (ends.y1 + ends.y2) / 2, color: ARROW_COLORS[a.color] }}
                data-testid="rel-arrow-label"
                onClick={() => setArrowDialog(a)}
              >
                {a.label}
              </button>
            );
          })}
          {board.cards.map((c) => {
            const p = pos(c);
            const picked = connect?.from === c.id;
            return (
              <div
                key={c.id}
                className={`absolute flex w-[120px] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none flex-col items-center gap-1 rounded-xl border bg-[#1a1626] p-2 text-center shadow-lg ${
                  picked ? 'border-violet-400 ring-2 ring-violet-400' : c.self ? 'border-emerald-500/70' : 'border-white/15'
                }`}
                style={{ left: p.x + CARD / 2, top: p.y + CARD / 2 }}
                data-testid="rel-card"
                data-name={c.name}
                data-self={c.self}
                onPointerDown={(e) => down(e, c)}
                onPointerMove={move}
                onPointerUp={() => up(c)}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDrag(null);
                }}
              >
                <Avatar name={c.name} imageId={c.portraitImageId} crop={c.portraitCrop} size="h-12 w-12 text-lg" />
                <span className="w-full truncate text-sm font-semibold">{c.name}</span>
                {c.kind === 'person' && <span className="text-[10px] uppercase tracking-wide opacity-50">{t('Person')}</span>}
                {c.note && <span className="line-clamp-2 w-full text-[11px] opacity-70">{c.note}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {adding && (
        <AddCardDialog
          choices={choices}
          onAdd={async (p) => {
            const r = await call('rel:card_add', { pcId, ...p, ...middle() });
            if (!r.ok) return toast(r.error);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {cardDialog && <CardDialog card={byId.get(cardDialog.id) ?? cardDialog} onClose={() => setCardDialog(null)} />}
      {arrowDialog && <ArrowDialog pcId={pcId} arrow={arrowDialog.id ? arrowDialog : null} from={byId.get(arrowDialog.from)} to={byId.get(arrowDialog.to)} onClose={() => setArrowDialog(null)} />}
    </section>
  );
}

// From the edge of one card towards the other (card centres are at x + CARD/2). Two arrows between the same cards are drawn side by side.
function arrowEnds(p, q, twoWay) {
  const ax = p.x + CARD / 2;
  const ay = p.y + CARD / 2;
  const bx = q.x + CARD / 2;
  const by = q.y + CARD / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const off = twoWay ? 8 : 0;
  const nx = -uy * off;
  const ny = ux * off;
  const gap = 68;
  return { x1: ax + ux * gap + nx, y1: ay + uy * gap + ny, x2: bx - ux * gap + nx, y2: by - uy * gap + ny };
}

function AddCardDialog({ choices, onAdd, onClose }) {
  const t = useT();
  const [name, setName] = useState('');
  return (
    <Dialog title={t('Add a card')}>
      <div className="flex flex-col gap-3" data-testid="rel-add-dialog">
        <div className="flex gap-2">
          <input className={input} placeholder={t('A made-up person')} value={name} maxLength={60} data-testid="rel-person-name" onChange={(e) => setName(e.target.value)} />
          <button className={btnPrimary} disabled={!name.trim()} data-testid="rel-person-add" onClick={() => onAdd({ name })}>
            {t('Add')}
          </button>
        </div>
        {choices.length > 0 && (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {choices.map((c) => (
              <button key={c.id} className={`${btn} flex items-center gap-2 text-left`} data-testid="rel-choice" onClick={() => onAdd({ characterId: c.id })}>
                <Avatar name={c.name} imageId={c.portraitImageId} crop={c.portraitCrop} size="h-8 w-8 text-sm" />
                <span className="flex-1 truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <button className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function CardDialog({ card, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [name, setName] = useState(card.name);
  const [note, setNote] = useState(card.note);
  async function save() {
    const r = await call('rel:card_update', { id: card.id, note, ...(card.kind === 'person' ? { name } : {}) });
    if (!r.ok) return toast(r.error);
    onClose();
  }
  return (
    <Dialog title={card.name}>
      <div className="flex flex-col gap-3" data-testid="rel-card-dialog">
        {card.kind === 'person' && (
          <label className="flex flex-col gap-1 text-sm">
            {t('Name')}
            <input className={input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          {t('Notes')}
          <textarea className={input} rows={4} maxLength={1000} value={note} data-testid="rel-card-note" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {!card.self && (
            <button
              className={btnDanger}
              data-testid="rel-card-delete"
              onClick={async () => {
                const r = await call('rel:card_delete', { id: card.id });
                if (!r.ok) return toast(r.error);
                onClose();
              }}
            >
              {t('Remove from the board')}
            </button>
          )}
          <div className="flex-1" />
          <button className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} data-testid="rel-card-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ArrowDialog({ pcId, arrow, from, to, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [label, setLabel] = useState(arrow?.label ?? '');
  const [color, setColor] = useState(arrow?.color ?? 'slate');
  const [note, setNote] = useState(arrow?.note ?? '');
  async function save() {
    const r = arrow ? await call('rel:arrow_update', { id: arrow.id, label, color, note }) : await call('rel:arrow_add', { pcId, from: from.id, to: to.id, label, color, note });
    if (!r.ok) return toast(r.error);
    onClose();
  }
  return (
    <Dialog title={`${from?.name ?? '?'} -> ${to?.name ?? '?'}`}>
      <div className="flex flex-col gap-3" data-testid="rel-arrow-dialog">
        <label className="flex flex-col gap-1 text-sm">
          {t('Name')}
          <input className={input} value={label} maxLength={60} placeholder={t('e.g. trusts, owes, hunts')} data-testid="rel-arrow-name" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="flex gap-2">
          {Object.entries(ARROW_COLORS).map(([k, c]) => (
            <button key={k} aria-label={k} aria-pressed={color === k} data-testid="rel-arrow-color" data-color={k} className={`h-8 w-8 rounded-full ${color === k ? 'ring-2 ring-white' : ''}`} style={{ background: c }} onClick={() => setColor(k)} />
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t('Notes')}
          <textarea className={input} rows={3} maxLength={1000} value={note} data-testid="rel-arrow-note" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {arrow && (
            <button
              className={btnDanger}
              data-testid="rel-arrow-delete"
              onClick={async () => {
                const r = await call('rel:arrow_delete', { id: arrow.id });
                if (!r.ok) return toast(r.error);
                onClose();
              }}
            >
              {t('Delete')}
            </button>
          )}
          <div className="flex-1" />
          <button className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} data-testid="rel-arrow-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
