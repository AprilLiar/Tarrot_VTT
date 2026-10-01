import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { socket } from './socket.js';
import { LANGS, LANG_NAMES, parseTable, translate, makeTr, renderParts } from '../../shared/localization.js';
// The Russian texts: the Markdown table people fix by hand on GitHub, bundled into the page at build time.
import localizationMd from '../../LOCALIZATION.md?raw';

const { map: TABLE } = parseTable(localizationMd);
const STORAGE_KEY = 'tarrot.lang';

// The language is a setting of this device (browser storage), like the remembered identity.
function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (text) => text, parts: (m) => renderParts(m) });

// Everything the interface says goes through t("English text", { params }); see LOCALIZATION.md.
export const useT = () => useContext(LangContext).t;
export const useLang = () => useContext(LangContext);
// A message from the server as coloured pieces: [{ text, c? }] (see renderParts in shared/localization.js).
export const useParts = () => useContext(LangContext).parts;
export { LANGS, LANG_NAMES };

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const t = useMemo(() => (text, params) => translate(lang, TABLE, text, params), [lang]);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    setLangState(next);
  }, []);

  // The GM pushed a language to everybody.
  useEffect(() => {
    const onForced = ({ key, value }) => key === 'lang' && setLang(value);
    socket.on('setting:forced', onForced);
    return () => socket.off('setting:forced', onForced);
  }, [setLang]);

  // The server writes its own messages (errors, combat lines) in this socket's language.
  useEffect(() => {
    document.documentElement.lang = lang;
    const tell = () => socket.emit('lang:set', { lang });
    if (socket.connected) tell();
    socket.on('connect', tell);
    return () => socket.off('connect', tell);
  }, [lang]);

  const parts = useMemo(() => {
    const tr = makeTr(lang, TABLE);
    return (message) => renderParts(message, tr);
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t, parts }), [lang, setLang, t, parts]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
