import { useState } from 'react';
import { call } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary } from '../Dialog.jsx';
import { ActionDialog, FolderSelect, NameField, descendantIds } from '../folderUi.jsx';
import { useT } from '../../i18n.jsx';

// A nested list of folders and items (scenes, temp NPCs) with folder actions.
// `folderEvent` is the socket event prefix, for example 'scene_folder'.
// `renderItem(item, { open, toggle })` draws one item; the parent owns item actions.
export function LibraryTree({ folders, items, folderEvent, renderItem, emptyText, onAddItem }) {
  const t = useT();
  const [openFolder, setOpenFolder] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const close = () => setDialog(null);

  function branch(parentId, depth) {
    return (
      <>
        {folders
          .filter((f) => f.parentId === parentId)
          .map((f) => (
            <li key={`f${f.id}`} style={{ paddingLeft: depth ? 12 : 0 }}>
              <button
                data-testid="library-folder"
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-medium active:bg-white/10"
                onClick={() => setOpenFolder(openFolder === f.id ? null : f.id)}
              >
                <span aria-hidden>[+]</span>
                <span className="flex-1 truncate">{f.name}</span>
              </button>
              {openFolder === f.id && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {onAddItem && (
                    <button className={btnPrimary} onClick={() => onAddItem(f.id)}>
                      {t('Add here')}
                    </button>
                  )}
                  <button className={btn} onClick={() => setDialog({ kind: 'new', parentId: f.id })}>
                    {t('Subfolder')}
                  </button>
                  <button className={btn} onClick={() => setDialog({ kind: 'rename', folder: f })}>
                    {t('Rename')}
                  </button>
                  <button className={btn} onClick={() => setDialog({ kind: 'move', folder: f })}>
                    {t('Move')}
                  </button>
                  <button className={btnDanger} onClick={() => setDialog({ kind: 'delete', folder: f })}>
                    {t('Delete')}
                  </button>
                </div>
              )}
              <ul>{branch(f.id, depth + 1)}</ul>
            </li>
          ))}
        {items
          .filter((it) => it.folderId === parentId)
          .map((it) => (
            <li key={`i${it.id}`} style={{ paddingLeft: depth ? 12 : 0 }}>
              {renderItem(it, { open: openItem === it.id, toggle: () => setOpenItem(openItem === it.id ? null : it.id) })}
            </li>
          ))}
      </>
    );
  }

  return (
    <div>
      {folders.length === 0 && items.length === 0 && <p className="text-sm opacity-60">{emptyText}</p>}
      <ul>{branch(null, 0)}</ul>
      <button className={`${btn} mt-2 w-full`} data-testid={`new-${folderEvent}`} onClick={() => setDialog({ kind: 'new', parentId: null })}>
        {t('New folder')}
      </button>

      {dialog?.kind === 'new' && <NewFolder folders={folders} eventName={folderEvent} parentId={dialog.parentId} onClose={close} />}
      {dialog?.kind === 'rename' && (
        <RenameFolder eventName={folderEvent} folder={dialog.folder} onClose={close} />
      )}
      {dialog?.kind === 'move' && <MoveFolder eventName={folderEvent} folders={folders} folder={dialog.folder} onClose={close} />}
      {dialog?.kind === 'delete' && (
        <ActionDialog
          title={t('Delete folder')}
          submitLabel={t('Delete')}
          danger
          onClose={close}
          run={() => call(`${folderEvent}:delete`, { id: dialog.folder.id })}
        >
          <p className="text-sm">
            {t('Delete the folder {name}? Only empty folders can be deleted.', { name: dialog.folder.name })}
          </p>
        </ActionDialog>
      )}
    </div>
  );
}

function NewFolder({ folders, eventName, parentId, onClose }) {
  const t = useT();
  const [name, setName] = useState('');
  const [parent, setParent] = useState(parentId);
  return (
    <ActionDialog
      title={t('New folder')}
      submitLabel={t('Create')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call(`${eventName}:create`, { name, parentId: parent })}
    >
      <NameField label={t('Name')} value={name} onChange={setName} />
      <FolderSelect label={t('Inside')} folders={folders} value={parent} onChange={setParent} />
    </ActionDialog>
  );
}

function RenameFolder({ eventName, folder, onClose }) {
  const t = useT();
  const [name, setName] = useState(folder.name);
  return (
    <ActionDialog
      title={t('Rename folder')}
      submitLabel={t('Rename')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() => call(`${eventName}:rename`, { id: folder.id, name })}
    >
      <NameField label={t('Name')} value={name} onChange={setName} />
    </ActionDialog>
  );
}

function MoveFolder({ eventName, folders, folder, onClose }) {
  const t = useT();
  const [dest, setDest] = useState(folder.parentId);
  return (
    <ActionDialog
      title={t('Move {name}', { name: folder.name })}
      submitLabel={t('Move')}
      onClose={onClose}
      run={() => call(`${eventName}:move`, { id: folder.id, parentId: dest })}
    >
      <FolderSelect label={t('Move to')} folders={folders} value={dest} onChange={setDest} exclude={descendantIds(folders, folder.id)} />
    </ActionDialog>
  );
}
