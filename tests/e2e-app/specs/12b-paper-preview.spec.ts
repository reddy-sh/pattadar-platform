/**
 * The paper preview drawer — the Dropbox move, where a paper opens beside the
 * list it was filed in instead of routing away to the full Reader.
 *
 * apps/web/src/w360/paper/PaperPreview.tsx is the panel; it is opened from a
 * shelf row (Shelf.tsx), a vault search hit (Vault.tsx) and a record's papers
 * (RecordPapers.tsx). Every one of those rows is still a real
 * `<Link to="/app/papers/:id">`, and this file asserts BOTH halves of that
 * bargain: a plain left-click opens the drawer, and a modified click or the
 * deep link still lands on the full Reader. The scan itself is rendered by the
 * shared ScanView (paper/scan.tsx), which the Reader spec already exercises
 * state by state, so here the scan is proved to reach the drawer rather than
 * re-proved outcome by outcome.
 *
 * What a reader of this file must know:
 *
 *  · A SHELF ROW carries a legacy `fileRef` (`file-deed`) in the seed, the same
 *    as the Reader spec, so the DEFAULT preview lands ScanView in its 'legacy'
 *    state — no bytes, an honest "old reference" line. A test that wants bytes
 *    on screen seeds the paper under REF and serves them, exactly as 12-reader
 *    does.
 *
 *  · The drawer is `role="dialog"` and has NO footer — it is a look, not a
 *    form. There is no "Open full page", no Download and no facts block; the
 *    panel is the header and the scan. It closes from the header X (aria-label
 *    "Close"), Escape or the scrim. Because it is read-only there is no dirty
 *    guard, so Escape and the scrim close it at once.
 */
import { test, expect, World } from '../fixtures/harness';
import { ID, PAPER } from '../fixtures/ids';

/** A storage node id shaped the way the gateway issues them — the one shape
 *  `isStorageRef` accepts, so bytes are actually fetched. */
const REF = '3f1c8a52-9b74-4d21-8e60-5a7c9f2b41d0';

const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const TINY_PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pg==',
  'base64',
);

type Row = Record<string, unknown>;

/** The seeded sale deed, whole — every field Q_DOCUMENT selects, so an
 *  override can drop one fact without leaving the other twenty undefined. The
 *  preview reads the same `document` query the Reader does. */
const DEED: Row = {
  id: PAPER.deed,
  title: 'Sale deed 4412 of 1998',
  subtitle: 'Markapur SRO · 1998 · 14 pages',
  shelf: 'title',
  recordId: ID.parcel,
  recordTitle: 'Sy 214/2',
  pageCount: 14,
  sizeLabel: '2.4 MB',
  registeredOn: '04/03/1998',
  office: 'Markapur SRO',
  fileRef: 'file-deed',
  mimeType: 'application/pdf',
  buyer: 'Telukutla Shankar Reddy',
  seller: 'Chenna Reddy',
  consideration: 1_850_000,
  readerSummary: 'A sale of 4 acres 12 guntas in Sy 214/2, Katragunta, for ₹18,50,000.',
  readerFlag: 'The extent on page 3 disagrees with itself.',
  readerFlagPage: 3,
  tags: ['original'],
  shared: true,
  versions: [],
  link: null,
};

const paper = (over: Row = {}): Row => ({ ...DEED, ...over });

/** A shelf row for the Title shelf that points at the deed. `vaultPapers`
 *  selects a smaller set of fields than `document`. */
const TITLE_ROW: Row = {
  id: PAPER.deed, title: 'Sale deed 4412 of 1998', detail: 'Markapur SRO · 1998',
  shelf: 'title', icon: 'title', tags: ['original'], shared: true,
  pageCount: 14, fileRef: 'file-deed',
};

function serveBytes(world: World, kind: 'pdf' | 'image', delayMs?: number) {
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => (kind === 'pdf'
    ? { contentType: 'application/pdf', body: TINY_PDF, delayMs }
    : { contentType: 'image/jpeg', body: PIXEL, delayMs }));
}

/** Open the Title shelf and return the deed's row link. */
async function openTitleShelf(page: import('@playwright/test').Page) {
  await page.goto('/app/papers/shelf/title');
  return page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
}

// ── opening the drawer, not routing away ───────────────────────────────

test('a plain click on a shelf row opens the paper in a drawer, not the full page', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  // The drawer, not a route change: the URL stays on the shelf.
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Sale deed 4412 of 1998' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/papers\/shelf\/title$/);
});

test('the deep link still opens the full Reader, so a shared or bookmarked paper is unchanged', async ({ page, world }) => {
  world.set('document', DEED);
  await page.goto(`/app/papers/${PAPER.deed}`);
  // The full page has the toolbar header the drawer does not.
  await expect(page.locator('header.rd-bar')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the shelf row is still a real link to the paper, so a new tab and Copy link keep working', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  const row = await openTitleShelf(page);
  // The href is what a middle-click, cmd-click and "Copy link address" all use;
  // only a plain left-click is intercepted, so the anchor must still point home.
  await expect(row).toHaveAttribute('href', `/app/papers/${PAPER.deed}`);
});

// ── the scan reaches the drawer ────────────────────────────────────────

test('an image paper shows its scan inside the drawer', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  serveBytes(world, 'image');
  const row = await openTitleShelf(page);
  await row.click();

  const scan = page.getByRole('dialog').getByRole('img', { name: /Sale deed 4412 of 1998, page 1 of 14/ });
  await expect(scan).toBeVisible();
  await expect(scan).toHaveAttribute('src', /^blob:/);
  // The preview asks the gateway to transcode, the same as the Reader.
  expect(world.restCalls(/storage\/files/).map((c) => c.url))
    .toEqual([expect.stringContaining(`/storage/files/${REF}/content?format=web`)]);
});

test('a PDF paper is handed to the browser’s own viewer inside the drawer, and paging moves it', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', paper({ fileRef: REF }));
  serveBytes(world, 'pdf');
  const row = await openTitleShelf(page);
  await row.click();

  const frame = page.getByRole('dialog').locator('iframe[title="Sale deed 4412 of 1998"]');
  await expect(frame).toHaveAttribute('src', /^blob:.*#page=1$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Next page' }).click();
  await expect(frame).toHaveAttribute('src', /^blob:.*#page=2$/);
});

test('a paper filed under an old reference says so in the drawer, the same honest absence the Reader shows', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED); // fileRef is the legacy 'file-deed'
  const row = await openTitleShelf(page);
  await row.click();

  await expect(page.getByRole('dialog').getByText("This document's file is filed under an old reference")).toBeVisible();
  // A ref that can never resolve is never fetched.
  expect(world.restCalls(/storage\/files/)).toEqual([]);
});

// ── what the drawer says the paper is ──────────────────────────────────

test('the drawer names the paper and its one-line detail, and nothing more — no facts block, no actions', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  const drawer = page.getByRole('dialog');
  // The title and the subtitle line are the whole of the words on this panel.
  await expect(drawer.getByRole('heading', { name: 'Sale deed 4412 of 1998' })).toBeVisible();
  await expect(drawer.getByText('Markapur SRO · 1998 · 14 pages')).toBeVisible();
  // The facts block, the shelf chip, Download and Open full page are gone: a
  // look, not a workbench. Registration facts belong to the full Reader.
  await expect(drawer.getByText('₹18,50,000')).toHaveCount(0);
  await expect(drawer.getByText('Registered')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Download' })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Open full page' })).toHaveCount(0);
});

test('the preview has no footer at all — no Close button beside an empty slot', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();
  // The shared footer is dropped when there is no primary. The only Close is
  // the header X.
  await expect(page.getByRole('dialog').locator('.drawerfoot')).toHaveCount(0);
});

// ── closing it ─────────────────────────────────────────────────────────

test('the header X puts the drawer away and leaves the owner on the shelf', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  // The header X is the only close control now the footer is gone.
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/papers\/shelf\/title$/);
});

test('Escape closes the read-only drawer at once, because there is nothing typed to lose', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// ── the other two doors onto the same drawer ───────────────────────────

test('a vault search hit opens the same preview drawer', async ({ page, world }) => {
  world.set('search', [{
    id: PAPER.deed, kind: 'paper', title: 'Sale deed 4412 of 1998',
    subtitle: 'Markapur SRO · 1998', route: `/app/papers/${PAPER.deed}`,
  }]);
  world.set('document', DEED);
  await page.goto('/app/papers');
  await page.getByLabel('Search your documents by name').fill('Sale deed');
  const hit = page.getByRole('link', { name: /Sale deed 4412 of 1998/ });
  await hit.click();

  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sale deed 4412 of 1998' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/papers$/);
});

// ── the reading surface earns a width, a grip and a zoom ───────────────

test('the preview opens wide enough to read, not at the 26rem an add-a-thing form uses', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  // 26rem is 416px. The reading surface opens well past that so a scan is
  // legible on open — the whole reason it is not the shared form width.
  const box = await page.getByRole('dialog').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(500);
});

test('the preview carries a resize grip a keyboard can drive, and add-a-thing drawers do not', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  const grip = page.getByRole('separator', { name: 'Resize the preview' });
  await expect(grip).toBeVisible();
  await expect(grip).toHaveAttribute('aria-orientation', 'vertical');

  // Left widens (the panel grows leftward into the page); the announced value
  // and the panel's own width both grow.
  const before = Number(await grip.getAttribute('aria-valuenow'));
  await grip.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const after = Number(await grip.getAttribute('aria-valuenow'));
  expect(after).toBeGreaterThan(before);
  await expect.poll(async () => (await page.getByRole('dialog').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before);
});

test('End narrows the preview to its floor, and it never falls below it', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);
  const row = await openTitleShelf(page);
  await row.click();

  const grip = page.getByRole('separator', { name: 'Resize the preview' });
  await grip.focus();
  await page.keyboard.press('End');
  // The floor is 380px (MIN_WIDTH); the announced value clamps there.
  expect(Number(await grip.getAttribute('aria-valuenow'))).toBe(380);
});

test('a width the owner set is remembered the next time a paper is opened', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', DEED);

  let row = await openTitleShelf(page);
  await row.click();
  const grip = page.getByRole('separator', { name: 'Resize the preview' });
  await grip.focus();
  await page.keyboard.press('Home'); // widen to the ceiling — a distinctive width
  const wide = Number(await grip.getAttribute('aria-valuenow'));
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Open it again — no reload, same session — and the width is where it was
  // left. (localStorage carries it across reloads too; this proves the read.)
  row = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
  await row.click();
  expect(Number(await page.getByRole('separator', { name: 'Resize the preview' }).getAttribute('aria-valuenow'))).toBe(wide);
});

test('an image scan can be zoomed in the preview, and the readout says by how much', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  serveBytes(world, 'image');
  const row = await openTitleShelf(page);
  await row.click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();
  const zoom = drawer.getByRole('group', { name: 'Zoom' });
  await expect(zoom).toBeVisible();
  await expect(zoom.getByText('100%')).toBeVisible();
  await zoom.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoom.getByText('115%')).toBeVisible();
});

test('a PDF is offered no zoom pill in the preview, because its own viewer owns that', async ({ page, world }) => {
  world.set('vaultPapers', [TITLE_ROW]);
  world.set('document', paper({ fileRef: REF })); // application/pdf
  serveBytes(world, 'pdf');
  const row = await openTitleShelf(page);
  await row.click();

  const drawer = page.getByRole('dialog');
  await expect(drawer.locator('iframe[title="Sale deed 4412 of 1998"]')).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Zoom' })).toHaveCount(0);
});

// ── on a phone ─────────────────────────────────────────────────────────

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the preview takes the whole screen and offers no resize grip @phone', async ({ page, world }) => {
    world.set('vaultPapers', [TITLE_ROW]);
    world.set('document', DEED);
    const row = await openTitleShelf(page);
    await row.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // Full-bleed: the saved desktop width (e.g. 640px) is forced to the whole
    // 390px viewport, so the panel is as wide as the screen and never runs off
    // the side of it.
    const box = await drawer.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390);
    // The grip resizes a panel that is the whole screen — nothing to resize, so
    // it is not there to be tabbed onto or dragged.
    await expect(page.getByRole('separator', { name: 'Resize the preview' })).toBeHidden();
  });

  test('the scan still fills the phone screen, top to bottom, with no empty band @phone', async ({ page, world }) => {
    world.set('vaultPapers', [TITLE_ROW]);
    world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
    serveBytes(world, 'image');
    const row = await openTitleShelf(page);
    await row.click();

    // The scan reaches close to the bottom of the panel — the body is flush and
    // the scan flexes to fill, so there is no dead cream band under it. Assert
    // the image's bottom is within a small margin of the drawer's bottom.
    const drawer = await page.getByRole('dialog').boundingBox();
    const img = await page.getByRole('dialog').getByRole('img', { name: /page 1 of 14/ }).boundingBox();
    const drawerBottom = (drawer?.y ?? 0) + (drawer?.height ?? 0);
    const imgBottom = (img?.y ?? 0) + (img?.height ?? 0);
    expect(drawerBottom - imgBottom).toBeLessThan(96);
  });
});
