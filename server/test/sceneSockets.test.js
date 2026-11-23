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
    // A big map keeps its own resolution: a few megabytes are fine. Only what the socket could not carry is refused.
    expect((await g.call('picture:add', { characterId: id, data: png(3.5 * 1024 * 1024) })).ok).toBe(true);
    expect(await g.call('picture:add', { characterId: id, data: png(61 * 1024 * 1024) })).toMatchObject({
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

  it('gives every figure its own spot; the GM, the Display and the owner can drag it anywhere', async () => {
    const g = await gm();
    await setup(g);
    const pc = await pcWithPicture(g, 'Aria');
    const other = await pcWithPicture(g, 'Bob');
    const n1 = await npcWithPicture(g, 'Alpha');
    for (const c of [pc, other, n1]) await g.call('stage:summon', { characterId: c.id });
    let list = (await g.call('stage:get')).stage.summons;
    const by = (name) => list.find((x) => x.name === name);
    // Nobody has been dragged yet: no spot, only a slot on their side (PCs left, NPCs right).
    expect(by('Aria')).toMatchObject({ x: null, y: null, side: 'left', slot: 0 });
    expect(by('Bob')).toMatchObject({ x: null, side: 'left', slot: 1 });
    expect(by('Alpha')).toMatchObject({ x: null, side: 'right', slot: 0 });

    // The GM drags one far outside the picture.
    expect((await g.call('stage:move', { id: by('Aria').id, x: -0.4, y: 1.3 })).ok).toBe(true);
    list = (await g.call('stage:get')).stage.summons;
    expect(by('Aria')).toMatchObject({ x: -0.4, y: 1.3 });
    expect(list[list.length - 1].name).toBe('Aria'); // brought to the front

    // The Display may too; nobody may go absurdly far.
    const d = await display();
    expect((await d.call('stage:move', { id: by('Alpha').id, x: 0.5, y: 0.5 })).ok).toBe(true);
    expect(await d.call('stage:move', { id: by('Alpha').id, x: 9, y: 0.5 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await d.call('stage:move', { id: by('Alpha').id, x: 'a', y: 0.5 })).toMatchObject({ ok: false, code: 'bad_value' });

    // A player moves only their own PC.
    const a = await player(pc.id);
    expect((await a.call('stage:move', { id: by('Aria').id, x: 0.3, y: 0.8 })).ok).toBe(true);
    expect(await a.call('stage:move', { id: by('Bob').id, x: 0.3, y: 0.8 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('stage:move', { id: by('Alpha').id, x: 0.3, y: 0.8 })).toMatchObject({ ok: false, code: 'forbidden' });

    // Reset takes the spot away again.
    expect((await g.call('stage:move', { id: by('Aria').id, reset: true })).ok).toBe(true);
    list = (await g.call('stage:get')).stage.summons;
    expect(by('Aria')).toMatchObject({ x: null, y: null });
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

  it('has the whole token menu: settings, hide, remove; pictures can be listed', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const id = (await g.call('stage:summon', { characterId: aria.id })).id;
    const d = await display();
    expect((await d.call('picture:list', { characterId: aria.id })).pictures).toHaveLength(1);
    expect((await d.call('stage:update', { id, scale: 1.5 })).ok).toBe(true);
    expect((await d.call('stage:update', { id, hidden: true })).ok).toBe(true);
    expect((await d.call('stage:dismiss', { id })).ok).toBe(true);
    expect((await g.call('stage:get')).stage.summons).toHaveLength(0);
    const p = await player(aria.id);
    expect(await p.call('stage:update', { id, scale: 1 })).toMatchObject({ ok: false, code: 'forbidden' });
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

describe('Portraits', () => {
  const imageStatus = async (imageId) => (await fetch(`${base}/api/images/${imageId}`)).status;

  it('the GM or the owner of a PC sets a Portrait; it is in the roster, the picker and the sheet, and nobody else can change it', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const bob = (await g.call('character:create', { name: 'Bob', type: 'pc' })).id;
    const orc = (await g.call('character:create', { name: 'Orc', type: 'npc' })).id;
    const a = await player(aria);
    expect((await g.call('roster:get')).roster.characters.every((c) => c.portraitImageId === null)).toBe(true);

    const told = new Promise((resolve) => a.once('character:updated', resolve));
    const set = await a.call('portrait:set', { characterId: aria, data: png() });
    expect(set).toMatchObject({ ok: true });
    expect((await told).character).toMatchObject({ id: aria, portraitImageId: set.imageId });
    expect(await imageStatus(set.imageId)).toBe(200);

    expect(await a.call('portrait:set', { characterId: bob, data: png() })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await a.call('portrait:set', { characterId: aria, data: Buffer.from('not an image at all') })).toMatchObject({ ok: false, code: 'bad_image' });
    expect((await g.call('portrait:set', { characterId: orc, data: png(1) })).ok).toBe(true); // an NPC has one too

    const rows = (await g.call('roster:get')).roster.characters;
    expect(rows.find((c) => c.id === aria).portraitImageId).toBe(set.imageId);
    expect(rows.find((c) => c.id === bob).portraitImageId).toBeNull();
    const pcs = await (await fetch(`${base}/api/pcs`)).json();
    expect(pcs.find((c) => c.id === aria).portraitImageId).toBe(set.imageId);
    expect(pcs.some((c) => c.id === orc)).toBe(false); // an NPC is never on the picker
    expect((await a.call('sheet:get', { characterId: aria })).character.portraitImageId).toBe(set.imageId);
  });

  it('a replaced or removed Portrait takes its image with it, and a deleted character too', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const first = (await g.call('portrait:set', { characterId: id, data: png() })).imageId;
    const second = (await g.call('portrait:set', { characterId: id, data: png(1) })).imageId;
    expect(await imageStatus(first)).toBe(404);
    expect(await imageStatus(second)).toBe(200);
    expect((await g.call('portrait:clear', { characterId: id })).ok).toBe(true);
    expect(await imageStatus(second)).toBe(404);
    expect((await g.call('sheet:get', { characterId: id })).character.portraitImageId).toBeNull();

    const third = (await g.call('portrait:set', { characterId: id, data: png(2) })).imageId;
    await g.call('character:delete', { id, confirmName: 'Aria' });
    expect(await imageStatus(third)).toBe(404);
  });

  it('Copy from Portrait adds the Portrait as a Picture once, sharing the image, and deleting that Picture keeps the Portrait', async () => {
    const g = await gm();
    const id = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    expect(await g.call('picture:copy_portrait', { characterId: id })).toMatchObject({ ok: false, code: 'no_portrait' });
    const { imageId } = await g.call('portrait:set', { characterId: id, data: png() });

    const copy = await g.call('picture:copy_portrait', { characterId: id });
    expect(copy.ok).toBe(true);
    const list = (await g.call('picture:list', { characterId: id })).pictures;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: copy.id, imageId, name: 'Portrait' });
    expect(await g.call('picture:copy_portrait', { characterId: id })).toMatchObject({ ok: false, code: 'already_there' });
    expect((await g.call('picture:list', { characterId: id })).pictures).toHaveLength(1);

    await g.call('picture:delete', { id: copy.id });
    expect(await imageStatus(imageId)).toBe(200); // still the Portrait
    // Replacing the Portrait while a Picture uses the old image keeps that image for the Picture.
    const again = await g.call('picture:copy_portrait', { characterId: id });
    expect(again.ok).toBe(true);
    await g.call('portrait:set', { characterId: id, data: png(1) });
    expect(await imageStatus(imageId)).toBe(200);
    expect((await g.call('picture:copy_portrait', { characterId: id })).ok).toBe(true); // the new Portrait is a different image
    expect((await g.call('picture:list', { characterId: id })).pictures).toHaveLength(2);
  });

  it('a player copies only their own Portrait, and the Picture is named in their language', async () => {
    const g = await gm();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const bob = (await g.call('character:create', { name: 'Bob', type: 'pc' })).id;
    await g.call('portrait:set', { characterId: bob, data: png() });
    await g.call('portrait:set', { characterId: aria, data: png(1) });
    const a = await player(aria);
    expect(await a.call('picture:copy_portrait', { characterId: bob })).toMatchObject({ ok: false, code: 'forbidden' });
    await a.call('lang:set', { lang: 'ru' });
    expect((await a.call('picture:copy_portrait', { characterId: aria })).ok).toBe(true);
    expect((await g.call('picture:list', { characterId: aria })).pictures[0].name).toBe('Портрет');
  });
});

describe('the size of a figure belongs to its picture', () => {
  it('every figure using the picture is that big, in any scene and in later summons; another picture has its own size', async () => {
    const g = await gm();
    const first = await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const other = (await g.call('picture:add', { characterId: aria.id, name: 'Angry', data: png(1) })).id;
    const bob = await pcWithPicture(g, 'Bob');
    const sizeOf = async (owner) => (await g.call('stage:get')).stage.summons.find((s) => s.ownerId === owner).scale;

    const on = (await g.call('stage:summon', { characterId: aria.id })).id;
    expect(await sizeOf(aria.id)).toBe(1);
    expect((await g.call('stage:update', { id: on, scale: 1.5 })).ok).toBe(true);
    expect(await sizeOf(aria.id)).toBe(1.5);

    // Taking the figure off and summoning it again, here and in another scene, keeps the size.
    await g.call('stage:dismiss', { id: on });
    await g.call('stage:summon', { characterId: aria.id, pictureId: aria.pic });
    expect(await sizeOf(aria.id)).toBe(1.5);
    const second = (await g.call('scene:create', { name: 'Forest', data: png() })).id;
    await g.call('scene:activate', { id: second });
    await g.call('stage:summon', { characterId: aria.id });
    expect(await sizeOf(aria.id)).toBe(1.5);

    // Resizing it in the other scene changes it in the first one too (one value for the picture).
    const inForest = (await g.call('stage:get')).stage.summons[0].id;
    await g.call('stage:update', { id: inForest, scale: 0.8 });
    await g.call('scene:activate', { id: first });
    expect(await sizeOf(aria.id)).toBe(0.8);

    // Another picture of the same character, and another character, have their own sizes.
    const figure = (await g.call('stage:get')).stage.summons[0].id;
    await g.call('stage:update', { id: figure, pictureId: other });
    expect(await sizeOf(aria.id)).toBe(1);
    await g.call('stage:update', { id: figure, scale: 1.9 });
    await g.call('stage:summon', { characterId: bob.id });
    expect(await sizeOf(bob.id)).toBe(1);
    await g.call('stage:update', { id: figure, pictureId: aria.pic });
    expect(await sizeOf(aria.id)).toBe(0.8);
    expect(await g.call('stage:update', { id: figure, scale: 9 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await sizeOf(aria.id)).toBe(0.8);
  });

  it('a database from before this took each picture\'s size from the latest figure that used it', async () => {
    const old = createDb({ url: 'file::memory:' });
    await initSchema(old);
    await old.execute("INSERT INTO characters (name, type) VALUES ('Aria', 'pc')");
    await old.execute("INSERT INTO pictures (character_id, image_id) VALUES (1, 'a'), (1, 'b'), (1, 'c')");
    await old.execute("INSERT INTO stage_summons (scene_id, character_id, picture_id, scale) VALUES (1, 1, 1, 1.2), (2, 1, 1, 1.7), (1, 1, 2, 0.6)");
    await old.execute('ALTER TABLE pictures DROP COLUMN scale'); // as it was before
    await initSchema(old);
    const sizes = (await old.execute('SELECT id, scale FROM pictures ORDER BY id')).rows.map((r) => Number(r.scale));
    expect(sizes).toEqual([1.7, 0.6, 1]); // the latest figure of picture 1, the only one of picture 2, none for picture 3
    await initSchema(old); // starting again changes nothing
    expect((await old.execute('SELECT scale FROM pictures ORDER BY id')).rows.map((r) => Number(r.scale))).toEqual(sizes);
    old.close();
  });
});

describe('Silhouette', () => {
  it('is black with ??? for everyone but the GM, who still gets the real name; a player cannot make one', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const orc = await npcWithPicture(g, 'Orc Warlord');
    const d = await display();
    const p = await player(aria.id);

    const on = (await g.call('stage:summon', { characterId: orc.id, silhouette: true })).id;
    const gmSees = (await g.call('stage:get')).stage.summons[0];
    expect(gmSees).toMatchObject({ name: 'Orc Warlord', silhouette: true });
    for (const who of [d, p]) {
      const seen = (await who.call('stage:get')).stage.summons[0];
      expect(seen).toMatchObject({ name: '???', silhouette: true });
      expect(JSON.stringify(seen)).not.toContain('Orc Warlord');
    }

    // Nobody but the GM can switch it, on summoning or later.
    expect(await p.call('stage:summon', { characterId: aria.id, silhouette: true })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await d.call('stage:update', { id: on, silhouette: false })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('stage:update', { id: on, silhouette: 'yes' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('stage:summon', { characterId: aria.id, silhouette: 1 })).toMatchObject({ ok: false, code: 'bad_value' });

    // A player summons their own PC as always, with no silhouette.
    expect((await p.call('stage:summon', { characterId: aria.id })).ok).toBe(true);
    expect((await d.call('stage:get')).stage.summons.map((s) => s.name).sort()).toEqual(['???', 'Aria']);

    // Revealing it brings the name back for everyone, and the figure keeps its place.
    const told = stageWhere(d, (st) => st.summons.some((s) => s.name === 'Orc Warlord'));
    expect((await g.call('stage:update', { id: on, silhouette: false })).ok).toBe(true);
    expect((await told).summons.find((s) => s.id === on)).toMatchObject({ name: 'Orc Warlord', silhouette: false });
  });

  it('is kept when the picture is swapped, so the swap itself says whether it is still a silhouette', async () => {
    const g = await gm();
    await setup(g);
    const orc = await npcWithPicture(g, 'Orc');
    const second = (await g.call('picture:add', { characterId: orc.id, name: 'Angry', data: png(1) })).id;
    const on = (await g.call('stage:summon', { characterId: orc.id, silhouette: true })).id;
    await g.call('stage:update', { id: on, pictureId: second });
    expect((await g.call('stage:get')).stage.summons[0]).toMatchObject({ pictureId: second, silhouette: true });
    await g.call('stage:update', { id: on, pictureId: orc.pic, silhouette: false });
    expect((await g.call('stage:get')).stage.summons[0]).toMatchObject({ pictureId: orc.pic, silhouette: false });
  });

  it('hides the Tarot star along with the name', async () => {
    const g = await gm();
    await setup(g);
    const aria = await pcWithPicture(g, 'Aria');
    const card = (await g.call('tarot:add', { characterId: aria.id, card: { name: 'Fool' } })).sheet.tarot.cards[0].id;
    await g.call('tarot:select', { characterId: aria.id, id: card });
    const on = (await g.call('stage:summon', { characterId: aria.id })).id;
    const d = await display();
    expect((await d.call('stage:get')).stage.summons[0].tarot).toBe(true);
    await g.call('stage:update', { id: on, silhouette: true });
    expect((await d.call('stage:get')).stage.summons[0].tarot).toBe(false);
  });
});

describe('how a scene picture fits the screen', () => {
  it('is Best Fit unless chosen; the Scene picture may Fill or Stretch, the Battle map only Fill', async () => {
    const g = await gm();
    const id = (await g.call('scene:create', { name: 'Tavern', data: png() })).id;
    await g.call('scene:activate', { id });
    const stage = async () => (await g.call('stage:get')).stage;
    expect((await stage()).scene.fit).toBe('fit');
    expect((await g.call('scene:set_fit', { id, which: 'scene', fit: 'stretch' })).ok).toBe(true);
    expect((await stage()).scene.fit).toBe('stretch');
    expect(await g.call('scene:set_fit', { id, which: 'battle', fit: 'stretch' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('scene:set_fit', { id, which: 'scene', fit: 'zoom' })).toMatchObject({ ok: false, code: 'bad_value' });
    await g.call('scene:set_battle_image', { id, data: png(), aspect: 2, fit: 'fill' });
    expect((await stage()).battle.fit).toBe('fill');
    const other = (await g.call('scene:create', { name: 'Road', data: png(), fit: 'fill' })).id;
    await g.call('scene:activate', { id: other });
    expect((await stage()).scene.fit).toBe('fill');
    await g.call('scene:set_image', { id: other, data: png(1), fit: 'fit' });
    expect((await stage()).scene.fit).toBe('fit');
    const d = await display();
    expect(await d.call('scene:set_fit', { id, which: 'scene', fit: 'fill' })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('scene notes and Cards', () => {
  it('up to 9 per scene, numbered in order; deleting one moves the later ones down; GM only', async () => {
    const g = await gm();
    const scene = (await g.call('scene:create', { name: 'Notes', data: png() })).id;
    const ids = [];
    for (let i = 1; i <= 9; i++) ids.push((await g.call('scene_note:create', { sceneId: scene, kind: 'note', body: `n${i}` })).id);
    expect(await g.call('scene_note:create', { sceneId: scene, kind: 'note', body: 'ten' })).toMatchObject({ ok: false, code: 'limit' });
    await g.call('scene_note:delete', { id: ids[2] });
    const notes = (await g.call('scene_note:list', { sceneId: scene })).notes;
    expect(notes.map((n) => [n.number, n.body])).toEqual([[1, 'n1'], [2, 'n2'], [3, 'n4'], [4, 'n5'], [5, 'n6'], [6, 'n7'], [7, 'n8'], [8, 'n9']]);
    const d = await display();
    expect(await d.call('scene_note:list', { sceneId: scene })).toMatchObject({ ok: false, code: 'forbidden' });
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const p = await player(aria);
    expect(await p.call('scene_note:create', { sceneId: scene, kind: 'note' })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('a Card needs a title and is shown to every screen; a note cannot be shown', async () => {
    const g = await gm();
    const scene = (await g.call('scene:create', { name: 'Cards', data: png() })).id;
    expect(await g.call('scene_note:create', { sceneId: scene, kind: 'card', title: '  ' })).toMatchObject({ ok: false, code: 'bad_value' });
    const card = (await g.call('scene_note:create', { sceneId: scene, kind: 'card', title: 'Three days later', body: 'The rain stopped.' })).id;
    const note = (await g.call('scene_note:create', { sceneId: scene, kind: 'note', body: 'secret' })).id;
    const d = await display();
    const aria = (await g.call('character:create', { name: 'Aria', type: 'pc' })).id;
    const p = await player(aria);
    const seen = (sock) => new Promise((resolve) => sock.once('card:played', resolve));
    const [onD, onP] = [seen(d), seen(p)];
    expect((await g.call('scene_note:play', { id: card })).ok).toBe(true);
    expect(await onD).toEqual({ title: 'Three days later', body: 'The rain stopped.' });
    expect(await onP).toMatchObject({ title: 'Three days later' });
    expect(await g.call('scene_note:play', { id: note })).toMatchObject({ ok: false, code: 'bad_value' });
    // Changing a note into a Card (and back) is an edit.
    expect((await g.call('scene_note:update', { id: note, kind: 'card', title: 'Dawn', body: '' })).ok).toBe(true);
    expect((await g.call('scene_note:list', { sceneId: scene })).notes[1]).toMatchObject({ kind: 'card', title: 'Dawn' });
  });
});

describe('copying a scene', () => {
  it('copies its settings (pictures shared, fits, battle map, grid), not its figures or notes', async () => {
    const g = await gm();
    const id = (await g.call('scene:create', { name: 'Hall', data: png(), fit: 'fill' })).id;
    await g.call('scene:set_battle_image', { id, data: png(1), aspect: 2, fit: 'fill' });
    await g.call('scene:set_grid', { id, cell: 0.1, ox: 0, oy: 0 });
    await g.call('scene:activate', { id });
    const aria = await pcWithPicture(g, 'Aria');
    await g.call('stage:summon', { characterId: aria.id });
    await g.call('scene_note:create', { sceneId: id, kind: 'note', body: 'x' });
    const copy = (await g.call('scene:copy', { id })).id;
    const lib = (await g.call('library:get')).library.scenes;
    const a = lib.find((s) => s.id === id);
    const b = lib.find((s) => s.id === copy);
    expect(b.name).toBe('Hall (copy)');
    expect(b).toMatchObject({ imageId: a.imageId, fit: 'fill', battleImageId: a.battleImageId, battleFit: 'fill', battleAspect: 2, grid: a.grid });
    expect((await g.call('scene_note:list', { sceneId: copy })).notes).toEqual([]);
    await g.call('scene:activate', { id: copy });
    expect((await g.call('stage:get')).stage.summons).toEqual([]);
    // Deleting the original keeps the shared picture for the copy.
    await g.call('scene:delete', { id });
    expect((await fetch(`${base}/api/images/${b.imageId}`)).status).toBe(200);
  });
});
