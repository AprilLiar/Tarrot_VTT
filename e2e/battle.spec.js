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

test('drawing, areas, pings and the ruler on the Display are shared, and the GM can clear them', async ({ browser }) => {
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await battleScene(gm, `Tools-${uid()}`);
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(tv.getByTestId('battle-map')).toBeVisible();
  const map = await tv.getByTestId('battle-map').boundingBox();
  const at = (fx, fy) => [map.x + fx * map.width, map.y + fy * map.height];

  // Draw
  await tv.getByTestId('tool-draw').click();
  await tv.mouse.move(...at(0.2, 0.3));
  await tv.mouse.down();
  await tv.mouse.move(...at(0.4, 0.5), { steps: 6 });
  await tv.mouse.up();
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(1);

  // Area: a cone dragged to the right
  await tv.getByTestId('tool-template').click();
  await tv.getByTestId('template-shape').selectOption('cone');
  await tv.getByTestId('template-size').fill('4');
  await tv.mouse.move(...at(0.5, 0.5));
  await tv.mouse.down();
  await tv.mouse.move(...at(0.7, 0.5), { steps: 6 });
  await tv.mouse.up();
  await expect(gm.getByTestId('battle-template')).toHaveCount(1);

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

  // Erase one drawing from the Display
  await tv.getByTestId('tool-erase').click();
  await tv.getByTestId('battle-drawing').dispatchEvent('click');
  await expect(gm.getByTestId('battle-drawing')).toHaveCount(0);

  // Only the GM can clear everything
  await expect(tv.getByTestId('clear-templates')).toHaveCount(0);
  await gm.getByTestId('clear-templates').click();
  await expect(tv.getByTestId('battle-template')).toHaveCount(0);

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
