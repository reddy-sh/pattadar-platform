/**
 * FileViewer — seeded data-URL images: arrows, keyboard, Esc, and Download
 * saves via the download attribute (no tab — the founder hard rule).
 */
import { expect, openApp, test, uxCheck } from '../helpers/fixtures';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('viewer: arrows, keyboard, Esc and download-no-tab over seeded images', async ({ page }) => {
  await openApp(page, '/app');

  await page.evaluate((png) => {
    window.dispatchEvent(
      new CustomEvent('pattadar:view-files', {
        detail: {
          files: [
            { name: 'e2e-one.png', url: png },
            { name: 'e2e-two.png', url: png },
          ],
          index: 0,
        },
      }),
    );
  }, PNG);

  const viewer = page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('e2e-one.png')).toBeVisible();
  await expect(viewer.getByText('1 / 2')).toBeVisible();
  await expect(viewer.locator('img[alt="e2e-one.png"]')).toBeVisible();

  // Arrow buttons cycle.
  await viewer.getByRole('button', { name: 'Next file' }).click();
  await expect(viewer.getByText('e2e-two.png')).toBeVisible();
  await expect(viewer.getByText('2 / 2')).toBeVisible();
  await viewer.getByRole('button', { name: 'Previous file' }).click();
  await expect(viewer.getByText('e2e-one.png')).toBeVisible();

  // Keyboard cycles.
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('e2e-two.png')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(viewer.getByText('e2e-one.png')).toBeVisible();

  // Download saves the file — never opens a tab (auto fixture enforces).
  const download = page.waitForEvent('download');
  await viewer.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('e2e-one.png');

  await uxCheck(page, 'viewer');

  // Esc closes.
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});
