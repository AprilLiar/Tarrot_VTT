import { useT } from '../../i18n.jsx';

// Pop-out (see the README, "Pop-out"): a player opens their character sheet in a new browser tab (the /popout page: only the sheet, live
// and editable, no top bar or chat), to keep it beside the map.
export function PopOutButton() {
  const t = useT();
  return (
    <button
      className="flex min-h-10 items-center justify-center rounded-lg bg-white/10 px-3 active:bg-white/20"
      data-testid="pop-out"
      aria-label={t('Pop out the character sheet')}
      title={t('Pop out the character sheet (a new tab)')}
      onClick={() => window.open('/popout', '_blank')}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </button>
  );
}

// A player's tool bar on the left of the Scene in Scene mode (in Battle mode the button is in the map's tool bar).
export function PlayerSceneTools() {
  return (
    <div className="ui-chrome absolute left-2 top-1/2 z-20 flex w-14 -translate-y-1/2 flex-col gap-1 rounded-xl bg-black/55 p-1 backdrop-blur" data-no-pan data-testid="player-tools">
      <PopOutButton />
    </div>
  );
}
