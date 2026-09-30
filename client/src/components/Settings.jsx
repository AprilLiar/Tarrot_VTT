import { useLang, useT, LANGS, LANG_NAMES } from '../i18n.jsx';
import { btn } from './Dialog.jsx';

// Settings live on this device only (browser storage), so they are reached from the picker, before
// anyone has chosen who they are. The first setting is the language.
export default function Settings({ onBack }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4" data-testid="settings">
      <header className="flex items-center gap-3 pt-2">
        <button className={btn} data-testid="settings-back" onClick={onBack}>
          {t('Back')}
        </button>
        <h1 className="text-2xl font-semibold">{t('Settings')}</h1>
      </header>
      <p className="text-sm opacity-70">{t('These settings are saved on this device only.')}</p>
      <section aria-label={t('Language')} className="rounded-xl border border-white/10 bg-white/5 p-3">
        <h2 className="mb-2 text-sm uppercase tracking-wide opacity-60">{t('Language')}</h2>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('Language')}>
          {LANGS.map((code) => (
            <button
              key={code}
              role="radio"
              aria-checked={lang === code}
              data-testid={`lang-${code}`}
              className={`${btn} text-left text-base ${lang === code ? 'ring-2 ring-violet-400' : ''}`}
              onClick={() => setLang(code)}
            >
              {LANG_NAMES[code]}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
