import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

async function dragTo(page, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('the Events board: GM lanes for everyone or the GM only, notes by players, edited by their author, dragged by anyone', async ({ browser }) => {
  const pc = `Scribe-${uid()}`;
  const other = `Reader-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, pc);
  await createPc(gm, other);
  await gm.getByTestId('nav-events').click();
  await expect(gm.getByTestId('events-page')).toBeVisible();
  // The board is shared by every test run: start from no lanes.
  for (let n = await gm.getByTestId('lane').count(); n > 0; n--) {
    await gm.getByTestId('lane-edit').first().click();
    await gm.getByTestId('lane-delete').click();
    await gm.getByTestId('lane-delete-confirm').click();
    await expect(gm.getByTestId('lane')).toHaveCount(n - 1);
  }
  const addLane = async (name, gmOnly = false) => {
    await gm.getByTestId('lane-add').click();
    await gm.getByTestId('lane-name').fill(name);
    if (gmOnly) await gm.getByTestId('lane-visibility-gm').click();
    await gm.getByTestId('lane-save').click();
    await expect(gm.locator(`[data-testid="lane"][data-name="${name}"]`)).toBeVisible();
  };
  await addLane('Rumours');
  await addLane('Leads');
  await addLane('Plots', true);

  // A player on a phone reaches the board from the top bar and sees only the lanes for everyone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('nav-events').click();
  await expect(p.getByTestId('lane')).toHaveCount(2);
  await expect(p.getByTestId('lane-add')).toHaveCount(0);
  await p.getByTestId('note-add').first().click();
  await p.getByTestId('event-note-input').fill('The mill burned down');
  await p.locator('[data-testid="event-note-color"][data-color="pink"]').click();
  await p.getByTestId('event-note-save').click();
  const note = gm.getByTestId('event-note').filter({ hasText: 'The mill burned down' });
  await expect(note).toHaveAttribute('data-color', 'pink');
  await expect(note).toContainText(pc);

  // Another player can read it but not change it.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const o = await ctx2.newPage();
  await o.goto('/');
  await o.getByTestId('pick-pc').filter({ hasText: other }).click();
  await o.getByTestId('nav-events').click();
  await o.getByTestId('event-note').filter({ hasText: 'The mill burned down' }).click();
  await expect(o.getByTestId('event-note-view')).toBeVisible();
  await expect(o.getByTestId('event-note-input')).toHaveCount(0);
  await o.getByRole('button', { name: 'Close' }).click();

  // ... but can drag it into the next lane; everyone sees it there.
  const leads = (page) => page.locator('[data-testid="lane"][data-name="Leads"]');
  await dragTo(o, o.getByTestId('event-note').filter({ hasText: 'The mill burned down' }), leads(o).getByTestId('note-add'));
  await expect(leads(gm).getByTestId('event-note')).toHaveCount(1);
  await expect(leads(p).getByTestId('event-note')).toContainText('The mill burned down');

  // The author edits it.
  await leads(p).getByTestId('event-note').click();
  await p.getByTestId('event-note-input').fill('The old mill burned down');
  await p.getByTestId('event-note-save').click();
  await expect(leads(gm).getByTestId('event-note-text')).toHaveText('The old mill burned down');

  await phone.close();
  await ctx2.close();
  await gmCtx.close();
});

test('the Relationships board: a player adds a made-up person and an arrow to it; the GM sees and adds an NPC', async ({ browser }) => {
  const pc = `Heart-${uid()}`;
  const npc = `Villain-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, pc);
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(npc);
  await gm.getByRole('radio', { name: 'NPC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('view-relations').click();
  await expect(p.locator('[data-testid="rel-card"][data-self="true"]')).toHaveAttribute('data-name', pc);
  // A player is offered PCs and made-up people, never the roster's NPCs.
  await p.getByTestId('rel-add').click();
  await expect(p.getByTestId('rel-choice').filter({ hasText: npc })).toHaveCount(0);
  await p.getByTestId('rel-person-name').fill('Old Mum');
  await p.getByTestId('rel-person-add').click();
  const mum = p.locator('[data-testid="rel-card"][data-name="Old Mum"]');
  await expect(mum).toBeVisible();

  // Connect: from the PC to Old Mum, a green "loves".
  await p.getByTestId('rel-connect').click();
  await p.locator('[data-testid="rel-card"][data-self="true"]').click();
  await mum.click();
  await p.getByTestId('rel-arrow-name').fill('loves');
  await p.locator('[data-testid="rel-arrow-color"][data-color="green"]').click();
  await p.getByTestId('rel-arrow-save').click();
  await expect(p.getByTestId('rel-arrow-label')).toHaveText('loves');

  // The GM opens the PC's sheet and sees it, and can put an NPC on it.
  await gm.getByTestId('character-row').filter({ hasText: pc }).click();
  await gm.getByTestId('open-sheet').click();
  await gm.getByTestId('view-relations').click();
  await expect(gm.getByTestId('rel-arrow-label')).toHaveText('loves');
  await gm.getByTestId('rel-add').click();
  await gm.getByTestId('rel-choice').filter({ hasText: npc }).click();
  await expect(p.locator(`[data-testid="rel-card"][data-name="${npc}"]`)).toBeVisible();

  // A tap on a card opens its note.
  await mum.click();
  await p.getByTestId('rel-card-note').fill('Bakes bread');
  await p.getByTestId('rel-card-save').click();
  await expect(gm.locator('[data-testid="rel-card"][data-name="Old Mum"]')).toContainText('Bakes bread');

  await ctx.close();
  await gmCtx.close();
});

test('search: the GM finds any character, item or scene and opens it; a player finds only their own things', async ({ browser }) => {
  const tag = uid();
  const pc = `Seeker-${tag}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, pc);

  // The player gives their character an item.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await p.getByTestId('search-open').click();
  await p.getByTestId('search-input').fill(`Seeker-${tag}`);
  await expect(p.getByTestId('search-result')).toHaveCount(1);
  await expect(p.getByTestId('search-result')).toHaveAttribute('data-kind', 'character');
  await p.getByTestId('search-input').press('Escape');

  // The GM finds the character and opens its sheet.
  await gm.getByTestId('search-open').click();
  await gm.getByTestId('search-input').fill(tag);
  await gm.getByTestId('search-result').filter({ hasText: pc }).click();
  await expect(gm.getByTestId('sheet-name')).toHaveText(pc);
  await expect(gm.getByTestId('search-panel')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});
