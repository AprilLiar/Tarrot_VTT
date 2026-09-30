import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';

// A die is tinted green on a natural 20 and red on a natural 1.
const dieTint = (v) => (v === 20 ? 'text-green-400' : v === 1 ? 'text-red-400' : '');

// The die that counts comes first and is prominent; the others follow, greyed out.
// Example: 12 | 1 | 20
function DiceLine({ roll }) {
  const others = [...roll.dice];
  others.splice(others.indexOf(roll.natural), 1);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2" data-testid="roll-dice">
      <span className={`text-lg font-bold ${dieTint(roll.natural)}`} data-testid="roll-kept">
        {roll.natural}
      </span>
      {others.map((d, i) => (
        <span key={i} className="flex items-baseline gap-2">
          <span className="opacity-40">|</span>
          <span className={`text-sm opacity-50 ${dieTint(d) || 'text-slate-400'}`} data-testid="roll-other">
            {d}
          </span>
        </span>
      ))}
    </div>
  );
}

function RollCard({ m }) {
  const { roll } = m;
  const crit = roll.flags.includes('critical');
  const fail = roll.flags.includes('critical_failure');
  return (
    <div
      data-testid="roll-card"
      className={`rounded-xl border p-3 ${
        crit ? 'border-green-500/70 bg-green-500/10' : fail ? 'border-red-500/70 bg-red-500/10' : 'border-white/15 bg-white/5'
      }`}
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
      {roll.against ? (
        // A roll against something (an attack against a Defence): the number rolled next to the number to beat.
        <div className="mt-1 flex items-center gap-3" data-testid="roll-versus">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-60">Attack Value</div>
            <div className={`text-5xl font-bold leading-tight ${crit ? 'text-green-400' : fail ? 'text-red-400' : ''}`} data-testid="roll-total">
              {roll.total}
            </div>
          </div>
          <div className="text-lg opacity-60">vs</div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide opacity-60" data-testid="roll-against-label">
              Target Value ({roll.against.label})
            </div>
            {roll.against.targets.map((t, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className={`${roll.against.targets.length > 1 ? 'text-3xl' : 'text-5xl'} font-bold leading-tight`} data-testid="roll-target-value">
                  {t.value}
                </span>
                {roll.against.targets.length > 1 && <span className="truncate text-xs opacity-70">{t.name}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`text-5xl font-bold leading-tight ${crit ? 'text-green-400' : fail ? 'text-red-400' : ''}`}
          data-testid="roll-total"
        >
          {roll.total}
        </div>
      )}
      {(crit || fail) && (
        <div className={`text-sm font-semibold ${crit ? 'text-green-400' : 'text-red-400'}`}>
          {crit ? 'Critical' : 'Critical Failure'}
        </div>
      )}
      <div className="mt-1 text-sm opacity-90" data-testid="roll-expression">
        {roll.expression}
      </div>
      {roll.dice.length > 1 && (
        <div className="mt-1" data-testid="roll-advantage">
          <div className="text-xs opacity-60">
            {roll.advantage.net > 0 ? 'Advantage' : 'Disadvantage'} {Math.abs(roll.advantage.net)} (
            {roll.advantage.sources.map((x) => x.label).join(', ')})
          </div>
          <DiceLine roll={roll} />
        </div>
      )}
    </div>
  );
}

// One line for the popup that shows a new message while the chat is closed.
function popupText(m) {
  if (m.type === 'roll') {
    const vs = m.roll.against ? ` vs ${m.roll.against.targets.map((t) => t.value).join(', ')}` : '';
    return `${m.characterName}: ${m.roll.title} ${m.roll.total}${vs}`;
  }
  return `${m.author.name}: ${m.text}`;
}

// New messages rise from the corner for two seconds while the chat is closed. Several at once stack
// upwards instead of overlapping.
const POPUP_MS = 2000;
function ChatPopups({ chatOpen }) {
  const [popups, setPopups] = useState([]);
  const openRef = useRef(chatOpen);
  openRef.current = chatOpen;
  useEffect(() => {
    const timers = [];
    const onMessage = (m) => {
      if (openRef.current) return;
      setPopups((list) => [...list, { key: m.id, text: popupText(m) }]);
      timers.push(setTimeout(() => setPopups((list) => list.filter((p) => p.key !== m.id)), POPUP_MS + 300));
    };
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
      timers.forEach(clearTimeout);
    };
  }, []);
  if (chatOpen || popups.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-30 flex w-72 max-w-[calc(100vw-2rem)] flex-col items-end gap-1" data-testid="chat-popups">
      {popups.map((p) => (
        <div key={p.key} data-testid="chat-popup" className="chat-popup w-full rounded-lg bg-slate-800/95 px-3 py-2 text-sm shadow-lg">
          {p.text}
        </div>
      ))}
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

      <ChatPopups chatOpen={chatOpen} />

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
