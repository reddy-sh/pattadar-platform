/** Throwaway: when does the "The paper is filed." toast actually appear, and how
 *  long does the filing take? Delete after review. */
import { test, expect, World } from '../fixtures/harness';
import { ID } from '../fixtures/ids';
import { PAPERS } from '../fixtures/seed';

test.use({ allowConsole: true, allowEscapes: true });

test('probe · toast after filing a paper', async ({ page, world }) => {
  world.route(/\/api\/gateway\/storage\/files\?/, () => ({
    json: { id: 'file-uploaded-probe', name: 'IMG_4482.pdf', sizeBytes: 5_120, mimeType: 'application/pdf' },
  }));
  const filed: Record<string, unknown>[] = [];
  world.set('papers', (vars) => (String(vars.id) === ID.parcel
    ? [...(PAPERS[ID.parcel] as Record<string, unknown>[]), ...filed] : []));
  world.set('addPaper', (vars) => {
    filed.push({
      id: `w-probe-${filed.length + 1}`, title: String(vars.name), detail: String(vars.subtitle),
      shelf: String(vars.shelf || 'unsorted'), icon: 'paper', tags: [], shared: false,
      pageCount: 0, fileRef: String(vars.fileRef),
    });
    return `w-probe-${filed.length}`;
  });

  await page.goto(`/app/records/${ID.parcel}`);
  await page.locator('header.sechead').getByRole('button', { name: 'Add a paper' }).click();
  await expect(page.getByRole('dialog', { name: /^File a paper$/ })).toBeVisible();
  await page.getByLabel('Add a paper to this record').setInputFiles({
    name: 'IMG_4482.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5_120),
  });

  const t0 = Date.now();
  await page.getByRole('button', { name: 'File the paper' }).click();

  await expect.poll(() => world.calls('addPaper').length, { timeout: 60_000 }).toBe(1);
  console.log(`PROBE addPaper landed after ${Date.now() - t0}ms`);

  for (const wait of [0, 200, 500, 1000, 2000, 4000, 8000]) {
    if (wait) await page.waitForTimeout(wait);
    const at = Date.now() - t0;
    const toasts = await page.locator('.toast').count();
    const dialogs = await page.getByRole('dialog').count();
    const status = await page.locator('.drawer [role=status]').count();
    const primary = dialogs
      ? await page.locator('.drawerfoot .btn.primary').innerText().catch(() => '?')
      : '-';
    console.log(`PROBE +${at}ms .toast=${toasts} dialog=${dialogs} status=${status} primary="${primary}"`);
    if (toasts) console.log(`PROBE   toast: ${await page.locator('.toast').innerText()}`);
    if (status) console.log(`PROBE   notice: ${await page.locator('.drawer [role=status]').innerText()}`);
  }
});
