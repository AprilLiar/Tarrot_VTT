/* global getComputedStyle */
import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

test('Stances: the GM edits the tree and the table, teaches a Stance; the player sees Known greyed out and uses a Learned one', async ({ browser }) => {
  const name = `Monk-${uid()}`;
  const variation = `Charge-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  // The GM's general Arcane tab: twelve signs, the base Stance with the default +1 per band table.
  await gm.getByTestId('nav-arcane').click();
  await gm.getByTestId('arcane-tab-stances').click();
  await expect(gm.locator('[data-testid^="stance-sign-"]')).toHaveCount(12);
  await gm.getByTestId('stance-sign-aries').click();
  await expect(gm.getByTestId('stance-name')).toHaveText('Aries');
  await expect(gm.getByTestId('band-row')).toHaveCount(6);
  await expect(gm.getByTestId('band-effect').first()).toContainText('Roll +1');
  await expect(gm.getByTestId('band-effect').last()).toContainText('Roll +6');

  // Teach the base Stance to the player, and make the band 10-14 continue the one below ("-": one merged cell).
  await gm.getByTestId('stance-edit').click();
  await gm.getByTestId('stance-learned-check').and(gm.locator(`[data-name="${name}"]`)).check();
  await gm.getByTestId('band-edit').nth(1).locator('summary').click();
  await gm.getByTestId('band-edit').nth(1).getByTestId('band-same').check();
  await gm.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(gm.getByTestId('band-effect').first()).toHaveAttribute('data-span', '2');
  await expect(gm.getByTestId('band-effect')).toHaveCount(5);

  // A variation hanging from the base: known to characters, but not learned.
  const before = await gm.getByTestId('stance-node').count();
  await gm.getByTestId('stance-add').click();
  await gm.getByTestId('stance-edit-name').fill(variation);
  await gm.getByTestId('stance-known').check();
  await gm.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(gm.getByTestId('stance-node')).toHaveCount(before + 1);
  await expect(gm.getByTestId('stance-name')).toHaveText(variation);

  // The vibe text of the sign can be rewritten.
  await gm.getByTestId('stance-vibe-edit').click();
  await gm.getByTestId('stance-vibe-text').fill('Run at it.');
  await gm.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(gm.getByTestId('stance-vibe')).toHaveText('Run at it.');

  // The player: the learned base Stance is in full colour and can be used; the known variation is greyed out.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('arcane-tab-stances').click();
  await expect(p.locator('[data-testid^="stance-sign-"]')).toHaveCount(12);
  await p.getByTestId('stance-sign-aries').click();
  await expect(p.getByTestId('stance-vibe')).toHaveText('Run at it.');
  await expect(p.getByTestId('stance-node').and(p.locator('[data-name="Aries"]'))).toHaveAttribute('data-dim', 'false');
  await expect(p.getByTestId('stance-node').and(p.locator(`[data-name="${variation}"]`))).toHaveAttribute('data-dim', 'true');
  await p.getByTestId('stance-node').and(p.locator(`[data-name="${variation}"]`)).click();
  await expect(p.getByTestId('stance-state')).toHaveText('Known, not learned');
  await expect(p.getByTestId('stance-use')).toHaveCount(0);
  await expect(p.getByTestId('stance-edit')).toHaveCount(0); // players never edit
  await p.getByTestId('stance-node').and(p.locator('[data-name="Aries"]')).click();
  await p.getByTestId('stance-use').click();
  await expect(p.getByTestId('arcane-chosen')).toContainText('Stance: Aries');

  // Another sign the player has not learned: its base is known, so it is listed, but it cannot be used.
  await p.getByTestId('stance-back').click();
  await p.getByTestId('stance-sign-leo').click();
  await expect(p.getByTestId('stance-state')).toHaveText('Known, not learned');
  await expect(p.getByTestId('stance-use')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});

test('the Arcane cards fill the width: three to a row on a PC, one on a phone; the sheet has three columns', async ({ browser }) => {
  const name = `Wide-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();

  // Three columns on a PC.
  const cols = await gm.getByTestId('sheet-columns').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(3);

  await gm.getByTestId('view-arcane').click();
  await gm.getByTestId('arcane-tab-stances').click();
  await expect(gm.locator('[data-testid^="stance-sign-"]')).toHaveCount(12);
  const tops = await gm.locator('[data-testid^="stance-sign-"]').evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[1]);
  expect(tops[1]).toBe(tops[2]);
  expect(tops[3]).toBeGreaterThan(tops[2]); // the fourth starts a new row
  // The signs follow the zodiac.
  await expect(gm.locator('[data-testid^="stance-sign-"]').first()).toHaveAttribute('data-testid', 'stance-sign-aries');

  // On a phone the cards are one per row.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('arcane-tab-stances').click();
  await expect(p.locator('[data-testid^="stance-sign-"]')).toHaveCount(12);
  const lefts = await p.locator('[data-testid^="stance-sign-"]').evaluateAll((els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(lefts[0]).toBe(lefts[1]);
  await ctx.close();
  await gmCtx.close();
});
