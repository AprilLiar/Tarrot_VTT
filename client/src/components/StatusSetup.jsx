import { useT } from '../i18n.jsx';
import { DURATIONS, DURATION_LABELS, DC_MAX, DC_MIN, statusSave } from '../../../shared/statuses.js';

// How a status is set up wherever one is put on somebody: how long it lasts and, when it has a Save, the DC of that Save.
//   apply: { key, stacks, duration, dc }   dc is 'auto' (8 + the source's Experience Modifier + Prime) or a number
const seg = (on) => `min-h-9 flex-1 rounded-md px-2 text-xs ${on ? 'bg-violet-700 text-white' : 'bg-white/10 active:bg-white/20'}`;

export function DurationPicker({ value, onChange, save, testId = 'status-duration' }) {
  const t = useT();
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={t('Duration')} data-testid={testId}>
      {DURATIONS.filter((d) => d !== 'repeated' || save).map((d) => (
        <button key={d} type="button" role="radio" aria-checked={value === d} data-testid={`${testId}-${d}`} className={seg(value === d)} onClick={() => onChange(d)}>
          {t(DURATION_LABELS[d])}
        </button>
      ))}
    </div>
  );
}

export function DcPicker({ value, onChange, testId = 'status-dc' }) {
  const t = useT();
  const manual = value !== 'auto';
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <div className="flex flex-1 gap-1" role="radiogroup" aria-label={t('Difficulty Class')}>
        <button type="button" role="radio" aria-checked={!manual} data-testid={`${testId}-auto`} className={seg(!manual)} title={t('8 + Experience Modifier + Prime')} onClick={() => onChange('auto')}>
          {t('Automatic')}
        </button>
        <button type="button" role="radio" aria-checked={manual} data-testid={`${testId}-manual`} className={seg(manual)} onClick={() => onChange(manual ? value : 10)}>
          {t('Manual')}
        </button>
      </div>
      {manual && (
        <input
          type="number"
          min={DC_MIN}
          max={DC_MAX}
          aria-label={t('DC')}
          data-testid={`${testId}-value`}
          className="w-16 rounded-md bg-black/40 px-1 py-1.5 text-center text-sm"
          value={value}
          onChange={(e) => onChange(Math.max(DC_MIN, Math.min(DC_MAX, Number(e.target.value) || DC_MIN)))}
        />
      )}
    </div>
  );
}

// Both, for one status of a list. A status without a Save has no DC and cannot be Repeated.
export function StatusSetup({ apply, onChange, testId = 'status' }) {
  const t = useT();
  const save = statusSave(apply.key);
  return (
    <div className="mt-1 flex flex-col gap-1">
      <DurationPicker value={apply.duration} save={save} onChange={(duration) => onChange({ ...apply, duration })} testId={`${testId}-duration`} />
      {save && (
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 opacity-70">{t('{save} Save, DC', { save: { t: `${save === 'mental' ? 'Mental' : 'Physical'} Save` } })}</span>
          <div className="min-w-0 flex-1">
            <DcPicker value={apply.dc} onChange={(dc) => onChange({ ...apply, dc })} testId={`${testId}-dc`} />
          </div>
        </div>
      )}
    </div>
  );
}
