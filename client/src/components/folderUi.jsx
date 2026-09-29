import { useState } from 'react';
import Dialog, { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';

// Folder and dialog pieces shared by the character roster and the scene and
// temp NPC libraries.

// Flatten the folder tree into [{ folder, depth }] in display order.
export function flatten(folders, parentId = null, depth = 0) {
  return folders
    .filter((f) => f.parentId === parentId)
    .flatMap((f) => [{ folder: f, depth }, ...flatten(folders, f.id, depth + 1)]);
}

export function descendantIds(folders, id) {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (f.parentId != null && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

// One generic dialog per action. `run` returns the server ack; errors are shown inline.
export function ActionDialog({ title, onClose, submitLabel, danger, canSubmit = true, run, children }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error ?? 'Something went wrong.');
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {children}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={danger ? btnDanger : btnPrimary} disabled={busy || !canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function NameField({ value, onChange, label }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className={input}
        value={value}
        maxLength={60}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function FolderSelect({ folders, value, onChange, exclude, label }) {
  const options = flatten(folders).filter(({ folder }) => !exclude?.has(folder.id));
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select
        className={input}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">(top level)</option>
        {options.map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {`${'  '.repeat(depth)}${folder.name}`}
          </option>
        ))}
      </select>
    </label>
  );
}

