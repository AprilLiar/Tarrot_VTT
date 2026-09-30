import * as attack from './attack.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import * as scenes from './scenes.js';
import { buildRoll } from './rolls.js';
import { AppError } from './errors.js';
import * as D from '../shared/rules-data.js';

// Socket events for attacks. See server/attack.js for the flow.
//  - attack:roll   (the GM, or a player for their own PC)  rolls a Combat Mastery, posts it in the
//                  chat and sends a pending attack to the GM's confirm card.
//  - attack:list / attack:targets / attack:apply / attack:cancel   (GM only)
export function registerAttackHandlers(ctx) {
  const { io, db, on, requireControl, emitSheet, authorName, shared, rooms } = ctx;
  const { GM_ROOM, CHAT_ROOM } = rooms;
  const pending = shared.attacks;

  const say = (text) => {
    const message = shared.chat.add({ type: 'text', author: { role: 'gm', name: 'Combat' }, text });
    io.to(CHAT_ROOM).emit('chat:message', message);
  };
  const get = (id) => {
    const p = pending.get(id);
    if (!p) throw new AppError('not_found', 'That attack is no longer waiting.');
    return p;
  };

  on('attack:roll', { needsIdentity: true }, async (p) => {
    const c = await requireControl(p.characterId);
    if (!D.MASTERIES.includes(p.mastery)) throw new AppError('bad_value', 'Choose a Combat Mastery.');
    if (!Number.isInteger(p.ap) || p.ap < 1 || p.ap > 2) throw new AppError('bad_value', 'A basic attack costs 1 or 2 AP.');
    const sheet = await sheets.getSheet(db, c.id);
    const roll = buildRoll(sheet, { kind: 'mastery', key: p.mastery, advantage: p.advantage, modifier: p.modifier });
    const masteryLabel = D.MASTERY_LABELS[p.mastery];
    roll.title = `${masteryLabel} attack`;

    // Where the attacker stands and who they have targeted (single target from the phone).
    const sceneId = await scenes.getActiveSceneId(db);
    const token = sceneId == null ? null : await battle.tokenForCharacter(db, sceneId, c.id);
    const targeted = shared.targets.get(c.id);
    const attackId = shared.nextAttackId = (shared.nextAttackId ?? 0) + 1;
    const entry = {
      id: attackId,
      ts: Date.now(),
      characterId: c.id,
      characterName: c.name,
      attackerTokenId: token?.id ?? null,
      mastery: p.mastery,
      masteryLabel,
      ap: p.ap,
      roll,
      targets: targeted != null ? [targeted] : [],
    };
    pending.set(attackId, entry);
    while (pending.size > attack.MAX_PENDING) pending.delete(pending.keys().next().value);

    const message = shared.chat.add({ type: 'roll', author: await authorName(), characterId: c.id, characterName: c.name, roll });
    io.to(CHAT_ROOM).emit('chat:message', message);
    io.to(GM_ROOM).emit('attack:pending', entry);
    return { attackId, message };
  });

  on('attack:list', { gmOnly: true }, () => ({ attacks: [...pending.values()] }));

  on('attack:targets', { gmOnly: true }, async (p) => {
    const ids = Array.isArray(p.tokenIds) ? p.tokenIds.slice(0, attack.MAX_TARGETS) : [];
    const infos = [];
    for (const id of ids) {
      try {
        infos.push(await attack.targetInfo(db, id));
      } catch {
        // A token that has left the map is simply not offered.
      }
    }
    return { targets: infos };
  });

  on('attack:cancel', { gmOnly: true }, (p) => {
    get(p.id);
    pending.delete(p.id);
    io.to(GM_ROOM).emit('attack:resolved', { id: p.id });
  });

  on('attack:apply', { gmOnly: true }, async (p) => {
    const entry = get(p.id);
    const clean = attack.cleanApply(entry, p);
    // Claim it first, so a double tap cannot apply it twice.
    pending.delete(p.id);
    try {
      const { lines } = await attack.applyAttack(db, entry, clean, { emitSheet });
      for (const l of lines) if (!l.hidden) say(l.text);
    } catch (err) {
      pending.set(p.id, entry);
      throw err;
    }
    io.to(GM_ROOM).emit('attack:resolved', { id: p.id });
  });

}
