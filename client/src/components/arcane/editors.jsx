import { useState } from 'react';
import { btn, input } from '../Dialog.jsx';
import { IntInput, isWholeNumber } from '../sheet/fields.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import * as D from '../../../../shared/rules-data.js';
import { DICE_SIDES, MAX_LIST, MAX_AP_COST } from '../../../../shared/arcane.js';
import { useT } from '../../i18n.jsx';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const select = 'min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-2 text-base';
const label = 'flex flex-col gap-1 text-sm';
const box = 'flex flex-col gap-2 rounded-lg border border-white/10 p-2';

export const isNum = (v, min, max) => isWholeNumber(v) && Number(v) >= min && Number(v) <= max;

// ---- Pieces shared by the weapon and Enhancement forms ---------------------------------------------

export function DamageKindSelect({ value, onChange, withTrue = false, testId, aria }) {
  const t = useT();
  return (
    <select className={select} aria-label={aria} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
      {D.DAMAGE_TYPES.map((k) => (
        <option key={k} value={k}>
          {t(cap(k))}
        </option>
      ))}
      {withTrue && <option value="true">{t('True (ignores resistances)')}</option>}
    </select>
  );
}

// [{ key, stacks }]: statuses put on somebody.
export function StatusList({ value, onChange, title }) {
  const t = useT();
  const name = (key) => D.STATUSES.find((s) => s.key === key)?.name;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {title}
      <div className="flex flex-wrap items-center gap-2">
        {value.map((s, i) => {
          const info = D.STATUSES.find((x) => x.key === s.key);
          return (
            <span key={s.key} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1">
              {t(name(s.key))}
              {info?.stackable && (
                <input
                  type="number"
                  min="1"
                  max="10"
                  aria-label={t('{name} stacks', { name: { t: name(s.key) } })}
                  className="w-12 rounded bg-black/40 px-1 text-center"
                  value={s.stacks}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, stacks: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } : x)))}
                />
              )}
              <button type="button" className="h-7 w-7 rounded-full bg-white/10" aria-label={t('Remove {name}', { name: { t: name(s.key) } })} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                x
              </button>
            </span>
          );
        })}
        {value.length < MAX_LIST && (
          <select
            className="min-h-9 rounded-lg border border-white/20 bg-black/30 px-2 text-sm"
            aria-label={t('Add a status')}
            value=""
            onChange={(e) => e.target.value && !value.some((s) => s.key === e.target.value) && onChange([...value, { key: e.target.value, stacks: 1 }])}
          >
            <option value="">{t('Add status...')}</option>
            {D.STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.name)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// [{ sides, sign }]: Dice Roll Bonuses, rolled next to the d20 and added (+) or subtracted (-).
export function DiceList({ value, onChange, title }) {
  const t = useT();
  const [sides, setSides] = useState(6);
  const [sign, setSign] = useState(1);
  return (
    <div className="flex flex-col gap-1 text-sm">
      {title}
      <div className="flex flex-wrap items-center gap-2">
        {value.map((d, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1" data-testid="dice-chip">
            {d.sign < 0 ? '-' : '+'}d{d.sides}
            <button type="button" className="h-7 w-7 rounded-full bg-white/10" aria-label={t('Remove die')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              x
            </button>
          </span>
        ))}
      </div>
      {value.length < MAX_LIST && (
        <div className="flex gap-2">
          <select className="min-h-9 rounded-lg border border-white/20 bg-black/30 px-2" aria-label={t('Add or subtract')} value={sign} onChange={(e) => setSign(Number(e.target.value))}>
            <option value={1}>+</option>
            <option value={-1}>-</option>
          </select>
          <select className="min-h-9 rounded-lg border border-white/20 bg-black/30 px-2" aria-label={t('Die size')} value={sides} onChange={(e) => setSides(Number(e.target.value))}>
            {DICE_SIDES.map((n) => (
              <option key={n} value={n}>
                d{n}
              </option>
            ))}
          </select>
          <button type="button" className={btn} data-testid="add-die" onClick={() => onChange([...value, { sides, sign }])}>
            {t('Add die')}
          </button>
        </div>
      )}
    </div>
  );
}

// [{ name, text }]: Unique Effects, only shown in the chat.
export function UniqueList({ value, onChange, title }) {
  const t = useT();
  const set = (i, patch) => onChange(value.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  return (
    <div className="flex flex-col gap-2 text-sm">
      {title}
      {value.map((u, i) => (
        <div key={i} className={box} data-testid="unique-effect">
          <input className={input} placeholder={t('Effect name')} aria-label={t('Effect name')} value={u.name} maxLength={D.NAME_MAX} onChange={(e) => set(i, { name: e.target.value })} />
          <textarea className={`${input} min-h-16`} placeholder={t('What it does (shown in the chat)')} aria-label={t('What it does (shown in the chat)')} value={u.text} maxLength={D.TEXT_MAX} onChange={(e) => set(i, { text: e.target.value })} />
          <button type="button" className={btn} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            {t('Remove effect')}
          </button>
        </div>
      ))}
      {value.length < MAX_LIST && (
        <button type="button" className={btn} data-testid="add-unique" onClick={() => onChange([...value, { name: '', text: '' }])}>
          {t('Add Unique Effect')}
        </button>
      )}
    </div>
  );
}

// ---- Weapon --------------------------------------------------------------------------------------------

export const weaponToForm = (w) => ({ base: String(w.base), kind: w.kind, defence: w.defence, ap: String(w.ap), range: w.range == null ? '' : String(w.range), statuses: w.statuses, dice: w.dice, unique: w.unique });
export const weaponValid = (f) => isNum(f.base, 0, 999) && isNum(f.ap, 0, MAX_AP_COST) && (f.range.trim() === '' || isNum(f.range, 0, 999));
export const formToWeapon = (f) => ({
  base: Number(f.base),
  kind: f.kind,
  defence: f.defence,
  ap: Number(f.ap),
  range: f.range.trim() === '' ? null : Number(f.range),
  statuses: f.statuses,
  dice: f.dice,
  unique: f.unique.filter((u) => u.name.trim()),
});

// The fields of a weapon: damage, type, Defence, AP, Range and what it adds on top.
export function WeaponFields({ form, setForm }) {
  const t = useT();
  const up = (patch) => setForm({ ...form, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          {t('Base damage')}
          <IntInput label={t('Base damage')} value={form.base} onChange={(v) => up({ base: v })} />
        </label>
        <label className={label}>
          {t('Damage type')}
          <DamageKindSelect value={form.kind} onChange={(v) => up({ kind: v })} aria={t('Damage type')} testId="weapon-kind" />
        </label>
        <label className={label}>
          {t('Attacks')}
          <select className={select} aria-label={t('Defence it is rolled against')} data-testid="weapon-defence" value={form.defence} onChange={(e) => up({ defence: e.target.value })}>
            <option value="physical">{t('vs Physical Defence')}</option>
            <option value="mental">{t('vs Mental Defence')}</option>
          </select>
        </label>
        <label className={label}>
          {t('AP cost')}
          <IntInput label={t('AP cost')} value={form.ap} onChange={(v) => up({ ap: v })} />
        </label>
        <label className={`${label} col-span-2`}>
          {t('Range in Spaces (empty for no range check)')}
          <IntInput label={t('Range')} value={form.range} onChange={(v) => up({ range: v })} />
        </label>
      </div>
      <StatusList value={form.statuses} onChange={(v) => up({ statuses: v })} title={t('Adds these statuses to targets that are hit')} />
      <DiceList value={form.dice} onChange={(v) => up({ dice: v })} title={t('Dice Roll Bonuses')} />
      <UniqueList value={form.unique} onChange={(v) => up({ unique: v })} title={t('Unique Effects')} />
    </div>
  );
}

// ---- Enhancement -----------------------------------------------------------------------------------------

export const enhancementToForm = (e, items) => ({
  name: e?.name ?? '',
  description: e?.description ?? '',
  repeatable: e?.repeatable ?? false,
  ap: String(e?.cost.ap ?? 0),
  dmgOn: !!e?.cost.damage,
  dmgAmount: String(e?.cost.damage?.amount ?? 1),
  dmgKind: e?.cost.damage?.kind ?? 'true',
  costStatuses: e?.cost.statuses ?? [],
  itemOn: !!e?.cost.item,
  itemId: e?.cost.item?.itemId ?? items[0]?.id ?? '',
  itemUses: String(e?.cost.item?.uses ?? 1),
  damage: String(e?.effect.damage ?? 0),
  range: String(e?.effect.range ?? 0),
  advantage: String(e?.effect.advantage ?? 0),
  statuses: e?.effect.statuses ?? [],
  dice: e?.effect.dice ?? [],
  unique: e?.effect.unique ?? [],
});

export const formToEnhancement = (f) => ({
  name: f.name.trim(),
  description: f.description,
  repeatable: f.repeatable,
  cost: {
    ap: Number(f.ap),
    damage: f.dmgOn ? { amount: Number(f.dmgAmount), kind: f.dmgKind } : null,
    statuses: f.costStatuses,
    item: f.itemOn && f.itemId ? { itemId: f.itemId, uses: Number(f.itemUses) } : null,
  },
  effect: {
    damage: Number(f.damage),
    range: Number(f.range),
    advantage: Number(f.advantage),
    statuses: f.statuses,
    dice: f.dice,
    unique: f.unique.filter((u) => u.name.trim()),
  },
});

export const enhancementValid = (f) =>
  f.name.trim().length > 0 &&
  isNum(f.ap, 0, MAX_AP_COST) &&
  isNum(f.dmgAmount, 1, 999) &&
  isNum(f.itemUses, 1, D.ITEM_USES_MAX) &&
  isNum(f.damage, -99, 99) &&
  isNum(f.range, -99, 99) &&
  isNum(f.advantage, -10, 10);

// The fields of an Enhancement (a spell whose effect is an Enhancement uses them too). `items` are the items
// of the character it belongs to (for the Item cost); a global Enhancement has none.
export function EnhancementFields({ f, setF, items, withName = true }) {
  const t = useT();
  const up = (patch) => setF({ ...f, ...patch });
  return (
    <>
      {withName && (
        <>
          <label className={label}>
            {t('Name')}
            <input className={input} data-testid="enh-name" value={f.name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => up({ name: e.target.value })} />
          </label>
          <label className={label}>
            {t('Description')}
            <textarea className={`${input} min-h-16`} value={f.description} maxLength={D.TEXT_MAX} onChange={(e) => up({ description: e.target.value })} />
          </label>
        </>
      )}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" data-testid="enh-repeatable" checked={f.repeatable} onChange={(e) => up({ repeatable: e.target.checked })} />
        {t('Repeatable (can be used several times in one attack)')}
      </label>
      <div className={box}>
        <div className="text-xs uppercase tracking-wide opacity-60">{t('Cost')}</div>
        <label className={label}>
          {t('AP')}
          <IntInput label={t('AP')} value={f.ap} onChange={(v) => up({ ap: v })} />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={f.dmgOn} onChange={(e) => up({ dmgOn: e.target.checked })} />
          {t('You take damage')}
        </label>
        {f.dmgOn && (
          <div className="grid grid-cols-2 gap-2">
            <IntInput label={t('Damage taken')} value={f.dmgAmount} onChange={(v) => up({ dmgAmount: v })} />
            <DamageKindSelect value={f.dmgKind} onChange={(v) => up({ dmgKind: v })} withTrue aria={t('Damage type')} />
          </div>
        )}
        <StatusList value={f.costStatuses} onChange={(v) => up({ costStatuses: v })} title={t('You gain these statuses')} />
        {items.length > 0 && (
          <>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={f.itemOn} onChange={(e) => up({ itemOn: e.target.checked })} />
              {t('It spends uses of an item')}
            </label>
            {f.itemOn && (
              <div className="grid grid-cols-2 gap-2">
                <select className={select} aria-label={t('Item')} value={f.itemId} onChange={(e) => up({ itemId: e.target.value })}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <IntInput label={t('Uses spent')} value={f.itemUses} onChange={(v) => up({ itemUses: v })} />
              </div>
            )}
          </>
        )}
      </div>

      <div className={box}>
        <div className="text-xs uppercase tracking-wide opacity-60">{t('Effect')}</div>
        <div className="grid grid-cols-3 gap-2">
          <label className={label}>
            {t('Damage')}
            <IntInput label={t('Damage')} value={f.damage} onChange={(v) => up({ damage: v })} />
          </label>
          <label className={label}>
            {t('Range')}
            <IntInput label={t('Range')} value={f.range} onChange={(v) => up({ range: v })} />
          </label>
          <label className={label}>
            {t('Advantage')}
            <IntInput label={t('Advantage')} value={f.advantage} onChange={(v) => up({ advantage: v })} />
          </label>
        </div>
        <p className="text-xs opacity-50">{t('Damage is added to the weapon\'s damage of its own type. Advantage counts levels (negative is Disadvantage).')}</p>
        <StatusList value={f.statuses} onChange={(v) => up({ statuses: v })} title={t('Adds these statuses to targets that are hit')} />
        <DiceList value={f.dice} onChange={(v) => up({ dice: v })} title={t('Dice Roll Bonuses')} />
        <UniqueList value={f.unique} onChange={(v) => up({ unique: v })} title={t('Unique Effects')} />
      </div>
    </>
  );
}

export function EnhancementDialog({ enhancement, items, onClose, onSave }) {
  const t = useT();
  const [f, setF] = useState(() => enhancementToForm(enhancement, items));
  return (
    <FormDialog title={enhancement ? t('Edit Enhancement') : t('New Enhancement')} submitLabel={enhancement ? t('Save') : t('Add')} onClose={onClose} canSubmit={enhancementValid(f)} run={() => onSave(formToEnhancement(f))}>
      <EnhancementFields f={f} setF={setF} items={items} />
    </FormDialog>
  );
}

// The effect of a spell or a Manifestation: a Weapon or an Enhancement, with the fields of each.
export function EffectEditor({ kind, setKind, weapon, setWeapon, enh, setEnh, items }) {
  const t = useT();
  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Effect')}>
        {['weapon', 'enhancement'].map((k) => (
          <button type="button" key={k} role="radio" aria-checked={kind === k} data-testid={`effect-${k}`} className={`${btn} ${kind === k ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setKind(k)}>
            {k === 'weapon' ? t('Weapon') : t('Enhancement')}
          </button>
        ))}
      </div>
      {kind === 'weapon' ? <WeaponFields form={weapon} setForm={setWeapon} /> : <EnhancementFields f={enh} setF={setEnh} items={items} withName={false} />}
    </>
  );
}
