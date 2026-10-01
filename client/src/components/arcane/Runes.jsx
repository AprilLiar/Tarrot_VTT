import { useState } from 'react';
import { GLYPHS, RUNE_VIEWBOX } from './runeGlyphs.js';
import { btn, btnDanger } from '../Dialog.jsx';
import { FormDialog } from '../sheet/SheetLists.jsx';
import { ALL_CATEGORIES, MAX_CHAIN, runeInfo } from '../../../../shared/runes.js';
import { stoneInfo } from '../../../../shared/spells.js';
import { useT } from '../../i18n.jsx';

// The picture of one rune, drawn in the current text colour. A Spell Stone rune is the stone's symbol.
export function RuneGlyph({ id, size = 40 }) {
  const info = runeInfo(id);
  if (!info) return null;
  if (info.sign) {
    return (
      <svg width={size} height={size} viewBox={RUNE_VIEWBOX} aria-hidden="true" className="shrink-0" data-rune={id}>
        <text x="0" y="1" textAnchor="middle" dominantBaseline="central" fontSize="30" fill="currentColor">
          {stoneInfo(info.sign).glyph}
        </text>
      </svg>
    );
  }
  const g = GLYPHS[id];
  return (
    <svg width={size} height={size} viewBox={RUNE_VIEWBOX} aria-hidden="true" className="shrink-0" data-rune={id}>
      <path d={g.d} fill="currentColor" fillRule={g.eo ? 'evenodd' : 'nonzero'} />
    </svg>
  );
}

// The name of a rune in the reader's language (a Spell Stone rune is named after the stone).
export function useRuneName() {
  const t = useT();
  return (id) => {
    const info = runeInfo(id);
    if (!info) return '';
    return t(info.sign ? stoneInfo(info.sign).name : info.name);
  };
}

// A chain of runes, left to right on one line. It scrolls sideways only when it is wider than the screen.
// With `onPick` the runes are buttons (the editor selects one to remove it).
export function RuneChain({ runes, size = 40, selected = null, onPick = null, testId = 'rune-chain' }) {
  const name = useRuneName();
  if (!runes.length) return null;
  return (
    <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto py-1" data-testid={testId} data-count={runes.length}>
      {runes.map((id, i) =>
        onPick ? (
          <button
            key={i}
            type="button"
            data-testid="rune"
            data-rune={id}
            aria-pressed={selected === i}
            title={name(id)}
            aria-label={name(id)}
            className={`shrink-0 rounded-lg p-0.5 ${selected === i ? 'bg-amber-400/25 ring-2 ring-amber-400' : 'bg-white/5'}`}
            onClick={() => onPick(i)}
          >
            <RuneGlyph id={id} size={size} />
          </button>
        ) : (
          <span key={i} data-testid="rune" data-rune={id} title={name(id)} className="shrink-0">
            <RuneGlyph id={id} size={size} />
          </span>
        ),
      )}
    </div>
  );
}

// The categories of runes: open one to see its runes, tap a rune to add it to the end of the chain.
function RunePicker({ onAdd, full }) {
  const t = useT();
  const name = useRuneName();
  const [open, setOpen] = useState(null);
  const category = ALL_CATEGORIES.find((c) => c.id === open);
  return (
    <div data-testid="rune-picker">
      <div className="flex flex-wrap gap-1">
        {ALL_CATEGORIES.map((c) => (
          <button key={c.id} type="button" data-testid={`rune-category-${c.id}`} aria-expanded={open === c.id} className={`${btn} min-h-9 px-3 text-xs ${open === c.id ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {t(c.name)}
          </button>
        ))}
      </div>
      {category && (
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" data-testid="rune-list" data-category={category.id}>
          {category.runes.map((r) => (
            <button key={r.id} type="button" data-testid={`rune-pick-${r.id}`} disabled={full} title={name(r.id)} className="flex min-h-12 items-center gap-2 rounded-lg bg-white/5 px-2 text-left text-sm active:bg-white/15 disabled:opacity-40" onClick={() => onAdd(r.id)}>
              <RuneGlyph id={r.id} size={34} />
              <span className="min-w-0 flex-1 leading-tight">{name(r.id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Spell Fine Tuning in the editor: a chain of runes typed one after another (at most 99). Backspace removes the last
// one, a tapped rune can be removed, Clear empties the chain.
export function RuneEditor({ runes, onChange }) {
  const t = useT();
  const [selected, setSelected] = useState(null);
  const [clearing, setClearing] = useState(false);
  const full = runes.length >= MAX_CHAIN;
  const add = (id) => {
    if (!full) onChange([...runes, id]);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-[3.5rem] rounded-xl bg-black/30 px-2" data-testid="rune-field">
        {runes.length === 0 ? <p className="py-4 text-sm opacity-50">{t('No runes yet. Open a category and tap a rune to add it.')}</p> : <RuneChain runes={runes} size={44} selected={selected} onPick={(i) => setSelected(selected === i ? null : i)} testId="runes" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} data-testid="rune-backspace" disabled={!runes.length} onClick={() => { onChange(runes.slice(0, -1)); setSelected(null); }}>
          {t('Backspace')}
        </button>
        <button type="button" className={btn} data-testid="rune-remove" disabled={selected == null} onClick={() => { onChange(runes.filter((_, i) => i !== selected)); setSelected(null); }}>
          {t('Remove selected')}
        </button>
        <button type="button" className={btnDanger} data-testid="rune-clear" disabled={!runes.length} onClick={() => setClearing(true)}>
          {t('Clear')}
        </button>
        <span className="ml-auto text-xs opacity-60" data-testid="rune-count">
          {runes.length} / {MAX_CHAIN}
        </span>
      </div>
      <RunePicker onAdd={add} full={full} />
      {clearing && (
        <FormDialog title={t('Clear the runes')} submitLabel={t('Clear')} danger onClose={() => setClearing(false)} run={() => { onChange([]); setSelected(null); return { ok: true }; }}>
          <p className="text-sm">{t('Remove every rune from the chain?')}</p>
        </FormDialog>
      )}
    </div>
  );
}
