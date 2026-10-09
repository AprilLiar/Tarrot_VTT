import { useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { IntInput } from '../sheet/fields.jsx';
import { StatusList, isNum, label, select } from '../arcane/editors.jsx';
import { EffectRefs } from './EffectRefs.jsx';
import { useEffectLibrary } from './useEffectLibrary.js';
import * as D from '../../../../shared/rules-data.js';
import { HELP_SIDES } from '../../../../shared/help.js';
import { MAX_AP_COST } from '../../../../shared/arcane.js';
import { DEFAULT_ACTION_PREFIX } from '../../../../shared/basicActions.js';
import { useT } from '../../i18n.jsx';


// The Basic Actions the GM keeps for everyone; kept up to date while the GM edits them.
export function useBasicActions() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      call('basic:list').then((r) => {
        if (alive && r.ok) setList(r.actions);
      });
    const onList = (m) => setList(m.actions);
    load();
    socket.on('connect', load);
    socket.on('basic:actions', onList);
    return () => {
      alive = false;
      socket.off('connect', load);
      socket.off('basic:actions', onList);
    };
  }, []);
  return list;
}

// What an action rolls, as a pair of a kind and a key in the dialog.
const rollKinds = ['none', 'weapon', 'attribute', 'skill', 'mastery'];
const rollKeys = {
  attribute: () => D.STATS.map((k) => [k, D.STAT_LABELS[k]]),
  skill: () => D.SKILLS.map((s) => [s.key, s.label]),
  mastery: () => D.MASTERIES.map((m) => [m, D.MASTERY_LABELS[m]]),
};

function ActionDialog({ action, onClose }) {
  const t = useT();
  const [name, setName] = useState(action?.name ?? '');
  const [description, setDescription] = useState(action?.description ?? '');
  const [ap, setAp] = useState(String(action?.ap ?? 1));
  const [kind, setKind] = useState(action?.roll?.kind ?? 'none');
  const [key, setKey] = useState(action?.roll?.key ?? '');
  const [effects, setEffects] = useState(action?.effects ?? []);
  const [selfStatuses, setSelfStatuses] = useState((action?.statuses ?? []).filter((s) => s.to === 'self'));
  const [targetStatuses, setTargetStatuses] = useState((action?.statuses ?? []).filter((s) => s.to !== 'self'));
  const [help, setHelp] = useState(action?.help?.sides ?? 0);
  const keys = rollKeys[kind]?.() ?? [];
  const rollKey = keys.some(([k]) => k === key) ? key : keys[0]?.[0];
  const valid = name.trim() && isNum(ap, 0, MAX_AP_COST);
  const run = () =>
    call('basic:save', {
      id: action?.id,
      action: { name: name.trim(), description, ap: Number(ap), roll: kind === 'none' ? null : kind === 'weapon' ? { kind: 'weapon', key: 'prime' } : { kind, key: rollKey }, effects, statuses: [...selfStatuses.map((s) => ({ ...s, to: 'self' })), ...targetStatuses.map((s) => ({ ...s, to: 'target' }))], help: help ? { sides: help } : null },
    });
  return (
    <FormDialog title={action ? t('Edit Basic Action') : t('New Basic Action')} submitLabel={action ? t('Save') : t('Add')} onClose={onClose} canSubmit={!!valid} run={run}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="action-name" value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-20`} value={description} maxLength={D.TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className={label}>
        {t('AP cost')}
        <IntInput label={t('AP cost')} value={ap} onChange={setAp} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          {t('Roll')}
          <select className={select} aria-label={t('Roll')} data-testid="action-roll-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="none">{t('No roll')}</option>
            <option value="weapon">{t('Weapon attack (Prime + Experience)')}</option>
            <option value="attribute">{t('An Attribute')}</option>
            <option value="skill">{t('A Skill')}</option>
            <option value="mastery">{t('A Combat Mastery')}</option>
          </select>
        </label>
        {keys.length > 0 && (
          <label className={label}>
            {t('Which one')}
            <select className={select} aria-label={t('Which one')} data-testid="action-roll-key" value={rollKey} onChange={(e) => setKey(e.target.value)}>
              {keys.map(([k, text]) => (
                <option key={k} value={k}>
                  {t(text)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <EffectRefs value={effects} onChange={setEffects} title={t('Effects it puts on')} />
      <StatusList value={selfStatuses} onChange={setSelfStatuses} title={t('Statuses it puts on the user')} />
      <StatusList value={targetStatuses} onChange={setTargetStatuses} title={t('Statuses it puts on the selected targets')} />
      <label className={label}>
        {t('Gives a Help Die to the selected targets')}
        <select className={select} aria-label={t('Help Die')} data-testid="action-help" value={help} onChange={(e) => setHelp(Number(e.target.value))}>
          <option value={0}>{t('None')}</option>
          {HELP_SIDES.map((n) => (
            <option key={n} value={n}>
              d{n}
            </option>
          ))}
        </select>
      </label>
    </FormDialog>
  );
}

// The Basic Actions in the General tab: a button opens a small list (closed at first). With a character (`s`) each row has a button that
// uses the action (spends the AP, rolls, puts the Effects and statuses on); tapping a name shows its text. Without one (the GM's
// general tab) each row can be edited or deleted.
export function BasicActions({ s = null }) {
  const t = useT();
  const { identity, toast } = useApp();
  const actions = useBasicActions();
  const globals = useEffectLibrary();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(null); // the action whose text is open
  const [dialog, setDialog] = useState(null); // { action } to edit or add, or { remove }
  const gm = identity.role === 'gm';
  const nameOf = (id) => globals.find((e) => e.id === id)?.name ?? t('(missing Effect)');
  const to = (w) => (w === 'self' ? t('on the user') : t('on the targets'));
  async function use(a) {
    const r = await call('basic:use', { characterId: s.characterId, actionId: a.id });
    if (!r.ok) toast(r.error);
  }
  const gives = (a) => [
    ...a.effects.map((r) => `${nameOf(r.id)} (${to(r.to)})`),
    ...a.statuses.map((st) => `${t(D.STATUSES.find((x) => x.key === st.key)?.name)} (${to(st.to)})`),
    ...(a.help ? [t('Help Die d{n}', { n: a.help.sides })] : []),
  ];
  return (
    <section aria-label={t('Basic Actions')}>
      <button className={`${btn} flex w-full items-center justify-between sm:w-auto sm:min-w-56`} data-testid="basic-actions-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t('Basic Actions')}</span>
        <span aria-hidden className="ml-3 opacity-60">
          {open ? '-' : '+'}
        </span>
      </button>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="basic-actions">
          {!s && <p className="col-span-full text-xs opacity-50">{t('The Basic Actions every character has (from DC20). Edit them, delete them or add your own.')}</p>}
          {actions.map((a) => {
            const isDefault = a.id.startsWith(DEFAULT_ACTION_PREFIX);
            const extra = gives(a);
            return (
              <div key={a.id} className="self-start rounded-xl border border-white/10 bg-white/5 px-2 py-1" data-testid="basic-action" data-name={a.name}>
                <div className="flex min-h-9 items-center gap-2">
                  <button className="min-w-0 flex-1 truncate text-left text-sm font-medium" aria-expanded={shown === a.id} data-testid="action-name-toggle" onClick={() => setShown(shown === a.id ? null : a.id)}>
                    {isDefault ? t(a.name) : a.name}
                  </button>
                  <span className="rounded bg-white/10 px-1.5 text-xs">{t('{n} AP', { n: a.ap })}</span>
                  {s && (
                    <button className={`${btnPrimary} min-h-9 px-3`} data-testid="action-use" disabled={s.sheet.ap.current < a.ap} onClick={() => use(a)}>
                      {t('Use')}
                    </button>
                  )}
                  {!s && gm && (
                    <>
                      <button className={`${btn} min-h-9 px-3`} data-testid="action-edit" onClick={() => setDialog({ action: a })}>
                        {t('Edit')}
                      </button>
                      <button className={`${btnDanger} min-h-9 px-3`} onClick={() => setDialog({ remove: a })}>
                        {t('Delete')}
                      </button>
                    </>
                  )}
                </div>
                {shown === a.id && (
                  <div className="pb-1 text-xs" data-testid="action-text">
                    {a.description && <p className="whitespace-pre-wrap opacity-70">{isDefault ? t(a.description) : a.description}</p>}
                    {extra.length > 0 && <p className="mt-1 text-lime-300">{extra.join(', ')}</p>}
                  </div>
                )}
              </div>
            );
          })}
          {!s && gm && (
            <div className="col-span-full">
              <button className={`${btn} w-full`} data-testid="add-action" onClick={() => setDialog({ action: null })}>
                {t('New Basic Action')}
              </button>
            </div>
          )}
        </div>
      )}
      {dialog && 'action' in dialog && <ActionDialog action={dialog.action} onClose={() => setDialog(null)} />}
      {dialog?.remove && (
        <FormDialog title={t('Delete Basic Action')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => call('basic:delete', { id: dialog.remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}
