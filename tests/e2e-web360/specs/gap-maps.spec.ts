/**
 * The map surfaces — three things the ground truth of this app depends on, and
 * none of them had a test that runs.
 *
 *   · REMOVING a saved boundary. `saveDraft([], 'Removing the boundary…')`
 *     (RecordBoundary.tsx:917) writes an empty ring over parcels.boundary and
 *     there is no history row behind it, so the corners a surveyor walked are
 *     gone for good. Nothing in the nine specs calls setBoundary with an empty
 *     ring, so neither half was covered: that the removal really reaches the
 *     database (the passing test), nor that ONE unconfirmed click is all that
 *     stands in front of it (the test.fail one — the app's own standard for a
 *     destructive act is "delete asks a second time before it takes the photo",
 *     crud-360.spec.ts:318).
 *
 *   · The OFFLINE-TILE notice. screens.spec.ts:890 waits for "Map tiles could
 *     not be reached", a string that appears nowhere in apps/ — so the only
 *     default-suite test of the field-with-no-signal case can only time out,
 *     and its two later assertions (the ring survives, the notice keeps off the
 *     attribution) have never once executed. The strings the app actually
 *     renders are at MapCanvas.tsx:1529-1535; the satellite one is asserted
 *     only in map-drawing.spec.ts, which playwright.config.ts testIgnores, and
 *     the street one in no spec at all. This file asserts both, from a cold
 *     start with every tile aborted, which is the case MapCanvas was written
 *     for.
 *
 *   · ADOPTING a village plot onto a record that already exists — the "Or give
 *     it to a record in this village" list (VillageMaps.tsx:1209-1240). The
 *     sibling entry point, "File this as a new property", is clicked at
 *     crud-360.spec.ts:1668 but asserts only the resulting URL, never that a
 *     shape landed. `linkTo` (:521) navigates on the mutation's answer, and its
 *     own comment names the bug that taught it to: "a refused write answers
 *     false rather than throwing", which "is how a boundary that was never
 *     saved came to look saved". So a redirect is not evidence here; the ring
 *     read back from the API is.
 *
 * Every scratch record is registered in MADE and deleted in afterEach, never at
 * the end of a test body — Playwright abandons a test at its first failed
 * assertion, and these specs run before screens.spec.ts, which asserts the
 * seeded totals. See crud-360.spec.ts:30 for the failure that taught the suite.
 */
import { expect, test, TILE_HOSTS, NOMINATIM } from './harness';

type Pg = import('@playwright/test').Page;
type Req = import('@playwright/test').APIRequestContext;

const GQL = '/api/gateway/pattadar/graphql';

/** The seeded surveyed record. Read-only here — a dozen assertions elsewhere
 *  depend on its ring, so nothing in this file writes to it. */
const PARCEL = 'w360-p-214-2';

const gql = (request: Req, query: string, variables: Record<string, unknown> = {}) =>
  request.post(GQL, { data: { query, variables } }).then((r) => r.json());

/** Scratch records this file made, swept in afterEach so the sweep also runs
 *  on the failure path — which is exactly when a leak does its damage. */
const MADE: string[] = [];

async function sweepMade(request: Req): Promise<void> {
  const ids = MADE.splice(0);
  if (!ids.length) return;
  try {
    await gql(request, 'mutation D($ids:[String!]!) { web { deleteRecords(ids:$ids) } }', { ids });
  } catch {
    // A failing cleanup must not redden a passing test nor mask a real failure;
    // global-setup's purge-e2e-records sweeps `rec-` ids on the next run.
  }
}

test.afterEach(async ({ request }) => { await sweepMade(request); });

/** File a parcel and register it for sweeping. */
async function makeParcel(request: Req, input: Record<string, unknown>): Promise<string> {
  const out = await gql(request, 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }', {
    input: {
      kind: 'parcel', classification: 'agri', status: 'owned', stake: 'owned',
      extent: 2, extentUnit: 'ac', ...input,
    },
  });
  const id = out?.data?.web?.saveRecord as string;
  expect(id, 'the fixture record was not created').toBeTruthy();
  MADE.push(id);
  return id;
}

/** The ring as the API holds it: a flat [lat, lon, lat, lon, …]. The screen can
 *  only be trusted about a write once this agrees with it. */
async function ringOf(request: Req, id: string): Promise<number[]> {
  const out = await gql(request, 'query B($id:String!) { web { boundary(recordId:$id) { ring } } }', { id });
  return (out?.data?.web?.boundary?.ring ?? []) as number[];
}

/** A four-corner field near Kothapalli, big enough to pass checkBoundaryDraft. */
const RING = [17.0782, 82.1380, 17.0782, 82.1392, 17.0770, 82.1392, 17.0770, 82.1380];

/** No screen may reach the user with a console error on it. Tiles and the
 *  geocoder are exempt: a dead <img> is reported to Chromium as a console
 *  error, and the offline test below aborts every tile on purpose. */
function watchConsole(page: Pg): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    const where = m.location()?.url ?? '';
    const fromNetwork = TILE_HOSTS.test(m.text()) || TILE_HOSTS.test(where)
      || NOMINATIM.test(m.text()) || NOMINATIM.test(where);
    if (m.type() === 'error' && !m.text().includes('favicon') && !fromNetwork) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('removing a saved boundary', () => {
  /** Its own record every time. Wiping w360-p-214-2's ring would take a dozen
   *  other assertions down with it, and the removal under test is irreversible. */
  const surveyed = (request: Req, title: string) =>
    makeParcel(request, {
      title, khataNo: '10021', ownerName: 'Boundary Test',
      village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
    }).then(async (id) => {
      const set = await gql(request, 'mutation SB($r:String!,$g:[Float!]!) { web { setBoundary(recordId:$r,ring:$g) } }',
        { r: id, g: RING });
      expect(set?.data?.web?.setBoundary, 'the fixture ring was refused').toBe(true);
      return id;
    });

  test('a boundary removed from the edit bar leaves the record, not just the screen', async ({ page, request }) => {
    const id = await surveyed(request, 'Sy 996/1');
    await page.goto(`/app/records/${id}/map`);

    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
    // Measurements only render for a surveyed record (RecordBoundary.tsx:579),
    // so their presence here and absence at the end is the screen's own answer
    // to "is this record surveyed", read twice.
    await expect(page.locator('.card', { hasText: 'Measurements' })).toBeVisible();

    // The removal lives inside draw mode: the header starts the job, the edit
    // bar finishes it.
    await page.getByRole('button', { name: 'Redraw boundary', exact: true }).click();
    const remove = page.locator('.editbar').getByRole('button', { name: 'Remove saved boundary', exact: true });
    await expect(remove).toBeEnabled();
    await remove.click();

    await expect(page.locator('path.w-ring')).toHaveCount(0);
    await expect(page.locator('.card', { hasText: 'Measurements' })).toHaveCount(0);

    // The screen going blank is not the claim being tested. setBoundary answers
    // `false` on a refused write instead of throwing (RecordBoundary.tsx:216),
    // so only the API's own answer distinguishes a removal from a no-op that
    // merely looked like one.
    expect(await ringOf(request, id)).toEqual([]);

    await page.reload();
    await expect(page.locator('path.w-ring')).toHaveCount(0, { timeout: 20_000 });
    expect(await ringOf(request, id), 'the wipe must be durable, not an optimistic cache').toEqual([]);

    // The record is unsurveyed now, and the controls must say so: the header
    // button offers to draw rather than redraw, and there is no longer a
    // destructive button sitting in the bar with nothing left to destroy.
    await expect(page.getByRole('button', { name: 'Draw boundary', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
    await expect(page.locator('.editbar').getByRole('button', { name: 'Remove saved boundary', exact: true }))
      .toHaveCount(0);
  });

  test('a surveyed ring survives the first click on Remove saved boundary, and is only wiped after a second, deliberate one', async ({ page, request }) => {
    // DEFECT: apps/web/src/w360/pages/RecordBoundary.tsx:913-919 wires the
    // danger button straight to `saveDraft([], 'Removing the boundary…')` —
    // one click, no confirmation, no undo. services/api/src/web360.py:4298
    // accepts `ring: []` and overwrites the column with no history row, so the
    // corners are unrecoverable. The app already knows better: the photo
    // gallery asks a second time and offers "Keep it" (crud-360.spec.ts:318),
    // and a record's own Boundary tab calls an overwrite "Replace the boundary
    // with this plot" before it does one. This test goes green the day the same
    // courtesy reaches the most expensive thing on the record.
    test.fail();
    const id = await surveyed(request, 'Sy 996/2');
    await page.goto(`/app/records/${id}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole('button', { name: 'Redraw boundary', exact: true }).click();
    await page.locator('.editbar').getByRole('button', { name: 'Remove saved boundary', exact: true }).click();

    // Asserted against the API rather than the map: the harm is the row, not
    // the pixels. One click must not have written anything yet.
    await expect
      .poll(() => ringOf(request, id).then((r) => r.length),
        { message: 'one unconfirmed click wiped a surveyed ring out of the database' })
      .toBeGreaterThan(0);

    // And the owner must be given the way out, named — "Cancel" already sits in
    // that bar for leaving draw mode, so backing out of a deletion has to be a
    // control of its own or it cannot be told apart from it.
    await expect(page.getByRole('button', { name: /keep it|yes, remove|yes, delete/i })).toBeVisible();
    await expect(page.locator('path.w-ring')).toHaveCount(1);
  });
});

test.describe('the record map with no tiles at all', () => {
  test('with nothing loading, the map names the basemap that failed — on both — and keeps the boundary', async ({ page }) => {
    const errors = watchConsole(page);
    // Registered AFTER the auto stubbedNetwork fixture, so it wins: harness.ts
    // documents this as the supported way to see a tile fail. Aborting rather
    // than 404ing is the real case — a phone in a field, no route to the host.
    await page.route(TILE_HOSTS, (route) => route.abort());

    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

    // The screen opens on satellite (RecordBoundary.tsx:260), so the first
    // notice must name the imagery layer and point at the way out of it.
    const notice = page.locator('.plot .nogeo.low');
    await expect(notice).toContainText('Satellite imagery is unavailable here.', { timeout: 20_000 });
    await expect(notice).toContainText('Try Street view or zoom out.');
    // The sentence that makes the notice safe to ignore — and it has to be true.
    await expect(notice).toContainText('Your saved boundary and any drawing remain visible.');
    await expect(page.locator('path.w-ring')).toHaveCount(1);

    // Falling back is the advice the notice just gave. Following it must change
    // the message, because a notice that says "try the other one" and then says
    // the same thing again has told the owner nothing.
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    await expect(notice).toContainText('Street map tiles are unavailable. Try Satellite or check your connection.',
      { timeout: 20_000 });
    await expect(notice).toContainText('Your saved boundary and any drawing remain visible.');
    // Still drawn on the second basemap: the ring comes off the record, not off
    // the network, which is the whole claim the notice is making.
    await expect(page.locator('path.w-ring')).toHaveCount(1);
    // The caption follows the basemap too, so the attribution names the source
    // actually in use even while it is failing.
    await expect(page.locator('.plot .cap')).toContainText('OpenStreetMap');

    // The notice is ~85px tall and lands in the corner the caption occupies.
    // The caption carries the tile attribution, which is a licence condition:
    // an error message must not paint over it. This is the geometric check
    // screens.spec.ts:896-901 wanted and has never reached.
    const note = (await notice.boundingBox())!;
    const cap = (await page.locator('.plot .cap').boundingBox())!;
    expect(note.y + note.height, 'the offline notice must sit above the caption')
      .toBeLessThanOrEqual(cap.y + 1);

    expect(errors).toEqual([]);
  });
});

test.describe('handing a village plot to a record that already exists', () => {
  /** MARRIPALEM ships at apps/web/public/vm/marripalem.geojson; the seed's own
   *  records are all in Kothapalli, Chinnapuram and Peddapuram, so the adopt
   *  list is empty there until this test files something into the village. */
  const VILLAGE = 'MARRIPALEM';
  /** The plot to hand over, and the fixture's own number. They must differ: a
   *  record numbered 839 would be matched as the plot's owner (VillageMaps.tsx
   *  :366) and the whole adopt block is gated on `!record` (:1209). */
  const PLOT = '839';
  const FIXTURE_NO = '845';

  const open = async (page: Pg) => {
    await page.goto('/app/villages');
    await expect(page.getByRole('heading', { name: /Villages on record/ })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) }).click();
    await expect(page.locator('.vc-badge')).toContainText(VILLAGE, { timeout: 30_000 });
    await page.locator('#vm-goto').fill(PLOT);
    await page.locator('#vm-goto').press('Enter');
    return page.locator('.card', { hasText: 'Selected plot' });
  };

  test('a village plot can be given to a record that already exists, and the record comes back wearing that shape', async ({ page, request }) => {
    // Two full village loads (998 plots, then a canvas pass) plus a record map.
    test.slow();
    const id = await makeParcel(request, {
      title: FIXTURE_NO, khataNo: '10099', ownerName: 'Adopt Test',
      village: VILLAGE, mandal: 'Markapur', district: 'Prakasam',
    });
    expect(await ringOf(request, id), 'the fixture must start with no boundary').toEqual([]);

    const card = await open(page);
    // The precondition for the whole block: the plot belongs to nobody the
    // account knows, so it is offered rather than merely reported.
    await expect(card).toContainText('Not one of your records');
    await expect(card.getByText('Or give it to a record in this village')).toBeVisible();
    // The count note is how an owner knows the list is not the whole story —
    // it is capped, and ordered by how near each record's number is to the plot
    // in hand, so in a village with fifteen parcels the right one is on top.
    await expect(card.locator('.note', { hasText: 'nearest number first' })).toContainText('1 record');

    // The centroid the screen is showing, read before the click: the shape that
    // lands on the record has to be THIS plot's, not whichever was last drawn.
    const centre = ((await card.locator('.vm-facts .num').first().textContent()) ?? '')
      .split(',').map((n) => Number(n.trim()));
    expect(centre).toHaveLength(2);

    // Scoped to the Selected plot card: `.vm-list` is also the class on the
    // "All plots" list further down, and an unscoped match hits both.
    await card.locator('.vm-list .villagerow', { hasText: FIXTURE_NO }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${id}/map`), { timeout: 30_000 });
    // Arriving at the map is not evidence. linkTo navigates on the mutation's
    // answer, and its own comment names the bug: a refused write answers false
    // rather than throwing, "which is how a boundary that was never saved came
    // to look saved". So the ring is read back from the API as well as drawn.
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
    const ring = await ringOf(request, id);
    expect(ring.length, 'a polygon needs at least three corners').toBeGreaterThanOrEqual(6);
    expect(ring.length % 2, 'the ring is stored flat, lat/lon paired').toBe(0);
    // Within a plot's own width of the centroid the village screen printed —
    // the shape that arrived is the shape that was offered.
    expect(Math.abs(ring[0] - centre[0])).toBeLessThan(0.05);
    expect(Math.abs(ring[1] - centre[1])).toBeLessThan(0.05);

    // `adoptable` filters on ring.length === 0 (VillageMaps.tsx:560), which is
    // what stops a surveyed record being silently overwritten by the next plot
    // somebody selects. Now that the fixture carries a ring it must be gone —
    // and with nothing else in the village, the whole block goes with it.
    const again = await open(page);
    await expect(again).toContainText('Not one of your records');
    await expect(again.getByText('Or give it to a record in this village')).toHaveCount(0);
    await expect(again.locator('.vm-list .villagerow', { hasText: FIXTURE_NO })).toHaveCount(0);
  });
});
