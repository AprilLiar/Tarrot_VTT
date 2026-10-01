import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

test('Help Dice: granted by a Spontaneous Action, asked before a roll, spent once; Temp HP bar', async ({ browser }) => {
  const name = `Helper-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();

  // The GM gives the character a Help Die and Temp HP with no targets (the actor gets them).
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();
  await gm.getByTestId('view-arcane').click();
  await gm.getByTestId('spontaneous-open').click();
  await gm.getByTestId('spont-help').check();
  await gm.getByTestId('spont-die-8').click();
  await gm.getByTestId('spont-temp').check();
  await gm.getByRole('dialog').getByRole('button', { name: 'Give', exact: true }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();

  await expect(p.getByTestId('help-track')).toHaveAttribute('data-count', '1');
  await expect(p.getByTestId('temp-hp')).not.toHaveValue('0');

  // A roll asks about the die; Proceed with nothing selected keeps it.
  await p.getByTestId('roll-attr-strength').click();
  await p.getByTestId('roll-confirm').click();
  await expect(p.getByTestId('help-dialog')).toBeVisible();
  await p.getByTestId('help-proceed').click();
  await expect(p.getByTestId('help-track')).toHaveAttribute('data-count', '1');
  await p.reload(); // closes the chat the roll opened
  await expect(p.getByTestId('help-track')).toHaveAttribute('data-count', '1');

  // Selecting then unselecting, then selecting again and proceeding spends it.
  await p.getByTestId('roll-attr-strength').click();
  await p.getByTestId('roll-confirm').click();
  const die = p.getByTestId('help-die');
  await die.click();
  await expect(die).toHaveAttribute('data-selected', 'true');
  await die.click();
  await expect(die).toHaveAttribute('data-selected', 'false');
  await die.click();
  await p.getByTestId('help-proceed').click();
  await expect(p.getByTestId('roll-card').last()).toContainText('d8');
  await expect(p.getByTestId('help-track')).toHaveAttribute('data-count', '0');
});
