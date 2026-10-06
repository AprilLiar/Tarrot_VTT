import * as sheets from './sheet.js';
import * as roster from './roster.js';
import { AppError } from './errors.js';
import { buildRoll } from './rolls.js';
import { planRoll } from '../shared/roll-plan.js';
import { createJournal } from './journal.js';
import { addToGroups, DURATION_LABELS, statusInfo, statusSave, totalsOf } from '../shared/statuses.js';
import * as D from '../shared/rules-data.js';
import { randomUUID } from 'node:crypto';

// Statuses and their Saves. A status that has a Save (shared/statuses.js) only lands when the character it is put on fails
// that Save against a DC. A non-player character rolls at once, without AP; a player is asked (the prompt shows the Save, the DC
// and the modifiers the character already has, and offers AP for Advantage); the GM can roll for a player who is not there.
// A Repeated status is rolled again at the end of its character's turn (see statusTick in sceneHandlers.js).

const MAX_AP_LEVELS = 10;

// A sheet with a status put on it, lasting as `apply.duration` says (the totals follow the groups).
export function putStatus(sheet, apply, dc) {
  const next = structuredClone(sheet);
  const { groups } = addToGroups(next.statusGroups ?? [], apply, typeof dc === 'number' ? dc : 10, randomUUID);
  next.statusGroups = groups;
  next.statuses = totalsOf(groups);
  return next;
}

// A sheet without the Repeated stacks of a status.
export function dropRepeated(sheet, key) {
  const next = structuredClone(sheet);
  next.statusGroups = (next.statusGroups ?? []).filter((g) => !(g.key === key && g.duration === 'repeated'));
  next.statuses = totalsOf(next.statusGroups);
  return next;
}

// The status as text for a chat row: "Bleeding 2 (Repeated)".
export function statusMsg(apply) {
  const info = statusInfo(apply.key);
  return {
    key: '{status} ({duration})',
    params: { status: { t: info.stackable ? `${info.name} ${apply.stacks}` : info.name, c: 'status' }, duration: { t: DURATION_LABELS[apply.duration] } },
    c: 'status',
  };
}

export function createSaves({ io, db, shared, emitSheet, effects, rooms }) {
  const { GM_ROOM, CHAT_ROOM, charRoom } = rooms;
  const pending = (shared.saves ??= new Map());

  // What the prompt shows: the Save, the DC and the Advantage or Disadvantage the character already has.
  async function describe(req) {
    const sheet = await sheets.getSheet(db, req.characterId);
    const save = statusSave(req.apply.key);
    const plan = planRoll(sheet, { kind: 'save', key: save });
    return {
      id: req.id,
      characterId: req.characterId,
      name: req.name,
      kind: req.kind,
      apply: req.apply,
      save,
      dc: req.dc,
      source: req.source,
      net: plan.net,
      sources: plan.sources,
      expression: plan.expression,
      apMax: Math.min(sheet.ap.current, MAX_AP_LEVELS),
    };
  }

  const roll = async (sheet, req, ap) => {
    const save = statusSave(req.apply.key);
    const r = buildRoll(sheet, { kind: 'save', key: save, advantage: ap });
    r.against = { label: 'DC', targets: [{ name: statusInfo(req.apply.key).name, value: req.dc }] };
    return { roll: r, pass: r.total >= req.dc, save };
  };

  // Makes the Save of `req` and applies what follows; every change goes in `journal`. -> { rows, roll }
  async function settle(req, ap, journal) {
    const sheet = await sheets.getSheet(db, req.characterId);
    const spend = Math.max(0, Math.min(ap, sheet.ap.current, MAX_AP_LEVELS));
    const { roll: r, pass, save } = await roll(sheet, req, spend);
    const out = await journal.update(db, req.characterId, (s) => {
      let next = structuredClone(s);
      next.ap.current = Math.max(0, next.ap.current - spend);
      if (req.kind === 'apply' && !pass) next = putStatus(next, req.apply, req.dc);
      if (req.kind === 'repeated' && pass) next = dropRepeated(next, req.apply.key);
      return sheets.normalizeSheet(next);
    });
    emitSheet(req.characterId, out);
    const rows = [
      {
        key: '{save} against {status}: {total} vs DC {dc}, {result}.',
        params: {
          save: { t: `${D.GROUP_SAVES[save].label} Save`, c: 'num' },
          status: statusMsg(req.apply),
          total: { v: r.total, c: 'num' },
          dc: { v: req.dc, c: 'num' },
          result: pass ? { t: 'Resisted', c: 'hit' } : { t: 'Failed', c: 'miss' },
        },
      },
    ];
    if (spend > 0) rows.push({ key: '{label} {n}.', params: { label: { t: 'AP spent', c: 'ap' }, n: { v: spend, c: 'ap' } } });
    if (req.kind === 'apply' && !pass) rows.push({ key: '{label} {list}.', params: { label: { t: 'Adds', c: 'status' }, list: statusMsg(req.apply) } });
    if (req.kind === 'repeated' && pass) rows.push({ key: '{label} {list}.', params: { label: { t: 'Ends', c: 'status' }, list: statusMsg(req.apply) } });
    return { rows, roll: r };
  }

  const postRoll = (req, r, author) => {
    if (req.hidden) return;
    const message = shared.chat.add({ type: 'roll', author, characterId: req.characterId, characterName: req.name, roll: { ...r, title: r.title } });
    io.to(CHAT_ROOM).emit('chat:message', message);
  };

  return {
    pending,

    // A status is put on a character. `journal` is the card that does it (an attack card): no Save means it lands now, a
    // non-player character rolls now, and a player is asked. -> { rows, rolls: [{ roll, name }] }
    async begin(journal, { characterId, name, hidden = false, apply, dc, source }) {
      const save = statusSave(apply.key);
      if (!save) {
        const out = await journal.update(db, characterId, (s) => sheets.normalizeSheet(putStatus(s, apply, dc)));
        emitSheet(characterId, out);
        return { rows: [{ key: '{label} {list}.', params: { label: { t: 'Adds', c: 'status' }, list: statusMsg(apply) } }], rolls: [] };
      }
      const character = await roster.getCharacter(db, characterId);
      const req = { id: (shared.nextSaveId = (shared.nextSaveId ?? 0) + 1), characterId, name, hidden, apply, dc, source, kind: 'apply' };
      if (character?.type === 'npc') {
        const { rows, roll: r } = await settle(req, 0, journal);
        return { rows, rolls: [{ roll: r, name }] };
      }
      await this.ask(req);
      return {
        rows: [
          {
            key: '{status}: {save} against DC {dc}, waiting for {name}.',
            params: { status: statusMsg(apply), save: { t: `${D.GROUP_SAVES[save].label} Save`, c: 'num' }, dc: { v: dc, c: 'num' }, name },
          },
        ],
        rolls: [],
      };
    },

    // A player (or the GM for a player who is away) is asked for a Save.
    async ask(req) {
      pending.set(req.id, req);
      const info = await describe(req);
      io.to(charRoom(req.characterId)).emit('save:ask', info);
      io.to(GM_ROOM).emit('save:pending', info);
      return info;
    },

    // The answer: `ap` AP are spent for that many levels of Advantage. Posts the roll and a card of what came of it.
    async answer(id, ap, author) {
      const req = pending.get(id);
      if (!req) throw new AppError('not_found', 'That Save is no longer waiting.');
      pending.delete(id);
      try {
        const journal = createJournal();
        const { rows, roll: r } = await settle(req, ap, journal);
        postRoll(req, r, author);
        effects.post({
          kind: 'save',
          title: { key: '{name}: {status}', params: { name: req.name, status: statusMsg(req.apply) } },
          blocks: [{ name: req.name, rows, hidden: req.hidden }],
          journal,
        });
      } catch (err) {
        pending.set(id, req);
        throw err;
      }
      io.to(charRoom(req.characterId)).emit('save:resolved', { id });
      io.to(GM_ROOM).emit('save:resolved', { id });
    },

    // The Repeated Save of a status at the end of its character's turn: a non-player character rolls now, a player is asked.
    // -> { rows, rolls } for an immediate result, or null when a player was asked
    async repeat(journal, { characterId, name, hidden = false, key, dc }) {
      const info = statusInfo(key);
      const sheet = await sheets.getSheet(db, characterId);
      const group = sheet.statusGroups.find((g) => g.key === key && g.duration === 'repeated');
      if (!group) return null;
      const apply = { key, stacks: group.stacks, duration: 'repeated', dc };
      const req = { id: (shared.nextSaveId = (shared.nextSaveId ?? 0) + 1), characterId, name, hidden, apply: { ...apply, stacks: info.stackable ? group.stacks : 1 }, dc, source: '', kind: 'repeated' };
      const character = await roster.getCharacter(db, characterId);
      if (character?.type === 'npc') {
        const { rows, roll: r } = await settle(req, 0, journal);
        return { rows, rolls: [{ roll: r, name }] };
      }
      await this.ask(req);
      return null;
    },

    list(characterId, isGm) {
      return [...pending.values()].filter((r) => isGm || r.characterId === characterId);
    },
    describe,
  };
}
