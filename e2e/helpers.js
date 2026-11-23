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

// Placing a token is two taps: its row in the Cast list, then a square on the map. This taps the first free square, scanning row by row
// as the server used to (so tests that count squares from the corner keep working). The Cast list must be open with the row visible; it is
// closed before the map is tapped (it covers the left of the screen).
export async function placeTokenAt(page, row, { size = 1, col: wantCol = null, row: wantRow = null } = {}) {
  await row.getByTestId('summon-cast').click();
  await expect(row.getByTestId('cast-placing')).toBeVisible();
  await page.getByTestId('cast-drawer').getByRole('button').first().click(); // its Close button
  await expect(page.getByTestId('place-banner')).toBeVisible();
  const map = page.getByTestId('battle-map');
  const grid = JSON.parse(await map.getAttribute('data-grid'));
  const taken = await page.getByTestId('battle-token').evaluateAll((els) => els.map((e) => [Number(e.dataset.col), Number(e.dataset.row), Number(e.dataset.size)]));
  const busy = (c, r) => taken.some(([tc, tr, ts]) => c < tc + ts && tc < c + size && r < tr + ts && tr < r + size);
  let spot = wantCol != null ? { c: wantCol, r: wantRow } : null;
  for (let r = 0; !spot && r + size <= grid.rows; r++) for (let c = 0; !spot && c + size <= grid.cols; c++) if (!busy(c, r)) spot = { c, r };
  const box = await map.boundingBox();
  const u = grid.ox + (spot.c + size / 2) * grid.cell;
  const v = grid.oy + (spot.r + size / 2) * grid.cell * grid.aspect;
  await page.mouse.click(box.x + u * box.width, box.y + v * box.height);
  await expect(page.getByTestId('place-banner')).toHaveCount(0);
}
