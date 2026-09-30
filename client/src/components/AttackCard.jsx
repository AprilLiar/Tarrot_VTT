import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import Dialog, { btn, btnPrimary, btnDanger } from './Dialog.jsx';
import { IntInput, isWholeNumber } from './sheet/fields.jsx';
import { computeTarget, DAMAGE_KINDS, DEFAULT_CRIT } from '../../../shared/damage.js';
import { tokensInTemplate } from '../../../shared/templates.js';
import { STATUSES } from '../../../shared/rules-data.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const field = 'flex flex-col gap-1 text-sm';
const select = 'min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-2 text-base';

// GM only. Attacks wait here until the GM confirms them on a card: every number of the roll and
// of the damage can be changed before it is applied. Mounted once, in the top-level shell.
export function AttackInbox() {
  const [attacks, setAttacks] = useState([]);
  const [open, setOpen] = useState(null); // id of the attack whose card is open

  useEffect(() => {
    let alive = true;
    const load = () =>
      call('attack:list').then((r) => {
        if (alive && r.ok) setAttacks(r.attacks);
      });
    const onPending = (a) => {
      setAttacks((list) => [...list.filter((x) => x.id !== a.id), a]);
      setOpen(a.id); // a new attack pops up at once
    };
    const onResolved = ({ id }) => {
      setAttacks((list) => list.filter((x) => x.id !== id));
      setOpen((cur) => (cur === id ? null : cur));
    };
    load();
    socket.on('connect', load);
    socket.on('attack:pending', onPending);
    socket.on('attack:resolved', onResolved);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('attack:pending', onPending);
      socket.off('attack:resolved', onResolved);
    };
  }, []);

  const current = attacks.find((a) => a.id === open);
  return (
    <>
      {attacks.length > 0 && !current && (
        <button
          className="fixed bottom-20 left-3 z-40 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium shadow-lg"
          data-testid="attack-badge"
          onClick={() => setOpen(attacks[0].id)}
        >
          Attacks waiting: {attacks.length}
        </button>
      )}
      {current && <AttackCard key={current.id} attack={current} onClose={() => setOpen(null)} />}
    </>
  );
}

function AttackCard({ attack, onClose }) {
  const { stage, toast } = useApp();
  const battle = stage.battle;
  const tokens = battle?.tokens ?? [];
  const [total, setTotal] = useState(String(attack.roll.total));
  const [natural, setNatural] = useState(String(attack.roll.natural));
  const [crit, setCrit] = useState(String(DEFAULT_CRIT));
  const [base, setBase] = useState('1');
  const [kind, setKind] = useState('bludgeoning');
  const [ap, setAp] = useState(String(attack.ap));
  const [exposed, setExposed] = useState(attack.roll.natural === 1);
  const [statuses, setStatuses] = useState([]); // [{ key, stacks }]
  const [rows, setRows] = useState(() =>
    attack.targets.map((tokenId) => ({ tokenId, defenceKind: 'physical', defence: null, override: '' })),
  );
  const [info, setInfo] = useState({}); // tokenId -> what the server knows about the target
  const [busy, setBusy] = useState(false);

  // Fetch what the card needs about any target it has not seen yet.
  const wanted = rows.map((r) => r.tokenId).filter((id) => !(id in info));
  useEffect(() => {
    if (!wanted.length) return;
    let alive = true;
    call('attack:targets', { tokenIds: wanted }).then((r) => {
      if (!alive || !r.ok) return;
      setInfo((cur) => {
        const next = { ...cur };
        for (const id of wanted) next[id] = r.targets.find((t) => t.tokenId === id) ?? null;
        for (const t of r.targets) next[t.tokenId] = t;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [wanted.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (v) => (isWholeNumber(v) ? Number(v) : null);
  const valid = num(total) != null && num(natural) != null && num(crit) != null && num(base) != null && num(ap) != null && rows.length > 0;

  const defenceOf = (row) => {
    if (row.defence != null) return row.defence;
    const t = info[row.tokenId];
    return t?.defence ? t.defence[row.defenceKind] : 0;
  };

  const results = useMemo(
    () =>
      rows.map((row) => {
        const t = info[row.tokenId];
        const override = row.override.trim() === '' ? null : num(row.override);
        if (num(total) == null || num(natural) == null || num(crit) == null || num(base) == null) return null;
        return computeTarget({
          total: num(total),
          natural: num(natural),
          critThreshold: num(crit),
          defence: defenceOf(row),
          base: num(base),
          kind,
          resistance: t?.resistances?.[kind],
          override,
        });
      }),
    [rows, info, total, natural, crit, base, kind], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const patchRow = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addTokens = (list) =>
    setRows((cur) => [
      ...cur,
      ...list.filter((t) => !cur.some((r) => r.tokenId === t.id)).map((t) => ({ tokenId: t.id, defenceKind: 'physical', defence: null, override: '' })),
    ]);

  const fighters = tokens.filter((t) => t.kind !== 'prop');
  const areas = (battle?.marks ?? []).filter((m) => m.kind === 'template');
  const nameOf = (id) => tokens.find((t) => t.id === id)?.name ?? info[id]?.name ?? 'Gone from the map';

  async function apply() {
    setBusy(true);
    const r = await call('attack:apply', {
      id: attack.id,
      total: num(total),
      natural: num(natural),
      critThreshold: num(crit),
      base: num(base),
      kind,
      ap: num(ap),
      exposed,
      statuses,
      targets: rows.map((row) => ({
        tokenId: row.tokenId,
        defenceKind: row.defenceKind,
        defence: defenceOf(row),
        override: row.override.trim() === '' ? null : num(row.override),
      })),
    });
    setBusy(false);
    if (!r.ok) toast(r.error);
  }

  async function discard() {
    const r = await call('attack:cancel', { id: attack.id });
    if (!r.ok) toast(r.error);
  }

  return (
    <Dialog title={`${attack.characterName} attacks (${attack.masteryLabel})`} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="attack-card">
        <div className="rounded-lg bg-white/5 p-2 text-sm" data-testid="attack-roll-info">
          {attack.roll.expression}
          <div className="opacity-70">
            Dice {attack.roll.dice.join(', ')}; natural {attack.roll.natural}; total {attack.roll.total}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className={field}>
            Total
            <IntInput label="Attack total" value={total} onChange={setTotal} />
          </label>
          <label className={field}>
            Natural
            <IntInput label="Natural roll" value={natural} onChange={setNatural} />
          </label>
          <label className={field}>
            Crit at
            <IntInput label="Critical from natural" value={crit} onChange={setCrit} />
          </label>
          <label className={field}>
            Base damage
            <IntInput label="Base damage" value={base} onChange={setBase} />
          </label>
          <label className={`${field} col-span-2`}>
            Damage type
            <select className={select} aria-label="Damage type" data-testid="attack-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DAMAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'true' ? 'True (ignores resistances)' : cap(k)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            AP cost
            <IntInput label="AP cost" value={ap} onChange={setAp} />
          </label>
        </div>

        <div>
          <div className="mb-1 text-sm opacity-70">Statuses added to every target that is hit</div>
          <div className="flex flex-wrap items-center gap-2">
            {statuses.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-sm">
                {STATUSES.find((x) => x.key === s.key)?.name}
                {STATUSES.find((x) => x.key === s.key)?.stackable && (
                  <input
                    type="number"
                    min="1"
                    max="10"
                    aria-label={`${s.key} stacks`}
                    className="w-12 rounded bg-black/40 px-1 text-center"
                    value={s.stacks}
                    onChange={(e) => setStatuses((l) => l.map((x, j) => (j === i ? { ...x, stacks: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } : x)))}
                  />
                )}
                <button className="h-7 w-7 rounded-full bg-white/10" aria-label={`Remove ${s.key}`} onClick={() => setStatuses((l) => l.filter((_, j) => j !== i))}>
                  x
                </button>
              </span>
            ))}
            <select
              className="min-h-9 rounded-lg border border-white/20 bg-black/30 px-2 text-sm"
              aria-label="Add a status"
              data-testid="attack-add-status"
              value=""
              onChange={(e) => e.target.value && !statuses.some((s) => s.key === e.target.value) && setStatuses((l) => [...l, { key: e.target.value, stacks: 1 }])}
            >
              <option value="">Add a status...</option>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm opacity-70">Targets</div>
          <div className="flex flex-col gap-2" data-testid="attack-targets">
            {rows.map((row, i) => {
              const t = info[row.tokenId];
              const res = results[i];
              return (
                <div key={row.tokenId} className="rounded-lg bg-white/5 p-2" data-testid="attack-target" data-name={nameOf(row.tokenId)}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(row.tokenId)}</span>
                    {t && !t.sheet && <span className="text-xs opacity-60">no sheet</span>}
                    <button className="h-8 w-8 rounded-full bg-white/10" aria-label={`Remove ${nameOf(row.tokenId)}`} onClick={() => setRows((l) => l.filter((_, j) => j !== i))}>
                      x
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className={field}>
                      Defence
                      <select
                        className={select}
                        aria-label="Defence used"
                        value={row.defenceKind}
                        onChange={(e) => patchRow(i, { defenceKind: e.target.value, defence: null })}
                      >
                        <option value="physical">Physical</option>
                        <option value="mental">Mental</option>
                      </select>
                    </label>
                    <label className={field}>
                      Value
                      <IntInput
                        label="Defence value"
                        value={String(defenceOf(row))}
                        onChange={(v) => patchRow(i, { defence: isWholeNumber(v) ? Number(v) : row.defence })}
                      />
                    </label>
                    <label className={field}>
                      Set damage
                      <IntInput label="Damage override" value={row.override} onChange={(v) => patchRow(i, { override: v })} />
                    </label>
                  </div>
                  {res && (
                    <div className="mt-2 text-sm" data-testid="attack-outcome">
                      <span className={res.hit ? 'text-amber-300' : 'opacity-70'}>{res.label}</span>
                      {res.hit && (
                        <>
                          {': '}
                          {num(base)}
                          {res.bonus ? ` + ${res.bonus}` : ''} = {res.raw}
                          {res.steps.length ? ` (${res.steps.join(', ')})` : ''}
                          {res.heal ? `, heals ${res.heal}` : `, ${res.damage} damage`}
                          {t?.hp ? `. HP ${t.hp.current} to ${Math.max(0, Math.min(t.hp.max, t.hp.current - res.damage + res.heal))}` : ''}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && <p className="text-sm text-amber-300">Add at least one target.</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="min-h-10 flex-1 rounded-lg border border-white/20 bg-black/30 px-2 text-sm"
              aria-label="Add a target"
              data-testid="attack-add-target"
              value=""
              onChange={(e) => e.target.value && addTokens(fighters.filter((t) => t.id === Number(e.target.value)))}
            >
              <option value="">Add a target...</option>
              {fighters
                .filter((t) => !rows.some((r) => r.tokenId === t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            {areas.length > 0 && (
              <select
                className="min-h-10 flex-1 rounded-lg border border-white/20 bg-black/30 px-2 text-sm"
                aria-label="Add tokens inside an area"
                data-testid="attack-add-area"
                value=""
                onChange={(e) => {
                  const m = areas.find((a) => a.id === Number(e.target.value));
                  if (m) addTokens(tokensInTemplate(m, fighters, battle.grid, battle.aspect));
                }}
              >
                <option value="">Add tokens inside an area...</option>
                {areas.map((m, i) => (
                  <option key={m.id} value={m.id}>
                    {cap(m.shape)} {i + 1} ({m.size} squares)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={exposed} onChange={(e) => setExposed(e.target.checked)} data-testid="attack-exposed" />
          {attack.characterName} gains Exposed 1 (a natural 1)
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnDanger} data-testid="attack-discard" onClick={discard}>
            Discard
          </button>
          <button className={btn} data-testid="attack-later" onClick={onClose}>
            Later
          </button>
          <button className={btnPrimary} data-testid="attack-apply" disabled={!valid || busy} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </Dialog>
  );
}
