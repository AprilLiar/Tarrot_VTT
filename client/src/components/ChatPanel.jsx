import { useEffect, useRef, useState } from 'react';
import { call, useApp } from '../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';

function RollCard({ m }) {
  const { roll } = m;
  const crit = roll.flags.includes('critical');
  const fail = roll.flags.includes('critical_failure');
  return (
    <div
      data-testid="roll-card"
      className={`rounded-xl border p-3 ${crit ? 'border-amber-400' : fail ? 'border-red-500' : 'border-white/15'} bg-white/5`}
    >
      <div className="flex items-center justify-between gap-2 text-xs opacity-70">
        <span className="truncate">
          {m.author.name}
          {m.characterName !== m.author.name ? ` (${m.characterName})` : ''}
        </span>
      </div>
      <div className="text-sm font-medium uppercase tracking-wide" data-testid="roll-title">
        {roll.title}
      </div>
      <div className="text-5xl font-bold leading-tight" data-testid="roll-total">
        {roll.total}
      </div>
      {(crit || fail) && (
        <div className={`text-sm font-semibold ${crit ? 'text-amber-300' : 'text-red-400'}`}>
          {crit ? 'Critical' : 'Critical Failure'}
        </div>
      )}
      <div className="mt-1 text-sm opacity-90" data-testid="roll-expression">
        {roll.expression}
      </div>
      {roll.dice.length > 1 && (
        <div className="text-xs opacity-70" data-testid="roll-advantage">
          {roll.advantage.net > 0 ? 'Advantage' : 'Disadvantage'} {Math.abs(roll.advantage.net)}
          {' ('}
          {roll.advantage.sources.map((x) => x.label).join(', ')}
          {'): rolled '}
          {roll.dice.join(', ')}, kept {roll.natural}
        </div>
      )}
    </div>
  );
}

function Message({ m }) {
  if (m.type === 'roll') return <RollCard m={m} />;
  return (
    <div data-testid="chat-text" className="rounded-lg bg-white/5 px-3 py-2 text-sm">
      <span className={`font-semibold ${m.author.role === 'gm' ? 'text-violet-300' : ''}`}>{m.author.name}: </span>
      <span className="whitespace-pre-wrap break-words">{m.text}</span>
    </div>
  );
}

// Global chat log with roll results. In memory on the server: clears when the
// instance restarts, and the GM can clear it by hand.
export default function ChatPanel() {
  const { identity, messages, chatOpen, setChatOpen, unread } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (chatOpen) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, chatOpen]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await call('chat:send', { text });
    if (r.ok) {
      setText('');
      setError(null);
    } else setError(r.error);
  }

  return (
    <>
      <button
        data-testid="chat-toggle"
        className="fixed bottom-4 right-4 z-30 min-h-12 rounded-full bg-violet-700 px-5 text-sm font-medium shadow-lg active:bg-violet-600"
        onClick={() => setChatOpen(!chatOpen)}
      >
        Chat{unread > 0 ? ` (${unread})` : ''}
      </button>

      {chatOpen && (
        <aside
          data-testid="chat-panel"
          aria-label="Chat"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[70%] flex-col rounded-t-2xl border-t border-white/15 bg-[#14111d] sm:inset-x-auto sm:right-4 sm:bottom-20 sm:h-[32rem] sm:w-96 sm:rounded-2xl sm:border"
        >
          <header className="flex items-center gap-2 border-b border-white/10 p-2">
            <h2 className="flex-1 pl-2 font-semibold">Chat</h2>
            {identity.role === 'gm' && (
              <button className={`${btn} min-h-9 px-3`} data-testid="chat-clear" onClick={() => setConfirmClear(true)}>
                Clear
              </button>
            )}
            <button className={`${btn} min-h-9 px-3`} onClick={() => setChatOpen(false)}>
              Close
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" data-testid="chat-log">
            {messages.length === 0 && <p className="p-2 text-sm opacity-50">No messages yet. Rolls show up here.</p>}
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-2">
            <input
              className={input}
              aria-label="Message"
              data-testid="chat-input"
              placeholder="Message"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
            <button className={btnPrimary} type="submit">
              Send
            </button>
          </form>
          {error && <p className="px-3 pb-2 text-sm text-red-400">{error}</p>}
        </aside>
      )}

      {confirmClear && (
        <Dialog title="Clear chat" onClose={() => setConfirmClear(false)}>
          <p className="mb-3 text-sm">Delete every message for everyone? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
            <button
              className={btnDanger}
              data-testid="chat-clear-confirm"
              onClick={async () => {
                await call('chat:clear');
                setConfirmClear(false);
              }}
            >
              Clear chat
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
