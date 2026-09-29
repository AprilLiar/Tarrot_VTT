import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';

let db, server, base;

beforeAll(async () => {
  db = createDb({ url: 'file::memory:' });
  await initSchema(db);
  server = createServer({ db });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});

afterAll(async () => {
  server.io.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  db.close();
});

describe('platform', () => {
  it('reports healthy with a working database', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  it('creates the meta table at boot', async () => {
    const r = await db.execute("SELECT name FROM sqlite_master WHERE name = 'meta'");
    expect(r.rows.length).toBe(1);
  });

  it('answers a socket round trip', async () => {
    const socket = connect(base, { transports: ['websocket'] });
    const reply = await new Promise((resolve) => {
      socket.on('connect', () => socket.emit('ping:check', 'hi', resolve));
    });
    socket.close();
    expect(reply).toEqual({ ok: true, echo: 'hi' });
  });
});
