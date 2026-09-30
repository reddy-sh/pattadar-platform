/**
 * Combined views · made, read, changed and unmade through the real UI.
 *
 * A combined property is several records an owner holds as one piece of ground.
 * The feature is only safe if two things are true at once, so both are asserted
 * here rather than argued for in a comment:
 *
 *   · the holding works — it is created from a selection, it totals its members,
 *     it gathers their papers and services, it takes a cost against the whole of
 *     it, its membership can be changed and it can be ungrouped;
 *   · the RECORDS are untouched by every one of those — after ungrouping, the
 *     members are still on Properties with their own extents and their own
 *     papers, and the portfolio never counted their acres twice.
 *
 * Two seeded records are used, both held in the owner's own name: Sy 88 (30.00
 * ac, khata 30877) and Sy 331/2 (4.53 ac, khata 20455). Boundaries are set on
 * them through GraphQL for the map test and cleared afterwards, which is what
 * this suite already does to set a state up — the seed deliberately gives a
 * boundary only to a record that has actually been surveyed, and neither of
 * these has.
 *
 * Everything this file creates is swept in afterEach, including on the failure
 * path: screens.spec.ts asserts the seeded totals, and a holding left behind
 * would break it rather than this.
 */
import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;
type Req = import('@playwright/test').APIRequestContext;

/** Two OWNED seeded records. `p-402-1` and `p-214-2` are `managed`, and
 *  `r-plot12` is `watch`, so none of them may join a holding — which is itself
 *  one of the tests below. */
const BIG = 'w360-p-88';          // Sy 88 · 30.00 ac · khata 30877
const SMALL = 'w360-p-331-2';     // Sy 331/2 · 4.53 ac · khata 20455

const gql = (request: Req, query: string, variables: Record<string, unknown> = {}) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query, variables } })
    .then((r) => r.json());

/** Holdings this file made, swept whether the test passed or failed. */
const MADE: string[] = [];

async function sweep(request: Req): Promise<void> {
  const ids = MADE.splice(0);
  for (const id of ids) {
    try {
      await gql(request, 'mutation D($id:String!){ web { deleteCombinedProperty(id:$id) } }', { id });
    } catch {
      // Nothing here is worth failing a test over; the next run starts clean.
    }
  }
}

/** Set or clear a record's surveyed outline. Used to give two records real
 *  adjoining boundaries for the map test, and to put them back afterwards. */
const setRing = (request: Req, recordId: string, ring: number[]) =>
  gql(request,
    'mutation B($id:String!,$ring:[Float!]!){ web { setBoundary(recordId:$id,ring:$ring) } }',
    { id: recordId, ring });

/** Outlines near Markapur, built in metres so each one matches the extent its
 *  record actually states.
 *
 *  That matters more than it looks: the Measurements panel compares the area of
 *  the drawn outline against the extent on the register, so a fixture that draws
 *  a 4.53-acre parcel as a 30-acre square is not testing the arithmetic, it is
 *  testing a contradiction. 348.4 m square is exactly thirty acres, which is
 *  Sy 88; Sy 331/2 gets the same depth and whatever width its 4.53 acres need.
 */
const M_LON = 111_320 * Math.cos((16.5 * Math.PI) / 180);
const M_LAT = 110_574;
const DEPTH = 348.4;
const SQ_M_PER_ACRE = 4046.8564224;
const plot = (eastM: number, widthM: number): number[] => {
  const x0 = eastM / M_LON;
  const x1 = (eastM + widthM) / M_LON;
  const y = DEPTH / M_LAT;
  return [
    16.5, 79.4 + x0,
    16.5, 79.4 + x1,
    16.5 + y, 79.4 + x1,
    16.5 + y, 79.4 + x0,
  ];
};
/** Sy 88 is 30.00 ac; Sy 331/2 is 4.53 ac. */
const BIG_W = DEPTH;
const SMALL_W = (4.53 * SQ_M_PER_ACRE) / DEPTH;

/** Select records on Properties by their visible title. */
async function select(page: Pg, titles: string[]): Promise<void> {
  await page.goto('/app/properties?view=list');
  await expect(page.locator('table.rectable tbody tr').first()).toBeVisible();
  for (const title of titles) {
    await page.getByRole('checkbox', { name: `Select ${title}` }).check();
  }
}

/** Make a holding through the UI and return its id from the URL it lands on.
 *
 *  Waits for the holding's own <h1>, not just the URL: the page is a lazy chunk,
 *  so between the address changing and that chunk arriving the Properties list is
 *  still the tree on screen — and a click in that window lands on the list's
 *  controls instead of the holding's. */
async function combine(page: Pg, titles: string[], name: string): Promise<string> {
  await select(page, titles);
  await page.getByRole('button', { name: 'Combine…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Combine into one view' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('What do you call it').fill(name);
  await dialog.getByRole('button', { name: /^Combine \d+ records$/ }).click();
  await page.waitForURL(/\/app\/combined\/cp-/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const id = page.url().split('/app/combined/')[1].split(/[/?]/)[0];
  MADE.push(id);
  return id;
}

/** The portfolio line above the Properties grid — "9 records · 45.01 ac · …".
 *  Read before and after so the test asserts that combining changes NOTHING
 *  about it, rather than hard-coding a total this suite's seed owns. */
async function portfolioLine(page: Pg): Promise<string> {
  await page.goto('/app/properties?view=list');
  const line = page.locator('main .note.num').first();
  await expect(line).toBeVisible();
  return (await line.textContent()) ?? '';
}

test.afterEach(async ({ request }) => { await sweep(request); });

test.describe('Combined views', () => {
  test('two records become one holding, and the records are untouched', async ({ page }) => {
    const before = await portfolioLine(page);
    const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Kondapur Estate');

    // The holding's own page: its name, and the sum of its members' extents.
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Kondapur Estate' })).toBeVisible();
    // The extent pill carries the extent and NOTHING else. The record count
    // belongs to the tab strip and the totals; three copies of "2 records" in
    // four lines is what this assertion exists to keep out.
    await expect(page.locator('.rechead-extent')).toHaveText('34.53 ac');
    await expect(page.locator('.rechead-kind')).toHaveText('COMBINED VIEW');

    // Overview names both members and links to the records themselves.
    await expect(page.getByRole('link', { name: 'Sy 88' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sy 331/2' })).toBeVisible();
    // The totals say what they are in one line, not in a card of rationale.
    await expect(page.getByText(/2 records · 0 of 2 with boundaries/)).toBeVisible();
    // An empty figure reads as "Nothing yet", never as a dash with a footnote.
    await expect(page.getByText('Nothing yet').first()).toBeVisible();

    // Surveys lists them as a table, with what each still owes.
    await page.getByRole('link', { name: /^Records/ }).click();
    await expect(page.locator('table.rectable tbody tr')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Records in this view' })).toBeVisible();

    // It is in the list screen, and the rail entry reaches it.
    await page.goto('/app/combined');
    await expect(page.getByRole('link', { name: 'E2E Kondapur Estate' })).toBeVisible();
    await expect(page.getByText('34.53 ac', { exact: false })).toBeVisible();

    // The records are unchanged: still on Properties, still their own extents.
    await page.goto('/app/properties?view=list');
    const row = page.locator('table.rectable tbody tr', { hasText: 'Sy 88' });
    await expect(row).toContainText('30.00 ac');
    await expect(page.locator('table.rectable tbody tr', { hasText: 'Sy 331/2' }))
      .toContainText('4.53 ac');

    // And the portfolio has not counted those acres twice: the record count, the
    // extent and the valuation above the grid are exactly what they were before
    // the holding existed. This is the invariant the whole design rests on.
    expect(await portfolioLine(page)).toBe(before);
    expect(before).toContain('9 properties');
  });

  test('all six holding tabs declare one layout owner', async ({ page }) => {
    const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Tab Layout Holding');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [path, layout] of [
      ['', 'document'],
      ['surveys', 'document'],
      ['papers', 'document'],
      ['fmb', 'split-instrument'],
      ['expenses', 'document'],
      ['services', 'document'],
    ] as const) {
      await page.goto(`/app/combined/${id}${path ? `/${path}` : ''}`);
      const main = page.locator('.w360 main');
      await expect(main).toHaveAttribute('data-tab-layout', layout);
      await expect(main.locator('main')).toHaveCount(0);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `combined ${path || 'overview'} at 390px`).toBeLessThanOrEqual(1);
    }
  });

  test('a holding refuses land held for somebody else, and one record is not a holding',
    async ({ page }) => {
      // One record: the control says what it needs rather than disappearing.
      await select(page, ['Sy 88']);
      await expect(page.getByRole('button', { name: 'Select 2 or more to combine' })).toBeDisabled();

      // Land this account only looks after is left out, and said so out loud.
      await select(page, ['Sy 88', 'Sy 402/1']);
      await page.getByRole('button', { name: 'Combine…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Combine into one view' });
      await expect(dialog).toContainText('not held in your own name');
      await expect(dialog).toContainText('Sy 402/1');
      // …so what is left is one record, and the dialog will not file it.
      await expect(dialog).toContainText('needs at least two records');
      await dialog.getByLabel('What do you call it').fill('E2E Should Not Exist');
      await expect(dialog.getByRole('button', { name: /^Combine \d+ records$/ })).toBeDisabled();
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      await page.goto('/app/combined');
      await expect(page.getByRole('link', { name: 'E2E Should Not Exist' })).toHaveCount(0);
    });

  test('one record cannot be in two holdings', async ({ page }) => {
    await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E First Holding');

    await select(page, ['Sy 88', 'Sy 189/1a']);
    await page.getByRole('button', { name: 'Combine…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Combine into one view' });
    await dialog.getByLabel('What do you call it').fill('E2E Second Holding');
    await dialog.getByRole('button', { name: /^Combine \d+ records$/ }).click();
    // Refused, and the dialog stays open saying why rather than closing on a
    // holding that was never created.
    await expect(dialog).toContainText('part of another combined view');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.goto('/app/combined');
    await expect(page.getByRole('link', { name: 'E2E Second Holding' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'E2E First Holding' })).toBeVisible();
  });

  test('a cost against the whole holding is recorded, read back and removed',
    async ({ page }) => {
      const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Cost Holding');
      await page.goto(`/app/combined/${id}/expenses`);

      // Exactly one control opens this flow, on the tab that owns it.
      await expect(page.getByRole('button', { name: 'Record a cost' })).toHaveCount(1);
      await page.getByRole('button', { name: 'Record a cost' }).click();
      const dialog = page.getByRole('dialog', { name: 'Record a shared cost' });
      await expect(dialog).toContainText('not divided between its records');
      await dialog.getByLabel('What was it').fill('E2E Boundary fence');
      await dialog.getByLabel('How much (₹)').fill('180000');
      await dialog.getByLabel('When').fill('2026-08-12');
      await dialog.getByRole('button', { name: 'One-off work' }).click();
      await dialog.getByRole('button', { name: 'Record cost' }).click();
      await expect(dialog).toBeHidden();

      // Read back after a reload, so nothing passes on optimistic state.
      await page.reload();
      const row = page.locator('table.rectable tbody tr', { hasText: 'E2E Boundary fence' });
      await expect(row).toBeVisible();
      await expect(row).toContainText('12/08/2026');
      await expect(row).toContainText('Shared cost');

      // The holding's total moved; the records' own ledgers did not.
      await page.goto(`/app/records/${BIG}/expenses`);
      await expect(page.getByText('E2E Boundary fence')).toHaveCount(0);

      // Remove it again.
      await page.goto(`/app/combined/${id}/expenses`);
      await page.locator('table.rectable tbody tr', { hasText: 'E2E Boundary fence' })
        .getByRole('button', { name: 'Remove' }).click();
      await page.reload();
      await expect(page.getByText('E2E Boundary fence')).toHaveCount(0);
    });

  test('papers and services are gathered and still name their own survey',
    async ({ page }) => {
      const id = await combine(page, ['Sy 214/3', 'Sy 189/1a'], 'E2E Paper Holding');

      await page.goto(`/app/combined/${id}/papers`);
      await expect(page.getByRole('heading', { name: 'All documents in this view' }))
        .toBeVisible();
      // The seed files papers against both of these records, and the point of a
      // gathered list is that every row still says which survey it belongs to.
      const rows = page.locator('.rows.boxed > .row');
      await expect(rows.first()).toBeVisible();
      await expect(rows.first().getByRole('link', { name: /^Sy / })).toBeVisible();
      // Both members are represented, so this is a union and not one record's list.
      await expect(rows.filter({ hasText: 'Sy 214/3' }).first()).toBeVisible();
      await expect(rows.filter({ hasText: 'Sy 189/1a' }).first()).toBeVisible();

      await page.goto(`/app/combined/${id}/services`);
      await expect(page.getByRole('heading', { name: 'Services on these records' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Which services' })).toBeVisible();
    });

  test('adjoining surveys share one map, and it measures them', async ({ page, request }) => {
      // Sy 331/2 starts exactly where Sy 88 ends, so they share the full
      // 348.4 m edge — the case this whole feature was asked for.
      await setRing(request, BIG, plot(0, BIG_W));
      await setRing(request, SMALL, plot(BIG_W, SMALL_W));
      try {
        const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Map Holding');
        await page.goto(`/app/combined/${id}/fmb`);

        // ONE map, with both surveys in it — drawn as two outlines, so the
        // boundary between them stays on the picture.
        const stage = page.locator('.pf-stage');
        await expect(stage).toHaveCount(1);
        await expect(stage.locator('.leaflet-container')).toHaveCount(1);
        await expect(stage.locator('svg path.w-ring.pf-survey')).toHaveCount(2);
        await expect(stage.locator('svg path.pf-shape')).toHaveCount(0);
        // The shared map uses the record Location grammar for EACH survey:
        // orange outline, four corner letters, and four side measurements.
        await expect(stage.locator('.w-corner-no')).toHaveCount(8);
        await expect(stage.locator('.w-corner-no')).toHaveText([
          'A', 'B', 'C', 'D', 'A', 'B', 'C', 'D',
        ]);
        await expect(stage.locator('.w-side')).toHaveCount(8);
        await expect(stage.locator('.w-side').first()).toContainText(/m$/);

        // The measurements are BESIDE the map, not in a table under it: the
        // figures for the land you are looking at must not be below the fold.
        const rail = page.locator('.pf-results');
        // Two surveys shown: ONE aggregate panel — the summed figures — not a
        // stack of full side tables.
        await expect(rail.getByText('2 boundaries shown')).toBeVisible();
        await expect(rail.locator('table.sidetable')).toHaveCount(0);
        await expect(rail).toContainText('Measured');
        await expect(rail).toContainText('On record');
        // Both surveys are listed under the sum, as rows to zoom to.
        await expect(rail.getByRole('button', { name: /Sy 88/ })).toBeVisible();
        await expect(rail.getByRole('button', { name: /Sy 331\/2/ })).toBeVisible();

        // Narrow to one survey: now it is the record's OWN Measurements card,
        // with the same card, unit switch, area treatment, comparison copy and
        // side table. Only the explicitly unwanted "Approximate measurements"
        // line is omitted.
        await page.getByRole('button', { name: 'Which boundaries to show' }).click();
        await page.getByRole('menuitemcheckbox', { name: 'Sy 331/2' }).click();
        await page.keyboard.press('Escape');
        await expect(stage.locator('svg path.w-ring.pf-survey')).toHaveCount(1);
        await expect(stage.locator('.w-corner-no')).toHaveCount(4);
        await expect(stage.locator('.w-side')).toHaveCount(4);
        const measurements = rail.locator('.card');
        await expect(measurements.getByRole('heading', { name: 'Measurements' })).toBeVisible();
        const units = measurements.getByRole('group', { name: 'Length unit' });
        await expect(units.getByRole('button', { name: 'Metres' })).toHaveAttribute('aria-pressed', 'true');
        await expect(measurements.locator('table.sidetable')).toHaveCount(1);
        await expect(measurements.getByRole('columnheader', { name: 'Direction' })).toBeVisible();
        await expect(measurements).toContainText(/Within 0\.\d% of the extent on record/);
        await expect(measurements).not.toContainText('Approximate measurements from the saved outline');
        await units.getByRole('button', { name: 'Feet' }).click();
        await expect(units.getByRole('button', { name: 'Feet' })).toHaveAttribute('aria-pressed', 'true');
        await expect(measurements.locator('table.sidetable tbody')).toContainText('ft');
        await expect(measurements.locator('table.sidetable tbody')).not.toContainText(/\d m(?:\s|$)/);
        await expect(stage.locator('.w-side')).toHaveCount(4);
        await expect(stage.locator('.w-side').first()).toContainText(/ft$/);

        // The map is a map, and the page does not open with a band of nothing
        // under it. `.pf-body` used to sit inside `.pf`, whose empty `1fr` row
        // claimed the rest of the window — invisible to every other assertion
        // here, which is why this one measures the box.
        const box = await stage.boundingBox();
        expect(box!.height).toBeGreaterThan(400);
        // No band of dead page under the map: the next thing down is close to it.
        const relations = page.getByRole('heading', { name: 'Shared edges' });
        const gapBelow = (await relations.boundingBox())!.y - (box!.y + box!.height);
        expect(gapBelow).toBeLessThan(120);

        // The measurement, in the words the server chose. The capsule is matched
        // exactly: the section heading and the sentence both contain the phrase,
        // and all three being present is the point.
        await expect(page.getByText('Side by side', { exact: true })).toBeVisible();
        await expect(page.getByText(/run together for about/)).toBeVisible();
        await expect(page.getByText('Sy 88 & Sy 331/2')).toBeVisible();
        // These two touch, so the panel is earned. A pair that merely sits apart
        // is reported in the caption instead of in a panel of its own.
        await expect(relations).toBeVisible();

        // And the caption that must never stop being on this screen. Once —
        // the second paragraph repeating it was removed, not the claim.
        await expect(page.getByText(/Not a merged or official FMB/)).toBeVisible();
      } finally {
        await setRing(request, BIG, []);
        await setRing(request, SMALL, []);
      }
    });

  test('surveys miles apart stay on one map, with the numbers beside them',
    async ({ page, request }) => {
      // A tall viewport makes the old fixed 34rem map expose a large dead band
      // below it. The map/rail row must instead take the page's remaining room.
      await page.setViewportSize({ width: 1512, height: 1400 });
      // Ten kilometres apart. Still one map — the holding is one picture — and
      // what a zoom that fits both cannot show, the legend and the Measurements
      // panel say in figures that do not depend on zoom at all.
      await setRing(request, BIG, plot(0, BIG_W));
      await setRing(request, SMALL, plot(10_000, SMALL_W));
      try {
        const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Apart Holding');
        await page.goto(`/app/combined/${id}/fmb`);

        // One map, both outlines in it, with the same surveyed-boundary
        // treatment as each record's own Location screen.
        const stage = page.locator('.pf-stage');
        await expect(stage).toHaveCount(1);
        await expect(stage.locator('.leaflet-container')).toHaveCount(1);
        await expect(stage.locator('svg path.w-ring.pf-survey')).toHaveCount(2);
        await expect(stage.locator('.w-corner-no')).toHaveCount(8);
        await expect(stage.locator('.w-side')).toHaveCount(8);

        // Both selected → the aggregate panel names every survey, whatever the
        // map can show at a zoom that fits both.
        const rail = page.locator('.pf-results');
        await expect(rail.getByText('2 boundaries shown')).toBeVisible();
        await expect(rail.getByRole('button', { name: /Sy 88/ })).toBeVisible();
        await expect(rail.getByRole('button', { name: /Sy 331\/2/ })).toBeVisible();

        // Which surveys are on the map is chosen from a dropdown where the
        // section's actions live — all on to begin with, and multi-select.
        const chooser = page.getByRole('button', { name: 'Which boundaries to show' });
        await expect(chooser).toContainText('All 2 boundaries');
        await chooser.click();
        // Untick one: it leaves both the map and the rail.
        await page.getByRole('menuitemcheckbox', { name: 'Sy 331/2' }).click();
        await expect(stage.locator('svg path.w-ring.pf-survey')).toHaveCount(1);
        await expect(stage.locator('.w-corner-no')).toHaveCount(4);
        await expect(stage.locator('.w-side')).toHaveCount(4);
        await expect(page.locator('.pf-results table.sidetable')).toHaveCount(1);
        await expect(chooser).toContainText('1 of 2 boundaries');
        // "All 2" puts them back in one press, and the dropdown stays open while
        // ticking — it is a multi-select, not a menu that closes on a choice.
        await page.getByRole('menuitemcheckbox', { name: 'All 2' }).click();
        await expect(stage.locator('svg path.w-ring.pf-survey')).toHaveCount(2);
        await expect(stage.locator('.w-corner-no')).toHaveCount(8);
        await expect(stage.locator('.w-side')).toHaveCount(8);
        // Close it and the distance is in the caption, not a panel of its own.
        await page.keyboard.press('Escape');
        await expect(page.getByText(/apart\. Not a merged or official FMB/)).toBeVisible();

        // With every survey drawn and the pair apart, no content card follows
        // the map to hide a height bug. Map and rail fill to the page's bottom
        // padding together; the rest of the viewport is not an empty band.
        await expect(page.getByRole('heading', { name: 'Shared edges' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Not on the map yet' })).toHaveCount(0);
        const [mapBox, railBox] = await Promise.all([
          stage.boundingBox(),
          rail.boundingBox(),
        ]);
        expect(mapBox!.height).toBeGreaterThan(400);
        expect(Math.abs(
          mapBox!.y + mapBox!.height - (railBox!.y + railBox!.height),
        )).toBeLessThanOrEqual(1);
        const viewportGap = page.viewportSize()!.height - (mapBox!.y + mapBox!.height);
        expect(viewportGap).toBeGreaterThanOrEqual(0);
        expect(viewportGap).toBeLessThan(120);
      } finally {
        await setRing(request, BIG, []);
        await setRing(request, SMALL, []);
      }
    });

  test('membership is changed, and ungrouping keeps every record', async ({ page }) => {
    const id = await combine(page, ['Sy 88', 'Sy 331/2'], 'E2E Edit Holding');

    // Rename and swap a member out in one save.
    await page.getByRole('button', { name: 'Actions for E2E Edit Holding' }).click();
    await page.getByRole('menuitem', { name: 'Edit name & records' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit E2E Edit Holding' });
    await edit.getByLabel('What do you call it').fill('E2E Renamed Holding');
    await edit.getByRole('checkbox', { name: /Sy 331\/2/ }).uncheck();
    await edit.getByRole('checkbox', { name: /Sy 189\/1a/ }).check();
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Renamed Holding' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sy 189/1a' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sy 331/2' })).toHaveCount(0);
    // The record that left is on its own again, unchanged.
    await page.goto('/app/properties?view=list');
    await expect(page.locator('table.rectable tbody tr', { hasText: 'Sy 331/2' }))
      .toContainText('4.53 ac');

    // Ungroup, and read the promise the dialog makes before agreeing to it.
    await page.goto(`/app/combined/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Renamed Holding' })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for E2E Renamed Holding' }).click();
    await page.getByRole('menuitem', { name: 'Remove this combined view' }).click();
    const bye = page.getByRole('dialog', { name: 'Remove the combined view E2E Renamed Holding?' });
    await expect(bye).toContainText('go back to standing on');
    // What survives, named — this is the promise the button is agreed against.
    await expect(bye).toContainText('Papers, boundaries, photographs, people');
    await expect(bye).toContainText('each record’s own costs all stay');
    await bye.getByRole('button', { name: 'Remove' }).click();
    await page.waitForURL('**/app/combined');
    await expect(page.getByRole('link', { name: 'E2E Renamed Holding' })).toHaveCount(0);

    // Both records survive with their extents and are still openable.
    await page.goto(`/app/records/${BIG}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 88' })).toBeVisible();
    await page.goto('/app/properties?view=list');
    await expect(page.locator('table.rectable tbody tr', { hasText: 'Sy 88' }))
      .toContainText('30.00 ac');
    await expect(page.locator('table.rectable tbody tr', { hasText: 'Sy 189/1a' }))
      .toContainText('2.05 ac');
  });
});
