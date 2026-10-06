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

// On a touch screen a tap opens the roll dialog; confirm it to roll.
async function rollNow(page, testId) {
  await page.getByTestId(testId).click();
  await page.getByTestId('roll-confirm').click();
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

  await rollNow(p.page, 'roll-skill-fine_motor_skills');
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

test('the roll dialog adds advantage levels and a custom modifier', async ({ browser }) => {
  const name = `Adv-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await p.page.getByTestId('roll-attr-strength').click(); // touch: opens the dialog
  await p.page.getByRole('button', { name: 'More levels' }).click();
  await expect(p.page.getByTestId('net-mode')).toContainText('Advantage 1');
  await p.page.getByRole('textbox', { name: 'Custom modifier' }).fill('2');
  await p.page.getByTestId('roll-confirm').click();
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-expression')).toHaveText('1d20 + 0(Strength) + 2(Custom)');
  await expect(card.getByTestId('roll-advantage')).toContainText('Advantage 1 (Manual)');

  await p.context.close();
  await gm.context.close();
});

test('negative numbers are typed directly; anything else is not saved', async ({ browser }) => {
  const name = `Neg-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  // Fields that can be negative use the full keyboard (no digit pad without a minus key).
  await expect(p.page.getByTestId('stat-value-luck')).toHaveAttribute('inputmode', 'text');
  await setNumber(p.page, 'stat-value-luck', -2);
  await p.page.reload();
  await expect(p.page.getByTestId('stat-value-luck')).toHaveValue('-2');

  // Non-numbers and out-of-range values revert instead of saving.
  for (const bad of ['abc', '1.5', '--1', '9', '-3', '']) {
    const field = p.page.getByTestId('stat-value-luck');
    await field.fill(bad);
    await field.press('Enter');
    await expect(field).toHaveValue('-2');
  }
  await expect(p.page.getByTestId('stat-value-luck-sign')).toHaveCount(0);

  await p.context.close();
  await gm.context.close();
});

test('the roll dialog previews the exact formula with every bonus source', async ({ browser }) => {
  const name = `Prev-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await setNumber(p.page, 'stat-value-dexterity', 3);
  await setNumber(p.page, 'tier-fine_motor_skills', 1);
  await p.page.getByTestId('roll-skill-fine_motor_skills').click();
  const preview = p.page.getByTestId('preview-expression');
  await expect(preview).toHaveText('1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills)');
  // One block only: the formula, with each bonus and where it comes from.
  await expect(p.page.getByTestId('net-mode')).toHaveCount(0);

  // The preview follows the edits.
  await p.page.getByRole('textbox', { name: 'Custom modifier' }).fill('-2');
  await expect(preview).toHaveText('1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills) - 2(Custom)');
  await p.page.getByRole('button', { name: 'Fewer levels' }).click();
  await expect(p.page.getByTestId('net-mode')).toContainText('2d20, keep the lowest');
  await expect(p.page.getByTestId('net-mode')).toContainText('Manual');

  // What was previewed is what is rolled.
  await p.page.getByTestId('roll-confirm').click();
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-expression')).toHaveText(
    '1d20 + 3(Dexterity) + 1(Mastery: Fine Motor Skills) - 2(Custom)',
  );

  await p.context.close();
  await gm.context.close();
});

test('Combat Mastery nameplates roll d20 + Mastery + Experience Modifier', async ({ browser }) => {
  const name = `Mast-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await setNumber(p.page, 'mastery-value-magic', 4);
  await setNumber(p.page, 'experience-value', 3);
  await rollNow(p.page, 'roll-mastery-magic');
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-title')).toHaveText('Magic (Combat Mastery Roll)');
  await expect(card.getByTestId('roll-expression')).toHaveText(
    '1d20 + 4(Mastery: Magic) + 3(Experience Modifier)',
  );

  await p.context.close();
  await gm.context.close();
});

test('statuses apply to a roll automatically, and the status list is readable', async ({ browser }) => {
  const name = `Dazed-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await p.page.getByTestId('add-status').click();
  const options = p.page.getByTestId('status-option');
  // Option boxes must not overlap each other.
  const boxes = [];
  for (let i = 0; i < 4; i++) boxes.push(await options.nth(i).boundingBox());
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
  await p.page.getByPlaceholder('Search').fill('Dazed');
  await options.first().click();
  // The status is set up first: how many stacks, how long it lasts (and, for Repeated, the DC of its Save).
  await p.page.getByTestId('status-add-stacks').fill('1');
  await p.page.getByTestId('status-add-duration-repeated').click();
  await expect(p.page.getByTestId('status-add-dc')).toBeVisible();
  await p.page.getByTestId('status-add-duration-minute').click();
  await expect(p.page.getByTestId('status-add-dc')).toHaveCount(0);
  await p.page.getByRole('dialog').getByRole('button', { name: 'Add status', exact: true }).click();
  await expect(p.page.getByTestId('status-group')).toContainText('1 Minute (5 rounds left)');
  await p.page.getByRole('button', { name: 'Increase Dazed' }).click();
  await expect(p.page.getByTestId('status')).toContainText('Dazed (2)');

  // Dazed (2) means 2 levels of Disadvantage on an Intelligence check, even without touching the options.
  await p.page.getByTestId('roll-attr-intelligence').click();
  await expect(p.page.getByTestId('net-mode')).toContainText('3d20, keep the lowest: Disadvantage 2 (Dazed 2)');
  await p.page.getByTestId('roll-confirm').click();
  const card = p.page.getByTestId('roll-card').last();
  await expect(card.getByTestId('roll-advantage')).toContainText('Disadvantage 2 (Dazed 2)');
  // The die that counts comes first, then the others: "kept | other | other".
  await expect(card.getByTestId('roll-dice')).toHaveText(/^\d+\|\d+\|\d+$/);
  const kept = Number(await card.getByTestId('roll-kept').innerText());
  for (const other of await card.getByTestId('roll-other').allInnerTexts()) expect(kept).toBeLessThanOrEqual(Number(other));
  // A physical roll is untouched.
  await p.page.getByTestId('chat-panel').getByRole('button', { name: 'Close' }).click();
  await rollNow(p.page, 'roll-attr-strength');
  await expect(p.page.getByTestId('roll-card').last().getByTestId('roll-advantage')).toHaveCount(0);

  await p.context.close();
  await gm.context.close();
});

test('an item state shows in a fixed-size tag before the uses', async ({ browser }) => {
  const name = `State-${uid()}`;
  const gm = await gmPage(browser);
  await createPc(gm.page, name);
  const p = await playerPage(browser, name);

  await p.page.getByTestId('add-item').click();
  await p.page.getByLabel('Name').fill('Sword');
  await p.page.getByRole('button', { name: 'Add', exact: true }).click();
  await p.page.getByTestId('item').getByRole('button').first().click();
  await p.page.getByRole('button', { name: 'Edit', exact: true }).click();
  await p.page.getByPlaceholder('New state').fill('Extremely long state name');
  await p.page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await p.page.locator('select:not([data-testid="size-select"])').selectOption('Extremely long state name');

  const tag = p.page.getByTestId('item-state');
  await expect(tag).toBeVisible();
  const box = await tag.boundingBox();
  expect(box.width).toBeGreaterThan(70);
  expect(box.width).toBeLessThan(100);
  expect(box.height).toBeLessThan(50);

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
