import { useEffect, useState } from 'react';

// Opening a search result (see the README, "Search"): the page is navigated to, then whatever shows the result picks up the request here:
// the sheet switches to its view (`view`), the Arcane page to its tab (`tab`), and the row (`key`, matched against data-search-id) is
// scrolled to and flashed once it is drawn. A request is forgotten after a few seconds.
let pending = null;
const listeners = new Set();

export function requestFocus(focus) {
  pending = { ...focus, at: Date.now() };
  listeners.forEach((fn) => fn(pending));
  if (focus.key) scrollWhenDrawn(focus.key);
}

// The current request, while it is fresh (for pages that open after it was made).
export function useFocusRequest() {
  const [focus, setFocus] = useState(() => (pending && Date.now() - pending.at < 3000 ? pending : null));
  useEffect(() => {
    listeners.add(setFocus);
    return () => listeners.delete(setFocus);
  }, []);
  return focus;
}

function scrollWhenDrawn(key) {
  const until = Date.now() + 3000;
  const look = () => {
    const el = document.querySelector(`[data-search-id="${CSS.escape(key)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('search-flash');
      setTimeout(() => el.classList.remove('search-flash'), 1600);
      return;
    }
    if (Date.now() < until) setTimeout(look, 60);
  };
  look();
}
