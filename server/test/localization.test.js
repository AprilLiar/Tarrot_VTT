import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { io as connect } from 'socket.io-client';
import { createDb, initSchema } from '../db.js';
import { createServer } from '../app.js';
import { normalizeSheet } from '../sheet.js';
import { planRoll } from '../../shared/roll-plan.js';
import * as D from '../../shared/rules-data.js';
import { parseRows, parseTable, translate, makeTr, render, joinMsgs, tableRow } from '../../shared/localization.js';
import { collectKeys, ROOT } from '../../scripts/i18n-keys.mjs';

const md = readFileSync(`${ROOT}/LOCALIZATION.md`, 'utf8');
const { map: TABLE } = parseTable(md);
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('the table format', () => {
  const sample = ['| English | Russian |', '| --- | --- |', '| Close | Закрыть |', '| Round {n} | Раунд {n} |', '| a \\| b | и |', '| Empty | |', 'Some prose | not a row'].join('\n');

  it('reads rows, unescapes pipes, skips the header and prose, and notes rows with no Russian', () => {
    const { map, problems } = parseTable(sample);
    expect([...map]).toEqual([['Close', 'Закрыть'], ['Round {n}', 'Раунд {n}'], ['a | b', 'и']]);
    expect(problems).toEqual(['line 6: "Empty" has no Russian text']);
    expect(parseRows(sample)).toHaveLength(4);
  });

  it('writes a row that reads back the same', () => {
    const row = tableRow('a | b', 'в | г');
    expect(parseRows(row)[0]).toMatchObject({ en: 'a | b', ru: 'в | г' });
  });

  it('fills placeholders, translates game terms and nested messages, and falls back to English', () => {
    const { map } = parseTable(sample);
    expect(translate('ru', map, 'Round {n}', { n: 2 })).toBe('Раунд 2');
    expect(translate('en', map, 'Round {n}', { n: 2 })).toBe('Round 2');
    expect(translate('ru', map, 'Unlisted {n}', { n: 1 })).toBe('Unlisted 1');
    const tr = makeTr('ru', map);
    expect(render({ key: 'Round {n}', params: { n: { t: 'Close' } } }, tr)).toBe('Раунд Закрыть');
    expect(render(joinMsgs([{ t: 'Close' }, 3, { key: 'Round {n}', params: { n: 1 } }]), tr)).toBe('Закрыть, 3, Раунд 1');
    // A game term with a number after it: a status with its stacks.
    expect(tr('Close 2')).toBe('Закрыть 2');
  });
});

describe('LOCALIZATION.md is complete', () => {
  const { keys, problems } = collectKeys();
  const rows = parseRows(md);

  it('has a Russian text for every text the app asks for, and no duplicates', () => {
    expect(problems).toEqual([]);
    const missing = [...keys.keys()].filter((k) => !TABLE.has(k));
    expect(missing, `Missing in LOCALIZATION.md (run: node scripts/i18n-sync.mjs, then fill in the Russian):\n${missing.join('\n')}`).toEqual([]);
    const seen = new Set();
    const dup = rows.map((r) => r.en).filter((en) => (seen.has(en) ? true : (seen.add(en), false)));
    expect(dup).toEqual([]);
  });

  it('keeps the same {placeholders} in both columns', () => {
    const bad = rows.filter((r) => r.ru && placeholders(r.en) !== placeholders(r.ru)).map((r) => r.en);
    expect(bad).toEqual([]);
  });

  it('has no rows for text the app no longer uses that still lack Russian', () => {
    const empty = rows.filter((r) => !r.ru).map((r) => r.en);
    expect(empty).toEqual([]);
  });
});

describe('rolls are fully translatable', () => {
  const tr = makeTr('ru', TABLE);
  const known = (text) => TABLE.has(text) || /^(.*\S) \d+$/.test(text) && TABLE.has(text.replace(/ \d+$/, ''));

  it('every title, term and Advantage source of every kind of roll has a row', () => {
    const sheet = normalizeSheet({ statuses: { dazed: 1, impaired: 2, exhaustion: 1, weakened: 1, disoriented: 1, grappled: 1 } });
    const requests = [
      ...D.STATS.map((key) => ({ kind: 'attribute', key })),
      ...D.SAVE_STATS.map((key) => ({ kind: 'save', key })),
      ...Object.keys(D.GROUP_SAVES).map((key) => ({ kind: 'save', key })),
      ...D.SKILLS.map((s) => ({ kind: 'skill', key: s.key })),
      ...D.MASTERIES.map((key) => ({ kind: 'mastery', key })),
    ];
    const seen = new Set();
    for (const r of requests) {
      const sh = structuredClone(sheet);
      sh.xDefence = { strength: 1, dexterity: 1, intelligence: 1, spirit: 1 };
      sh.skills = Object.fromEntries(D.SKILLS.map((s) => [s.key, 2]));
      const plan = planRoll(sh, { ...r, advantage: 1, modifier: 1 });
      expect(plan.ok, JSON.stringify(r)).toBe(true);
      for (const text of [plan.title, ...plan.terms.map((t) => t.label), ...plan.sources.map((s) => s.label)]) seen.add(text);
    }
    const unknown = [...seen].filter((text) => !known(text));
    expect(unknown).toEqual([]);
    expect(tr('Dazed 2')).not.toBe('Dazed 2');
  });
});

// ---- the server writes its messages in the language of whoever asks ---------------------

let db, server, base;
const sockets = [];
beforeAll(async () => {
  db = createDb({ url: 'file::memory:' });
  await initSchema(db);
  server = createServer({ db });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  db.close();
});
beforeEach(async () => {
  await db.batch(['DELETE FROM characters', 'DELETE FROM character_folders'], 'write');
  server.shared.chat.clear();
});
async function client(lang) {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise((resolve) => s.on('connect', resolve));
  s.call = (event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
  if (lang) expect((await s.call('lang:set', { lang })).lang).toBe(lang);
  return s;
}

describe('server messages follow the language of the socket', () => {
  it('answers errors in Russian or English, with placeholders filled in', async () => {
    const en = await client();
    const ru = await client('ru');
    expect(await en.call('roster:get')).toMatchObject({ ok: false, error: 'GM only.' });
    expect(await ru.call('roster:get')).toMatchObject({ ok: false, error: TABLE.get('GM only.') });
    await ru.call('identity:set', { role: 'gm' });
    const r = await ru.call('character:create', { name: 'x'.repeat(200), type: 'pc' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('60');
    expect(r.error).toMatch(/[а-я]/);
    expect(await ru.call('lang:set', { lang: 'de' })).toMatchObject({ lang: 'ru' }); // unknown languages are ignored
  });

  it('sends Combat lines as data, so each reader can show them in their language', async () => {
    const g = await client('ru');
    await g.call('identity:set', { role: 'gm' });
    const id = (await g.call('scene:create', { name: 'Arena' })).id;
    await g.call('scene:activate', { id });
    server.shared.chat.add({ type: 'text', author: { role: 'gm', name: 'Combat' }, text: 'Combat cancelled.', key: 'Combat cancelled.' });
    const m = server.shared.chat.history().at(-1);
    expect(m.text).toBe('Combat cancelled.');
    expect(translate('ru', TABLE, m.key, m.params)).toBe(TABLE.get('Combat cancelled.'));
  });
});
