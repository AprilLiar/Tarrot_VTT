import { useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { ActionDialog, FolderSelect, NameField } from '../folderUi.jsx';
import { prepareImage, prepareImageInfo } from '../../lib/image.js';
import { LibraryTree } from './LibraryTree.jsx';
import { PicturesDialog, uploadPicture } from './Pictures.jsx';
import { useT } from '../../i18n.jsx';
import { T } from '../../../../shared/localization.js';

// GM-only side panels over the scene: Scenes (right) and Cast (left).

function Drawer({ title, side, onClose, children, testId }) {
  const t = useT();
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" data-no-pan />
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
            {t('Close')}
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
  const t = useT();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(folderId);
  const pick = useImagePicker('background');
  return (
    <ActionDialog
      title={t('New scene')}
      submitLabel={t('Create')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={async () => {
        let data;
        if (pick.file) {
          try {
            data = await pick.prepare();
          } catch (err) {
            return { ok: false, error: t(err.message) };
          }
        }
        return call('scene:create', { name, folderId: folder, data });
      }}
    >
      <NameField label={t('Name')} value={name} onChange={setName} />
      <FolderSelect label={t('Folder')} folders={folders} value={folder} onChange={setFolder} />
      {pick.input}
      <button type="button" className={btn} data-testid="choose-background" onClick={pick.open}>
        {pick.file ? t('Background: {name}', { name: pick.file.name }) : t('Choose a background picture')}
      </button>
    </ActionDialog>
  );
}

function RenameSceneDialog({ scene, onClose }) {
  const t = useT();
  const [name, setName] = useState(scene.name);
  return (
    <ActionDialog
      title={t('Rename scene')}
      submitLabel={t('Rename')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('scene:rename', { id: scene.id, name })}
    >
      <NameField label={t('Name')} value={name} onChange={setName} />
    </ActionDialog>
  );
}

function MoveDialog({ title, folders, current, run, onClose }) {
  const t = useT();
  const [dest, setDest] = useState(current);
  return (
    <ActionDialog title={title} submitLabel={t('Move')} onClose={onClose} run={() => run(dest)}>
      <FolderSelect label={t('Move to')} folders={folders} value={dest} onChange={setDest} />
    </ActionDialog>
  );
}

function BackgroundDialog({ scene, onClose }) {
  const t = useT();
  const pick = useImagePicker('background');
  return (
    <ActionDialog
      title={t('Background: {name}', { name: scene.name })}
      submitLabel={t('Replace')}
      onClose={onClose}
      canSubmit={!!pick.file}
      run={async () => {
        try {
          return call('scene:set_image', { id: scene.id, data: await pick.prepare() });
        } catch (err) {
          return { ok: false, error: t(err.message) };
        }
      }}
    >
      {pick.input}
      <button type="button" className={btn} onClick={pick.open}>
        {pick.file ? pick.file.name : t('Choose a new background picture')}
      </button>
    </ActionDialog>
  );
}

// A battle map is a picture of the place seen from above; its shape is kept so the grid fits.
function BattleMapDialog({ scene, onClose }) {
  const t = useT();
  const [file, setFile] = useState(null);
  const ref = useRef(null);
  return (
    <ActionDialog
      title={t('Battle map: {name}', { name: scene.name })}
      submitLabel={t('Upload')}
      onClose={onClose}
      canSubmit={!!file}
      run={async () => {
        try {
          const { data, width, height } = await prepareImageInfo(file, 'background');
          return call('scene:set_battle_image', { id: scene.id, data, aspect: width / height });
        } catch (err) {
          return { ok: false, error: t(err.message) };
        }
      }}
    >
      <input ref={ref} type="file" accept="image/*" hidden data-testid="battle-file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
      <button type="button" className={btn} onClick={() => ref.current?.click()}>
        {file ? file.name : t('Choose the battle map picture')}
      </button>
      <p className="text-xs opacity-60">{t('After uploading, switch to Battle and use Set grid to line the squares up with the map.')}</p>
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
  const t = useT();
  const { library, stage } = useApp();
  const [dialog, setDialog] = useState(null);
  const done = () => setDialog(null);
  if (!library) return <Drawer title={t('Scenes')} side="right" onClose={onClose}>{t('Loading...')}</Drawer>;
  const activeId = stage.scene?.id ?? null;

  return (
    <Drawer title={t('Scenes')} side="right" onClose={onClose} testId="scenes-drawer">
      <button className={`${btnPrimary} mb-3 w-full`} data-testid="new-scene" onClick={() => setDialog({ kind: 'new', folderId: null })}>
        {t('New scene')}
      </button>
      <LibraryTree
        folders={library.sceneFolders}
        items={library.scenes}
        folderEvent="scene_folder"
        emptyText={t('No scenes yet.')}
        onAddItem={(folderId) => setDialog({ kind: 'new', folderId })}
        renderItem={(scene, { open, toggle }) => (
          <div data-testid="scene-row">
            <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left active:bg-white/10" onClick={toggle}>
              <span className="flex-1 truncate">{scene.name}</span>
              {scene.id === activeId && <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-xs">{t('Active')}</span>}
            </button>
            {open && (
              <div className="flex flex-wrap gap-2 pb-2">
                {scene.id === activeId ? (
                  <button className={btn} data-testid="deactivate-scene" onClick={() => call('scene:activate', { id: null })}>
                    {t('Deactivate')}
                  </button>
                ) : (
                  <button className={btnPrimary} data-testid="activate-scene" onClick={() => call('scene:activate', { id: scene.id })}>
                    {t('Activate')}
                  </button>
                )}
                <button className={btn} onClick={() => setDialog({ kind: 'rename', scene })}>
                  {t('Rename')}
                </button>
                <button className={btn} onClick={() => setDialog({ kind: 'background', scene })}>
                  {t('Background')}
                </button>
                <button className={btn} data-testid="battle-map-button" onClick={() => setDialog({ kind: 'battle-map', scene })}>
                  {scene.battleImageId ? t('Battle map (set)') : t('Battle map')}
                </button>
                <button className={btn} onClick={() => setDialog({ kind: 'move', scene })}>
                  {t('Move')}
                </button>
                <button className={btnDanger} onClick={() => setDialog({ kind: 'delete', scene })}>
                  {t('Delete')}
                </button>
              </div>
            )}
          </div>
        )}
      />
      {dialog?.kind === 'new' && <NewSceneDialog folders={library.sceneFolders} folderId={dialog.folderId} onClose={done} />}
      {dialog?.kind === 'rename' && <RenameSceneDialog scene={dialog.scene} onClose={done} />}
      {dialog?.kind === 'background' && <BackgroundDialog scene={dialog.scene} onClose={done} />}
      {dialog?.kind === 'battle-map' && <BattleMapDialog scene={dialog.scene} onClose={done} />}
      {dialog?.kind === 'move' && (
        <MoveDialog
          title={t('Move {name}', { name: dialog.scene.name })}
          folders={library.sceneFolders}
          current={dialog.scene.folderId}
          run={(folderId) => call('scene:move', { id: dialog.scene.id, folderId })}
          onClose={done}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={t('Delete scene')}
          text={t('Delete {name} and everyone standing on it? This cannot be undone.', { name: dialog.scene.name })}
          label={t('Delete')}
          run={() => call('scene:delete', { id: dialog.scene.id })}
          onClose={done}
        />
      )}
    </Drawer>
  );
}

// ---- Cast -----------------------------------------------------------------------

function NewTempNpcDialog({ folders, folderId, onClose }) {
  const t = useT();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(folderId);
  const [isProp, setIsProp] = useState(false);
  const [size, setSize] = useState(1);
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  return (
    <ActionDialog
      title={t('New temp NPC')}
      submitLabel={t('Create')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={async () => {
        const r = await call('temp_npc:create', { name, folderId: folder, isProp, size });
        if (r.ok && file) return uploadPicture({ tempNpcId: r.id }, file, name, t);
        return r;
      }}
    >
      <p className="text-xs opacity-60">{t('A quick, sheet-less extra for the story. It only needs a name and a picture.')}</p>
      <NameField label={t('Name')} value={name} onChange={setName} />
      <FolderSelect label={t('Folder')} folders={folders} value={folder} onChange={setFolder} />
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" data-testid="temp-npc-prop" checked={isProp} onChange={(e) => setIsProp(e.target.checked)} />
        {t('A prop or terrain (a crate, a tree, a wall) rather than a creature')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('Token size on the battle map')}
        <select className={input} data-testid="temp-npc-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}x{n}
            </option>
          ))}
        </select>
      </label>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="temp-npc-file" onChange={(e) => setFile(e.target.files[0] ?? null)} />
      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
        {file ? t('Picture: {name}', { name: file.name }) : t('Choose a first picture (optional)')}
      </button>
    </ActionDialog>
  );
}

// One summonable row: a character or a temp NPC.
function CastRow({ owner, name, badge, stage, onPictures, extra }) {
  const t = useT();
  const { toast } = useApp();
  const battleMode = stage.mode === 'battle';
  const onStage = battleMode
    ? stage.battle?.tokens.find((tk) => tk.ownerKind === owner.kind && tk.ownerId === owner.id)
    : stage.summons.find((s) => s.ownerKind === owner.kind && s.ownerId === owner.id);
  const key = owner.kind === 'character' ? { characterId: owner.id } : { tempNpcId: owner.id };

  async function toggle() {
    // In Battle mode the same list places tokens on the map instead of summoning to the stage.
    if (battleMode) {
      const r = await call(onStage ? 'battle:remove' : 'battle:add', onStage ? { id: onStage.id } : key);
      if (!r.ok) {
        toast(r.error);
        if (r.code === 'no_picture') onPictures();
      }
      return;
    }
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
        {badge && <span className={`rounded px-1.5 py-0.5 text-xs ${badge === 'PC' ? 'bg-emerald-800' : 'bg-slate-700'}`}>{t(badge)}</span>}
        <span className="flex-1 truncate">{name}</span>
        {onStage && <span className="text-xs opacity-60">{onStage.hidden ? t('hidden') : battleMode ? t('on map') : t('on stage')}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={onStage ? btn : btnPrimary} data-testid={onStage ? 'dismiss-cast' : 'summon-cast'} onClick={toggle}>
          {battleMode ? (onStage ? t('Remove token') : t('Place token')) : onStage ? t('Dismiss') : t('Summon')}
        </button>
        <button className={btn} data-testid="cast-pictures" onClick={onPictures}>
          {t('Pictures')}
        </button>
        {onStage && !battleMode && (
          <button
            className={btn}
            data-testid="cast-reset-spot"
            onClick={async () => {
              const r = await call('stage:move', { id: onStage.id, reset: true });
              if (!r.ok) toast(r.error);
            }}
          >
            {t('Reset spot')}
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

// The characters in their folders (as on the Characters page). Folders are collapsed until opened; a search opens
// every folder that holds a match.
function CharacterTree({ folders, characters, searching, renderRow }) {
  const t = useT();
  const [open, setOpen] = useState(() => new Set());
  const inside = (folderId) => characters.filter((c) => c.folderId === folderId);
  const total = (folderId) => inside(folderId).length + folders.filter((f) => f.parentId === folderId).reduce((n, f) => n + total(f.id), 0);
  const toggle = (id) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function branch(parentId, depth) {
    return (
      <>
        {folders
          .filter((f) => f.parentId === parentId && (!searching || total(f.id) > 0))
          .map((f) => {
            const shown = searching || open.has(f.id);
            return (
              <li key={`f${f.id}`} style={{ paddingLeft: depth ? 12 : 0 }} data-testid="cast-folder-item">
                <button
                  data-testid="cast-folder"
                  data-name={f.name}
                  aria-expanded={shown}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-medium active:bg-white/10"
                  onClick={() => toggle(f.id)}
                >
                  <span aria-hidden>{shown ? '[-]' : '[+]'}</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs opacity-60" aria-label={t('{n} characters', { n: total(f.id) })}>
                    {total(f.id)}
                  </span>
                </button>
                {shown && <ul className="flex flex-col gap-2 pb-2">{branch(f.id, depth + 1)}</ul>}
              </li>
            );
          })}
        {inside(parentId).map((c) => (
          <li key={`c${c.id}`} style={{ paddingLeft: depth ? 12 : 0 }}>
            {renderRow(c)}
          </li>
        ))}
      </>
    );
  }
  return <ul className="flex flex-col gap-2">{branch(null, 0)}</ul>;
}

export function CastDrawer({ onClose }) {
  const t = useT();
  const { roster, library, stage } = useApp();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const done = () => setDialog(null);
  const q = query.trim().toLowerCase();
  const characters = (roster?.characters ?? []).filter((c) => c.name.toLowerCase().includes(q));

  if (!library) return <Drawer title={t('Cast')} side="left" onClose={onClose}>{t('Loading...')}</Drawer>;

  return (
    <Drawer title={t('Cast')} side="left" onClose={onClose} testId="cast-drawer">
      <input className={`${input} mb-3`} placeholder={t('Search')} value={query} onChange={(e) => setQuery(e.target.value)} />

      <h3 className="mb-2 text-sm uppercase tracking-wide opacity-60">{t('Characters')}</h3>
      <div className="mb-4">
        {characters.length === 0 && <p className="text-sm opacity-60">{t('No characters.')}</p>}
        <CharacterTree
          folders={roster?.folders ?? []}
          characters={characters}
          searching={q.length > 0}
          renderRow={(c) => (
            <CastRow
              owner={{ kind: 'character', id: c.id }}
              name={c.name}
              badge={c.type === 'pc' ? T('PC') : T('NPC')}
              stage={stage}
              onPictures={() => setDialog({ kind: 'pictures', title: t('Pictures: {name}', { name: c.name }), owner: { characterId: c.id } })}
            />
          )}
        />
      </div>

      <h3 className="mb-2 text-sm uppercase tracking-wide opacity-60">{t('Temp NPCs')}</h3>
      <button className={`${btn} mb-2 w-full`} data-testid="new-temp-npc" onClick={() => setDialog({ kind: 'new-npc', folderId: null })}>
        {t('New temp NPC')}
      </button>
      <LibraryTree
        folders={library.tempNpcFolders}
        items={library.tempNpcs.filter((n) => n.name.toLowerCase().includes(q))}
        folderEvent="temp_npc_folder"
        emptyText={t('No temp NPCs yet.')}
        onAddItem={(folderId) => setDialog({ kind: 'new-npc', folderId })}
        renderItem={(n) => (
          <div className="mb-2">
            <CastRow
              owner={{ kind: 'temp_npc', id: n.id }}
              name={n.name}
              badge={n.isProp ? T('PROP') : T('TEMP')}
              stage={stage}
              onPictures={() => setDialog({ kind: 'pictures', title: t('Pictures: {name}', { name: n.name }), owner: { tempNpcId: n.id } })}
              extra={
                <>
                  <select
                    className={`${btn} px-2`}
                    aria-label={t('Token size of {name}', { name: n.name })}
                    value={n.size}
                    onChange={(e) => call('temp_npc:set_size', { id: n.id, size: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}x{n}
                      </option>
                    ))}
                  </select>
                  <button className={btn} onClick={() => setDialog({ kind: 'rename-npc', npc: n })}>
                    {t('Rename')}
                  </button>
                  <button className={btn} onClick={() => setDialog({ kind: 'move-npc', npc: n })}>
                    {t('Move')}
                  </button>
                  <button className={btnDanger} onClick={() => setDialog({ kind: 'delete-npc', npc: n })}>
                    {t('Delete')}
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
          title={t('Move {name}', { name: dialog.npc.name })}
          folders={library.tempNpcFolders}
          current={dialog.npc.folderId}
          run={(folderId) => call('temp_npc:move', { id: dialog.npc.id, folderId })}
          onClose={done}
        />
      )}
      {dialog?.kind === 'delete-npc' && (
        <ConfirmDialog
          title={t('Delete temp NPC')}
          text={t('Delete {name} and its pictures? This cannot be undone.', { name: dialog.npc.name })}
          label={t('Delete')}
          run={() => call('temp_npc:delete', { id: dialog.npc.id })}
          onClose={done}
        />
      )}
    </Drawer>
  );
}

function RenameNpc({ npc, onClose }) {
  const t = useT();
  const [name, setName] = useState(npc.name);
  return (
    <ActionDialog
      title={t('Rename temp NPC')}
      submitLabel={t('Rename')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('temp_npc:rename', { id: npc.id, name })}
    >
      <NameField label={t('Name')} value={name} onChange={setName} />
    </ActionDialog>
  );
}
