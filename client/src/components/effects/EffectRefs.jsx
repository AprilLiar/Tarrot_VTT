import { useState } from 'react';
import { btn } from '../Dialog.jsx';
import { MAX_LIST } from '../../../../shared/arcane.js';
import { useEffectLibrary } from './useEffectLibrary.js';
import { useOwnEffects } from './ownEffects.js';
import { useT } from '../../i18n.jsx';

const select = 'min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-2 text-base';

// Effects that a weapon, an Enhancement or a Stance band puts on somebody: [{ id, to: 'target' | 'self' }].
export function EffectRefs({ value, onChange, title, selfOnly = false }) {
  const t = useT();
  const globals = useEffectLibrary();
  const own = useOwnEffects();
  const lib = [...globals.map((e) => ({ ...e, origin: 'global' })), ...own.map((e) => ({ ...e, origin: 'character' }))];
  const [pick, setPick] = useState('');
  const chosen = pick || lib[0]?.id || '';
  return (
    <div className="flex flex-col gap-1 text-sm">
      {title}
      <div className="flex flex-col gap-2">
        {value.map((r, i) => {
          const e = lib.find((x) => x.id === r.id);
          return (
            <div key={`${r.id}:${r.to}`} className="flex items-center gap-2 rounded-lg bg-white/5 p-2" data-testid="effect-ref" data-id={r.id}>
              <span className="min-w-0 flex-1 truncate font-medium">{e?.name ?? t('(missing Effect)')}</span>
              {!selfOnly && (
                <button type="button" className={`${btn} min-h-9 px-3 text-xs`} data-testid="effect-ref-to" onClick={() => onChange(value.map((x, j) => (j === i ? { ...x, to: x.to === 'self' ? 'target' : 'self' } : x)))}>
                  {r.to === 'self' ? t('On the user') : t('On the targets')}
                </button>
              )}
              <button type="button" className="h-8 w-8 rounded-full bg-white/10" aria-label={t('Remove')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                x
              </button>
            </div>
          );
        })}
      </div>
      {value.length < MAX_LIST && lib.length > 0 && (
        <div className="flex gap-2">
          <select className={select} aria-label={t('Effect')} data-testid="effect-ref-pick" value={chosen} onChange={(e) => setPick(e.target.value)}>
            {lib.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="button" className={btn} data-testid="effect-ref-add" onClick={() => !value.some((r) => r.id === chosen) && onChange([...value, { id: chosen, to: selfOnly ? 'self' : 'target' }])}>
            {t('Add Effect')}
          </button>
        </div>
      )}
      {lib.length === 0 && <p className="text-xs opacity-50">{t('No Effects exist yet. Make some in the Effects section of the General tab.')}</p>}
    </div>
  );
}
