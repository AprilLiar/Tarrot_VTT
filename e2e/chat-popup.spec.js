import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

test('new messages pop up briefly while the chat is closed, and stack without overlapping', async ({ browser }) => {
  const pc = `Talker-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(pc);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('chat-toggle').click();

  // The GM's chat is closed: two quick messages appear one above the other, then vanish by themselves.
  await expect(gm.getByTestId('chat-panel')).toHaveCount(0);
  await p.getByTestId('chat-input').fill('first message');
  await p.getByTestId('chat-input').press('Enter');
  await expect(p.getByTestId('chat-input')).toHaveValue('');
  await p.getByTestId('chat-input').fill('second message');
  await p.getByTestId('chat-input').press('Enter');
  const popups = gm.getByTestId('chat-popup');
  await expect(popups).toHaveCount(2);
  await expect(popups.nth(0)).toContainText('first message');
  await expect(popups.nth(1)).toContainText('second message');
  const a = await popups.nth(0).boundingBox();
  const b = await popups.nth(1).boundingBox();
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + 1); // the older one is above, nothing overlaps
  await expect(popups).toHaveCount(0, { timeout: 6000 });

  // With the chat open there are no popups: the message is simply in the log.
  await gm.getByTestId('chat-toggle').click();
  await p.getByTestId('chat-input').fill('third message');
  await p.getByTestId('chat-input').press('Enter');
  await expect(gm.getByTestId('chat-log')).toContainText('third message');
  await expect(gm.getByTestId('chat-popup')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});

test('the Dice Tray rolls any mix of dice with a modifier, and pictures and GIFs can be posted', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await ctx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await gm.getByTestId('chat-toggle').click();

  // Two d6, a d20 and +2: the server rolls, one card for everyone.
  await gm.getByTestId('dice-tray-toggle').click();
  const die = (s) => gm.locator(`[data-testid="tray-die"][data-sides="${s}"]`);
  await die(6).click();
  await die(6).click();
  await die(20).click();
  await expect(die(6).getByTestId('tray-count')).toHaveText('2');
  await gm.getByTestId('tray-plus').click();
  await gm.getByTestId('tray-plus').click();
  await expect(gm.getByTestId('tray-modifier')).toHaveText('+2');
  await gm.getByTestId('tray-roll').click();
  const card = gm.getByTestId('dice-card').last();
  await expect(card.getByTestId('dice-expression')).toHaveText('2d6 + d20 + 2');
  await expect(card.getByTestId('dice-die')).toHaveCount(3);
  const values = await card.getByTestId('dice-die').evaluateAll((els) => els.map((e) => Number(e.lastChild.textContent)));
  await expect(card.getByTestId('dice-total')).toHaveText(String(values.reduce((a, b) => a + b, 0) + 2));
  await expect(gm.getByTestId('tray-count')).toHaveCount(0); // the tray is emptied

  // A GIF goes as it is; the line typed goes with it.
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await gm.getByTestId('chat-input').fill('a tiny gif');
  await gm.getByTestId('chat-picture-file').setInputFiles({ name: 'tiny.gif', mimeType: 'image/gif', buffer: gif });
  const pic = gm.getByTestId('chat-picture').last();
  await expect(pic).toContainText('a tiny gif');
  await expect(pic.getByTestId('chat-picture-image')).toBeVisible();
  await expect(gm.getByTestId('chat-input')).toHaveValue('');
  await pic.getByTestId('chat-picture-image').click();
  await expect(gm.getByTestId('chat-picture-full')).toBeVisible();
  await gm.getByTestId('chat-picture-full').click();
  await expect(gm.getByTestId('chat-picture-full')).toHaveCount(0);
  await ctx.close();
});
