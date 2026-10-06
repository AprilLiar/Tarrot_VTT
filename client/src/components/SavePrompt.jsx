import { useEffect, useState } from 'react';
import { socket } from '../socket.js';
import { call, useApp } from '../AppContext.jsx';
import Dialog, { btn, btnPrimary } from './Dialog.jsx';
import { DURATION_LABELS } from '../../../shared/statuses.js';
import * as D from '../../../shared/rules-data.js';
import { useT } from '../i18n.jsx';

// The Saves that statuses ask for (server/saves.js). The player of the character a status is put on gets a prompt: the Save, the DC and
// the modifiers they already have, and how much AP to spend for Advantage (0 at first). The GM sees what is waiting and can roll for
// a player who is not there (no AP is spent then). Mounted once, in the top bar's shell.
export function SaveInbox() {
  const t = useT();
  const { identity, toast } = useApp();
  const gm = identity?.role === 'gm';
  const [saves, setSaves] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      call('save:list').then((r) => {
        if (alive && r.ok) setSaves(r.saves);
      });
    const onAsk = (a) => {
      setSaves((list) => [...list.filter((x) => x.id !== a.id), a]);
      if (!gm) setOpen(a.id); // a player's prompt pops up at once
    };
    const onResolved = ({ id }) => {
      setSaves((list) => list.filter((x) => x.id !== id));
      setOpen((cur) => (cur === id ? null : cur));
    };
    load();
    socket.on('connect', load);
    socket.on('save:ask', onAsk);
    if (gm) socket.on('save:pending', onAsk);
    socket.on('save:resolved', onResolved);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('save:ask', onAsk);
      socket.off('save:pending', onAsk);
      socket.off('save:resolved', onResolved);
    };
  }, [gm]);

  const current = saves.find((x) => x.id === open);
  return (
    <>
      {saves.length > 0 && !current && (
        <button className="fixed bottom-32 left-3 z-40 rounded-full bg-sky-700 px-4 py-2 text-sm font-medium shadow-lg" data-testid="save-badge" onClick={() => setOpen(saves[0].id)}>
          {t('Saves waiting: {n}', { n: saves.length })}
        </button>
      )}
      {current && <SaveDialog key={current.id} ask={current} gm={gm} others={saves} onPick={setOpen} onClose={() => setOpen(null)} toast={toast} />}
    </>
  );
}

function SaveDialog({ ask, gm, others, onPick, onClose, toast }) {
  const t = useT();
  const [ap, setAp] = useState(0);
  const [busy, setBusy] = useState(false);
  const info = D.STATUSES.find((x) => x.key === ask.apply.key);
  const net = Math.max(-10, Math.min(10, ask.net + ap));
  const saveName = `${ask.save === 'mental' ? 'Mental' : 'Physical'} Save`;

  async function answer() {
    setBusy(true);
    const r = await call('save:answer', { id: ask.id, ap: gm ? 0 : ap });
    setBusy(false);
    if (!r.ok) toast(r.error);
  }

  return (
    <Dialog title={gm ? t('Save for {name}', { name: ask.name }) : t('Save against a status')} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="save-prompt">
        <div className="text-sm">
          <span className="font-semibold">{t(info.name)}</span>
          {info.stackable ? ` ${ask.apply.stacks}` : ''} ({t(DURATION_LABELS[ask.apply.duration])})
          {ask.source ? <span className="opacity-70"> - {ask.source}</span> : null}
        </div>
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-60">{t('Save')}</div>
            <div className="text-xl font-semibold" data-testid="save-kind">
              {t(saveName)}
            </div>
          </div>
          <div className="text-lg opacity-60">vs</div>
          <div>
            <div className="text-xs uppercase tracking-wide opacity-60">{t('DC')}</div>
            <div className="text-4xl font-bold" data-testid="save-dc">
              {ask.dc}
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-sm" data-testid="save-modifiers">
          <div className="text-xs uppercase tracking-wide opacity-60">{t('Modifiers')}</div>
          <div>{ask.expression}</div>
          {ask.sources.length > 0 ? (
            <ul className="mt-1 text-xs opacity-80">
              {ask.sources.map((x, i) => (
                <li key={i}>
                  {x.levels > 0 ? t('Advantage {n}', { n: x.levels }) : t('Disadvantage {n}', { n: -x.levels })} ({t(x.label)})
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs opacity-60">{t('No Advantage or Disadvantage yet.')}</div>
          )}
        </div>
        {!gm && (
          <div className="flex flex-col gap-1 text-sm">
            {t('AP to spend for Advantage (1 AP = 1 level)')}
            <div className="flex items-center gap-3">
              <button className={`${btn} w-12`} aria-label={t('Less AP')} disabled={ap <= 0} onClick={() => setAp(ap - 1)}>
                -
              </button>
              <span className="w-10 text-center text-2xl font-semibold" data-testid="save-ap">
                {ap}
              </span>
              <button className={`${btn} w-12`} aria-label={t('More AP')} disabled={ap >= ask.apMax} onClick={() => setAp(ap + 1)}>
                +
              </button>
              <span className="text-xs opacity-60">{t('You have {n} AP.', { n: ask.apMax })}</span>
            </div>
            <div className="text-xs opacity-70" data-testid="save-result-net">
              {net === 0 ? t('The Save is rolled normally.') : net > 0 ? t('Advantage {n}', { n: net }) : t('Disadvantage {n}', { n: -net })}
            </div>
          </div>
        )}
        {gm && <p className="text-xs opacity-60">{t('Rolled for the player: no AP is spent.')}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {others.length > 1 && (
            <select className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-2 text-sm" aria-label={t('Other Saves')} value="" onChange={(e) => e.target.value && onPick(Number(e.target.value))}>
              <option value="">{t('Other Saves')}</option>
              {others.filter((x) => x.id !== ask.id).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}: {t(D.STATUSES.find((s) => s.key === x.apply.key).name)}
                </option>
              ))}
            </select>
          )}
          <button className={btn} data-testid="save-later" onClick={onClose}>
            {t('Later')}
          </button>
          <button className={btnPrimary} data-testid="save-roll" disabled={busy} onClick={answer}>
            {gm ? t('Roll for them') : t('Roll Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
