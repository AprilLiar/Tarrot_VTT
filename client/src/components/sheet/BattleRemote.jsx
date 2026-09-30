import { useState } from 'react';
import { TargetPicker, useTargets } from './TargetPicker.jsx';
import ApCubes from './ApCubes.jsx';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';
import { HeightControl } from '../scene/HeightControl.jsx';
import { useT } from '../../i18n.jsx';

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
export function BattleRemote({ s, onAttack }) {
  const t = useT();
  const { stage, toast } = useApp();
  const battle = stage.battle;
  const [free, setFree] = useState(false);
  const [ask, setAsk] = useState(null); // { dc, dr, aps, movement }
  const info = useTargets(s.characterId);
  if (stage.mode !== 'battle' || !battle?.imageId) return null;

  const token = battle.tokens.find((tk) => tk.ownerKind === 'character' && tk.ownerId === s.characterId);
  const targets = info?.targets ?? [];
  const apMax = s.sheet.ap.minion ? 2 : 4;
  const combat = battle.combat;
  const mine = combat?.order.find((e) => e.ownerKind === 'character' && e.ownerId === s.characterId);
  const myTurn = !!mine && combat.activeTokenId === mine.tokenId;
  const active = combat?.order.find((e) => e.tokenId === combat.activeTokenId);
  const place = mine ? combat.order.indexOf(mine) + 1 : null;

  async function step(dc, dr, confirmAp = false) {
    const r = await call('battle:move', { tokenId: token.id, dc, dr, free, confirmAp });
    if (!r.ok) toast(r.error ?? t('You cannot move there.'));
    else if (r.needsConfirm) setAsk({ dc, dr, ...r.needsConfirm });
  }

  async function rollInitiative() {
    const r = await call('combat:roll', { tokenId: mine.tokenId });
    if (!r.ok) toast(r.error);
  }

  async function endTurn() {
    const r = await call('combat:next', { tokenId: mine.tokenId });
    if (!r.ok) toast(r.error);
  }

  return (
    <section aria-label={t('Battle controls')} data-testid="battle-remote">
      <h2 className={heading}>{t('Battle')}</h2>
      <div className={card}>
        {combat && (
          <div className="mb-3 rounded-lg bg-white/5 p-2 text-center text-sm" data-testid="remote-combat">
            {combat.phase === 'rolling' ? (
              mine && mine.initiative == null ? (
                <button className={`${btnPrimary} w-full`} data-testid="roll-initiative" onClick={rollInitiative}>
                  {t('Roll Initiative')}
                </button>
              ) : (
                <span data-testid="remote-turn">
                  {mine ? `${t('Initiative {n}.', { n: mine.initiative })} ` : ''}
                  {t('Waiting for the GM to begin.')}
                </span>
              )
            ) : (
              <>
                <div data-testid="remote-turn" data-my-turn={myTurn}>
                  {myTurn ? t('Your turn') : t("{name}'s turn", { name: active?.name ?? t('Someone') })}{' '}
                  {place
                    ? t('(round {round}, you are {place} of {total})', { round: combat.round, place, total: combat.order.length })
                    : t('(round {round})', { round: combat.round })}
                </div>
                {myTurn && (
                  <button className={`${btnPrimary} mt-2 w-full`} data-testid="end-turn" onClick={endTurn}>
                    {t('End turn')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {!token ? (
          <p className="text-sm opacity-70">{t('This character is not on the map right now.')}</p>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-xs opacity-60">{t('AP')}</div>
                <div className="flex justify-center">
                  <ApCubes current={s.sheet.ap.current} max={apMax} testId="remote-ap" />
                </div>
              </div>
              <div>
                <div className="text-xs opacity-60">{t('Movement per AP')}</div>
                <div className="text-lg">{s.sheet.movement}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">{t('Banked')}</div>
                <div className="text-lg" data-testid="remote-bank">
                  {token.bank}
                </div>
              </div>
            </div>
            <div className="mx-auto grid max-w-[15rem] grid-cols-3 gap-2" role="group" aria-label={t('Move')}>
              {PAD.map((p, i) =>
                p ? (
                  <button
                    key={p[2]}
                    className={`${btn} min-h-14 text-base`}
                    data-testid={`dpad-${p[2]}`}
                    aria-label={t('Move {dir}', { dir: t(p[2]) })}
                    onClick={() => step(p[0], p[1])}
                  >
                    {t(p[2])}
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
              {t('Free Movement (does not spend Movement or AP)')}
            </label>
          </>
        )}

        <button
          className={`${btnPrimary} mt-3 w-full`}
          data-testid="attack-open"
          disabled={s.sheet.ap.current < 1 || targets.length === 0}
          onClick={onAttack}
        >
          {t('Attack')}
        </button>
        {(s.sheet.ap.current < 1 || targets.length === 0) && (
          <p className="mt-1 text-center text-xs opacity-60" data-testid="attack-blocked">
            {s.sheet.ap.current < 1 ? t('No AP left to attack.') : t('Select a target below first.')}
          </p>
        )}

        <div className="mt-3">
          <TargetPicker characterId={s.characterId} info={info} />
        </div>
      </div>

      {ask && (
        <Dialog title={t('Spend AP to move?')} onClose={() => setAsk(null)}>
          <p className="mb-3 text-sm" data-testid="confirm-ap-text">
            {t('Spend {aps} AP for {movement} Movement?', { aps: ask.aps, movement: ask.movement })}
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} data-testid="confirm-ap-no" onClick={() => setAsk(null)}>
              {t('No')}
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
              {t('Yes')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

// Next to Movement and Size on the sheet: how many Spaces the character is in the air, with Up, Down and
// Reset buttons. Only there while the character has a token on the active Battle map.
export function SheetHeight({ characterId }) {
  const t = useT();
  const { stage } = useApp();
  const token = stage.mode === 'battle' ? stage.battle?.tokens.find((tk) => tk.ownerKind === 'character' && tk.ownerId === characterId) : null;
  if (!token) return null;
  return (
    <div className="col-span-2" data-testid="sheet-height">
      <div className="text-xs opacity-60">{t('Height (Spaces in the air, shown above the token)')}</div>
      <HeightControl token={token} />
    </div>
  );
}
