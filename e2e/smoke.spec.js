import { test, expect } from '@playwright/test';

test('loads the picker over the socket', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tarrot VTT' })).toBeVisible();
  await expect(page.getByTestId('pick-gm')).toBeVisible();
});
