import { test, expect } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

const desktop = (browser) => browser.newContext({ viewport: { width: 1280, height: 800 } });
const phone = (browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function open(context, role) {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId(role).click();
  return page;
}

async function addTrack(gm, list, url, name) {
  const card = gm.getByTestId('playlist').filter({ hasText: list });
  await card.getByTestId('add-track').click();
  await gm.getByTestId('track-url').fill(url);
  await gm.getByTestId('track-name').fill(name);
  await gm.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
}

test('the GM builds a playlist and controls playback; the Display follows with a spinning record', async ({ browser }) => {
  const list = `Battle-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(tv.getByTestId('music-bar')).toHaveCount(0); // nothing playing yet

  await gm.getByTestId('music-bar').click();
  await gm.getByTestId('new-playlist-name').fill(list);
  await gm.getByTestId('new-playlist').click();
  await addTrack(gm, list, 'https://www.youtube.com/watch?v=aaaaaaaaaaa', 'Dragon Fight Music Long Name');
  await addTrack(gm, list, 'https://youtu.be/bbbbbbbbbbb', 'Quiet Tavern');
  const tracks = gm.getByTestId('playlist').filter({ hasText: list }).getByTestId('track');
  await expect(tracks).toHaveCount(2);

  // Playing the first track: the Display shows the first 15 characters of its name.
  await tracks.first().getByTestId('play-track').click();
  await expect(gm.getByTestId('now-title')).toHaveText('Dragon Fight Music Long Name');
  await expect(tv.getByTestId('music-title')).toHaveText('Dragon Fight Mu…');
  await expect(tv.getByTestId('music-record')).toHaveAttribute('data-playing', 'true');
  await expect(tracks.first()).toHaveAttribute('data-playing', 'true');

  await gm.getByTestId('pause').click();
  await expect(tv.getByTestId('music-record')).toHaveAttribute('data-playing', 'false');
  await gm.getByTestId('resume').click();
  await expect(tv.getByTestId('music-record')).toHaveAttribute('data-playing', 'true');

  await gm.getByTestId('next').click();
  await expect(tv.getByTestId('music-title')).toHaveText('Quiet Tavern');
  await gm.getByTestId('prev').click(); // less than 3 seconds in: goes back
  await expect(tv.getByTestId('music-title')).toHaveText('Dragon Fight Mu…');

  // Repeat cycles off, one, all; shuffle toggles.
  await expect(gm.getByTestId('repeat')).toHaveText('Repeat: off');
  await gm.getByTestId('repeat').click();
  await expect(gm.getByTestId('repeat')).toHaveText('Repeat: one');
  await gm.getByTestId('repeat').click();
  await expect(gm.getByTestId('repeat')).toHaveText('Repeat: playlist');
  await gm.getByTestId('shuffle').click();
  await expect(gm.getByTestId('shuffle')).toHaveAttribute('aria-pressed', 'true');

  // Moving a track keeps it playing.
  await gm.getByRole('button', { name: 'Move Dragon Fight Music Long Name down' }).click();
  await expect(tracks.first()).toContainText('Quiet Tavern');
  await expect(tracks.nth(1)).toHaveAttribute('data-playing', 'true');

  await gm.getByTestId('stop').click();
  await expect(tv.getByTestId('music-bar')).toHaveCount(0);

  // Clean up so other runs start empty.
  await gm.getByTestId('playlist').filter({ hasText: list }).getByRole('button', { name: 'Delete', exact: true }).click();
  await gm.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await tvCtx.close();
  await gmCtx.close();
});

test('the Display opens a volume control from its music bar, and it is remembered', async ({ browser }) => {
  const list = `Calm-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await gm.getByTestId('music-bar').click();
  await gm.getByTestId('new-playlist-name').fill(list);
  await gm.getByTestId('new-playlist').click();
  await addTrack(gm, list, 'https://youtu.be/ccccccccccc', 'Rain');
  await gm.getByTestId('playlist').filter({ hasText: list }).getByTestId('play-track').click();

  const tvCtx = await desktop(browser);
  const tv = await open(tvCtx, 'pick-display');
  await expect(tv.getByTestId('music-title')).toHaveText('Rain');
  await tv.getByTestId('music-bar').click({ button: 'right' });
  await expect(tv.getByTestId('volume-popover')).toBeVisible();
  await tv.getByTestId('volume-slider').fill('35');
  await expect(tv.getByTestId('volume-popover')).toContainText('35%');
  await tv.reload();
  await expect(tv.getByTestId('music-title')).toHaveText('Rain'); // joins late, still in sync
  await tv.getByTestId('music-bar').click({ button: 'right' });
  await expect(tv.getByTestId('volume-popover')).toContainText('35%');

  await gm.getByTestId('stop').click();
  await gm.getByTestId('playlist').filter({ hasText: list }).getByRole('button', { name: 'Delete', exact: true }).click();
  await gm.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await tvCtx.close();
  await gmCtx.close();
});

test('a link that is not YouTube is refused', async ({ browser }) => {
  const list = `Bad-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await gm.getByTestId('music-bar').click();
  await gm.getByTestId('new-playlist-name').fill(list);
  await gm.getByTestId('new-playlist').click();
  await gm.getByTestId('playlist').filter({ hasText: list }).getByTestId('add-track').click();
  await gm.getByTestId('track-url').fill('https://example.com/song.mp3');
  await gm.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(gm.getByRole('dialog').getByRole('alert')).toContainText('not a YouTube');
  await gm.getByRole('button', { name: 'Cancel' }).click();
  await gm.getByTestId('playlist').filter({ hasText: list }).getByRole('button', { name: 'Delete', exact: true }).click();
  await gm.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await gmCtx.close();
});

test('phones and players get no music at all', async ({ browser }) => {
  const pc = `Mute-${uid()}`;
  const gmCtx = await desktop(browser);
  const gm = await open(gmCtx, 'pick-gm');
  await gm.getByTestId('new-character').click();
  await gm.getByLabel('Name').fill(pc);
  await gm.getByRole('radio', { name: 'PC', exact: true }).click();
  await gm.getByRole('button', { name: 'Create' }).click();
  await expect(gm.getByRole('dialog')).toBeHidden();
  await expect(gm.getByTestId('music-bar')).toBeVisible();

  // A phone GM has no music bar.
  const phoneCtx = await phone(browser);
  const phoneGm = await open(phoneCtx, 'pick-gm');
  await expect(phoneGm.getByTestId('nav-scene')).toBeVisible();
  await expect(phoneGm.getByTestId('music-bar')).toHaveCount(0);

  // A desktop player has none either.
  const playerCtx = await desktop(browser);
  const player = await playerCtx.newPage();
  await player.goto('/');
  await player.getByTestId('pick-pc').filter({ hasText: pc }).click();
  await expect(player.getByTestId('sheet-name')).toHaveText(pc);
  await expect(player.getByTestId('music-bar')).toHaveCount(0);
  await expect(player.getByTestId('music-player-host')).toHaveCount(0);
  // (The server also refuses to let a player listen: covered in server/test/audio.test.js.)

  await playerCtx.close();
  await phoneCtx.close();
  await gmCtx.close();
});
