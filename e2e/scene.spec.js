import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

// A 1x1 red PNG. The app resizes and re-encodes uploads in the browser before sending.
const PNG = {
  name: 'art.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const desktop = (browser) => browser.newContext({ viewport: { width: 1280, height: 800 } });
const phone = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function open(context, role) {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId(role).click();
  return page;
}

async function gmPage(browser) {
  const context = await desktop(browser);
  const page = await open(context, 'pick-gm');
  return { context, page };
}

async function createCharacter(gm, name, type) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: type, exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

async function createAndActivateScene(gm, name) {
  await gm.getByTestId('nav-scene').click();
  await gm.getByTestId('open-scenes').click();
  await gm.getByTestId('new-scene').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByTestId('scene-file').setInputFiles(PNG);
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await gm.getByTestId('scene-row').filter({ hasText: name }).getByRole('button').first().click();
  await gm.getByTestId('activate-scene').click();
  await gm.getByTestId('scenes-drawer').getByRole('button', { name: 'Close' }).click();
  await expect(gm.getByTestId('scene-title')).toHaveText(name);
}

// Opens the Cast drawer, gives the character a picture if needed, and summons it.
async function summon(gm, name) {
  await gm.getByTestId('open-cast').click();
  const row = gm.getByTestId('cast-row').filter({ has: gm.locator(`text="${name}"`) });
  await row.getByTestId('cast-pictures').click();
  await gm.getByTestId('picture-file').setInputFiles(PNG);
  await expect(gm.getByTestId('picture')).toHaveCount(1);
  await gm.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await row.getByTestId('summon-cast').click();
  await expect(row.getByTestId('dismiss-cast')).toBeVisible();
  await gm.getByTestId('cast-drawer').getByRole('button', { name: 'Close' }).click();
}

const figure = (page, name) => page.getByTestId('stage-figure').filter({ has: page.getByText(name, { exact: true }) });

test('the GM builds a scene; the Display shows it with PCs on the left and NPCs on the right', async ({ browser }) => {
  const pc = `Aria-${uid()}`;
  const npc = `Goblin-${uid()}`;
  const scene = `Tavern-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, pc, 'PC');
  await createCharacter(gm.page, npc, 'NPC');

  const tv = await desktop(browser);
  const display = await open(tv, 'pick-display');

  await createAndActivateScene(gm.page, scene);
  await expect(display.getByTestId('scene-background')).toBeVisible();
  await summon(gm.page, pc);
  await summon(gm.page, npc);

  await expect(figure(display, pc)).toBeVisible();
  await expect(figure(display, npc)).toBeVisible();
  await expect(display.getByTestId('name-plaque').filter({ hasText: pc })).toBeVisible();
  const left = await figure(display, pc).boundingBox();
  const right = await figure(display, npc).boundingBox();
  expect(left.x).toBeLessThan(right.x);
  // The Display has no drawers, chat or roster.
  await expect(display.getByTestId('open-cast')).toHaveCount(0);
  await expect(display.getByTestId('chat-toggle')).toHaveCount(0);

  // With no active scene the Display waits.
  await gm.page.getByTestId('open-scenes').click();
  await gm.page.getByTestId('scene-row').filter({ hasText: scene }).getByRole('button').first().click();
  await gm.page.getByTestId('deactivate-scene').click();
  await expect(display.getByTestId('no-scene')).toBeVisible();

  await tv.close();
  await gm.context.close();
});

test('Hide makes a character vanish for the Display and desktop players, and half-transparent for the GM', async ({ browser }) => {
  const pc = `Hero-${uid()}`;
  const npc = `Ghost-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, pc, 'PC');
  await createCharacter(gm.page, npc, 'NPC');
  await createAndActivateScene(gm.page, `Crypt-${uid()}`);
  await summon(gm.page, pc);
  await summon(gm.page, npc);

  const tv = await desktop(browser);
  const display = await open(tv, 'pick-display');
  const playerCtx = await desktop(browser);
  const player = await playerCtx.newPage();
  await player.goto('/');
  await player.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await player.getByTestId('nav-scene').click();
  await expect(figure(display, npc)).toBeVisible();
  await expect(figure(player, npc)).toBeVisible();

  // Right-click opens the circles: Token Settings and Hide.
  await figure(gm.page, npc).click({ button: 'right' });
  await expect(gm.page.getByTestId('menu-settings')).toBeVisible();
  await gm.page.getByTestId('menu-hide').click();
  await expect(figure(gm.page, npc)).toHaveAttribute('data-hidden', 'true');

  await expect(figure(display, npc)).toHaveCount(0);
  await expect(figure(player, npc)).toHaveCount(0);
  await expect(display.getByText(npc)).toHaveCount(0); // the name plaque is gone too
  await expect(figure(gm.page, npc)).toHaveAttribute('data-hidden', 'true');
  await expect(figure(gm.page, npc)).toHaveClass(/opacity-50/);
  // The other character is unaffected.
  await expect(figure(display, pc)).toBeVisible();

  // Reveal brings it back for everyone.
  await figure(gm.page, npc).click({ button: 'right' });
  await expect(gm.page.getByTestId('menu-hide')).toHaveText('Reveal');
  await gm.page.getByTestId('menu-hide').click();
  await expect(figure(display, npc)).toBeVisible();
  await expect(figure(player, npc)).toBeVisible();

  await playerCtx.close();
  await tv.close();
  await gm.context.close();
});

test('Token Settings changes the size and removes a character from the stage', async ({ browser }) => {
  const npc = `Troll-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, npc, 'NPC');
  await createAndActivateScene(gm.page, `Bridge-${uid()}`);
  await summon(gm.page, npc);

  const tv = await desktop(browser);
  const display = await open(tv, 'pick-display');
  const before = await figure(display, npc).boundingBox();

  await figure(gm.page, npc).click({ button: 'right' });
  await gm.page.getByTestId('menu-settings').click();
  const slider = gm.page.getByTestId('scale-slider');
  await slider.fill('0.5');
  await slider.dispatchEvent('pointerup');
  await expect.poll(async () => (await figure(display, npc).boundingBox()).height).toBeLessThan(before.height * 0.7);

  await gm.page.getByTestId('dismiss').click();
  await expect(figure(display, npc)).toHaveCount(0);

  await tv.close();
  await gm.context.close();
});

test('the Display can zoom and pan its own view without affecting anyone else', async ({ browser }) => {
  const gm = await gmPage(browser);
  await createAndActivateScene(gm.page, `Hall-${uid()}`);
  const tv = await desktop(browser);
  const display = await open(tv, 'pick-display');

  await display.getByTestId('zoom-in').click();
  await display.getByTestId('zoom-in').click();
  await expect(display.getByTestId('zoom-reset')).not.toHaveText('100%');
  const transform = await display.getByTestId('scene-world').evaluate((el) => el.style.transform);
  expect(transform).toMatch(/scale\((1\.\d+|[2-4])/);
  await expect(gm.page.getByTestId('scene-world')).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, 0\)|none/);

  await display.getByTestId('zoom-reset').click();
  await expect(display.getByTestId('zoom-reset')).toHaveText('100%');

  await tv.close();
  await gm.context.close();
});

test('the Display can drag a character to reorder its side for everyone', async ({ browser }) => {
  const a = `Alpha-${uid()}`;
  const b = `Beta-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, a, 'NPC');
  await createCharacter(gm.page, b, 'NPC');
  await createAndActivateScene(gm.page, `Arena-${uid()}`);
  await summon(gm.page, a);
  await summon(gm.page, b);

  const order = async (page) =>
    page.getByTestId('side-right').getByTestId('stage-figure').evaluateAll((els) =>
      els.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left).map((e) => e.dataset.name),
    );

  const tv = await desktop(browser);
  const display = await open(tv, 'pick-display');
  await expect(figure(display, b)).toBeVisible();
  const before = await order(display);
  // The first-summoned character stands nearest the edge (right-most).
  expect(before).toEqual([b, a]);

  const box = await figure(display, a).boundingBox();
  const other = await figure(display, b).boundingBox();
  await display.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await display.mouse.down();
  await display.mouse.move(other.x + 5, box.y + box.height / 2, { steps: 8 });
  await display.mouse.up();

  await expect.poll(() => order(gm.page)).toEqual([a, b]);
  await expect.poll(() => order(display)).toEqual([a, b]);

  await tv.close();
  await gm.context.close();
});

test('a phone player has no Scene, but can join and leave the stage from the sheet', async ({ browser }) => {
  const pc = `Mobi-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, pc, 'PC');
  await createAndActivateScene(gm.page, `Camp-${uid()}`);

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(p.getByTestId('sheet-name')).toHaveText(pc);
  await expect(p.getByTestId('nav-scene')).toHaveCount(0);
  await p.goto('/scene');
  await expect(p.getByTestId('sheet-name')).toHaveText(pc); // redirected back, no Scene on a phone

  await p.getByTestId('join-stage').click(); // no picture yet
  await expect(p.getByRole('status').filter({ hasText: 'Add a picture' })).toBeVisible();
  await p.getByTestId('picture-file').setInputFiles(PNG);
  await expect(p.getByTestId('picture')).toHaveCount(1);
  await p.getByTestId('join-stage').click();
  await expect(p.getByTestId('leave-stage')).toBeVisible();
  await expect(figure(gm.page, pc)).toBeVisible();

  await p.getByTestId('leave-stage').click();
  await expect(p.getByTestId('join-stage')).toBeVisible();
  await expect(figure(gm.page, pc)).toHaveCount(0);

  await ctx.close();
  await gm.context.close();
});

test('a phone GM sees the scene and can hide a character by tapping it', async ({ browser }) => {
  const npc = `Imp-${uid()}`;
  const gm = await gmPage(browser);
  await createCharacter(gm.page, npc, 'NPC');
  await createAndActivateScene(gm.page, `Lair-${uid()}`);
  await summon(gm.page, npc);

  const ctx = await phone(browser);
  const p = await open(ctx, 'pick-gm');
  await p.getByTestId('nav-scene').click();
  await expect(figure(p, npc)).toBeVisible();
  await figure(p, npc).tap();
  await p.getByTestId('menu-hide').tap();
  await expect(figure(p, npc)).toHaveAttribute('data-hidden', 'true');

  await ctx.close();
  await gm.context.close();
});
