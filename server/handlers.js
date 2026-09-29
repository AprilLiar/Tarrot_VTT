import * as roster from './roster.js';

// Identity model (no login): a socket declares itself GM or a specific PC.
// The server validates that the PC exists and is a PC, and derives every
// permission from that identity, never from what a payload claims.

const GM_ROOM = 'gm';

export function registerHandlers(io, socket, db) {
  socket.data.identity = null;

  const isGm = () => socket.data.identity?.role === 'gm';

  async function broadcastRoster() {
    const [full, pcs] = await Promise.all([roster.listRoster(db), roster.listPcs(db)]);
    io.to(GM_ROOM).emit('roster:updated', full);
    io.emit('pcs:updated', pcs);
  }

  // Wraps a handler: the ack is always { ok, ... } and errors never crash.
  const on = (event, { gmOnly = false, broadcast = false } = {}, fn) => {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (gmOnly && !isGm()) return reply({ ok: false, code: 'forbidden', error: 'GM only.' });
        const result = (await fn(payload ?? {})) ?? {};
        if (broadcast) await broadcastRoster();
        reply({ ok: true, ...result });
      } catch (err) {
        if (err instanceof roster.RosterError) {
          return reply({ ok: false, code: err.code, error: err.message });
        }
        console.error(`${event} failed`, err);
        reply({ ok: false, code: 'server_error', error: 'Something went wrong.' });
      }
    });
  };

  // Round-trip check used by the connection banner and by tests.
  socket.on('ping:check', (payload, ack) => {
    if (typeof ack === 'function') ack({ ok: true, echo: payload ?? null });
  });

  on('identity:set', {}, async ({ role, characterId }) => {
    if (role === 'gm') {
      socket.data.identity = { role: 'gm' };
      socket.join(GM_ROOM);
      return { identity: socket.data.identity };
    }
    const c = role === 'player' ? await roster.getCharacter(db, characterId) : null;
    if (!c || c.type !== 'pc') {
      throw new roster.RosterError('gone', 'That character is not available.');
    }
    socket.leave(GM_ROOM);
    socket.data.identity = { role: 'player', characterId: c.id };
    return { identity: socket.data.identity };
  });

  on('identity:clear', {}, () => {
    socket.data.identity = null;
    socket.leave(GM_ROOM);
  });

  on('roster:get', { gmOnly: true }, async () => ({ roster: await roster.listRoster(db) }));

  on('character:create', { gmOnly: true, broadcast: true }, async (p) => ({
    id: await roster.createCharacter(db, p),
  }));
  on('character:rename', { gmOnly: true, broadcast: true }, (p) =>
    roster.renameCharacter(db, p.id, p.name),
  );
  on('character:move', { gmOnly: true, broadcast: true }, (p) =>
    roster.moveCharacter(db, p.id, p.folderId ?? null),
  );
  on('character:delete', { gmOnly: true, broadcast: true }, async (p) => {
    const gone = await roster.deleteCharacter(db, p.id, p.confirmName);
    // Anyone playing the deleted character is sent back to the picker.
    for (const s of io.sockets.sockets.values()) {
      if (s.data.identity?.characterId === gone.id) {
        s.data.identity = null;
        s.emit('identity:revoked', { characterId: gone.id, name: gone.name });
      }
    }
  });

  on('folder:create', { gmOnly: true, broadcast: true }, async (p) => ({
    id: await roster.createFolder(db, p),
  }));
  on('folder:rename', { gmOnly: true, broadcast: true }, (p) =>
    roster.renameFolder(db, p.id, p.name),
  );
  on('folder:move', { gmOnly: true, broadcast: true }, (p) =>
    roster.moveFolder(db, p.id, p.parentId ?? null),
  );
  on('folder:delete', { gmOnly: true, broadcast: true }, (p) => roster.deleteFolder(db, p.id));
}
