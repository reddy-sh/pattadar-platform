/**
 * W03 · the papers hanger — /properties/:id, the record's front page.
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
 * One defect is recorded as `test.fail()`, naming its cause: a reading the
 * classifier could not name filed as the literal word "Other". Three more were
 * here and are now ordinary passing tests — the storage gateway's refusal
 * reaching the owner, and a paper filed but not read saying so, because both
 * were the same missing `catch` around `uploadToDrive`, which throws and never
 * returns the falsy node its callers were testing for; and a shelf filter left
 * stranded on a shelf that no longer exists (fixed 28/09/2026).
 *
 * The offline branch (RecordPapers.tsx, the app's one UNREACHABLE_NOTE, which
 * replaced "These papers have not loaded") IS covered, without cutting the wire. It needs
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
import { PAPERS } from '../fixtures/seed';

/** The five papers seeded against Sy 214/2, read rather than re-typed. */
const PARCEL_PAPERS = PAPERS[ID.parcel] as Record<string, unknown>[];

const DEED = 'Sale deed 4412 of 1998';
const EC = 'Encumbrance certificate';
const FMB = 'FMB sketch';
const ADANGAL = 'Adangal 2025-26';
const SCAN = 'Scan 2026-08-02';

/** The size cap the screen states, as `mb(MAX_UPLOAD_BYTES)` prints it
 *  (filePhotos.ts:16/22). */
const LIMIT = '15.0 MB';

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

/** The shelf a row is filed on: the one plain chip in its trailing group
 *  (RecordPapers.tsx `.paper-row-actions`). Asserted as the chip's whole text,
 *  so a shelf word that merely appears somewhere in the row cannot pass. */
const shelfChip = (page: Page, title: string) => paperRow(page, title).locator('.chip');

/** The shelves are the shared filter surface (ui.tsx FacetFilter): "+ Filter"
 *  opens a panel of options, each a toggle named for its shelf and the count
 *  of papers on it, and pressed while on. */
const openShelfFilter = async (page: Page) => {
  const trigger = page.getByRole('button', { name: '+ Filter' });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  return page.getByRole('group', { name: 'Filter documents' });
};
/** One option in that panel, by its shelf word and the count it carries —
 *  the whole name, so "Title 1" is not also "Title 12". */
const reEscape = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const shelfOption = (filter: ReturnType<Page['locator']>, shelf: string, n: number) =>
  filter.getByRole('button', { name: new RegExp('^' + reEscape(shelf) + '\\s*' + n + '$') });

/** The shared confirmation (PropertyActions.tsx ConfirmDialog) a removal asks
 *  in, titled with the document it would unfile. */
const removeDialog = (page: Page, title: string) =>
  page.getByRole('dialog', { name: `Remove ${title}?` });

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

/** The header's own "Add a document". Scoped to the section head
 *  (`header.sechead`, RecordHead.SectionHead). It is the only way into the
 *  panel now — the empty state no longer carries a second button of the same
 *  name. It does not relabel itself while a pick goes up — the panel's own
 *  primary reports that. */
const addTrigger = (page: Page) =>
  page.locator('header.sechead').getByRole('button', { name: 'Add a document' });

/** The panel that files a pick (RecordPapers.PaperDrawer over the shared
 *  Drawer.tsx). Its heading counts the pick once there is more than one file. */
const paperDrawer = (page: Page) =>
  page.getByRole('dialog', { name: /^File (a document|\d+ documents)$/ });

/** The panel's primary. It reads "Filing…" while the pick is going up, and
 *  becomes "Done" once everything is filed but something still needs saying. */
const fileButton = (page: Page) =>
  page.getByRole('button', { name: /^(File (the document|\d+ documents)|Filing…|Done)$/ });

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
  await page.getByLabel('Add a document to this property')
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  // The shelf is a plain chip with the shelf's word and nothing else: the "●"
  // it used to lead with was decoration a screen reader read out as a glyph.
  await expect(paperRow(page, DEED)).toContainText('Markapur SRO · 1998 · 14 pages');
  await expect(shelfChip(page, DEED)).toHaveText('Title deeds');
  await expect(paperRow(page, EC)).toContainText('1985 to 2026 · clear');
  await expect(shelfChip(page, EC)).toHaveText('EC & tax receipts');
  await expect(paperRow(page, FMB)).toContainText('Survey 214/2 · village map');
  await expect(shelfChip(page, FMB)).toHaveText('Map');
  await expect(paperRow(page, ADANGAL)).toContainText('Revenue record · Katragunta');
  await expect(shelfChip(page, ADANGAL)).toHaveText('Revenue records');
  await expect(paperRow(page, SCAN)).toContainText('Not yet sorted onto a shelf');
  await expect(shelfChip(page, SCAN)).toHaveText('Not sorted yet');
});

test('a paper that has been sent to somebody says so on its own row, and a tagged one carries its tag', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);

  // Only the deed is `shared` and only the deed is tagged (seed.ts PAPERS).
  await expect(paperRow(page, DEED)).toContainText('shared');
  await expect(paperRow(page, DEED)).toContainText('original');
  await expect(paperRow(page, EC)).not.toContainText('shared');
});

test('the shelf chips count what is filed, and picking one narrows the list to that shelf', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);

  // One option per shelf that has something on it, each counting the papers
  // that came back — not the 12 the record's own header claims. An option
  // counting the header's number would be a shelf you could press and find
  // empty.
  const filter = await openShelfFilter(page);
  for (const shelf of ['Title deeds', 'EC & tax receipts', 'Map', 'Revenue records', 'Not sorted yet']) {
    await expect(shelfOption(filter, shelf, 1)).toBeVisible();
  }
  // …and no option for a shelf nothing is on.
  await expect(filter.getByRole('button', { name: /^Identity/ })).toHaveCount(0);
  await expect(filter.getByRole('button', { name: /^Old records/ })).toHaveCount(0);

  const title = shelfOption(filter, 'Title deeds', 1);
  await expect(title).toHaveAttribute('aria-pressed', 'false');
  await title.click();

  await expect(title).toHaveAttribute('aria-pressed', 'true');
  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(paperRow(page, EC)).toHaveCount(0);
  await expect(paperRow(page, SCAN)).toHaveCount(0);
  // The band's tally says how far the filter narrows; the heading's line
  // keeps the record's whole count (design.md § Page head slot 3).
  await expect(page.locator('.filterbar .tally')).toHaveText('1 of 5 shown');
  await expect(page.locator('header.sechead').filter({ has: page.getByRole('heading', { name: 'Documents', exact: true }) }).locator('p.note')).toHaveText('5 documents');

  // The same option lets go again — it is a filter, not a mode.
  await title.click();
  await expect(paperRow(page, EC)).toBeVisible();
  await expect(page.locator('header.sechead').filter({ has: page.getByRole('heading', { name: 'Documents', exact: true }) }).locator('p.note')).toHaveText('5 documents');
  await expect(page.locator('.filterbar .tally')).toHaveText('5 of 5 shown');
});

test('searching the papers narrows them, and a search nothing matches says so rather than looking empty', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  const box = page.getByRole('textbox', { name: "Search this property's documents" });

  // The count is told once, in the heading's line ("Tell a fact once",
  // design.md § Property tabs), so the placeholder just says what it searches.
  await expect(box).toHaveAttribute('placeholder', 'Search documents');

  // The search sits in the band with the filter, not in the section's head.
  await expect(page.locator('.filterbar').getByRole('textbox', { name: "Search this property's documents" })).toBeVisible();
  await expect(page.locator('header.sechead').getByRole('textbox')).toHaveCount(0);

  await box.fill('encumbrance');
  await expect(paperRow(page, EC)).toBeVisible();
  await expect(paperRow(page, DEED)).toHaveCount(0);
  await expect(page.locator('.filterbar .tally')).toHaveText('1 of 5 shown');

  // The detail line is searched too, not only the title.
  await box.fill('katragunta');
  await expect(paperRow(page, ADANGAL)).toBeVisible();

  await box.fill('zzzz');
  await expect(page.getByText('No document here matches that.')).toBeVisible();
  await expect(page.getByText('No documents on this parcel yet.')).toHaveCount(0);
});

test('a shelf and a search narrow together, not one instead of the other', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  await shelfOption(await openShelfFilter(page), 'Title deeds', 1).click();
  const box = page.getByRole('textbox', { name: "Search this property's documents" });

  // A word that matches a paper on ANOTHER shelf must not pull it through the
  // filter (RecordPapers.tsx `shown` ands the two).
  await box.fill('encumbrance');
  await expect(page.getByText('No document here matches that.')).toBeVisible();
  await expect(paperRow(page, EC)).toHaveCount(0);
  // The shelf is still on: its chip stands in the filter bar.
  await expect(page.getByRole('button', { name: 'Remove filter Shelf Title' })).toBeVisible();

  // And a word that matches on the chosen shelf still does.
  await box.fill('markapur');
  await expect(paperRow(page, DEED)).toBeVisible();
});

test('unfiling the last paper on a shelf lets the filter on that shelf go with it', async ({ page, world }) => {
  // Was a DEFECT marker: the filter options were derived from the papers that
  // came back while the shelf being filtered on was state nothing reconciled
  // with them, so removing the only paper on a filtered shelf hid the four
  // left behind a filter on a shelf that was gone, with no control left to
  // let it go. Fixed 28/09/2026 (RecordPapers.tsx `activeShelves`): a shelf
  // the papers no longer fill is not a filter, the Site features tab's rule.
  world.set('papers', (vars) => {
    if (String(vars.id) !== ID.parcel) return [];
    return world.calls('deletePaper').length
      ? PARCEL_PAPERS.filter((p) => p.id !== 'w-paper-unsorted')
      : PARCEL_PAPERS;
  });
  await page.goto(`/properties/${ID.parcel}/documents`);

  await shelfOption(await openShelfFilter(page), 'Not sorted yet', 1).click();
  await expect(paperRow(page, DEED)).toHaveCount(0);
  // Put the panel away first: it opens over the top of the list.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(() => world.calls('deletePaper').length).toBe(1);

  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter Shelf Not sorted yet' })).toHaveCount(0);
  await expect(page.locator('header.sechead').filter({ has: page.getByRole('heading', { name: 'Documents', exact: true }) }).locator('p.note')).toHaveText('4 documents');
});

test('a long shelf pages twenty at a time, and a search goes back to the first page', async ({ page, world }) => {
  // 25 papers: the seeded five plus twenty scans, so the list passes one page.
  const many = [...PARCEL_PAPERS, ...Array.from({ length: 20 }, (_, i) => ({
    ...PARCEL_PAPERS[0], id: `w-paper-many-${i + 1}`, title: `Extra scan ${i + 1}`, tags: [], shared: false,
  }))];
  world.set('papers', (vars) => (String(vars.id) === ID.parcel ? many : []));
  await page.goto(`/properties/${ID.parcel}/documents`);
  const pager = page.getByRole('navigation', { name: 'Document pages' });
  const rows = page.locator('.rows.boxed > div');

  await expect(pager).toContainText('1–20 of 25');
  await expect(rows).toHaveCount(20);
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('21–25 of 25');
  await expect(rows).toHaveCount(5);

  // A narrower list is a new list: it starts again from its first page.
  await pager.getByRole('button', { name: '5', exact: true }).click();
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('6–10 of 25');
  await page.getByRole('textbox', { name: "Search this property's documents" }).fill('Extra scan 1');
  await expect(pager).toContainText('1–5 of 11');
  await expect(rows).toHaveCount(5);
});

test('a paper’s name previews it beside the list, and still links to the Reader', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  const link = page.getByRole('link', { name: DEED, exact: true });
  // The href is still the Reader's, so a new tab / copied link opens it there.
  await expect(link).toHaveAttribute('href', '/papers/w-paper-deed');

  // A plain click opens the preview pane on the same page (RecordPapers.tsx
  // `openPreview`), so the owner does not lose the list to look at one paper.
  await link.click();
  const preview = page.getByRole('dialog', { name: DEED });
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Sy 214/2 · Preview')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}/documents$`));
});

// ── renaming ───────────────────────────────────────────────────────────

test('renaming a paper writes the new name and leaves the shelf where it is', async ({ page, world }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
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
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('textbox', { name: `Rename ${EC}` }).fill('Something else entirely');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(paperRow(page, EC)).toBeVisible();
  await expect(page.getByText('Something else entirely')).toHaveCount(0);
  expect(world.calls('updatePaper')).toHaveLength(0);
});

test('a rename with the name rubbed out is refused, and nothing is written', async ({ page, world }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('textbox', { name: `Rename ${EC}` }).fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert'))
    .toHaveText('A document needs a name.');
  expect(world.calls('updatePaper')).toHaveLength(0);
  // Still open, so the fix is a keystroke rather than a second click.
  await expect(page.getByRole('textbox', { name: `Rename ${EC}` })).toBeVisible();
});

test('a rename the server declines leaves the paper under its old name, and says so', async ({ page, world }) => {
  world.set('updatePaper', false);
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Rename ${FMB}` }).click();
  await page.getByRole('textbox', { name: `Rename ${FMB}` }).fill('FMB sketch (2013 copy)');
  await page.getByRole('button', { name: 'Save' }).click();

  // The box that held focus is gone; without restoreRowFocus (RecordPapers.tsx
  // :94-97, :588) focus falls to the document and a keyboard is back at the
  // top of the page after renaming the fourth paper down.
  await expect(page.getByRole('button', { name: `Rename ${FMB}` })).toBeFocused();
});

test('Cancel on a rename hands the keyboard back too', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Rename ${EC}` }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('button', { name: `Rename ${EC}` })).toBeFocused();
});

test('the notice one paper left behind is cleared by the next thing the owner does', async ({ page, world }) => {
  // One line serves filing, renaming and removing (RecordPapers.tsx:525-531),
  // so a refusal that outlived the thing it was about would sit over a paper
  // it never described.
  world.set('updatePaper', false);
  await page.goto(`/properties/${ID.parcel}/documents`);

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

test('removing a paper asks first, and Cancel backs out without unfiling it', async ({ page, world }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();

  // The shared confirmation, naming the paper and saying what a removal does
  // and does not do (delete_paper unfiles it and kills its share links; the
  // stored bytes stay).
  const dialog = removeDialog(page, SCAN);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "It comes off this parcel's documents and any share link to it stops working. The stored file itself is kept.");
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toHaveCount(0);
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect.poll(() => world.calls('deletePaper').length).toBe(1);
  // The record rides along so the server unfiles it from THIS property
  // (api.ts useDeletePaper, `recordId`), not from wherever else it is linked.
  expect(world.lastVars('deletePaper')).toEqual({ paperId: 'w-paper-unsorted', recordId: ID.parcel });
  await expect(paperRow(page, SCAN)).toHaveCount(0);
  await expect(paperRow(page, DEED)).toBeVisible();
});

test('a removal the server declines leaves the paper filed, and says to reload', async ({ page, world }) => {
  world.set('deletePaper', false);
  await page.goto(`/properties/${ID.parcel}/documents`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(page.getByRole('alert'))
    .toHaveText('Scan 2026-08-02 could not be removed. Reload the page.');
  await expect(paperRow(page, SCAN)).toBeVisible();
  // The confirmation holds, so a refusal can never read as a removal.
  await expect(removeDialog(page, SCAN).getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('a removal that never reaches the server says the paper is still filed here', async ({ page, world }) => {
  world.set('deletePaper', World.gqlError('paper store unavailable'));
  await page.goto(`/properties/${ID.parcel}/documents`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Scan 2026-08-02 was not removed. It is still on this property.');
  await expect(paperRow(page, SCAN)).toBeVisible();
});

test('a removal still in flight says it is removing, and will not take a second press', async ({ page, world }) => {
  world.set('deletePaper', World.slow(3_000, true));
  await page.goto(`/properties/${ID.parcel}/documents`);

  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  // The shared confirmation's busy word, on the one button that would send it
  // again.
  const dialog = removeDialog(page, SCAN);
  const removing = dialog.getByRole('button', { name: 'Working…' });
  await expect(removing).toBeVisible();
  await expect(removing, 'the confirmation holds until the server has answered').toBeDisabled();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');

  // And it closes only when the paper is actually gone.
  await expect(dialog).toHaveCount(0);
  expect(world.calls('deletePaper')).toHaveLength(1);
});

test('Cancel hands the keyboard back to the row it was asked from', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: `Remove ${SCAN}` }).click();
  await removeDialog(page, SCAN).getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('button', { name: `Remove ${SCAN}` })).toBeFocused();
});

test('a paper that is removed leaves the keyboard in the list it was removed from', async ({ page, world }) => {
  world.set('papers', (vars) => {
    if (String(vars.id) !== ID.parcel) return [];
    return world.calls('deletePaper').length
      ? PARCEL_PAPERS.filter((p) => p.id !== 'w-paper-unsorted')
      : PARCEL_PAPERS;
  });
  await page.goto(`/properties/${ID.parcel}/documents`);

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

test('the picker lives in the panel, and takes a scan, a photograph or a video', async ({ page }) => {
  // Handing the input files used to BE the filing, so the input was mounted on
  // the page at all times and there was never a moment at which the owner could
  // see what they had picked. It is inside the panel now, and so is the size
  // limit — a fact about choosing files, printed where the choosing happens.
  await page.goto(`/properties/${ID.parcel}/documents`);

  await expect(page.getByLabel('Add a document to this property')).toHaveCount(0);
  await expect(page.getByText(`Up to ${LIMIT} each`)).toHaveCount(0);
  await addTrigger(page).click();

  const panel = paperDrawer(page);
  await expect(panel).toBeVisible();
  // The panel names the record it is filing against, which the header it covers
  // was the only thing saying.
  await expect(panel.locator('.eyebrow')).toHaveText('Sy 214/2 · Documents');
  await expect(panel.locator('.scanbox')).toContainText('Drop a scan, photo or video here');
  await expect(panel.locator('.scanbox')).toContainText(`Up to ${LIMIT} for scans and photos; 50.0 MB for videos.`);

  const picker = page.getByLabel('Add a document to this property');
  await expect(picker).toHaveCount(1);
  await expect(picker).toHaveAttribute('accept', 'image/*,video/*,application/pdf');
  await expect(picker).toHaveAttribute('multiple', '');
  // Nothing picked, so there is nothing to file and nothing has gone anywhere.
  await expect(fileButton(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the panel offers the shelf as a choice, with the reader deciding by default', async ({ page }) => {
  // The shelf used to be settled entirely by the reader, and a wrong one was
  // corrected after the fact by renaming the paper from its row. It is an
  // override here — but only an override: left alone, the document decides.
  await page.goto(`/properties/${ID.parcel}/documents`);
  await addTrigger(page).click();
  const panel = paperDrawer(page);

  const decide = panel.getByRole('button', { name: 'Pattadar Intelligence' });
  await expect(decide).toHaveAttribute('aria-pressed', 'true');
  for (const shelf of ['Title deeds', 'Revenue records', 'Map', 'EC & tax receipts', 'Identity', 'Old records', 'Photos & video']) {
    await expect(panel.getByRole('button', { name: shelf, exact: true })).toBeVisible();
  }

  await panel.getByRole('button', { name: 'Title deeds', exact: true }).click();
  await expect(decide).toHaveAttribute('aria-pressed', 'false');

  // The shelf is optional: pressing the chosen one again hands it back.
  await panel.getByRole('button', { name: 'Title deeds', exact: true }).click();
  await expect(decide).toHaveAttribute('aria-pressed', 'true');
});

test('a record with nothing filed says so, and the header button is the one way to the panel', async ({ page }) => {
  await page.goto(`/properties/${ID.plot}/documents`);

  await expect(page.getByText('No documents on this parcel yet.')).toBeVisible();
  // The empty state's duplicate "Add a paper" button was removed: one flow
  // belongs on the screen once, so only the section head's button carries it.
  await expect(page.getByRole('button', { name: 'Add a document' })).toHaveCount(1);
  await expect(addTrigger(page)).toBeEnabled();
  await addTrigger(page).click();
  await expect(paperDrawer(page)).toBeVisible();
});

test('an oversize scan is refused by name, before a single byte is sent', async ({ page, world }) => {
  // Routed so that a byte that DID leave would be recorded rather than escaping
  // the seal unrecorded — `restCalls` only sees answered requests.
  acceptUploads(world, { id: 'file-uploaded', name: 'big.pdf', sizeBytes: 1, mimeType: 'application/pdf' });
  await page.goto(`/properties/${ID.parcel}/documents`);

  // Picked, not filed: the refusal arrives BEFORE the press now, which is the
  // real gain from the panel. It used to be a sentence printed after a press the
  // owner had already made.
  await pickPapers(page, fileOf('east-block-scan.pdf', 15.1));

  const panel = paperDrawer(page);
  await expect(panel.locator('.rows.boxed > div').filter({ hasText: 'east-block-scan.pdf' }))
    .toContainText(`15.1 MB · over the ${LIMIT} limit`);
  await expect(panel.getByRole('alert')).toContainText('Remove that one to file the rest.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  // The small one is picked FIRST on purpose: the sizing used to happen inside
  // the filing loop, so this file was filed and the sentence then claimed nothing
  // had been. Nothing can be sent while anything in the list is over.
  await pickPapers(page, [
    fileOf('page-1.pdf', 0.001),
    fileOf('page-2.pdf', 15.1),
    fileOf('page-3.pdf', 15.2),
  ]);

  const rows = paperDrawer(page).locator('.rows.boxed > div');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'page-2.pdf' })).toContainText('15.1 MB · over the');
  await expect(rows.filter({ hasText: 'page-3.pdf' })).toContainText('15.2 MB · over the');
  await expect(paperDrawer(page).getByRole('alert')).toContainText('Remove those to file the rest.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await pickPapers(page, [fileOf('east-block-scan.pdf', 0.5), fileOf('wrong-folder.pdf', 0.2)]);
  const panel = paperDrawer(page);
  await expect(panel.getByRole('heading', { name: 'File 2 documents' })).toBeVisible();

  await panel.getByRole('button', { name: 'Take wrong-folder.pdf out' }).click();

  await expect(panel.locator('.rows.boxed > div')).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: 'File a document' })).toBeVisible();
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, fileOf('east-block-scan.pdf', 0.5));
  const row = paperRow(page, 'east-block-scan.pdf');
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Remove east-block-scan.pdf' }).click();
  await removeDialog(page, 'east-block-scan.pdf').getByRole('button', { name: 'Remove', exact: true }).click();

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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await expect(shelfChip(page, 'Sale Deed 4412/1998')).toHaveText('Title deeds');
  await expect(paperRow(page, 'Sale Deed 4412/1998')).toContainText('Registered 04/03/1998 · Markapur SRO · Katragunta');
});

test('a scan nothing could be read from is still filed, under its own filename, in Unsorted', async ({ page, world }) => {
  acceptUploads(world, {
    id: 'file-uploaded-blur', name: 'IMG_4482.pdf', sizeBytes: 5_120, mimeType: 'application/pdf',
  });
  filesLandOnTheShelf(world);
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, fileOf('IMG_4482.pdf', 0.005));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  const vars = world.lastVars('addPaper');
  expect(vars).toMatchObject({
    fileRef: 'file-uploaded-blur', name: 'IMG_4482.pdf', shelf: '', pageCount: 0,
  });
  // An empty shelf is what the server files as Unsorted (web360.py:4632).
  expect(String(vars.subtitle)).toMatch(/^Filed \d{2}\/\d{2}\/\d{4}$/);

  await expect(shelfChip(page, 'IMG_4482.pdf')).toHaveText('Not sorted yet');
  // Success is silent (design.md): the filed row is the answer, not a toast.
  await expect(page.locator('.toast')).toHaveCount(0);
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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
    'IMG_4482.pdf could not be read. It is in Not sorted yet.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await pickPapers(page, fileOf('IMG_4482.pdf', 0.005));
  await paperDrawer(page).getByRole('button', { name: 'Old records', exact: true }).click();
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, fileOf('receipt.pdf', 0.002));

  await expect(page.getByRole('alert'))
    .toHaveText('receipt.pdf was uploaded but could not be saved. 0 of 1 were saved.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, fileOf('receipt.pdf', 0.002));

  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  await expect(page.getByRole('alert'))
    .toHaveText('receipt.pdf was uploaded but could not be saved. 0 of 1 were saved.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  // A shelf is chosen by hand so this test is only about the busy state: the
  // seeded reader fails everything, and under Pattadar Intelligence that means
  // the panel would hold on its Unsorted notice instead of closing.
  await pickPapers(page, fileOf('slow.pdf', 0.002));
  await paperDrawer(page).getByRole('button', { name: 'Title deeds', exact: true }).click();
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, [fileOf('east-block.pdf', 0.002), fileOf('west-block.pdf', 0.002)]);

  await expect.poll(() => world.calls('addPaper').length).toBe(2);
  // Success is silent (design.md): the two filed rows are the answer.
  await expect(page.locator('.toast')).toHaveCount(0);
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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, [
    fileOf('page-1.pdf', 0.002), fileOf('page-2.pdf', 0.002), fileOf('page-3.pdf', 0.002),
  ]);

  // The count is what makes this sentence worth reading: one of the three IS
  // filed, and a reader who picks all three again would file it twice.
  await expect(page.getByRole('alert'))
    .toHaveText('page-2.pdf was uploaded but could not be saved. 1 of 3 were saved.');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await expect(shelfChip(page, 'Sale Deed 4412/1998')).toHaveText('Photos & video');
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
  await page.goto(`/properties/${ID.parcel}/documents`);

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
  await page.goto(`/properties/${ID.parcel}/documents`);

  await filePapers(page, fileOf('sale-deed.pdf', 0.002));

  // The reader is seeded as a failure, so this one also lands in Unsorted and
  // the panel says so — see "a paper filed but not read says so" above. There
  // is no success toast beside it: success is silent (design.md).
  await expect.poll(() => world.calls('addPaper').length).toBe(1);
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(world.lastVars('addPaper')).toMatchObject({
    name: 'sale-deed (2).pdf', fileRef: 'file-uploaded-dup',
  });
  await expect(paperRow(page, 'sale-deed (2).pdf')).toBeVisible();
});

test.describe('the upload error path', () => {
  // A 503 IS the scenario, and Chrome writes every failed response to the
  // console itself ("Failed to load resource: … 503"). The guard would fail the
  // test for the very thing it provokes; an unhandled rejection would still
  // show as the missing alert below.
  test.use({ allowConsole: true });

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
    await page.goto(`/properties/${ID.parcel}/documents`);

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
    await page.goto(`/properties/${ID.parcel}/documents`);

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
  await page.goto(`/properties/${ID.plot}/documents`);

  await expect(page.getByText('No documents on this parcel yet.')).toBeVisible();
  await expect(page.getByText('No document here matches that.')).toHaveCount(0);
  // No shelf filter, because nothing is on a shelf.
  await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);

  // No band over nothing: a search over an empty record has nothing to find,
  // and the empty state is the one place that says nothing is filed.
  await expect(page.getByRole('textbox', { name: "Search this property's documents" })).toHaveCount(0);

  // The add control is a real button, in the tab order, precisely so that filing
  // a paper is possible from the keyboard.
  await addTrigger(page).focus();
  await expect(addTrigger(page)).toBeFocused();

  // The empty state no longer carries a duplicate button: the header's is the
  // only one, and it opens the panel with the picker in it — not on the page,
  // where handing it files used to be the whole interaction.
  await expect(page.getByRole('button', { name: 'Add a document' })).toHaveCount(1);
  await expect(page.getByLabel('Add a document to this property')).toHaveCount(0);
  await addTrigger(page).click();
  await expect(paperDrawer(page)).toBeVisible();
  await expect(page.getByLabel('Add a document to this property')).toHaveCount(1);
});

test('a flat’s papers are a property’s papers, not a parcel’s', async ({ page }) => {
  await page.goto(`/properties/${ID.flat}/documents`);

  // nounFor (ui.tsx:118) — copy on this screen addresses one specific thing,
  // and "this parcel" over a third-floor flat has stopped being about the
  // reader's property.
  // The search box only says what it is for, so the noun is read where the
  // screen addresses the property itself: the removal's own sentence.
  await expect(page.getByRole('textbox', { name: "Search this property's documents" }))
    .toHaveAttribute('placeholder', 'Search documents');
  await expect(shelfChip(page, 'Sale agreement')).toHaveText('Title deeds');
  await page.getByRole('button', { name: 'Remove Sale agreement' }).click();
  await expect(removeDialog(page, 'Sale agreement')).toContainText("It comes off this property's documents");
  await expect(removeDialog(page, 'Sale agreement')).not.toContainText('parcel');
});

test('papers that have not arrived yet draw placeholder rows, and never claim the shelf is empty', async ({ page, world }) => {
  world.set('papers', World.never());
  await page.goto(`/properties/${ID.parcel}/documents`);

  await expect(page.getByRole('status', { name: 'Loading the documents on this parcel' })).toBeVisible();
  await expect(skeletonRows(page)).toHaveCount(3);
  await expect(page.getByText('No documents on this parcel yet.')).toHaveCount(0);
  await expect(page.getByText('No document here matches that.')).toHaveCount(0);
  await expect(page.getByText('These documents did not load')).toHaveCount(0);
  // The rest of the record is not held up by it.
  await expect(page.getByRole('heading', { name: 'Sy 214/2' })).toBeVisible();
});

test('papers that did not load say so, with the reason and a way to ask again', async ({ page, world }) => {
  world.set('papers', World.gqlError('the paper store is down'));
  await page.goto(`/properties/${ID.parcel}/documents`);

  await expect(page.getByText('These documents did not load')).toBeVisible();
  await expect(page.getByText('the paper store is down')).toBeVisible();
  // A read that never came back is not an empty shelf (RecordPapers.tsx:643).
  await expect(page.getByText('No documents on this parcel yet.')).toHaveCount(0);
  await expect(page.getByText('No document here matches that.')).toHaveCount(0);

  const asked = world.calls('papers').length;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => world.calls('papers').length).toBeGreaterThan(asked);
});

test('a refetch that fails after a good load keeps the papers the owner can still read', async ({ page, world }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);
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
  await expect(page.getByText('These documents did not load')).toHaveCount(0);
  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(paperRow(page, EC)).toBeVisible();
});

test.describe('papers waiting on a connection', () => {
  /** The record's other hangers, where the record itself is already cached and
   *  `papers` is still a key nothing has asked for — the only standing start
   *  from which the list can be met by a dead line. */
  const featuresFirst = async (page: Page) => {
    await page.goto(`/properties/${ID.parcel}/site-features`);
    await expect(page.getByRole('navigation', { name: 'This property' })).toBeVisible();
  };
  const papersTab = (page: Page) =>
    page.getByRole('navigation', { name: 'This property' }).getByRole('link', { name: /^Documents/ });

  test('papers that cannot be asked for say the line is down, not that the shelf is empty', async ({ page, world }) => {
    await featuresFirst(page);
    await pretendOffline(page, true);
    await papersTab(page).click();

    // The app's one unreachable sentence (useLiveOrSample UNREACHABLE_NOTE),
    // not a private "Offline · …" line of this tab's own.
    await expect(page.getByText('The live service is not reachable')).toBeVisible();
    // A paused query is one that never reached the wire — which is the whole
    // difference between this line and "These papers did not load".
    expect(world.calls('papers'), 'nothing may be asked for while the line is down').toHaveLength(0);
    await expect(page.getByText('No documents on this parcel yet.')).toHaveCount(0);
    await expect(page.getByText('No document here matches that.')).toHaveCount(0);
    await expect(page.getByText('These documents did not load')).toHaveCount(0);
    await expect(skeletonRows(page)).toHaveCount(0);
    // The record around them is cached and still readable.
    await expect(page.getByRole('heading', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('the papers arrive on their own the moment the line is back', async ({ page, world }) => {
    await featuresFirst(page);
    await pretendOffline(page, true);
    await papersTab(page).click();
    await expect(page.getByText('The live service is not reachable')).toBeVisible();

    await pretendOffline(page, false);

    // No reload, no Try again: the read the screen never got to make is made
    // for it. Anything less and a phone that walked back into signal keeps
    // saying it is offline.
    await expect(paperRow(page, DEED)).toBeVisible();
    // The app's one unreachable sentence (useLiveOrSample UNREACHABLE_NOTE)
    // goes with the line coming back.
    await expect(page.getByText('The live service is not reachable')).toHaveCount(0);
    expect(world.calls('papers')).toHaveLength(1);
  });
});

test('a record that is not in the portfolio never gets as far as its papers', async ({ page, world }) => {
  await page.goto(`/properties/${ID.missing}`);

  await expect(page.getByRole('heading', { name: "This property is not in your account" })).toBeVisible();
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
  await page.goto(`/properties/${ID.parcel}?share=1`);

  // Open and already focused — the "…" in the list's label is honoured rather
  // than dropping the reader here to hunt for the button.
  await expect(page.getByLabel('Who is it for')).toBeFocused();
  // And consumed at once (RecordPapers.tsx:69-76): left in the URL it would
  // reopen on every reload and ride along into anything copied from the bar.
  await expect(page).toHaveURL(`/properties/${ID.parcel}`);
});

// The share panel shares the documents chosen for a purpose, not the whole
// record (RecordHead.tsx share form, "Choose documents for this purpose"), and
// the Share button stays shut until both a document and a recipient are given.
async function pickForShare(page: Page, title = DEED) {
  await page.getByRole('group', { name: 'Choose documents for this purpose' })
    .getByRole('checkbox', { name: new RegExp(`^${title}`) }).check();
}

test('sharing from the property makes a link to the documents chosen, for the person named', async ({ page, world }) => {
  world.set('createShareLink', '/share/9Fk3p');
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: 'Share securely' }).click();

  const share = page.getByRole('button', { name: 'Share', exact: true });
  await expect(share, 'a link with nothing chosen and nobody named is a link to nothing').toBeDisabled();
  await expect(page.getByText('Choose at least one document and say who it is for.')).toBeVisible();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await expect(share, 'a link with no document chosen shares nothing').toBeDisabled();
  await expect(page.getByText('Choose at least one document.')).toBeVisible();
  await pickForShare(page);
  await expect(share).toBeEnabled();
  await share.click();

  await expect(page.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/9Fk3p');
  // Exactly the chosen paper: a stray paper list here would hand a bank more
  // or less than the owner believed they sent.
  expect(world.lastVars('createShareLink')).toEqual({
    recordId: ID.parcel, audience: 'Union Bank, Markapur', terms: 'view', days: 30,
    documentIds: ['w-paper-deed'],
  });
  // The panel turns into the link itself, and says so as a status.
  await expect(page.getByRole('status').filter({ hasText: 'Link ready.' })).toBeVisible();
});

test('a link the server would not make says so, and keeps the name that was typed', async ({ page, world }) => {
  // An empty id on an otherwise perfect 200 — the server declining to share.
  world.set('createShareLink', '');
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await pickForShare(page);
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'No link was made for Union Bank, Markapur. This property may no longer be yours to share.');
  // Nothing that could be mistaken for a link, and the typed name is still
  // there so a second try is one press.
  await expect(page.getByLabel('Recipient link')).toHaveCount(0);
  await expect(page.getByLabel('Who is it for')).toHaveValue('Union Bank, Markapur');
});

test('a share that never reaches the server says nothing has been shared', async ({ page, world }) => {
  world.set('createShareLink', World.gqlError('share links are switched off on this build'));
  await page.goto(`/properties/${ID.parcel}/documents`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await pickForShare(page);
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
  await page.goto(`/properties/${ID.parcel}/documents`);
  const trigger = page.getByRole('button', { name: 'Share securely' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByLabel('Who is it for')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  expect(world.calls('createShareLink')).toHaveLength(0);
});

// The rail's Photos card was removed on purpose: "The map and the photographs
// left … they are what the Location and Media hangers are FOR, and a thumbnail
// of each in this rail was the same ground and the same gallery said twice"
// (RecordPapers.tsx, beside `openPreview`; design.md § Property tabs, "Tell a
// fact once"). The gallery's counts, empty state and size refusals are covered
// on the Media tab by 10-record-photos.

test('@phone the papers, their shelves and the button that adds one all survive a 390px screen', async ({ page }) => {
  await page.goto(`/properties/${ID.parcel}/documents`);

  await expect(paperRow(page, DEED)).toBeVisible();
  await expect(shelfChip(page, DEED)).toHaveText('Title deeds');
  // The shelves are behind the shared "+ Filter" at this width too.
  await expect(page.getByRole('button', { name: '+ Filter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a document' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${DEED}` })).toBeVisible();

  // One band row: "+ Filter", the tally and the search as an icon that opens
  // a full-width field (design.md § Phone, BandSearch).
  const band = page.locator('.filterbar');
  await expect(band.getByRole('textbox')).toHaveCount(0);
  const open = band.getByRole('button', { name: "Search this property's documents" });
  await expect(open).toBeVisible();
  const [filterBox, openBox] = await Promise.all([
    page.getByRole('button', { name: '+ Filter' }).boundingBox(), open.boundingBox()]);
  expect(Math.abs(filterBox!.y + filterBox!.height / 2 - (openBox!.y + openBox!.height / 2)),
    'the search icon shares the filter\'s row').toBeLessThanOrEqual(4);
  await open.click();
  await page.getByRole('textbox', { name: "Search this property's documents" }).fill('encumbrance');
  await expect(paperRow(page, DEED)).toHaveCount(0);

  // Nothing may push the page sideways: a horizontal scrollbar on a phone is
  // how a row's controls end up off the edge of the glass.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the papers hanger must not scroll sideways').toBeLessThanOrEqual(1);
});
