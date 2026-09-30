/* global document */
import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

const desktop = (browser) => browser.newContext({ viewport: { width: 1280, height: 800 } });
const phone = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Pictures drawn in the browser so the tests need no image files: a 2:1 map and a token face.
async function art(page, kind) {
  const b64 = await page.evaluate((kind) => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (kind === 'map') {
      c.width = 1200;
      c.height = 600;
      ctx.fillStyle = '#3b6b3b';
      ctx.fillRect(0, 0, 1200, 600);
    } else {
      c.width = 200;
      c.height = 200;
      ctx.fillStyle = '#e0a030';
      ctx.beginPath();
      ctx.arc(100, 100, 90, 0, 7);
      ctx.fill();
    }
    return c.toDataURL('image/png').split(',')[1];
  }, kind);
  return { name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function open(context, role) {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId(role).click();
  return page;
}

async function createCharacter(gm, name, type) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: type, exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

// Creates a scene with a battle map, makes it active, switches to Battle and sets a 10 x 5 grid.
async function battleScene(gm, name) {
  await gm.getByTestId('nav-scene').click();
  await gm.getByTestId('open-scenes').click();
  await gm.getByTestId('new-scene').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  const row = gm.getByTestId('scene-row').filter({ hasText: name });
  await row.getByRole('button').first().click();
  await row.getByTestId('battle-map-button').click();
  await gm.getByTestId('battle-file').setInputFiles(await art(gm, 'map'));
  await gm.getByRole('button', { name: 'Upload' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await row.getByTestId('activate-scene').click();
  await gm.getByTestId('scenes-drawer').getByRole('button', { name: 'Close' }).click();
  await gm.getByTestId('mode-battle').click();
  await expect(gm.getByTestId('battle-map')).toBeVisible();
  await gm.getByTestId('open-grid').click();
  await gm.getByTestId('grid-cell').fill('0.1');
  await expect(gm.getByTestId('grid-size')).toContainText('10 x 5 squares');
  await gm.getByTestId('grid-panel').getByRole('button', { name: 'Close' }).click();
}

// Gives a character a picture and puts its token on the map.
async function placeToken(gm, name) {
  await gm.getByTestId('open-cast').click();
  await gm.getByPlaceholder('Search').fill(name);
  const row = gm.getByTestId('cast-row').filter({ has: gm.locator(`text="${name}"`) });
  await row.getByTestId('cast-pictures').click();
  await gm.getByTestId('picture-file').setInputFiles(await art(gm, 'face'));
  await expect(gm.getByTestId('picture')).toHaveCount(1);
  await gm.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await row.getByTestId('summon-cast').click(); // "Place token" in Battle mode
  await expect(row.getByTestId('dismiss-cast')).toContainText('Remove token');
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
}

const token = (page, name) => page.getByTestId('battle-token').filter({ has: page.getByText(name, { exact: true }) });

test('the GM sets up a battle map with a grid; the Display and players see tokens on it', async ({ browser }) => {
  const pc = `Aria-${uid()}`;
  const npc = `Ogre-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Field-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, npc);

  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(tv.getByTestId('battle-map')).toBeVisible();
  await expect(tv.getByTestId('battle-grid')).toBeVisible();
  await expect(token(tv, pc)).toBeVisible();
  await expect(token(tv, npc)).toBeVisible();
  // The Display has no tools drawer of the GM's kind (no grid setup), but has the tools.
  await expect(tv.getByTestId('open-grid')).toHaveCount(0);
  await expect(tv.getByTestId('tool-draw')).toBeVisible();
  await expect(tv.getByTestId('open-cast')).toHaveCount(0);

  // Switching back to Scene mode switches the Display too.
  await gm.getByTestId('mode-scene').click();
  await expect(tv.getByTestId('battle-map')).toHaveCount(0);
  await gm.getByTestId('mode-battle').click();
  await expect(tv.getByTestId('battle-map')).toBeVisible();

  await tvCtx.close();
  await gmCtx.close();
});

test('dragging a token on the Display snaps it to a square for everyone; Hide removes it for the Display', async ({ browser }) => {
  const npc = `Troll-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Bridge-${uid()}`);
  await placeToken(gm, npc);
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(token(tv, npc)).toBeVisible();
  await expect(token(tv, npc)).toHaveAttribute('data-col', '0');

  const map = await tv.getByTestId('battle-map').boundingBox();
  const box = await token(tv, npc).boundingBox();
  await tv.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tv.mouse.down();
  // Column 5, row 2 of a 10 x 5 grid: the middle of that square.
  await tv.mouse.move(map.x + (5.5 / 10) * map.width, map.y + (2.5 / 5) * map.height, { steps: 8 });
  await tv.mouse.up();
  await expect(token(gm, npc)).toHaveAttribute('data-col', '5');
  await expect(token(gm, npc)).toHaveAttribute('data-row', '2');
  await expect(token(tv, npc)).toHaveAttribute('data-col', '5');

  await token(gm, npc).click({ button: 'right' });
  await gm.getByTestId('menu-hide').click();
  await expect(token(tv, npc)).toHaveCount(0);
  await expect(token(gm, npc)).toHaveAttribute('data-hidden', 'true');

  await tvCtx.close();
  await gmCtx.close();
});

test('token size follows the character sheet, from 1x1 up to 6x6', async ({ browser }) => {
  const npc = `Giant-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Peak-${uid()}`);
  await placeToken(gm, npc);
  await expect(token(gm, npc)).toHaveAttribute('data-size', '1');

  await gm.getByTestId('nav-characters').click();
  await gm.getByTestId('character-row').filter({ hasText: npc }).click();
  await gm.getByTestId('open-sheet').click();
  await expect(gm.getByTestId('movement-value')).toHaveValue('5'); // default Movement
  await gm.getByTestId('size-select').selectOption('3');
  await gm.getByTestId('nav-scene').click();
  await expect(token(gm, npc)).toHaveAttribute('data-size', '3');
  const map = await gm.getByTestId('battle-map').boundingBox();
  const box = await token(gm, npc).boundingBox();
  expect(box.width).toBeCloseTo((3 / 10) * map.width, -1);

  await gmCtx.close();
});

test('a phone player moves with the D-pad, sees their Movement, and picks a target', async ({ browser }) => {
  const pc = `Mover-${uid()}`;
  const npc = `Goblin-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Road-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, npc);

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(p.getByTestId('battle-remote')).toBeVisible();
  await expect(p.getByTestId('battle-map')).toHaveCount(0); // phones never render the map
  await expect(p.getByTestId('remote-bank')).toHaveText('0');

  const col = async () => Number(await token(gm, pc).getAttribute('data-col'));
  const before = await col();
  await p.getByTestId('dpad-E').click();
  await expect.poll(col).toBe(before + 1);
  await p.getByTestId('dpad-W').click();
  await expect.poll(col).toBe(before);
  await p.getByTestId('dpad-SE').click();
  await expect(token(gm, pc)).toHaveAttribute('data-row', /^[1-9]/);

  await expect(p.getByTestId('free-movement')).not.toBeChecked();
  await p.getByTestId('free-movement').check();
  await expect(p.getByTestId('free-movement')).toBeChecked();

  // Targeting: the GM and the Display see who is targeted.
  await p.getByTestId('target-option').filter({ hasText: npc }).click();
  await expect(token(gm, npc)).toHaveAttribute('data-targeted', 'true');
  await p.getByTestId('clear-target').click();
  await expect(token(gm, npc)).toHaveAttribute('data-targeted', 'false');

  await ctx.close();
  await gmCtx.close();
});

test('tools: a static tool bar with options beside it; drawing, eraser, Clean, areas (Arc), Erase, pings and the ruler are shared', async ({ browser }) => {
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await battleScene(gm, `Tools-${uid()}`);
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(tv.getByTestId('battle-map')).toBeVisible();
  const map = await tv.getByTestId('battle-map').boundingBox();
  const at = (fx, fy) => [map.x + fx * map.width, map.y + fy * map.height];
  const drag = async (from, to) => {
    await tv.mouse.move(...at(...from));
    await tv.mouse.down();
    await tv.mouse.move(...at(...to), { steps: 8 });
    await tv.mouse.up();
  };

  // The tool bar itself never moves or changes size when a tool is picked; its options open beside it.
  const bar = () => tv.getByTestId('battle-tools').boundingBox();
  const before = await bar();
  await tv.getByTestId('tool-draw').click();
  await expect(tv.getByTestId('tool-options')).toBeVisible();
  const during = await bar();
  expect(during).toEqual(before);
  const options = await tv.getByTestId('tool-options').boundingBox();
  expect(options.x).toBeGreaterThanOrEqual(before.x + before.width);
  await tv.getByTestId('tool-template').click();
  expect(await bar()).toEqual(before);
  await tv.getByTestId('tool-ping').click();
  await expect(tv.getByTestId('tool-options')).toHaveCount(0);
  expect(await bar()).toEqual(before);

  // Draw two lines. The eraser rubs a piece out of the second, which then becomes two drawings.
  await tv.getByTestId('tool-draw').click();
  await drag([0.2, 0.3], [0.4, 0.5]);
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(1);
  await drag([0.55, 0.8], [0.95, 0.8]);
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(2);
  await tv.getByTestId('draw-mode-eraser').click();
  await drag([0.75, 0.7], [0.75, 0.9]);
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(3);
  // Clean removes every drawing (the GM's screen shows it too).
  await tv.getByTestId('clear-drawings').click();
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(0);

  // Area: an Arc dragged to the right, then removed with the Erase tool by clicking it.
  await tv.getByTestId('tool-template').click();
  await tv.getByTestId('template-shape').selectOption('arc');
  await tv.getByTestId('template-size').fill('4');
  await drag([0.5, 0.5], [0.7, 0.5]);
  await expect(gm.getByTestId('battle-template')).toHaveCount(1);
  await tv.getByTestId('tool-erase').click();
  await tv.mouse.click(...at(0.6, 0.5));
  await expect(gm.getByTestId('battle-template')).toHaveCount(0);

  // A drawing can be removed whole by clicking on it with Erase too, even a thin one.
  await tv.getByTestId('tool-draw').click();
  await tv.getByTestId('draw-mode-pen').click();
  await drag([0.2, 0.3], [0.4, 0.5]);
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(1);
  await tv.getByTestId('tool-erase').click();
  await tv.mouse.click(...at(0.3, 0.4));
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(0);

  // Areas have their own Clean.
  await tv.getByTestId('tool-template').click();
  await tv.getByTestId('template-shape').selectOption('cone');
  await drag([0.5, 0.5], [0.7, 0.5]);
  await expect(gm.getByTestId('battle-template')).toHaveCount(1);
  await tv.getByTestId('clear-templates').click();
  await expect(gm.getByTestId('battle-template')).toHaveCount(0);

  // Ping: a ring appears on the GM's screen
  await tv.getByTestId('tool-ping').click();
  await tv.mouse.click(...at(0.6, 0.6));
  await expect(gm.locator('circle.battle-ping')).toHaveCount(1);

  // Ruler: shows the distance in squares on the screen that measures
  await tv.getByTestId('tool-ruler').click();
  await tv.mouse.move(...at(0.05, 0.1));
  await tv.mouse.down();
  await tv.mouse.move(...at(0.45, 0.1), { steps: 6 });
  await expect(tv.getByTestId('ruler-distance')).toHaveText('4 squares');
  await tv.mouse.up();
  await expect(tv.getByTestId('ruler-distance')).toHaveCount(0);

  await tvCtx.close();
  await gmCtx.close();
});

test('desktop players watch the map without tools', async ({ browser }) => {
  const pc = `Watcher-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await battleScene(gm, `Arena-${uid()}`);
  await placeToken(gm, pc);

  const ctx = await desktop(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('nav-scene').click();
  await expect(p.getByTestId('battle-map')).toBeVisible();
  await expect(token(p, pc)).toBeVisible();
  await expect(p.getByTestId('battle-tools')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});

test('combat: players roll their own Initiative, turns run in order, and movement costs AP only on your turn', async ({ browser }) => {
  const pc = `Hero-${uid()}`;
  const npc = `Wolf-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Clash-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, npc);
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();

  const entry = (page, name) => page.getByTestId('combat-entry').filter({ hasText: name });
  const setInitiative = async (name, value) => {
    await entry(gm, name).getByTestId('initiative').click();
    await entry(gm, name).getByTestId('initiative-input').fill(String(value));
    await entry(gm, name).getByTestId('initiative-input').press('Enter');
    await expect(entry(gm, name).getByTestId('initiative')).toHaveText(String(value));
  };

  // Before combat: moving is free and there is no turn text.
  await expect(p.getByTestId('remote-combat')).toHaveCount(0);
  await gm.getByTestId('combat-start').click();
  await expect(entry(tv, pc)).toBeVisible();
  await expect(entry(tv, npc)).toBeVisible();
  await expect(tv.getByTestId('combat-round')).toHaveText('Rolling Initiative');

  // The player rolls their own; the GM rolls the NPC and fixes the numbers.
  await p.getByTestId('roll-initiative').click();
  await expect(p.getByTestId('remote-turn')).toContainText('Waiting for the GM');
  await gm.getByTestId('combat-roll-npcs').click();
  await expect(entry(gm, npc).getByTestId('initiative')).not.toHaveText('?');
  await setInitiative(pc, 20);
  await setInitiative(npc, 3);
  await gm.getByTestId('combat-begin').click();

  await expect(tv.getByTestId('combat-round')).toHaveText('Round 1');
  await expect(entry(tv, pc)).toHaveAttribute('data-active', 'true');
  await expect(p.getByTestId('remote-turn')).toContainText('Your turn');

  // On their own turn a step costs AP, and asks first.
  await p.getByTestId('dpad-E').click();
  await expect(p.getByTestId('confirm-ap-text')).toContainText('Spend 1 AP');
  await p.getByTestId('confirm-ap-no').click();

  await p.getByTestId('end-turn').click();
  await expect(entry(tv, npc)).toHaveAttribute('data-active', 'true');
  await expect(p.getByTestId('remote-turn')).toContainText(`${npc}'s turn`);
  await expect(p.getByTestId('end-turn')).toHaveCount(0);

  await gm.getByTestId('combat-next').click();
  await expect(tv.getByTestId('combat-round')).toHaveText('Round 2');
  await expect(entry(tv, pc)).toHaveAttribute('data-active', 'true');
  await expect(tv.getByTestId('combat-next')).toHaveCount(0); // the Display only watches

  await gm.getByTestId('combat-end').click();
  await expect(tv.getByTestId('combat-bar')).toHaveCount(0);
  await expect(p.getByTestId('remote-combat')).toHaveCount(0);
  await expect(gm.getByTestId('combat-start')).toBeVisible();

  await ctx.close();
  await tvCtx.close();
  await gmCtx.close();
});

test('attacks: the player rolls, the GM confirms a card, and the target and the AP are updated', async ({ browser }) => {
  const pc = `Knight-${uid()}`;
  const npc = `Orc-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Duel-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, npc);
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();

  await expect(p.getByTestId('remote-ap')).toHaveText('4/4');
  await p.getByTestId('target-option').filter({ hasText: npc }).click();
  await p.getByTestId('attack-open').click();
  await expect(p.getByTestId('attack-target-name')).toHaveText(npc);
  await p.getByTestId('attack-mastery-stances').click();
  await p.getByTestId('attack-defence-physical').click();
  await p.getByTestId('attack-ap-2').click();
  await expect(p.getByTestId('attack-preview')).toContainText('Mastery: Stances');
  await p.getByTestId('attack-roll').click();

  // The card pops up on the GM's screen with the target already on it.
  const card = gm.getByTestId('attack-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('attack-target')).toHaveAttribute('data-name', npc);
  // Only these can be changed on the card: Total, Base damage, damage type, AP cost and statuses.
  await expect(card.getByLabel('Natural roll')).toHaveCount(0);
  await expect(card.getByLabel('Add a target')).toHaveCount(0);
  await expect(card.getByTestId('attack-exposed')).toHaveCount(0);
  await card.getByLabel('Attack total').fill('25');
  await card.getByLabel('Base damage').fill('4');
  await card.getByTestId('attack-kind').selectOption('fire');
  // 4 + 2 for a Brutal Hit (+2 more when the random natural roll happens to be a 20).
  await expect(card.getByTestId('attack-outcome')).toContainText('Brutal Hit');
  await expect(card.getByTestId('attack-outcome')).toContainText(/(6|8) damage/);
  await card.getByTestId('attack-apply').click();
  await expect(card).toHaveCount(0);

  // The attacker spent 2 AP.
  await expect(p.getByTestId('remote-ap')).toHaveText('2/4');

  // A second attack can be discarded. The chat, being closed on the GM's screen, pops the roll up briefly.
  await p.getByTestId('attack-open').click();
  await p.getByTestId('attack-roll').click();
  await expect(gm.getByTestId('chat-popup').first()).toContainText('Stances attack');
  await expect(gm.getByTestId('attack-card')).toBeVisible();
  await gm.getByTestId('attack-discard').click();
  await expect(gm.getByTestId('attack-card')).toHaveCount(0);
  await expect(p.getByTestId('remote-ap')).toHaveText('2/4');

  await ctx.close();
  await gmCtx.close();
});

test('targets can be selected many at once and deselected; attacks are blocked without a target or enough AP', async ({ browser }) => {
  const pc = `Ranger-${uid()}`;
  const wolf = `Wolf-${uid()}`;
  const bear = `Bear-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, wolf, 'NPC');
  await createCharacter(gm, bear, 'NPC');
  await battleScene(gm, `Woods-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, wolf);
  await placeToken(gm, bear);
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(p.getByTestId('remote-ap')).toHaveText('4/4');

  // No target yet: the Attack button is greyed out and says why.
  await expect(p.getByTestId('attack-open')).toBeDisabled();
  await expect(p.getByTestId('attack-blocked')).toContainText('Select a target');

  const option = (name) => p.getByTestId('target-option').filter({ hasText: name });
  await option(wolf).click();
  await option(bear).click();
  await expect(option(wolf)).toHaveAttribute('aria-pressed', 'true');
  await expect(option(bear)).toHaveAttribute('aria-pressed', 'true');
  await expect(token(gm, wolf)).toHaveAttribute('data-targeted', 'true');
  await expect(token(gm, bear)).toHaveAttribute('data-targeted', 'true');
  // Tapping a selected character again deselects it.
  await option(wolf).click();
  await expect(option(wolf)).toHaveAttribute('aria-pressed', 'false');
  await expect(token(gm, wolf)).toHaveAttribute('data-targeted', 'false');
  await expect(token(gm, bear)).toHaveAttribute('data-targeted', 'true');
  await expect(p.getByTestId('attack-open')).toBeEnabled();

  // With 1 AP the 2 AP attack is greyed out.
  await p.getByTestId('ap-current').fill('1');
  await p.getByTestId('ap-current').press('Enter');
  await expect(p.getByTestId('remote-ap')).toHaveText('1/4');
  await p.getByTestId('attack-open').click();
  await expect(p.getByTestId('attack-ap-2')).toBeDisabled();
  await expect(p.getByTestId('attack-ap-1')).toBeEnabled();
  await p.getByTestId('attack-ap-1').click();
  await p.getByTestId('attack-roll').click();
  await expect(gm.getByTestId('attack-card')).toBeVisible();
  await expect(gm.getByTestId('attack-target')).toHaveCount(1);
  await gm.getByTestId('attack-discard').click();

  // With 0 AP there is no attack at all.
  await p.getByTestId('ap-current').fill('0');
  await p.getByTestId('ap-current').press('Enter');
  await expect(p.getByTestId('attack-open')).toBeDisabled();
  await expect(p.getByTestId('attack-blocked')).toContainText('No AP');

  await p.getByTestId('clear-target').click();
  await expect(token(gm, bear)).toHaveAttribute('data-targeted', 'false');
  await ctx.close();
  await gmCtx.close();
});

test('the token menu stands on both sides of the token; the Display has the whole menu; height uses buttons only', async ({ browser }) => {
  const npc = `Bat-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Cave-${uid()}`);
  await placeToken(gm, npc);
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(token(tv, npc)).toBeVisible();
  await expect(tv.getByTestId('token-height')).toHaveCount(0);

  // Two circles on each side, the columns centred on the token, none hanging below it.
  // (Move the token away from the screen edge first, where the columns cannot both fit.)
  const map = await gm.getByTestId('battle-map').boundingBox();
  const start = await token(gm, npc).boundingBox();
  await gm.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await gm.mouse.down();
  await gm.mouse.move(map.x + (5.5 / 10) * map.width, map.y + (2.5 / 5) * map.height, { steps: 8 });
  await gm.mouse.up();
  await expect(token(gm, npc)).toHaveAttribute('data-col', '5');
  await token(gm, npc).click({ button: 'right' });
  const t = await token(gm, npc).boundingBox();
  const left = await gm.getByTestId('token-menu-left').boundingBox();
  const right = await gm.getByTestId('token-menu-right').boundingBox();
  await expect(gm.getByTestId('token-menu-left').getByRole('button')).toHaveCount(2);
  await expect(gm.getByTestId('token-menu-right').getByRole('button')).toHaveCount(2);
  expect(left.x + left.width).toBeLessThanOrEqual(t.x);
  expect(right.x).toBeGreaterThanOrEqual(t.x + t.width);
  const cy = t.y + t.height / 2;
  expect(Math.abs(left.y + left.height / 2 - cy)).toBeLessThan(12);
  expect(Math.abs(right.y + right.height / 2 - cy)).toBeLessThan(12);
  await gm.getByTestId('token-menu-backdrop').click({ position: { x: 5, y: 5 } });

  // The Display: a plain click on the token opens the same menu. Height goes Up and Down, and Reset.
  await token(tv, npc).click();
  await expect(tv.getByTestId('token-menu-right')).toBeVisible();
  await tv.getByTestId('menu-height').click();
  await expect(tv.getByTestId('height-value')).toHaveText('0');
  await expect(tv.getByTestId('height-down')).toBeDisabled();
  await expect(tv.getByTestId('height-reset')).toBeDisabled();
  await tv.getByTestId('height-up').click();
  await tv.getByTestId('height-up').click();
  await tv.getByTestId('height-up').click();
  await expect(tv.getByTestId('height-value')).toHaveText('3');
  await expect(gm.getByTestId('token-height')).toHaveText('+3 sp.');
  await expect(tv.getByTestId('token-height')).toHaveText('+3 sp.');
  await expect(token(tv, npc)).toHaveAttribute('data-height', '3');
  await tv.getByTestId('height-down').click();
  await expect(gm.getByTestId('token-height')).toHaveText('+2 sp.');
  await tv.getByTestId('height-reset').click();
  await expect(tv.getByTestId('token-height')).toHaveCount(0);
  await tv.getByTestId('height-close').click();

  // Hide and Remove from the Display too.
  await token(tv, npc).click();
  await tv.getByTestId('menu-hide').click();
  await expect(token(tv, npc)).toHaveCount(0);
  await expect(token(gm, npc)).toHaveAttribute('data-hidden', 'true');
  await token(gm, npc).click({ button: 'right' });
  await gm.getByTestId('menu-hide').click(); // Reveal
  await expect(token(tv, npc)).toBeVisible();
  await token(tv, npc).click();
  await tv.getByTestId('menu-remove').click();
  await expect(token(gm, npc)).toHaveCount(0);
  await expect(token(tv, npc)).toHaveCount(0);

  await tvCtx.close();
  await gmCtx.close();
});

test('a desktop player drags their own token and can set its height; the sheet has height buttons too', async ({ browser }) => {
  const pc = `Flyer-${uid()}`;
  const other = `Grounded-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, other, 'PC');
  await battleScene(gm, `Sky-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, other);

  const ctx = await desktop(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('nav-scene').click();
  await expect(token(p, pc)).toBeVisible();

  // Dragging their own token works; someone else's does not.
  const map = await p.getByTestId('battle-map').boundingBox();
  const mine = await token(p, pc).boundingBox();
  await p.mouse.move(mine.x + mine.width / 2, mine.y + mine.height / 2);
  await p.mouse.down();
  await p.mouse.move(map.x + (6.5 / 10) * map.width, map.y + (3.5 / 5) * map.height, { steps: 8 });
  await p.mouse.up();
  await expect(token(gm, pc)).toHaveAttribute('data-col', '6');
  await expect(token(gm, pc)).toHaveAttribute('data-row', '3');
  const before = await token(gm, other).getAttribute('data-col');
  const theirs = await token(p, other).boundingBox();
  await p.mouse.move(theirs.x + theirs.width / 2, theirs.y + theirs.height / 2);
  await p.mouse.down();
  await p.mouse.move(map.x + (8.5 / 10) * map.width, map.y + (1.5 / 5) * map.height, { steps: 8 });
  await p.mouse.up();
  await expect(token(gm, other)).toHaveAttribute('data-col', before);

  // Their menu has only Set Height, and no tools.
  await token(p, pc).click();
  await expect(p.getByTestId('menu-height')).toBeVisible();
  await expect(p.getByTestId('menu-hide')).toHaveCount(0);
  await expect(p.getByTestId('menu-remove')).toHaveCount(0);
  await p.getByTestId('menu-height').click();
  await p.getByTestId('height-up').click();
  await expect(gm.getByTestId('token-height').first()).toHaveText('+1 sp.');
  await p.getByTestId('height-close').click();
  await ctx.close();

  // On the phone sheet, next to Movement and Size, the same buttons.
  const phoneCtx = await phone(browser);
  const ph = await phoneCtx.newPage();
  await ph.goto('/');
  await ph.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(ph.getByTestId('sheet-height').getByTestId('height-value')).toHaveText('1');
  await ph.getByTestId('sheet-height').getByTestId('height-up').click();
  await expect(gm.getByTestId('token-height').first()).toHaveText('+2 sp.');
  await ph.getByTestId('sheet-height').getByTestId('height-reset').click();
  await expect(token(gm, pc).getByTestId('token-height')).toHaveCount(0);
  await phoneCtx.close();
  await gmCtx.close();
});

test('the Area size has arrows to the right of the field', async ({ browser }) => {
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await battleScene(gm, `Arrows-${uid()}`);
  await gm.getByTestId('tool-template').click();
  const field = gm.getByTestId('template-size');
  await expect(field).toHaveValue('4');
  await gm.getByTestId('template-size-up').click();
  await gm.getByTestId('template-size-up').click();
  await expect(field).toHaveValue('6');
  await gm.getByTestId('template-size-down').click();
  await expect(field).toHaveValue('5');
  const f = await field.boundingBox();
  const up = await gm.getByTestId('template-size-up').boundingBox();
  expect(up.x).toBeGreaterThanOrEqual(f.x + f.width);
  await gmCtx.close();
});
