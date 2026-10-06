import { useState } from 'react';
import { call } from '../../AppContext.jsx';
import { btn, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { IntInput } from '../sheet/fields.jsx';
import { DamageKindSelect, isNum } from './editors.jsx';
import { DiceIcon } from '../DiceIcon.jsx';
import { useHelpPrompt } from '../HelpDice.jsx';
import { useTargets } from '../sheet/TargetPicker.jsx';
import { HELP_SIDES } from '../../../../shared/help.js';
import { StatusSetup } from '../StatusSetup.jsx';
import { effectCatalog, useEffectLibrary } from '../effects/useEffectLibrary.js';
import { statusSave } from '../../../../shared/statuses.js';
import * as D from '../../../../shared/rules-data.js';
import { T } from '../../../../shared/localization.js';
import { useT } from '../../i18n.jsx';

// A Spontaneous Action (a core rule): the GM makes one up on the spot, for the character whose Arcane tab this is.
// It is not stored anywhere. 1 or 2 AP, no target / one / several, and any mix of four effects: Damage, a Help Die,
// a Status and Temp HP. Damage and Status are rolled (the picked roll against a Defence) and confirmed on the usual
// card; a Help Die and Temp HP alone are given at once. Everything goes to the selected targets, or the actor.
const ROLLS = [
  ['weapon', T('Weapon attack (Prime + Experience)')],
  ['magic', 'Magic'],
  ['stances', 'Stances'],
  ['manifestation', 'Manifest'],
];
const label = 'flex flex-col gap-1 text-sm';
const box = 'flex flex-col gap-2 rounded-lg border border-white/10 p-2';

export default function Spontaneous({ s, onClose }) {
  const t = useT();
  const info = useTargets(s.characterId);
  const selected = info?.targets.length ?? 0;
  const [ap, setAp] = useState(1);
  const [on, setOn] = useState({ damage: false, help: false, status: false, temp: false, effect: false });
  const globals = useEffectLibrary();
  const library = effectCatalog(globals, s.sheet);
  const [effectId, setEffectId] = useState('');
  const [effectTo, setEffectTo] = useState('target');
  const [damage, setDamage] = useState('1');
  const [kind, setKind] = useState('true');
  const [sides, setSides] = useState(6);
  const [statusKey, setStatusKey] = useState('bleeding');
  const [stacks, setStacks] = useState(1);
  const [duration, setDuration] = useState('long');
  const [dc, setDc] = useState('auto');
  const [temp, setTemp] = useState('5');
  const [roll, setRoll] = useState('magic');
  const [defence, setDefence] = useState('physical');
  const { ask, dialog } = useHelpPrompt(s.sheet.helpDice);
  const status = D.STATUSES.find((x) => x.key === statusKey);
  const rolled = on.damage || on.status;
  const any = Object.values(on).some(Boolean);
  const valid = any && (!on.effect || library.length > 0) && (!on.damage || isNum(damage, 0, 999)) && (!on.temp || isNum(temp, 1, 9999)) && s.sheet.ap.current >= ap;
  const flag = (k) => (e) => setOn({ ...on, [k]: e.target.checked });

  async function run() {
    let help = [];
    if (rolled) {
      help = await ask();
      if (help === null) return { ok: false, error: t('Cancelled.') };
    }
    const effects = {};
    if (on.damage) effects.damage = { amount: Number(damage), kind };
    if (on.help) effects.help = { sides };
    if (on.status) effects.status = { key: statusKey, stacks: status?.stackable ? stacks : 1, duration, dc };
    if (on.temp) effects.temp = { value: Number(temp) };
    if (on.effect) effects.effect = { id: effectId || library[0]?.id, to: effectTo };
    return call('spontaneous:do', { characterId: s.characterId, ap, effects, roll, defence, help });
  }

  return (
    <>
      <FormDialog title={t('Spontaneous Action')} submitLabel={rolled ? t('Roll') : t('Give')} onClose={onClose} canSubmit={!!valid} run={run}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('AP cost')}>
          {[1, 2].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={ap === n} data-testid={`spont-ap-${n}`} className={`${btn} ${ap === n ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setAp(n)}>
              {t('{n} AP', { n })}
            </button>
          ))}
        </div>

        <p className="text-xs opacity-60" data-testid="spont-targets-note">
          {selected > 0 ? t('Goes to the {n} selected targets.', { n: selected }) : t('Nobody is selected: it is for the acting character.')}
        </p>

        <div className={box}>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spont-damage" checked={on.damage} onChange={flag('damage')} />
            {t('Damage')}
          </label>
          {on.damage && (
            <div className="grid grid-cols-2 gap-2">
              <IntInput label={t('Damage value')} value={damage} onChange={setDamage} />
              <DamageKindSelect value={kind} onChange={setKind} withTrue aria={t('Damage type')} testId="spont-kind" />
            </div>
          )}
        </div>

        <div className={box}>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spont-help" checked={on.help} onChange={flag('help')} />
            {t('Help Die')}
          </label>
          {on.help && (
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('Help Die')}>
              {HELP_SIDES.map((n) => (
                <button type="button" key={n} role="radio" aria-checked={sides === n} data-testid={`spont-die-${n}`} className={`rounded-lg p-1 ${sides === n ? 'bg-amber-400/25 ring-2 ring-amber-400' : 'bg-white/5'}`} onClick={() => setSides(n)}>
                  <DiceIcon sides={n} size={44} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={box}>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spont-status" checked={on.status} onChange={flag('status')} />
            {t('Status')}
          </label>
          {on.status && (
            <div className="grid grid-cols-2 gap-2">
              <select className={input} aria-label={t('Status')} data-testid="spont-status-key" value={statusKey} onChange={(e) => setStatusKey(e.target.value)}>
                {D.STATUSES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {t(x.name)}
                  </option>
                ))}
              </select>
              {status?.stackable && (
                <input type="number" className={input} min="1" max="10" aria-label={t('Stacks')} data-testid="spont-stacks" value={stacks} onChange={(e) => setStacks(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
              )}
            </div>
          )}
          {on.status && (
            <StatusSetup
              apply={{ key: statusKey, stacks, duration: !statusSave(statusKey) && duration === 'repeated' ? 'long' : duration, dc }}
              testId="spont-status-setup"
              onChange={(next) => {
                setDuration(next.duration);
                setDc(next.dc);
              }}
            />
          )}
        </div>

        <div className={box}>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spont-temp" checked={on.temp} onChange={flag('temp')} />
            {t('Temp HP')}
          </label>
          {on.temp && <IntInput label={t('Temp HP value')} value={temp} onChange={setTemp} />}
        </div>

        <div className={box}>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" data-testid="spont-effect" checked={on.effect} onChange={flag('effect')} />
            {t('Effect')}
          </label>
          {on.effect && (
            <div className="grid grid-cols-2 gap-2">
              <select className={input} aria-label={t('Effect')} data-testid="spont-effect-id" value={effectId || library[0]?.id || ''} onChange={(e) => setEffectId(e.target.value)}>
                {library.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button type="button" className={btn} data-testid="spont-effect-to" onClick={() => setEffectTo(effectTo === 'self' ? 'target' : 'self')}>
                {effectTo === 'self' ? t('On the user') : t('On the targets')}
              </button>
              {library.length === 0 && <p className="col-span-2 text-xs opacity-60">{t('No Effects exist yet. Make some in the Effects section of the General tab.')}</p>}
            </div>
          )}
        </div>

        {rolled && (
          <div className={box}>
            <div className="text-xs uppercase tracking-wide opacity-60">{t('Roll')}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Roll')}>
              {ROLLS.map(([id, text]) => (
                <button type="button" key={id} role="radio" aria-checked={roll === id} data-testid={`spont-roll-${id}`} className={`${btn} ${roll === id ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setRoll(id)}>
                  {t(text)}
                </button>
              ))}
            </div>
            {/* What is rolled (above) is set apart from what it is rolled against (below). */}
            <hr className="my-1 border-white/15" data-testid="spont-divider" />
            <div className="text-xs uppercase tracking-wide opacity-60">{t('Against')}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Defence it is rolled against')}>
              {[['physical', t('vs Physical Defence')], ['mental', t('vs Mental Defence')]].map(([id, text]) => (
                <button type="button" key={id} role="radio" aria-checked={defence === id} data-testid={`spont-defence-${id}`} className={`${btn} ${defence === id ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setDefence(id)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {s.sheet.ap.current < ap && <p className="text-xs text-amber-300">{t('Not enough AP: this attack costs {cost} and you have {have}.', { cost: ap, have: s.sheet.ap.current })}</p>}
      </FormDialog>
      {dialog}
    </>
  );
}
