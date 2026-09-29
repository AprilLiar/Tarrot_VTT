import { useApp } from '../AppContext.jsx';
import { Initial } from './Picker.jsx';

// Top bar shown once an identity is chosen: who you are, connection state,
// and the way back to the picker.
export default function Shell({ children }) {
  const { identity, pcs, connected, switchIdentity } = useApp();
  const isGm = identity.role === 'gm';
  const pc = pcs.find((c) => c.id === identity.characterId);
  const label = isGm ? 'Game Master' : (pc?.name ?? '...');

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0f0d14] px-4 py-2">
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
    </div>
  );
}
