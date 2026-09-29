import * as scenes from './scenes.js';
import { storeImage, deleteImageIfUnused } from './images.js';
import { AppError } from './errors.js';

// Socket events for scenes, the stage, temp NPCs and pictures.
//
// Who may do what (all checked here, from the socket's server-side identity):
//  - GM: everything. Library changes (scenes, temp NPCs, folders) are GM only.
//  - A player: manage the pictures of their own PC, and summon or dismiss their
//    own PC on the stage.
//  - The Display Screen: watch the stage and reorder it by dragging.
//  - Hidden summons are filtered out on the server for everyone but the GM.

export function registerSceneHandlers(ctx) {
  const { io, db, on, identity, isGm, isPlayer, isDisplay, requireControl, rooms } = ctx;
  const { GM_ROOM, VIEW_ROOM, charRoom } = rooms;

  // --- helpers --------------------------------------------------------------

  async function broadcastStage() {
    const [full, filtered] = await Promise.all([
      scenes.buildStage(db, { forGm: true }),
      scenes.buildStage(db, { forGm: false }),
    ]);
    io.to(GM_ROOM).emit('stage:updated', full);
    io.to(VIEW_ROOM).emit('stage:updated', filtered);
  }

  async function library() {
    const [sceneFolders, sceneList, tempFolders, tempNpcs] = await Promise.all([
      scenes.sceneFolders.list(db),
      scenes.listScenes(db),
      scenes.tempNpcFolders.list(db),
      scenes.listTempNpcs(db),
    ]);
    return { sceneFolders, scenes: sceneList, tempNpcFolders: tempFolders, tempNpcs };
  }

  async function broadcastLibrary() {
    io.to(GM_ROOM).emit('library:updated', await library());
  }

  async function broadcastPictures(owner) {
    const pictures = await scenes.listPictures(db, owner);
    const payload = { ownerKind: owner.kind, ownerId: owner.id, pictures };
    const target = io.to(GM_ROOM);
    if (owner.kind === 'character') target.to(charRoom(owner.id));
    target.emit('pictures:updated', payload);
  }

  // The owner of a picture (or the target of a new one) must be one the caller controls.
  async function requireOwnerControl(owner) {
    if (owner.kind === 'character') return requireControl(owner.id);
    if (!isGm()) throw new AppError('forbidden', 'GM only.');
    return scenes.requireOwner(db, owner);
  }

  const ownerFrom = (p) => scenes.ownerOf(p);

  // Wraps a mutation that changes the library.
  const gmLibrary = (event, fn) =>
    on(event, { gmOnly: true }, async (p) => {
      const result = await fn(p);
      await broadcastLibrary();
      return result;
    });

  // --- reading --------------------------------------------------------------

  on('library:get', { gmOnly: true }, async () => ({ library: await library() }));

  // The stage as this socket is allowed to see it.
  on('stage:get', { needsIdentity: true }, async () => ({
    stage: await scenes.buildStage(db, { forGm: isGm() }),
  }));

  on('picture:list', { needsIdentity: true }, async (p) => {
    const owner = ownerFrom(p);
    // Anyone who may summon a character can see its pictures; players see their own PC's.
    if (owner.kind === 'character') await requireControl(owner.id);
    else if (!isGm()) throw new AppError('forbidden', 'GM only.');
    return { pictures: await scenes.listPictures(db, owner) };
  });

  // --- scene folders and scenes (GM) ------------------------------------------

  gmLibrary('scene_folder:create', async (p) => ({ id: await scenes.sceneFolders.create(db, p) }));
  gmLibrary('scene_folder:rename', (p) => scenes.sceneFolders.rename(db, p.id, p.name));
  gmLibrary('scene_folder:move', (p) => scenes.sceneFolders.move(db, p.id, p.parentId ?? null));
  gmLibrary('scene_folder:delete', (p) => scenes.sceneFolders.remove(db, p.id));

  gmLibrary('scene:create', async (p) => {
    const imageId = p.data ? await storeImage(db, p.data) : null;
    try {
      return { id: await scenes.createScene(db, { name: p.name, folderId: p.folderId ?? null, imageId }) };
    } catch (err) {
      await deleteImageIfUnused(db, imageId);
      throw err;
    }
  });
  gmLibrary('scene:rename', (p) => scenes.renameScene(db, p.id, p.name));
  gmLibrary('scene:move', (p) => scenes.moveScene(db, p.id, p.folderId ?? null));
  gmLibrary('scene:set_image', async (p) => {
    await scenes.getScene(db, p.id);
    const imageId = await storeImage(db, p.data);
    await scenes.setSceneImage(db, p.id, imageId);
    await broadcastStage();
  });
  gmLibrary('scene:delete', async (p) => {
    await scenes.deleteScene(db, p.id);
    await broadcastStage();
  });

  on('scene:activate', { gmOnly: true }, async (p) => {
    await scenes.setActiveScene(db, p.id ?? null);
    await broadcastStage();
  });

  // --- temp NPCs (GM) -----------------------------------------------------------

  gmLibrary('temp_npc_folder:create', async (p) => ({ id: await scenes.tempNpcFolders.create(db, p) }));
  gmLibrary('temp_npc_folder:rename', (p) => scenes.tempNpcFolders.rename(db, p.id, p.name));
  gmLibrary('temp_npc_folder:move', (p) => scenes.tempNpcFolders.move(db, p.id, p.parentId ?? null));
  gmLibrary('temp_npc_folder:delete', (p) => scenes.tempNpcFolders.remove(db, p.id));

  gmLibrary('temp_npc:create', async (p) => ({ id: await scenes.createTempNpc(db, p) }));
  gmLibrary('temp_npc:rename', async (p) => {
    await scenes.renameTempNpc(db, p.id, p.name);
    await broadcastStage();
  });
  gmLibrary('temp_npc:move', (p) => scenes.moveTempNpc(db, p.id, p.folderId ?? null));
  gmLibrary('temp_npc:delete', async (p) => {
    await scenes.deleteTempNpc(db, p.id);
    await broadcastStage();
  });

  // --- pictures -------------------------------------------------------------------

  on('picture:add', { needsIdentity: true }, async (p) => {
    const owner = ownerFrom(p);
    await requireOwnerControl(owner);
    const imageId = await storeImage(db, p.data);
    let id;
    try {
      id = await scenes.addPicture(db, owner, imageId, p.name);
    } catch (err) {
      await deleteImageIfUnused(db, imageId);
      throw err;
    }
    await broadcastPictures(owner);
    return { id };
  });

  async function pictureOwner(id) {
    const pic = await scenes.getPicture(db, id);
    const owner = { kind: pic.ownerKind, id: pic.ownerId };
    await requireOwnerControl(owner);
    return owner;
  }

  on('picture:rename', { needsIdentity: true }, async (p) => {
    const owner = await pictureOwner(p.id);
    await scenes.renamePicture(db, p.id, p.name);
    await broadcastPictures(owner);
  });

  on('picture:delete', { needsIdentity: true }, async (p) => {
    const owner = await pictureOwner(p.id);
    await scenes.deletePicture(db, p.id);
    await broadcastPictures(owner);
    await broadcastStage();
  });

  // --- the stage ---------------------------------------------------------------------

  // The GM can summon anyone; a player only their own PC.
  on('stage:summon', { needsIdentity: true }, async (p) => {
    const owner = ownerFrom(p);
    if (isDisplay()) throw new AppError('forbidden', 'The Display Screen cannot summon.');
    if (!isGm()) {
      if (owner.kind !== 'character' || owner.id !== identity().characterId) {
        throw new AppError('forbidden', 'You can only summon your own character.');
      }
    }
    const id = await scenes.summon(db, owner, Number.isInteger(p.pictureId) ? p.pictureId : undefined);
    await broadcastStage();
    return { id };
  });

  on('stage:dismiss', { needsIdentity: true }, async (p) => {
    if (isDisplay()) throw new AppError('forbidden', 'The Display Screen cannot dismiss.');
    if (!isGm()) {
      const owner = await scenes.summonOwner(db, p.id);
      if (owner.kind !== 'character' || owner.id !== identity().characterId) {
        throw new AppError('forbidden', 'You can only dismiss your own character.');
      }
    }
    await scenes.dismiss(db, p.id);
    await broadcastStage();
  });

  on('stage:update', { gmOnly: true }, async (p) => {
    await scenes.updateSummon(db, p.id, { pictureId: p.pictureId, scale: p.scale, hidden: p.hidden });
    await broadcastStage();
  });

  // The GM and the Display Screen can rearrange a side by dragging.
  on('stage:reorder', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can reorder.');
    await scenes.reorderSide(db, p.side, p.ids);
    await broadcastStage();
  });

  return { broadcast: broadcastStage, isPlayer };
}
