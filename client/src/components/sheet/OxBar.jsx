import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import { square } from './RestBar.jsx';
import { BLEED_AP, BLEED_HP, oxLimit, oxOf, oxState } from '../../../../shared/oxidization.js';

// Blood Oxidization as a meter under the HP (see the README, "Blood Oxidization"): the current Ox against the Oxidization Limit (the
// Strength score, at least 1), what it does now, and Let blood when there is any.
export function OxBar({ s }) {
  const t = useT();
  const { toast } = useApp();
  const ox = oxOf(s.sheet);
  const limit = oxLimit(s.sheet);
  const state = oxState(s.sheet);
  const fill = Math.min(1, ox / limit);
  const effect =
    state === 'dead'
      ? t('Dead: dissolved in acid.')
      : state === 'coma'
        ? t('Over the limit: a deep coma.')
        : ox >= 2
          ? t('Slowed; Disadvantage {n} on Checks and Attacks.', { n: ox - 1 })
          : ox === 1
            ? t('Disadvantage on Checks.')
            : t('No Blood Oxidization.');
  async function bleed() {
    const r = await call('ox:bleed', { characterId: s.characterId });
    if (!r.ok) toast(r.error);
  }
  return (
    <div className="mt-2" data-testid="ox-block" data-ox={ox} data-limit={limit} data-state={state}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide opacity-60">{t('Blood Oxidization')}</div>
          <div className="relative h-7 overflow-hidden rounded-md bg-lime-950/50">
            <div className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${state === 'ok' ? 'bg-lime-500/70' : 'bg-red-600'}`} style={{ width: `${fill * 100}%` }} />
            <span className="relative flex h-full items-center justify-center text-sm font-semibold" data-testid="ox-value">
              {ox} / {limit}
            </span>
          </div>
        </div>
        {ox > 0 ? (
          <button
            className={`${square} self-end bg-red-800 active:bg-red-700`}
            data-testid="ox-bleed"
            aria-label={t('Let blood')}
            title={t('Let blood: lose {hp} HP to remove 1 Blood Oxidization (1 AP in combat). Not allowed when it would take HP to 0 or below.', { hp: BLEED_HP, ap: BLEED_AP })}
            onClick={bleed}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5c-.4 0-.7.2-.9.5C9.3 6 6 10.6 6 14.5a6 6 0 0 0 12 0c0-3.9-3.3-8.5-5.1-11.5-.2-.3-.5-.5-.9-.5z" />
            </svg>
          </button>
        ) : (
          <span className={`${square} self-end`} aria-hidden="true" />
        )}
      </div>
      <div className={`mt-0.5 text-[11px] ${state === 'ok' ? 'opacity-60' : 'font-semibold text-red-400'}`} data-testid="ox-effect">
        {effect}
      </div>
    </div>
  );
}
