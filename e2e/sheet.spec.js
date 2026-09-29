import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function gmPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('pick-gm').click();
  await expect(page.getByTestId('whoami')).toHaveText('Game Master');
  return { context, page };
}

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

async function playerPage(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('pick-pc').filter({ hasText: name }).click();
  await expect(page.getByTestId('sheet-name')).toHaveText(name);
  return { context, page };
}

async function setNumber(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(String(value));
  await field.press('Enter');
  await expect(field).toHaveValue(String(value));
}

test('a player edits their sheet and rolls into the chat with a full breakdown', async ({ browser }) => {
  const name = `Roller-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await setNumber(p.page, 'stat-value-dexterity', 3);
  await setNumber(p.page, 'tier-fine_motor_skills', 1);

  // The edit is saved: it survives a reload.
  await p.page.reload();
  await expect(p.page.getByTestId('stat-value-dexterity')).toHaveValue('3');

  await p.page.getByTestId('roll-skill-fine_motor_skills').click();
  await expect(p.page.getByTestId('chat-panel')).toBeVisible();
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-title')).toHaveText('Fine Motor Skills (Skill Roll)');
  await expect(card.getByTestId('roll-expression')).toHaveText(
    '1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills)',
  );
  const total = Number(await card.getByTestId('roll-total').innerText());
  expect(total).toBeGreaterThanOrEqual(5);
  expect(total).toBeLessThanOrEqual(24);

  // Everyone sees the roll: the GM's chat receives it live.
  await gm.page.getByTestId('chat-toggle').click();
  await expect(gm.page.getByTestId('roll-card').last().getByTestId('roll-expression')).toHaveText(
    '1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills)',
  );

  await p.context.close();
  await gm.context.close();
});

test('a right-click on a roll button opens options for advantage and a modifier', async ({ browser }) => {
  const name = `Adv-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await p.page.getByTestId('roll-attr-strength').click({ button: 'right' });
  await p.page.getByRole('radio', { name: 'Advantage', exact: true }).click();
  await p.page.getByLabel('Custom modifier').fill('2');
  await p.page.getByRole('dialog').getByRole('button', { name: 'Roll', exact: true }).click();
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-expression')).toHaveText('1d20 + 0(Strength) + 2(Custom)');
  await expect(card).toContainText('Advantage: rolled');

  await p.context.close();
  await gm.context.close();
});

test('an item is only sent after the other player accepts', async ({ browser }) => {
  const a = `Giver-${uid()}`;
  const b = `Taker-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, a);
  await createPc(gm.page, b);
  const pa = await playerPage(browser, a);
  const pb = await playerPage(browser, b);

  await pa.page.getByTestId('add-item').click();
  await pa.page.getByLabel('Name').fill('Ruby');
  await pa.page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pa.page.getByTestId('item')).toContainText('Ruby');

  await pa.page.getByTestId('item').getByRole('button').first().click(); // expand
  await pa.page.getByTestId('send-item').click();
  await pa.page.getByRole('radio', { name: new RegExp(b) }).click();
  await pa.page.getByRole('button', { name: 'Send offer' }).click();

  await expect(pb.page.getByTestId('trade-offer')).toContainText('Ruby');
  await expect(pb.page.getByTestId('item')).toHaveCount(0); // nothing moves before accepting
  await pb.page.getByTestId('trade-accept').click();

  await expect(pb.page.getByTestId('item')).toContainText('Ruby');
  await expect(pa.page.getByTestId('item')).toHaveCount(0);

  await pa.context.close();
  await pb.context.close();
  await gm.context.close();
});

test('the GM can open any sheet and clear the chat; the player cannot', async ({ browser }) => {
  const name = `Chatty-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await p.page.getByTestId('chat-toggle').click();
  await expect(p.page.getByTestId('chat-clear')).toHaveCount(0);
  await p.page.getByTestId('chat-input').fill('hello table');
  await p.page.getByRole('button', { name: 'Send' }).click();
  await expect(p.page.getByTestId('chat-text').last()).toContainText('hello table');

  await gm.page.getByTestId('chat-toggle').click();
  await expect(gm.page.getByTestId('chat-text').last()).toContainText('hello table');
  await gm.page.getByTestId('chat-clear').click();
  await gm.page.getByTestId('chat-clear-confirm').click();
  await expect(gm.page.getByTestId('chat-text')).toHaveCount(0);
  await expect(p.page.getByTestId('chat-text')).toHaveCount(0);

  // The GM opens the player's sheet from the roster.
  await gm.page.getByTestId('chat-panel').getByRole('button', { name: 'Close' }).click();
  await gm.page.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.page.getByTestId('open-sheet').click();
  await expect(gm.page.getByTestId('sheet-name')).toHaveText(name);

  await p.context.close();
  await gm.context.close();
});
