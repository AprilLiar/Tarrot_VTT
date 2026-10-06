import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

test('Effects: the GM builds one from parts, puts it on a character, a Basic Action puts on Dodge, and both show on the sheet', async ({ browser }) => {
  const name = `Knight-${uid()}`;
  const effect = `Rage-${uid()}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await ctx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  // The general Arcane tab: the shipped Effects and Basic Actions are there, and the GM adds an Effect made of parts.
  await gm.getByTestId('nav-arcane').click();
  await expect(gm.locator('[data-testid="effect-card"][data-name="Full Dodge"]')).toBeVisible();
  await expect(gm.locator('[data-testid="basic-action"][data-name="Grapple"]')).toBeVisible();
  await gm.getByTestId('add-effect').click();
  await gm.getByTestId('effect-name').fill(effect);
  await gm.getByTestId('effect-duration-minute').click();
  await gm.getByTestId('effect-add-part').click(); // a Rolls part (all rolls)
  await gm.getByRole('textbox', { name: 'Advantage (negative: Disadvantage)' }).fill('2');
  await gm.getByTestId('effect-part-type').selectOption('defence');
  await gm.getByTestId('effect-add-part').click();
  await gm.getByRole('textbox', { name: 'Physical Defence' }).fill('3');
  await gm.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  const card = gm.locator(`[data-testid="effect-card"][data-name="${effect}"]`);
  await expect(card).toContainText('All rolls: Advantage 2');
  await expect(card).toContainText('Physical Defence +3');
  await expect(card).toContainText('1 Minute');

  // On the character: put it on, use Dodge, and see both on the sheet.
  await gm.getByTestId('nav-characters').click();
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();
  await gm.getByTestId('view-arcane').click();
  await gm.locator(`[data-testid="effect-card"][data-name="${effect}"]`).getByTestId('effect-give').click();
  await gm.locator('[data-testid="basic-action"][data-name="Dodge"]').getByTestId('action-use').click();
  await gm.getByTestId('view-sheet').click();
  await expect(gm.getByTestId('active-effect')).toHaveCount(2);
  await expect(gm.locator(`[data-testid="active-effect"][data-name="${effect}"]`)).toContainText('1 Minute (5 rounds left)');
  await expect(gm.locator('[data-testid="active-effect"][data-name="Dodge"]')).toContainText('Until start of next turn');
  await expect(gm.getByTestId('fx-hint').first()).toContainText('With Effects: 3'); // Physical Defence 0 + 3
  await expect(gm.getByTestId('ap-current')).toBeVisible();

  // An Effect with uses ended by hand: removed from the sheet.
  await gm.locator('[data-testid="active-effect"][data-name="Dodge"]').getByTestId('active-effect-remove').click();
  await expect(gm.getByTestId('active-effect')).toHaveCount(1);
  await ctx.close();
});
