import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export const CHAT_TEXT_MAX = 500;

// The chat log lives in memory on purpose: it clears itself whenever the
// server instance restarts, and the GM can clear it by hand. Nothing here is
// written to the database.
export function createChat({ max = 300, now = Date.now } = {}) {
  let messages = [];

  return {
    history: () => messages,
    add(message) {
      const stored = { id: randomUUID(), ts: now(), ...message };
      messages.push(stored);
      if (messages.length > max) messages = messages.slice(-max);
      return stored;
    },
    clear() {
      messages = [];
    },
  };
}

export function cleanChatText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new AppError('bad_text', 'Type a message first.');
  if (value.trim().length > CHAT_TEXT_MAX) {
    throw new AppError('bad_text', `Messages can be at most ${CHAT_TEXT_MAX} characters.`);
  }
  return value.trim();
}
