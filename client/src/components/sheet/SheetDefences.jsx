import { useState } from 'react';
import { btn, btnDanger, input } from '../Dialog.jsx';
import { FormDialog } from './SheetLists.jsx';
import { IntInput, isWholeNumber } from './fields.jsx';
import * as D from '../../../../shared/rules-data.js';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

const label = (t) => t[0].toUpperCase() + t.slice(1);

// Column 2 text, for example "Resistance (3), Resistance (Half)".
// Flat modifiers are listed first because they apply first.
export function describeResistance(r) {
  const parts = [];
  if (r.immunity) parts.push('Immunity');
  if (r.consumption) parts.push('Consumption');
  if (r.flat !== 0) parts.push(`Resistance (${r.flat})`);
  if (r.half) parts.push('Resistance (Half)');
  if (r.double) parts.push('Resistance (Double)');
  return parts.join(', ');
}

// Placeholder for the damage type icons: a colored disc with the initial.
function TypeIcon({ type }) {
  const hue = (D.DAMAGE_TYPES.indexOf(type) * 360) / D.DAMAGE_TYPES.length;
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: `hsl(${hue} 50% 35%)` }}
    >
      {type[0].toUpperCase()}
    </span>
  );
}

function ResistanceDialog({ s, initialType, onClose }) {
  const existing = s.sheet.resistances[initialType];
  const [type, setType] = useState(initialType ?? D.DAMAGE_TYPES[0]);
  const current = s.sheet.resistances[type];
  const [flat, setFlat] = useState(String(existing?.flat ?? 0));
  const [flags, setFlags] = useState({
    half: existing?.half ?? false,
    double: existing?.double ?? false,
    immunity: existing?.immunity ?? false,
    consumption: existing?.consumption ?? false,
  });
  const n = Number(flat);
  const valid = isWholeNumber(flat) && Math.abs(n) <= 99;

  function pickType(t) {
    const r = s.sheet.resistances[t];
    setType(t);
    setFlat(String(r?.flat ?? 0));
    setFlags({
      half: r?.half ?? false,
      double: r?.double ?? false,
      immunity: r?.immunity ?? false,
      consumption: r?.consumption ?? false,
    });
  }

  return (
    <FormDialog
      title="Resistance"
      submitLabel="Save"
      onClose={onClose}
      canSubmit={valid}
      run={() => s.set(`resistances.${type}`, { flat: n, ...flags })}
    >
      <label className="flex flex-col gap-1 text-sm">
        Damage type
        <select className={input} value={type} onChange={(e) => pickType(e.target.value)}>
          {D.DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Resistance (X): positive takes less damage, negative takes more
        <IntInput label="Resistance value" value={flat} onChange={setFlat} />
      </label>
      {[
        ['half', 'Half (x0.5)'],
        ['double', 'Double (x2)'],
        ['immunity', 'Immunity: takes 0 damage'],
        ['consumption', 'Consumption: takes 0 and heals half of the raw damage'],
      ].map(([key, text]) => (
        <label key={key} className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={flags[key]}
            onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
          />
          {text}
        </label>
      ))}
      <p className="text-xs opacity-60">Flat (X) modifiers apply first, then Half or Double. Clear everything to remove the row.</p>
      {current && (
        <button
          type="button"
          className={btnDanger}
          onClick={async () => {
            await s.set(`resistances.${type}`, { flat: 0, half: false, double: false, immunity: false, consumption: false });
            onClose();
          }}
        >
          Remove this row
        </button>
      )}
    </FormDialog>
  );
}

export function Resistances({ s }) {
  const [dialog, setDialog] = useState(null); // null | { type }
  const rows = D.DAMAGE_TYPES.filter((t) => s.sheet.resistances[t]);
  return (
    <section aria-label="Resistances">
      <h2 className={heading}>Resistances</h2>
      <div className={`${card} p-0`}>
        {rows.length === 0 && <p className="p-3 text-sm opacity-60">No resistances.</p>}
        {rows.map((t) => (
          <button
            key={t}
            data-testid="resistance-row"
            className="flex min-h-12 w-full items-center gap-3 border-b border-white/10 px-3 text-left last:border-b-0 active:bg-white/10"
            onClick={() => setDialog({ type: t })}
          >
            <TypeIcon type={t} />
            <span className="w-24 shrink-0">{label(t)}</span>
            <span className="text-sm opacity-80">{describeResistance(s.sheet.resistances[t])}</span>
          </button>
        ))}
      </div>
      <button className={`${btn} mt-2 w-full`} data-testid="add-resistance" onClick={() => setDialog({ type: undefined })}>
        Add or edit resistance
      </button>
      {dialog && <ResistanceDialog s={s} initialType={dialog.type} onClose={() => setDialog(null)} />}
    </section>
  );
}

// ---- Statuses ---------------------------------------------------------------

function AddStatusDialog({ s, onClose }) {
  const [query, setQuery] = useState('');
  const matches = D.STATUSES.filter(
    (st) => !s.sheet.statuses[st.key] && st.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <FormDialog title="Add status" submitLabel="Close" onClose={onClose} run={() => ({ ok: true })}>
      <input
        className={input}
        placeholder="Search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
        {matches.map((st) => (
          <button
            type="button"
            key={st.key}
            data-testid="status-option"
            className="min-h-16 w-full shrink-0 rounded-lg bg-white/10 px-3 py-2 text-left active:bg-white/20"
            onClick={async () => {
              await s.set(`statuses.${st.key}`, 1);
              onClose();
            }}
          >
            <div className="font-medium">{st.name}</div>
            <div className="line-clamp-2 text-xs leading-snug opacity-60">{st.text}</div>
          </button>
        ))}
        {matches.length === 0 && <p className="text-sm opacity-60">No matching statuses.</p>}
      </div>
    </FormDialog>
  );
}

export function Statuses({ s }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const active = D.STATUSES.filter((st) => s.sheet.statuses[st.key]);

  return (
    <section aria-label="Statuses">
      <h2 className={heading}>Statuses</h2>
      <div className="flex flex-col gap-2">
        {active.length === 0 && <p className="text-sm opacity-60">No statuses.</p>}
        {active.map((st) => {
          const stacks = s.sheet.statuses[st.key];
          return (
            <div key={st.key} className={card} data-testid="status">
              <div className="flex items-center gap-2">
                <button className="min-h-9 flex-1 truncate text-left font-medium" onClick={() => setOpen(open === st.key ? null : st.key)}>
                  {st.name}
                  {st.stackable ? ` (${stacks})` : ''}
                </button>
                {st.stackable && (
                  <>
                    <button className={`${btn} min-h-9 px-3`} aria-label={`Decrease ${st.name}`} onClick={() => s.set(`statuses.${st.key}`, stacks - 1)}>
                      -
                    </button>
                    <button className={`${btn} min-h-9 px-3`} aria-label={`Increase ${st.name}`} onClick={() => s.set(`statuses.${st.key}`, Math.min(99, stacks + 1))}>
                      +
                    </button>
                  </>
                )}
                <button className={`${btnDanger} min-h-9 px-3`} aria-label={`Remove ${st.name}`} onClick={() => s.set(`statuses.${st.key}`, 0)}>
                  x
                </button>
              </div>
              <button
                className="mt-1 w-full text-left"
                aria-label={`Toggle full text of ${st.name}`}
                onClick={() => setOpen(open === st.key ? null : st.key)}
              >
                <p className={`text-sm leading-snug opacity-80 ${open === st.key ? '' : 'line-clamp-2'}`}>
                  {st.text.replaceAll(/\bX\b/g, String(stacks))}
                </p>
              </button>
            </div>
          );
        })}
        <button className={btn} data-testid="add-status" onClick={() => setAdding(true)}>
          Add status
        </button>
      </div>
      {adding && <AddStatusDialog s={s} onClose={() => setAdding(false)} />}
    </section>
  );
}
