/**
 * The Reader — /app/papers/:id, the screen an owner opens a deed on.
 *
 * Two halves that must never blur together, and this file asserts the seam
 * between them: the SCAN on the left is evidence and is never invented, and
 * the READING on the right is a machine's summary of it, labelled as such.
 * apps/web/src/w360/pages/Reader.tsx says the drawn cream page is gone — so
 * each of the five things that can happen to the bytes (none, legacy ref,
 * loading, ready, refused) has its own test here, and the point of every one
 * of them is that the owner can tell which one they are looking at.
 *
 * What a reader of this file must know:
 *
 *  · THE SEEDED PAPERS HAVE LEGACY FILE REFS. `fixtures/seed.ts` files every
 *    paper under `file-deed`, `file-ec`, … and `isStorageRef` (storage.ts:13)
 *    only accepts a UUID. So the DEFAULT world lands the Reader in its
 *    'legacy' state — no preview, no Download, no zoom, no print. That is a
 *    real state of the real product and is asserted as itself; every test that
 *    needs bytes on screen files the paper under `REF`, a storage id shaped
 *    the way the gateway issues them, and serves the bytes with world.route.
 *
 *  · `paper()` builds a whole document row. Q_DOCUMENT (api.ts:378) selects 21
 *    fields and the world answers with exactly what it is given, so a partial
 *    object reaches the screen as `undefined` and crashes the render rather
 *    than failing an assertion. Start from the factory, override one thing.
 *
 *  · THIRTEEN test.fail()s, each naming its cause. Every one of them was run
 *    with the marker off first, to be sure it fails on the sentence it is
 *    about and not on a locator:
 *      Reader.tsx:625  a link that lapsed in August "expires tomorrow"
 *      Reader.tsx:624  a link nobody has opened still prints "Last ·"
 *      Reader.tsx:621  a link opened once "has opened this 1 times"
 *      Reader.tsx:249  a REFUSED deletePaper walks the owner away as if it
 *                      worked — `delete_paper` returns False, never raises
 *      Reader.tsx:288  a REFUSED updatePaper closes the dialog as if it saved
 *      Reader.tsx:42   seven shelves listed where the vault has eight, so a
 *                      scan can leave the Photos shelf and never go back
 *      Reader.tsx:309  a one-page sketch says "1 pages"
 *      Reader.tsx:538  facts read off a paper are hidden unless it also has a
 *                      registration date or a buyer
 *      Reader.tsx:550  a reading that found only a doubt is drawn not at all,
 *                      because the whole card hangs off the summary
 *      Reader.tsx:572  "Go to it" jumps past the last page — "20 / 14" — where
 *                      both paging arrows clamp
 *      Reader.tsx:84   bytes the store will not name land in Downloads as
 *                      ".octetstream", which is a file nothing opens
 *      api.ts:379      `subtitle` is selected on every read and drawn nowhere
 *      Reader.tsx:394  three fixed columns run 236px off the side of a phone
 *    The lapsed-link one is the same defect tests/e2e-web360/specs/gap-vault
 *    .spec.ts:291 holds against the live stack; it is here as well because
 *    this suite can put a lapsed link and a live one on the screen in the same
 *    minute and that one cannot.
 *
 *  · THE ERROR TESTS ASSERT THEIR OWN NOISE. `allowConsole` opens the console
 *    guard for a whole test, which would also swallow a render crash on the
 *    way past — so every test that sets it ends by naming the errors it
 *    expected and failing on any other (`onlyRefusals`).
 *
 *  · Printing is asserted two ways: the `@media print` block in Reader.tsx:60
 *    is exercised through `page.emulateMedia({ media: 'print' })`, and the
 *    toolbar button through a `window.print` stub. A PDF is printed by its own
 *    frame, so the assertion there is that the page around it is NOT printed.
 */
import { test, expect, World } from '../fixtures/harness';
import { ID, PAPER } from '../fixtures/ids';

/** Where a paper filed under Sy 214/2 goes back to. There is no
 *  `/app/records/:id/papers` child route — the papers ARE the index. */
const RECORD_HOME = `/app/records/${ID.parcel}`;

/** A storage node id, shaped the way the gateway issues them. Anything that is
 *  not this shape is a legacy ref and never reaches the file store. */
const REF = '3f1c8a52-9b74-4d21-8e60-5a7c9f2b41d0';

/** 1x1 white JPEG and the smallest thing Chrome's PDF viewer accepts — the
 *  same two the seal serves, kept locally so a test can choose which. */
const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const TINY_PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pg==',
  'base64',
);

type Row = Record<string, unknown>;

/** The seeded sale deed, whole. Every field Q_DOCUMENT selects, so an override
 *  can drop one fact without leaving the other twenty undefined. */
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
  readerFlag: 'The extent on page 3 is written in guntas and in acres, and the two do not agree.',
  readerFlagPage: 3,
  tags: ['original'],
  shared: true,
  versions: [
    { id: 'w-ver-1', version: 1, label: 'As filed', madeOn: '02/07/2026', madeBy: 'Shankar Reddy', note: 'Scanned at the SRO' },
  ],
  link: {
    id: 'w-link-buyer', audience: 'Prospective buyer', subject: 'Sy 214/2',
    terms: 'View only · no download', docCount: 1, openedCount: 3,
    lastOpenedAt: '10/09/2026', expiresOn: '01/10/2026', daysLeft: 18, initials: 'PB',
  },
};

const paper = (over: Row = {}): Row => ({ ...DEED, ...over });

/** A paper with nothing read off it and nothing shared — the ordinary case. */
const PLAIN: Row = paper({
  id: PAPER.ec, title: 'Encumbrance certificate', subtitle: '1985 to 2026 · clear',
  shelf: 'search', pageCount: 6, fileRef: 'file-ec',
  registeredOn: '', office: '', buyer: '', seller: '', consideration: 0,
  readerSummary: '', readerFlag: '', readerFlagPage: 0,
  tags: [], shared: false, link: null,
});

/** Serve the stored bytes for any file id, in the media type asked for. */
function serveBytes(world: World, kind: 'pdf' | 'image', delayMs?: number) {
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => (kind === 'pdf'
    ? { contentType: 'application/pdf', body: TINY_PDF, delayMs }
    : { contentType: 'image/jpeg', body: PIXEL, delayMs }));
}

/**
 * The one console error a deliberately refused request is allowed to leave.
 *
 * `test.use({ allowConsole: true })` turns the harness's console guard off for
 * the whole test, and a render crash during a failure path is exactly the
 * thing that would then slip past unseen. So each of those tests ends here:
 * Chrome's own note about the request it refused is expected, and anything
 * else — a React error, a thrown handler, a warning raised to error — fails
 * the test with its text.
 */
function onlyRefusals(errors: string[]): void {
  expect(
    errors.filter((e) => !/Failed to load resource/.test(e)),
    'the screen logged something other than the refusal this test provoked',
  ).toEqual([]);
}

// ── what the screen says this paper is ─────────────────────────────────

test('the Reader names the paper, the record it is filed under, its shelf, its page count and its size', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);

  const bar = page.locator('header.rd-bar');
  await expect(bar.getByText('Sale deed 4412 of 1998')).toBeVisible();
  await expect(bar.getByText('Sy 214/2 · Title · 14 pages · 2.4 MB')).toBeVisible();
  // And again as the heading over the reading, which is the half of the screen
  // an owner reads rather than scans.
  await expect(page.getByRole('heading', { name: 'Sale deed 4412 of 1998', level: 2 })).toBeVisible();

  expect(world.lastVars('document')).toMatchObject({ id: PAPER.deed });
});

test('the shelf and the paper’s own tags are named beside the reading', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  const side = page.locator('aside.rd-side');
  await expect(side.getByText('● Title')).toBeVisible();
  await expect(side.getByText('original')).toBeVisible();
});

test('a paper carrying a boundary dispute wears it as an alert, not as one tag among others', async ({ page, world }) => {
  world.set('document', paper({ tags: ['original', 'boundary dispute'] }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  // The tone is the whole message here and it is carried by a class — there is
  // no role or accessible name that separates an alert tag from a plain one.
  await expect(page.locator('aside.rd-side .tag.alert')).toHaveText('boundary dispute');
  await expect(page.locator('aside.rd-side .tag').first()).toHaveText('original');
});

test('a one-page sketch does not tell the owner it has 1 pages', async ({ page, world }) => {
  // The header used to write `${pages} pages` straight into the line. It goes
  // through plural() now, like the rest of the module.
  world.set('document', paper({
    id: PAPER.map, title: 'FMB sketch', shelf: 'map', pageCount: 1,
    readerSummary: '', readerFlag: '', readerFlagPage: 0, tags: [], shared: false, link: null,
  }));
  await page.goto(`/app/papers/${PAPER.map}`);
  await expect(page.locator('header.rd-bar').getByText('Sy 214/2 · Map · 1 page · 2.4 MB')).toBeVisible();
});

test('a paper whose filing counted no pages says nothing about pages at all', async ({ page, world }) => {
  // REVERSED, deliberately. This used to assert `Math.max(1, pageCount)` — a
  // floor of one page — as desired behaviour. But paperFiling.ts:34 writes
  // `pageCount: mimeType.startsWith('image/') ? 1 : 0`, so EVERY PDF in the
  // vault arrives at 0 and the floor is not a rare fallback, it is the only
  // path. A 12-page sale deed was drawing one thumbnail, one "1 / 1" pager and
  // a header reading "1 pages". Inventing a page on a reading surface is the
  // one thing this screen's own header comment says it refuses to do.
  world.set('document', paper({ pageCount: 0 }));
  serveBytes(world, 'pdf');
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('1 / 1')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);
  await expect(page.locator('header.rd-bar .note')).not.toContainText('page');
});

test('a paper whose size nobody recorded says the rest of its line with no dot hanging off the end', async ({ page, world }) => {
  world.set('document', paper({ sizeLabel: '' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  // The line is filter(Boolean).join(' · '), so a fact the filing does not
  // hold has to leave no separator behind it either.
  await expect(page.locator('header.rd-bar .note')).toHaveText('Sy 214/2 · Title · 14 pages');
});

test('a paper on a shelf this build has never heard of is still named, not left blank', async ({ page, world }) => {
  // The vault owns the shelf vocabulary and this screen keeps its own copy of
  // it (Reader.tsx:42), so a shelf added server-side arrives here unknown. The
  // chip falls back to the raw key and the select appends it rather than
  // opening blank — the two places where a blank would lose the paper. (The
  // header line, Reader.tsx:309, has no such fallback and drops it silently;
  // that is a smaller thing than a Save that refiles the paper, so it is noted
  // here rather than held as its own failure.)
  world.set('document', paper({ shelf: 'mortgage', shared: false, link: null }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.locator('aside.rd-side').getByText('● mortgage')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
  const shelf = page.getByLabel('Shelf');
  await expect(shelf).toHaveValue('mortgage');
  await expect(shelf.getByRole('option')).toHaveCount(8);
});

test('the detail read off the paper is on the screen, not only in the query', async ({ page, world }) => {
  // Q_DOCUMENT (apps/web/src/w360/api.ts:379) selects `subtitle` and the
  // Reader used to draw it nowhere. For an EC that subtitle — "1985 to 2026 ·
  // clear" — is the single most useful fact the vault holds about the paper.
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);
  await expect(page.getByText('1985 to 2026 · clear')).toBeVisible();
});

// ── the way back ───────────────────────────────────────────────────────

test('Back goes to the record the paper is filed under, which is the record’s own papers', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  const back = page.getByRole('link', { name: 'Back' });
  await expect(back).toHaveAttribute('href', RECORD_HOME);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${RECORD_HOME}$`));
});

test('an unfiled paper has no record to go back to, so Back goes to the vault', async ({ page, world }) => {
  world.set('document', paper({ recordId: '', recordTitle: '' }));
  await page.goto(`/app/papers/${PAPER.unsorted}`);
  await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/app/papers');
  await expect(page.locator('header.rd-bar').getByText('Title · 14 pages · 2.4 MB')).toBeVisible();
});

test('an unfiled paper says sharing needs a record instead of offering a button that cannot work', async ({ page, world }) => {
  world.set('document', paper({ recordId: '', recordTitle: '' }));
  await page.goto(`/app/papers/${PAPER.unsorted}`);
  await expect(page.getByRole('button', { name: 'Share securely' })).toHaveCount(0);
  await expect(page.getByText("Sharing works on a record's papers. File this paper under a record to share it.")).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await expect(page.getByRole('menuitem', { name: 'Rename or move to another shelf' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open the record it is filed under' })).toHaveCount(0);
});

test('the kebab opens the record this paper is filed under', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Open the record it is filed under' }).click();
  await expect(page).toHaveURL(new RegExp(`${RECORD_HOME}$`));
});

// ── the register, and the honest silence where there is none ───────────

test('a registered deed states the office, the date, both parties and what was paid', async ({ page, world }) => {
  // Dates are printed exactly as the reading produced them — DD/MM/YYYY is
  // what `registered_on` holds (services/api/src/web360.py:3375 is free text
  // off the extraction), so the world answers in that shape.
  world.set('document', DEED);
  await page.goto(`/app/papers/${PAPER.deed}`);
  const kv = page.locator('aside.rd-side .kv');
  await expect(kv.getByText('Registered')).toBeVisible();
  await expect(kv.getByText('04/03/1998')).toBeVisible();
  await expect(kv.getByText('Markapur SRO')).toBeVisible();
  await expect(kv.getByText('Telukutla Shankar Reddy')).toBeVisible();
  await expect(kv.getByText('Chenna Reddy')).toBeVisible();
  // The full figure, not a magnitude: this is a number somebody reconciles.
  await expect(kv.getByText('₹18,50,000')).toBeVisible();
});

test('a paper with nothing read off it draws no register at all rather than a row of dashes', async ({ page, world }) => {
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);
  await expect(page.getByRole('heading', { name: 'Encumbrance certificate', level: 2 })).toBeVisible();
  await expect(page.locator('aside.rd-side .kv')).toHaveCount(0);
  await expect(page.getByText('Registered')).toHaveCount(0);
  await expect(page.getByText('Consideration')).toHaveCount(0);
});

test('a deed read only as far as its date keeps the rows it has and drops the ones it does not', async ({ page, world }) => {
  world.set('document', paper({ buyer: '', seller: '', consideration: 0 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  const kv = page.locator('aside.rd-side .kv');
  await expect(kv.getByText('Registered')).toBeVisible();
  await expect(kv.getByText('Office')).toBeVisible();
  await expect(kv.getByText('Buyer')).toHaveCount(0);
  await expect(kv.getByText('Seller')).toHaveCount(0);
  await expect(kv.getByText('Consideration')).toHaveCount(0);
});

test('a paper that names a seller and a price still shows them when nobody read a date off it', async ({ page, world }) => {
  // The register used to be gated on `(data.registeredOn || data.buyer)`, so a
  // release deed read as seller + consideration + office — every field below
  // the gate — rendered NOTHING. The gate is "any row has a value" now.
  world.set('document', paper({ registeredOn: '', buyer: '' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.locator('aside.rd-side .kv').getByText('Chenna Reddy')).toBeVisible();
  await expect(page.locator('aside.rd-side .kv').getByText('₹18,50,000')).toBeVisible();
});

// ── the reading, and the page it is unsure about ───────────────────────

test('the reading is labelled a reading, and says what it found', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  const card = page.locator('section.card').filter({ hasText: 'What the reader found' });
  await expect(card.getByText('TEXT_')).toBeVisible();
  await expect(card.getByText('A sale of 4 acres 12 guntas in Sy 214/2, Katragunta, for ₹18,50,000.')).toBeVisible();
});

test('the reading says out loud where it was unsure, and Go to it turns to that page', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('The extent on page 3 is written in guntas and in acres, and the two do not agree.')).toBeVisible();
  await expect(page.getByText('1 / 14')).toBeVisible();

  await page.getByRole('button', { name: 'Go to it' }).click();

  await expect(page.getByText('3 / 14')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: '3', exact: true }))
    .toHaveAttribute('aria-current', 'true');
});

test('the flagged page is marked in the rail, however far down the rail it is', async ({ page, world }) => {
  world.set('document', paper({ pageCount: 14, readerFlagPage: 11 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  const rail = page.getByRole('navigation', { name: 'Pages' });
  // The dot is decoration with no accessible name — the marker itself is the
  // only thing on the page that says "the reader stopped here".
  await expect(rail.getByRole('button', { name: '11', exact: true }).locator('span.src')).toHaveCount(1);
  await expect(rail.locator('span.src')).toHaveCount(1);
});

test('a reading that found nothing to summarise still says out loud where it was unsure', async ({ page, world }) => {
  // DEFECT: Reader.tsx:550 hangs the whole reading card off `readerSummary`,
  // and the doubt, its page and "Go to it" all live inside that gate. A read
  // that produced only a doubt — "the extent does not agree with itself", the
  // half of a reading an owner has to act on — therefore renders NOTHING, and
  // the screen looks exactly like a paper nothing has read. The card belongs
  // on screen whenever there is either half of a reading to put in it.
  test.fail();
  world.set('document', paper({ readerSummary: '' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('The extent on page 3 is written in guntas and in acres, and the two do not agree.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to it' })).toBeVisible();
});

test('Go to it must not send the owner to page 20 of a fourteen-page deed', async ({ page, world }) => {
  // DEFECT: Reader.tsx:572 sets the page straight from `readerFlagPage` with
  // no clamp, where both paging arrows clamp (Reader.tsx:511 and :516). The
  // count comes off the FILING and the flag comes off the READING — this
  // screen says so itself at Reader.tsx:504 — so the two disagreeing is an
  // ordinary thing, not a corrupt row: the readout then states "20 / 14", no
  // thumbnail in the rail is current, and a PDF is handed #page=20. The owner
  // is owed a page the deed actually has.
  test.fail();
  world.set('document', paper({ readerFlagPage: 20 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Go to it' }).click();
  // Whichever way it is fixed — clamped to the last page, or refusing to move
  // at all — the readout must never name a page beyond the count beside it.
  // The readout is a bare <span> between the two arrows with no role and no
  // name of its own, so the class it is drawn with is the only handle on it.
  await expect(page.locator('.rd-paging .mono')).toHaveText(/^([1-9]|1[0-4]) \/ 14$/);
});

test('the rail follows the reading to the page it flagged, so the mark is somewhere the owner can see', async ({ page, world }) => {
  // Fourteen thumbnails at 4.5rem are taller than the column holds, so the
  // rail scrolls; a flag on page 14 with the rail left at the top is a mark
  // nobody ever sees. `scrollTop` is the only thing this leaves behind, and it
  // is enough (Reader.tsx:174).
  world.set('document', paper({ readerFlagPage: 14 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  const rail = page.getByRole('navigation', { name: 'Pages' });
  await expect(rail.getByRole('button')).toHaveCount(14);
  expect(await rail.evaluate((el) => el.scrollTop)).toBe(0);

  await page.getByRole('button', { name: 'Go to it' }).click();

  await expect(rail.getByRole('button', { name: '14', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => rail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('a reading with no page behind its doubt sends the owner to page one rather than nowhere', async ({ page, world }) => {
  world.set('document', paper({ readerFlagPage: 0 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 14')).toBeVisible();
  await page.getByRole('button', { name: 'Go to it' }).click();
  await expect(page.getByText('1 / 14')).toBeVisible();
});

test('a reading that found no doubt offers nothing to go to', async ({ page, world }) => {
  world.set('document', paper({ readerFlag: '', readerFlagPage: 0 }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('What the reader found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to it' })).toHaveCount(0);
});

test('a paper nothing has read shows no reading card, rather than an empty one', async ({ page, world }) => {
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);
  await expect(page.getByText('What the reader found')).toHaveCount(0);
});

// ── the page rail ──────────────────────────────────────────────────────

test('every page of a fourteen-page deed is in the rail, not the first six', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  const rail = page.getByRole('navigation', { name: 'Pages' });
  await expect(rail.getByRole('button')).toHaveCount(14);
  await expect(rail.getByText('+6')).toHaveCount(0);
  await rail.getByRole('button', { name: '12', exact: true }).click();
  await expect(page.getByText('12 / 14')).toBeVisible();
  await expect(rail.getByRole('button', { name: '12', exact: true })).toHaveAttribute('aria-current', 'true');
  // And only page 12 is. `aria-current={page === n + 1}` writes "false" onto
  // the other thirteen, so an attribute selector is the only way to ask how
  // many of them claim to be the page you are on.
  await expect(rail.locator('button[aria-current="true"]')).toHaveCount(1);
});

test('the paging arrows stop at the first page and at the last one', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  // They used to clamp silently: both arrows stayed enabled on the first and
  // last page, so a keyboard stopped on a control that did nothing and a
  // screen reader was told it was available. The clamp is still there; the
  // button now also reports that it has nowhere to go.
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await expect(page.getByText('1 / 14')).toBeVisible();

  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: '14', exact: true }).click();
  await expect(page.getByText('14 / 14')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeEnabled();
});

// ── the bytes: five outcomes, five different sentences ─────────────────

test('a paper filed under an old reference says so, and does not offer to try again', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText("This paper's file is filed under an old reference")).toBeVisible();
  await expect(page.getByText('Upload the scan again to restore it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  // No request is made at all: the ref can never resolve, so asking is a lie.
  expect(world.restCalls(/storage\/files/)).toEqual([]);
});

test('a paper with no file at all says the page count came from the filing, not from a scan', async ({ page, world }) => {
  world.set('document', paper({ fileRef: '' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('No file is attached to this paper')).toBeVisible();
  await expect(page.getByText('The page count below comes from the filing, not from anything on this screen.')).toBeVisible();
  expect(world.restCalls(/storage\/files/)).toEqual([]);
});

test('the scan on screen is the stored bytes, fetched in a format a browser can show', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const scan = page.getByRole('img', { name: 'Sale deed 4412 of 1998, page 1 of 14' });
  await expect(scan).toBeVisible();
  await expect(scan).toHaveAttribute('src', /^blob:/);
  // format=web is not optional — an iPhone's HEIC is undecodable everywhere
  // and the gateway transcodes it server-side.
  expect(world.restCalls(/storage\/files/).map((c) => c.url))
    .toEqual([expect.stringContaining(`/storage/files/${REF}/content?format=web`)]);
});

test('a PDF is handed to the browser’s own viewer, and the rail moves the document', async ({ page, world }) => {
  serveBytes(world, 'pdf');
  world.set('document', paper({ fileRef: REF }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const frame = page.locator('iframe[title="Sale deed 4412 of 1998"]');
  await expect(frame).toHaveAttribute('src', /^blob:.*#page=1$/);
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: '7', exact: true }).click();
  await expect(frame).toHaveAttribute('src', /^blob:.*#page=7$/);
});

test('while the bytes are in flight the reader says it is fetching the scan', async ({ page, world }) => {
  serveBytes(world, 'image', 2_000);
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('Loading the scan…')).toBeVisible();
  // The reading beside it is already there — the paper loaded, the bytes did not.
  await expect(page.getByText('What the reader found')).toBeVisible();
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();
  await expect(page.getByText('Loading the scan…')).toHaveCount(0);
});

test('while the bytes are in flight there is nothing to zoom, but the original can still be saved', async ({ page, world }) => {
  serveBytes(world, 'image', 2_500);
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('Loading the scan…')).toBeVisible();
  // Zoom, rotate and print act on a scan that is not on screen yet, so they
  // are not drawn at all rather than drawn dead (Reader.tsx:326).
  await expect(page.getByRole('group', { name: 'Zoom' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
  // Download is a different fetch — the stored original — so an owner in a
  // hurry can save the deed while the screen is still fetching a copy to show.
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();

  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Zoom' })).toBeVisible();
});

test.describe('bytes that do not arrive', () => {
  // Chrome logs "Failed to load resource" for every refused request, and a
  // refused request is the whole point of these four. Each one ends by naming
  // the errors it expected, so `allowConsole` cannot also swallow a crash.
  test.use({ allowConsole: true });

  test('bytes the file store refuses are named as a refusal, and can be asked for again', async ({ page, world, consoleErrors }) => {
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({ status: 500, body: 'no' }));
    world.set('document', paper({ fileRef: REF }));
    await page.goto(`/app/papers/${PAPER.deed}`);

    await expect(page.getByText("This paper's scan did not load")).toBeVisible();
    // The reason, verbatim, for whoever is being asked "what does it say?".
    await expect(page.getByText('The file store answered 500.')).toBeVisible();
    // And the paper itself is untouched: the reading is still on screen.
    await expect(page.getByText('What the reader found')).toBeVisible();

    expect(world.restCalls(/storage\/files/)).toHaveLength(1);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => world.restCalls(/storage\/files/).length).toBe(2);
    onlyRefusals(consoleErrors);
  });

  test('a refused scan is never dressed as paper — nothing is drawn where the deed should be', async ({ page, world, consoleErrors }) => {
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({ status: 403, body: 'no' }));
    world.set('document', paper({ fileRef: REF }));
    await page.goto(`/app/papers/${PAPER.deed}`);

    // A refusal is a settled answer, so it does not borrow the shared "did not
    // load / nothing has been lost / try again" box, whose every clause is
    // false here. Asking again returns the same 403.
    await expect(page.getByText('This scan cannot be opened from this account')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    // The cream parchment page with the PATTADAR watermark is gone: an owner
    // cannot tell invented paper from their registered deed.
    await expect(page.locator('section.rd-sheet img')).toHaveCount(0);
    await expect(page.locator('section.rd-sheet iframe')).toHaveCount(0);
    onlyRefusals(consoleErrors);
  });

  test('a scan the store refused still offers the stored original, because those are two different fetches', async ({ page, world, consoleErrors }) => {
    // The preview asks for a transcoded copy (?format=web) and Download asks
    // for the bytes as filed. A gateway that cannot transcode a 40 MB TIFF
    // still hands over the TIFF, so hiding Download here would take away the
    // one thing that still works. Zoom and Print, which act on the missing
    // preview, are correctly gone.
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({ status: 500, body: 'no' }));
    world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
    await page.goto(`/app/papers/${PAPER.deed}`);

    await expect(page.getByText("This paper's scan did not load")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Zoom' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
    onlyRefusals(consoleErrors);
  });

  test('a read that never got out of the browser says it did not load, and can be tried again', async ({ page, world, consoleErrors }) => {
    world.set('document', World.httpError(503));
    await page.goto(`/app/papers/${PAPER.deed}`);

    await expect(page.getByText('This paper did not load')).toBeVisible();
    await expect(page.getByText('GraphQL HTTP 503')).toBeVisible();
    // react-query retries once, so two calls have already gone out.
    const before = world.calls('document').length;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => world.calls('document').length).toBeGreaterThan(before);
    onlyRefusals(consoleErrors);
  });
});

// ── the toolbar ────────────────────────────────────────────────────────

test('zoom moves the scan, and the readout says by how much', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const zoom = page.getByRole('group', { name: 'Zoom' });
  const readout = zoom.getByRole('status');
  await expect(readout).toHaveText('124%');

  const scan = page.getByRole('img', { name: /page 1 of 14/ });
  const wide = (await scan.boundingBox())!.width;

  for (let i = 0; i < 4; i += 1) await zoom.getByRole('button', { name: 'Zoom out' }).click();
  await expect(readout).toHaveText('76%');
  await expect.poll(async () => (await scan.boundingBox())!.width).toBeLessThan(wide);

  await zoom.getByRole('button', { name: 'Zoom in' }).click();
  await expect(readout).toHaveText('88%');
});

test('zoom stops at 50% and at 400% instead of running off either end', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const zoom = page.getByRole('group', { name: 'Zoom' });
  const readout = zoom.getByRole('status');
  for (let i = 0; i < 12; i += 1) await zoom.getByRole('button', { name: 'Zoom out' }).click();
  await expect(readout).toHaveText('50%');
  for (let i = 0; i < 30; i += 1) await zoom.getByRole('button', { name: 'Zoom in' }).click();
  await expect(readout).toHaveText('400%');
});

test('the zoom readout is a value, not a tab stop that leads nowhere', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const zoom = page.getByRole('group', { name: 'Zoom' });
  await expect(zoom.getByRole('button')).toHaveCount(2);
  // − and + have to speak the new percentage, which an inert <button> could not.
  await expect(zoom.getByRole('status')).toHaveAttribute('aria-live', 'polite');
});

test('rotate turns an image a quarter at a time and comes back round', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const scan = page.getByRole('img', { name: /page 1 of 14/ });
  const rotate = page.getByRole('button', { name: 'Rotate' });
  await expect(scan).not.toHaveAttribute('style', /rotate/);

  await rotate.click();
  await expect(scan).toHaveAttribute('style', /rotate\(90deg\)/);
  await rotate.click();
  await expect(scan).toHaveAttribute('style', /rotate\(180deg\)/);
  await rotate.click();
  await rotate.click();
  await expect(scan).not.toHaveAttribute('style', /rotate/);
});

test('a quarter turn lays the scan against the other side of the pane instead of out of it', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const scan = page.getByRole('img', { name: /page 1 of 14/ });
  await expect(scan).toHaveAttribute('style', /max-width: min\(124%/);
  await page.getByRole('button', { name: 'Rotate' }).click();

  // A quarter turn swaps the box the page has to fit, so the constraints are
  // written against the container's other axis (Reader.tsx:450). Style
  // matching is the only way to see which of the two rules is in force.
  await expect(scan).toHaveAttribute('style', /width: 100cqh/);
  await expect(scan).toHaveAttribute('style', /max-width: none/);
  const spill = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(spill, 'a turned scan pushed the Reader off the side of the window').toBeLessThanOrEqual(1);
});

test('a scan turned on screen is printed the way it was filed, not sideways and clipped', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const scan = page.getByRole('img', { name: /page 1 of 14/ });
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(scan).toHaveAttribute('style', /rotate\(90deg\)/);

  // Rotation is a reading aid for the screen; PRINT_CSS (Reader.tsx:66) drops
  // it for the printer, because a rotated transform prints clipped rather
  // than sideways. The !important is what lets a stylesheet beat the inline
  // style the toolbar wrote.
  await page.emulateMedia({ media: 'print' });
  await expect(scan).toHaveCSS('transform', 'none');
});

test('zoom is not a dead control on a PDF — it widens and narrows the viewer', async ({ page, world }) => {
  serveBytes(world, 'pdf');
  world.set('document', paper({ fileRef: REF }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const frame = page.locator('iframe[title="Sale deed 4412 of 1998"]');
  const zoom = page.getByRole('group', { name: 'Zoom' });
  const wide = (await frame.boundingBox())!.width;

  // The frame is capped at 44rem, so the first few steps down change nothing
  // visible: the readout has to go well under the cap before the viewer moves.
  for (let i = 0; i < 6; i += 1) await zoom.getByRole('button', { name: 'Zoom out' }).click();
  await expect(zoom.getByRole('status')).toHaveText('52%');
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThan(wide);
});

test('a PDF whose viewer is not there yet says so rather than printing an empty frame', async ({ page, world }) => {
  serveBytes(world, 'pdf');
  world.set('document', paper({ fileRef: REF }));
  // Reader.tsx:232 is reached when the frame is mounted and its window is not
  // reachable — which is what a viewer that has not finished attaching looks
  // like from the page. Nothing else can hold it in that state on purpose.
  await page.addInitScript(() => {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true, get: () => null,
    });
  });
  await page.goto(`/app/papers/${PAPER.deed}`);

  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.getByText('This document has not finished loading, so it cannot be printed yet.')).toBeVisible();
});

test('a PDF is not offered a rotate button, because its own viewer has one', async ({ page, world }) => {
  serveBytes(world, 'pdf');
  world.set('document', paper({ fileRef: REF }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByRole('group', { name: 'Zoom' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
});

test('a paper with no scan is offered no zoom, no rotate and no print', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText("This paper's file is filed under an old reference")).toBeVisible();
  await expect(page.getByRole('group', { name: 'Zoom' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
});

test('the toolbar carries no search box, because nothing behind this screen can search a scan', async ({ page, world }) => {
  // The box that used to sit here typed into nothing: it showed a mono
  // "searching…" beside itself for as long as there was text in it and never
  // searched. A permanent present-progressive label reads as work in progress.
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  const bar = page.locator('header.rd-bar');
  await expect(bar.getByRole('searchbox')).toHaveCount(0);
  await expect(bar.getByPlaceholder('Search')).toHaveCount(0);
  await expect(page.getByText('searching')).toHaveCount(0);
});

test('Print sends an image scan to the printer', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  // Headless Chromium has no printer; the stub is the only way to see that the
  // button reaches window.print at all.
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => { (window as unknown as { __prints: number }).__prints += 1; };
  });
  await page.goto(`/app/papers/${PAPER.deed}`);

  await page.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
});

test('printing a PDF prints the document, not the screen around it', async ({ page, world }) => {
  serveBytes(world, 'pdf');
  world.set('document', paper({ fileRef: REF }));
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => { (window as unknown as { __prints: number }).__prints += 1; };
  });
  await page.goto(`/app/papers/${PAPER.deed}`);

  await page.getByRole('button', { name: 'Print' }).click();
  // The page's own print() would hand the printer an empty frame where the
  // document should be, so this path must NOT be the one taken.
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(0);
  await expect(page.getByText('This document could not be sent to the printer.')).toHaveCount(0);
  await expect(page.getByText('This document has not finished loading')).toHaveCount(0);
  // And positively: the frame was asked to print ITSELF. `w.focus()` on a
  // same-origin child window is what moves the parent's activeElement onto
  // the <iframe>, so this is the one trace that path leaves behind.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? ''))
    .toBe('IFRAME');
});

test('on paper, only the scan is printed — the toolbar, the rail and the reading are not', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('header.rd-bar')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Pages' })).toBeHidden();
  await expect(page.locator('.rd-paging')).toBeHidden();
  await expect(page.locator('aside.rd-side')).toBeHidden();
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();
});

test('Download saves the stored original under the paper’s own name', async ({ page, world }) => {
  // An image scan on purpose: a PDF preview is the browser's own viewer, and
  // in headless Chromium that viewer saves the blob rather than drawing it —
  // a second download event that has nothing to do with this button.
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const file = await started;
  // Not "document" with no extension, which is what downloadBlob falls back to
  // and what the operating system then refuses to open.
  expect(file.suggestedFilename()).toBe('Sale deed 4412 of 1998.jpg');

  // The stored ORIGINAL: the download asks without ?format=web, which is the
  // transcoded copy the screen is showing. Exactly two reads, in that order —
  // a Download that re-used the preview's URL would hand the owner the
  // gateway's web copy of their registered deed.
  const urls = world.restCalls(/storage\/files/).map((c) => c.url);
  expect(urls).toHaveLength(2);
  expect(urls[0]).toContain(`/storage/files/${REF}/content?format=web`);
  expect(urls[1]).toMatch(new RegExp(`/storage/files/${REF}/content$`));
});

test('bytes the file store will not name do not land in Downloads as a file nothing opens', async ({ page, world }) => {
  // DEFECT: Reader.tsx:84 takes the extension off the bytes' media type and,
  // when that type is not in EXT, off its subtype — so the commonest thing a
  // storage gateway says about a file it has not sniffed,
  // `application/octet-stream`, becomes "Sale deed 4412 of 1998.octetstream".
  // macOS and Windows both refuse to open that. octet-stream is the store
  // saying "I do not know", and the row DOES know: it says image/jpeg. The
  // owner is owed either the row's extension or no extension at all — never
  // an invented one.
  test.fail();
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, (route) => (
    route.request().url().includes('format=web')
      ? { contentType: 'image/jpeg', body: PIXEL }
      : { contentType: 'application/octet-stream', body: PIXEL }));
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect(['Sale deed 4412 of 1998.jpg', 'Sale deed 4412 of 1998'])
    .toContain((await started).suggestedFilename());
});

test('what lands in Downloads is named off the bytes, not off the row they are filed on', async ({ page, world }) => {
  // The row says image/jpeg — a thumbnail was made from it — and the stored
  // original is the registered PDF. Naming the file off the row would hand the
  // owner a .jpg the operating system cannot open.
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, (route) => (
    route.request().url().includes('format=web')
      ? { contentType: 'image/jpeg', body: PIXEL }
      : { contentType: 'application/pdf', body: TINY_PDF }));
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await started).suggestedFilename()).toBe('Sale deed 4412 of 1998.pdf');
});

test('a survey number in a title does not become a folder on the way to Downloads', async ({ page, world }) => {
  serveBytes(world, 'image');
  world.set('document', paper({
    id: PAPER.map, title: 'FMB 214/2 sketch', shelf: 'map', fileRef: REF,
    mimeType: 'image/jpeg', shared: false, link: null,
  }));
  await page.goto(`/app/papers/${PAPER.map}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  const started = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  // Slashes and colons are legal in a survey number and illegal in a filename.
  expect((await started).suggestedFilename()).toBe('FMB 214 2 sketch.jpg');
});

test.describe('a download the file store refuses', () => {
  // A refused request is the point, and Chrome logs one for it.
  test.use({ allowConsole: true });

  test('a download the file store refuses says so, and says the paper itself is unchanged', async ({ page, world, consoleErrors }) => {
    // The preview is served and the download is refused, so the failure on
    // screen is unambiguously the download's.
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, (route) => (
      route.request().url().includes('format=web')
        ? { contentType: 'image/jpeg', body: PIXEL }
        : { status: 502, body: 'no' }));
    world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
    await page.goto(`/app/papers/${PAPER.deed}`);
    await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

    await page.getByRole('button', { name: 'Download' }).click();
    // A storage read is not a w360 mutation, so no shared onError stands
    // behind it — this one raises its own.
    await expect(page.getByText('That file could not be downloaded. The paper itself is unchanged.')).toBeVisible();
    await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();
    // The reason, small and grey under the sentence, for whoever is on the
    // phone about it — `fetchFileBlob` throws the status it got.
    await expect(page.getByText('storage 502')).toBeVisible();
    onlyRefusals(consoleErrors);
  });
});

test('a paper filed under an old reference is offered no Download, because there are no bytes to fetch', async ({ page, world }) => {
  world.set('document', paper({ fileRef: 'file-deed' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share securely' })).toBeVisible();
});

// ── sharing one paper ──────────────────────────────────────────────────

test('sharing one paper makes a link, and the dialog says the link carries only that paper', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);

  await page.getByRole('button', { name: 'Share securely' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share securely' });
  await expect(dialog.getByText('This link carries only this paper.')).toBeVisible();
  await expect(dialog.getByText('It is good for 30 days')).toBeVisible();

  const submit = dialog.getByRole('button', { name: 'Share', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/7Kq2x');
  // The Reader is the only caller in the app that names documentIds; a
  // recipient who expects one paper and gets the whole record is the failure
  // this variable prevents.
  expect(world.lastVars('createShareLink')).toMatchObject({
    recordId: ID.parcel, audience: 'Union Bank, Markapur', terms: 'view', days: 30,
    documentIds: [PAPER.deed],
  });
});

test('the recipient is sent as typed, without the spaces either side of the name', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('  Union Bank, Markapur  ');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  // The audience is what the Vault lists the link under and what the revoke
  // dialog names; a name with a space on the front sorts somewhere else in
  // that list, which is where an owner goes looking to cut a stranger off.
  expect(world.lastVars('createShareLink')).toMatchObject({ audience: 'Union Bank, Markapur' });
});

test('a name made only of spaces is not a name, and Enter does not make a link out of it', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  const who = page.getByLabel('Who is it for');
  await who.fill('   ');

  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeDisabled();
  // Enter in the field is the fast way to submit, and it must run into the
  // same guard the button does (Reader.tsx:261).
  await who.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Share securely' })).toBeVisible();
  expect(world.calls('createShareLink')).toEqual([]);
});

test('while the link is being made the dialog says so, and will not make a second one', async ({ page, world }) => {
  world.set('createShareLink', World.slow(1_500, '/share/7Kq2x'));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Share securely' });
  await expect(dialog.getByRole('button', { name: 'Making the link…' })).toBeDisabled();
  // A share link is a secret handed to a stranger; two of them because the
  // owner clicked twice is two things to remember to revoke.
  await expect(dialog).toHaveAttribute('aria-busy', 'true');

  await expect(dialog.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/7Kq2x');
  expect(world.calls('createShareLink')).toHaveLength(1);
});

test('nothing on the screen changes when the link is made, so the Reader says it out loud', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByText('The link is ready to copy. Revoke it any time from the Vault.')).toBeVisible();
  // And the dialog stops offering to make a second one.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
});

test('the shared paper then says it is shared, and who has opened it', async ({ page, world }) => {
  world.set('document', paper({
    shared: true,
    link: { ...(DEED.link as Row), audience: 'Union Bank, Markapur', openedCount: 0, lastOpenedAt: '13/09/2026', daysLeft: 30 },
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.locator('aside.rd-side').getByText('shared', { exact: true })).toBeVisible();
  await expect(page.getByText('Union Bank, Markapur has opened this 0 times')).toBeVisible();
  await expect(page.getByText('Last 13/09/2026 · 30 days left')).toBeVisible();
});

test('a link the buyer has opened once has not been opened “1 times”', async ({ page, world }) => {
  // DEFECT: Reader.tsx:621 writes `{openedCount} times` straight into the
  // sentence. ui.tsx:141 exports plural() for exactly this and the rest of
  // the module — Vault.tsx:80 among them — uses it. This is the same defect
  // as the "1 pages" one above, on the other half of the screen, and it is on
  // the line an owner reads to decide whether a stranger has been in their
  // deed yet.
  test.fail();
  world.set('document', paper({
    link: { ...(DEED.link as Row), audience: 'Prospective buyer', openedCount: 1 },
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('Prospective buyer has opened this 1 time', { exact: true })).toBeVisible();
});

test('a link nobody has opened yet does not claim a last time it was opened', async ({ page, world }) => {
  // DEFECT: Reader.tsx:624 prints `Last {lastOpenedAt} · …` unconditionally,
  // and a link nobody has opened has no lastOpenedAt — the seeded lapsed link
  // (fixtures/seed.ts:471) is exactly that shape. The card then reads
  // "Last  · 18 days left": a label with nothing behind it, on the one card
  // an owner scans to see whether a stranger has been in their papers.
  test.fail();
  world.set('document', paper({
    link: {
      ...(DEED.link as Row), audience: 'Surveyor', openedCount: 0,
      lastOpenedAt: '', daysLeft: 18,
    },
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('Surveyor has opened this 0 times')).toBeVisible();
  const line = page.locator('aside.rd-side .note').filter({ hasText: 'days left' });
  await expect(line).not.toHaveText(/Last\s*·/);
  await expect(line).toHaveText(/18 days left/);
});

test('a paper that is not out on a link says nothing about one', async ({ page, world }) => {
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);
  await expect(page.locator('aside.rd-side').getByText('shared', { exact: true })).toHaveCount(0);
  await expect(page.getByText('has opened this')).toHaveCount(0);
});

test('the Reader must not tell the owner a link that lapsed last month expires tomorrow', async ({ page, world }) => {
  // DEFECT: Reader.tsx:625 renders `daysLeft <= 1 ? 'link expires tomorrow'`,
  // and the server's _days_until (services/api/src/web360.py:1488) ends in
  // `max(0, …)` — every past date arrives as 0. Vault.tsx:72-80 parses
  // expiresOn itself for exactly this reason and says "expired 01/08/2026";
  // Reader.tsx never got that fix, so the two screens contradict each other
  // about one row today. The owner reads this and believes a surveyor still
  // has their title deed for one more day.
  test.fail();
  world.set('document', paper({
    link: {
      ...(DEED.link as Row), audience: 'Surveyor', openedCount: 0,
      lastOpenedAt: '02/07/2026', expiresOn: '01/08/2026', daysLeft: 0,
    },
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('Surveyor has opened this 0 times')).toBeVisible();
  await expect(page.getByText('link expires tomorrow')).toHaveCount(0);
  await expect(page.getByText('expired 01/08/2026')).toBeVisible();
});

test('a link that really does run out tomorrow says exactly that', async ({ page, world }) => {
  world.set('document', paper({
    link: { ...(DEED.link as Row), daysLeft: 1, expiresOn: '14/09/2026' },
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('link expires tomorrow')).toBeVisible();
});

test('a share the server quietly refuses is not reported as a link', async ({ page, world }) => {
  world.set('createShareLink', '');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByText('This paper could not be shared. Refresh and try again.')).toBeVisible();
  await expect(page.getByLabel('Recipient link')).toHaveCount(0);
  await expect(page.getByText('The link is ready to copy.')).toHaveCount(0);
});

test('a share the server refuses outright keeps the dialog open with the name still typed in it', async ({ page, world }) => {
  world.set('createShareLink', World.gqlError('share links are switched off on this build'));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByText('That share link could not be saved. Nothing has changed.')).toBeVisible();
  await expect(page.getByText('share links are switched off on this build')).toBeVisible();
  await expect(page.getByLabel('Who is it for')).toHaveValue('Union Bank, Markapur');
});

test('a stray click outside the share dialog does not throw away the name typed into it', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  // The scrim is the only thing outside the dialog box that can be clicked.
  await page.locator('.scrim').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('dialog', { name: 'Share securely' })).toBeVisible();
  await expect(page.getByLabel('Who is it for')).toHaveValue('Union Bank, Markapur');
});

test('Cancel closes the share dialog and makes no link', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Share securely' })).toHaveCount(0);
  expect(world.calls('createShareLink')).toEqual([]);
});

test('the recipient link can be copied, and the screen says it was', async ({ page, context, world }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await page.getByRole('button', { name: 'Copy link' }).click();
  // A live region, not a line of text: the owner has just pressed a button and
  // needs to be told it worked without going looking for the news.
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText()))
    .toBe('http://localhost:5173/share/7Kq2x');
});

test('the finished dialog says plainly what the link lets a stranger do, and the link cannot be typed over', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Share securely' });
  await expect(dialog.getByText('The link is ready. Copy it and send it to the intended recipient. Anyone with this link can open the selected files until it expires or you revoke it.')).toBeVisible();
  // The box holds a secret to be copied, not edited: a stray keystroke in it
  // would hand the recipient a URL that opens nothing.
  await expect(dialog.getByLabel('Recipient link')).toHaveAttribute('readonly', '');
});

test('a share sheet the owner dismisses leaves the link on screen to copy by hand', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      // What a dismissed iOS share sheet does: rejects with AbortError.
      value: () => Promise.reject(new Error('AbortError')),
    });
  });
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Share securely' });
  await dialog.getByRole('button', { name: 'Send link' }).click();
  // Changing your mind about HOW to send it is not a failure, and the link is
  // still the only copy of a one-time secret.
  await expect(dialog.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/7Kq2x');
  await expect(dialog.getByRole('status')).toHaveText('');
});

test('Done closes the finished dialog, and opening it again offers a fresh form rather than the old link', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('dialog', { name: 'Share securely' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Share securely' }).click();
  // A link already handed over must not be re-offered as though it were this
  // share: the next recipient gets their own link, made now.
  await expect(page.getByLabel('Recipient link')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
  expect(world.calls('createShareLink')).toHaveLength(1);
});

test('a browser that will not copy tells the owner to copy it by hand', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  // A page served over plain http on another host, or a denied permission —
  // both land in the same catch, and the secret must stay on screen.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Select the link above and copy it.')).toBeVisible();
  await expect(page.getByLabel('Recipient link')).toHaveValue('http://localhost:5173/share/7Kq2x');
});

test('Send link is only drawn on a device that can share, and hands over the link itself', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.addInitScript(() => {
    (window as unknown as { __shared: string }).__shared = '';
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (d: { url: string }) => {
        (window as unknown as { __shared: string }).__shared = d.url;
        return Promise.resolve();
      },
    });
  });
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await page.getByRole('button', { name: 'Send link' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string }).__shared))
    .toBe('http://localhost:5173/share/7Kq2x');
});

test('a desktop with no share sheet is not offered Send link', async ({ page, world }) => {
  world.set('createShareLink', '/share/7Kq2x');
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Share securely' }).click();
  await page.getByLabel('Who is it for').fill('Union Bank, Markapur');
  await page.getByRole('button', { name: 'Share', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send link' })).toHaveCount(0);
});

// ── renaming and re-shelving ───────────────────────────────────────────

test('renaming a paper sends the new name and leaves the shelf where it was', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await expect(dialog.getByLabel('What it is called')).toHaveValue('Sale deed 4412 of 1998');
  await expect(dialog.getByLabel('Shelf')).toHaveValue('title');
  await expect(dialog.getByText('The shelf is where the vault files this paper. Nothing read off the scan changes.')).toBeVisible();

  await dialog.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (original)');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => world.calls('updatePaper').length).toBe(1);
  // An empty shelf means "leave it where it is" to the API, which is exactly
  // what an unchanged select should send.
  expect(world.lastVars('updatePaper')).toEqual({
    paperId: PAPER.deed, name: 'Sale deed 4412 of 1998 (original)', shelf: '',
  });
  await expect(dialog).toHaveCount(0);
});

test('moving a paper to another shelf sends the shelf it is moving to', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('Shelf').selectOption('old');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => world.calls('updatePaper').length).toBe(1);
  expect(world.lastVars('updatePaper')).toEqual({
    paperId: PAPER.deed, name: 'Sale deed 4412 of 1998', shelf: 'old',
  });
});

test('a rename lands on the screen the owner is looking at, not only in the mutation', async ({ page, world }) => {
  // The world answers from a name the mutation moves, which is what the server
  // does: `update_paper` writes the row and the next read returns it.
  let title = 'Sale deed 4412 of 1998';
  world.set('document', () => paper({ title }));
  world.set('updatePaper', (vars) => { title = String(vars.name); return true; });
  await page.goto(`/app/papers/${PAPER.deed}`);

  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (original)');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // The mutation invalidates the whole w360 key (api.ts:688), so the paper is
  // read again — and the new name has to arrive in all three places the old
  // one was written, not just the one the owner typed into.
  await expect(page.getByRole('heading', { name: 'Sale deed 4412 of 1998 (original)', level: 2 })).toBeVisible();
  await expect(page.locator('header.rd-bar').getByText('Sale deed 4412 of 1998 (original)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998 (original)' })).toBeVisible();
});

test('while a rename is saving the dialog says so and will not save it twice', async ({ page, world }) => {
  world.set('updatePaper', World.slow(1_200, true));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (original)');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  // Busy also holds Escape and the scrim shut (Dialog.tsx:112), so the write
  // in flight cannot be walked away from mid-air.
  await expect(dialog).toHaveAttribute('aria-busy', 'true');

  await expect(dialog).toHaveCount(0);
  expect(world.calls('updatePaper')).toHaveLength(1);
});

test('a paper cannot be saved with no name at all', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('What it is called').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(world.calls('updatePaper')).toEqual([]);
});

test('a paper filed on a shelf this screen does not list still opens showing its own shelf', async ({ page, world }) => {
  world.set('document', paper({ shelf: 'photos', shared: false, link: null }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  // Blank here would silently refile the paper on the first Save.
  await expect(page.getByLabel('Shelf')).toHaveValue('photos');
  await expect(page.getByRole('option', { name: 'Photos' })).toHaveCount(1);
});

test('every shelf the vault has can be reached from the Reader', async ({ page }) => {
  // DEFECT: Reader.tsx:42 lists seven shelves; the vault wall has eight
  // (ui.tsx:369 SHELF_WORD, Vault.tsx's eight cards). "Photos" is missing, so
  // a scan that is only a picture can be moved OFF that shelf from here and
  // never onto it — the one shelf in the vault this screen cannot file to.
  test.fail();
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
  await expect(page.getByLabel('Shelf').getByRole('option')).toHaveCount(8);
  await expect(page.getByRole('option', { name: 'Photos' })).toHaveCount(1);
});

test('a rename the server refuses leaves the dialog open with the typed name still in it', async ({ page, world }) => {
  world.set('updatePaper', World.gqlError('that paper is not yours to rename'));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (copy)');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('That paper could not be saved. Nothing has changed.')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('What it is called')).toHaveValue('Sale deed 4412 of 1998 (copy)');
});

test('a rename the server declines does not close as though it saved', async ({ page, world }) => {
  // DEFECT: Reader.tsx:288 only catches a THROWN failure. `update_paper`
  // (services/api/src/web360.py:4915) returns FALSE for a row that is not the
  // caller's — no error, no toast — and saveEdit then runs setEditing(false),
  // so the dialog closes and the old title is still on the screen behind it.
  // The share path three functions up (Reader.tsx:267) already checks the
  // returned value; this one owes the owner the same.
  test.fail();
  world.set('updatePaper', false);
  await page.goto(`/app/papers/${PAPER.deed}`);
  await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
  await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename or move this paper' });
  await dialog.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (copy)');
  const reads = world.calls('document').length;
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Waiting on `updatePaper` alone would race the screen: the call is recorded
  // when the REQUEST arrives, and "is the dialog still open" is then asked of a
  // screen that has not seen the answer yet — which passes whether the defect
  // is there or not. The mutation invalidates the w360 key inside onSuccess
  // (api.ts:688), before mutateAsync resolves, so a second read of this paper
  // is the signal that the answer has landed and saveEdit has done whatever it
  // is going to do.
  await expect.poll(() => world.calls('updatePaper').length).toBe(1);
  await expect.poll(() => world.calls('document').length).toBeGreaterThan(reads);
  await expect(dialog).toBeVisible();
});

// ── deleting ───────────────────────────────────────────────────────────
//
// Deletion used to be a red-bordered, red-washed panel parked permanently in
// the reading rail. Every other block in that rail is conditional on a field
// the filing pipeline never writes, so on a real paper the panel was the only
// card that rendered and the screen's whole message was "Delete this
// document". It is now a danger item in the Actions menu opening the module's
// Dialog — the shape RecordPapers.tsx:268 and Properties.tsx:137 already use.
// Two steps survive: the menu is the first, the dialog is the second.

/** Open the confirm dialog the way an owner does. */
async function startDelete(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete this document…' }).click();
}

test('deletion is an action, not furniture: the reading rail carries no delete panel', async ({ page, world }) => {
  world.set('document', paper({ ...PLAIN, fileRef: REF }));
  serveBytes(world, 'pdf');
  await page.goto(`/app/papers/${PAPER.ec}`);

  // The rail is for what was read off the paper. Nothing destructive lives in it.
  await expect(page.getByRole('heading', { name: 'Delete this document' })).toHaveCount(0);
  await expect(page.locator('.rd-side .card.alert')).toHaveCount(0);

  await startDelete(page, 'Encumbrance certificate');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete Encumbrance certificate?' })).toBeVisible();
  // No 30-day archive is promised: delete_paper removes the row there and then.
  await expect(page.getByText('It leaves this record straight away, with its list of versions.')).toBeVisible();
  await expect(page.getByText('The file itself stays in your storage, but nothing in the vault points at it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
});

test.describe('the delete dialog over refused bytes', () => {
  test.use({ allowConsole: true });

  test('the dialog does not promise a stored file when the store would not hand one over', async ({ page, world, consoleErrors }) => {
    // The old panel swore "The file itself stays in your storage" in every
    // state, including the one where this screen has just been refused the bytes.
    world.set('document', paper({ ...PLAIN, fileRef: REF }));
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({ status: 404, body: '' }));
    await page.goto(`/app/papers/${PAPER.ec}`);

    await startDelete(page, 'Encumbrance certificate');
    await expect(page.getByText('Whatever is in your storage is left alone, but nothing in the vault will point at it.')).toBeVisible();
    await expect(page.getByText('The file itself stays in your storage')).toHaveCount(0);
    onlyRefusals(consoleErrors);
  });
});

test('an ordinary paper takes two steps to unfile, and Keep it puts it back', async ({ page, world }) => {
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);

  await startDelete(page, 'Encumbrance certificate');
  await page.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.calls('deletePaper')).toEqual([]);
});

test('deleting a paper unfiles it and goes back to the record, not to “not in your vault”', async ({ page, world }) => {
  world.set('document', PLAIN);
  await page.goto(`/app/papers/${PAPER.ec}`);

  await startDelete(page, 'Encumbrance certificate');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${RECORD_HOME}$`));
  expect(world.lastVars('deletePaper')).toEqual({ paperId: PAPER.ec });
});

test('deleting an unfiled paper goes back to the vault, because there is no record to return to', async ({ page, world }) => {
  world.set('document', paper({ ...PLAIN, recordId: '', recordTitle: '' }));
  await page.goto(`/app/papers/${PAPER.unsorted}`);

  await startDelete(page, 'Encumbrance certificate');
  // An unfiled paper leaves the vault, not "the record" it does not have.
  await expect(page.getByText('It leaves the vault straight away, with its list of versions.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/papers$/);
});

test('a shared title deed asks for its number before it goes', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);

  await startDelete(page, 'Sale deed 4412 of 1998');
  await expect(page.getByText('This is your title to this land and it is shared right now, so you are asked to type 4412 first.')).toBeVisible();
  await expect(page.getByText('The link is revoked with it')).toBeVisible();

  const box = page.getByLabel('Type 4412 to confirm deletion');
  const del = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(del).toBeDisabled();
  await box.fill('441');
  await expect(del).toBeDisabled();
  await box.fill(' 4412 ');
  await expect(del).toBeEnabled();
  await del.click();

  await expect(page).toHaveURL(new RegExp(`${RECORD_HOME}$`));
  expect(world.lastVars('deletePaper')).toEqual({ paperId: PAPER.deed });
});

test('a deletion in flight says Removing…, and cannot be asked for a second time', async ({ page, world }) => {
  world.set('document', PLAIN);
  world.set('deletePaper', World.slow(1_200, true));
  await page.goto(`/app/papers/${PAPER.ec}`);

  await startDelete(page, 'Encumbrance certificate');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  // An impatient second press on an unfiling is a second deletePaper against
  // a row that is already gone, which the server answers False to.
  await expect(page.getByRole('button', { name: 'Removing…' })).toBeDisabled();
  await expect(page).toHaveURL(new RegExp(`${RECORD_HOME}$`));
  expect(world.calls('deletePaper')).toHaveLength(1);
});

test('Enter with the wrong number typed does not unfile a shared title deed', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.deed}`);
  await startDelete(page, 'Sale deed 4412 of 1998');
  const box = page.getByLabel('Type 4412 to confirm deletion');
  await box.fill('4411');
  // The form submits on Enter, and the phrase guard has to stand there too.
  await box.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/app/papers/${PAPER.deed}$`));
  expect(world.calls('deletePaper')).toEqual([]);
});

test('a title deed with no number in its name asks for the whole name', async ({ page, world }) => {
  world.set('document', paper({ title: 'Pattadar Passbook', shelf: 'title', shared: true }));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await startDelete(page, 'Pattadar Passbook');
  // `replace(/^\D+/,'')` used to leave this sentence reading "…type  first"
  // and gate the deletion on an empty string.
  await expect(page.getByText('you are asked to type Pattadar Passbook first')).toBeVisible();
  const del = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(del).toBeDisabled();
  await page.getByLabel('Type Pattadar Passbook to confirm deletion').fill('pattadar passbook');
  await expect(del).toBeEnabled();
});

test('a title deed that is not shared is deleted the ordinary way', async ({ page, world }) => {
  world.set('document', paper({ shared: false, link: null }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await startDelete(page, 'Sale deed 4412 of 1998');
  await expect(page.getByText('you are asked to type')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
});

test('a shared paper that is not a title deed is deleted the ordinary way', async ({ page, world }) => {
  world.set('document', paper({ ...PLAIN, shared: true, link: DEED.link }));
  await page.goto(`/app/papers/${PAPER.ec}`);
  await startDelete(page, 'Encumbrance certificate');
  await expect(page.getByText('you are asked to type')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
});

test('a deletion the server refuses leaves the paper on the screen where the owner can see it', async ({ page, world }) => {
  world.set('document', PLAIN);
  world.set('deletePaper', World.gqlError('that paper is not yours to delete'));
  await page.goto(`/app/papers/${PAPER.ec}`);

  await startDelete(page, 'Encumbrance certificate');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Deleting that paper could not be saved. Nothing has changed.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/papers/${PAPER.ec}$`));
});

test('a deletion the server declines does not walk the owner away as though it worked', async ({ page, world }) => {
  // DEFECT: Reader.tsx remove() catches only a THROWN failure. `delete_paper`
  // (services/api/src/web360.py:5051) returns FALSE for a row that is not the
  // caller's or is already gone — no error, no toast — and remove() then runs
  // nav(papersHome). The owner is walked to the record believing their deed
  // was unfiled while it is still filed.
  test.fail();
  world.set('document', PLAIN);
  world.set('deletePaper', false);
  await page.goto(`/app/papers/${PAPER.ec}`);

  await startDelete(page, 'Encumbrance certificate');
  const reads = world.calls('document').length;
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect.poll(() => world.calls('deletePaper').length).toBe(1);
  await expect.poll(() => world.calls('document').length).toBeGreaterThan(reads);
  await expect(page).toHaveURL(new RegExp(`/app/papers/${PAPER.ec}$`));
});


// ── versions ───────────────────────────────────────────────────────────

test('the versions list keeps what was filed, and says where a newer scan goes', async ({ page, world }) => {
  world.set('document', DEED);
  await page.goto(`/app/papers/${PAPER.deed}`);
  const card = page.locator('section.card').filter({ hasText: 'Versions' });

  await expect(card.getByText('v1')).toBeVisible();
  await expect(card.getByText('As filed')).toBeVisible();
  await expect(card.getByText('02/07/2026 · by Shankar Reddy · Scanned at the SRO')).toBeVisible();
  // The "Replace" button that used to sit in this card's corner had no handler.
  await expect(card.getByRole('button', { name: 'Replace' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: "this record's papers" })).toHaveAttribute('href', RECORD_HOME);
  await expect(card.getByText('Nothing here is ever overwritten — an older version stays in this list.')).toBeVisible();
});

test('more than one version is listed oldest first, and none of them is overwritten', async ({ page, world }) => {
  world.set('document', paper({
    versions: [
      { id: 'w-ver-1', version: 1, label: 'As filed', madeOn: '02/07/2026', madeBy: 'Shankar Reddy', note: 'Scanned at the SRO' },
      { id: 'w-ver-2', version: 2, label: 'Rescanned at 600 dpi', madeOn: '11/08/2026', madeBy: 'Ravi Kumar', note: '' },
    ],
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  const rows = page.locator('section.card').filter({ hasText: 'Versions' }).locator('.rows > div');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('v1');
  await expect(rows.last()).toContainText('Rescanned at 600 dpi');
  await expect(rows.last()).toContainText('11/08/2026 · by Ravi Kumar');
});

test('a version nobody signed and nobody annotated shows its date and nothing more', async ({ page, world }) => {
  world.set('document', paper({
    versions: [{ id: 'w-ver-1', version: 1, label: 'As filed', madeOn: '02/07/2026', madeBy: '', note: '' }],
  }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  const row = page.locator('section.card').filter({ hasText: 'Versions' }).locator('.rows > div');
  await expect(row).toHaveCount(1);
  // filter(Boolean).join(' · ') again: "02/07/2026 · by  · " is what a
  // scan filed by a script rather than a person would otherwise read as.
  await expect(row.locator('.note')).toHaveText('02/07/2026');
});

test('a paper with no version history shows no versions card', async ({ page, world }) => {
  world.set('document', paper({ versions: [] }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByText('Versions')).toHaveCount(0);
});

test('an unfiled paper’s versions card names the record in words, because there is no link to give', async ({ page, world }) => {
  world.set('document', paper({ recordId: '', recordTitle: '' }));
  await page.goto(`/app/papers/${PAPER.unsorted}`);
  const card = page.locator('section.card').filter({ hasText: 'Versions' });
  await expect(card.getByText('A newer scan is filed from the record this paper belongs to.')).toBeVisible();
  await expect(card.getByRole('link')).toHaveCount(0);
});

// ── the three absences of the paper itself ─────────────────────────────

test('the whole screen waits while the paper is being read, and claims nothing', async ({ page, world }) => {
  world.set('document', World.never());
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('Loading…')).toBeVisible();
  await expect(page.getByText('This paper is not in your vault')).toHaveCount(0);
  await expect(page.getByText('did not load')).toHaveCount(0);
});

test('a read that broke says so, and prints the reason for whoever is on the phone', async ({ page, world }) => {
  world.set('document', World.gqlError('the paper store is down'));
  await page.goto(`/app/papers/${PAPER.deed}`);

  await expect(page.getByText('This paper did not load')).toBeVisible();
  await expect(page.getByText('the paper store is down')).toBeVisible();
  await expect(page.getByText('Nothing has been lost')).toBeVisible();
  // Telling an owner their deed "did not load" when it has been deleted sends
  // them to support for nothing — so the two absences must not read alike.
  await expect(page.getByText('This paper is not in your vault')).toHaveCount(0);
});

test('a paper id that resolves to nothing is not an error, it is not in your vault', async ({ page, world }) => {
  await page.goto(`/app/papers/${PAPER.missing}`);

  await expect(page.getByText('This paper is not in your vault')).toBeVisible();
  await expect(page.getByText('It may have been deleted, or it belongs to a record that is no longer yours.')).toBeVisible();
  await expect(page.getByText('did not load')).toHaveCount(0);
  expect(world.lastVars('document')).toMatchObject({ id: PAPER.missing });
});

test('a paper that is not there draws no toolbar, no rail and no delete panel', async ({ page }) => {
  await page.goto(`/app/papers/${PAPER.missing}`);
  await expect(page.getByText('This paper is not in your vault')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share securely' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Delete this document' })).toHaveCount(0);
});

// ── the phone ──────────────────────────────────────────────────────────

test('the Reader fits a phone instead of running off the side of it', async ({ page, world }) => {
  // DEFECT: Reader.tsx:394 sets `gridTemplateColumns: '7rem minmax(0,1fr)
  // 24rem'` inline, so the page rail and the reading panel alone demand 496px
  // before the scan gets a single pixel. At 390px the whole screen scrolls
  // sideways and the reading is off the edge. The columns need to stack below
  // the rail's breakpoint the way the rest of the module re-flows.
  //
  // It sizes its own viewport rather than carrying @phone: the defect is in
  // three CSS columns, not in an engine, so it belongs in the same project as
  // the rest of this file and runs on every `--project=app` pass.
  test.fail();
  await page.setViewportSize({ width: 390, height: 844 });
  serveBytes(world, 'image');
  world.set('document', paper({ fileRef: REF, mimeType: 'image/jpeg' }));
  await page.goto(`/app/papers/${PAPER.deed}`);
  await expect(page.getByRole('img', { name: /page 1 of 14/ })).toBeVisible();

  const spill = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(spill, 'the Reader scrolls sideways on a phone').toBeLessThanOrEqual(1);
});
