import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseRows, tableRow } from '../shared/localization.js';
import { collectKeys, ROOT } from './i18n-keys.mjs';

// Keeps LOCALIZATION.md in step with the code.
//   node scripts/i18n-sync.mjs          adds a row (with no Russian yet) for every new text, drops nothing,
//                                       and regroups the rows by part of the app. Existing Russian is kept.
//   node scripts/i18n-sync.mjs --check  only reports what is missing, empty or unused.
const FILE = path.join(ROOT, 'LOCALIZATION.md');

const SECTIONS = [
  ['General', (f) => /^client\/src\/(?!components\/(sheet|scene|Roster|ChatPanel|AttackCard|folderUi)|music)/.test(f)],
  ['Characters and roster (GM)', (f) => /client\/src\/components\/(Roster|folderUi)/.test(f)],
  ['Character sheet', (f) => f.startsWith('client/src/components/sheet/')],
  ['Chat and rolls', (f) => f.includes('ChatPanel')],
  ['Attacks', (f) => f.includes('AttackCard')],
  ['Battle map and combat', (f) => /scene\/(BattleView|CombatBar|TokenMenu|HeightControl)/.test(f)],
  ['Scenes, stage and library', (f) => f.startsWith('client/src/components/scene/')],
  ['Music', (f) => f.startsWith('client/src/music/')],
  ['Game terms (stats, skills, statuses, damage types)', (f) => f === 'shared/rules-data.js'],
  ['Messages from the server (errors and chat lines)', (f) => f.startsWith('server/') || f.startsWith('shared/')],
];

const HEADER = `# Localization Mapping

The text of the app in English and Russian. **The app reads the Russian text from this file**: the page is
built with it, and the server reads it when it starts, so a fix made here goes live with the next deploy.

- Fix a translation by editing the right-hand cell. Keep every \`{placeholder}\` exactly as it is
  (\`{name}\`, \`{n}\` ...): the app fills them in. A pipe inside a text is written \`\\|\`.
- The left column is the English text used in the app. It is the row's key, so do not change it here:
  change the text in the code and the row is renamed on the next sync. A missing translation shows the English text.
- New texts appear with an empty Russian cell (the check in CI fails until it is filled in).
- Rows are grouped by part of the app. Names typed by people (characters, items, scenes) are not translated.

`;

const rows = existsSync(FILE) ? parseRows(readFileSync(FILE, 'utf8')) : [];
const have = new Map(rows.map((r) => [r.en, r.ru]));
const { keys, problems } = collectKeys();

if (process.argv.includes('--check')) {
  const missing = [...keys.keys()].filter((k) => !have.has(k));
  const empty = [...keys.keys()].filter((k) => have.has(k) && !have.get(k));
  const unused = [...have.keys()].filter((k) => !keys.has(k));
  console.log(`${keys.size} texts in the code, ${have.size} rows.`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  for (const k of missing) console.log(`MISSING ${k}`);
  for (const k of empty) console.log(`EMPTY   ${k}`);
  for (const k of unused) console.log(`UNUSED  ${k}`);
  process.exit(problems.length || missing.length || empty.length ? 1 : 0);
}

const grouped = new Map(SECTIONS.map(([title]) => [title, []]));
for (const [text, files] of keys) {
  const section = SECTIONS.find(([, test]) => files.some(test)) ?? SECTIONS[0];
  grouped.get(section[0]).push(text);
}
let out = HEADER;
const emit = (title, list) => {
  if (!list.length) return;
  out += `## ${title}\n\n| English | Russian |\n| --- | --- |\n`;
  for (const en of list) out += `${tableRow(en, have.get(en) ?? '')}\n`;
  out += '\n';
};
for (const [title, list] of grouped) emit(title, list);
// Rows the code no longer asks for are kept only while they hold a Russian text worth keeping.
emit('Unused (no longer in the app)', [...have.keys()].filter((k) => !keys.has(k) && have.get(k)));
writeFileSync(FILE, out);
console.log(`Wrote ${FILE}: ${keys.size} texts, ${[...keys.keys()].filter((k) => !have.get(k)).length} still need Russian.`);
