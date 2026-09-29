import { useEffect, useRef, useState } from 'react';
import Dialog, { btn, btnPrimary, input } from '../Dialog.jsx';

// iOS shows a digit pad with no minus key for numeric inputs, so anywhere a
// value can be negative there is a +/- button next to it.
const signButton =
  'min-h-9 min-w-9 shrink-0 rounded-md bg-white/10 px-2 text-sm font-medium active:bg-white/25';

// A number that is edited in place and saved when the field loses focus or
// Enter is pressed. While focused it ignores incoming updates so typing is
// never overwritten. Out-of-range or invalid input reverts.
export function NumField({ value, onCommit, min, max, disabled, className = '', label, testId }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  const canBeNegative = min < 0;

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  function commit() {
    focused.current = false;
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n) || n < min || n > max) {
      setDraft(String(value));
      return;
    }
    if (n !== value) onCommit(n);
    else setDraft(String(value));
  }

  function flipSign() {
    const n = Number(draft);
    const current = draft.trim() !== '' && Number.isInteger(n) ? n : value;
    const next = -current;
    if (next < min || next > max || next === current) return;
    setDraft(String(next));
    onCommit(next);
  }

  return (
    <div className="flex w-full items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
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
      {canBeNegative && !disabled && (
        <button
          type="button"
          aria-label={`Flip sign of ${label}`}
          data-testid={testId ? `${testId}-sign` : undefined}
          className={signButton}
          // Keep the field focused so tapping the button does not trigger a blur-commit first.
          onPointerDown={(e) => e.preventDefault()}
          onClick={flipSign}
        >
          +/-
        </button>
      )}
    </div>
  );
}

// A text field for a whole number that may be negative, with a +/- button.
export function SignedInput({ value, onChange, label, className = '' }) {
  const n = Number(value);
  const flip = () => {
    if (value.trim() === '' || value.trim() === '-') onChange('-');
    else if (Number.isInteger(n)) onChange(String(-n));
  };
  return (
    <div className="flex items-center gap-2">
      <input
        className={`${input} ${className}`}
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label={`Flip sign of ${label}`} className={`${signButton} min-h-11 min-w-12`} onClick={flip}>
        +/-
      </button>
    </div>
  );
}

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
// the dialog. `info` is the status effects that will apply to this roll.
export function RollButton({ label, title = label, onRoll, info, className = '', testId, disabled }) {
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
      {options && <RollOptionsDialog title={title} info={info} onClose={() => setOptions(false)} onRoll={onRoll} />}
    </>
  );
}

const describeNet = (net) =>
  net === 0 ? 'Normal' : `${net > 0 ? 'Advantage' : 'Disadvantage'} ${Math.abs(net)}`;

export function RollOptionsDialog({ title, info, onClose, onRoll }) {
  const [manual, setManual] = useState(0);
  const [modifier, setModifier] = useState('0');
  const n = Number(modifier);
  const valid = Number.isInteger(n) && Math.abs(n) <= 99;
  const levels = info?.levels ?? [];
  const modifiers = info?.modifiers ?? [];
  const net = levels.reduce((sum, l) => sum + l.levels, 0) + manual;

  return (
    <Dialog title={`Roll: ${title}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onRoll({ advantage: manual, modifier: n });
          onClose();
        }}
      >
        {(levels.length > 0 || modifiers.length > 0) && (
          <div className="rounded-lg bg-white/5 p-2 text-sm" data-testid="status-effects">
            <div className="mb-1 text-xs uppercase tracking-wide opacity-60">Applied automatically by statuses</div>
            {levels.map((l) => (
              <div key={l.label}>
                {l.label}: {describeNet(l.levels)}
              </div>
            ))}
            {modifiers.map((m) => (
              <div key={m.label}>
                {m.label}: {m.value > 0 ? '+' : '-'}
                {Math.abs(m.value)}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span>Extra Advantage levels (negative for Disadvantage)</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer levels" className={`${btn} min-w-12`} onClick={() => setManual(Math.max(-5, manual - 1))}>
              -
            </button>
            <span className="w-8 text-center text-lg" data-testid="manual-levels">
              {manual}
            </span>
            <button type="button" aria-label="More levels" className={`${btn} min-w-12`} onClick={() => setManual(Math.min(5, manual + 1))}>
              +
            </button>
            <span className="flex-1 text-right opacity-80" data-testid="net-mode">
              Result: {describeNet(net)}
            </span>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Custom modifier
          <SignedInput label="Custom modifier" value={modifier} onChange={setModifier} />
        </label>
        {!valid && <p className="text-sm text-red-400">Use a whole number from -99 to 99.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={!valid} data-testid="roll-confirm">
            Roll
          </button>
        </div>
      </form>
    </Dialog>
  );
}
