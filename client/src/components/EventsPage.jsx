import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import { useT } from '../i18n.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';

// The Events board (see the README, "Events board"): lanes of sticky notes side by side. The GM makes the lanes (for Everyone or the GM
// only); anyone writes notes in the lanes they see, and drags any note (by its whole body) within and between them. A tap on a note opens it:
// its author or the GM can change or delete it there.
const NOTE_MAX = 280;
export const NOTE_COLORS = {
  yellow: 'bg-yellow-200 text-yellow-950',
  pink: 'bg-pink-200 text-pink-950',
  blue: 'bg-sky-200 text-sky-950',
  green: 'bg-green-200 text-green-950',
  violet: 'bg-violet-200 text-violet-950',
};
const COLOR_KEYS = Object.keys(NOTE_COLORS);
const DRAG_PX = 6; // a press that moves less than this is a tap

export default function EventsPage() {
  const t = useT();
  const { identity, toast } = useApp();
  const gm = identity?.role === 'gm';
  const [boardData, setBoard] = useState({ lanes: [], notes: [] });
  const [laneDialog, setLaneDialog] = useState(null); // a lane, or 'new'
  const [noteDialog, setNoteDialog] = useState(null); // { laneId } for a new note, or a note
  const [drag, setDrag] = useState(null); // { id, x, y, w, h, dx, dy, moved }
  const dragRef = useRef(null);

  const load = useCallback(async () => {
    const r = await call('events:get');
    if (r.ok) setBoard({ lanes: r.lanes, notes: r.notes });
  }, []);
  useEffect(() => {
    load();
    socket.on('events:changed', load);
    socket.on('connect', load);
    return () => {
      socket.off('events:changed', load);
      socket.off('connect', load);
    };
  }, [load]);

  const mayEdit = (n) => gm || (n.author.role === 'player' && n.author.characterId === identity?.characterId);

  // Dragging: a note follows the pointer; where it is let go (a lane, before or after a note) decides its place.
  function down(e, note) {
    if (e.button !== undefined && e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    dragRef.current = { id: note.id, startX: e.clientX, startY: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, w: box.width, h: box.height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_PX) return;
    d.moved = true;
    setDrag({ ...d, x: e.clientX, y: e.clientY });
  }
  async function up(e, note) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) return setNoteDialog(note);
    const target = dropTarget(e.clientX, e.clientY, note.id);
    if (!target) return;
    const r = await call('event_note:move', { id: note.id, laneId: target.laneId, index: target.index });
    if (!r.ok) toast(r.error);
  }

  const notesOf = (laneId) => boardData.notes.filter((n) => n.laneId === laneId).sort((a, b) => a.position - b.position);

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col p-3" data-testid="events-page">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold">{t('Events')}</h1>
        {gm && (
          <button className={btn} data-testid="lane-add" onClick={() => setLaneDialog('new')}>
            {t('Add a lane')}
          </button>
        )}
      </div>
      {boardData.lanes.length === 0 && <p className="text-sm opacity-60">{gm ? t('No lanes yet. Add one to start the board.') : t('The GM has not made the board yet.')}</p>}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {boardData.lanes.map((lane, i) => (
          <section key={lane.id} className="flex w-64 shrink-0 flex-col rounded-xl border border-white/10 bg-white/5" data-testid="lane" data-lane-id={lane.id} data-name={lane.name} data-visibility={lane.visibility}>
            <header className="flex items-center gap-1 border-b border-white/10 p-2">
              <h2 className="min-w-0 flex-1 truncate font-semibold">{lane.name}</h2>
              {lane.visibility === 'gm' && <span className="rounded bg-amber-700/60 px-1.5 text-xs">{t('GM only')}</span>}
              {gm && (
                <>
                  <button className="rounded px-1.5 text-sm opacity-70 disabled:opacity-20" aria-label={t('Move left')} disabled={i === 0} onClick={() => call('lane:shift', { id: lane.id, by: -1 })}>
                    {'<'}
                  </button>
                  <button className="rounded px-1.5 text-sm opacity-70 disabled:opacity-20" aria-label={t('Move right')} disabled={i === boardData.lanes.length - 1} onClick={() => call('lane:shift', { id: lane.id, by: 1 })}>
                    {'>'}
                  </button>
                  <button className="rounded px-1.5 text-xs opacity-70" data-testid="lane-edit" onClick={() => setLaneDialog(lane)}>
                    {t('Edit')}
                  </button>
                </>
              )}
            </header>
            <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2" data-lane-drop={lane.id}>
              {notesOf(lane.id).map((n) => (
                <div
                  key={n.id}
                  data-testid="event-note"
                  data-note-id={n.id}
                  data-color={n.color}
                  className={`cursor-grab touch-none select-none rounded-lg p-2 text-sm shadow ${NOTE_COLORS[n.color]} ${drag?.id === n.id ? 'opacity-30' : ''}`}
                  onPointerDown={(e) => down(e, n)}
                  onPointerMove={move}
                  onPointerUp={(e) => up(e, n)}
                  onPointerCancel={() => {
                    dragRef.current = null;
                    setDrag(null);
                  }}
                >
                  <div className="whitespace-pre-wrap break-words" data-testid="event-note-text">
                    {n.text}
                  </div>
                  <div className="mt-1 text-right text-xs opacity-60">{n.author.role === 'gm' ? t(n.author.name) : n.author.name}</div>
                </div>
              ))}
              <button className="rounded-lg border border-dashed border-white/25 p-2 text-sm opacity-70 active:bg-white/10" data-testid="note-add" onClick={() => setNoteDialog({ laneId: lane.id })}>
                + {t('Add a note')}
              </button>
            </div>
          </section>
        ))}
      </div>

      {drag && (
        <div
          className={`pointer-events-none fixed z-50 rotate-2 rounded-lg p-2 text-sm opacity-90 shadow-xl ${NOTE_COLORS[boardData.notes.find((n) => n.id === drag.id)?.color ?? 'yellow']}`}
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, minHeight: drag.h }}
          data-testid="event-note-ghost"
        >
          {boardData.notes.find((n) => n.id === drag.id)?.text}
        </div>
      )}

      {laneDialog && <LaneDialog lane={laneDialog === 'new' ? null : laneDialog} onClose={() => setLaneDialog(null)} />}
      {noteDialog && <NoteDialog note={noteDialog.id ? noteDialog : null} laneId={noteDialog.laneId} editable={!noteDialog.id || mayEdit(noteDialog)} onClose={() => setNoteDialog(null)} />}
    </main>
  );
}

// Where a dragged note lands: the lane under the pointer, before the first note whose middle is below the pointer.
function dropTarget(x, y, draggedId) {
  const el = document.elementsFromPoint(x, y).find((e) => e.dataset?.laneDrop || e.dataset?.laneId);
  if (!el) return null;
  const laneEl = el.closest('[data-lane-id]');
  if (!laneEl) return null;
  const laneId = Number(laneEl.dataset.laneId);
  const notes = [...laneEl.querySelectorAll('[data-note-id]')].filter((n) => Number(n.dataset.noteId) !== draggedId);
  let index = notes.length;
  for (let i = 0; i < notes.length; i++) {
    const b = notes[i].getBoundingClientRect();
    if (y < b.top + b.height / 2) {
      index = i;
      break;
    }
  }
  return { laneId, index };
}

function LaneDialog({ lane, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [name, setName] = useState(lane?.name ?? '');
  const [visibility, setVisibility] = useState(lane?.visibility ?? 'all');
  const [confirm, setConfirm] = useState(false);
  async function save() {
    const r = lane ? await call('lane:update', { id: lane.id, name, visibility }) : await call('lane:create', { name, visibility });
    if (!r.ok) return toast(r.error);
    onClose();
  }
  return (
    <Dialog title={lane ? t('Edit lane') : t('New lane')}>
      <div className="flex flex-col gap-3" data-testid="lane-dialog">
        <label className="flex flex-col gap-1 text-sm">
          {t('Name')}
          <input className={input} value={name} maxLength={60} data-testid="lane-name" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex gap-2" role="radiogroup" aria-label={t('Who sees it')}>
          {[
            ['all', t('Everyone')],
            ['gm', t('GM only')],
          ].map(([v, label]) => (
            <button key={v} role="radio" aria-checked={visibility === v} data-testid={`lane-visibility-${v}`} className={`${btn} flex-1 ${visibility === v ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setVisibility(v)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {lane &&
            (confirm ? (
              <button
                className={btnDanger}
                data-testid="lane-delete-confirm"
                onClick={async () => {
                  const r = await call('lane:delete', { id: lane.id });
                  if (!r.ok) return toast(r.error);
                  onClose();
                }}
              >
                {t('Delete the lane and its notes')}
              </button>
            ) : (
              <button className={btn} data-testid="lane-delete" onClick={() => setConfirm(true)}>
                {t('Delete')}
              </button>
            ))}
          <div className="flex-1" />
          <button className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} disabled={!name.trim()} data-testid="lane-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function NoteDialog({ note, laneId, editable, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [text, setText] = useState(note?.text ?? '');
  const [color, setColor] = useState(note?.color ?? 'yellow');
  async function save() {
    const r = note ? await call('event_note:update', { id: note.id, text, color }) : await call('event_note:create', { laneId, text, color });
    if (!r.ok) return toast(r.error);
    onClose();
  }
  if (!editable) {
    return (
      <Dialog title={t('Note')}>
        <div className={`whitespace-pre-wrap break-words rounded-lg p-3 ${NOTE_COLORS[note.color]}`} data-testid="event-note-view">
          {note.text}
        </div>
        <p className="mt-2 text-xs opacity-60">{t('Written by {name}. Only its author or the GM can change it.', { name: note.author.role === 'gm' ? t(note.author.name) : note.author.name })}</p>
        <div className="mt-3 flex justify-end">
          <button className={btn} onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={note ? t('Edit note') : t('New note')}>
      <div className="flex flex-col gap-3" data-testid="event-note-dialog">
        <textarea className={`${input} ${NOTE_COLORS[color]}`} rows={4} maxLength={NOTE_MAX} value={text} data-testid="event-note-input" onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-2">
          {COLOR_KEYS.map((c) => (
            <button key={c} aria-label={c} aria-pressed={color === c} data-testid="event-note-color" data-color={c} className={`h-8 w-8 rounded-full ${NOTE_COLORS[c]} ${color === c ? 'ring-2 ring-white' : ''}`} onClick={() => setColor(c)} />
          ))}
          <span className="flex-1 text-right text-xs opacity-60">
            {text.length} / {NOTE_MAX}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {note && (
            <button
              className={btnDanger}
              data-testid="event-note-delete"
              onClick={async () => {
                const r = await call('event_note:delete', { id: note.id });
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
          <button className={btnPrimary} disabled={!text.trim()} data-testid="event-note-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
