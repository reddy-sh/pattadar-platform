/**
 * Documents — both tabs, rows with type chips, row Open goes through the
 * in-portal FileViewer (NEVER a tab), checkbox multi-select + bulk delete
 * through one confirm dialog (seeded disposable rows, left clean), the deed
 * expander shows fees, and the deed-import dialog opens with its AI upload
 * panel.
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

  // Click the NAME cell of the first row that actually HAS a file (td 0 is the
  // selection checkbox; selection is checkbox-only — a name click still opens
  // the viewer). The default "All documents" view is unfiltered/unsorted, so
  // the Nth table row maps to the Nth document from the same query. Targeting
  // the first file-backed row (rather than blindly row 0, whose fileRef can be
  // empty — the live dataset's most-recent rows often are — and which then
  // does not open the viewer) keeps this robust against dataset ordering.
  const firstWithFile = d.documents.findIndex((x) => x.fileRef);
  await page.locator('tbody tr').nth(firstWithFile).locator('td').nth(1).click();
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

test('documents: multi-select and bulk delete', async ({ page, request }) => {
  // Seed 2 disposable metadata-only documents (no storage file behind them).
  const mk = async (docNo: string) =>
    (
      await gql<{ createDocument: { id: string } }>(
        request,
        'mutation($docNo: String!) { createDocument(parcelId:"", passbookId:"", docType:"other", fileRef:"", docNo:$docNo, sroCode:"", regYear:"", source:"e2e", tags:"") { id } }',
        { docNo },
      )
    ).createDocument.id;
  const idA = await mk('E2E BULK A');
  const idB = await mk('E2E BULK B');
  try {
    await openApp(page, '/app/documents');
    // Narrow to the seeded rows, then select them via their checkboxes only.
    await page.getByPlaceholder('Search documents…').fill('E2E BULK');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Select E2E BULK A' }).check();
    await page.getByRole('checkbox', { name: 'Select E2E BULK B' }).check();

    // The contextual selection toolbar swaps in.
    await expect(page.getByText('2 selected')).toBeVisible();
    await uxCheck(page, 'documents:bulk-select');

    // Bulk delete goes through ONE confirm dialog.
    await page.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete 2 documents?')).toBeVisible();
    await expect(dialog.getByText('Files move to My Drive Trash.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // One summary snackbar; both rows gone from the table AND the server.
    await expect(page.getByText('2 deleted')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
    const after = await gql<DocsData>(request, 'query { documents { id fileRef docType } }');
    const ids = after.documents.map((x) => x.id);
    expect(ids).not.toContain(idA);
    expect(ids).not.toContain(idB);
  } finally {
    // Leave the dataset clean even if an assertion failed mid-flight
    // (deleteDocument of an already-deleted id just returns false).
    await gql(request, 'mutation($id: String!) { deleteDocument(id: $id) }', { id: idA });
    await gql(request, 'mutation($id: String!) { deleteDocument(id: $id) }', { id: idB });
  }
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
