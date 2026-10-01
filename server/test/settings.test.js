import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';

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
const sheetOf = async (s, id) => (await s.call('sheet:get', { characterId: id })).sheet;


describe('settings:force', () => {
  it('is GM only, checks the value, and sends it to every connected device', async () => {
    const g = await gm();
    const a = (await g.call('character:create', { name: 'Mira', type: 'pc' })).id;
    const p = await player(a);
    const anyone = await client(); // not even identified (the picker)
    const got = [];
    p.on('setting:forced', (m) => got.push(['player', m]));
    anyone.on('setting:forced', (m) => got.push(['anyone', m]));
    expect(await p.call('settings:force', { key: 'deadzone', value: 2 })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await g.call('settings:force', { key: 'deadzone', value: 5 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('settings:force', { key: 'deadzone', value: 1 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('settings:force', { key: 'nope', value: 2 })).toMatchObject({ ok: false, code: 'bad_value' });
    expect(await g.call('settings:force', { key: 'lang', value: 'fr' })).toMatchObject({ ok: false, code: 'bad_value' });
    expect((await g.call('settings:force', { key: 'deadzone', value: 2.25 })).ok).toBe(true);
    expect((await g.call('settings:force', { key: 'lang', value: 'ru' })).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(got).toEqual([
      ['player', { key: 'deadzone', value: 2.3 }],
      ['anyone', { key: 'deadzone', value: 2.3 }],
      ['player', { key: 'lang', value: 'ru' }],
      ['anyone', { key: 'lang', value: 'ru' }],
    ]);
  });
});
