import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// Directions of the D-pad, row by row. [dc, dr] is the step in columns and rows.
const PAD = [
  [-1, -1, 'NW'],
  [0, -1, 'N'],
  [1, -1, 'NE'],
  [-1, 0, 'W'],
  null,
  [1, 0, 'E'],
  [-1, 1, 'SW'],
  [0, 1, 'S'],
  [1, 1, 'SE'],
];

// The "TV remote": a D-pad that moves the character's token one square per tap, the
// Free Movement checkbox, and a list of tokens to target. It never draws the map.
// Shown on the sheet whenever the active scene is in Battle mode.
export function BattleRemote({ s }) {
  const { stage, toast } = useApp();
  const battle = stage.battle;
  const [free, setFree] = useState(false);
  const [ask, setAsk] = useState(null); // { dc, dr, aps, movement }
  if (stage.mode !== 'battle' || !battle?.imageId) return null;

  const token = battle.tokens.find((t) => t.ownerKind === 'character' && t.ownerId === s.characterId);
  const target = battle.tokens.find((t) => t.targetedBy.includes(s.characterId));
  const others = battle.tokens.filter((t) => t !== token);
  const apMax = s.sheet.ap.minion ? 2 : 4;

  async function step(dc, dr, confirmAp = false) {
    const r = await call('battle:move', { tokenId: token.id, dc, dr, free, confirmAp });
    if (!r.ok) toast(r.error ?? 'You cannot move there.');
    else if (r.needsConfirm) setAsk({ dc, dr, ...r.needsConfirm });
  }

  async function aim(tokenId) {
    const r = await call('battle:target', { characterId: s.characterId, tokenId });
    if (!r.ok) toast(r.error);
  }

  return (
    <section aria-label="Battle controls" data-testid="battle-remote">
      <h2 className={heading}>Battle</h2>
      <div className={card}>
        {!token ? (
          <p className="text-sm opacity-70">This character is not on the map right now.</p>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-xs opacity-60">AP</div>
                <div className="text-lg" data-testid="remote-ap">
                  {s.sheet.ap.current}/{apMax}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-60">Movement per AP</div>
                <div className="text-lg">{s.sheet.movement}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">Banked</div>
                <div className="text-lg" data-testid="remote-bank">
                  {token.bank}
                </div>
              </div>
            </div>
            <div className="mx-auto grid max-w-[15rem] grid-cols-3 gap-2" role="group" aria-label="Move">
              {PAD.map((p, i) =>
                p ? (
                  <button
                    key={p[2]}
                    className={`${btn} min-h-14 text-base`}
                    data-testid={`dpad-${p[2]}`}
                    aria-label={`Move ${p[2]}`}
                    onClick={() => step(p[0], p[1])}
                  >
                    {p[2]}
                  </button>
                ) : (
                  <div key={i} className="flex items-center justify-center text-xs opacity-50">
                    {token.col},{token.row}
                  </div>
                ),
              )}
            </div>
            <label className="mt-3 flex min-h-10 items-center justify-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5" data-testid="free-movement" checked={free} onChange={(e) => setFree(e.target.checked)} />
              Free Movement (does not spend Movement or AP)
            </label>
          </>
        )}

        <div className="mt-3 text-sm opacity-70">Target</div>
        <div className="mt-1 flex flex-col gap-1" data-testid="target-list">
          {others.length === 0 && <p className="text-sm opacity-60">Nobody else is on the map.</p>}
          {others.map((t) => (
            <button
              key={t.id}
              data-testid="target-option"
              aria-pressed={target?.id === t.id}
              className={`${btn} flex justify-between ${target?.id === t.id ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => aim(target?.id === t.id ? null : t.id)}
            >
              <span className="truncate">{t.name}</span>
              <span className="text-xs opacity-60">{t.kind.toUpperCase()}</span>
            </button>
          ))}
          {target && (
            <button className={btn} data-testid="clear-target" onClick={() => aim(null)}>
              Clear target
            </button>
          )}
        </div>
      </div>

      {ask && (
        <Dialog title="Spend AP to move?" onClose={() => setAsk(null)}>
          <p className="mb-3 text-sm" data-testid="confirm-ap-text">
            Spend {ask.aps} AP for {ask.movement} Movement?
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} data-testid="confirm-ap-no" onClick={() => setAsk(null)}>
              No
            </button>
            <button
              className={btnPrimary}
              data-testid="confirm-ap-yes"
              onClick={() => {
                const a = ask;
                setAsk(null);
                step(a.dc, a.dr, true);
              }}
            >
              Yes
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
