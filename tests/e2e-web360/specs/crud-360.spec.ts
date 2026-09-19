/**
 * W360 · every tab must let you add, read, change and remove.
 *
 * The 360 was drawn before it was wired, and half its controls were decoration
 * — a button with no handler looks identical to a working one until you click
 * it. These tests click. Each one adds something through the real UI, reads it
 * back after a reload (so nothing passes on optimistic state alone), renames
 * it, then removes it and checks it is gone.
 *
 * Every test cleans up after itself: the demo seed asserts exact counts
 * elsewhere in this suite, and a stray row left behind breaks those instead.
 *
 * ADDING IS A DRAWER on every hanger now (the shared w360/Drawer.tsx), which
 * changes the shape of most of the "add" halves below. Three things follow from
 * it and are worth knowing before editing anything here:
 *
 *   · the hidden file pickers on Papers and Media live INSIDE their panels, so
 *     `input[type=file]` is not on the page until the panel is open, and a pick
 *     is no longer a filing — the panel's own primary is what sends it;
 *   · nothing is pre-selected in the Features panel and no chip files on the
 *     press, so a type chip plus the primary is what a chip press used to be on
 *     its own, and the per-card editor is no longer opened afterwards;
 *   · the invitation at the end of the features grid is a
 *     `<button class="card dashed addcard">` that only opens the same panel — it
 *     holds no chips and no name box.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { expect, test, stubDocumentReader } from './harness';

const PARCEL = 'w360-p-214-2';

type Pg = import('@playwright/test').Page;

/** GraphQL straight at the API, for setting a test up and checking what it
 *  actually wrote. The proxy injects the demo identity. */
const gql = (request: import('@playwright/test').APIRequestContext, query: string) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query } })
    .then((r) => r.json());

/** Records a test made, swept whether the test passed or failed.
 *
 *  Every scratch record in this file used to be deleted by a `deleteRecords`
 *  written as the LAST STATEMENT OF THE TEST BODY. Playwright abandons a test
 *  at its first failed assertion, so on failure that line never ran and the
 *  record outlived the spec — and these specs run before screens.spec.ts, which
 *  asserts the seeded totals.
 *
 *  One such leak turned ONE failure into SEVENTEEN: `Sy AUDITME` (5.00 ac)
 *  survived a failure at "the tab is Audit", and from then on the dashboard
 *  read 49.82 acres over 7 parcels where screens.spec.ts:60 expects 44.82 over
 *  6, and `.cards .rec` opened with AUDITME where screens.spec.ts:103 expects
 *  Sy 214/2. Sixteen red tests, one uncleaned row, and nothing naming the row.
 *
 *  global-setup's purge-e2e-records sweeps `rec-` ids, but it runs at the START
 *  of a run — it cleans up after the LAST one rather than preventing the
 *  cascade inside this one. afterEach is what prevents it, because it runs on
 *  the failure path too. The in-body deletes are left where they are: several
 *  tests assert the deletion itself, and a second delete of a gone id is a
 *  no-op. */
const MADE: string[] = [];

/** Register a scratch record for sweeping, and hand the id straight back so a
 *  helper can `return made(id)` without changing shape. */
const made = (id: string): string => { MADE.push(id); return id; };

/** Delete everything registered since the last sweep. Never throws: a failing
 *  cleanup must not turn a passing test red, nor mask the real failure of a
 *  failing one. */
async function sweepMade(request: import('@playwright/test').APIRequestContext): Promise<void> {
  const ids = MADE.splice(0);
  if (!ids.length) return;
  const list = ids.map((id) => JSON.stringify(id)).join(',');
  try {
    await gql(request, `mutation { web { deleteRecords(ids:[${list}]) } }`);
  } catch {
    // Swept on the next run by purge-e2e-records; nothing here is worth failing on.
  }
}

/** Feature cards. The invitation at the end of the grid is a
 *  `<button class="card dashed addcard">` now rather than a dashed `<article>`,
 *  so it falls outside this either way — and it holds no chips and no name box:
 *  it only opens the drawer. */
const cards = (page: Pg) => page.locator('.cards article.card:not(.dashed)');
/** People are stacked cards, not the features grid. */
const people = (page: Pg) => page.locator('.split .stack > article.card');

/** Count only once the list has actually painted — counting a still-empty
 *  React tree gives 0, and every later assertion is then off by that much. */
async function settled(loc: import('@playwright/test').Locator) {
  await loc.first().waitFor({ state: 'visible', timeout: 15_000 });
  return loc.count();
}

test.describe('W360 CRUD · features', () => {
  /** The editor opens over the card it belongs to, so its fields are only
   *  addressable while that card is the one being edited — which is the point:
   *  one open editor at a time, and no chance of typing a spec into the wrong
   *  bore. */
  const editing = (page: Pg) => page.locator('.cards article.card', { has: page.getByLabel('What it is') });
  /** The panel that files one. `exact` on the trigger because the invitation at
   *  the end of the grid opens the same panel and its accessible name starts with
   *  the same three words. */
  const openAdd = async (page: Pg) => {
    await page.getByRole('button', { name: 'Add a feature', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Add a feature' })).toBeVisible();
    return page.getByRole('dialog', { name: 'Add a feature' });
  };

  test('a feature is filed, described, changed and removed', async ({ page }) => {
    const NAME = 'E2E Windmill';
    const RENAMED = 'E2E Windmill renamed';
    await page.goto(`/app/records/${PARCEL}/features`);
    const start = await settled(cards(page));

    // add — through the drawer, by naming something the chip list does not offer.
    // The name box is behind the last chip, "Something else"; the header button
    // no longer scrolls the page to a live form at the end of the grid.
    const panel = await openAdd(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill(NAME);
    // The detail is asked for HERE, before anything is written. It used to be a
    // second write through an editor the chip press opened over the new card, so
    // one feature was two writes in two places.
    await panel.getByLabel('Size, depth, year').fill('18 ft · steel · 2019');
    await panel.getByLabel('Condition', { exact: true }).fill('Blades bent');
    await panel.getByLabel('Note', { exact: true })
      .fill('Down since the cyclone. Not worth repairing.');
    await panel.getByRole('button', { name: 'Broken', exact: true }).click();
    await panel.getByRole('button', { name: 'Add the feature' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a feature' })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(start + 1);

    // read back after a reload — not just optimistic state
    await page.reload();
    const card = cards(page).filter({ hasText: NAME });
    await expect(card).toContainText('18 ft · steel · 2019');
    await expect(card).toContainText('Blades bent');
    await expect(card).toContainText('Down since the cyclone');
    // Broken is drawn as an alert, on the card and in the chip count.
    await expect(card).toHaveClass(/alert/);
    await expect(page.getByRole('button', { name: /^Needs repair/ })).toContainText('3');

    // change everything again, including clearing a field that was filled.
    // An empty box has to mean "delete this", or a typo is permanent.
    await page.locator(`button[aria-label="Edit ${NAME}"]`).first().click();
    await page.getByLabel('Name', { exact: true }).fill(RENAMED);
    await page.getByLabel('Note').fill('');
    await editing(page).getByRole('button', { name: 'Working', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.reload();
    const renamed = cards(page).filter({ hasText: RENAMED });
    await expect(renamed).toBeVisible();
    await expect(page.getByText(NAME, { exact: true })).toHaveCount(0);
    await expect(renamed).not.toContainText('Down since the cyclone');
    await expect(renamed).not.toHaveClass(/alert/);
    // The spec was not sent as empty, so it is still there.
    await expect(renamed).toContainText('18 ft · steel · 2019');

    // remove, behind the second tap
    await page.locator(`button[aria-label="Remove ${RENAMED}"]`).first().click();
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(cards(page)).toHaveCount(start);
    await page.reload();
    await expect(page.getByText(RENAMED, { exact: true })).toHaveCount(0);
  });

  test('the type chips file a feature without typing anything', async ({ page, request }) => {
    await page.goto(`/app/records/${PARCEL}/features`);
    const start = await settled(cards(page));
    // A chip no longer files on the press — nothing is pre-selected and the
    // primary is what commits, so a single unread press cannot file a feature.
    const panel = await openAdd(page);
    await panel.getByRole('button', { name: 'Pond', exact: true }).click();
    await panel.getByRole('button', { name: 'Add the feature' }).click();
    await expect(cards(page)).toHaveCount(start + 1);
    // No Cancel to press afterwards: the panel closes itself, and it no longer
    // leaves an inline editor open over the new card.
    await expect(page.getByRole('dialog', { name: 'Add a feature' })).toHaveCount(0);
    await expect(editing(page)).toHaveCount(0);

    // The name decides the kind. Asked of the API rather than read off the
    // card, because the icon and the chip both come from these two columns
    // and a picture is not proof of what was stored.
    const res = await gql(request, `query { web { features(recordId:"${PARCEL}") {
      features { id label category icon conditionState } } } }`);
    const filed = res.data.web.features.features.find((f: { label: string }) => f.label === 'Pond');
    expect(filed.category).toBe('water');
    expect(filed.icon).toBe('pond');
    // Nobody has looked at it, so it does not claim to be working.
    expect(filed.conditionState).toBe('unknown');
    // Matched on the heading, not on the card's text: "Farm pond" is already
    // on this parcel and a substring match would grade the wrong card.
    const pond = cards(page).filter({ has: page.getByRole('heading', { name: 'Pond', exact: true }) });
    await expect(pond.getByText('Not checked', { exact: true })).toBeVisible();

    await page.locator('button[aria-label="Remove Pond"]').first().click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(cards(page)).toHaveCount(start);
  });

  test('"Not checked" is its own chip, and worst still sorts first', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/features`);
    const start = await settled(cards(page));

    // The seeded parcel has been walked, so nothing on it is unchecked and the
    // chip is absent — a filter leading to an empty list is not offered.
    await expect(page.getByRole('button', { name: /^Not checked/ })).toHaveCount(0);

    // Filed through the drawer, and left on the condition it opens with — "Not
    // checked" is pre-selected there precisely so a feature nobody has stood next
    // to does not start life with a green dot.
    const panel = await openAdd(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill('E2E Unchecked thing');
    await expect(panel.getByRole('button', { name: 'Not checked', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Add the feature' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a feature' })).toHaveCount(0);

    const chip = page.getByRole('button', { name: /^Not checked/ });
    await expect(chip).toContainText('1');
    await chip.click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('E2E Unchecked thing');

    // Back to everything: the page promises worst first, so every alert card
    // must sit above every card that is not one.
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(cards(page)).toHaveCount(start + 1);
    const alerts = await cards(page).evaluateAll(
      (els) => els.map((e) => e.className.includes('alert')));
    expect(alerts.lastIndexOf(true)).toBeLessThan(alerts.indexOf(false));

    await page.locator('button[aria-label="Remove E2E Unchecked thing"]').first().click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(cards(page)).toHaveCount(start);
  });
});

test.describe('W360 CRUD · people', () => {
  test('someone can be assigned, renamed and taken off', async ({ page }) => {
    const NAME = 'E2E Caretaker';
    const RENAMED = 'E2E Caretaker renamed';
    await page.goto(`/app/records/${PARCEL}/people`);
    const start = await settled(people(page));

    await page.getByRole('button', { name: /Assign someone/ }).click();
    // A drawer now, like every other "add a thing" on a record — the inline
    // row-form is gone (RecordPeople.AssignDrawer over Drawer.tsx).
    await page.getByLabel('Their name').fill(NAME);
    await page.getByRole('button', { name: 'Caretaker' }).click();
    await page.getByRole('button', { name: 'Assign them' }).click();
    await expect(people(page)).toHaveCount(start + 1);

    await page.reload();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    await page.locator(`button[aria-label="Rename ${NAME}"]`).first().click();
    await page.getByLabel(`Rename ${NAME}`).fill(RENAMED);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    await expect(page.getByText(RENAMED, { exact: true })).toBeVisible();

    await page.locator(`button[aria-label="Remove ${RENAMED}"]`).first().click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(people(page)).toHaveCount(start);
    await page.reload();
    await expect(page.getByText(RENAMED, { exact: true })).toHaveCount(0);
  });
});

test.describe('W360 CRUD · papers', () => {
  /** Filed papers, not the loading placeholders.
   *
   *  The skeleton draws its rows inside this same `.rows.boxed` card on purpose
   *  — a grey slab stacked above an empty bordered box is two containers where
   *  the answer will be one — and marks them `aria-hidden`, which is what makes
   *  them distinguishable from content. Counting them as rows is how this test
   *  came to measure "3 papers" on a parcel that has twelve: `settled` returns
   *  as soon as the first row is visible, and the first thing visible is a
   *  placeholder. */
  const rows = (page: import('@playwright/test').Page) =>
    page.locator('.rows.boxed > div:not([aria-hidden])');

  test('a paper can be renamed and removed', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}`);
    const start = await settled(rows(page));
    const first = (await rows(page).first().locator('a').textContent())?.trim() ?? '';
    expect(first.length).toBeGreaterThan(0);
    const RENAMED = 'E2E Renamed paper';

    await page.locator(`button[aria-label="Rename ${first}"]`).first().click();
    await page.getByLabel(`Rename ${first}`).fill(RENAMED);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    await expect(page.getByText(RENAMED, { exact: true })).toBeVisible();

    // put the seed back the way it was — other specs assert on these titles
    await page.locator(`button[aria-label="Rename ${RENAMED}"]`).first().click();
    await page.getByLabel(`Rename ${RENAMED}`).fill(first);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    await expect(rows(page)).toHaveCount(start);
    await expect(page.getByText(first, { exact: true }).first()).toBeVisible();
  });

  test('the add control is reachable on a record with nothing filed', async ({ page }) => {
    // The complaint this test exists for: an empty record offered no way in,
    // because the gallery link it would have sent you to is not drawn either.
    await page.goto(`/app/records/${PARCEL}`);
    const addPaper = page.locator('header.sechead').getByRole('button', { name: 'Add a paper' });
    await expect(addPaper).toBeVisible();
    // The picker moved INSIDE the drawer, so there is none on the page until the
    // panel is open — which is the point: a pick used to BE a filing, with nothing
    // shown in between. Counted scoped to the record's own page either way,
    // because the assistant drawer keeps an attachment picker mounted on <body>
    // that has nothing to do with this record.
    await expect(page.locator('main input[type=file]')).toHaveCount(0);
    await addPaper.click();
    await expect(page.getByRole('dialog', { name: 'File a paper' })).toBeVisible();
    await expect(page.locator('main input[type=file]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Photographs are the Media hanger's, one click along the strip. They used
    // to be a card in the Papers rail as well, which was the same gallery and
    // the same picker offered twice on one screen.
    await page.locator('.tabs').getByRole('link', { name: /^Media/ }).click();
    const addPhotos = page.getByRole('button', { name: /Add photos or video/ });
    await expect(addPhotos).toBeVisible();
    await expect(page.locator('main input[type=file]')).toHaveCount(0);
    await addPhotos.click();
    await expect(page.getByRole('dialog', { name: 'Add photos or video' })).toBeVisible();
    await expect(page.locator('main input[type=file]')).toHaveCount(1);
  });
});

test.describe('W360 CRUD · photos', () => {
  test('a caption changes, and the Do panel is wired', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    const box = page.getByLabel('Caption', { exact: true });
    const was = await box.inputValue();

    // The caption saves on blur. Reloading without waiting for that round trip
    // cancels it in flight, and the test then reads the old value back and
    // calls the feature broken.
    const saved = () => page.waitForResponse(
      (r) => r.url().includes('/graphql')
        && (r.request().postData() ?? '').includes('updateCaption'));

    await box.fill('E2E caption');
    await Promise.all([saved(), box.blur()]);
    await page.reload();
    await expect(page.getByLabel('Caption', { exact: true })).toHaveValue('E2E caption');

    await page.getByLabel('Caption', { exact: true }).fill(was);
    await Promise.all([saved(), page.getByLabel('Caption', { exact: true }).blur()]);
    await page.reload();
    await expect(page.getByLabel('Caption', { exact: true })).toHaveValue(was);

    // Pinning and per-photo sharing are not built. The panel says where those
    // jobs live instead of drawing disabled controls that look actionable.
    await expect(page.getByText(/placing one by hand is not built yet/i)).toBeVisible();
    await expect(page.getByText(/Sharing is by record rather than by photo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pin on map' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    // Download needs bytes behind the photo, which the seed does not have.
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('make cover moves the cover to the photo you are on', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    // Photo 1 is already the cover, so its button reads "Cover" and is inert —
    // that is the correct state, not a dead control.
    await expect(page.getByRole('button', { name: 'Cover', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Next photo' }).click();
    const make = page.getByRole('button', { name: 'Make cover' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page.getByRole('button', { name: 'Cover', exact: true })).toBeDisabled();

    // Put the cover back on the first photo, so the suite stays re-runnable.
    await page.getByRole('button', { name: 'Previous photo' }).click();
    await page.getByRole('button', { name: 'Make cover' }).click();
    await expect(page.getByRole('button', { name: 'Cover', exact: true })).toBeDisabled();
  });

  test('delete asks a second time before it takes the photo', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    await page.getByRole('button', { name: /^Delete/ }).first().click();
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep it' }).click();
    // Backing out must leave the gallery exactly as it was.
    await expect(page.getByRole('button', { name: /^Delete/ })).toBeVisible();
  });
});

/**
 * The guard that would have caught the header "Add a feature" button: it was
 * enabled, looked identical to every working control, and did nothing. Static
 * review found it and it still shipped, so this clicks instead of reading.
 *
 * A control earns its place if clicking it changes something a user could see:
 * the DOM, the URL, or a request. Anything that changes none of those is dead
 * and must be `disabled` — which is honest — or wired.
 */
/** A private in-memory byte store for browser upload/read regression.
 * The gateway's auth and storage isolation are covered by gateway tests; this
 * fixture exercises real multipart browser uploads and returns the exact bytes
 * for previews, without connecting to the founder's gateway or bucket. */
async function withStorageFixture(page: import('@playwright/test').Page) {
  const files = new Map<string, { id: string; name: string; mimeType: string; sizeBytes: number; bytes: Buffer }>();
  await page.route('**/api/gateway/storage/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/files') && request.method() === 'POST') {
      const multipart = new Request('http://fixture.invalid/upload', {
        method: 'POST', headers: request.headers(), body: request.postDataBuffer()!,
      });
      const form = await multipart.formData();
      const file = form.get('file') as File;
      expect(file && typeof file.arrayBuffer === 'function').toBeTruthy();
      const node = { id: randomUUID(), name: file.name, mimeType: file.type,
        sizeBytes: file.size, bytes: Buffer.from(await file.arrayBuffer()) };
      files.set(node.id, node);
      await route.fulfill({ json: { id: node.id, name: node.name, mimeType: node.mimeType, sizeBytes: node.sizeBytes } });
      return;
    }
    const content = url.pathname.match(/\/files\/([^/]+)\/content$/);
    const nodeId = content?.[1] || url.pathname.match(/\/nodes\/([^/]+)$/)?.[1];
    const node = nodeId ? files.get(nodeId) : undefined;
    if (content && node) {
      await route.fulfill({ contentType: node.mimeType, body: node.bytes });
    } else if (node && request.method() === 'DELETE') {
      files.delete(node.id); await route.fulfill({ status: 204 });
    } else if (node) {
      if (request.method() === 'PATCH') node.name = request.postDataJSON().name || node.name;
      await route.fulfill({ json: { node: { id: node.id, name: node.name, mimeType: node.mimeType, sizeBytes: node.sizeBytes } } });
    } else if (url.pathname.endsWith('/nodes')) {
      await route.fulfill({ json: { items: [] } });
    } else {
      await route.fulfill({ status: 404, json: { error: 'Fixture file not found' } });
    }
  });
}

test.describe('W360 · upload limits', () => {
  const oversize = {
    name: 'too-big.jpg',
    mimeType: 'image/jpeg',
    // 11 MB of nothing — the cap is on bytes, not on what they decode to.
    buffer: Buffer.alloc(11 * 1024 * 1024, 1),
  };

  /** Open the panel that files a pick, and hand it the files. Both hangers keep
   *  their picker inside the drawer now, so there is nothing to set files on
   *  until it is open. */
  const pickInto = async (page: Pg, trigger: RegExp | string, dialog: RegExp,
                          files: Parameters<import('@playwright/test').Locator['setInputFiles']>[0]) => {
    await page.getByRole('button', { name: trigger }).first().click();
    await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
    await page.locator('main input[type=file]').setInputFiles(files);
  };
  const MEDIA_PANEL = /^Add (photos or video|\d+ files)$/;
  const PAPER_PANEL = /^File (a paper|\d+ papers)$/;

  test('the 10 MB limit is stated where the upload happens', async ({ page }) => {
    // Which is inside the panel on both hangers now. It used to be a note beside
    // a header button that fired the picker directly; the limit belongs where the
    // choosing happens, and it is printed again against each picked file.
    await page.goto(`/app/records/${PARCEL}/photos`);
    await expect(page.getByText(/up to 10\.0 MB/i)).toHaveCount(0);
    await page.getByRole('button', { name: /Add photos or video/ }).click();
    await expect(page.getByRole('dialog', { name: MEDIA_PANEL })
      .getByText(/up to 10\.0 MB/i).first()).toBeVisible();

    await page.goto(`/app/records/${PARCEL}`);
    await expect(page.getByText(/up to 10\.0 MB/i)).toHaveCount(0);
    await page.locator('header.sechead').getByRole('button', { name: 'Add a paper' }).click();
    await expect(page.getByRole('dialog', { name: PAPER_PANEL })
      .getByText(/up to 10\.0 MB/i).first()).toBeVisible();
  });

  test('an oversize file is refused by name, before anything is sent', async ({ page }) => {
    let posted = false;
    page.on('request', (r) => {
      if (r.url().includes('/storage/files') && r.method() === 'POST') posted = true;
    });

    await page.goto(`/app/records/${PARCEL}/photos`);
    // The gallery sits inside the record frame now, so `main header` is the
    // record's own head. The hanger's counts are in its section head.
    const header = page.locator('.sechead');
    await expect(header).toContainText('Photos and video');
    const countWas = await header.innerText();
    await pickInto(page, /Add photos or video/, MEDIA_PANEL, oversize);

    // Named and sized against the file it is about, on its own row in the pick,
    // and the primary refuses while anything in the list is over. That is the
    // same guarantee as the old one-line refusal, said before a press rather
    // than after one.
    const panel = page.getByRole('dialog', { name: MEDIA_PANEL });
    await expect(panel.locator('.rows.boxed > div').filter({ hasText: 'too-big.jpg' }))
      .toContainText('11.0 MB · over the 10.0 MB limit');
    await expect(panel.getByRole('alert')).toContainText('nothing is sent while anything in the list is over the limit');
    await expect(panel.getByRole('button', { name: /^Add (it|\d+ files)$/ })).toBeDisabled();
    // Refused in the browser: the bytes never left, and the gallery is unchanged.
    expect(posted).toBe(false);
    expect(await header.innerText()).toBe(countWas);
  });

  test('the picker takes video as well as stills', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    await page.getByRole('button', { name: /Add photos or video/ }).click();
    await expect(page.getByRole('dialog', { name: MEDIA_PANEL })).toBeVisible();
    // Scoped to the screen. The assistant drawer keeps a file input mounted
    // on <body>, and it is not this hanger's picker.
    await expect(page.locator('main input[type=file]'))
      .toHaveAttribute('accept', 'image/*,video/*');
  });

  test('a filed clip uploads and plays, and is counted as video', async ({ page }) => {
    await withStorageFixture(page);
    await page.goto(`/app/records/${PARCEL}/photos`);
    // The gallery sits inside the record frame now, so `main header` is the
    // record's own head. The hanger's counts are in its section head.
    const header = page.locator('.sechead');
    // The seed files exactly one clip, so the line reads "1 video".
    await expect(header).toContainText('1 video');

    await pickInto(page, /Add photos or video/, MEDIA_PANEL,
                   path.join(__dirname, '..', 'fixtures', 'clip.mp4'));
    // Nothing goes until the primary is pressed — the panel is a moment to look
    // at the pick, not a second picker.
    await page.getByRole('button', { name: /^Add (it|\d+ files)$/ }).click();

    // Counted as video, not miscounted as a still.
    await expect(header).toContainText('2 videos', { timeout: 120_000 });

    // And it has to actually play — an icon standing in for a clip is the
    // thing this change exists to stop.
    const clip = page.locator('.frame video');
    await expect(clip).toBeVisible({ timeout: 30_000 });
    expect(await clip.getAttribute('src')).toMatch(/^blob:/);

    // Put the gallery back: the seed's counts are asserted by other specs.
    await page.getByRole('button', { name: /^Delete/ }).first().click();
    await page.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(header).toContainText('1 video', { timeout: 30_000 });
    await expect(page.locator('.frame video')).toHaveCount(0);
  });
});

test.describe('W360 CRUD · ordering a service', () => {
  // Ordering leaves a work_request that nothing in the UI can delete, so this
  // runs on a record of its own and takes the orders with it.
  let scratch = '';
  test.beforeAll(async ({ request }) => {
    const out = await gql(request, `mutation { web { saveRecord(input:{
      kind:"parcel", title:"Sy ORDER-TEST", classification:"agri", khataNo:"9991",
      village:"E2E Palem", mandal:"E2E Mandal", extent:1, extentUnit:"ac" }) } }`);
    scratch = out?.data?.web?.saveRecord ?? '';
    expect(scratch).not.toBe('');
  });

  test.afterAll(async ({ request }) => {
    if (!scratch) return;
    // Revoke first: a link survives the record it points at, and the Vault
    // specs count links.
    const out = await gql(request, `{ web { vault { links { id subject } } } }`);
    for (const l of (out?.data?.web?.vault?.links ?? []) as { id: string; subject: string }[]) {
      if (l.subject?.includes('ORDER-TEST')) {
        await gql(request, `mutation { web { revokeShareLink(linkId:"${l.id}") } }`);
      }
    }
    await gql(request, `mutation { web { deleteRecords(ids:["${scratch}"]) } }`);
  });

  test('a kind the system does not sell is refused, not filed', async ({ request }) => {
    // 'inspection' is not one of the four services; filing it produced an order
    // with an invented title, no price, and a note naming the wrong screen.
    const bad = await gql(request,
      `mutation { web { orderService(recordIds:["${scratch}"], kind:"inspection") } }`);
    expect(bad?.data?.web?.orderService).toBe(0);

    const orders = await gql(request, `{ web { orders(recordId:"${scratch}"){ id } } }`);
    expect(orders?.data?.web?.orders ?? []).toEqual([]);
  });

  test('ordering happens on its own screen, and comes back', async ({ page, request }) => {
    await page.goto(`/app/records/${scratch}`);
    await page.getByRole('link', { name: 'Order a service' }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${scratch}/order$`));

    // The catalogue is searched server-side, so it can grow past what would
    // ever fit on a record header.
    await page.getByLabel('Search services').fill('survey');
    await expect(page.getByRole('button', { name: 'Boundary re-survey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Certified patta copy' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Boundary re-survey' }).click();

    // Ordering stays shut until that service's own required questions are
    // answered — an order with no parameters cannot be acted on.
    const submit = page.getByRole('button', { name: /^Order ·/ });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/Which boundary/).selectOption('North');
    await page.getByLabel(/Is a neighbour disputing it/).selectOption('Yes');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Back on the record it was ordered against, not stranded in a form.
    await expect(page).toHaveURL(new RegExp(`/records/${scratch}/services$`));

    const out = await gql(request, `{ web { orders(recordId:"${scratch}"){ kind cost params } } }`);
    const orders = (out?.data?.web?.orders ?? []) as
      { kind: string; cost: number; params: string }[];
    const survey = orders.find((o) => o.kind === 'survey');
    expect(survey, 'the survey order was not filed').toBeTruthy();
    expect(survey!.cost).toBe(2900);
    // The answers are stored with the order, not thrown away.
    expect(JSON.parse(survey!.params)).toMatchObject({ which_side: 'North', dispute: 'Yes' });
  });

  test('Track order shows where it is and what was asked for', async ({ page }) => {
    await page.goto(`/app/records/${scratch}/services`);
    await page.getByRole('button', { name: 'Track order' }).first().click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
    // The parameters come back out in words, not as raw JSON.
    await expect(page.getByText('Which side')).toBeVisible();
  });

  test('Share securely needs a name, then makes a link', async ({ page, request }) => {
    await page.goto(`/app/records/${scratch}`);
    await page.getByRole('button', { name: 'Share securely' }).click();

    // A link nobody is named on cannot be revoked with any confidence about
    // who loses access, so the button stays shut until someone is named.
    const submit = page.getByRole('button', { name: 'Share', exact: true });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Who is it for').fill('E2E Buyer');
    await expect(submit).toBeEnabled();
    await submit.click();
    // Keep the actual recipient link visible until it has been copied.
    await expect(page.getByLabel('Who is it for')).toHaveCount(0);
    await expect(page.getByLabel('Recipient link')).toHaveValue(/\/share\/[A-Za-z0-9_-]{43}$/);

    const out = await gql(request, `{ web { vault { links { audience subject } } } }`);
    const links = (out?.data?.web?.vault?.links ?? []) as { audience: string }[];
    expect(links.some((l) => l.audience === 'E2E Buyer')).toBe(true);
  });

  test('Ask for a check files a priced site visit', async ({ page, request }) => {
    await page.goto(`/app/records/${scratch}/features`);
    await page.getByRole('button', { name: /Ask for a check/ }).click();
    await page.getByRole('button', { name: /^Order ·/ }).click();
    await expect(page.getByRole('link', { name: /Open ordered check/ })).toBeVisible();

    const out = await gql(request,
      `{ web { orders(recordId:"${scratch}"){ kind title cost } } }`);
    // Other tests in this block order against the same record, so look for
    // this one rather than assuming it is the only order filed.
    const orders = (out?.data?.web?.orders ?? []) as
      { kind: string; title: string; cost: number }[];
    const visit = orders.find((o) => o.kind === 'site_visit');
    expect(visit, 'the site visit was not filed').toBeTruthy();
    expect(visit!.title).toBe('Site visit');
    // A real service, at the price it is actually sold at — not ₹0.
    expect(visit!.cost).toBeGreaterThan(0);
  });
});

test.describe('W360 · adding a record from a document', () => {
  /** The reader is an AI call that costs money on every invocation, so the
   *  suite never makes a real one. What is under test is the wiring: which
   *  boxes get filled, which are left alone, and that nothing is written
   *  until a person presses the button. */
  const stubReader = stubDocumentReader;

  const openDrawer = async (page: Pg) => {
    await page.goto('/app/properties');
    // 'Add a record' is the empty-state button; the one that is always there
    // is labelled just 'Add'.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('aside.drawer')).toBeVisible();
  };

  const deed = {
    name: 'sale-deed.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 not a real deed'),
  };

  test('the drawer opens on the document, not on the form', async ({ page }) => {
    await openDrawer(page);
    // The scan IS the screen. Twelve empty boxes are not.
    await expect(page.getByText('Start from the paper')).toBeVisible();
    await expect(page.locator('#rd-title')).toHaveCount(0);
    // The shared shell pins the footer, so the primary is on screen from the
    // start — but it refuses, and says why, rather than being absent. Cancel
    // being always reachable is the point of pinning it.
    await expect(page.getByRole('button', { name: 'Add record' })).toBeDisabled();
    await expect(page.getByText('Read the deed above, or open the form to fill it in by hand.'))
      .toBeVisible();

    await page.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await expect(page.locator('#rd-title')).toBeVisible();
    // And the document half does not go away when the form arrives.
    await expect(page.getByText('Start from the paper')).toBeVisible();
  });

  test('a read deed opens the form by itself', async ({ page }) => {
    await stubReader(page, { survey_no: 'Sy 909/4', village: 'Nallapadu' });
    await openDrawer(page);
    await expect(page.locator('#rd-title')).toHaveCount(0);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);
    // Nobody has to go and find the form: the next thing to do is check it.
    await expect(page.locator('#rd-title')).toHaveValue('Sy 909/4');
  });

  test('a read deed fills the empty boxes', async ({ page }) => {
    // These are the reader's own keys, from the extraction prompt in main.py:
    // a khata is `pattadar_no`, and the buyer is a row in `parties`. The stub
    // used to invent `khata_no` and `buyer`, so this test passed while both
    // boxes stayed empty on every real document.
    await stubReader(page, {
      doc_type: 'Sale Deed', survey_no: 'Sy 909/3', pattadar_no: '7712',
      parties: [{ role: 'seller', name: 'B. Venkataramaiah' },
                { role: 'buyer', name: 'K. Ramanamma' }],
      village: 'Nallapadu', mandal: 'Guntur',
      district: 'Guntur', extent: 'Ac 2.50 Cents', consideration: '31,00,000',
    });
    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);

    await expect(page.locator('#rd-title')).toHaveValue('Sy 909/3');
    await expect(page.locator('#rd-khata')).toHaveValue('7712');
    await expect(page.locator('#rd-owner')).toHaveValue('K. Ramanamma');
    await expect(page.locator('#rd-village')).toHaveValue('Nallapadu');
    await expect(page.locator('#rd-mandal')).toHaveValue('Guntur');
    // Prose figures are reduced to the number the form stores.
    await expect(page.locator('#rd-extent')).toHaveValue('2.5');
    // The money boxes format as you look at them; ₹31,00,000 is 3,100,000 in
    // the Indian grouping this app uses everywhere.
    await expect(page.locator('#rd-paid')).toHaveValue('₹31,00,000');
    // And it says what it did, rather than silently rewriting the form.
    await expect(page.getByText(/From sale-deed\.pdf: filled the/)).toBeVisible();
  });

  test('a vernacular extent is read, and lands in its own unit', async ({ page }) => {
    // "418-1/2" is 418 and a half, not 418.12 — and it is square YARDS, so
    // writing it into the acres this form defaults to would be the same
    // figure over four thousand times as much land.
    await stubReader(page, { survey_no: 'Sy 909/5', extent: '418-1/2 sq. yards' });
    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);

    await expect(page.locator('#rd-extent')).toHaveValue('418.5');
    await expect(page.getByText('Extent · Sq.yd')).toBeVisible();
  });

  test('an extent this form has no box for fills nothing', async ({ page }) => {
    // 40 guntas is one acre. Filed as "40" under acres it is forty.
    await stubReader(page, { survey_no: 'Sy 909/6', extent: '40 guntas' });
    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);

    await expect(page.locator('#rd-title')).toHaveValue('Sy 909/6');
    await expect(page.locator('#rd-extent')).toHaveValue('');
  });

  test('it never overwrites what a person already typed', async ({ page }) => {
    await stubReader(page, { survey_no: 'Sy 909/3', village: 'Nallapadu' });
    await openDrawer(page);
    await page.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await page.locator('#rd-title').fill('Sy MINE/1');
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);

    await expect(page.locator('#rd-title')).toHaveValue('Sy MINE/1');
    await expect(page.locator('#rd-village')).toHaveValue('Nallapadu');
  });

  test('reading writes nothing until the record is saved', async ({ page, request }) => {
    await stubReader(page, { survey_no: 'Sy NEVERSAVED/9', village: 'Ghost' });
    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);
    await expect(page.locator('#rd-title')).toHaveValue('Sy NEVERSAVED/9');

    await page.getByRole('button', { name: 'Cancel' }).click();
    const out = await gql(request, `{ web { properties { cards { title } } } }`);
    const titles = ((out?.data?.web?.properties?.cards ?? []) as { title: string }[])
      .map((c) => c.title);
    expect(titles.some((t) => t.includes('NEVERSAVED'))).toBe(false);
  });

  test('the deed the record was read from is filed with it', async ({ page, request }) => {
    await stubReader(page, {
      doc_type: 'Sale Deed', document_no: '4411', reg_year: '2019',
      registration_date: '02/02/2019', sro: 'SRO Guntur',
      survey_no: 'Sy FILED/7', village: 'Nallapadu',
    });
    // Storage is a separate gateway with its own auth, and what is under test
    // is the wiring — so the bytes stop here and only the node id travels on.
    await page.route('**/storage/files*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
                      body: JSON.stringify({ id: 'stub-node-e2e', name: 'sale-deed.pdf',
                                             sizeBytes: 24, mimeType: 'application/pdf' }) }));

    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);
    await expect(page.locator('#rd-title')).toHaveValue('Sy FILED/7');
    await page.getByRole('button', { name: 'Add record' }).click();
    await expect(page.locator('aside.drawer')).toHaveCount(0);

    // A scan that produced a record and threw the paper away was the bug on
    // the phone too: the record then reported no documents about the very
    // document it had been made from.
    const out = await gql(request, `{ web { properties { cards { id title } } } }`);
    const made = ((out?.data?.web?.properties?.cards ?? []) as { id: string; title: string }[])
      .find((c) => c.title === 'Sy FILED/7');
    expect(made).toBeTruthy();

    const filed = await gql(request, `{ web { papers(recordId:"${made!.id}") { title detail } } }`);
    const papers = (filed?.data?.web?.papers ?? []) as { title: string; detail: string }[];
    // Named the way the register names it, not after the file on disk.
    expect(papers.map((x) => x.title)).toContain('Sale Deed 4411/2019');

    await gql(request, `mutation { web { deleteRecords(ids:["${made!.id}"]) } }`);
  });

  test('an unreadable file says so and leaves the form alone', async ({ page }) => {
    await stubDocumentReader(page, {}, 'This file could not be read.');
    await openDrawer(page);
    await page.locator('aside.drawer input[type=file]').setInputFiles(deed);
    await expect(page.getByText(/could not be read. Fill the form in by hand/)).toBeVisible();
    await expect(page.locator('#rd-title')).toHaveValue('');
  });
});

test.describe('W360 · ordering with no record chosen', () => {
  test('Services sends you to ordering, not to the properties list', async ({ page }) => {
    await page.goto('/app/services');
    await page.getByRole('link', { name: 'Order a service' }).click();
    // It used to dump you on /app/properties to go and find one yourself.
    await expect(page).toHaveURL(/\/app\/order$/);
    await expect(page.getByRole('heading', { name: 'Which property?' })).toBeVisible();
  });

  test('the property is linked before the service is raised', async ({ page, request }) => {
    await page.goto('/app/order');

    // No property, no order: the service form is not even offered yet.
    await expect(page.getByRole('heading', { name: 'Pick a service' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Order ·/ })).toHaveCount(0);

    await page.getByLabel('Search your properties').fill('214/2');
    await page.getByRole('button', { name: 'Sy 214/2', exact: true }).click();

    // Chosen, named, and kept in the URL so a reload does not lose it.
    await expect(page.getByRole('heading', { name: 'Ordering against' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`record=${PARCEL}`));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ordering against' })).toBeVisible();

    await page.getByLabel('Search services').fill('patta');
    await page.getByRole('button', { name: 'Certified patta copy' }).click();
    await page.getByLabel(/How many copies/).fill('2');

    // Property information can ride along, and only what is ticked.
    const share = page.getByRole('heading', { name: 'Send them what you have' }).locator('../..');
    await share.locator('input[type=checkbox]').first().check();

    await page.getByRole('button', { name: /^Order ·/ }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${PARCEL}/services$`));

    const out = await gql(request, `{ web { orders(recordId:"${PARCEL}"){ kind params } } }`);
    const orders = (out?.data?.web?.orders ?? []) as { kind: string; params: string }[];
    const made = orders.find((o) => o.kind === 'patta_copy');
    expect(made, 'the order was not filed against the chosen property').toBeTruthy();
    const answers = JSON.parse(made!.params);
    expect(answers.copies).toBe('2');
    // What was shared is named in the order, not just counted.
    expect(String(answers.shared ?? '').length).toBeGreaterThan(0);
  });

  test('changing your mind about the property clears the choice', async ({ page }) => {
    await page.goto(`/app/order?record=${PARCEL}`);
    await expect(page.getByRole('heading', { name: 'Ordering against' })).toBeVisible();
    await page.getByRole('button', { name: 'Change' }).click();
    await expect(page.getByRole('heading', { name: 'Which property?' })).toBeVisible();
    await expect(page).not.toHaveURL(/record=/);
  });
});

test.describe('W360 · a filed paper is classified, not just named', () => {
  test.afterEach(async ({ request }) => { await sweepMade(request); });

  const stubReader = stubDocumentReader;

  const pdf = {
    name: 'Family Partitions.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 not a real deed'),
  };

  /** Pick a scan and send it. The picker lives inside the drawer now, so the
   *  panel has to be opened first and the pick is not uploaded until the primary
   *  is pressed — a pick used to be a filing with nothing shown in between. On a
   *  record with no papers there are two "Add a paper" buttons, the section
   *  head's and the empty state's, and either opens this panel. */
  const filePaper = async (
    page: Pg,
    file: Parameters<import('@playwright/test').Locator['setInputFiles']>[0],
  ) => {
    await page.locator('header.sechead').getByRole('button', { name: 'Add a paper' }).click();
    const panel = page.getByRole('dialog', { name: /^File (a paper|\d+ papers)$/ });
    await expect(panel).toBeVisible();
    await page.locator('main input[type=file]').first().setInputFiles(file);
    await panel.getByRole('button', { name: /^File (the paper|\d+ papers)$/ }).click();
  };

  const scratch = async (request: import('@playwright/test').APIRequestContext) => {
    const out = await gql(request, `mutation { web { saveRecord(input:{kind:"parcel",
      title:"Sy FILEME", classification:"agri", khataNo:"4242",
      village:"E2E Palem", mandal:"E2E Mandal", extent:2, extentUnit:"ac" }) } }`);
    const id = out?.data?.web?.saveRecord ?? '';
    expect(id).not.toBe('');
    return made(id);
  };

  test('it is filed the way the register names it, on the right shelf', async ({ page, request }) => {
    await withStorageFixture(page);
    const id = await scratch(request);
    await stubReader(page, {
      doc_type: 'Partition Deed', document_no: '853', reg_year: '2025',
      registration_date: '26/08/2013', sro: 'SRO Tarlupadu', village: 'Konakanamitla',
    });
    await page.goto(`/app/records/${id}`);
    await filePaper(page, pdf);

    // Not "Family Partitions.pdf / Filed today / Unsorted".
    const row = page.locator('.rows.boxed > div').first();
    await expect(row).toContainText('Partition Deed 853/2025');
    await expect(row).toContainText('Registered 26/08/2013 · SRO Tarlupadu');
    await expect(row).toContainText('Title');
    await expect(row).not.toContainText('Unsorted');

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('an EC lands on the search shelf, a map on the map shelf', async ({ page, request }) => {
    await withStorageFixture(page);
    const id = await scratch(request);
    await stubReader(page, { doc_type: 'Encumbrance Certificate', document_no: '', reg_year: '' });
    await page.goto(`/app/records/${id}`);
    await filePaper(page, pdf);
    await expect(page.locator('.rows.boxed > div').first())
      .toContainText('Encumbrance Certificate');
    await expect(page.locator('.rows.boxed > div').first()).toContainText('Search & tax');

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('a reader that is down still files the paper, under its own name', async ({ page, request }) => {
    await withStorageFixture(page);
    const id = await scratch(request);
    await stubDocumentReader(page, {}, 'This file could not be read.');
    await page.goto(`/app/records/${id}`);
    await filePaper(page, pdf);

    // Filed and findable.
    const row = page.locator('.rows.boxed > div').first();
    // The gateway suffixes a name it has seen before ("… (3).pdf"), so match
    // the stem rather than the exact filename.
    await expect(row).toContainText(/Family Partitions.*\.pdf/);
    await expect(row).toContainText('Unsorted');
    // Being HONEST about not having been read is a separate claim, and one the
    // panel currently swallows — see the test below.
    await expect(page.locator('.toast')).toContainText('The paper is filed.');

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('a paper that could not be read says so, because it needs sorting by hand', async ({ page, request }) => {
    // DEFECT · PaperDrawer.file() (RecordPapers.tsx) sets `err` to "… was filed,
    // but could not be read — it is in Unsorted. Everything else went in." and
    // then, in the same `finally`, sees `done === picked.length` and calls
    // `onClose()`. The panel is unmounted with the message still in its state, so
    // the sentence is unreachable: the owner gets the green confirmation toast and
    // nothing saying a paper is sitting in Unsorted waiting to be shelved. The
    // comment on that `finally` promises the opposite — "The panel stays open when
    // something was left behind" — and an unread paper is something left behind
    // even when every byte went up. Owed: hold the panel open on an err, or carry
    // the sentence out onto the page.
    test.fail();
    await withStorageFixture(page);
    const id = await scratch(request);
    await stubDocumentReader(page, {}, 'This file could not be read.');
    await page.goto(`/app/records/${id}`);
    await filePaper(page, pdf);

    await expect(page.getByText(/could not be read — it is in Unsorted/)).toBeVisible();

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });
});

test.describe('W360 · correcting a record', () => {
  test.afterEach(async ({ request }) => { await sweepMade(request); });

  const make = async (request: import('@playwright/test').APIRequestContext) => {
    const out = await gql(request, `mutation { web { saveRecord(input:{kind:"parcel",
      title:"Sy AUDITME", classification:"agri", khataNo:"5150",
      village:"Oldvillage", mandal:"Oldmandal", district:"Olddistrict",
      extent:5, extentUnit:"ac" }) } }`);
    const id = out?.data?.web?.saveRecord ?? '';
    expect(id).not.toBe('');
    return made(id);
  };

  test('the address can be changed from the record itself', async ({ page, request }) => {
    const id = await make(request);
    await page.goto(`/app/records/${id}`);

    // The way in: the record's own kebab, not a trip back to the list.
    await page.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const drawer = page.locator('aside.drawer');
    await expect(drawer).toBeVisible();

    // It opens holding what the record actually says.
    await expect(drawer.locator('#rd-village')).toHaveValue('Oldvillage');
    await drawer.locator('#rd-village').fill('Newvillage');
    await drawer.locator('#rd-district').fill('Newdistrict');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(async () => {
      const o = await gql(request, `{ web { record(id:"${id}"){ village district } } }`);
      return o?.data?.web?.record;
    }).toMatchObject({ village: 'Newvillage', district: 'Newdistrict' });

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('every correction is kept, with what the value used to be', async ({ page, request }) => {
    const id = await make(request);
    await gql(request, `mutation { web { saveRecord(input:{id:"${id}", village:"Corrected"}) } }`);
    await gql(request, `mutation { web { saveRecord(input:{id:"${id}", title:"Sy AUDITME/2"}) } }`);

    await page.goto(`/app/records/${id}/history`);
    await expect(page.getByRole('heading', { name: 'What has been changed' })).toBeVisible();

    // The old value is the point of the line — it must survive the edit.
    const rows = page.locator('.rows.boxed > div');
    await expect(rows).toHaveCount(2);
    const village = rows.filter({ hasText: 'Oldvillage' });
    await expect(village).toContainText('Oldvillage');
    await expect(village).toContainText('Corrected');
    await expect(rows.filter({ hasText: 'Survey number' })).toHaveCount(1);

    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('the tab is Audit, and says so when nothing has changed', async ({ page, request }) => {
    const id = await make(request);
    await page.goto(`/app/records/${id}`);
    const strip = page.locator('.tabs').first();
    await expect(strip.getByRole('link', { name: 'Audit' })).toBeVisible();
    await expect(strip.getByRole('link', { name: 'History' })).toHaveCount(0);

    await page.goto(`/app/records/${id}/history`);
    await expect(page.getByText(/Nothing has been corrected on this record yet/)).toBeVisible();
    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });

  test('re-sending an unchanged value is not logged as a correction', async ({ request }) => {
    const id = await make(request);
    // Saving a form re-sends every field. Only what moved is a correction;
    // otherwise the trail fills with noise and hides the real changes.
    await gql(request, `mutation { web { saveRecord(input:{id:"${id}",
      village:"Oldvillage", mandal:"Oldmandal", district:"Olddistrict" }) } }`);
    const out = await gql(request, `{ web { corrections(recordId:"${id}"){ field } } }`);
    expect(out?.data?.web?.corrections ?? []).toHaveLength(0);
    await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  });
});

test.describe('W360 · deleting records', () => {
  test.afterEach(async ({ request }) => { await sweepMade(request); });

  /** A throwaway record, so the demo counts other specs assert stay put. */
  const make = async (request: import('@playwright/test').APIRequestContext, name: string) => {
    const out = await gql(request, `mutation { web { saveRecord(input:{kind:"parcel",
      title:"Sy ${name}", classification:"agri", khataNo:"998",
      village:"E2E Palem", mandal:"E2E Mandal", extent:1, extentUnit:"ac" }) } }`);
    const id = out?.data?.web?.saveRecord ?? '';
    expect(id, `could not create ${name}`).not.toBe('');
    return made(id);
  };

  test('the select boxes are visible without hovering', async ({ page }) => {
    // They used to be opacity:0 until hover. On a touch screen there is no
    // hover, so nothing could be selected and the bulk Delete — which only
    // appears once something is — could never be reached at all.
    await page.goto('/app/properties');
    const box = page.locator('.rec .sel').first();
    await expect(box).toBeVisible();
    expect(Number(await box.evaluate((el) => getComputedStyle(el).opacity)))
      .toBeGreaterThan(0);
  });

  test('several records can be selected and deleted at once', async ({ page, request }) => {
    const ids = [await make(request, 'DELME-A'), await make(request, 'DELME-B')];
    await page.goto('/app/properties?q=DELME');
    await expect(page.locator('.rec')).toHaveCount(2);

    for (const i of [0, 1]) {
      const card = page.locator('.rec').nth(i);
      await card.hover();
      await card.locator('.sel input').check();
    }
    await expect(page.locator('.bulkbar')).toContainText('2 records selected');

    await page.getByRole('button', { name: 'Delete…' }).click();
    await expect(page.getByRole('heading', { name: 'Delete 2 records?' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.rec')).toHaveCount(0);

    // Gone from the database, not just from the screen.
    const out = await gql(request, `{ web { properties { cards { id } } } }`);
    const live = ((out?.data?.web?.properties?.cards ?? []) as { id: string }[]).map((c) => c.id);
    for (const id of ids) expect(live).not.toContain(id);
  });

  test('the bulk bar is not there to be read until there is a selection to act on', async ({ page }) => {
    await page.goto('/app/properties');
    // It used to stand under the grid at all times explaining itself — "Select
    // cards to act on several at once — tag, order one service for all,
    // archive, or delete." — while its buttons acted on everything shown. A
    // sentence that describes a control is the control failing to describe
    // itself, and these buttons were worse than that: they promised work on
    // records nobody had picked.
    await expect(page.locator('.bulkbar')).toHaveCount(0);
    await expect(page.getByText('or delete')).toHaveCount(0);

    await page.locator('.rec .sel input').first().check();
    const bar = page.locator('.bulkbar');
    await expect(bar).toContainText('1 record selected');
    await expect(bar.getByRole('button', { name: 'Delete…' })).toBeVisible();
  });

  test('the record kebab is a menu over the page, and can delete', async ({ page, request }) => {
    const id = await make(request, 'MENUME');
    await page.goto(`/app/records/${id}`);

    await page.getByRole('button', { name: /Actions for/ }).click();

    const menu = page.locator('.menu-list');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Edit details');
    await expect(menu).toContainText('See what changed');
    await expect(menu).toContainText('Delete this record');
    // It floats over the page instead of being part of it. Measuring heights
    // was too loose — data still arriving moves them too — so this asks the
    // question directly: the list is portalled OUT of <main>, and positioned.
    expect(await menu.evaluate((el) => !!el.closest('main'))).toBe(false);
    expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

    await page.getByRole('menuitem', { name: 'Delete this record' }).click();
    await expect(page.getByRole('heading', { name: /^Delete Sy MENUME\?$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Deleting the record you are looking at must not strand you on it.
    await expect(page).toHaveURL(/\/app\/properties$/);
    const out = await gql(request, `{ web { properties { cards { id } } } }`);
    expect(((out?.data?.web?.properties?.cards ?? []) as { id: string }[]).map((c) => c.id))
      .not.toContain(id);
  });

  test('Escape closes the kebab without acting', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}`);
    await page.getByRole('button', { name: /Actions for/ }).click();
    await expect(page.locator('.menu-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-list')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Delete/ })).toHaveCount(0);
  });
});

test.describe('W360 · requesting work on a record', () => {
  test('Order a survey opens the request page, not a dead button', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/map`);
    await page.getByRole('link', { name: 'Order a survey' }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${PARCEL}/request\\?kind=survey$`));
    await expect(page.getByRole('heading', { name: 'Ask a surveyor' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue(/Hey dear surveyor, please do the survey for this location/);
  });

  test('the owner raises a request; it is placed and unassigned', async ({ page, request }) => {
    await page.goto(`/app/records/${PARCEL}/request?kind=survey`);

    // Nothing is sent anywhere by the owner — no link, no attachment leaves.
    await expect(page.getByRole('button', { name: /WhatsApp/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Send by email/ })).toHaveCount(0);

    await page.getByLabel('Message', { exact: true }).fill('E2E please survey the north boundary');
    await page.getByRole('button', { name: 'Create request' }).click();
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveAttribute('href', /\/app\/services\/wr-/);
    await page.getByRole('button', { name: 'Back to Services' }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${PARCEL}/services$`));

    const out = await gql(request, `{ web { orders(recordId:"${PARCEL}"){
      id kind stageLabel assignee detail params } } }`);
    const orders = (out?.data?.web?.orders ?? []) as
      { id: string; kind: string; stageLabel: string; assignee: string; detail: string; params: string }[];
    const made = orders.find((o) => o.detail.includes('E2E please survey'));
    expect(made, 'the request was not filed').toBeTruthy();
    // Placed, with nobody on it: assignment is somebody else's act.
    expect(made!.stageLabel).toBe('Placed');
    expect(made!.assignee).toBe('');
    // Who asked is recorded, because a request nobody owns cannot be answered.
    expect(JSON.parse(made!.params).requester).toBe('the owner');

  });

  test('what the owner ticks is what the request carries', async ({ page, request }) => {
    await page.goto(`/app/records/${PARCEL}/request?kind=survey`);
    // The boundary is on by default; papers are not, because papers name people.
    const papers = page.getByRole('heading', { name: 'Papers' }).locator('../..');
    await expect(papers.locator('input[type=checkbox]').first()).not.toBeChecked();
    await papers.locator('input[type=checkbox]').first().check();

    await page.getByLabel('Message', { exact: true }).fill('E2E ticked a paper');
    await page.getByRole('button', { name: 'Create request' }).click();
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveAttribute('href', /\/app\/services\/wr-/);
    await page.getByRole('button', { name: 'Back to Services' }).click();
    await expect(page).toHaveURL(new RegExp(`/services$`));

    const out = await gql(request, `{ web { orders(recordId:"${PARCEL}"){ detail params } } }`);
    const made = ((out?.data?.web?.orders ?? []) as { detail: string; params: string }[])
      .find((o) => o.detail.includes('E2E ticked a paper'));
    const shared = JSON.parse(made!.params).shared as string;
    expect(shared).toContain('the boundary as GeoJSON');
    // Exactly one paper, because exactly one was ticked.
    expect(shared.split(',').length).toBe(2);
    const manifest = JSON.parse(made!.params).attachment_manifest;
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0]).toMatchObject({ kind: 'document' });
    expect(manifest.items[0].id).toBeTruthy();
    expect(manifest.boundary.geometry.type).toBe('Polygon');
  });

  test('a request with no message is refused', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/request?kind=survey`);
    await page.getByLabel('Message', { exact: true }).fill('');
    await expect(page.getByRole('button', { name: 'Create request' })).toBeDisabled();
  });

  test('an unassigned request can be put on somebody', async ({ page, request }) => {
    const out = await gql(request, `mutation { web { createRequest(recordId:"${PARCEL}",
      kind:"survey", message:"E2E assign me", requester:"the owner", shared:"") } }`);
    const rid = out?.data?.web?.createRequest ?? '';
    expect(rid).not.toBe('');

    await page.goto(`/app/records/${PARCEL}/services`);
    // Open THIS request's panel, not whichever happens to be first.
    const row = page.locator('.rows.boxed > div').filter({ hasText: 'E2E assign me' });
    await row.getByRole('button', { name: 'Track order' }).click();

    const picker = page.locator(`#as-${rid}`);
    await expect(picker).toBeVisible();
    const names = await picker.locator('option').allInnerTexts();
    expect(names.length, 'nobody available to assign to').toBeGreaterThan(1);
    await picker.selectOption({ index: 1 });

    // Placed → Assigned, with a name on it.
    await expect.poll(async () => {
      const o = await gql(request, `{ web { orders(recordId:"${PARCEL}"){ id assignee stageLabel } } }`);
      return ((o?.data?.web?.orders ?? []) as { id: string; assignee: string; stageLabel: string }[])
        .find((x) => x.id === rid);
    }).toMatchObject({ stageLabel: 'Assigned' });
  });
});

test.describe('W360 · no enabled button is dead', () => {
  // This clicks EVERY button, and some of them file a feature. Run it on the
  // seeded record and it leaves sixteen behind, which breaks every spec that
  // asserts "14 features". So it gets a record of its own, and takes it with
  // it on the way out.
  let scratch = '';

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/gateway/pattadar/graphql', {
      data: { query: `mutation { web { saveRecord(input:{
        kind:"parcel", title:"Sy CRUD-GUARD", classification:"agri",
        khataNo:"9990", village:"E2E Palem", mandal:"E2E Mandal",
        extent:1, extentUnit:"ac" }) } }` },
    });
    scratch = (await res.json())?.data?.web?.saveRecord ?? '';
    expect(scratch, 'scratch record was not created').not.toBe('');
  });

  test.afterAll(async ({ request }) => {
    if (!scratch) return;
    await request.post('/api/gateway/pattadar/graphql', {
      data: { query: `mutation { web { deleteRecords(ids:["${scratch}"]) } }` },
    });
  });

  for (const [surface, path] of [
    ['features', '/features'],
    ['people', '/people'],
  ] as const) {
    test(`${surface} · every enabled button does something`, async ({ page }) => {
      // One reload per button, and a feature-rich record has forty of them.
      test.setTimeout(180_000);
      const ready = async () => {
        // networkidle first: every click here files something, which
        // invalidates the whole query tree, and under full-suite load that
        // refetch outlasts a bare locator wait.
        await page.goto(`/app/records/${scratch}${path}`, { waitUntil: 'networkidle' });
        // Scoped to main, not the shell: a sidebar button satisfies a bare
        // wait instantly while the page itself is still a spinner. Counting
        // then finds nothing and the test passes by measuring nothing.
        await page.locator('main button:not([disabled])').first()
          .waitFor({ timeout: 30_000 })
          .catch(() => { throw new Error(`${surface}: no enabled button at ${page.url()}`); });
      };
      await ready();

      const total = await page.locator('main button:not([disabled])').count();
      expect(total).toBeGreaterThan(0);
      const dead: string[] = [];

      for (let i = 0; i < total; i++) {
        const btn = page.locator('main button:not([disabled])').nth(i);
        if (!(await btn.isVisible().catch(() => false))) continue;
        // A filter chip that is already the active one has nothing to change.
        if ((await btn.getAttribute('aria-pressed')) === 'true') continue;
        const label = ((await btn.getAttribute('aria-label'))
          ?? (await btn.textContent()) ?? '').trim().slice(0, 30) || '(icon)';

        const beforeHtml = await page.locator('main').innerHTML();
        const beforeUrl = page.url();
        let requested = false;
        const watch = () => { requested = true; };
        page.on('request', watch);
        await btn.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(350);
        page.off('request', watch);

        const changed = requested
          || page.url() !== beforeUrl
          || (await page.locator('main').innerHTML().catch(() => '')) !== beforeHtml;
        if (!changed) dead.push(label);

        // Reload only when the click actually moved something. A dead control
        // left the page exactly as it was, so there is nothing to reset — and
        // reloading after all forty turns a fast check into a timeout.
        if (changed) await ready();
      }

      expect(dead, `dead controls on ${surface}: ${dead.join(', ')}`).toEqual([]);
    });
  }
});

test.describe('W360 · no control lies about being clickable', () => {
  // A button with no handler is indistinguishable from a working one. Anything
  // still unbuilt must be disabled, so the page never invites a dead click.
  for (const [name, path] of [
    ['papers', ''], ['features', '/features'], ['people', '/people'],
    ['photos', '/photos'], ['money', '/money'], ['expenses', '/expenses'],
  ] as const) {
    test(`${name} · every enabled button responds`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`/app/records/${PARCEL}${path}`);
      await expect(page.locator('main')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('W360 · village maps', () => {
  // The department's older exports split a village in two: the shapes in one
  // file, their plot numbers in another as label points floating over them.
  // Neither half is a map. This is the pair, uploaded the way a person would
  // — both at once, through the page, with no terminal involved.
  const KMZ = (name: string) => path.resolve(__dirname, '../../../data/vm', name);
  const SHAPES = KMZ('Burada_Palem.kmz');
  const LABELS = KMZ('Burada_Palem_Label.kmz');
  const API = '/api/gateway/pattadar/village-maps';

  /** Marripalem: 998 plots, and its export states an extent for every one of
   *  them. The label-matched villages carry no extent at all, and a screen
   *  cannot show a figure nobody issued. */
  const open = async (page: Pg, village = 'MARRIPALEM') => {
    await page.goto('/app/villages');
    // The landing is the whole mandal; a village is chosen from it.
    await expect(page.getByRole('heading', { name: /Villages on record/ })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${village}`) }).click();
    await expect(page.locator('.vc-badge')).toContainText(village, { timeout: 30_000 });
    await page.waitForTimeout(1200);           // tiles, then the canvas pass
  };

  /** Leave nothing behind: an uploaded village shadows the shipped one for
   *  every later run, and the next spec would be reading a row this one made. */
  const wipe = async (request: import('@playwright/test').APIRequestContext) => {
    await request.delete(`${API}/buradapalem`).catch(() => undefined);
  };

  test.beforeAll(async ({ request }) => { await wipe(request); });
  test.afterAll(async ({ request }) => { await wipe(request); });

  test('a village map is uploaded, read back and taken off', async ({ page, request }) => {
    await page.goto('/app/villages');
    await expect(page.getByRole('heading', { name: /Villages on record/ })).toBeVisible();
    const shipped = await page.locator('.vm-villages .villagerow').count();
    expect(shipped).toBeGreaterThan(0);

    await page.setInputFiles('input[aria-label="Village map file"]', [SHAPES, LABELS]);

    // What it says it did, in the detail that matters: the plot numbers came
    // from the OTHER file, and that other file is not a second village.
    const card = page.locator('.card', { hasText: 'Add a village map' }).first();
    await expect(card).toContainText('BURADA PALEM', { timeout: 30_000 });
    await expect(card).toContainText('219 plots');
    await expect(card).toContainText('read off a separate label sheet');
    await expect(card).toContainText('Burada_Palem_Label.kmz was not used (labels only)');

    // It opens on the village it just took, and the header states the whole of
    // it — a village is a plot count and an extent before it is anything else.
    await expect(page.locator('.vc-badge')).toContainText('BURADA PALEM', { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('BURADA PALEM');
    await expect(page.locator('.pagehead .lede')).toContainText('219 plots');

    // Stored, not just drawn: the API has it, at full size.
    const listed = await request.get(API).then((r) => r.json());
    expect(listed.find((v: { key: string }) => v.key === 'buradapalem').plots).toBe(219);

    // Uploading a village the app already ships replaces it. Two rows for one
    // village is the thing the folded key exists to prevent.
    const switcher = page.locator('.vm-switch');
    if (await switcher.getAttribute('aria-expanded') !== 'true') await switcher.click();
    await expect(page.locator('.vm-villages .villagerow')).toHaveCount(shipped);

    // And it can be taken off again, leaving the shipped map behind it.
    await page.locator('button[aria-label="Remove BURADA PALEM"]').click();
    await expect(page.locator('button[aria-label="Remove BURADA PALEM"]')).toHaveCount(0);
    expect(await request.get(API).then((r) => r.json())).toEqual([]);
  });

  test('half a village is refused, and says which half is missing', async ({ page }) => {
    await page.goto('/app/villages');
    await expect(page.getByRole('heading', { name: /Villages on record/ })).toBeVisible();
    const card = page.locator('.card', { hasText: 'Add a village map' }).first();

    // The shapes alone: 219 polygons, every one of them called "Burada Palem".
    await page.setInputFiles('input[aria-label="Village map file"]', [SHAPES]);
    await expect(card).toContainText('No village came out of that', { timeout: 30_000 });
    await expect(card).toContainText('keeps them in a separate label file');

    // The labels alone: numbers floating over nothing.
    await page.setInputFiles('input[aria-label="Village map file"]', [LABELS]);
    await expect(card).toContainText('no plot polygons in it', { timeout: 30_000 });
  });

  /** What the village renderer put on its canvas: how much of it, and how much
   *  of that is light enough to be seen against aerial imagery.
   *
   *  Both numbers, because the bug this guards was not a blank layer. The plots
   *  were drawn the whole time — hairlines of --w-ink-3 at 0.55 opacity, which
   *  is the colour of a ploughed field in Prakasam. The caption said "89
   *  plots", the plot search found one, and the screen was a photograph of
   *  farmland. `lit` alone would have passed that. */
  const inked = (page: Pg) => page.evaluate(() => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>(
      '.leaflet-overlay-pane canvas')];
    let lit = 0;
    let bright = 0;
    for (const c of canvases) {
      const ctx = c.getContext('2d');
      if (!ctx || !c.width || !c.height) continue;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 40) continue;
        lit++;
        if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) bright++;
      }
    }
    return { lit, bright };
  });

  test('the plot mesh is drawn, in a colour that carries over imagery', async ({ page }) => {
    await open(page, 'RAMAYANAM KANDRIKA');
    const onImagery = await inked(page);
    expect(onImagery.lit).toBeGreaterThan(2000);
    expect(onImagery.bright).toBeGreaterThan(1000);
  });

  test('the three modes are three different maps', async ({ page }) => {
    await open(page, 'RAMAYANAM KANDRIKA');
    const tiles = () => page.locator('.leaflet-tile-pane img').count();
    expect(await tiles()).toBeGreaterThan(0);

    // Plot size shades every plot by how big it is, and says how many are in
    // each band — a legend with no counts is a colour key, not a finding.
    await page.getByRole('button', { name: 'Plot size' }).click();
    const legend = page.locator('.vc-legend').first();
    await expect(legend).toContainText('Under 1 ac');
    await expect(legend).toContainText('10 ac and over');
    const counted = await legend.locator('.num').allInnerTexts();
    expect(counted.reduce((n, t) => n + Number(t.replace(/\D/g, '')), 0)).toBe(89);

    // Boundaries drops the photograph entirely. That IS the mode: it exists to
    // read the geometry, and the panel's own surface is the ground.
    await page.getByRole('button', { name: 'Boundaries' }).click();
    await expect.poll(tiles).toBe(0);
    expect((await inked(page)).lit).toBeGreaterThan(2000);
  });

  /** Every plot label on screen, with the box it occupies. */
  const labels = (page: Pg) => page.evaluate(() =>
    [...document.querySelectorAll('.vc-label')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
    }));

  test('the number and the extent are written on the plot, and never on each other',
    async ({ page }) => {
      await open(page);

      /** What the scale bar reads, in metres — the unit the rule is written
       *  in. Gating on a zoom NUMBER would mean a different distance in every
       *  district; gating on the bar means the same thing everywhere. */
      const scale = async () => {
        const text = await page.locator('.leaflet-control-scale-line').first().innerText();
        const [, n, unit] = /([\d.]+)\s*(m|km)/.exec(text) ?? [];
        return Number(n) * (unit === 'km' ? 1000 : 1);
      };
      const withExtent = (rows: Array<{ text: string }>) =>
        rows.filter((l) => /^\d+\n[\d.]+( ac)?$/.test(l.text)).length;

      // Framed on the whole village the bar is well past 200 m, and NOT ONE
      // label carries an extent. At that distance you are looking for where
      // your land is, not how big it is, and the acres are 60% more label to
      // fit in a frame that already cannot hold the numbers.
      const wide = await labels(page);
      expect(wide.length).toBeGreaterThan(0);
      expect(await scale()).toBeGreaterThan(200);
      expect(withExtent(wide)).toBe(0);

      // Going to a plot zooms to it, the bar drops to 200 m or under, and the
      // extents arrive.
      await page.locator('#vm-goto').fill('839');
      await page.locator('#vm-goto').press('Enter');
      await expect(page.locator('.vc-tr')).toContainText('Plot 839');
      await page.waitForTimeout(1800);
      const close = await labels(page);
      expect(close.some((l) => l.text.startsWith('839'))).toBe(true);
      expect(await scale()).toBeLessThanOrEqual(200);
      expect(withExtent(close)).toBeGreaterThan(0);

      // No label is written over another one. A number on top of a number
      // answers neither question.
      for (let i = 0; i < close.length; i += 1) {
        for (let j = i + 1; j < close.length; j += 1) {
          const a = close[i];
          const b = close[j];
          const overlap = a.x < b.x + b.w && a.x + a.w > b.x
                       && a.y < b.y + b.h && a.y + a.h > b.y;
          expect(overlap, `"${a.text}" overlaps "${b.text}"`).toBe(false);
        }
      }

      // Off, and the map is a photograph again.
      await page.getByRole('button', { name: 'Numbers', exact: true }).click();
      await expect(page.locator('.vc-label')).toHaveCount(0);
      await expect(page.locator('.vc-badge')).toContainText('numbers off');
    });

  test('a plot answers for itself, in the units the papers use', async ({ page }) => {
    await open(page);
    await page.locator('#vm-goto').fill('839');
    await page.locator('#vm-goto').press('Enter');

    const card = page.locator('.card', { hasText: 'Selected plot' });
    await expect(card.locator('.vm-plotno')).toContainText('839');
    // Three units, because a paper record uses all three and the point of the
    // panel is checking one against the other.
    await expect(card).toContainText('4.893');
    await expect(card).toContainText('Guntas');
    await expect(card).toContainText('ha');
    // Which figure this is: off the sheet, or measured off the polygon.
    await expect(card).toContainText('As stated on the shape file');
    await expect(card).toContainText(/CENTROID/i);

    // Nobody's name is invented for somebody else's field.
    await expect(card).toContainText('Not one of your records');
  });

  test('adjoining plots are found, and lead to each other', async ({ page }) => {
    await open(page);
    await page.locator('#vm-goto').fill('839');
    await page.locator('#vm-goto').press('Enter');

    const card = page.locator('.card', { hasText: 'Selected plot' });
    await expect(card).toContainText('Adjoining plots');
    const chips = card.locator('.chip');
    // Matching identical edges reported 1.3 neighbours per plot where the
    // truth is nearer six; a village where plots have one neighbour each is
    // the signature of that bug coming back.
    const n = await chips.count();
    expect(n).toBeGreaterThanOrEqual(3);

    const neighbour = (await chips.first().innerText()).trim();
    await chips.first().click();
    await expect(card.locator('.vm-plotno')).toContainText(neighbour);
    // Adjoining is mutual: the plot you came from is on the new plot's list.
    await expect(card.locator('.chip', { hasText: /^839$/ })).toBeVisible();
  });

  test('a mode chip clicked twice puts itself back', async ({ page }) => {
    await open(page, 'RAMAYANAM KANDRIKA');
    const chip = (name: string) => page.getByRole('button', { name, exact: true });
    const tiles = () => page.locator('.leaflet-tile-pane img').count();

    // Every chip is a switch, not a radio button. Clicking the imagery while
    // the imagery is on turns it off — and "off" for a photograph is the bare
    // cadastre, which is the mode that already exists for reading one.
    await expect(chip('Satellite')).toHaveAttribute('aria-pressed', 'true');
    await chip('Satellite').click();
    await expect(chip('Boundaries')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(tiles).toBe(0);

    await chip('Satellite').click();
    await expect(chip('Satellite')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(tiles).toBeGreaterThan(0);

    // And off for anything else is back to the imagery, where the screen
    // starts.
    await chip('Plot size').click();
    await expect(chip('Plot size')).toHaveAttribute('aria-pressed', 'true');
    await chip('Plot size').click();
    await expect(chip('Satellite')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the tape uses Satellite and restores the map it displaced',
    async ({ page }) => {
      await open(page, 'RAMAYANAM KANDRIKA');
      const chip = (name: string) => page.getByRole('button', { name, exact: true });
      const measure = page.getByRole('button', { name: 'Measure on satellite' });

      // Start on the bare cadastre. Measure owns photographic ground, so it
      // temporarily switches to Satellite and prevents contradictory layers.
      await chip('Boundaries').click();
      await expect.poll(() => page.locator('.leaflet-tile-pane img').count()).toBe(0);

      await measure.click();
      await expect(chip('Satellite')).toHaveAttribute('aria-pressed', 'true');
      for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
        await expect(chip(name)).toBeDisabled();
      }
      await expect(page.locator('.vc-measure')).toContainText(
        'Satellite locked');
      await expect.poll(() => page.locator('.leaflet-tile-pane img').count())
        .toBeGreaterThan(0);

      const map = (await page.locator('.vc-map').boundingBox())!;
      await page.mouse.click(map.x + map.width * 0.48, map.y + map.height * 0.56);
      await page.mouse.click(map.x + map.width * 0.60, map.y + map.height * 0.67);
      const tape = page.locator('.vc-legend', { hasText: 'Measure' });
      await expect(tape).toContainText('Distance');

      await measure.click();
      await expect(chip('Boundaries')).toHaveAttribute('aria-pressed', 'true');
      for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
        await expect(chip(name)).toBeEnabled();
      }
      await expect.poll(() => page.locator('.leaflet-tile-pane img').count()).toBe(0);
      await expect(page.locator('.w-corner-no')).toHaveCount(0);
    });

  test('the measure tape reports a distance, and an area once it closes',
    async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Measure on satellite' }).click();
      const map = await page.locator('.vc-map').boundingBox();
      if (!map) throw new Error('no map');
      const cx = map.x + map.width / 2;
      const cy = map.y + map.height / 2;
      for (const [dx, dy] of [[-140, -70], [40, -30], [80, 90]] as const) {
        await page.mouse.click(cx + dx, cy + dy);
        await page.waitForTimeout(250);
      }
      const tape = page.locator('.vc-legend', { hasText: 'Measure' });
      await expect(tape).toContainText('Perimeter');
      await expect(tape).toContainText('3 points');
      await expect(tape).toContainText('Encloses');

      // Closed, it wears what a boundary wears on the record map: a letter at
      // every corner and a length on every side, the closing one included.
      // Letters and not numbers — a map covered in numbers cannot afford a
      // "3" beside a "136 m".
      await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B', 'C']);
      const sides = page.locator('.w-side');
      await expect(sides).toHaveCount(3);
      for (const text of await sides.allInnerTexts()) {
        // Metres to one decimal, kilometres to two once a side runs past 1 km.
        expect(text).toMatch(/^[\d,]+\.\d+ (m|km)$/);
      }

      await page.getByRole('button', { name: 'Undo point', exact: true }).click();
      await expect(tape).toContainText('Distance');
      await expect(tape).not.toContainText('Encloses');
      await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B']);
      await page.getByRole('button', { name: 'Clear measure', exact: true }).click();
      await expect(page.locator('.w-corner-no')).toHaveCount(0);
      await expect(page.locator('.w-side')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Measure on satellite', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');

      // Esc puts the tape away rather than the selection — first thing out.
      await page.keyboard.press('Escape');
      await expect(tape).toHaveCount(0);
      await expect(page.locator('.w-corner-no')).toHaveCount(0);
      await expect(page.locator('.w-side')).toHaveCount(0);
    });

  test('the landing map is the whole mandal, and a village opens off it',
    async ({ page }) => {
      await page.goto('/app/villages');
      await expect(page.getByRole('heading', { name: /Villages on record/ })).toBeVisible();

      // Every village on record, drawn — not a list of names with a map behind
      // one of them. The outlines are the real edges: 77 KB for eight of them
      // against 2.2 MB of plots, which is what makes this affordable at all.
      await expect(page.locator('.pagehead .lede')).toContainText('villages on record');
      const named = await page.locator('.vc-village').count();
      expect(named).toBeGreaterThan(3);
      await expect(page.locator('.vc-village').first()).toContainText('plots');

      // A name is never written over another name. Where two villages sit too
      // close to hold both, the panel beside the map still lists every one.
      const boxes = await page.locator('.vc-village').evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect())
          .map((r) => [r.x, r.y, r.width, r.height] as [number, number, number, number]));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const [ax, ay, aw, ah] = boxes[i];
          const [bx, by, bw, bh] = boxes[j];
          expect(ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by).toBe(false);
        }
      }

      await page.getByRole('button', { name: /^RAMAYANAM KANDRIKA/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('RAMAYANAM KANDRIKA');
      await expect(page.locator('.pagehead .lede')).toContainText('89 plots');
      await expect(page.locator('.vc-badge')).toContainText('RAMAYANAM KANDRIKA',
                                                            { timeout: 30_000 });

      // And back out to the mandal again.
      await page.getByRole('button', { name: 'All villages' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maps');
      await expect(page.locator('.vc-village').first()).toBeVisible();
    });

  test('the fence calculator opens over the map and counts corners',
    async ({ page }) => {
      await open(page);
      await page.locator('#vm-goto').fill('839');
      await page.locator('#vm-goto').press('Enter');
      await page.getByRole('button', { name: 'Fence calculator' }).click();

      const bar = page.locator('.fs-bar');
      await expect(bar).toContainText('Fence calculator');
      await expect(bar).toContainText('Plot 839');

      // The calculator is open on ONE parcel, and the page says so: the head
      // drops from the village to the plot, and the only way out is up.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plot 839');
      await expect(page.locator('.pagehead .lede')).toContainText('MARRIPALEM');
      await expect(page.getByRole('button', { name: /Back to MARRIPALEM/ })).toBeVisible();
      // And the inspector stands down — it was answering the question the
      // calculator's own bar answers, in the same words.
      await expect(page.locator('.vm-side')).toHaveCount(0);

      // Step 1 is the shape, side by side, wearing the letters the map wears.
      const sides = page.locator('.fs-side');
      await expect(sides.first()).toContainText('A–B');
      const count = await sides.count();
      expect(count).toBeGreaterThanOrEqual(3);

      const figure = async (row: RegExp) =>
        Number((await page.locator('.fs-bill tr', { hasText: row }).first()
          .locator('td.num').first().innerText()).replace(/[^\d.]/g, ''));

      const corners = await figure(/Corner posts/);
      const line = await figure(/Line posts/);
      const gatePosts = await figure(/Gate posts/);
      const posts = await figure(/^Posts/);
      // The corner rule, stated as a sum anyone can check on the screen.
      expect(posts).toBe(corners + line + gatePosts);
      expect(corners).toBe(count);

      // Dropping a side shortens the fence — most fences go round part of a
      // boundary, and this is the control that says so.
      await sides.first().click();
      await expect(sides.first()).toContainText('skipped');
      expect(await figure(/^Posts/)).toBeLessThan(posts);
      await sides.first().click();
      await expect(sides.first()).toContainText('fencing');

      // A gate is a hole in the fence: no wire across it, a post either side,
      // and wire is bought in rolls so the quantity to order is stated.
      await expect(page.locator('.fs-bill')).toContainText('of gate taken out');
      await expect(page.locator('.fs-bill')).toContainText('two to a gate');
      await expect(page.locator('.fs-bill')).toContainText('what you buy');

      // Rates are the owner's own, and the total is what the bill lists.
      await expect(page.locator('.fs-panel')).toContainText('Put your own rates in');
      await page.locator('#fs-post-rate').fill('250');
      await page.locator('#fs-wire-rate').fill('12');
      await page.locator('#fs-gate-rate').fill('6000');
      const money = async (row: RegExp) => Number(
        ((await page.locator('.fs-bill tr', { hasText: row }).last().innerText())
          .match(/₹[\d,]+/)?.[0] ?? '0').replace(/[₹,]/g, ''));
      const total = Number((await page.locator('.fs-total .num').innerText())
        .replace(/[^\d]/g, ''));
      expect(total).toBe((await money(/^Posts/)) + (await money(/^Wire/))
        + (await money(/^Gates/)));

      // The panel can move to the other hand, and the tool can be closed.
      await page.getByRole('button', { name: /Panel left/ }).click();
      await expect(page.locator('.fs.flip')).toHaveCount(1);
      await page.getByRole('button', { name: 'Close the fence calculator' }).click();
      await expect(page.locator('.fs-bar')).toHaveCount(0);
      // Back at the village, with the inspector where it was.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('MARRIPALEM');
      await expect(page.locator('.vm-side')).toHaveCount(1);
      await expect(page.locator('.vc-badge')).toContainText('MARRIPALEM');
    });

  test('the estimate leaves the screen: a printable sheet, and work on the record',
    async ({ page, request }) => {
      await open(page);
      await page.locator('#vm-goto').fill('839');
      await page.locator('#vm-goto').press('Enter');
      await page.getByRole('button', { name: 'Fence calculator' }).click();
      await page.locator('#fs-post-rate').fill('250');
      await page.locator('#fs-wire-rate').fill('12');
      await page.locator('#fs-gate-rate').fill('6000');

      // The sheet exists even while it is off screen — it is what Print puts
      // on paper, and what used to come out was the FORM: the rail, the input
      // boxes, and a panel cut off two fields above the answer.
      const sheet = page.locator('.fs-sheet');
      const paper = (await sheet.textContent()) ?? '';
      expect(paper).toContain('Fence estimate');
      expect(paper).toContain('Plot 839');
      expect(paper).toMatch(/A–B/);
      expect(paper).toMatch(/Materials/);
      expect(paper).toMatch(/₹[\d,]+/);
      // Drawn to scale, with its corners lettered — a satellite photograph
      // prints as a grey rectangle and states no lengths.
      await expect(sheet.locator('svg.fs-plan')).toHaveCount(1);

      // In print it is the ONLY thing on the page.
      await page.emulateMedia({ media: 'print' });
      await expect(sheet).toBeVisible();
      await expect(page.locator('.fs-panel')).toBeHidden();
      await expect(page.locator('.fs-bar')).toBeHidden();
      await expect(page.locator('.nav')).toBeHidden();
      await page.emulateMedia({ media: 'screen' });

      // This plot is nobody's record here, and the panel says what that means
      // rather than offering a button that would have nothing to hang off.
      await expect(page.locator('.fs-panel')).toContainText('has to be one of your records');
      await expect(page.getByRole('button', { name: /Ask for this on/ })).toHaveCount(0);

      // Add it, and only after the surveyed boundary is saved land on the
      // Properties screen where the new parcel can be seen.
      await page.getByRole('button', { name: 'Close the fence calculator' }).click();
      await page.getByRole('button', { name: 'Add to Properties' }).click();
      await expect(page).toHaveURL(/\/app\/properties$/);
      await expect(page.getByRole('link', { name: 'Sy 839', exact: true }).first()).toBeVisible();

      // The destination alone is not persistence evidence: read the card back
      // through the real API and require the shape that came from the village.
      const added = await gql(request, `{ web { properties { cards { id title ring } } } }`);
      const made = ((added?.data?.web?.properties?.cards ?? []) as Array<{
        id: string; title: string; ring: number[];
      }>).find((c) => c.title === 'Sy 839');
      expect(made).toBeTruthy();
      expect(made?.ring.length).toBeGreaterThanOrEqual(6);
      const recordId = made!.id;

      await open(page);
      await page.locator('#vm-goto').fill('839');
      await page.locator('#vm-goto').press('Enter');
      await page.getByRole('button', { name: 'Fence calculator' }).click();
      const ask = page.getByRole('button', { name: /Ask for this on/ });
      await expect(ask).toBeVisible();
      await ask.click();

      // It lands as work on that record — a REQUEST, deliberately, because the
      // fence does not exist yet and the money has not been spent. Writing an
      // expense or a feature would put a thing on the land that is not there.
      await expect(page).toHaveURL(new RegExp(`/app/records/${recordId}/services`));
      const main = page.locator('main');
      await expect(main).toContainText('Fencing');
      await expect(main).toContainText('posts');
      await expect(main).toContainText('of wire');

      // Clean up: the record this test filed, and the request hanging off it.
      await gql(request, `mutation { web { deleteRecords(ids:["${recordId}"]) } }`);
    });

  test('the calculator remembers your rates', async ({ page }) => {
    await open(page);
    await page.locator('#vm-goto').fill('839');
    await page.locator('#vm-goto').press('Enter');
    await page.getByRole('button', { name: 'Fence calculator' }).click();
    await page.locator('#fs-post-rate').fill('317');
    await page.locator('#fs-spacing').fill('2.5');
    await page.waitForTimeout(300);

    // A post costs what it costs wherever you buy it. Retyping four figures
    // every time you price a different plot is what stops a tool being used.
    await open(page);
    await page.locator('#vm-goto').fill('840');
    await page.locator('#vm-goto').press('Enter');
    await page.getByRole('button', { name: 'Fence calculator' }).click();
    await expect(page.locator('#fs-post-rate')).toHaveValue('317');
    await expect(page.locator('#fs-spacing')).toHaveValue('2.5');
    await page.locator('#fs-post-rate').fill('');
    await page.locator('#fs-spacing').fill('3');
  });

  test('the fence calculator takes the shape you measured over the plot you picked',
    async ({ page }) => {
      await open(page);
      await page.locator('#vm-goto').fill('839');
      await page.locator('#vm-goto').press('Enter');

      // A shape somebody drew on purpose outranks the plot they happen to have
      // selected.
      await page.getByRole('button', { name: 'Measure on satellite' }).click();
      const map = await page.locator('.vc-map').boundingBox();
      if (!map) throw new Error('no map');
      for (const [dx, dy] of [[-110, -80], [110, -80], [110, 80]] as const) {
        await page.mouse.click(map.x + map.width / 2 + dx, map.y + map.height / 2 + dy);
        await page.waitForTimeout(250);
      }
      await page.getByRole('button', { name: 'Fence calculator' }).click();
      await expect(page.locator('.fs-bar')).toContainText('The shape you measured');
      await expect(page.locator('.fs-side')).toHaveCount(3);

      // The header button goes back up a level whatever is being fenced.
      await page.getByRole('button', { name: /Back to MARRIPALEM/ }).click();
      await expect(page.locator('.fs-bar')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('MARRIPALEM');
    });

  test('a plot number the village does not have is said so, not flown to',
    async ({ page }) => {
      await open(page);
      await page.locator('#vm-goto').fill('99999');
      await page.locator('#vm-goto').press('Enter');
      await expect(page.locator('.vc-tr')).toContainText('No plot starts with 99999 in this village');
      await expect(page.locator('.card', { hasText: 'Selected plot' })).toHaveCount(0);
    });

  test('the prefix finder and the map are one selection without an all-plots column', async ({ page }) => {
    await open(page);
    await expect(page.locator('section.card', { hasText: 'All plots' })).toHaveCount(0);

    const finder = page.getByLabel('Find survey or plot number');
    await finder.fill('839');
    const option = page.getByRole('option', { name: /^Plot 839\b/ });
    await expect(option).toBeVisible();
    await option.click();

    await expect(page.locator('.card', { hasText: 'Selected plot' })
      .locator('.vm-plotno')).toContainText('839');
    await expect(finder).toHaveValue('839');
    // The map moved with it, and the label on the chosen plot is the accented
    // one — it is never allowed to lose its number to a neighbour.
    await expect(page.locator('.vc-label.on')).toContainText('839');
  });
});
