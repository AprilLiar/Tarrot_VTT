import { useState } from 'react';
import { btn, input } from '../Dialog.jsx';
import { IntInput } from '../sheet/fields.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { DiceList, StatusList, isNum, label, select, box } from '../arcane/editors.jsx';
import * as D from '../../../../shared/rules-data.js';
import { DURATIONS, DURATION_LABELS, PART_TYPES, PART_LABELS, MAX_PARTS, MAX_USES, allScopes } from '../../../../shared/effects.js';
import { EFFECT_ICONS } from '../scene/effectIconData.js';
import { effectCatalog } from './useEffectLibrary.js';
import { effectSummary, scopeText } from './effectText.js';
import { useT } from '../../i18n.jsx';

// The editor of an Effect (the monolith system of shared/effects.js): a name, how long it lasts, optional uses and a list of parts, each
// a lever.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const n0 = '0';

const blankPart = (type) => {
  switch (type) {
    case 'roll': return { type, scope: 'all', adv: n0, bonus: n0, dice: [] };
    case 'against': return { type, adv: n0, bonus: n0 };
    case 'defence': return { type, physical: n0, mental: n0 };
    case 'stats': return { type, movement: n0, maxAp: n0, maxHp: n0 };
    case 'combat': return { type, damageDealt: n0, damageTaken: n0, crit: n0, dc: n0 };
    case 'resist': return { type, kind: D.DAMAGE_TYPES[0], mode: 'flat', flat: '1' };
    case 'grant': return { type, statuses: [], temp: n0 };
    default: return { type: 'text', text: '' };
  }
};

const numFields = { roll: [['adv', -10, 10], ['bonus', -99, 99]], against: [['adv', -10, 10], ['bonus', -99, 99]], defence: [['physical', -99, 99], ['mental', -99, 99]], stats: [['movement', -99, 99], ['maxAp', -10, 10], ['maxHp', -999, 999]], combat: [['damageDealt', -99, 99], ['damageTaken', -99, 99], ['crit', -19, 19], ['dc', -99, 99]], resist: [], grant: [['temp', 0, 999]], text: [] };

const partToForm = (p) => {
  const f = { ...p };
  for (const [k] of numFields[p.type] ?? []) f[k] = String(p[k]);
  if (p.type === 'resist') f.flat = String(p.flat);
  return f;
};
const formToPart = (f) => {
  const p = { ...f };
  for (const [k] of numFields[f.type] ?? []) p[k] = Number(f[k]);
  if (f.type === 'resist') p.flat = f.mode === 'flat' ? Number(f.flat) : 0;
  return p;
};
const partValid = (f) => (numFields[f.type] ?? []).every(([k, lo, hi]) => isNum(f[k], lo, hi)) && (f.type !== 'resist' || f.mode !== 'flat' || isNum(f.flat, -99, 99));

export const effectToForm = (e) => ({
  name: e?.name ?? '',
  description: e?.description ?? '',
  icon: e?.icon ?? '',
  duration: e?.duration ?? 'long',
  usesOn: e?.uses != null,
  uses: String(e?.uses ?? 1),
  parts: (e?.parts ?? []).map(partToForm),
});
export const formToEffect = (f) => ({
  name: f.name.trim(),
  description: f.description,
  icon: f.icon,
  duration: f.duration,
  uses: f.usesOn ? Number(f.uses) : null,
  parts: f.parts.map(formToPart),
});
const effectValid = (f) => f.name.trim().length > 0 && (!f.usesOn || isNum(f.uses, 1, MAX_USES)) && f.parts.every(partValid);

function Num({ f, k, up, text }) {
  const t = useT();
  return (
    <label className={label}>
      {t(text)}
      <IntInput label={t(text)} value={f[k]} onChange={(v) => up({ [k]: v })} />
    </label>
  );
}

function PartEditor({ part, setPart, onRemove }) {
  const t = useT();
  const up = (patch) => setPart({ ...part, ...patch });
  return (
    <div className={box} data-testid="effect-part" data-type={part.type}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium">{t(PART_LABELS[part.type])}</div>
        <button type="button" className={`${btn} min-h-9 px-3`} aria-label={t('Remove part')} onClick={onRemove}>
          x
        </button>
      </div>
      {part.type === 'roll' && (
        <>
          <label className={label}>
            {t('Which rolls')}
            <select className={select} aria-label={t('Which rolls')} data-testid="part-scope" value={part.scope} onChange={(e) => up({ scope: e.target.value })}>
              {allScopes().map((s) => (
                <option key={s} value={s}>
                  {scopeText(s, t)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Num f={part} k="adv" up={up} text="Advantage (negative: Disadvantage)" />
            <Num f={part} k="bonus" up={up} text="Bonus" />
          </div>
          <DiceList value={part.dice} onChange={(v) => up({ dice: v })} title={t('Dice Roll Bonuses')} />
        </>
      )}
      {part.type === 'against' && (
        <>
          <p className="text-xs opacity-60">{t('Changes the attack rolls made AGAINST the one who has the Effect.')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Num f={part} k="adv" up={up} text="Advantage for the attacker (negative: Disadvantage)" />
            <Num f={part} k="bonus" up={up} text="Bonus for the attacker" />
          </div>
        </>
      )}
      {part.type === 'defence' && (
        <div className="grid grid-cols-2 gap-2">
          <Num f={part} k="physical" up={up} text="Physical Defence" />
          <Num f={part} k="mental" up={up} text="Mental Defence" />
        </div>
      )}
      {part.type === 'stats' && (
        <div className="grid grid-cols-3 gap-2">
          <Num f={part} k="movement" up={up} text="Movement" />
          <Num f={part} k="maxAp" up={up} text="Max AP" />
          <Num f={part} k="maxHp" up={up} text="Max HP" />
        </div>
      )}
      {part.type === 'combat' && (
        <div className="grid grid-cols-2 gap-2">
          <Num f={part} k="damageDealt" up={up} text="Damage it deals" />
          <Num f={part} k="damageTaken" up={up} text="Damage it takes" />
          <Num f={part} k="crit" up={up} text="Critical Hit threshold (negative lowers it)" />
          <Num f={part} k="dc" up={up} text="Save DC of its statuses" />
        </div>
      )}
      {part.type === 'resist' && (
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            {t('Damage type')}
            <select className={select} aria-label={t('Damage type')} value={part.kind} onChange={(e) => up({ kind: e.target.value })}>
              {D.DAMAGE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(cap(k))}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t('Kind')}
            <select className={select} aria-label={t('Kind')} value={part.mode} onChange={(e) => up({ mode: e.target.value })}>
              <option value="flat">{t('Flat (X)')}</option>
              <option value="half">{t('Half')}</option>
              <option value="double">{t('Double')}</option>
              <option value="immunity">{t('Immunity')}</option>
            </select>
          </label>
          {part.mode === 'flat' && <Num f={part} k="flat" up={up} text="X (positive takes less)" />}
        </div>
      )}
      {part.type === 'grant' && (
        <>
          <StatusList plain value={part.statuses} onChange={(v) => up({ statuses: v })} title={t('Statuses put on when it starts (they last as the Effect does)')} />
          <Num f={part} k="temp" up={up} text="Temp HP when it starts" />
        </>
      )}
      {part.type === 'text' && (
        <textarea className={`${input} min-h-16`} aria-label={t('Note')} placeholder={t('A note for the table (not automated)')} value={part.text} maxLength={D.TEXT_MAX} onChange={(e) => up({ text: e.target.value })} />
      )}
    </div>
  );
}

// The Effect dialog: for the GM's global library and for a character's own.
export function EffectDialog({ effect, onClose, onSave }) {
  const t = useT();
  const [f, setF] = useState(() => effectToForm(effect));
  const [adding, setAdding] = useState('roll');
  const up = (patch) => setF({ ...f, ...patch });
  return (
    <FormDialog title={effect ? t('Edit Effect') : t('New Effect')} submitLabel={effect ? t('Save') : t('Add')} onClose={onClose} canSubmit={effectValid(f)} run={() => onSave(formToEffect(f))}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="effect-name" value={f.name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => up({ name: e.target.value })} />
      </label>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-16`} value={f.description} maxLength={D.TEXT_MAX} onChange={(e) => up({ description: e.target.value })} />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        {t('How long it lasts')}
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={t('How long it lasts')} data-testid="effect-duration">
          {DURATIONS.map((d) => (
            <button type="button" key={d} role="radio" aria-checked={f.duration === d} data-testid={`effect-duration-${d}`} className={`min-h-9 rounded-md px-2 text-xs ${f.duration === d ? 'bg-violet-700 text-white' : 'bg-white/10 active:bg-white/20'}`} onClick={() => up({ duration: d })}>
              {t(DURATION_LABELS[d])}
            </button>
          ))}
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" data-testid="effect-uses-on" checked={f.usesOn} onChange={(e) => up({ usesOn: e.target.checked })} />
        {t('It ends after a number of attacks (Uses)')}
      </label>
      {f.usesOn && <IntInput label={t('Uses')} value={f.uses} onChange={(v) => up({ uses: v })} />}
      <label className={label}>
        {t('Icon on the token')}
        <select className={select} aria-label={t('Icon on the token')} data-testid="effect-icon" value={f.icon} onChange={(e) => up({ icon: e.target.value })}>
          <option value="">{t('Default')}</option>
          {Object.keys(EFFECT_ICONS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <div className="text-sm">{t('What it does')}</div>
      {f.parts.map((p, i) => (
        <PartEditor key={i} part={p} setPart={(next) => up({ parts: f.parts.map((x, j) => (j === i ? next : x)) })} onRemove={() => up({ parts: f.parts.filter((_, j) => j !== i) })} />
      ))}
      {f.parts.length < MAX_PARTS && (
        <div className="flex gap-2">
          <select className={select} aria-label={t('Part to add')} data-testid="effect-part-type" value={adding} onChange={(e) => setAdding(e.target.value)}>
            {PART_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(PART_LABELS[p])}
              </option>
            ))}
          </select>
          <button type="button" className={btn} data-testid="effect-add-part" onClick={() => up({ parts: [...f.parts, blankPart(adding)] })}>
            {t('Add part')}
          </button>
        </div>
      )}
    </FormDialog>
  );
}

export { effectCatalog, effectSummary };
