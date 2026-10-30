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

const stone = (page, sign) => page.getByTestId('scheme-stone').and(page.locator(`[data-sign="${sign}"]`)).first();
// Two taps on different stones draw an arrow; the pause keeps a tap on the same stone from counting as a double tap.
const arrow = async (page, from, to) => {
  await page.waitForTimeout(450);
  await from.click();
  await to.click();
};

test('Spell Circles: a second Circle built on the Release of the first, a row of runes for each, the magnifier, and crafting with every stone', async ({ browser }) => {
  const name = `Circle-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('arcane-tab-magic').click();
  await p.getByTestId('magic-stones').click();
  for (const [sign, n] of [['virgo', 1], ['aries', 1], ['leo', 1], ['gemini', 1]]) await setNumber(p, `stone-count-${sign}`, n);

  // Circle 1 as always: a Base and a Release.
  await p.getByTestId('magic-editor').click();
  await p.getByTestId('spell-name').fill('Twin Bolt');
  await expect(p.getByTestId('circle-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(p.getByTestId('circle-tab-2')).toHaveCount(0);
  await p.getByTestId('palette-virgo').click();
  await p.getByTestId('palette-aries').click();
  await arrow(p, stone(p, 'virgo'), stone(p, 'aries'));
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'true');
  await expect(p.getByTestId('special-base-glow')).toHaveCount(0);

  // A new Circle: it is empty and illegal until it has a Release, and the Release above it now has to lead into it.
  await p.getByTestId('circle-add').click();
  await expect(p.getByTestId('circle-tab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(p.getByTestId('scheme-circle')).toHaveCount(2);
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'false');
  await expect(p.getByTestId('scheme-status')).toContainText('Circle 2 needs exactly one Release stone');
  await expect(p.getByTestId('scheme-status')).toContainText('is the Base of the next Circle');
  await p.getByTestId('palette-leo').click();
  await p.getByTestId('palette-gemini').click();
  await expect(stone(p, 'leo')).toHaveAttribute('data-circle', '2');
  await expect(stone(p, 'virgo')).toHaveAttribute('data-circle', '1');
  // The Release of Circle 1 has the faded glow of a Base.
  await expect(stone(p, 'aries')).toHaveAttribute('data-base', 'true');
  await expect(p.getByTestId('special-base-glow')).toHaveCount(1);
  // It is drawn in the Bases row of Circle 2 (level with the Bases Circle 2 would add), not in a Release row of its own.
  const lane2Bases = p.getByTestId('scheme-lane').and(p.locator('[data-circle="2"][data-kind="base"]'));
  const laneBox = await lane2Bases.boundingBox();
  const releaseBox = await stone(p, 'aries').boundingBox();
  expect(releaseBox.y).toBeGreaterThan(laneBox.y);
  expect(releaseBox.y + releaseBox.height).toBeLessThan(laneBox.y + laneBox.height + 2);
  await expect(p.getByTestId('scheme-lane').and(p.locator('[data-circle="1"][data-kind="release"]'))).toHaveCount(0);
  await arrow(p, stone(p, 'aries'), stone(p, 'leo'));
  await arrow(p, stone(p, 'leo'), stone(p, 'gemini'));
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'true');

  // Spell Fine Tuning: one row for each Circle, typed one Circle at a time.
  await expect(p.getByTestId('rune-row')).toHaveCount(2);
  await p.getByTestId('rune-category-elements_essences').click();
  await p.getByTestId('rune-pick-fire').click(); // into Circle 2 (the Circle being worked on)
  await p.getByTestId('rune-row').and(p.locator('[data-circle="1"]')).click();
  await p.getByTestId('rune-category-logic').click();
  await p.getByTestId('rune-pick-if').click();
  await p.getByTestId('rune-pick-then').click();
  const rowRunes = (n) => p.getByTestId('rune-row').and(p.locator(`[data-circle="${n}"]`)).getByTestId('rune');
  await expect(rowRunes(1)).toHaveCount(2);
  await expect(rowRunes(2)).toHaveCount(1);
  await p.getByTestId('spell-save').click();

  // The draft says it is Circle 2, and its picture has a magnifying glass: half as big as the picture is tall, half transparent.
  await p.getByTestId('magic-drafts').click();
  const draft = p.getByTestId('draft').filter({ hasText: 'Twin Bolt' });
  await expect(draft.getByTestId('draft-circles')).toHaveAttribute('data-circles', '2');
  await expect(draft.getByTestId('draft-runes-rows')).toBeVisible();
  const zoomBtn = draft.getByTestId('draft-zoom');
  await expect(zoomBtn).toHaveCSS('opacity', '0.5');
  const picture = await draft.getByTestId('scheme-mini').boundingBox();
  const lens = await zoomBtn.boundingBox();
  expect(lens.width).toBeCloseTo(picture.height / 2, 0);
  expect(lens.height).toBeCloseTo(picture.height / 2, 0);

  // Opened large: every Circle, the glow, and the rows of runes along the tree.
  await zoomBtn.click();
  const zoom = p.getByTestId('spell-zoom');
  await expect(zoom).toBeVisible();
  await expect(zoom.getByTestId('zoom-circles')).toHaveAttribute('data-circles', '2');
  await expect(zoom.getByTestId('scheme-stone')).toHaveCount(4);
  await expect(zoom.getByTestId('special-base-glow')).toHaveCount(1);
  await expect(zoom.getByTestId('zoom-row')).toHaveCount(2);
  await expect(zoom.getByTestId('zoom-row').nth(0).getByTestId('rune')).toHaveCount(2);
  await expect(zoom.getByTestId('zoom-row').nth(1).getByTestId('rune')).toHaveCount(1);
  await zoom.getByTestId('zoom-close').click();
  await expect(p.getByTestId('spell-zoom')).toHaveCount(0);

  // Crafting needs the stones of every Circle at once, and gives one Circle 2 spell with both rows of runes.
  await draft.getByTestId('draft-craft').click();
  await expect(p.getByTestId('craft-need')).toHaveCount(4);
  await p.getByRole('dialog').getByRole('button', { name: 'Craft', exact: true }).click();
  const spell = p.getByTestId('spell').filter({ hasText: 'Twin Bolt' });
  await expect(spell.getByTestId('spell-circles')).toHaveAttribute('data-circles', '2');
  await expect(spell.getByTestId('rune-row-view')).toHaveCount(2);
  await expect(p.getByTestId('chat-panel').getByTestId('roll-title')).toHaveCount(0); // (the chat is closed: nothing to read here)

  // With a mouse (no touch screen) the magnifying glass is hidden until the pointer is over the picture, and fades in within 100 ms.
  const mouseCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
  const m = await mouseCtx.newPage();
  await m.goto('/');
  await m.getByTestId('pick-pc').filter({ hasText: name }).click();
  await m.getByTestId('view-arcane').click();
  await m.getByTestId('arcane-tab-magic').click();
  await m.getByTestId('magic-drafts').click();
  const lens2 = m.getByTestId('draft').filter({ hasText: 'Twin Bolt' }).getByTestId('draft-zoom');
  await expect(lens2).toHaveCSS('opacity', '0');
  await expect(lens2).toHaveCSS('transition-duration', '0.1s');
  await m.getByTestId('draft').filter({ hasText: 'Twin Bolt' }).getByTestId('scheme-mini').hover({ position: { x: 4, y: 4 } }); // over the picture, away from the glass itself
  await expect(lens2).toHaveCSS('opacity', '0.5');
  await mouseCtx.close();

  await ctx.close();
  await gmCtx.close();
});

test('Spell Circles: a saved draft is upgraded in place from its magnified view, and the last Circle can be removed again', async ({ browser }) => {
  const name = `Upgrade-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);
  const ctx = await phone(browser);
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('arcane-tab-magic').click();

  await p.getByTestId('spell-name').fill('Seed');
  await p.getByTestId('palette-virgo').click();
  await p.getByTestId('palette-aries').click();
  await arrow(p, stone(p, 'virgo'), stone(p, 'aries'));
  await p.getByTestId('spell-save').click();
  await p.getByTestId('magic-drafts').click();
  await expect(p.getByTestId('draft').filter({ hasText: 'Seed' }).getByTestId('draft-circles')).toHaveCount(0); // Circle 1 shows no badge

  // Add Circle in the magnified view opens the Editor on the new, empty Circle of the same draft.
  await p.getByTestId('draft').filter({ hasText: 'Seed' }).getByTestId('draft-zoom').click();
  await p.getByTestId('zoom-add-circle').click();
  await expect(p.getByTestId('spell-zoom')).toHaveCount(0);
  await expect(p.getByTestId('spell-name')).toHaveValue('Seed');
  await expect(p.getByTestId('circle-tab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(p.getByTestId('scheme-stone')).toHaveCount(2);
  await p.getByTestId('palette-gemini').click();
  await arrow(p, stone(p, 'aries'), stone(p, 'gemini'));
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'true');
  await p.getByTestId('spell-save').click();
  await p.getByTestId('magic-drafts').click();
  // The same draft, now Circle 2 (there is still just one draft of that name).
  await expect(p.getByTestId('draft').filter({ hasText: 'Seed' })).toHaveCount(1);
  await expect(p.getByTestId('draft').filter({ hasText: 'Seed' }).getByTestId('draft-circles')).toHaveAttribute('data-circles', '2');

  // The last Circle can be removed (with its stones) before saving.
  await p.getByTestId('draft').filter({ hasText: 'Seed' }).getByTestId('draft-edit').click();
  await p.getByTestId('circle-remove').click();
  await p.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(p.getByTestId('circle-tab-2')).toHaveCount(0);
  await expect(p.getByTestId('scheme-stone')).toHaveCount(2);
  await expect(p.getByTestId('scheme-status')).toHaveAttribute('data-legal', 'true');

  await ctx.close();
  await gmCtx.close();
});

test('Spell Stones say what they do when a mouse is over them, and the runes are read as a sentence under the chain', async ({ browser }) => {
  const name = `Tip-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  const open = async (ctx) => {
    const p = await ctx.newPage();
    await p.goto('/');
    await p.getByTestId('pick-pc').filter({ hasText: name }).click();
    await p.getByTestId('view-arcane').click();
    await p.getByTestId('arcane-tab-magic').click();
    return p;
  };
  const mouseCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
  const p = await open(mouseCtx);

  // The palette in the Editor, the stone on the table, and the Stones tab all explain a stone; it goes away with the mouse.
  await expect(p.getByTestId('stone-tip')).toHaveCount(0);
  await p.getByTestId('palette-virgo').hover();
  await expect(p.getByTestId('stone-tip')).toContainText('Records a physical phenomenon.');
  await expect(p.getByTestId('stone-tip')).toContainText('Virgo');
  await expect(p.getByTestId('stone-tip')).toContainText('Base');
  await p.getByTestId('palette-virgo').click();
  await p.getByTestId('palette-aries').click();
  await p.getByTestId('spell-name').hover();
  await expect(p.getByTestId('stone-tip')).toHaveCount(0);
  await stone(p, 'aries').hover();
  await expect(p.getByTestId('stone-tip')).toContainText('Aggressive release of the recorded phenomenon.');
  await expect(p.getByTestId('stone-tip')).toContainText('Release');
  await p.getByTestId('spell-name').hover();
  await expect(p.getByTestId('stone-tip')).toHaveCount(0);
  await p.getByTestId('magic-stones').click();
  await p.getByTestId('stone-leo').getByRole('button').hover();
  await expect(p.getByTestId('stone-tip')).toContainText('Creates a positive version of the recorded effect.');
  await p.getByTestId('magic-editor').click();

  // The sentence: the runes' names in the reader's language, small and right under the chain.
  await expect(p.getByTestId('rune-sentence')).toHaveCount(0); // (no runes yet)
  await p.getByTestId('rune-category-logic').click();
  await p.getByTestId('rune-pick-if').click();
  await p.getByTestId('rune-pick-then').click();
  await p.getByTestId('rune-category-elements_essences').click();
  await p.getByTestId('rune-pick-fire').click();
  const sentence = p.getByTestId('rune-sentence');
  await expect(sentence).toHaveText('If then fire.');
  const chain = await p.getByTestId('runes').boundingBox();
  const line = await sentence.boundingBox();
  expect(line.y).toBeGreaterThanOrEqual(chain.y + chain.height - 1);
  expect(line.y - (chain.y + chain.height)).toBeLessThan(12); // very close to the runes
  await expect(sentence).toHaveCSS('font-size', '11px'); // small
  await p.getByTestId('rune-backspace').click();
  await expect(sentence).toHaveText('If then.');
  await p.getByTestId('rune-pick-fire').click();
  await p.getByTestId('spell-name').fill('Sentence');
  await p.getByTestId('spell-save').click();

  // It is under the chain on the saved draft and in the large view too.
  await p.getByTestId('magic-drafts').click();
  const draft = p.getByTestId('draft').filter({ hasText: 'Sentence' });
  await expect(draft.getByTestId('rune-sentence')).toHaveText('If then fire.');
  await draft.getByTestId('draft-zoom').click();
  await expect(p.getByTestId('spell-zoom').getByTestId('rune-sentence')).toHaveText('If then fire.');
  await p.getByTestId('zoom-close').click();
  await mouseCtx.close();

  // In Russian: the stone's description and the sentence are Russian too.
  const ruCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
  await ruCtx.addInitScript(() => localStorage.setItem('tarrot.lang', 'ru'));
  const r = await open(ruCtx);
  await r.getByTestId('magic-drafts').click();
  await expect(r.getByTestId('draft').filter({ hasText: 'Sentence' }).getByTestId('rune-sentence')).toHaveText('Если то огонь.');
  await r.getByTestId('magic-editor').click();
  await r.getByTestId('palette-aries').click();
  await stone(r, 'aries').hover();
  await expect(r.getByTestId('stone-tip')).toContainText('Агрессивное высвобождение записанного явления.');
  await expect(r.getByTestId('stone-tip')).toContainText('Овен');
  await ruCtx.close();

  await gmCtx.close();
});
