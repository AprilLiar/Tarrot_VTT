import * as attack from './attack.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import * as scenes from './scenes.js';
import * as arcane from './arcane.js';
import { buildRoll } from './rolls.js';
import { planAttack, enhancementCatalog, tokenDistance } from '../shared/arcane.js';
import { MAX_MANUAL_LEVELS } from '../shared/roll-plan.js';
import { AppError } from './errors.js';
import { line as chatLine } from './i18n.js';
import { T } from '../shared/localization.js';

// Socket events for attacks. See server/attack.js for the flow.
//  - attack:roll   (the GM, or a player for their own PC)  rolls the weapon and Enhancements drafted in
//                  the Arcane tab, posts it in the chat and sends a pending attack to the GM's confirm card.
//  - attack:list / attack:targets / attack:apply / attack:cancel   (GM only)
export function registerAttackHandlers(ctx) {
  const { io, db, on, requireControl, emitSheet, authorName, shared, rooms } = ctx;
  const { GM_ROOM, CHAT_ROOM } = rooms;
  const pending = shared.attacks;

  const say = (m) => {
    const message = shared.chat.add({ type: 'text', author: { role: 'gm', name: T('Combat') }, ...chatLine(m) });
    io.to(CHAT_ROOM).emit('chat:message', message);
  };
  const get = (id) => {
    const p = pending.get(id);
    if (!p) throw new AppError('not_found', 'That attack is no longer waiting.');
    return p;
  };

  // ---- Enhancements everyone can use (made by the GM) -------------------------------------------

  const sendGlobals = async () => io.emit('arcane:enhancements', { enhancements: await arcane.listGlobal(db) });
  on('arcane:enhancements', { needsIdentity: true }, async () => ({ enhancements: await arcane.listGlobal(db) }));
  on('arcane:enhancement:save', { gmOnly: true }, async (p) => {
    const saved = await arcane.saveGlobal(db, p.id ?? null, p.enhancement);
    await sendGlobals();
    return { enhancement: saved };
  });
  on('arcane:enhancement:delete', { gmOnly: true }, async (p) => {
    await arcane.deleteGlobal(db, p.id);
    await sendGlobals();
  });

  // ---- The attack drafted in the Arcane tab ----------------------------------------------------------
  // p: { characterId, weapon, enhancements: [{ id, count }], advantage, modifier, confirmRange }
  // Rolls it, posts the roll in the chat and sends a pending attack to the GM's confirm card. When a
  // target is out of range the first call only answers { needsConfirm } (the range is a suggestion).
  on('attack:roll', { needsIdentity: true }, async (p) => {
    const c = await requireControl(p.characterId);
    const sheet = await sheets.getSheet(db, c.id);
    const catalog = enhancementCatalog(await arcane.listGlobal(db), sheet);
    const plan = planAttack(sheet, catalog, { weapon: p.weapon, enhancements: p.enhancements });
    if (!plan.ok) throw new AppError('bad_value', plan.error, plan.params);
    if (sheet.ap.current < plan.ap) throw new AppError('no_ap', 'Not enough AP: this attack costs {cost} and you have {have}.', { cost: plan.ap, have: sheet.ap.current });
    const picked = [...(shared.targets.get(c.id) ?? [])];
    if (!picked.length) throw new AppError('no_target', 'Select at least one target first.');
    const infos = [];
    for (const id of picked) {
      try {
        infos.push(await attack.targetInfo(db, id));
      } catch {
        // A token that has left the map is dropped.
      }
    }
    if (!infos.length) throw new AppError('no_target', 'Select at least one target first.');

    // Where the attacker stands, and how far each target is (the range is only a suggestion).
    const sceneId = await scenes.getActiveSceneId(db);
    const token = sceneId == null ? null : await battle.tokenForCharacter(db, sceneId, c.id);
    if (token && plan.range != null && p.confirmRange !== true) {
      const far = [];
      for (const t of infos) {
        const d = tokenDistance(token, await battle.getToken(db, t.tokenId));
        if (d > plan.range) far.push({ name: t.name, distance: d });
      }
      if (far.length) return { needsConfirm: { range: plan.range, targets: far } };
    }

    const roll = buildRoll(sheet, {
      kind: 'weapon',
      key: 'prime',
      advantage: Math.max(-MAX_MANUAL_LEVELS, Math.min(MAX_MANUAL_LEVELS, (p.advantage ?? 0) + plan.advantage)),
      modifier: p.modifier ?? 0,
      dice: plan.dice,
    });
    // The number to beat, shown big next to the total on the roll card.
    roll.against = {
      label: `${plan.defence === 'physical' ? 'Physical' : 'Mental'} Defence`,
      targets: infos.map((t) => ({ name: t.name, value: t.defence[plan.defence] })),
    };

    const attackId = shared.nextAttackId = (shared.nextAttackId ?? 0) + 1;
    const entry = {
      id: attackId,
      ts: Date.now(),
      characterId: c.id,
      characterName: c.name,
      attackerTokenId: token?.id ?? null,
      weaponName: plan.weapon.name,
      enhancements: plan.chosen.map((e) => ({ name: e.name, count: e.count })),
      ap: plan.ap,
      base: plan.base,
      kind: plan.kind,
      statuses: plan.statuses,
      unique: plan.unique,
      costs: {
        damage: plan.costs.damage,
        statuses: plan.costs.statuses,
        items: plan.costs.items.map((i) => ({ ...i, name: sheet.items.find((x) => x.id === i.itemId)?.name ?? '' })),
      },
      defenceKind: plan.defence,
      roll,
      targets: infos.map((t) => t.tokenId),
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
    const infos = [];
    for (const id of entry.targets) {
      try {
        infos.push(await attack.targetInfo(db, id));
      } catch {
        // A token that has left the map is skipped.
      }
    }
    const clean = attack.cleanApply(entry, p, infos);
    // Claim it first, so a double tap cannot apply it twice.
    pending.delete(p.id);
    try {
      const { lines } = await attack.applyAttack(db, entry, clean, { emitSheet });
      for (const l of lines) if (!l.hidden) say(l.message);
    } catch (err) {
      pending.set(p.id, entry);
      throw err;
    }
    io.to(GM_ROOM).emit('attack:resolved', { id: p.id });
  });

}
