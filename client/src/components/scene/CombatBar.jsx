import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { imageUrl } from '../../lib/image.js';
import { btn, btnPrimary } from '../Dialog.jsx';

const RING = { pc: '#34d399', npc: '#f87171' };
const small = 'min-h-8 rounded-lg border border-white/20 bg-black/40 px-2 text-xs active:bg-white/20';

// The turn order over the Battle map (right edge): everyone sees the order, the round and whose
// turn it is. The GM also runs the combat: start, roll NPCs, begin, next turn, reorder, edit, end.
export function CombatBar({ battle }) {
  const { identity, toast } = useApp();
  const isGm = identity.role === 'gm';
  const combat = battle.combat;
  const [editing, setEditing] = useState(null); // tokenId whose initiative is being typed

  async function run(event, payload) {
    const r = await call(event, payload);
    if (!r.ok) toast(r.error);
    return r;
  }

  if (!combat) {
    if (!isGm) return null;
    return (
      <div className="absolute right-2 top-16 z-20" data-no-pan>
        <button className={`${btn} bg-black/55 backdrop-blur`} data-testid="combat-start" onClick={() => run('combat:start')}>
          Start combat
        </button>
      </div>
    );
  }

  const { order } = combat;
  const inCombat = new Set(order.map((e) => e.tokenId));
  const addable = battle.tokens.filter((t) => t.kind !== 'prop' && !inCombat.has(t.id));
  const move = (i, d) => {
    const ids = order.map((e) => e.tokenId);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run('combat:reorder', { ids });
  };

  return (
    <div
      className="absolute right-2 top-16 z-20 flex max-h-[70%] w-56 flex-col gap-1 overflow-y-auto rounded-xl bg-black/60 p-2 text-sm backdrop-blur"
      data-no-pan
      data-testid="combat-bar"
      data-phase={combat.phase}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold" data-testid="combat-round">
          {combat.phase === 'active' ? `Round ${combat.round}` : 'Rolling Initiative'}
        </span>
      </div>

      <ol className="flex flex-col gap-1" data-testid="combat-order">
        {order.map((e, i) => {
          const active = e.tokenId === combat.activeTokenId;
          return (
            <li
              key={e.tokenId}
              data-testid="combat-entry"
              data-name={e.name}
              data-active={active}
              className={`flex items-center gap-2 rounded-lg p-1 ${active ? 'bg-amber-500/30 ring-2 ring-amber-400' : 'bg-white/5'}`}
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 bg-black/40" style={{ borderColor: RING[e.kind] ?? '#94a3b8' }}>
                {e.imageId && <img src={imageUrl(e.imageId)} alt="" className="h-full w-full object-cover" draggable={false} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {isGm && editing === e.tokenId ? (
                <input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  className="w-12 rounded bg-black/60 px-1 text-center"
                  data-testid="initiative-input"
                  defaultValue={e.initiative ?? ''}
                  onBlur={(ev) => {
                    const v = ev.target.value.trim();
                    setEditing(null);
                    if (v !== '' && Number(v) !== e.initiative) run('combat:set_initiative', { tokenId: e.tokenId, value: Number(v) });
                  }}
                  onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
                />
              ) : (
                <button
                  className="min-w-8 rounded px-1 text-center text-base"
                  data-testid="initiative"
                  disabled={!isGm}
                  onClick={() => setEditing(e.tokenId)}
                  aria-label={isGm ? `Edit initiative of ${e.name}` : undefined}
                >
                  {e.initiative ?? '?'}
                </button>
              )}
              {isGm && (
                <span className="flex flex-col">
                  <button className="h-4 text-[10px] leading-none opacity-70" aria-label={`Move ${e.name} up`} onClick={() => move(i, -1)}>
                    ^
                  </button>
                  <button className="h-4 text-[10px] leading-none opacity-70" aria-label={`Move ${e.name} down`} onClick={() => move(i, 1)}>
                    v
                  </button>
                </span>
              )}
              {isGm && (
                <button className="h-6 w-6 text-xs opacity-60" aria-label={`Remove ${e.name} from combat`} data-testid="combat-remove" onClick={() => run('combat:remove', { tokenId: e.tokenId })}>
                  x
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {isGm && (
        <div className="mt-1 flex flex-col gap-1">
          {addable.length > 0 && (
            <select
              className={small}
              aria-label="Add to combat"
              data-testid="combat-add"
              value=""
              onChange={(ev) => ev.target.value && run('combat:add', { tokenId: Number(ev.target.value) })}
            >
              <option value="">Add to combat...</option>
              {addable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {combat.phase === 'rolling' ? (
            <>
              <button className={small} data-testid="combat-roll-npcs" onClick={() => run('combat:roll_npcs')}>
                Roll for NPCs
              </button>
              <button className={`${btnPrimary} min-h-9 text-sm`} data-testid="combat-begin" onClick={() => run('combat:begin')}>
                Begin combat
              </button>
            </>
          ) : (
            <button className={`${btnPrimary} min-h-9 text-sm`} data-testid="combat-next" onClick={() => run('combat:next', { tokenId: combat.activeTokenId ?? undefined })}>
              Next turn
            </button>
          )}
          <button className={small} data-testid="combat-end" onClick={() => run('combat:end')}>
            {combat.phase === 'active' ? 'End combat' : 'Cancel combat'}
          </button>
        </div>
      )}
    </div>
  );
}
