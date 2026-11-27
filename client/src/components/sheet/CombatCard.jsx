import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import * as D from '../../../../shared/rules-data.js';
import { DURATION_LABELS } from '../../../../shared/statuses.js';
import { effectiveDefence, effectiveMaxHp, effectiveMovement, statMods } from '../../../../shared/effects.js';
import { useSheet } from './useSheet.js';
import { NumField, RollButton } from './fields.jsx';
import ApCubes from './ApCubes.jsx';
import { RestBar } from './RestBar.jsx';
import { OxBar } from './OxBar.jsx';
import { HelpTrack } from '../HelpDice.jsx';
import { AddStatusDialog, describeResistance } from './SheetDefences.jsx';
import { StatusIcon } from '../scene/StatusIcon.jsx';
import { Avatar } from '../Avatar.jsx';

// The combat card (see the README, "Combat card"): a double-click on a character's battle token or its row in the combat order opens a
// small window with everything about it that matters in a fight, editable as on the full sheet: AP, HP and Temp HP, Rest Points, Blood
// Oxidization, Defences, Movement, Size, Help Dice, the stats with their X Defence and Saves, the Combat Masteries, statuses, running
// Effects and Resistances. The GM opens anyone's; a player only their own character's.

let openId = null;
const listeners = new Set();
export function openCombatCard(characterId) {
  openId = characterId;
  listeners.forEach((fn) => fn());
}
const closeCard = () => openCombatCard(null);

// Who may open whose card.
export function mayOpenCard(identity, characterId) {
  return identity?.role === 'gm' || (identity?.role === 'player' && identity.characterId === characterId);
}

// Mounted once (in the Shell): shows the card that was asked for.
export function CombatCardHost() {
  const id = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => openId,
  );
  if (id == null) return null;
  return <CombatCard key={id} characterId={id} onClose={closeCard} />;
}

const cell = 'rounded-lg bg-white/5 px-1.5 py-1';
// Small buttons: the card is meant to stay small.
const small = 'flex h-7 items-center rounded-md bg-white/10 px-2 text-xs font-medium active:bg-white/20';
const tiny = 'text-[10px] uppercase tracking-wide opacity-60';

function CombatCard({ characterId, onClose }) {
  const t = useT();
  const { identity } = useApp();
  const { data, error, set, list, roll, helpPrompt } = useSheet(characterId);
  const [adding, setAdding] = useState(false);
  const gm = identity?.role === 'gm';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t('Combat card')}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-[#1a1626] p-3 text-sm sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="combat-card"
        data-character={characterId}
      >
        {error && <p className="text-red-400">{error}</p>}
        {!data && !error && <p className="opacity-70">{t('Loading sheet...')}</p>}
        {data && <CardBody data={data} s={{ sheet: data.sheet, character: data.character, set, list, roll, characterId }} gm={gm} onClose={onClose} onAddStatus={() => setAdding(true)} />}
        {data && adding && <AddStatusDialog s={{ sheet: data.sheet, character: data.character, set, list, roll, characterId }} onClose={() => setAdding(false)} />}
        {helpPrompt.dialog}
      </div>
    </div>
  );
}

function CardBody({ s, gm, onClose, onAddStatus }) {
  const t = useT();
  const { sheet, character, set, list, roll } = s;
  const apMax = Math.max(0, (sheet.ap.minion ? D.AP_MAX_MINION : D.AP_MAX) + statMods(sheet).maxAp);
  const maxHp = effectiveMaxHp(sheet);
  const fill = maxHp > 0 ? Math.max(0, Math.min(1, sheet.hp.current / maxHp)) : 0;
  const def = effectiveDefence(sheet);
  const prime = D.skillStat(sheet.stats, { scaling: { prime: true } });
  const statuses = D.STATUSES.filter((st) => sheet.statuses[st.key]);
  const resist = Object.entries(sheet.resistances ?? {});

  return (
    <div className="flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <Avatar name={character.name} imageId={character.portraitImageId} crop={character.portraitCrop} size="h-9 w-9 text-base" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold" data-testid="combat-card-name">
          {character.name}
        </h2>
        <Link className={small} to={gm ? `/character/${character.id}` : '/'} onClick={onClose} data-testid="combat-card-sheet">
          {t('Full sheet')}
        </Link>
        <button className={small} onClick={onClose} data-testid="combat-card-close">
          {t('Close')}
        </button>
      </header>

      <div className="flex items-center gap-2">
        <span className={tiny}>{t('AP')}</span>
        <ApCubes current={sheet.ap.current} max={apMax} onChange={(n) => set('ap.current', n)} arrows={false} testId="card-ap" />
      </div>

      {/* HP and Temp HP, then Rest Points and Blood Oxidization (the same bars as on the sheet). */}
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <div className="relative h-8 overflow-hidden rounded-md bg-red-950/70" data-testid="card-hp">
          <div className="absolute inset-y-0 left-0 bg-red-600" style={{ width: `${fill * 100}%` }} />
          <div className="relative flex h-full items-center justify-center gap-1 font-semibold">
            <div className="w-12">
              <NumField label={t('Current HP')} testId="card-hp-current" value={sheet.hp.current} min={-99} max={9999} onCommit={(n) => set('hp.current', n)} />
            </div>
            <span className="opacity-70">/ {maxHp}</span>
          </div>
        </div>
        <div className="relative flex h-8 items-center justify-center gap-1 rounded-md bg-sky-950/50 px-1">
          <span className={tiny}>{t('Temp')}</span>
          <div className="w-10">
            <NumField label={t('Temp HP')} testId="card-temp" value={sheet.hp.temp} min={0} max={9999} onCommit={(n) => set('hp.temp', n)} />
          </div>
        </div>
      </div>
      <RestBar s={s} />
      <OxBar s={s} />

      <div className="grid grid-cols-5 gap-1 text-center">
        {[
          [t('Phys. Def.'), def.physical, 'card-def-physical'],
          [t('Ment. Def.'), def.mental, 'card-def-mental'],
          [t('Movement'), effectiveMovement(sheet), 'card-movement'],
          [t('Size'), `${sheet.size}x${sheet.size}`, 'card-size'],
          [t('Prime'), `${t(D.STAT_LABELS[prime.stat]).slice(0, 3)} ${prime.value}`, 'card-prime'],
        ].map(([label, value, id]) => (
          <div key={id} className={cell} data-testid={id}>
            <div className={`${tiny} truncate`}>{label}</div>
            <div className="font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <HelpTrack dice={sheet.helpDice} onAdd={(sides) => list('helpDice', 'add', { sides })} onRemove={(index) => list('helpDice', 'remove', { index })} />

      {/* Stats: value, X Defence, and a tap rolls the Attribute or the Save. */}
      <div className="grid grid-cols-5 gap-1 text-center" data-testid="card-stats">
        {D.STATS.map((stat) => {
          const save = D.SAVE_STATS.includes(stat);
          return (
            <div key={stat} className={cell}>
              <div className={`${tiny} truncate`}>{t(D.STAT_LABELS[stat])}</div>
              <div className="text-base font-semibold">{sheet.stats[stat]}</div>
              {save && <div className="text-[10px] opacity-70">{t('Def {n}', { n: sheet.xDefence[stat] })}</div>}
              <div className="mt-0.5 flex flex-col gap-0.5">
                <RollButton label={t('Roll')} title={t(D.STAT_LABELS[stat] + ' Attribute Roll')} className="h-6 px-0 py-0 text-[10px]" sheet={sheet} kind="attribute" rkey={stat} pure={stat === 'luck'} onRoll={(o) => roll('attribute', stat, o)} />
                {save && <RollButton label={t('Save')} title={t(D.STAT_LABELS[stat] + ' Save')} className="h-6 px-0 py-0 text-[10px]" sheet={sheet} kind="save" rkey={stat} onRoll={(o) => roll('save', stat, o)} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1 text-center" data-testid="card-masteries">
        {D.MASTERIES.map((m) => (
          <div key={m} className={`${cell} flex items-center justify-between gap-1`}>
            <span className="truncate text-xs">{t(D.MASTERY_LABELS[m])}</span>
            <span className="font-semibold">{sheet.masteries[m]}</span>
            <RollButton label={t('Roll')} title={t(D.MASTERY_LABELS[m] + ' (Combat Mastery Roll)')} className="h-6 px-1.5 py-0 text-[10px]" sheet={sheet} kind="mastery" rkey={m} onRoll={(o) => roll('mastery', m, o)} />
          </div>
        ))}
      </div>

      {/* Statuses as small chips: - takes a stack off, x removes it. */}
      <div>
        <div className="mb-1 flex items-center">
          <span className={`${tiny} flex-1`}>{t('Statuses')}</span>
          <button className={small} data-testid="card-add-status" onClick={onAddStatus}>
            + {t('Status')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1" data-testid="card-statuses">
          {statuses.length === 0 && <span className="text-xs opacity-50">{t('No statuses.')}</span>}
          {statuses.map((st) => {
            const n = sheet.statuses[st.key];
            return (
              <span key={st.key} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-0.5 pr-1 text-xs" title={t(st.text).replaceAll(/\bX\b/g, String(n))} data-testid="card-status" data-key={st.key}>
                <span className="relative h-5 w-5">
                  <StatusIcon statusKey={st.key} stacks={0} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                </span>
                {t(st.name)}
                {st.stackable ? ` ${n}` : ''}
                {st.stackable && (
                  <button className="rounded px-1 opacity-70 hover:opacity-100" aria-label={t('Decrease {name}', { name: { t: st.name } })} onClick={() => set(`statuses.${st.key}`, n - 1)}>
                    -
                  </button>
                )}
                <button className="rounded px-1 text-red-300 opacity-70 hover:opacity-100" aria-label={t('Remove {name}', { name: { t: st.name } })} onClick={() => set(`statuses.${st.key}`, 0)}>
                  x
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {(sheet.effects ?? []).length > 0 && (
        <div>
          <div className={`${tiny} mb-1`}>{t('Effects')}</div>
          <div className="flex flex-wrap gap-1" data-testid="card-effects">
            {sheet.effects.map((e) => (
              <span key={e.id} className="rounded-full bg-lime-900/40 px-2 py-0.5 text-xs" data-testid="card-effect">
                {e.name} <span className="opacity-60">({t(DURATION_LABELS[e.duration])}{e.duration === 'minute' ? `, ${t('{n} rounds left', { n: e.rounds })}` : ''})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {resist.length > 0 && (
        <div>
          <div className={`${tiny} mb-1`}>{t('Resistances')}</div>
          <div className="flex flex-col gap-0.5 text-xs" data-testid="card-resistances">
            {resist.map(([type, r]) => (
              <span key={type}>
                <span className="font-semibold">{t(type.charAt(0).toUpperCase() + type.slice(1))}</span>: {describeResistance(r, t)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
