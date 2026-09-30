import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { EffectEditor, enhancementToForm, enhancementValid, formToEnhancement, formToWeapon, weaponToForm, weaponValid } from './editors.jsx';
import { Lockable } from './Locks.jsx';
import { weaponSummary, enhancementSummary } from './summaries.js';
import { defaultWeapon } from '../../../../shared/arcane.js';
import * as D from '../../../../shared/rules-data.js';
import { useT } from '../../i18n.jsx';

// The Manifest tab: Tarot Cards and Manifestations. Players can only read and make a few choices; the GM makes
// everything. It has the gold background of the Manifest Mastery.

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const label = 'flex flex-col gap-1 text-sm';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

export default function Manifest({ s, draft, setDraft }) {
  const t = useT();
  const [sub, setSub] = useState('tarot');
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-yellow-900/20 p-2" data-testid="manifest">
      <div className="grid grid-cols-2 gap-1" role="tablist" aria-label={t('Manifest')}>
        {[['tarot', t('Tarot Cards')], ['manifestations', t('Manifestations')]].map(([id, text]) => (
          <button key={id} role="tab" aria-selected={sub === id} data-testid={`manifest-${id}`} className={`${btn} min-h-10 px-1 text-sm ${sub === id ? 'ring-2 ring-yellow-400' : ''}`} onClick={() => setSub(id)}>
            {text}
          </button>
        ))}
      </div>
      {sub === 'tarot' && (
        <Lockable id="tarot">
          <Tarot s={s} />
        </Lockable>
      )}
      {sub === 'manifestations' && (
        <Lockable id="manifestations">
          <Manifestations s={s} draft={draft} setDraft={setDraft} />
        </Lockable>
      )}
    </div>
  );
}

// ---- Tarot Cards -----------------------------------------------------------------------------------------

function Tarot({ s }) {
  const t = useT();
  const { identity, toast } = useApp();
  const gm = identity.role === 'gm';
  const { cards, active } = s.sheet.tarot;
  const [dialog, setDialog] = useState(null); // { swap } | { edit: card | null } | { transfer: card } | { remove: card }
  const send = (event, payload) => call(event, { characterId: s.characterId, ...payload });

  return (
    <section aria-label={t('Tarot Cards')} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className={`${heading} col-span-full`}>{t('Tarot Cards')}</h3>
      {cards.length === 0 && <p className="col-span-full text-sm opacity-60">{t('No Tarot Cards yet.')}</p>}
      {cards.map((c) => (
        <div
          key={c.id}
          className={`${card} ${active === c.id ? 'border-yellow-400 ring-2 ring-yellow-400' : ''}`}
          style={active === c.id ? { boxShadow: '0 0 22px 4px rgba(234,179,8,0.55)' } : undefined}
          data-testid="tarot-card"
          data-name={c.name}
          data-active={active === c.id ? 'true' : 'false'}
        >
          <div className="font-medium">{c.name}</div>
          {c.description && <p className="whitespace-pre-wrap text-sm opacity-80">{c.description}</p>}
          {gm && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btn} data-testid="tarot-edit" onClick={() => setDialog({ edit: c })}>
                {t('Edit')}
              </button>
              <button className={btn} data-testid="tarot-transfer" onClick={() => setDialog({ transfer: c })}>
                {t('Transfer')}
              </button>
              <button className={btnDanger} onClick={() => setDialog({ remove: c })}>
                {t('Delete')}
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="col-span-full flex flex-wrap gap-2">
        {cards.length > 1 && (
          <button className={btnPrimary} data-testid="tarot-swap" onClick={() => setDialog({ swap: true })}>
            {t('Swap Card')}
          </button>
        )}
        {gm && (
          <button className={btn} data-testid="tarot-add" onClick={() => setDialog({ edit: null })}>
            {t('Add Tarot Card')}
          </button>
        )}
      </div>

      {dialog?.swap && (
        <FormDialog title={t('Swap Card')} submitLabel={t('Close')} onClose={() => setDialog(null)} run={async () => ({ ok: true })}>
          <p className="text-sm opacity-70">{t('Choose the card that becomes active.')}</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('Tarot Cards')}>
            {cards.map((c) => (
              <button
                type="button"
                key={c.id}
                role="radio"
                aria-checked={active === c.id}
                data-testid="tarot-choose"
                data-name={c.name}
                className={`${btn} text-left ${active === c.id ? 'ring-2 ring-yellow-400' : ''}`}
                onClick={async () => {
                  const r = await send('tarot:swap', { id: c.id });
                  if (!r.ok) toast(r.error);
                  else setDialog(null);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </FormDialog>
      )}
      {dialog && 'edit' in dialog && <CardDialog card={dialog.edit} onClose={() => setDialog(null)} onSave={(body) => (dialog.edit ? send('tarot:update', { id: dialog.edit.id, card: body }) : send('tarot:add', { card: body }))} />}
      {dialog?.transfer && <TransferDialog s={s} card={dialog.transfer} onClose={() => setDialog(null)} />}
      {dialog?.remove && (
        <FormDialog title={t('Delete Tarot Card')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => send('tarot:remove', { id: dialog.remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}

function CardDialog({ card: existing, onClose, onSave }) {
  const t = useT();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  return (
    <FormDialog title={existing ? t('Edit Tarot Card') : t('Add Tarot Card')} submitLabel={existing ? t('Save') : t('Add')} onClose={onClose} canSubmit={name.trim().length > 0} run={() => onSave({ name: name.trim(), description })}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="tarot-name" value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        {t('Effect')}
        <textarea className={`${input} min-h-24`} data-testid="tarot-text" value={description} maxLength={D.TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
    </FormDialog>
  );
}

// The GM moves a card to another character.
function TransferDialog({ s, card: moving, onClose }) {
  const t = useT();
  const { roster } = useApp();
  const [to, setTo] = useState(null);
  const others = (roster?.characters ?? []).filter((c) => c.id !== s.characterId);
  return (
    <FormDialog title={t('Transfer {name}', { name: moving.name })} submitLabel={t('Transfer')} onClose={onClose} canSubmit={to != null} run={() => call('tarot:transfer', { fromId: s.characterId, toId: to, id: moving.id })}>
      {others.length === 0 && <p className="text-sm opacity-60">{t('Nobody to send it to.')}</p>}
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto" role="radiogroup" aria-label={t('Send to')}>
        {others.map((c) => (
          <button type="button" key={c.id} role="radio" aria-checked={to === c.id} data-testid="transfer-target" data-name={c.name} className={`${btn} flex justify-between ${to === c.id ? 'ring-2 ring-violet-500' : ''}`} onClick={() => setTo(c.id)}>
            <span className="truncate">{c.name}</span>
            <span className="text-xs opacity-60">{c.type === 'pc' ? t('PC') : t('NPC')}</span>
          </button>
        ))}
      </div>
    </FormDialog>
  );
}

// ---- Manifestations --------------------------------------------------------------------------------------

function Manifestations({ s, draft, setDraft }) {
  const t = useT();
  const { identity } = useApp();
  const gm = identity.role === 'gm';
  const [dialog, setDialog] = useState(null); // { edit: m | null } | { remove: m }
  const send = (event, payload) => call(event, { characterId: s.characterId, ...payload });

  return (
    <section aria-label={t('Manifestations')} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className={`${heading} col-span-full`}>{t('Manifestations')}</h3>
      {s.sheet.manifestations.length === 0 && <p className="col-span-full text-sm opacity-60">{t('No Manifestations yet.')}</p>}
      {s.sheet.manifestations.map((m) => {
        const isWeapon = m.effect.kind === 'weapon';
        const key = `manifest:${m.id}`;
        const chosen = isWeapon ? draft.weapon === key : (draft.counts[key] ?? 0) > 0;
        return (
          <div key={m.id} className={`${card} ${chosen ? 'ring-2 ring-yellow-400' : ''}`} data-testid="manifestation" data-name={m.name}>
            <div className="font-medium">{m.name}</div>
            {m.description && <p className="whitespace-pre-wrap text-sm opacity-80">{m.description}</p>}
            <p className="mt-1 text-xs opacity-70">{isWeapon ? `${t('Weapon')}: ${weaponSummary(m.effect.weapon, t)}` : `${t('Enhancement')}: ${enhancementSummary(m.effect.enhancement, s.sheet.items, t)}`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isWeapon ? (
                <button className={chosen ? btnPrimary : btn} data-testid="manifestation-use" aria-pressed={chosen} onClick={() => setDraft({ ...draft, weapon: key })}>
                  {chosen ? t('Chosen as weapon') : t('Use as weapon')}
                </button>
              ) : (
                <button className={chosen ? btnPrimary : btn} data-testid="manifestation-use" aria-pressed={chosen} onClick={() => setDraft({ ...draft, counts: { ...draft.counts, [key]: chosen ? 0 : 1 } })}>
                  {chosen ? t('Chosen') : t('Add to attack')}
                </button>
              )}
              {gm && (
                <>
                  <button className={btn} data-testid="manifestation-edit" onClick={() => setDialog({ edit: m })}>
                    {t('Edit')}
                  </button>
                  <button className={btnDanger} onClick={() => setDialog({ remove: m })}>
                    {t('Delete')}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {gm && (
        <button className={`${btn} col-span-full`} data-testid="manifestation-add" onClick={() => setDialog({ edit: null })}>
          {t('Add Manifestation')}
        </button>
      )}
      {dialog && 'edit' in dialog && <ManifestationDialog s={s} m={dialog.edit} onClose={() => setDialog(null)} onSave={(body) => (dialog.edit ? send('manifestation:update', { id: dialog.edit.id, manifestation: body }) : send('manifestation:add', { manifestation: body }))} />}
      {dialog?.remove && (
        <FormDialog title={t('Delete Manifestation')} submitLabel={t('Delete')} danger onClose={() => setDialog(null)} run={() => send('manifestation:remove', { id: dialog.remove.id })}>
          <p className="text-sm">{t('Delete {name}? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </section>
  );
}

function ManifestationDialog({ s, m, onClose, onSave }) {
  const t = useT();
  const items = s.sheet.items;
  const [name, setName] = useState(m?.name ?? '');
  const [description, setDescription] = useState(m?.description ?? '');
  const [kind, setKind] = useState(m?.effect.kind ?? 'weapon');
  const [weapon, setWeapon] = useState(() => weaponToForm(m?.effect.weapon ?? defaultWeapon()));
  const [enh, setEnh] = useState(() => enhancementToForm(m?.effect.kind === 'enhancement' ? m.effect.enhancement : null, items));
  const valid = name.trim() && (kind === 'weapon' ? weaponValid(weapon) : enhancementValid({ ...enh, name: name.trim() }));

  function run() {
    const effect = kind === 'weapon' ? { kind, weapon: formToWeapon(weapon) } : { kind, enhancement: formToEnhancement({ ...enh, name: name.trim() }) };
    return onSave({ name: name.trim(), description, effect });
  }

  return (
    <FormDialog title={m ? t('Edit Manifestation') : t('Add Manifestation')} submitLabel={m ? t('Save') : t('Add')} onClose={onClose} canSubmit={!!valid} run={run}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="manifestation-name" value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-16`} value={description} maxLength={D.TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <EffectEditor kind={kind} setKind={setKind} weapon={weapon} setWeapon={setWeapon} enh={enh} setEnh={setEnh} items={items} />
    </FormDialog>
  );
}
