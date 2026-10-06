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
7. [Feature design](#feature-design) (including [Settings and languages](#settings-and-languages-implemented))
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
- **Tests:** Vitest for server logic, Playwright with a mobile viewport for flows. E2e tests run one at a time because they share one stage. (decided)
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
| `server/sheet.js` | Sheet model: defaults, normalisation, field and list edits, item moves, per-character lock. |
| `server/rolls.js` | Roll engine: builds a roll and its breakdown from a stored sheet. |
| `server/chat.js` | In-memory chat log. |
| `server/errors.js` | `AppError`, the error type whose message is safe to show users. |
| `server/scenes.js`, `server/sceneHandlers.js`, `server/images.js`, `server/folders.js` | Scenes, stage, temp NPCs, pictures, image storage, generic folder trees. |
| `server/audio.js`, `server/audioHandlers.js` | Playlists, the anchored player state, YouTube link parsing, socket events. |
| `shared/rules-data.js` | Rules data used by server and client: stats, skills, damage types, statuses. |
| `shared/locks.js`, `server/locks.js`, `server/lockHandlers.js` | The locks of the Arcane tab: keys, what each covers, emptying a sheet for players, the table and the socket events. |
| `shared/manifest.js`, `server/manifestHandlers.js` | Tarot Cards and Manifestations of a character, and the events that change them. |
| `shared/stances.js`, `server/stances.js`, `server/stanceHandlers.js` | Stances: bands and tables, the tree in the database, visibility per viewer, socket events. |
| `shared/spells.js`, `server/spellHandlers.js` | Spell Stones, scheme rules (`validateScheme`, `layoutScheme`), drafts and finished spells, crafting, spell events. |
| `shared/effects.js`, `server/effectRuntime.js`, `server/effectHandlers.js` | Effects: parts and levers, scopes, durations and ticking, what they do to rolls, Defence, stats, damage and resistances; the global library, putting an Effect on, spending uses; socket events. |
| `shared/basicActions.js`, `server/basicActions.js`, `server/basicHandlers.js`, `server/defaults.js` | Basic Actions (the DC20 list), their table, the shipped defaults (seeded once) and `basic:use`. |
| `shared/arcane.js`, `server/arcane.js` | Weapons and Enhancements: normalising, `planAttack` (what a drafted attack costs and does), token distance, the global Enhancements table. |
| `LOCALIZATION.md` | The Localization Mapping: every text of the app in English and Russian (a table to read and fix by hand). |
| `shared/localization.js`, `server/i18n.js`, `client/src/i18n.jsx` | Reading the table, translating with `{placeholders}`, the per-socket language on the server, the language context on the client. |
| `scripts/i18n-keys.mjs`, `scripts/i18n-sync.mjs` | Find every text the code asks to translate; `npm run i18n` keeps `LOCALIZATION.md` in step. |
| `server/db.js` | libSQL client, `initSchema` (idempotent, one batch). |
| `server/index.js` | Boot: connect DB, init schema, listen on `$PORT` (default 3001). |
| `server/test/` | Vitest tests (in-memory DB, ephemeral port). |
| `client/src/` | React app. `socket.js` shared socket; `AppContext.jsx` identity, PC list, roster state. |
| `client/src/components/` | `Picker`, `Shell` (top bar, toasts, trade offers), `Roster` (GM), `ChatPanel`, `Dialog`. |
| `client/src/music/` | `useMusic` (the synced YouTube player), `MusicContext`, `MusicBar`, `MusicPanel`, `youtube` (API loader). |
| `client/src/components/scene/` | `ScenePage` (stage, zoom, drag, token menu), `SceneDrawers` (Cast and Scenes), `LibraryTree`, `Pictures`. |
| `client/src/components/arcane/` | `ArcanePage` (the tabs, General, the footer, the GM's general tab), `Magic` (stones, editor, drafts, spells), `SchemeView` (the scheme drawing), `Stances` (signs, tree, band table, GM editor), `Manifest` (Tarot Cards, Manifestations), `Locks` (context, blur, lock tiles), `DamageIcon`, `editors` (weapon and Enhancement forms), `summaries`, `useStances`, `useGlobalEnhancements`. |
| `client/src/components/effects/` | `EffectEditor` (the Effect dialog), `EffectRefs` (pick Effects in a weapon, Enhancement or band), `EffectsLibrary`, `ActiveEffects` (sheet list), `BasicActions`, `effectText`, `useEffectLibrary`. |
| `client/src/components/sheet/` | `SheetPage` (vitals, stats, masteries, skills), `SheetLists` (features, inventory), `SheetDefences` (resistances, statuses), `fields` (number field, roll button). |
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

- No login. On opening the site a person picks **GM**, the **Display Screen**, or any created **PC**.
  NPCs are never selectable by players.
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

Implemented in Phase 4a:
- **Display Screen** is a third identity (`{ role: 'display' }`), meant for the desktop that faces
  the table. It shows only the active scene: no top bar, no chat, no sheets, no roster. It can zoom
  and pan its own view and drag characters anywhere for everyone, but cannot summon,
  dismiss, hide or change anything else. A faint "Switch" button in the corner returns to the
  picker. (decided)

## Experience variants

Decided. The same identity behaves differently by device.

| Variant | Gets |
|---|---|
| Display Screen | Desktop only. The active scene (and later Battle) with hidden things left out. Zoom, pan, drag figures. No menus. Plays the music and has a volume control. |
| Mobile Player | No music. Controls only: sheet, D-pad "TV remote", targeting, ability use. Never renders Scenes. Can put their own PC on the stage or take it off from the sheet. |
| Desktop Player | The sheet and a Scene tab (view only, own zoom and pan). Hidden things stay hidden. No music. |
| Mobile GM | No music. Sees the scene too, can move figures, hide, reveal and summon, and can open any character's sheet to play as an NPC. |
| Desktop GM | Full power: create and change scenes, characters, Hidden flags, all tools, and the music player (the GM hears it here). |

- The scene fills the screen under the top bar. The GM's tools are two side drawers (Cast on the left, Scenes on the right); the Display Screen has none.
- **Hidden:** the GM right-clicks a token or object to open a Foundry-style context menu of
  half-transparent circles at its side: **Token Settings** and **Hide/Reveal**. Hide makes the token
  fully disappear for players and the Display, including its name plaque; the GM still sees it,
  half-transparent. Reveal undoes it. On a touch screen a tap on a character opens the circles.
  (decided, implemented for the Scene)
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

### Distance
1 Space = 1 square on the battle map. Rule text saying "Space" (for example within 1 Space) uses
this unit, and **everything in the system is measured in Spaces** (decided after the second playtest); where
something is not, ask. (decided)

### Items
Using an item reduces its uses. Items in the base rules cannot be rolled. (decided)

### Magic
The Zodiac and Tarrot card magic system is a placeholder for now; details come later. (decided)

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
**Magic** (blue glow), **Stances** (red glow), **Manifest** (gold glow). "Manifest" is the shortened name of the third one so the nameplate fits on a phone. (decided)

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
| below 0 | Miss | nothing (a natural 20 still hits) |
| 0 to 4 | Hit | base |
| 5 to 9 | Heavy Hit | base + 1 |
| 10 or more | Brutal Hit | base + 2 |
| Natural 20 | Critical Hit | +2, added on top of the severity bonus (Brutal + Crit = base + 4) |

Base damage and damage type are numbers carried by the ability or item being used. The GM's confirm
card can edit any value before it is applied.

### Action Points
Every PC has 4 AP. NPCs have 4 AP, with an optional "Minion" checkbox that makes max AP 2. AP is
required to take any action in combat. (decided)

**AP is shown as cubes** (decided after the first playtest): 4 cubes (2 for a Minion), each drawn as a wire-frame
cube with all its corners; an **empty** cube is an AP the character does not have and a cube **filled with the UI
colour** is one it has, filled from left to right. On the sheet, small arrow buttons beside the cubes lower and raise
the amount; the Battle remote shows the cubes without arrows. **Tapping a cube fills the AP up to it, including it**
(an alternative to the arrows, on the sheet and on the Battle remote, where tapping is the way to edit the AP there); it can
never set 0, the arrows on the sheet still do.

### Resources and defences
Each character has current and max HP, Physical Defence and Mental Defence. All hand-entered.
(decided)

**HP and Temp HP on the sheet (decided):** HP is a **red bar** with `current / max` written over it that
empties in proportion; to its right is a faint **blue Temp HP bar**, half as wide, with the Temp HP value over it
(filled while above 0). Temp HP has **no maximum**, just a value, and works like a shield: **all damage hits Temp
HP first** and only the overkill reaches HP (attacks, Enhancement damage costs, Bleeding and Burning at turn start;
healing never touches it). **Temp HP cannot stack**: gaining Temp HP keeps the larger of what you had and what you
gain (5 Temp HP and gaining 7 gives 7; 5 and gaining 2 stays 5). The GM or the owner can also set the number by hand.
The chat says when Temp HP absorbs damage ("Temp HP absorbs N").

### Help Dice
A general mechanic (decided). Every character has a **track of up to 5 Help Dice**, each a d4, d6, d8, d10 or d12,
drawn as small vector pictures of dice (my own artwork) under HP on the sheet; the GM or the owner can add one
(picker) or remove one (tap). **Before every roll** made for a character that holds at least one (attribute, save,
skill, Combat Mastery, the attack in the Arcane footer, initiative, a Spontaneous Action's roll), a dialog shows the
row of dice: a tap selects, a second tap unselects, and **Proceed** with nothing selected uses none (Cancel makes no roll).
Each chosen die is **rolled with the d20 and added like a Dice Roll Bonus** (the same mechanism as a weapon's bonus die)
and is **used up** (one use). Automatic rolls (the Stance roll, durability checks, crafting) and the GM's "roll all NPCs"
do not ask. Gaining a die with a **full track** (5): a die larger than the smallest one held replaces the smallest,
otherwise the new die is lost (decided).

### Spontaneous Action
A core rule (decided): a one-time action the GM makes up on the spot, stored nowhere. A button **Spontaneous
Action** in the **General tab** of a character's Arcane tab (GM only) opens the menu: **1 or 2 AP**; there is **no
setting for the number of targets**: it goes to **all the selected targets** (chosen in the Targets list of the General
tab; with none selected it is for the acting character itself); any
combination of the effects **Damage** (value and type), **Help** (a Help Die of a chosen size), **Status** (any
status, with stacks where it stacks, a Duration and the DC of its Save), **Temp HP** (a value) and an **Effect** (any Effect of the library, put on the targets or on the user, see Effects); and, when Damage or Status is chosen, the **roll**
(Weapon attack: Prime + Experience, Magic, Stances or Manifest) and the **Defence** it is rolled against (Physical or
Mental), set apart by a thin divider line and an "Against" label from what is rolled. Damage or Status goes through that roll and the usual **confirm card** (prefilled, GM can edit); a Help Die
or Temp HP alone is given at once without a roll. **Everything goes to the selected targets** (with none selected, to
the actor, who is then also the target of the roll against their own Defence); Help Dice and Temp HP are given to
every target, hit or not, after the damage. AP is spent when it is applied.

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
| Blood Oxidization | yes | The blood becomes much more acidic (from a failed Strength Save against a Spell tattoo). Not automated. |
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
| Grappled | no | Immobilized, Disadvantage on Dexterity Saves. Escape with a Body Movement roll against the grappler's Weight Manipulation, 1 AP. |
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

### Status icons on tokens (decided)
Every status has an icon, drawn black with a white outline (`client/src/components/scene/statusIconData.js`; the glyphs are from
[game-icons.net](https://game-icons.net), licence CC BY 3.0, authors Lorc, Delapouite and others, so this credit must stay).
In Battle a character's token shows **icons only** for all the statuses it has, **no text**: filled from the **top-left going down**,
then the next column to the right, in the order the statuses were **first applied** (the order of the sheet's groups). A status that
**stacks** shows its total as a small **red number with a black outline** in the bottom-right quarter of its icon (also at 1). An
icon's side is the **Status icon size** setting (a share of one grid square, so a 2x2 token has the same icons in a bigger space).
Icons never leave the token's square: the column holds as many whole icons as fit, then the next column starts; when they cannot
all fit, **only the first applied that fit are shown** (nothing is cut). Everyone who sees the token sees its icons (hidden tokens
are not sent to players at all); temporary NPCs have no statuses. The server adds `statuses: [{ key, stacks }]` to each token
and sends the stage again whenever a character's statuses change.

### Status Saves and Durations (decided)
**Which Save a status asks for.** A status needs a **Mental Save** when it is Dazed, Charmed, Disoriented, Doomed,
Frightened, Intimidated, Taunted or Terrified; **no Save** when it is Blood Oxidization (renamed from "Oxydization"
everywhere; stored sheets are converted), Fully Concealed, Half Cover, Hidden, Invisible, Partially Concealed, Surprised, 3/4
Cover, Unheard or Unseen; **every other status needs a Physical Save** (`shared/statuses.js`).

**When a Save happens.** Whenever a status would be put on a character by an attack card or a Spontaneous Action and it has a
Save, the character first makes that Save (d20 + the stat and X Defence as for any Save, plus whatever statuses already change
it) against a **Difficulty Class**. The Save **passes when its total equals or beats the DC** (no special treatment for a natural
20 or 1): a pass means the status does not land, a failure means it does. Where a status is set up (attack card, Spontaneous
Action, the status lists of weapons and Enhancements) there are two DC options: **Automatic** (the default: 8 + the attacker's
Experience Modifier + the attacker's Prime, its highest stat) or **Manual** (a number, 1 to 99). The statuses a character puts
on **itself** (an Enhancement's cost, Exposed from a natural 1, Blood Oxidization from a Spell tattoo) and statuses **added by
hand on a sheet** need **no Save**.
- **Non-player characters** (NPC sheets) always roll at once, with no AP, and the result is applied or not.
- **Players** get a **prompt** on their own device: the status, the Save, the DC, the modifiers the character already has
  (every Advantage or Disadvantage from effects and conditions listed with its source) and an **AP stepper, 0 by default**:
  **1 AP buys 1 level of Advantage** (at most the AP they have, up to 10). The AP is spent when they roll. If they close the
  prompt a **Saves waiting** badge brings it back, also after a reload.
- **The flow:** Apply puts the damage in at once; the status row of the chat card says "waiting for {name}", and the roll and the
  result arrive as their own **effect card** (kind Save, revertible) when the player answers. If the player is not there the GM
  sees the same waiting Saves and can press **Roll for them** (rolled for them, no AP spent). An attack card that is Edited does
  not undo Saves that were already answered.
- **Temporary NPCs** have no sheet and no statuses (as before: applied by hand).

**Duration.** Chosen next to every status that is set up (default **Long**):
- **1 Round:** removed when the character the status is on ends their turn (so a status put on during their own turn ends at the
  end of that turn).
- **1 Minute:** 5 rounds, counted the same way: one round is counted off at the end of each of the character's turns and the
  status ends with the fifth. Durations count turns, so they only run while a combat is running; outside combat they stay until
  removed by hand.
- **Long:** lasts until it is removed by hand.
- **Repeated:** at the end of each of the character's turns they make the Save against the status; **passing it removes the
  status**. Only a status that has a Save can be Repeated (and a Repeated status added by hand on a sheet asks for the DC to
  use). An NPC rolls at once; a player is asked (same prompt, AP for Advantage) while the next turn starts at once.

**Stacks of one status are grouped by Duration.** There is **one Save per status** however many stacks it has: Bleeding (2)
Repeated and Bleeding (3) Repeated are one **Bleeding (5), Repeated**, which makes **one** Save at the end of the turn, against
the **highest DC** of its applications, and a pass removes all 5. Stacks of the same Duration merge (Long, Round, Repeated);
**1 Minute applications stay separate, each with its own timer**, and stacks of different Durations are remembered apart but
their effects are **added together** (a status's total is what every rule uses: Bleeding 2 for a minute and Bleeding 3 Repeated
are 5 true damage at the start of the turn, while a passed Repeated Save removes only the Repeated part). A status that does not
stack counts as 1 however many groups hold it. The sheet shows each group as a small tag (stacks, the Duration, "5 rounds left"
or the DC). A **manual change of a status's number** on the sheet works on the Long group; lowering it takes from Long first,
then Repeated, then 1 Minute, then 1 Round. Statuses that existed before are Long. **Revert** on a card takes back exactly the
stacks of the Duration it gave (and brings back a status an end of turn removed). The sheet keeps the totals as `statuses` and the
groups as `statusGroups` (`{ id, key, stacks, duration, rounds?, dc? }`).

### Effects (decided)
An **Effect** is a named bundle of modifiers a character has for a while (a Dodge, a blessing, a curse): like a status, but made
of **parts** that the GM and the players compose freely (the "monolith" system, `shared/effects.js`; the levers follow the DC20
Foundry system's effect keys). **Definition:** name, description, an **icon** for the token, a **Duration**, optional **Uses**
and up to 20 parts. A part that changes nothing is dropped. **Parts (levers):**
- **Rolls:** Advantage levels, a flat bonus and Dice Roll Bonuses on a **scope**: all rolls; all Attribute rolls, all Saves,
  all Skill rolls, all Combat Mastery rolls, all attacks, Weapon / Magic / Manifest attacks, Initiative; or one stat, one Save
  (a stat or Physical / Mental), one skill, one Combat Mastery. They show as terms and sources in the roll breakdown.
- **Against the bearer:** Advantage / Disadvantage levels and a bonus on the **attack rolls made against** whoever has the Effect.
  An attack is one roll against all targets, so the roll takes **only what every selected target shares** (the smallest in size,
  same sign); the chat names the Effects of the other targets that were not applied so the GM can use Edit. (decided)
- **Defence:** flat change of Physical / Mental Defence (never below 0): used by attacks and shown on the sheet ("With Effects").
- **Movement, AP and HP:** flat change of Movement (squares per AP), maximum AP and maximum HP (healing caps at the new maximum).
- **Damage, Crit and DC:** damage the bearer deals (added to the base damage of its attacks, noted on the card), damage it takes
  (flat, after resistances, never below 0), the natural roll that is a Critical Hit (negative lowers it from 20) and the DC of
  the Saves its statuses ask for (Automatic DC).
- **Resistance:** a temporary flat X, Half, Double or Immunity to a damage type, laid over the sheet's resistances.
- **Starts with:** statuses put on the bearer when the Effect starts (no Save, lasting as the Effect does: Until end of turn and
  Until start of next turn count as 1 Round) and Temp HP.
- **Note:** free text for the table, never automated.

**Duration:** *Until end of turn* (ends when the bearer ends their turn), *Until start of next turn* (ends when the bearer's next
turn starts: a Dodge), *1 Minute* (5 rounds, counted at the end of each of the bearer's turns) and *Long* (until removed by hand,
the default). Durations count turns, so they only run in combat. **Uses** (optional, 1 to 10): the Effect ends after that many
**attacks**: for a roll part, rolls it changed (spent when the roll is made); for an against part, attacks rolled against the
bearer (spent when the attack is rolled, no Revert). An Effect with no uses left ends. **The same Effect put on again refreshes**
the running one (duration and uses start over); it never stacks, different Effects add up. (decided)

**Where Effects live:** a **global library** the GM edits (Arcane > General without a character) and each character's **own
library** (the sheet's `effectDefs`, edited by the GM or the owner in the General tab). A running Effect (`sheet.effects`) is a
**copy** of the definition, so editing the library never changes what is running. The sheet lists the running Effects (what each
does, how long, remove button) under the Statuses; the General tab can **Put on** any Effect on its character; an Effect shows as
an **icon on the token** (the Effect's own icon, a sparkle by default; game-icons.net, see Status icons), after the statuses.
**Sources:** a Basic Action, a weapon, an Enhancement (a Manifestation's or a spell's too), a Stance band and a Spontaneous Action can **put Effects on** the user or
the selected targets (`effects: [{ id, to: 'self' | 'target' }]`, references into the library); they **land whether or not the
attack hits**. Every change goes through the journal, so a chat card's **Revert** removes what it added and brings back what it
removed (including spent uses). A card line shows "Gains / Refreshes {effect}" and "{effect} ends".
An **item** can carry Effects too (`item.effects`, on its user only): using the item (the Use button) puts them on, as one card with Revert.

### Basic Actions (decided)
The things anybody can do on their turn, from DC20's Basic Actions, listed in the **General tab** (`shared/basicActions.js`).
Shipped with the app (the GM can edit, delete and add actions; a deleted one stays deleted): Attack, Move, Spell (text only: they
point to the footer attack, the D-pad and the Magic tab), Dodge (1 AP: Effect *Dodge*, Disadvantage on the next attack against
you, Until start of next turn, 1 use), Full Dodge (2 AP, all attacks), Disengage, Full Disengage, Hide, Help (1 AP: a d8 Help
Die to the selected targets), Object, Feint, Taunt, Intimidate, Grapple, Shove, Tackle, Throw, Disarm, Analyze Creature, Calm
Animal, Combat Insight, Conceal, Investigate, Search, Medicine, Pass Through and Extend Jump. Not included: the weapon styles,
Martial Enhancements, the MP/SP converters, Opportunity Attack, Spell Duel and Sustained Action. An action has a name, text, an
**AP cost**, an optional **roll** (a Tarrot roll: Athletics became Weight Manipulation, Acrobatics and Stealth Body Movement,
Insight and Awareness Awareness, Trickery Fine Motor Skills, Influence and Intimidation Likability, Knowledge and Medicine
Symbolism; the GM can change each), **Effects** it puts on the user or the selected targets, and an optional **Help Die**.
**Using an action** (the GM, or the player of the character) is **instant, with no GM confirm card**: it spends the AP, posts
the roll (contested rolls and DCs are judged by the GM, nothing is decided for them: so actions whose effect depends on winning a
contest, like Feint or Taunt, put nothing on automatically), puts the Effects on and gives the Help Die, and posts **one chat card
with Revert**. An action that aims at others needs a selected target. The shipped Dodge, Full Dodge, Disengage and
Full Disengage Effects are global Effects of their own (`default:*`).

## Feature design

### Character sheet (implemented in Phase 3, mobile first)
Fields are hard-coded in the repo as a schema. Characters are stored permanently in Turso. PCs and
NPCs share one sheet. (decided)

Layout, top to bottom:
1. **AP** on top (Minion checkbox for NPCs), then HP.
2. **Stats:** each a big number. Under each, two small rectangular buttons, each half the stat
   box width: left rolls the Attribute Roll, right rolls the Save Roll. Luck has no Save button.
   Physical Save and Mental Save shown as the two special saves.
3. **Combat Masteries:** Magic, Stances, Manifest as smaller boxes in a triangle under the
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

**Layout (decided after the second playtest):** the interface fills the whole width of the screen, and the same
goes for every page: unused space is filled, not left empty.
- **Sheet on a PC (1024 px and wider):** **three columns**. Left: the vitals (AP cubes, HP, Physical and Mental
  Defence, Movement, Size, Experience Modifier, Height), the Combat Masteries (three in a row) and the Battle remote.
  Middle: Stats and Skills. Right: Features, Inventory, Resistances, Statuses, Stage and Pictures. The name, the
  Back link and the Sheet | Arcane switch share one row. On a phone it stays one column.
- **Defences:** Physical Defence has a faint shield and Mental Defence a faint brain drawn behind the value.
- **Tints (20% transparent):** every Stat card and every Skill row is tinted by its stat: Strength red, Dexterity
  green, Intelligence blue, Spirit purple, Luck yellow. A skill that takes the better of two stats has a gradient from
  one colour to the other (Body Movement red to green, Likability purple to blue...); the Prime skill (Awareness) has a
  gradient through all five colours (decided).
- **Scroll bars** everywhere are thin and in the interface's violet and dark colours.
- **Card grids:** Stances (in the order of the zodiac), Spell Drafts, Created Spells, Tarot Cards, Manifestations,
  Weapons and Enhancements are grids: 3 cards per row on a PC, 2 on a tablet, 1 on a phone (decided). The mini picture
  of a spell scheme on a draft is larger. The spell editor and a Stance's tree with its table sit side by side on a PC.
  The Characters page lists folders in columns on a wide screen.

Decided for the sheet:
- **Item uses:** a Use button subtracts 1; the number can also be typed. At 0 the item stays,
  marked empty, and can be refilled.
- **Item State:** the drop-down starts empty; options are created per item.
- **Edit rights:** the owner and the GM edit everything on a PC; only the GM edits an NPC.
  Enforced server-side.
- **Roll results:** go to the global chat log (next section), not a private popup.

Implemented behaviour (Phase 3):
- **Editing:** number fields save when they lose focus or on Enter; invalid or out-of-range input
  reverts. Edits from any device appear live on the others (last write wins per field; each
  character's writes are serialised on the server, so two devices editing at once never overwrite
  each other's fields).
- **Rolling:** on a touch screen a tap on any roll button always opens the roll dialog (long-press
  was unreliable on iOS). With a mouse, a click rolls at once and a right-click opens the dialog. The
  dialog shows one live formula about to be rolled, with the dice count and every bonus and its
  source (the same plan the server uses, `shared/roll-plan.js`), for example `1d20 + 3(Dexterity)
  - 2(Custom)`; when statuses or extra levels add dice it also says why (`3d20, keep the lowest:
  Disadvantage 2 (Dazed 2)`). Below it are a stepper for extra Advantage levels (up to 10 either
  way; negative for Disadvantage) and a custom modifier (-99 to 99, labelled Custom); the formula
  updates as you edit. The total of all levels (statuses plus manual) is capped at 10, so a roll
  never exceeds 11 dice. The result goes to the chat and the
  roller's chat panel opens. (decided)
- **Negative numbers:** iOS digit pads have no minus key, so every field that can be negative
  (stats, X Defence, HP, resistance value, custom modifier) opens the full keyboard and the minus
  is typed. Only a whole number (optionally negative) within range is saved; anything else reverts.
  (decided, replaces the earlier +/- button)
- **Advantage levels** work as in DC20: each level adds one d20; the roll keeps the highest (net
  Advantage) or the lowest (net Disadvantage); Advantage and Disadvantage levels cancel. Dazed (2)
  means 2 levels of Disadvantage, so 3d20 keep the lowest. (decided)
- **Statuses apply to rolls automatically**, including quick rolls (`shared/status-effects.js`):
  Dazed X, Impaired X (Disadvantage X on mental / physical checks: Attribute and Skill rolls whose
  stat is Intelligence or Spirit / Strength or Dexterity), Disoriented X and Weakened X
  (Disadvantage X on mental / physical saves), Grappled, Immobilized, Restrained (Disadvantage on
  Dexterity saves), Exhaustion X (-X on every check and save). The roll dialog shows them and the
  roller can add more levels on top. **Combat Mastery rolls (decided after the second playtest):**
  Impaired X and Hindered X (Disadvantage X) change a **Stance roll**, Dazed X (Disadvantage X) a
  **Manifest roll**, and Exhaustion X (-X) both of them; **nothing changes a Magic roll** (so not
  the spell's attack, its durability check or the crafting roll either). Weapon attack rolls are not touched. Not automated yet: auto-fail effects, effects "against the
  source", and everything about attacks (Phase 6). (decided)
- **Combat Mastery rolls:** each Combat Mastery nameplate is a button, all three in the standard UI
  colour (the coloured glow stays behind the box). A Mastery roll is
  d20 + the Mastery + the Experience Modifier, shown as `1d20 + 4(Mastery: Magic) + 3(Experience
  Modifier)`. Statuses do not change it yet. (confirmed)
- **Group saves:** Physical Save is the better of (Strength + Strength Defence) and (Dexterity +
  Dexterity Defence); Mental Save likewise for Intelligence and Spirit. (decided)
- **Awareness** scales from the highest of all five stats, Luck included. (confirmed in playtest)
- **Minion** can only be set on NPCs; it lowers max AP to 2 and clamps current AP.
- **Resistances:** each damage type has a flat X, Half, Double, Immunity and Consumption. Empty rows
  are dropped. The type icons are placeholder colored discs until real icons exist.
- **Statuses:** all 38 are addable; stackable ones have a +/- counter, and rule text shows "X"
  replaced by the stack count. Nothing is automated yet. The text lives in
  `shared/rules-data.js` and a test fails if it drifts from the table above.
- **Item State options** are added after the item is created (Edit). The chosen State shows on the
  item's row in a tag in the standard UI colour (never colour-coded per state) before the uses: fixed size, room for 7 characters on each of 2 lines,
  the rest cut off with an ellipsis. (decided)
- **Status list:** each status shows at most 2 lines of its description in the add list and on the
  sheet; tapping an active status shows its full text.
- **Who can see a sheet:** the GM and the PC's own player only. Other players cannot open or
  receive updates for it. (confirmed in playtest)
- **Trading:** a player offers an item to another PC; the recipient gets a confirm dialog on any of
  their devices. Accept moves the item (it arrives as a distinct copy with a new id); decline does
  nothing. Pending offers are held in server memory and are lost on restart. The GM's Send moves
  an item between any two characters at once, with no confirmation.

### Small interface rules (decided)
- **Parameter icons:** Movement, Size and Experience Modifier on the sheet have a faint drawing behind their value (footsteps,
  a growing square, a star), large, semi-transparent and on the right, exactly like the shield and the brain behind the
  Defences.
- **Notes on stones** (in the Spell Drafts and in the editor) are shown in the interface's standard text size.
- **Icon:** the web service has an icon (a wooden box of Tarrot cards): `client/public/favicon-32.png`, `icon-192.png`
  and `apple-touch-icon.png` (on the interface's dark colour), linked from `client/index.html`.
- **Drop-down menus** are dark with light text, in the interface's colours (`color-scheme: dark` and styled options), not
  the browser's light list.
- **Buttons on a PC:** the Spontaneous Action button is compact (full width only on a phone); the target pickers lay the
  characters or areas out **three per row** on a PC.

### Settings and languages (implemented)
Decided:
- **Settings** are local to the device (browser storage, like the remembered identity) and reached with
  a **Settings** button on the picker (the login screen), before anyone is chosen. On the Display the
  way there is Switch, then Settings. The GM also has a **Settings** button in the top bar (a dialog with the same
  settings). They hold three settings: the **language**, the **Deadzone** of the Area tool and the **Status icon size** in Battle (below).
- **Apply to everyone (decided):** next to every setting the GM (and only the GM, never on the picker) has an **Apply to
  everyone** button: a **one-time push** of the GM's current value to every connected device (the server relays it,
  `settings:force`; it is validated). Each device stores it like a value it had chosen itself and can change it again
  afterwards; devices that are offline do not get it. Every setting, now and later, is wrapped in the same row component
  (`SettingRow`), which carries the button; `shared/settings.js` lists the settings the server accepts.
- **Deadzone of the Area tool:** 1.1x to 3x in steps of 0.1, default 1.5x (`tarrot.deadzone`).
- **Status icon size in Battle (decided):** 10% to 50% of one grid square, default 25% (`tarrot.statusIconSize`); see Status icons on tokens.
- **Languages:** English and Russian. A first visit uses the browser's language (Russian if it starts
  with "ru", otherwise English); the choice is then remembered (`tarrot.lang`). Everything a person
  reads is translated: the interface, the game terms (stats, skills, statuses and their rule text,
  damage types, roll titles), server error messages and the Combat and attack lines in the chat, each
  shown in the language of whoever reads it (the client tells the server its language with `lang:set`;
  chat lines travel as `{ key, params }`). Not translated: names typed by people (characters, items,
  scenes, tracks) and this README.
- **The Localization Mapping** is `LOCALIZATION.md` in the repository: a Markdown table `English |
  Russian`, grouped by part of the app. The English text is the row's key. It is the only source of the
  Russian text: the page is built with it and the server reads it at start, so a fix made on GitHub
  goes live with the next deploy (a fetch from GitHub at run time was considered and not chosen).
  A missing translation shows the English text.
- **Keeping it complete:** whenever something visible is added, both languages are added in the same
  change (rule in `CLAUDE.md`). `npm run i18n` adds rows for new texts; `server/test/localization.test.js`
  fails when a text has no Russian row, a row is empty, or the `{placeholders}` differ, and checks that
  every roll title and formula term is covered. Russian terms are my first draft (for example Сила,
  Ловкость, Интеллект, Дух, Удача; ОД for AP, ОЗ for HP, "Преимущество" and "Помеха" for Advantage and
  Disadvantage); fix them in the table.

### Chat log (implemented in Phase 3)
- A global log every identified person can read and write to. Every roll from any sheet is posted.
- Held in server memory only: it clears itself whenever the server instance restarts. Only the GM
  can clear it by hand (with a confirmation). Capped at 300 messages; text messages at 500
  characters. (decided)
- No hidden rolls, no whispers. (decided)
- **Roll card:** the roll type is at the top, the result as a big number under it, and the
  breakdown beneath in the form `1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills)`. Zero
  bonuses are left out, except the stat itself. With more than one die the card also shows
  the dice as `kept|other|other`, for example `12|1|20`: the die that counts comes first and is
  prominent, the others follow greyed out and semi-transparent. A natural 20 is tinted green and
  a natural 1 red, in the kept die and in the others, and the card and total are tinted the same
  way when the kept die is a 20 or a 1. A natural 20 shows "Critical" and a natural 1 shows "Critical
  Failure" on every d20 roll (the Exposed status is not applied automatically). (decided)
- Damage will get its own breakdown of the same shape when attacks arrive in Phase 6. (decided)
- Roll cards keep the English names in the data; each reader sees them translated (see Settings and languages).
- **Popups:** while the chat is closed, every new message (text or roll, one line) rises from the
  bottom right corner above the Chat button, stays for two seconds and fades out by itself.
  Several messages stack upwards and never overlap. With the chat open there are no popups.
  (decided)
- Author names come from the server-side identity: a player's messages carry the PC's name, the
  GM's carry "GM". A GM rolling for an NPC posts as the GM with the NPC's name on the card.
- **Effect cards (decided):** everything that changes sheets is one card, not a pile of lines: an applied attack
  or Spontaneous Action, the start of a turn (Bleeding, Burning, Stunned, Surprised) and a crafted spell. The card
  has a title and one **block per character** (hidden tokens are left out) with one row per fact: the roll against
  the Defence and its result, Damage with its type, After resistances, HP before and after, Temp HP absorbing,
  statuses added, the attacker's AP and costs, Help Dice, spell durability. **Keywords are bold and coloured by
  category:** damage red, healing green, Temp HP light blue, HP rose, statuses amber, AP violet, Help Dice indigo,
  Hit green, Miss grey, Critical gold, resistance steps teal, item uses orange, spells fuchsia; numbers white.
  (The server tags each value with its category; the words stay translatable.)
- **Revert and Edit (decided):** the GM sees two buttons on every effect card that changed something (nobody else does).
  **Revert** takes away exactly what the card did: it subtracts the card's own changes (HP, Temp HP, AP, statuses, item
  uses, spell durability, Help Dice, and for crafting the stones and the spell), so anything that happened to the
  characters afterwards stays and several cards can be reverted in any order. The card stays in the chat, dimmed, with
  a **Reverted** tag and no buttons. Crafting cannot be reverted once the spell has been used (the GM is told).
  **Edit** exists on attack cards only (not on turn starts, crafting, or a Spontaneous Action without a roll): it
  reverts, tags the old card **Replaced**, and reopens the confirm card with what was applied (Total, Base damage,
  damage type, AP, statuses), so the GM can change them or give Advantage or Disadvantage to the final roll and apply
  again, which posts a fresh card. Durability rolls of spells are rolled again on the new apply. There is no extra
  Combat line about a revert or an edit; the tag is the record. Cards live in server memory with the chat.

### Scene mode (implemented in Phase 4a)
Light-novel style: a fullscreen background with character art standing along the bottom. Decided:
- **Placement (changed after the Phase 4-5 playtest):** every figure is free. Nobody has to arrange
  a lineup: a newly summoned figure stands in the visible part of the picture (PCs from the left,
  NPCs and temp NPCs from the right, one slot after another) until someone drags it. The GM, the
  Display, and a player (their own PC only, on a desktop) drag a figure anywhere, including partly or
  fully off the picture (up to one picture width or height beyond each edge). A dragged figure
  comes to the front. Positions are the middle of the figure's feet as fractions of the **background
  picture** (which is scaled to cover the screen), so the spot sticks to the picture. **Reset spot**
  (Cast drawer, or Token Settings) takes the spot away so the figure returns to its entry slot; use
  it when a figure has been dragged out of reach. The GM sets each figure's size (0.3 to 2) in Token
  Settings.
- **Who is on the stage:** real characters (PC and NPC) and lightweight **temp NPCs**. A temp NPC
  is just a name and pictures, kept in its own folder tree, for narrative extras.
- **Pictures:** each character or temp NPC has one collection of pictures (up to 20), used as Scene
  art and later as Battle tokens. A picture is chosen at summon and can be swapped in Token Settings.
  Deleting a picture that is on stage swaps to another, or removes the character from the stage if
  none is left.
- **Summoning:** the GM can summon or dismiss anyone; a player can summon or dismiss only their own
  PC (from the sheet, on any device). Summons belong to a scene: each scene keeps its own cast, and
  the GM can only summon into the active scene.
- **Scenes** are foldered (nested folders, like the roster) and each has a background picture. The
  GM activates one at a time; the Display and desktop players see the change live. Nobody is
  force-navigated. With no active scene the Display shows a waiting message.
- **Name plaque** above each character (it was below until the first playtest); it is hidden with the character.
- **Hidden** characters are filtered out on the server: they are never sent to players or the
  Display, so they cannot be found by inspecting the page. The GM sees them half-transparent.
- **Zoom and pan** are local to each screen (wheel, drag, pinch, buttons); the zoomed view is never
  shared. Overlays stay fixed.
- **Motion:** characters slide in from their side when they appear.
- Battle mode reuses this page in Phase 5; the Display will follow the active mode.

### Battle mode (implemented in Phases 5a and 5b)
Decided:
- The GM (desktop) toggles **Scene / Battle** in the scene chrome; the mode is shared, so the Display
  and desktop players follow it. Each scene has a Scene picture and a separate **Battle map** picture
  (uploaded from the Scenes drawer). The mode outlives scene changes.
- The map is shown whole, as large as fits, with the same local zoom and pan as the Scene.
- **Grid:** square. Each scene stores the cell size and offset as fractions of the picture (default
  cell 1/20 of the width). The GM sets it live over the map in the Grid panel, **in pixels of the battle
  picture itself** (decided): the side of a square, and the shift right and down, each with - and +
  buttons and a number field; **Ctrl + mouse wheel** changes the square size by 1 pixel while the panel is
  open. The grid may **extend beyond the picture** (decided): a square that only partly fits at the right
  or bottom edge still counts (and tokens may stand on it), and a negative shift starts the grid before the
  picture's corner; only the grid lines over the picture are drawn. The squares counted across and down are
  shown. Hidden tokens are never sent to players or the Display.
- **Grid on/off is a setting of the scene** (decided), saved for everybody watching until it is changed; the
  GM and the Display can switch it (it used to be local to each screen).
- The **Cast drawer** lists the characters in their folders, as on the Characters page: folders are
  **collapsed by default** and open with a tap (a search opens the folders that hold a match); a folder shows
  how many characters it holds.
- **Tokens:** the GM places a character or temp NPC as a token from the Cast drawer ("Place token" in
  Battle mode) using one of its pictures; tokens occupy whole squares. Size comes from the
  character's sheet (**Size**, 1 to 6 = 1x1 up to 6x6 squares; a temp NPC has its own size).
  Temp NPCs can be marked a **prop** (terrain or object; no sheet). Right-click (tap on touch) a
  token for its circles, standing on the two sides of the token (up to two per side, each column
  centred on the middle of the token; next to a screen edge the column moves beside the other one):
  **Token Settings**, **Hide/Reveal**, **Set Height** and **Remove** (takes the token off the map).
  **Set Height** is the number of Spaces the character is in the air (0 to 99), changed with **Up**,
  **Down** and **Reset** buttons (no typing; every press is saved at once); it shows as "+X sp." above
  the token for everyone and changes nothing else yet. The same buttons sit on the character
  sheet next to Movement and Size while the character has a token on the active Battle map.
  **Who:** the GM and the **Display Screen** get every circle (in Scene mode: Token Settings,
  Hide/Reveal and Remove); a desktop player gets only **Set Height** and only for their own
  character. Controls on the Display and in Scene and Battle are meant to be usable with the mouse
  alone. (decided) A token or figure the Display hides is gone from the Display too, so only the
  GM can reveal it again.
- **Dragging** a token (GM, Display, and a player for their own character) is free and snaps to a square for everyone; it costs no
  movement.
- **Tools** (GM and Display): Move, Draw, Ping, Ruler, Area, Erase, on a **static bar** on the left
  (it never moves or changes size). Picking a tool opens its options in a separate panel to the right
  of the bar. Pings show a ring for a few seconds on every map. At most 300 marks.
  - **Draw:** a freehand Pen (colours, three widths) or an **Eraser** (three sizes) that rubs out just
    the part of a drawing under it, splitting the drawing where it is cut; **Clean** removes all
    drawings.
  - **Area:** circle, cone (90 degrees), **arc** (a 180 degree cone), line and square templates sized
    in squares (with up and down arrows to the right of the number field, usable on a touch
    screen) and rotated by dragging; **Clean** removes all areas.
  - **Deadzone (decided):** while an area is dragged, everything farther than the **Deadzone factor** (setting, default
    1.5, 1.1 to 3) times the area's size in squares from where the drag began is drawn **striped and half transparent**
    (the same circle for every shape, measured from the area's origin: the centre of a circle or square, the tip of a
    cone, arc or line). **Letting go inside the Deadzone cancels** the area; the area is drawn faded while the pointer
    is in it.
  - **Names (decided):** every area gets a static name when it is created, **Type (Number)**, for example `Arc (3)`: the
    shape (Circle, Cone, Arc, Line, Square) and a number per shape on that Battle map. The first of a shape is (1); a
    new one is the **largest number of that shape still on the map plus 1**. A name never changes: with every other Arc
    deleted, Arc (7) stays Arc (7). Clean (all areas deleted) starts again at 1. The name is written on the map at the
    area's origin, for everyone. (Areas drawn before names existed were numbered once, in the order they were drawn.)
  - **Move (decided):** a **Move** button in the Area tool's options switches it to moving areas: dragging an area moves it
    (snapped to half a square like a new one) and selects it (drawn with a white outline); a press on the empty map drops
    the selection. **With an area selected, Ctrl + mouse wheel turns it by 1 degree and Shift + mouse wheel by 15**
    (Ctrl is the fine one, Shift the fast one; wheel down turns clockwise); the wheel does not zoom the map then. The
    GM and the Display can do it; the name never changes. Turning has no touch control. (`mark:update`)
  - **Highlight while drawing (decided):** while an area is being dragged, the characters that would be inside it get a
    noticeable cyan glow; it disappears when the area is created (or cancelled).
  - **Erase:** click any drawing or area to remove it whole.
  - Drawings and areas are shared and stay until removed. Clean is available to the GM and the
    Display alike (a decision of mine: they share the same tools).
- **Ruler:** counts squares with diagonals alternating 1 and 2.
- **Movement (phone D-pad):** each sheet has **Movement** (squares per AP, default 5, 0 to 99).
  On the character's own turn every square costs from the Movement bank; when the bank is empty
  the next step needs 1 AP and banks a fresh Movement (the phone asks to confirm spending AP).
  Diagonal steps alternate cost 1 and 2. A **Free Movement** checkbox lets a step cost nothing.
  Outside the character's own turn (and before combat) steps are free.
- **Targeting:** from the phone a player selects any number of visible tokens as targets (tap to
  select, tap again to deselect). Targets live in server memory; each selected token shows a pulsing
  ring on the map. Attacks use them (see Targeting and attacks).
- Turn order, initiative, rounds and turn-start effects: see the Combat tracker below.

#### Combat tracker (implemented in Phase 5b)
Decided:
- **Who fights:** Start combat (GM) enrols every character token on the map (PCs, NPCs, temp NPCs;
  props never). Hidden tokens are enrolled too, but they are left out of what players and the
  Display see, and the tracker posts no chat lines about them. The GM can add a late arrival,
  remove someone, reorder, and edit any initiative number.
- **Initiative:** players roll their own from the phone (**Roll Initiative** on the Battle remote):
  a Speed skill roll, shown in the chat like any roll, once per player (the GM can fix it). The GM
  rolls the NPCs with one button (**Roll for NPCs**): a Speed roll for an NPC with a sheet, a plain
  d20 for a temp NPC (it has no sheet). Combat begins when the GM presses **Begin combat**.
- **One sorted list**, highest first; ties keep their current order (the GM can reorder); anyone
  who has not rolled goes last. Shown as a list on the right of the Battle map for the GM, the
  Display and desktop players, with the round counter, portraits and the active turn highlighted.
- **Turns:** **Next turn** by the GM, or **End turn** by the player whose turn it is (phone). After
  the last combatant a new round starts. Only the active character pays for Movement (see Movement
  above); everyone else, and everyone outside combat, moves free.
- **Turn start (automatic, with a chat line naming the numbers and the source):** Bleeding X does X
  true damage; Burning X does X fire damage through the character's fire resistance (flat first,
  then Half/Double; Immunity 0; Consumption heals half); Stunned X and Surprised (2) lower the AP
  the turn starts with (Stunned X + Surprised 2 below the maximum, never under 0). HP never goes
  below 0 and nothing happens at 0: the GM decides what it means (no death handling yet).
- **Turn end:** unspent Movement is lost, AP is refilled to the maximum, and Surprised is removed.
- The combat lives in server memory and belongs to the active scene: it ends when another scene is
  activated, when everyone leaves the map, or when the GM presses End combat (or Cancel combat before
  it began).
- Temp NPCs have no sheet, so they take no turn-start effects.

### Targeting and attacks (attacks implemented in Phase 6a)
Decided:
- **Attack data:** an attack is drafted in the Arcane tab (see there): a Weapon plus Enhancements.
  Their damage, damage type, statuses and AP cost prefill the confirm card, which the GM can still edit.
- **Flow:** on the Battle remote (phone, or the GM on an NPC's sheet) the player first selects the
  targets (see Targets), then taps **Attack**, which opens the character's **Arcane tab** (the old
  Mastery / Defence / AP dialog is gone: those choices are now part of the weapon). There the attack
  is drafted and rolled with the footer's **Done** button (see Arcane tab). **AP is checked:** the Attack
  button is greyed out with no AP or no target, Done is greyed out when the AP cost of the weapon and its
  Enhancements is more than the character has (the server refuses it too). The server rolls it (d20 + the
  Prime stat + Experience Modifier for basic weapons, plus status effects, Advantage and the Dice Roll
  Bonuses) and posts the roll in the chat; a **confirm card** pops up on the GM's screen (desktop or phone).
  Attacks that the GM postpones ("Later") wait in a badge; the GM can also **Discard** one.
- **The card** is deliberately small (changed after the playtest): the GM sets only the **Total**,
  **Base damage**, **Damage type** (the twelve types, or True, which ignores resistances), **AP
  cost** and **Add status** (with stacks, a Duration and, for a status with a Save, the DC: Automatic or Manual; each status is
  added to every target that is hit, after that target's Save, see Status Saves and Durations). Everything else is
  automatic: the natural roll, the critical range (natural 20), Exposed on a natural 1, the targets and
  each target's Defence. Below the fields the card lists each target with its Defence and the outcome
  as it will be applied (read only).
- **Targets:** the player chooses them. On the Battle remote a tap on a character selects it and a
  second tap deselects it, so any number of characters can be selected (each shows a pulsing ring on
  the map); "Clear targets" deselects all. The GM cannot change the targets on the card. Wherever a
  character picker is shown (the Battle remote, the Targets of the Arcane tab) it has a **two-halved switch,
  Individual | Area**: pressing anywhere on it switches; the chosen half is in the interface colour, the other half is
  white. **Individual** works as described above. **Area** lists the areas drawn on the map by name, each with the names
  of the characters inside it (for information); tapping an area selects it, tapping again deselects it. **Picking an
  area is, in the backend, exactly picking every character in it, worked out live when the attack is made** (so whoever
  is inside at that moment is hit); several areas and individual picks can be mixed and a character counts once. A
  character is in an area when the **centre of its token** is inside it, with a small bias towards including more:
  the centre may be up to **0.25 of a square outside the edge** (`shared/templates.js`). Hidden tokens are never listed
  for players but the server includes them. Props are not characters. The rings on the map show the characters of
  picked areas as targeted. A temp NPC has no sheet, so
  its Defence is a fixed **10** (my default, open to change).
- **The roll card in the chat** shows a roll made against something as two large numbers: the
  **Attack Value** and the **Target Value** (the Defence being rolled against; with several
  targets, one Target Value per target, named).
- **Damage per target:** Hit Severity (see Hit severity and damage; below the Defence is a Miss, a
  natural 20 always hits) gives the bonus; damage is base + severity bonus + 2 for a critical, then
  the target's resistance for that damage type (flat, then Half/Double; Immunity 0; Consumption heals
  half). HP never goes below 0 or above max.
- **Apply:** subtracts the damage from each target's HP, adds the chosen statuses to targets that were
  hit, spends the attacker's AP (my default: at Apply, not at the roll, so a discarded card costs
  nothing), gives the attacker Exposed 1 on a natural 1, and posts **one effect card** in the chat (see Effect
  cards in the Chat log section; blocks about hidden tokens are not posted). A temp NPC has no sheet: its block
  says so and the GM applies it by hand. A miss changes nothing but the AP.
- **Advantage or Disadvantage on the card (decided):** the confirm card has a field for levels (positive =
  Advantage, negative = Disadvantage) and a button. The d20 that counted stays, that many extra d20s are rolled and join
  it, and the highest (Advantage) or lowest (Disadvantage) counts. Every other earlier die and every earlier
  Advantage or Disadvantage (statuses, manual levels) is forgotten; the modifiers and Dice Roll Bonuses stay as rolled.
  The Total follows the new natural roll, and the adjusted roll is posted as a new roll card ("Attack roll (set by
  the GM)"). Used again, it starts from the d20 that counts now.
- **Not yet:** automatic Exposed from a natural 1 on other rolls, statuses that change attack rolls
  (Blinded, Prone and so on), reactions, and stored attacks and abilities.

### Mobile remote (implemented in Phase 5a)
Phones do not render the Scene. On the character sheet a **Battle remote** shows when the character
has a token on the active Battle map: an eight-way D-pad (one square per tap, counted against
Movement as described under Battle mode), the Movement bank and AP, the Free Movement checkbox and
the target list. A step that needs AP asks for confirmation. (decided)

### Music player (implemented in Phase 4b)
Decided:
- **Who hears it:** only the GM on a desktop screen and the Display Screen. Phones, and players on
  any device, get no music, no sound and no controls at all (the server refuses to let them
  listen). (decided)
- **Source:** YouTube links only, never uploaded audio, so the database stays small. Links in the
  usual shapes are accepted (watch, youtu.be, embed, shorts, live, music.youtube.com). The title is
  looked up through YouTube's oEmbed endpoint on the server and only pre-fills the name; if the
  lookup fails the GM types a name. (decided)
- **The bar:** a slim bar with a spinning record and the first 15 characters of the song name
  (an ellipsis is added when the name is longer). It is only as wide as its content; the rest of
  the row is fully transparent and never blocks the screen. The record spins while playing. On the
  GM's desktop it sits in the top bar; on the Display it sits at the top right (the Display's
  "Switch" button moved to the top left). **The bar is always shown** (decided after the second
  playtest), on the Display too and whether or not a scene is on screen; with nothing playing it just says "Music".
- **GM:** clicking the bar opens the full player: now playing with a seek slider, Previous,
  Play/Pause, Next, Stop, Repeat (off, one, playlist), Shuffle, volume; and named playlists with
  tracks that can be added, renamed, deleted and moved up or down. Playlists live in the database.
  (decided)
- **Display:** a click or right-click on the bar opens a volume slider and a mute switch. Volume
  and mute are remembered on that screen. (decided)
- **Sound needs one tap:** browsers block sound until the page has been touched. If that happens
  the bar shows "Click for sound"; the next click anywhere starts the music.

Behaviour:
- **Sync:** the server keeps an anchor (position, playing or not, server time) rather than a
  running position. Each screen measures its clock offset with a few pings and works out where the
  music should be, seeks if it is more than 1.5 seconds off, and re-checks every 5 seconds and when
  the tab becomes visible. A screen that opens late starts at the right second. Pausing anchors
  where the music really was, so Resume is exact.
- **What is playing is held in server memory:** it stops when the server restarts. Playlists stay.
- **End of a track:** every listener reports it; only the first report for the current anchor
  moves on, so two listeners never skip two songs. Previous restarts the track after 3 seconds.
  Next always leaves the track, even under Repeat one. Shuffle picks a different random track.
- **Videos that cannot play** (YouTube errors 2, 100, 101, 150) are skipped on the first report and
  the GM is told which one. If every track in a playlist fails in a row the music stops instead of
  looping. Reported durations under 5 seconds (an advert) are ignored and the largest is kept.
- Deleting the playing track or playlist stops the music.
- The GM's browser tab must stay open for the GM to hear it; nothing else depends on it.
- The end-to-end tests block YouTube (they use made-up video ids, which the real player rightly rejects and skips), so they check the server, the bar and the controls, not sound.
- I could not check real YouTube playback in my test environment (it has no access to YouTube), so
  the first Render playtest is the real test of sound.

### Arcane tab (decided, built in four PRs: General, Magic, Stances, Manifest and Locks; all implemented)
The Arcane tab is a major part of Combat. Header: **General** (grey, 10% of the width) and three
sub-tabs sharing the other 90%: **Magic**, **Stances**, **Manifest** (same colours as the sheet's
Combat Masteries). The GM can also open the Arcane tab **without choosing a character** (the general
Arcane tab): what is created there applies to every character, PCs and NPCs alike; the same actions
inside a character's sheet affect only that character.

**Overall attack (footer).** An attack is built from all four parts: exactly one **Weapon** (a physical
weapon from General, a crafted spell from Magic, or a Manifestation) plus any number of Enhancements
from any tab (an Enhancement spell, one Stance, a Manifestation Enhancement). The footer of the
Arcane tab lists the names of everything chosen and has a small **Done** button at the right edge.
Done makes one attack roll against all selected targets with all modifiers and then the usual GM
confirm card (prefilled from the parts). Targets are selected here too (mirrored with the Battle
remote's targets, so no switching tabs). Only crafted spells can be used; drafts cannot.

**General tab (grey).**
- Everyone always has an **Unarmed Attack** (0 Bludgeoning damage, Physical, 1 AP). It cannot be
  removed, but can be modified (martial arts and similar).
- Items get a **Weapon** toggle on the sheet. Turned on, the item changes background and its name and
  description appear in General. Defaults: 1 Slashing damage, against Physical Defence, 1 AP; all of it
  editable, and a **Range** (in Spaces) can be added. It replaces the current Attack flow of the sheet
  (parameters, rules and UI move here).
- **Range check** on rolling, from the selected targets: if at least one is out of range, the user is
  warned and may attack anyway (a suggestion, not a rule). Distance is measured between the real token
  positions: same height = what the Ruler shows; different heights = Pythagoras
  (sqrt(horizontal Spaces squared + height difference squared), 1 height = 1 Space), rounded to the
  nearest whole Space.
- **Enhancements** augment an attack; each has a cost and an effect. Default ones for everyone:
  **Power Attack** (1 AP: +1 damage of the weapon's type, repeatable), **Precise Attack** (1 AP: +1
  Advantage, repeatable). Created by the GM globally (general Arcane tab) or by the GM or the owner
  on a character's sheet. **Cost** = any combination of: AP; Damage (a damage amount of a type taken
  by the user); Status (a status applied to the user); Item (a number of uses of a chosen item).
  **Effect** = any combination of: Damage; Range; Status; Dice Roll Bonus (a die from d4 to d20 rolled
  with the d20 and added or subtracted, positive and negative both possible); Unique Effect (a name
  and description shown in the chat, no automation). Each Enhancement is **Repeatable** (more than once
  per attack) or **Singular**. Any mix of different Enhancements can be applied as long as the user
  can pay.

**Magic tab.** Users prepare spell schemes, save drafts to their own collection and craft usable
spells. A spell has: name, description, **Scheme**, **Spell Fine Tuning**.
- **Spell Stones (12):** Aries Release (aggressive release), Taurus Modifier (stabilizes: fewer Spell
  Levels but more uses), Gemini Release (stealthy, for traps, slow to charge), Cancer Base (emotional
  phenomenon), Leo Modifier (positive version), Virgo Base (physical phenomenon), Libra Link (combines
  two effects, halving each), Scorpio Modifier (weaker but longer lasting), Sagittarius Modifier
  (weaker, much greater range), Capricorn Link (slightly weaker, one acts as catalyst for the other),
  Aquarius Release (precise, stronger the more restrictions), Pisces Modifier (envelops the mage, immune
  to it). Ring colours: Bases purple, Links dark blue, Modifiers cyan, Releases pink/red.
- **Inventory:** a character has a count per stone, edited by the GM or the sheet's owner; shown as
  "x3" beside stones with at least 1. Drafting shows all 12 and consumes nothing.
- **Editor:** stones are listed in one column on the right (Bases, Modifiers, Links, Releases). On the
  left an empty table with lanes in this order: Bases, Modifiers and Links, Releases, each with a slight
  tint (the middle lane a colour between the two). Base lane: one row of any width. Release lane: one
  stone. Modifier and Link lane: one stone per row; putting a stone on a row adds a new row below.
  Stones are joined by arrows that go to the same row or to a lower one (never back up toward the
  Bases). No stone may stay unconnected.
- **Legal scheme:** at least 1 Base and exactly 1 Release; every stone leads to the Release; a Link
  needs 2 or more incoming arrows (3 Bases into 1 Link is fine, 1 is not); two Bases can only be merged
  through a Link; the same stone type may be used several times (crafting then needs that many).
  Modifiers and Links are optional. An illegal scheme shows the concrete reason on save; it can still
  be saved as a **Spell Draft** and is marked with red "Illegal".
- **Notes:** double-tap a stone to give it a free text note. A stone with a note has a blue glow and a
  small "1" at its top right; a press shows the note in a pop-up tied to the "1"; double-tap edits it.
- **Spell Fine Tuning (decided):** a chain of **runes**, typed like text. The runes come from the rune reference PDF (61
  runes with a hand-drawn picture, a name and a category), ported as vector pictures drawn in the text colour. The
  categories are **Logic** (10), **Properties** (15), **Modifiers** (10), **Targeting & Geometry** (9), **Actions** (6)
  and **Elements & Essences** (11), plus a last special category **Spell Stones**: the twelve stones' symbols as
  additional runes (symbols only, not the physical stones). In the editor the player opens a category (one at a time,
  all closed at first) and sees its runes with their names; **tapping a rune appends it to the end of the chain**. The
  same rune can be used any number of times. The chain holds **at most 99** runes, runs **left to right on one line**
  and scrolls sideways only when it is wider than the screen. **Backspace** removes the last rune, tapping a rune in the
  chain selects it and **Remove selected** takes it out, **Clear** empties the chain after a confirmation; runes cannot
  be reordered. The chain is saved with the draft, shown (small) on the draft's card in the compendium, and **shown large
  in a panel under the description of a crafted spell**. A crafted spell **always follows the chain of its draft**
  (it keeps a link to the draft; an edit of the draft updates the spell; if the draft is deleted the spell keeps the
  last chain; a spell granted by the GM has no chain). The chain has no effect on the rules (no legality check). The old
  placeholder runes "1, 2, 3" were dropped: existing drafts start with an empty chain. With Spell Fine Tuning locked a
  player cannot change the chain and sees none (drafts and spells).
- **Compendium drawer:** all saved spells (drafts) with name, description and a visual snapshot of the
  scheme; filters: any number of stones of chosen Zodiacs used, and a search over names and
  descriptions. From it a spell can be **edited** (loaded into the editor) or **crafted**. The snapshot of the scheme on
  a draft's card shows the **blue note badge on the stones that have a note, and tapping such a stone shows its note
  right there** (any click closes it), without opening the editor. (decided)
- **Craft:** shows the needed stones and counts and the notes; only possible with enough stones. It
  spends the stones, adds a Created Spell, and makes a **Magic roll** (d20 + Magic Mastery +
  Experience Modifier) posted to the chat, against nothing, only for the GM to judge the crafter's skill.
- **Created Spells** (own sub-tab; the GM can also grant spells): name, description, an **icon**
  (picked from the damage type icons), an **Effect** that is an Enhancement or a Weapon (the player
  fills it in, the GM can edit), **Uses Remaining** (1/1, 5/5 if Taurus was used) and **Stabilization**
  (10 at first). Using a spell rolls a Magic roll against Stabilization: success +3 Stabilization,
  failure resets it to 10 and removes 1 use; at 0 uses the spell is destroyed (shown greyed out, readable,
  only deletable). The spell itself always works; the roll only decides durability. A GM-only toggle
  adds a **Spell tattoo** tag: no uses, still Stabilization, and the durability check is a Strength Save
  against it; success still adds +3, failure removes no uses but adds 1 stack of the new status
  **Blood Oxidization** (stackable (X) status; the blood becomes much more acidic, no automation).

**Stances tab.** A scrollable list of the 12 Zodiac signs (big sign image, name, a short vibe text).
Tapping one opens a skill-tree-like screen with the Zodiac's **base Stance** in the centre (globally
configurable by the GM). A Stance is a special Enhancement: only one per attack, and using it needs a
**Stance roll** (d20 + Stances Mastery + Experience Modifier). It is rolled automatically as its own chat
roll when Done is pressed, before the attack; its band's effects then apply to the attack.
- **Table of bands:** less than 10, 10-14, 15-19, 20-24, 25-29, 30 or more. Each band holds a
  combination of Roll Bonuses, Advantage/Disadvantage, Range, extra Damage, Statuses, Dice Roll Bonuses and
  Unique Effects. A band can be marked "-": the effect of the band above continues (drawn as one merged
  cell covering all its rows; several "-" in a row copy the last real effect).
- Default of every base Stance: a cumulative +1 roll bonus per band (+1 for less than 10, +2 for 10-14,
  and so on); the GM changes it by hand.
- The GM adds **variations** to the tree: circles with a Zodiac symbol joined by lines (base symbol
  white; the GM picks any RGB colour for a variation). Tapping a circle shows the name, description and
  table. Two GM toggles: **Character-Known** (characters have seen it: readable, shown greyed out and
  half transparent, not usable) and, once Known is on, **Learned** (the GM picks the PCs and NPCs that
  learned it: full colour, usable in attacks).

**Manifest tab.** Background in the Manifest colour; players can only read and choose. Two sub-sections:
- **Tarot Cards:** the character's cards (name, effect text); the current card has a golden frame; only
  one is chosen, and a **Swap Card** button changes it at any time. Text only for now (no mechanics).
  Cards are created inside a character only by the GM; only the GM sees **Transfer** (moves a card to
  another character).
- **Manifestations:** granted by gods, created only by the GM (text and description). A Manifestation
  is configured as a Weapon or as an Enhancement with all the rules above.

**Locked content.** The GM's general Arcane tab has a small lock button at the top right; it enters a
locking mode where clicking an already open tab (or an already visible part) locks it. Locks are
**global** and apply to **PCs only**: to a player a locked part is a heavily blurred picture with the text
"You have not learned what this means for now". The GM (and every NPC's sheet, which the GM controls)
sees everything, with a lock icon on what is locked. Lockable: the tabs (Magic, Stances, ...), and
inside them Tarot Cards, Manifestations, each Zodiac's Stances (a separate lock per Zodiac), Spell
Stones, Spell Combinations, Spell Fine Tuning.

**How the General tab is built (my defaults where you gave none, open to change):**
- **Where:** a **Sheet | Arcane** switch under the character's name (players and the GM on a character).
  The GM's general Arcane tab is **Arcane** in the top bar (`/arcane`); it lists the Enhancements for
  everyone (create, edit, delete). The draft (chosen weapon, Enhancements, Advantage, modifier) survives
  switching between Sheet and Arcane. The Arcane view uses the **whole width** of the screen (the rest of the
  sheet stays in a narrower column), and its footer holds the **Chat button** as its last button (Options, Done,
  Chat); elsewhere the chat button still floats at the bottom right.
- **Weapon roll:** default weapons and Unarmed roll d20 + the **Prime stat** (highest of the five stats) +
  the **Experience Modifier**, plus statuses, Advantage levels and Dice Roll Bonuses. Weapons of other tabs
  will use their own roll (Magic for spells, Manifest for Manifestations). The footer shows the total
  modifier ("d20 +N", extra dice, Advantage, AP). **Options** in the footer hold the extra Advantage levels
  and the custom modifier of the old Attack dialog.
- **Weapon item fields:** base damage, damage type, Defence (Physical or Mental), AP cost, Range (Spaces,
  empty = no range check), statuses added to targets that are hit, Dice Roll Bonuses, Unique Effects. Unarmed
  has the same fields (edit button in General). A weapon item has an amber tint and a "Weapon" tag in the Inventory.
- **Enhancement fields:** cost = AP, Damage taken (a type or True), statuses gained, Item (uses spent); effect =
  Damage (added to the weapon's damage **of the weapon's own type**), Range (added; a weapon with no range
  stays unchecked), **Advantage** levels (needed for Precise Attack, so it is an effect too), statuses added
  to targets, Dice Roll Bonuses, Unique Effects. Repeatable Enhancements have a counter (at most 10 per attack),
  Singular ones a Choose button. A character's own Enhancements are edited by the owner or the GM on the sheet;
  global ones only in the GM's general Arcane tab. Power Attack and Precise Attack are built in.
- **Costs are paid at Apply** (like AP): the attacker loses the AP, takes the damage cost through their own
  resistances, gains the cost statuses and loses the item uses; each is a chat line. A discarded card costs
  nothing. Statuses from the weapon and Enhancements go on the card's status list (editable by the GM).
  Unique Effects are posted in the chat when the attack is applied and shown on the card.
- **Range check:** measured between the centre squares of the two tokens (the Ruler's distance, diagonals
  alternating 1 and 2); with a height difference, Pythagoras (1 height = 1 Space) rounded to the nearest whole
  Space. If any target is farther than the range, a dialog warns and offers "Attack anyway".
- **Targets** are mirrored in General (the same selection as the Battle remote).

**How the Magic tab is built (answers and my defaults):**
- **Sub-tabs of Magic:** Stones, Editor, Spell Drafts (the compendium) and Created Spells. The spell being edited
  survives switching tabs.
- **Stones:** the count per sign lives on the sheet and is edited in Magic > Stones by the owner or the GM; the
  palette in the editor shows "xN" for signs with at least 1, but drafting never spends any. The editor lists the
  12 stones in a column at the right, by type; a tap on one adds it to the table (dragging it onto the table
  works too on a computer). Rings: Base purple, Modifier cyan, Link dark blue, Release pink.
- **Table:** Bases side by side in one row that grows sideways, one Modifier or Link to a row (an empty row is
  always left under the last one), one Release at the bottom; lanes are tinted (Modifiers and Links blue between
  the two). **Arrows:** tap a stone, then another stone, to draw an arrow (again to remove it); a stone can be
  removed from the bar that appears. Double tap: write a note (glow, "1" badge, a tap shows the note, and the
  shown note **closes on any click on anything**).
- **Legal scheme (decided):** at least 1 Base, exactly 1 Release; a Base takes no arrow in; a **Modifier exactly
  1** in; a **Link 2 or more** in; the **Release exactly 1** in and none out; **every other stone exactly 1 arrow
  out** (so the scheme is a tree ending at the Release); arrows only go **down** (to a later row), never up or
  sideways. The reason for each broken rule is listed live; an illegal draft can be saved (marked "Illegal") but not crafted.
- **Craft:** shows the needed stones (needs / you have), the stones' notes, spends the stones and adds the spell
  (5 uses if Taurus is in the scheme, else 1; Stabilization 10; icon Fire and a default weapon effect until the
  player fills it in). It posts a Magic roll (d20 + Magic + Experience) titled "Spell crafting" and a chat line.
- **Created spells:** name, description, damage type **icon** (twelve plain placeholder glyphs drawn in the app, to be
  swapped for real art), effect (Weapon or Enhancement, edited by the owner; the GM also sets uses, Stabilization
  and the **Spell tattoo** tag), uses, Stabilization. A weapon spell is chosen with "Use as weapon" (it rolls the
  **Magic Mastery**: d20 + Magic + Experience) and an Enhancement spell with "Add to attack". A destroyed spell is
  greyed out and can only be deleted (the GM can also edit it).
- **Durability at Apply:** when the GM applies an attack that used a spell, the attacker makes a Magic roll against
  its Stabilization (posted as a roll card): success +3; failure resets it to 10 and removes 1 use, and at 0 uses
  the spell is destroyed. A **Spell tattoo** has no uses: it uses a Strength Save; success +3; failure resets
  Stabilization and adds 1 stack of the new status **Blood Oxidization** (stackable, not automated).

**How the Stances tab is built (answers and my defaults):**
- **List:** twelve entries, one per sign: a big glyph in the base Stance's colour, the name and a "vibe" text. The
  default vibe texts are my short drafts (English and Russian in `LOCALIZATION.md`); the GM can replace one with
  **Edit vibe** (a replaced text is the GM's own and is not translated). The list looks the same in the GM's general
  Arcane tab and on a character's Arcane tab.
- **Tree:** a tap on a sign opens the tree: the base Stance in the centre and its variations in rings around it, laid
  out automatically (each variation has exactly **one parent**, the base or another variation). A circle shows the sign
  in the Stance's colour (the base is white until the GM changes it; a variation can be any RGB colour). Tapping a
  circle shows its name, description and table.
- **Access (decided):** **every Stance, the base ones too, must be Learned** by a character before it can be used in
  an attack. The GM has two toggles per Stance: **Character-Known** (characters have seen it and can read it; shown
  greyed out and half transparent) and, when Known is on, **Learned** with a list of PCs and NPCs. A base Stance is
  Known from the start, a new variation is not (my default). A Stance that is neither Known nor Learned by the
  viewer's character is hidden from players; the list of who learned it is only the GM's. On a character's tab (the
  GM sees it too) a Stance that character has not learned is greyed out.
- **Table:** six bands: Less than 10, 10-14, 15-19, 20-24, 25-29, 30 or more. Each holds an effect: roll bonus,
  Advantage, Range, extra Damage, statuses (added to targets that are hit), Dice Roll Bonuses and Unique Effects, like an
  Enhancement. A band can be "-": the band above still applies, drawn as one merged cell. A base Stance starts with a
  cumulative +1 roll bonus per band (+1 to +6); the GM edits every table.
- **Cost (decided):** every Stance has its own **Cost**, set by the GM **per unique Stance** (a base Stance and each
  variation separately), never for a whole Zodiac. It is the same pool as an Enhancement's cost: **AP**, **damage taken**
  by the user, **statuses gained** by the user (an item cost is not offered, because a Stance is global and an item belongs
  to one character). The default is no cost. The Cost is part of the attack from the start: it is added to the AP total
  (so the attack is blocked without the AP), shown in the Stance's card, and **paid when the attack is applied**, exactly
  like Enhancement costs (journal and Revert included). `Stance.cost` has the Enhancement's `cost` shape.
- **Using it:** **Use in attack** (a tap again removes it) puts it in the footer; only one Stance per attack. When Done is
  pressed the Stance roll (d20 + Stances Mastery + Experience Modifier) is made first, as its own roll card, then the
  band's effect joins the attack (its roll bonus is a term of the attack roll) and the GM's card shows the Stance and
  the band. A Stance costs only what its Cost says. The out-of-range warning ignores what the band adds to
  the range, and the Stance is only rolled once the attack is sure to go ahead.
**How the Manifest tab is built (answers and my defaults):**
- **Look:** a gold background. Two sub-sections, **Tarot Cards** and **Manifestations**. Nothing is editable by a
  player: they read and make the choices below; the GM makes everything.
- **Tarot Cards:** the character's cards with name and effect text; the active card has a golden frame and glow; only
  one is active (the first card added becomes active). **Swap Card** (a dialog listing the cards) changes it, for the
  player too and at any time; a card has no mechanics yet (text only). Only the GM adds, edits, deletes and sees
  **Transfer** (moves a card to another character; the receiver gets it as a new card, active if it has none).
- **Manifestations:** a name, a description and an effect that is a **Weapon or an Enhancement**, set up exactly like a
  spell's. A Manifestation weapon rolls the **Manifest Mastery** (d20 + Manifest + Experience Modifier); a Manifestation
  Enhancement joins any attack. They have no uses or durability of their own (decided): only what their Weapon or
  Enhancement costs. They are chosen with **Use as weapon** or **Add to attack**.

**How the Locks are built (answers and my defaults):**
- **Locking mode:** in the GM's general Arcane tab (no character) a lock button at the top right turns locking mode
  on. Then a tap on the **tab that is already open** locks or unlocks it (General cannot be locked), and a tap on a
  **part** toggles its lock: in the Stances list a tap on a sign (instead of opening it), and in the general Magic and
  Manifest tabs the tiles Spell Stones, Spell Combinations, Spell Fine Tuning, Tarot Cards and Manifestations.
- **What each covers:** a locked tab covers everything in it. Spell Stones = the Stones sub-tab; Spell Combinations =
  the Editor and Spell Drafts (crafting too); Spell Fine Tuning = the rune chain (a locked one keeps the chain where it was and shows none); Tarot
  Cards and Manifestations = their sub-sections; Stances have one lock per Zodiac. Created Spells stay visible unless the whole Magic tab is locked.
- **Who:** one setting for everyone, applied to **player characters only**. The GM (and NPC sheets, which are the GM's)
  sees everything with a small lock on what is locked. A player sees a heavily blurred picture with "You have not
  learned what this means for now" in place of the part.
- **Enforced by the server too (decided):** the data sent to players leaves out what is locked (the sheet's stones,
  drafts, spells, Tarot Cards and Manifestations, and a locked Zodiac's Stances), and a player's actions on locked
  things are refused with `locked`: attacks with a locked spell, Manifestation or Stance, crafting, changing stones,
  drafts or spells, swapping the Tarot Card. The GM is never held back. Changing a lock re-sends the players' sheets.

**Build order (four PRs, each playtestable):** (1) General tab and the footer attack flow (weapon toggle,
Unarmed Attack, Enhancements, range check, Stance-less attack from the footer, replaces the sheet's
Attack); (2) Magic (stones, editor, drafts, compendium, craft, Created Spells, tattoos); (3) Stances;
(4) Manifest and Locks.

### Game data (planned)
Base building blocks (Zodiacs, Tarrot cards and effects, spontaneous-casting tables keyed by
parameters, sheet schema, classes, items) are hard-coded in the repo as data files. Character-local
combinations and calculations live in Turso. (decided)

### Images (implemented in Phase 4a)
Stored in Turso and served as immutable, cacheable URLs (`GET /api/images/:id`). Ids are random, so
a hidden character's picture cannot be guessed. The browser resizes and re-encodes every upload
before sending it (`client/src/lib/image.js`): backgrounds fit 1920x1200 as JPEG; character art
fits 1200x1400 and keeps transparency as WebP, or PNG on browsers that cannot encode WebP (Safari).
The server accepts PNG, JPEG or WebP (checked by their first bytes) up to 3 MB and never decodes
them. Uploads travel over the socket so the sender's permission is checked; the socket limit is
5 MB. Images nothing points to any more are deleted. These limits are my defaults; tell me if you
want different ones. (decided by me, open to change)

## Data model

Implemented:
- `meta(key, value)`: Phase 1 placeholder.
- `character_folders(id, parent_id, name, created_at)`: nested tree, shared by PCs and NPCs.
- `characters(id, name, type 'pc'|'npc', folder_id, sheet, created_at)`. Names are 1 to 60
  characters after trimming and need not be unique. `sheet` is one JSON document per character.
  It is added to existing databases at boot (`initSchema` checks `PRAGMA table_info`).
- **Sheet JSON** (`server/sheet.js`): `ap {current, minion}`, `hp {current, max, temp}`,
  `defence {physical, mental}`, `experience`, `stats`, `xDefence` (four stats, no Luck),
  `masteries` (magic, stances, manifestation), `skills` (tier 0-10 per skill), `features`,
  `items` (`id, name, description, uses {current, max}, states[], state, weapon`; `weapon` is `null` or
  `{ base, kind, defence, ap, range, statuses, dice, unique }`), `unarmed` (a weapon: 0 Bludgeoning),
  `enhancements` (the character's own, see Arcane tab), `helpDice` (list of sides, up to 5), `stones` (count per sign), `spellDrafts`
  (`id, name, description, scheme { stones: [{ id, sign, note }], arrows: [{ from, to }] }, runes` (rune ids, at most 99, see `shared/runes.js`; Spell Stone runes are `stone_<sign>`)), `spells`
  (`id, name, description, draftId, runes, icon, effect { kind: 'weapon' | 'enhancement', ... }, uses {current, max}, stabilization,
  tattoo, destroyed`), `tarot` (`{ cards: [{ id, name, description }], active }`), `manifestations` (`id, name,
  description, effect` like a spell's), `resistances`
  (per damage type), `statuses` (key to stacks), `effects` (running Effects: `id, defId, name, description, icon, duration, rounds?, uses { current, max } | null, parts, source`) and
  `effectDefs` (the character's own Effect library: `id, name, description, icon, duration, uses, parts`). Every read and write passes through
  `normalizeSheet`, which fills defaults and clamps, so new fields never need a migration.
  Ranges: stats -2 to 7, masteries 1 to 10, Experience 1 to 10, item max uses 1 to 100.
- The chat log and pending trade offers are not in the database (server memory only).
- SQLite does not enforce foreign keys by default, so relationship rules are enforced in
  `server/roster.js`: a folder cannot move inside itself or a descendant, and only an empty folder
  (no subfolders, no characters) can be deleted. Character deletion is permanent and requires
  the exact name.

- `effect_defs(id, data, position)` (the global Effects) and `basic_actions(id, data, position)` (the Basic Actions); the shipped ones are put in once (a `meta` row remembers it).
- `images(id, mime, data, bytes)`: random 32-hex id, stored as a BLOB.
- `scene_folders`, `scenes(id, name, folder_id, scene_image_id, battle_image_id)` (the Battle
  image is used from Phase 5), `scene_state(id = 1, active_scene_id)`.
- `temp_npc_folders`, `temp_npcs(id, name, folder_id)`.
- `pictures(id, character_id | temp_npc_id, image_id, name, position)`: exactly one owner.
- `stage_summons(id, scene_id, character_id | temp_npc_id, picture_id, position, scale, hidden, pos_x,
  pos_y)`. A character or temp NPC appears once per scene. `pos_x`/`pos_y` (null until dragged) are
  the figure's spot on the scene picture; `position` is the stacking order. Side (PCs left, everyone
  else right) only decides the entry slot.
- Deleting a character, temp NPC, scene or picture removes what depended on it by code, and
  deletes images that nothing uses.

- `audio_playlists(id, name, position)` and `audio_tracks(id, playlist_id, youtube_id, name,
  duration_ms, position)`. Deleting a playlist deletes its tracks by code. What is playing is not in
  the database (server memory).

Battle (Phase 5a):
- `scenes` gains `battle_aspect` (picture width / height), `grid_cell`, `grid_ox`, `grid_oy`
  (fractions of the picture; the shifts may be negative), `show_grid` (1 shown, 0 hidden, for everybody); `scene_state.mode` ('scene' | 'battle'); `temp_npcs` gains `is_prop`
  and `size`.
- `battle_tokens(id, scene_id, character_id | temp_npc_id, picture_id, col, row, hidden, bank, height)`:
  one token per owner per scene; `height` is the Spaces in the air; `bank` is the leftover Movement squares. Tokens keep whole-square
  positions and are clamped back onto the map when the grid changes.
- `battle_marks(id, scene_id, kind 'draw' | 'template', data JSON)` (a template's data has `shape`, `x`, `y`, `size`, `angle`, `color` and its number `n`).
- Sheet JSON gains `movement` (0 to 99, default 5) and `size` (1 to 6, default 1).
- Targets and the combat state are server memory only (`shared.targets`, `shared.combat`; see the Combat tracker).

Planned (not final): character-local spells.

## Real-time events

All client-to-server events use an ack of the form `{ ok: true, ... }` or
`{ ok: false, code, error }`.

Implemented:

- `ping:check`: replies `{ ok: true, echo }`. Connectivity check.
- `lang:set` `{ lang: 'en' | 'ru' }`: the language of this socket; error texts in acks and (for the
  client) chat lines are written in it. Unknown languages are ignored. Errors are `{ ok: false, code, error }`
  with `error` already in that language; chat text lines carry `{ text (English), key, params }`.
- `identity:set` `{ role: 'gm' }` or `{ role: 'player', characterId }`: any socket. Fails with
  code `gone` if the character does not exist or is an NPC.
- `identity:clear`: drops identity and GM rights.
- `roster:get` (GM): `{ roster: { folders, characters } }`.
- `character:create` `{ name, type, folderId? }`, `character:rename` `{ id, name }`,
  `character:move` `{ id, folderId }`, `character:delete` `{ id, confirmName }` (all GM only).
- `folder:create` `{ name, parentId? }`, `folder:rename` `{ id, name }`,
  `folder:move` `{ id, parentId }`, `folder:delete` `{ id }` (all GM only).
- `sheet:get` `{ characterId }` returns `{ character, sheet }`. `sheet:set` `{ characterId, path,
  value }` sets one field (paths such as `stats.dexterity`, `hp.max`, `statuses.bleeding`,
  `resistances.fire`). `sheet:list` `{ characterId, list: 'features'|'items'|'enhancements'|'spellDrafts'|'helpDice', action: 'add'|
  'update'|'remove'|'copy'|'use', ... }` (`helpDice` takes `add` `{ sides }` and `remove` `{ index }`; items take an optional `weapon`, Enhancements an `enhancement`, drafts a `draft`); `sheet:set` also takes
  `unarmed` and `stones.<sign>`. Allowed for the GM, or for a player on their own PC only.
- `roll:make` `{ characterId, kind: 'attribute'|'save'|'skill', key, mode?, modifier?, help? }` (`help`: places in the character's Help Dice track to spend) rolls on
  the server from the stored sheet and posts to the chat. Same permission as editing.
- `chat:get` returns `{ messages }`; `chat:send` `{ text }`; `chat:clear` (GM only). Need an
  identity.
- `item:transfer` `{ fromId, toId, itemId }` (GM only, immediate). `trade:offer` `{ fromId, toId,
  itemId }` (players only, recipient must be another PC). `trade:respond` `{ offerId, accept }`
  (only the receiving player).
- Error codes: `forbidden`, `bad_name`, `bad_type`, `bad_id`, `bad_value`, `bad_path`,
  `bad_action`, `bad_list`, `bad_roll`, `bad_text`, `bad_transfer`, `npc_only`, `no_uses`, `limit`,
  `not_found`, `cycle`, `not_empty`, `confirm_mismatch`, `gone`, `server_error`.
- Server to clients: `pcs:updated` `[{ id, name }]` to everyone; `roster:updated`
  `{ folders, characters }` to the GM room only; `identity:revoked` `{ characterId, name }` to the
  sockets playing a deleted character; `sheet:updated` `{ characterId, sheet }` to the GM and the
  PC's own devices; `chat:message`, `chat:updated` and `chat:cleared` to everyone identified; `trade:offered`
  `{ offerId, fromName, itemName, toId }` to the recipient's devices and `trade:resolved` `{
  offerId, accepted, itemName, fromName, toName }` to both sides.

Scenes and the stage (Phase 4a). Owners are `{ characterId }` or `{ tempNpcId }`:
- `identity:set` also accepts `{ role: 'display' }`.
- `library:get` (GM) returns `{ library: { sceneFolders, scenes, tempNpcFolders, tempNpcs } }`;
  `library:updated` pushes it to the GM after any change.
- `stage:get` returns `{ stage: { scene: { id, name, imageId } | null, summons: [{ id, ownerKind,
  ownerId, name, side, pictureId, imageId, scale, hidden }] } }`, hidden summons removed unless the
  caller is the GM. `stage:updated` pushes it: the full stage to the GM room, the filtered stage to
  the `view` room (players and Displays).
- GM only: `scene:create` `{ name, folderId?, data? }`, `scene:rename`, `scene:move`,
  `scene:set_image` `{ id, data }`, `scene:delete`, `scene:activate` `{ id | null }`,
  `scene_folder:*` and `temp_npc_folder:*` (create, rename, move, delete), `temp_npc:*` (create,
  rename, move, delete), `stage:update` `{ id, pictureId?, scale?, hidden? }` (GM and Display).
- `picture:list`, `picture:add` `{ owner, name, data }`, `picture:rename`, `picture:delete`: the GM
  for anyone; a player for their own PC only. `pictures:updated` goes to the GM and the owner.
- `stage:summon` `{ owner, pictureId? }` and `stage:dismiss` `{ id }`: the GM for anyone; a player
  for their own PC only. `stage:move` `{ id, x, y }` or `{ id, reset: true }`: the GM, the Display, or a player for their own PC (x and y between -1 and 2, fractions of the scene picture; the figure comes to the front). Summons in `stage` carry `x`, `y` (null when never dragged), `side` and `slot`.
- Display sockets get no chat, sheets, roster or rolls.
- Error codes added: `no_scene`, `no_picture`, `already_on_stage`, `bad_image`, `image_too_large`.

Music (Phase 4b):
- `audio:ping` `{ t0 }` (anyone) returns `{ t0, serverMs }` for clock alignment.
- `audio:listen` `{ on }`: GM and Display only; returns `{ state }` and joins or leaves the `audio`
  room. `audio:state` `{ trackId, youtubeId, name, playlistId, durationMs, isPlaying, positionMs,
  anchoredAtMs, anchorId, repeatMode, shuffle, serverMs }` goes to that room on every change.
- From listeners: `audio:track_ended` `{ trackId, anchorId }`, `audio:duration` `{ trackId,
  durationMs }`, `audio:error` `{ trackId, anchorId, code }`. Ignored from sockets that are not
  listening or that carry an old anchor.
- GM only: `audio:play` `{ trackId }`, `audio:pause`, `audio:resume`, `audio:stop`, `audio:seek`
  `{ positionMs }`, `audio:next`, `audio:previous`, `audio:set_mode` `{ repeatMode?, shuffle? }`,
  `audio:lookup_title` `{ url }`, `music:get`, `playlist:create | rename | delete`,
  `track:create` `{ playlistId, url, name? }`, `track:rename | delete`, `track:reorder`
  `{ playlistId, ids }` (the full order). `music:updated` `{ playlists }` goes to the GM room;
  `audio:track_unplayable` `{ trackId, name, code }` tells the GM a track was skipped.
- Error codes added: `not_youtube`.

Battle (Phase 5a):
- `stage:get` / `stage:updated` now carry `{ scene, summons, mode, battle }`, where `battle` is
  `{ imageId, aspect, grid: { cell, ox, oy }, showGrid, cols, rows, tokens: [{ id, ownerKind, ownerId, name,
  pictureId, imageId, col, row, size, hidden, prop, bank, targetedBy }], marks, targetId? }`; hidden
  tokens are removed for everyone but the GM. A change to a sheet's `size` re-broadcasts the stage.
- GM only: `battle:mode` `{ mode }`, `scene:set_battle_image` `{ id, data, aspect }`,
  `scene:set_grid` `{ id, cell, ox, oy }`, `battle:add` `{ owner, pictureId? }`, `battle:remove`
  `{ id }` (GM and Display), `battle:update` `{ id, pictureId?, hidden?, height? }` (GM and Display; a player only `height`, for their own PC), `battle:clear_bank` `{ id }`,
  `temp_npc:set_size` `{ id, size }`.
- GM and Display: `scene:show_grid` `{ id, show }` (saved per scene, everybody follows).
- GM and Display (`battle:place`: also a player, for their own PC): `battle:place` `{ id, col, row }` (free drag), `mark:add` `{ kind, data }`,
  `mark:remove` `{ id }`, `mark:clear` `{ kind? }` (Clean), `mark:erase` `{ x, y, r }` (the eraser: picture
  fractions and a radius in picture widths; splits the drawings it cuts), `battle:ping` `{ x, y }` (picture fractions) which goes to everyone as
  `battle:pinged`.
- `combat:*`: `combat:start` (GM), `combat:roll` `{ tokenId }` (the GM, or a player for their own PC,
  once), `combat:roll_npcs` (GM), `combat:set_initiative` `{ tokenId, value }` (GM), `combat:begin`
  (GM), `combat:next` `{ tokenId? }` (the GM, or the player whose turn it is; a `tokenId` that is no
  longer the active one is refused as `stale`), `combat:reorder` `{ ids }` (the full order, GM),
  `combat:add` and `combat:remove` `{ tokenId }` (GM), `combat:end` (GM). The state arrives in
  `stage.battle.combat` = `{ phase: 'rolling' | 'active', round, activeTokenId, order: [{ tokenId,
  ownerKind, ownerId, name, imageId, kind, initiative }] }` (`null` when there is no combat).
  Turn announcements are chat lines from "Combat"; the effects at the start of a turn are an effect card (see Chat log). New error codes: `no_combat`,
  `no_combatants`, `combat_running`, `bad_phase`, `bad_order`, `already_rolled`,
  `already_in_combat`, `stale`.
- Locks: `lock:list` returns `{ locks: [key] }` (anyone); GM only: `lock:toggle` `{ key }` flips one and everyone gets
  `locks:changed` `{ locks }`; the players' sheets are sent again. Keys: `tab:magic`, `tab:stances`, `tab:manifest`,
  `stones`, `combinations`, `fine_tuning`, `tarot`, `manifestations`, `stances:<sign>`. Stored in the table
  `arcane_locks`. Error code `locked`.
- Manifest (GM only unless noted; `characterId` is the character): `tarot:add` `{ card }`, `tarot:update` `{ id, card }`,
  `tarot:remove` `{ id }`, `tarot:swap` `{ id }` (the owner may too), `tarot:transfer` `{ fromId, toId, id }`,
  `manifestation:add` `{ manifestation }`, `manifestation:update` `{ id, manifestation }`, `manifestation:remove` `{ id }`.
- Stances: `stance:list` returns `{ vibes, stances }` (the GM gets every Stance with its `learned` list; a player only
  those their character knows or has learned, each with `usable`, and no `learned` list). GM only: `stance:save`
  `{ id, stance }` (change; a base Stance is stored on its first change) or `{ sign, parentId, stance }` (add a
  variation), `stance:delete` `{ id }` (a variation and everything hanging from it) and `stance:vibe` `{ sign, vibe }`.
  A Stance is `{ id, sign, parentId, name, description, color, known, learned: [characterId], cost: { ap, damage, statuses, item }, table: [6 rows] }`; a
  row is `{ same: true }` or `{ same: false, effect: { bonus, advantage, range, damage, statuses, dice, unique } }`.
  Every change is followed by `stances:changed` to all clients. Stored in the tables `stances` and `stance_vibes`.
- Effects: `effect:library` returns `{ effects }` (the global ones; `effect:library` is sent again to everyone after every change), GM only
  `effect:save` `{ id?, effect }` and `effect:delete` `{ id }`; `effect:give` `{ characterId, effectId }` (an Effect from the global or the
  character's own library onto a character: the GM on anyone, a player on their own PC; posts a card with Revert) and `effect:remove`
  `{ characterId, id }` (by hand). The character's own library is edited with `sheet:list` `{ list: 'effectDefs', action, id?, effect? }`.
  A weapon, an Enhancement's `effect`, a band's `effect` and `spontaneous:do`'s `effects.effect` `{ id, to }` carry references to Effects; the
  pending attack has `effectGrants: [{ def, to }]`, `critThreshold` and the damage already changed by the attacker's Effects; tokens in the
  stage carry `statuses: [{ key, stacks }]` and `effects: [{ id, name, icon }]` for their icons (the stage is sent again when they change).
- Basic Actions: `basic:list` returns `{ actions }` (`basic:actions` is sent again after every change), GM only `basic:save` `{ id?, action }` and
  `basic:delete` `{ id }`; `basic:use` `{ characterId, actionId }` (the GM, or the player of the character) does the action at once.
- Spontaneous Action (GM only): `spontaneous:do` `{ characterId, ap: 1|2, roll: 'weapon'|'magic'|'stances'|'manifestation', defence, help?, effects: { damage?: { amount, kind }, help?: { sides }, status?: { key, stacks }, temp?: { value }, effect?: { id, to } } }`: replies `{ instant: true }` (Help Die and Temp HP only, given at once) or sends `attack:pending` like an attack. `combat:roll` also takes `help`.
- Spells: `spell:craft` `{ characterId, draftId }` (spends the stones, posts a Magic roll and a chat line, adds the
  spell; errors `illegal`, `not_enough_stones`), `spell:update` `{ characterId, id, patch }` (the owner: name, description,
  icon, effect; the GM also `uses`, `stabilization`, `tattoo`), `spell:grant` `{ characterId, spell }` (GM only),
  `spell:remove` `{ characterId, id }`. Same permission as editing the sheet.
- Attacks: `attack:roll` `{ characterId, help?, weapon: { kind: 'unarmed' } | { kind: 'item', itemId } | { kind: 'spell', spellId } | { kind: 'manifestation', manifestationId }, stance?, enhancements: [{ id, count }], advantage?, modifier?, confirmRange? }`
  (the GM, or a player for their own PC) works out the attack with `planAttack`, rolls it, posts the roll in the chat and
  sends `attack:pending` `{ id, characterId, characterName, attackerTokenId, weaponName, enhancements, ap, base, kind, statuses, unique, costs,
  defenceKind, roll, targets }` to the GM room. When a target is out of the weapon's range and `confirmRange` is not true it
  only answers `{ needsConfirm: { range, targets: [{ name, distance }] } }`. `arcane:enhancements` returns
  `{ enhancements }` (the global ones; `arcane:enhancements` is also broadcast on every change); GM only:
  `arcane:enhancement:save` `{ id?, enhancement }` and `arcane:enhancement:delete` `{ id }`. GM only: `attack:list` `{ attacks }`, `attack:targets` `{ tokenIds }` (name, Defences,
  resistances and HP of each), `attack:apply` `{ id, total, base, kind, ap, statuses: [{ key, stacks }] }` and
  `attack:cancel` `{ id }`; both send `attack:resolved` `{ id }` to the GM room; GM only: `attack:advantage` `{ id, levels }`
  (levels -10..10, not 0: re-rolls the final d20 as described above, posts a roll card and sends the updated `attack:pending`),
  `effects:revert` `{ messageId }` and `effects:edit` `{ messageId }` (the latter reopens the attack as a new pending card and
  answers `{ attackId }`). An effect card is the chat message `{ type: 'effects', kind: 'attack' | 'spontaneous' | 'turn' | 'craft',
  title?, blocks: [{ name, rows: [{ key, params }] }], text, status: 'applied' | 'reverted' | 'replaced', reversible, editable }`;
  parameters of its rows can carry a category: `{ t, c }`, `{ v, c }` or `{ key, params, c }`. A change to a card is sent as
  `chat:updated` (the whole message) to everyone in the chat. New error codes: `already_reverted`, `cannot_revert`. Pending attacks live in
  server memory (at most 30). The roll posted in the chat carries `roll.against` = `{ label, targets: [{ name,
  value }] }` (the numbers to beat). New error codes: `no_ap`, `no_target`. The rules code is in `shared/damage.js` (used by the server and by the
  card's live preview) and `shared/templates.js` (which tokens are inside an area).
- `battle:move` `{ tokenId, dc, dr, free?, confirmAp? }`: one D-pad step by the GM or the
  player who owns the token; replies with the new position, or asks for confirmation when the step
  needs AP. `battle:target` `{ characterId, tokenId | null }`: toggles a token in the selected targets of a PC
  (the GM or that PC's player), or clears all targets (tokens and areas) with `null`; `mark:update` `{ id, x?, y?, angle? }` (GM and Display) moves or turns an area. `battle:target_area` `{ characterId,
  markId | null }` toggles an area the same way (`null` clears the area picks). Area marks in `stage.battle.marks` carry
  `n` (their number) and `targetedBy` (the characters that picked them). `settings:force` `{ key, value }` (GM only) is
  relayed to every socket as `setting:forced` `{ key, value }`. Statuses: `status:add` `{ characterId, key, stacks?, duration?, dc? }`
  adds a status by hand (no Save; Repeated needs a Save and a number `dc`) and returns `{ sheet }`. A status that needs a Save
  asks the player with `save:ask` `{ id, characterId, name, kind: 'apply' | 'repeated', apply: { key, stacks, duration }, save, dc,
  source, net, sources, expression, apMax }` (to the PC's devices; `save:pending` with the same data to the GM) and `save:resolved`
  `{ id }` when it is answered; `save:answer` `{ id, ap }` answers (the character's player, or the GM who rolls for them with no
  AP), `save:list` returns the `{ saves }` waiting for me. The statuses of `attack:apply` and of a Spontaneous Action's
  `effects.status` are `{ key, stacks, duration, dc: 'auto' | number }`.

HTTP: `GET /api/pcs` returns `[{ id, name }]` (PCs only) for the picker. `GET /api/images/:id`
serves an image with a one-year immutable cache header.

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
3. **Character sheet and chat** (implemented, awaiting playtest): the full sheet described above,
   server-side rolls with the breakdown card, the global chat log, item copy and trading.
   Check: on a phone, edit stats, roll a skill, see the breakdown in the chat on the GM's screen;
   trade an item between two players; GM clears the chat. Covered by `server/test/sheet.test.js`,
   `rolls.test.js`, `sheetSockets.test.js`, `rulesData.test.js` and `e2e/sheet.spec.js`.
   The layout is a single column that works on phone and desktop; a dedicated wide desktop layout
   is not built yet.
4. **Scene and Music**, split in two parts, each playtested on its own:
   - **4a Scenes** (implemented, awaiting playtest): image pipeline, scenes and folders, temp NPCs,
     pictures, stage with summoning, Hidden with the token menu, Display Screen, desktop and
     mobile GM views. Check: build a scene, summon PCs and NPCs, watch it on a Display in another
     window, hide and reveal, drag figures anywhere from the Display, join and leave from a phone.
     Covered by `server/test/sceneSockets.test.js` and `e2e/scene.spec.js`.
   - **4b Music** (implemented, awaiting playtest): YouTube playlists and player for the GM on
     desktop, synced playback on the Display, the music bar, volume. Check: add a playlist with two
     YouTube links, play, see and hear it on the Display, pause and skip, right-click the bar on
     the Display for volume, reload the Display mid-song. Covered by `server/test/audio.test.js`
     and `e2e/music.spec.js`; real sound needs your playtest.
5. **Battle**, split in two parts:
   - **5a Map** (implemented, awaiting playtest): Battle mode toggle, battle map and live grid,
     tokens with sizes and props, free dragging, D-pad remote with Movement banking and AP,
     targeting, drawing, areas, pings, ruler, Hidden. Covered by `server/test/battle.test.js` and
     `e2e/battle.spec.js`. Scene, music and battle playtests are done in one later batch.
   - **5b Combat tracker** (implemented, playtested): initiative rolled by the players,
     one sorted list, rounds, Next turn and End turn, Movement costs on your own turn, turn-start
     effects. Covered by `server/test/combat.test.js` and the combat test in `e2e/battle.spec.js`.
6. **Mechanics and Arcane**, split in two parts:
   - **6a Attacks** (implemented, awaiting playtest): Combat Mastery attack rolls from the Battle
     remote, the GM confirm card (editable numbers, several targets, areas), Hit Severity, damage
     through resistances, statuses, AP. Covered by `server/test/attack.test.js` and the attack test in
     `e2e/battle.spec.js`.
   - **6b Arcane** (rules received, see Arcane tab; four PRs: General and footer attack flow (implemented,
     awaiting playtest), Magic (implemented, awaiting playtest), Stances (implemented, awaiting playtest), Manifest and
     Locks (implemented, awaiting playtest)). Covered by `server/test/attack.test.js`, `spells.test.js`, `stances.test.js`,
     `manifest.test.js` and the arcane, magic, stances and manifest specs in `e2e/`.
7. **Settings and Russian** (implemented, added after the playtest): Settings on the picker with a
   language selector, the whole app in English and Russian, and `LOCALIZATION.md`. Covered by
   `server/test/localization.test.js` and `e2e/language.spec.js`.

## Open questions

Asked one batch at a time; answers move into the sections above.

Answered after the second playtest (all recorded above): no extra magic automation (spell effects are entered by
hand), statuses affect Stance and Manifest rolls but never Magic rolls, everything is measured in Spaces, no sound
effects and the music bar is always shown, the Phase 4a image limits stay, there is no phone app (the phone web
client is enough), no backups or export of characters, and animation and the final look come at the end, when
every feature is done. "Undo of applied results" became **Revert and Edit on effect cards** (see Chat log).

Nothing is open at the moment.
