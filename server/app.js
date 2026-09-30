import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerHandlers } from './handlers.js';
import { listPcs } from './roster.js';
import { createChat } from './chat.js';
import { getImage } from './images.js';
import { createPlayer } from './audio.js';

const clientDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'dist',
);

// Builds the HTTP + Socket.io server without listening, so tests can bind it
// to an ephemeral port.
// `fetchTitle` can be replaced in tests so they never touch the network.
export function createServer({ db, fetchTitle } = {}) {
  const app = express();
  app.use(compression());
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      await db.execute('SELECT 1');
      res.json({ ok: true, db: true });
    } catch (err) {
      res.status(503).json({ ok: false, db: false });
    }
  });

  // Public list for the identity picker: PCs only, never NPCs.
  app.get('/api/pcs', async (_req, res) => {
    try {
      res.json(await listPcs(db));
    } catch (err) {
      res.status(503).json({ error: 'unavailable' });
    }
  });

  // Images are immutable and their ids are random, so they can be cached for good.
  app.get('/api/images/:id', async (req, res) => {
    try {
      const img = await getImage(db, req.params.id);
      if (!img) return res.status(404).end();
      res.set('Content-Type', img.mime);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(img.data);
    } catch (err) {
      res.status(503).end();
    }
  });

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback: any non-API route serves the client.
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  // Uploads travel over the socket (so the sender's identity is checked): allow a few MB.
  const io = new Server(httpServer, { maxHttpBufferSize: 5 * 1024 * 1024 });

  // Per-instance state that is deliberately not in the database: the chat log
  // (clears on restart), pending trade offers and what is playing (stops on restart).
  const shared = { chat: createChat(), offers: new Map(), audio: createPlayer(), fetchTitle, targets: new Map() };
  io.on('connection', (socket) => registerHandlers(io, socket, db, shared));

  return { app, httpServer, io, shared };
}
