import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { NumField } from './fields.jsx';
import * as D from '../../../../shared/rules-data.js';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// Shared shell: runs an async action, shows its error inline, closes on success.
export function FormDialog({ title, submitLabel, onClose, run, canSubmit = true, danger, children }) {
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
          if (r?.ok === false) setError(r.error ?? 'Something went wrong.');
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
            Cancel
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
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input className={input} value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description
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
  const [name, setName] = useState(feature?.name ?? '');
  const [description, setDescription] = useState(feature?.description ?? '');
  return (
    <FormDialog
      title={feature ? 'Edit feature' : 'New feature'}
      submitLabel={feature ? 'Save' : 'Add'}
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
          Delete feature
        </button>
      )}
    </FormDialog>
  );
}

export function Features({ s }) {
  const [dialog, setDialog] = useState(null); // null | 'new' | feature
  return (
    <section aria-label="Features">
      <h2 className={heading}>Features</h2>
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
          Add feature
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
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [maxUses, setMaxUses] = useState(String(item?.uses.max ?? 1));
  const [states, setStates] = useState(item?.states ?? []);
  const [newState, setNewState] = useState('');
  const max = Number(maxUses);
  const validMax = Number.isInteger(max) && max >= 1 && max <= D.ITEM_USES_MAX;

  function addState() {
    const v = newState.trim();
    if (v && !states.includes(v)) setStates([...states, v]);
    setNewState('');
  }

  return (
    <FormDialog
      title={item ? 'Edit item' : 'New item'}
      submitLabel={item ? 'Save' : 'Add'}
      onClose={onClose}
      canSubmit={name.trim().length > 0 && validMax}
      run={() =>
        item
          ? s.list('items', 'update', { id: item.id, name, description, usesMax: max, states })
          : s.list('items', 'add', { name, description, usesMax: max })
      }
    >
      <TextInputs name={name} setName={setName} description={description} setDescription={setDescription} />
      <label className="flex flex-col gap-1 text-sm">
        Max uses (1 to {D.ITEM_USES_MAX})
        <input className={input} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
      </label>
      {item && (
        <div className="flex flex-col gap-2 text-sm">
          State options
          <div className="flex flex-wrap gap-2">
            {states.map((st) => (
              <span key={st} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1">
                {st}
                <button
                  type="button"
                  aria-label={`Remove ${st}`}
                  className="min-h-8 min-w-8 rounded-full active:bg-white/20"
                  onClick={() => setStates(states.filter((x) => x !== st))}
                >
                  x
                </button>
              </span>
            ))}
            {states.length === 0 && <span className="opacity-50">None yet</span>}
          </div>
          <div className="flex gap-2">
            <input
              className={input}
              placeholder="New state"
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
              Add
            </button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

function SendDialog({ s, item, onClose }) {
  const { identity, pcs, roster } = useApp();
  const isGm = identity.role === 'gm';
  const targets = isGm
    ? (roster?.characters ?? []).filter((c) => c.id !== s.characterId).map((c) => ({ id: c.id, name: c.name, type: c.type }))
    : pcs.filter((c) => c.id !== s.characterId).map((c) => ({ id: c.id, name: c.name, type: 'pc' }));
  const [to, setTo] = useState(null);

  return (
    <FormDialog
      title={`${isGm ? 'Give' : 'Offer'} ${item.name}`}
      submitLabel={isGm ? 'Give' : 'Send offer'}
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
        <p className="text-sm opacity-70">The other player must accept before the item moves.</p>
      )}
      {targets.length === 0 && <p className="text-sm opacity-60">Nobody to send it to.</p>}
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto" role="radiogroup" aria-label="Send to">
        {targets.map((t) => (
          <button
            type="button"
            key={t.id}
            role="radio"
            aria-checked={to === t.id}
            className={`${btn} flex justify-between ${to === t.id ? 'ring-2 ring-violet-500' : ''}`}
            onClick={() => setTo(t.id)}
          >
            <span className="truncate">{t.name}</span>
            <span className="text-xs opacity-60">{t.type.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </FormDialog>
  );
}

function ItemCard({ s, item }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'edit' | 'send' | 'delete'
  const empty = item.uses.current === 0;

  return (
    <div className={card} data-testid="item">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className={`truncate font-medium ${empty ? 'opacity-50' : ''}`}>{item.name}</span>
        <span className="text-sm opacity-70">
          {item.uses.current}/{item.uses.max}
          {empty ? ' (empty)' : ''}
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
              Use
            </button>
            <span className="opacity-60">Uses</span>
            <div className="w-14">
              <NumField
                label={`${item.name} uses`}
                value={item.uses.current}
                min={0}
                max={item.uses.max}
                onCommit={(n) => s.list('items', 'update', { id: item.id, usesCurrent: n })}
              />
            </div>
          </div>
          {item.states.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              State
              <select
                className={`${input} flex-1`}
                value={item.state}
                onChange={(e) => s.list('items', 'update', { id: item.id, state: e.target.value })}
              >
                <option value="">(none)</option>
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
              Edit
            </button>
            <button className={btn} data-testid="copy-item" onClick={() => s.list('items', 'copy', { id: item.id })}>
              Copy
            </button>
            <button className={btn} data-testid="send-item" onClick={() => setDialog('send')}>
              Send
            </button>
            <button className={btnDanger} onClick={() => setDialog('delete')}>
              Delete
            </button>
          </div>
        </div>
      )}
      {dialog === 'edit' && <ItemDialog s={s} item={item} onClose={() => setDialog(null)} />}
      {dialog === 'send' && <SendDialog s={s} item={item} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <FormDialog
          title="Delete item"
          submitLabel="Delete"
          danger
          onClose={() => setDialog(null)}
          run={() => s.list('items', 'remove', { id: item.id })}
        >
          <p className="text-sm">
            Delete <strong>{item.name}</strong>? This cannot be undone.
          </p>
        </FormDialog>
      )}
    </div>
  );
}

export function Inventory({ s }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label="Inventory">
      <h2 className={heading}>Inventory</h2>
      <div className="flex flex-col gap-2">
        {s.sheet.items.map((item) => (
          <ItemCard key={item.id} s={s} item={item} />
        ))}
        <button className={btn} data-testid="add-item" onClick={() => setAdding(true)}>
          Add item
        </button>
      </div>
      {adding && <ItemDialog s={s} item={null} onClose={() => setAdding(false)} />}
    </section>
  );
}
