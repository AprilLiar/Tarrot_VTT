import { test, expect } from '@playwright/test';

// Unique names keep tests independent of whatever is already in the database.
const uid = () => Math.random().toString(36).slice(2, 8);

async function createCharacter(page, name, type) {
  await page.getByTestId('new-character').click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('radio', { name: type }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('GM creates a PC and an NPC; player sees only the PC and it is remembered', async ({
  browser,
}) => {
  const pc = `Aria-${uid()}`;
  const npc = `Goblin-${uid()}`;

  const gmContext = await browser.newContext();
  const gm = await gmContext.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await expect(gm.getByTestId('whoami')).toHaveText('Game Master');
  await createCharacter(gm, pc, 'PC');
  await createCharacter(gm, npc, 'NPC');
  await expect(gm.getByText(pc)).toBeVisible();
  await expect(gm.getByText(npc)).toBeVisible();

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto('/');
  await expect(player.getByTestId('pick-pc').filter({ hasText: pc })).toBeVisible();
  await expect(player.getByText(npc)).toHaveCount(0);

  await player.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(player.getByTestId('whoami')).toHaveText(pc);

  // Remembered on this device after a reload.
  await player.reload();
  await expect(player.getByTestId('whoami')).toHaveText(pc);

  // Switch returns to the picker.
  await player.getByTestId('switch-identity').click();
  await expect(player.getByTestId('pick-gm')).toBeVisible();

  await playerContext.close();
  await gmContext.close();
});

test('deleting a character sends its player back to the picker with a notice', async ({
  browser,
}) => {
  const pc = `Doomed-${uid()}`;

  const gmContext = await browser.newContext();
  const gm = await gmContext.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createCharacter(gm, pc, 'PC');

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto('/');
  await player.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(player.getByTestId('whoami')).toHaveText(pc);

  await gm.getByTestId('character-row').filter({ hasText: pc }).click();
  await gm.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = gm.getByRole('button', { name: 'Delete forever' });
  await expect(confirm).toBeDisabled();
  await gm.getByLabel('Type the name to confirm').fill(pc);
  await confirm.click();

  await expect(player.getByTestId('notice')).toContainText(pc);
  await expect(player.getByTestId('pick-gm')).toBeVisible();

  await playerContext.close();
  await gmContext.close();
});
