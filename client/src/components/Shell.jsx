import { NavLink } from 'react-router-dom';
import { useApp } from '../AppContext.jsx';
import { useIsDesktop } from '../lib/useMedia.js';
import { Initial } from './Picker.jsx';
import ChatPanel from './ChatPanel.jsx';
import { AttackInbox } from './AttackCard.jsx';
import { SaveInbox } from './SavePrompt.jsx';
import MusicBar from '../music/MusicBar.jsx';
import Dialog, { btn, btnPrimary } from './Dialog.jsx';
import { useT } from '../i18n.jsx';
import { SettingsBody } from './Settings.jsx';
import { useState } from 'react';

// Top bar shown once an identity is chosen: who you are, connection state,
// and the way back to the picker. Also hosts the chat, toasts and incoming
// trade offers, which must be reachable from every page.
export default function Shell({ children }) {
  const t = useT();
  const { identity, pcs, connected, switchIdentity, toasts, offers, respondTrade } = useApp();
  const isGm = identity.role === 'gm';
  const pc = pcs.find((c) => c.id === identity.characterId);
  const label = isGm ? t('Game Master') : (pc?.name ?? '...');
  const offer = offers[0];
  const desktop = useIsDesktop();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The GM can view the scene on any device; players only on a desktop (phones stay on the controls).
  const links = isGm
    ? [['/', 'Characters', t('Characters')], ['/scene', 'Scene', t('Scene')], ['/arcane', 'Arcane', t('Arcane')]]
    : desktop
      ? [['/', 'Sheet', t('Sheet')], ['/scene', 'Scene', t('Scene')]]
      : [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-[#0f0d14] px-4">
        {isGm ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-700 text-sm font-semibold">
            {t('GM')}
          </span>
        ) : (
          <Initial name={label} size="h-9 w-9 text-base" />
        )}
        <span data-testid="whoami" className="min-w-0 flex-1 truncate font-medium">
          {label}
        </span>
        <MusicBar />
        {links.length > 0 && (
          <nav className="flex gap-1" aria-label={t('Sections')}>
            {links.map(([to, id, text]) => (
              <NavLink
                key={to}
                to={to}
                end
                data-testid={`nav-${id.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex min-h-10 items-center rounded-lg px-3 text-sm ${isActive ? 'bg-violet-700' : 'bg-white/10 active:bg-white/20'}`
                }
              >
                {text}
              </NavLink>
            ))}
          </nav>
        )}
        {!connected && (
          <span data-testid="offline" className="text-xs text-amber-400">
            {t('Reconnecting...')}
          </span>
        )}
        {isGm && (
          <button data-testid="open-settings-gm" aria-label={t('Settings')} title={t('Settings')} className="flex min-h-11 shrink-0 items-center rounded-lg bg-white/10 px-3 text-sm active:bg-white/20" onClick={() => setSettingsOpen(true)}>
            {/* On a narrow screen only the sliders icon, so the top bar still fits. */}
            <svg className="sm:hidden" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 4h14M2 9h14M2 14h14" />
              <circle cx="6" cy="4" r="1.8" fill="currentColor" />
              <circle cx="12" cy="9" r="1.8" fill="currentColor" />
              <circle cx="7" cy="14" r="1.8" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">{t('Settings')}</span>
          </button>
        )}
        <button
          data-testid="switch-identity"
          className="min-h-11 rounded-lg bg-white/10 px-3 text-sm active:bg-white/20"
          onClick={switchIdentity}
        >
          {t('Switch')}
        </button>
      </header>
      <div className="flex-1">{children}</div>

      {settingsOpen && (
        <Dialog title={t('Settings')} onClose={() => setSettingsOpen(false)}>
          <SettingsBody />
        </Dialog>
      )}

      <ChatPanel />
      {isGm && <AttackInbox />}
      <SaveInbox />

      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto rounded-lg bg-slate-800 px-4 py-2 text-sm shadow-lg">
            {t.text}
          </div>
        ))}
      </div>

      {offer && (
        <Dialog title={t('Item offered')} onClose={() => {}}>
          <p className="mb-3 text-sm" data-testid="trade-offer">
            {t('{from} wants to give you {item}.', { from: offer.fromName, item: offer.itemName })}
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} data-testid="trade-decline" onClick={() => respondTrade(offer.offerId, false)}>
              {t('Decline')}
            </button>
            <button className={btnPrimary} data-testid="trade-accept" onClick={() => respondTrade(offer.offerId, true)}>
              {t('Accept')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
