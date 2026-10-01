import { useMemo, useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnDanger, btnPrimary } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { IntInput, isWholeNumber } from '../sheet/fields.jsx';
import { TargetPicker, useTargets } from '../sheet/TargetPicker.jsx';
import Magic, { emptyWork } from './Magic.jsx';
import Stances from './Stances.jsx';
import Spontaneous from './Spontaneous.jsx';
import Manifest from './Manifest.jsx';
import { LockProvider, Lockable, LockIcon, LockTile, useLocks } from './Locks.jsx';
import { useStances } from './useStances.js';
import { EnhancementDialog, WeaponFields, weaponToForm, weaponValid, formToWeapon } from './editors.jsx';
import { useGlobalEnhancements } from './useGlobalEnhancements.js';
import { weaponSummary, enhancementSummary } from './summaries.js';
import { enhancementCatalog, planAttack, MAX_COUNT } from '../../../../shared/arcane.js';
import { planRoll, MAX_MANUAL_LEVELS } from '../../../../shared/roll-plan.js';
import * as D from '../../../../shared/rules-data.js';
import { setChatSlot } from '../../lib/chatSlot.js';
import { useHelpPrompt } from '../HelpDice.jsx';
import { useT } from '../../i18n.jsx';

// The Arcane tab: everything a character attacks with. This part has the General sub-tab (weapons and
// Enhancements), Magic (stones, schemes, spells), Stances, Manifest (Tarot Cards and Manifestations) and the
// footer that makes the attack. The GM can lock tabs and parts of them for the players (see Locks).
// Without a character (the GM's general Arcane tab) it edits what is shared by every character.

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (n) => (n > 0 ? `+${n}` : String(n));

// The tabs: General is grey and takes 10% of the width; the other three share the rest, in the colours
// of the Combat Masteries on the sheet.
const TABS = [
  { id: 'general', label: 'General', width: '10%', bg: 'bg-slate-600', active: 'ring-slate-300' },
  { id: 'magic', label: 'Magic', width: '30%', bg: 'bg-blue-700', active: 'ring-blue-300' },
  { id: 'stances', label: 'Stances', width: '30%', bg: 'bg-red-700', active: 'ring-red-300' },
  { id: 'manifest', label: 'Manifest', width: '30%', bg: 'bg-yellow-700', active: 'ring-yellow-300' },
];

export const emptyDraft = () => ({ weapon: 'unarmed', counts: {}, stance: null, advantage: 0, modifier: '0' });

export default function ArcanePage({ s, draft, setDraft }) {
  const [locking, setLocking] = useState(false); // the GM's locking mode (only in the general tab, without a character)
  return (
    <LockProvider locking={locking && !s}>
      <Arcane s={s} draft={draft} setDraft={setDraft} locking={locking} setLocking={setLocking} />
    </LockProvider>
  );
}

function Arcane({ s, draft, setDraft, locking, setLocking }) {
  const t = useT();
  const { identity } = useApp();
  const { has, toggle, gm } = useLocks();
  const [tab, setTab] = useState('general');
  const [work, setWork] = useState(emptyWork); // the spell being built in Magic (kept while switching tabs)
  const canLock = !s && identity.role === 'gm';

  // In locking mode a tap on the tab that is already open locks it (or unlocks it).
  function pick(id) {
    if (canLock && locking && id !== 'general' && tab === id) toggle(`tab:${id}`);
    else setTab(id);
  }

  return (
    <div data-testid="arcane" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 overflow-hidden rounded-xl text-sm font-medium" role="tablist" aria-label={t('Arcane')}>
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              data-testid={`arcane-tab-${x.id}`}
              data-locked={has(`tab:${x.id}`) ? 'true' : 'false'}
              style={{ width: x.width }}
              className={`${x.bg} flex min-h-11 items-center justify-center gap-1 truncate px-1 ${tab === x.id ? `ring-2 ring-inset ${x.active}` : 'opacity-70'}`}
              onClick={() => pick(x.id)}
            >
              {t(x.label)}
              {has(`tab:${x.id}`) && <LockIcon size={14} />}
            </button>
          ))}
        </div>
        {canLock && (
          <button className={`${locking ? btnPrimary : btn} !px-3`} data-testid="lock-mode" aria-pressed={locking} aria-label={t('Locking mode')} title={t('Locking mode')} onClick={() => setLocking(!locking)}>
            <LockIcon size={18} />
          </button>
        )}
      </div>
      {locking && canLock && (
        <p className="text-xs opacity-70" data-testid="lock-hint">
          {t('Locking mode: tap an open tab again to lock it, and tap a part to lock it. Players see a blur where something is locked; you see everything.')}
        </p>
      )}
      {tab === 'general' && (s ? <General s={s} draft={draft} setDraft={setDraft} /> : <GlobalGeneral />)}
      {tab === 'magic' && (
        <Lockable id="tab:magic">
          {s ? (
            <Magic s={s} draft={draft} setDraft={setDraft} work={work} setWork={setWork} />
          ) : (
            <LockParts note={t('Open a character\'s Arcane tab to work with its Magic. Here you can lock its parts for the players.')} parts={[['stones', t('Spell Stones')], ['combinations', t('Spell Combinations')], ['fine_tuning', t('Spell Fine Tuning')]]} />
          )}
        </Lockable>
      )}
      {tab === 'stances' && (
        <Lockable id="tab:stances">
          <Stances s={s} draft={draft} setDraft={setDraft} />
        </Lockable>
      )}
      {tab === 'manifest' && (
        <Lockable id="tab:manifest">
          {s ? <Manifest s={s} draft={draft} setDraft={setDraft} /> : <LockParts note={t('Open a character\'s Arcane tab to work with its Tarot Cards and Manifestations. Here you can lock them for the players.')} parts={[['tarot', t('Tarot Cards')], ['manifestations', t('Manifestations')]]} />}
        </Lockable>
      )}
      {s && !(gm === false && has(`tab:${tab}`)) && <AttackFooter s={s} draft={draft} setDraft={setDraft} />}
    </div>
  );
}

// Parts of a tab that need a character to show anything: only their locks can be set here.
function LockParts({ note, parts }) {
  return (
    <div className="flex flex-col gap-2" data-testid="lock-parts">
      <p className={`${card} text-sm opacity-70`}>{note}</p>
      {parts.map(([id, text]) => (
        <LockTile key={id} id={id} label={text} />
      ))}
    </div>
  );
}

// ---- The character's General tab ---------------------------------------------------------------------

function General({ s, draft, setDraft }) {
  const t = useT();
  const { identity } = useApp();
  const { sheet, characterId } = s;
  const globals = useGlobalEnhancements();
  const info = useTargets(characterId);
  const catalog = useMemo(() => enhancementCatalog(globals, sheet), [globals, sheet]);
  const [dialog, setDialog] = useState(null); // { type: 'weapon', item } | { type: 'enhancement', enhancement } | { type: 'delete', enhancement }

  const weapons = [{ id: 'unarmed', name: t('Unarmed Attack'), cfg: sheet.unarmed }, ...sheet.items.filter((i) => i.weapon).map((i) => ({ id: i.id, name: i.name, cfg: i.weapon, item: i }))];
  const setCount = (id, n) => setDraft({ ...draft, counts: { ...draft.counts, [id]: Math.max(0, n) } });

  const mine = catalog.filter((e) => e.origin === 'default' || e.origin === 'global');
  const own = catalog.filter((e) => e.origin === 'character');

  // (Shared Enhancements are edited in the GM's general Arcane tab, not here.)
  const renderEnhancement = (e) => {
    const n = draft.counts[e.id] ?? 0;
    return (
      <div key={e.id} className={`${card} ${n > 0 ? 'ring-2 ring-violet-400' : ''}`} data-testid="enhancement" data-name={e.name} data-count={n}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {e.origin === 'default' ? t(e.name) : e.name}{' '}
              <span className="rounded bg-white/10 px-1.5 text-xs opacity-70">{e.origin === 'default' ? t('Default') : e.origin === 'global' ? t('Everyone') : t('This character')}</span>
            </div>
            <div className="text-xs opacity-70">{enhancementSummary(e, sheet.items, t)}</div>
            {e.description && <div className="mt-1 whitespace-pre-wrap text-xs opacity-60">{e.origin === 'default' ? t(e.description) : e.description}</div>}
          </div>
          {e.repeatable ? (
            <div className="flex items-center gap-1">
              <button className={`${btn} min-w-10`} aria-label={t('Fewer')} data-testid="enh-minus" onClick={() => setCount(e.id, n - 1)}>
                -
              </button>
              <span className="w-6 text-center text-lg" data-testid="enh-count">
                {n}
              </span>
              <button className={`${btn} min-w-10`} aria-label={t('More')} data-testid="enh-plus" onClick={() => setCount(e.id, Math.min(MAX_COUNT, n + 1))}>
                +
              </button>
            </div>
          ) : (
            <button className={`${n > 0 ? btnPrimary : btn}`} aria-pressed={n > 0} data-testid="enh-toggle" onClick={() => setCount(e.id, n > 0 ? 0 : 1)}>
              {n > 0 ? t('Chosen') : t('Choose')}
            </button>
          )}
        </div>
        {e.origin === 'character' && (
          <div className="mt-2 flex gap-2">
            <button className={btn} data-testid="enh-edit" onClick={() => setDialog({ type: 'enhancement', enhancement: e })}>
              {t('Edit')}
            </button>
            <button className={btnDanger} onClick={() => setDialog({ type: 'delete', enhancement: e })}>
              {t('Delete')}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {identity.role === 'gm' && (
        <section aria-label={t('Spontaneous Action')}>
          <button className={`${btnPrimary} w-full sm:w-auto`} data-testid="spontaneous-open" onClick={() => setDialog({ type: 'spontaneous' })}>
            {t('Spontaneous Action')}
          </button>
        </section>
      )}

      <section aria-label={t('Weapons')}>
        <h3 className={heading}>{t('Weapons')}</h3>
        <p className="mb-2 text-xs opacity-50">{t('Choose one weapon. Weapons are items with the Weapon switch on (see the Inventory on the sheet).')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t('Weapons')}>
          {weapons.map((w) => (
            <div key={w.id} className={`${card} ${draft.weapon === w.id ? 'ring-2 ring-violet-400' : ''} ${w.item ? 'bg-amber-500/10' : ''}`}>
              <button role="radio" aria-checked={draft.weapon === w.id} data-testid="weapon-option" data-name={w.name} className="w-full text-left" onClick={() => setDraft({ ...draft, weapon: w.id })}>
                <div className="font-medium">{w.name}</div>
                <div className="text-xs opacity-70">{weaponSummary(w.cfg, t)}</div>
                {w.item?.description && <div className="mt-1 whitespace-pre-wrap text-xs opacity-60">{w.item.description}</div>}
              </button>
              {!w.item && (
                <button className={`${btn} mt-2`} data-testid="unarmed-edit" onClick={() => setDialog({ type: 'weapon' })}>
                  {t('Edit')}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-label={t('Enhancements')}>
        <h3 className={heading}>{t('Enhancements')}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...mine, ...own].map(renderEnhancement)}
          <button className={`${btn} col-span-full`} data-testid="add-enhancement" onClick={() => setDialog({ type: 'enhancement', enhancement: null })}>
            {t('New Enhancement')}
          </button>
        </div>
      </section>

      {info && (
        <section aria-label={t('Targets')} className={card}>
          <TargetPicker characterId={characterId} info={info} />
        </section>
      )}

      {dialog?.type === 'spontaneous' && <Spontaneous s={s} onClose={() => setDialog(null)} />}
      {dialog?.type === 'weapon' && <UnarmedDialog s={s} onClose={() => setDialog(null)} />}
      {dialog?.type === 'enhancement' && (
        <EnhancementDialog
          enhancement={dialog.enhancement}
          items={sheet.items}
          onClose={() => setDialog(null)}
          onSave={(enhancement) => (dialog.enhancement ? s.list('enhancements', 'update', { id: dialog.enhancement.id, enhancement }) : s.list('enhancements', 'add', { enhancement }))}
        />
      )}
      {dialog?.type === 'delete' && (
        <FormDialog title={t('Delete Enhancement')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => s.list('enhancements', 'remove', { id: dialog.enhancement.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.enhancement.name })}</p>
        </FormDialog>
      )}
    </>
  );
}

// What the draft points at, in the shape the server understands.
export function weaponChoice(draft) {
  if (draft.weapon === 'unarmed') return { kind: 'unarmed' };
  if (draft.weapon.startsWith('spell:')) return { kind: 'spell', spellId: draft.weapon.slice('spell:'.length) };
  if (draft.weapon.startsWith('manifest:')) return { kind: 'manifestation', manifestationId: draft.weapon.slice('manifest:'.length) };
  return { kind: 'item', itemId: draft.weapon };
}

// The footer, in every tab of a character: what this attack is made of, its total modifier, and Done.
function AttackFooter({ s, draft, setDraft }) {
  const t = useT();
  const { toast } = useApp();
  const { sheet, characterId } = s;
  const globals = useGlobalEnhancements();
  const info = useTargets(characterId);
  const catalog = useMemo(() => enhancementCatalog(globals, sheet), [globals, sheet]);
  const { stances } = useStances();
  const stance = draft.stance ? stances.find((x) => x.id === draft.stance) : null;
  const [busy, setBusy] = useState(false);
  const [far, setFar] = useState(null); // { range, targets: [{ name, distance }] }
  const [options, setOptions] = useState(false);
  const helpPrompt = useHelpPrompt(sheet.helpDice);
  const helpChoice = useRef(null); // the Help Dice picked for this attack, kept while a range warning is answered

  const choice = {
    weapon: weaponChoice(draft),
    enhancements: Object.entries(draft.counts).filter(([, n]) => n > 0).map(([id, count]) => ({ id, count })),
  };
  const plan = planAttack(sheet, catalog, choice);
  const modifierOk = isWholeNumber(draft.modifier) && Math.abs(Number(draft.modifier)) <= 99;
  const manual = plan.ok ? Math.max(-MAX_MANUAL_LEVELS, Math.min(MAX_MANUAL_LEVELS, draft.advantage + plan.advantage)) : draft.advantage;
  // Basic weapons roll the Prime stat; a spell rolls the Magic Mastery.
  const request = plan.ok && plan.weapon.mastery ? { kind: 'mastery', key: plan.weapon.mastery } : { kind: 'weapon', key: 'prime' };
  const rp = planRoll(sheet, { ...request, advantage: manual, modifier: modifierOk ? Number(draft.modifier) : 0, dice: plan.ok ? plan.dice : [] });
  const totalMod = rp.ok ? rp.terms.reduce((n, x) => n + x.value, 0) : 0;
  const targets = info?.targets ?? [];

  let blocked = null;
  if (!plan.ok) blocked = t(plan.error, plan.params);
  else if (!info) blocked = t('Attacks need a Battle map.');
  else if (targets.length === 0) blocked = t('Select a target first (in General).');
  else if (sheet.ap.current < plan.ap) blocked = t('Not enough AP: this attack costs {cost} and you have {have}.', { cost: plan.ap, have: sheet.ap.current });
  else if (!modifierOk) blocked = t('The custom modifier must be a whole number from -99 to 99.');

  async function done(confirmRange = false) {
    if (!confirmRange) {
      helpChoice.current = await helpPrompt.ask();
      if (helpChoice.current === null) return; // cancelled: no attack
    }
    setBusy(true);
    const r = await call('attack:roll', { characterId, weapon: choice.weapon, enhancements: choice.enhancements, stance: draft.stance, advantage: draft.advantage, modifier: Number(draft.modifier), help: helpChoice.current ?? [], confirmRange });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    if (r.needsConfirm) return setFar(r.needsConfirm);
    helpChoice.current = null;
    setFar(null);
    setDraft({ ...draft, counts: {}, stance: null });
  }

  const chosenNames = plan.ok ? [plan.weapon.name, ...plan.chosen.map((e) => (e.count > 1 ? `${e.name} x${e.count}` : e.name)), ...(stance ? [t('Stance: {name}', { name: stance.name })] : [])] : [];

  return (
    <>
      {/* The footer: what this attack is made of, and Done. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/15 bg-[#14111d] px-3 py-2" data-testid="arcane-footer">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm" data-testid="arcane-chosen">
              {chosenNames.length ? chosenNames.join(' + ') : t('Nothing chosen')}
            </div>
            <div className="text-xs opacity-70" data-testid="arcane-modifier">
              {rp.ok ? `d20 ${signed(totalMod)}` : ''}
              {plan.ok && plan.dice.length > 0 ? ` ${plan.dice.map((d) => `${d.sign < 0 ? '-' : '+'}d${d.sides}`).join(' ')}` : ''}
              {manual !== 0 ? `, ${manual > 0 ? t('Advantage {n}', { n: manual }) : t('Disadvantage {n}', { n: -manual })}` : ''}
              {plan.ok ? `, ${t('{n} AP', { n: plan.ap })}` : ''}
            </div>
          </div>
          <button className={btn} data-testid="arcane-options" onClick={() => setOptions(true)}>
            {t('Options')}
          </button>
          <button className={btnPrimary} data-testid="arcane-done" disabled={!!blocked || busy || !rp.ok} onClick={() => done(false)}>
            {t('Done')}
          </button>
          <div ref={setChatSlot} className="contents" data-testid="footer-chat-slot" />
        </div>
        {blocked && (
          <p className="mt-1 text-xs opacity-60" data-testid="attack-blocked">
            {blocked}
          </p>
        )}
      </div>

      {helpPrompt.dialog}

      {options && (
        <Dialog title={t('Attack options')} onClose={() => setOptions(false)}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">{t('Extra Advantage levels')}</span>
              <button type="button" aria-label={t('Fewer levels')} className={`${btn} min-w-12`} onClick={() => setDraft({ ...draft, advantage: Math.max(-MAX_MANUAL_LEVELS, draft.advantage - 1) })}>
                -
              </button>
              <span className="w-8 text-center text-lg" data-testid="options-advantage">
                {draft.advantage}
              </span>
              <button type="button" aria-label={t('More levels')} className={`${btn} min-w-12`} onClick={() => setDraft({ ...draft, advantage: Math.min(MAX_MANUAL_LEVELS, draft.advantage + 1) })}>
                +
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t('Custom modifier')}
              <IntInput label={t('Custom modifier')} value={draft.modifier} onChange={(v) => setDraft({ ...draft, modifier: v })} />
            </label>
            <div className="flex justify-end">
              <button className={btnPrimary} onClick={() => setOptions(false)}>
                {t('Close')}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {far && (
        <Dialog title={t('Out of range')} onClose={() => setFar(null)}>
          <p className="mb-3 text-sm" data-testid="range-warning">
            {t('Some targets are farther than the weapon\'s range of {range} Spaces: {list}. The range is only a suggestion. Attack anyway?', {
              range: far.range,
              list: far.targets.map((x) => t('{name} ({n} Spaces)', { name: x.name, n: x.distance })).join(', '),
            })}
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setFar(null)}>
              {t('No')}
            </button>
            <button className={btnPrimary} data-testid="range-yes" onClick={() => done(true)}>
              {t('Attack anyway')}
            </button>
          </div>
        </Dialog>
      )}

    </>
  );
}

function UnarmedDialog({ s, onClose }) {
  const t = useT();
  const [form, setForm] = useState(() => weaponToForm(s.sheet.unarmed));
  return (
    <FormDialog title={t('Edit Unarmed Attack')} submitLabel={t('Save')} onClose={onClose} canSubmit={weaponValid(form)} run={() => s.set('unarmed', formToWeapon(form))}>
      <WeaponFields form={form} setForm={setForm} />
    </FormDialog>
  );
}

// ---- The GM's general Arcane tab: what every character shares ---------------------------------------

function GlobalGeneral() {
  const t = useT();
  const globals = useGlobalEnhancements();
  const [dialog, setDialog] = useState(null); // { enhancement } to edit or add, or { remove }
  return (
    <section aria-label={t('Enhancements for everyone')}>
      <h3 className={heading}>{t('Enhancements for everyone')}</h3>
      <p className="mb-2 text-xs opacity-50">{t('These are available to every PC and NPC, on top of Power Attack and Precise Attack. To make one for a single character, open its own Arcane tab.')}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {globals.map((e) => (
          <div key={e.id} className={card} data-testid="global-enhancement" data-name={e.name}>
            <div className="font-medium">{e.name}</div>
            <div className="text-xs opacity-70">{enhancementSummary(e, [], t)}</div>
            {e.description && <div className="mt-1 whitespace-pre-wrap text-xs opacity-60">{e.description}</div>}
            <div className="mt-2 flex gap-2">
              <button className={btn} data-testid="enh-edit" onClick={() => setDialog({ enhancement: e })}>
                {t('Edit')}
              </button>
              <button className={btnDanger} onClick={() => setDialog({ remove: e })}>
                {t('Delete')}
              </button>
            </div>
          </div>
        ))}
        {globals.length === 0 && <p className="col-span-full text-sm opacity-60">{t('None yet')}</p>}
        <button className={`${btn} col-span-full`} data-testid="add-enhancement" onClick={() => setDialog({ enhancement: null })}>
          {t('New Enhancement')}
        </button>
      </div>
      {dialog && 'enhancement' in dialog && (
        <EnhancementDialog
          enhancement={dialog.enhancement}
          items={[]}
          onClose={() => setDialog(null)}
          onSave={(enhancement) => call('arcane:enhancement:save', { id: dialog.enhancement?.id, enhancement })}
        />
      )}
      {dialog?.remove && (
        <FormDialog title={t('Delete Enhancement')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => call('arcane:enhancement:delete', { id: dialog.remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}
