import * as attack from './attack.js';
import * as battle from './battle.js';
import * as sheets from './sheet.js';
import * as scenes from './scenes.js';
import * as arcane from './arcane.js';
import { helpDiceFor, spendHelp } from './help.js';
import * as stances from './stances.js';
import { listLocks, lockedError } from './locks.js';
import { magicLocked, stancesLocked, manifestationsLocked } from '../shared/locks.js';
import * as D from '../shared/rules-data.js';
import { buildRoll, adjustLevels } from './rolls.js';
import { createJournal } from './journal.js';
import { normalizeApply } from '../shared/statuses.js';
import { planAttack, enhancementCatalog, tokenDistance } from '../shared/arcane.js';
import { HELP_SIDES } from '../shared/help.js';
import { DAMAGE_KINDS } from '../shared/damage.js';
import { MAX_MANUAL_LEVELS } from '../shared/roll-plan.js';
import { resolveBand, BANDS, blankEffect } from '../shared/stances.js';
import { sharedAgainst, combatMods } from '../shared/effects.js';
import * as effectRuntime from './effectRuntime.js';
import { AppError } from './errors.js';
import { line as chatLine } from './i18n.js';
import { T } from '../shared/localization.js';

// Socket events for attacks. See server/attack.js for the flow.
//  - attack:roll   (the GM, or a player for their own PC)  rolls the weapon and Enhancements drafted in
//                  the Arcane tab, posts it in the chat and sends a pending attack to the GM's confirm card.
//  - attack:list / attack:targets / attack:apply / attack:cancel   (GM only)
export function registerAttackHandlers(ctx) {
  const { io, db, on, requireControl, emitSheet, effects: cards, saves, authorName, shared, isGm, rooms } = ctx;
  const { GM_ROOM, CHAT_ROOM } = rooms;
  const pending = shared.attacks;

  const say = (m) => {
    const message = shared.chat.add({ type: 'text', author: { role: 'gm', name: T('Combat') }, ...chatLine(m) });
    io.to(CHAT_ROOM).emit('chat:message', message);
  };
  // A roll made for the attacker as part of applying (a spell's durability check), as a roll card.
  const postRoll = ({ roll, name, characterId }) => {
    const message = shared.chat.add({ type: 'roll', author: { role: 'player', name }, characterId, characterName: name, roll });
    io.to(CHAT_ROOM).emit('chat:message', message);
  };
  // What the targets' Effects add to the one attack roll (only what every target shares), and the spending of Uses afterwards.
  const NONE = { levels: [], terms: [], used: [] };
  const againstOf = (infos) => sharedAgainst(infos.map((t) => ({ name: t.name, mods: t.against ?? NONE })));
  async function spendAfterRoll(attackerId, roll, infos, against) {
    await effectRuntime.spendRollUses(db, attackerId, roll, emitSheet);
    for (const [i, ids] of Object.entries(against.used)) {
      const t = infos[Number(i)];
      if (t?.ownerKind === 'character') await effectRuntime.spendUses(db, null, t.ownerId, ids, emitSheet);
    }
  }
  // The Effects an attack puts on somebody, resolved against the library (global and the attacker's own): [{ def, to }].
  async function grantsOf(sheet, refs) {
    const cat = effectRuntime.catalog(await effectRuntime.listGlobal(db), sheet);
    return refs.map((r) => ({ def: cat.find((e) => e.id === r.id), to: r.to })).filter((g) => g.def);
  }
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
    const choice = { weapon: p.weapon, enhancements: p.enhancements };
    // A Stance must be learned by this character (a base Stance too); its Cost is part of the attack from the start.
    const stance = p.stance == null ? null : await stances.getStance(db, p.stance);
    let plan = planAttack(sheet, catalog, choice, stance ? [{ name: stance.name, effect: blankEffect(), cost: stance.cost }] : []);
    if (!plan.ok) throw new AppError('bad_value', plan.error, plan.params);
    // A player cannot use what the GM has locked (Magic, a Zodiac's Stances, Manifestations).
    const locks = isGm() ? [] : await listLocks(db);
    if ((plan.spellIds.length && magicLocked(locks)) || (plan.manifestationIds.length && manifestationsLocked(locks))) throw lockedError();
    if (sheet.ap.current < plan.ap) throw new AppError('no_ap', 'Not enough AP: this attack costs {cost} and you have {have}.', { cost: plan.ap, have: sheet.ap.current });
    const picked = await battle.effectiveTargets(db, shared, c.id);
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

    if (stance && stancesLocked(locks, stance.sign)) throw lockedError();
    if (stance && !stance.learned.includes(c.id)) throw new AppError('forbidden', 'That Stance is not learned by this character.');

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

    // The Stance is rolled once the attack is sure to go ahead: its band adds to the attack (the range check
    // above ignores what the band adds to the range).
    let stanceEntry = null;
    let stanceRoll = null;
    if (stance) {
      stanceRoll = buildRoll(sheet, { kind: 'mastery', key: 'stances' });
      stanceRoll.title = T('Stance roll');
      const hit = resolveBand(stance.table, stanceRoll.total);
      plan = planAttack(sheet, catalog, choice, [{ name: stance.name, effect: hit.effect, cost: stance.cost }]);
      if (!plan.ok) throw new AppError('bad_value', plan.error, plan.params);
      stanceEntry = { name: stance.name, band: BANDS[hit.band].label, total: stanceRoll.total };
    }

    // Basic weapons roll the Prime stat; a spell rolls the Magic Mastery.
    const against = againstOf(infos);
    const roll = buildRoll(sheet, {
      kind: plan.weapon.mastery ? 'mastery' : 'weapon',
      key: plan.weapon.mastery ?? 'prime',
      attack: plan.weapon.mastery ?? 'weapon',
      against,
      advantage: Math.max(-MAX_MANUAL_LEVELS, Math.min(MAX_MANUAL_LEVELS, (p.advantage ?? 0) + plan.advantage)),
      modifier: p.modifier ?? 0,
      bonuses: plan.bonuses,
      dice: [...plan.dice, ...helpDiceFor(sheet, p.help)],
    });
    if (plan.weapon.mastery) roll.title = `${D.MASTERY_LABELS[plan.weapon.mastery]} attack`;
    await spendHelp(db, c.id, p.help, emitSheet);
    await spendAfterRoll(c.id, roll, infos, against);
    // The attacker's own Effects: flat damage and the Critical Hit threshold.
    const mine = combatMods(sheet);
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
      spells: plan.spellIds,
      stance: stanceEntry,
      base: Math.max(0, plan.base + mine.damageDealt),
      critThreshold: Math.max(2, 20 + mine.crit),
      effectGrants: await grantsOf(sheet, plan.effectRefs),
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

    const author = await authorName();
    for (const n of against.notes) say({ key: '{effect} on {name} is not added to the roll: the targets differ. Use Edit on the card if it should count.', params: { effect: { t: n.label, c: 'effect' }, name: n.name } });
    if (stanceRoll) {
      const card = shared.chat.add({ type: 'roll', author, characterId: c.id, characterName: c.name, roll: stanceRoll });
      io.to(CHAT_ROOM).emit('chat:message', card);
      say({ key: '{name} uses the {stance} Stance: rolled {total}, band {band}.', params: { name: c.name, stance: stance.name, total: stanceRoll.total, band: { t: stanceEntry.band } } });
    }
    const message = shared.chat.add({ type: 'roll', author, characterId: c.id, characterName: c.name, roll });
    io.to(CHAT_ROOM).emit('chat:message', message);
    io.to(GM_ROOM).emit('attack:pending', entry);
    return { attackId, message };
  });

  // ---- Spontaneous Action (GM only, one time, stored nowhere) ----------------------------------------------
  // p: { characterId, ap: 1|2, roll: 'weapon'|'magic'|'stances'|'manifestation',
  //      defence: 'physical'|'mental', help?: [indices], effects: { damage?: { amount, kind }, help?: { sides },
  //      status?: { key, stacks }, temp?: { value } } }
  // Any combination of the four effects. Damage and Status need a roll (the picked Combat roll against the Defence,
  // then the usual confirm card); a Help Die and Temp HP alone are given at once. Everything goes to the selected
  // targets, and with none selected to the acting character.
  const intIn = (v, min, max, what) => {
    if (!Number.isInteger(v) || v < min || v > max) throw new AppError('bad_value', '{what} must be a whole number from {min} to {max}.', { what: { t: what }, min, max });
    return v;
  };
  on('spontaneous:do', { gmOnly: true }, async (p) => {
    const c = await requireControl(p.characterId);
    if (p.ap !== 1 && p.ap !== 2) throw new AppError('bad_value', 'A Spontaneous Action costs 1 or 2 AP.');
    const fx = p.effects && typeof p.effects === 'object' ? p.effects : {};
    const effects = {};
    if (fx.damage) {
      if (!DAMAGE_KINDS.includes(fx.damage.kind)) throw new AppError('bad_value', 'Choose a damage type.');
      effects.damage = { amount: intIn(fx.damage.amount, 0, 999, 'Damage'), kind: fx.damage.kind };
    }
    if (fx.help) {
      if (!HELP_SIDES.includes(fx.help.sides)) throw new AppError('bad_value', 'Choose a die from d4 to d12.');
      effects.help = { sides: fx.help.sides };
    }
    if (fx.status) {
      const apply = normalizeApply(fx.status);
      if (!apply) throw new AppError('bad_value', 'Unknown status.');
      if (D.STATUSES.find((x) => x.key === apply.key).stackable) intIn(fx.status.stacks, 1, 10, 'Status stacks');
      effects.status = apply;
    }
    if (fx.temp) effects.temp = { value: intIn(fx.temp.value, 1, 9999, 'Temp HP') };
    if (fx.effect) effects.effect = { id: String(fx.effect.id), to: fx.effect.to === 'self' ? 'self' : 'target' };
    if (!Object.keys(effects).length) throw new AppError('bad_value', 'Choose at least one effect.');
    const needsRoll = !!(effects.damage || effects.status);
    if (needsRoll && p.defence !== 'physical' && p.defence !== 'mental') throw new AppError('bad_value', 'Choose Physical or Mental Defence.');
    if (needsRoll && !['weapon', 'magic', 'stances', 'manifestation'].includes(p.roll)) throw new AppError('bad_value', 'Choose the roll to make.');

    const sheet = await sheets.getSheet(db, c.id);
    if (sheet.ap.current < p.ap) throw new AppError('no_ap', 'Not enough AP: this attack costs {cost} and you have {have}.', { cost: p.ap, have: sheet.ap.current });

    // Who it is aimed at.
    const picked = await battle.effectiveTargets(db, shared, c.id);
    const sceneId = await scenes.getActiveSceneId(db);
    const ownToken = sceneId == null ? null : await battle.tokenForCharacter(db, sceneId, c.id);
    const infos = [];
    if (picked.length) {
      for (const id of picked) {
        try {
          infos.push(await attack.targetInfo(db, id));
        } catch {
          // A token that has left the map is dropped.
        }
      }
      if (!infos.length) throw new AppError('no_target', 'Select at least one target first.');
    } else if (ownToken) {
      infos.push(await attack.targetInfo(db, ownToken.id));
    }

    const title = T('Spontaneous Action');
    if (!needsRoll) {
      // Instant: a Help Die and/or Temp HP, no roll.
      const journal = createJournal();
      const blocks = [];
      if (infos.length) {
        for (const t of infos) {
          const token = await battle.getToken(db, t.tokenId);
          if (token.ownerKind !== 'character') continue;
          blocks.push({ name: token.name, hidden: token.hidden, rows: await attack.grantBenefits(db, journal, token.ownerId, token.name, effects, emitSheet) });
        }
      } else {
        blocks.push({ name: c.name, rows: await attack.grantBenefits(db, journal, c.id, c.name, effects, emitSheet) });
      }
      if (effects.effect) {
        for (const g of await grantsOf(sheet, [effects.effect])) {
          if (g.to === 'self' || !infos.length) {
            blocks.push({ name: c.name, rows: (await effectRuntime.giveEffect(db, journal, c.id, g.def, c.name, emitSheet)).rows });
            continue;
          }
          for (const t of infos) {
            const token = await battle.getToken(db, t.tokenId);
            if (token.ownerKind !== 'character') continue;
            blocks.push({ name: token.name, hidden: token.hidden, rows: (await effectRuntime.giveEffect(db, journal, token.ownerId, g.def, c.name, emitSheet)).rows });
          }
        }
      }
      const spent = await journal.update(db, c.id, (s) => {
        const next = structuredClone(s);
        next.ap.current = Math.max(0, next.ap.current - p.ap);
        return sheets.normalizeSheet(next);
      });
      emitSheet(c.id, spent);
      blocks.push({ name: c.name, rows: [{ key: '{label} {n}.', params: { label: { t: 'AP spent', c: 'ap' }, n: { v: p.ap, c: 'ap' } } }] });
      cards.post({ kind: 'spontaneous', title: { key: '{name} uses a Spontaneous Action ({ap} AP).', params: { name: c.name, ap: p.ap } }, blocks, journal });
      return { instant: true };
    }

    if (!infos.length) throw new AppError('no_target', 'Select at least one target first.');
    const mastery = p.roll === 'weapon' ? null : p.roll;
    const dice = helpDiceFor(sheet, p.help);
    const against = againstOf(infos);
    const roll = buildRoll(sheet, { kind: mastery ? 'mastery' : 'weapon', key: mastery ?? 'prime', attack: mastery === 'stances' ? undefined : (mastery ?? 'weapon'), against, dice });
    await spendHelp(db, c.id, p.help, emitSheet);
    await spendAfterRoll(c.id, roll, infos, against);
    const mine = combatMods(sheet);
    roll.title = mastery ? `${D.MASTERY_LABELS[mastery]} attack` : T('Weapon Attack Roll');
    roll.against = {
      label: `${p.defence === 'physical' ? 'Physical' : 'Mental'} Defence`,
      targets: infos.map((t) => ({ name: t.name, value: t.defence[p.defence] })),
    };
    const attackId = (shared.nextAttackId = (shared.nextAttackId ?? 0) + 1);
    const entry = {
      id: attackId,
      ts: Date.now(),
      characterId: c.id,
      characterName: c.name,
      attackerTokenId: ownToken?.id ?? null,
      weaponName: title,
      enhancements: [],
      ap: p.ap,
      spells: [],
      base: effects.damage ? Math.max(0, effects.damage.amount + mine.damageDealt) : 0,
      critThreshold: Math.max(2, 20 + mine.crit),
      effectGrants: effects.effect ? await grantsOf(sheet, [{ id: effects.effect.id, to: effects.effect.to }]) : [],
      kind: effects.damage?.kind ?? 'true',
      statuses: effects.status ? [effects.status] : [],
      unique: [],
      costs: { damage: [], statuses: [], items: [] },
      stance: null,
      spontaneous: { help: effects.help ?? null, temp: effects.temp ?? null },
      defenceKind: p.defence,
      roll,
      targets: infos.map((t) => t.tokenId),
    };
    pending.set(attackId, entry);
    while (pending.size > attack.MAX_PENDING) pending.delete(pending.keys().next().value);
    const message = shared.chat.add({ type: 'roll', author: await authorName(), characterId: c.id, characterName: c.name, roll });
    io.to(CHAT_ROOM).emit('chat:message', message);
    io.to(GM_ROOM).emit('attack:pending', entry);
    return { attackId };
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

  // The GM gives the roll Advantage (levels > 0) or Disadvantage (levels < 0): the d20 that counted stays, more d20s join it
  // and the best or worst counts. Everything that had changed the dice before is forgotten. The adjusted roll is posted as a
  // new roll card and the confirm card shows the new numbers.
  on('attack:advantage', { gmOnly: true }, async (p) => {
    const entry = get(p.id);
    const roll = adjustLevels(entry.roll, p.levels);
    roll.title = T('Attack roll (set by the GM)');
    entry.roll = roll;
    delete entry.total;
    const message = shared.chat.add({ type: 'roll', author: { role: 'gm', name: 'GM' }, characterId: entry.characterId, characterName: entry.characterName, roll });
    io.to(CHAT_ROOM).emit('chat:message', message);
    io.to(GM_ROOM).emit('attack:pending', entry);
  });

  // Edit on an applied attack card: take its effects back and reopen the confirm card with what was applied, so the
  // GM can change the damage, the statuses or the roll and apply again. The old card shows as replaced.
  on('effects:edit', { gmOnly: true }, async ({ messageId }) => {
    const fx = cards.store.get(messageId);
    if (!fx?.entry || !fx.clean) throw new AppError('not_found', 'That card cannot be edited.');
    await cards.revert(messageId, 'replaced');
    const { entry: old, clean } = fx;
    const id = (shared.nextAttackId = (shared.nextAttackId ?? 0) + 1);
    const entry = {
      ...structuredClone(old),
      id,
      ts: Date.now(),
      base: clean.base,
      kind: clean.kind,
      ap: clean.ap,
      statuses: clean.statuses.map((x) => ({ key: x.key, stacks: x.stacks, duration: x.duration, dc: x.dc })),
      total: clean.total,
    };
    pending.set(id, entry);
    while (pending.size > attack.MAX_PENDING) pending.delete(pending.keys().next().value);
    io.to(GM_ROOM).emit('attack:pending', entry);
    return { attackId: id };
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
      const journal = createJournal();
      const { blocks, rolls } = await attack.applyAttack(db, entry, clean, { emitSheet, journal, saves });
      for (const r of rolls) postRoll(r);
      cards.post({
        kind: 'attack',
        title: { key: '{name} attacks with {weapon}', params: { name: entry.characterName, weapon: entry.weaponName } },
        blocks,
        journal,
        entry,
        clean,
      });
    } catch (err) {
      pending.set(p.id, entry);
      throw err;
    }
    io.to(GM_ROOM).emit('attack:resolved', { id: p.id });
  });

}
