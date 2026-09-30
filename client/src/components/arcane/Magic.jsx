import { useEffect, useMemo, useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { NumField } from '../sheet/fields.jsx';
import { SchemeView } from './SchemeView.jsx';
import { DamageIcon, ICON_KEYS } from './DamageIcon.jsx';
import { EffectEditor, enhancementToForm, enhancementValid, formToEnhancement, formToWeapon, isNum, weaponToForm, weaponValid } from './editors.jsx';
import { weaponSummary, enhancementSummary } from './summaries.js';
import { KINDS, KIND_COLORS, MAX_NOTE, MAX_STONE_COUNT, RUNES, STONES, normalizeScheme, stoneInfo, stonesNeeded, validateScheme } from '../../../../shared/spells.js';
import * as D from '../../../../shared/rules-data.js';
import { Lockable } from './Locks.jsx';
import { useT } from '../../i18n.jsx';

// The Magic tab: Spell Stones, the scheme editor, the compendium of saved drafts, and finished spells.

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';
const label = 'flex flex-col gap-1 text-sm';
const newId = () => crypto.randomUUID().slice(0, 8);
export const emptyWork = () => ({ id: null, name: '', description: '', scheme: { stones: [], arrows: [] }, runes: [...RUNES] });

// A stone as a small round button with its ring, used in the palette and the filters.
function StoneChip({ sign, size = 44, ...rest }) {
  const info = stoneInfo(sign);
  return (
    <button
      type="button"
      className="flex shrink-0 items-center justify-center rounded-full bg-[#14111d] text-2xl"
      style={{ width: size, height: size, border: `3px solid ${KIND_COLORS[info.kind]}` }}
      title={`${info.name}`}
      {...rest}
    >
      {info.glyph}
    </button>
  );
}

const SUBS = ['stones', 'editor', 'drafts', 'spells'];

export default function Magic({ s, draft, setDraft, work, setWork }) {
  const t = useT();
  const [sub, setSub] = useState('editor');
  const names = { stones: t('Stones'), editor: t('Editor'), drafts: t('Spell Drafts'), spells: t('Created Spells') };
  return (
    <div className="flex flex-col gap-3" data-testid="magic">
      <div className="grid grid-cols-4 gap-1" role="tablist" aria-label={t('Magic')}>
        {SUBS.map((id) => (
          <button key={id} role="tab" aria-selected={sub === id} data-testid={`magic-${id}`} className={`${btn} min-h-10 px-1 text-xs ${sub === id ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setSub(id)}>
            {names[id]}
          </button>
        ))}
      </div>
      {sub === 'stones' && (
        <Lockable id="stones">
          <Stones s={s} />
        </Lockable>
      )}
      {sub === 'editor' && (
        <Lockable id="combinations">
          <Editor s={s} work={work} setWork={setWork} />
        </Lockable>
      )}
      {sub === 'drafts' && (
        <Lockable id="combinations">
          <Drafts s={s} setWork={setWork} goEditor={() => setSub('editor')} goSpells={() => setSub('spells')} />
        </Lockable>
      )}
      {sub === 'spells' && <Spells s={s} draft={draft} setDraft={setDraft} />}
    </div>
  );
}

// ---- Spell Stones the character owns ------------------------------------------------------------------------

function Stones({ s }) {
  const t = useT();
  return (
    <section aria-label={t('Spell Stones')}>
      <h3 className={heading}>{t('Spell Stones')}</h3>
      <p className="mb-2 text-xs opacity-50">{t('How many of each Spell Stone this character has. Crafting a spell spends them; drafting does not.')}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {KINDS.flatMap((kind) => STONES.filter((x) => x.kind === kind)).map((x) => (
          <div key={x.sign} className={`${card} flex flex-col items-center gap-1 p-2`} data-testid={`stone-${x.sign}`}>
            <StoneChip sign={x.sign} tabIndex={-1} />
            <div className="text-xs">{t(x.name)}</div>
            <div className="w-full text-lg">
              <NumField label={t('{name} stones', { name: { t: x.name } })} testId={`stone-count-${x.sign}`} value={s.sheet.stones[x.sign]} min={0} max={MAX_STONE_COUNT} onCommit={(n) => s.set(`stones.${x.sign}`, n)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- The scheme editor -----------------------------------------------------------------------------------

function Editor({ s, work, setWork }) {
  const t = useT();
  const { toast } = useApp();
  const [sel, setSel] = useState(null); // the stone waiting for an arrow to another stone
  const [noteFor, setNoteFor] = useState(null); // stone whose note is edited
  const [shown, setShown] = useState(null); // stone whose note is shown
  const justClosed = useRef(false); // the click that closed a note must not open another one
  const [busy, setBusy] = useState(false);
  const scheme = work.scheme;
  const check = useMemo(() => validateScheme(scheme), [scheme]);
  const setScheme = (next) => setWork({ ...work, scheme: normalizeScheme(next) });
  const have = s.sheet.stones;

  const addStone = (sign) => {
    if (scheme.stones.length >= 24) return toast(t('A scheme can have at most {n} stones.', { n: 24 }));
    setScheme({ ...scheme, stones: [...scheme.stones, { id: newId(), sign, note: '' }] });
  };

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

  function onStone(id) {
    const st = scheme.stones.find((x) => x.id === id);
    setShown(st?.note.trim() && !justClosed.current ? id : null);
    if (sel == null) return setSel(id);
    if (sel === id) return setSel(null);
    const exists = scheme.arrows.some((a) => a.from === sel && a.to === id);
    setScheme({ ...scheme, arrows: exists ? scheme.arrows.filter((a) => !(a.from === sel && a.to === id)) : [...scheme.arrows, { from: sel, to: id }] });
    setSel(null);
  }

  function removeStone(id) {
    setScheme({ stones: scheme.stones.filter((x) => x.id !== id), arrows: scheme.arrows.filter((a) => a.from !== id && a.to !== id) });
    setSel(null);
    setShown(null);
  }

  const moveRune = (i, d) => {
    const runes = [...work.runes];
    [runes[i], runes[i + d]] = [runes[i + d], runes[i]];
    setWork({ ...work, runes });
  };

  async function save() {
    setBusy(true);
    const payload = { name: work.name.trim(), description: work.description, scheme, runes: work.runes };
    const r = await call('sheet:list', { characterId: s.characterId, list: 'spellDrafts', action: work.id ? 'update' : 'add', id: work.id, draft: payload });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    if (!work.id) setWork({ ...work, id: r.sheet.spellDrafts[r.sheet.spellDrafts.length - 1].id });
    toast(check.ok ? t('Saved to Spell Drafts.') : t('Saved to Spell Drafts, marked Illegal.'));
  }

  const palette = KINDS.flatMap((kind) => STONES.filter((x) => x.kind === kind));
  const selStone = scheme.stones.find((x) => x.id === sel);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
      <div className="flex gap-2">
        <label className={`${label} flex-1`}>
          {t('Name')}
          <input className={input} data-testid="spell-name" value={work.name} maxLength={D.NAME_MAX} onChange={(e) => setWork({ ...work, name: e.target.value })} />
        </label>
        <button className={`${btn} self-end`} data-testid="spell-new" onClick={() => { setWork(emptyWork()); setSel(null); }}>
          {t('New spell')}
        </button>
      </div>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-16`} data-testid="spell-description" value={work.description} maxLength={D.TEXT_MAX} onChange={(e) => setWork({ ...work, description: e.target.value })} />
      </label>
      </div>

      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-span-3 lg:row-start-1">
      <div className="flex gap-2">
        <div
          className="min-w-0 flex-1"
          data-testid="scheme-table"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const sign = e.dataTransfer.getData('text/plain');
            if (stoneInfo(sign)) addStone(sign);
          }}
        >
          <SchemeView scheme={scheme} selected={sel} noteOpen={shown} onStone={onStone} onStoneTwice={(id) => setNoteFor(id)} />
        </div>
        <div className="flex w-16 shrink-0 flex-col items-center gap-1" data-testid="stone-palette" aria-label={t('Spell Stones')}>
          {palette.map((x) => (
            <div key={x.sign} className="flex flex-col items-center">
              <StoneChip sign={x.sign} size={44} data-testid={`palette-${x.sign}`} aria-label={t('Add {name}', { name: { t: x.name } })} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', x.sign)} onClick={() => addStone(x.sign)} />
              {have[x.sign] > 0 && <span className="text-xs opacity-70">x{have[x.sign]}</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs opacity-50">{t('Tap a stone on the right to add it. Tap a stone in the table, then another one, to draw an arrow between them (again to remove it). Tap a stone twice to write a note.')}</p>

      {selStone && (
        <div className={`${card} flex flex-wrap items-center gap-2`} data-testid="scheme-actions">
          <span className="text-sm">{t('{name} selected', { name: { t: stoneInfo(selStone.sign).name } })}</span>
          <button className={btn} data-testid="scheme-note-edit" onClick={() => setNoteFor(selStone.id)}>
            {t('Note')}
          </button>
          <button className={btnDanger} data-testid="scheme-remove-stone" onClick={() => removeStone(selStone.id)}>
            {t('Remove stone')}
          </button>
          <button className={btn} onClick={() => setSel(null)}>
            {t('Cancel')}
          </button>
        </div>
      )}

      </div>

      <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2">
      <div className={card} data-testid="scheme-status" data-legal={check.ok ? 'true' : 'false'}>
        {check.ok ? (
          <span className="text-green-400">{t('Legal scheme')}</span>
        ) : (
          <>
            <div className="text-red-400">{t('Illegal')}</div>
            <ul className="mt-1 list-disc pl-5 text-sm opacity-80">
              {check.errors.map((e, i) => (
                <li key={i}>{t(e.key, e.params)}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Lockable id="fine_tuning">
      <section aria-label={t('Spell Fine Tuning')} className={card}>
        <h3 className={heading}>{t('Spell Fine Tuning')}</h3>
        <p className="mb-2 text-xs opacity-50">{t('Runes are a placeholder for now: put them in the order you want.')}</p>
        <div className="flex gap-2" data-testid="runes">
          {work.runes.map((r, i) => (
            <div key={r} className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1" data-testid="rune">
              <button className="h-8 w-8 rounded bg-white/10 disabled:opacity-30" disabled={i === 0} aria-label={t('Move left')} onClick={() => moveRune(i, -1)}>
                &lt;
              </button>
              <span className="w-6 text-center text-lg">{r}</span>
              <button className="h-8 w-8 rounded bg-white/10 disabled:opacity-30" disabled={i === work.runes.length - 1} aria-label={t('Move right')} onClick={() => moveRune(i, 1)}>
                &gt;
              </button>
            </div>
          ))}
        </div>
      </section>
      </Lockable>

      <button className={btnPrimary} data-testid="spell-save" disabled={busy || !work.name.trim()} onClick={save}>
        {work.id ? t('Save changes') : t('Save to Spell Drafts')}
      </button>
      {!check.ok && <p className="text-xs opacity-60">{t('An illegal scheme is still saved as a draft, marked Illegal, but it cannot be crafted.')}</p>}
      </div>

      {noteFor && <NoteDialog stone={scheme.stones.find((x) => x.id === noteFor)} onClose={() => setNoteFor(null)} onSave={(note) => { setScheme({ ...scheme, stones: scheme.stones.map((x) => (x.id === noteFor ? { ...x, note } : x)) }); setShown(note.trim() ? noteFor : null); }} />}
    </div>
  );
}

function NoteDialog({ stone, onClose, onSave }) {
  const t = useT();
  const [text, setText] = useState(stone?.note ?? '');
  if (!stone) return null;
  return (
    <FormDialog title={t('Note on {name}', { name: { t: stoneInfo(stone.sign).name } })} submitLabel={t('Save')} onClose={onClose} run={async () => { onSave(text.slice(0, MAX_NOTE)); return { ok: true }; }}>
      <textarea className={`${input} min-h-24`} data-testid="stone-note-text" aria-label={t('Note')} autoFocus value={text} maxLength={MAX_NOTE} onChange={(e) => setText(e.target.value)} />
    </FormDialog>
  );
}

// ---- Compendium of saved drafts --------------------------------------------------------------------------

function Drafts({ s, setWork, goEditor, goSpells }) {
  const t = useT();
  const { toast } = useApp();
  const [query, setQuery] = useState('');
  const [signs, setSigns] = useState([]);
  const [craft, setCraft] = useState(null);
  const [remove, setRemove] = useState(null);
  const q = query.trim().toLowerCase();
  const list = s.sheet.spellDrafts.filter((d) => {
    if (signs.some((sign) => !d.scheme.stones.some((x) => x.sign === sign))) return false;
    return !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
  });
  const toggle = (sign) => setSigns(signs.includes(sign) ? signs.filter((x) => x !== sign) : [...signs, sign]);

  async function doCraft(d) {
    const r = await call('spell:craft', { characterId: s.characterId, draftId: d.id });
    if (!r.ok) return r;
    toast(t('Crafted {name}.', { name: d.name }));
    goSpells();
    return r;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input className={`${input} col-span-full`} type="search" data-testid="draft-search" aria-label={t('Search')} placeholder={t('Search names and descriptions')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="col-span-full flex flex-wrap gap-2" aria-label={t('Stones used')}>
        {STONES.map((x) => (
          <StoneChip key={x.sign} sign={x.sign} size={38} data-testid={`filter-${x.sign}`} aria-pressed={signs.includes(x.sign)} style={{ width: 38, height: 38, border: `3px solid ${KIND_COLORS[x.kind]}`, opacity: signs.length && !signs.includes(x.sign) ? 0.45 : 1, outline: signs.includes(x.sign) ? '2px solid #fff' : 'none' }} onClick={() => toggle(x.sign)} />
        ))}
      </div>
      {list.length === 0 && <p className="col-span-full text-sm opacity-60">{s.sheet.spellDrafts.length ? t('No draft matches.') : t('No drafts yet.')}</p>}
      {list.map((d) => {
        const ok = validateScheme(d.scheme).ok;
        return (
          <div key={d.id} className={card} data-testid="draft" data-name={d.name}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              {!ok && (
                <span className="text-sm font-semibold text-red-400" data-testid="draft-illegal">
                  {t('Illegal')}
                </span>
              )}
            </div>
            {d.description && <p className="whitespace-pre-wrap text-sm opacity-70">{d.description}</p>}
            <SchemeView scheme={d.scheme} mini />
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btn} data-testid="draft-edit" onClick={() => { setWork({ id: d.id, name: d.name, description: d.description, scheme: d.scheme, runes: d.runes }); goEditor(); }}>
                {t('Edit')}
              </button>
              <button className={btnPrimary} data-testid="draft-craft" onClick={() => setCraft(d)}>
                {t('Craft')}
              </button>
              <button className={btnDanger} onClick={() => setRemove(d)}>
                {t('Delete')}
              </button>
            </div>
          </div>
        );
      })}
      {craft && <CraftDialog s={s} draft={craft} onClose={() => setCraft(null)} onCraft={() => doCraft(craft)} />}
      {remove && (
        <FormDialog title={t('Delete draft')} submitLabel={t('Delete')} danger onClose={() => setRemove(null)} run={() => s.list('spellDrafts', 'remove', { id: remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: remove.name })}</p>
        </FormDialog>
      )}
    </div>
  );
}

function CraftDialog({ s, draft, onClose, onCraft }) {
  const t = useT();
  const need = stonesNeeded(draft.scheme);
  const legal = validateScheme(draft.scheme).ok;
  const enough = Object.entries(need).every(([sign, n]) => s.sheet.stones[sign] >= n);
  const notes = draft.scheme.stones.filter((x) => x.note.trim());
  return (
    <FormDialog title={t('Craft {name}', { name: draft.name })} submitLabel={t('Craft')} onClose={onClose} canSubmit={legal && enough} run={onCraft}>
      {!legal && <p className="text-sm text-red-400">{t('This scheme is illegal, so it cannot be crafted.')}</p>}
      <ul className="flex flex-col gap-1 text-sm" data-testid="craft-needs">
        {Object.entries(need).map(([sign, n]) => (
          <li key={sign} className={s.sheet.stones[sign] >= n ? '' : 'text-red-400'} data-testid="craft-need" data-sign={sign}>
            {t('{name}: needs {need}, you have {have}', { name: { t: stoneInfo(sign).name }, need: n, have: s.sheet.stones[sign] })}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          {t('Notes')}
          {notes.map((x) => (
            <div key={x.id} className="rounded-lg bg-white/5 p-2">
              <span className="font-medium">{t(stoneInfo(x.sign).name)}:</span> {x.note}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs opacity-60">{t('Crafting spends these stones and makes a Magic roll in the chat (only for the GM to see how skilled you are).')}</p>
    </FormDialog>
  );
}

// ---- Finished spells ------------------------------------------------------------------------------------------

function Spells({ s, draft, setDraft }) {
  const t = useT();
  const { identity } = useApp();
  const gm = identity.role === 'gm';
  const [dialog, setDialog] = useState(null); // { spell } to edit, { spell: null } to grant
  const [remove, setRemove] = useState(null);
  const chosenWeapon = draft.weapon;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {s.sheet.spells.length === 0 && <p className="col-span-full text-sm opacity-60">{t('No spells yet. Craft one from a draft.')}</p>}
      {s.sheet.spells.map((sp) => {
        const isWeapon = sp.effect.kind === 'weapon';
        const enhId = `spell:${sp.id}`;
        return (
          <div key={sp.id} className={`${card} ${sp.destroyed ? 'opacity-50' : ''} ${chosenWeapon === `spell:${sp.id}` || (draft.counts[enhId] ?? 0) > 0 ? 'ring-2 ring-blue-400' : ''}`} data-testid="spell" data-name={sp.name} data-destroyed={sp.destroyed ? 'true' : 'false'}>
            <div className="flex items-center gap-2">
              <DamageIcon kind={sp.icon} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {sp.name} {sp.tattoo && <span className="rounded bg-red-900/60 px-1.5 text-xs" data-testid="spell-tattoo">{t('Spell tattoo')}</span>}
                </div>
                <div className="text-xs opacity-70">
                  {sp.destroyed ? t('Destroyed') : sp.tattoo ? t('No uses') : t('Uses {cur}/{max}', { cur: sp.uses.current, max: sp.uses.max })} | {t('Stabilization {n}', { n: sp.stabilization })}
                </div>
              </div>
            </div>
            {sp.description && <p className="mt-1 whitespace-pre-wrap text-sm opacity-70">{sp.description}</p>}
            <p className="mt-1 text-xs opacity-70">{isWeapon ? `${t('Weapon')}: ${weaponSummary(sp.effect.weapon, t)}` : `${t('Enhancement')}: ${enhancementSummary(sp.effect.enhancement, s.sheet.items, t)}`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!sp.destroyed &&
                (isWeapon ? (
                  <button className={chosenWeapon === `spell:${sp.id}` ? btnPrimary : btn} data-testid="spell-use" aria-pressed={chosenWeapon === `spell:${sp.id}`} onClick={() => setDraft({ ...draft, weapon: `spell:${sp.id}` })}>
                    {chosenWeapon === `spell:${sp.id}` ? t('Chosen as weapon') : t('Use as weapon')}
                  </button>
                ) : (
                  <button className={(draft.counts[enhId] ?? 0) > 0 ? btnPrimary : btn} data-testid="spell-use" aria-pressed={(draft.counts[enhId] ?? 0) > 0} onClick={() => setDraft({ ...draft, counts: { ...draft.counts, [enhId]: (draft.counts[enhId] ?? 0) > 0 ? 0 : 1 } })}>
                    {(draft.counts[enhId] ?? 0) > 0 ? t('Chosen') : t('Add to attack')}
                  </button>
                ))}
              {(!sp.destroyed || gm) && (
                <button className={btn} data-testid="spell-edit" onClick={() => setDialog({ spell: sp })}>
                  {t('Edit')}
                </button>
              )}
              <button className={btnDanger} data-testid="spell-delete" onClick={() => setRemove(sp)}>
                {t('Delete')}
              </button>
            </div>
          </div>
        );
      })}
      {gm && (
        <button className={`${btn} col-span-full`} data-testid="spell-grant" onClick={() => setDialog({ spell: null })}>
          {t('Grant a spell')}
        </button>
      )}
      {dialog && <SpellDialog s={s} spell={dialog.spell} gm={gm} onClose={() => setDialog(null)} />}
      {remove && (
        <FormDialog title={t('Delete spell')} submitLabel={t('Delete')} danger onClose={() => setRemove(null)} run={() => call('spell:remove', { characterId: s.characterId, id: remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: remove.name })}</p>
        </FormDialog>
      )}
    </div>
  );
}

function SpellDialog({ s, spell, gm, onClose }) {
  const t = useT();
  const items = s.sheet.items;
  const [name, setName] = useState(spell?.name ?? '');
  const [description, setDescription] = useState(spell?.description ?? '');
  const [icon, setIcon] = useState(spell?.icon ?? 'fire');
  const [kind, setKind] = useState(spell?.effect.kind ?? 'weapon');
  const [weapon, setWeapon] = useState(() => weaponToForm(spell?.effect.weapon ?? { base: 1, kind: 'fire', defence: 'physical', ap: 1, range: null, statuses: [], dice: [], unique: [] }));
  const [enh, setEnh] = useState(() => enhancementToForm(spell?.effect.kind === 'enhancement' ? spell.effect.enhancement : null, items));
  const [tattoo, setTattoo] = useState(spell?.tattoo ?? false);
  const [max, setMax] = useState(String(spell?.uses.max ?? 1));
  const [cur, setCur] = useState(String(spell?.uses.current ?? 1));
  const [stab, setStab] = useState(String(spell?.stabilization ?? 10));
  const valid = name.trim() && (kind === 'weapon' ? weaponValid(weapon) : enhancementValid({ ...enh, name: name.trim() })) && (!gm || (isNum(max, 1, D.ITEM_USES_MAX) && isNum(cur, 0, D.ITEM_USES_MAX) && isNum(stab, 0, 999)));

  function run() {
    const effect = kind === 'weapon' ? { kind, weapon: formToWeapon(weapon) } : { kind, enhancement: formToEnhancement({ ...enh, name: name.trim() }) };
    const base = { name: name.trim(), description, icon, effect };
    const extra = gm ? { tattoo, uses: { max: Number(max), current: Math.min(Number(cur), Number(max)) }, stabilization: Number(stab) } : {};
    return spell ? call('spell:update', { characterId: s.characterId, id: spell.id, patch: { ...base, ...extra } }) : call('spell:grant', { characterId: s.characterId, spell: { ...base, ...extra } });
  }

  return (
    <FormDialog title={spell ? t('Edit spell') : t('Grant a spell')} submitLabel={spell ? t('Save') : t('Grant')} onClose={onClose} canSubmit={!!valid} run={run}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="spell-edit-name" value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-16`} value={description} maxLength={D.TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        {t('Icon')}
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Icon')}>
          {ICON_KEYS.map((k) => (
            <button type="button" key={k} role="radio" aria-checked={icon === k} data-testid={`icon-${k}`} title={t(k.charAt(0).toUpperCase() + k.slice(1))} className={`rounded-lg p-1.5 ${icon === k ? 'bg-white/25 ring-2 ring-white' : 'bg-white/10'}`} onClick={() => setIcon(k)}>
              <DamageIcon kind={k} size={26} />
            </button>
          ))}
        </div>
      </div>
      <EffectEditor kind={kind} setKind={setKind} weapon={weapon} setWeapon={setWeapon} enh={enh} setEnh={setEnh} items={items} />
      {gm && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
          <div className="text-xs uppercase tracking-wide opacity-60">{t('Set by the GM')}</div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spell-tattoo-toggle" checked={tattoo} onChange={(e) => setTattoo(e.target.checked)} />
            {t('Spell tattoo (no uses; durability is a Strength Save)')}
          </label>
          {!tattoo && (
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                {t('Uses left')}
                <input className={input} aria-label={t('Uses left')} value={cur} onChange={(e) => setCur(e.target.value)} />
              </label>
              <label className={label}>
                {t('Max uses')}
                <input className={input} aria-label={t('Max uses')} value={max} onChange={(e) => setMax(e.target.value)} />
              </label>
            </div>
          )}
          <label className={label}>
            {t('Stabilization')}
            <input className={input} aria-label={t('Stabilization')} value={stab} onChange={(e) => setStab(e.target.value)} />
          </label>
        </div>
      )}
    </FormDialog>
  );
}

