import { call, useApp } from '../../AppContext.jsx';
import { btn } from '../Dialog.jsx';
import { useT } from '../../i18n.jsx';

// The characters on the Battle map a character can target. Tapping one selects it, tapping it again
// deselects it, so any number can be selected. Shown on the sheet's Battle remote and, mirrored, in the
// Arcane tab so nobody has to leave the tab they attack from.
export function useTargets(characterId) {
  const { stage } = useApp();
  const battle = stage.battle;
  if (stage.mode !== 'battle' || !battle?.imageId) return null;
  const token = battle.tokens.find((tk) => tk.ownerKind === 'character' && tk.ownerId === characterId);
  return {
    token,
    targets: battle.tokens.filter((tk) => tk.targetedBy.includes(characterId)),
    others: battle.tokens.filter((tk) => tk !== token),
  };
}

export function TargetPicker({ characterId, info }) {
  const t = useT();
  const { toast } = useApp();
  const { targets, others } = info;

  async function aim(tokenId) {
    const r = await call('battle:target', { characterId, tokenId });
    if (!r.ok) toast(r.error);
  }

  return (
    <>
      <div className="text-sm opacity-70">{t('Targets (tap again to deselect)')}</div>
      <div className="mt-1 flex flex-col gap-1" data-testid="target-list">
        {others.length === 0 && <p className="text-sm opacity-60">{t('Nobody else is on the map.')}</p>}
        {others.map((tk) => (
          <button
            key={tk.id}
            data-testid="target-option"
            aria-pressed={targets.some((x) => x.id === tk.id)}
            className={`${btn} flex justify-between ${targets.some((x) => x.id === tk.id) ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => aim(tk.id)}
          >
            <span className="truncate">{tk.name}</span>
            <span className="text-xs opacity-60">{tk.kind === 'pc' ? t('PC') : t('NPC')}</span>
          </button>
        ))}
        {targets.length > 0 && (
          <button className={btn} data-testid="clear-target" onClick={() => aim(null)}>
            {t('Clear targets')}
          </button>
        )}
      </div>
    </>
  );
}
