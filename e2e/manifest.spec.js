import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function createPc(gm, name) {
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(name);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

test('Manifest: the GM makes Tarot Cards and a Manifestation; the player swaps the card and uses the gift; the GM locks parts', async ({ browser }) => {
  const name = `Seer-${uid()}`;
  const fool = `Fool-${uid()}`;
  const tower = `Tower-${uid()}`;
  const gift = `Sunbrand-${uid()}`;
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await gmCtx.newPage();
  await gm.goto('/');
  await gm.getByTestId('pick-gm').click();
  await createPc(gm, name);

  // The GM works in the character's own Manifest tab.
  await gm.getByTestId('character-row').filter({ hasText: name }).click();
  await gm.getByTestId('open-sheet').click();
  await gm.getByTestId('view-arcane').click();
  await gm.getByTestId('arcane-tab-manifest').click();
  for (const card of [fool, tower]) {
    await gm.getByTestId('tarot-add').click();
    await gm.getByTestId('tarot-name').fill(card);
    await gm.getByTestId('tarot-text').fill('Its meaning.');
    await gm.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(gm.getByTestId('tarot-card').filter({ hasText: card })).toBeVisible();
  }
  await gm.getByTestId('manifest-manifestations').click();
  await gm.getByTestId('manifestation-add').click();
  await gm.getByTestId('manifestation-name').fill(gift);
  await gm.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(gm.getByTestId('manifestation').filter({ hasText: gift })).toBeVisible();

  // The player: the first card is active (golden), Swap Card changes it, the gift can be the weapon.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByTestId('pick-pc').filter({ hasText: name }).click();
  await p.getByTestId('view-arcane').click();
  await p.getByTestId('arcane-tab-manifest').click();
  await expect(p.getByTestId('tarot-card').filter({ hasText: fool })).toHaveAttribute('data-active', 'true');
  await expect(p.getByTestId('tarot-add')).toHaveCount(0); // players cannot make cards
  await expect(p.getByTestId('tarot-transfer')).toHaveCount(0);
  await p.getByTestId('tarot-swap').click();
  await p.getByTestId('tarot-choose').filter({ hasText: tower }).click();
  await expect(p.getByTestId('tarot-card').filter({ hasText: tower })).toHaveAttribute('data-active', 'true');
  await expect(p.getByTestId('tarot-card').filter({ hasText: fool })).toHaveAttribute('data-active', 'false');
  await p.getByTestId('manifest-manifestations').click();
  await expect(p.getByTestId('manifestation-add')).toHaveCount(0);
  await p.getByTestId('manifestation').filter({ hasText: gift }).getByTestId('manifestation-use').click();
  await expect(p.getByTestId('arcane-chosen')).toContainText(gift);

  // The GM transfers the active card away.
  await gm.getByTestId('manifest-tarot').click();
  await gm.getByTestId('tarot-card').filter({ hasText: tower }).getByTestId('tarot-transfer').click();
  await expect(gm.getByRole('dialog').getByRole('button', { name: 'Transfer', exact: true })).toBeDisabled();
  await gm.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Locks: in the general Arcane tab the GM enters locking mode.
  await gm.getByTestId('nav-arcane').click();
  await gm.getByTestId('lock-mode').click();
  await expect(gm.getByTestId('lock-hint')).toBeVisible();
  await gm.getByTestId('arcane-tab-magic').click(); // opens it
  await gm.getByTestId('arcane-tab-magic').click(); // locks it
  await expect(gm.getByTestId('arcane-tab-magic')).toHaveAttribute('data-locked', 'true');
  await gm.getByTestId('arcane-tab-manifest').click();
  await gm.getByTestId('lock-tile-tarot').click();
  await expect(gm.getByTestId('lock-tile-tarot')).toHaveAttribute('data-locked', 'true');
  await gm.getByTestId('arcane-tab-stances').click();
  await gm.getByTestId('stance-sign-aries').click();
  await expect(gm.getByTestId('stance-sign-aries')).toHaveAttribute('data-locked', 'true');

  // The player sees blurred pictures where things are locked, live; the rest still works.
  await p.getByTestId('arcane-tab-magic').click();
  await expect(p.getByTestId('locked')).toContainText('You have not learned what this means for now');
  await expect(p.getByTestId('magic')).toHaveCount(0);
  await p.getByTestId('arcane-tab-manifest').click();
  await p.getByTestId('manifest-tarot').click();
  await expect(p.getByTestId('locked')).toBeVisible();
  await expect(p.getByTestId('tarot-card')).toHaveCount(0);
  await p.getByTestId('manifest-manifestations').click();
  await expect(p.getByTestId('manifestation').filter({ hasText: gift })).toBeVisible();
  await p.getByTestId('arcane-tab-stances').click();
  await p.getByTestId('stance-sign-aries').click();
  await expect(p.getByTestId('locked')).toBeVisible();
  await p.getByTestId('stance-back').click();
  await p.getByTestId('stance-sign-leo').click();
  await expect(p.getByTestId('stance-name')).toHaveText('Leo');

  // Unlocking brings everything back, and the GM never sees a blur.
  await gm.getByTestId('stance-sign-aries').click();
  await gm.getByTestId('arcane-tab-manifest').click();
  await gm.getByTestId('lock-tile-tarot').click();
  await gm.getByTestId('arcane-tab-magic').click(); // opens it
  await gm.getByTestId('arcane-tab-magic').click(); // unlocks it
  await expect(gm.getByTestId('arcane-tab-magic')).toHaveAttribute('data-locked', 'false');
  await p.getByTestId('arcane-tab-magic').click();
  await expect(p.getByTestId('magic')).toBeVisible();
  await expect(p.getByTestId('locked')).toHaveCount(0);

  await ctx.close();
  await gmCtx.close();
});
