import * as D from './rules-data.js';

// Every piece of text that comes from data instead of a t("...") call in the code: game terms and the
// roll titles built from them. LOCALIZATION.md needs a row for each; server/test/localization.test.js
// checks that, including a real roll of every kind, so a new stat or skill cannot be forgotten.
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function termKeys() {
  const keys = new Set();
  const add = (k) => keys.add(k);
  for (const label of Object.values(D.STAT_LABELS)) {
    add(label);
    add(`${label} Attribute Roll`);
    add(`${label} Save`);
    add(`${label} Defence`);
    add(`Prime: ${label}`);
  }
  for (const g of Object.values(D.GROUP_SAVES)) {
    add(g.label);
    add(`${g.label} Save`);
    add(`${g.label} Defence`);
  }
  for (const label of Object.values(D.MASTERY_LABELS)) {
    add(label);
    add(`Mastery: ${label}`);
    add(`${label} (Combat Mastery Roll)`);
    add(`${label} attack`);
  }
  for (const s of D.SKILLS) {
    add(s.label);
    add(`Mastery: ${s.label}`);
    add(`${s.label} (Skill Roll)`);
  }
  for (const t of D.DAMAGE_TYPES) add(cap(t));
  for (const label of ['Miss', 'Hit', 'Heavy Hit', 'Brutal Hit']) add(label);
  for (const st of D.STATUSES) {
    add(st.name);
    add(st.text);
  }
  add('Weapon Attack Roll');
  add('Initiative (Speed)');
  // The compass points on the D-pad of the phone remote.
  for (const dir of ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE']) add(dir);
  // The separators joinMsgs() puts between joined values.
  for (const k of ['{a}, {b}', '{a} {b}', '{a}; {b}']) add(k);
  return keys;
}
