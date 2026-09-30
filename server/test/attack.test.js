import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { hitResult, computeTarget } from '../../shared/damage.js';
import { tokenInTemplate, tokensInTemplate } from '../../shared/templates.js';

describe('hit severity', () => {
  const at = (total, defence, natural = 10, critThreshold) => hitResult({ total, defence, natural, critThreshold });

  it('misses below the Defence and steps up every 5 points', () => {
    expect(at(11, 12)).toMatchObject({ severity: 'miss', hit: false, bonus: 0 });
    expect(at(12, 12)).toMatchObject({ severity: 'hit', bonus: 0 });
    expect(at(16, 12)).toMatchObject({ severity: 'hit', bonus: 0 });
    expect(at(17, 12)).toMatchObject({ severity: 'heavy', bonus: 1 });
    expect(at(21, 12)).toMatchObject({ severity: 'heavy', bonus: 1 });
    expect(at(22, 12)).toMatchObject({ severity: 'brutal', bonus: 2 });
  });

  it('a critical always hits and adds 2 on top of the severity', () => {
    expect(at(5, 12, 20)).toMatchObject({ hit: true, critical: true, bonus: 2, label: 'Critical Hit (Hit)' });
    expect(at(22, 12, 20)).toMatchObject({ severity: 'brutal', bonus: 4 });
    expect(at(30, 12, 19, 19)).toMatchObject({ critical: true });
    expect(at(30, 12, 19)).toMatchObject({ critical: false });
  });

  it('a natural 1 does not miss by itself', () => {
    expect(at(15, 12, 1).hit).toBe(true);
  });
});

describe('damage per target', () => {
  const base = { total: 17, natural: 10, defence: 12, base: 4, kind: 'fire' };

  it('is base + severity, then the resistance table', () => {
    expect(computeTarget(base)).toMatchObject({ raw: 5, damage: 5 });
    expect(computeTarget({ ...base, resistance: { flat: 2, half: true } })).toMatchObject({ raw: 5, damage: 2 }); // 5 - 2 = 3, half rounds up
    expect(computeTarget({ ...base, resistance: { immunity: true } }).damage).toBe(0);
    expect(computeTarget({ ...base, resistance: { consumption: true } })).toMatchObject({ damage: 0, heal: 3 });
  });

  it('true damage ignores resistances; an override replaces the number', () => {
    expect(computeTarget({ ...base, kind: 'true', resistance: { immunity: true } }).damage).toBe(5);
    expect(computeTarget({ ...base, override: 9 })).toMatchObject({ damage: 9, overridden: true, raw: 5 });
  });

  it('a miss does nothing', () => {
    expect(computeTarget({ ...base, total: 3 })).toMatchObject({ hit: false, damage: 0, raw: 0 });
  });
});

describe('areas', () => {
  const grid = { cell: 0.1, ox: 0, oy: 0 };
  const aspect = 2; // 10 x 5 squares
  const tok = (col, row, size = 1) => ({ col, row, size });
  const centre = (col, row) => ({ x: col + 0.5, y: row + 0.5 }); // a template placed on a square's middle

  it('a circle takes the tokens within its radius', () => {
    const t = { shape: 'circle', ...centre(4, 2), size: 2, angle: 0 };
    expect(tokenInTemplate(t, tok(4, 2), grid, aspect)).toBe(true);
    expect(tokenInTemplate(t, tok(6, 2), grid, aspect)).toBe(true); // exactly 2 squares away
    expect(tokenInTemplate(t, tok(7, 2), grid, aspect)).toBe(false);
    expect(tokenInTemplate(t, tok(4, 0), grid, aspect)).toBe(true);
  });

  it('a square is centred on its point', () => {
    const t = { shape: 'square', ...centre(4, 2), size: 2, angle: 0 };
    expect(tokenInTemplate(t, tok(5, 3), grid, aspect)).toBe(true);
    expect(tokenInTemplate(t, tok(6, 2), grid, aspect)).toBe(false);
  });

  it('an arc is a 180 degree half circle', () => {
    const t = { shape: 'arc', ...centre(4, 2), size: 3, angle: 0 };
    expect(tokenInTemplate(t, tok(6, 2), grid, aspect)).toBe(true);
    expect(tokenInTemplate(t, tok(5, 4), grid, aspect)).toBe(true); // 45 degrees down
    expect(tokenInTemplate(t, tok(4, 4), grid, aspect)).toBe(true); // straight down: the edge of the half circle
    expect(tokenInTemplate(t, tok(3, 2), grid, aspect)).toBe(false); // behind
    expect(tokenInTemplate(t, tok(8, 2), grid, aspect)).toBe(false); // too far
  });

  it('a line runs one square wide in its direction', () => {
    const t = { shape: 'line', ...centre(1, 2), size: 4, angle: 0 };
    expect(tokensInTemplate(t, [tok(2, 2), tok(5, 2), tok(6, 2), tok(3, 3)], grid, aspect).map((x) => x.col)).toEqual([2, 5]);
  });

  it('a cone is a 90 degree wedge', () => {
    const t = { shape: 'cone', ...centre(1, 2), size: 4, angle: 0 };
    expect(tokenInTemplate(t, tok(4, 2), grid, aspect)).toBe(true);
    expect(tokenInTemplate(t, tok(3, 4), grid, aspect)).toBe(true); // 45 degrees down
    expect(tokenInTemplate(t, tok(2, 4), grid, aspect)).toBe(false); // steeper than 45
    expect(tokenInTemplate(t, tok(0, 2), grid, aspect)).toBe(false); // behind
    expect(tokenInTemplate({ ...t, angle: 90 }, tok(1, 4), grid, aspect)).toBe(true);
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
  server.shared.attacks.clear();
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

async function battleScene(g) {
  const id = (await g.call('scene:create', { name: 'Arena', data: png() })).id;
  await g.call('scene:set_battle_image', { id, data: png(), aspect: 2 });
  await g.call('scene:set_grid', { id, cell: 0.1, ox: 0, oy: 0 });
  await g.call('scene:activate', { id });
  await g.call('battle:mode', { mode: 'battle' });
}
async function fighter(g, name, type = 'pc') {
  const id = (await g.call('character:create', { name, type })).id;
  await g.call('picture:add', { characterId: id, data: png() });
  const token = (await g.call('battle:add', { characterId: id })).id;
  return { id, token };
}
const sheetOf = async (g, id) => (await g.call('sheet:get', { characterId: id })).sheet;
const texts = () => server.shared.chat.history().filter((m) => m.type === 'text').map((m) => m.text);
const nextPending = (g) => new Promise((resolve) => g.once('attack:pending', resolve));

async function setup() {
  const g = await gm();
  await battleScene(g);
  const a = await fighter(g, 'Aria');
  const o = await fighter(g, 'Ogre', 'npc');
  await g.call('sheet:set', { characterId: o.id, path: 'hp.max', value: 30 });
  await g.call('sheet:set', { characterId: o.id, path: 'hp.current', value: 30 });
  await g.call('sheet:set', { characterId: o.id, path: 'defence.physical', value: 12 });
  const p = await player(a.id);
  return { g, a, o, p };
}
const roll = (ctx, extra = {}) => ctx.p.call('attack:roll', { characterId: ctx.a.id, mastery: 'stances', ap: 2, defence: 'physical', ...extra });

describe('rolling an attack', () => {
  it('rolls the Mastery, shows the number to beat, posts it in the chat and sends a pending attack to the GM', async () => {
    const ctx = await setup();
    const { g, a, o, p } = ctx;
    await p.call('battle:target', { characterId: a.id, tokenId: o.token });
    const seen = nextPending(g);
    const r = await roll(ctx);
    expect(r.ok).toBe(true);
    const pending = await seen;
    expect(pending).toMatchObject({ characterId: a.id, mastery: 'stances', ap: 2, defenceKind: 'physical', attackerTokenId: a.token, targets: [o.token] });
    expect(pending.roll.title).toBe('Stances attack');
    expect(pending.roll.against).toEqual({ label: 'Physical Defence', targets: [{ name: 'Ogre', value: 12 }] });
    const card = server.shared.chat.history().find((m) => m.type === 'roll');
    expect(card.roll.against.targets[0]).toEqual({ name: 'Ogre', value: 12 });
    expect((await g.call('attack:list')).attacks).toHaveLength(1);
  });

  it('needs a target, enough AP, a Mastery and a Defence, and only the owner rolls', async () => {
    const ctx = await setup();
    const { g, a, o, p } = ctx;
    expect(await roll(ctx)).toMatchObject({ ok: false, code: 'no_target' });
    await p.call('battle:target', { characterId: a.id, tokenId: o.token });
    expect(await p.call('attack:roll', { characterId: o.id, mastery: 'magic', ap: 1, defence: 'physical' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await roll(ctx, { mastery: 'luck' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await roll(ctx, { ap: 3 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await roll(ctx, { defence: 'spiritual' })).toMatchObject({ ok: false, code: 'bad_value' });
    await g.call('sheet:set', { characterId: a.id, path: 'ap.current', value: 1 });
    expect(await roll(ctx, { ap: 2 })).toMatchObject({ ok: false, code: 'no_ap' });
    expect((await roll(ctx, { ap: 1 })).ok).toBe(true);
    expect(await p.call('attack:list')).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('every selected target goes on the attack', async () => {
    const ctx = await setup();
    const { a, o, p } = ctx;
    const b = await fighter(ctx.g, 'Bandit', 'npc');
    await p.call('battle:target', { characterId: a.id, tokenId: o.token });
    await p.call('battle:target', { characterId: a.id, tokenId: b.token });
    const seen = nextPending(ctx.g);
    await roll(ctx, { defence: 'mental' });
    const pending = await seen;
    expect(pending.targets).toEqual([o.token, b.token]);
    expect(pending.roll.against.label).toBe('Mental Defence');
    expect(pending.roll.against.targets.map((t) => t.name)).toEqual(['Ogre', 'Bandit']);
  });
});

describe('the confirm card', () => {
  async function pendingAttack(ctx, tokenIds = [ctx.o.token]) {
    for (const t of tokenIds) await ctx.p.call('battle:target', { characterId: ctx.a.id, tokenId: t });
    const seen = nextPending(ctx.g);
    await roll(ctx, { mastery: 'manifestation', ap: 1 });
    return seen;
  }
  const card = (pending, extra = {}) => ({ id: pending.id, total: 20, base: 4, kind: 'fire', ap: 1, ...extra });

  it('shows what the card needs about a target', async () => {
    const ctx = await setup();
    await ctx.g.call('sheet:set', { characterId: ctx.o.id, path: 'resistances.fire', value: { flat: 2 } });
    const { targets } = await ctx.g.call('attack:targets', { tokenIds: [ctx.o.token, 99999] });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ name: 'Ogre', sheet: true, defence: { physical: 12 }, hp: { current: 30, max: 30 }, resistances: { fire: { flat: 2 } } });
  });

  it('applies damage through resistances, statuses, AP and a chat line', async () => {
    const ctx = await setup();
    await ctx.g.call('sheet:set', { characterId: ctx.o.id, path: 'resistances.fire', value: { flat: 2 } });
    const pending = await pendingAttack(ctx);
    const r = await ctx.g.call('attack:apply', card(pending, { statuses: [{ key: 'burning', stacks: 2 }] }));
    expect(r.ok).toBe(true);
    // 20 vs 12: difference 8, a Heavy Hit: 4 + 1 = 5, fire resistance 2 leaves 3.
    const ogre = await sheetOf(ctx.g, ctx.o.id);
    expect(ogre.hp.current).toBe(27);
    expect(ogre.statuses.burning).toBe(2);
    expect((await sheetOf(ctx.g, ctx.a.id)).ap.current).toBe(3);
    const line = texts().find((t) => /Aria attacks Ogre/.test(t));
    expect(line).toMatch(/20 vs Physical Defence 12, Heavy Hit/);
    expect(line).toMatch(/HP 30 to 27/);
    expect((await ctx.g.call('attack:list')).attacks).toHaveLength(0);
  });

  it('a miss changes nothing but still costs AP; nothing is applied twice', async () => {
    const ctx = await setup();
    const pending = await pendingAttack(ctx);
    const miss = card(pending, { total: 3, statuses: [{ key: 'burning', stacks: 1 }] });
    expect((await ctx.g.call('attack:apply', miss)).ok).toBe(true);
    const ogre = await sheetOf(ctx.g, ctx.o.id);
    expect(ogre.hp.current).toBe(30);
    expect(ogre.statuses.burning).toBeUndefined();
    expect((await sheetOf(ctx.g, ctx.a.id)).ap.current).toBe(3);
    expect(texts().some((t) => /Miss/.test(t))).toBe(true);
    expect(await ctx.g.call('attack:apply', miss)).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('hits every selected target, a temp NPC uses a fixed Defence, and a natural 1 exposes the attacker', async () => {
    const ctx = await setup();
    const d = (await ctx.g.call('temp_npc:create', { name: 'Dummy' })).id;
    await ctx.g.call('picture:add', { tempNpcId: d, data: png() });
    const dummy = (await ctx.g.call('battle:add', { tempNpcId: d })).id;
    const pending = await pendingAttack(ctx, [ctx.o.token, dummy]);
    server.shared.attacks.get(pending.id).roll.natural = 1;
    const r = await ctx.g.call('attack:apply', card(pending, { total: 25 }));
    expect(r.ok).toBe(true);
    expect((await sheetOf(ctx.g, ctx.o.id)).hp.current).toBe(24); // Brutal Hit: 4 + 2 = 6
    expect(texts().some((t) => /Dummy .*Physical Defence 10.*temporary NPC/.test(t))).toBe(true);
    expect((await sheetOf(ctx.g, ctx.a.id)).statuses.exposed).toBe(1);
  });

  it('is GM only, cannot change targets, and rejects bad numbers', async () => {
    const ctx = await setup();
    const pending = await pendingAttack(ctx);
    expect(await ctx.p.call('attack:apply', card(pending))).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await ctx.g.call('attack:apply', card(pending, { kind: 'love' }))).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await ctx.g.call('attack:apply', card(pending, { base: -1 }))).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await ctx.g.call('attack:apply', card(pending, { statuses: [{ key: 'nope', stacks: 1 }] }))).toMatchObject({ ok: false, code: 'bad_value' });
    // Nothing was consumed by the failures, and a target list in the payload is ignored.
    expect((await ctx.g.call('attack:list')).attacks).toHaveLength(1);
    expect((await sheetOf(ctx.g, ctx.o.id)).hp.current).toBe(30);
    const other = await fighter(ctx.g, 'Bystander', 'npc');
    await ctx.g.call('sheet:set', { characterId: other.id, path: 'hp.max', value: 10 });
    await ctx.g.call('sheet:set', { characterId: other.id, path: 'hp.current', value: 10 });
    await ctx.g.call('attack:apply', card(pending, { targets: [{ tokenId: other.token, defenceKind: 'physical', defence: 0 }] }));
    expect((await sheetOf(ctx.g, other.id)).hp.current).toBe(10);
    expect((await sheetOf(ctx.g, ctx.o.id)).hp.current).toBeLessThan(30);
  });

  it('can be cancelled', async () => {
    const ctx = await setup();
    const pending = await pendingAttack(ctx);
    expect((await ctx.g.call('attack:cancel', { id: pending.id })).ok).toBe(true);
    expect((await ctx.g.call('attack:list')).attacks).toHaveLength(0);
    expect(await ctx.g.call('attack:cancel', { id: pending.id })).toMatchObject({ ok: false, code: 'not_found' });
  });
});
