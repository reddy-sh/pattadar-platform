/**
 * Documents as a file manager — /app/papers (apps/web/src/w360/pages/Vault.tsx
 * and VaultFolders.tsx).
 *
 * What the owner asked for, each asserted on the screen and on the write it
 * sends: a glyph per file kind, folders they make and open and move things
 * into, tags beside the property links (not instead of them), a grid of
 * pictures, and a "Not linked" filter that turns the dead column into a task.
 *
 * Every answer is set in the test. `vaultPapers('all')` in the seed returns
 * nothing (it is keyed on shelves), and the folder reads are new, so nothing
 * here leans on fixtures/seed.ts beyond the vault head it already draws.
 * fileRefs are legacy ids on purpose: no storage bytes are asked for, so a
 * photo's tile falls back to its glyph rather than fetching a thumbnail.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

interface Row {
  id: string; title: string; detail: string; shelf: string; icon: string; tags: string[];
  shared: boolean; pageCount: number; fileRef: string; mimeType: string; recordId: string;
  recordTitle: string; createdAt: string; jointFmbId: string; folderId: string; sizeBytes: number;
  linkedProperties: { id: string; title: string; kind: string; documentId: string }[];
}

const linkedTo = (docId: string) => [{ id: ID.parcel, title: 'Sy 214/2', kind: 'parcel', documentId: docId }];
const file = (over: Partial<Row> & { id: string; title: string }): Row => ({
  detail: '', shelf: 'title', icon: 'title', tags: [], shared: false, pageCount: 1,
  fileRef: `file-${over.id}`, mimeType: 'application/pdf', recordId: '', recordTitle: '',
  createdAt: '2026-09-20T10:00:00', jointFmbId: '', folderId: '', sizeBytes: 0,
  linkedProperties: [], ...over,
});

const DEED = file({ id: 'd-deed', title: 'Sale Deed 3325/2022', detail: 'Registered 2022', folderId: 'fld-deeds',
  tags: ['give to lawyer'], linkedProperties: linkedTo('d-deed'), createdAt: '2026-09-24T10:00:00' });
const PHOTO = file({ id: 'd-photo', title: 'Boundary stone.jpg', shelf: 'photos', mimeType: 'image/jpeg',
  sizeBytes: 1_400_000, createdAt: '2026-09-23T10:00:00' });
const VIDEO = file({ id: 'd-video', title: 'VIDEO-2026-09-24.mp4', shelf: 'photos', mimeType: 'video/mp4',
  createdAt: '2026-09-22T10:00:00' });
const SHEET = file({ id: 'd-sheet', title: 'Crop ledger.xlsx', shelf: 'unsorted', tags: ['give to lawyer'],
  mimeType: 'application/octet-stream', linkedProperties: linkedTo('d-sheet'), createdAt: '2026-09-21T10:00:00' });
const FILES = [DEED, PHOTO, VIDEO, SHEET];

const FOLDERS = [
  { id: 'fld-deeds', name: 'Deeds', parentId: '', fileCount: 1, folderCount: 1, createdAt: '' },
  { id: 'fld-1998', name: '1998', parentId: 'fld-deeds', fileCount: 0, folderCount: 0, createdAt: '' },
  { id: 'fld-bank', name: 'For the bank', parentId: '', fileCount: 0, folderCount: 0, createdAt: '' },
];

const table = (page: Page) => page.getByRole('table', { name: 'Your private documents' });
const rowOf = (page: Page, name: string) => table(page).getByRole('row').filter({ hasText: name });

test.beforeEach(async ({ world }) => {
  world.set('vaultPapers', FILES);
  world.set('vaultFolders', FOLDERS);
});

test.describe('what a file is', () => {
  test('every row names its kind with a glyph, and says its size when it is known', async ({ page }) => {
    await page.goto('/app/papers?folder=fld-deeds');
    await expect(rowOf(page, 'Sale Deed 3325/2022').getByRole('img', { name: 'PDF' })).toBeVisible();
    await page.goto('/app/papers');
    await expect(rowOf(page, 'Boundary stone.jpg').getByRole('img', { name: 'Photo' })).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toContainText('Photo · 1.4 MB');
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4').getByRole('img', { name: 'Video' })).toBeVisible();
    // A generic MIME type falls back to the extension.
    await expect(rowOf(page, 'Crop ledger.xlsx').getByRole('img', { name: 'Spreadsheet' })).toBeVisible();
    await expect(rowOf(page, 'For the bank').getByRole('img', { name: 'Folder' })).toBeVisible();
  });

  test('the grid shows a tile per file, and the choice survives a reload', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Grid' }).click();
    const grid = page.getByRole('list', { name: 'Your private documents' });
    await expect(grid.getByRole('listitem')).toHaveCount(2 + 3);
    await expect(grid.getByRole('checkbox', { name: 'Select Boundary stone.jpg' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Grid' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'Your private documents' })).toBeVisible();
  });
});

test.describe('folders', () => {
  test('the top level lists folders first, then only the files kept there', async ({ page }) => {
    await page.goto('/app/papers');
    const rows = table(page).getByRole('row');
    await expect(rows.nth(1)).toContainText('Deeds');
    await expect(rows.nth(1)).toContainText('1 folder · 1 file');
    await expect(rows.nth(2)).toContainText('For the bank');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^My files · 3 files · 2 folders$/ })).toBeVisible();
  });

  test('opening a folder puts it in the URL and the path, and the path leads back', async ({ page }) => {
    await page.goto('/app/papers');
    await table(page).getByRole('link', { name: 'Deeds' }).click();
    await expect(page).toHaveURL(/\/app\/papers\?folder=fld-deeds$/);
    const path = page.getByRole('navigation', { name: 'Folder path' });
    await expect(path.getByRole('link', { name: 'Deeds' })).toHaveAttribute('aria-current', 'page');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await expect(rowOf(page, '1998')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
    await path.getByRole('link', { name: 'My files' }).click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
  });

  test('an empty folder says so and how to fill it', async ({ page }) => {
    await page.goto('/app/papers?folder=fld-bank');
    await expect(page.getByText('This folder is empty')).toBeVisible();
    await expect(page.getByText('Add documents here, drag files onto it, or choose Move to folder on any file.'))
      .toBeVisible();
  });

  test('a folder id that is not the owner’s is the top level, not a blank page', async ({ page }) => {
    await page.goto('/app/papers?folder=fld-someone-else');
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Folder path' })).toHaveCount(0);
  });

  test('a new folder is made inside the open one', async ({ page, world }) => {
    world.set('createVaultFolder', 'fld-new');
    await page.goto('/app/papers?folder=fld-deeds');
    await page.getByRole('button', { name: 'New folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'New folder' });
    await expect(dialog).toContainText('In Deeds');
    await dialog.getByLabel('Folder name').fill('  Gift deeds ');
    await dialog.getByRole('button', { name: 'Create folder' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('createVaultFolder')).toMatchObject({ name: 'Gift deeds', parentId: 'fld-deeds' });
    await expect(page.getByText('Folder made in Deeds.')).toBeVisible();
  });

  test('a refused folder name is said in the dialog, which stays open with what was typed', async ({ page, world }) => {
    world.set('createVaultFolder', World.gqlError('A folder called “Deeds” is already here'));
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'New folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'New folder' });
    await dialog.getByLabel('Folder name').fill('deeds');
    await dialog.getByRole('button', { name: 'Create folder' }).click();
    await expect(dialog.getByRole('alert')).toContainText('A folder called “Deeds” is already here');
    await expect(dialog.getByLabel('Folder name')).toHaveValue('deeds');
  });

  test('renaming a folder sends the new name', async ({ page, world }) => {
    world.set('renameVaultFolder', true);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for the folder For the bank' }).click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename “For the bank”' });
    await dialog.getByLabel('Folder name').fill('Union Bank');
    await dialog.getByRole('button', { name: 'Rename' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('renameVaultFolder')).toMatchObject({ folderId: 'fld-bank', name: 'Union Bank' });
  });

  test('removing a folder asks first and promises no file is deleted', async ({ page, world }) => {
    world.set('deleteVaultFolder', true);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Remove folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove the folder “Deeds”?' });
    await expect(dialog).toContainText('Everything inside (1 folder · 1 file) moves up to My files. No file is deleted.');
    expect(world.calls('deleteVaultFolder')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Remove folder' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('deleteVaultFolder')).toMatchObject({ folderId: 'fld-deeds' });
  });

  test('a folder the server will not remove keeps the dialog open and says why', async ({ page, world }) => {
    world.set('deleteVaultFolder', false);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Remove folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove the folder “Deeds”?' });
    await dialog.getByRole('button', { name: 'Remove folder' }).click();
    await expect(dialog.getByRole('alert')).toContainText('That folder is no longer here. Reload to check.');
  });

  test('a folder cannot be offered a place inside itself', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Move to folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move “Deeds”' });
    const choices = dialog.getByRole('group', { name: 'Folders' });
    await expect(choices.getByRole('button', { name: /My files/ })).toBeDisabled(); // it is here now
    await expect(choices.getByRole('button', { name: /For the bank/ })).toBeEnabled();
    await expect(choices.getByRole('button', { name: /1998/ })).toHaveCount(0);
  });
});

test.describe('moving files', () => {
  test('Move to folder from a row files it where the owner picks', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for Boundary stone.jpg' }).click();
    await page.getByRole('menuitem', { name: 'Move to folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move Boundary stone.jpg' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /For the bank/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-photo'], folderId: 'fld-bank' });
    await expect(page.getByText('1 file moved to For the bank.')).toBeVisible();
  });

  test('a selection moves together, and a refused move leaves the dialog saying so', async ({ page, world }) => {
    world.set('movePapersToFolder', 0);
    await page.goto('/app/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone.jpg' }).check();
    await page.getByRole('checkbox', { name: 'Select Crop ledger.xlsx' }).check();
    await page.getByRole('toolbar', { name: 'Selected file actions' })
      .getByRole('button', { name: 'Move to folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move 2 files' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /Deeds/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Those files could not be moved. Nothing has changed.');
    expect(world.lastVars('movePapersToFolder')).toMatchObject({
      paperIds: expect.arrayContaining(['d-photo', 'd-sheet']), folderId: 'fld-deeds',
    });
  });

  test('a file dragged onto a folder is moved into it', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/app/papers');
    await rowOf(page, 'Crop ledger.xlsx').dragTo(rowOf(page, 'For the bank'));
    await expect.poll(() => world.calls('movePapersToFolder').length).toBe(1);
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-sheet'], folderId: 'fld-bank' });
  });
});

test.describe('filters, tags and links', () => {
  const filter = (page: Page) => page.getByRole('group', { name: 'Narrow your documents' });
  const openFilter = (page: Page) => page.getByRole('button', { name: '+ Filter' }).click();

  test('+ Filter offers what the files actually carry, each with its count', async ({ page }) => {
    await page.goto('/app/papers');
    await openFilter(page);
    const pop = filter(page);
    // Type, file kind, property, linked or not, and tags — the Properties shape.
    await expect(pop.getByRole('button', { name: /^Title\s*1$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Photos & video\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Spreadsheet\s*1$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Sy 214\/2\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Not linked\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^give to lawyer\s*2$/ })).toBeVisible();
    // Nothing is filed as Identity, so Identity is not offered.
    await expect(pop.getByRole('button', { name: /^Identity/ })).toHaveCount(0);
  });

  test('choices widen within a group and narrow across groups, and each leaves a removable chip', async ({ page }) => {
    await page.goto('/app/papers');
    await openFilter(page);
    await filter(page).getByRole('button', { name: /^Photo\s*1$/ }).click();
    await filter(page).getByRole('button', { name: /^Video\s*1$/ }).click();
    await page.keyboard.press('Escape');
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4')).toBeVisible();
    await expect(rowOf(page, 'Crop ledger.xlsx')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '2 of 4 files' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove filter File Video' }).click();
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear all' }).click();
    // Back in the folder view: the deed lives in Deeds, not at the top level.
    await expect(rowOf(page, 'Crop ledger.xlsx')).toBeVisible();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
  });

  test('a property filter finds its files across every folder, and says where each is', async ({ page }) => {
    await page.goto('/app/papers');
    await openFilter(page);
    await filter(page).getByRole('button', { name: /^Sy 214\/2\s*2$/ }).click();
    await page.keyboard.press('Escape');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toContainText('in Deeds');
    await expect(rowOf(page, 'Crop ledger.xlsx')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^All folders · 2 files$/ })).toBeVisible();
  });

  test('a holding finds the files of every property in it, and files linked to the holding itself',
    async ({ page, world }) => {
      world.set('combinedProperties', [{
        id: 'cv-farm', name: 'Katragunta farm', members: [{ id: 'm1', recordId: ID.parcel, title: 'Sy 214/2' }],
      }]);
      world.set('vaultPapers', [...FILES, file({
        id: 'd-joint', title: 'Joint FMB.pdf', shelf: 'map',
        linkedProperties: [{ id: 'cv-farm', title: 'Katragunta farm', kind: 'combined', documentId: 'd-joint' }],
      })]);
      await page.goto('/app/papers');
      await openFilter(page);
      // Its own group, and not muddled into Property.
      await expect(filter(page).getByRole('button', { name: /^Katragunta farm\s*3$/ })).toBeVisible();
      await expect(filter(page).getByRole('button', { name: /^Sy 214\/2\s*2$/ })).toBeVisible();
      await filter(page).getByRole('button', { name: /^Katragunta farm\s*3$/ }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Remove filter Holding Katragunta farm' })).toBeVisible();
      await expect(rowOf(page, 'Joint FMB.pdf')).toBeVisible();
      await expect(rowOf(page, 'Crop ledger.xlsx')).toBeVisible();
      await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
      await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
    });

  test('Linked to names the property but never leads away from the file', async ({ page, world }) => {
    await page.goto('/app/papers');
    const ledger = rowOf(page, 'Crop ledger.xlsx');
    await expect(ledger).toContainText('Sy 214/2');
    await expect(ledger.getByRole('link', { name: 'Sy 214/2' })).toHaveCount(0);
    await expect(ledger.locator(`a[href^="/app/records/"]`)).toHaveCount(0);
    // A press on the property's name opens the FILE.
    await ledger.getByText('Sy 214/2', { exact: true }).click();
    await expect.poll(() => world.calls('document').length).toBeGreaterThan(0);
    expect(world.lastVars('document')).toMatchObject({ id: 'd-sheet' });
    await expect(page).toHaveURL(/\/app\/papers$/);
  });

  test('a tag under a name filters to it', async ({ page }) => {
    await page.goto('/app/papers');
    await rowOf(page, 'Crop ledger.xlsx').getByRole('button', { name: 'Show files tagged give to lawyer' }).click();
    await expect(page.getByRole('button', { name: 'Remove filter Tag give to lawyer' })).toBeVisible();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
  });

  test('Sort cycles through its orders in one press each', async ({ page }) => {
    await page.goto('/app/papers');
    const sort = page.getByRole('button', { name: /^Sort: / });
    await expect(sort).toHaveText('Sort: Recently added ⌄');
    await sort.click();
    await expect(sort).toHaveText('Sort: Name A–Z ⌄');
    // The first FILE row (folders sit above files; the header selects all).
    const firstFile = table(page).getByRole('checkbox', { name: /^Select (?!all files)/ }).first();
    await expect(firstFile).toHaveAccessibleName('Select Boundary stone.jpg');
    await sort.click();
    await expect(firstFile).toHaveAccessibleName('Select VIDEO-2026-09-24.mp4');
  });

  test('Tag… puts one tag on every selected file', async ({ page, world }) => {
    world.set('tagPapers', 2);
    await page.goto('/app/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone.jpg' }).check();
    await page.getByRole('checkbox', { name: 'Select VIDEO-2026-09-24.mp4' }).check();
    await page.getByRole('toolbar', { name: 'Selected file actions' }).getByRole('button', { name: 'Tag…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tag 2 files' });
    await dialog.getByLabel('Your tag').fill('site visit');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('tagPapers')).toMatchObject({
      paperIds: expect.arrayContaining(['d-photo', 'd-video']), tag: 'site visit', on: true,
    });
    await expect(page.getByText('Tagged 2 files “site visit”.')).toBeVisible();
  });

  test('one file’s tags can be taken off one at a time', async ({ page, world }) => {
    world.set('tagPapers', 1);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Actions for Crop ledger.xlsx' }).click();
    await page.getByRole('menuitem', { name: 'Edit tags…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tags on Crop ledger.xlsx' });
    await dialog.getByRole('button', { name: 'Remove the tag give to lawyer' }).click();
    await expect.poll(() => world.calls('tagPapers').length).toBe(1);
    expect(world.lastVars('tagPapers')).toMatchObject({ paperIds: ['d-sheet'], tag: 'give to lawyer', on: false });
  });

  test('a search spans every folder, says where each hit lives, and shows as a chip', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByLabel('Search files, tags or linked properties').fill('sale deed');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toContainText('in Deeds');
    await page.getByRole('button', { name: 'Clear the search for sale deed' }).click();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
  });
});

test.describe('on a phone @phone', () => {
  test('folders still open, and a file still moves, in one column @phone', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/app/papers');
    await table(page).getByRole('link', { name: 'Deeds' }).click();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Sale Deed 3325/2022' }).click();
    await page.getByRole('menuitem', { name: 'Move to folder…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move Sale Deed 3325/2022' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /My files/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-deed'], folderId: '' });
  });
});
