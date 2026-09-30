import { useApp } from '../AppContext.jsx';
import { useT } from '../i18n.jsx';

// Deterministic color per name so the initial badge is stable.
function hue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export function Initial({ name, size = 'h-12 w-12 text-xl' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${size}`}
      style={{ background: `hsl(${hue(name)} 45% 35%)` }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

const card =
  'flex min-h-16 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left active:bg-white/15';

export default function Picker({ onSettings }) {
  const t = useT();
  const { pcs, notice, dismissNotice, choose } = useApp();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <div className="flex justify-end">
        <button className="min-h-10 rounded-lg bg-white/10 px-3 text-sm active:bg-white/20" data-testid="open-settings" onClick={onSettings}>
          {t('Settings')}
        </button>
      </div>
      <h1 className="text-center text-3xl font-semibold">Tarrot VTT</h1>
      <p className="text-center text-sm opacity-70">{t('Who are you?')}</p>

      {notice && (
        <div
          role="status"
          data-testid="notice"
          className="flex items-start justify-between gap-2 rounded-lg bg-amber-900/60 p-3 text-sm"
        >
          <span>{notice}</span>
          <button className="min-h-8 px-2" aria-label={t('Dismiss')} onClick={dismissNotice}>
            x
          </button>
        </div>
      )}

      <button className={card} data-testid="pick-gm" onClick={() => choose({ role: 'gm' })}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-700 text-lg font-semibold">
          GM
        </span>
        <span className="text-lg">{t('Game Master')}</span>
      </button>

      <button className={card} data-testid="pick-display" onClick={() => choose({ role: 'display' })}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-600 text-sm font-semibold">
          TV
        </span>
        <span className="flex flex-col">
          <span className="text-lg">{t('Display Screen')}</span>
          <span className="text-xs opacity-60">{t('Shows the current scene on the table screen')}</span>
        </span>
      </button>

      <h2 className="mt-2 text-sm uppercase tracking-wide opacity-60">{t('Player characters')}</h2>
      {pcs.length === 0 && <p className="text-sm opacity-60">{t('No characters yet. Ask the GM to create one.')}</p>}
      {pcs.map((pc) => (
        <button
          key={pc.id}
          className={card}
          data-testid="pick-pc"
          onClick={() => choose({ role: 'player', characterId: pc.id })}
        >
          <Initial name={pc.name} />
          <span className="text-lg">{pc.name}</span>
        </button>
      ))}
    </main>
  );
}
