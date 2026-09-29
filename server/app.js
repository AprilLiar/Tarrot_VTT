import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerHandlers } from './handlers.js';
import { listPcs } from './roster.js';

const clientDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'dist',
);

// Builds the HTTP + Socket.io server without listening, so tests can bind it
// to an ephemeral port.
export function createServer({ db }) {
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

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback: any non-API route serves the client.
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  io.on('connection', (socket) => registerHandlers(io, socket, db));

  return { app, httpServer, io };
}
