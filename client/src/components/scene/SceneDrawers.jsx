import { useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { ActionDialog, FolderSelect, NameField } from '../folderUi.jsx';
import { prepareImage } from '../../lib/image.js';
import { LibraryTree } from './LibraryTree.jsx';
import { PicturesDialog, uploadPicture } from './Pictures.jsx';

// GM-only side panels over the scene: Scenes (right) and Cast (left).

function Drawer({ title, side, onClose, children, testId }) {
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" data-no-pan onPointerDown={onClose} />
      <aside
        data-no-pan
        data-testid={testId}
        aria-label={title}
        className={`absolute inset-y-0 z-50 flex w-full max-w-sm flex-col border-white/15 bg-[#14111d] shadow-xl ${
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-white/10 p-3">
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
      </aside>
    </>
  );
}

// Choose an image file: resizes it in the browser before it is sent.
function useImagePicker(kind) {
  const ref = useRef(null);
  const [file, setFile] = useState(null);
  const input = (
    <input ref={ref} type="file" accept="image/*" hidden data-testid="scene-file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
  );
  return {
    file,
    input,
    open: () => ref.current?.click(),
    prepare: () => prepareImage(file, kind),
  };
}

function NewSceneDialog({ folders, folderId, onClose }) {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(folderId);
  const pick = useImagePicker('background');
  return (
    <ActionDialog
      title="New scene"
      submitLabel="Create"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={async () => {
        let data;
        if (pick.file) {
          try {
            data = await pick.prepare();
          } catch (err) {
            return { ok: false, error: err.message };
          }
        }
        return call('scene:create', { name, folderId: folder, data });
      }}
    >
      <NameField label="Name" value={name} onChange={setName} />
      <FolderSelect label="Folder" folders={folders} value={folder} onChange={setFolder} />
      {pick.input}
      <button type="button" className={btn} data-testid="choose-background" onClick={pick.open}>
        {pick.file ? `Background: ${pick.file.name}` : 'Choose a background picture'}
      </button>
    </ActionDialog>
  );
}

function RenameSceneDialog({ scene, onClose }) {
  const [name, setName] = useState(scene.name);
  return (
    <ActionDialog
      title="Rename scene"
      submitLabel="Rename"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('scene:rename', { id: scene.id, name })}
    >
      <NameField label="Name" value={name} onChange={setName} />
    </ActionDialog>
  );
}

function MoveDialog({ title, folders, current, run, onClose }) {
  const [dest, setDest] = useState(current);
  return (
    <ActionDialog title={title} submitLabel="Move" onClose={onClose} run={() => run(dest)}>
      <FolderSelect label="Move to" folders={folders} value={dest} onChange={setDest} />
    </ActionDialog>
  );
}

function BackgroundDialog({ scene, onClose }) {
  const pick = useImagePicker('background');
  return (
    <ActionDialog
      title={`Background: ${scene.name}`}
      submitLabel="Replace"
      onClose={onClose}
      canSubmit={!!pick.file}
      run={async () => {
        try {
          return call('scene:set_image', { id: scene.id, data: await pick.prepare() });
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }}
    >
      {pick.input}
      <button type="button" className={btn} onClick={pick.open}>
        {pick.file ? pick.file.name : 'Choose a new background picture'}
      </button>
    </ActionDialog>
  );
}

function ConfirmDialog({ title, text, label, run, onClose }) {
  return (
    <ActionDialog title={title} submitLabel={label} danger onClose={onClose} run={run}>
      <p className="text-sm">{text}</p>
    </ActionDialog>
  );
}

export function ScenesDrawer({ onClose }) {
  const { library, stage } = useApp();
  const [dialog, setDialog] = useState(null);
  const done = () => setDialog(null);
  if (!library) return <Drawer title="Scenes" side="right" onClose={onClose}>Loading...</Drawer>;
  const activeId = stage.scene?.id ?? null;

  return (
    <Drawer title="Scenes" side="right" onClose={onClose} testId="scenes-drawer">
      <button className={`${btnPrimary} mb-3 w-full`} data-testid="new-scene" onClick={() => setDialog({ kind: 'new', folderId: null })}>
        New scene
      </button>
      <LibraryTree
        folders={library.sceneFolders}
        items={library.scenes}
        folderEvent="scene_folder"
        emptyText="No scenes yet."
        onAddItem={(folderId) => setDialog({ kind: 'new', folderId })}
        renderItem={(scene, { open, toggle }) => (
          <div data-testid="scene-row">
            <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left active:bg-white/10" onClick={toggle}>
              <span className="flex-1 truncate">{scene.name}</span>
              {scene.id === activeId && <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-xs">Active</span>}
            </button>
            {open && (
              <div className="flex flex-wrap gap-2 pb-2">
                {scene.id === activeId ? (
                  <button className={btn} data-testid="deactivate-scene" onClick={() => call('scene:activate', { id: null })}>
                    Deactivate
                  </button>
                ) : (
                  <button className={btnPrimary} data-testid="activate-scene" onClick={() => call('scene:activate', { id: scene.id })}>
                    Activate
                  </button>
                )}
                <button className={btn} onClick={() => setDialog({ kind: 'rename', scene })}>
                  Rename
                </button>
                <button className={btn} onClick={() => setDialog({ kind: 'background', scene })}>
                  Background
                </button>
                <button className={btn} onClick={() => setDialog({ kind: 'move', scene })}>
                  Move
                </button>
                <button className={btnDanger} onClick={() => setDialog({ kind: 'delete', scene })}>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      />
      {dialog?.kind === 'new' && <NewSceneDialog folders={library.sceneFolders} folderId={dialog.folderId} onClose={done} />}
      {dialog?.kind === 'rename' && <RenameSceneDialog scene={dialog.scene} onClose={done} />}
      {dialog?.kind === 'background' && <BackgroundDialog scene={dialog.scene} onClose={done} />}
      {dialog?.kind === 'move' && (
        <MoveDialog
          title={`Move ${dialog.scene.name}`}
          folders={library.sceneFolders}
          current={dialog.scene.folderId}
          run={(folderId) => call('scene:move', { id: dialog.scene.id, folderId })}
          onClose={done}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete scene"
          text={`Delete ${dialog.scene.name} and everyone standing on it? This cannot be undone.`}
          label="Delete"
          run={() => call('scene:delete', { id: dialog.scene.id })}
          onClose={done}
        />
      )}
    </Drawer>
  );
}

// ---- Cast -----------------------------------------------------------------------

function NewTempNpcDialog({ folders, folderId, onClose }) {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(folderId);
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  return (
    <ActionDialog
      title="New temp NPC"
      submitLabel="Create"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={async () => {
        const r = await call('temp_npc:create', { name, folderId: folder });
        if (r.ok && file) return uploadPicture({ tempNpcId: r.id }, file, name);
        return r;
      }}
    >
      <p className="text-xs opacity-60">A quick, sheet-less extra for the story. It only needs a name and a picture.</p>
      <NameField label="Name" value={name} onChange={setName} />
      <FolderSelect label="Folder" folders={folders} value={folder} onChange={setFolder} />
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="temp-npc-file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
        {file ? `Picture: ${file.name}` : 'Choose a first picture (optional)'}
      </button>
    </ActionDialog>
  );
}

// One summonable row: a character or a temp NPC.
function CastRow({ owner, name, badge, stage, onPictures, extra }) {
  const { toast } = useApp();
  const onStage = stage.summons.find((s) => s.ownerKind === owner.kind && s.ownerId === owner.id);
  const key = owner.kind === 'character' ? { characterId: owner.id } : { tempNpcId: owner.id };

  async function toggle() {
    if (onStage) {
      const r = await call('stage:dismiss', { id: onStage.id });
      if (!r.ok) toast(r.error);
      return;
    }
    const r = await call('stage:summon', key);
    if (!r.ok) {
      toast(r.error);
      if (r.code === 'no_picture') onPictures();
    }
  }

  return (
    <div data-testid="cast-row" data-name={name} className="rounded-lg bg-white/5 p-2">
      <div className="flex items-center gap-2">
        {badge && <span className={`rounded px-1.5 py-0.5 text-xs ${badge === 'PC' ? 'bg-emerald-800' : 'bg-slate-700'}`}>{badge}</span>}
        <span className="flex-1 truncate">{name}</span>
        {onStage && <span className="text-xs opacity-60">{onStage.hidden ? 'hidden' : 'on stage'}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={onStage ? btn : btnPrimary} data-testid={onStage ? 'dismiss-cast' : 'summon-cast'} onClick={toggle}>
          {onStage ? 'Dismiss' : 'Summon'}
        </button>
        <button className={btn} data-testid="cast-pictures" onClick={onPictures}>
          Pictures
        </button>
        {extra}
      </div>
    </div>
  );
}

export function CastDrawer({ onClose }) {
  const { roster, library, stage } = useApp();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const done = () => setDialog(null);
  const q = query.trim().toLowerCase();
  const characters = (roster?.characters ?? []).filter((c) => c.name.toLowerCase().includes(q));

  if (!library) return <Drawer title="Cast" side="left" onClose={onClose}>Loading...</Drawer>;

  return (
    <Drawer title="Cast" side="left" onClose={onClose} testId="cast-drawer">
      <input className={`${input} mb-3`} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />

      <h3 className="mb-2 text-sm uppercase tracking-wide opacity-60">Characters</h3>
      <div className="mb-4 flex flex-col gap-2">
        {characters.length === 0 && <p className="text-sm opacity-60">No characters.</p>}
        {characters.map((c) => (
          <CastRow
            key={c.id}
            owner={{ kind: 'character', id: c.id }}
            name={c.name}
            badge={c.type.toUpperCase()}
            stage={stage}
            onPictures={() => setDialog({ kind: 'pictures', title: `Pictures: ${c.name}`, owner: { characterId: c.id } })}
          />
        ))}
      </div>

      <h3 className="mb-2 text-sm uppercase tracking-wide opacity-60">Temp NPCs</h3>
      <button className={`${btn} mb-2 w-full`} data-testid="new-temp-npc" onClick={() => setDialog({ kind: 'new-npc', folderId: null })}>
        New temp NPC
      </button>
      <LibraryTree
        folders={library.tempNpcFolders}
        items={library.tempNpcs.filter((t) => t.name.toLowerCase().includes(q))}
        folderEvent="temp_npc_folder"
        emptyText="No temp NPCs yet."
        onAddItem={(folderId) => setDialog({ kind: 'new-npc', folderId })}
        renderItem={(t) => (
          <div className="mb-2">
            <CastRow
              owner={{ kind: 'temp_npc', id: t.id }}
              name={t.name}
              badge="TEMP"
              stage={stage}
              onPictures={() => setDialog({ kind: 'pictures', title: `Pictures: ${t.name}`, owner: { tempNpcId: t.id } })}
              extra={
                <>
                  <button className={btn} onClick={() => setDialog({ kind: 'rename-npc', npc: t })}>
                    Rename
                  </button>
                  <button className={btn} onClick={() => setDialog({ kind: 'move-npc', npc: t })}>
                    Move
                  </button>
                  <button className={btnDanger} onClick={() => setDialog({ kind: 'delete-npc', npc: t })}>
                    Delete
                  </button>
                </>
              }
            />
          </div>
        )}
      />

      {dialog?.kind === 'pictures' && <PicturesDialog title={dialog.title} owner={dialog.owner} onClose={done} />}
      {dialog?.kind === 'new-npc' && <NewTempNpcDialog folders={library.tempNpcFolders} folderId={dialog.folderId} onClose={done} />}
      {dialog?.kind === 'rename-npc' && <RenameNpc npc={dialog.npc} onClose={done} />}
      {dialog?.kind === 'move-npc' && (
        <MoveDialog
          title={`Move ${dialog.npc.name}`}
          folders={library.tempNpcFolders}
          current={dialog.npc.folderId}
          run={(folderId) => call('temp_npc:move', { id: dialog.npc.id, folderId })}
          onClose={done}
        />
      )}
      {dialog?.kind === 'delete-npc' && (
        <ConfirmDialog
          title="Delete temp NPC"
          text={`Delete ${dialog.npc.name} and its pictures? This cannot be undone.`}
          label="Delete"
          run={() => call('temp_npc:delete', { id: dialog.npc.id })}
          onClose={done}
        />
      )}
    </Drawer>
  );
}

function RenameNpc({ npc, onClose }) {
  const [name, setName] = useState(npc.name);
  return (
    <ActionDialog
      title="Rename temp NPC"
      submitLabel="Rename"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('temp_npc:rename', { id: npc.id, name })}
    >
      <NameField label="Name" value={name} onChange={setName} />
    </ActionDialog>
  );
}
