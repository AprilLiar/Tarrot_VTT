import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable, translate, render, LANGS, DEFAULT_LANG } from '../shared/localization.js';

// Server messages (errors and chat lines) are shown in the language of whoever reads them. The Russian
// text comes from LOCALIZATION.md at the repo root, read once when the server starts.
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'LOCALIZATION.md');

function load() {
  try {
    return parseTable(readFileSync(file, 'utf8')).map;
  } catch (err) {
    console.error('Could not read LOCALIZATION.md; using English only.', err.message);
    return new Map();
  }
}

export const table = load();
export { LANGS, DEFAULT_LANG };
export const isLang = (v) => LANGS.includes(v);

// "Height must be from 0 to {max} Spaces." + { max: 99 } in a language.
export const t = (lang, text, params) => translate(isLang(lang) ? lang : DEFAULT_LANG, table, text, params);

// A message as data, for chat lines: { key, params }. `text` is its English form, for anyone who cannot
// localize it. Clients that can show it in their own language use key and params instead.
export const msg = (key, params) => ({ key, params });
export const english = (message) => render(message);

// The fields of a chat message that carries a message as data.
export const line = (message) => ({ text: english(message), key: message.key, params: message.params });
