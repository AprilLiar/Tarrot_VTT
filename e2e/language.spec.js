/* global document */
import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const desktop = (browser) => browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });

test('Settings on the picker switch the whole app to Russian, and the choice is remembered on the device', async ({ browser }) => {
  const ctx = await desktop(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByText('Who are you?')).toBeVisible();

  // Settings are reachable from the picker, before anyone is chosen.
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('lang-ru').click();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect(page.getByTestId('lang-ru')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-back').click();
  await expect(page.getByText('Кто вы?')).toBeVisible();
  await expect(page.getByTestId('pick-gm')).toContainText('Мастер игры');
  await expect(page.getByTestId('pick-display')).toContainText('Экран стола');

  // Remembered after a reload, and in the page's language attribute.
  await page.reload();
  await expect(page.getByText('Кто вы?')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  // The GM's screens are in Russian: roster, dialog, sheet, rolls in the chat.
  const name = `Тест-${uid()}`;
  await page.getByTestId('pick-gm').click();
  await expect(page.getByTestId('nav-characters')).toHaveText('Персонажи');
  await expect(page.getByTestId('nav-scene')).toHaveText('Сцена');
  await page.getByTestId('new-character').click();
  await expect(page.getByRole('dialog', { name: 'Новый персонаж' })).toBeVisible();
  await page.getByLabel('Имя').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByTestId('character-row').filter({ hasText: name }).click();
  await page.getByTestId('open-sheet').click();
  await expect(page.getByText('Очки действий')).toBeVisible();
  await expect(page.getByText('Физическая защита').first()).toBeVisible();
  await expect(page.getByTestId('skill-awareness')).toContainText('Внимательность');

  // A roll card: titles and the formula use the Russian names; the numbers stay.
  await page.getByTestId('roll-attr-strength').click();
  // On a touch screen (or with a right-click) the options dialog opens first; either way the dialog is in Russian.
  if (await page.getByTestId('roll-confirm').isVisible().catch(() => false)) {
    await expect(page.getByRole('dialog')).toContainText('Дополнительные уровни преимущества');
    await page.getByTestId('roll-confirm').click();
  }
  const card = page.getByTestId('roll-card').last();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('roll-title')).toHaveText('Проверка атрибута: Сила');
  await expect(card.getByTestId('roll-expression')).toContainText('(Сила)');

  // A status and its rule text.
  await page.getByTestId('add-status').click();
  await page.getByPlaceholder('Поиск').fill('Кровот');
  await expect(page.getByTestId('status-option')).toContainText('Кровотечение');
  await page.getByTestId('status-option').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить состояние', exact: true }).click(); // set up: how long it lasts
  await expect(page.getByTestId('status')).toContainText('чистого урона');

  // Server messages come in Russian too: an NPC cannot be a PC's Minion... use the GM-only guard instead.
  await page.getByTestId('switch-identity').click();
  await expect(page.getByText('Кто вы?')).toBeVisible();

  // Back to English from the picker.
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-en').click();
  await page.getByTestId('settings-back').click();
  await expect(page.getByText('Who are you?')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await ctx.close();
});

// A battle with a map: the same helpers as in battle.spec.js, kept short.
async function art(page, kind) {
  const b64 = await page.evaluate((kind) => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    c.width = kind === 'map' ? 1200 : 200;
    c.height = kind === 'map' ? 600 : 200;
    ctx.fillStyle = kind === 'map' ? '#3b6b3b' : '#e0a030';
    ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }, kind);
  return { name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('Combat lines and server errors are shown in the language of each reader', async ({ browser }) => {
  const pc = `Герой-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('open-settings').click();
  await gm.getByTestId('lang-ru').click();
  await gm.getByTestId('settings-back').click();
  await gm.getByTestId('pick-gm').click();

  // A PC, a scene with a battle map, and the PC's token.
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Имя').fill(pc);
  await gm.getByRole('button', { name: 'Создать' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await gm.getByTestId('nav-scene').click();
  await gm.getByTestId('open-scenes').click();
  await gm.getByTestId('new-scene').click();
  const scene = `Арена-${uid()}`;
  await gm.getByLabel('Имя').fill(scene);
  await gm.getByRole('button', { name: 'Создать' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  const row = gm.getByTestId('scene-row').filter({ hasText: scene });
  await row.getByRole('button').first().click();
  await row.getByTestId('battle-map-button').click();
  await gm.getByTestId('battle-file').setInputFiles(await art(gm, 'map'));
  await gm.getByRole('button', { name: 'Загрузить' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await row.getByTestId('activate-scene').click();
  await gm.getByTestId('scenes-drawer').getByRole('button', { name: 'Закрыть' }).click();
  await gm.getByTestId('mode-battle').click();

  // Starting a combat with nobody on the map is refused: the error is in Russian.
  await gm.getByTestId('combat-start').click();
  await expect(gm.getByRole('status')).toContainText('На карте нет персонажей для боя.');

  // With a token on the map the combat starts and the Combat line is in Russian.
  await gm.getByTestId('open-cast').click();
  const cast = gm.getByTestId('cast-row').filter({ has: gm.locator(`text="${pc}"`) });
  await cast.getByTestId('cast-pictures').click();
  await gm.getByTestId('picture-file').setInputFiles(await art(gm, 'face'));
  await expect(gm.getByTestId('picture')).toHaveCount(1);
  await gm.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();
  await cast.getByTestId('summon-cast').click();
  await expect(cast.getByTestId('dismiss-cast')).toContainText('Убрать фишку');
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Закрыть' }).click();
  await gm.getByTestId('combat-start').click();
  await gm.getByTestId('chat-toggle').click();
  await expect(gm.getByTestId('chat-log')).toContainText('Бой начинается. Бросайте инициативу.');
  await expect(gm.getByTestId('chat-log')).toContainText('Бой');

  // The same line for an English reader, from the same message.
  const enCtx = await desktop(browser);
  const en = await enCtx.newPage();
  await en.goto('/');
  await en.getByTestId('pick-gm').click();
  await en.getByTestId('chat-toggle').click();
  await expect(en.getByTestId('chat-log')).toContainText('Combat begins. Roll for Initiative.');
  await enCtx.close();
  await gmCtx.close();
});
