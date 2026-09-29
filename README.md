# Tarrot VTT

Virtual tabletop and rules engine for **Tarrot**, a custom TTRPG inspired by D&D and DC20 with a
Zodiac and Tarrot-card magic system. The VTT is the definitive place to run the system and houses
all mechanics.

This README is the **living design document**. It is updated in every PR (enforced by CI).
Statuses: `decided`, `open`, `implemented`.

## Contents

1. [Stack and workflow](#stack-and-workflow)
2. [Local development](#local-development)
3. [Deploying](#deploying)
4. [Roles and access model](#roles-and-access-model)
5. [Experience variants](#experience-variants)
6. [Feature design](#feature-design)
7. [Data model](#data-model)
8. [Real-time events](#real-time-events)
9. [Phases](#phases)
10. [Open questions](#open-questions)

## Stack and workflow

- **Client:** React 18 + Vite + Tailwind 4, plain JavaScript. (decided)
- **Server:** Node 22 + Express 4 + Socket.io 4, serves the built client. (decided)
- **Database:** Turso / libSQL in production, local `local.db` file in development. (decided)
- **Hosting:** Render free tier (sleeps when idle, about 30-60s wake-up; no persistent disk). Keep
  boot and reads light. (decided)
- **Tests:** Vitest for server logic, Playwright with a mobile viewport for flows. (decided)
- **Reference:** `AprilLiar/Custom-VTT` (Dogfight) for Scene, Music player, image pipeline, socket
  patterns. Tarrot is a rewrite from scratch, not a copy. (decided)
- **Workflow:** merge to `main` = deploy. README updated in the same PR; CI job `readme-updated`
  fails code PRs that skip it. No GitHub polling. (decided)

Repository layout:

| Path | Purpose |
|---|---|
| `server/app.js` | `createServer({ db })`: Express routes, Socket.io handlers, static client. |
| `server/db.js` | libSQL client, `initSchema` (idempotent, one batch). |
| `server/index.js` | Boot: connect DB, init schema, listen on `$PORT` (default 3001). |
| `server/test/` | Vitest tests (in-memory DB, ephemeral port). |
| `client/src/` | React app. `socket.js` holds the shared socket. |
| `e2e/` | Playwright specs (Pixel 7 viewport). |
| `render.yaml` | Render blueprint. |
| `.github/workflows/ci.yml` | lint, unit tests, e2e, README check. |

## Local development

```bash
npm install
npm install --prefix client
npm run dev          # server :3001 + Vite :5173 (proxies /api and /socket.io)
npm test             # Vitest
npm run lint
npm run e2e          # builds, starts on :3100, runs Playwright
```

Without Turso credentials the server uses `local.db`. To use a preinstalled Chromium for e2e, set
`PW_CHROMIUM_PATH=/path/to/chrome`.

## Deploying

1. Create a Turso database; note its `libsql://` URL and an auth token.
2. Create a Render Web Service from this repo (`render.yaml` preconfigures build/start).
3. Set env vars `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

Health check: `GET /api/health` returns `{ ok, db }`.

## Roles and access model

All decided.

- No login. On opening the site a person picks **GM** or any created **PC**. NPCs are never
  selectable by players.
- The choice is remembered on that device (browser storage) and a menu item switches identity.
- GM role is open and trust-based: anyone with the link can pick it. No passphrase.
- The GM creates all PCs and NPCs. They share one character sheet. PCs are controllable by the GM
  or the player who picked them; NPCs by the GM only. Enforced server-side.
- Several devices may control the same PC at once; last write wins.

## Experience variants

Decided. The same identity behaves differently by device.

| Variant | Gets |
|---|---|
| Mobile Player | Controls only: character sheet, D-pad "TV remote", targeting, ability use. Never renders Scenes. |
| PC Player | Scene and Battle rendering. Anything marked Hidden is not shown. |
| Mobile GM | Controls for any PC or NPC only. |
| PC GM | Full power: create and change scenes, characters, Hidden flags, all tools. |

- The GM's PC is the table display: fullscreen scene, tools in hideable drawers/overlays.
- The GM marks tokens and objects Hidden through a Foundry-style context window per token/object.
- Mobile is designed first (character sheet especially), then ported to desktop.

## Feature design

### Character sheet (planned, decided in shape; fields open)
Fields are hard-coded in the repo as a schema. Characters are permanently stored in Turso. Mobile
first. The field list awaits the rules draft (see Open questions).

### Scene mode (planned)
Light-novel style, as in Dogfight: a fullscreen background with character art (transparent PNG)
sliding in. PCs on the left, GM/NPC characters on the right. Position, scale and picture swap
supported. Scenes are foldered. Activating a scene force-navigates all connected PC clients.
Summons are per scene. (decided; details per the Dogfight design)

### Battle mode (planned)
Toggle from Scene to Battle: alternate artwork per scene, square grid, characters as tokens,
prop/terrain tokens. Base Foundry-like functionality: area templates for spells (circle, cone,
line, square), freehand drawing, pings, measuring ruler, targeting. (decided)

### Targeting and automation (planned)
A player targets a token. Using an ability auto-rolls and opens a confirm card for the GM with a
full breakdown of where every modifier came from. Every value (attack, damage, type, effects, etc.)
is editable before applying. Results are applied to the targeted token's actor. (decided)

### Mobile remote (planned)
Phones do not render the Scene. Controls: D-pad (one grid step per tap, counted against the
movement budget) plus targeting. (decided)

### Music player (planned)
Ported from Dogfight's design: GM-run, anchor-based sync so late joiners seek correctly, YouTube
links only. Details to be re-confirmed before build. (decided in principle)

### Arcane tab (planned)
Interactive wiki for the magic system: searchable magic browser with rules text, interactive
combination sandbox, spell builder saving to a character. (decided)

### Game data (planned)
Base building blocks (Zodiacs, Tarrot cards and effects, spontaneous-casting tables keyed by
parameters, sheet schema, classes, items) are hard-coded in the repo as data files. Character-local
combinations and calculations live in Turso. (decided)

### Images (planned)
Stored in Turso, served as cacheable URLs, re-encoded on upload to keep the database small.
(decided)

## Data model

Implemented: `meta(key, value)` only (Phase 1 placeholder).

Planned (not final): characters, character folders, scenes, scene folders, scene state, scene
pictures, summons, battle tokens/objects, audio playlists/tracks/state, character-local spells.

## Real-time events

Implemented:

- `ping:check` (client to server, with ack): replies `{ ok: true, echo }`. Connectivity check.

## Phases

Each phase ends in a deploy and playtest checkpoint.

1. **Platform** (implemented): server, client, Turso/local DB, Render blueprint, CI, tests, README
   and CLAUDE.md. Check: `/api/health`, socket round trip, mobile e2e smoke.
2. **Identity and character roster** (next): picker, device memory, switch button, GM/PC/NPC,
   roster with folders, server-side permissions.
3. **Character sheet**, mobile first then desktop. Blocked on the rules draft.
4. **Scene and Music**: Scene page, upload pipeline, folders, activation, summoning, Hidden flag
   and context window, Music player.
5. **Battle**: Battle mode, grid, tokens, D-pad remote, targeting, templates, drawing, pings, ruler.
6. **Mechanics and Arcane**: roll engine, confirm card, Arcane browser, sandbox, spell builder,
   spontaneous-casting tables.

## Open questions

Asked one batch at a time; answers move into the sections above.

- Tarrot rules draft: dice system, attributes/skills, resources, classes/ancestry, action economy
  and movement budget, conditions, combat structure, Zodiac and Tarrot card magic, spontaneous
  casting parameters. (user will paste a draft)
- Hidden detail: hidden from players only or greyed for GM; whole tokens vs fields.
- Token art vs sheet art (one image or separate); grid size and scale per scene.
- Chat and roll log? Undo of applied results? Turn order and initiative tracker? Animation budget?
- PWA/installable phone app and orientation rules for the remote.
- Backups/export of characters from Turso.
