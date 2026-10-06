import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatSlot } from '../lib/chatSlot.js';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import { useT, useParts } from '../i18n.jsx';
import { formatExpression } from '../../../shared/roll-plan.js';
import Dialog, { btn, btnDanger, btnPrimary, input } from './Dialog.jsx';
import { T } from '../../../shared/localization.js';

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
  const t = useT();
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
          {m.author.role === 'gm' ? t(m.author.name) : m.author.name}
          {m.characterName !== m.author.name ? ` (${m.characterName})` : ''}
        </span>
      </div>
      <div className="text-sm font-medium uppercase tracking-wide" data-testid="roll-title">
        {t(roll.title)}
      </div>
      {roll.against ? (
        // A roll against something (an attack against a Defence): the number rolled next to the number to beat.
        <div className="mt-1 flex items-center gap-3" data-testid="roll-versus">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-60">{t('Attack Value')}</div>
            <div className={`text-5xl font-bold leading-tight ${crit ? 'text-green-400' : fail ? 'text-red-400' : ''}`} data-testid="roll-total">
              {roll.total}
            </div>
          </div>
          <div className="text-lg opacity-60">vs</div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide opacity-60" data-testid="roll-against-label">
              {t('Target Value')} ({t(roll.against.label)})
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
          {crit ? t('Critical') : t('Critical Failure')}
        </div>
      )}
      <div className="mt-1 text-sm opacity-90" data-testid="roll-expression">
        {formatExpression(roll.terms.map((x) => ({ ...x, label: t(x.label) })))}
      </div>
      {roll.dice.length > 1 && (
        <div className="mt-1" data-testid="roll-advantage">
          <div className="text-xs opacity-60">
            {roll.advantage.net > 0 ? t('Advantage') : t('Disadvantage')} {Math.abs(roll.advantage.net)} (
            {roll.advantage.sources.map((x) => t(x.label)).join(', ')})
          </div>
          <DiceLine roll={roll} />
        </div>
      )}
    </div>
  );
}


// The colour of a keyword on an effect card, by what it is about (the server tags parameters with a category).
const KEYWORD = {
  damage: 'text-red-400',
  heal: 'text-green-400',
  temp: 'text-sky-300',
  hp: 'text-rose-300',
  status: 'text-amber-300',
  ap: 'text-violet-300',
  help: 'text-indigo-300',
  hit: 'text-green-400',
  miss: 'text-slate-400',
  crit: 'text-yellow-300',
  resist: 'text-teal-300',
  item: 'text-orange-300',
  spell: 'text-fuchsia-300',
  effect: 'text-lime-300',
  num: 'text-white',
};

function Rich({ message }) {
  const parts = useParts();
  return parts(message).map((p, i) =>
    p.c ? (
      <span key={i} className={`font-semibold ${KEYWORD[p.c] ?? ''}`} data-keyword={p.c}>
        {p.text}
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

const KIND_TITLES = { turn: T('Start of turn'), craft: T('Spell crafting'), attack: T('Attack'), spontaneous: T('Spontaneous Action') };

// What a card did to the characters: one block per character with a line per fact. The GM can Revert it (take its
// effects away again) or, for an attack, Edit it (revert, then change the damage, statuses or roll and apply again).
function EffectsCard({ m }) {
  const t = useT();
  const { identity } = useApp();
  const [busy, setBusy] = useState(false);
  const gm = identity?.role === 'gm';
  const open = m.status === 'applied';
  async function run(event) {
    setBusy(true);
    const r = await call(event, { messageId: m.id });
    setBusy(false);
    if (!r.ok) setError(r.error);
  }
  const [error, setError] = useState(null);
  return (
    <div data-testid="effects-card" data-kind={m.kind} data-status={m.status} className={`rounded-xl border border-white/15 bg-white/5 p-3 ${open ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold" data-testid="effects-title">
          {m.title ? <Rich message={m.title} /> : t(KIND_TITLES[m.kind] ?? m.kind)}
        </div>
        {!open && (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs uppercase tracking-wide" data-testid="effects-status">
            {m.status === 'replaced' ? t('Replaced') : t('Reverted')}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {m.blocks.map((b, i) => (
          <div key={i} className="rounded-lg bg-black/25 p-2 text-sm" data-testid="effects-block" data-name={b.name}>
            <div className="font-semibold">{b.name}</div>
            {b.rows.map((r, j) => (
              <div key={j} className="leading-snug" data-testid="effects-row">
                <Rich message={r} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {gm && open && m.reversible && (
        <div className="mt-2 flex justify-end gap-2">
          {m.editable && (
            <button className={`${btn} min-h-9 px-3`} data-testid="effects-edit" disabled={busy} onClick={() => run('effects:edit')}>
              {t('Edit')}
            </button>
          )}
          <button className={`${btnDanger} min-h-9 px-3`} data-testid="effects-revert" disabled={busy} onClick={() => run('effects:revert')}>
            {t('Revert')}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

// One line for the popup that shows a new message while the chat is closed.
function popupText(m, t) {
  if (m.type === 'roll') {
    const vs = m.roll.against ? ` ${t('vs')} ${m.roll.against.targets.map((x) => x.value).join(', ')}` : '';
    return `${m.characterName}: ${t(m.roll.title)} ${m.roll.total}${vs}`;
  }
  if (m.type === 'effects') return m.title ? t(m.title.key, m.title.params) : `${m.blocks[0].name}: ${t(KIND_TITLES[m.kind] ?? m.kind)}`;
  return `${m.author.role === 'gm' ? t(m.author.name) : m.author.name}: ${messageText(m, t)}`;
}

// New messages rise from the corner for two seconds while the chat is closed. Several at once stack
// upwards instead of overlapping.
const POPUP_MS = 2000;
function ChatPopups({ chatOpen }) {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const [popups, setPopups] = useState([]);
  const openRef = useRef(chatOpen);
  openRef.current = chatOpen;
  useEffect(() => {
    const timers = [];
    const onMessage = (m) => {
      if (openRef.current) return;
      setPopups((list) => [...list, { key: m.id, m }]);
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
          {popupText(p.m, t)}
        </div>
      ))}
    </div>
  );
}

// A line from the server can arrive as data ({ key, params }) so each reader sees it in their language.
const messageText = (m, t) => (m.key ? t(m.key, m.params) : m.text);

function Message({ m }) {
  const t = useT();
  if (m.type === 'roll') return <RollCard m={m} />;
  if (m.type === 'effects') return <EffectsCard m={m} />;
  return (
    <div data-testid="chat-text" className="rounded-lg bg-white/5 px-3 py-2 text-sm">
      <span className={`font-semibold ${m.author.role === 'gm' ? 'text-violet-300' : ''}`}>{m.author.role === 'gm' ? t(m.author.name) : m.author.name}: </span>
      <span className="whitespace-pre-wrap break-words">{messageText(m, t)}</span>
    </div>
  );
}

// Global chat log with roll results. In memory on the server: clears when the
// instance restarts, and the GM can clear it by hand.
export default function ChatPanel() {
  const t = useT();
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

  // On the Arcane tab the button sits inside the footer row, like the other buttons there.
  const slot = useChatSlot();
  const toggle = (
    <button
      data-testid="chat-toggle"
      className={slot ? 'min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium active:bg-violet-600' : 'fixed bottom-4 right-4 z-30 min-h-12 rounded-full bg-violet-700 px-5 text-sm font-medium shadow-lg active:bg-violet-600'}
      onClick={() => setChatOpen(!chatOpen)}
    >
      {t('Chat')}{unread > 0 ? ` (${unread})` : ''}
    </button>
  );

  return (
    <>
      {slot ? createPortal(toggle, slot) : toggle}

      <ChatPopups chatOpen={chatOpen} />

      {chatOpen && (
        <aside
          data-testid="chat-panel"
          aria-label={t('Chat')}
          className="fixed inset-x-0 bottom-0 z-40 flex h-[70%] flex-col rounded-t-2xl border-t border-white/15 bg-[#14111d] sm:inset-x-auto sm:right-4 sm:bottom-20 sm:h-[32rem] sm:w-96 sm:rounded-2xl sm:border"
        >
          <header className="flex items-center gap-2 border-b border-white/10 p-2">
            <h2 className="flex-1 pl-2 font-semibold">{t('Chat')}</h2>
            {identity.role === 'gm' && (
              <button className={`${btn} min-h-9 px-3`} data-testid="chat-clear" onClick={() => setConfirmClear(true)}>
                {t('Clear')}
              </button>
            )}
            <button className={`${btn} min-h-9 px-3`} onClick={() => setChatOpen(false)}>
              {t('Close')}
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" data-testid="chat-log">
            {messages.length === 0 && <p className="p-2 text-sm opacity-50">{t('No messages yet. Rolls show up here.')}</p>}
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-2">
            <input
              className={input}
              aria-label={t('Message')}
              data-testid="chat-input"
              placeholder={t('Message')}
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
            <button className={btnPrimary} type="submit">
              {t('Send')}
            </button>
          </form>
          {error && <p className="px-3 pb-2 text-sm text-red-400">{error}</p>}
        </aside>
      )}

      {confirmClear && (
        <Dialog title={t('Clear chat')} onClose={() => setConfirmClear(false)}>
          <p className="mb-3 text-sm">{t('Delete every message for everyone? This cannot be undone.')}</p>
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setConfirmClear(false)}>
              {t('Cancel')}
            </button>
            <button
              className={btnDanger}
              data-testid="chat-clear-confirm"
              onClick={async () => {
                await call('chat:clear');
                setConfirmClear(false);
              }}
            >
              {t('Clear chat')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
