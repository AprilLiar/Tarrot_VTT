import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import * as D from '../../../../shared/rules-data.js';
import { NumField, RollButton } from './fields.jsx';
import { Features, Inventory } from './SheetLists.jsx';
import { Resistances, Statuses } from './SheetDefences.jsx';
import { PicturesSection, StageSection } from './SheetStage.jsx';
import { BattleRemote, SheetHeight } from './BattleRemote.jsx';
import ApCubes from './ApCubes.jsx';
import { ShieldIcon, BrainIcon } from './DefenceIcons.jsx';
import { tint, skillTint } from './tints.js';
import ArcanePage, { emptyDraft } from '../arcane/ArcanePage.jsx';
import { btn } from '../Dialog.jsx';
import { useT } from '../../i18n.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
// A small block of the vitals: tight, so more of the sheet fits on the screen.
const tile = 'rounded-xl border border-white/10 bg-white/5 px-3 py-2';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

const MASTERY_GLOW = {
  magic: '0 0 22px 4px rgba(59,130,246,0.65)',
  stances: '0 0 22px 4px rgba(239,68,68,0.65)',
  manifestation: '0 0 22px 4px rgba(234,179,8,0.65)',
};

export default function SheetPage({ characterId }) {
  const t = useT();
  const { identity, toast, setChatOpen } = useApp();
  const [data, setData] = useState(null); // { character, sheet }
  const [error, setError] = useState(null);
  const [view, setView] = useState('sheet'); // 'sheet' | 'arcane'
  const [draft, setDraft] = useState(emptyDraft); // the attack being drafted in the Arcane tab

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    const load = () =>
      call('sheet:get', { characterId }).then((r) => {
        if (!live) return;
        if (r.ok) setData({ character: r.character, sheet: r.sheet });
        else setError(r.error ?? t('Could not load the sheet.'));
      });
    const onUpdated = (u) => {
      if (u.characterId === characterId) setData((d) => (d ? { ...d, sheet: u.sheet } : d));
    };
    load();
    socket.on('sheet:updated', onUpdated);
    socket.on('connect', load); // catch up after a dropped connection
    return () => {
      live = false;
      socket.off('sheet:updated', onUpdated);
      socket.off('connect', load);
    };
  }, [characterId]);

  // Edits report their error as a toast; success arrives as `sheet:updated`.
  const set = useCallback(
    async (path, value) => {
      const r = await call('sheet:set', { characterId, path, value });
      if (!r.ok) toast(r.error ?? t('That change was not saved.'));
      return r;
    },
    [characterId, toast, t],
  );

  const list = useCallback(
    async (listName, action, payload = {}) => {
      const r = await call('sheet:list', { characterId, list: listName, action, ...payload });
      if (!r.ok) toast(r.error ?? t('That change was not saved.'));
      return r;
    },
    [characterId, toast, t],
  );

  const roll = useCallback(
    async (kind, key, opts = {}) => {
      const r = await call('roll:make', { characterId, kind, key, ...opts });
      if (r.ok) setChatOpen(true);
      else toast(r.error ?? t('The roll failed.'));
    },
    [characterId, toast, setChatOpen, t],
  );

  if (error) return <p className="p-4 text-red-400">{error}</p>;
  if (!data) return <p className="p-4 text-sm opacity-70">{t('Loading sheet...')}</p>;

  const { character, sheet } = data;
  const s = { sheet, character, set, list, roll, characterId };
  const apMax = sheet.ap.minion ? D.AP_MAX_MINION : D.AP_MAX;

  return (
    <main className="mx-auto flex w-full max-w-[2000px] flex-col gap-3 p-3 pb-24" data-testid="sheet">
      {/* One header row: who, and the Sheet | Arcane switch. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {identity.role === 'gm' && (
          <Link to="/" className="text-sm text-violet-300 underline">
            {t('Back to roster')}
          </Link>
        )}
        <h1 className="min-w-0 truncate text-2xl font-semibold" data-testid="sheet-name">
          {character.name}
        </h1>
        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">{character.type === 'pc' ? t('PC') : t('NPC')}</span>
        <div className="ml-auto grid w-full max-w-xs grid-cols-2 gap-2 sm:w-auto sm:min-w-[16rem]" role="tablist" aria-label={t('View')}>
          {[['sheet', t('Sheet')], ['arcane', t('Arcane')]].map(([id, text]) => (
            <button key={id} role="tab" aria-selected={view === id} data-testid={`view-${id}`} className={`${btn} min-h-10 ${view === id ? 'ring-2 ring-violet-400' : ''}`} onClick={() => setView(id)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {view === 'arcane' ? (
        <div className="pb-24">
          <ArcanePage s={s} draft={draft} setDraft={setDraft} />
        </div>
      ) : (
        <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start" data-testid="sheet-columns">
        <div className="flex min-w-0 flex-col gap-3">
          <section className="grid grid-cols-2 gap-2" aria-label={t('Vitals')}>
            <div className={`${tile} col-span-2`}>
              <div className="text-xs opacity-60">{t('Action Points')}</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <ApCubes current={sheet.ap.current} max={apMax} onChange={(n) => set('ap.current', n)} testId="ap-current" />
                {character.type === 'npc' && (
                  <label className="flex min-h-8 items-center gap-2 text-sm">
                    <input type="checkbox" data-testid="minion" checked={sheet.ap.minion} onChange={(e) => set('ap.minion', e.target.checked)} className="h-5 w-5" />
                    {t('Minion')}
                  </label>
                )}
              </div>
            </div>
            <div className={`${tile} col-span-2`}>
              <div className="text-xs opacity-60">{t('Hit Points')}</div>
              <div className="flex items-center gap-1 text-2xl">
                <div className="w-16">
                  <NumField label={t('Current HP')} testId="hp-current" value={sheet.hp.current} min={-99} max={9999} onCommit={(n) => set('hp.current', n)} className="text-2xl" />
                </div>
                <span className="opacity-60">/</span>
                <div className="w-16">
                  <NumField label={t('Max HP')} testId="hp-max" value={sheet.hp.max} min={0} max={9999} onCommit={(n) => set('hp.max', n)} className="text-2xl" />
                </div>
              </div>
            </div>
            <div className={`${tile} relative overflow-hidden`}>
              <ShieldIcon />
              <div className="relative text-xs opacity-60">{t('Physical Defence')}</div>
              <div className="relative w-16 text-2xl">
                <NumField label={t('Physical Defence')} value={sheet.defence.physical} min={0} max={99} onCommit={(n) => set('defence.physical', n)} />
              </div>
            </div>
            <div className={`${tile} relative overflow-hidden`}>
              <BrainIcon />
              <div className="relative text-xs opacity-60">{t('Mental Defence')}</div>
              <div className="relative w-16 text-2xl">
                <NumField label={t('Mental Defence')} value={sheet.defence.mental} min={0} max={99} onCommit={(n) => set('defence.mental', n)} />
              </div>
            </div>
            <div className={tile}>
              <div className="text-xs opacity-60">{t('Movement (squares per AP)')}</div>
              <div className="w-16 text-xl">
                <NumField label={t('Movement')} testId="movement-value" value={sheet.movement} min={0} max={D.MOVEMENT_MAX} onCommit={(n) => set('movement', n)} />
              </div>
            </div>
            <div className={tile}>
              <div className="text-xs opacity-60">{t('Size (token)')}</div>
              <select
                aria-label={t('Size')}
                data-testid="size-select"
                className="min-h-10 rounded-lg border border-white/20 bg-black/30 px-2 text-lg"
                value={sheet.size}
                onChange={(e) => set('size', Number(e.target.value))}
              >
                {Array.from({ length: D.SIZE_MAX }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x{n}
                  </option>
                ))}
              </select>
            </div>
            <div className={tile}>
              <div className="text-xs opacity-60">{t('Experience Modifier')}</div>
              <div className="w-16 text-xl">
                <NumField label={t('Experience Modifier')} testId="experience-value" value={sheet.experience} min={D.EXPERIENCE_MIN} max={D.EXPERIENCE_MAX} onCommit={(n) => set('experience', n)} />
              </div>
            </div>
            <SheetHeight characterId={characterId} />
          </section>
          <Masteries s={s} />
          <BattleRemote s={s} onAttack={() => setView('arcane')} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Stats s={s} />
          <Skills s={s} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Features s={s} />
          <Inventory s={s} />
          <Resistances s={s} />
          <Statuses s={s} />
          <StageSection s={s} />
          <PicturesSection s={s} />
        </div>
      </div>
        </>
      )}
    </main>
  );
}

function Stats({ s }) {
  const t = useT();
  const { sheet, set, roll } = s;
  return (
    <section aria-label={t('Stats')}>
      <h2 className={heading}>{t('Stats')}</h2>
      <p className="mb-2 text-xs opacity-50">{t('On a phone, tapping opens the roll options. With a mouse, click rolls at once and right-click opens the options. Statuses apply automatically.')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {D.STATS.map((stat) => {
          const hasSave = D.SAVE_STATS.includes(stat);
          return (
            <div key={stat} className={`${card} flex flex-col items-center`} style={tint([stat])} data-testid={`stat-${stat}`}>
              <div className="text-xs uppercase tracking-wide opacity-70">{t(D.STAT_LABELS[stat])}</div>
              <div className="w-full text-3xl font-semibold">
                <NumField
                  label={t('{name} value', { name: { t: D.STAT_LABELS[stat] } })}
                  testId={`stat-value-${stat}`}
                  value={sheet.stats[stat]}
                  min={D.STAT_MIN}
                  max={D.STAT_MAX}
                  onCommit={(n) => set(`stats.${stat}`, n)}
                  className="text-3xl"
                />
              </div>
              <div className="flex w-full gap-1">
                <RollButton
                  label={t('Roll')}
                  title={t(D.STAT_LABELS[stat] + ' Attribute Roll')}
                  testId={`roll-attr-${stat}`}
                  className="min-h-9 w-1/2"
                  sheet={sheet} kind="attribute" rkey={stat}
                  onRoll={(o) => roll('attribute', stat, o)}
                />
                {hasSave ? (
                  <RollButton
                    label={t('Save')}
                    title={t(D.STAT_LABELS[stat] + ' Save')}
                    testId={`roll-save-${stat}`}
                    className="min-h-9 w-1/2"
                  sheet={sheet} kind="save" rkey={stat}
                    onRoll={(o) => roll('save', stat, o)}
                  />
                ) : (
                  <div className="w-1/2" />
                )}
              </div>
              {hasSave && (
                <div className="mt-1 flex w-full items-center gap-1 text-xs opacity-80">
                  <span className="whitespace-nowrap">{t('Defence')}</span>
                  <div className="w-12">
                    <NumField
                      label={t(D.STAT_LABELS[stat] + ' Defence')}
                      testId={`xdef-${stat}`}
                      value={sheet.xDefence[stat]}
                      min={-20}
                      max={20}
                      onCommit={(n) => set(`xDefence.${stat}`, n)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {Object.entries(D.GROUP_SAVES).map(([key, g]) => (
          <RollButton
            key={key}
            label={t(g.label + ' Save')}
            testId={`roll-save-${key}`}
            className="min-h-11 flex-1 text-sm"
                  sheet={sheet} kind="save" rkey={key}
            onRoll={(o) => roll('save', key, o)}
          />
        ))}
      </div>
    </section>
  );
}

function Masteries({ s }) {
  const t = useT();
  const { sheet, set, roll } = s;
  const box = (m) => (
    <div
      key={m}
      data-testid={`mastery-${m}`}
      className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-2"
      style={{ boxShadow: MASTERY_GLOW[m] }}
    >
      <RollButton
        label={t(D.MASTERY_LABELS[m])}
        title={t(D.MASTERY_LABELS[m] + ' (Combat Mastery Roll)')}
        testId={`roll-mastery-${m}`}
        className="min-h-10 w-full rounded-lg text-xs font-semibold uppercase tracking-wide"
        sheet={sheet}
        kind="mastery"
        rkey={m}
        onRoll={(o) => roll('mastery', m, o)}
      />
      <div className="w-full text-3xl font-semibold">
        <NumField
          label={t('{name} value', { name: { t: D.MASTERY_LABELS[m] } })}
          testId={`mastery-value-${m}`}
          value={sheet.masteries[m]}
          min={D.MASTERY_MIN}
          max={D.MASTERY_MAX}
          onCommit={(n) => set(`masteries.${m}`, n)}
          className="text-3xl"
        />
      </div>
    </div>
  );
  return (
    <section aria-label={t('Combat Masteries')}>
      <h2 className={heading}>{t('Combat Masteries')}</h2>
      <p className="mb-2 text-xs opacity-50">{t('Tap a name to roll: d20 + the Mastery + your Experience Modifier.')}</p>
      <div className="grid grid-cols-3 gap-3 px-1 pb-2">
        {box('magic')}
        {box('stances')}
        {box('manifestation')}
      </div>
    </section>
  );
}

function Skills({ s }) {
  const t = useT();
  const { sheet, set, roll } = s;
  return (
    <section aria-label={t('Skills')}>
      <h2 className={heading}>{t('Skills')}</h2>
      <div className={`${card} divide-y divide-white/10 overflow-hidden p-0`}>
        {D.SKILLS.map((skill) => {
          const st = D.skillStat(sheet.stats, skill);
          const tier = sheet.skills[skill.key];
          return (
            <div key={skill.key} className="flex min-h-12 items-center gap-2 px-3 py-0.5" style={skillTint(skill)} data-testid={`skill-${skill.key}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate">{t(skill.label)}</div>
                <div className="truncate text-xs opacity-60">
                  {t(st.label)} ({st.value}) {tier > 0 ? t('+ Mastery {tier}', { tier }) : ''}
                </div>
              </div>
              <div className="w-10 text-lg">
                <NumField
                  label={t('{name} Mastery tier', { name: { t: skill.label } })}
                  testId={`tier-${skill.key}`}
                  value={tier}
                  min={0}
                  max={D.SKILL_TIER_MAX}
                  onCommit={(n) => set(`skills.${skill.key}`, n)}
                />
              </div>
              <RollButton
                label={t('Roll')}
                title={t(skill.label)}
                testId={`roll-skill-${skill.key}`}
                className="min-h-9 w-14"
                  sheet={sheet} kind="skill" rkey={skill.key}
                onRoll={(o) => roll('skill', skill.key, o)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
