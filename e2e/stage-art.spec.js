/* global document */
import { test, expect } from '@playwright/test';
import { addPicturesOnSheet } from './helpers.js';

const uid = () => Math.random().toString(36).slice(2, 8);

const desktop = (browser) => browser.newContext({ viewport: { width: 1280, height: 800 } });
const phone = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// A 1x1 picture for backgrounds (the app resizes and re-encodes uploads in the browser).
const PNG = {
  name: 'art.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
};

// Character art drawn in the browser (a tall figure in the colour given), so the tests need no image files.
async function art(page, color) {
  const b64 = await page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 420;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(40, 0, 160, 420);
    return c.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: `${color.replace('#', '')}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
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

async function createScene(gm, name) {
  await gm.getByTestId('open-scenes').click();
  await gm.getByTestId('new-scene').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByTestId('scene-file').setInputFiles(PNG);
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await gm.getByTestId('scenes-drawer').getByRole('button', { name: 'Close' }).click();
}

async function activateScene(gm, name) {
  await gm.getByTestId('open-scenes').click();
  await gm.getByTestId('scene-row').filter({ hasText: name }).getByRole('button').first().click();
  await gm.getByTestId('activate-scene').click();
  await gm.getByTestId('scenes-drawer').getByRole('button', { name: 'Close' }).click();
  await expect(gm.getByTestId('scene-title')).toHaveText(name);
}

// Takes a figure off the stage with its own menu (the Cast list has no Remove button).
async function removeFigure(page, fig) {
  await fig.getByTestId('figure-hit').dispatchEvent('contextmenu');
  await page.getByTestId('menu-remove').click();
}

const castRow = (gm, name) => gm.getByTestId('cast-row').filter({ has: gm.locator(`text="${name}"`) });
const figure = (page, name) => page.getByTestId('stage-figure').filter({ has: page.getByText(name, { exact: true }) });
// How tall a figure is, as a fraction of the stage (the scene picture): the size 1 is 0.7.
const heightOf = async (page, fig) => {
  const f = await fig.boundingBox();
  const stage = await page.getByTestId('scene-stage').boundingBox();
  return f.height / stage.height;
};

async function start(browser, { pictures = 2, type = 'NPC' } = {}) {
  const name = `Orc-${uid()}`;
  const ctx = await desktop(browser);
  const gm = await open(ctx, 'pick-gm');
  await createCharacter(gm, name, type);
  await gm.getByTestId('nav-scene').click();
  const scene = `Hall-${uid()}`;
  await createScene(gm, scene);
  await activateScene(gm, scene);
  await gm.getByTestId('mode-scene').click();
  const files = [await art(gm, '#c0392b'), await art(gm, '#2980b9')].slice(0, pictures);
  await addPicturesOnSheet(gm, name, files);
  await gm.getByTestId('open-cast').click();
  return { gm, name, ctx, scene };
}

async function summonWith(gm, name, index = 0, { silhouette = false } = {}) {
  await castRow(gm, name).getByTestId('summon-cast').click();
  await expect(gm.getByTestId('summon-dialog')).toBeVisible();
  if (silhouette) await gm.getByTestId('silhouette-toggle').check();
  await gm.getByTestId('summon-pick').nth(index).click();
  await expect(gm.getByTestId('summon-dialog')).toHaveCount(0);
}

test('the size of a figure belongs to its picture: every figure with that picture, in any scene and when summoned again, has it', async ({ browser }) => {
  const { gm, name, ctx } = await start(browser);
  const second = `Forest-${uid()}`;
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
  await createScene(gm, second);
  await gm.getByTestId('open-cast').click();
  const first = await gm.getByTestId('scene-title').textContent();

  await summonWith(gm, name, 0);
  const fig = figure(gm, name);
  await expect(fig).toBeVisible();
  expect(await heightOf(gm, fig)).toBeCloseTo(0.7, 1);

  // Resizing it in Token Settings (the figure is tapped, then Token Settings).
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
  await fig.click();
  await gm.getByTestId('menu-settings').click();
  const slider = gm.getByTestId('scale-slider');
  await slider.fill('1.5');
  await slider.blur();
  await expect.poll(() => heightOf(gm, fig)).toBeCloseTo(1.05, 1);
  await gm.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Removed and summoned again, and in another scene: the same size, not 1.
  await removeFigure(gm, fig);
  await expect(fig).toHaveCount(0);
  await gm.getByTestId('open-cast').click();
  await summonWith(gm, name, 0);
  await expect.poll(() => heightOf(gm, fig)).toBeCloseTo(1.05, 1);
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
  await activateScene(gm, second);
  await gm.getByTestId('open-cast').click();
  await summonWith(gm, name, 0);
  await expect.poll(() => heightOf(gm, fig)).toBeCloseTo(1.05, 1);

  // The other picture of the same character has its own size (1), and changing the picture on the stage shows it.
  await summonWith(gm, name, 1);
  await expect.poll(() => heightOf(gm, fig)).toBeCloseTo(0.7, 1);
  await summonWith(gm, name, 0);
  await expect.poll(() => heightOf(gm, fig)).toBeCloseTo(1.05, 1);

  // Back in the first scene the figure there is the same size (one value for the picture), and the Display agrees.
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
  await activateScene(gm, first);
  const tv = await open(await desktop(browser), 'pick-display');
  await expect(figure(tv, name)).toBeVisible();
  expect(await heightOf(tv, figure(tv, name))).toBeCloseTo(1.05, 1);
  await ctx.close();
});

test('a figure keeps its size when it stands near the right end of the picture', async ({ browser }) => {
  const { gm, name, ctx } = await start(browser, { pictures: 1 });
  await summonWith(gm, name);
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
  const fig = figure(gm, name);
  const picture = fig.locator('img');
  await expect(picture).toBeVisible();
  const before = await picture.boundingBox();
  const figBefore = await fig.boundingBox();
  const stage = await gm.getByTestId('scene-stage').boundingBox();

  // Drag it to the far right of the picture (and past it).
  for (const toX of [0.9, 0.99, 1.2]) {
    const now = await fig.getByTestId('figure-hit').boundingBox();
    const goal = stage.x + stage.width * toX;
    await gm.mouse.move(now.x + now.width / 2, now.y + now.height / 2);
    await gm.mouse.down();
    await gm.mouse.move(Math.min(goal, 1270), now.y + now.height / 2, { steps: 6 });
    await gm.mouse.up();
    await expect.poll(async () => Number(await fig.getAttribute('data-x'))).toBeGreaterThan(0.85);
    const after = await picture.boundingBox();
    const figAfter = await fig.boundingBox();
    expect(Math.abs(after.width - before.width)).toBeLessThan(1.5);
    expect(Math.abs(after.height - before.height)).toBeLessThan(1.5);
    expect(Math.abs(figAfter.height - figBefore.height)).toBeLessThan(1.5);
  }
  await ctx.close();
});

test('figures can be dragged while the Cast list is open, and on a phone the list leaves part of the stage', async ({ browser }) => {
  const { gm, name, ctx } = await start(browser, { pictures: 1 });
  await summonWith(gm, name);
  const fig = figure(gm, name);
  await expect(fig.getByTestId('figure-hit')).toBeVisible();
  await expect(gm.getByTestId('cast-drawer')).toBeVisible();
  const x0 = Number(await fig.getAttribute('data-x'));
  const box = await fig.getByTestId('figure-hit').boundingBox(); // only the character itself takes a drag
  const drawer = await gm.getByTestId('cast-drawer').boundingBox();
  expect(box.x + box.width / 2).toBeGreaterThan(drawer.x + drawer.width); // a figure on the right, beside the list
  await gm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await gm.mouse.down();
  await gm.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 40, { steps: 6 });
  await gm.mouse.up();
  await expect(fig).toHaveAttribute('data-free', 'true');
  expect(Number(await fig.getAttribute('data-x'))).toBeLessThan(x0 - 0.02);
  await expect(gm.getByTestId('cast-drawer')).toBeVisible(); // still open
  await ctx.close();

  // On a phone the list is about 60% of the width, so the stage shows beside it.
  const pctx = await phone(browser);
  const p = await open(pctx, 'pick-gm');
  await p.getByTestId('nav-scene').click();
  await p.getByTestId('open-cast').click();
  const w = await p.getByTestId('cast-drawer').boundingBox();
  const view = p.viewportSize();
  expect(w.width).toBeGreaterThan(view.width * 0.55);
  expect(w.width).toBeLessThan(view.width * 0.65);
  await pctx.close();
});

test('Summon always asks for the picture, also to change it on the stage; Silhouette hides the picture and the name on every screen but is never remembered', async ({ browser }) => {
  const { gm, name, ctx } = await start(browser, { pictures: 2 });
  const row = castRow(gm, name);
  const tv = await open(await desktop(browser), 'pick-display');

  // The dialog lists the pictures; the Silhouette switch is off.
  await row.getByTestId('summon-cast').click();
  await expect(gm.getByTestId('summon-pick')).toHaveCount(2);
  await expect(gm.getByTestId('silhouette-toggle')).not.toBeChecked();
  await gm.getByTestId('summon-cancel').click();
  await expect(gm.getByTestId('summon-dialog')).toHaveCount(0);
  await expect(figure(gm, name)).toHaveCount(0); // closing it summoned nobody

  // A silhouette: black, and called ??? on the Display; the GM's list still has the real name.
  await summonWith(gm, name, 0, { silhouette: true });
  const fig = gm.getByTestId('stage-figure');
  await expect(fig).toHaveAttribute('data-silhouette', 'true');
  await expect(fig.getByTestId('name-plaque')).toHaveText('???');
  await expect(fig.locator('img')).toHaveCSS('filter', 'brightness(0)');
  const seen = tv.getByTestId('stage-figure');
  await expect(seen).toHaveAttribute('data-silhouette', 'true');
  await expect(seen.getByTestId('name-plaque')).toHaveText('???');
  await expect(seen).toHaveAttribute('data-name', '???');
  await expect(seen.locator('img')).toHaveCSS('filter', 'brightness(0)');
  await expect(row).toContainText(name);
  const x = await fig.getAttribute('data-x');
  const src = await fig.locator('img').getAttribute('src');

  // Summon is still there: the switch starts off again, the shown picture is marked, and choosing with it off reveals the figure.
  await row.getByTestId('summon-cast').click();
  await expect(gm.getByTestId('silhouette-toggle')).not.toBeChecked();
  await expect(gm.getByTestId('summon-pick').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(gm.getByTestId('summon-pick').nth(1)).toHaveAttribute('aria-pressed', 'false');
  await gm.getByTestId('summon-pick').nth(1).click();
  await expect(gm.getByTestId('summon-dialog')).toHaveCount(0);
  await expect(fig).toHaveAttribute('data-silhouette', 'false');
  await expect(fig.getByTestId('name-plaque')).toHaveText(name);
  await expect(fig.locator('img')).not.toHaveAttribute('src', src); // the other picture took its place
  await expect(fig.locator('img')).not.toHaveCSS('filter', 'brightness(0)');
  expect(await fig.getAttribute('data-x')).toBe(x); // on the same spot
  await expect(seen.getByTestId('name-plaque')).toHaveText(name);
  await expect(gm.getByTestId('stage-figure')).toHaveCount(1); // swapped, not summoned twice

  // Swapping with the switch on makes it a silhouette again; its menu's Remove takes it off and the row can summon it again.
  await row.getByTestId('summon-cast').click();
  await gm.getByTestId('silhouette-toggle').check();
  await gm.getByTestId('summon-pick').nth(0).click();
  await expect(fig).toHaveAttribute('data-silhouette', 'true');
  await removeFigure(gm, fig);
  await expect(gm.getByTestId('stage-figure')).toHaveCount(0);
  await expect(row.getByTestId('cast-where')).toHaveCount(0);
  await expect(row.getByTestId('summon-cast')).toBeEnabled();
  await ctx.close();
});

test('the picture dialog is shown for a character with one picture too', async ({ browser }) => {
  const { gm, name, ctx } = await start(browser, { pictures: 1 });
  await castRow(gm, name).getByTestId('summon-cast').click();
  await expect(gm.getByTestId('summon-pick')).toHaveCount(1);
  await expect(gm.getByTestId('silhouette-toggle')).toBeVisible();
  await gm.getByTestId('summon-pick').click();
  await expect(figure(gm, name)).toBeVisible();
  await ctx.close();
});
