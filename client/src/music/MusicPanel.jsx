import { useEffect, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../components/Dialog.jsx';
import { ActionDialog, NameField } from '../components/folderUi.jsx';
import { useMusicContext } from './MusicContext.jsx';

export function VolumeControl({ music }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        Volume: {Math.round(music.volume * 100)}%
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(music.volume * 100)}
          data-testid="volume-slider"
          onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={music.muted} onChange={(e) => music.setMuted(e.target.checked)} />
        Mute on this screen
      </label>
    </div>
  );
}

const fmt = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function useLibrary() {
  const [playlists, setPlaylists] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      call('music:get').then((r) => {
        if (live && r.ok) setPlaylists(r.playlists);
      });
    const onUpdated = (u) => setPlaylists(u.playlists);
    load();
    socket.on('music:updated', onUpdated);
    socket.on('connect', load);
    return () => {
      live = false;
      socket.off('music:updated', onUpdated);
      socket.off('connect', load);
    };
  }, []);
  return playlists;
}

function NowPlaying({ music }) {
  const s = music.state;
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const [dragging, setDragging] = useState(null);
  const has = s?.trackId != null;
  const position = has ? Math.min(music.positionMs(), s.durationMs ?? Infinity) : 0;
  const shown = dragging ?? position;
  const nextRepeat = { off: 'one', one: 'all', all: 'off' }[s?.repeatMode ?? 'off'];
  const repeatLabel = { off: 'Repeat: off', one: 'Repeat: one', all: 'Repeat: playlist' }[s?.repeatMode ?? 'off'];

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3" data-testid="now-playing">
      <div className="truncate text-lg font-medium" data-testid="now-title">
        {has ? s.name : 'Nothing playing'}
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs opacity-70">
        <span>{fmt(shown)}</span>
        <input
          type="range"
          className="flex-1"
          aria-label="Position"
          data-testid="seek"
          min="0"
          max={s?.durationMs ?? 0}
          value={Math.min(shown, s?.durationMs ?? 0)}
          disabled={!has || !s?.durationMs}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging != null) call('audio:seek', { positionMs: dragging });
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging != null) call('audio:seek', { positionMs: dragging });
            setDragging(null);
          }}
        />
        <span>{s?.durationMs ? fmt(s.durationMs) : '--:--'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={!has} data-testid="prev" onClick={() => call('audio:previous')}>
          Previous
        </button>
        {has && s.isPlaying ? (
          <button className={btnPrimary} data-testid="pause" onClick={() => call('audio:pause')}>
            Pause
          </button>
        ) : (
          <button className={btnPrimary} disabled={!has} data-testid="resume" onClick={() => call('audio:resume')}>
            Play
          </button>
        )}
        <button className={btn} disabled={!has} data-testid="next" onClick={() => call('audio:next')}>
          Next
        </button>
        <button className={btn} disabled={!has} data-testid="stop" onClick={() => call('audio:stop')}>
          Stop
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className={btn} data-testid="repeat" onClick={() => call('audio:set_mode', { repeatMode: nextRepeat })}>
          {repeatLabel}
        </button>
        <button
          className={`${btn} ${s?.shuffle ? 'ring-2 ring-violet-500' : ''}`}
          aria-pressed={!!s?.shuffle}
          data-testid="shuffle"
          onClick={() => call('audio:set_mode', { shuffle: !s?.shuffle })}
        >
          Shuffle: {s?.shuffle ? 'on' : 'off'}
        </button>
      </div>
      <div className="mt-3">
        <VolumeControl music={music} />
      </div>
    </section>
  );
}

function AddTrack({ playlist, onDone }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  async function lookup() {
    if (!url.trim() || touched) return;
    const r = await call('audio:lookup_title', { url });
    if (r.ok && r.title && !touched) setName(r.title);
  }

  return (
    <ActionDialog
      title={`Add a track to ${playlist.name}`}
      submitLabel="Add"
      onClose={onDone}
      canSubmit={url.trim().length > 0}
      run={() => call('track:create', { playlistId: playlist.id, url, name: name.trim() || undefined })}
    >
      <label className="flex flex-col gap-1 text-sm">
        YouTube link
        <input
          className={input}
          data-testid="track-url"
          value={url}
          autoFocus
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(e) => setUrl(e.target.value)}
          onBlur={lookup}
          onPaste={() => setTimeout(lookup, 50)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Name (filled in from YouTube when possible)
        <input
          className={input}
          data-testid="track-name"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setTouched(true);
            setName(e.target.value);
          }}
        />
      </label>
    </ActionDialog>
  );
}

function PlaylistCard({ playlist, music }) {
  const [open, setOpen] = useState(true);
  const [dialog, setDialog] = useState(null);
  const playingId = music.state?.trackId;
  const done = () => setDialog(null);

  async function move(index, delta) {
    const ids = playlist.tracks.map((t) => t.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await call('track:reorder', { playlistId: playlist.id, ids });
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-2" data-testid="playlist" data-name={playlist.name}>
      <div className="flex items-center gap-2">
        <button className="min-h-10 flex-1 truncate text-left font-medium" onClick={() => setOpen(!open)}>
          {playlist.name} <span className="text-xs opacity-60">({playlist.tracks.length})</span>
        </button>
        <button className={`${btn} min-h-9 px-2`} onClick={() => setDialog({ kind: 'rename-list' })}>
          Rename
        </button>
        <button className={`${btnDanger} min-h-9 px-2`} onClick={() => setDialog({ kind: 'delete-list' })}>
          Delete
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {playlist.tracks.map((t, i) => (
            <div
              key={t.id}
              data-testid="track"
              data-playing={t.id === playingId ? 'true' : 'false'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 ${t.id === playingId ? 'bg-violet-700/40' : 'bg-black/20'}`}
            >
              <button className="min-h-10 flex-1 truncate text-left" data-testid="play-track" onClick={() => call('audio:play', { trackId: t.id })}>
                {t.name}
                {t.durationMs ? <span className="ml-2 text-xs opacity-60">{fmt(t.durationMs)}</span> : null}
              </button>
              <button className={`${btn} min-h-9 min-w-9 px-2`} aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                Up
              </button>
              <button className={`${btn} min-h-9 min-w-9 px-2`} aria-label={`Move ${t.name} down`} disabled={i === playlist.tracks.length - 1} onClick={() => move(i, 1)}>
                Down
              </button>
              <button className={`${btn} min-h-9 px-2`} onClick={() => setDialog({ kind: 'rename-track', track: t })}>
                Rename
              </button>
              <button className={`${btnDanger} min-h-9 px-2`} aria-label={`Delete ${t.name}`} onClick={() => setDialog({ kind: 'delete-track', track: t })}>
                x
              </button>
            </div>
          ))}
          <button className={btn} data-testid="add-track" onClick={() => setDialog({ kind: 'add' })}>
            Add a YouTube track
          </button>
        </div>
      )}
      {dialog?.kind === 'add' && <AddTrack playlist={playlist} onDone={done} />}
      {dialog?.kind === 'rename-list' && <RenameDialog title="Rename playlist" initial={playlist.name} run={(name) => call('playlist:rename', { id: playlist.id, name })} onClose={done} />}
      {dialog?.kind === 'rename-track' && <RenameDialog title="Rename track" initial={dialog.track.name} run={(name) => call('track:rename', { id: dialog.track.id, name })} onClose={done} />}
      {dialog?.kind === 'delete-list' && (
        <ActionDialog title="Delete playlist" submitLabel="Delete" danger onClose={done} run={() => call('playlist:delete', { id: playlist.id })}>
          <p className="text-sm">
            Delete <strong>{playlist.name}</strong> and its {playlist.tracks.length} tracks? If it is playing, the music stops.
          </p>
        </ActionDialog>
      )}
      {dialog?.kind === 'delete-track' && (
        <ActionDialog title="Delete track" submitLabel="Delete" danger onClose={done} run={() => call('track:delete', { id: dialog.track.id })}>
          <p className="text-sm">
            Delete <strong>{dialog.track.name}</strong>?
          </p>
        </ActionDialog>
      )}
    </section>
  );
}

function RenameDialog({ title, initial, run, onClose }) {
  const [name, setName] = useState(initial);
  return (
    <ActionDialog title={title} submitLabel="Rename" onClose={onClose} canSubmit={name.trim().length > 0} run={() => run(name)}>
      <NameField label="Name" value={name} onChange={setName} />
    </ActionDialog>
  );
}

// The GM's full player: what is playing and its controls, then the playlists.
export function MusicPanel({ onClose }) {
  const music = useMusicContext();
  const { toast } = useApp();
  const playlists = useLibrary();
  const [newList, setNewList] = useState('');

  useEffect(() => {
    const onBad = (u) => toast(`"${u.name}" cannot be played (YouTube does not allow it). Skipped.`);
    socket.on('audio:track_unplayable', onBad);
    return () => socket.off('audio:track_unplayable', onBad);
  }, [toast]);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <aside
        data-testid="music-panel"
        aria-label="Music"
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-white/15 bg-[#14111d] shadow-xl"
      >
        <header className="flex items-center gap-2 border-b border-white/10 p-3">
          <h2 className="flex-1 text-lg font-semibold">Music</h2>
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {music.engineFailed && (
            <p className="rounded-lg bg-amber-900/60 p-2 text-sm" role="alert">
              The YouTube player could not be loaded on this screen, so nothing can be heard here. Check the connection.
            </p>
          )}
          <NowPlaying music={music} />
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newList.trim()) return;
              const r = await call('playlist:create', { name: newList });
              if (r.ok) setNewList('');
              else toast(r.error);
            }}
          >
            <input className={input} data-testid="new-playlist-name" placeholder="New playlist" value={newList} maxLength={60} onChange={(e) => setNewList(e.target.value)} />
            <button className={btnPrimary} type="submit" data-testid="new-playlist">
              Create
            </button>
          </form>
          {playlists === null && <p className="text-sm opacity-60">Loading...</p>}
          {playlists?.length === 0 && <p className="text-sm opacity-60">No playlists yet.</p>}
          {playlists?.map((p) => (
            <PlaylistCard key={p.id} playlist={p} music={music} />
          ))}
        </div>
      </aside>
    </>
  );
}
