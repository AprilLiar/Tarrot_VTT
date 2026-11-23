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
// This row is the only place notes are made and managed.
export function SceneNotes({ sceneId }) {
  const t = useT();
  const notes = useNotes(sceneId);
  const [open, setOpen] = useState(null); // a note, or 'new'
  const current = open && open !== 'new' ? notes.find((n) => n.id === open.id) ?? null : null;
  return (
    <div className="flex flex-wrap justify-center gap-1" data-testid="scene-notes">
      {notes.map((n) => (
        <button
          key={n.id}
          className={`${round} ${n.kind === 'card' ? 'bg-amber-400 text-black' : 'border border-white/60 bg-black/50'}`}
          data-testid="scene-note"
          data-kind={n.kind}
          aria-label={n.kind === 'card' ? t('Card {n}', { n: n.number }) : t('Note {n}', { n: n.number })}
          onClick={() => setOpen(n)}
        >
          {n.number}
        </button>
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
