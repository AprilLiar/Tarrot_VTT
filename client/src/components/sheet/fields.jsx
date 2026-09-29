import { useEffect, useRef, useState } from 'react';
import Dialog, { btn, btnPrimary, input } from '../Dialog.jsx';

// A number that is edited in place and saved when the field loses focus or
// Enter is pressed. While focused it ignores incoming updates so typing is
// never overwritten. Out-of-range or invalid input reverts.
export function NumField({ value, onCommit, min, max, disabled, className = '', label, testId }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

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

  return (
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
  );
}

// Tap = immediate roll. Long-press (touch) or right-click (mouse) opens the
// options dialog: advantage / disadvantage and a custom modifier.
export function RollButton({ label, title = label, onRoll, className = '', testId, disabled }) {
  const [options, setOptions] = useState(false);
  const timer = useRef(null);
  const longPressed = useRef(false);

  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        className={`select-none rounded-md bg-violet-700/70 px-2 py-1 text-xs font-medium active:bg-violet-600 disabled:opacity-40 ${className}`}
        style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
        onPointerDown={() => {
          longPressed.current = false;
          clear();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            setOptions(true);
          }, 500);
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => {
          e.preventDefault();
          clear();
          longPressed.current = true;
          setOptions(true);
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onRoll({});
        }}
      >
        {label}
      </button>
      {options && <RollOptionsDialog title={title} onClose={() => setOptions(false)} onRoll={onRoll} />}
    </>
  );
}

function RollOptionsDialog({ title, onClose, onRoll }) {
  const [mode, setMode] = useState('normal');
  const [modifier, setModifier] = useState('0');
  const n = Number(modifier);
  const valid = Number.isInteger(n) && Math.abs(n) <= 99;

  return (
    <Dialog title={`Roll options: ${title}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onRoll({ mode, modifier: n });
          onClose();
        }}
      >
        <div className="flex gap-2" role="radiogroup" aria-label="Roll mode">
          {[
            ['disadvantage', 'Disadvantage'],
            ['normal', 'Normal'],
            ['advantage', 'Advantage'],
          ].map(([v, text]) => (
            <button
              type="button"
              key={v}
              role="radio"
              aria-checked={mode === v}
              className={`${btn} flex-1 px-1 ${mode === v ? 'ring-2 ring-violet-500' : ''}`}
              onClick={() => setMode(v)}
            >
              {text}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Custom modifier
          <input
            className={input}
            inputMode="numeric"
            value={modifier}
            onChange={(e) => setModifier(e.target.value)}
          />
        </label>
        {!valid && <p className="text-sm text-red-400">Use a whole number from -99 to 99.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={!valid}>
            Roll
          </button>
        </div>
      </form>
    </Dialog>
  );
}
