/**
 * W03 · the papers hanger — /app/records/:id, the record's front page.
 *
 * A piece of land in the Indian system IS a stack of paper that agrees with
 * itself, so this is the hanger a record opens on. Everything a person can do
 * to that stack happens here: read one, rename one, unfile one, and add one —
 * and adding one is the only place in the 360 where the owner's own bytes
 * leave the browser. That is why more than half this file is about the upload.
 *
 * Four things a reader must know before changing anything here:
 *
 *   0. A PICK IS A FILING. The hidden `<input type=file aria-label="Add a paper
 *      to this record">` is mounted on the page at all times, and handing it
 *      files uploads them — which is why `filePapers` below is one helper and
 *      not two. There was a drawer here for a while, holding the pick so it
 *      could be listed by name and size and given a shelf; it was removed
 *      because it asked a person who had just chosen files in their own
 *      operating system's file browser to look at the same list again and
 *      confirm it, and because the shelf it asked about is one the reader gets
 *      right most of the time and the paper's own page can correct. What it was
 *      genuinely for is kept inline: the size limit refuses a pick by name
 *      before a byte leaves, a `role="status"` line names the file going up and
 *      which of upload/read/file is happening to it, and the header button
 *      relabels itself "Filing…" for the duration.
 *
 *   1. `fixtures/seed.ts` does NOT answer the upload POST. `uploadToDrive`
 *      posts to `/api/gateway/storage/files?appId=…` (storage.ts:50) and the
 *      seeded routes cover `/storage/files/<id>/content` and
 *      `/storage/(nodes|folders)` only — neither matches. So every test that
 *      files a paper answers that one itself with `acceptUploads()`, which is
 *      also what makes `uploads(world)` a true record of whether any byte left
 *      the page. It matches `/storage/files?` and not `/storage/files/<id>/
 *      content`, so reading stored bytes back is never counted as sending any.
 *   2. The reader IS seeded, and it is seeded as a failure: import-status
 *      answers `{ state: 'failed' }`, so an upload that says nothing about the
 *      reader lands on the unread path — its own filename, Unsorted. A test
 *      that wants a successful reading seeds `import-status` itself.
 *   3. This screen takes its three paper mutations with `reportError = false`
 *      (api.ts:783/832/846), so a refused rename, removal or filing is said in
 *      ONE line under the chip row — never in a toast. The line is `role
 *      ="alert"` because it appears well away from the row that asked.
 *
 * Two defects are recorded as `test.fail()`, each naming its cause: a reading
 * the classifier could not name filed as the literal word "Other", and a shelf
 * filter that is stranded on a shelf that no longer exists. Two more were here
 * and are now ordinary passing tests — the storage gateway's refusal reaching
 * the owner, and a paper filed but not read saying so — because both were the
 * same missing `catch` around `uploadToDrive`, which throws and never returns
 * the falsy node its callers were testing for.
 *
 * The offline branch (RecordPapers.tsx:675-681, "These papers have not loaded
 * — you appear to be offline.") IS covered, without cutting the wire. It needs
 * React Query's PAUSED state — no data, no error and no fetch in flight at
 * once — and a real `context.setOffline` cannot give it on a lazy route: with
 * the line down this screen's own chunk cannot arrive either, so the
 * ErrorBoundary takes the page before the list can say anything. `onlineManager`
 * decides paused-ness from the window's `offline` event alone
 * (@tanstack/query-core onlineManager.js), so `pretendOffline` raises that
 * event and leaves the wire — the dev server, the seal, the tiles, the chunk —
 * working. See "papers waiting on a connection".
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';
import { PAPERS, PHOTOS } from '../fixtures/seed';

/** The five papers seeded against Sy 214/2, read rather than re-typed. */
const PARCEL_PAPERS = PAPERS[ID.parcel] as Record<string, unknown>[];

const DEED = 'Sale deed 4412 of 1998';
const EC = 'Encumbrance certificate';
const FMB = 'FMB sketch';
const ADANGAL = 'Adangal 2025-26';
const SCAN = 'Scan 2026-08-02';

/** The size cap the screen states, as `mb(MAX_UPLOAD_BYTES)` prints it
 *  (filePhotos.ts:16/22). */
const LIMIT = '10.0 MB';

/** The one message every upload surface shows when storage is unreachable
 *  (pages/documents/storage.ts STORAGE_OFFLINE_MSG). */
const STORAGE_OFFLINE_MSG =
  'The file could not be uploaded. Check your connection and try again; your existing files are unchanged.';

/**
 * One paper's row.
 *
 * The list is a bare `<div className="rows boxed">` of bare `<div>`s — no list
 * role, no per-row landmark, nothing nameable (RecordPapers.tsx:547-561) — so
 * the only way to scope an assertion to one paper is the container class plus
 * the title link inside it. Everything else in this file goes through roles.
 */
const paperRow = (page: Page, title: string) =>
  page.locator('.rows.boxed > div').filter({ has: page.getByRole('link', { name: title, exact: true }) });

/** The placeholder rows the list draws while the papers are in flight. They
 *  are `aria-hidden` by design (skeletons.tsx:217), which is exactly how they
 *  are counted apart from real rows. */
const skeletonRows = (page: Page) => page.locator('.rows.boxed > div[aria-hidden="true"]');

/** Answer the byte-carrying POST, and only that one. */
function acceptUploads(world: World, node: Record<string, unknown>, delayMs?: number): void {
  world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: node, delayMs }));
}

/** The same, for a pick of several files: each upload is a different stored
 *  node, so `fileRef` can be asserted per file rather than per batch. */
function acceptUploadsInTurn(world: World, names: string[]): void {
  let n = 0;
  world.route(/\/api\/gateway\/storage\/files\?/, () => {
    const i = n; n += 1;
    return { json: { id: `file-uploaded-${i + 1}`, name: names[i] ?? `file-${i + 1}.pdf`, sizeBytes: 2_048, mimeType: 'application/pdf' } };
  });
}

/** Exactly the uploads, never the reads of already-stored bytes: the seeded
 *  `/storage/files/<id>/content` route shares that prefix. */
const uploads = (world: World) => world.restCalls(/\/storage\/files\?/);

/**
 * Flip React Query's idea of the network without touching the wire.
 *
 * `onlineManager` decides entirely from the window's own `online` / `offline`
 * events (@tanstack/query-core onlineManager.js), and a query with no data yet
 * does not FAIL while it is offline — it pauses: no data, no error, nothing in
 * flight. That is the one state RecordPapers.tsx:675-681 speaks for, and
 * raising the event rather than cutting the connection is what keeps the rest
 * of the page honest — the seal, the tiles and this lazy route's own chunk all
 * still arrive, so the branch under test is the list's and not the
 * ErrorBoundary's.
 */
const pretendOffline = (page: Page, offline: boolean) =>
  page.evaluate((off) => { window.dispatchEvent(new Event(off ? 'offline' : 'online')); }, offline);

/** The Photos card in the rail. `Card` renders a bare `<section>` with an
 *  `<h2>` inside it (ui.tsx Card) — no accessible name, so no region role to
 *  ask for — and its heading is the only thing that tells it from the map card
 *  beside it. */
const photosCard = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Photos', exact: true }) });

/** What `filePapers` hands `addPaper`, turned back into a row the next
 *  `papers` read will return — the empty shelf becoming `unsorted` the way
 *  web360.py:4632 does it, so the screen is asked to draw what the server
 *  would actually have filed. */
function filesLandOnTheShelf(world: World): void {
  const filed: Record<string, unknown>[] = [];
  world.set('papers', (vars) => (String(vars.id) === ID.parcel ? [...PARCEL_PAPERS, ...filed] : []));
  world.set('addPaper', (vars) => {
    filed.push({
      id: `w-paper-filed-${filed.length + 1}`,
      title: String(vars.name), detail: String(vars.subtitle),
      shelf: String(vars.shelf || 'unsorted'), icon: 'paper',
      tags: [], shared: false, pageCount: Number(vars.pageCount ?? 0),
      fileRef: String(vars.fileRef),
    });
    return `w-paper-filed-${filed.length}`;
  });
}

interface Picked { name: string; mimeType: string; buffer: Buffer }

/** A file of an exact size, for the limit. `Buffer.alloc` is zero-filled and
 *  cheap; the bytes never matter, only `File.size` does. */
const fileOf = (name: string, mb: number, mimeType = 'application/pdf'): Picked =>
  ({ name, mimeType, buffer: Buffer.alloc(Math.round(mb * 1_048_576)) });

/** The header's own "Add a paper". Scoped to the section head (`header.sechead`,
 *  RecordHead.SectionHead) because a record with nothing filed grows a second
 *  button of exactly that name in its empty state, and both open the same panel.
 *  It no longer relabels itself while a pick goes up — the panel's own primary
 *  reports that. */
const addTrigger = (page: Page) =>
  page.locator('header.sechead').getByRole('button', { name: 'Add a paper' });

/** The panel that files a pick (RecordPapers.PaperDrawer over the shared
 *  Drawer.tsx). Its heading counts the pick once there is more than one file. */
const paperDrawer = (page: Page) =>
  page.getByRole('dialog', { name: /^File (a paper|\d+ papers)$/ });

/** The panel's primary. It reads "Filing…" while the pick is going up, and
 *  becomes "Done" once everything is filed but something still needs saying. */
const fileButton = (page: Page) =>
  page.getByRole('button', { name: /^(File (the paper|\d+ papers)|Filing…|Done)$/ });

/**
 * Open the panel and hand it a pick, WITHOUT filing it.
 *
 * A pick is no longer a filing. The hidden input lives inside the panel, which
 * is the point of the panel: the files can be listed by name and size, a wrong
 * one taken out, and the shelf chosen — so every test about a refused pick can
 * assert the refusal without pressing anything, and the refusal arrives before
 * the press rather than after it.
 *
 * The explicit timeout is not decoration: `actionTimeout` is 10s suite-wide
 * (playwright.config.ts) and a ten-megabyte File crossing CDP goes well past
 * that on a machine running several suites at once, which failed these tests for
 * a reason that had nothing to do with the screen.
 */
const pickPapers = async (page: Page, files: Picked | Picked[]) => {
  await expect(addTrigger(page)).toBeEnabled();
  await addTrigger(page).click();
  await expect(paperDrawer(page)).toBeVisible();
  await page.getByLabel('Add a paper to this record')
    .setInputFiles(files, { timeout: 60_000 });
};

/**
 * Pick and file — what handing the input files used to do on its own.
 *
 * The panel does not always close on a clean filing: a paper the READER could
 * not make sense of is filed under its own name in Unsorted, and the panel holds
 * on that sentence so it can be read (see "a paper filed but not read says so").
 * The seeded reader in this world answers `{ state: 'failed' }` for everything,
 * so that is the ordinary path here rather than the exception — this dismisses
 * the notice so the tests that are about the SHELF can get to it. The one test
 * that is about the notice does not use this helper.
 */
const filePapers = async (page: Page, files: Picked | Picked[]) => {
  await pickPapers(page, files);
  await fileButton(page).click();
  // Three endings, and this waits for whichever arrives: the panel closes (a
  // clean filing), it holds on "Done" (something landed in Unsorted), or it holds
  // on an alert (a refusal, which the test that provoked it then asserts).
  // Checking `isVisible()` on the spot answers before any of them has happened,
  // and waiting for only one of them hangs for the other two.
  const done = paperDrawer(page).getByRole('button', { name: 'Done' });
  await expect.poll(async () => (
    await paperDrawer(page).count() === 0
    || await done.count() > 0
    || await paperDrawer(page).getByRole('alert').count() > 0
  ), { timeout: 30_000 }).toBe(true);
  if (await done.count()) await done.click();
};

// ── what is on the shelf ───────────────────────────────────────────────

test('every paper filed against the record is drawn with its name, its one line and its shelf', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(paperRow(page, DEED)).toContainText('Markapur SRO · 1998 · 14 pages');
  await expect(paperRow(page, DEED)).toContainText('● Title');
  await expect(paperRow(page, EC)).toContainText('1985 to 2026 · clear');
  await expect(paperRow(page, EC)).toContainText('● Search & tax');
  await expect(paperRow(page, FMB)).toContainText('Survey 214/2 · village map');
  await expect(paperRow(page, FMB)).toContainText('● Map');
  await expect(paperRow(page, ADANGAL)).toContainText('Revenue record · Katragunta');
  await expect(paperRow(page, ADANGAL)).toContainText('● Revenue record');
  await expect(paperRow(page, SCAN)).toContainText('Not yet sorted onto a shelf');
  await expect(paperRow(page, SCAN)).toContainText('● Unsorted');
});

test('a paper that has been sent to somebody says so on its own row, and a tagged one carries its tag', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);

  // Only the deed is `shared` and only the deed is tagged (seed.ts PAPERS).
  await expect(paperRow(page, DEED)).toContainText('shared');
  await expect(paperRow(page, DEED)).toContainText('original');
  await expect(paperRow(page, EC)).not.toContainText('shared');
});

test('the shelf chips count what is filed, and picking one narrows the list to that shelf', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);

  // One chip per shelf that has something on it, each counting the papers that
  // came back — not the 12 the record's own header claims. A chip counting the
  // header's number would be a shelf you could press and find empty.
  for (const shelf of ['Title 1', 'Search & tax 1', 'Map 1', 'Revenue record 1', 'Unsorted 1']) {
    await expect(page.getByRole('button', { name: shelf })).toBeVisible();
  }
  // …and no chip for a shelf nothing is on.
  await expect(page.getByRole('button', { name: /^Identity/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Old record/ })).toHaveCount(0);

  const title = page.getByRole('button', { name: 'Title 1' });
  await expect(title).toHaveAttribute('aria-pressed', 'false');
  await title.click();

  await expect(title).toHaveAttribute('aria-pressed', 'true');
  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(paperRow(page, EC)).toHaveCount(0);
  await expect(paperRow(page, SCAN)).toHaveCount(0);

  // The same chip lets go again — it is a filter, not a mode.
  await title.click();
  await expect(paperRow(page, EC)).toBeVisible();
});

test('searching the papers narrows them, and a search nothing matches says so rather than looking empty', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  const box = page.getByRole('textbox', { name: "Search this record's papers" });

  // The placeholder counts the record's own papers, not the rows on screen.
  await expect(box).toHaveAttribute('placeholder', 'Search the 12 papers on this parcel');

  await box.fill('encumbrance');
  await expect(paperRow(page, EC)).toBeVisible();
  await expect(paperRow(page, DEED)).toHaveCount(0);

  // The detail line is searched too, not only the title.
  await box.fill('katragunta');
  await expect(paperRow(page, ADANGAL)).toBeVisible();

  await box.fill('zzzz');
  await expect(page.getByText('No paper here matches that.')).toBeVisible();
  await expect(page.getByText('Nothing is filed against this parcel yet.')).toHaveCount(0);
});

test('a shelf and a search narrow together, not one instead of the other', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: 'Title 1' }).click();
  const box = page.getByRole('textbox', { name: "Search this record's papers" });

  // A word that matches a paper on ANOTHER shelf must not pull it through the
  // chip (RecordPapers.tsx:219-221 ands the two).
  await box.fill('encumbrance');
  await expect(page.getByText('No paper here matches that.')).toBeVisible();
  await expect(paperRow(page, EC)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Title 1' })).toHaveAttribute('aria-pressed', 'true');

  // And a word that matches on the chosen shelf still does.
  await box.fill('markapur');
  await expect(paperRow(page, DEED)).toBeVisible();
});

test('unfiling the last paper on a shelf leaves the filter stranded on a shelf that is gone', async ({ page, world }) => {
  // DEFECT — the chip row is derived from the papers that came back
  // (RecordPapers.tsx:213-217) while the shelf being filtered on is state that
  // nothing reconciles with it (RecordPapers.tsx:210). Remove the only paper
  // on a shelf while that shelf's chip is pressed and the chip goes with it,
  // filter still on: the four papers that remain are invisible, the page says
  // "No paper here matches that." over an empty search box, and there is no
  // control left on screen to let the filter go. The owner's own papers are
  // then unreachable until they reload the page — after an action whose whole
  // point was that it touched ONE paper.
  //
  // Owed: when the shelf a filter names is no longer on the wall, let it go —
  // the same way the chip lets go when it is pressed a second time.
  test.fail();
  world.set('papers', (vars) => {
    if (String(vars.id) !== ID.parcel) return [];
    return world.calls('deletePaper').length
      ? PARCEL_PAPERS.filter((p) => p.id !== 'w-paper-unsorted')
      : PARCEL_PAPERS;
  });
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: 'Unsorted 1' }).click();
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(() => world.calls('deletePaper').length).toBe(1);

  await expect(paperRow(page, DEED)).toBeVisible();
});

test('a paper’s name opens that paper in the Reader', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('link', { name: DEED, exact: true }).click();

  await expect(page).toHaveURL(/\/app\/papers\/w-paper-deed$/);
  await expect(page.getByRole('heading', { name: DEED })).toBeVisible();
  expect(world.lastVars('document')).toMatchObject({ id: 'w-paper-deed' });
});

// ── renaming ───────────────────────────────────────────────────────────

test('renaming a paper writes the new name and leaves the shelf where it is', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Rename ${FMB}` }).click();

  const box = page.getByRole('textbox', { name: `Rename ${FMB}` });
  await expect(box).toHaveValue(FMB);
  await box.fill('FMB sketch (2013 copy)');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => world.calls('updatePaper').length).toBe(1);
  // An empty shelf is "leave it alone" on the server (web360.py:4906), which
  // is what this screen means: it renames, it never re-files.
  expect(world.lastVars('updatePaper')).toEqual({
    paperId: 'w-paper-map', name: 'FMB sketch (2013 copy)', shelf: '',
  });
  // The row closes only once the answer is back.
  await expect(page.getByRole('textbox', { name: `Rename ${FMB}` })).toHaveCount(0);
});

test('Cancel on a rename keeps the old name and writes nothing', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('textbox', { name: `Rename ${EC}` }).fill('Something else entirely');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(paperRow(page, EC)).toBeVisible();
  await expect(page.getByText('Something else entirely')).toHaveCount(0);
  expect(world.calls('updatePaper')).toHaveLength(0);
});

test('a rename with the name rubbed out is refused, and nothing is written', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('textbox', { name: `Rename ${EC}` }).fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert'))
    .toHaveText('A paper needs a name — type one, or Cancel to keep the old one.');
  expect(world.calls('updatePaper')).toHaveLength(0);
  // Still open, so the fix is a keystroke rather than a second click.
  await expect(page.getByRole('textbox', { name: `Rename ${EC}` })).toBeVisible();
});

test('a rename the server declines leaves the paper under its old name, and says so', async ({ page, world }) => {
  world.set('updatePaper', false);
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('Village map 214/2');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert'))
    .toHaveText('FMB sketch could not be renamed. It is still filed under its old name.');
  await expect(paperRow(page, FMB)).toBeVisible();
  // The box stays open over the refused name — a retry is one press.
  await expect(page.getByRole('textbox', { name: `Rename ${FMB}` })).toHaveValue('Village map 214/2');
});

test('a rename that never reaches the server says the paper was not renamed', async ({ page, world }) => {
  world.set('updatePaper', World.gqlError('paper store unavailable'));
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('Village map 214/2');
  await page.getByRole('button', { name: 'Save' }).click();

  // This screen asks for the mutation with reportError=false (api.ts:783), so
  // this line is the whole notice — there is no toast behind it.
  await expect(page.getByRole('alert')).toHaveText('FMB sketch was not renamed. Try again.');
  await expect(paperRow(page, FMB)).toBeVisible();
});

test('a rename still in flight says it is saving, and will not take a second press', async ({ page, world }) => {
  world.set('updatePaper', World.slow(3_000, true));
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('Village map 214/2');
  await page.getByRole('button', { name: 'Save' }).click();

  const saving = page.getByRole('button', { name: 'Saving…' });
  await expect(saving).toBeVisible();
  await expect(saving, 'a second press would rename the same paper twice').toBeDisabled();

  // And the row closes only once the answer is actually back.
  await expect(page.getByRole('textbox', { name: `Rename ${FMB}` })).toHaveCount(0);
  expect(world.calls('updatePaper')).toHaveLength(1);
});

test('a renamed row hands the keyboard back to the button that opened it', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('FMB sketch (2013 copy)');
  await page.getByRole('button', { name: 'Save' }).click();

  // The box that held focus is gone; without restoreRowFocus (RecordPapers.tsx
  // :94-97, :588) focus falls to the document and a keyboard is back at the
  // top of the page after renaming the fourth paper down.
  await expect(page.getByRole('button', { name: `Rename ${FMB}` })).toBeFocused();
});

test('Cancel on a rename hands the keyboard back too', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('button', { name: `Rename ${EC}` })).toBeFocused();
});

test('the notice one paper left behind is cleared by the next thing the owner does', async ({ page, world }) => {
  // One line serves filing, renaming and removing (RecordPapers.tsx:525-531),
  // so a refusal that outlived the thing it was about would sit over a paper
  // it never described.
  world.set('updatePaper', false);
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('Village map 214/2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert'))
    .toHaveText('FMB sketch could not be renamed. It is still filed under its old name.');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(paperRow(page, FMB)).toBeVisible();
});

// ── removing ───────────────────────────────────────────────────────────

test('removing a paper asks first, and Keep backs out without unfiling it', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();

  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();

  expect(world.calls('deletePaper')).toHaveLength(0);
  await expect(paperRow(page, SCAN)).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${SCAN}` })).toBeVisible();
});

test('Remove unfiles the paper whose row asked, and no other', async ({ page, world }) => {
  world.set('papers', (vars) => {
    if (String(vars.id) !== ID.parcel) return [];
    return world.calls('deletePaper').length
      ? PARCEL_PAPERS.filter((p) => p.id !== 'w-paper-unsorted')
      : PARCEL_PAPERS;
  });
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect.poll(() => world.calls('deletePaper').length).toBe(1);
  expect(world.lastVars('deletePaper')).toEqual({ paperId: 'w-paper-unsorted' });
  await expect(paperRow(page, SCAN)).toHaveCount(0);
  await expect(paperRow(page, DEED)).toBeVisible();
});

test('a removal the server declines leaves the paper filed, and says to reload', async ({ page, world }) => {
  world.set('deletePaper', false);
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(page.getByRole('alert'))
    .toHaveText('Scan 2026-08-02 could not be removed — it may already be gone. Reload the page.');
  await expect(paperRow(page, SCAN)).toBeVisible();
  // The confirm pair holds, so a refusal can never read as a removal.
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
});

test('a removal that never reaches the server says the paper is still filed here', async ({ page, world }) => {
  world.set('deletePaper', World.gqlError('paper store unavailable'));
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Scan 2026-08-02 was not removed. It is still filed here.');
  await expect(paperRow(page, SCAN)).toBeVisible();
});

test('a removal still in flight says it is removing, and will not take a second press', async ({ page, world }) => {
  world.set('deletePaper', World.slow(3_000, true));
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  const removing = page.getByRole('button', { name: 'Removing…' });
  await expect(removing).toBeVisible();
  await expect(removing, 'the pair holds until the server has answered').toBeDisabled();
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();

  // And the pair collapses only when the paper is actually gone.
  await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
  expect(world.calls('deletePaper')).toHaveLength(1);
});

test('Keep hands the keyboard back to the row it was asked from', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Keep' }).click();

  await expect(page.getByRole('button', { name: `Remove ${SCAN}` })).toBeFocused();
});

test('a paper that is removed leaves the keyboard in the list it was removed from', async ({ page, world }) => {
  world.set('papers', (vars) => {
    if (String(vars.id) !== ID.parcel) return [];
    return world.calls('deletePaper').length
      ? PARCEL_PAPERS.filter((p) => p.id !== 'w-paper-unsorted')
      : PARCEL_PAPERS;
  });
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(paperRow(page, SCAN)).toHaveCount(0);

  // The row that held focus no longer exists, so the list itself takes it
  // (RecordPapers.tsx:624). It is a `tabIndex={-1}` div with no role once the
  // papers have landed, which is why this is the one focus assertion here that
  // cannot be written against a role.
  await expect(page.locator('.rows.boxed')).toBeFocused();
});

// ── filing a new paper ─────────────────────────────────────────────────

test('the picker lives in the panel, and takes a scan or a photograph of one', async ({ page }) => {
  // Handing the input files used to BE the filing, so the input was mounted on
  // the page at all times and there was never a moment at which the owner could
  // see what they had picked. It is inside the panel now, and so is the size
  // limit — a fact about choosing files, printed where the choosing happens.
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(page.getByLabel('Add a paper to this record')).toHaveCount(0);
  await expect(page.getByText(`Up to ${LIMIT} each`)).toHaveCount(0);
  await addTrigger(page).click();

  const panel = paperDrawer(page);
  await expect(panel).toBeVisible();
  // The panel names the record it is filing against, which the header it covers
  // was the only thing saying.
  await expect(panel.locator('.eyebrow')).toHaveText('Sy 214/2 · Papers');
  await expect(panel.locator('.scanbox')).toContainText('Drop the scan or photograph here');
  await expect(panel.locator('.scanbox')).toContainText('A photograph of the paper is enough');
  await expect(panel.locator('.scanbox')).toContainText(`Up to ${LIMIT} each.`);

  const picker = page.getByLabel('Add a paper to this record');
  await expect(picker).toHaveCount(1);
  await expect(picker).toHaveAttribute('accept', 'image/*,application/pdf');
  await expect(picker).toHaveAttribute('multiple', '');
  // Nothing picked, so there is nothing to file and nothing has gone anywhere.
  await expect(fileButton(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the panel offers the shelf as a choice, with the reader deciding by default', async ({ page }) => {
  // The shelf used to be settled entirely by the reader, and a wrong one was
  // corrected after the fact by renaming the paper from its row. It is an
  // override here — but only an override: left alone, the document decides.
  await page.goto(`/app/records/${ID.parcel}`);
  await addTrigger(page).click();
  const panel = paperDrawer(page);

  const decide = panel.getByRole('button', { name: 'Let Pattadar decide' });
  await expect(decide).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('Read off the document itself.');
  for (const shelf of ['Title', 'Revenue record', 'Map', 'Search & tax', 'Identity', 'Old record', 'Photos']) {
    await expect(panel.getByRole('button', { name: shelf, exact: true })).toBeVisible();
  }

  await panel.getByRole('button', { name: 'Title', exact: true }).click();
  await expect(decide).toHaveAttribute('aria-pressed', 'false');
  await expect(panel).toContainText('filed under Title, whatever the reader makes of it');
});

test('a record with nothing filed says so, and offers the same panel from its own empty state', async ({ page }) => {
  await page.goto(`/app/records/${ID.plot}`);

  await expect(page.getByText('Nothing is filed against this parcel yet.')).toBeVisible();
  // Its own button, so acting on the sentence just read does not mean going back
  // up to the section head. Two carry the name on an empty record; this is the
  // one inside the list.
  const inEmptyState = page.getByRole('button', { name: 'Add a paper' }).nth(1);
  await expect(inEmptyState).toBeEnabled();
  await inEmptyState.click();
  await expect(paperDrawer(page)).toBeVisible();
});

test('an oversize scan is refused by name, before a single byte is sent', async ({ page, world }) => {
  // Routed so that a byte that DID leave would be recorded rather than escaping
  // the seal unrecorded — `restCalls` only sees answered requests.
  acceptUploads(world, { id: 'file-uploaded', name: 'big.pdf', sizeBytes: 1, mimeType: 'application/pdf' });
  await page.goto(`/app/records/${ID.parcel}`);

  // Picked, not filed: the refusal arrives BEFORE the press now, which is the
  // real gain from the panel. It used to be a sentence printed after a press the
  // owner had already made.
  await pickPapers(page, fileOf('east-block-scan.pdf', 10.1));

  const panel = paperDrawer(page);
  await expect(panel.locator('.rows.boxed > div').filter({ hasText: 'east-block-scan.pdf' }))
    .toContainText(`10.1 MB · over the ${LIMIT} limit`);
  await expect(panel.getByRole('alert')).toContainText(
    'Take that one out to file the rest — nothing is uploaded while anything in the list is'
    + ' over the limit.');
  await expect(fileButton(page)).toBeDisabled();
  expect(world.restCalls(/storage/), 'no bytes may leave for a file the screen refused').toHaveLength(0);
  expect(world.restCalls(/import-/), 'and no reading may be paid for either').toHaveLength(0);
  expect(world.calls('addPaper')).toHaveLength(0);
  // The refusal is the panel's, not a toast's — same rule as every other write on
  // this screen.
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('one oversize scan in a pick refuses the whole pick, each named and sized', async ({ page, world }) => {
  acceptUploads(world, { id: 'file-uploaded', name: 'ok.pdf', sizeBytes: 1, mimeType: 'application/pdf' });
  await page.goto(`/app/records/${ID.parcel}`);

  // The small one is picked FIRST on purpose: the sizing used to happen inside
  // the filing loop, so this file was filed and the sentence then claimed nothing
  // had been. Nothing can be sent while anything in the list is over.
  await pickPapers(page, [
    fileOf('page-1.pdf', 0.001),
    fileOf('page-2.pdf', 10.1),
    fileOf('page-3.pdf', 10.2),
  ]);

  const rows = paperDrawer(page).locator('.rows.boxed > div');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'page-2.pdf' })).toContainText('10.1 MB · over the');
  await expect(rows.filter({ hasText: 'page-3.pdf' })).toContainText('10.2 MB · over the');
  await expect(paperDrawer(page).getByRole('alert')).toContainText('Take those out');
  // And the good one in the pick is not sent on its own, which is the fault this
  // test was written for.
  await expect(fileButton(page)).toBeDisabled();
  expect(world.restCalls(/storage/)).toHaveLength(0);
  expect(world.calls('addPaper')).toHaveLength(0);
});

test('a wrong file is taken out of the pick before a byte of it is sent', async ({ page, world }) => {
  // The whole point of holding the pick. A wrong file used to be noticed only
  // once it was on the shelf under a name the reader had given it, and unfiling
  // it then meant a storage upload, a paid reading and a delete.
  acceptUploads(world, {
    id: 'file-uploaded', name: 'east-block-scan.pdf', sizeBytes: 512, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await pickPapers(page, [fileOf('east-block-scan.pdf', 0.5), fileOf('wrong-folder.pdf', 0.2)]);
  const panel = paperDrawer(page);
  await expect(panel.getByRole('heading', { name: 'File 2 papers' })).toBeVisible();

  await panel.getByRole('button', { name: 'Take wrong-folder.pdf out' }).click();

  await expect(panel.locator('.rows.boxed > div')).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: 'File a paper' })).toBeVisible();
  await fileButton(page).click();

  // One upload, one filing, and the one that came out never left the browser.
  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  expect(world.restCalls(/storage/)).toHaveLength(1);
  expect(world.calls('addPaper').map((c) => c.vars.name)).not.toContain('wrong-folder.pdf');
});

test('a paper that is on the shelf can still be unfiled from its own row', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded', name: 'east-block-scan.pdf', sizeBytes: 512, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('east-block-scan.pdf', 0.5));
  const row = paperRow(page, 'east-block-scan.pdf');
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Remove east-block-scan.pdf' }).click();
  await row.getByRole('button', { name: 'Remove' }).click();

  await expect.poll(() => world.calls('deletePaper').length).toBe(1);
});

test('a scan the reader could read is filed under the register’s own name, on the Title shelf', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-4412', name: 'deed-scan.pdf', sizeBytes: 204_800, mimeType: 'application/pdf',
  });
  // The seed answers the reader with a failure on purpose; a successful
  // reading is the test's own business. `readAsync` (api/client.ts) polls
  // import-status and hands the whole body back, so `fields` rides on it.
  world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
    json: {
      state: 'done',
      fields: {
        doc_type: 'Sale Deed', document_no: '4412', reg_year: '1998',
        registration_date: '04/03/1998', sro: 'Markapur SRO', village: 'Katragunta',
      },
    },
  }));
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('IMG_7781.pdf', 0.2));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  expect(world.lastVars('addPaper')).toEqual({
    recordId: ID.parcel,
    fileRef: 'file-uploaded-4412',
    name: 'Sale Deed 4412/1998',
    subtitle: 'Registered 04/03/1998 · Markapur SRO · Katragunta',
    shelf: 'title',
    pageCount: 0,
    mimeType: 'application/pdf',
    sizeBytes: 204_800,
  });

  // And the shelf it landed on is the shelf the row shows.
  await expect(paperRow(page, 'Sale Deed 4412/1998')).toContainText('● Title');
  await expect(paperRow(page, 'Sale Deed 4412/1998')).toContainText('Registered 04/03/1998 · Markapur SRO · Katragunta');
});

test('a scan nothing could be read from is still filed, under its own filename, in Unsorted', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-blur', name: 'IMG_4482.pdf', sizeBytes: 5_120, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('IMG_4482.pdf', 0.005));

  // First, because a success toast slides away after 4.5s (Toast.tsx OK_MS) and
  // the assertions below take longer than that to walk.
  await expect(page.locator('.toast')).toContainText('The paper is filed.');

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  const vars = world.lastVars('addPaper');
  expect(vars).toMatchObject({
    fileRef: 'file-uploaded-blur', name: 'IMG_4482.pdf', shelf: '', pageCount: 0,
  });
  // An empty shelf is what the server files as Unsorted (web360.py:4632).
  expect(String(vars.subtitle)).toMatch(/^Filed \d{2}\/\d{2}\/\d{4}$/);

  await expect(paperRow(page, 'IMG_4482.pdf')).toContainText('● Unsorted');
});

test('a paper filed but not read says so, because a paper in Unsorted needs sorting by hand', async ({ page, world }) => {
  // The panel HOLDS on this rather than closing over it. Setting the sentence and
  // unmounting the panel in the same breath — which is what the first cut of the
  // drawer did — made it unreachable: a paper nobody could classify arrived with
  // a green toast and nothing saying it needed shelving by hand.
  acceptUploads(world, {
    id: 'file-uploaded-blur2', name: 'IMG_4482.pdf', sizeBytes: 5_120, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  // Not `filePapers`: that helper dismisses this very notice so the tests about
  // the SHELF can get past it. This one is about the notice, so it presses the
  // primary itself and leaves the panel where it is.
  await pickPapers(page, fileOf('IMG_4482.pdf', 0.005));
  await fileButton(page).click();

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  const panel = paperDrawer(page);
  await expect(panel).toBeVisible();
  // `status`, not `alert`: the paper IS filed. A red warning about a successful
  // filing is the screen saying something went wrong when nothing did.
  await expect(panel.getByRole('status')).toContainText(
    'IMG_4482.pdf is filed, but nothing could be read from it — it is in Unsorted,'
    + ' under its own file name, until you put it on a shelf.');
  // Nothing left to file, so the primary is the way out rather than a second
  // filing — and it cannot file the same scan twice.
  await expect(panel.getByRole('button', { name: 'Done' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(paperDrawer(page)).toHaveCount(0);
  expect(world.calls('addPaper')).toHaveLength(1);
});

test('a shelf chosen by hand means the reader failing is nothing worth saying', async ({ page, world }) => {
  // The notice above is about the READER deciding. Under an override the paper
  // went exactly where it was told to, so there is nothing left over to report
  // and the panel closes the way it does on any clean filing.
  acceptUploads(world, {
    id: 'file-uploaded-shelved', name: 'IMG_4482.pdf', sizeBytes: 5_120, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await pickPapers(page, fileOf('IMG_4482.pdf', 0.005));
  await paperDrawer(page).getByRole('button', { name: 'Old record', exact: true }).click();
  await fileButton(page).click();

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  expect(world.lastVars('addPaper')).toMatchObject({ shelf: 'old' });
  await expect(paperDrawer(page)).toHaveCount(0);
});

test('a paper the server refuses to file says how many were filed, and does not appear on the shelf', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-no', name: 'receipt.pdf', sizeBytes: 2_048, mimeType: 'application/pdf',
  });
  // An empty id on an otherwise perfect 200 — the server declining the row.
  world.set('addPaper', '');
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('receipt.pdf', 0.002));

  await expect(page.getByRole('alert'))
    .toHaveText('receipt.pdf was uploaded but could not be filed. 0 of 1 were filed.');
  await expect(paperRow(page, 'receipt.pdf')).toHaveCount(0);
  // The bytes did reach storage. The sentence says as much rather than
  // pretending the pick never happened.
  expect(world.restCalls(/storage\/files/)).toHaveLength(1);
});

test('a filing that never reaches the server says so on the page, not in a toast', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-err', name: 'receipt.pdf', sizeBytes: 2_048, mimeType: 'application/pdf',
  });
  world.set('addPaper', World.gqlError('paper store unavailable'));
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('receipt.pdf', 0.002));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  await expect(page.getByRole('alert'))
    .toHaveText('receipt.pdf was uploaded but could not be filed. 0 of 1 were filed.');
  await expect(paperRow(page, 'receipt.pdf')).toHaveCount(0);
  // useAddPaper(false) — the notice is this one line and nothing else.
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('the panel says it is filing, refuses a second press, and closes when the paper lands', async ({ page, world }) => {
  // Three round trips per paper — the bytes, the reading, the row — and they fail
  // for different reasons and take different amounts of time. Said on the control
  // that was pressed, which is the panel's own primary now rather than the header
  // button. No bar: the upload is a `fetch`, which reports nothing about a request
  // in flight, and a bar that crawled to 90% and sat there would be a lie drawn
  // in accent.
  acceptUploads(world, {
    id: 'file-uploaded-slow', name: 'slow.pdf', sizeBytes: 2_048, mimeType: 'application/pdf',
  }, 3_000);
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  // A shelf is chosen by hand so this test is only about the busy state: the
  // seeded reader fails everything, and under "Let Pattadar decide" that means
  // the panel would hold on its Unsorted notice instead of closing.
  await pickPapers(page, fileOf('slow.pdf', 0.002));
  await paperDrawer(page).getByRole('button', { name: 'Title', exact: true }).click();
  await fileButton(page).click();

  const working = paperDrawer(page).getByRole('button', { name: 'Filing…' });
  await expect(working).toBeVisible();
  await expect(working, 'a second press would file the same scan twice').toBeDisabled();
  // And the file cannot be taken out from under a write already going.
  await expect(page.getByRole('button', { name: 'Take slow.pdf out' })).toBeDisabled();

  // And it lands: the panel closes itself, which is what says the pick went in,
  // and the paper is on the shelf behind it.
  await expect(paperDrawer(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(addTrigger(page)).toBeEnabled();
  await expect(paperRow(page, 'slow.pdf')).toBeVisible();
  expect(world.calls('addPaper')).toHaveLength(1);
});

test('two scans picked at once are both filed, each against its own stored file', async ({ page, world }) => {
  acceptUploadsInTurn(world, ['east-block.pdf', 'west-block.pdf']);
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, [fileOf('east-block.pdf', 0.002), fileOf('west-block.pdf', 0.002)]);

  // First, because a success toast slides away after 4.5s (Toast.tsx OK_MS) and
  // the assertions below take longer than that to walk.
  await expect(page.locator('.toast')).toContainText('2 papers are filed.');

  await expect.poll(() => world.calls('addPaper').length).toBe(2);
  // Two files, two uploads, two rows — and each row pointing at the bytes that
  // are actually its own. One fileRef used twice is two papers over one scan.
  expect(world.calls('addPaper').map((c) => c.vars.fileRef))
    .toEqual(['file-uploaded-1', 'file-uploaded-2']);
  await expect(paperRow(page, 'east-block.pdf')).toBeVisible();
  await expect(paperRow(page, 'west-block.pdf')).toBeVisible();
});

test('a filing refused partway through a pick stops the pick, and counts what was filed', async ({ page, world }) => {
  acceptUploadsInTurn(world, ['page-1.pdf', 'page-2.pdf', 'page-3.pdf']);
  let filed = 0;
  world.set('addPaper', () => {
    filed += 1;
    return filed === 2 ? '' : `w-paper-filed-${filed}`;
  });
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, [
    fileOf('page-1.pdf', 0.002), fileOf('page-2.pdf', 0.002), fileOf('page-3.pdf', 0.002),
  ]);

  // The count is what makes this sentence worth reading: one of the three IS
  // filed, and a reader who picks all three again would file it twice.
  await expect(page.getByRole('alert'))
    .toHaveText('page-2.pdf was uploaded but could not be filed. 1 of 3 were filed.');
  // And the third file's bytes never left the browser — the loop stops at the
  // refusal rather than paying for the rest of the pick (RecordPapers.tsx:152-155).
  expect(uploads(world)).toHaveLength(2);
  expect(world.calls('addPaper')).toHaveLength(2);
});

test('a deed photographed on a phone is filed as a picture, with its one page', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-jpg', name: 'IMG_9001.jpg', sizeBytes: 300_000, mimeType: 'image/jpeg',
  });
  world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
    json: {
      state: 'done',
      fields: { doc_type: 'Sale Deed', document_no: '4412', reg_year: '1998', sro: 'Markapur SRO' },
    },
  }));
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('IMG_9001.jpg', 0.3, 'image/jpeg'));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  // The bytes decide the shelf before the reading gets a say: documentFamily
  // (packages/core/src/records/docFamilies.ts) answers 'photo' for anything
  // `image/*` "whatever anyone typed". So the commonest scan in India — a deed
  // photographed on a phone, read perfectly as Sale Deed 4412/1998 — is filed
  // on Photos rather than on Title, which is where the reader's own answer
  // says it belongs. Asserted as it is rather than marked a defect: the rule
  // is deliberate, shared with the phone (DocSpine.swift) and guarded by its
  // own unit test. Worth the owner's decision, not a test's.
  expect(world.lastVars('addPaper')).toMatchObject({
    name: 'Sale Deed 4412/1998', shelf: 'photos', pageCount: 1, mimeType: 'image/jpeg',
  });
  await expect(paperRow(page, 'Sale Deed 4412/1998')).toContainText('● Photos');
});

test('a scan the reader answered for but could not name is filed as “Other”', async ({ page, world }) => {
  // DEFECT — paperFiling.ts:55-67 falls back to the file's own name only when
  // the reading carries no label, and a reading ALWAYS carries one:
  // readDocument (pages/documents/upload.ts:123-142) sets `docTypeLabel =
  // labelOfType(classifierToType(doc_type))`, and that pair answers
  // 'other' → 'Other' for everything it does not recognise
  // (pages/documents/docTypes.ts:75-82). So `named` is never empty, `|| file.name`
  // is unreachable, and a paper the classifier could not place is filed under
  // the literal word "Other" — the one word on the row that says nothing about
  // the paper — with the filename the owner would have recognised thrown away.
  // The comment above describeReading (paperFiling.ts:45-46) promises the
  // opposite: "a classifier that returns nothing must still leave a filed
  // paper, under its own filename".
  //
  // Owed: treat 'other' as no label at all, and file it under file.name — the
  // same name the unread path already uses (paperFiling.ts:32-35).
  test.fail();
  acceptUploads(world, {
    id: 'file-uploaded-other', name: 'village-office-paper.pdf', sizeBytes: 4_096,
    mimeType: 'application/pdf',
  });
  world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
    json: {
      state: 'done',
      fields: { doc_type: 'Pahani extract of 1971', registration_date: '11/07/2004', sro: 'Markapur SRO' },
    },
  }));
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('village-office-paper.pdf', 0.004));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  expect(world.lastVars('addPaper')).toMatchObject({ name: 'village-office-paper.pdf' });
});

test('a second copy of the same scan is filed under the name storage gave it', async ({ page, world }) => {
  // uploadToDrive sends `onConflict=duplicate` (storage.ts:50-63), so a file
  // whose name is already taken lands beside the first as "sale-deed (2).pdf"
  // rather than over it. The row has to carry the name the bytes are actually
  // under — `unreadRow(node.name, …)`, not the name on the owner's disk —
  // or the vault holds two rows called the same thing and one of them opens
  // the other's file.
  acceptUploads(world, {
    id: 'file-uploaded-dup', name: 'sale-deed (2).pdf', sizeBytes: 2_048, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/app/records/${ID.parcel}`);

  await filePapers(page, fileOf('sale-deed.pdf', 0.002));

  // First, because a success toast slides away after 4.5s (Toast.tsx OK_MS). The
  // reader is seeded as a failure, so this one also lands in Unsorted and says so
  // — see "a paper filed but not read says so" above. The confirmation still
  // fires, because every file in the pick did reach the shelf.
  await expect(page.locator('.toast')).toContainText('The paper is filed.');

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  expect(world.lastVars('addPaper')).toMatchObject({
    name: 'sale-deed (2).pdf', fileRef: 'file-uploaded-dup',
  });
  await expect(paperRow(page, 'sale-deed (2).pdf')).toBeVisible();
});

test.describe('the upload error path', () => {
  test('an upload the storage gateway refuses says so, in the sentence this screen already means', async ({ page, world }) => {
    // This pair used to be two halves of one defect. `uploadToDrive` throws on
    // every failure and never returns the falsy node its callers were guarding
    // for, so the rejection escaped as an unhandled promise rejection: the button
    // flashed "Filing…", came back, and said nothing — no paper, no reason, no
    // hint that trying again might work. STORAGE_OFFLINE_MSG was unreachable
    // code. It is caught now, in one place both hangers share
    // (storage.uploadFailureMessage), which is why the console guard no longer
    // has to stand down for these two.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      status: 503, json: { error: 'storage is not running' },
    }));
    await page.goto(`/app/records/${ID.parcel}`);

    await filePapers(page, fileOf('east-block-scan.pdf', 0.002));

    // The gateway's own words are not the owner's: "storage is not running" is a
    // detail for whoever reads the logs. Only the four statuses with wording
    // written for the person holding the file get printed as they are.
    await expect(page.getByRole('alert')).toHaveText(STORAGE_OFFLINE_MSG);
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('a failed upload still leaves nothing half-filed: no row, and no paper on the shelf', async ({ page, world }) => {
    // The same refusal, asserted from the other side — whatever the screen says,
    // it must not file a paper whose bytes do not exist.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      status: 503, json: { error: 'storage is not running' },
    }));
    filesLandOnTheShelf(world);
    await page.goto(`/app/records/${ID.parcel}`);

    await filePapers(page, fileOf('east-block-scan.pdf', 0.002));

    await expect(page.getByRole('alert')).toHaveText(STORAGE_OFFLINE_MSG);
    // The button is free again, so the owner can pick the same file the moment
    // the gateway is back — which is what clearing the input's value is for.
    await expect(addTrigger(page)).toBeEnabled();
    expect(world.calls('addPaper')).toHaveLength(0);
    await expect(paperRow(page, 'east-block-scan.pdf')).toHaveCount(0);
    await expect(paperRow(page, DEED)).toBeVisible();
  });
});

// ── the empty, the loading and the failed ──────────────────────────────

test('a record with nothing filed says so, and still offers the button that files the first paper', async ({ page }) => {
  await page.goto(`/app/records/${ID.plot}`);

  await expect(page.getByText(
    'Nothing is filed against this parcel yet. A deed, a passbook or a receipt added here'
    + ' becomes searchable by its text', { exact: false })).toBeVisible();
  await expect(page.getByText('No paper here matches that.')).toHaveCount(0);
  // No shelves, because nothing is on one.
  await expect(page.getByRole('button', { name: /^Title/ })).toHaveCount(0);

  const box = page.getByRole('textbox', { name: "Search this record's papers" });
  await expect(box).toHaveAttribute('placeholder', 'No papers on this parcel yet');

  // The add control is a real button, in the tab order, precisely so that filing
  // a paper is possible from the keyboard. With no shelf chips in between, it is
  // the very next stop after the search box.
  await box.focus();
  await page.keyboard.press('Tab');
  await expect(addTrigger(page)).toBeFocused();

  // And the empty state has one of its own, so acting on the sentence just read
  // does not mean going back up to the section head. Only here, where the record
  // is genuinely bare: under a filter that missed, the thing to do is clear the
  // filter, not file a paper.
  const inEmptyState = page.getByRole('button', { name: 'Add a paper' }).nth(1);
  await expect(inEmptyState).toBeEnabled();
  // Both open the same panel, and the picker is in there — not on the page, where
  // handing it files used to be the whole interaction.
  await expect(page.getByLabel('Add a paper to this record')).toHaveCount(0);
  await inEmptyState.click();
  await expect(paperDrawer(page)).toBeVisible();
  await expect(page.getByLabel('Add a paper to this record')).toHaveCount(1);
});

test('a flat’s papers are a property’s papers, not a parcel’s', async ({ page }) => {
  await page.goto(`/app/records/${ID.flat}`);

  // nounFor (ui.tsx:118) — copy on this screen addresses one specific thing,
  // and "this parcel" over a third-floor flat has stopped being about the
  // reader's property.
  await expect(page.getByRole('textbox', { name: "Search this record's papers" }))
    .toHaveAttribute('placeholder', 'Search the 5 papers on this property');
  await expect(paperRow(page, 'Sale agreement')).toContainText('● Title');
});

test('papers that have not arrived yet draw placeholder rows, and never claim the shelf is empty', async ({ page, world }) => {
  world.set('papers', World.never());
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(page.getByRole('status', { name: 'Loading the papers on this parcel' })).toBeVisible();
  await expect(skeletonRows(page)).toHaveCount(3);
  await expect(page.getByText('Nothing is filed against this parcel yet.')).toHaveCount(0);
  await expect(page.getByText('No paper here matches that.')).toHaveCount(0);
  await expect(page.getByText('These papers did not load')).toHaveCount(0);
  // The rest of the record is not held up by it.
  await expect(page.getByRole('heading', { name: 'Sy 214/2' })).toBeVisible();
});

test('papers that did not load say so, with the reason and a way to ask again', async ({ page, world }) => {
  world.set('papers', World.gqlError('the paper store is down'));
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(page.getByText('These papers did not load')).toBeVisible();
  await expect(page.getByText('the paper store is down')).toBeVisible();
  // A read that never came back is not an empty shelf (RecordPapers.tsx:643).
  await expect(page.getByText('Nothing is filed against this parcel yet.')).toHaveCount(0);
  await expect(page.getByText('No paper here matches that.')).toHaveCount(0);

  const asked = world.calls('papers').length;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => world.calls('papers').length).toBeGreaterThan(asked);
});

test('a refetch that fails after a good load keeps the papers the owner can still read', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  await expect(paperRow(page, DEED)).toBeVisible();

  // Every mutation on this screen invalidates the whole w360 key, so a rename
  // is the ordinary way a background refetch happens here.
  world.set('papers', World.gqlError('the paper store is down'));
  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('FMB sketch (2013 copy)');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => world.calls('papers').length).toBeGreaterThan(1);
  // Gated on `!papers` rather than on the error alone: an error slab here
  // would hide five papers that are still on screen and still readable.
  await expect(page.getByText('These papers did not load')).toHaveCount(0);
  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(paperRow(page, EC)).toBeVisible();
});

test.describe('papers waiting on a connection', () => {
  /** The record's other hangers, where the record itself is already cached and
   *  `papers` is still a key nothing has asked for — the only standing start
   *  from which the list can be met by a dead line. */
  const featuresFirst = async (page: Page) => {
    await page.goto(`/app/records/${ID.parcel}/features`);
    await expect(page.getByRole('navigation', { name: 'This record' })).toBeVisible();
  };
  const papersTab = (page: Page) =>
    page.getByRole('navigation', { name: 'This record' }).getByRole('link', { name: /^Papers/ });

  test('papers that cannot be asked for say the line is down, not that the shelf is empty', async ({ page, world }) => {
    await featuresFirst(page);
    await pretendOffline(page, true);
    await papersTab(page).click();

    await expect(page.getByText('These papers have not loaded — you appear to be offline.')).toBeVisible();
    // A paused query is one that never reached the wire — which is the whole
    // difference between this line and "These papers did not load".
    expect(world.calls('papers'), 'nothing may be asked for while the line is down').toHaveLength(0);
    await expect(page.getByText('Nothing is filed against this parcel yet.')).toHaveCount(0);
    await expect(page.getByText('No paper here matches that.')).toHaveCount(0);
    await expect(page.getByText('These papers did not load')).toHaveCount(0);
    await expect(skeletonRows(page)).toHaveCount(0);
    // The record around them is cached and still readable.
    await expect(page.getByRole('heading', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('the papers arrive on their own the moment the line is back', async ({ page, world }) => {
    await featuresFirst(page);
    await pretendOffline(page, true);
    await papersTab(page).click();
    await expect(page.getByText('These papers have not loaded — you appear to be offline.')).toBeVisible();

    await pretendOffline(page, false);

    // No reload, no Try again: the read the screen never got to make is made
    // for it. Anything less and a phone that walked back into signal keeps
    // saying it is offline.
    await expect(paperRow(page, DEED)).toBeVisible();
    await expect(page.getByText('These papers have not loaded')).toHaveCount(0);
    expect(world.calls('papers')).toHaveLength(1);
  });
});

test('a record that is not in the portfolio never gets as far as its papers', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.missing}`);

  await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
  expect(world.calls('papers')).toHaveLength(0);
});

// ── sharing the whole record ───────────────────────────────────────────
//
// The panel is drawn by this screen (RecordPapers.tsx:276-338) and it is the
// only surface that shares a WHOLE record — 12-reader covers the Reader's
// dialog, which is a different component sharing one paper. A link handed to a
// bank is the most consequential thing this page can do, so its refusals are
// asserted as carefully as the writes.

test('a record opened from the list’s Share… arrives with the panel open, and the URL does not keep it', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}?share=1`);

  // Open and already focused — the "…" in the list's label is honoured rather
  // than dropping the reader here to hunt for the button.
  await expect(page.getByLabel('Who is it for')).toBeFocused();
  // And consumed at once (RecordPapers.tsx:69-76): left in the URL it would
  // reopen on every reload and ride along into anything copied from the bar.
  await expect(page).toHaveURL(`/app/records/${ID.parcel}`);
});

test('sharing the record makes a link to the whole record, not to one paper', async ({ page, world }) => {
  world.set('createShareLink', '/share/9Fk3p');
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: 'Share securely' }).click();

  const share = page.getByRole('button', { name: 'Share', exact: true });
  await expect(share, 'a link with nobody named is a link to nobody').toBeDisabled();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await expect(share).toBeEnabled();
  await share.click();

  await expect(page.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/9Fk3p');
  // No documentIds: the whole record's current papers, which is what the
  // panel's own sentence promises. A stray paper list here would hand a bank
  // less than the owner believed they sent.
  expect(world.lastVars('createShareLink')).toEqual({
    recordId: ID.parcel, audience: 'Union Bank, Markapur', terms: 'view', days: 30,
  });
  // The panel closing is the only thing that changes on screen, so it is also
  // said out loud (RecordPapers.tsx:301).
  await expect(page.getByText('The link is ready to copy and send.')).toBeVisible();
});

test('a link the server would not make says so, and keeps the name that was typed', async ({ page, world }) => {
  // An empty id on an otherwise perfect 200 — the server declining to share.
  world.set('createShareLink', '');
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'No link was made for Union Bank, Markapur — this record may no longer be yours to share.');
  // Nothing that could be mistaken for a link, and the typed name is still
  // there so a second try is one press.
  await expect(page.getByLabel('Recipient link')).toHaveCount(0);
  await expect(page.getByLabel('Who is it for')).toHaveValue('Union Bank, Markapur');
});

test('a share that never reaches the server says nothing has been shared', async ({ page, world }) => {
  world.set('createShareLink', World.gqlError('share links are switched off on this build'));
  await page.goto(`/app/records/${ID.parcel}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('The link was not made. Nothing has been shared.');
  // useCreateShareLink(false) on this screen (RecordPapers.tsx:49) — the line
  // in the panel is the whole notice, and the comment beside the catch that
  // says the mutation raised its own is describing the other caller.
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.getByLabel('Recipient link')).toHaveCount(0);
});

test('Cancel on the share panel shares nothing and hands the keyboard back', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.parcel}`);
  const trigger = page.getByRole('button', { name: 'Share securely' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByLabel('Who is it for')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  expect(world.calls('createShareLink')).toHaveLength(0);
});

// ── the rail's Photos card ─────────────────────────────────────────────
//
// It is drawn by this screen (RecordPapers.tsx:799-906) and it is the other
// half of the file this page shares with the gallery (filePhotos.ts). The
// gallery's own copy is covered in 10-record-photos; what is asserted here is
// the card the record's front page draws, which is the surface a record with
// NO photos ever sees.

test('the rail counts the stills apart from the clips, because a clip is not a photo', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);

  // Three filed, one of them a video: the card says two and a video rather
  // than three photos (RecordPapers.tsx:802-807).
  await expect(photosCard(page).getByText('2 · 1 video', { exact: true })).toBeVisible();
  await expect(photosCard(page).getByText('Last visit 12 Aug 2026')).toBeVisible();
  await expect(photosCard(page).getByRole('link', { name: 'Open gallery ›' })).toBeVisible();
});

test('a gallery that comes back empty over a record that counts photos says which is which', async ({ page, world }) => {
  // `photos` is seeded as a function of the id, so it cannot be `seedOf`'d —
  // the shape is taken from the seed's own object instead.
  world.set('photos', { ...PHOTOS, photos: [], videoCount: 0, total: 0 });
  await page.goto(`/app/records/${ID.parcel}`);

  // The record says 18 (recordOf, fixtures/seed.ts) and the gallery answered
  // with none. Saying "nothing photographed here yet" over a record that
  // counts eighteen would be the app calling its own header a liar.
  await expect(photosCard(page).getByText(
    'The record says 18 photos are filed, but the gallery returned none.'
    + ' Try opening the gallery again.')).toBeVisible();
  await expect(photosCard(page).getByText('Nothing filmed or photographed here yet.')).toHaveCount(0);
});

test('a record with nothing photographed is offered the picker, not a gallery that does not exist', async ({ page }) => {
  await page.goto(`/app/records/${ID.plot}`);

  await expect(photosCard(page).getByText(
    'Nothing filmed or photographed here yet. A dated, geo-stamped photo is what'
    + ' makes everything else on this record checkable.')).toBeVisible();
  // Outside every branch on purpose (RecordPapers.tsx:866-870): the record
  // with no photos is the one that needs the picker most.
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeEnabled();
  await expect(photosCard(page).getByText(`Photo or video, up to ${LIMIT}`)).toBeVisible();
});

test('an oversize photo picked from the record page is refused by name, before a byte is sent', async ({ page, world }) => {
  // Same cap, same sentence, a different surface — and the same reason for
  // routing the upload: a byte that DID leave must be recorded rather than
  // escape the seal unseen.
  acceptUploads(world, { id: 'file-uploaded', name: 'walk.mp4', sizeBytes: 1, mimeType: 'video/mp4' });
  await page.goto(`/app/records/${ID.parcel}`);

  await page.getByLabel('Add a photo or video to this record')
    .setInputFiles(fileOf('east-walk.mp4', 10.4, 'video/mp4'), { timeout: 60_000 });

  await expect(page.getByRole('alert')).toHaveText(
    `east-walk.mp4 (10.4 MB) is over the ${LIMIT} limit — nothing was uploaded.`
    + ' Shrink or drop it and pick again.');
  expect(uploads(world), 'no bytes may leave for a file the card refused').toHaveLength(0);
  expect(world.calls('addPhoto')).toHaveLength(0);
});

test('@phone the papers, their shelves and the button that adds one all survive a 390px screen', async ({ page }) => {
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(paperRow(page, DEED)).toContainText('● Title');
  await expect(page.getByRole('button', { name: 'Add a paper' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${DEED}` })).toBeVisible();

  // Nothing may push the page sideways: a horizontal scrollbar on a phone is
  // how a row's controls end up off the edge of the glass.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the papers hanger must not scroll sideways').toBeLessThanOrEqual(1);
});
