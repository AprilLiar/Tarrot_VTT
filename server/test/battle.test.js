import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { stepCost, planMove, cleanMark } from '../battle.js';
import { gridSize } from '../scenes.js';
import * as battleLib from '../battle.js';

describe('movement maths', () => {
  it('straight steps cost 1 and diagonals alternate 1 and 2', () => {
    expect(stepCost(0, 1, 0)).toEqual({ cost: 1, diagonals: 0 });
    expect(stepCost(0, 1, 1)).toEqual({ cost: 1, diagonals: 1 });
    expect(stepCost(1, -1, 1)).toEqual({ cost: 2, diagonals: 2 });
    expect(stepCost(2, 0, -1)).toEqual({ cost: 1, diagonals: 2 });
  });

  it('is free when the checkbox is on', () => {
    expect(planMove({ bank: 0, diagonals: 0, movement: 6, ap: 4 }, { dc: 1, dr: 0, free: true })).toEqual({ free: true });
  });

  it('pays from the bank first', () => {
    expect(planMove({ bank: 3, diagonals: 0, movement: 6, ap: 4 }, { dc: 1, dr: 0, free: false })).toEqual({
      bank: 2,
      diagonals: 0,
      apSpent: 0,
      cost: 1,
    });
  });

  it('asks before spending AP, then banks the Movement and pays the step', () => {
    const state = { bank: 0, diagonals: 0, movement: 6, ap: 4 };
    expect(planMove(state, { dc: 1, dr: 0, free: false })).toMatchObject({ needsConfirm: true, aps: 1, movement: 6 });
    expect(planMove(state, { dc: 1, dr: 0, free: false, confirmAp: true })).toMatchObject({ apSpent: 1, bank: 5, cost: 1 });
  });

  it('a diagonal that costs 2 with 1 banked needs another AP when Movement is 1', () => {
    const state = { bank: 1, diagonals: 1, movement: 1, ap: 4 };
    expect(planMove(state, { dc: 1, dr: 1, free: false })).toMatchObject({ needsConfirm: true, aps: 1, movement: 1 });
    expect(planMove(state, { dc: 1, dr: 1, free: false, confirmAp: true })).toMatchObject({ apSpent: 1, bank: 0 });
  });

  it('refuses when there is no Movement or not enough AP', () => {
    expect(() => planMove({ bank: 0, diagonals: 0, movement: 0, ap: 4 }, { dc: 1, dr: 0, free: false })).toThrow(/no Movement/);
    expect(() => planMove({ bank: 0, diagonals: 0, movement: 6, ap: 0 }, { dc: 1, dr: 0, free: false })).toThrow(/AP/);
  });
});

describe('grid maths', () => {
  it('counts the cells over the picture, a partly fitting one at the edge too', () => {
    const scene = { battleAspect: 2, grid: { cell: 0.1, ox: 0, oy: 0 } }; // twice as wide as tall
    expect(gridSize(scene)).toEqual({ cols: 10, rows: 5 });
    expect(gridSize({ ...scene, grid: { cell: 0.1, ox: 0.05, oy: 0 } })).toEqual({ cols: 10, rows: 5 }); // the last column is cut by the edge
    expect(gridSize({ ...scene, grid: { cell: 0.1, ox: 0.15, oy: 0 } })).toEqual({ cols: 9, rows: 5 });
    expect(gridSize({ ...scene, grid: { cell: 0.1, ox: -0.05, oy: 0 } })).toEqual({ cols: 11, rows: 5 }); // starts before the picture
    expect(gridSize({ ...scene, grid: { cell: 0.12, ox: 0, oy: 0 } })).toEqual({ cols: 9, rows: 5 });
    expect(gridSize({ battleAspect: null, grid: { cell: 0.1, ox: 0, oy: 0 } })).toEqual({ cols: 0, rows: 0 });
  });
});

describe('marks validation', () => {
  it('cleans drawings and templates and rejects bad ones', () => {
    expect(cleanMark('draw', { color: '#ff0000', width: 4, points: [[0, 0], [0.5, 0.5]] }).points).toHaveLength(2);
    expect(() => cleanMark('draw', { color: 'red', width: 4, points: [[0, 0], [1, 1]] })).toThrow();
    expect(() => cleanMark('draw', { color: '#ff0000', width: 4, points: [[0, 0]] })).toThrow();
    expect(() => cleanMark('draw', { color: '#ff0000', width: 4, points: [[0, 0], [2, 1]] })).toThrow();
    expect(cleanMark('template', { shape: 'cone', x: 3.3, y: 2, size: 4, angle: -90, color: '#00ff00' })).toMatchObject({ x: 3.5, angle: 270 });
    expect(() => cleanMark('template', { shape: 'star', x: 1, y: 1, size: 3, angle: 0, color: '#00ff00' })).toThrow();
    expect(() => cleanMark('template', { shape: 'circle', x: 1, y: 1, size: 0, angle: 0, color: '#00ff00' })).toThrow();
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
  server.shared.areaTargets.clear();
  server.shared.combat = null;
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
const display = async () => {
  const s = await client();
  await s.call('identity:set', { role: 'display' });
  return s;
};
const player = async (characterId) => {
  const s = await client();
  expect((await s.call('identity:set', { role: 'player', characterId })).ok).toBe(true);
  return s;
};

// A scene with a 2:1 battle picture and a 10 x 5 grid.
async function battleScene(g) {
  const id = (await g.call('scene:create', { name: 'Arena', data: png() })).id;
  expect((await g.call('scene:set_battle_image', { id, data: png(), aspect: 2 })).ok).toBe(true);
  expect((await g.call('scene:set_grid', { id, cell: 0.1, ox: 0, oy: 0 })).ok).toBe(true);
  await g.call('scene:activate', { id });
  await g.call('battle:mode', { mode: 'battle' });
  return id;
}
async function withPicture(g, name, type = 'pc') {
  const id = (await g.call('character:create', { name, type })).id;
  await g.call('picture:add', { characterId: id, data: png() });
  return id;
}
const stageOf = async (s) => (await s.call('stage:get')).stage;
// Starts a combat with the given [tokenId, initiative] pairs; the highest is up first.
async function startCombat(g, pairs) {
  expect((await g.call('combat:start')).ok).toBe(true);
  for (const [tokenId, value] of pairs) expect((await g.call('combat:set_initiative', { tokenId, value })).ok).toBe(true);
  expect((await g.call('combat:begin')).ok).toBe(true);
}
const stageWhere = (sock, pred) =>
  new Promise((resolve) => {
    const on = (st) => {
      if (pred(st)) {
        sock.off('stage:updated', on);
        resolve(st);
      }
    };
    sock.on('stage:updated', on);
  });

describe('mode and map', () => {
  it('is GM only, and everyone watching follows the mode', async () => {
    const g = await gm();
    const d = await display();
    expect(await d.call('battle:mode', { mode: 'battle' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('battle:mode', { mode: 'chess' })).toMatchObject({ ok: false, code: 'bad_value' });
    const seen = stageWhere(d, (s) => s.mode === 'battle');
    await g.call('battle:mode', { mode: 'battle' });
    expect((await seen).mode).toBe('battle');
  });

  it('keeps the battle map, grid size and cells in the stage', async () => {
    const g = await gm();
    await battleScene(g);
    const { battle } = await stageOf(g);
    expect(battle).toMatchObject({ aspect: 2, cols: 10, rows: 5, grid: { cell: 0.1, ox: 0, oy: 0 } });
    expect(battle.imageId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects a grid that does not fit and an unusable picture shape', async () => {
    const g = await gm();
    const id = await battleScene(g);
    expect(await g.call('scene:set_grid', { id, cell: 0.9, ox: 0.5, oy: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('scene:set_grid', { id, cell: 0.001, ox: 0, oy: 0 })).toMatchObject({ ok: false });
    expect(await g.call('scene:set_battle_image', { id, data: png(), aspect: 50 })).toMatchObject({ ok: false, code: 'bad_value' });
    const d = await display();
    expect(await d.call('scene:set_grid', { id, cell: 0.1, ox: 0, oy: 0 })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('lets the grid extend past the picture: partial edge squares count and a negative shift is fine', async () => {
    const g = await gm();
    const id = await battleScene(g);
    // A picture twice as wide as tall: squares of 0.12 leave a partial ninth column; a shift of -0.05 starts before the picture.
    expect(await g.call('scene:set_grid', { id, cell: 0.12, ox: 0, oy: 0 })).toMatchObject({ ok: true, cols: 9, rows: 5 });
    expect(await g.call('scene:set_grid', { id, cell: 0.1, ox: -0.05, oy: -0.05 })).toMatchObject({ ok: true, cols: 11 });
    // The first square must still touch the picture.
    expect(await g.call('scene:set_grid', { id, cell: 0.1, ox: -0.1, oy: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    // A token can stand on the partly visible last column.
    await g.call('scene:set_grid', { id, cell: 0.12, ox: 0, oy: 0 });
    const charId = await withPicture(g, 'Edge');
    const token = (await g.call('battle:add', { characterId: charId })).id;
    expect((await g.call('battle:place', { id: token, col: 8, row: 0 })).ok).toBe(true);
    expect((await g.call('battle:place', { id: token, col: 9, row: 0 })).ok).toBe(false);
  });

  it('the grid is shown or hidden per scene, for everybody, and only the GM and the Display change it', async () => {
    const g = await gm();
    const id = await battleScene(g);
    const d = await display();
    const p = await player((await g.call('character:create', { name: 'Pia', type: 'pc' })).id);
    expect((await stageOf(p)).battle.showGrid).toBe(true);
    expect(await p.call('scene:show_grid', { id, show: false })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('scene:show_grid', { id, show: false })).ok).toBe(true);
    expect((await stageOf(d)).battle.showGrid).toBe(false);
    expect((await stageOf(p)).battle.showGrid).toBe(false);
    expect((await d.call('scene:show_grid', { id, show: true })).ok).toBe(true);
    expect((await stageOf(g)).battle.showGrid).toBe(true);
  });

  it('needs a battle picture before tokens can be placed', async () => {
    const g = await gm();
    const id = (await g.call('scene:create', { name: 'Bare' })).id;
    await g.call('scene:activate', { id });
    const pc = await withPicture(g, 'Aria');
    expect(await g.call('battle:add', { characterId: pc })).toMatchObject({ ok: false, code: 'no_battle_map' });
  });
});

describe('tokens', () => {
  it('places tokens on free squares, one per character, only by the GM', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const b = await withPicture(g, 'Bob');
    const a1 = await g.call('battle:add', { characterId: a });
    await g.call('battle:add', { characterId: b });
    expect(await g.call('battle:add', { characterId: a })).toMatchObject({ ok: false, code: 'already_on_map' });
    const { battle } = await stageOf(g);
    expect(battle.tokens.map((t) => [t.name, t.col, t.row, t.kind])).toEqual([['Aria', 0, 0, 'pc'], ['Bob', 1, 0, 'pc']]);

    const p = await player(a);
    expect(await p.call('battle:add', { characterId: b })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await p.call('battle:remove', { id: a1.id })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await p.call('battle:update', { id: a1.id, hidden: true })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('token size comes from the sheet, and big tokens do not overlap', async () => {
    const g = await gm();
    await battleScene(g);
    const ogre = await withPicture(g, 'Ogre', 'npc');
    const imp = await withPicture(g, 'Imp', 'npc');
    await g.call('sheet:set', { characterId: ogre, path: 'size', value: 3 });
    expect(await g.call('sheet:set', { characterId: ogre, path: 'size', value: 7 })).toMatchObject({ ok: false });
    await g.call('battle:add', { characterId: ogre });
    await g.call('battle:add', { characterId: imp });
    const { battle } = await stageOf(g);
    expect(battle.tokens.map((t) => [t.name, t.size, t.col])).toEqual([['Ogre', 3, 0], ['Imp', 1, 3]]);
  });

  it('props and temp NPCs are tokens too, with their own size', async () => {
    const g = await gm();
    await battleScene(g);
    const crate = (await g.call('temp_npc:create', { name: 'Crate', isProp: true, size: 2 })).id;
    await g.call('picture:add', { tempNpcId: crate, data: png() });
    await g.call('battle:add', { tempNpcId: crate });
    const t = (await stageOf(g)).battle.tokens[0];
    expect(t).toMatchObject({ name: 'Crate', kind: 'prop', size: 2 });
    expect((await g.call('temp_npc:set_size', { id: crate, size: 4 })).ok).toBe(true);
    expect((await stageOf(g)).battle.tokens[0].size).toBe(4);
    expect(await g.call('temp_npc:set_size', { id: crate, size: 9 })).toMatchObject({ ok: false, code: 'bad_value' });
  });

  it('dragging is free, snaps to whole squares and stays on the map', async () => {
    const g = await gm();
    const d = await display();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const { id } = await g.call('battle:add', { characterId: a });
    expect((await d.call('battle:place', { id, col: 4, row: 3 })).ok).toBe(true);
    expect((await stageOf(g)).battle.tokens[0]).toMatchObject({ col: 4, row: 3, bank: 0 });
    expect(await g.call('battle:place', { id, col: 10, row: 0 })).toMatchObject({ ok: false, code: 'out_of_bounds' });
    expect(await g.call('battle:place', { id, col: 1.5, row: 0 })).toMatchObject({ ok: false, code: 'out_of_bounds' });
    // A player drags their own character freely, but nobody else's.
    const p = await player(a);
    expect((await p.call('battle:place', { id, col: 0, row: 0 })).ok).toBe(true);
    const b = await withPicture(g, 'Bob');
    const bt = (await g.call('battle:add', { characterId: b })).id;
    expect(await p.call('battle:place', { id: bt, col: 1, row: 1 })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('never sends hidden tokens to players or the Display, and drops their targets', async () => {
    const g = await gm();
    const d = await display();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const gob = await withPicture(g, 'Goblin', 'npc');
    await g.call('battle:add', { characterId: a });
    const gt = (await g.call('battle:add', { characterId: gob })).id;
    const p = await player(a);
    expect((await p.call('battle:target', { characterId: a, tokenId: gt })).ok).toBe(true);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === gt).targetedBy).toEqual([a]);

    const dSaw = stageWhere(d, (s) => s.battle?.tokens.length === 1);
    await g.call('battle:update', { id: gt, hidden: true });
    expect((await dSaw).battle.tokens.map((t) => t.name)).toEqual(['Aria']);
    expect((await stageOf(p)).battle.tokens.map((t) => t.name)).toEqual(['Aria']);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === gt)).toMatchObject({ hidden: true, targetedBy: [] });
    expect(await p.call('battle:target', { characterId: a, tokenId: gt })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('deleting a character or the scene removes its tokens', async () => {
    const g = await gm();
    const scene = await battleScene(g);
    const a = await withPicture(g, 'Aria');
    await g.call('battle:add', { characterId: a });
    await g.call('character:delete', { id: a, confirmName: 'Aria' });
    expect((await stageOf(g)).battle.tokens).toHaveLength(0);
    const b = await withPicture(g, 'Bob');
    await g.call('battle:add', { characterId: b });
    await g.call('scene:delete', { id: scene });
    expect(Number((await db.execute('SELECT COUNT(*) AS n FROM battle_tokens')).rows[0].n)).toBe(0);
  });

  it('pulls tokens back onto the map when the grid changes', async () => {
    const g = await gm();
    const scene = await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const { id } = await g.call('battle:add', { characterId: a });
    await g.call('battle:place', { id, col: 9, row: 4 });
    await g.call('scene:set_grid', { id: scene, cell: 0.25, ox: 0, oy: 0 }); // 4 columns, 2 rows
    expect((await stageOf(g)).battle.tokens[0]).toMatchObject({ col: 3, row: 1 });
  });
});

describe('the D-pad', () => {
  async function ready() {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const { id } = await g.call('battle:add', { characterId: a });
    await g.call('battle:place', { id, col: 5, row: 2 });
    const p = await player(a);
    return { g, p, a, id };
  }

  it('moves one square in eight directions and stays on the map', async () => {
    const { p, id } = await ready();
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).moved).toBe(true);
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 1 })).moved).toBe(true);
    expect((await stageOf(p)).battle.tokens[0]).toMatchObject({ col: 7, row: 3 });
    expect(await p.call('battle:move', { tokenId: id, dc: 2, dr: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await p.call('battle:move', { tokenId: id, dc: 0, dr: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
    for (let i = 0; i < 4; i++) await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 });
    expect(await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).toMatchObject({ ok: false, code: 'out_of_bounds' });
  });

  it('lets a player move only their own PC token; the GM moves anyone', async () => {
    const { g, p, id } = await ready();
    const bob = await withPicture(g, 'Bob');
    const bt = (await g.call('battle:add', { characterId: bob })).id;
    expect(await p.call('battle:move', { tokenId: bt, dc: 0, dr: 1 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('battle:move', { tokenId: bt, dc: 0, dr: 1 })).ok).toBe(true);
    const gob = await withPicture(g, 'Goblin', 'npc');
    const gt = (await g.call('battle:add', { characterId: gob })).id;
    expect(await p.call('battle:move', { tokenId: gt, dc: 0, dr: 1 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('battle:move', { tokenId: id, dc: 0, dr: 1 })).ok).toBe(true);
  });

  it('is free while there is no combat: AP and Movement are untouched', async () => {
    const { g, p, a, id } = await ready();
    await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 });
    const sheet = (await g.call('sheet:get', { characterId: a })).sheet;
    expect(sheet.ap.current).toBe(4);
    expect((await stageOf(g)).battle.tokens[0].bank).toBe(0);
  });

  it('on its own turn it banks Movement for 1 AP, but only after confirmation', async () => {
    const { g, p, a, id } = await ready();
    await g.call('sheet:set', { characterId: a, path: 'movement', value: 3 });
    await startCombat(g, [[id, 10]]);

    const ask = await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 });
    expect(ask).toMatchObject({ ok: true, moved: false, needsConfirm: { aps: 1, movement: 3 } });
    expect((await stageOf(p)).battle.tokens[0]).toMatchObject({ col: 5, bank: 0 }); // nothing moved yet
    expect((await g.call('sheet:get', { characterId: a })).sheet.ap.current).toBe(4);

    const yes = await p.call('battle:move', { tokenId: id, dc: 1, dr: 0, confirmAp: true });
    expect(yes).toMatchObject({ moved: true, apSpent: 1 });
    expect((await g.call('sheet:get', { characterId: a })).sheet.ap.current).toBe(3);
    expect((await stageOf(p)).battle.tokens[0]).toMatchObject({ col: 6, bank: 2 });

    // The next two steps come out of the bank without asking.
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).apSpent).toBe(0);
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).moved).toBe(true);
    expect((await stageOf(p)).battle.tokens[0].bank).toBe(0);
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).needsConfirm).toBeTruthy();
  });

  it('the Free Movement checkbox and other turns move for nothing', async () => {
    const { g, p, a, id } = await ready();
    const bob = await withPicture(g, 'Bob');
    const bt = (await g.call('battle:add', { characterId: bob })).id;
    await startCombat(g, [[id, 10], [bt, 5]]);
    const r = await p.call('battle:move', { tokenId: id, dc: 1, dr: 0, free: true });
    expect(r).toMatchObject({ moved: true, free: true });
    await g.call('combat:next'); // Bob's turn now
    expect((await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).free).toBe(true);
    expect((await g.call('sheet:get', { characterId: a })).sheet.ap.current).toBe(4);
  });

  it('alternates diagonal costs and refuses to move with no AP or no Movement', async () => {
    const { g, p, a, id } = await ready();
    await startCombat(g, [[id, 10]]);
    await g.call('sheet:set', { characterId: a, path: 'movement', value: 4 });
    await p.call('battle:move', { tokenId: id, dc: 1, dr: 1, confirmAp: true }); // banks 4, pays 1
    await p.call('battle:move', { tokenId: id, dc: 1, dr: 1 }); // diagonal number two costs 2
    expect((await stageOf(p)).battle.tokens[0].bank).toBe(1);

    await g.call('sheet:set', { characterId: a, path: 'movement', value: 0 });
    await g.call('battle:clear_bank', { id });
    expect(await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).toMatchObject({ ok: false, code: 'no_movement' });
    await g.call('sheet:set', { characterId: a, path: 'movement', value: 5 });
    await g.call('sheet:set', { characterId: a, path: 'ap.current', value: 0 });
    expect(await p.call('battle:move', { tokenId: id, dc: 1, dr: 0 })).toMatchObject({ ok: false, code: 'no_ap' });
  });
});

describe('targeting', () => {
  it('a player targets for their own PC only, and can clear it', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const b = await withPicture(g, 'Bob');
    await g.call('battle:add', { characterId: a });
    const bt = (await g.call('battle:add', { characterId: b })).id;
    const p = await player(a);
    expect(await p.call('battle:target', { characterId: b, tokenId: bt })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await p.call('battle:target', { characterId: a, tokenId: bt })).ok).toBe(true);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === bt).targetedBy).toEqual([a]);
    expect((await p.call('battle:target', { characterId: a, tokenId: null })).ok).toBe(true);
    expect((await stageOf(g)).battle.tokens.find((t) => t.id === bt).targetedBy).toEqual([]);
    expect((await g.call('battle:target', { characterId: b, tokenId: bt })).ok).toBe(true); // the GM can target for anyone
  });

  it('selects many tokens; tapping a selected one again deselects it', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const b = await withPicture(g, 'Bob');
    const c = await withPicture(g, 'Cid');
    await g.call('battle:add', { characterId: a });
    const bt = (await g.call('battle:add', { characterId: b })).id;
    const ct = (await g.call('battle:add', { characterId: c })).id;
    const p = await player(a);
    const by = async (id) => (await stageOf(g)).battle.tokens.find((t) => t.id === id).targetedBy;
    await p.call('battle:target', { characterId: a, tokenId: bt });
    await p.call('battle:target', { characterId: a, tokenId: ct });
    expect(await by(bt)).toEqual([a]);
    expect(await by(ct)).toEqual([a]);
    await p.call('battle:target', { characterId: a, tokenId: bt });
    expect(await by(bt)).toEqual([]);
    expect(await by(ct)).toEqual([a]);
    await p.call('battle:target', { characterId: a, tokenId: null });
    expect(await by(ct)).toEqual([]);
  });
});

describe('height', () => {
  it('the GM sets how many Spaces a token is in the air; everyone sees it', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const t = (await g.call('battle:add', { characterId: a })).id;
    const d = await display();
    expect((await stageOf(d)).battle.tokens[0].height).toBe(0);
    expect((await g.call('battle:update', { id: t, height: 3 })).ok).toBe(true);
    expect((await stageOf(d)).battle.tokens[0].height).toBe(3);
    expect(await g.call('battle:update', { id: t, height: -1 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('battle:update', { id: t, height: 1.5 })).toMatchObject({ ok: false, code: 'bad_value' });
    // The Display has the whole menu; a player only the height of their own character.
    expect((await d.call('battle:update', { id: t, height: 1 })).ok).toBe(true);
    const own = await player(a);
    const other = await player(await withPicture(g, 'Bob'));
    expect((await own.call('battle:update', { id: t, height: 2 })).ok).toBe(true);
    expect((await stageOf(d)).battle.tokens[0].height).toBe(2);
    expect(await own.call('battle:update', { id: t, hidden: true })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await own.call('battle:update', { id: t, height: 2, hidden: true })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await other.call('battle:update', { id: t, height: 5 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await own.call('battle:remove', { id: t })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await d.call('battle:remove', { id: t })).ok).toBe(true);
  });
});

describe('the eraser', () => {
  const line = { color: '#ff0000', width: 4, points: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((x) => [x, 0.5]) };

  it('rubs out part of a drawing and splits it in two', async () => {
    const g = await gm();
    const d = await display();
    await battleScene(g);
    await g.call('mark:add', { kind: 'draw', data: line });
    expect((await d.call('mark:erase', { x: 0.5, y: 0.5, r: 0.06 })).ok).toBe(true);
    const marks = (await stageOf(g)).battle.marks;
    expect(marks).toHaveLength(2);
    expect(marks[0].points.map((p) => p[0])).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(marks[1].points.map((p) => p[0])).toEqual([0.6, 0.7, 0.8, 0.9]);
    expect(marks[0]).toMatchObject({ color: '#ff0000', width: 4 });
  });

  it('cuts where a long segment passes through the eraser, removes what is left too small, and ignores misses', async () => {
    const g = await gm();
    await battleScene(g);
    await g.call('mark:add', { kind: 'draw', data: { color: '#ff0000', width: 4, points: [[0.1, 0.5], [0.9, 0.5]] } });
    await g.call('mark:erase', { x: 0.5, y: 0.5, r: 0.05 });
    expect((await stageOf(g)).battle.marks).toHaveLength(0); // both halves were a single point
    await g.call('mark:add', { kind: 'draw', data: line });
    await g.call('mark:erase', { x: 0.5, y: 0.1, r: 0.05 });
    expect((await stageOf(g)).battle.marks).toHaveLength(1);
    // A big rub leaves the two ends; rubbing an end out removes that piece for good.
    await g.call('mark:erase', { x: 0.5, y: 0.5, r: 0.2 });
    expect((await stageOf(g)).battle.marks).toHaveLength(2);
    await g.call('mark:erase', { x: 0.15, y: 0.5, r: 0.1 });
    expect((await stageOf(g)).battle.marks).toHaveLength(1);
  });

  it('is limited to the GM and the Display and to sensible numbers', async () => {
    const g = await gm();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const p = await player(a);
    expect(await p.call('mark:erase', { x: 0.5, y: 0.5, r: 0.05 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('mark:erase', { x: 2, y: 0.5, r: 0.05 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('mark:erase', { x: 0.5, y: 0.5, r: 5 })).toMatchObject({ ok: false, code: 'bad_value' });
  });

  it('accepts an arc template', async () => {
    const g = await gm();
    await battleScene(g);
    const r = await g.call('mark:add', { kind: 'template', data: { shape: 'arc', x: 3, y: 2, size: 3, angle: 0, color: '#00aaff' } });
    expect(r.ok).toBe(true);
    expect((await stageOf(g)).battle.marks[0].shape).toBe('arc');
  });
});

describe('named areas and area targeting', () => {
  const area = (shape, x, y, size = 2) => ({ kind: 'template', data: { shape, x, y, size, angle: 0, color: '#00aaff' } });
  const names = async (g) => (await stageOf(g)).battle.marks.filter((m) => m.kind === 'template').map((m) => `${m.shape} ${m.n}`);

  it('numbers each shape from 1, one above the largest still there, and never renumbers', async () => {
    const g = await gm();
    await battleScene(g);
    for (const a of [area('arc', 3, 2), area('cone', 3, 2), area('arc', 5, 2), area('arc', 7, 2)]) await g.call('mark:add', a);
    expect(await names(g)).toEqual(['arc 1', 'cone 1', 'arc 2', 'arc 3']);
    const marks = (await stageOf(g)).battle.marks;
    await g.call('mark:remove', { id: marks[0].id }); // Arc 1
    await g.call('mark:remove', { id: marks[2].id }); // Arc 2
    expect(await names(g)).toEqual(['cone 1', 'arc 3']); // Arc 3 stays Arc 3
    await g.call('mark:add', area('arc', 2, 2));
    expect(await names(g)).toEqual(['cone 1', 'arc 3', 'arc 4']);
    await g.call('mark:clear', { kind: 'template' });
    await g.call('mark:add', area('arc', 2, 2));
    expect(await names(g)).toEqual(['arc 1']); // nothing left: the first again
  });

  it('picking an area picks everyone inside it, live, and the tokens show as targeted', async () => {
    const g = await gm();
    await battleScene(g);
    const make = async (name, type) => {
      const id = (await g.call('character:create', { name, type })).id;
      await g.call('picture:add', { characterId: id, data: png() });
      return { id, token: (await g.call('battle:add', { characterId: id })).id };
    };
    const aria = await make('Aria', 'pc');
    const orc = await make('Orc', 'npc');
    const imp = await make('Imp', 'npc');
    const p = await player(aria.id);
    const place = (who, col, row) => g.call('battle:place', { id: who.token, col, row });
    await place(aria, 0, 0);
    await place(orc, 4, 2);
    await place(imp, 9, 4);
    await g.call('mark:add', area('circle', 4.5, 2.5, 2)); // centred on the Orc's square, two squares around
    const mark = (await stageOf(g)).battle.marks[0];
    expect(await p.call('battle:target_area', { characterId: aria.id, markId: 9999 })).toMatchObject({ ok: false, code: 'not_found' });
    expect((await p.call('battle:target_area', { characterId: aria.id, markId: mark.id })).ok).toBe(true);
    const stage = (await stageOf(p)).battle;
    expect(stage.marks[0].targetedBy).toEqual([aria.id]);
    expect(stage.tokens.filter((t) => t.targetedBy.includes(aria.id)).map((t) => t.name)).toEqual(['Orc']);
    expect(await battleLib.effectiveTargets(db, server.shared, aria.id)).toEqual([orc.token]);
    // Someone walks in: the area is live, no new pick is needed.
    await place(imp, 5, 3);
    expect((await battleLib.effectiveTargets(db, server.shared, aria.id)).sort()).toEqual([orc.token, imp.token].sort());
    // Picking the Orc by hand as well changes nothing (each target counts once); a second tap on the area drops it.
    await p.call('battle:target', { characterId: aria.id, tokenId: orc.token });
    expect((await battleLib.effectiveTargets(db, server.shared, aria.id)).sort()).toEqual([orc.token, imp.token].sort());
    await p.call('battle:target_area', { characterId: aria.id, markId: mark.id });
    expect(await battleLib.effectiveTargets(db, server.shared, aria.id)).toEqual([orc.token]);
    // Clear targets clears both kinds; erasing an area drops it from every pick.
    await p.call('battle:target_area', { characterId: aria.id, markId: mark.id });
    await p.call('battle:target', { characterId: aria.id, tokenId: null });
    expect(await battleLib.effectiveTargets(db, server.shared, aria.id)).toEqual([]);
    await p.call('battle:target_area', { characterId: aria.id, markId: mark.id });
    await g.call('mark:remove', { id: mark.id });
    expect(await battleLib.effectiveTargets(db, server.shared, aria.id)).toEqual([]);
    expect(await p.call('battle:target_area', { characterId: aria.id, markId: null })).toMatchObject({ ok: true });
  });
});

describe('drawings, templates and pings', () => {
  const stroke = { color: '#ff0000', width: 4, points: [[0.1, 0.1], [0.4, 0.4]] };
  const cone = { shape: 'cone', x: 3, y: 2, size: 4, angle: 90, color: '#00aaff' };

  it('the GM and the Display can add, erase and clean; players cannot touch them', async () => {
    const g = await gm();
    const d = await display();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const p = await player(a);
    for (const who of [p]) {
      expect(await who.call('mark:add', { kind: 'draw', data: stroke })).toMatchObject({ ok: false, code: 'forbidden' });
      expect(await who.call('battle:ping', { x: 0.5, y: 0.5 })).toMatchObject({ ok: false, code: 'forbidden' });
    }
    const s1 = (await d.call('mark:add', { kind: 'draw', data: stroke })).id;
    const t1 = (await g.call('mark:add', { kind: 'template', data: cone })).id;
    const marks = (await stageOf(p)).battle.marks;
    expect(marks.map((m) => m.kind)).toEqual(['draw', 'template']);
    expect(marks[1]).toMatchObject({ shape: 'cone', angle: 90 });
    expect((await d.call('mark:remove', { id: s1 })).ok).toBe(true);
    expect(await p.call('mark:clear', {})).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await d.call('mark:clear', { kind: 'draw' })).ok).toBe(true);
    expect((await g.call('mark:clear', { kind: 'template' })).ok).toBe(true);
    expect((await stageOf(g)).battle.marks).toHaveLength(0);
    expect(t1).toBeGreaterThan(0);
  });

  it('rejects bad marks and caps how many there can be', async () => {
    const g = await gm();
    await battleScene(g);
    expect(await g.call('mark:add', { kind: 'draw', data: { ...stroke, color: 'red' } })).toMatchObject({ ok: false, code: 'bad_mark' });
    expect(await g.call('mark:add', { kind: 'doodle', data: stroke })).toMatchObject({ ok: false, code: 'bad_mark' });
    const sceneId = (await stageOf(g)).scene.id;
    const rows = Array.from({ length: 300 }, () => ({ sql: "INSERT INTO battle_marks (scene_id, kind, data) VALUES (?, 'draw', '{}')", args: [sceneId] }));
    await db.batch(rows, 'write');
    expect(await g.call('mark:add', { kind: 'draw', data: stroke })).toMatchObject({ ok: false, code: 'limit' });
  });

  it('a ping goes to the GM and the Display and to nobody else', async () => {
    const g = await gm();
    const d = await display();
    await battleScene(g);
    const a = await withPicture(g, 'Aria');
    const p = await player(a);
    const gotD = new Promise((resolve) => d.once('battle:pinged', resolve));
    const gotP = new Promise((resolve) => p.once('battle:pinged', resolve));
    expect((await g.call('battle:ping', { x: 0.25, y: 0.75 })).ok).toBe(true);
    expect(await gotD).toEqual({ x: 0.25, y: 0.75, by: 'gm' });
    expect(await gotP).toEqual({ x: 0.25, y: 0.75, by: 'gm' }); // players watching the map see it
    expect(await g.call('battle:ping', { x: 2, y: 0 })).toMatchObject({ ok: false, code: 'bad_value' });
  });
});
