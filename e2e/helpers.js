/* global document */
import { expect } from '@playwright/test';

// Gives a character pictures on its sheet (the Cast list has no Pictures button: a PC's or NPC's pictures are added on its sheet), then
// goes back to the Scene page. `files` are Playwright file payloads.
export async function addPicturesOnSheet(page, name, files) {
  await page.getByTestId('nav-characters').click();
  await page.getByTestId('character-row').filter({ hasText: name }).click();
  await page.getByTestId('open-sheet').click();
  await expect(page.getByTestId('pictures')).toBeVisible();
  const before = await page.getByTestId('picture').count();
  await page.getByTestId('picture-file').setInputFiles(files);
  await expect(page.getByTestId('picture')).toHaveCount(before + files.length);
  await page.getByTestId('nav-scene').click();
}

// Character art drawn in the browser: a cut-out figure (a coloured block with transparent edges), so tests need no image files and the
// figure has a real, clickable size (only the visible part of a picture takes clicks).
export async function art(page, color = '#c0392b') {
  const b64 = await page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 420;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(40, 0, 160, 420);
    return c.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: `${color.replace('#', '')}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
