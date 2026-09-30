import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const phone = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

async function setNumber(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(String(value));
  await field.press('Enter');
  await expect(field).toHaveValue(String(value));
}

const stone = (page, sign, n = 0) => page.getByTestId('scheme-stone').and(page.locator(`[data-sign="${sign}"]`)).nth(n);
// Two taps on different stones draw an arrow; the pause keeps a tap on the same stone from counting as a double tap.
const arrow = async (page, from, to) => {
  await page.waitForTimeout(450);
  await from.click();
  await to.click();
};

test('Magic: stones, a scheme with an arrow table and a note, drafts, crafting, and a GM-granted Spell tattoo', async ({ browser }) => {
  const name = `Mage-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  // AP are cubes filled from the left; the arrows change the amount.
  await expect(p.getByTestId('ap-current')).toHaveAttribute('data-current', '4');
  await expect(p.getByTestId('ap-current').getByTestId('ap-cube')).toHaveCount(4);
  await p.getByTestId('ap-down').click();
  await p.getByTestId('ap-down').click();
  await expect(p.locator('[data-testid="ap-current"] [data-testid="ap-cube"][data-filled="true"]')).toHaveCount(2);
  await expect(p.locator('[data-testid="ap-current"] [data-testid="ap-cube"][data-filled="false"]')).toHaveCount(2);
  await p.getByTestId('ap-up').click();
  await expect(p.getByTestId('ap-current')).toHaveAttribute('data-current', '3');

  await p.getByTestId('view-arcane').click();
  // The Arcane view uses the whole width, and the Chat button is the last button of its footer.
  const box = await p.getByTestId('arcane').boundingBox();
  expect(box.width).toBeGreaterThan(390 - 40);
  await expect(p.getByTestId('arcane-footer').getByTestId('chat-toggle')).toBeVisible();
  await p.getByTestId('arcane-tab-magic').click();

  // The stones the character owns.
  await p.getByTestId('magic-stones').click();
  await setNumber(p, 'stone-count-virgo', 2);
  await setNumber(p, 'stone-count-libra', 1);
  await setNumber(p, 'stone-count-taurus', 1);
  await setNumber(p, 'stone-count-aries', 1);

  // A legal scheme: two Virgo Bases meet in Libra, Taurus changes it, Aries lets it go.
  await p.getByTestId('magic-editor').click();
  await p.getByTestId('spell-name').fill('Fire Bolt');
  await expect(p.getByTestId('palette-virgo').locator('xpath=..')).toContainText('x2');
  for (const sign of ['virgo', 'virgo', 'libra', 'taurus', 'aries']) await p.getByTestId(`palette-${sign}`).click();
  await expect(p.getByTestId('scheme-stone')).toHaveCount(5);
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'false');
  await expect(p.getByTestId('scheme-status')).toContainText('needs exactly one arrow leaving it');
  await arrow(p, stone(p, 'virgo', 0), stone(p, 'libra'));
  await arrow(p, stone(p, 'virgo', 1), stone(p, 'libra'));
  await arrow(p, stone(p, 'libra'), stone(p, 'taurus'));
  await arrow(p, stone(p, 'taurus'), stone(p, 'aries'));
  await expect(p.getByTestId('scheme-arrow')).toHaveCount(4);
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'true');

  // A note: double tap, type, and the stone glows with a badge.
  await p.waitForTimeout(450);
  await stone(p, 'virgo', 0).dblclick();
  await p.getByTestId('stone-note-text').fill('Physical fire');
  await p.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(stone(p, 'virgo', 0)).toHaveAttribute('data-note', 'true');
  await expect(p.getByTestId('stone-note')).toContainText('Physical fire');
  // The shown note closes on any click on anything.
  await p.getByTestId('spell-description').click();
  await expect(p.getByTestId('stone-note')).toHaveCount(0);

  // The runes can be rearranged.
  await p.getByTestId('rune').first().getByRole('button', { name: 'Move right' }).click();
  await expect(p.getByTestId('rune').first()).toContainText('2');

  await p.getByTestId('spell-save').click();

  // An illegal draft is still saved, and marked.
  await p.getByTestId('spell-new').click();
  await p.getByTestId('spell-name').fill('Broken');
  await p.getByTestId('palette-virgo').click();
  await p.getByTestId('spell-save').click();
  await p.getByTestId('magic-drafts').click();
  await expect(p.getByTestId('draft')).toHaveCount(2);
  await expect(p.getByTestId('draft').filter({ hasText: 'Broken' }).getByTestId('draft-illegal')).toBeVisible();
  await expect(p.getByTestId('draft').filter({ hasText: 'Fire Bolt' }).getByTestId('draft-illegal')).toHaveCount(0);

  // Filters: by name, and by the stones used.
  await p.getByTestId('draft-search').fill('fire');
  await expect(p.getByTestId('draft')).toHaveCount(1);
  await p.getByTestId('draft-search').fill('');
  await p.getByTestId('filter-libra').click();
  await expect(p.getByTestId('draft')).toHaveCount(1);
  await p.getByTestId('filter-libra').click();

  // Crafting an illegal scheme is not offered; the legal one shows the stones it needs, then is crafted.
  await p.getByTestId('draft').filter({ hasText: 'Broken' }).getByTestId('draft-craft').click();
  await expect(p.getByRole('dialog').getByRole('button', { name: 'Craft', exact: true })).toBeDisabled();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await p.getByTestId('draft').filter({ hasText: 'Fire Bolt' }).getByTestId('draft-craft').click();
  await expect(p.getByTestId('craft-need').filter({ hasText: 'Virgo' })).toContainText('needs 2, you have 2');
  await expect(p.getByRole('dialog')).toContainText('Physical fire');
  await p.getByRole('dialog').getByRole('button', { name: 'Craft', exact: true }).click();

  // The finished spell has 5 uses (Taurus); the stones are spent; a Magic roll is in the chat.
  const spell = p.getByTestId('spell').filter({ hasText: 'Fire Bolt' });
  await expect(spell).toContainText('Uses 5/5');
  await expect(spell).toContainText('Stabilization 10');
  await p.getByTestId('magic-stones').click();
  await expect(p.getByTestId('stone-count-virgo')).toHaveValue('0');

  // Using it as a weapon puts it in the footer, with the Magic modifier.
  await p.getByTestId('magic-spells').click();
  await spell.getByTestId('spell-use').click();
  await expect(p.getByTestId('arcane-chosen')).toContainText('Fire Bolt');

  // The GM grants a Spell tattoo from the character's own Magic tab.
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();
  await gm.getByTestId('view-arcane').click();
  await gm.getByTestId('arcane-tab-magic').click();
  await gm.getByTestId('magic-spells').click();
  await gm.getByTestId('spell-grant').click();
  await gm.getByTestId('spell-edit-name').fill('Brand');
  await gm.getByTestId('spell-tattoo-toggle').check();
  await gm.getByTestId('icon-lightning').click();
  await gm.getByRole('dialog').getByRole('button', { name: 'Grant', exact: true }).click();
  const brand = p.getByTestId('spell').filter({ hasText: 'Brand' });
  await expect(brand.getByTestId('spell-tattoo')).toBeVisible();
  await expect(brand).toContainText('No uses');
  await expect(brand.getByTestId('damage-icon')).toHaveAttribute('data-kind', 'lightning');

  await ctx.close();
  await gmCtx.close();
});
