import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import { NumField } from './fields.jsx';
import { FormDialog } from './SheetLists.jsx';
import { btn } from '../Dialog.jsx';
import { restMax, restSpendMax } from '../../../../shared/rest.js';

// The square button beside a vitals bar (HP, Rest Points, Blood Oxidization): one size for all, so the bars line up.
export const square = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg';

// Is the character in a running combat (from the stage everyone gets)?
export function useInCombat(characterId) {
  const { stage } = useApp();
  return !!stage?.battle?.combat?.order?.some((e) => e.ownerKind === 'character' && e.ownerId === characterId);
}

// Rest Points under the HP (see the README, "Rests"): current / maximum (the Strength score, at least 1), and the rest button.
export function RestBar({ s }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const max = restMax(s.sheet);
  const cur = s.sheet.rest?.current ?? 0;
  const inCombat = useInCombat(s.characterId);
  return (
    <div className="mt-2 flex items-center gap-2" data-testid="rest-block" data-current={cur} data-max={max}>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wide opacity-60">{t('Rest Points')}</div>
        <div className="relative h-7 overflow-hidden rounded-md bg-teal-950/60">
          <div className="absolute inset-y-0 left-0 bg-teal-600/80 transition-[width] duration-300" style={{ width: `${(cur / max) * 100}%` }} />
          <div className="relative flex h-full items-center justify-center gap-1 text-sm font-semibold">
            <div className="w-10">
              <NumField label={t('Rest Points')} testId="rest-current" value={cur} min={0} max={max} onCommit={(n) => s.set('rest.current', n)} className="text-sm" />
            </div>
            <span className="opacity-70">/ {max}</span>
          </div>
        </div>
      </div>
      <button
        className={`${square} self-end bg-teal-800 active:bg-teal-700 disabled:opacity-40`}
        data-testid="rest-open"
        disabled={inCombat}
        aria-label={t('Rest')}
        title={inCombat ? t('No resting in combat.') : t('Rest: a Short Rest or a Long Rest.')}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
          <circle cx="7" cy="11" r="1.6" />
        </svg>
      </button>
      {open && <RestDialog s={s} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RestDialog({ s, onClose }) {
  const t = useT();
  const [kind, setKind] = useState('short');
  const most = restSpendMax(s.sheet);
  const [spend, setSpend] = useState(most);
  return (
    <FormDialog title={t('Rest')} submitLabel={t('Rest')} onClose={onClose} run={() => call('rest:take', { characterId: s.characterId, kind, spend })}>
      <div className="flex gap-2" role="radiogroup" aria-label={t('Rest')}>
        {[
          ['short', t('Short Rest')],
          ['long', t('Long Rest')],
        ].map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} data-testid={`rest-kind-${k}`} className={`${btn} flex-1 ${kind === k ? 'ring-2 ring-teal-400' : ''}`} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {t('Rest Points to spend (1 RP heals 1 HP)')}
        <div className="flex items-center gap-3">
          <input type="range" className="flex-1" min={0} max={most} value={spend} data-testid="rest-spend" onChange={(e) => setSpend(Number(e.target.value))} />
          <span className="w-10 text-right font-semibold" data-testid="rest-spend-value">
            {spend}
          </span>
        </div>
      </label>
      <p className="text-sm opacity-80" data-testid="rest-summary">
        {kind === 'long'
          ? t('Heals {n} HP; 1 Rest Point comes back at the end of the Long Rest.', { n: spend })
          : t('Heals {n} HP.', { n: spend })}
      </p>
    </FormDialog>
  );
}
