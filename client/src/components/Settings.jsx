import { call, useApp } from '../AppContext.jsx';
import { useLang, useT, LANGS, LANG_NAMES } from '../i18n.jsx';
import { useSetting } from '../lib/settings.js';
import { SETTINGS } from '../../../shared/settings.js';
import { btn } from './Dialog.jsx';

// One setting: a title, its control, and (for the GM only) a button that sends the GM's current value to every device.
// Every setting, now and later, is wrapped in this.
export function SettingRow({ settingKey, title, value, children }) {
  const t = useT();
  const { identity, toast } = useApp();
  async function force() {
    const r = await call('settings:force', { key: settingKey, value });
    toast(r.ok ? t('Sent to everyone.') : r.error);
  }
  return (
    <section aria-label={title} className="rounded-xl border border-white/10 bg-white/5 p-3" data-testid={`setting-${settingKey}`}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm uppercase tracking-wide opacity-60">{title}</h2>
        {identity?.role === 'gm' && (
          <button className={`${btn} min-h-9 px-3 text-xs`} data-testid={`force-${settingKey}`} title={t('Set this for everyone, to the value you have now')} onClick={force}>
            {t('Apply to everyone')}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function LanguageSetting() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <SettingRow settingKey="lang" title={t('Language')} value={lang}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('Language')}>
        {LANGS.map((code) => (
          <button key={code} role="radio" aria-checked={lang === code} data-testid={`lang-${code}`} className={`${btn} text-left text-base ${lang === code ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setLang(code)}>
            {LANG_NAMES[code]}
          </button>
        ))}
      </div>
    </SettingRow>
  );
}

function DeadzoneSetting() {
  const t = useT();
  const [value, setValue] = useSetting('deadzone');
  const { min, max, step } = SETTINGS.deadzone;
  return (
    <SettingRow settingKey="deadzone" title={t('Deadzone of the Area tool')} value={value}>
      <p className="mb-2 text-sm opacity-70">{t('While dragging a new area, the striped Deadzone starts this many times the size of the area away from where you pressed. Letting go inside it cancels the area.')}</p>
      <div className="flex items-center gap-3">
        <input type="range" className="flex-1" min={min} max={max} step={step} value={value} aria-label={t('Deadzone of the Area tool')} data-testid="deadzone-range" onChange={(e) => setValue(Number(e.target.value))} />
        <span className="w-12 text-right font-semibold" data-testid="deadzone-value">
          {value.toFixed(1)}x
        </span>
      </div>
    </SettingRow>
  );
}

// The settings themselves: used on the page of the picker and in the dialog the GM opens from the top bar.
export function SettingsBody() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-70">{t('These settings are saved on this device only.')}</p>
      <LanguageSetting />
      <DeadzoneSetting />
    </div>
  );
}

// Settings live on this device only (browser storage), so they are reached from the picker, before
// anyone has chosen who they are.
export default function Settings({ onBack }) {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4" data-testid="settings">
      <header className="flex items-center gap-3 pt-2">
        <button className={btn} data-testid="settings-back" onClick={onBack}>
          {t('Back')}
        </button>
        <h1 className="text-2xl font-semibold">{t('Settings')}</h1>
      </header>
      <SettingsBody />
    </main>
  );
}
