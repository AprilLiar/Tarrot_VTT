/* global document */
import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

// A tall picture drawn in the browser (a Portrait is not square), so the test needs no image file.
async function face(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 420;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c0504d';
    ctx.fillRect(0, 0, 300, 420);
    ctx.fillStyle = '#f2d0a4';
    ctx.beginPath();
    ctx.arc(150, 120, 80, 0, 7);
    ctx.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function create(gm, name, type) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: type, exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

const openSheet = async (gm, name) => {
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();
};

test('Portrait: big at the start of the sheet, shown in the roster and the picker, copied once to the Pictures, and changed by the player', async ({ browser }) => {
  const pc = `Hero-${uid()}`;
  const npc = `Orc-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await create(gm, pc, 'PC');
  await create(gm, npc, 'NPC');

  // (The database may hold characters of earlier runs, so the roster is only looked at row by row.)
  const rosterPortrait = (name) => gm.getByTestId('character-row').filter({ hasText: name }).getByTestId('roster-portrait');

  // Nobody has a Portrait yet: the roster shows the coloured initial, not a picture.
  await expect(rosterPortrait(pc)).toHaveCount(0);

  await openSheet(gm, pc);
  await expect(gm.getByTestId('portrait-image')).toHaveCount(0);
  await expect(gm.getByTestId('portrait-set')).toHaveText('Set Portrait');
  await expect(gm.getByTestId('copy-portrait')).toBeDisabled();
  await gm.getByTestId('portrait-file').setInputFiles(await face(gm));
  await expect(gm.getByTestId('portrait-image')).toBeVisible();
  await expect(gm.getByTestId('portrait-set')).toHaveText('Change Portrait');

  // The first thing on the sheet: top of the left column, above the Action Points, about 12rem (192 px) tall; the button is small and sits over its corner.
  const section = await gm.getByTestId('portrait').boundingBox();
  const image = await gm.getByTestId('portrait-image').boundingBox();
  const points = await gm.getByText('Action Points', { exact: true }).boundingBox();
  expect(section.height).toBeGreaterThan(150);
  expect(section.height).toBeLessThanOrEqual(194);
  expect(image.height).toBeGreaterThan(120);
  expect(section.y + section.height).toBeLessThanOrEqual(points.y);
  expect(Math.abs(section.x - points.x)).toBeLessThan(40);
  const button = await gm.getByTestId('portrait-set').boundingBox();
  expect(button.height).toBeLessThanOrEqual(40);
  expect(button.width).toBeLessThanOrEqual(160);
  expect(button.x).toBeGreaterThanOrEqual(section.x);
  expect(button.x + button.width).toBeLessThanOrEqual(section.x + section.width);
  expect(button.y + button.height).toBeLessThanOrEqual(section.y + section.height);
  await expect(gm.getByTestId('sheet-portrait')).toHaveCount(0); // nothing beside the name any more
  await expect(gm.getByTestId('portrait-remove')).toHaveCount(0);

  // Copy from Portrait: one new Picture named Portrait, and the second press explains instead of adding another.
  await expect(gm.getByTestId('picture')).toHaveCount(0);
  await expect(gm.getByTestId('copy-portrait')).toBeEnabled();
  await gm.getByTestId('copy-portrait').click();
  await expect(gm.getByTestId('picture')).toHaveCount(1);
  await expect(gm.getByTestId('picture')).toContainText('Portrait');
  await gm.getByTestId('copy-portrait').click();
  await expect(gm.getByRole('status').filter({ hasText: 'The Portrait is already one of the Pictures.' })).toBeVisible();
  await expect(gm.getByTestId('picture')).toHaveCount(1);

  // The roster shows it small, only for the character that has one.
  await gm.getByText('Back to roster').click();
  const thumb = rosterPortrait(pc);
  await expect(thumb).toBeVisible();
  const small = await thumb.boundingBox();
  expect(small.width).toBeLessThanOrEqual(44);
  expect(small.height).toBeLessThanOrEqual(44);
  await expect(rosterPortrait(npc)).toHaveCount(0);

  // An NPC has a Portrait too.
  await openSheet(gm, npc);
  await gm.getByTestId('portrait-file').setInputFiles(await face(gm));
  await expect(gm.getByTestId('portrait-image')).toBeVisible();
  await gm.getByText('Back to roster').click();
  await expect(rosterPortrait(pc)).toHaveCount(1);
  await expect(rosterPortrait(npc)).toHaveCount(1);

  // A player's picker card shows it (NPCs are not on the picker).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto('/');
  await expect(p.getByTestId('pick-pc').filter({ hasText: pc }).getByTestId('picker-portrait')).toBeVisible();

  // On a phone the Portrait is the first block of the sheet. The player changes their own Portrait; it updates on their sheet and the GM's roster at once.
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(p.getByTestId('portrait-image')).toBeVisible();
  const header = await p.getByTestId('sheet-name').boundingBox();
  const mobile = await p.getByTestId('portrait').boundingBox();
  const mobilePoints = await p.getByText('Action Points', { exact: true }).boundingBox();
  expect(mobile.y).toBeGreaterThan(header.y);
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(mobilePoints.y);
  expect(mobile.height).toBeLessThanOrEqual(194);
  const before = await p.getByTestId('portrait-image').getAttribute('src');
  await p.getByTestId('portrait-file').setInputFiles(await face(p));
  await expect(p.getByTestId('portrait-image')).not.toHaveAttribute('src', before);
  await expect(rosterPortrait(pc)).not.toHaveAttribute('src', before);
  await expect(rosterPortrait(pc)).toHaveCount(1);
  // The changed Portrait is a new image, so it can be copied too; the old copy stays.
  await expect(p.getByTestId('picture')).toHaveCount(1);
  await p.getByTestId('copy-portrait').click();
  await expect(p.getByTestId('picture')).toHaveCount(2);

  await phone.close();
  await gmCtx.close();
});
