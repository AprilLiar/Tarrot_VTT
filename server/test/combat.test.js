import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import * as C from '../combat.js';
import { normalizeSheet } from '../sheet.js';
import { english } from '../i18n.js';

const tok = (id, kind = 'pc') => ({ id, kind, ownerKind: 'character', ownerId: id * 10, name: `T${id}`, imageId: null });

describe('resistance table', () => {
  it('applies flat first, then Half and Double', () => {
    expect(C.applyResistance(undefined, 6).damage).toBe(6);
    expect(C.applyResistance({ flat: 2, half: false, double: false }, 6).damage).toBe(4);
    expect(C.applyResistance({ flat: 2, half: true, double: false }, 6).damage).toBe(2);
    expect(C.applyResistance({ flat: -2, half: false, double: true }, 3).damage).toBe(10);
    expect(C.applyResistance({ flat: 9, half: false, double: false }, 3).damage).toBe(0);
    expect(C.applyResistance({ half: true }, 5).damage).toBe(3); // 2.5 rounds up
  });
  it('immunity takes nothing; consumption heals half', () => {
    expect(C.applyResistance({ immunity: true }, 8)).toMatchObject({ damage: 0, heal: 0 });
    expect(C.applyResistance({ consumption: true }, 8)).toMatchObject({ damage: 0, heal: 4 });
  });
});

describe('turn start and end on a sheet', () => {
  const base = () => normalizeSheet({ hp: { current: 10, max: 12 }, ap: { current: 4 } });

  it('Bleeding is true damage; Burning goes through fire resistance', () => {
    const s = base();
    s.statuses = { bleeding: 2, burning: 4 };
    s.resistances = { fire: { flat: 1, half: false, double: false, immunity: false, consumption: false } };
    const { sheet, lines } = C.startOfTurn(s, 'Aria');
    expect(sheet.hp.current).toBe(5); // 10 - 2 - 3
    expect(lines).toHaveLength(2);
    expect(english(lines[0])).toMatch(/2 damage from Bleeding 2/);
    expect(english(lines[1])).toMatch(/3 damage from Burning 4/);
  });

  it('Burning on a fire-consuming creature heals it, capped at max HP', () => {
    const s = base();
    s.statuses = { burning: 6 };
    s.resistances = { fire: { flat: 0, half: false, double: false, immunity: false, consumption: true } };
    expect(C.startOfTurn(s, 'Imp').sheet.hp.current).toBe(12);
  });

  it('damage never takes HP below 0', () => {
    const s = base();
    s.statuses = { bleeding: 30 };
    expect(C.startOfTurn(s, 'Aria').sheet.hp.current).toBe(0);
  });

  it('Stunned X and Surprised lower the AP a turn starts with', () => {
    const s = base();
    s.statuses = { stunned: 1, surprised: 1 };
    const out = C.startOfTurn(s, 'Aria');
    expect(out.sheet.ap.current).toBe(1); // 4 - 1 - 2
    expect(english(out.lines[0])).toMatch(/1 AP instead of 4 \(Stunned 1, Surprised 2\)/);
    s.statuses = { stunned: 9 };
    expect(C.startOfTurn(s, 'Aria').sheet.ap.current).toBe(0);
  });

  it('no statuses means no change and no lines', () => {
    const out = C.startOfTurn(base(), 'Aria');
    expect(out.lines).toEqual([]);
    expect(out.sheet.hp.current).toBe(10);
  });

  it('the end of a turn refills AP and removes Surprised only', () => {
    const s = base();
    s.ap.current = 1;
    s.statuses = { surprised: 1, bleeding: 1 };
    const next = C.endOfTurn(s);
    expect(next.ap.current).toBe(4);
    expect(next.statuses.surprised).toBeUndefined();
    expect(next.statuses.bleeding).toBe(1);
  });
});

describe('the order', () => {
  const make = () => C.newCombat(1, [tok(1), tok(2), tok(3), tok(4), tok(9, 'prop')]);

  it('enrols everyone but props', () => {
    expect(make().order.map((e) => e.tokenId)).toEqual([1, 2, 3, 4]);
    expect(() => C.newCombat(1, [tok(9, 'prop')])).toThrow(/no characters/i);
  });

  it('sorts highest first, keeps ties in order, and puts the unrolled last', () => {
    const c = make();
    C.setInitiative(c, 1, 5);
    C.setInitiative(c, 2, 12);
    C.setInitiative(c, 3, 12);
    C.begin(c);
    expect(c.order.map((e) => e.tokenId)).toEqual([2, 3, 1, 4]);
    expect(c).toMatchObject({ phase: 'active', round: 1, activeIndex: 0 });
    expect(() => C.begin(c)).toThrow();
  });

  it('advances and starts a new round after the last', () => {
    const c = make();
    C.begin(c);
    for (let i = 0; i < 3; i++) C.advance(c);
    expect(c).toMatchObject({ round: 1, activeIndex: 3 });
    C.advance(c);
    expect(c).toMatchObject({ round: 2, activeIndex: 0 });
  });

  it('reorders without changing whose turn it is, and rejects a bad list', () => {
    const c = make();
    C.begin(c);
    C.advance(c); // token 2 is up
    C.reorder(c, [4, 3, 2, 1]);
    expect(C.activeEntry(c).tokenId).toBe(2);
    expect(() => C.reorder(c, [1, 2, 3])).toThrow();
    expect(() => C.reorder(c, [1, 1, 2, 3])).toThrow();
  });

  it('drops combatants whose token is gone and reports when the active one left', () => {
    const c = make();
    C.begin(c);
    C.advance(c); // token 2 is up
    let out = C.reconcile(c, [tok(1), tok(2), tok(3)]); // 4 removed
    expect(out).toMatchObject({ gone: [4], activeRemoved: false });
    out = C.reconcile(c, [tok(1), tok(3)]); // the active one is removed
    expect(out.activeRemoved).toBe(true);
    expect(C.activeEntry(c).tokenId).toBe(3);
    expect(c.round).toBe(1);
  });

  it('removing the last active combatant wraps to the next round', () => {
    const c = C.newCombat(1, [tok(1), tok(2)]);
    C.begin(c);
    C.advance(c); // token 2, last
    expect(C.removeCombatant(c, 2)).toBe(true);
    expect(c).toMatchObject({ round: 2, activeIndex: 0 });
  });
});

// ---- sockets --------------------------------------------------------------------------

let db, server, base;
const sockets = [];
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), Buffer.alloc(4)]);

beforeAll(async () => {
  db = createDb({ url: 'file::memory:' });
  await initSchema(db);
  server = createServer({ db });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  db.close();
});
beforeEach(async () => {
  await db.batch(
    ['DELETE FROM battle_tokens', 'DELETE FROM battle_marks', 'DELETE FROM stage_summons', 'DELETE FROM pictures', 'DELETE FROM scenes', 'DELETE FROM temp_npcs', 'DELETE FROM images', 'DELETE FROM characters', "UPDATE scene_state SET active_scene_id = NULL, mode = 'scene'"],
    'write',
  );
  server.shared.targets.clear();
  server.shared.combat = null;
  server.shared.chat.clear();
});

async function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  return s;
}
const gm = async () => {
  const s = await client();
  await s.call('identity:set', { role: 'gm' });
  return s;
};
const player = async (characterId) => {
  const s = await client();
  await s.call('identity:set', { role: 'player', characterId });
  return s;
};
const stageOf = async (s) => (await s.call('stage:get')).stage;

async function battleScene(g) {
  const id = (await g.call('scene:create', { name: 'Arena', data: png() })).id;
  await g.call('scene:set_battle_image', { id, data: png(), aspect: 2 });
  await g.call('scene:set_grid', { id, cell: 0.1, ox: 0, oy: 0 });
  await g.call('scene:activate', { id });
  await g.call('battle:mode', { mode: 'battle' });
  return id;
}
// A character with a picture and a token on the map. -> { id (character), token }
async function fighter(g, name, type = 'pc') {
  const id = (await g.call('character:create', { name, type })).id;
  await g.call('picture:add', { characterId: id, data: png() });
  const token = (await g.call('battle:add', { characterId: id })).id;
  return { id, token };
}
const texts = () => server.shared.chat.history().filter((m) => m.type === 'text' || m.type === 'effects').map((m) => m.text);

describe('starting and rolling initiative', () => {
  it('is GM only, needs a scene, and ignores props', async () => {
    const g = await gm();
    expect(await g.call('combat:start')).toMatchObject({ ok: false, code: 'no_scene' });
    await battleScene(g);
    expect(await g.call('combat:start')).toMatchObject({ ok: false, code: 'no_combatants' });
    const a = await fighter(g, 'Aria');
    const p = await player(a.id);
    expect(await p.call('combat:start')).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('combat:start')).ok).toBe(true);
    expect(await g.call('combat:start')).toMatchObject({ ok: false, code: 'combat_running' });
    const { combat } = (await stageOf(g)).battle;
    expect(combat).toMatchObject({ phase: 'rolling', round: 0 });
    expect(combat.order.map((e) => e.name)).toEqual(['Aria']);
  });

  it('a player rolls Speed for their own PC once; the GM rolls the NPCs', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await fighter(g, 'Aria');
    const b = await fighter(g, 'Bob');
    const o = await fighter(g, 'Ogre', 'npc');
    await g.call('combat:start');
    const pa = await player(a.id);
    expect(await pa.call('combat:roll', { tokenId: b.token })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await pa.call('combat:roll', { tokenId: o.token })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await pa.call('combat:roll', { tokenId: a.token })).ok).toBe(true);
    expect(await pa.call('combat:roll', { tokenId: a.token })).toMatchObject({ ok: false, code: 'already_rolled' });
    const rollMsg = server.shared.chat.history().find((m) => m.type === 'roll');
    expect(rollMsg.roll.title).toMatch(/Initiative/);

    expect((await g.call('combat:roll_npcs')).ok).toBe(true);
    const order = (await stageOf(g)).battle.combat.order;
    const by = (n) => order.find((e) => e.name === n);
    expect(by('Aria').initiative).toBe(rollMsg.roll.total);
    expect(by('Ogre').initiative).toBeGreaterThan(0);
    expect(by('Bob').initiative).toBeNull(); // players roll their own
    expect((await g.call('combat:set_initiative', { tokenId: b.token, value: 3 })).ok).toBe(true);
    expect(await g.call('combat:set_initiative', { tokenId: b.token, value: 1.5 })).toMatchObject({ ok: false, code: 'bad_value' });
  });

  it('hidden combatants are left out for players and stay silent in the chat', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await fighter(g, 'Aria');
    const o = await fighter(g, 'Ambusher', 'npc');
    await g.call('battle:update', { id: o.token, hidden: true });
    await g.call('combat:start');
    await g.call('combat:roll_npcs');
    const p = await player(a.id);
    expect((await stageOf(p)).battle.combat.order.map((e) => e.name)).toEqual(['Aria']);
    expect((await stageOf(g)).battle.combat.order.map((e) => e.name)).toEqual(['Aria', 'Ambusher']);
    expect(texts().join(' ')).not.toMatch(/Ambusher/);
  });
});

describe('turns', () => {
  async function fight() {
    const g = await gm();
    await battleScene(g);
    const a = await fighter(g, 'Aria');
    const b = await fighter(g, 'Bob');
    await g.call('combat:start');
    await g.call('combat:set_initiative', { tokenId: a.token, value: 15 });
    await g.call('combat:set_initiative', { tokenId: b.token, value: 8 });
    await g.call('combat:begin');
    return { g, a, b, pa: await player(a.id), pb: await player(b.id) };
  }

  it('begins with the highest initiative and announces the turn', async () => {
    const { g, a } = await fight();
    const c = (await stageOf(g)).battle.combat;
    expect(c).toMatchObject({ phase: 'active', round: 1, activeTokenId: a.token });
    expect(texts()).toContain("Round 1: Aria's turn.");
  });

  it('only the GM or the player whose turn it is can end it; rounds count up', async () => {
    const { g, a, b, pa, pb } = await fight();
    expect(await pb.call('combat:next')).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await pa.call('combat:next')).ok).toBe(true);
    expect((await stageOf(g)).battle.combat.activeTokenId).toBe(b.token);
    expect(await pa.call('combat:next')).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await pb.call('combat:next')).ok).toBe(true);
    expect((await stageOf(g)).battle.combat).toMatchObject({ round: 2, activeTokenId: a.token });
    expect(texts()).toContain("Round 2: Aria's turn.");
  });

  it('a stale End turn does not skip the next turn', async () => {
    const { g, a, pa } = await fight();
    await pa.call('combat:next', { tokenId: a.token });
    expect(await g.call('combat:next', { tokenId: a.token })).toMatchObject({ ok: false, code: 'stale' });
  });

  it('ending a turn clears the Movement bank and refills AP', async () => {
    const { g, a, pa } = await fight();
    await pa.call('battle:move', { tokenId: a.token, dc: 1, dr: 0, confirmAp: true });
    let sheet = (await g.call('sheet:get', { characterId: a.id })).sheet;
    expect(sheet.ap.current).toBe(3);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === a.token).bank).toBe(4);
    await pa.call('combat:next');
    sheet = (await g.call('sheet:get', { characterId: a.id })).sheet;
    expect(sheet.ap.current).toBe(4);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === a.token).bank).toBe(0);
  });

  it('turn-start effects hit the character whose turn begins, with a chat line', async () => {
    const { g, b, pa } = await fight();
    await g.call('sheet:set', { characterId: b.id, path: 'hp.max', value: 20 });
    await g.call('sheet:set', { characterId: b.id, path: 'hp.current', value: 20 });
    await g.call('sheet:set', { characterId: b.id, path: 'statuses.bleeding', value: 3 });
    await g.call('sheet:set', { characterId: b.id, path: 'statuses.surprised', value: 1 });
    await pa.call('combat:next'); // Bob starts
    const sheet = (await g.call('sheet:get', { characterId: b.id })).sheet;
    expect(sheet.hp.current).toBe(17);
    expect(sheet.ap.current).toBe(2);
    expect(texts().some((t) => /Bob takes 3 damage from Bleeding 3/.test(t))).toBe(true);
    await g.call('combat:next'); // Bob ends: Surprised wears off
    expect((await g.call('sheet:get', { characterId: b.id })).sheet.statuses.surprised).toBeUndefined();
  });

  it('the start of a turn is one card the GM can revert', async () => {
    const { g, b, pa } = await fight();
    await g.call('sheet:set', { characterId: b.id, path: 'hp.max', value: 20 });
    await g.call('sheet:set', { characterId: b.id, path: 'hp.current', value: 20 });
    await g.call('sheet:set', { characterId: b.id, path: 'statuses.bleeding', value: 3 });
    await pa.call('combat:next'); // Bob starts
    const card = server.shared.chat.history().find((m) => m.type === 'effects');
    expect(card).toMatchObject({ kind: 'turn', status: 'applied', reversible: true, editable: false });
    expect(card.blocks[0].name).toBe('Bob');
    expect((await g.call('sheet:get', { characterId: b.id })).sheet.hp.current).toBe(17);
    expect((await g.call('effects:revert', { messageId: card.id })).ok).toBe(true);
    expect((await g.call('sheet:get', { characterId: b.id })).sheet.hp.current).toBe(20);
  });

  it('removing the active combatant hands the turn on; the GM can reorder', async () => {
    const { g, a, b } = await fight();
    expect((await g.call('combat:reorder', { ids: [b.token, a.token] })).ok).toBe(true);
    expect((await stageOf(g)).battle.combat.activeTokenId).toBe(a.token);
    await g.call('battle:remove', { id: a.token }); // token deleted from the map
    expect((await stageOf(g)).battle.combat).toMatchObject({ activeTokenId: b.token, round: 2 }); // Aria was last, so a new round starts
    expect(await g.call('combat:reorder', { ids: [a.token] })).toMatchObject({ ok: false, code: 'bad_order' });
  });

  it('the GM can add a late arrival and remove others', async () => {
    const { g, b } = await fight();
    const late = await fighter(g, 'Goblin', 'npc');
    expect((await g.call('combat:add', { tokenId: late.token })).ok).toBe(true);
    expect(await g.call('combat:add', { tokenId: late.token })).toMatchObject({ ok: false, code: 'already_in_combat' });
    expect((await stageOf(g)).battle.combat.order.map((e) => e.name)).toEqual(['Aria', 'Bob', 'Goblin']);
    expect((await g.call('combat:remove', { tokenId: b.token })).ok).toBe(true);
    expect((await stageOf(g)).battle.combat.order.map((e) => e.name)).toEqual(['Aria', 'Goblin']);
  });

  it('ending the combat clears it, and so does activating another scene', async () => {
    const { g } = await fight();
    expect((await g.call('combat:end')).ok).toBe(true);
    expect((await stageOf(g)).battle.combat).toBeNull();
    expect(texts().some((t) => /Combat ends after 1 round/.test(t))).toBe(true);
    expect(await g.call('combat:next')).toMatchObject({ ok: false, code: 'no_combat' });

    await g.call('combat:start');
    const other = (await g.call('scene:create', { name: 'Elsewhere', data: png() })).id;
    await g.call('scene:activate', { id: other });
    expect(server.shared.combat).toBeNull();
  });
});
