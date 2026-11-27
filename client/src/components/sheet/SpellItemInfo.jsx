import { useState } from 'react';
import { useT } from '../../i18n.jsx';
import Dialog, { btn } from '../Dialog.jsx';
import { DamageIcon } from '../arcane/DamageIcon.jsx';
import { RuneRows } from '../arcane/Runes.jsx';
import { SchemeView } from '../arcane/SchemeView.jsx';
import { weaponSummary, enhancementSummary } from '../arcane/summaries.js';
import { normalizeRows } from '../../../../shared/spells.js';

// What an opened spell item shows (see the README, "Spell items"): the spell at a glance, kept compact so it does not take over the sheet:
// icon, Circles, uses and Stabilization, the signature, the description, its effect, the runes of each Circle in a row, and a button that
// shows the tree of Spell Stones in a small window.
export function SpellItemInfo({ s, spellId }) {
  const t = useT();
  const [tree, setTree] = useState(false);
  const sp = s.sheet.spells.find((x) => x.id === spellId);
  if (!sp) return null;
  // A spell keeps a copy of its tree; one crafted before that falls back to its draft while the draft is there.
  const scheme = sp.scheme ?? s.sheet.spellDrafts.find((d) => d.id === sp.draftId)?.scheme ?? null;
  const rows = normalizeRows(sp.runes, sp.circles ?? 1);
  const effect =
    sp.effect.kind === 'weapon' ? `${t('Weapon')}: ${weaponSummary(sp.effect.weapon, t)}` : `${t('Enhancement')}: ${enhancementSummary(sp.effect.enhancement, s.sheet.items, t)}`;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-sky-400/30 bg-sky-950/30 p-2 text-sm" data-testid="spell-item-info">
      <div className="flex items-center gap-2">
        <DamageIcon kind={sp.icon} size={24} />
        <span className="rounded bg-white/10 px-1.5 text-xs" data-testid="spell-item-circles">
          {t('Circle {n}', { n: sp.circles })}
        </span>
        <span className="text-xs opacity-70">
          {sp.destroyed ? t('Destroyed') : t('Uses {cur}/{max}', { cur: sp.uses.current, max: sp.uses.max })} | {t('Stabilization {n}', { n: sp.stabilization })}
        </span>
      </div>
      <div className="text-xs italic text-sky-300/80" data-testid="spell-item-signature">
        {sp.authorName ? t('Made by {name}', { name: sp.authorName }) : t('Unknown author')}
      </div>
      {sp.description && <p className="whitespace-pre-wrap opacity-80">{sp.description}</p>}
      <p className="text-xs opacity-80" data-testid="spell-item-effect">
        {effect}
      </p>
      {rows.some((r) => r.length > 0) && (
        <div className="rounded-lg bg-black/30 px-1" data-testid="spell-item-runes">
          <RuneRows rows={rows} size={28} />
        </div>
      )}
      {scheme && (
        <button type="button" className={`${btn} min-h-9 self-start px-3 text-xs`} data-testid="spell-item-tree" onClick={() => setTree(true)}>
          {t('Spell Stones tree')}
        </button>
      )}
      {tree && (
        <Dialog title={sp.name}>
          <div data-testid="spell-tree">
            <SchemeView scheme={scheme} />
          </div>
          <button className={`${btn} mt-3 w-full`} onClick={() => setTree(false)}>
            {t('Close')}
          </button>
        </Dialog>
      )}
    </div>
  );
}
