import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, useApp } from '../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';
import { ActionDialog, FolderSelect, NameField, descendantIds } from './folderUi.jsx';

function CreateCharacterDialog({ folders, folderId, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('pc');
  const [folder, setFolder] = useState(folderId);
  return (
    <ActionDialog
      title="New character"
      submitLabel="Create"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('character:create', { name, type, folderId: folder })}
    >
      <NameField label="Name" value={name} onChange={setName} />
      <div className="flex gap-2" role="radiogroup" aria-label="Type">
        {[
          ['pc', 'PC'],
          ['npc', 'NPC'],
        ].map(([v, text]) => (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={type === v}
            className={`${btn} flex-1 ${type === v ? 'ring-2 ring-violet-500' : ''}`}
            onClick={() => setType(v)}
          >
            {text}
          </button>
        ))}
      </div>
      <FolderSelect label="Folder" folders={folders} value={folder} onChange={setFolder} />
    </ActionDialog>
  );
}

function CreateFolderDialog({ folders, parentId, onClose }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState(parentId);
  return (
    <ActionDialog
      title="New folder"
      submitLabel="Create"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call('folder:create', { name, parentId: parent })}
    >
      <NameField label="Name" value={name} onChange={setName} />
      <FolderSelect label="Inside" folders={folders} value={parent} onChange={setParent} />
    </ActionDialog>
  );
}

function RenameDialog({ target, onClose }) {
  const [name, setName] = useState(target.name);
  return (
    <ActionDialog
      title={`Rename ${target.kind}`}
      submitLabel="Rename"
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call(`${target.kind}:rename`, { id: target.id, name })}
    >
      <NameField label="Name" value={name} onChange={setName} />
    </ActionDialog>
  );
}

function MoveDialog({ target, folders, onClose }) {
  const [dest, setDest] = useState(target.parentId);
  const exclude = target.kind === 'folder' ? descendantIds(folders, target.id) : undefined;
  const payload =
    target.kind === 'folder'
      ? { id: target.id, parentId: dest }
      : { id: target.id, folderId: dest };
  return (
    <ActionDialog
      title={`Move ${target.name}`}
      submitLabel="Move"
      onClose={onClose}
      run={() => call(`${target.kind}:move`, payload)}
    >
      <FolderSelect label="Move to" folders={folders} value={dest} onChange={setDest} exclude={exclude} />
    </ActionDialog>
  );
}

function DeleteCharacterDialog({ target, onClose }) {
  const [typed, setTyped] = useState('');
  return (
    <ActionDialog
      title="Delete character"
      submitLabel="Delete forever"
      danger
      onClose={onClose}
      canSubmit={typed.trim() === target.name}
      run={() => call('character:delete', { id: target.id, confirmName: typed })}
    >
      <p className="text-sm">
        This permanently deletes <strong>{target.name}</strong> and cannot be undone. Type the name to confirm.
      </p>
      <input
        className={input}
        aria-label="Type the name to confirm"
        value={typed}
        autoFocus
        onChange={(e) => setTyped(e.target.value)}
      />
    </ActionDialog>
  );
}

function DeleteFolderDialog({ target, onClose }) {
  return (
    <ActionDialog
      title="Delete folder"
      submitLabel="Delete"
      danger
      onClose={onClose}
      run={() => call('folder:delete', { id: target.id })}
    >
      <p className="text-sm">
        Delete the folder <strong>{target.name}</strong>? Only empty folders can be deleted.
      </p>
    </ActionDialog>
  );
}

function RowActions({ onOpen, onRename, onMove, onDelete }) {
  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {onOpen && (
        <button className={btnPrimary} data-testid="open-sheet" onClick={onOpen}>
          Open sheet
        </button>
      )}
      <button className={btn} onClick={onRename}>
        Rename
      </button>
      <button className={btn} onClick={onMove}>
        Move
      </button>
      <button className={btnDanger} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

export default function Roster() {
  const { roster } = useApp();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const close = () => setDialog(null);

  if (!roster) return <p className="p-4 text-sm opacity-70">Loading roster...</p>;
  const { folders, characters } = roster;

  const toggle = (key) => setOpenRow((cur) => (cur === key ? null : key));

  function characterRows(folderId, depth) {
    return characters
      .filter((c) => c.folderId === folderId)
      .map((c) => {
        const key = `c${c.id}`;
        return (
          <li key={key} style={{ paddingLeft: depth * 16 }}>
            <button
              data-testid="character-row"
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left active:bg-white/10"
              onClick={() => toggle(key)}
            >
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${c.type === 'pc' ? 'bg-emerald-800' : 'bg-slate-700'}`}
              >
                {c.type.toUpperCase()}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
            </button>
            {openRow === key && (
              <RowActions
                onOpen={() => navigate(`/character/${c.id}`)}
                onRename={() => setDialog({ kind: 'rename', target: { kind: 'character', id: c.id, name: c.name } })}
                onMove={() =>
                  setDialog({
                    kind: 'move',
                    target: { kind: 'character', id: c.id, name: c.name, parentId: c.folderId },
                  })
                }
                onDelete={() => setDialog({ kind: 'delete-character', target: c })}
              />
            )}
          </li>
        );
      });
  }

  function tree(parentId, depth) {
    return folders
      .filter((f) => f.parentId === parentId)
      .map((f) => {
        const key = `f${f.id}`;
        return (
          <li key={key} style={{ paddingLeft: depth * 16 }}>
            <button
              data-testid="folder-row"
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-medium active:bg-white/10"
              onClick={() => toggle(key)}
            >
              <span aria-hidden>[+]</span>
              <span className="flex-1 truncate">{f.name}</span>
            </button>
            {openRow === key && (
              <div className="flex flex-wrap gap-2 pb-2">
                <button className={btn} onClick={() => setDialog({ kind: 'new-character', folderId: f.id })}>
                  Add character
                </button>
                <button className={btn} onClick={() => setDialog({ kind: 'new-folder', parentId: f.id })}>
                  Add subfolder
                </button>
                <RowActions
                  onRename={() => setDialog({ kind: 'rename', target: { kind: 'folder', id: f.id, name: f.name } })}
                  onMove={() =>
                    setDialog({
                      kind: 'move',
                      target: { kind: 'folder', id: f.id, name: f.name, parentId: f.parentId },
                    })
                  }
                  onDelete={() => setDialog({ kind: 'delete-folder', target: f })}
                />
              </div>
            )}
            <ul>
              {tree(f.id, depth + 1)}
              {characterRows(f.id, depth + 1)}
            </ul>
          </li>
        );
      });
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-3 flex gap-2">
        <button className={btnPrimary} data-testid="new-character" onClick={() => setDialog({ kind: 'new-character', folderId: null })}>
          New character
        </button>
        <button className={btn} data-testid="new-folder" onClick={() => setDialog({ kind: 'new-folder', parentId: null })}>
          New folder
        </button>
      </div>

      {folders.length === 0 && characters.length === 0 && (
        <p className="text-sm opacity-60">Nothing here yet. Create your first character.</p>
      )}
      <ul>
        {tree(null, 0)}
        {characterRows(null, 0)}
      </ul>

      {dialog?.kind === 'new-character' && (
        <CreateCharacterDialog folders={folders} folderId={dialog.folderId} onClose={close} />
      )}
      {dialog?.kind === 'new-folder' && (
        <CreateFolderDialog folders={folders} parentId={dialog.parentId} onClose={close} />
      )}
      {dialog?.kind === 'rename' && <RenameDialog target={dialog.target} onClose={close} />}
      {dialog?.kind === 'move' && <MoveDialog target={dialog.target} folders={folders} onClose={close} />}
      {dialog?.kind === 'delete-character' && <DeleteCharacterDialog target={dialog.target} onClose={close} />}
      {dialog?.kind === 'delete-folder' && <DeleteFolderDialog target={dialog.target} onClose={close} />}
    </main>
  );
}
