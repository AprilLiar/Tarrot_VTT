import { useState } from 'react';
import { btn, btnDanger, btnPrimary } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { call } from '../../AppContext.jsx';
import { EffectDialog } from './EffectEditor.jsx';
import { effectCatalog, useEffectLibrary } from './useEffectLibrary.js';
import { effectSummary } from './effectText.js';
import { useT } from '../../i18n.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// The Effects in the General tab of the Arcane tab. With a character (`s`): the global ones and the character's own, each with a
// button that puts it on the character; the owner and the GM can make, edit and delete the character's own. Without one (the GM's
// general tab): the global library itself.
export function EffectsLibrary({ s = null }) {
  const t = useT();
  const globals = useEffectLibrary();
  const [dialog, setDialog] = useState(null); // { effect } to edit or add, or { remove }
  const list = s ? effectCatalog(globals, s.sheet) : globals.map((e) => ({ ...e, origin: 'global' }));
  const save = (effect) => {
    if (!s) return call('effect:save', { id: dialog.effect?.id, effect });
    return dialog.effect ? s.list('effectDefs', 'update', { id: dialog.effect.id, effect }) : s.list('effectDefs', 'add', { effect });
  };
  return (
    <section aria-label={s ? t('Effects') : t('Effects for everyone')}>
      <h3 className={heading}>{s ? t('Effects') : t('Effects for everyone')}</h3>
      <p className="mb-2 text-xs opacity-50">
        {s ? t('Effects are modifiers a character has for a while. Put one on this character here; Basic Actions, Enhancements, Stances and weapons can put them on too.') : t('These are available to every PC and NPC. To make one for a single character, open its own Arcane tab.')}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <div key={e.id} className={card} data-testid="effect-card" data-name={e.name} data-origin={e.origin}>
            <div className="font-medium">
              {e.name}{' '}
              {s && <span className="rounded bg-white/10 px-1.5 text-xs opacity-70">{e.origin === 'global' ? t('Everyone') : t('This character')}</span>}
            </div>
            <div className="text-xs opacity-70">{effectSummary(e, t)}</div>
            {e.description && <div className="mt-1 whitespace-pre-wrap text-xs opacity-60">{e.description}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              {s && (
                <button className={btnPrimary} data-testid="effect-give" onClick={() => call('effect:give', { characterId: s.characterId, effectId: e.id })}>
                  {t('Put on')}
                </button>
              )}
              {(!s || e.origin === 'character') && (
                <>
                  <button className={btn} data-testid="effect-edit" onClick={() => setDialog({ effect: e })}>
                    {t('Edit')}
                  </button>
                  <button className={btnDanger} data-testid="effect-delete" onClick={() => setDialog({ remove: e })}>
                    {t('Delete')}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="col-span-full text-sm opacity-60">{t('None yet')}</p>}
        <button className={`${btn} col-span-full`} data-testid="add-effect" onClick={() => setDialog({ effect: null })}>
          {t('New Effect')}
        </button>
      </div>
      {dialog && 'effect' in dialog && <EffectDialog effect={dialog.effect} onClose={() => setDialog(null)} onSave={save} />}
      {dialog?.remove && (
        <FormDialog
          title={t('Delete Effect')}
          submitLabel={t('Delete')}
          danger
          onClose={() => setDialog(null)}
          run={() => (s ? s.list('effectDefs', 'remove', { id: dialog.remove.id }) : call('effect:delete', { id: dialog.remove.id }))}
        >
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}
