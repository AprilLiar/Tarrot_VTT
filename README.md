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
6. [Game rules](#game-rules)
7. [Feature design](#feature-design)
8. [Data model](#data-model)
9. [Real-time events](#real-time-events)
10. [Phases](#phases)
11. [Open questions](#open-questions)

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
| `server/app.js` | `createServer({ db })`: Express routes, Socket.io, static client. |
| `server/handlers.js` | Per-socket handlers: identity and roster events, permission checks. |
| `server/roster.js` | Roster schema and logic: characters and folders, validation, cycle checks. |
| `server/db.js` | libSQL client, `initSchema` (idempotent, one batch). |
| `server/index.js` | Boot: connect DB, init schema, listen on `$PORT` (default 3001). |
| `server/test/` | Vitest tests (in-memory DB, ephemeral port). |
| `client/src/` | React app. `socket.js` shared socket; `AppContext.jsx` identity, PC list, roster state. |
| `client/src/components/` | `Picker`, `Shell` (top bar), `Roster` (GM), `PlayerHome`, `Dialog`. |
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

Implemented in Phase 2:
- The picker shows a Game Master card and one card per PC (name with a colored initial; portraits
  come with the image pipeline). NPCs are never listed. (decided)
- Identity is stored in `localStorage` key `tarrot.identity` (`{ role: 'gm' }` or
  `{ role: 'player', characterId }`) and re-validated by the server on every (re)connect. A saved
  identity that no longer exists returns the device to the picker with a notice. (decided)
- A socket's identity lives on the server (`socket.data.identity`). Every permission check uses it,
  never a value in a payload. A socket that switches from GM to player loses GM rights and leaves
  the `gm` room. (implemented)
- When the GM deletes a character, every socket playing it is sent `identity:revoked` and returns
  to the picker with a notice. (decided)

## Experience variants

Decided. The same identity behaves differently by device.

| Variant | Gets |
|---|---|
| Mobile Player | Controls only: character sheet, D-pad "TV remote", targeting, ability use. Never renders Scenes. |
| PC Player | Scene and Battle rendering. Anything marked Hidden is not shown. |
| Mobile GM | Controls for any PC or NPC only. |
| PC GM | Full power: create and change scenes, characters, Hidden flags, all tools. |

- The GM's PC is the table display: fullscreen scene, tools in hideable drawers/overlays.
- **Hidden:** the GM right-clicks a token or object to open a Foundry-style context menu of
  half-transparent circles at its side: **Token Settings** and **Hide/Reveal**. Hide makes the token
  fully disappear for PC clients, including its name plaque; the GM still sees it, half-transparent.
  Reveal undoes it. (decided)
- Mobile is designed first (character sheet especially), then ported to desktop.

## Game rules

Source of truth for mechanics. Base is DC20 (as implemented in the official Foundry system); only
the differences below are Tarrot-specific. Every value on a sheet can be edited by hand at any
time (no character creator, no level-ups); anything calculated from it recalculates. (decided)

### Rounding
Anything that ends in .5 rounds up. Everything else uses standard rounding to the nearest whole
number. (decided)

### Rolls
- Every roll is d20 + modifiers. (decided)
- **Attribute Roll:** d20 + stat + custom modifiers.
- **Save Roll:** d20 + stat + that stat's "X Defence" + custom modifiers. X Defence (for example
  Strength Defence) is a hand-entered number per stat, default 0.
- **Physical Save:** uses the higher of Strength or Dexterity. **Mental Save:** the higher of
  Intelligence or Spirit.
- **Skill Roll:** d20 + scaling stat + Mastery tier + custom modifiers.
- **Attack and combat rolls:** also add the Experience Modifier (see below). Attribute, Save and
  Skill rolls do not.
- Natural 1: automatic Critical Failure; the roller gains **Exposed** (advantage on the first
  Attack roll made against them, then it disappears).
- Natural 20 (threshold can be changed by effects): Critical Hit, +2 damage by default.

### Stats
- Five stats: **Strength, Dexterity, Intelligence, Spirit, Luck**. Range -2 to 7. The stat value
  is the modifier it adds to rolls.
- Spirit replaces DC20's Charisma. Luck is a plain stat: it has no Save, no X Defence and no
  Skills. It can be rolled as an Attribute Roll and Arcane abilities may reference it.
- No class, ancestry or background.
- **Experience Modifier:** replaces DC20's Combat Modifier. Range 1-10, hand-entered, can be
  improved at any time.

### Combat Masteries
Three pseudo-stats, range 1-10, used for Combat rolls made from the Arcane tab:
**Magic** (blue glow), **Stances** (red glow), **Manifestation** (gold glow). (decided)

### Skills
Each skill scales off a stat. Mastery has 10 tiers, +1 per tier, cumulative (Astrology at Mastery 3
with Intelligence 2 rolls d20 + 2 + 3). Any skill can hold any tier. (decided)

| Skill | Scaling stat |
|---|---|
| Awareness | Prime (the highest of all stats) |
| Weight Manipulation | Strength |
| Stamina | Strength |
| Speed | Dexterity |
| Fine Motor Skills | Dexterity |
| Mental Resolve | Spirit |
| Soul Control | Spirit |
| Astrology | Intelligence |
| Symbolism | Intelligence |
| Body Movement | Max of Strength or Dexterity |
| Likability | Max of Spirit or Intelligence |

### Hit severity and damage
Damage is not rolled. It is calculated from the Hit Severity: attack total minus the target's
defence value. Which defence (Physical or Mental) is chosen by the ability or item being used; the
GM's confirm card can change it. (decided)

| Result | Severity | Damage |
|---|---|---|
| under 5 | Hit | base |
| 5 to 9 | Heavy Hit | base + 1 |
| 10 or more | Brutal Hit | base + 2 |
| Natural 20 | Critical Hit | +2, added on top of the severity bonus (Brutal + Crit = base + 4) |

Base damage and damage type are numbers carried by the ability or item being used. The GM's confirm
card can edit any value before it is applied.

### Action Points
Every PC has 4 AP. NPCs have 4 AP, with an optional "Minion" checkbox that makes max AP 2. AP is
required to take any action in combat. (decided)

### Resources and defences
Each character has current and max HP, Physical Defence and Mental Defence. All hand-entered.
(decided)

### Resistances
Per damage type, with any combination of: (decided)
- **Resistance (X)** with X positive: takes X less damage per instance. Negative X: takes more.
- **Half** (x0.5) and **Double** (x2).
- **Immunity:** takes 0 damage.
- **Consumption:** takes 0 damage and heals for half of the raw damage attempted.
- Order: flat (X) modifiers first, then Half/Double.
- Sheet shows a table: icon and damage type, then value. Both kinds shown together, for example
  `Cold | Resistance (3), Resistance (Half)`.

Damage types: Fire, Cold, Acid, Poison, Lightning, Sound, Bludgeoning, Slashing, Piercing, Soul,
Decay, Psychic.

### Statuses
All statuses from the DC20 Foundry system are used, remapped to Tarrot stats: Might is Strength,
Agility is Dexterity, Charisma is Spirit. (decided) At first a status is a name, a stack count where
it stacks, and rule text shown on the sheet; the GM applies the mechanical effects by hand through
the confirm card. Automation comes later. (decided)

Rule text below was summarised from the Foundry system's `status-config.mjs`
(`pazindorb/dc20rpg`) and adjusted by the user; remaining wording not yet verified against the
official rules. "X" is the stack count.

For status wording: **physical** means Strength and Dexterity, **mental** means Intelligence and
Spirit. "Using an item" in rule text is wording only: items in the base rules cannot be rolled.
(decided)

| Status | Stacks | Draft rule |
|---|---|---|
| Bleeding | yes | X true damage at turn start. Removed only by healing, or by using a helpful item for 1 AP (wording only; item use is not automated). |
| Blinded | no | Cannot see; terrain is difficult unless guided. Auto-fail Awareness (sight). Attacks have Disadvantage; attackers have Advantage. |
| Burning | yes | X fire damage at turn start. Ends when doused. A nearby creature can spend 1 AP to remove 1 stack. |
| Charmed | no | Charmer has Advantage on Spirit checks against you. You cannot target the charmer with harmful attacks or effects. |
| Dazed | yes | Disadvantage X on mental checks (Intelligence, Spirit). |
| Deafened | no | Cannot hear. Auto-fail hearing-based Awareness. Flanking melee attackers have Advantage. |
| Disoriented | yes | Disadvantage X on mental saves. |
| Doomed | yes | Current and max HP reduced by X. Healing received reduced by X. |
| Exhaustion | yes | Penalty X on all checks and saves. Speed and Save DC reduced by X. Death at 6 stacks. |
| Exposed | yes | Attacks against you have Advantage X. (Natural 1 gives one stack that ends after the first Attack roll against you.) |
| Frightened | no | Cannot willingly move closer to the source. Disadvantage on all checks against the source. |
| Fully Concealed | no | Creatures treat you as Blinded to see you. Attackers have Disadvantage; you have Advantage. Auto-fail Awareness to see you. |
| Fully Stunned | no | Incapacitated. Attacks against you have Advantage. Auto-fail Physical Saves (except poison/disease). Cannot go below 0 AP. |
| Grappled | no | Immobilized, Disadvantage on Dexterity Saves. Escape with a Body Movement roll, 1 AP (what it is rolled against is open). |
| Half Cover | no | All Attacks and Spell Checks against you have -2. |
| Hidden | no | Unseen and Unheard. Attackers have Disadvantage; you have Advantage on attacks. |
| Hindered | yes | Disadvantage X on attacks. |
| Immobilized | no | Cannot move. Disadvantage on Dexterity Saves. |
| Impaired | yes | Disadvantage X on physical checks (Strength, Dexterity). |
| Incapacitated | no | Cannot move or speak. Cannot spend AP or use Minor Actions. Movement 0. |
| Intimidated | no | Disadvantage on all checks against the source. |
| Invisible | no | Creatures cannot see you unless they perceive invisibility. You have Advantage on attacks; attackers have Disadvantage. |
| Paralyzed | no | Incapacitated. Auto-fail Physical Saves. Attacks against you have Advantage. Melee attacks within 1 Space are critical hits. |
| Partially Concealed | no | Creatures have Disadvantage on Awareness to see you. |
| Petrified | no | Incapacitated, 10x heavier, unaware. Auto-fail Physical Saves. Vulnerable to bludgeoning, resistant to other damage. Other statuses suspended; immune to new ones. |
| Prone | no | Disadvantage on attacks. Ranged attacks against you have Disadvantage; melee have Advantage. Movement costs +1 per space. Standing costs 2 movement. |
| Restrained | no | Immobilized, Disadvantage on Dexterity Saves. Attacks by you have Disadvantage; attackers have Advantage. |
| Slowed | yes | Each space of movement costs X additional spaces. |
| Stunned | yes | Current and max AP reduced by X. At 4 or more: Incapacitated, attacks against you have Advantage, auto-fail Physical Saves. |
| Surprised | no | Current and max AP reduced by 2. |
| Taunted | no | Disadvantage on attacks against targets other than the source. |
| Terrified | no | Must spend turns moving away from the source. Only actions: Move to flee, or Dodge if cornered. |
| Tethered | no | Cannot move farther than a set number of spaces from the tether point or creature. |
| 3/4 Cover | no | All Attacks and Spell Checks against you have -5. |
| Unconscious | no | Incapacitated and Prone. Unaware. Auto-fail Physical Saves. Attacks against you have Advantage; melee within 1 Space are critical hits. |
| Unheard | no | Advantage on melee attacks against flanked enemies who cannot hear you. |
| Unseen | no | Advantage on your attacks; attackers have Disadvantage. |
| Weakened | yes | Disadvantage X on physical saves (Strength, Dexterity). |

## Feature design

### Character sheet (planned, mobile first)
Fields are hard-coded in the repo as a schema. Characters are stored permanently in Turso. PCs and
NPCs share one sheet. (decided)

Layout, top to bottom:
1. **AP** on top (Minion checkbox for NPCs), then HP.
2. **Stats:** each a big number. Under each, two small rectangular buttons, each half the stat
   box width: left rolls the Attribute Roll, right rolls the Save Roll. Luck has no Save button.
   Physical Save and Mental Save shown as the two special saves.
3. **Combat Masteries:** Magic, Stances, Manifestation as smaller boxes in a triangle under the
   stats, each with its colored glow.
4. **Skills** with Mastery tier.
5. **Features:** free-form list, each with name and description.
6. **Inventory:** each item has name, description, uses (max 1 to 100) and a State chosen from a
   drop-down whose options are defined per item. Names need not be unique; same-named items are
   distinct. Items can be copied (full copy, same name). Trading between PCs needs the receiving
   player to accept a confirmation dialog: decline does nothing, accept moves the item. The GM can
   move items between any PCs and NPCs without confirmation.
7. **Resistances and Statuses** near the bottom.

Experience Modifier, Physical/Mental Defence, X Defences and max HP are editable fields.

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

Implemented:
- `meta(key, value)`: Phase 1 placeholder.
- `character_folders(id, parent_id, name, created_at)`: nested tree, shared by PCs and NPCs.
- `characters(id, name, type 'pc'|'npc', folder_id, created_at)`. Names are 1 to 60 characters
  after trimming and need not be unique. Sheet contents are added in Phase 3.
- SQLite does not enforce foreign keys by default, so relationship rules are enforced in
  `server/roster.js`: a folder cannot move inside itself or a descendant, and only an empty folder
  (no subfolders, no characters) can be deleted. Character deletion is permanent and requires
  the exact name.

Planned (not final): scenes, scene folders, scene state, scene pictures, summons, battle
tokens/objects, audio playlists/tracks/state, character-local spells, character sheet data.

## Real-time events

All client-to-server events use an ack of the form `{ ok: true, ... }` or
`{ ok: false, code, error }`.

Implemented:

- `ping:check`: replies `{ ok: true, echo }`. Connectivity check.
- `identity:set` `{ role: 'gm' }` or `{ role: 'player', characterId }`: any socket. Fails with
  code `gone` if the character does not exist or is an NPC.
- `identity:clear`: drops identity and GM rights.
- `roster:get` (GM): `{ roster: { folders, characters } }`.
- `character:create` `{ name, type, folderId? }`, `character:rename` `{ id, name }`,
  `character:move` `{ id, folderId }`, `character:delete` `{ id, confirmName }` (all GM only).
- `folder:create` `{ name, parentId? }`, `folder:rename` `{ id, name }`,
  `folder:move` `{ id, parentId }`, `folder:delete` `{ id }` (all GM only).
- Error codes: `forbidden`, `bad_name`, `bad_type`, `bad_id`, `not_found`, `cycle`, `not_empty`,
  `confirm_mismatch`, `gone`, `server_error`.
- Server to clients: `pcs:updated` `[{ id, name }]` to everyone; `roster:updated`
  `{ folders, characters }` to the GM room only; `identity:revoked` `{ characterId, name }` to the
  sockets playing a deleted character.

HTTP: `GET /api/pcs` returns `[{ id, name }]` (PCs only) for the picker.

## Phases

Each phase ends in a deploy and playtest checkpoint.

1. **Platform** (implemented): server, client, Turso/local DB, Render blueprint, CI, tests, README
   and CLAUDE.md. Check: `/api/health`, socket round trip, mobile e2e smoke.
2. **Identity and character roster** (implemented, awaiting playtest): picker with name cards,
   device memory, switch button, GM/PC/NPC types, nested folders (create, rename, move, delete),
   permanent delete with typed-name confirmation, server-side permissions, live updates.
   Check: two browser contexts, PC controlled from a player device, NPC never offered.
   Covered by `e2e/identity.spec.js` (create PC/NPC, picker lists only PCs, identity survives a
   reload, delete revokes the player) and `server/test/roster.test.js`.
   Decisions made without asking, open to change: one folder tree shared by PCs and NPCs; only
   empty folders can be deleted; the GM's own device has no PC/NPC "play as" option yet.
3. **Character sheet**, mobile first then desktop. Blocked on the rules draft.
4. **Scene and Music**: Scene page, upload pipeline, folders, activation, summoning, Hidden flag
   and context window, Music player.
5. **Battle**: Battle mode, grid, tokens, D-pad remote, targeting, templates, drawing, pings, ruler.
6. **Mechanics and Arcane**: roll engine, confirm card, Arcane browser, sandbox, spell builder,
   spontaneous-casting tables.

## Open questions

Asked one batch at a time; answers move into the sections above.

- Grappled: what the Body Movement escape roll is rolled against.
- Statuses that say "Space" (Paralyzed, Unconscious): what unit Tarrot uses for grid distance.
- Combat Masteries: how they enter the roll and what the Arcane combat rolls look like.
- Magic system: Zodiac and Tarrot card effects, spontaneous casting tables.
- Uses on inventory items: does using an item reduce uses, and what happens at 0?
- Token art vs sheet art (one image or separate); grid size and scale per scene.
- Chat and roll log? Undo of applied results? Turn order and initiative tracker? Animation budget?
- PWA/installable phone app and orientation rules for the remote.
- Backups/export of characters from Turso.
