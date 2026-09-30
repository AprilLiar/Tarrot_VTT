// Localization shared by the server and the client.
//
// The English text of the interface is its own key. The Russian text lives in LOCALIZATION.md, a
// Markdown table (English | Russian) that people can read and fix by hand on GitHub. Text with a
// changing part uses {name} placeholders, the same in both columns: "Round {round}: {name}'s turn."
//
// A message can also be sent as data, so every reader shows it in their own language:
//   { key: "{name} rolls Initiative: {n}.", params: { name: "Orc", n: 12 } }
// A parameter is a plain value, { t: "Fire" } (a game term to translate) or a nested { key, params }.

export const LANGS = ['en', 'ru'];
export const DEFAULT_LANG = 'en';
export const LANG_NAMES = { en: 'English', ru: 'Русский' };

// "| a \| b | c |" -> ["a | b", "c"]
function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  // A row starts and ends with a pipe, so the first and last cells are empty.
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells;
}

// Every row of the table, in order: [{ en, ru, line }]. `ru` is '' while there is no translation yet.
// Lines that are not "English | Russian" rows (headings, prose, the header and separator) are skipped.
export function parseRows(markdown) {
  const rows = [];
  String(markdown ?? '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim().startsWith('|')) return;
    const cells = splitRow(line.trim());
    if (cells.length < 2) return;
    if (/^:?-{2,}:?$/.test(cells[0].replace(/\s/g, ''))) return; // | --- | --- |
    const [en, ru] = cells;
    if (!en) return;
    if (en === 'English' && ru === 'Russian') return; // the header
    rows.push({ en, ru: ru ?? '', line: i + 1 });
  });
  return rows;
}

// The translations as a Map (English -> Russian); a row with no Russian yet is left out.
// -> { map, problems: [string] }
export function parseTable(markdown) {
  const map = new Map();
  const problems = [];
  const seen = new Set();
  for (const { en, ru, line } of parseRows(markdown)) {
    if (seen.has(en)) problems.push(`line ${line}: "${en}" appears twice`);
    seen.add(en);
    if (ru) map.set(en, ru);
    else problems.push(`line ${line}: "${en}" has no Russian text`);
  }
  return { map, problems };
}

// Writes one row of the table (the pipes in the text are escaped).
export const tableRow = (en, ru) => `| ${en.replace(/\|/g, '\\|')} | ${ru.replace(/\|/g, '\\|')} |`;

// Marks a text that is translated later (passed on to something that calls t()). Does nothing itself;
// scripts/i18n-keys.mjs finds every T('...') so LOCALIZATION.md gets a row for it.
export const T = (text) => text;

const PLACEHOLDER = /\{(\w+)\}/g;

// Fills {name} placeholders. `tr(text)` translates game terms, `params` values may be nested messages.
function fill(template, params, tr) {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name) => {
    if (!(name in params)) return whole;
    const v = params[name];
    if (v && typeof v === 'object') {
      if ('t' in v) return tr(String(v.t));
      if ('key' in v) return render(v, tr);
    }
    return String(v);
  });
}

// Joins parameter values into one: joinMsgs([a, b, c], ', ') shows "a, b, c" in the reader's language.
// Each item is a plain value, { t: 'Term' } or a nested { key, params }.
export function joinMsgs(list, sep = ', ') {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  const [head, ...rest] = list;
  return { key: `{a}${sep}{b}`, params: { a: head, b: joinMsgs(rest, sep) } };
}

// Shows a message with the given translator: `tr(text)` returns the text in the reader's language.
export function render(message, tr = (x) => x) {
  if (typeof message === 'string') return tr(message);
  return fill(tr(message.key), message.params, tr);
}

// The translator for one language. `table` is the Map from parseTable.
// Falls back to English when there is no translation, so a missing row never shows an empty label.
export function makeTr(lang, table) {
  if (lang === 'en' || !table) return (text) => text;
  return (text) => {
    const hit = table.get(text);
    if (hit !== undefined) return hit;
    // A game term with a number after it, such as a status with its stacks ("Dazed 2").
    const m = /^(.*\S) (\d+)$/.exec(text);
    if (m && table.has(m[1])) return `${table.get(m[1])} ${m[2]}`;
    return text;
  };
}

// t("Round {round}", { round: 2 }) in a language.
export function translate(lang, table, text, params) {
  const tr = makeTr(lang, table);
  return fill(tr(text), params, tr);
}
