import { useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';

// Counters (see the README, "Counters"): named clocks of 2 to 20 pips with + and -. The GM makes and edits them and marks pips as Gates
// (gold; a secret one only the GM sees, dashed); reaching a Gate that is not secret is told in the chat.
const PIPS_MIN = 2;
const PIPS_MAX = 20;
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

export function Counters({ s }) {
  const t = useT();
  const { identity, toast } = useApp();
  const gm = identity?.role === 'gm';
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // a counter, or 'new'

  useEffect(() => {
    let live = true;
    call('counter:list', { characterId: s.characterId }).then((r) => live && r.ok && setList(r.counters));
    const onUpdate = (p) => p.characterId === s.characterId && setList(p.counters);
    socket.on('counters:updated', onUpdate);
    return () => {
      live = false;
      socket.off('counters:updated', onUpdate);
    };
  }, [s.characterId]);

  const step = async (id, by) => {
    const r = await call('counter:step', { id, by });
    if (!r.ok) toast(r.error);
  };

  if (!gm && !list.length) return null;
  return (
    <section aria-label={t('Counters')} data-testid="counters">
      <div className="mb-2 flex items-center">
        <h2 className={`${heading} mb-0 flex-1`}>{t('Counters')}</h2>
        {gm && (
          <button className={`${btn} min-h-9 px-3`} data-testid="counter-add" onClick={() => setEditing('new')}>
            {t('Add')}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3" data-testid="counter" data-name={c.name} data-value={c.value}>
            <div className="mb-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
              <span className="text-sm opacity-70" data-testid="counter-value">
                {c.value} / {c.pips}
              </span>
              {gm && (
                <button className={`${btn} min-h-8 px-2 text-xs`} data-testid="counter-edit" onClick={() => setEditing(c)}>
                  {t('Edit')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className={`${btn} min-h-9 px-3`} aria-label={t('Less')} data-testid="counter-minus" disabled={c.value <= 0} onClick={() => step(c.id, -1)}>
                -
              </button>
              <div className="flex flex-1 flex-wrap gap-1">
                {Array.from({ length: c.pips }, (_, i) => {
                  const pip = i + 1;
                  const gate = c.gates.find((g) => g.pip === pip);
                  return (
                    <span
                      key={pip}
                      title={gate ? `${gate.name}${gate.text ? `: ${gate.text}` : ''}` : undefined}
                      data-testid="counter-pip"
                      data-filled={pip <= c.value}
                      data-gate={gate ? (gate.secret ? 'secret' : 'open') : undefined}
                      className={`h-5 w-5 rounded-full border-2 ${pip <= c.value ? 'bg-violet-500' : 'bg-black/30'} ${
                        gate ? (gate.secret ? 'border-dashed border-amber-400' : 'border-amber-400') : 'border-white/25'
                      }`}
                    />
                  );
                })}
              </div>
              <button className={`${btn} min-h-9 px-3`} aria-label={t('More')} data-testid="counter-plus" disabled={c.value >= c.pips} onClick={() => step(c.id, 1)}>
                +
              </button>
            </div>
            {c.gates.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-xs opacity-80">
                {c.gates.map((g) => (
                  <li key={g.pip} data-testid="counter-gate">
                    <span className="font-semibold text-amber-300">
                      {g.pip}. {g.name}
                    </span>
                    {g.secret && <span className="opacity-60"> ({t('secret')})</span>}
                    {g.text && <span>: {g.text}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {!list.length && <p className="text-sm opacity-60">{t('No counters yet.')}</p>}
      </div>
      {editing && <CounterDialog characterId={s.characterId} counter={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

// The GM's editor: name, pips, and the Gates (a pip, a name, a text, secret or not).
function CounterDialog({ characterId, counter, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [name, setName] = useState(counter?.name ?? '');
  const [pips, setPips] = useState(counter?.pips ?? 6);
  const [gates, setGates] = useState(counter?.gates ?? []);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    const r = counter
      ? await call('counter:update', { id: counter.id, name, pips, gates })
      : await (async () => {
          const made = await call('counter:create', { characterId, name, pips });
          if (!made.ok || !gates.length) return made;
          return call('counter:update', { id: made.id, gates });
        })();
    if (!r.ok) return toast(r.error);
    onClose();
  }

  const free = Array.from({ length: pips }, (_, i) => i + 1).find((p) => !gates.some((g) => g.pip === p));
  const setGate = (i, patch) => setGates((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <Dialog title={counter ? t('Edit counter') : t('New counter')}>
      <div className="flex flex-col gap-3" data-testid="counter-dialog">
        <label className="flex flex-col gap-1 text-sm">
          {t('Name')}
          <input className={input} value={name} maxLength={60} data-testid="counter-name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('Pips')}
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={PIPS_MIN}
            max={PIPS_MAX}
            value={pips}
            data-testid="counter-pips"
            onChange={(e) => setPips(Math.min(PIPS_MAX, Math.max(PIPS_MIN, Number(e.target.value) || PIPS_MIN)))}
          />
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="flex-1 text-sm uppercase tracking-wide opacity-60">{t('Gates')}</span>
            <button className={`${btn} min-h-9 px-3`} disabled={!free} data-testid="gate-add" onClick={() => setGates((list) => [...list, { pip: free, name: '', text: '', secret: false }])}>
              {t('Add a Gate')}
            </button>
          </div>
          {gates.map((g, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-black/25 p-2" data-testid="gate-row">
              <div className="flex gap-2">
                <label className="flex w-20 flex-col gap-1 text-xs">
                  {t('Pip')}
                  <select className={input} value={g.pip} data-testid="gate-pip" onChange={(e) => setGate(i, { pip: Number(e.target.value) })}>
                    {Array.from({ length: pips }, (_, k) => k + 1)
                      .filter((p) => p === g.pip || !gates.some((x) => x.pip === p))
                      .map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs">
                  {t('Name')}
                  <input className={input} value={g.name} maxLength={60} data-testid="gate-name" onChange={(e) => setGate(i, { name: e.target.value })} />
                </label>
              </div>
              <textarea className={input} rows={2} maxLength={500} placeholder={t('What happens (optional)')} value={g.text} data-testid="gate-text" onChange={(e) => setGate(i, { text: e.target.value })} />
              <div className="flex items-center">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={g.secret} data-testid="gate-secret" onChange={(e) => setGate(i, { secret: e.target.checked })} />
                  {t('Secret from the player')}
                </label>
                <button className={`${btn} min-h-9 px-3`} data-testid="gate-remove" onClick={() => setGates((list) => list.filter((_, j) => j !== i))}>
                  {t('Remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {counter &&
            (confirm ? (
              <button
                className={btnDanger}
                data-testid="counter-delete-confirm"
                onClick={async () => {
                  const r = await call('counter:delete', { id: counter.id });
                  if (!r.ok) return toast(r.error);
                  onClose();
                }}
              >
                {t('Delete for good')}
              </button>
            ) : (
              <button className={btn} data-testid="counter-delete" onClick={() => setConfirm(true)}>
                {t('Delete')}
              </button>
            ))}
          <div className="flex-1" />
          <button className={btn} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className={btnPrimary} disabled={!name.trim() || gates.some((g) => !g.name.trim())} data-testid="counter-save" onClick={save}>
            {t('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
