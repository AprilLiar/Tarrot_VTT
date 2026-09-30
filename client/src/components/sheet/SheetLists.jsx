import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { NumField } from './fields.jsx';
import * as D from '../../../../shared/rules-data.js';
import { WeaponFields, weaponToForm, weaponValid, formToWeapon } from '../arcane/editors.jsx';
import { defaultWeapon } from '../../../../shared/arcane.js';
import { useT } from '../../i18n.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// Shared shell: runs an async action, shows its error inline, closes on success.
export function FormDialog({ title, submitLabel, onClose, run, canSubmit = true, danger, children }) {
  const t = useT();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await run();
          setBusy(false);
          if (r?.ok === false) setError(r.error ?? t('Something went wrong.'));
          else onClose();
        }}
      >
        {children}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className={danger ? btnDanger : btnPrimary} disabled={busy || !canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TextInputs({ name, setName, description, setDescription }) {
  const t = useT();
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {t('Name')}
        <input className={input} value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('Description')}
        <textarea
          className={`${input} min-h-24`}
          value={description}
          maxLength={D.TEXT_MAX}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
    </>
  );
}

// ---- Features ---------------------------------------------------------------

function FeatureDialog({ s, feature, onClose }) {
  const t = useT();
  const [name, setName] = useState(feature?.name ?? '');
  const [description, setDescription] = useState(feature?.description ?? '');
  return (
    <FormDialog
      title={feature ? t('Edit feature') : t('New feature')}
      submitLabel={feature ? t('Save') : t('Add')}
      onClose={onClose}
      canSubmit={name.trim().length > 0}
      run={() =>
        feature
          ? s.list('features', 'update', { id: feature.id, name, description })
          : s.list('features', 'add', { name, description })
      }
    >
      <TextInputs name={name} setName={setName} description={description} setDescription={setDescription} />
      {feature && (
        <button
          type="button"
          className={btnDanger}
          onClick={async () => {
            await s.list('features', 'remove', { id: feature.id });
            onClose();
          }}
        >
          {t('Delete feature')}
        </button>
      )}
    </FormDialog>
  );
}

export function Features({ s }) {
  const t = useT();
  const [dialog, setDialog] = useState(null); // null | 'new' | feature
  return (
    <section aria-label={t('Features')}>
      <h2 className={heading}>{t('Features')}</h2>
      <div className="flex flex-col gap-2">
        {s.sheet.features.map((f) => (
          <button
            key={f.id}
            data-testid="feature"
            className={`${card} text-left active:bg-white/10`}
            onClick={() => setDialog(f)}
          >
            <div className="font-medium">{f.name}</div>
            {f.description && <div className="whitespace-pre-wrap text-sm opacity-70">{f.description}</div>}
          </button>
        ))}
        <button className={btn} data-testid="add-feature" onClick={() => setDialog('new')}>
          {t('Add feature')}
        </button>
      </div>
      {dialog && (
        <FeatureDialog
          s={s}
          feature={dialog === 'new' ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

// ---- Inventory --------------------------------------------------------------

function ItemDialog({ s, item, onClose }) {
  const t = useT();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [maxUses, setMaxUses] = useState(String(item?.uses.max ?? 1));
  const [states, setStates] = useState(item?.states ?? []);
  const [newState, setNewState] = useState('');
  const [weapon, setWeapon] = useState(() => (item?.weapon ? weaponToForm(item.weapon) : null)); // null: not a weapon
  const max = Number(maxUses);
  const validMax = Number.isInteger(max) && max >= 1 && max <= D.ITEM_USES_MAX;

  function addState() {
    const v = newState.trim();
    if (v && !states.includes(v)) setStates([...states, v]);
    setNewState('');
  }

  return (
    <FormDialog
      title={item ? t('Edit item') : t('New item')}
      submitLabel={item ? t('Save') : t('Add')}
      onClose={onClose}
      canSubmit={name.trim().length > 0 && validMax && (!weapon || weaponValid(weapon))}
      run={() =>
        item
          ? s.list('items', 'update', { id: item.id, name, description, usesMax: max, states, weapon: weapon ? formToWeapon(weapon) : null })
          : s.list('items', 'add', { name, description, usesMax: max, weapon: weapon ? formToWeapon(weapon) : null })
      }
    >
      <TextInputs name={name} setName={setName} description={description} setDescription={setDescription} />
      <label className="flex flex-col gap-1 text-sm">
        {t('Max uses (1 to {max})', { max: D.ITEM_USES_MAX })}
        <input className={input} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" data-testid="item-weapon" checked={!!weapon} onChange={(e) => setWeapon(e.target.checked ? weaponToForm(defaultWeapon()) : null)} />
        {t('Weapon (shown in the Arcane tab)')}
      </label>
      {weapon && <WeaponFields form={weapon} setForm={setWeapon} />}
      {item && (
        <div className="flex flex-col gap-2 text-sm">
          {t('State options')}
          <div className="flex flex-wrap gap-2">
            {states.map((st) => (
              <span key={st} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1">
                {st}
                <button
                  type="button"
                  aria-label={t('Remove {name}', { name: st })}
                  className="min-h-8 min-w-8 rounded-full active:bg-white/20"
                  onClick={() => setStates(states.filter((x) => x !== st))}
                >
                  x
                </button>
              </span>
            ))}
            {states.length === 0 && <span className="opacity-50">{t('None yet')}</span>}
          </div>
          <div className="flex gap-2">
            <input
              className={input}
              placeholder={t('New state')}
              value={newState}
              maxLength={D.NAME_MAX}
              onChange={(e) => setNewState(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addState();
                }
              }}
            />
            <button type="button" className={btn} onClick={addState}>
              {t('Add')}
            </button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

function SendDialog({ s, item, onClose }) {
  const t = useT();
  const { identity, pcs, roster } = useApp();
  const isGm = identity.role === 'gm';
  const targets = isGm
    ? (roster?.characters ?? []).filter((c) => c.id !== s.characterId).map((c) => ({ id: c.id, name: c.name, type: c.type }))
    : pcs.filter((c) => c.id !== s.characterId).map((c) => ({ id: c.id, name: c.name, type: 'pc' }));
  const [to, setTo] = useState(null);

  return (
    <FormDialog
      title={isGm ? t('Give {name}', { name: item.name }) : t('Offer {name}', { name: item.name })}
      submitLabel={isGm ? t('Give') : t('Send offer')}
      onClose={onClose}
      canSubmit={to != null}
      run={async () => {
        const r = await call(isGm ? 'item:transfer' : 'trade:offer', {
          fromId: s.characterId,
          toId: to,
          itemId: item.id,
        });
        return r;
      }}
    >
      {!isGm && (
        <p className="text-sm opacity-70">{t('The other player must accept before the item moves.')}</p>
      )}
      {targets.length === 0 && <p className="text-sm opacity-60">{t('Nobody to send it to.')}</p>}
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto" role="radiogroup" aria-label={t('Send to')}>
        {targets.map((c) => (
          <button
            type="button"
            key={c.id}
            role="radio"
            aria-checked={to === c.id}
            className={`${btn} flex justify-between ${to === c.id ? 'ring-2 ring-violet-500' : ''}`}
            onClick={() => setTo(c.id)}
          >
            <span className="truncate">{c.name}</span>
            <span className="text-xs opacity-60">{c.type === 'pc' ? t('PC') : t('NPC')}</span>
          </button>
        ))}
      </div>
    </FormDialog>
  );
}

// A fixed-size tag in the standard UI colour: room for 7 characters on each of 2 lines, the rest is cut off with an ellipsis.
function StateTag({ state }) {
  return (
    <span
      data-testid="item-state"
      title={state}
      className="flex h-10 w-[5.25rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10 px-1 text-center text-xs font-medium leading-tight"
    >
      <span className="line-clamp-2 w-full break-all">{state}</span>
    </span>
  );
}

function ItemCard({ s, item }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'edit' | 'send' | 'delete'
  const empty = item.uses.current === 0;

  return (
    <div className={`${card} ${item.weapon ? '!border-amber-400/40 !bg-amber-500/10' : ''}`} data-testid="item" data-weapon={item.weapon ? 'true' : 'false'}>
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className={`min-w-0 flex-1 truncate font-medium ${empty ? 'opacity-50' : ''}`}>{item.name}</span>
        {item.weapon && <span className="shrink-0 rounded bg-amber-500/30 px-1.5 text-xs">{t('Weapon')}</span>}
        {item.state && <StateTag state={item.state} />}
        <span className="shrink-0 text-sm opacity-70">
          {item.uses.current}/{item.uses.max}
          {empty ? ` ${t('(empty)')}` : ''}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {item.description && <p className="whitespace-pre-wrap text-sm opacity-80">{item.description}</p>}
          <div className="flex items-center gap-2 text-sm">
            <button
              className={btnPrimary}
              data-testid="use-item"
              disabled={empty}
              onClick={() => s.list('items', 'use', { id: item.id })}
            >
              {t('Use')}
            </button>
            <span className="opacity-60">{t('Uses')}</span>
            <div className="w-14">
              <NumField
                label={t('{name} uses', { name: item.name })}
                value={item.uses.current}
                min={0}
                max={item.uses.max}
                onCommit={(n) => s.list('items', 'update', { id: item.id, usesCurrent: n })}
              />
            </div>
          </div>
          {item.states.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              {t('State')}
              <select
                className={`${input} flex-1`}
                value={item.state}
                onChange={(e) => s.list('items', 'update', { id: item.id, state: e.target.value })}
              >
                <option value="">{t('(none)')}</option>
                {item.states.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => setDialog('edit')}>
              {t('Edit')}
            </button>
            <button className={btn} data-testid="copy-item" onClick={() => s.list('items', 'copy', { id: item.id })}>
              {t('Copy')}
            </button>
            <button className={btn} data-testid="send-item" onClick={() => setDialog('send')}>
              {t('Send')}
            </button>
            <button className={btnDanger} onClick={() => setDialog('delete')}>
              {t('Delete')}
            </button>
          </div>
        </div>
      )}
      {dialog === 'edit' && <ItemDialog s={s} item={item} onClose={() => setDialog(null)} />}
      {dialog === 'send' && <SendDialog s={s} item={item} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <FormDialog
          title={t('Delete item')}
          submitLabel={t('Delete')}
          danger
          onClose={() => setDialog(null)}
          run={() => s.list('items', 'remove', { id: item.id })}
        >
          <p className="text-sm">
            {t('Delete {name}? This cannot be undone.', { name: item.name })}
          </p>
        </FormDialog>
      )}
    </div>
  );
}

export function Inventory({ s }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={t('Inventory')}>
      <h2 className={heading}>{t('Inventory')}</h2>
      <div className="flex flex-col gap-2">
        {s.sheet.items.map((item) => (
          <ItemCard key={item.id} s={s} item={item} />
        ))}
        <button className={btn} data-testid="add-item" onClick={() => setAdding(true)}>
          {t('Add item')}
        </button>
      </div>
      {adding && <ItemDialog s={s} item={null} onClose={() => setAdding(false)} />}
    </section>
  );
}
