import { randomUUID } from 'node:crypto';
import * as roster from './roster.js';
import * as sheets from './sheet.js';
import { buildRoll } from './rolls.js';
import { cleanChatText } from './chat.js';
import { AppError } from './errors.js';
import { t, isLang } from './i18n.js';
import * as scenes from './scenes.js';
import { registerSceneHandlers } from './sceneHandlers.js';
import { registerAttackHandlers } from './attackHandlers.js';
import { registerSpellHandlers } from './spellHandlers.js';
import { helpDiceFor, spendHelp } from './help.js';
import { registerStanceHandlers } from './stanceHandlers.js';
import { registerLockHandlers } from './lockHandlers.js';
import { registerManifestHandlers } from './manifestHandlers.js';
import * as lockStore from './locks.js';
import { lockedError } from './locks.js';
import { tokenStatuses } from './battle.js';
import { redactSheet, stonesLocked, combinationsLocked, fineTuningLocked } from '../shared/locks.js';
import { createEffects } from './effects.js';
import { createSaves, putStatus } from './saves.js';
import { normalizeApply } from '../shared/statuses.js';
import { cleanSetting } from '../shared/settings.js';
import { registerAudioHandlers, AUDIO_ROOM } from './audioHandlers.js';

// Identity model (no login): a socket declares itself GM or a specific PC.
// The server validates that the PC exists and is a PC, and derives every
// permission from that identity, never from what a payload claims.
//
// Rooms: 'gm' (GM sockets), 'view' (players and Display Screens: they see the
// stage without hidden tokens), 'chat' (GMs and players), `char:<id>` (sockets
// playing that PC). Sheets are visible to the GM and the PC's owner.

const GM_ROOM = 'gm';
const CHAT_ROOM = 'chat';
const VIEW_ROOM = 'view';
const charRoom = (id) => `char:${id}`;

function dropIdentity(socket) {
  socket.leave(GM_ROOM);
  socket.leave(CHAT_ROOM);
  socket.leave(VIEW_ROOM);
  socket.leave(AUDIO_ROOM);
  if (socket.data.identity?.characterId != null) socket.leave(charRoom(socket.data.identity.characterId));
  socket.data.identity = null;
}

// `shared` holds per-instance state: the in-memory chat log and pending trade offers.
export function registerHandlers(io, socket, db, shared) {
  const { chat, offers } = shared;
  socket.data.identity = null;

  const identity = () => socket.data.identity;
  const isGm = () => identity()?.role === 'gm';
  const isPlayer = () => identity()?.role === 'player';
  const isDisplay = () => identity()?.role === 'display';
  const requireChatSeat = () => {
    if (!isGm() && !isPlayer()) throw new AppError('forbidden', 'The Display Screen has no chat.');
  };

  async function broadcastRoster() {
    const [full, pcs] = await Promise.all([roster.listRoster(db), roster.listPcs(db)]);
    io.to(GM_ROOM).emit('roster:updated', full);
    io.emit('pcs:updated', pcs);
  }

  // The GM sees the whole sheet; the player's devices get it with the locked parts of the Arcane tab emptied.
  const emitSheet = async (characterId, sheet) => {
    io.to(GM_ROOM).emit('sheet:updated', { characterId, sheet });
    io.to(charRoom(characterId)).emit('sheet:updated', { characterId, sheet: redactSheet(sheet, await lockStore.listLocks(db)) });
    // The statuses are shown on the character's token, so the stage is sent again when they change.
    const seen = (shared.statusSeen ??= new Map());
    const sig = JSON.stringify(tokenStatuses(JSON.stringify(sheet)));
    const was = seen.get(characterId) ?? '[]';
    seen.set(characterId, sig);
    if (sig !== was) await stage.broadcast();
  };

  const effects = createEffects({ io, db, shared, emitSheet, chatRoom: CHAT_ROOM });
  const saves = createSaves({ io, db, shared, emitSheet, effects, rooms: { GM_ROOM, CHAT_ROOM, charRoom } });

  // The GM controls every character; a player controls only their own PC.
  async function requireControl(characterId) {
    if (!identity()) throw new AppError('forbidden', 'Choose who you are first.');
    const c = await roster.getCharacter(db, characterId);
    if (!c) throw new AppError('not_found', 'That character no longer exists.');
    const allowed = isGm() || (c.type === 'pc' && identity().characterId === c.id);
    if (!allowed) throw new AppError('forbidden', 'You cannot change that character.');
    return c;
  }

  async function authorName() {
    if (isGm()) return { role: 'gm', name: 'GM' };
    const c = await roster.getCharacter(db, identity().characterId);
    return { role: 'player', name: c?.name ?? 'Player' };
  }

  // Error texts are shown in this socket's language (set by the client with lang:set).
  const say = (text, params) => t(socket.data.lang, text, params);

  // Wraps a handler: the ack is always { ok, ... } and errors never crash.
  const on = (event, { gmOnly = false, needsIdentity = false, broadcast = false } = {}, fn) => {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (gmOnly && !isGm()) return reply({ ok: false, code: 'forbidden', error: say('GM only.') });
        if (needsIdentity && !identity()) {
          return reply({ ok: false, code: 'forbidden', error: say('Choose who you are first.') });
        }
        const result = (await fn(payload ?? {})) ?? {};
        if (result.sheet && isPlayer()) result.sheet = redactSheet(result.sheet, await lockStore.listLocks(db));
        if (broadcast) await broadcastRoster();
        reply({ ok: true, ...result });
      } catch (err) {
        if (err instanceof AppError) return reply({ ok: false, code: err.code, error: say(err.message, err.params) });
        console.error(`${event} failed`, err);
        reply({ ok: false, code: 'server_error', error: say('Something went wrong.') });
      }
    });
  };

  // The language this device shows the interface in; server messages follow it.
  socket.on('lang:set', (payload, ack) => {
    if (isLang(payload?.lang)) socket.data.lang = payload.lang;
    if (typeof ack === 'function') ack({ ok: true, lang: socket.data.lang });
  });

  // Round-trip check used by the connection banner and by tests.
  socket.on('ping:check', (payload, ack) => {
    if (typeof ack === 'function') ack({ ok: true, echo: payload ?? null });
  });

  // ---- Identity -----------------------------------------------------------

  on('identity:set', {}, async ({ role, characterId }) => {
    if (role === 'gm') {
      dropIdentity(socket);
      socket.data.identity = { role: 'gm' };
      socket.join(GM_ROOM);
      socket.join(CHAT_ROOM);
      return { identity: identity() };
    }
    if (role === 'display') {
      // A read-mostly screen for the table: it sees the stage (hidden tokens are never sent).
      dropIdentity(socket);
      socket.data.identity = { role: 'display' };
      socket.join(VIEW_ROOM);
      return { identity: identity() };
    }
    const c = role === 'player' ? await roster.getCharacter(db, characterId) : null;
    if (!c || c.type !== 'pc') throw new AppError('gone', 'That character is not available.');
    dropIdentity(socket);
    socket.data.identity = { role: 'player', characterId: c.id };
    socket.join(CHAT_ROOM);
    socket.join(VIEW_ROOM);
    socket.join(charRoom(c.id));
    return { identity: identity() };
  });

  on('identity:clear', {}, () => dropIdentity(socket));

  // ---- Roster -------------------------------------------------------------

  on('roster:get', { gmOnly: true }, async () => ({ roster: await roster.listRoster(db) }));

  on('character:create', { gmOnly: true, broadcast: true }, async (p) => ({
    id: await roster.createCharacter(db, p),
  }));
  on('character:rename', { gmOnly: true, broadcast: true }, (p) =>
    roster.renameCharacter(db, p.id, p.name),
  );
  on('character:move', { gmOnly: true, broadcast: true }, (p) =>
    roster.moveCharacter(db, p.id, p.folderId ?? null),
  );
  on('character:delete', { gmOnly: true, broadcast: true }, async (p) => {
    const gone = await roster.deleteCharacter(db, p.id, p.confirmName);
    await scenes.removeOwnerArt(db, { kind: 'character', id: gone.id });
    await stage.broadcast();
    // Anyone playing the deleted character is sent back to the picker.
    for (const s of io.sockets.sockets.values()) {
      if (s.data.identity?.characterId === gone.id) {
        dropIdentity(s);
        s.emit('identity:revoked', { characterId: gone.id, name: gone.name });
      }
    }
  });

  on('folder:create', { gmOnly: true, broadcast: true }, async (p) => ({
    id: await roster.createFolder(db, p),
  }));
  on('folder:rename', { gmOnly: true, broadcast: true }, (p) =>
    roster.renameFolder(db, p.id, p.name),
  );
  on('folder:move', { gmOnly: true, broadcast: true }, (p) =>
    roster.moveFolder(db, p.id, p.parentId ?? null),
  );
  on('folder:delete', { gmOnly: true, broadcast: true }, (p) => roster.deleteFolder(db, p.id));

  // ---- Character sheet ----------------------------------------------------

  on('sheet:get', { needsIdentity: true }, async ({ characterId }) => {
    const c = await requireControl(characterId);
    return { character: c, sheet: await sheets.getSheet(db, c.id) };
  });

  on('sheet:set', { needsIdentity: true }, async ({ characterId, path, value }) => {
    const c = await requireControl(characterId);
    if (isPlayer() && String(path).startsWith('stones.') && stonesLocked(await lockStore.listLocks(db))) throw lockedError();
    const sheet = await sheets.updateSheet(db, c.id, (s) => sheets.applySet(s, path, value, c));
    emitSheet(c.id, sheet);
    // A token's footprint follows the sheet's Size.
    if (path === 'size') await stage.broadcast();
    return { sheet };
  });

  on('sheet:list', { needsIdentity: true }, async ({ characterId, list, action, ...rest }) => {
    const c = await requireControl(characterId);
    // Locked parts of the Arcane tab cannot be used by a player (the GM is never held back).
    const locked = isPlayer() && list === 'spellDrafts' ? await lockStore.listLocks(db) : [];
    if (list === 'spellDrafts' && combinationsLocked(locked)) throw lockedError();
    const keepRunes = list === 'spellDrafts' && fineTuningLocked(locked);
    if (keepRunes && action === 'add' && rest.draft) delete rest.draft.runes;
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const next = sheets.applyList(s, list, action, rest);
      if (keepRunes && action === 'update') {
        const before = s.spellDrafts.find((d) => d.id === rest.id);
        const after = next.spellDrafts.find((d) => d.id === rest.id);
        if (before && after) {
          after.runes = before.runes;
          for (const sp of next.spells) if (sp.draftId === after.id) sp.runes = before.runes;
        }
      }
      return next;
    });
    emitSheet(c.id, sheet);
    return { sheet };
  });

  // Moves an item between two sheets. Both are locked in id order so two
  // transfers in opposite directions cannot deadlock.
  async function moveItem(fromId, toId, itemId) {
    if (fromId === toId) throw new AppError('bad_transfer', 'Choose a different character.');
    const [first, second] = fromId < toId ? [fromId, toId] : [toId, fromId];
    return sheets.withLock(first, () =>
      sheets.withLock(second, async () => {
        const [fromSheet, toSheet] = await Promise.all([sheets.getSheet(db, fromId), sheets.getSheet(db, toId)]);
        const taken = sheets.takeItem(fromSheet, itemId);
        const given = sheets.giveItem(toSheet, taken.item);
        await sheets.saveSheet(db, toId, given);
        await sheets.saveSheet(db, fromId, taken.sheet);
        emitSheet(fromId, taken.sheet);
        emitSheet(toId, given);
        return taken.item;
      }),
    );
  }

  // GM: immediate transfer between any two characters, PC or NPC.
  on('item:transfer', { gmOnly: true }, async ({ fromId, toId, itemId }) => {
    const [from, to] = await Promise.all([roster.getCharacter(db, fromId), roster.getCharacter(db, toId)]);
    if (!from || !to) throw new AppError('not_found', 'That character no longer exists.');
    const item = await moveItem(from.id, to.id, itemId);
    return { itemName: item.name };
  });

  // Player: offer an item to another PC, who must accept.
  on('trade:offer', { needsIdentity: true }, async ({ fromId, toId, itemId }) => {
    if (isGm()) throw new AppError('forbidden', 'The GM transfers items directly.');
    const from = await requireControl(fromId);
    const to = await roster.getCharacter(db, toId);
    if (!to || to.type !== 'pc') throw new AppError('not_found', 'You can only trade with another PC.');
    if (to.id === from.id) throw new AppError('bad_transfer', 'Choose a different character.');
    const item = (await sheets.getSheet(db, from.id)).items.find((i) => i.id === itemId);
    if (!item) throw new AppError('not_found', 'That item no longer exists.');
    const offer = { id: randomUUID(), fromId: from.id, toId: to.id, itemId, itemName: item.name, fromName: from.name };
    offers.set(offer.id, offer);
    io.to(charRoom(to.id)).emit('trade:offered', {
      offerId: offer.id,
      fromName: from.name,
      itemName: item.name,
      toId: to.id,
    });
    return { offerId: offer.id };
  });

  on('trade:respond', { needsIdentity: true }, async ({ offerId, accept }) => {
    const offer = offers.get(offerId);
    if (!offer) throw new AppError('not_found', 'That offer is no longer available.');
    if (isGm() || identity().characterId !== offer.toId) {
      throw new AppError('forbidden', 'Only the receiving player can answer.');
    }
    offers.delete(offerId);
    const to = await roster.getCharacter(db, offer.toId);
    let accepted = false;
    if (accept === true) {
      await moveItem(offer.fromId, offer.toId, offer.itemId);
      accepted = true;
    }
    const outcome = { offerId, accepted, itemName: offer.itemName, fromName: offer.fromName, toName: to?.name };
    io.to(charRoom(offer.fromId)).to(charRoom(offer.toId)).emit('trade:resolved', outcome);
    return outcome;
  });

  // ---- Rolls and chat -----------------------------------------------------

  on('roll:make', { needsIdentity: true }, async ({ characterId, kind, key, advantage, modifier, help }) => {
    const c = await requireControl(characterId);
    const sheet = await sheets.getSheet(db, c.id);
    const roll = buildRoll(sheet, { kind, key, advantage, modifier, dice: helpDiceFor(sheet, help) });
    await spendHelp(db, c.id, help, emitSheet);
    const message = chat.add({
      type: 'roll',
      author: await authorName(),
      characterId: c.id,
      characterName: c.name,
      roll,
    });
    io.to(CHAT_ROOM).emit('chat:message', message);
    return { message };
  });

  on('chat:get', { needsIdentity: true }, () => {
    requireChatSeat();
    return { messages: chat.history() };
  });

  on('chat:send', { needsIdentity: true }, async ({ text }) => {
    requireChatSeat();
    const message = chat.add({ type: 'text', author: await authorName(), text: cleanChatText(text) });
    io.to(CHAT_ROOM).emit('chat:message', message);
  });

  on('chat:clear', { gmOnly: true }, () => {
    chat.clear();
    effects.store.clear();
    io.to(CHAT_ROOM).emit('chat:cleared');
  });

  // The GM sends one of his settings to every device (a one-time push; each person can change it again afterwards).
  on('settings:force', { gmOnly: true }, ({ key, value }) => {
    const clean = cleanSetting(key, value);
    if (clean == null) throw new AppError('bad_value', 'That is not a valid value for this setting.');
    io.emit('setting:forced', { key, value: clean });
  });

  // A status added by hand on a sheet (no Save, whoever the source): it lasts as `duration` says. Repeated needs a Save to roll, so it
  // is only for statuses that have one, and comes with the DC of that Save (`dc`, a number).
  on('status:add', { needsIdentity: true }, async ({ characterId, key, stacks, duration, dc }) => {
    const c = await requireControl(characterId);
    const apply = normalizeApply({ key, stacks, duration, dc });
    if (!apply) throw new AppError('bad_value', 'Unknown status.');
    if (duration === 'repeated' && apply.duration !== 'repeated') throw new AppError('bad_value', 'This status has no Save, so it cannot be Repeated.');
    if (apply.duration === 'repeated' && apply.dc === 'auto') throw new AppError('bad_value', 'A Repeated status needs a DC for its Save.');
    const sheet = await sheets.updateSheet(db, c.id, (s) => sheets.normalizeSheet(putStatus(s, apply, apply.dc)));
    emitSheet(c.id, sheet);
    return { sheet };
  });

  // A Save a status asks for (server/saves.js): the player of the character it is put on answers, with the AP they spend for
  // Advantage; the GM can answer for a player who is not there (no AP is spent then). `save:list` is what is waiting for me.
  on('save:answer', { needsIdentity: true }, async ({ id, ap }) => {
    const req = shared.saves?.get(id);
    if (!req) throw new AppError('not_found', 'That Save is no longer waiting.');
    await requireControl(req.characterId);
    const spend = isGm() ? 0 : Number.isInteger(ap) && ap >= 0 ? ap : 0;
    await saves.answer(id, spend, await authorName());
  });
  on('save:list', { needsIdentity: true }, async () => {
    const mine = saves.list(identity().characterId, isGm());
    return { saves: await Promise.all(mine.map((r) => saves.describe(r))) };
  });

  // Takes back what an effect card did (an applied attack, the start of a turn, a crafted spell).
  on('effects:revert', { gmOnly: true }, async ({ messageId }) => {
    await effects.revert(messageId);
  });

  // ---- Scenes, stage, pictures ---------------------------------------------

  const stage = registerSceneHandlers({
    io,
    socket,
    db,
    on,
    identity,
    isGm,
    isPlayer,
    isDisplay,
    requireControl,
    emitSheet,
    effects,
    saves,
    shared,
    rooms: { GM_ROOM, VIEW_ROOM, CHAT_ROOM, charRoom },
  });

  // ---- Attacks ---------------------------------------------------------------

  registerAttackHandlers({ io, db, on, requireControl, emitSheet, effects, saves, authorName, shared, isGm, rooms: { GM_ROOM, CHAT_ROOM } });

  registerSpellHandlers({ io, db, on, requireControl, emitSheet, effects, authorName, shared, isGm, rooms: { GM_ROOM, CHAT_ROOM } });
  registerManifestHandlers({ io, db, on, requireControl, emitSheet, isGm });
  registerLockHandlers({ io, db, on, emitSheet });

  registerStanceHandlers({ io, db, on, isGm, identity });

  // ---- Music -----------------------------------------------------------------

  registerAudioHandlers({ io, socket, db, on, isGm, isDisplay, rooms: { GM_ROOM }, shared });
}
