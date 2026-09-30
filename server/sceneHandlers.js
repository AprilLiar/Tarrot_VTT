import * as scenes from './scenes.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
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
  const { io, db, on, identity, isGm, isPlayer, isDisplay, requireControl, emitSheet, shared, rooms } = ctx;
  const targets = shared.targets;
  const { GM_ROOM, VIEW_ROOM, charRoom } = rooms;

  // --- helpers --------------------------------------------------------------

  // The stage plus, for Battle mode, the map with its tokens (hidden ones only for the GM).
  async function stageFor(forGm) {
    const [stage, mode, battleState] = await Promise.all([
      scenes.buildStage(db, { forGm }),
      scenes.getMode(db),
      battle.buildBattle(db, { forGm, targets, combat: shared.combat ?? null }),
    ]);
    return { ...stage, mode, battle: battleState };
  }

  async function broadcastStage() {
    const [full, filtered] = await Promise.all([stageFor(true), stageFor(false)]);
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
    // BroadcastOperators are immutable: `.to()` returns a new one.
    const target = owner.kind === 'character' ? io.to(GM_ROOM).to(charRoom(owner.id)) : io.to(GM_ROOM);
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
  on('stage:get', { needsIdentity: true }, async () => ({ stage: await stageFor(isGm()) }));

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
  gmLibrary('temp_npc:set_size', async (p) => {
    await scenes.setTempNpcSize(db, p.id, p.size);
    await broadcastStage();
  });
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

  // --- Battle mode ---------------------------------------------------------------------

  // The GM switches between Scene and Battle; everyone watching follows.
  on('battle:mode', { gmOnly: true }, async (p) => {
    await scenes.setMode(db, p.mode);
    await broadcastStage();
  });

  gmLibrary('scene:set_battle_image', async (p) => {
    await scenes.getScene(db, p.id);
    const imageId = await storeImage(db, p.data);
    try {
      await scenes.setBattleImage(db, p.id, imageId, p.aspect);
    } catch (err) {
      await deleteImageIfUnused(db, imageId);
      throw err;
    }
    await battle.clampTokens(db, p.id);
    await broadcastStage();
  });

  gmLibrary('scene:set_grid', async (p) => {
    const size = await scenes.setGrid(db, p.id, p);
    await battle.clampTokens(db, p.id);
    await broadcastStage();
    return size;
  });

  // Tokens are placed by the GM. Their picture comes from the character's collection.
  on('battle:add', { gmOnly: true }, async (p) => {
    const id = await battle.addToken(db, scenes.ownerOf(p), Number.isInteger(p.pictureId) ? p.pictureId : undefined);
    await broadcastStage();
    return { id };
  });
  on('battle:remove', { gmOnly: true }, async (p) => {
    await battle.removeToken(db, p.id);
    for (const [who, tokenId] of targets) if (tokenId === p.id) targets.delete(who);
    await broadcastStage();
  });
  on('battle:update', { gmOnly: true }, async (p) => {
    await battle.updateToken(db, p.id, { pictureId: p.pictureId, hidden: p.hidden });
    if (p.hidden === true) for (const [who, tokenId] of targets) if (tokenId === p.id) targets.delete(who);
    await broadcastStage();
  });
  on('battle:clear_bank', { gmOnly: true }, async (p) => {
    await battle.clearBank(db, p.id);
    await broadcastStage();
  });

  // Dragging is free: it never changes AP or Movement. The GM and the Display can do it.
  on('battle:place', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can move tokens by dragging.');
    await battle.placeToken(db, p.id, p.col, p.row);
    await broadcastStage();
  });

  // One D-pad step. A player moves only their own PC's token; the GM moves any character's.
  on('battle:move', { needsIdentity: true }, async (p) => {
    const sceneId = await scenes.getActiveSceneId(db);
    if (sceneId == null) throw new AppError('no_scene', 'There is no active scene.');
    const token = await battle.getToken(db, p.tokenId);
    if (token.sceneId !== sceneId) throw new AppError('not_found', 'That token is not on the active map.');
    if (token.ownerKind === 'character') await requireControl(token.ownerId);
    else if (!isGm()) throw new AppError('forbidden', 'GM only.');
    if (token.hidden && !isGm()) throw new AppError('forbidden', 'You cannot move that.');
    // Movement is only paid on the character's own turn; there is no turn tracker yet, so every move is free.
    const isOwnTurn = shared.combat?.activeCharacterId === token.ownerId && token.ownerKind === 'character';
    const result = await battle.moveStep(db, {
      token,
      dc: p.dc,
      dr: p.dr,
      freeChecked: p.free === true,
      confirmAp: p.confirmAp === true,
      isOwnTurn,
    });
    if (result.moved) {
      if (result.sheetChanged) emitSheet(token.ownerId, await sheets.getSheet(db, token.ownerId));
      await broadcastStage();
    }
    return result;
  });

  // Targeting: which token a character has picked. In memory only; used by attacks in Phase 6.
  on('battle:target', { needsIdentity: true }, async (p) => {
    const characterId = p.characterId;
    await requireControl(characterId);
    if (p.tokenId == null) {
      targets.delete(characterId);
    } else {
      const token = await battle.getToken(db, p.tokenId);
      if (token.hidden && !isGm()) throw new AppError('not_found', 'That token is not on the map.');
      const sceneId = await scenes.getActiveSceneId(db);
      if (token.sceneId !== sceneId) throw new AppError('not_found', 'That token is not on the active map.');
      targets.set(characterId, token.id);
    }
    await broadcastStage();
  });

  // Drawings and spell templates: the GM and the Display can add them; anyone of them can
  // remove one; only the GM can clear them all. Pings are never stored.
  on('mark:add', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can draw.');
    const id = await battle.addMark(db, p.kind, p.data);
    await broadcastStage();
    return { id };
  });
  on('mark:remove', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can erase.');
    await battle.removeMark(db, p.id);
    await broadcastStage();
  });
  on('mark:clear', { gmOnly: true }, async (p) => {
    await battle.clearMarks(db, p.kind);
    await broadcastStage();
  });
  on('battle:ping', { needsIdentity: true }, (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can ping.');
    const ok = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    if (!ok(p.x) || !ok(p.y)) throw new AppError('bad_value', 'Ping the map.');
    const payload = { x: p.x, y: p.y, by: isGm() ? 'gm' : 'display' };
    io.to(GM_ROOM).to(VIEW_ROOM).emit('battle:pinged', payload);
  });

  return { broadcast: broadcastStage, isPlayer };
}
