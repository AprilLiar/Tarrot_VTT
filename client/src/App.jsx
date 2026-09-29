import { useEffect, useState } from 'react';
import { socket } from './socket.js';

// Phase 1 placeholder: proves client, server, socket and database are wired.
export default function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-3xl font-semibold">Tarrot VTT</h1>
      <p data-testid="status" className="text-sm opacity-70">
        {connected ? 'Connected' : 'Connecting...'}
      </p>
    </main>
  );
}
