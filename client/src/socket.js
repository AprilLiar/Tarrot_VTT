import { io } from 'socket.io-client';

// Same-origin in production; the Vite dev server proxies /socket.io.
export const socket = io({ autoConnect: true });
