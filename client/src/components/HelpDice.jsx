import { useCallback, useState } from 'react';
import Dialog, { btn, btnPrimary } from './Dialog.jsx';
import { DiceIcon } from './DiceIcon.jsx';
import { HELP_SIDES, MAX_HELP } from '../../../shared/help.js';
import { useT } from '../i18n.jsx';

// Help Dice (see the README): a character holds up to 5 (d4 to d12) and may spend any of them before a roll.

// The question before a roll: the row of dice, a tap selects, a second tap unselects; Proceed with nothing selected
// uses nothing. `onProceed(indices)` / `onCancel()` (no roll at all).
function HelpDiceDialog({ dice, onProceed, onCancel }) {
  const t = useT();
  const [chosen, setChosen] = useState([]);
  const toggle = (i) => setChosen(chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i]);
  return (
    <Dialog title={t('Use Help Dice?')} onClose={onCancel}>
      <div className="flex flex-col gap-3" data-testid="help-dialog">
        <p className="text-sm opacity-70">{t('Tap a die to add it to this roll, tap it again to put it back. A die you use is gone afterwards.')}</p>
        <div className="flex flex-wrap justify-center gap-2" data-testid="help-dice-row">
          {dice.map((sides, i) => (
            <button key={i} type="button" data-testid="help-die" data-index={i} data-sides={sides} data-selected={chosen.includes(i) ? 'true' : 'false'} aria-pressed={chosen.includes(i)} className={`rounded-xl p-1 ${chosen.includes(i) ? 'bg-amber-400/25 ring-2 ring-amber-400' : 'bg-white/5'}`} onClick={() => toggle(i)}>
              <DiceIcon sides={sides} size={60} selected={chosen.includes(i)} />
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className={btn} data-testid="help-cancel" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} data-testid="help-proceed" onClick={() => onProceed(chosen)}>
            {chosen.length ? t('Proceed with {n}', { n: chosen.length }) : t('Proceed')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// `const { ask, dialog } = useHelpPrompt(sheet.helpDice)`: `await ask()` is the list of chosen places in the track
// (empty when there are no dice, or none are chosen) or null when the player cancels; render `dialog` somewhere.
export function useHelpPrompt(dice) {
  const [pending, setPending] = useState(null);
  const have = dice?.length ?? 0;
  const ask = useCallback(
    () =>
      new Promise((resolve) => {
        if (!have) resolve([]);
        else setPending({ resolve });
      }),
    [have],
  );
  const finish = (value) => {
    pending?.resolve(value);
    setPending(null);
  };
  const dialog = pending ? <HelpDiceDialog dice={dice} onProceed={finish} onCancel={() => finish(null)} /> : null;
  return { ask, dialog };
}

// The track on the sheet: the character's dice in a row. The GM and the owner add a die (a picker d4 to d12) and take
// one away by tapping it.
export function HelpTrack({ dice, onAdd, onRemove }) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  return (
    <div className="mt-2" data-testid="help-track" data-count={dice.length}>
      <div className="text-xs opacity-60">{t('Help Dice')}</div>
      <div className="flex min-h-[3rem] flex-wrap items-center gap-1">
        {dice.map((sides, i) => (
          <button key={i} type="button" data-testid="help-track-die" data-sides={sides} title={t('Remove this die')} aria-label={t('Remove the d{sides} Help Die', { sides })} className="rounded-lg p-0.5 active:bg-white/10" onClick={() => onRemove(i)}>
            <DiceIcon sides={sides} size={40} />
          </button>
        ))}
        {dice.length === 0 && <span className="text-xs opacity-40">{t('None')}</span>}
        {dice.length < MAX_HELP && (
          <button type="button" data-testid="help-add" aria-label={t('Add a Help Die')} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg active:bg-white/20" onClick={() => setPicking(!picking)}>
            +
          </button>
        )}
      </div>
      {picking && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="help-picker">
          {HELP_SIDES.map((sides) => (
            <button
              key={sides}
              type="button"
              data-testid={`help-pick-${sides}`}
              aria-label={t('Add a d{sides}', { sides })}
              className="rounded-lg bg-white/10 p-1 active:bg-white/20"
              onClick={() => {
                onAdd(sides);
                setPicking(false);
              }}
            >
              <DiceIcon sides={sides} size={36} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
