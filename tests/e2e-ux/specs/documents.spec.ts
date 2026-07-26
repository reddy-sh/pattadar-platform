/**
 * Documents — both tabs, rows with type chips, row Open goes through the
 * in-portal FileViewer (NEVER a tab), the deed expander shows fees, and the
 * deed-import dialog opens with its AI upload panel.
 */
import { expect, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface DocsData {
  documents: { id: string; fileRef: string | null; docType: string | null }[];
}

test('tabs render; document rows carry type chips', async ({ page, request }) => {
  const d = await gql<DocsData>(request, 'query { documents { id fileRef docType } }');
  await openApp(page, '/app/documents');
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'All documents' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Registered deeds' })).toBeVisible();

  if (d.documents.length > 0) {
    await expect.poll(() => page.locator('tbody tr').count(), { message: 'document rows render' }).toBeGreaterThan(0);
    // Type column chip on the first row.
    await expect(page.locator('tbody tr').first().locator('.MuiChip-root').first()).toBeVisible();
  }
  await uxCheck(page, 'documents:all');
});

test('row Open goes through the FileViewer dialog — never a tab', async ({ page, request }) => {
  const d = await gql<DocsData>(request, 'query { documents { id fileRef docType } }');
  test.skip(!d.documents.some((x) => x.fileRef), 'no documents with files in the dataset');
  await openApp(page, '/app/documents');
  await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(0);

  // Click the first row's name cell (rows with a fileRef open the viewer).
  await page.locator('tbody tr td').first().click();
  const viewer = page.getByRole('dialog');
  await expect(viewer, 'the in-portal FileViewer must open').toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Close viewer' })).toBeVisible();
  // Locally the bytes live on the cloud gateway → the viewer's own graceful
  // error is acceptable; a new tab is not (enforced by the auto fixture).
  await uxCheck(page, 'documents:viewer');
  await viewer.getByRole('button', { name: 'Close viewer' }).click();
  await expect(viewer).toBeHidden();
});

test('registered deeds: expander reveals the fee breakup', async ({ page }) => {
  await openApp(page, '/app/documents');
  await page.getByRole('tab', { name: 'Registered deeds' }).click();

  const expanders = page.getByRole('button', { name: 'Expand deed' });
  const n = await expanders.count();
  test.skip(n === 0, 'no registered deeds in the dataset — expander not reachable');

  await expanders.first().click();
  await expect(page.getByText('Consideration', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Stamp Duty', { exact: true }).first()).toBeVisible();
  await uxCheck(page, 'documents:deed-expander');
});

test('deed-import dialog opens with the AI upload panel', async ({ page }) => {
  await openApp(page, '/app/documents');
  await page.getByRole('tab', { name: 'Registered deeds' }).click();
  await page.getByRole('button', { name: 'Register a Deed' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Register a Deed')).toBeVisible();
  await expect(dialog.getByText('Import a registered document (AI)')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Upload & extract' })).toBeVisible();
  await uxCheck(page, 'documents:deed-import');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
