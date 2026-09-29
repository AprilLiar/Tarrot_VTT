import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

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

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback: any non-API route serves the client.
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    // Round-trip check used by the client's connection banner and by tests.
    socket.on('ping:check', (payload, ack) => {
      if (typeof ack === 'function') ack({ ok: true, echo: payload ?? null });
    });
  });

  return { app, httpServer, io };
}
