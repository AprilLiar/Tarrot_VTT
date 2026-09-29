import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';

let db, server, base;
const sockets = [];

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
    [
      'DELETE FROM stage_summons',
      'DELETE FROM pictures',
      'DELETE FROM scenes',
      'DELETE FROM scene_folders',
      'DELETE FROM temp_npcs',
      'DELETE FROM temp_npc_folders',
      'DELETE FROM images',
      'DELETE FROM characters',
      'DELETE FROM character_folders',
      'UPDATE scene_state SET active_scene_id = NULL',
    ],
    'write',
  );
});

async function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  return s;
}

// Resolves with the next stage update that satisfies `pred`, ignoring earlier ones still in flight.
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
const names = (st) => st.summons.map((x) => x.name);

const gm = async () => {
  const s = await client();
  await s.call('identity:set', { role: 'gm' });
  return s;
};
const display = async () => {
  const s = await client();
  expect((await s.call('identity:set', { role: 'display' })).ok).toBe(true);
  return s;
};
const player = async (characterId) => {
  const s = await client();
  expect((await s.call('identity:set', { role: 'player', characterId })).ok).toBe(true);
  return s;
};

// A few bytes that look like a PNG to the server's sniffing (the server never decodes images).
const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), Buffer.alloc(extra)]);

async function setup(g) {
  const scene = (await g.call('scene:create', { name: 'Tavern', data: png() })).id;
  await g.call('scene:activate', { id: scene });
  return scene;
}

async function pcWithPicture(g, name) {
  const id = (await g.call('character:create', { name, type: 'pc' })).id;
  const pic = (await g.call('picture:add', { characterId: id, name: 'Neutral', data: png() })).id;
  return { id, pic };
}

async function npcWithPicture(g, name) {
  const id = (await g.call('character:create', { name, type: 'npc' })).id;
  const pic = (await g.call('picture:add', { characterId: id, name: 'Neutral', data: png() })).id;
  return { id, pic };
}

describe('images', () => {
  it('stores an upload and serves it as a cacheable image', async () => {
    const g = await gm();
    const { id } = await pcWithPicture(g, 'Aria');
    const list = (await g.call('picture:list', { characterId: id })).pictures;
    const res = await fetch(`${base}/api/images/${list[0].imageId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/api/images/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await fetch(`${base}/api/images/not-an-id`)).status).toBe(404);
  });

  it('rejects things that are not images and oversized uploads', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    expect(await g.call('picture:add', { characterId: id, data: Buffer.from('hello world, not an image') })).toMatchObject({
      ok: false,
      code: 'bad_image',
    });
    expect(await g.call('picture:add', { characterId: id, data: png(3.5 * 1024 * 1024) })).toMatchObject({
      ok: false,
      code: 'image_too_large',
    });
  });
});

describe('pictures and permissions', () => {
  it('lets a player manage their own PC pictures but not another character', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const bob = (await g.call('character:create', { name: 'Bob', type: 'pc' })).id;
    const a = await player(aria);
    expect((await a.call('picture:add', { characterId: aria, data: png() })).ok).toBe(true);
    expect(await a.call('picture:add', { characterId: bob, data: png() })).toMatchObject({ ok: false, code: 'forbidden' });
    const tn = (await g.call('temp_npc:create', { name: 'Guard' })).id;
    expect(await a.call('picture:add', { tempNpcId: tn, data: png() })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('picture:add', { tempNpcId: tn, data: png() })).ok).toBe(true);
  });

  it('pushes picture changes to the owner and the GM, but not to other players', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const bob = (await g.call('character:create', { name: 'Bob', type: 'pc' })).id;
    const a = await player(aria);
    const b = await player(bob);
    const forA = new Promise((resolve) => a.once('pictures:updated', resolve));
    const forG = new Promise((resolve) => g.once('pictures:updated', resolve));
    let bobSaw = false;
    b.on('pictures:updated', () => (bobSaw = true));
    await a.call('picture:add', { characterId: aria, name: 'Me', data: png() });
    expect((await forA).pictures).toHaveLength(1);
    expect((await forG).ownerId).toBe(aria);
    await new Promise((r) => setTimeout(r, 50));
    expect(bobSaw).toBe(false);
  });

  it('removes a deleted picture from the stage, or swaps to another', async () => {
    const g = await gm();
    await setup(g);
    const { id, pic } = await pcWithPicture(g, 'Aria');
    await g.call('stage:summon', { characterId: id });
    const second = (await g.call('picture:add', { characterId: id, name: 'Angry', data: png(1) })).id;
    await g.call('picture:delete', { id: pic });
    let stage = (await g.call('stage:get')).stage;
    expect(stage.summons[0].pictureId).toBe(second);
    await g.call('picture:delete', { id: second });
    stage = (await g.call('stage:get')).stage;
    expect(stage.summons).toHaveLength(0);
  });
});

describe('scenes and folders', () => {
  it('is GM only', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const a = await player(aria);
    const d = await display();
    for (const who of [a, d]) {
      expect(await who.call('scene:create', { name: 'X' })).toMatchObject({ ok: false, code: 'forbidden' });
      expect(await who.call('scene:activate', { id: 1 })).toMatchObject({ ok: false, code: 'forbidden' });
      expect(await who.call('library:get')).toMatchObject({ ok: false, code: 'forbidden' });
      expect(await who.call('temp_npc:create', { name: 'X' })).toMatchObject({ ok: false, code: 'forbidden' });
    }
  });

  it('nests folders, refuses cycles, and only deletes empty ones', async () => {
    const g = await gm();
    const a = (await g.call('scene_folder:create', { name: 'A' })).id;
    const b = (await g.call('scene_folder:create', { name: 'B', parentId: a })).id;
    expect(await g.call('scene_folder:move', { id: a, parentId: b })).toMatchObject({ ok: false, code: 'cycle' });
    await g.call('scene:create', { name: 'Cave', folderId: b });
    expect(await g.call('scene_folder:delete', { id: b })).toMatchObject({ ok: false, code: 'not_empty' });
    expect(await g.call('scene_folder:delete', { id: a })).toMatchObject({ ok: false, code: 'not_empty' });
    const lib = (await g.call('library:get')).library;
    expect(lib.scenes[0]).toMatchObject({ name: 'Cave', folderId: b });
  });

  it('activating a scene pushes it to everyone; deleting it clears the stage', async () => {
    const g = await gm();
    const d = await display();
    const seen = stageWhere(d, (st) => st.scene?.name === 'Tavern');
    const scene = await setup(g);
    expect((await seen).scene).toMatchObject({ id: scene, name: 'Tavern' });
    const cleared = stageWhere(d, (st) => st.scene === null);
    await g.call('scene:delete', { id: scene });
    expect((await cleared).scene).toBeNull();
  });
});

describe('the stage', () => {
  it('needs an active scene and a picture', async () => {
    const g = await gm();
    const { id } = await pcWithPicture(g, 'Aria');
    expect(await g.call('stage:summon', { characterId: id })).toMatchObject({ ok: false, code: 'no_scene' });
    await setup(g);
    const bare = (await g.call('character:create', { name: 'Bare', type: 'npc' })).id;
    expect(await g.call('stage:summon', { characterId: bare })).toMatchObject({ ok: false, code: 'no_picture' });
    expect((await g.call('stage:summon', { characterId: id })).ok).toBe(true);
    expect(await g.call('stage:summon', { characterId: id })).toMatchObject({ ok: false, code: 'already_on_stage' });
  });

  it('puts PCs on the left and NPCs and temp NPCs on the right', async () => {
    const g = await gm();
    await setup(g);
    const pc = await pcWithPicture(g, 'Aria');
    const npc = await npcWithPicture(g, 'Goblin');
    const tn = (await g.call('temp_npc:create', { name: 'Guard' })).id;
    await g.call('picture:add', { tempNpcId: tn, data: png() });
    for (const p of [{ characterId: pc.id }, { characterId: npc.id }, { tempNpcId: tn }]) {
      expect((await g.call('stage:summon', p)).ok).toBe(true);
    }
    const { summons } = (await g.call('stage:get')).stage;
    expect(summons.map((s) => [s.name, s.side])).toEqual([
      ['Aria', 'left'],
      ['Goblin', 'right'],
      ['Guard', 'right'],
    ]);
  });

  it('lets a player summon and dismiss only their own PC', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const bob = await pcWithPicture(g, 'Bob');
    const npc = await npcWithPicture(g, 'Goblin');
    const a = await player(aria.id);

    const mine = await a.call('stage:summon', { characterId: aria.id });
    expect(mine.ok).toBe(true);
    expect(await a.call('stage:summon', { characterId: bob.id })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('stage:summon', { characterId: npc.id })).toMatchObject({ ok: false, code: 'forbidden' });

    const bobOnStage = (await g.call('stage:summon', { characterId: bob.id })).id;
    expect(await a.call('stage:dismiss', { id: bobOnStage })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('stage:update', { id: mine.id, scale: 1.2 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('stage:update', { id: mine.id, hidden: true })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await a.call('stage:dismiss', { id: mine.id })).ok).toBe(true);

    // The GM can summon and dismiss anyone.
    const d = await display();
    expect(await d.call('stage:summon', { characterId: aria.id })).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await g.call('stage:dismiss', { id: bobOnStage })).ok).toBe(true);
  });

  it('never sends hidden summons to players or the Display, only to the GM', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const npc = await npcWithPicture(g, 'Goblin');
    const a = await player(aria.id);
    const d = await display();
    await g.call('stage:summon', { characterId: aria.id });
    const goblin = (await g.call('stage:summon', { characterId: npc.id })).id;

    const dSaw = stageWhere(d, (st) => names(st).length === 1);
    const aSaw = stageWhere(a, (st) => names(st).length === 1);
    const gSaw = stageWhere(g, (st) => st.summons.some((x) => x.hidden));
    expect((await g.call('stage:update', { id: goblin, hidden: true })).ok).toBe(true);
    expect(names(await dSaw)).toEqual(['Aria']);
    expect(names(await aSaw)).toEqual(['Aria']);
    expect((await gSaw).summons.map((x) => [x.name, x.hidden])).toEqual([['Aria', false], ['Goblin', true]]);

    // Also when they ask for it later (a reload).
    expect((await d.call('stage:get')).stage.summons.map((s) => s.name)).toEqual(['Aria']);
    expect((await g.call('stage:get')).stage.summons).toHaveLength(2);

    // Revealing brings it back for everyone.
    const revealed = stageWhere(d, (st) => names(st).length === 2);
    await g.call('stage:update', { id: goblin, hidden: false });
    expect((await revealed).summons).toHaveLength(2);
  });

  it('validates size and picture, and swaps pictures', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const bob = await pcWithPicture(g, 'Bob');
    const on = (await g.call('stage:summon', { characterId: aria.id })).id;
    expect(await g.call('stage:update', { id: on, scale: 5 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('stage:update', { id: on, pictureId: bob.pic })).toMatchObject({ ok: false, code: 'bad_id' });
    const second = (await g.call('picture:add', { characterId: aria.id, data: png(2) })).id;
    expect((await g.call('stage:update', { id: on, pictureId: second, scale: 1.4 })).ok).toBe(true);
    const s = (await g.call('stage:get')).stage.summons[0];
    expect(s).toMatchObject({ pictureId: second, scale: 1.4 });
  });

  it('keeps each scene\'s cast separate', async () => {
    const g = await gm();
    const one = await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    await g.call('stage:summon', { characterId: aria.id });
    const two = (await g.call('scene:create', { name: 'Forest' })).id;
    await g.call('scene:activate', { id: two });
    expect((await g.call('stage:get')).stage.summons).toHaveLength(0);
    await g.call('scene:activate', { id: one });
    expect((await g.call('stage:get')).stage.summons.map((s) => s.name)).toEqual(['Aria']);
  });

  it('reorders one side without disturbing the other; the Display may do it, players may not', async () => {
    const g = await gm();
    await setup(g);
    const pc = await pcWithPicture(g, 'Aria');
    const n1 = await npcWithPicture(g, 'Alpha');
    const n2 = await npcWithPicture(g, 'Beta');
    const n3 = await npcWithPicture(g, 'Gamma');
    await g.call('stage:summon', { characterId: n1.id });
    await g.call('stage:summon', { characterId: pc.id });
    await g.call('stage:summon', { characterId: n2.id });
    await g.call('stage:summon', { characterId: n3.id });
    const before = (await g.call('stage:get')).stage.summons;
    const rightIds = before.filter((s) => s.side === 'right').map((s) => s.id);

    const d = await display();
    const r = await d.call('stage:reorder', { side: 'right', ids: [...rightIds].reverse() });
    expect(r.ok).toBe(true);
    const after = (await g.call('stage:get')).stage.summons;
    expect(after.filter((s) => s.side === 'right').map((s) => s.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(after.filter((s) => s.side === 'left').map((s) => s.name)).toEqual(['Aria']);

    const a = await player(pc.id);
    expect(await a.call('stage:reorder', { side: 'right', ids: rightIds })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('removes a deleted character\'s art and stage entry', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    await g.call('stage:summon', { characterId: aria.id });
    await g.call('character:delete', { id: aria.id, confirmName: 'Aria' });
    expect((await g.call('stage:get')).stage.summons).toHaveLength(0);
    const pics = await db.execute('SELECT COUNT(*) AS n FROM pictures');
    expect(Number(pics.rows[0].n)).toBe(0);
    const imgs = await db.execute("SELECT COUNT(*) AS n FROM images");
    expect(Number(imgs.rows[0].n)).toBe(1); // only the scene background is left
  });
});

describe('the Display Screen', () => {
  it('cannot use sheets or chat, and gets no roster', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const d = await display();
    expect(await d.call('sheet:get', { characterId: aria })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('roll:make', { characterId: aria, kind: 'attribute', key: 'strength' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await d.call('chat:send', { text: 'hi' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('chat:get')).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('roster:get')).toMatchObject({ ok: false, code: 'forbidden' });
    expect((await d.call('stage:get')).ok).toBe(true);
  });

  it('does not receive chat messages', async () => {
    const g = await gm();
    const d = await display();
    let got = false;
    d.on('chat:message', () => (got = true));
    await g.call('chat:send', { text: 'secret plans' });
    await new Promise((r) => setTimeout(r, 100));
    expect(got).toBe(false);
  });
});
