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
