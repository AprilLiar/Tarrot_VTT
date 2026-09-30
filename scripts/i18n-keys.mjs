import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { termKeys } from '../shared/terms.js';

// Finds every piece of user-visible text the code asks to translate, so LOCALIZATION.md can be kept
// complete. A text is asked for with  t('English')  (client and server),  T('English')  (a marker for
// text that is passed on to a translating function later),  msg('English {x}', params)  (a chat line
// sent as data),  new AppError('code', 'English')  and  { t: 'English' }  (a game term inside params).
// Only plain string literals count: a text with a changing part uses {placeholders}, never ${...}.

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['client/src', 'server', 'shared'];
const SKIP = new Set(['node_modules', 'dist', 'test']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(js|jsx)$/.test(name)) yield full;
  }
}

const STR = String.raw`(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|\`((?:\\.|[^\`\\$])*)\`)`;
const PATTERNS = [
  new RegExp(String.raw`(?<![\w.$])(?:t|T|msg)\(\s*${STR}`, 'g'),
  new RegExp(String.raw`new (?:AppError|RosterError)\(\s*'[^']*'\s*,\s*${STR}`, 'g'),
  new RegExp(String.raw`[{,]\s*t:\s*${STR}`, 'g'),
];
// Chat lines and other messages built as data on the server: { key: 'English {x}', params }.
const KEY_PATTERN = new RegExp(String.raw`\{\s*key:\s*${STR}`, 'g');
// Helpers that build an error from a text: bad('...') in the server and fail('...') in the roll rules.
const HELPER_PATTERN = new RegExp(String.raw`(?<![\w.$])(?:bad|fail)\(\s*${STR}`, 'g');
const DYNAMIC = /(?<![\w.$])(?:t|T|msg)\(\s*`[^`]*\$\{/g;
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1');

// -> { keys: Map(text -> [files]), problems: [string] }
export function collectKeys(root = ROOT) {
  const keys = new Map();
  const problems = [];
  const note = (text, file) => {
    if (!keys.has(text)) keys.set(text, []);
    if (!keys.get(text).includes(file)) keys.get(text).push(file);
  };
  for (const dir of DIRS) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).replaceAll('\\', '/');
      // Comments are not texts: drop whole-line comments and block comments before looking.
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');
      // Message objects ({ key: 'English' }) live in server and shared code, but rules-data.js has ids named key.
      const patterns = dir === 'client/src' ? PATTERNS : [...PATTERNS, ...(rel === 'shared/rules-data.js' ? [] : [KEY_PATTERN, HELPER_PATTERN])];
      for (const re of patterns) {
        for (const m of src.matchAll(re)) note(unescape(m[1] ?? m[2] ?? m[3]), rel);
      }
      for (const m of src.matchAll(DYNAMIC)) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push(`${rel}:${line}: a translated text must not use \${...}; use {placeholders} and params`);
      }
    }
  }
  for (const term of termKeys()) note(term, 'shared/rules-data.js');
  return { keys, problems };
}
