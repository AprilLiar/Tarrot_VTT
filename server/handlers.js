import { takeRest, restSpendMax } from '../shared/rest.js';
import { oxState, oxOf, bleedProblem, BLEED_HP, BLEED_AP, OX_STATUS } from '../shared/oxidization.js';
import { cleanCrop } from '../shared/crop.js';
import { randomUUID, randomInt } from 'node:crypto';
import * as roster from './roster.js';
import * as counters from './counters.js';
import { search } from './search.js';
import * as sheets from './sheet.js';
import { buildRoll } from './rolls.js';
import { cleanChatText, cleanTray } from './chat.js';
import { AppError } from './errors.js';
import { t, isLang, line as chatLine } from './i18n.js';
import { T } from '../shared/localization.js';
import * as scenes from './scenes.js';
import { registerSceneHandlers } from './sceneHandlers.js';
import { registerAttackHandlers } from './attackHandlers.js';
import { registerSpellHandlers } from './spellHandlers.js';
import { helpDiceFor, spendHelp } from './help.js';
import { registerStanceHandlers } from './stanceHandlers.js';
import { createJournal } from './journal.js';
import { registerEffectHandlers } from './effectHandlers.js';
import { registerBasicHandlers } from './basicHandlers.js';
import { spendRollUses } from './effectRuntime.js';
import * as fxRuntime from './effectRuntime.js';
import { registerLockHandlers } from './lockHandlers.js';
import { registerEventsHandlers } from './eventsHandlers.js';
import { registerRelationshipHandlers } from './relationshipHandlers.js';
import { deleteBoardOf } from './relationships.js';
import { registerManifestHandlers } from './manifestHandlers.js';
import * as lockStore from './locks.js';
import { lockedError } from './locks.js';
import { tokenStatuses, tokenEffects } from './battle.js';
import { storeImage, deleteImageIfUnused, storeChatImage } from './images.js';
import { createFx, sheetFx } from './fx.js';
import { hasSelectedCard } from '../shared/manifest.js';
import { normalizeRows } from '../shared/spells.js';
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
  const fx = createFx(io, { GM_ROOM, VIEW_ROOM });
  // A sheet not sent since the server started is remembered as it was just before its first change, so that change is animated too.
  sheets.watchSheetChanges((id, prev) => {
    const seenSheets = (shared.fxSheets ??= new Map());
    if (!seenSheets.has(id)) seenSheets.set(id, { hp: { ...prev.hp }, statuses: { ...prev.statuses } });
    const ox = (shared.oxStates ??= new Map());
    if (!ox.has(id)) ox.set(id, oxState(prev));
  });
  // Blood Oxidization over the limit (a coma) or over double it (death) is told in the chat when it happens, and so is waking up.
  const OX_LINES = {
    coma: T('{name} falls into a deep coma: Blood Oxidization is over the limit.'),
    dead: T('{name} dissolves in acid: Blood Oxidization is over double the limit.'),
    ok: T('{name} wakes from the coma.'),
  };
  async function oxChanged(characterId, sheet) {
    const states = (shared.oxStates ??= new Map());
    const was = states.get(characterId) ?? 'ok';
    const now = oxState(sheet);
    states.set(characterId, now);
    if (was === now || (now === 'coma' && was === 'dead')) return;
    const c = await roster.getCharacter(db, characterId);
    if (!c) return;
    const message = chat.add({ type: 'text', author: { role: 'gm', name: T('Blood Oxidization') }, ...chatLine({ key: OX_LINES[now], params: { name: c.name } }) });
    io.to(CHAT_ROOM).emit('chat:message', message);
  }
  const emitSheet = async (characterId, sheet) => {
    // Board animations: what changed on the sheet since it was last sent (HP lost or healed, statuses gained or lost).
    const seenSheets = (shared.fxSheets ??= new Map());
    for (const f of sheetFx(characterId, seenSheets.get(characterId), sheet)) fx.send(f);
    seenSheets.set(characterId, { hp: { ...sheet.hp }, statuses: { ...sheet.statuses } });
    await oxChanged(characterId, sheet);
    io.to(GM_ROOM).emit('sheet:updated', { characterId, sheet });
    io.to(charRoom(characterId)).emit('sheet:updated', { characterId, sheet: redactSheet(sheet, await lockStore.listLocks(db), characterId) });
    // The statuses are shown on the character's token (and a character at 0 HP is drawn down), so the stage is sent again when they change.
    const seen = (shared.statusSeen ??= new Map());
    const json = JSON.stringify(sheet);
    const down = (sheet.hp?.max ?? 0) > 0 && (sheet.hp?.current ?? 0) <= 0;
    const sig = JSON.stringify([tokenStatuses(json), tokenEffects(json), hasSelectedCard(json), down]);
    const was = seen.get(characterId) ?? '[[],[],false,false]';
    seen.set(characterId, sig);
    if (sig !== was) await stage.broadcast();
  };

  const effects = createEffects({ io, db, shared, emitSheet, chatRoom: CHAT_ROOM });
  const saves = createSaves({ io, db, shared, emitSheet, effects, fx, rooms: { GM_ROOM, CHAT_ROOM, charRoom } });

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
        if (result.sheet && isPlayer()) result.sheet = redactSheet(result.sheet, await lockStore.listLocks(db), identity().characterId);
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
    await deleteImageIfUnused(db, gone.portraitImageId);
    await deleteImageIfUnused(db, gone.tokenImageId);
    await counters.deleteCharacterCounters(db, gone.id);
    await deleteBoardOf(db, gone.id);
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
          after.runes = normalizeRows(before.runes, after.scheme.circles);
          for (const sp of next.spells) if (sp.draftId === after.id) sp.runes = normalizeRows(before.runes, sp.circles);
        }
      }
      return next;
    });
    emitSheet(c.id, sheet);
    // Using an item puts the Effects it carries on its user, as one card with Revert.
    if (list === 'items' && action === 'use') {
      const refs = sheet.items.find((i) => i.id === rest.id)?.effects ?? [];
      if (refs.length) {
        const cat = fxRuntime.catalog(await fxRuntime.listGlobal(db), sheet);
        const journal = createJournal();
        const rows = [];
        for (const r of refs) {
          const def = cat.find((e) => e.id === r.id);
          if (def) rows.push(...(await fxRuntime.giveEffect(db, journal, c.id, def, sheet.items.find((i) => i.id === rest.id).name, emitSheet)).rows);
        }
        effects.post({ kind: 'effect', blocks: [{ name: c.name, rows }], journal });
      }
    }
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
    // Luck is always a pure roll: no Help Dice, Advantage, modifier or Effect (shared/roll-plan.js).
    const pure = kind === 'attribute' && key === 'luck';
    const roll = buildRoll(sheet, { kind, key, advantage, modifier, dice: pure ? [] : helpDiceFor(sheet, help) });
    if (!pure) {
      await spendHelp(db, c.id, help, emitSheet);
      await spendRollUses(db, c.id, roll, emitSheet);
    }
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

  // A picture or a GIF in the chat, with an optional line of text.
  on('chat:picture', { needsIdentity: true }, async ({ data, text }) => {
    requireChatSeat();
    const caption = typeof text === 'string' && text.trim() ? cleanChatText(text) : '';
    const imageId = await storeChatImage(db, data);
    const message = chat.add({ type: 'picture', author: await authorName(), imageId, text: caption });
    io.to(CHAT_ROOM).emit('chat:message', message);
  });

  // The Dice Tray: the dice and modifier chosen, rolled on the server and posted.
  on('dice:roll', { needsIdentity: true }, async ({ dice, modifier }) => {
    requireChatSeat();
    const tray = cleanTray(dice, modifier);
    const rolled = tray.dice.map((sides) => ({ sides, value: randomInt(1, sides + 1) }));
    const total = rolled.reduce((sum, d) => sum + d.value, 0) + tray.modifier;
    const message = chat.add({ type: 'dice', author: await authorName(), dice: rolled, modifier: tray.modifier, total });
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
    fx,
    rooms: { GM_ROOM, VIEW_ROOM, CHAT_ROOM, charRoom },
  });

  // ---- Blood Oxidization: letting blood (shared/oxidization.js) ----------------------
  // 1 Ox off for 3 HP, never down to 0 HP; in combat (the character is in the order) it costs 1 AP.
  on('ox:bleed', { needsIdentity: true }, async ({ characterId }) => {
    const c = await requireControl(characterId);
    const inCombat = !!shared.combat?.order.some((e) => e.ownerKind === 'character' && e.ownerId === c.id);
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const problem = bleedProblem(s, { inCombat });
      if (problem === 'no_ox') throw new AppError('no_ox', 'There is no Blood Oxidization to let out.');
      if (problem === 'low_hp') throw new AppError('low_hp', 'Letting blood would take HP to 0 or below.');
      if (problem === 'no_ap') throw new AppError('no_ap', 'Letting blood in combat costs {n} AP.', { n: BLEED_AP });
      const next = structuredClone(s);
      next.hp.current -= BLEED_HP;
      next.statuses[OX_STATUS] -= 1;
      if (!next.statuses[OX_STATUS]) delete next.statuses[OX_STATUS];
      if (inCombat) next.ap.current -= BLEED_AP;
      return sheets.normalizeSheet(next);
    });
    await emitSheet(c.id, sheet);
    const message = chat.add({
      type: 'text',
      author: { role: 'gm', name: T('Blood Oxidization') },
      ...chatLine({ key: T('{name} lets blood: {hp} HP for 1 Blood Oxidization ({ox} left).'), params: { name: c.name, hp: BLEED_HP, ox: oxOf(sheet) } }),
    });
    io.to(CHAT_ROOM).emit('chat:message', message);
    return { sheet };
  });

  // ---- Rests (shared/rest.js) ---------------------------------------------------------
  on('rest:take', { needsIdentity: true }, async ({ characterId, kind, spend }) => {
    const c = await requireControl(characterId);
    if (shared.combat?.order.some((e) => e.ownerKind === 'character' && e.ownerId === c.id)) throw new AppError('in_combat', 'No resting in combat.');
    let done;
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const r = takeRest(s, kind, spend);
      if (r.problem === 'bad_kind') throw new AppError('bad_value', 'Choose a Short Rest or a Long Rest.');
      if (r.problem === 'bad_spend') throw new AppError('bad_value', 'You can spend from 0 to {n} Rest Points now.', { n: restSpendMax(s) });
      done = r;
      const next = structuredClone(s);
      next.hp.current = r.hp;
      next.rest.current = r.rp;
      return sheets.normalizeSheet(next);
    });
    await emitSheet(c.id, sheet);
    const key =
      kind === 'long'
        ? T('{name} takes a Long Rest: {n} Rest Points spent for {n} HP, and 1 Rest Point back at the end ({rp} left).')
        : T('{name} takes a Short Rest: {n} Rest Points spent for {n} HP ({rp} left).');
    const message = chat.add({ type: 'text', author: { role: 'gm', name: T('Rest') }, ...chatLine({ key, params: { name: c.name, n: spend, rp: done.rp } }) });
    io.to(CHAT_ROOM).emit('chat:message', message);
    return { sheet };
  });

  // ---- Search (see server/search.js) ----------------------------------------------
  on('search', { needsIdentity: true }, async ({ q }) => {
    if (!isGm() && !isPlayer()) return { results: [] };
    return { results: await search(db, { q, gm: isGm(), characterId: identity().characterId }) };
  });

  // ---- Counters (see server/counters.js) ----------------------------------------
  // Everyone who can see the sheet gets the list: the GM whole, the player without the secret Gates.

  async function countersChanged(characterId) {
    const list = await counters.listCounters(db, characterId);
    io.to(GM_ROOM).emit('counters:updated', { characterId, counters: list });
    io.to(charRoom(characterId)).except(GM_ROOM).emit('counters:updated', { characterId, counters: counters.forPlayer(list) });
    return list;
  }

  on('counter:list', { needsIdentity: true }, async ({ characterId }) => {
    const c = await requireControl(characterId);
    const list = await counters.listCounters(db, c.id);
    return { counters: isGm() ? list : counters.forPlayer(list) };
  });

  on('counter:create', { gmOnly: true }, async ({ characterId, name, pips }) => {
    const c = await requireControl(characterId);
    const id = await counters.createCounter(db, c.id, { name, pips });
    await countersChanged(c.id);
    return { id };
  });

  on('counter:update', { gmOnly: true }, async ({ id, name, pips, gates }) => {
    const counter = await counters.updateCounter(db, id, { name, pips, gates });
    await countersChanged(counter.characterId);
  });

  on('counter:delete', { gmOnly: true }, async ({ id }) => {
    const counter = await counters.getCounter(db, id);
    await counters.deleteCounter(db, id);
    await countersChanged(counter.characterId);
  });

  on('counter:step', { needsIdentity: true }, async ({ id, by }) => {
    const before = await counters.getCounter(db, id);
    const c = await requireControl(before.characterId);
    const { reached } = await counters.stepCounter(db, id, by);
    await countersChanged(c.id);
    for (const gate of reached) {
      if (gate.secret) {
        // Only the GM hears of a secret Gate.
        io.to(GM_ROOM).emit('counter:secret_gate', { character: c.name, counter: before.name, gate: gate.name });
        continue;
      }
      const message = chat.add({
        type: 'text',
        author: { role: 'gm', name: T('Counters') },
        ...chatLine(
          gate.text
            ? { key: T('{name} reached {gate} on {counter}: {text}'), params: { name: c.name, gate: gate.name, counter: before.name, text: gate.text } }
            : { key: T('{name} reached {gate} on {counter}.'), params: { name: c.name, gate: gate.name, counter: before.name } },
        ),
      });
      io.to(CHAT_ROOM).emit('chat:message', message);
    }
  });

  // ---- Portraits ---------------------------------------------------------------
  // A Portrait is one image for each character (PC or NPC), set by the GM or the owner of a PC. It is shown on the sheet, in the roster,
  // on the picker's cards and in the combat order. Everyone's roster and the picker follow through `broadcast`; the sheet is told here.

  async function portraitChanged(characterId) {
    const c = await roster.getCharacter(db, characterId);
    io.to(GM_ROOM).to(charRoom(characterId)).emit('character:updated', { character: c });
    await stage.broadcast();
  }

  on('portrait:set', { needsIdentity: true, broadcast: true }, async ({ characterId, data }) => {
    const c = await requireControl(characterId);
    const imageId = await storeImage(db, data);
    let before;
    try {
      before = await roster.setPortrait(db, c.id, imageId);
    } catch (err) {
      await deleteImageIfUnused(db, imageId);
      throw err;
    }
    await deleteImageIfUnused(db, before);
    await portraitChanged(c.id);
    return { imageId };
  });

  // The crop of the Portrait's round thumbnail or of the default token (the Crop editor on the sheet); null: the automatic cut.
  on('crop:set', { needsIdentity: true, broadcast: true }, async ({ characterId, which, crop }) => {
    const c = await requireControl(characterId);
    if (which !== 'portrait' && which !== 'token') throw new AppError('bad_value', 'Choose a picture to crop.');
    await roster.setCrop(db, c.id, which, cleanCrop(crop));
    await portraitChanged(c.id);
  });

  on('portrait:clear', { needsIdentity: true, broadcast: true }, async ({ characterId }) => {
    const c = await requireControl(characterId);
    const before = await roster.setPortrait(db, c.id, null);
    await deleteImageIfUnused(db, before);
    await portraitChanged(c.id);
  });

  // A custom Battle token (PCs and NPCs; a temp NPC always has the default one): set by the GM or the owner of a PC, on the sheet. Clearing
  // it brings back the default token, cut from the character's picture.
  on('token:set', { needsIdentity: true, broadcast: true }, async ({ characterId, data }) => {
    const c = await requireControl(characterId);
    const imageId = await storeImage(db, data);
    let before;
    try {
      before = await roster.setToken(db, c.id, imageId);
    } catch (err) {
      await deleteImageIfUnused(db, imageId);
      throw err;
    }
    await deleteImageIfUnused(db, before);
    await portraitChanged(c.id);
    return { imageId };
  });

  on('token:clear', { needsIdentity: true, broadcast: true }, async ({ characterId }) => {
    const c = await requireControl(characterId);
    const before = await roster.setToken(db, c.id, null);
    await deleteImageIfUnused(db, before);
    await portraitChanged(c.id);
  });

  // ---- Attacks ---------------------------------------------------------------

  registerAttackHandlers({ io, db, on, requireControl, emitSheet, effects, saves, authorName, shared, isGm, fx, rooms: { GM_ROOM, CHAT_ROOM } });

  registerSpellHandlers({ io, db, on, requireControl, emitSheet, effects, authorName, shared, isGm, rooms: { GM_ROOM, CHAT_ROOM } });
  registerManifestHandlers({ io, db, on, requireControl, emitSheet, isGm, identity });
  registerLockHandlers({ io, db, on, emitSheet });
  registerEventsHandlers({ io, db, on, isGm, isPlayer, identity, authorName });
  registerRelationshipHandlers({ io, db, on, isGm, requireControl, rooms: { GM_ROOM, charRoom } });

  registerStanceHandlers({ io, db, on, isGm, identity });
  registerEffectHandlers({ io, db, on, requireControl, emitSheet, effects });
  registerBasicHandlers({ io, db, on, requireControl, emitSheet, effects, saves, authorName, shared, rooms: { GM_ROOM, CHAT_ROOM } });

  // ---- Music -----------------------------------------------------------------

  registerAudioHandlers({ io, socket, db, on, isGm, isDisplay, rooms: { GM_ROOM }, shared });
}
