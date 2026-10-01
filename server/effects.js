import * as sheets from './sheet.js';
import { AppError } from './errors.js';
import { english } from './i18n.js';
import { isEmpty, revertDelta } from './journal.js';
import { T } from '../shared/localization.js';

// "Effect cards": the chat message of everything that changed sheets (an applied attack, a Spontaneous Action, the start of
// a turn, a crafted spell). It lists what happened to each character as blocks of rows, and the GM can Revert it.
//   message = { type: 'effects', kind, title?, blocks: [{ name, rows: [message] }], text, status, reversible, editable }
// status: 'applied' | 'reverted' (taken back) | 'replaced' (taken back by an Edit, a new card follows).
// The journal (what to take back) and the attack to reopen stay on the server, in `shared.effects`.
const MAX_STORED = 300;

export function createEffects({ io, db, shared, emitSheet, chatRoom }) {
  const store = (shared.effects ??= new Map());

  // `blocks`: [{ name, rows: [{ key, params }], hidden? }]; hidden ones are not shown (they would give a hidden token away).
  function post({ kind, title = null, blocks, journal, entry = null, clean = null }) {
    const visible = blocks.filter((b) => !b.hidden && b.rows.length);
    if (!visible.length) return null;
    const reversible = !!journal && !journal.empty();
    const text = [title ? english(title) : null, ...visible.map((b) => `${b.name}: ${b.rows.map((r) => english(r)).join(' ')}`)].filter(Boolean).join('\n');
    const message = shared.chat.add({
      type: 'effects',
      author: { role: 'gm', name: T('Combat') },
      kind,
      title,
      blocks: visible.map((b) => ({ name: b.name, rows: b.rows })),
      text,
      status: 'applied',
      reversible,
      editable: reversible && kind === 'attack' && !!entry,
    });
    if (reversible) {
      store.set(message.id, { kind, journal: journal.toJSON(), entry: entry ? structuredClone(entry) : null, clean });
      while (store.size > MAX_STORED) store.delete(store.keys().next().value);
    }
    io.to(chatRoom).emit('chat:message', message);
    return message;
  }

  // Takes a card's changes away from the sheets. `status` is what the card shows afterwards.
  async function revert(messageId, status = 'reverted') {
    const message = shared.chat.history().find((m) => m.id === messageId);
    const fx = store.get(messageId);
    if (!message || message.type !== 'effects' || !fx) throw new AppError('not_found', 'That card can no longer be reverted.');
    if (message.status !== 'applied') throw new AppError('already_reverted', 'That card has already been reverted.');
    // Check first, so a refusal leaves everyone as they were.
    const next = new Map();
    for (const [id, delta] of Object.entries(fx.journal)) {
      if (isEmpty(delta)) continue;
      next.set(Number(id), revertDelta(await sheets.getSheet(db, Number(id)), delta));
    }
    for (const [id, delta] of Object.entries(fx.journal)) {
      if (isEmpty(delta)) continue;
      const sheet = await sheets.updateSheet(db, Number(id), (s) => revertDelta(s, delta));
      emitSheet(Number(id), sheet);
    }
    const updated = shared.chat.update(messageId, { status, reversedAt: Date.now() });
    io.to(chatRoom).emit('chat:updated', updated);
    return fx;
  }

  return { post, revert, store };
}
