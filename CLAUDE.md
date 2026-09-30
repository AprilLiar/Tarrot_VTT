# Tarrot VTT - agent instructions

**Before doing anything else, read `README.md` in full.** It is the living design document and
single source of truth: game mechanics, data model, event contract, pages, phases, and the list
of open design questions. Every change must stay consistent with it. If a request conflicts with
it, flag the conflict instead of silently diverging.

**Keep the README current, in the same PR.** Any change to a mechanic, schema, event payload, UI
behavior, decision, or a rule the user states in conversation must update `README.md` before
committing. CI (`readme-updated` job) fails PRs that change code without touching it.

**Never assume a design decision.** Ask the user (AskUserQuestion) for every open design choice
and record the answer in the relevant README section. The user is a CS graduate who dislikes
writing code: explain options briefly, do not guess.

## Orientation

- One deployable app: Express + Socket.io serves the built React/Vite/Tailwind client.
- Database: Turso (libSQL) in production, `local.db` in development. Schema additions use
  `CREATE TABLE IF NOT EXISTS` (server creates missing tables at boot).
- No login by design: identity is a picker (GM or a PC), remembered per device.
- Plain JavaScript everywhere. Tests: `npm test` (Vitest), `npm run e2e` (Playwright, mobile
  viewport; set `PW_CHROMIUM_PATH` to use a preinstalled Chromium), `npm run lint`.
- Merging to `main` is the deploy (Render auto-builds).
- Never poll GitHub or schedule recurring checks; events arrive on their own.
- `AprilLiar/Custom-VTT` (Dogfight) is a reference for Scene, Music player, image pipeline and
  socket patterns. Tarrot is a rewrite, not a copy.

## Localization (English and Russian)

Everything a person sees is shown in English or Russian, chosen in Settings on the picker (per device).
The English text is the key; the Russian text lives in `LOCALIZATION.md` (a table the user reads and
fixes by hand on GitHub; the app reads it: the page at build time, the server at start).

- **Whenever you add or change text a person sees, add it in both languages in the same change.**
  Client: `t('English text', { name })` from `useT()`. Server: `new AppError(code, 'English text {n}',
  { n })`, chat lines as `{ key, params }` (see `server/i18n.js`, `shared/localization.js`). A text with
  a changing part uses `{placeholders}`, never a template literal. A text that is passed on to be
  translated later is wrapped in `T('...')`; game terms in params are `{ t: 'Fire' }`.
- Run `npm run i18n` to add the new rows to `LOCALIZATION.md`, then write the Russian for each empty
  cell (keep the `{placeholders}`). `server/test/localization.test.js` (part of `npm test` and CI) fails
  when a text has no Russian row, a row is empty, or the placeholders differ.
- Names typed by people (characters, items, scenes, tracks) are never translated. This README stays in English.

