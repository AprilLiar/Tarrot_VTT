import { useEffect, useRef, useState } from 'react';
import Dialog, { btn, btnPrimary, input } from '../Dialog.jsx';
import { planRoll, formatExpression, MAX_MANUAL_LEVELS } from '../../../../shared/roll-plan.js';
import { useT } from '../../i18n.jsx';
import { T } from '../../../../shared/localization.js';

// A number that is edited in place and saved when the field loses focus or
// Enter is pressed. While focused it ignores incoming updates so typing is
// never overwritten. Out-of-range or invalid input reverts.
export function NumField({ value, onCommit, min, max, disabled, className = '', label, testId }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // The digit pad on iOS has no minus key, so fields that can go negative open the full keyboard.
  const canBeNegative = min < 0;

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  function commit() {
    focused.current = false;
    const n = Number(draft);
    // Only whole numbers (optionally negative) within range are ever saved.
    if (!/^-?\d+$/.test(draft.trim()) || n < min || n > max) {
      setDraft(String(value));
      return;
    }
    if (n !== value) onCommit(n);
    else setDraft(String(value));
  }

  return (
    <div className="flex w-full items-center gap-1">
      <input
        type="text"
        inputMode={canBeNegative ? 'text' : 'numeric'}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        value={draft}
        className={`w-full min-w-0 rounded-md border border-transparent bg-transparent text-center focus:border-violet-400 focus:bg-black/40 focus:outline-none ${className}`}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

// A text field for a whole number that may be negative. It uses the full
// keyboard because the digit pad on iOS has no minus key. The parent validates.
export function IntInput({ value, onChange, label, className = '' }) {
  return (
    <input
      className={`${input} ${className}`}
      type="text"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export const isWholeNumber = (v) => /^-?\d+$/.test(v.trim());

// True on touch screens (phones and tablets).
function useCoarsePointer() {
  const query = '(pointer: coarse)';
  const [coarse, setCoarse] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e) => setCoarse(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

// On a touch screen a tap always opens the roll dialog (long-press was not
// reliable on iOS). With a mouse a click rolls at once and a right-click opens
// the dialog, which previews the exact formula (`sheet`, `kind` and `rkey` say what is being rolled).
export function RollButton({ label, title = label, onRoll, sheet, kind, rkey, className = '', testId, disabled }) {
  const [options, setOptions] = useState(false);
  const coarse = useCoarsePointer();

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        className={`select-none rounded-md bg-violet-700/70 px-2 py-1 text-xs font-medium active:bg-violet-600 disabled:opacity-40 ${className}`}
        style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOptions(true);
        }}
        onClick={() => (coarse ? setOptions(true) : onRoll({}))}
      >
        {label}
      </button>
      {options && <RollOptionsDialog title={title} sheet={sheet} kind={kind} rkey={rkey} onClose={() => setOptions(false)} onRoll={onRoll} />}
    </>
  );
}

const describeNet = (net, t) => (net === 0 ? t('Normal') : `${net > 0 ? t('Advantage') : t('Disadvantage')} ${Math.abs(net)}`);

export function RollOptionsDialog({ title, sheet, kind, rkey, onClose, onRoll }) {
  const t = useT();
  const [manual, setManual] = useState(0);
  const [modifier, setModifier] = useState('0');
  const valid = isWholeNumber(modifier) && Math.abs(Number(modifier)) <= 99;

  // The same plan the server will use, so the preview is exactly what gets rolled.
  const plan = planRoll(sheet, { kind, key: rkey, advantage: manual, modifier: valid ? Number(modifier) : 0 });

  return (
    <Dialog title={t('Roll: {title}', { title })} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onRoll({ advantage: manual, modifier: Number(modifier) });
          onClose();
        }}
      >
        {plan.ok && (
          <div className="rounded-lg bg-white/5 p-3" data-testid="roll-preview">
            <div className="text-base font-medium" data-testid="preview-expression">
              {formatExpression(plan.terms.map((x) => ({ ...x, label: t(x.label) })))}
            </div>
            {plan.diceCount > 1 && (
              <div className="mt-1 text-xs opacity-70" data-testid="net-mode">
                {t('{n}d20, keep the {which}: {mode} ({sources})', {
                  n: plan.diceCount,
                  which: t(plan.net > 0 ? T('highest') : T('lowest')),
                  mode: describeNet(plan.net, t),
                  sources: plan.sources.map((x) => t(x.label)).join(', '),
                })}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span>{t('Extra Advantage levels (negative for Disadvantage)')}</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t('Fewer levels')} className={`${btn} min-w-12`} onClick={() => setManual(Math.max(-MAX_MANUAL_LEVELS, manual - 1))}>
              -
            </button>
            <span className="w-8 text-center text-lg" data-testid="manual-levels">
              {manual}
            </span>
            <button type="button" aria-label={t('More levels')} className={`${btn} min-w-12`} onClick={() => setManual(Math.min(MAX_MANUAL_LEVELS, manual + 1))}>
              +
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t('Custom modifier')}
          <IntInput label={t('Custom modifier')} value={modifier} onChange={setModifier} />
        </label>
        {!valid && <p className="text-sm text-red-400">{t('Use a whole number from -99 to 99.')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={!valid || !plan.ok} data-testid="roll-confirm">
            {t('Roll')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
