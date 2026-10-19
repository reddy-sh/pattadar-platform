/**
 * Documents as a file manager — /papers (apps/web/src/w360/pages/Vault.tsx
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
    await page.goto('/papers?folder=fld-deeds');
    await expect(rowOf(page, 'Sale Deed 3325/2022').getByRole('img', { name: 'PDF' })).toBeVisible();
    await page.goto('/papers');
    await expect(rowOf(page, 'Boundary stone.jpg').getByRole('img', { name: 'Photo' })).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toContainText('Photo · 1.4 MB');
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4').getByRole('img', { name: 'Video' })).toBeVisible();
    // A generic MIME type falls back to the extension.
    await expect(rowOf(page, 'Crop ledger.xlsx').getByRole('img', { name: 'Spreadsheet' })).toBeVisible();
    await expect(rowOf(page, 'For the bank').getByRole('img', { name: 'Folder' })).toBeVisible();
  });

  test('the grid shows a tile per file, and the choice survives a reload', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
    const grid = page.getByRole('list', { name: 'Your private documents' });
    await expect(grid.getByRole('listitem')).toHaveCount(3);
    // Folders are their own short strip, not file-sized empty cards.
    await expect(page.getByRole('list', { name: 'Folders' }).getByRole('listitem')).toHaveCount(2);
    await expect(grid.getByRole('checkbox', { name: 'Select Boundary stone' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'Your private documents' })).toBeVisible();
  });
});

test.describe('folders', () => {
  test('the top level lists folders first, then only the files kept there', async ({ page }) => {
    await page.goto('/papers');
    const rows = table(page).getByRole('row');
    await expect(rows.nth(1)).toContainText('Deeds');
    await expect(rows.nth(1)).toContainText('1 document · 1 folder');
    await expect(rows.nth(2)).toContainText('For the bank');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^Documents · 3 documents · 2 folders$/ })).toBeVisible();
  });

  test('opening a folder puts it in the URL and the path, and the path leads back', async ({ page }) => {
    await page.goto('/papers');
    await table(page).getByRole('link', { name: 'Deeds' }).click();
    await expect(page).toHaveURL(/\/papers\?folder=fld-deeds$/);
    const path = page.getByRole('navigation', { name: 'Folder path' });
    await expect(path.getByRole('link', { name: 'Deeds' })).toHaveAttribute('aria-current', 'page');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await expect(rowOf(page, '1998')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
    await path.getByRole('link', { name: 'Documents' }).click();
    await expect(page).toHaveURL(/\/papers$/);
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
  });

  test('an empty folder says so and how to fill it', async ({ page }) => {
    await page.goto('/papers?folder=fld-bank');
    await expect(page.getByText('This folder is empty')).toBeVisible();
    await expect(page.getByText('Add documents here, drag documents onto it, or choose Move to a folder on any document.'))
      .toBeVisible();
  });

  test('a folder id that is not the owner’s is the top level, not a blank page', async ({ page }) => {
    await page.goto('/papers?folder=fld-someone-else');
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Folder path' })).toHaveCount(0);
  });

  test('a new folder is made inside the open one', async ({ page, world }) => {
    world.set('createVaultFolder', 'fld-new');
    await page.goto('/papers?folder=fld-deeds');
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
    await page.goto('/papers');
    await page.getByRole('button', { name: 'New folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'New folder' });
    await dialog.getByLabel('Folder name').fill('deeds');
    await dialog.getByRole('button', { name: 'Create folder' }).click();
    await expect(dialog.getByRole('alert')).toContainText('A folder called “Deeds” is already here');
    await expect(dialog.getByLabel('Folder name')).toHaveValue('deeds');
  });

  test('renaming a folder sends the new name', async ({ page, world }) => {
    world.set('renameVaultFolder', true);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for the folder For the bank' }).click();
    await page.getByRole('menuitem', { name: 'Rename folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename “For the bank”' });
    await dialog.getByLabel('Folder name').fill('Union Bank');
    await dialog.getByRole('button', { name: 'Rename' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('renameVaultFolder')).toMatchObject({ folderId: 'fld-bank', name: 'Union Bank' });
  });

  test('removing a folder asks first and promises no file is deleted', async ({ page, world }) => {
    world.set('deleteVaultFolder', true);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete the folder “Deeds”?' });
    await expect(dialog).toContainText('Everything inside (1 document · 1 folder) moves up to Documents. No document is deleted.');
    expect(world.calls('deleteVaultFolder')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Delete folder' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('deleteVaultFolder')).toMatchObject({ folderId: 'fld-deeds' });
  });

  test('a folder the server will not remove keeps the dialog open and says why', async ({ page, world }) => {
    world.set('deleteVaultFolder', false);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete the folder “Deeds”?' });
    await dialog.getByRole('button', { name: 'Delete folder' }).click();
    await expect(dialog.getByRole('alert')).toContainText('That folder is no longer here. Reload to check.');
  });

  test('a folder cannot be offered a place inside itself', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for the folder Deeds' }).click();
    await page.getByRole('menuitem', { name: 'Move to a folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move “Deeds”' });
    const choices = dialog.getByRole('group', { name: 'Folders' });
    await expect(choices.getByRole('button', { name: /^Folder Documents\b/ })).toBeDisabled(); // it is here now
    await expect(choices.getByRole('button', { name: /For the bank/ })).toBeEnabled();
    await expect(choices.getByRole('button', { name: /1998/ })).toHaveCount(0);
  });
});

test.describe('moving files', () => {
  test('Move to folder from a row files it where the owner picks', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for Boundary stone' }).click();
    await page.getByRole('menuitem', { name: 'Move to a folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move Boundary stone' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /For the bank/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-photo'], folderId: 'fld-bank' });
    await expect(page.getByText('1 document moved to For the bank.')).toBeVisible();
  });

  test('a selection moves together, and a refused move leaves the dialog saying so', async ({ page, world }) => {
    world.set('movePapersToFolder', 0);
    await page.goto('/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    await page.getByRole('checkbox', { name: 'Select Crop ledger' }).check();
    await page.getByRole('group', { name: 'Act on the selected documents' })
      .getByRole('button', { name: 'Move to a folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move 2 documents' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /Deeds/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Those documents could not be moved. Nothing has changed.');
    expect(world.lastVars('movePapersToFolder')).toMatchObject({
      paperIds: expect.arrayContaining(['d-photo', 'd-sheet']), folderId: 'fld-deeds',
    });
  });

  test('a file dragged onto a folder is moved into it', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/papers');
    await rowOf(page, 'Crop ledger.xlsx').dragTo(rowOf(page, 'For the bank'));
    await expect.poll(() => world.calls('movePapersToFolder').length).toBe(1);
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-sheet'], folderId: 'fld-bank' });
  });
});

test.describe('filters, tags and links', () => {
  const filter = (page: Page) => page.getByRole('group', { name: 'Narrow your documents' });
  const openFilter = (page: Page) => page.getByRole('button', { name: '+ Filter' }).click();

  test('+ Filter offers what the files actually carry, each with its count', async ({ page }) => {
    await page.goto('/papers');
    await openFilter(page);
    const pop = filter(page);
    // Type, file kind, property, linked or not, and tags — the Properties shape.
    await expect(pop.getByRole('button', { name: /^Title deeds\s*1$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Photos & video\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Spreadsheet\s*1$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Sy 214\/2\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Not linked\s*2$/ })).toBeVisible();
    await expect(pop.getByRole('button', { name: /^give to lawyer\s*2$/ })).toBeVisible();
    // Nothing is filed as Identity, so Identity is not offered.
    await expect(pop.getByRole('button', { name: /^Identity/ })).toHaveCount(0);
  });

  test('choices widen within a group and narrow across groups, and each leaves a removable chip', async ({ page }) => {
    await page.goto('/papers');
    await openFilter(page);
    await filter(page).getByRole('button', { name: /^Photo\s*1$/ }).click();
    await filter(page).getByRole('button', { name: /^Video\s*1$/ }).click();
    await page.keyboard.press('Escape');
    await expect(rowOf(page, 'Boundary stone.jpg')).toBeVisible();
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4')).toBeVisible();
    await expect(rowOf(page, 'Crop ledger.xlsx')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '2 of 4 shown' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove filter Format Video' }).click();
    await expect(rowOf(page, 'VIDEO-2026-09-24.mp4')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear all' }).click();
    // Back in the folder view: the deed lives in Deeds, not at the top level.
    await expect(rowOf(page, 'Crop ledger.xlsx')).toBeVisible();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
  });

  test('a property filter finds its files across every folder, and says where each is', async ({ page }) => {
    await page.goto('/papers');
    await openFilter(page);
    await filter(page).getByRole('button', { name: /^Sy 214\/2\s*2$/ }).click();
    await page.keyboard.press('Escape');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toContainText('in Deeds');
    await expect(rowOf(page, 'Crop ledger.xlsx')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^All folders · 2 documents$/ })).toBeVisible();
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
      await page.goto('/papers');
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
    await page.goto('/papers');
    const ledger = rowOf(page, 'Crop ledger.xlsx');
    await expect(ledger).toContainText('Sy 214/2');
    await expect(ledger.getByRole('link', { name: 'Sy 214/2' })).toHaveCount(0);
    await expect(ledger.locator(`a[href^="/properties/"]`)).toHaveCount(0);
    // A press on the property's name opens the FILE.
    await ledger.getByText('Sy 214/2', { exact: true }).click();
    await expect.poll(() => world.calls('document').length).toBeGreaterThan(0);
    expect(world.lastVars('document')).toMatchObject({ id: 'd-sheet' });
    await expect(page).toHaveURL(/\/papers$/);
  });

  test('a tag under a name filters to it', async ({ page }) => {
    await page.goto('/papers');
    await rowOf(page, 'Crop ledger.xlsx').getByRole('button', { name: 'Show documents tagged give to lawyer' }).click();
    await expect(page.getByRole('button', { name: 'Remove filter Tag give to lawyer' })).toBeVisible();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await expect(rowOf(page, 'Boundary stone.jpg')).toHaveCount(0);
  });

  test('Sort cycles through its orders in one press each', async ({ page }) => {
    await page.goto('/papers');
    const sort = page.getByRole('button', { name: /^Sort: / });
    await expect(sort).toHaveText('Sort: Recently added');
    await sort.click();
    await expect(sort).toHaveText('Sort: Name A–Z');
    // The first FILE row (folders sit above files; the header selects all).
    const firstFile = table(page).getByRole('checkbox', { name: /^Select (?!all \d)/ }).first();
    await expect(firstFile).toHaveAccessibleName('Select Boundary stone');
    await sort.click();
    await expect(firstFile).toHaveAccessibleName('Select VIDEO-2026-09-24');
  });

  test('Tag… puts one tag on every selected file', async ({ page, world }) => {
    world.set('tagPapers', 2);
    await page.goto('/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    await page.getByRole('checkbox', { name: 'Select VIDEO-2026-09-24' }).check();
    await page.getByRole('group', { name: 'Act on the selected documents' }).getByRole('button', { name: 'Add a tag' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tag 2 documents' });
    await dialog.getByLabel('Your tag').fill('site visit');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('tagPapers')).toMatchObject({
      paperIds: expect.arrayContaining(['d-photo', 'd-video']), tag: 'site visit', on: true,
    });
    await expect(page.getByText('Tagged 2 documents “site visit”.')).toBeVisible();
  });

  test('one file’s tags can be taken off one at a time', async ({ page, world }) => {
    world.set('tagPapers', 1);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for Crop ledger' }).click();
    await page.getByRole('menuitem', { name: 'Edit tags' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit tags' });
    await expect(dialog).toContainText('Crop ledger');
    await dialog.getByRole('button', { name: 'Remove the tag give to lawyer' }).click();
    await expect.poll(() => world.calls('tagPapers').length).toBe(1);
    expect(world.lastVars('tagPapers')).toMatchObject({ paperIds: ['d-sheet'], tag: 'give to lawyer', on: false });
  });

  test('a search spans every folder, says where each hit lives, and shows as a chip', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('sale deed');
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toContainText('in Deeds');
    await page.getByRole('button', { name: 'Clear the search for sale deed' }).click();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toHaveCount(0);
  });
});

test.describe('a kept Aadhaar card, filed under its person', () => {
  // The tree the API makes (web360.ensure_person_folder): one folder per
  // person, an Aadhaar folder inside it, made the first time a card is filed.
  const CARD_REF = '7a2d4c10-3b5e-4f61-9a8c-2e4b6d8f0a13';
  const PERSON_FOLDERS = [
    { id: 'fld-ravi', name: 'Ravi', parentId: '', fileCount: 0, folderCount: 1, createdAt: '', personId: 'mem-ravi' },
    { id: 'fld-ravi-a', name: 'Aadhaar', parentId: 'fld-ravi', fileCount: 1, folderCount: 0, createdAt: '',
      personId: 'mem-ravi' },
    { id: 'fld-sita', name: 'Sita', parentId: '', fileCount: 0, folderCount: 1, createdAt: '', personId: 'mem-sita' },
    { id: 'fld-sita-a', name: 'Aadhaar', parentId: 'fld-sita', fileCount: 0, folderCount: 0, createdAt: '',
      personId: 'mem-sita' },
  ];
  const CARD = { ...file({ id: 'd-card', title: 'Aadhaar card', detail: 'XXXX-XXXX-9012', shelf: 'identity',
    icon: 'identity', fileRef: CARD_REF, folderId: 'fld-ravi-a', sizeBytes: 2048,
    createdAt: '2026-10-03T10:00:00' }), aadhaarCard: true };
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  test.beforeEach(({ world }) => {
    world.set('vaultPapers', [...FILES, CARD]);
    world.set('vaultFolders', [...FOLDERS, ...PERSON_FOLDERS]);
  });

  test('it is found under Ravi › Aadhaar, masked, and opens its stored bytes', async ({ page, world }) => {
    world.route(new RegExp(`/storage/files/${CARD_REF}/content`), () => ({ contentType: 'application/pdf', body: PDF }));
    await page.goto('/papers');
    await table(page).getByRole('link', { name: 'Ravi' }).click();
    await table(page).getByRole('link', { name: 'Aadhaar' }).click();
    await expect(page).toHaveURL(/\?folder=fld-ravi-a$/);
    const path = page.getByRole('navigation', { name: 'Folder path' });
    await expect(path.getByRole('link', { name: 'Ravi' })).toBeVisible();
    const card = rowOf(page, 'Aadhaar card');
    await expect(card).toContainText('XXXX-XXXX-9012');
    await expect(card).toContainText('Identity');
    // Nothing on the page is a full twelve-digit number.
    expect(await page.locator('body').innerText()).not.toMatch(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/);

    world.set('document', { id: 'd-card', title: 'Aadhaar card', subtitle: 'XXXX-XXXX-9012', shelf: 'identity',
      recordId: '', recordTitle: '', pageCount: 0, sizeLabel: '2 KB', registeredOn: '', office: '',
      fileRef: CARD_REF, mimeType: 'application/pdf', buyer: '', seller: '', consideration: 0,
      readerSummary: '', readerFlag: '', readerFlagPage: 0, tags: [], shared: false, versions: [], link: null });
    await card.getByRole('link', { name: 'Aadhaar card' }).click();
    await expect.poll(() => world.restCalls(new RegExp(`/storage/files/${CARD_REF}/content`)).length)
      .toBeGreaterThan(0);
  });

  test('a search finds it, and its Folder says whose Aadhaar folder it is', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('aadhaar');
    const card = rowOf(page, 'Aadhaar card');
    await expect(card).toContainText('Ravi › Aadhaar');
    await expect(card.getByRole('button', { name: /Open Ravi › Aadhaar|Open Aadhaar/ })).toBeVisible();
  });

  test('it offers no link to a property, which the server refuses too', async ({ page }) => {
    await page.goto('/papers?folder=fld-ravi-a');
    await page.getByRole('button', { name: 'Actions for Aadhaar card' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move to a folder' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Link to a property|Linked properties/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Share' })).toHaveCount(0);
  });
});

test.describe('on a phone @phone', () => {
  test('folders still open, and a file still moves, in one column @phone', async ({ page, world }) => {
    world.set('movePapersToFolder', 1);
    await page.goto('/papers');
    await table(page).getByRole('link', { name: 'Deeds' }).click();
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Sale Deed 3325/2022' }).click();
    await page.getByRole('menuitem', { name: 'Move to a folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move Sale Deed 3325/2022' });
    await dialog.getByRole('group', { name: 'Folders' }).getByRole('button', { name: /^Folder Documents\b/ }).click();
    await dialog.getByRole('button', { name: 'Move here' }).click();
    expect(world.lastVars('movePapersToFolder')).toMatchObject({ paperIds: ['d-deed'], folderId: '' });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The design review of 07/10/2026 and the founder's decisions on it.
test.describe('the review of 07/10/2026', () => {
  test('a document is named by what it is, and the file it arrived as is the small line', async ({ page, world }) => {
    world.set('vaultPapers', [...FILES, file({
      id: 'd-fmb', title: 'IMG_4482.pdf', detail: 'FMB sheet', shelf: 'map', sizeBytes: 360_000,
      linkedProperties: linkedTo('d-fmb'),
    }), { ...file({ id: 'd-sale', title: 'scan0001.pdf', shelf: 'title' }), docNo: '1842/2019' }])
    await page.goto('/papers');
    const fmb = rowOf(page, 'IMG_4482.pdf');
    await expect(fmb.getByRole('link', { name: 'FMB · Sy 214/2' })).toBeVisible();
    await expect(fmb).toContainText('IMG_4482.pdf · FMB sheet · 360 KB');
    await expect(rowOf(page, 'scan0001.pdf').getByRole('link', { name: 'Sale deed 1842/2019' })).toBeVisible();
    // Never an extension in a title.
    await expect(rowOf(page, 'Boundary stone.jpg').getByRole('link', { name: 'Boundary stone', exact: true })).toBeVisible();
  });

  test('Linked to names the links and counts the rest; Folder is a column only while filtering', async ({ page, world }) => {
    world.set('vaultPapers', [...FILES, file({
      id: 'd-two', title: 'Joint survey', linkedProperties: [
        { id: ID.parcel, title: 'Sy 214/2', kind: 'parcel', documentId: 'd-two' },
        { id: 'cv-farm', title: 'Katragunta farm', kind: 'combined', documentId: 'd-two' },
      ] })]);
    await page.goto('/papers');
    const header = table(page).getByRole('row').first();
    // Unfiltered, every row sits in the folder on screen, so there is no
    // Folder column to leave blank; it appears while the list is flat
    // across folders (see the filtered test below).
    await expect(header.getByRole('columnheader', { name: 'Folder' })).toHaveCount(0);
    await expect(header.getByRole('columnheader', { name: 'Linked to' })).toBeVisible();
    const linked = rowOf(page, 'Joint survey').getByRole('cell').nth(2);
    await expect(linked).toHaveText('Sy 214/2 +1');
    await expect(linked.locator('[title]')).toHaveAttribute('title', 'Sy 214/2, Katragunta farm');
    await expect(rowOf(page, 'Boundary stone.jpg').getByRole('cell').nth(2)).toHaveText('Not linked');

    // Inside a folder every row is in that folder, so the column goes.
    await page.goto('/papers?folder=fld-deeds');
    await expect(table(page).getByRole('columnheader', { name: 'Folder' })).toHaveCount(0);
    await expect(rowOf(page, 'Sale Deed 3325/2022')).toContainText('Sy 214/2');
  });

  test('a filtered list draws its folder in the Folder column', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('sale');
    await expect(rowOf(page, 'Sale Deed 3325/2022').getByRole('cell').nth(2)).toHaveText('Deeds');
  });

  test('Share on a row makes a link to that document, not to a property', async ({ page, world }) => {
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for Boundary stone' }).click();
    await page.getByRole('menuitem', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share Boundary stone' });
    await dialog.getByLabel('Who the link is for').fill('Union Bank, Markapur');
    await dialog.getByRole('button', { name: 'Make the link' }).click();
    await expect(dialog.getByLabel('Recipient link')).toHaveValue(/w-doclink-new$/);
    expect(world.lastVars('createDocumentShareLink')).toMatchObject({
      documentIds: ['d-photo'], audience: 'Union Bank, Markapur', terms: 'view', days: 30,
    });
    expect(world.calls('createShareLink')).toHaveLength(0);
  });

  test('Share on the selection bar shares every ticked document in one link', async ({ page, world }) => {
    await page.goto('/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    await page.getByRole('checkbox', { name: 'Select Crop ledger' }).check();
    const bar = page.getByRole('group', { name: 'Act on the selected documents' });
    await expect(bar).toContainText('2 documents selected');
    await bar.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share 2 documents' });
    await dialog.getByLabel('Who the link is for').fill('Advocate');
    await dialog.getByRole('button', { name: 'Make the link' }).click();
    await expect(dialog.getByLabel('Recipient link')).toBeVisible();
    expect(world.lastVars('createDocumentShareLink')).toMatchObject({
      documentIds: expect.arrayContaining(['d-photo', 'd-sheet']), audience: 'Advocate',
    });
  });

  test('the selection bar floats, a filter drops it, and Clear hands focus back', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    const bar = page.getByRole('group', { name: 'Act on the selected documents' });
    await expect(bar).toBeVisible();
    expect(await page.locator('.selbar').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    // Two or more cannot become one property, and the button says so.
    await page.getByRole('checkbox', { name: 'Select Crop ledger' }).check();
    await expect(bar.getByRole('button', { name: 'Select one to add a property' })).toBeDisabled();
    // A new search drops the selection rather than act on rows it hid.
    await page.getByPlaceholder('Search documents').fill('boundary');
    await expect(bar).toBeHidden();
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    await expect(bar).toContainText('1 document selected');
    await expect(bar.getByRole('button', { name: 'Add a property from this document' })).toBeEnabled();
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(bar).toBeHidden();
    await expect(page.getByRole('checkbox', { name: /^Select all \d+ documents?$/ })).toBeFocused();
  });

  test('ticking rows counts them on the pager row and the bar exports them', async ({ page }) => {
    await page.goto('/papers');
    const count = page.locator('.vault-count');
    await expect(count).toHaveText(/^Total · \d+ documents?$/);
    await page.getByRole('checkbox', { name: 'Select Boundary stone' }).check();
    await page.getByRole('checkbox', { name: 'Select Crop ledger' }).check();
    await expect(count).toHaveText('2 documents selected');
    const bar = page.getByRole('group', { name: 'Act on the selected documents' });
    await expect(bar).toContainText('2 documents selected');
    const download = page.waitForEvent('download');
    await bar.getByRole('button', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toBe('documents.csv');
  });

  test('the row menu is the house menu: it names its document and opens the full page', async ({ page }) => {
    await page.goto('/papers');
    const kebab = page.getByRole('button', { name: 'Actions for Crop ledger' });
    await kebab.click();
    await expect(kebab).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.menu-list .menuhead')).toHaveText('Crop ledger');
    await expect(page.getByRole('menuitem')).toHaveText([
      'Open', 'Preview', 'Share', 'Linked properties and holdings', 'Move to a folder', 'Edit tags',
      'Rename', 'Edit details', 'Add a property from this document', 'Delete this document',
    ]);
    await page.getByRole('menuitem', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/papers\/d-sheet$/);
  });

  test('Edit details sends every field, the date day first', async ({ page, world }) => {
    world.set('vaultPapers', [...FILES, { ...file({ id: 'd-reg', title: 'Sale deed 77 of 2001', shelf: 'title' }),
      docNo: '77/2001', registeredOn: '', office: 'Podili SRO' }]);
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for Sale deed 77/2001' }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit details' });
    await expect(drawer.getByLabel('Deed number')).toHaveValue('77/2001');
    await drawer.getByLabel('Registration date').fill('31/02/2001');
    await expect(drawer.getByRole('button', { name: 'Save the details' })).toBeDisabled();
    await expect(drawer).toContainText('That registration date does not exist.');
    await drawer.getByLabel('Registration date').fill('03/04/2001');
    await drawer.getByRole('button', { name: 'Save the details' }).click();
    await expect(drawer).toBeHidden();
    expect(world.lastVars('updatePaperDetails')).toEqual({
      paperId: 'd-reg', shelf: 'title', docNo: '77/2001', registeredOn: '03/04/2001', office: 'Podili SRO',
    });
  });

  test('Delete from the row menu asks first, then deletes that one document', async ({ page, world }) => {
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Actions for Boundary stone' }).click();
    await page.getByRole('menuitem', { name: 'Delete this document' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Boundary stone?' });
    expect(world.calls('deletePaper')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
    expect(world.lastVars('deletePaper')).toMatchObject({ paperId: 'd-photo' });
  });

  test('the View control sits in the toolbar band, Grid first, and New folder in the head', async ({ page }) => {
    await page.goto('/papers');
    // design.md § Page head, slot 5: view toggles and search live in the band.
    const view = page.locator('.filterbar').getByRole('group', { name: 'View' });
    await expect(view.getByRole('button')).toHaveText(['Grid', 'Table']);
    await expect(page.locator('header.pagehead').getByRole('group', { name: 'View' })).toHaveCount(0);
    await expect(page.locator('header.pagehead').getByRole('searchbox')).toHaveCount(0);
    await expect(page.locator('header.pagehead').getByRole('button', { name: 'New folder' })).toBeVisible();
    await expect(page.locator('.filterbar').getByRole('button', { name: 'New folder' })).toHaveCount(0);
  });

  test('a search finds a folder by its name', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('bank');
    await expect(rowOf(page, 'For the bank')).toBeVisible();
  });

  test('a filter that matches nothing is the house panel with one remedy', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('zzzz');
    await expect(page.getByRole('heading', { level: 3, name: 'No document matches “zzzz”' })).toBeVisible();
    await expect(page.getByText('4 documents are hidden by this search.')).toBeVisible();
  });

  test('Sort has no dropdown chevron and says the new order out loud', async ({ page }) => {
    await page.goto('/papers');
    const sort = page.getByRole('button', { name: /^Sort: / });
    await expect(sort).toHaveText('Sort: Recently added');
    await sort.click();
    await expect(page.locator('.filterbar [aria-live="polite"]')).toHaveText('Sorted by Name A–Z');
  });

  test('every file kind is drawn in one neutral ink', async ({ page }) => {
    await page.goto('/papers?folder=fld-deeds');
    const pdf = rowOf(page, 'Sale Deed 3325/2022').getByRole('img', { name: 'PDF' });
    const ink = await pdf.evaluate((el) => getComputedStyle(el).color);
    await page.goto('/papers');
    const photo = await rowOf(page, 'Boundary stone.jpg').getByRole('img', { name: 'Photo' })
      .evaluate((el) => getComputedStyle(el).color);
    expect(photo).toBe(ink);
  });

  test('a failed file list states no count beside its error', async ({ page, world }) => {
    world.set('vaultPapers', World.gqlError('the paper store is down'));
    await page.goto('/papers');
    await expect(page.getByRole('alert').filter({ hasText: 'Your documents did not load' })).toBeVisible();
    await expect(page.getByText(/\b0 documents\b/)).toHaveCount(0);
    await expect(table(page)).toHaveCount(0);
  });
});
