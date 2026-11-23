import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, useApp } from '../AppContext.jsx';
import { useT } from '../i18n.jsx';
import { requestFocus } from '../lib/searchFocus.js';
import { T } from '../../../shared/localization.js';

// Search in the top bar (see the README, "Search"): a magnifier button opens a box; results come from the server as you type (only what
// you may see) and a tap opens one where it lives.
const KIND = {
  character: T('Character'),
  item: T('Item'),
  spell: T('Spell'),
  stance: T('Stance'),
  effect: T('Effect'),
  tarot: T('Tarot Card'),
  scene: T('Scene'),
};

export function SearchBox() {
  const t = useT();
  const { identity } = useApp();
  const gm = identity?.role === 'gm';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await call('search', { q });
      if (r.ok && n === seq.current) setResults(r.results);
    }, 150);
    return () => clearTimeout(timer);
  }, [q, open]);

  function close() {
    setOpen(false);
    setQ('');
    setResults([]);
  }

  function go(r) {
    close();
    const sheetPath = (id) => (gm ? `/character/${id}` : '/');
    const key = `${r.kind}:${r.id}`;
    if (r.kind === 'character') return navigate(sheetPath(r.id));
    if (r.kind === 'scene') {
      navigate('/scene');
      return requestFocus({ scenes: true });
    }
    if (r.kind === 'stance' || (r.kind === 'effect' && r.characterId == null)) {
      const tab = r.kind === 'stance' ? 'stances' : 'general';
      if (gm) navigate('/arcane');
      else navigate('/');
      return requestFocus({ view: 'arcane', tab, key });
    }
    navigate(sheetPath(r.characterId));
    if (r.kind === 'spell') return requestFocus({ view: 'arcane', tab: 'magic', key });
    if (r.kind === 'tarot') return requestFocus({ view: 'arcane', tab: 'manifest', key });
    return requestFocus({ view: 'sheet', key });
  }

  return (
    <>
      <button data-testid="search-open" aria-label={t('Search')} title={t('Search')} className="flex min-h-11 shrink-0 items-center rounded-lg bg-white/10 px-2.5 active:bg-white/20" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5" />
          <path d="M11.5 11.5L16 16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/60 p-3 pt-16" onClick={close}>
          <div className="flex h-fit max-h-[80dvh] w-full max-w-lg flex-col rounded-2xl bg-[#1a1626] p-3" onClick={(e) => e.stopPropagation()} data-testid="search-panel">
            <input
              autoFocus
              className="min-h-11 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-base"
              placeholder={t('Search by name')}
              value={q}
              data-testid="search-input"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
                if (e.key === 'Enter' && results[0]) go(results[0]);
              }}
            />
            <div className="mt-2 flex flex-col gap-1 overflow-y-auto">
              {q.trim().length >= 2 && results.length === 0 && <p className="p-2 text-sm opacity-60">{t('Nothing found.')}</p>}
              {results.map((r) => (
                <button key={`${r.kind}:${r.id}:${r.characterId ?? ''}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left active:bg-white/10 hover:bg-white/5" data-testid="search-result" data-kind={r.kind} onClick={() => go(r)}>
                  <span className="w-20 shrink-0 text-xs uppercase tracking-wide opacity-60">{t(KIND[r.kind])}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.owner && r.kind !== 'character' && <span className="truncate text-xs opacity-60">{r.owner}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
