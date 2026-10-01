import { useSyncExternalStore } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn } from '../Dialog.jsx';
import { areaName } from '../../lib/areaName.js';
import { tokensInTemplate } from '../../../../shared/templates.js';
import { useT } from '../../i18n.jsx';

// The characters on the Battle map a character can target. Tapping one selects it, tapping it again
// deselects it, so any number can be selected. Shown on the sheet's Battle remote and, mirrored, in the
// Arcane tab so nobody has to leave the tab they attack from. A switch changes between picking characters one by one
// (Individual) and picking areas drawn on the map (Area): an area stands for everyone inside it.
export function useTargets(characterId) {
  const { stage } = useApp();
  const battle = stage.battle;
  if (stage.mode !== 'battle' || !battle?.imageId) return null;
  const token = battle.tokens.find((tk) => tk.ownerKind === 'character' && tk.ownerId === characterId);
  return {
    token,
    battle,
    targets: battle.tokens.filter((tk) => tk.targetedBy.includes(characterId)),
    others: battle.tokens.filter((tk) => tk !== token),
  };
}

// The chosen way of targeting, shared by every place that shows the picker (the remote and the Arcane tab).
let mode = 'individual';
const modeListeners = new Set();
const setMode = (m) => {
  mode = m;
  modeListeners.forEach((fn) => fn());
};
const useMode = () =>
  useSyncExternalStore(
    (fn) => {
      modeListeners.add(fn);
      return () => modeListeners.delete(fn);
    },
    () => mode,
  );

// A two-halved button: pressing anywhere on it switches. The chosen half is in the interface colour, the other is white.
function ModeToggle({ value, onChange }) {
  const t = useT();
  const half = (id, label) => (
    <span className={`flex-1 px-3 py-2 text-center text-sm font-medium ${value === id ? 'bg-violet-600 text-white' : 'bg-white text-slate-700'}`} data-half={id} data-selected={value === id ? 'true' : 'false'}>
      {label}
    </span>
  );
  return (
    <button type="button" role="switch" aria-checked={value === 'area'} aria-label={t('Targeting: Individual or Area')} data-testid="target-mode" data-mode={value} className="flex min-h-11 w-full max-w-xs overflow-hidden rounded-lg border border-white/20" onClick={() => onChange(value === 'individual' ? 'area' : 'individual')}>
      {half('individual', t('Individual'))}
      {half('area', t('Area'))}
    </button>
  );
}

export function TargetPicker({ characterId, info }) {
  const t = useT();
  const { toast } = useApp();
  const way = useMode();
  const { targets, others, battle } = info;
  const areas = battle.marks.filter((m) => m.kind === 'template');

  async function aim(tokenId) {
    const r = await call('battle:target', { characterId, tokenId });
    if (!r.ok) toast(r.error);
  }
  async function aimArea(markId) {
    const r = await call('battle:target_area', { characterId, markId });
    if (!r.ok) toast(r.error);
  }
  const inside = (m) => tokensInTemplate(m, battle.tokens.filter((tk) => tk.kind !== 'prop'), battle.grid, battle.aspect);

  return (
    <>
      <div className="mb-2">
        <ModeToggle value={way} onChange={setMode} />
      </div>
      {way === 'individual' ? (
        <>
          <div className="text-sm opacity-70">{t('Targets (tap again to deselect)')}</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-3" data-testid="target-list">
            {others.length === 0 && <p className="col-span-full text-sm opacity-60">{t('Nobody else is on the map.')}</p>}
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
          </div>
        </>
      ) : (
        <>
          <div className="text-sm opacity-70">{t('Areas (picking one targets everyone inside it)')}</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-3" data-testid="area-list">
            {areas.length === 0 && <p className="col-span-full text-sm opacity-60">{t('There are no areas on the map. Draw one with the Area tool.')}</p>}
            {areas.map((m) => {
              const picked = (m.targetedBy ?? []).includes(characterId);
              const who = inside(m);
              return (
                <button key={m.id} data-testid="area-option" data-name={areaName(m, (x) => x)} aria-pressed={picked} className={`${btn} flex flex-col items-start gap-0.5 text-left ${picked ? 'ring-2 ring-amber-400' : ''}`} onClick={() => aimArea(m.id)}>
                  <span className="font-semibold">{areaName(m, t)}</span>
                  <span className="text-xs opacity-70" data-testid="area-members">
                    {who.length ? who.map((tk) => tk.name).join(', ') : t('Nobody inside')}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {(targets.length > 0 || areas.some((m) => (m.targetedBy ?? []).includes(characterId))) && (
        <button className={`${btn} mt-1`} data-testid="clear-target" onClick={() => aim(null)}>
          {t('Clear targets')}
        </button>
      )}
    </>
  );
}
