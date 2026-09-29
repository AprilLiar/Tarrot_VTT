import { useApp } from '../AppContext.jsx';
import { Initial } from './Picker.jsx';
import ChatPanel from './ChatPanel.jsx';
import Dialog, { btn, btnPrimary } from './Dialog.jsx';

// Top bar shown once an identity is chosen: who you are, connection state,
// and the way back to the picker. Also hosts the chat, toasts and incoming
// trade offers, which must be reachable from every page.
export default function Shell({ children }) {
  const { identity, pcs, connected, switchIdentity, toasts, offers, respondTrade } = useApp();
  const isGm = identity.role === 'gm';
  const pc = pcs.find((c) => c.id === identity.characterId);
  const label = isGm ? 'Game Master' : (pc?.name ?? '...');
  const offer = offers[0];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-[#0f0d14] px-4 py-2">
        {isGm ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-700 text-sm font-semibold">
            GM
          </span>
        ) : (
          <Initial name={label} size="h-9 w-9 text-base" />
        )}
        <span data-testid="whoami" className="flex-1 truncate font-medium">
          {label}
        </span>
        {!connected && (
          <span data-testid="offline" className="text-xs text-amber-400">
            Reconnecting...
          </span>
        )}
        <button
          data-testid="switch-identity"
          className="min-h-11 rounded-lg bg-white/10 px-3 text-sm active:bg-white/20"
          onClick={switchIdentity}
        >
          Switch
        </button>
      </header>
      <div className="flex-1">{children}</div>

      <ChatPanel />

      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto rounded-lg bg-slate-800 px-4 py-2 text-sm shadow-lg">
            {t.text}
          </div>
        ))}
      </div>

      {offer && (
        <Dialog title="Item offered" onClose={() => {}}>
          <p className="mb-3 text-sm" data-testid="trade-offer">
            <strong>{offer.fromName}</strong> wants to give you <strong>{offer.itemName}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} data-testid="trade-decline" onClick={() => respondTrade(offer.offerId, false)}>
              Decline
            </button>
            <button className={btnPrimary} data-testid="trade-accept" onClick={() => respondTrade(offer.offerId, true)}>
              Accept
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
