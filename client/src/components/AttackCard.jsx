import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import Dialog, { btn, btnPrimary, btnDanger } from './Dialog.jsx';
import { IntInput, isWholeNumber } from './sheet/fields.jsx';
import { computeTarget, hitLabel, DAMAGE_KINDS, DEFAULT_CRIT } from '../../../shared/damage.js';
import { useT } from '../i18n.jsx';
import { STATUSES } from '../../../shared/rules-data.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const field = 'flex flex-col gap-1 text-sm';
const select = 'min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-2 text-base';

// GM only. Attacks wait here until the GM confirms them on a card. Mounted once, in the top-level shell.
export function AttackInbox() {
  const t = useT();
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
          {t('Attacks waiting: {n}', { n: attacks.length })}
        </button>
      )}
      {current && <AttackCard key={current.id} attack={current} onClose={() => setOpen(null)} />}
    </>
  );
}

// The card is deliberately small: the GM decides the Total, the Base damage, the damage type, the AP
// cost and any statuses (all prefilled from the weapon and Enhancements the player chose). The natural roll, the critical range, the targets (chosen by the player) and
// each target's Defence are automatic, and the outcome per target is shown as it will be applied.
function AttackCard({ attack, onClose }) {
  const t = useT();
  const { toast } = useApp();
  const [total, setTotal] = useState(String(attack.roll.total));
  const [base, setBase] = useState(String(attack.base));
  const [kind, setKind] = useState(attack.kind);
  const [ap, setAp] = useState(String(attack.ap));
  const [statuses, setStatuses] = useState(() => attack.statuses.map((x) => ({ key: x.key, stacks: x.stacks }))); // [{ key, stacks }]
  const [info, setInfo] = useState([]); // what the server knows about each target
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    call('attack:targets', { tokenIds: attack.targets }).then((r) => {
      if (alive && r.ok) setInfo(r.targets);
    });
    return () => {
      alive = false;
    };
  }, [attack.id, attack.targets]);

  const num = (v) => (isWholeNumber(v) ? Number(v) : null);
  const valid = num(total) != null && num(base) != null && num(ap) != null && info.length > 0;

  const results = useMemo(
    () =>
      info.map((tg) => {
        if (num(total) == null || num(base) == null) return null;
        return computeTarget({
          total: num(total),
          natural: attack.roll.natural,
          critThreshold: DEFAULT_CRIT,
          defence: tg.defence[attack.defenceKind],
          base: num(base),
          kind,
          resistance: tg.resistances?.[kind],
          override: null,
        });
      }),
    [info, total, base, kind, attack.roll.natural, attack.defenceKind], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function apply() {
    setBusy(true);
    const r = await call('attack:apply', { id: attack.id, total: num(total), base: num(base), kind, ap: num(ap), statuses });
    setBusy(false);
    if (!r.ok) toast(r.error);
  }

  async function discard() {
    const r = await call('attack:cancel', { id: attack.id });
    if (!r.ok) toast(r.error);
  }

  return (
    <Dialog title={t('{name} attacks with {weapon}', { name: attack.characterName, weapon: attack.weaponName })} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="attack-card">
        <div className="text-sm opacity-80" data-testid="attack-roll-info">
          {t('Rolled {total} (natural {natural}) against {label}', { total: attack.roll.total, natural: attack.roll.natural, label: { t: attack.roll.against?.label } })}
        </div>

        {attack.enhancements.length > 0 && (
          <div className="text-sm opacity-80" data-testid="attack-enhancements">
            {t('Enhancements: {list}', { list: attack.enhancements.map((e) => (e.count > 1 ? `${e.name} x${e.count}` : e.name)).join(', ') })}
          </div>
        )}
        {attack.stance && (
          <div className="text-sm opacity-80" data-testid="attack-stance">
            {t('Stance {name}: rolled {total}, band {band}', { name: attack.stance.name, total: attack.stance.total, band: t(attack.stance.band) })}
          </div>
        )}
        {attack.unique.map((u, i) => (
          <div key={i} className="rounded-lg bg-white/5 p-2 text-sm" data-testid="attack-unique">
            <span className="font-medium">{u.name}</span> ({u.source}): {u.text}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            {t('Total')}
            <IntInput label={t('Attack total')} value={total} onChange={setTotal} />
          </label>
          <label className={field}>
            {t('Base damage')}
            <IntInput label={t('Base damage')} value={base} onChange={setBase} />
          </label>
          <label className={field}>
            {t('Damage type')}
            <select className={select} aria-label={t('Damage type')} data-testid="attack-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DAMAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === 'true' ? t('True (ignores resistances)') : t(cap(k))}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            {t('AP cost')}
            <IntInput label={t('AP cost')} value={ap} onChange={setAp} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statuses.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-sm">
              {t(STATUSES.find((x) => x.key === s.key)?.name)}
              {STATUSES.find((x) => x.key === s.key)?.stackable && (
                <input
                  type="number"
                  min="1"
                  max="10"
                  aria-label={t('{name} stacks', { name: { t: STATUSES.find((x) => x.key === s.key)?.name } })}
                  className="w-12 rounded bg-black/40 px-1 text-center"
                  value={s.stacks}
                  onChange={(e) => setStatuses((l) => l.map((x, j) => (j === i ? { ...x, stacks: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } : x)))}
                />
              )}
              <button className="h-7 w-7 rounded-full bg-white/10" aria-label={t('Remove {name}', { name: { t: STATUSES.find((x) => x.key === s.key)?.name } })} onClick={() => setStatuses((l) => l.filter((_, j) => j !== i))}>
                x
              </button>
            </span>
          ))}
          <select
            className="min-h-9 rounded-lg border border-white/20 bg-black/30 px-2 text-sm"
            aria-label={t('Add a status')}
            data-testid="attack-add-status"
            value=""
            onChange={(e) => e.target.value && !statuses.some((s) => s.key === e.target.value) && setStatuses((l) => [...l, { key: e.target.value, stacks: 1 }])}
          >
            <option value="">{t('Add status...')}</option>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.name)}
              </option>
            ))}
          </select>
        </div>

        <ul className="flex flex-col gap-1 text-sm" data-testid="attack-targets">
          {info.map((tg, i) => {
            const res = results[i];
            return (
              <li key={tg.tokenId} className="rounded-lg bg-white/5 p-2" data-testid="attack-target" data-name={tg.name}>
                <span className="font-medium">{tg.name}</span>{' '}
                <span className="opacity-60">
                  ({t(cap(attack.defenceKind) + ' Defence')} {tg.defence[attack.defenceKind]}
                  {tg.sheet ? '' : `, ${t('no sheet')}`})
                </span>
                {res && (
                  <div data-testid="attack-outcome">
                    <span className={res.hit ? 'text-amber-300' : 'opacity-70'}>{hitLabel(res, t)}</span>
                    {res.hit && (
                      <>
                        {': '}
                        {res.heal ? t('heals {n}', { n: res.heal }) : t('{n} damage', { n: res.damage })}
                        {tg.hp
                          ? `. ${t('HP {from} to {to}', { from: tg.hp.current, to: Math.max(0, Math.min(tg.hp.max, tg.hp.current - res.damage + res.heal)) })}`
                          : ''}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {info.length === 0 && <li className="text-amber-300">{t('None of the targets is on the map any more.')}</li>}
        </ul>

        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnDanger} data-testid="attack-discard" onClick={discard}>
            {t('Discard')}
          </button>
          <button className={btn} data-testid="attack-later" onClick={onClose}>
            {t('Later')}
          </button>
          <button className={btnPrimary} data-testid="attack-apply" disabled={!valid || busy} onClick={apply}>
            {t('Apply')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
