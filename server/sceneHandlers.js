import * as scenes from './scenes.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import * as combat from './combat.js';
import { buildRoll, rollD20 } from './rolls.js';
import { storeImage, deleteImageIfUnused } from './images.js';
import { AppError } from './errors.js';
import { line as chatLine } from './i18n.js';
import { T } from '../shared/localization.js';

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
  const { GM_ROOM, VIEW_ROOM, CHAT_ROOM, charRoom } = rooms;

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
    await syncCombat();
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
    // The Display picks pictures too (its token menu has Token Settings).
    if (isDisplay()) return { pictures: await scenes.listPictures(db, owner) };
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
  on('temp_npc:set_size', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can change a size.');
    await scenes.setTempNpcSize(db, p.id, p.size);
    await broadcastStage();
    await broadcastLibrary();
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
    if (!isGm() && !isDisplay()) {
      const owner = await scenes.summonOwner(db, p.id);
      if (owner.kind !== 'character' || owner.id !== identity().characterId) {
        throw new AppError('forbidden', 'You can only dismiss your own character.');
      }
    }
    await scenes.dismiss(db, p.id);
    await broadcastStage();
  });

  // The token menu's Token Settings and Hide: the GM and the Display.
  on('stage:update', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can change a figure.');
    await scenes.updateSummon(db, p.id, { pictureId: p.pictureId, scale: p.scale, hidden: p.hidden });
    await broadcastStage();
  });

  // Dragging a figure anywhere on the scene: the GM, the Display, or a player for their own PC.
  on('stage:move', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) {
      const owner = await scenes.summonOwner(db, p.id);
      if (!isPlayer() || owner.kind !== 'character' || owner.id !== identity().characterId) {
        throw new AppError('forbidden', 'You can only move your own character.');
      }
    }
    await scenes.moveSummon(db, p.id, { x: p.x, y: p.y, reset: p.reset });
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

  // The grid's visibility is a setting of the scene for everybody. The GM and the Display change it.
  on('scene:show_grid', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can change that.');
    await scenes.setShowGrid(db, p.id, p.show === true);
    await broadcastStage();
  });

  // Tokens are placed by the GM. Their picture comes from the character's collection.
  on('battle:add', { gmOnly: true }, async (p) => {
    const id = await battle.addToken(db, scenes.ownerOf(p), Number.isInteger(p.pictureId) ? p.pictureId : undefined);
    await broadcastStage();
    return { id };
  });
  // Token menu: the GM and the Display can do everything; a player can only set the height of their own PC.
  on('battle:remove', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can remove a token.');
    await battle.removeToken(db, p.id);
    for (const set of targets.values()) set.delete(p.id);
    await broadcastStage();
  });
  // A player's own PC: true when the token is that character's.
  async function ownsToken(tokenId) {
    if (!isPlayer()) return false;
    const t = await battle.getToken(db, tokenId);
    return t.ownerKind === 'character' && t.ownerId === identity().characterId;
  }
  on('battle:update', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) {
      const heightOnly = p.pictureId === undefined && p.hidden === undefined && p.height !== undefined;
      if (!heightOnly || !(await ownsToken(p.id))) throw new AppError('forbidden', 'You can only change the height of your own character.');
    }
    await battle.updateToken(db, p.id, { pictureId: p.pictureId, hidden: p.hidden, height: p.height });
    if (p.hidden === true) for (const set of targets.values()) set.delete(p.id);
    await broadcastStage();
  });
  on('battle:clear_bank', { gmOnly: true }, async (p) => {
    await battle.clearBank(db, p.id);
    await broadcastStage();
  });

  // Dragging is free: it never changes AP or Movement. The GM and the Display can do it.
  on('battle:place', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay() && !(await ownsToken(p.id))) {
      throw new AppError('forbidden', 'You can only move your own character by dragging.');
    }
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
    // Movement is only paid on the character's own turn; outside combat every move is free.
    const turn = combat.activeEntry(shared.combat);
    const isOwnTurn = !!turn && turn.tokenId === token.id && token.ownerKind === 'character';
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

  // Targeting: the tokens a character has picked (any number). In memory only; used by attacks.
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
      // One tap selects, the next tap on the same token deselects.
      const set = targets.get(characterId) ?? new Set();
      if (!set.delete(token.id)) set.add(token.id);
      if (set.size) targets.set(characterId, set);
      else targets.delete(characterId);
    }
    await broadcastStage();
  });

  // ---- Combat tracker (state in shared.combat, see server/combat.js) -----------------

  // Actions run one at a time, so a double tap on "Next turn" cannot skip a turn.
  const locked = (fn) => {
    const run = (shared.combatChain ?? Promise.resolve()).then(fn, fn);
    shared.combatChain = run.catch(() => {});
    return run;
  };

  // A chat line from the tracker. Lines about hidden tokens are never sent (they would give them away).
  function say(m, token) {
    if (token?.hidden) return;
    const message = shared.chat.add({ type: 'text', author: { role: 'gm', name: T('Combat') }, ...chatLine(typeof m === 'string' ? { key: m } : m) });
    io.to(CHAT_ROOM).emit('chat:message', message);
  }

  const requireCombat = () => {
    if (!shared.combat) throw new AppError('no_combat', 'There is no combat.');
    return shared.combat;
  };

  // The active combatant starts a turn: announce it, then apply Bleeding, Burning and AP changes.
  async function beginTurn(c) {
    const entry = combat.activeEntry(c);
    if (!entry) return;
    const token = await battle.getToken(db, entry.tokenId);
    say({ key: "Round {round}: {name}'s turn.", params: { round: c.round, name: token.name } }, token);
    if (entry.ownerKind !== 'character') return;
    let lines = [];
    const sheet = await sheets.updateSheet(db, entry.ownerId, (s) => {
      const out = combat.startOfTurn(s, token.name);
      lines = out.lines;
      return out.sheet;
    });
    emitSheet(entry.ownerId, sheet);
    for (const line of lines) say(line, token);
  }

  // The active combatant ends a turn: unspent Movement is lost, AP is refilled.
  async function finishTurn(entry) {
    await battle.clearBank(db, entry.tokenId);
    if (entry.ownerKind === 'character') {
      emitSheet(entry.ownerId, await sheets.updateSheet(db, entry.ownerId, combat.endOfTurn));
    }
  }

  // Keeps the combat in step with the map before every stage broadcast.
  async function syncCombat() {
    const c = shared.combat;
    if (!c) return;
    const sceneId = await scenes.getActiveSceneId(db);
    if (sceneId !== c.sceneId) {
      shared.combat = null;
      return;
    }
    const tokens = await battle.listTokens(db, sceneId, { forGm: true });
    const { activeRemoved } = combat.reconcile(c, tokens);
    if (!c.order.length) shared.combat = null;
    else if (activeRemoved && c.phase === 'active') await beginTurn(c);
  }

  // Rolls one combatant's initiative: a character rolls its Speed skill (shown in the chat like any
  // roll); a temporary NPC has no sheet and rolls a plain d20.
  async function rollInitiative(c, entry) {
    const token = await battle.getToken(db, entry.tokenId);
    if (entry.ownerKind === 'character') {
      const sheet = await sheets.getSheet(db, entry.ownerId);
      const roll = buildRoll(sheet, combat.SPEED_ROLL);
      combat.setInitiative(c, entry.tokenId, roll.total);
      if (!token.hidden) {
        const message = shared.chat.add({
          type: 'roll',
          author: isGm() ? { role: 'gm', name: 'GM' } : { role: 'player', name: token.name },
          characterId: entry.ownerId,
          characterName: token.name,
          roll: { ...roll, title: 'Initiative (Speed)' },
        });
        io.to(CHAT_ROOM).emit('chat:message', message);
      }
    } else {
      const n = rollD20();
      combat.setInitiative(c, entry.tokenId, n);
      say({ key: '{name} rolls Initiative: {n}.', params: { name: token.name, n } }, token);
    }
  }

  const gmCombat = (event, fn) =>
    on(event, { gmOnly: true }, (p) =>
      locked(async () => {
        const out = await fn(p ?? {});
        await broadcastStage();
        return out;
      }),
    );

  gmCombat('combat:start', async () => {
    if (shared.combat) throw new AppError('combat_running', 'A combat is already running.');
    const sceneId = await scenes.getActiveSceneId(db);
    if (sceneId == null) throw new AppError('no_scene', 'There is no active scene.');
    const tokens = await battle.listTokens(db, sceneId, { forGm: true });
    shared.combat = combat.newCombat(sceneId, tokens);
    say({ key: 'Combat begins. Roll for Initiative.' });
  });

  // A player rolls their own PC; the GM can roll anyone (and re-roll).
  on('combat:roll', { needsIdentity: true }, (p) =>
    locked(async () => {
      const c = requireCombat();
      const entry = combat.findEntry(c, p.tokenId);
      if (!entry) throw new AppError('not_found', 'That character is not in the combat.');
      if (!isGm()) {
        if (entry.ownerKind !== 'character') throw new AppError('forbidden', 'You cannot roll for that.');
        await requireControl(entry.ownerId);
        if (entry.initiative != null) throw new AppError('already_rolled', 'Initiative is already rolled. Ask the GM to change it.');
      }
      await rollInitiative(c, entry);
      await broadcastStage();
    }),
  );

  gmCombat('combat:roll_npcs', async () => {
    const c = requireCombat();
    for (const entry of [...c.order]) {
      if (entry.initiative != null) continue;
      const token = await battle.getToken(db, entry.tokenId);
      if (token.kind === 'pc') continue;
      await rollInitiative(c, entry);
    }
  });

  gmCombat('combat:set_initiative', async (p) => combat.setInitiative(requireCombat(), p.tokenId, p.value));

  gmCombat('combat:begin', async () => {
    const c = requireCombat();
    combat.begin(c);
    say({ key: 'Combat begins. Round 1.' });
    await beginTurn(c);
  });

  // Ends the active turn and starts the next one. The GM, or the player whose turn it is.
  on('combat:next', { needsIdentity: true }, (p) =>
    locked(async () => {
      const c = requireCombat();
      const entry = combat.activeEntry(c);
      if (!entry) throw new AppError('bad_phase', 'Combat has not begun.');
      if (!isGm() && !(isPlayer() && entry.ownerKind === 'character' && entry.ownerId === identity().characterId)) {
        throw new AppError('forbidden', 'Only the GM or the player whose turn it is can end it.');
      }
      if (p?.tokenId != null && p.tokenId !== entry.tokenId) throw new AppError('stale', 'That turn is already over.');
      await finishTurn(entry);
      combat.advance(c);
      await beginTurn(c);
      await broadcastStage();
    }),
  );

  gmCombat('combat:reorder', async (p) => combat.reorder(requireCombat(), p.ids));

  gmCombat('combat:add', async (p) => {
    const c = requireCombat();
    combat.addCombatant(c, await battle.getToken(db, p.tokenId));
  });

  gmCombat('combat:remove', async (p) => {
    const c = requireCombat();
    const wasActive = combat.activeEntry(c)?.tokenId === p.tokenId;
    if (!combat.findEntry(c, p.tokenId)) throw new AppError('not_found', 'That character is not in the combat.');
    await battle.clearBank(db, p.tokenId).catch(() => {});
    combat.removeCombatant(c, p.tokenId);
    if (!c.order.length) shared.combat = null;
    else if (wasActive) await beginTurn(c);
  });

  gmCombat('combat:end', async () => {
    const c = requireCombat();
    for (const entry of c.order) await battle.clearBank(db, entry.tokenId).catch(() => {});
    say(c.phase === 'active' ? { key: 'Combat ends after {n} round(s).', params: { n: c.round } } : { key: 'Combat cancelled.' });
    shared.combat = null;
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
  // "Clean" in the Draw and Area tools: the GM and the Display can wipe every drawing or area.
  on('mark:clear', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can clean the map.');
    await battle.clearMarks(db, p.kind);
    await broadcastStage();
  });
  // The eraser: rubs out the parts of drawings within a small circle (x, y in picture fractions).
  on('mark:erase', { needsIdentity: true }, async (p) => {
    if (!isGm() && !isDisplay()) throw new AppError('forbidden', 'Only the GM or the Display can erase.');
    const changed = await battle.eraseMarksAt(db, p);
    if (changed) await broadcastStage();
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
