/**
 * W01 and W02 · the controls beside the data, and the screens with no data.
 *
 * The dashboard and the faceted list are the two most-visited screens in the
 * app and the two most thinly covered. screens.spec.ts reads them — the totals,
 * the nine cards, the two waiting titles — and crud.spec.ts writes through
 * them, but always through a card's own kebab or a GraphQL call standing in for
 * the UI. What neither touches is everything AROUND the rows:
 *
 *   · The × on a waiting row, and the dialog behind it. `useDismissWaiting`
 *     (w360/api.ts:877) is the only W01/W02 mutation with no caller in this
 *     suite, and it is `UPDATE waiting_items SET done=true` with no inverse
 *     anywhere in the app or the schema. The confirm dialog is the only thing
 *     standing between a slipped pointer and a reminder nobody can get back,
 *     and it had never once rendered in a test.
 *   · Where a waiting row GOES. These two buttons used to say "Sign" and
 *     "Extend" and were both wired to dismissWaiting — pressing "Sign" signed
 *     nothing and threw the reminder away (Dashboard.tsx:57-84). The
 *     replacement is asserted here so the labels can never drift back into
 *     verbs the row cannot honour.
 *   · Both zero-states. An account holding nothing and an account whose every
 *     record is archived report the same `total === 0` and are not the same
 *     sentence (Properties.tsx:325-333). Neither branch, nor the withdrawal of
 *     the rail/view-toggle/Export/count-chip that goes with them, had ever been
 *     rendered by a test — every existing test loads these screens on the full
 *     seed.
 *   · The bulk bar with nothing selected. `targets` falls back to everything
 *     shown (Properties.tsx:426), so on the unfiltered list one click plus one
 *     confirm archives nine records or orders nine ECs at ₹1,180 each. Every
 *     existing bulk assertion selects a card first, so the empty-handed default
 *     — the expensive one — was untested.
 *   · Two data-loss guards in the record drawer: a cleared "Worth today" box
 *     must not write ₹0 over a filed valuation (PropertyActions.tsx:244), and
 *     Escape or a slipped scrim click must not throw away a half-typed record
 *     (:271). Every money box in the suite is filled with digits, never
 *     emptied; every Escape in the suite is on a drawer nobody typed into.
 *   · The deed that saves the record but cannot file the paper
 *     (PropertyActions.tsx:400-414). crud-360.spec.ts stubs storage to SUCCEED;
 *     the failure half is where the owner is one wrong sentence away from
 *     filing the same parcel twice.
 *
 * Every behaviour here is implemented correctly today, so these are ordinary
 * passing tests rather than test.fail() documentation — they exist to keep
 * these branches from rotting unseen, which is exactly how the "Sign" button
 * survived as long as it did.
 *
 * CLEANUP. Two tests take the world apart and must put it back, in afterEach
 * and never at the end of a body — Playwright abandons a test at its first
 * failed assertion, so a trailing restore is skipped precisely when it is
 * needed, and screens.spec.ts asserts the seeded totals to the record:
 *   · the archive-everything fixture unarchives what it archived;
 *   · the dismissed reminder is put back with a direct UPDATE, because nothing
 *     in the app, the schema or the GraphQL API can re-raise one.
 * Scratch records are swept by TITLE rather than through a MADE id registry,
 * the way crud.spec.ts:27 does it: two of these tests file a record through the
 * drawer and never learn its id, and a `rec-` row left behind turns one red
 * test into seventeen.
 */
import { execFileSync } from 'node:child_process';

import { expect, test, stubDocumentReader } from './harness';
import type { APIRequestContext } from '@playwright/test';

type Pg = import('@playwright/test').Page;

const GQL = '/api/gateway/pattadar/graphql';

/** GraphQL straight at the API, for setting a test up and reading back what
 *  the UI actually wrote. The preview proxy injects the demo identity. */
async function gql(request: APIRequestContext, query: string) {
  const res = await request.post(GQL, { data: { query } });
  return (await res.json()).data?.web;
}

/** The two reminders the seed leaves waiting on w360-demo. wi-1 is load-bearing
 *  for crud.spec.ts:248 and is never dismissed here; wi-2 is the one this file
 *  takes away and puts back. */
const SIGNATURE = 'Mutation for Sy 214/2 needs your signature';
const ADVOCATE = "Advocate's link to 4 papers expires tomorrow";
const ADVOCATE_ROW = 'w360-wi-2';

/** Records this file created, found by title rather than by id.
 *
 *  An id registry cannot see a record the Add drawer filed — the test never
 *  learns the id — and the search box deliberately hides archived rows, so the
 *  sweep reads both status worlds, unarchives, then deletes. */
async function sweep777(request: APIRequestContext): Promise<void> {
  const seen = new Set<string>();
  for (const statuses of ['[]', '["archived"]']) {
    const out = await gql(request,
      `query { web { properties(statuses:${statuses}) { cards { id title } } } }`);
    for (const c of (out?.properties?.cards ?? []) as { id: string; title: string }[]) {
      if (String(c.title).startsWith('Sy 777')) seen.add(c.id);
    }
  }
  if (!seen.size) return;
  const ids = [...seen].map((id) => `"${id}"`).join(',');
  await gql(request, `mutation { web { archiveRecords(ids:[${ids}], archived:false)
                                       deleteRecords(ids:[${ids}]) } }`);
}

/** Ids the archive-everything fixture put away, restored in afterEach. */
const ARCHIVED: string[] = [];

async function archiveEverything(request: APIRequestContext): Promise<string[]> {
  const out = await gql(request, `query { web { properties { cards { id } } } }`);
  const ids = ((out?.properties?.cards ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return ids;
  const list = ids.map((id) => `"${id}"`).join(',');
  // Registered BEFORE the write: if the mutation lands and the response read
  // throws, afterEach still has the ids it needs to undo it.
  ARCHIVED.push(...ids);
  await gql(request, `mutation { web { archiveRecords(ids:[${list}], archived:true) } }`);
  return ids;
}

/**
 * Put a dismissed reminder back.
 *
 * `dismissWaiting` is `UPDATE waiting_items SET done=true` (web360.py:4540) and
 * there is no mutation, anywhere, that sets it back — global-setup re-seeds
 * between runs, which is no help INSIDE one. So the only honest way to test the
 * dismissal for real is to reach past the app and restore the row, and the only
 * dishonest alternative is to stub the mutation, which would assert nothing
 * about whether the write reaches the server.
 */
const DSN = process.env.TEST_PG_DSN || process.env.APP_PG_DSN || '';

function undismiss(id: string): void {
  execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-qtAc',
    `UPDATE waiting_items SET done=false WHERE id='${id}'`], { stdio: 'pipe' });
}

/** Can this machine put the row back? Probed once, with the restore itself —
 *  on an undismissed row it is a no-op. A test that cannot undo an irreversible
 *  write must not run: it would leave screens.spec.ts:86 red for a reason that
 *  has nothing to do with screens.spec.ts. */
let restorable: boolean | null = null;
function canRestoreWaiting(): boolean {
  if (restorable === null) {
    try { undismiss(ADVOCATE_ROW); restorable = true; } catch { restorable = false; }
  }
  return restorable;
}

/** Set the moment a test is about to dismiss, cleared by afterEach. */
let dismissed = '';

/** The Waiting on you card. Scoped, because while the dialog is open the row
 *  title appears TWICE — once as the row and once quoted in the dialog body. */
const waitingPanel = (page: Pg) => page.locator('section.card', { hasText: 'Waiting on you' }).first();

test.afterEach(async ({ request }) => {
  if (dismissed) {
    const id = dismissed;
    dismissed = '';
    undismiss(id);   // loud on failure: a reminder left dismissed breaks four other specs
  }
  if (ARCHIVED.length) {
    const list = ARCHIVED.splice(0).map((id) => `"${id}"`).join(',');
    await gql(request, `mutation { web { archiveRecords(ids:[${list}], archived:false) } }`);
  }
  await sweep777(request);
});

test.describe('W01 · the things waiting on you', () => {
  test('a reminder cannot be thrown away by one slip of the pointer', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByText('2 things waiting on you')).toBeVisible();

    await page.getByRole('button', { name: `Dismiss: ${ADVOCATE}` }).click();

    // The × asks. It used to be a bare mutation on a "Sign"/"Extend" button,
    // and this dialog is the whole of the protection: there is no undo on the
    // screen, in the API or in the schema.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Dismiss this reminder?' })).toBeVisible();
    await expect(dialog.getByText('leaves this screen for good')).toBeVisible();
    await expect(dialog.getByText('cannot be brought back')).toBeVisible();
    // And it has to say what is NOT affected, or "dismiss" reads as "cancel the
    // mutation" / "give up the deadline" rather than "stop reminding me".
    await expect(dialog.getByText('left exactly as it is')).toBeVisible();

    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Asserted only once the dialog is gone: until then the title matches the
    // row AND the dialog's quotation of it.
    await expect(waitingPanel(page).getByText(ADVOCATE)).toBeVisible();

    // The half that matters: backing out must not have written anything.
    await page.reload();
    await expect(waitingPanel(page).getByText(ADVOCATE)).toBeVisible();
    await expect(page.getByText('2 things waiting on you')).toBeVisible();
  });

  test('dismissing a reminder takes that one away for good, and leaves the other alone', async ({ page }) => {
    test.skip(!canRestoreWaiting(),
      'needs psql and TEST_PG_DSN to put w360-wi-2 back: the dismissal has no inverse in the app');

    await page.goto('/app');
    await expect(page.getByText('2 things waiting on you')).toBeVisible();

    await page.getByRole('button', { name: `Dismiss: ${ADVOCATE}` }).click();
    // Registered before the click, not after: the write can land and the very
    // next assertion still fail, and afterEach has to know to undo it.
    dismissed = ADVOCATE_ROW;
    await page.getByRole('button', { name: 'Dismiss it' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(ADVOCATE)).toHaveCount(0);
    // plural() and not `${n} things`: a dashboard reading "1 things waiting on
    // you" is the bug this helper exists for.
    await expect(page.getByText('1 thing waiting on you')).toBeVisible();
    // Per-row, not per-panel — the mutation takes an id and the other reminder
    // has its own deadline.
    await expect(page.getByText(SIGNATURE)).toBeVisible();

    // The list is invalidated optimistically; a reload is what proves the write
    // reached the server rather than only the cache.
    await page.reload();
    await expect(page.getByText(ADVOCATE)).toHaveCount(0);
    await expect(page.getByText(SIGNATURE)).toBeVisible();
    await expect(page.getByText('1 thing waiting on you')).toBeVisible();
  });

  test('a thing waiting on you opens where that thing lives', async ({ page }) => {
    await page.goto('/app');
    const rows = waitingPanel(page).locator('.rows > *');

    // A row that names a record opens that record's 360 — where its papers,
    // its people and its service tickets actually hang.
    await rows.filter({ hasText: SIGNATURE }).getByRole('link', { name: 'Open record' }).click();
    await expect(page).toHaveURL(/\/app\/records\/w360-p-214-2$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');

    // A lock row is about something shared out, and every live link — its
    // terms, its days left, its revoke — lives on Papers.
    await page.goto('/app');
    await rows.filter({ hasText: "Advocate's link" }).getByRole('link', { name: 'Open Papers' }).click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Papers');

    // The title is a link to the same place, so reading the row and acting on
    // it are not two different targets a pixel apart.
    await page.goto('/app');
    await rows.filter({ hasText: SIGNATURE }).getByRole('link', { name: SIGNATURE }).click();
    await expect(page).toHaveURL(/\/app\/records\/w360-p-214-2$/);

    // The regression guard proper: every one of these rows once carried the
    // server's action_label — "Sign", "Extend", "Combine" — on a control wired
    // to dismissWaiting. Pressing "Sign" signed nothing and silently threw the
    // reminder away. A row may only offer what it can honour.
    await page.goto('/app');
    const panel = waitingPanel(page);
    await expect(panel.getByRole('button', { name: /^(Sign|Extend|Combine)$/ })).toHaveCount(0);
    await expect(panel.getByRole('link', { name: /^(Sign|Extend|Combine)$/ })).toHaveCount(0);
  });

  test('a first-run dashboard says one thing, and still shows what is waiting', async ({ page }) => {
    // The portfolio is stubbed rather than emptied: `holdings === 0` is the
    // literal first screen of every new account, and the branch returns at
    // Dashboard.tsx:221 before tiles, valueBars or recent are read. Shell.tsx
    // calls the same hook, so one stub serves both — every other GraphQL post
    // continues to the real API, or the header breaks for an unrelated reason.
    const firstRun = {
      displayName: 'Test owner',
      farmExtent: 0, farmCount: 0, plotExtent: 0, plotCount: 0, builtExtent: 0,
      builtFlats: 0, builtShops: 0, invested: 0, worthNow: 0, gain: 0, loans: 0,
      managedCount: 0, watchedCount: 0, waitingCount: 1, runningCosts: 0,
      paperCount: 0, backupVerifiedOn: '',
      tiles: [], valueBars: [], recent: [],
      waiting: [{
        id: 'w360-wi-stub', title: ADVOCATE, detail: 'Expires tomorrow',
        icon: 'lock', actionLabel: '', actionKind: 'ghost', recordId: '',
      }],
    };
    await page.route('**/graphql', (route) => {
      if (!(route.request().postData() ?? '').includes('portfolio')) return route.continue();
      return route.fulfill({ json: { data: { web: { portfolio: firstRun } } } });
    });

    await page.goto('/app');
    await expect(page.getByText('Nothing in your portfolio yet')).toBeVisible();

    // One sentence, not four ₹0 tiles over an empty chart and a heading with
    // nothing under it. A screen that draws its whole chrome around no data
    // reads as an app that failed to load.
    await expect(page.locator('main .strip')).toHaveCount(0);
    await expect(page.getByText('Where the value sits')).toHaveCount(0);
    await expect(page.getByText('Recently opened')).toHaveCount(0);

    // The deliberate exception: an invitation, or a link about to expire, can
    // arrive before the account holds a single parcel, and that panel is the
    // one thing worth drawing on an otherwise empty screen.
    await expect(page.getByRole('heading', { level: 2, name: 'Waiting on you' })).toBeVisible();
    await expect(waitingPanel(page).getByText(ADVOCATE)).toBeVisible();
    await expect(page.getByText('1 thing waiting on you')).toBeVisible();

    // And the one thing to do actually does it — the drawer opens on arrival
    // rather than leaving the newcomer on a list with an Add button they have
    // to find for themselves.
    await page.getByRole('link', { name: 'Add your first record' }).click();
    await expect(page).toHaveURL(/\/app\/properties/);
    const drawer = page.locator('aside.drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Add a record' })).toBeVisible();
  });
});

test.describe('W02 · the list with nothing on it', () => {
  test('every record archived says where they went, and the rail is not the only way back', async ({ page, request }) => {
    const ids = await archiveEverything(request);
    expect(ids.length).toBeGreaterThan(0);

    await page.goto('/app/properties');

    // An account that holds nothing and an account that put everything away
    // both report total === 0. Telling the second one "Nothing here yet" and
    // inviting it to add its first record is a lie about its own portfolio.
    await expect(page.getByText('Nothing active')).toBeVisible();
    await expect(page.getByText(`${ids.length} records are archived`)).toBeVisible();
    await expect(page.getByText('Nothing here yet')).toHaveCount(0);

    // Everything for working through a list is furniture for rows that are not
    // there, and it buries the single thing to do.
    await expect(page.locator('.filterbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.locator('.bulkbar')).toHaveCount(0);
    await expect(page.getByText(/\d+ of \d+ shown/)).toHaveCount(0);

    // The way back cannot be inside the filter that was just withdrawn.
    await expect(page.getByRole('button', { name: 'Add a record' })).toBeVisible();
    await page.getByRole('button', { name: 'Show archived' }).click();

    // Ticking the facet from here has to be the same act as ticking it in the
    // filter, URL and all, or a reload lands the owner back on the empty screen.
    await expect(page).toHaveURL(/[?&]status=archived/);
    await expect(page.locator('.cards .rec')).toHaveCount(ids.length);
    await expect(page.locator('.cards .rec').first()).toContainText('Archived');
  });

  test('the bulk bar does not exist until records are picked, and then acts on exactly those', async ({ page, request }) => {
    // Two disposable records, and a search that leaves only them on the grid.
    for (const suffix of ['A', 'B']) {
      await gql(request, `mutation { web { saveRecord(input:{
        kind:"parcel", title:"Sy 777 BULK-${suffix}", khataNo:"777", village:"E2E Palem",
        extent:1, marketValue:100000 }) } }`);
    }

    await page.goto('/app/properties?q=Sy+777+BULK');
    await expect(page.locator('.cards .rec')).toHaveCount(2);

    const bar = page.locator('.bulkbar');
    // Nothing at rest. The bar used to sit here permanently, explain itself in
    // a sentence, and offer "Order EC ×2" — two certificates at ₹1,180 each —
    // against a selection nobody had made. Read as chrome, it was a standing
    // offer to spend money on whatever the filter happened to be showing.
    await expect(bar).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Select Sy 777 BULK-A' }).check();
    await expect(bar).toBeVisible();
    // Every label counts the selection, not the screen.
    await expect(bar).toContainText('1 record selected');
    await expect(bar.getByRole('button', { name: 'Order EC ×1' })).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select Sy 777 BULK-B' }).check();
    await expect(bar).toContainText('2 records selected');
    await expect(bar.getByRole('button', { name: 'Order EC ×2' })).toBeVisible();

    // Delete is offered now, because there is a deliberate selection for it to
    // mean. Empty-handed it would have meant "delete everything shown", which
    // no confirm dialog can make safe enough — and empty-handed there is no
    // bar at all.
    await expect(bar.getByRole('button', { name: 'Delete…' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Tag…' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();

    await bar.getByRole('button', { name: 'Archive', exact: true }).click();
    // The number is said again before anything is written.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Archive 2 records?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Exactly those two moved, and the bar went with the selection it acted on.
    await expect(bar).toHaveCount(0);
    await page.goto('/app/properties');
    await expect(page.getByText('9 of 9 shown')).toBeVisible();

    // Against archived rows the same button offers the way back rather than a
    // second archive that would do nothing.
    await page.goto('/app/properties?status=archived&q=Sy+777+BULK');
    await expect(page.locator('.cards .rec')).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'Select Sy 777 BULK-A' }).check();
    await expect(bar.getByRole('button', { name: 'Unarchive', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
  });
});

test.describe('W02 · the record drawer keeps what it was given', () => {
  test('emptying the worth box leaves the filed valuation alone', async ({ page, request }) => {
    const id = (await gql(request, `mutation { web { saveRecord(input:{
      kind:"parcel", title:"Sy 777 Worth", khataNo:"777", village:"E2E Palem",
      extent:1, marketValue:900000 }) } }`)).saveRecord;

    await page.goto('/app/properties?q=Sy+777+Worth');
    await expect(page.locator('.rec', { hasText: 'Sy 777 Worth' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Actions for Sy 777 Worth' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const drawer = page.locator('aside.drawer');
    await expect(drawer.locator('#rd-market')).toHaveValue('₹9,00,000');

    // Clearing the box is how somebody looks at what is in it, and how somebody
    // says "I don't know". `Number('') || 0` used to make it mean ₹0, written
    // straight over a real valuation — the server sets market_value whenever
    // the field is present, so the client guard is the only thing in the way.
    await drawer.locator('#rd-market').fill('');
    await expect(drawer.locator('#rd-market')).toHaveValue('');
    await expect(drawer.locator('#rd-market')).toHaveAttribute('placeholder', 'Not known');

    // Clearing it alone leaves `edits` empty and submit short-circuits without
    // sending anything, which would prove nothing. A real edit beside it forces
    // the mutation that the cleared box must stay out of.
    await drawer.locator('#rd-title').fill('Sy 777 Worth A');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(drawer).toHaveCount(0);

    // Read off the server, not off the card: an optimistic cache could show the
    // old figure over a zero on disk.
    const back = await gql(request, `{ web { properties { cards { id title marketValue } } } }`);
    const row = ((back?.properties?.cards ?? []) as { id: string; title: string; marketValue: number }[])
      .find((c) => c.id === id);
    expect(row?.title).toBe('Sy 777 Worth A');
    expect(row?.marketValue).toBe(900000);

    // And on screen: the card prints inrOr(), which renders an em dash for 0,
    // so a regression here is unmistakable.
    const card = page.locator('.rec', { hasText: 'Sy 777 Worth A' });
    await expect(card).toContainText('₹9.0 L');
  });

  test('a half-typed record survives an accidental Escape', async ({ page, request }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.locator('aside.drawer');
    // The drawer opens on the document; the form is one link down.
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await drawer.locator('#rd-title').fill('Sy 777 HALF');
    await drawer.locator('#rd-village').fill('E2E Palem');

    // The bug this guards: Escape dismissing a browser autofill dropdown took
    // the whole half-filled record with it, with nothing to reopen.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Discard this record?' })).toBeVisible();
    await expect(drawer).toBeVisible();   // still mounted behind the question

    await page.locator('.dlg').getByRole('button', { name: 'Keep editing' }).click();
    await expect(drawer.locator('#rd-title')).toHaveValue('Sy 777 HALF');
    await expect(drawer.locator('#rd-village')).toHaveValue('E2E Palem');

    // A slipped click on the dimmed page is the same accident and gets the same
    // question — a guard on Escape alone would leave the wider target open.
    await page.locator('.scrim').first().click();
    await expect(page.getByRole('heading', { name: 'Discard this record?' })).toBeVisible();
    await page.locator('.dlg').getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(drawer).toHaveCount(0);

    // Discarding really discards: nothing was filed on the way past.
    const out = await gql(request, `{ web { properties { cards { title } } } }`);
    const titles = ((out?.properties?.cards ?? []) as { title: string }[]).map((c) => c.title);
    expect(titles.some((t) => t.includes('777 HALF'))).toBe(false);

    // And the guard must not nag about work nobody did: an untouched drawer
    // closes on Escape at once, or the confirmation becomes noise people learn
    // to click through.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Discard this record?' })).toHaveCount(0);
  });

  test('a deed that will not upload does not make the saved record look unsaved', async ({ page, request }) => {
    await stubDocumentReader(page, { survey_no: 'Sy 777 FILEFAIL', village: 'E2E Palem' });
    // Storage is a separate gateway with its own auth; here it is simply down.
    await page.route('**/storage/files*', (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'storage is down' }),
    }));

    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.locator('aside.drawer');
    await drawer.locator('input[type=file]').setInputFiles({
      name: 'sale-deed.pdf', mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 not a real deed'),
    });
    await expect(drawer.locator('#rd-title')).toHaveValue('Sy 777 FILEFAIL');

    await page.getByRole('button', { name: 'Add record' }).click();

    // Closing here would carry the message away with the drawer, and the only
    // statement that the parcel has no deed filed against it would be gone.
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/The record was saved, but its deed could not be filed/)).toBeVisible();
    // It must name where the paper can be added, or "could not be filed" is a
    // dead end.
    await expect(drawer.getByText(/Papers/)).toBeVisible();

    // The primary button is now a way out, not a second save — press it again
    // and the same parcel would be filed twice.
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add record' })).toHaveCount(0);

    // Even Escape asks here, and for a different reason than a half-typed
    // record: the work is saved, and it is the NOTICE that cannot be recovered.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Close this notice?' })).toBeVisible();
    await page.locator('.dlg').getByRole('button', { name: 'Keep it open' }).click();
    await expect(drawer.getByText(/its deed could not be filed/)).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).toHaveCount(0);

    // Exactly one. The retained savedId is what makes the second press a close
    // instead of a duplicate parcel.
    const out = await gql(request, `{ web { properties { cards { title } } } }`);
    const filefail = ((out?.properties?.cards ?? []) as { title: string }[])
      .filter((c) => c.title.includes('FILEFAIL'));
    expect(filefail).toHaveLength(1);
  });
});
