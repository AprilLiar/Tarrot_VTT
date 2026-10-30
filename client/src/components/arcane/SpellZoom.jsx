import { useEffect, useRef, useState } from 'react';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';
import { SchemeView } from './SchemeView.jsx';
import { RuneChain } from './Runes.jsx';
import { MAX_CIRCLES, layoutScheme, validateScheme } from '../../../../shared/spells.js';
import { useT } from '../../i18n.jsx';

// A spell draft shown large (nearly the whole screen): the scheme with every Circle, a stone with a note shows it when tapped, and the Spell
// Fine Tuning along the tree: one row of runes for each Circle, beside that Circle's part of the tree (under the tree on a narrow screen).
// `onAddCircle` opens the draft in the Editor with one more, empty Circle; `onEdit` opens it as it is.
export function SpellZoom({ draft, onClose, onEdit, onAddCircle }) {
  const t = useT();
  const [shown, setShown] = useState(null); // the stone whose note is open
  const justClosed = useRef(false); // the click that closed a note must not open another one
  const { parts, circles } = layoutScheme(draft.scheme);
  const legal = validateScheme(draft.scheme).ok;
  const rows = Array.from({ length: circles }, (_, i) => draft.runes[i] ?? []);

  // A shown note closes on any click on anything.
  useEffect(() => {
    if (shown == null) return undefined;
    const close = () => {
      justClosed.current = true;
      setShown(null);
      setTimeout(() => {
        justClosed.current = false;
      }, 0);
    };
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [shown]);

  return (
    <Dialog title={draft.name} wide>
      <div className="flex flex-col gap-3" data-testid="spell-zoom">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-white/10 px-2 py-0.5" data-testid="zoom-circles" data-circles={circles}>
            {t('Circle {n}', { n: circles })}
          </span>
          {!legal && (
            <span className="font-semibold text-red-400" data-testid="zoom-illegal">
              {t('Illegal')}
            </span>
          )}
          {draft.description && <span className="min-w-0 flex-1 whitespace-pre-wrap opacity-70">{draft.description}</span>}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <SchemeView scheme={draft.scheme} big noteOpen={shown} onStone={(id) => setShown(justClosed.current ? null : id)} />
          <div className="flex flex-col gap-2 lg:gap-0" data-testid="zoom-rows" aria-label={t('Spell Fine Tuning')}>
            {parts.map((p) => (
              <div
                key={p.circle}
                className="flex flex-col justify-center gap-1 rounded-xl bg-black/30 p-2 lg:[flex:var(--g)_1_0%] lg:rounded-none lg:border-t lg:border-white/10 lg:bg-transparent"
                style={{ '--g': p.height }}
                data-testid="zoom-row"
                data-circle={p.circle}
              >
                <span className="text-xs opacity-60">{circles > 1 ? t('Circle {n}', { n: p.circle }) : t('Spell Fine Tuning')}</span>
                {rows[p.circle - 1].length ? <RuneChain runes={rows[p.circle - 1]} size={40} testId="zoom-runes" /> : <span className="text-xs opacity-40">{t('No runes yet.')}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btn} data-testid="zoom-add-circle" disabled={circles >= MAX_CIRCLES} onClick={() => onAddCircle(draft)}>
            {t('Add Circle')}
          </button>
          <button className={btn} data-testid="zoom-edit" onClick={() => onEdit(draft)}>
            {t('Edit')}
          </button>
          <button className={btnPrimary} data-testid="zoom-close" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
