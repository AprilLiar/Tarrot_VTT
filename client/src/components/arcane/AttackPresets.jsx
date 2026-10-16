import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { useTargets } from '../sheet/TargetPicker.jsx';
import { useGlobalEnhancements } from './useGlobalEnhancements.js';
import { useStances } from './useStances.js';
import { useAttackRunner } from './useAttackRunner.jsx';
import { attackRequest } from './attackDraft.js';
import { enhancementCatalog, planAttack } from '../../../../shared/arcane.js';
import { blankEffect } from '../../../../shared/stances.js';
import { MAX_PRESET_NAME, presetFromDraft, presetKey, resolvePreset } from '../../../../shared/presets.js';
import { useT } from '../../i18n.jsx';

// Attack Presets (see the README): saved attack setups, found again by the NAMES of their parts. The star in the Arcane footer
// saves the attack being drafted; the list below lives in the General tab and on the sheet under the Battle remote.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// What the presets need to find their parts again: the character's Enhancements (with its spells and Manifestations) and the
// Stances it may use.
export function usePresetContext(s) {
  const { identity } = useApp();
  const globals = useGlobalEnhancements();
  const { stances } = useStances();
  const { sheet, characterId } = s;
  const gm = identity.role === 'gm';
  const catalog = useMemo(() => enhancementCatalog(globals, sheet), [globals, sheet]);
  return useMemo(
    () => ({ sheet, catalog, stances, canUse: (st) => (gm ? st.learned.includes(characterId) : st.usable) }),
    [sheet, catalog, stances, gm, characterId],
  );
}

// The name a preset gets when it is saved: its parts, in the language of whoever saves it.
function autoName(preset, t) {
  const parts = [
    preset.weapon.kind === 'unarmed' ? t('Unarmed Attack') : preset.weapon.name,
    ...preset.enhancements.map((e) => {
      const name = e.origin === 'default' ? t(e.name) : e.name;
      return e.count > 1 ? `${name} x${e.count}` : name;
    }),
    ...(preset.stance ? [preset.stance.name] : []),
  ];
  return parts.join(' + ').slice(0, MAX_PRESET_NAME);
}

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// The star beside Options and Done: hollow while the attack is not saved, filled once a preset holds this very setup.
export function PresetStar({ s, draft, ctx }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const preset = useMemo(() => presetFromDraft(draft, ctx), [draft, ctx]);
  if (!preset) return null;
  const saved = s.sheet.attackPresets.some((p) => presetKey(p) === presetKey(preset));
  async function save() {
    if (saved || busy) return;
    setBusy(true);
    await s.list('attackPresets', 'add', { preset: { ...preset, name: autoName(preset, t) } });
    setBusy(false);
  }
  const label = saved ? t('Saved as a preset') : t('Save as a preset');
  return (
    <button className={`${btn} !px-3 text-yellow-400`} data-testid="preset-star" data-saved={saved ? 'true' : 'false'} aria-label={label} title={label} onClick={save}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />
      </svg>
    </button>
  );
}

// The list of presets: five rows high, then it scrolls (with the interface's thin bar on a computer, and by swiping, with no bar
// at all, on a touch screen). `onLoad(draft)` puts a preset's parts in the footer.
export function AttackPresets({ s, onLoad }) {
  const t = useT();
  const { sheet, characterId } = s;
  const ctx = usePresetContext(s);
  const info = useTargets(characterId);
  const runner = useAttackRunner(s);
  const [dialog, setDialog] = useState(null); // { type: 'edit' | 'delete', preset }
  const listRef = useRef(null);
  const [more, setMore] = useState(false); // rows are hidden below the visible ones
  const presets = sheet.attackPresets;

  const rows = useMemo(
    () =>
      presets.map((preset) => {
        const { draft, missing } = resolvePreset(preset, ctx);
        const stance = draft.stance ? ctx.stances.find((x) => x.id === draft.stance) : null;
        const request = attackRequest(draft);
        const plan = planAttack(sheet, ctx.catalog, request, stance ? [{ name: stance.name, effect: blankEffect(), cost: stance.cost }] : []);
        return { preset, draft, missing, request, plan, valid: missing.length === 0 && plan.ok };
      }),
    [presets, ctx, sheet],
  );

  function checkMore() {
    const el = listRef.current;
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }
  useEffect(checkMore, [rows.length]);

  const targets = info?.targets ?? [];

  return (
    <section aria-label={t('Attack Presets')} data-testid="presets">
      <h3 className="mb-2 text-sm uppercase tracking-wide opacity-60">
        {t('Attack Presets')} <span data-testid="preset-count">({presets.length})</span>
      </h3>
      {presets.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm opacity-60">{t('No presets yet. Set up an attack in the Arcane tab and tap the star beside Options and Done to save it.')}</p>
      ) : (
        <div className="relative">
          <div ref={listRef} onScroll={checkMore} className="preset-list flex flex-col gap-1.5 overflow-y-auto" data-testid="preset-list">
            {rows.map(({ preset, draft, missing, request, plan, valid }) => {
              const canAttack = valid && !!info && targets.length > 0 && sheet.ap.current >= plan.ap && !runner.busy && Number.isFinite(request.modifier);
              const line = !valid
                ? t('Missing: {list}', { list: missing.map((m) => m.name || t('Weapon')).join(', ') || t('Weapon') })
                : t('{base} {kind}, {ap} AP', { base: plan.base, kind: { t: cap(plan.kind) }, ap: plan.ap });
              return (
                <div
                  key={preset.id}
                  data-testid="preset"
                  data-name={preset.name}
                  data-valid={valid ? 'true' : 'false'}
                  className={`preset-row flex shrink-0 items-center gap-2 rounded-xl border px-2.5 ${valid ? 'border-white/10 bg-white/5' : 'border-red-400/30 bg-red-500/10'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-sm font-medium leading-tight" data-testid="preset-name">
                      {preset.name}
                    </div>
                    <div className={`truncate text-xs ${valid ? 'opacity-70' : 'text-red-300'}`} data-testid="preset-line">
                      {line}
                    </div>
                  </div>
                  <button className={`${btnPrimary} min-w-16 !px-3`} data-testid="preset-attack" disabled={!canAttack} onClick={() => runner.run(request)}>
                    {t('Attack')}
                  </button>
                  <button className={`${btn} w-11 !px-0`} data-testid="preset-load" aria-label={t('Load into the footer')} title={t('Load into the footer')} onClick={() => onLoad(draft)}>
                    <span className="flex justify-center">
                      <Svg>
                        <path d="M12 3v11" />
                        <path d="M7.5 9.5L12 14l4.5-4.5" />
                        <path d="M4 16v3h16v-3" />
                      </Svg>
                    </span>
                  </button>
                  <button className={`${btn} w-11 !px-0`} data-testid="preset-edit" aria-label={t('Edit Preset')} title={t('Edit Preset')} onClick={() => setDialog({ type: 'edit', preset })}>
                    <span className="flex justify-center">
                      <Svg>
                        <path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19z" />
                      </Svg>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {more && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-gradient-to-t from-[#0f0d14] to-transparent" data-testid="preset-more" />}
        </div>
      )}

      {runner.dialogs}
      {dialog?.type === 'edit' && <EditPreset s={s} preset={dialog.preset} onDelete={() => setDialog({ type: 'delete', preset: dialog.preset })} onClose={() => setDialog(null)} />}
      {dialog?.type === 'delete' && (
        <FormDialog title={t('Delete Preset')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => s.list('attackPresets', 'remove', { id: dialog.preset.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.preset.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}

function EditPreset({ s, preset, onDelete, onClose }) {
  const t = useT();
  const [name, setName] = useState(preset.name);
  return (
    <FormDialog title={t('Edit Preset')} submitLabel={t('Save')} onClose={onClose} canSubmit={!!name.trim()} run={() => s.list('attackPresets', 'rename', { id: preset.id, name })}>
      <label className="flex flex-col gap-1 text-sm">
        {t('Name')}
        <input className={input} data-testid="preset-name-input" maxLength={MAX_PRESET_NAME} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="button" className={`${btnDanger} self-start`} data-testid="preset-delete" onClick={onDelete}>
        {t('Delete')}
      </button>
    </FormDialog>
  );
}
