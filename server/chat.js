import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';

export const CHAT_TEXT_MAX = 500;

// The chat log lives in memory on purpose: it clears itself whenever the
// server instance restarts, and the GM can clear it by hand. Nothing here is
// written to the database.
// `onDrop(messages)` is told about messages that leave the log (trimmed or cleared), so their pictures can be deleted.
export function createChat({ max = 300, now = Date.now, onDrop = () => {} } = {}) {
  let messages = [];

  return {
    history: () => messages,
    add(message) {
      const stored = { id: randomUUID(), ts: now(), ...message };
      messages.push(stored);
      if (messages.length > max) {
        onDrop(messages.slice(0, messages.length - max));
        messages = messages.slice(-max);
      }
      return stored;
    },
    // Changes fields of a stored message (a card marked Reverted). -> the message, or null when it is gone.
    update(id, patch) {
      const m = messages.find((x) => x.id === id);
      if (!m) return null;
      Object.assign(m, patch);
      return m;
    },
    clear() {
      onDrop(messages);
      messages = [];
    },
  };
}

export function cleanChatText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new AppError('bad_text', 'Type a message first.');
  if (value.trim().length > CHAT_TEXT_MAX) {
    throw new AppError('bad_text', 'Messages can be at most {max} characters.', { max: CHAT_TEXT_MAX });
  }
  return value.trim();
}

// The Dice Tray: any mix of d4 to d20 (at most 20 dice) and a modifier, rolled here.
export const TRAY_SIDES = [4, 6, 8, 10, 12, 20];
export const TRAY_MAX_DICE = 20;
export function cleanTray(dice, modifier) {
  if (!Array.isArray(dice) || dice.length < 1 || dice.length > TRAY_MAX_DICE || !dice.every((d) => TRAY_SIDES.includes(d))) {
    throw new AppError('bad_value', 'Choose from 1 to {max} dice.', { max: TRAY_MAX_DICE });
  }
  const mod = Number(modifier ?? 0);
  if (!Number.isInteger(mod) || mod < -99 || mod > 99) throw new AppError('bad_value', 'The modifier is a whole number from -99 to 99.');
  return { dice: [...dice].sort((a, b) => a - b), modifier: mod };
}
