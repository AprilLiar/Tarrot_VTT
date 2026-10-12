import { useEffect, useState } from 'react';
import { call } from '../AppContext.jsx';
import Dialog, { btn } from './Dialog.jsx';
import { onOpenTarot, openTarot } from '../lib/tarotInfo.js';
import { useT } from '../i18n.jsx';

// A gold star beside the name of a character that has a Tarot Card selected. Tapping it opens the card's info. It does not start a
// drag or open the token's menu.
export function TarotStar({ characterId }) {
  const t = useT();
  const stop = (e) => e.stopPropagation();
  return (
    <button
      type="button"
      data-testid="tarot-star"
      aria-label={t('Tarot Card')}
      title={t('Tarot Card')}
      className="pointer-events-auto ml-1 inline-block cursor-pointer leading-none text-yellow-400 drop-shadow-[0_0_3px_rgba(0,0,0,0.9)]"
      onPointerDown={stop}
      onPointerUp={stop}
      onContextMenu={stop}
      onClick={(e) => {
        e.stopPropagation();
        openTarot(characterId);
      }}
    >
      {'★'}
    </button>
  );
}

// The dialog of the star: the selected card, or that the character has an unknown one (a hidden card).
export function TarotInfo() {
  const t = useT();
  const [info, setInfo] = useState(null); // { name, card, hidden }
  useEffect(
    () =>
      onOpenTarot(async (characterId) => {
        const r = await call('tarot:peek', { characterId });
        if (r.ok) setInfo(r);
      }),
    [],
  );
  if (!info) return null;
  return (
    <Dialog title={t('{name}: Tarot Card', { name: info.name })}>
      <div data-testid="tarot-info">
        {info.card ? (
          <>
            <p className="text-lg font-medium" data-testid="tarot-info-name">
              {info.card.name}
            </p>
            {info.card.description && <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{info.card.description}</p>}
          </>
        ) : info.hidden ? (
          <p data-testid="tarot-info-hidden">{t('This character has an unknown Tarot Card')}</p>
        ) : (
          <p className="opacity-70">{t('This character has no Tarot Card selected.')}</p>
        )}
      </div>
      <button className={`${btn} mt-4 w-full`} data-testid="tarot-info-close" onClick={() => setInfo(null)}>
        {t('Close')}
      </button>
    </Dialog>
  );
}
