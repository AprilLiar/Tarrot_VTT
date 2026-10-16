/* global document, getComputedStyle */
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
  const natW = await gm.getByTestId('battle-background').evaluate((img) => img.naturalWidth);
  await gm.getByTestId('grid-cell').fill(String(Math.round(natW / 10)));
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
  await row.getByTestId('summon-cast').click();
  await expect(row.getByTestId('dismiss-cast')).toContainText('Remove token');
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
}

const preset = (page, name) => page.getByTestId('preset').filter({ has: page.getByTestId('preset-name').getByText(name, { exact: true }) });

test('the star saves the attack by names; a preset attacks from the sheet, renames, goes red when a part is gone and comes back with the name', async ({ browser }) => {
  const pc = `Archer-${uid()}`;
  const npc = `Target-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await battleScene(gm, `Presets-${uid()}`);
  await placeToken(gm, pc);
  await placeToken(gm, npc);

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('add-item').click();
  await p.getByLabel('Name', { exact: true }).fill('Bow');
  await p.getByTestId('item-weapon').check();
  await p.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(p.getByTestId('item')).toHaveAttribute('data-weapon', 'true');

  // The presets sit at the end of the first column, right under the Battle remote, and start empty.
  await expect(p.getByTestId('presets')).toBeVisible();
  await expect(p.getByTestId('preset')).toHaveCount(0);
  await expect(p.getByTestId('sheet-columns').locator(':scope > div').first().locator(':scope > *').last()).toHaveAttribute('data-testid', 'presets');

  // Setting an attack up: with only the Unarmed Attack chosen the star is already there, hollow.
  await p.getByTestId('target-option').filter({ hasText: npc }).click();
  await p.getByTestId('attack-open').click();
  await expect(p.getByTestId('preset-star')).toHaveAttribute('data-saved', 'false');
  await p.getByTestId('weapon-option').filter({ hasText: 'Bow' }).click();
  const enh = (name) => p.getByTestId('enhancement').filter({ hasText: name });
  await enh('Power Attack').getByTestId('enh-plus').click();
  await enh('Power Attack').getByTestId('enh-plus').click();
  await p.getByTestId('preset-star').click();
  await expect(p.getByTestId('preset-star')).toHaveAttribute('data-saved', 'true');
  await expect(preset(p, 'Bow + Power Attack x2')).toBeVisible();
  await expect(p.getByTestId('preset-count')).toHaveText('(1)');
  await p.getByTestId('preset-star').click(); // a filled star does nothing
  await expect(p.getByTestId('preset')).toHaveCount(1);
  await enh('Power Attack').getByTestId('enh-plus').click(); // another setup: the star is hollow again
  await expect(p.getByTestId('preset-star')).toHaveAttribute('data-saved', 'false');
  await enh('Power Attack').getByTestId('enh-minus').click();
  await expect(p.getByTestId('preset-star')).toHaveAttribute('data-saved', 'true');

  // From the sheet the preset attacks at once at the selected target, without the Arcane tab.
  await p.getByTestId('view-sheet').click();
  const row = preset(p, 'Bow + Power Attack x2');
  await expect(row).toHaveAttribute('data-valid', 'true');
  await expect(row.getByTestId('preset-line')).toContainText('3 AP');
  await row.getByTestId('preset-attack').click();
  const card = gm.getByTestId('attack-card');
  await expect(card).toBeVisible();
  await card.getByTestId('attack-apply').click();
  await expect(card).toHaveCount(0);

  // Rename it.
  await row.getByTestId('preset-edit').click();
  await p.getByTestId('preset-name-input').fill('Quick shot');
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(preset(p, 'Quick shot')).toBeVisible();

  // A preset made with an Enhancement of the character...
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('add-enhancement').click();
  await p.getByTestId('enh-name').fill('Coat');
  await p.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await enh('Coat').getByTestId('enh-toggle').click();
  await enh('Power Attack').getByTestId('enh-minus').click(); // the earlier setup is still in the footer: clear its Power Attack
  await enh('Power Attack').getByTestId('enh-minus').click();
  await p.getByTestId('weapon-option').filter({ hasText: 'Bow' }).click();
  await p.getByTestId('preset-star').click();
  await expect(preset(p, 'Bow + Coat')).toBeVisible();

  // ...goes slightly red when the Enhancement is deleted, cannot attack, but can still be loaded into the footer.
  await enh('Coat').getByRole('button', { name: 'Delete' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  const broken = preset(p, 'Bow + Coat');
  await expect(broken).toHaveAttribute('data-valid', 'false');
  await expect(broken.getByTestId('preset-line')).toContainText('Missing: Coat');
  await expect(broken.getByTestId('preset-attack')).toBeDisabled();
  await expect(preset(p, 'Quick shot')).toHaveAttribute('data-valid', 'true');
  await p.getByTestId('weapon-option').filter({ hasText: 'Unarmed' }).click();
  await broken.getByTestId('preset-load').click();
  await expect(p.getByTestId('arcane-chosen')).toHaveText('Bow');

  // A new Enhancement with the same name brings the preset back to life.
  await p.getByTestId('add-enhancement').click();
  await p.getByTestId('enh-name').fill('coat');
  await p.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(broken).toHaveAttribute('data-valid', 'true');
  await broken.getByTestId('preset-load').click();
  await expect(p.getByTestId('arcane-chosen')).toHaveText('Bow + coat');

  // Loading from the sheet opens the Arcane tab with the parts in the footer.
  await p.getByTestId('view-sheet').click();
  await preset(p, 'Quick shot').getByTestId('preset-load').click();
  await expect(p.getByTestId('arcane-footer')).toBeVisible();
  await expect(p.getByTestId('arcane-chosen')).toHaveText('Bow + Power Attack x2');

  // Deleting.
  await preset(p, 'Quick shot').getByTestId('preset-edit').click();
  await p.getByTestId('preset-delete').click();
  await p.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(preset(p, 'Quick shot')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});

test('the preset list shows five rows and scrolls: no scroll bar on a touch screen, the interface\'s thin bar on a computer', async ({ browser }) => {
  const pc = `Many-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await createCharacter(gm, pc, 'PC');

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('view-arcane').click();
  const plus = p.getByTestId('enhancement').filter({ hasText: 'Power Attack' }).getByTestId('enh-plus');
  for (let i = 1; i <= 7; i++) {
    await plus.click(); // Unarmed Attack + Power Attack x i
    await p.getByTestId('preset-star').click();
    await expect(p.getByTestId('preset')).toHaveCount(i);
  }

  // Five rows are in view; the rest is below, hinted by a fade.
  await p.getByTestId('view-sheet').click();
  const list = p.getByTestId('preset-list');
  await list.scrollIntoViewIfNeeded();
  await expect(p.getByTestId('preset-count')).toHaveText('(7)');
  const box = await list.boundingBox();
  const inside = async () => {
    let n = 0;
    for (const r of await p.getByTestId('preset').all()) {
      const b = await r.boundingBox();
      if (b.y >= box.y - 1 && b.y + b.height <= box.y + box.height + 1) n++;
    }
    return n;
  };
  expect(await inside()).toBe(5);
  await expect(p.getByTestId('preset-more')).toBeVisible();

  // A touch screen shows no scroll bar at all; the list is simply swiped.
  expect(await list.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await list.hover();
  await p.mouse.wheel(0, 600);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(p.getByTestId('preset-more')).toHaveCount(0);
  await expect(preset(p, 'Unarmed Attack + Power Attack x7')).toBeInViewport();

  // A computer keeps the thin bar of the interface.
  const pcCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false }); // a mouse, not a touch screen
  const d = await pcCtx.newPage();
  await d.goto('/');
  await d.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(d.getByTestId('preset')).toHaveCount(7);
  expect(await d.getByTestId('preset-list').evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('thin');

  await pcCtx.close();
  await ctx.close();
  await gmCtx.close();
});
