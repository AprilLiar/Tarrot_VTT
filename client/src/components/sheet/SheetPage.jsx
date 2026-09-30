import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import * as D from '../../../../shared/rules-data.js';
import { NumField, RollButton } from './fields.jsx';
import { Features, Inventory } from './SheetLists.jsx';
import { Resistances, Statuses } from './SheetDefences.jsx';
import { PicturesSection, StageSection } from './SheetStage.jsx';
import { BattleRemote } from './BattleRemote.jsx';

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

const MASTERY_GLOW = {
  magic: '0 0 22px 4px rgba(59,130,246,0.65)',
  stances: '0 0 22px 4px rgba(239,68,68,0.65)',
  manifestation: '0 0 22px 4px rgba(234,179,8,0.65)',
};

export default function SheetPage({ characterId }) {
  const { identity, toast, setChatOpen } = useApp();
  const [data, setData] = useState(null); // { character, sheet }
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    const load = () =>
      call('sheet:get', { characterId }).then((r) => {
        if (!live) return;
        if (r.ok) setData({ character: r.character, sheet: r.sheet });
        else setError(r.error ?? 'Could not load the sheet.');
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
      if (!r.ok) toast(r.error ?? 'That change was not saved.');
      return r;
    },
    [characterId, toast],
  );

  const list = useCallback(
    async (listName, action, payload = {}) => {
      const r = await call('sheet:list', { characterId, list: listName, action, ...payload });
      if (!r.ok) toast(r.error ?? 'That change was not saved.');
      return r;
    },
    [characterId, toast],
  );

  const roll = useCallback(
    async (kind, key, opts = {}) => {
      const r = await call('roll:make', { characterId, kind, key, ...opts });
      if (r.ok) setChatOpen(true);
      else toast(r.error ?? 'The roll failed.');
    },
    [characterId, toast, setChatOpen],
  );

  if (error) return <p className="p-4 text-red-400">{error}</p>;
  if (!data) return <p className="p-4 text-sm opacity-70">Loading sheet...</p>;

  const { character, sheet } = data;
  const s = { sheet, character, set, list, roll, characterId };
  const apMax = sheet.ap.minion ? D.AP_MAX_MINION : D.AP_MAX;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 p-3 pb-24" data-testid="sheet">
      {identity.role === 'gm' && (
        <Link to="/" className="text-sm text-violet-300 underline">
          Back to roster
        </Link>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="truncate text-2xl font-semibold" data-testid="sheet-name">
          {character.name}
        </h1>
        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">{character.type.toUpperCase()}</span>
      </div>

      <section className={`${card} grid grid-cols-2 gap-3`} aria-label="Vitals">
        <div>
          <div className="text-xs opacity-60">Action Points</div>
          <div className="flex items-center gap-1 text-2xl">
            <div className="w-14">
              <NumField label="Current AP" testId="ap-current" value={sheet.ap.current} min={0} max={apMax} onCommit={(n) => set('ap.current', n)} className="text-2xl" />
            </div>
            <span className="opacity-60">/ {apMax}</span>
          </div>
          {character.type === 'npc' && (
            <label className="mt-1 flex min-h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="minion"
                checked={sheet.ap.minion}
                onChange={(e) => set('ap.minion', e.target.checked)}
                className="h-5 w-5"
              />
              Minion
            </label>
          )}
        </div>
        <div>
          <div className="text-xs opacity-60">Hit Points</div>
          <div className="flex items-center gap-1 text-2xl">
            <div className="w-16">
              <NumField label="Current HP" testId="hp-current" value={sheet.hp.current} min={-99} max={9999} onCommit={(n) => set('hp.current', n)} className="text-2xl" />
            </div>
            <span className="opacity-60">/</span>
            <div className="w-16">
              <NumField label="Max HP" testId="hp-max" value={sheet.hp.max} min={0} max={9999} onCommit={(n) => set('hp.max', n)} className="text-2xl" />
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">Physical Defence</div>
          <div className="w-16 text-xl">
            <NumField label="Physical Defence" value={sheet.defence.physical} min={0} max={99} onCommit={(n) => set('defence.physical', n)} />
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">Mental Defence</div>
          <div className="w-16 text-xl">
            <NumField label="Mental Defence" value={sheet.defence.mental} min={0} max={99} onCommit={(n) => set('defence.mental', n)} />
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">Movement (squares per AP)</div>
          <div className="w-16 text-xl">
            <NumField label="Movement" testId="movement-value" value={sheet.movement} min={0} max={D.MOVEMENT_MAX} onCommit={(n) => set('movement', n)} />
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">Size (token)</div>
          <select
            aria-label="Size"
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
        <div className="col-span-2">
          <div className="text-xs opacity-60">Experience Modifier</div>
          <div className="w-16 text-xl">
            <NumField label="Experience Modifier" testId="experience-value" value={sheet.experience} min={D.EXPERIENCE_MIN} max={D.EXPERIENCE_MAX} onCommit={(n) => set('experience', n)} />
          </div>
        </div>
      </section>

      <BattleRemote s={s} />
      <Stats s={s} />
      <Masteries s={s} />
      <Skills s={s} />
      <Features s={s} />
      <Inventory s={s} />
      <Resistances s={s} />
      <Statuses s={s} />
      <StageSection s={s} />
      <PicturesSection s={s} />
    </main>
  );
}

function Stats({ s }) {
  const { sheet, set, roll } = s;
  return (
    <section aria-label="Stats">
      <h2 className={heading}>Stats</h2>
      <p className="mb-2 text-xs opacity-50">On a phone, tapping opens the roll options. With a mouse, click rolls at once and right-click opens the options. Statuses apply automatically.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {D.STATS.map((stat) => {
          const hasSave = D.SAVE_STATS.includes(stat);
          return (
            <div key={stat} className={`${card} flex flex-col items-center`} data-testid={`stat-${stat}`}>
              <div className="text-xs uppercase tracking-wide opacity-70">{D.STAT_LABELS[stat]}</div>
              <div className="w-full text-4xl font-semibold">
                <NumField
                  label={`${D.STAT_LABELS[stat]} value`}
                  testId={`stat-value-${stat}`}
                  value={sheet.stats[stat]}
                  min={D.STAT_MIN}
                  max={D.STAT_MAX}
                  onCommit={(n) => set(`stats.${stat}`, n)}
                  className="text-4xl"
                />
              </div>
              <div className="flex w-full gap-1">
                <RollButton
                  label="Roll"
                  title={`${D.STAT_LABELS[stat]} Attribute Roll`}
                  testId={`roll-attr-${stat}`}
                  className="min-h-9 w-1/2"
                  sheet={sheet} kind="attribute" rkey={stat}
                  onRoll={(o) => roll('attribute', stat, o)}
                />
                {hasSave ? (
                  <RollButton
                    label="Save"
                    title={`${D.STAT_LABELS[stat]} Save`}
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
                  <span className="whitespace-nowrap">Defence</span>
                  <div className="w-12">
                    <NumField
                      label={`${D.STAT_LABELS[stat]} Defence`}
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
            label={`${g.label} Save`}
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
  const { sheet, set, roll } = s;
  const box = (m) => (
    <div
      key={m}
      data-testid={`mastery-${m}`}
      className="flex w-32 flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-2"
      style={{ boxShadow: MASTERY_GLOW[m] }}
    >
      <RollButton
        label={D.MASTERY_LABELS[m]}
        title={`${D.MASTERY_LABELS[m]} (Combat Mastery Roll)`}
        testId={`roll-mastery-${m}`}
        className="min-h-10 w-full rounded-lg text-xs font-semibold uppercase tracking-wide"
        sheet={sheet}
        kind="mastery"
        rkey={m}
        onRoll={(o) => roll('mastery', m, o)}
      />
      <div className="w-full text-3xl font-semibold">
        <NumField
          label={`${D.MASTERY_LABELS[m]} value`}
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
    <section aria-label="Combat Masteries" className="py-3">
      <h2 className={heading}>Combat Masteries</h2>
      <p className="mb-2 text-xs opacity-50">Tap a name to roll: d20 + the Mastery + your Experience Modifier.</p>
      <div className="flex flex-col items-center gap-4">
        {box('magic')}
        <div className="flex gap-4">
          {box('stances')}
          {box('manifestation')}
        </div>
      </div>
    </section>
  );
}

function Skills({ s }) {
  const { sheet, set, roll } = s;
  return (
    <section aria-label="Skills">
      <h2 className={heading}>Skills</h2>
      <div className={`${card} divide-y divide-white/10 p-0`}>
        {D.SKILLS.map((skill) => {
          const st = D.skillStat(sheet.stats, skill);
          const tier = sheet.skills[skill.key];
          return (
            <div key={skill.key} className="flex min-h-14 items-center gap-2 px-3 py-1" data-testid={`skill-${skill.key}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate">{skill.label}</div>
                <div className="truncate text-xs opacity-60">
                  {st.label} ({st.value}) {tier > 0 ? `+ Mastery ${tier}` : ''}
                </div>
              </div>
              <div className="w-10 text-lg">
                <NumField
                  label={`${skill.label} Mastery tier`}
                  testId={`tier-${skill.key}`}
                  value={tier}
                  min={0}
                  max={D.SKILL_TIER_MAX}
                  onCommit={(n) => set(`skills.${skill.key}`, n)}
                />
              </div>
              <RollButton
                label="Roll"
                title={skill.label}
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
