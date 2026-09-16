/**
 * The record 360 · five behaviours the eleven tabs never had a test for.
 *
 * Each one is a branch the app already gets RIGHT and that nothing has ever
 * executed — which is the dangerous kind, because the day it breaks the suite
 * stays green. None is marked test.fail(): the source was read for all five and
 * the shipped behaviour is the correct behaviour. What was missing was proof.
 *
 *   · THE RECORD THAT WILL NOT LOAD. Record.tsx has three separate answers —
 *     loading, error, and "not yours" (:63, :67, :75). screens.spec.ts:2400
 *     walks into the third with a bogus id; no spec anywhere makes the record
 *     query FAIL, so the branch that exists to stop the app telling an owner
 *     their parcel "is not in your portfolio" because the API blinked has never
 *     run. Collapsing the two back into one is a one-line regression.
 *
 *   · REMOVING A FILED PAPER. crud-360.spec.ts:235 is titled "a paper can be
 *     renamed and removed" and only renames. The two-tap confirm at
 *     RecordPapers.tsx:600-640 permanently unfiles evidence with no undo, and
 *     until now nothing had clicked it — not the Remove, and not the Keep that
 *     has to leave the paper where it is.
 *
 *   · TAGGING A PHOTO. api.ts:695 useSetTag had no test of any kind, and
 *     RecordPhotos.tsx:285 is its only call site in the app. The comment at
 *     :269 warns that entityType must be exactly 'photo' or the row is written
 *     and never shown again — a failure only a write-then-reload catches, since
 *     the optimistic panel looks identical either way.
 *
 *   · ARCHIVING FROM THE RECORD'S OWN KEBAB. crud.spec.ts:97 archives from the
 *     properties list — a different component, a different dialog, no
 *     navigation. crud-360.spec.ts:936 opens this kebab and asserts three of
 *     its six items; "Archive this record" was not one of them. The comment at
 *     RecordPapers.tsx:388 says this used to happen on one stray menu click
 *     with nothing on screen saying it had.
 *
 *   · THE SURVEY REQUEST ON AN UNSURVEYED RECORD. Every /request visit in the
 *     suite runs on w360-p-214-2, the only seeded parcel with a ring, and
 *     crud-360.spec.ts:1027 asserts a prefix both openers share — so it passes
 *     on either branch and distinguishes nothing. The wording that promises a
 *     surveyor an attached GeoJSON that cannot exist was therefore free to come
 *     back unnoticed.
 *
 * CLEANUP: the two tests that write rows register them in MADE and sweep in
 * afterEach — never as the last line of the body, because Playwright abandons a
 * test at its first failed assertion and a trailing delete is skipped exactly
 * when it is needed. crud-360.spec.ts:30 tells the story: one leaked scratch
 * parcel moved the seeded totals and turned one red test into seventeen.
 */
import { expect, test } from './harness';

type Req = import('@playwright/test').APIRequestContext;

/** The canonical seeded parcel: surveyed (scripts/seed-web360.py:244 gives it
 *  the only ring in BOUNDARIES) and carrying the 32 photos. */
const PARCEL = 'w360-p-214-2';
/** Seeded too, and deliberately NOT in BOUNDARIES — so `surveyed` is false on
 *  it without a scratch record, and the noGeo branch is reachable as shipped. */
const UNSURVEYED = 'w360-p-214-3';

/** GraphQL straight at the API, for setting a test up and for checking what the
 *  UI actually wrote. The preview proxy injects the w360-demo identity. */
const gql = (request: Req, query: string) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query } }).then((r) => r.json());

/** Rows this file made, swept whether the test passed or failed. */
const MADE: string[] = [];
const made = (id: string): string => { MADE.push(id); return id; };

/** Never throws: a failing cleanup must not redden a passing test, nor mask the
 *  real failure of a failing one. */
async function sweepMade(request: Req): Promise<void> {
  const ids = MADE.splice(0);
  if (!ids.length) return;
  const list = ids.map((id) => JSON.stringify(id)).join(',');
  try {
    await gql(request, `mutation { web { deleteRecords(ids:[${list}]) } }`);
  } catch {
    // purge-e2e-records sweeps what is left at the start of the next run.
  }
}

/** A throwaway parcel, so the seeded totals other specs assert stay put.
 *  deleteRecords takes everything filed under it (web360.py:4055), archived
 *  rows included, so one sweep is enough however the test ended. */
async function scratchParcel(request: Req, title: string): Promise<string> {
  const out = await gql(request, `mutation { web { saveRecord(input:{kind:"parcel",
    title:"${title}", classification:"agri", khataNo:"9970",
    village:"E2E Palem", mandal:"E2E Mandal", extent:1, extentUnit:"ac" }) } }`);
  const id = out?.data?.web?.saveRecord ?? '';
  expect(id, `could not create ${title}`).not.toBe('');
  return made(id);
}

test.describe('W360 · a record that will not load', () => {
  test('a record that will not load says so, instead of saying it is not yours', async ({ page }) => {
    // Fail ONLY the record read. A blanket 502 also kills the Shell's portfolio
    // and orders queries, which puts a second "Try again" on screen and proves
    // nothing about this branch. `record(id:$id)` is unique to Q_RECORD
    // (api.ts:315); everything else falls through to the real API.
    await page.route('**/api/gateway/pattadar/graphql', (route) => {
      const body = route.request().postData() ?? '';
      if (!body.includes('record(id:$id)')) return route.fallback();
      return route.fulfill({ status: 503, json: { detail: 'down' } });
    });

    await page.goto(`/app/records/${PARCEL}`);

    // main.tsx:43 sets retry: 1, so the error state is only reached after the
    // second refusal — the default expect timeout covers that round trip.
    const failed = page.getByRole('alert').filter({ hasText: 'This record did not load' });
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Nothing has been lost');
    // The one sentence this app must never say to an owner whose parcel is
    // fine and whose server is not. Both branches render a <main> with the same
    // breadcrumbs, so the only thing separating them is this copy.
    await expect(page.getByText('That record is not in your portfolio')).toHaveCount(0);

    // A dead end is not an error state: the read is retryable in place…
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeEnabled();
    // …and the way back out is still drawn, with the crumb reading "Record"
    // rather than the "Not found" the !data branch uses.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Properties' })).toBeVisible();
    await expect(crumbs).toContainText('Record');
    await expect(crumbs).not.toContainText('Not found');
  });
});

test.describe('W360 · unfiling a paper', () => {
  test.afterEach(async ({ request }) => { await sweepMade(request); });

  const PAPER = 'E2E Removable paper';

  test('a paper is removed from the record, and Keep backs out without unfiling it', async ({ page, request }) => {
    // A scratch parcel of its own: screens.spec.ts:481 asserts twelve papers on
    // Sy 214/2 and the shelf chips count them, so removing a seeded paper there
    // would break that spec rather than test this one.
    const id = await scratchParcel(request, 'Sy PAPERDEL');
    const filed = await gql(request, `mutation { web { addPaper(recordId:"${id}",
      fileRef:"stub-node-e2e", name:"${PAPER}", subtitle:"", shelf:"unsorted",
      pageCount:0, mimeType:"application/pdf", sizeBytes:24) } }`);
    expect(filed?.data?.web?.addPaper ?? '', 'could not file the paper to remove').not.toBe('');

    const row = page.getByRole('link', { name: PAPER });
    const trigger = page.locator(`button[aria-label="Remove ${PAPER}"]`);
    const papersOnServer = async () => {
      const out = await gql(request, `{ web { papers(recordId:"${id}"){ id title } } }`);
      return (out?.data?.web?.papers ?? []) as { id: string; title: string }[];
    };

    await page.goto(`/app/records/${id}`);
    await expect(row).toBeVisible();

    // First tap only ASKS. Removing evidence has no undo, so a single click
    // must not reach the server — the row stays, and so does the paper.
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toBeVisible();
    await expect(row).toBeVisible();
    expect(await papersOnServer()).toHaveLength(1);

    // Keep is the whole reason the confirm exists: it must close the pair and
    // leave the paper filed, not quietly do the thing it backed out of.
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(await papersOnServer()).toHaveLength(1);

    await trigger.click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(row).toHaveCount(0);
    // Neither refusal line (RecordPapers.tsx:606, :608) may appear on the happy
    // path — a removal that failed still empties the row optimistically.
    await expect(page.getByText(/could not be removed|still filed here/)).toHaveCount(0);

    // Read it back from the server, not from the list React already redrew.
    await page.reload();
    await expect(page.getByText(PAPER, { exact: true })).toHaveCount(0);
    // The list's last row is replaced by the "nothing filed" note, not by the
    // "no paper matches that" one — there is no filter typed here.
    await expect(page.getByText('Nothing is filed against this parcel yet.', { exact: false })).toBeVisible();
    expect(await papersOnServer()).toHaveLength(0);
  });
});

test.describe('W360 · tagging a photo', () => {
  const TAG = 'e2e-photo-tag';

  // The seeded gallery is shared with screens.spec.ts, so the tag comes off
  // whichever photo carries it however the test ended.
  test.afterEach(async ({ request }) => {
    const out = await gql(request, `{ web { photos(recordId:"${PARCEL}"){ photos { id tags } } } }`);
    const photos = (out?.data?.web?.photos?.photos ?? []) as { id: string; tags: string[] }[];
    for (const ph of photos) {
      if ((ph.tags ?? []).includes(TAG)) {
        await gql(request, `mutation { web { setTag(entityType:"photo",
          entityId:"${ph.id}", tag:"${TAG}", on:false) } }`);
      }
    }
  });

  test('a tag typed on a photo is filed against that photo and survives a reload', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);

    const chip = page.getByRole('button', { name: '+ tag' });
    const tag = page.locator('aside.side .tag').filter({ hasText: TAG });
    await expect(chip).toBeVisible();
    await chip.click();

    const box = page.getByLabel('New tag');
    await box.fill(TAG);
    // Wait for the write before reloading: a reload cancels the mutation in
    // flight and the read-back then fails for a reason that has nothing to do
    // with the tag (crud-360.spec.ts:275 hit this with updateCaption).
    const wrote = page.waitForResponse((r) => r.url().includes('/graphql')
      && (r.request().postData() ?? '').includes('setTag'));
    await Promise.all([wrote, box.press('Enter')]);

    // Enter commits and hands the row back: the input closes, the chip returns,
    // and focus lands on it so a second tag can be typed without the mouse.
    await expect(box).toHaveCount(0);
    await expect(chip).toBeVisible();
    await expect(chip).toBeFocused();
    await expect(tag).toBeVisible();

    // The assertion the whole test exists for. RecordPhotos.tsx:269 warns that
    // entityType must be exactly 'photo' or the row is written under a type the
    // photos query never groups on — invisible from here, and identical on
    // screen, until the page is reloaded and the tag has vanished.
    await page.reload();
    await expect(tag).toBeVisible();
  });
});

test.describe('W360 · archiving from the record', () => {
  test.afterEach(async ({ request }) => { await sweepMade(request); });

  test('Archive from the record asks first, and lands you where the change is visible', async ({ page, request }) => {
    const id = await scratchParcel(request, 'Sy ARCHME');
    const kebab = page.getByRole('button', { name: 'Actions for Sy ARCHME' });
    const item = page.getByRole('menuitem', { name: 'Archive this record' });
    const live = async () => {
      const out = await gql(request, `{ web { properties { cards { id } } } }`);
      return ((out?.data?.web?.properties?.cards ?? []) as { id: string }[]).map((c) => c.id);
    };

    await page.goto(`/app/records/${id}`);
    await kebab.click();
    await expect(item).toBeVisible();
    await item.click();

    const dialog = page.getByRole('dialog');
    // It names the record. "Archive this record?" over a page whose title you
    // may have stopped reading is how the wrong parcel gets archived.
    await expect(dialog.getByRole('heading', { name: 'Archive Sy ARCHME?' })).toBeVisible();
    // And it says what archiving costs and does not cost — the reason an owner
    // can choose it over Delete at all.
    await expect(dialog).toContainText('keep everything filed under them');
    await expect(dialog).toContainText('Archived');

    // Cancel is not a slower yes: the URL stays put and the record stays in the
    // portfolio. RecordPapers.tsx:388 records that this used to fire on one
    // stray menu click, with nothing on screen able to show it had.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/app/records/${id}`);
    expect(await live()).toContain(id);

    await kebab.click();
    await item.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();

    // The record page cannot show the change — `record` reads archived rows too
    // — so confirming has to move you somewhere that can.
    await page.waitForURL('**/app/properties');
    await expect(page.locator('.rec', { hasText: 'Sy ARCHME' })).toHaveCount(0);

    // Reversible, and visibly so: the Archived facet is the way back.
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' })
      .getByRole('button', { name: /^Archived/ }).click();
    const card = page.locator('.rec', { hasText: 'Sy ARCHME' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Archived');
  });
});

test.describe('W360 · asking for a survey', () => {
  /** The GeoJSON checkbox lives alone in the "What to send" card. */
  const sendCard = (page: import('@playwright/test').Page) =>
    page.locator('section.card', { has: page.getByRole('heading', { name: 'What to send' }) });

  test('an unsurveyed record asks for corners to be established, and attaches no boundary', async ({ page }) => {
    await page.goto(`/app/records/${UNSURVEYED}/request?kind=survey`);

    const message = page.getByLabel('Message', { exact: true });
    // The em dash is part of the shipped string (RequestWork.tsx:49); a regex
    // without it silently stops matching the sentence under test.
    await expect(message).toHaveValue(
      /There is no boundary on record yet — please establish the corners on site and send the sheet back\./);
    // The defect this guards: the surveyed opener promises a file that cannot
    // exist on a record with no ring, so the surveyor arrives expecting corners
    // they were told were already attached.
    await expect(message).not.toHaveValue(/attached as a GeoJSON file/);

    const geo = sendCard(page).locator('input[type=checkbox]');
    // A ticked box above a line saying there is no boundary is the state this
    // screen used to ship — while the count, reading the same condition,
    // said nothing was attached.
    await expect(geo).not.toBeChecked();
    await expect(geo).toBeDisabled();
    await expect(sendCard(page)).toContainText('This record has no surveyed boundary yet.');
    await expect(sendCard(page).locator('.cardhead .chip')).toHaveText('0');
    await expect(page.getByText(/Nothing of yours is attached/)).toBeVisible();
  });

  test('a surveyed record still offers its boundary, so the noGeo wording is a branch and not the only opener', async ({ page }) => {
    // The control for the test above. Without it, a regression that showed
    // every record the noGeo copy — the easiest way to "fix" the branch — would
    // pass there and quietly stop attaching boundaries that do exist.
    await page.goto(`/app/records/${PARCEL}/request?kind=survey`);

    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue(/The boundary is attached as a GeoJSON file\./);
    const geo = sendCard(page).locator('input[type=checkbox]');
    await expect(geo).toBeChecked();
    await expect(geo).toBeEnabled();
    await expect(page.getByText(/Nothing of yours is attached/)).toHaveCount(0);
  });
});
