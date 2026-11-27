import { useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { useT } from '../../i18n.jsx';

const MAX_NOTES = 9;
const round = 'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold backdrop-blur';

function useNotes(sceneId) {
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    let live = true;
    setNotes([]);
    call('scene_note:list', { sceneId }).then((r) => live && r.ok && setNotes(r.notes));
    const onUpdated = (u) => u.sceneId === sceneId && setNotes(u.notes);
    socket.on('scene_notes:updated', onUpdated);
    return () => {
      live = false;
      socket.off('scene_notes:updated', onUpdated);
    };
  }, [sceneId]);
  return notes;
}

// The GM's notes on the active scene (see the README): numbered round buttons in a row under the Scene / Battle switch, and while there are
// fewer than 9 a dotted + to make the next one. A note is plain text; a Card (filled button) can be shown to everyone as a cutscene card.
// A note's round button. With a mouse over it (or over its bubble), the note shows its whole text in a speech bubble under it, so it can be
// read without opening it. A touch screen has no hover: a tap opens the note as before.
function NoteButton({ note: n, onOpen }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const enter = (e) => e.pointerType === 'mouse' && setHover(true);
  return (
    <span className="relative" onPointerEnter={enter} onPointerLeave={() => setHover(false)}>
      <button
        className={`${round} ${n.kind === 'card' ? 'bg-amber-400 text-black' : 'border border-white/60 bg-black/50'}`}
        data-testid="scene-note"
        data-kind={n.kind}
        aria-label={n.kind === 'card' ? t('Card {n}', { n: n.number }) : t('Note {n}', { n: n.number })}
        onClick={() => {
          setHover(false);
          onOpen();
        }}
      >
        {n.number}
      </button>
      {hover && <NoteBubble note={n} />}
    </span>
  );
}

// The bubble: a small comic-book speech bubble under the note, its tail pointing up at it.
function NoteBubble({ note }) {
  const t = useT();
  const empty = note.kind === 'card' ? !note.title && !note.body : !note.body.trim();
  return (
    <div
      className="note-bubble absolute left-1/2 top-full z-40 w-64 -translate-x-1/2 pt-3"
      data-testid="note-bubble"
    >
      <div className="relative rounded-2xl border-2 border-black bg-white px-3 py-2 text-left text-sm text-black shadow-[3px_3px_0_rgba(0,0,0,0.6)]">
        <span className="absolute -top-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-black bg-white" aria-hidden="true" />
        <div className="relative max-h-72 overflow-y-auto whitespace-pre-wrap break-words">
          {empty ? (
            <span className="italic opacity-60">{t('(empty)')}</span>
          ) : note.kind === 'card' ? (
            <>
              <div className="font-bold">{note.title}</div>
              {note.body && <div className="opacity-80">{note.body}</div>}
            </>
          ) : (
            note.body
          )}
        </div>
      </div>
    </div>
  );
}

// This row is the only place notes are made and managed.
export function SceneNotes({ sceneId }) {
  const t = useT();
  const notes = useNotes(sceneId);
  const [open, setOpen] = useState(null); // a note, or 'new'
  const current = open && open !== 'new' ? notes.find((n) => n.id === open.id) ?? null : null;
  return (
    <div className="flex flex-wrap justify-center gap-1" data-testid="scene-notes">
      {notes.map((n) => (
        <NoteButton key={n.id} note={n} onOpen={() => setOpen(n)} />
      ))}
      {notes.length < MAX_NOTES && (
        <button className={`${round} border-2 border-dashed border-white/60 bg-black/30`} data-testid="scene-note-add" aria-label={t('New note')} onClick={() => setOpen('new')}>
          +
        </button>
      )}
      {open === 'new' && <NoteDialog sceneId={sceneId} note={null} onClose={() => setOpen(null)} />}
      {current && <NoteDialog sceneId={sceneId} note={current} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NoteDialog({ sceneId, note, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [kind, setKind] = useState(note?.kind ?? 'note');
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [deleting, setDeleting] = useState(false);
  const card = kind === 'card';
  const canSave = !card || title.trim().length > 0;

  async function save() {
    const r = note ? await call('scene_note:update', { id: note.id, kind, title, body }) : await call('scene_note:create', { sceneId, kind, title, body });
    if (!r.ok) toast(r.error);
    return r;
  }

  return (
    <Dialog title={note ? (note.kind === 'card' ? t('Card {n}', { n: note.number }) : t('Note {n}', { n: note.number })) : t('New note')} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="note-dialog">
        <div className="flex gap-2" role="radiogroup" aria-label={t('Kind')}>
          {[
            ['note', t('Note')],
            ['card', t('Card')],
          ].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`note-kind-${k}`} className={`${btn} flex-1 ${kind === k ? 'ring-2 ring-violet-500' : ''}`} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {card ? (
          <>
            <p className="text-xs opacity-60">{t('A Card is shown to everyone full-screen for a few seconds, like a cutscene.')}</p>
            <label className="flex flex-col gap-1 text-sm">
              {t('Title')}
              <input className={input} data-testid="note-title" maxLength={120} value={title} placeholder={t('Three days later')} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('Second line (optional)')}
              <input className={input} data-testid="note-subtitle" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
          </>
        ) : (
          <textarea className={`${input} min-h-40`} data-testid="note-body" maxLength={4000} value={body} placeholder={t('Only you see this note.')} onChange={(e) => setBody(e.target.value)} />
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {note &&
              (deleting ? (
                <button
                  className={btnDanger}
                  data-testid="note-delete-confirm"
                  onClick={async () => {
                    const r = await call('scene_note:delete', { id: note.id });
                    if (!r.ok) toast(r.error);
                    else onClose();
                  }}
                >
                  {t('Delete it')}
                </button>
              ) : (
                <button className={btn} data-testid="note-delete" onClick={() => setDeleting(true)}>
                  {t('Delete')}
                </button>
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {note && card && (
              <button
                className={btn}
                data-testid="note-show"
                disabled={!canSave}
                onClick={async () => {
                  const r = await save();
                  if (r.ok) {
                    const p = await call('scene_note:play', { id: note.id });
                    if (!p.ok) toast(p.error);
                  }
                }}
              >
                {t('Show to everyone')}
              </button>
            )}
            <button className={btn} onClick={onClose}>
              {t('Close')}
            </button>
            <button
              className={btnPrimary}
              data-testid="note-save"
              disabled={!canSave}
              onClick={async () => {
                if ((await save()).ok) onClose();
              }}
            >
              {t('Save')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
