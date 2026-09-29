import { useEffect, useRef, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary, input } from '../Dialog.jsx';
import { imageUrl, prepareImage } from '../../lib/image.js';

// The picture collection of one character or temp NPC. The same pictures are
// used as Scene art and (later) as Battle tokens. `owner` is { characterId } or { tempNpcId }.

const sameOwner = (owner, p) =>
  owner.characterId != null ? p.ownerKind === 'character' && p.ownerId === owner.characterId : p.ownerKind === 'temp_npc' && p.ownerId === owner.tempNpcId;

export function usePictures(owner) {
  const [pictures, setPictures] = useState(null);
  const key = owner.characterId != null ? `c${owner.characterId}` : `t${owner.tempNpcId}`;
  useEffect(() => {
    let live = true;
    const load = () =>
      call('picture:list', owner).then((r) => {
        if (live && r.ok) setPictures(r.pictures);
      });
    const onUpdated = (u) => {
      if (sameOwner(owner, u)) setPictures(u.pictures);
    };
    load();
    socket.on('pictures:updated', onUpdated);
    socket.on('connect', load);
    return () => {
      live = false;
      socket.off('pictures:updated', onUpdated);
      socket.off('connect', load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return pictures;
}

// Choose a file, resize it in the browser, upload it. Resolves to the ack.
export async function uploadPicture(owner, file, name) {
  let data;
  try {
    data = await prepareImage(file, 'character');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return call('picture:add', { ...owner, name, data });
}

export function PicturesManager({ owner }) {
  const { toast } = useApp();
  const pictures = usePictures(owner);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(null);

  async function onFile(e) {
    const files = [...e.target.files];
    e.target.value = '';
    setBusy(true);
    for (const file of files) {
      const r = await uploadPicture(owner, file, file.name.replace(/\.[^.]+$/, ''));
      if (!r.ok) toast(r.error ?? 'Upload failed.');
    }
    setBusy(false);
  }

  return (
    <div data-testid="pictures">
      {pictures === null && <p className="text-sm opacity-60">Loading...</p>}
      {pictures?.length === 0 && <p className="text-sm opacity-60">No pictures yet. Add one to use this character on a scene.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {pictures?.map((p) => (
          <div key={p.id} className="flex flex-col gap-1 rounded-lg bg-white/5 p-1" data-testid="picture">
            <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-[repeating-conic-gradient(#222_0%_25%,#2c2c2c_0%_50%)] bg-[length:16px_16px]">
              <img src={imageUrl(p.imageId)} alt={p.name || 'Picture'} className="max-h-full max-w-full object-contain" />
            </div>
            <button className="truncate text-left text-xs opacity-80" onClick={() => setRenaming(p)}>
              {p.name || 'Untitled'}
            </button>
            <button
              className="min-h-8 rounded bg-white/10 text-xs active:bg-white/20"
              aria-label={`Delete ${p.name || 'picture'}`}
              onClick={async () => {
                const r = await call('picture:delete', { id: p.id });
                if (!r.ok) toast(r.error);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden data-testid="picture-file" onChange={onFile} />
      <button className={`${btn} mt-2 w-full`} disabled={busy} data-testid="add-picture" onClick={() => fileRef.current?.click()}>
        {busy ? 'Uploading...' : 'Add pictures'}
      </button>
      {renaming && <RenamePicture picture={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}

function RenamePicture({ picture, onClose }) {
  const [name, setName] = useState(picture.name);
  return (
    <Dialog title="Rename picture" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await call('picture:rename', { id: picture.id, name });
          onClose();
        }}
      >
        <input className={input} value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PicturesDialog({ title, owner, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <PicturesManager owner={owner} />
      <div className="mt-3 flex justify-end">
        <button className={btn} onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
