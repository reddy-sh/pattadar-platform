/** Throwaway: opens every standardized add-drawer and photographs it, so the
 *  shared shell's head / scrolling body / pinned footer can be looked at rather
 *  than reasoned about. Delete after review. */
import { test, expect } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

test.use({ allowConsole: true, allowEscapes: true });
test.describe.configure({ mode: 'serial' });

/** Papers and Media are deliberately absent: both add a FILE, and their "add a
 *  thing" is the operating system's own file picker. A panel in front of it asked
 *  a person to confirm a choice they had just made in a window that already
 *  showed them the names, the sizes and the thumbnails. What the panel was for
 *  is inline on those two hangers now — the size refusal, the stage line and the
 *  caption box beside the photograph it describes. */
const shots: [string, string, string][] = [
  ['features', `/app/records/${ID.parcel}/features`, 'Add a feature'],
  ['people', `/app/records/${ID.parcel}/people`, 'Assign someone'],
  ['notes', `/app/records/${ID.parcel}/notes`, 'Add a note'],
  ['money', `/app/records/${ID.parcel}/money`, 'Record a cost'],
];

for (const [name, url, label] of shots) {
  test(`drawer · ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await page.getByRole('button', { name: label }).first().click();
    const drawer = page.locator('aside.drawer');
    await expect(drawer).toBeVisible();
    // The three structural parts the shared shell promises.
    await expect(drawer.locator('.drawerhead h2')).toBeVisible();
    await expect(drawer.locator('.drawerfoot .btn.primary')).toBeVisible();
    await expect(drawer.locator('.drawerfoot').getByRole('button', { name: 'Cancel' }))
      .toBeVisible();
    await page.screenshot({ path: `/tmp/shots/${name}.png` });
    // And the eyebrow names the record, which the panel covers.
    await expect(drawer.locator('.drawerhead .eyebrow')).toContainText('Sy 214/2');
  });
}

test('drawer · the record add/edit drawer still works on the shared shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/properties');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const drawer = page.locator('aside.drawer');
  await expect(drawer.getByRole('heading', { name: 'Add a record' })).toBeVisible();
  await page.screenshot({ path: '/tmp/shots/record-add.png' });
  await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
  await drawer.locator('#rd-title').fill('Sy 999');
  await page.screenshot({ path: '/tmp/shots/record-add-form.png' });
});

test('drawer · the expense drawer still works on the shared shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/app/records/${ID.parcel}/expenses`);
  await page.getByRole('button', { name: 'Add an expense' }).first().click();
  const drawer = page.locator('aside.drawer');
  await expect(drawer.getByRole('heading', { name: 'Add an expense' })).toBeVisible();
  await page.screenshot({ path: '/tmp/shots/expense.png' });
});

test('drawer · a long form keeps its footer on screen', async ({ page }) => {
  // The reason the shell was restructured: the primary used to be the last row
  // of one scrolling panel, so on a long form the way to save was to scroll
  // looking for it.
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto(`/app/records/${ID.parcel}/features`);
  await page.getByRole('button', { name: 'Add a feature' }).first().click();
  const drawer = page.locator('aside.drawer');
  const foot = drawer.locator('.drawerfoot');
  await expect(foot).toBeInViewport();
  await drawer.locator('.drawerbody').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(foot).toBeInViewport();
  await page.screenshot({ path: '/tmp/shots/features-scrolled.png' });
});
