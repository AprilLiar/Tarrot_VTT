import { useState } from 'react';
import { useApp } from '../../AppContext.jsx';
import { RewindButton } from './Rewind.jsx';
import { useT } from '../../i18n.jsx';

// The GM Tools button (see the README): a round GM-only button on the Scene page (Scene and Battle modes, never on sheets or the Arcane
// tab) that gathers the GM's tools in one small panel. Today: Rewind (Battle mode).
export function GmTools() {
  const t = useT();
  const { stage } = useApp();
  const [open, setOpen] = useState(false);
  const battle = stage.mode === 'battle';
  return (
    <div className="ui-chrome absolute bottom-3 left-16 z-30" data-no-pan>
      {open && (
        <div className="absolute bottom-12 left-0 flex w-56 flex-col gap-2 rounded-xl bg-[#1a1626]/95 p-3 text-sm shadow-xl" data-testid="gm-tools-panel">
          <div className="text-xs uppercase tracking-wide opacity-60">{t('GM Tools')}</div>
          {battle ? <RewindButton className="w-full" /> : <p className="text-xs opacity-60">{t('Rewind works in Battle mode.')}</p>}
        </div>
      )}
      <button
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold backdrop-blur ${open ? 'bg-violet-700' : 'bg-black/50 active:bg-black/70'}`}
        data-testid="gm-tools"
        aria-expanded={open}
        aria-label={t('GM Tools')}
        title={t('GM Tools')}
        onClick={() => setOpen(!open)}
      >
        GM
      </button>
    </div>
  );
}
