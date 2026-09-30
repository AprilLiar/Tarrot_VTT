import { useState } from 'react';
import { btn, btnDanger, input } from '../Dialog.jsx';
import { FormDialog } from './SheetLists.jsx';
import { IntInput, isWholeNumber } from './fields.jsx';
import * as D from '../../../../shared/rules-data.js';
import { useT } from '../../i18n.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

const label = (type) => type[0].toUpperCase() + type.slice(1);

// Column 2 text, for example "Resistance (3), Resistance (Half)".
// Flat modifiers are listed first because they apply first.
export function describeResistance(r, t = (x) => x) {
  const parts = [];
  if (r.immunity) parts.push(t('Immunity'));
  if (r.consumption) parts.push(t('Consumption'));
  if (r.flat !== 0) parts.push(t('Resistance ({n})', { n: r.flat }));
  if (r.half) parts.push(t('Resistance (Half)'));
  if (r.double) parts.push(t('Resistance (Double)'));
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
  const t = useT();
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

  function pickType(next) {
    const r = s.sheet.resistances[next];
    setType(next);
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
      title={t('Resistance')}
      submitLabel={t('Save')}
      onClose={onClose}
      canSubmit={valid}
      run={() => s.set(`resistances.${type}`, { flat: n, ...flags })}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('Damage type')}
        <select className={input} value={type} onChange={(e) => pickType(e.target.value)}>
          {D.DAMAGE_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {t(label(dt))}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('Resistance (X): positive takes less damage, negative takes more')}
        <IntInput label={t('Resistance value')} value={flat} onChange={setFlat} />
      </label>
      {[
        ['half', t('Half (x0.5)')],
        ['double', t('Double (x2)')],
        ['immunity', t('Immunity: takes 0 damage')],
        ['consumption', t('Consumption: takes 0 and heals half of the raw damage')],
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
      <p className="text-xs opacity-60">{t('Flat (X) modifiers apply first, then Half or Double. Clear everything to remove the row.')}</p>
      {current && (
        <button
          type="button"
          className={btnDanger}
          onClick={async () => {
            await s.set(`resistances.${type}`, { flat: 0, half: false, double: false, immunity: false, consumption: false });
            onClose();
          }}
        >
          {t('Remove this row')}
        </button>
      )}
    </FormDialog>
  );
}

export function Resistances({ s }) {
  const t = useT();
  const [dialog, setDialog] = useState(null); // null | { type }
  const rows = D.DAMAGE_TYPES.filter((dt) => s.sheet.resistances[dt]);
  return (
    <section aria-label={t('Resistances')}>
      <h2 className={heading}>{t('Resistances')}</h2>
      <div className={`${card} p-0`}>
        {rows.length === 0 && <p className="p-3 text-sm opacity-60">{t('No resistances.')}</p>}
        {rows.map((dt) => (
          <button
            key={dt}
            data-testid="resistance-row"
            className="flex min-h-12 w-full items-center gap-3 border-b border-white/10 px-3 text-left last:border-b-0 active:bg-white/10"
            onClick={() => setDialog({ type: dt })}
          >
            <TypeIcon type={dt} />
            <span className="w-24 shrink-0">{t(label(dt))}</span>
            <span className="text-sm opacity-80">{describeResistance(s.sheet.resistances[dt], t)}</span>
          </button>
        ))}
      </div>
      <button className={`${btn} mt-2 w-full`} data-testid="add-resistance" onClick={() => setDialog({ type: undefined })}>
        {t('Add or edit resistance')}
      </button>
      {dialog && <ResistanceDialog s={s} initialType={dialog.type} onClose={() => setDialog(null)} />}
    </section>
  );
}

// ---- Statuses ---------------------------------------------------------------

function AddStatusDialog({ s, onClose }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const matches = D.STATUSES.filter(
    (st) => !s.sheet.statuses[st.key] && t(st.name).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <FormDialog title={t('Add status')} submitLabel={t('Close')} onClose={onClose} run={() => ({ ok: true })}>
      <input
        className={input}
        placeholder={t('Search')}
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
            <div className="font-medium">{t(st.name)}</div>
            <div className="line-clamp-2 text-xs leading-snug opacity-60">{t(st.text)}</div>
          </button>
        ))}
        {matches.length === 0 && <p className="text-sm opacity-60">{t('No matching statuses.')}</p>}
      </div>
    </FormDialog>
  );
}

export function Statuses({ s }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const active = D.STATUSES.filter((st) => s.sheet.statuses[st.key]);

  return (
    <section aria-label={t('Statuses')}>
      <h2 className={heading}>{t('Statuses')}</h2>
      <div className="flex flex-col gap-2">
        {active.length === 0 && <p className="text-sm opacity-60">{t('No statuses.')}</p>}
        {active.map((st) => {
          const stacks = s.sheet.statuses[st.key];
          return (
            <div key={st.key} className={card} data-testid="status">
              <div className="flex items-center gap-2">
                <button className="min-h-9 flex-1 truncate text-left font-medium" onClick={() => setOpen(open === st.key ? null : st.key)}>
                  {t(st.name)}
                  {st.stackable ? ` (${stacks})` : ''}
                </button>
                {st.stackable && (
                  <>
                    <button className={`${btn} min-h-9 px-3`} aria-label={t('Decrease {name}', { name: { t: st.name } })} onClick={() => s.set(`statuses.${st.key}`, stacks - 1)}>
                      -
                    </button>
                    <button className={`${btn} min-h-9 px-3`} aria-label={t('Increase {name}', { name: { t: st.name } })} onClick={() => s.set(`statuses.${st.key}`, Math.min(99, stacks + 1))}>
                      +
                    </button>
                  </>
                )}
                <button className={`${btnDanger} min-h-9 px-3`} aria-label={t('Remove {name}', { name: { t: st.name } })} onClick={() => s.set(`statuses.${st.key}`, 0)}>
                  x
                </button>
              </div>
              <button
                className="mt-1 w-full text-left"
                aria-label={t('Toggle full text of {name}', { name: { t: st.name } })}
                onClick={() => setOpen(open === st.key ? null : st.key)}
              >
                <p className={`text-sm leading-snug opacity-80 ${open === st.key ? '' : 'line-clamp-2'}`}>
                  {t(st.text).replaceAll(/\bX\b/g, String(stacks))}
                </p>
              </button>
            </div>
          );
        })}
        <button className={btn} data-testid="add-status" onClick={() => setAdding(true)}>
          {t('Add status')}
        </button>
      </div>
      {adding && <AddStatusDialog s={s} onClose={() => setAdding(false)} />}
    </section>
  );
}
