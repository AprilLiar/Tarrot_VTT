import { call, useApp } from '../../AppContext.jsx';
import { btn } from '../Dialog.jsx';

export const HEIGHT_MAX = 99;

// How many Spaces a character is in the air, changed with buttons only (no typing): Up, Down and Reset.
// Every press is saved at once. `token` is a Battle token ({ id, height }).
export function HeightControl({ token }) {
  const { toast } = useApp();
  async function set(height) {
    const r = await call('battle:update', { id: token.id, height });
    if (!r.ok) toast(r.error);
  }
  return (
    <div className="flex items-center gap-2" data-testid="height-control">
      <button className={`${btn} min-w-16`} data-testid="height-down" aria-label="Lower by one Space" disabled={token.height <= 0} onClick={() => set(token.height - 1)}>
        Down
      </button>
      <div className="w-20 text-center" aria-live="polite">
        <div className="text-2xl font-semibold" data-testid="height-value">
          {token.height}
        </div>
        <div className="text-xs opacity-60">Spaces</div>
      </div>
      <button className={`${btn} min-w-16`} data-testid="height-up" aria-label="Raise by one Space" disabled={token.height >= HEIGHT_MAX} onClick={() => set(token.height + 1)}>
        Up
      </button>
      <button className={btn} data-testid="height-reset" disabled={token.height === 0} onClick={() => set(0)}>
        Reset
      </button>
    </div>
  );
}
