import { btnDanger } from '../Dialog.jsx';
import { call } from '../../AppContext.jsx';
import { DURATION_LABELS } from '../../../../shared/effects.js';
import { effectSummary } from './effectText.js';
import { useT } from '../../i18n.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// The Effects running on a character, on its sheet (next to the Statuses): what each does, how long it lasts, its uses.
export function ActiveEffects({ s }) {
  const t = useT();
  const list = s.sheet.effects ?? [];
  return (
    <section aria-label={t('Effects')}>
      <h2 className={heading}>{t('Effects')}</h2>
      <div className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm opacity-60">{t('No Effects running.')}</p>}
        {list.map((e) => (
          <div key={e.id} className={card} data-testid="active-effect" data-name={e.name}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate font-medium">{e.name}</div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs" data-testid="active-effect-duration">
                {t(DURATION_LABELS[e.duration])}
                {e.duration === 'minute' ? ` (${t('{n} rounds left', { n: e.rounds })})` : ''}
              </span>
              <button className={`${btnDanger} min-h-9 px-3`} aria-label={t('Remove {name}', { name: e.name })} data-testid="active-effect-remove" onClick={() => call('effect:remove', { characterId: s.characterId, id: e.id })}>
                x
              </button>
            </div>
            <p className="mt-1 text-sm leading-snug opacity-80">{effectSummary({ ...e, duration: e.duration }, t)}</p>
            {e.description && <p className="mt-1 whitespace-pre-wrap text-xs opacity-60">{e.description}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

