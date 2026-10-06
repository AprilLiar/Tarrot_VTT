import { useMemo, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import { btn, btnDanger, btnPrimary, input } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { IntInput } from '../sheet/fields.jsx';
import { CostFields, DiceList, StatusList, UniqueList, costToForm, costValid, formToCost, isNum } from './editors.jsx';
import { bandParts, costParts } from './summaries.js';
import { EffectRefs } from '../effects/EffectRefs.jsx';
import { useStances } from './useStances.js';
import { Blurred, LockIcon, useLocks } from './Locks.jsx';
import { BANDS, SIGN_VIBES, blankEffect, groupTable } from '../../../../shared/stances.js';
import { STONES, stoneInfo } from '../../../../shared/spells.js';
import * as D from '../../../../shared/rules-data.js';
import { useT } from '../../i18n.jsx';

// The Stances tab: the twelve signs, and for each a tree of Stances with a table of what each Stance roll does.
// `s` is the character (its attack draft picks a Stance here); without it (the GM's general tab) it only edits.

const card = 'rounded-xl border border-white/10 bg-white/5 p-3';
const label = 'flex flex-col gap-1 text-sm';
const RING = 84; // distance between rings of the tree
const NODE = 27; // radius of a circle in the tree
const signOf = (sign) => STONES.find((x) => x.sign === sign);
// The signs in the order of the zodiac.
const ZODIAC = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

// The circle of a Stance: the sign in its colour.
function Glyph({ sign, color, size = 56 }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#14111d] text-3xl" style={{ width: size, height: size, border: `3px solid ${color}`, color }}>
      {signOf(sign).glyph}
    </span>
  );
}

export default function Stances({ s, draft, setDraft }) {
  const t = useT();
  const { identity } = useApp();
  const gm = identity.role === 'gm';
  const { stances, vibes, ready } = useStances();
  const { has, locking, toggle } = useLocks();
  const [open, setOpen] = useState(null); // the sign whose tree is shown
  if (!ready) return <p className="text-sm opacity-60">{t('Loading...')}</p>;
  // A locked Zodiac is a blur for players (the server does not even send its Stances).
  if (open && !gm && has(`stances:${open}`)) {
    return (
      <div className="flex flex-col gap-3">
        <button className={`${btn} self-start`} data-testid="stance-back" onClick={() => setOpen(null)}>
          {t('Back')}
        </button>
        <Blurred />
      </div>
    );
  }
  if (open) return <Tree sign={open} all={stances.filter((x) => x.sign === open)} vibes={vibes} s={s} draft={draft} setDraft={setDraft} gm={gm} onBack={() => setOpen(null)} />;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="stances-list">
      {ZODIAC.map(signOf).map((x) => {
        const base = stances.find((st) => st.id === `base:${x.sign}`);
        const count = stances.filter((st) => st.sign === x.sign && st.parentId).length;
        return (
          <button key={x.sign} className={`${card} flex items-center gap-3 text-left ${locking ? 'border-dashed border-amber-400/60' : ''}`} data-testid={`stance-sign-${x.sign}`} data-locked={has(`stances:${x.sign}`) ? 'true' : 'false'} onClick={() => (locking ? toggle(`stances:${x.sign}`) : setOpen(x.sign))}>
            <Glyph sign={x.sign} color={base?.color ?? '#ffffff'} size={64} />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-medium">{t(x.name)}</span>
              <span className="block text-sm opacity-70">{vibes[x.sign] ?? t(SIGN_VIBES[x.sign])}</span>
              {count > 0 && <span className="block text-xs opacity-50">{t('Variations: {n}', { n: count })}</span>}
            </span>
            {has(`stances:${x.sign}`) && (
              <span className="text-amber-300">
                <LockIcon size={20} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---- The tree of one sign ------------------------------------------------------------------------------

// Positions the Stances in rings around the base: every Stance gets a slice of the circle in proportion to how
// many Stances hang under it. A Stance whose parent is hidden from this viewer hangs from the base.
function layout(all) {
  const root = all.find((x) => !x.parentId);
  if (!root) return { pos: new Map(), size: 0 };
  const ids = new Set(all.map((x) => x.id));
  const kids = new Map(all.map((x) => [x.id, []]));
  for (const x of all) if (x.parentId) kids.get(ids.has(x.parentId) ? x.parentId : root.id).push(x);
  const leaves = (id) => (kids.get(id).length ? kids.get(id).reduce((n, k) => n + leaves(k.id), 0) : 1);
  const pos = new Map();
  let depth = 0;
  const place = (node, a0, a1, d) => {
    depth = Math.max(depth, d);
    const mid = (a0 + a1) / 2;
    pos.set(node.id, d === 0 ? { x: 0, y: 0 } : { x: Math.cos(mid) * d * RING, y: Math.sin(mid) * d * RING });
    let from = a0;
    for (const k of kids.get(node.id)) {
      const span = ((a1 - a0) * leaves(k.id)) / leaves(node.id);
      place(k, from, from + span, d + 1);
      from += span;
    }
  };
  place(root, -Math.PI / 2, (3 * Math.PI) / 2, 0);
  return { pos, root, size: depth * RING + NODE + 14 };
}

function Tree({ sign, all, vibes, s, draft, setDraft, gm, onBack }) {
  const t = useT();
  const { toast } = useApp();
  const [picked, setPicked] = useState(`base:${sign}`);
  const [dialog, setDialog] = useState(null); // { edit } | { add: parent } | { remove } | { vibe: true }
  const { pos, size } = useMemo(() => layout(all), [all]);
  const byId = new Map(all.map((x) => [x.id, x]));
  const current = byId.get(picked) ?? byId.get(`base:${sign}`);
  const characterId = s?.characterId;
  // For a character: the Stance can be used once learned (a GM looks at the full list of who learned it).
  const learned = (st) => (s ? (gm ? st.learned.includes(characterId) : st.usable) : true);
  const vibe = vibes[sign] ?? t(SIGN_VIBES[sign]);
  const chosen = current && draft?.stance === current.id;

  return (
    <div className="flex flex-col gap-3" data-testid="stance-tree">
      <div className="flex items-center gap-2">
        <button className={btn} data-testid="stance-back" onClick={onBack}>
          {t('Back')}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-medium">{t(stoneInfo(sign).name)}</div>
          <div className="text-sm opacity-70" data-testid="stance-vibe">
            {vibe}
          </div>
        </div>
        {gm && (
          <button className={btn} data-testid="stance-vibe-edit" onClick={() => setDialog({ vibe: true })}>
            {t('Edit vibe')}
          </button>
        )}
      </div>

      {!current ? (
        <p className={`${card} text-sm opacity-70`}>{t('You have not seen this Stance yet.')}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <svg viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`} className="mx-auto w-full" style={{ maxHeight: '26rem' }} role="img" aria-label={t('Stance tree')}>
            {all.map((x) => {
              const p = pos.get(x.id);
              const parent = x.parentId ? (pos.get(x.parentId) ?? pos.get(`base:${sign}`)) : null;
              return parent ? <line key={`l-${x.id}`} x1={parent.x} y1={parent.y} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeOpacity="0.5" strokeWidth="2" /> : null;
            })}
            {all.map((x) => {
              const p = pos.get(x.id);
              const dim = s ? !learned(x) : false; // known but not learned: greyed out and half transparent
              return (
                <g key={x.id} transform={`translate(${p.x} ${p.y})`} data-testid="stance-node" data-id={x.id} data-name={x.name} data-dim={dim ? 'true' : 'false'} style={{ cursor: 'pointer', opacity: dim ? 0.45 : 1 }} onClick={() => setPicked(x.id)}>
                  <circle r={NODE} fill="#14111d" stroke={dim ? '#94a3b8' : x.color} strokeWidth="4" />
                  {picked === x.id && <circle r={NODE + 6} fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="5 4" />}
                  <text textAnchor="middle" dominantBaseline="central" fontSize="30" fill={dim ? '#94a3b8' : x.color}>
                    {signOf(x.sign).glyph}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className={card} data-testid="stance-detail" data-id={current.id}>
            <div className="flex items-center gap-2">
              <Glyph sign={sign} color={current.color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-medium" data-testid="stance-name">
                  {current.name}
                </div>
                <div className="text-xs opacity-70" data-testid="stance-state">
                  {s ? (learned(current) ? t('Learned') : t('Known, not learned')) : current.known ? t('Known by characters') : t('Hidden from players')}
                </div>
              </div>
            </div>
            {current.description && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{current.description}</p>}
            {costParts(current.cost, t).length > 0 && (
              <p className="mt-2 text-sm" data-testid="stance-cost">
                {t('Cost: {list}', { list: costParts(current.cost, t).join(', ') })}
              </p>
            )}
            <BandTable table={current.table} />
            <div className="mt-3 flex flex-wrap gap-2">
              {s && learned(current) && (
                <button className={chosen ? btnPrimary : btn} data-testid="stance-use" aria-pressed={chosen} onClick={() => setDraft({ ...draft, stance: chosen ? null : current.id })}>
                  {chosen ? t('Chosen for the attack') : t('Use in attack')}
                </button>
              )}
              {gm && (
                <>
                  <button className={btn} data-testid="stance-edit" onClick={() => setDialog({ edit: current })}>
                    {t('Edit')}
                  </button>
                  <button className={btn} data-testid="stance-add" onClick={() => setDialog({ add: current })}>
                    {t('Add variation')}
                  </button>
                  {current.parentId && (
                    <button className={btnDanger} data-testid="stance-delete" onClick={() => setDialog({ remove: current })}>
                      {t('Delete')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dialog?.vibe && <VibeDialog sign={sign} current={vibes[sign] ?? ''} onClose={() => setDialog(null)} />}
      {dialog?.edit && <StanceDialog sign={sign} stance={dialog.edit} onClose={() => setDialog(null)} />}
      {dialog?.add && <StanceDialog sign={sign} parent={dialog.add} stance={null} onClose={() => setDialog(null)} onDone={(st) => setPicked(st.id)} />}
      {dialog?.remove && (
        <FormDialog
          title={t('Delete Stance')}
          submitLabel={t('Delete')}
          danger
          onClose={() => setDialog(null)}
          run={async () => {
            const r = await call('stance:delete', { id: dialog.remove.id });
            if (r.ok) setPicked(`base:${sign}`);
            else toast(r.error);
            return r;
          }}
        >
          <p className="text-sm">{t('Delete {name} and every variation hanging from it? This cannot be undone.', { name: dialog.remove.name })}</p>
        </FormDialog>
      )}
    </div>
  );
}

// The table of a Stance: one row per band; a "-" row is merged into the cell above it.
function BandTable({ table }) {
  const t = useT();
  const groups = groupTable(table);
  return (
    <table className="mt-3 w-full border-collapse text-sm" data-testid="band-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide opacity-60">
          <th className="w-28 py-1 pr-2">{t('Stance roll')}</th>
          <th className="py-1">{t('Effect')}</th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((g) =>
          Array.from({ length: g.span }, (_, k) => {
            const i = g.from + k;
            const parts = bandParts(g.effect, t);
            return (
              <tr key={i} className="border-t border-white/10" data-testid="band-row" data-band={BANDS[i].id}>
                <td className="py-1 pr-2 align-top opacity-80">{t(BANDS[i].label)}</td>
                {k === 0 && (
                  <td className="border-l border-white/10 py-1 pl-2 align-middle" rowSpan={g.span} data-testid="band-effect" data-span={g.span}>
                    {parts.length ? parts.join('; ') : <span className="opacity-50">{t('No effect')}</span>}
                    {g.effect.unique.map((u, j) => (
                      <div key={j} className="mt-1 text-xs opacity-70">
                        {u.name}: {u.text}
                      </div>
                    ))}
                  </td>
                )}
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

function VibeDialog({ sign, current, onClose }) {
  const t = useT();
  const [text, setText] = useState(current);
  return (
    <FormDialog title={t('Vibe of {name}', { name: { t: stoneInfo(sign).name } })} submitLabel={t('Save')} onClose={onClose} run={() => call('stance:vibe', { sign, vibe: text })}>
      <textarea className={`${input} min-h-20`} data-testid="stance-vibe-text" aria-label={t('Vibe')} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs opacity-60">{t('Empty brings back the default text.')}</p>
    </FormDialog>
  );
}

// ---- The GM's editor for one Stance ------------------------------------------------------------------------

const rowToForm = (r) => ({
  same: !!r.same,
  bonus: String(r.effect?.bonus ?? 0),
  advantage: String(r.effect?.advantage ?? 0),
  range: String(r.effect?.range ?? 0),
  damage: String(r.effect?.damage ?? 0),
  statuses: r.effect?.statuses ?? [],
  dice: r.effect?.dice ?? [],
  unique: r.effect?.unique ?? [],
  effects: r.effect?.effects ?? [],
});
const rowValid = (r) => r.same || (isNum(r.bonus, -99, 99) && isNum(r.advantage, -10, 10) && isNum(r.range, -99, 99) && isNum(r.damage, -99, 99));
const formToRow = (r) =>
  r.same
    ? { same: true }
    : { same: false, effect: { bonus: Number(r.bonus), advantage: Number(r.advantage), range: Number(r.range), damage: Number(r.damage), statuses: r.statuses, dice: r.dice, unique: r.unique.filter((u) => u.name.trim()), effects: r.effects } };

function StanceDialog({ sign, stance, parent, onClose, onDone }) {
  const t = useT();
  const { roster } = useApp();
  const [name, setName] = useState(stance?.name ?? '');
  const [description, setDescription] = useState(stance?.description ?? '');
  const [color, setColor] = useState(stance?.color ?? '#ffffff');
  const [known, setKnown] = useState(stance?.known ?? false);
  const [learned, setLearned] = useState(stance?.learned ?? []);
  const [find, setFind] = useState('');
  const [cost, setCost] = useState(() => costToForm(stance?.cost));
  const [rows, setRows] = useState(() => (stance?.table ?? BANDS.map(() => ({ same: false, effect: blankEffect() }))).map(rowToForm));
  const people = (roster?.characters ?? []).filter((c) => !find.trim() || c.name.toLowerCase().includes(find.trim().toLowerCase()));
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const valid = name.trim() && costValid(cost) && rows.every(rowValid);

  async function run() {
    const body = { name: name.trim(), description, color, known, learned: known ? learned : [], cost: formToCost(cost), table: rows.map(formToRow) };
    const r = stance ? await call('stance:save', { id: stance.id, stance: body }) : await call('stance:save', { sign, parentId: parent.id, stance: body });
    if (r.ok && !stance) onDone?.(r.stance);
    return r;
  }

  return (
    <FormDialog title={stance ? t('Edit Stance') : t('New variation of {name}', { name: parent.name })} submitLabel={stance ? t('Save') : t('Add')} onClose={onClose} canSubmit={!!valid} run={run}>
      <label className={label}>
        {t('Name')}
        <input className={input} data-testid="stance-edit-name" value={name} maxLength={D.NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        {t('Description')}
        <textarea className={`${input} min-h-16`} value={description} maxLength={D.TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex items-center gap-3 text-sm">
        {t('Colour of the circle')}
        <input type="color" data-testid="stance-color" aria-label={t('Colour of the circle')} value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded" />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" data-testid="stance-known" checked={known} onChange={(e) => setKnown(e.target.checked)} />
        {t('Character-Known (characters have seen it and can read it)')}
      </label>
      {known && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
          <div className="text-sm">{t('Learned by (can use it in attacks)')}</div>
          <input className={input} type="search" aria-label={t('Search')} placeholder={t('Search')} value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto" data-testid="stance-learned">
            {people.map((c) => (
              <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" data-testid="stance-learned-check" data-name={c.name} checked={learned.includes(c.id)} onChange={(e) => setLearned(e.target.checked ? [...learned, c.id] : learned.filter((x) => x !== c.id))} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs opacity-60">{c.type === 'pc' ? t('PC') : t('NPC')}</span>
              </label>
            ))}
            {people.length === 0 && <span className="text-sm opacity-60">{t('Nobody found.')}</span>}
          </div>
        </div>
      )}

      <CostFields f={cost} up={(patch) => setCost({ ...cost, ...patch })} items={[]} />
      <p className="text-xs opacity-50">{t('This Stance\'s Cost is paid with the attack, like an Enhancement\'s (not for the whole Zodiac).')}</p>

      <div className="text-sm">{t('What each Stance roll does')}</div>
      {rows.map((r, i) => (
        <details key={BANDS[i].id} className="rounded-lg border border-white/10 p-2" open={i === 0} data-testid="band-edit" data-band={BANDS[i].id}>
          <summary className="cursor-pointer text-sm font-medium">
            {t(BANDS[i].label)} {r.same ? '(-)' : ''}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {i > 0 && (
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" data-testid="band-same" checked={r.same} onChange={(e) => setRow(i, { same: e.target.checked })} />
                {t('Same as the band above (-)')}
              </label>
            )}
            {!r.same && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className={label}>
                    {t('Roll bonus')}
                    <IntInput label={t('Roll bonus')} value={r.bonus} onChange={(v) => setRow(i, { bonus: v })} />
                  </label>
                  <label className={label}>
                    {t('Advantage')}
                    <IntInput label={t('Advantage')} value={r.advantage} onChange={(v) => setRow(i, { advantage: v })} />
                  </label>
                  <label className={label}>
                    {t('Range')}
                    <IntInput label={t('Range')} value={r.range} onChange={(v) => setRow(i, { range: v })} />
                  </label>
                  <label className={label}>
                    {t('Damage')}
                    <IntInput label={t('Damage')} value={r.damage} onChange={(v) => setRow(i, { damage: v })} />
                  </label>
                </div>
                <StatusList value={r.statuses} onChange={(v) => setRow(i, { statuses: v })} title={t('Adds these statuses to targets that are hit')} />
                <DiceList value={r.dice} onChange={(v) => setRow(i, { dice: v })} title={t('Dice Roll Bonuses')} />
                <UniqueList value={r.unique} onChange={(v) => setRow(i, { unique: v })} title={t('Unique Effects')} />
                <EffectRefs value={r.effects} onChange={(v) => setRow(i, { effects: v })} title={t('Effects it puts on (whether or not it hits)')} />
              </>
            )}
          </div>
        </details>
      ))}
    </FormDialog>
  );
}
