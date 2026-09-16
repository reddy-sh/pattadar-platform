/**
 * W03 · one record — the 360 frame, its header, its hangers and its writes.
 *
 * `/app/records/:id` is two components wearing one URL. `pages/Record.tsx` is
 * the frame: it asks for the record, and it is the only thing on the route
 * that decides between "still coming", "not yours", "would not load" and "here
 * it is". Everything under it — the hero, the six hangers, the kebab, the
 * drawer — hangs off the record it hands down through the outlet, and lives in
 * `pages/RecordPapers.tsx` (the index hanger) and `pages/PropertyActions.tsx`
 * (the write surfaces). This file covers all three, plus the audit hanger in
 * `pages/Orders.tsx`, because from the reader's chair they are one screen.
 *
 * Two things worth knowing before changing anything here.
 *
 * The world answers `record` with a FUNCTION of the id (fixtures/seed.ts), so
 * `world.seedOf('record')` cannot hand it back. Scenarios that need a record
 * shaped differently — for sale, unvalued, measured in square yards — set a
 * whole detail from the two builders below rather than patching the seed. The
 * builders spell `extentUnit` the way services/api/src/web360.py spells it,
 * `ac` / `sq.yd` / `sq.ft`, because the extent cell and the drawer's unit box
 * both branch on exactly those three strings.
 *
 * And the six hangers in the tab strip are not all nine children of the route.
 * Map, Photos and Expenses are reached from the rail and the cards rather than
 * from the strip, and they are asserted here as URLs on the same frame.
 *
 * Four `test.fail()`s record defects this suite found; each names its cause and
 * what the owner is owed instead.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

const at = (id: string, hanger = '') => `/app/records/${id}${hanger ? `/${hanger}` : ''}`;

/** Every field `Q_RECORD` selects, for the surveyed parcel. Mirrors the shape
 *  `recordOf` builds in fixtures/seed.ts — a field left out of here arrives as
 *  `undefined` and the screen draws it, which is the bug this suite exists to
 *  catch rather than to produce. */
const PARCEL = {
  id: ID.parcel,
  kind: 'parcel',
  title: 'Sy 214/2',
  eyebrow: 'Agricultural land',
  classification: 'Dry land',
  status: 'owned',
  stake: 'owned',
  khataNo: '1042',
  ownerName: 'Telukutla Shankar Reddy',
  village: 'Katragunta',
  mandal: 'Markapur',
  district: 'Prakasam',
  placeLine: 'Katragunta, Markapur, Prakasam',
  placeLineTe: 'కత్రగుంట, మార్కాపురం, ప్రకాశం',
  state: 'Andhra Pradesh',
  extent: 4.3,
  extentUnit: 'ac',
  extentDetail: '4 acres 12 guntas',
  marketValue: 8_600_000,
  perUnitValue: 2_000_000,
  perUnitLabel: 'per acre',
  boughtYear: '1998',
  lat: 15.7406698,
  lon: 79.2698502,
  ring: [15.7410, 79.2694, 15.7410, 79.2704, 15.7402, 79.2704, 15.7402, 79.2694],
  mapCaption: 'Walked 12 Aug 2026 · 8 corners',
  paperCount: 12,
  featureCount: 14,
  peopleCount: 3,
  serviceCount: 2,
  photoCount: 18,
  photoNote: 'Last visit 12 Aug 2026',
  tags: ['ancestral'],
  noteBody: 'The eastern boundary is disputed with the adjoining survey.',
  noteAuthor: 'Shankar Reddy',
  noteAt: '2026-08-14',
};

/** The built property, in the unit a shop filed with no built-up area actually
 *  carries: square yards. The reclassification scenario below turns on it.
 *
 *  `kind` is 'property' and `classification` one of flat / shop / open_plot,
 *  because that is what the server sends: web360.py:1363-1367 writes
 *  `"kind": "property"` for every row out of the properties table and takes the
 *  classification from its `type` column. fixtures/seed.ts spells them 'flat'
 *  and 'Residential', which no server path emits — and the difference is not
 *  cosmetic here, because `kind` is the one field the drawer sends on EVERY
 *  save (PropertyActions.tsx:367) and `classification` decides which Type chip
 *  is pressed when it opens. */
const FLAT = {
  ...PARCEL,
  id: ID.flat,
  kind: 'property',
  title: 'Flat 4B, Sai Residency',
  eyebrow: 'Built property',
  classification: 'flat',
  khataNo: '',
  village: 'Kukatpally',
  mandal: 'Kukatpally',
  district: 'Hyderabad',
  placeLine: 'Kukatpally, Hyderabad',
  placeLineTe: '',
  extent: 850,
  extentUnit: 'sq.yd',
  extentDetail: '850 sq.yd',
  marketValue: 7_250_000,
  perUnitValue: 5_000,
  perUnitLabel: 'per sft',
  boughtYear: '2019',
  lat: 17.4948,
  lon: 78.3996,
  ring: [],
  mapCaption: 'Never surveyed',
  paperCount: 5,
  featureCount: 0,
  peopleCount: 1,
  serviceCount: 0,
  photoCount: 0,
  photoNote: 'Nothing has been photographed here',
  tags: [],
  noteBody: '',
  noteAuthor: '',
  noteAt: '',
};

const parcel = (over: Record<string, unknown> = {}) => ({ ...PARCEL, ...over });
const flat = (over: Record<string, unknown> = {}) => ({ ...FLAT, ...over });

const tabStrip = (page: Page) =>
  page.getByRole('navigation', { name: 'This record' });

const kebab = (page: Page, title = 'Sy 214/2') =>
  page.getByRole('button', { name: `Actions for ${title}` });

/** One of the four hero figures, found by the word printed above it.
 *
 *  A figure strip expresses no role of its own, and asserting against the strip
 *  as a whole — which is what these tests did first — passes just as happily
 *  with the worth and the rate swapped, because both numbers are somewhere in
 *  the same box. The cell is `Cell` (ui.tsx:397): a `.k` for the word, a `.v`
 *  for the figure and its unit, a `.s` for the line beneath. */
const figure = (page: Page, k: string) =>
  page.locator('.strip > div').filter({ has: page.getByText(k, { exact: true }) });
const figureValue = (page: Page, k: string) => figure(page, k).locator('.v');

// ── the frame ──────────────────────────────────────────────────────────

test.describe('W03 · the frame around every hanger', () => {
  test('opening a record asks the world for that record and draws it', async ({ page, world }) => {
    await page.goto(at(ID.parcel));

    await expect.poll(() => world.asked('record')).toBe(true);
    expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
  });

  test('a record still on its way holds the shape of the page it is becoming', async ({ page, world }) => {
    world.set('record', World.never());
    await page.goto(at(ID.parcel));

    // SkRecordPage, not a 70vh slab: the status region says which screen is
    // arriving, and nothing has claimed a title, a figure or a hanger yet.
    // The extra patience is for the route's own lazy chunk, which the dev
    // server hands over one module at a time — the skeleton cannot be asserted
    // before the code that draws it has arrived.
    await expect(page.getByRole('status', { name: 'Loading this record' }))
      .toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toHaveCount(0);
    await expect(tabStrip(page)).toHaveCount(0);
    await expect(page.getByText('That record is not in your portfolio')).toHaveCount(0);
  });

  test('a record that is not in your portfolio is told so, and not shown a failure', async ({ page }) => {
    await page.goto(at(ID.missing));

    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
    await expect(page.getByText('It may have been archived, or shared with you rather than owned by you.')).toBeVisible();
    // The two facts are different, so the two screens must be. Nothing here
    // may say the read failed.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('This record did not load')).toHaveCount(0);
    // Scoped to the trail: the rail behind it has a Properties link of its own.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Properties' })).toBeVisible();
    // The trail says which of the two answers this is, rather than naming a
    // record the portfolio does not have (Record.tsx:78).
    await expect(crumbs).toContainText('Not found');
  });

  test('a record the server would not answer for says it did not load, not that it is not yours', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(at(ID.parcel));

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('This record did not load');
    await expect(failed).toContainText('Nothing has been lost');
    // Printed verbatim, for whoever is being asked "what does it say?".
    await expect(failed).toContainText('the record store is down');
    await expect(page.getByText('That record is not in your portfolio')).toHaveCount(0);
    // Its trail says "Record", not "Not found" (Record.tsx:70 against :78) —
    // the same distinction the page under it is making, one line up.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('Record');
    await expect(crumbs).not.toContainText('Not found');
    await expect(tabStrip(page)).toHaveCount(0);
  });

  test.describe('a read refused at the transport', () => {
    // A 503 IS the scenario, and Chrome writes every failed response to the
    // console itself ("Failed to load resource: … 503"). The guard would fail
    // the test for the very thing it is asserting.
    test.use({ allowConsole: true });

    test('a read that died on the wire gets the same page, with the transport’s own words', async ({ page, world }) => {
      world.set('record', World.httpError(503));
      await page.goto(at(ID.parcel));

      const failed = page.getByRole('alert');
      await expect(failed).toContainText('This record did not load');
      await expect(failed).toContainText('GraphQL HTTP 503');
      await expect(page.getByText('That record is not in your portfolio')).toHaveCount(0);
    });
  });

  test('Try again on a record that did not load asks the world for it once more', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('alert')).toContainText('This record did not load');

    const before = world.calls('record').length;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => world.calls('record').length).toBeGreaterThan(before);
    // It failed again, so the screen is still here saying so — which is itself
    // the answer, rather than a button that silently does nothing.
    await expect(page.getByRole('alert')).toContainText('This record did not load');
  });

  test('a record that did not load still offers the way back to Properties', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(at(ID.parcel));

    await page.getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Properties' }).click();
    await expect(page).toHaveURL(/\/app\/properties$/);
  });

  test('a hanger whose record will not load fails on the frame, not inside the hanger', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(at(ID.parcel, 'people'));

    await expect(page.getByRole('alert')).toContainText('This record did not load');
    await expect(page.getByRole('heading', { name: 'Who looks after it' })).toHaveCount(0);
    await expect(tabStrip(page)).toHaveCount(0);
  });
});

// ── the header ─────────────────────────────────────────────────────────

test.describe('W03 · the header', () => {
  test('the header says what the land is, where it is, and who it is filed under', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByText('Agricultural land')).toBeVisible();
    await expect(page.getByText('Katragunta, Markapur, Prakasam — Andhra Pradesh')).toBeVisible();
    await expect(page.getByText('కత్రగుంట, మార్కాపురం, ప్రకాశం')).toBeVisible();
    await expect(page.getByText('Khata 1042 · Telukutla Shankar Reddy')).toBeVisible();
  });

  test('a record you simply own wears no status capsule at all', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    // "Owned / Owned" beside every title is noise. The capsules are for the
    // records that are NOT the ordinary case.
    await expect(page.getByText('Owned', { exact: true })).toHaveCount(0);
  });

  test('a record that is for sale and only managed by you wears both words', async ({ page, world }) => {
    world.set('record', parcel({ status: 'for_sale', stake: 'managed' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByText('For sale', { exact: true })).toBeVisible();
    await expect(page.getByText('Managed', { exact: true })).toBeVisible();
  });

  test('an archived record says archived on its own page', async ({ page, world }) => {
    world.set('record', parcel({ status: 'archived' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  });

  test('the four figures at the top are the ones you are asked for on a phone call', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    // Each figure under its own word. The worth and the rate are the pair a
    // strip-wide assertion would let swap places without anything failing.
    await expect(figureValue(page, 'Extent')).toHaveText('4.30 ac');
    await expect(figure(page, 'Extent')).toContainText('4 acres 12 guntas');
    await expect(figureValue(page, 'Market value')).toHaveText('₹86.0 L');
    await expect(figureValue(page, 'per acre')).toHaveText('₹20.0 L');
    await expect(figureValue(page, 'Bought')).toHaveText('1998');
  });

  test('a record nobody has valued says so instead of printing ₹0', async ({ page, world }) => {
    world.set('record', parcel({ marketValue: 0, perUnitValue: 0 }));
    await page.goto(at(ID.parcel));

    await expect(figureValue(page, 'Market value')).toHaveText('Not valued');
    // The rate cannot be derived from an unknown worth, and a ₹0 rate would be
    // a claim rather than a gap.
    await expect(figureValue(page, 'per acre')).toHaveText('—');
    // The extent is known, and goes on saying so beside the two that are not.
    await expect(figureValue(page, 'Extent')).toHaveText('4.30 ac');
    await expect(page.locator('.strip').first()).not.toContainText('₹0');
  });

  test('a rate cannot be worked out for land nobody has measured, however well it is valued', async ({ page, world }) => {
    // The server divides worth by extent and sends 0 when there is no extent
    // (web360.py:2696). The screen must not print that 0 as a rate.
    world.set('record', parcel({ extent: 0, extentDetail: '', perUnitValue: 0 }));
    await page.goto(at(ID.parcel));

    await expect(figureValue(page, 'Market value')).toHaveText('₹86.0 L');
    await expect(figureValue(page, 'per acre')).toHaveText('—');
  });

  // DEFECT. The Extent cell (RecordPapers.tsx:456-461) prints `num(rec.extent,
  // 2)` with no guard on zero, while the two cells beside it say "Not valued"
  // (:469) and "Not recorded" (:472) rather than assert a figure nobody filed.
  // A record added with the extent box left empty is stored as 0 —
  // PropertyActions.tsx:384 sends `Number(extent) || 0`, and web360.py's `_f`
  // does the same for an omitted one — so its own page states "0.00 ac", in the
  // same type as a surveyed parcel's real extent, directly beside a rate cell
  // that refuses to divide by that very number because it knows it is unknown.
  // The owner is owed "Not measured" in that cell, the way the other three
  // unknowns on this strip are already said in words.
  test.fail('a record nobody has measured says so instead of printing 0.00 ac', async ({ page, world }) => {
    world.set('record', parcel({ extent: 0, extentDetail: '', perUnitValue: 0 }));
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    await expect(figureValue(page, 'Extent')).not.toContainText('0.00');
  });

  test('a record with no year of purchase on file says it is not recorded', async ({ page, world }) => {
    world.set('record', parcel({ boughtYear: '' }));
    await page.goto(at(ID.parcel));

    await expect(figureValue(page, 'Bought')).toHaveText('Not recorded');
  });

  test('a built property is measured in its own unit and rated per square foot', async ({ page, world }) => {
    world.set('record', flat());
    await page.goto(at(ID.flat));

    // Whole square yards: a fraction of one means nothing, which is why the
    // cell rounds everything that is not acres (RecordPapers.tsx:458).
    await expect(figureValue(page, 'Extent')).toHaveText('850 sq.yd');
    await expect(figureValue(page, 'per sft')).toHaveText('₹5,000');
    await expect(page.getByText('Built property')).toBeVisible();
  });

  test('a status this app has never heard of is still said in words', async ({ page, world }) => {
    // web360.py answers owned / for_sale / disputed today and substitutes
    // 'archived'; the day a fifth one is added, a blank capsule beside the
    // title is the one outcome that tells the owner nothing (ui.tsx:357-361).
    world.set('record', parcel({ status: 'under_mortgage' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByText('Under mortgage', { exact: true })).toBeVisible();
  });

  test('the header carries the two things you do to a record beside the menu of what you do with it', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('link', { name: 'Order a service' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/order`);
    const share = page.getByRole('button', { name: 'Share securely' });
    await expect(share).toBeVisible();
    // Closed until it is asked for — the panel opens under this button rather
    // than over the record it is about.
    await expect(share).toHaveAttribute('aria-expanded', 'false');
    await expect(kebab(page)).toBeVisible();
  });

  // DEFECT. `record` selects `tags` (apps/web/src/w360/api.ts:320, Q_RECORD)
  // and the 360 draws them nowhere: the header at RecordPapers.tsx:227-271
  // renders the status and stake capsules (:232-235) and stops, and the only
  // other use of the field is handing it to the drawer's card at
  // RecordPapers.tsx:348, which RecordDrawer never reads. So a record tagged
  // "ancestral" or "boundary dispute" says so on the Properties list, which
  // draws exactly these chips (Properties.tsx:256), and says nothing whatever
  // on its own page. The owner is owed the record's tags beside its status
  // capsules, as the same <Tag> chips the paper rows already use one screen
  // further down (RecordPapers.tsx:561).
  test.fail('the tags on a record are shown on the record they describe', async ({ page, world }) => {
    world.set('record', parcel({ tags: ['ancestral', 'boundary dispute'] }));
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    await expect(page.getByText('ancestral')).toBeVisible();
    await expect(page.getByText('boundary dispute')).toBeVisible();
  });
});

// ── the hangers ────────────────────────────────────────────────────────

const HANGERS = [
  { label: 'Papers', path: '', heading: 'Sy 214/2' },
  { label: 'Features', path: 'features', heading: 'On this land' },
  { label: 'People', path: 'people', heading: 'Who looks after it' },
  { label: 'Services', path: 'services', heading: 'What you have ordered' },
  { label: 'Money', path: 'money', heading: 'What it cost, what it’s worth' },
  { label: 'Audit', path: 'history', heading: 'What has been changed' },
];

test.describe('W03 · the six hangers', () => {
  test('all six hangers are there, each pointing at its own part of the record', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    const tabs = tabStrip(page);
    await expect(tabs.getByRole('link')).toHaveCount(6);
    for (const h of HANGERS) {
      await expect(tabs.getByRole('link', { name: h.label })).toHaveAttribute('href', at(ID.parcel, h.path));
    }
  });

  test('the counts on the hangers are the record’s own numbers', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    const tabs = tabStrip(page);
    await expect(tabs.getByRole('link', { name: 'Papers' })).toContainText('12');
    await expect(tabs.getByRole('link', { name: 'Features' })).toContainText('14');
    await expect(tabs.getByRole('link', { name: 'People' })).toContainText('3');
    await expect(tabs.getByRole('link', { name: 'Services' })).toContainText('2');
    // Money and Audit are not countable things, so they carry no number.
    await expect(tabs.getByRole('link', { name: 'Money' })).toHaveText('Money');
    await expect(tabs.getByRole('link', { name: 'Audit' })).toHaveText('Audit');
  });

  test('a record with nothing filed on it wears no counts at all', async ({ page }) => {
    await page.goto(at(ID.plot));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 88' })).toBeVisible();

    const tabs = tabStrip(page);
    await expect(tabs.getByRole('link')).toHaveCount(6);
    for (const h of HANGERS) {
      await expect(tabs.getByRole('link', { name: h.label })).toHaveText(h.label);
    }
  });

  for (const h of HANGERS) {
    test(`the ${h.label} hanger opens its own question and marks itself as where you are`, async ({ page, world }) => {
      world.set('record', parcel());
      // Papers is the index, so it is reached FROM somewhere else; the rest are
      // reached from the index.
      await page.goto(at(ID.parcel, h.path === '' ? 'features' : ''));
      await expect(tabStrip(page)).toBeVisible();

      await tabStrip(page).getByRole('link', { name: h.label }).click();

      await expect(page).toHaveURL(new RegExp(`${at(ID.parcel, h.path).replace(/\//g, '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1, name: h.heading })).toBeVisible();
      const tabs = tabStrip(page);
      await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(tabs.getByRole('link', { name: h.label })).toHaveAttribute('aria-current', 'page');
    });
  }

  test('Papers is the front door: it is current at the bare record URL and nowhere else', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    const tabs = tabStrip(page);
    await expect(tabs.getByRole('link', { name: 'Papers' })).toHaveAttribute('aria-current', 'page');

    await page.goto(at(ID.parcel, 'money'));
    await expect(tabs.getByRole('link', { name: 'Papers' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('the breadcrumb on a hanger walks back to the record, and then to Properties', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel, 'people'));

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('Properties');
    await expect(crumbs).toContainText('Sy 214/2');
    await expect(crumbs).toContainText('People');

    await crumbs.getByRole('link', { name: 'Sy 214/2' }).click();
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
  });

  test('the record’s own breadcrumb does not link to the page you are standing on', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Properties' })).toBeVisible();
    await expect(crumbs.getByRole('link', { name: 'Sy 214/2' })).toHaveCount(0);
    await expect(crumbs).toContainText('Sy 214/2');
  });

  test('Map and Expenses are the same record under their own URLs, even though the strip does not name them', async ({ page, world }) => {
    world.set('record', parcel());

    await page.goto(at(ID.parcel, 'map'));
    await expect(page.getByRole('heading', { level: 1, name: 'Map & boundary' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Map');

    await page.goto(at(ID.parcel, 'expenses'));
    await expect(page.getByRole('heading', { level: 1, name: 'Expenses' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Expenses');
  });

  test('the Photos hanger is on the same frame and names the record it belongs to', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel, 'photos'));

    // The gallery is full-bleed rather than a hanger in the strip, so what
    // says it is still this record is its own header and its way back.
    await expect(page.getByText('Sy 214/2 · Photos')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the record' }))
      .toHaveAttribute('href', at(ID.parcel));
    await expect.poll(() => world.asked('photos')).toBe(true);
    expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
    await expect(page.getByText('That record is not in your portfolio')).toHaveCount(0);
  });
});

// ── the kebab ──────────────────────────────────────────────────────────

const MENU_ITEMS = [
  'Edit details',
  'See what changed',
  'Open map & boundary',
  'Ask a surveyor',
  'Archive this record',
  'Delete this record',
];

test.describe('W03 · the actions menu', () => {
  test('the kebab names the record it acts on, and lists what can be done to it', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    const button = kebab(page);
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();

    const menu = page.getByRole('menu', { name: 'Actions for Sy 214/2' });
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem')).toHaveCount(MENU_ITEMS.length);
    for (const label of MENU_ITEMS) {
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    }
  });

  test('the actions menu opens and walks under the keyboard alone', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).focus();
    await page.keyboard.press('Enter');

    // A keyboard-opened menu hands focus to its first item; the list is
    // portalled to the app root, so Tab alone would never reach it.
    await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'See what changed' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeFocused();
    // Up from the top cycles to the bottom rather than falling out of the menu.
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Delete this record' })).toBeFocused();
  });

  test('Escape shuts the actions menu and acts on nothing', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'Actions for Sy 214/2' })).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('menu', { name: 'Actions for Sy 214/2' })).toHaveCount(0);
    // Focus comes back to the kebab, not to <body>, so the next Tab carries on
    // from here rather than restarting at the top of the document.
    await expect(kebab(page)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('archiveRecords')).toHaveLength(0);
    expect(world.calls('deleteRecords')).toHaveLength(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('Tab out of the actions menu puts it away and carries on from the kebab', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeFocused();

    await page.keyboard.press('Tab');

    await expect(page.getByRole('menu', { name: 'Actions for Sy 214/2' })).toHaveCount(0);
    // The list is portalled to the end of the document, so unmounting it under
    // focus used to drop activeElement onto <body> and restart the next Tab at
    // the top of the page. Focus goes back to the kebab first and the browser's
    // own Tab then moves on to the next control after it — the first hanger.
    await expect(tabStrip(page).getByRole('link', { name: 'Papers' })).toBeFocused();
    expect(world.calls('archiveRecords')).toHaveLength(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('a click anywhere else puts the actions menu away and acts on nothing', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await expect(page.getByRole('menu', { name: 'Actions for Sy 214/2' })).toBeVisible();

    await page.getByRole('heading', { level: 1, name: 'Sy 214/2' }).click();

    await expect(page.getByRole('menu', { name: 'Actions for Sy 214/2' })).toHaveCount(0);
    await expect(kebab(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('archiveRecords')).toHaveLength(0);
    expect(world.calls('deleteRecords')).toHaveLength(0);
  });

  test('See what changed goes to the audit hanger', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'See what changed' }).click();

    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel, 'history').replace(/\//g, '\\/')}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'What has been changed' })).toBeVisible();
  });

  test('Open map & boundary goes to the ground the record sits on', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Open map & boundary' }).click();

    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel, 'map').replace(/\//g, '\\/')}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Map & boundary' })).toBeVisible();
  });

  test('Ask a surveyor opens the request already knowing what is being asked for', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Ask a surveyor' }).click();

    await expect(page).toHaveURL(/\/app\/records\/w-sy-214-2\/request\?kind=survey$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ask a surveyor' })).toBeVisible();
  });

  // DEFECT. The item list at RecordPapers.tsx:253-269 is a constant: every
  // record is offered "Archive this record" (:267), including one whose status
  // is already `archived` and which the header twenty lines above is painting
  // an "Archived" capsule for (:232-233). Pressing it opens "Archive <title>?"
  // — copy that promises to take the record out of lists it left long ago —
  // and confirming re-sends archiveRecords(archived: true) at :427 and lands
  // the owner on Properties, where the record is invisible. There is no way
  // back from here at all; the drawer at PropertyActions.tsx:496-502 tells the
  // owner to "unarchive it from its menu on Properties", which is a different
  // screen. The owner is owed the item reading "Unarchive this record" on an
  // archived record, sending archiveRecords(archived: false).
  test.fail('an archived record offers the way back rather than a second archiving', async ({ page, world }) => {
    world.set('record', parcel({ status: 'archived' }));
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    const menu = page.getByRole('menu', { name: 'Actions for Sy 214/2' });
    await expect(menu.getByRole('menuitem', { name: 'Unarchive this record' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Archive this record' })).toHaveCount(0);
  });
});

// ── archiving and deleting ─────────────────────────────────────────────

test.describe('W03 · archiving and deleting from the record', () => {
  test('archiving from the record asks first, and Cancel changes nothing', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();

    const ask = page.getByRole('dialog', { name: 'Archive Sy 214/2?' });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('Archived records leave the list, the map and every total, but keep everything filed under them.');
    // The promise this dialog makes, and the one the archived record's own
    // kebab then cannot keep — see the test.fail above.
    await expect(ask).toContainText('Bring it back any time from the Archived facet in the rail.');

    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toHaveCount(0);
    expect(world.calls('archiveRecords')).toHaveLength(0);
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
  });

  test('Escape backs out of the archive question and hands the keyboard back', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();
    await expect(page.getByRole('dialog', { name: 'Archive Sy 214/2?' })).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: 'Archive Sy 214/2?' })).toHaveCount(0);
    expect(world.calls('archiveRecords')).toHaveLength(0);
    // Back to the kebab the question was raised from, not to <body>.
    await expect(kebab(page)).toBeFocused();
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
  });

  test('an archive still in flight says so, and will not take a second press', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('archiveRecords', World.slow(2500, 1));
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();
    const ask = page.getByRole('dialog', { name: 'Archive Sy 214/2?' });
    await ask.getByRole('button', { name: 'Archive' }).click();

    await expect(ask.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    // The write is out and the answer is not back: Escape must not take the
    // question away over a record that is mid-archive.
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();

    await expect(page).toHaveURL(/\/app\/properties$/);
    expect(world.calls('archiveRecords')).toHaveLength(1);
  });

  test('archiving takes the record out of the lists and lands you where you can see that', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();
    await page.getByRole('dialog', { name: 'Archive Sy 214/2?' })
      .getByRole('button', { name: 'Archive' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    expect(world.lastVars('archiveRecords')).toEqual({ ids: [ID.parcel], archived: true });
  });

  test('an archive the server declines leaves the record where it is and says so', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('archiveRecords', 0);
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();
    const ask = page.getByRole('dialog', { name: 'Archive Sy 214/2?' });
    await ask.getByRole('button', { name: 'Archive' }).click();

    await expect(ask.getByRole('alert'))
      .toHaveText('That record could not be archived — it may already be gone. Reload the page.');
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
  });

  test('an archive that falls over says nothing was changed', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('archiveRecords', World.gqlError('the write was refused'));
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Archive this record' }).click();
    const ask = page.getByRole('dialog', { name: 'Archive Sy 214/2?' });
    await ask.getByRole('button', { name: 'Archive' }).click();

    await expect(ask.getByRole('alert'))
      .toHaveText('That record could not be archived. Nothing was changed.');
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
  });

  test('deleting says what goes with the record before the red button does', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Delete this record' }).click();

    const ask = page.getByRole('dialog', { name: 'Delete Sy 214/2?' });
    await expect(ask).toContainText('papers, photos, features, people');
    await expect(ask).toContainText('There is no undo.');
    await expect(ask).toContainText('archive it instead');

    await ask.getByRole('button', { name: 'Cancel' }).click();
    expect(world.calls('deleteRecords')).toHaveLength(0);
  });

  test('deleting the record takes you back to Properties', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Delete this record' }).click();
    await page.getByRole('dialog', { name: 'Delete Sy 214/2?' })
      .getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    expect(world.lastVars('deleteRecords')).toEqual({ ids: [ID.parcel] });
  });

  test('a delete the server declines keeps the dialog up over a record that is still there', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('deleteRecords', 0);
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Delete this record' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete Sy 214/2?' });
    await ask.getByRole('button', { name: 'Delete' }).click();

    await expect(ask.getByRole('alert'))
      .toHaveText('That record could not be deleted — it may already be gone. Reload the page.');
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel).replace(/\//g, '\\/')}$`));
  });

  test('a delete that falls over says nothing was removed', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('deleteRecords', World.gqlError('the write was refused'));
    await page.goto(at(ID.parcel));

    await kebab(page).click();
    await page.getByRole('menuitem', { name: 'Delete this record' }).click();
    const ask = page.getByRole('dialog', { name: 'Delete Sy 214/2?' });
    await ask.getByRole('button', { name: 'Delete' }).click();

    await expect(ask.getByRole('alert'))
      .toHaveText('That record could not be deleted. Nothing was removed.');
  });
});

// ── the edit drawer ────────────────────────────────────────────────────

async function openDrawer(page: Page, title = 'Sy 214/2') {
  await kebab(page, title).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  const drawer = page.getByRole('dialog', { name: `Edit ${title}` });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('W03 · editing the record’s own fields', () => {
  test('Edit details opens the record’s own drawer, titled and focused', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    const drawer = await openDrawer(page);
    await expect(drawer).toContainText('This record');
    // An edit IS the form — there is nothing to read when the record already
    // exists — so it opens on the first field rather than on a scan.
    await expect(drawer.getByLabel('Survey number')).toBeFocused();
  });

  test('the drawer opens holding what is filed, not an empty form', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 214/2');
    await expect(drawer.getByLabel("Owner's name")).toHaveValue('Telukutla Shankar Reddy');
    await expect(drawer.getByLabel('Khata no')).toHaveValue('1042');
    await expect(drawer.getByLabel('Village')).toHaveValue('Katragunta');
    await expect(drawer.getByLabel('Mandal')).toHaveValue('Markapur');
    await expect(drawer.getByLabel('District')).toHaveValue('Prakasam');
    // The unit the record is STORED in, not one derived from its class.
    await expect(drawer.getByLabel('Extent · Acres')).toHaveValue('4.3');
    await expect(drawer.getByLabel('Worth today')).toHaveValue('₹86,00,000');
    await expect(drawer.getByLabel('Status')).toHaveValue('owned');
    await expect(drawer.getByLabel('Your stake')).toHaveValue('owned');
  });

  test('an edit drawer is the form and only the form — no deed to read, no kind to pick, no price to enter', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    // ScanFirst, the kind chooser and "What you paid" all belong to a record
    // being created (PropertyActions.tsx:508, :515, :629). This one exists:
    // reading a deed at it would only overwrite what is already filed, and
    // what it cost was settled on the day it was bought.
    await expect(drawer.getByText('What kind of record')).toHaveCount(0);
    await expect(drawer.getByLabel('What you paid')).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Add record' })).toHaveCount(0);
    await expect(drawer.getByLabel('Worth today')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });

  test('a built property is asked for a locality and a city, not a village and a mandal', async ({ page, world }) => {
    world.set('record', flat());
    await page.goto(at(ID.flat));
    const drawer = await openDrawer(page, 'Flat 4B, Sai Residency');

    await expect(drawer.getByLabel('What it is called')).toHaveValue('Flat 4B, Sai Residency');
    await expect(drawer.getByLabel('Locality')).toHaveValue('Kukatpally');
    await expect(drawer.getByLabel('City')).toHaveValue('Kukatpally');
    // A flat has no survey number and no mandal; asking for either would be
    // asking for something that does not exist.
    await expect(drawer.getByLabel('Survey number')).toHaveCount(0);
    await expect(drawer.getByLabel('Village')).toHaveCount(0);
    await expect(drawer.getByLabel('Mandal')).toHaveCount(0);
    // And it opens on what it already is, rather than on nothing chosen.
    await expect(drawer.getByRole('button', { name: 'Flat', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(drawer.getByRole('button', { name: 'Shop', exact: true }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  test('a record with its name rubbed out cannot be saved', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Survey number').fill('');

    // Not refused on the press with a message afterwards: a record with no
    // name at all is the one edit this form will not carry (canSave,
    // PropertyActions.tsx:204).
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('saving a drawer nobody touched writes nothing at all', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('changing one field sends that field and no other', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel("Owner's name").fill('Telukutla Venkat Reddy');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    // The server leaves an omitted field alone, so a form that never touched
    // the khata can never blank it.
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, ownerName: 'Telukutla Venkat Reddy' },
    });
  });

  test('clearing the khata sends an empty khata and leaves everything else alone', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Khata no').fill('');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, khataNo: '' },
    });
  });

  test('clearing what a record is worth leaves the filed valuation alone', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    // "I don't know what it is worth" is not ₹0. Emptying the box to read it
    // used to write zero over a real figure.
    await drawer.getByLabel('Worth today').fill('');
    await drawer.getByLabel('District').fill('Prakasham');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, district: 'Prakasham' },
    });
  });

  test('a worth typed into the drawer travels as a number, and reads as money on the way', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Worth today').fill('9000000');

    // Grouped as it is typed, in the lakhs-and-crores grouping the rest of
    // these screens use — ₹9,000,000 is not how anybody here writes it.
    await expect(drawer.getByLabel('Worth today')).toHaveValue('₹90,00,000');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, marketValue: 9_000_000 },
    });
  });

  test('correcting the extent sends the figure and the unit it was measured in', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Extent · Acres').fill('4.5');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    // The number alone would be read under whatever unit the row happens to
    // carry, so the two always travel together.
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, extent: 4.5, extentUnit: 'ac' },
    });
  });

  test('putting a record up for sale sends the new status and nothing else', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Status').selectOption('for_sale');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, status: 'for_sale' },
    });
  });

  test('renaming a flat a shop does not re-measure it', async ({ page, world }) => {
    world.set('record', flat());
    await page.goto(at(ID.flat));
    const drawer = await openDrawer(page, 'Flat 4B, Sai Residency');

    await expect(drawer.getByLabel('Extent · Sq.yd')).toHaveValue('850');
    await drawer.getByRole('button', { name: 'Shop', exact: true }).click();
    // Changing what the thing IS changes the unit the box is labelled in …
    await expect(drawer.getByLabel('Extent · Sq.ft')).toHaveValue('850');

    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    // … but nothing re-measures the land. Re-sending 850 under sq.ft would
    // silently turn 850 square yards into 850 square feet.
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'property', id: ID.flat, classification: 'shop' },
    });
  });

  test('an archived record’s drawer says so, and offers no status it cannot set', async ({ page, world }) => {
    world.set('record', parcel({ status: 'archived' }));
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await expect(drawer).toContainText('This record is archived.');
    await expect(drawer).toContainText('Archived. Unarchive the record to give it a status again.');
    // Not a greyed-out select with a tooltip: there is nothing honest for a
    // three-option status box to show for a record whose status is 'archived'.
    await expect(drawer.getByLabel('Status')).toHaveCount(0);
    await expect(drawer.getByLabel('Your stake')).toBeVisible();
  });

  test('an archived record can still have the rest of its details corrected', async ({ page, world }) => {
    world.set('record', parcel({ status: 'archived' }));
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Khata no').fill('1043');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord').length).toBe(1);
    // The status this record carries is not one of the three the form knows,
    // so it must not travel as a change.
    expect(world.lastVars('saveRecord')).toEqual({
      input: { kind: 'parcel', id: ID.parcel, khataNo: '1043' },
    });
  });

  test('Escape on a drawer with typed changes asks before throwing them away', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Survey number').fill('Sy 214/3');
    await page.keyboard.press('Escape');

    const ask = page.getByRole('dialog', { name: 'Discard these changes?' });
    await expect(ask).toContainText('What you have changed here has not been saved. Closing the drawer loses it.');

    await ask.getByRole('button', { name: 'Keep editing' }).click();
    await expect(ask).toHaveCount(0);
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 214/3');
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('Discard on that question closes the drawer and writes nothing', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Survey number').fill('Sy 214/3');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Discard these changes?' })
      .getByRole('button', { name: 'Discard' }).click();

    await expect(drawer).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
  });

  test('Escape on a drawer nobody touched just closes it', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await page.keyboard.press('Escape');

    // An edit drawer opens full of the record's own values, so "a field has
    // something in it" is the wrong question — nothing DIFFERS, so there is
    // nothing to lose and nothing to ask about.
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Cancel closes the drawer at once, changes and all', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Survey number').fill('Sy 214/3');
    await drawer.getByRole('button', { name: 'Cancel' }).click();

    // A deliberate press is not a slipped one: it closes without a question.
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('the X on the drawer closes it at once, changes and all', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Survey number').fill('Sy 214/3');
    await drawer.getByRole('button', { name: 'Close' }).click();

    // The two deliberate presses — this and Cancel — mean it. Only the two
    // accidental paths, Escape and the scrim, stop to ask.
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('a slipped click on the page behind asks before throwing the changes away', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel("Owner's name").fill('Telukutla Venkat Reddy');
    // The scrim is the dimmed page, `aria-hidden` and no longer a button
    // (PropertyActions.tsx:477), so there is nothing but the class to aim at.
    // Top-left, because the panel itself covers the right of the viewport.
    await page.locator('.scrim').click({ position: { x: 20, y: 20 } });

    const ask = page.getByRole('dialog', { name: 'Discard these changes?' });
    await expect(ask).toBeVisible();

    await ask.getByRole('button', { name: 'Keep editing' }).click();
    await expect(drawer.getByLabel("Owner's name")).toHaveValue('Telukutla Venkat Reddy');
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('a save still in flight says so, and the drawer cannot be escaped out from under it', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('saveRecord', World.slow(2500, ID.parcel));
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Khata no').fill('1043');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    // One Escape must not both dismiss a write in flight and close the form
    // that raised it — the answer has not come back yet.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Discard these changes?' })).toHaveCount(0);

    await expect(drawer).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(1);
  });

  test('the drawer is a modal in fact: Tab cannot leave it and the page behind is inert', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    await openDrawer(page);

    // The header behind the drawer is a plain <header> inside <main> and so
    // carries no ARIA role of its own; `inert` on it is the assertion.
    await expect(page.locator('main > header')).toHaveAttribute('inert', '');

    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1} walked out of the drawer`).toBe(true);
    }
  });

  test('a save the server refuses keeps the drawer, and its words, on screen', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('saveRecord', World.gqlError('that khata belongs to another record'));
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);

    await drawer.getByLabel('Khata no').fill('1043');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer).toContainText('that khata belongs to another record');
    await expect(drawer.getByLabel('Khata no')).toHaveValue('1043');
  });

  test('the record is asked for again once an edit lands', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));
    const drawer = await openDrawer(page);
    const before = world.calls('record').length;

    await drawer.getByLabel("Owner's name").fill('Telukutla Venkat Reddy');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer).toHaveCount(0);
    await expect.poll(() => world.calls('record').length).toBeGreaterThan(before);
  });
});

// ── the note, and what has been corrected ──────────────────────────────

test.describe('W03 · the note and the audit trail', () => {
  test('the note somebody left on the record is shown with who left it and when', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(page.getByText('The eastern boundary is disputed with the adjoining survey.')).toBeVisible();
    await expect(page.getByText('Shankar Reddy · 2026-08-14')).toBeVisible();
  });

  test('a record nobody has written a note on shows no note card', async ({ page, world }) => {
    world.set('record', parcel({ noteBody: '', noteAuthor: '', noteAt: '' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    // An empty card with a heading and nothing under it is worse than no card.
    await expect(page.getByRole('heading', { name: 'Notes' })).toHaveCount(0);
  });

  test('the audit hanger shows what changed, with the value it used to be', async ({ page, world }) => {
    world.set('record', parcel());
    await page.goto(at(ID.parcel, 'history'));

    await expect(page.getByRole('heading', { level: 1, name: 'What has been changed' })).toBeVisible();
    await expect(page.getByText('Anything on this record can be corrected.')).toBeVisible();
    // Whose trail this is, said above the headline (Orders.tsx:286).
    await expect(page.getByText('Sy 214/2 · Katragunta')).toBeVisible();

    // Scoped to the row, because the old value, the new one, the date and the
    // person are one correction — asserted loose on the page, the date off the
    // OTHER correction would satisfy them just as well. A correction row
    // carries no role of its own (Orders.tsx:310-323).
    const rows = page.locator('.rows.boxed > div');
    const khata = rows.filter({ has: page.getByText('Khata number') });
    // `<s>` and nothing else: the old value being struck rather than dropped is
    // the whole point of the line, and no role expresses that.
    await expect(khata.locator('s')).toHaveText('1041');
    await expect(khata).toContainText('1042');
    await expect(khata).toContainText('2026-08-20');
    await expect(khata).toContainText('Shankar Reddy');

    const owner = rows.filter({ has: page.getByText('Owner name') });
    await expect(owner.locator('s')).toHaveText('T S Reddy');
    await expect(owner).toContainText('Telukutla Shankar Reddy');
    await expect(owner).toContainText('2026-07-02');
  });

  test('a value that was filed where there had been none shows the blank it replaced', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('corrections', [
      { id: 'w-corr-3', field: 'Khata number', was: '', now: '1042', at: '2026-09-01', by: 'Shankar Reddy' },
    ]);
    await page.goto(at(ID.parcel, 'history'));

    const row = page.locator('.rows.boxed > div').filter({ has: page.getByText('Khata number') });
    // A row reading "1042" on its own says a khata was corrected; the dash is
    // what says there had not been one at all (Orders.tsx:317).
    await expect(row.locator('s')).toHaveText('—');
    await expect(row).toContainText('1042');
  });

  // DEFECT. RecordHistory reads `useCorrections` for `data` and `isLoading` and
  // drops `error` on the floor (Orders.tsx:284), then treats anything that is
  // not an array of rows as an empty one (:300). So a corrections read the
  // server refuses — or one that never arrives — tells the owner "Nothing has
  // been corrected on this record yet", which is a statement about their record
  // and not about the request, and it is the opposite of the truth on the one
  // screen whose whole job is to say nothing is ever removed from this list.
  // The hanger one component above it does this correctly (Orders.tsx:274:
  // `<Failed what="This record's services" …>`). The owner is owed the same
  // here: the failure said out loud, with the reason and a way to ask again.
  // (Verified end to end: with `corrections` refused, this screen holds the
  // skeleton through React Query's one retry and then settles on the empty
  // sentence, with no alert anywhere on the page.)
  test.fail('an audit trail that did not load says so, rather than that nothing was ever corrected', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('corrections', World.gqlError('the audit log is down'));
    await page.goto(at(ID.parcel, 'history'));

    await expect(page.getByRole('heading', { level: 1, name: 'What has been changed' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('did not load');
    await expect(page.getByText('Nothing has been corrected on this record yet.')).toHaveCount(0);
  });

  test('a record nothing has been corrected on says so rather than showing an empty list', async ({ page }) => {
    await page.goto(at(ID.plot, 'history'));

    await expect(page.getByText('Nothing has been corrected on this record yet.')).toBeVisible();
    await expect(page.locator('s')).toHaveCount(0);
  });

  test('the audit hanger holds its shape while the corrections are still coming', async ({ page, world }) => {
    world.set('record', parcel());
    world.set('corrections', World.never());
    await page.goto(at(ID.parcel, 'history'));

    await expect(page.getByRole('heading', { level: 1, name: 'What has been changed' })).toBeVisible();
    // Filtered on the word, because an empty live region sits in the shell too
    // and an unnamed skeleton block announces nothing on its own.
    await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeVisible();
    // Still loading is not "nothing has been corrected".
    await expect(page.getByText('Nothing has been corrected on this record yet.')).toHaveCount(0);
  });
});

// ── where the record says it is ────────────────────────────────────────

test.describe('W03 · where the record says it is', () => {
  test('a record whose corners were walked but never pinned still says where it is, and whose answer that is', async ({ page, world }) => {
    // A parcel with a filed boundary and no pin knows perfectly well where it
    // is, and this card used to answer "No pin set yet" over eight surveyed
    // corners (RecordPapers.tsx:170-180). The figure is the centroid of the
    // ring, to four places, exactly as `coords` writes one (ui.tsx:159).
    world.set('record', parcel({ lat: 0, lon: 0 }));
    await page.goto(at(ID.parcel));

    await expect(page.getByText('15.7406° N, 79.2699° E')).toBeVisible();
    // And it says which source answered: the centre of a surveyed boundary is
    // not a pin anybody stood on, and the two can disagree.
    await expect(page.getByText('Centre of the surveyed boundary — no pin set on site yet.')).toBeVisible();
    await expect(page.getByText('No pin set yet — open the map to place one')).toHaveCount(0);
  });
});

// ── a record with nothing on it ────────────────────────────────────────

test.describe('W03 · a record with nothing filed on it', () => {
  test('an empty record says what is missing, on each part of itself', async ({ page }) => {
    await page.goto(at(ID.plot));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 88' })).toBeVisible();
    await expect(page.getByText('Nothing is filed against this parcel yet.')).toBeVisible();
    await expect(page.getByText('Nothing filmed or photographed here yet.')).toBeVisible();
    // Never surveyed and never pinned: the screen says so rather than drawing
    // 0.0000° N as if it were a place in the Gulf of Guinea.
    await expect(page.getByText('No pin set yet — open the map to place one')).toBeVisible();
    await expect(page.getByText('Never surveyed')).toBeVisible();
  });

  test('an empty record still carries its khata and the name it is filed under', async ({ page }) => {
    await page.goto(at(ID.plot));

    await expect(page.getByText('Khata 318 · Telukutla Shankar Reddy')).toBeVisible();
  });

  test('a record with neither khata nor owner on file prints no empty line where they would be', async ({ page, world }) => {
    world.set('record', parcel({ khataNo: '', ownerName: '' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByText(/^Khata/)).toHaveCount(0);
    await expect(page.getByText('Telukutla Shankar Reddy')).toHaveCount(0);
  });

  test('a record filed under a name but no khata number prints the name alone', async ({ page, world }) => {
    world.set('record', parcel({ khataNo: '' }));
    await page.goto(at(ID.parcel));

    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByText('Telukutla Shankar Reddy')).toBeVisible();
    // Not "Khata · Telukutla Shankar Reddy", and not a stray separator with
    // nothing on one side of it (RecordPapers.tsx:920-925).
    await expect(page.getByText(/Khata/)).toHaveCount(0);
    await expect(page.getByText(/·\s*Telukutla/)).toHaveCount(0);
  });
});

// ── the phone ──────────────────────────────────────────────────────────

test('on a phone the record still names itself and keeps all six hangers @phone', async ({ page, world }) => {
  world.set('record', parcel());
  await page.goto(at(ID.parcel));

  await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();
  const tabs = tabStrip(page);
  await expect(tabs.getByRole('link')).toHaveCount(6);
  await expect(tabs.getByRole('link', { name: 'Papers' })).toHaveAttribute('aria-current', 'page');
  await expect(kebab(page)).toBeVisible();
  // All four figures are still there, in a strip that re-flows rather than
  // dropping two of them off the side (w360.css:519-528).
  await expect(figureValue(page, 'Extent')).toHaveText('4.30 ac');
  await expect(figureValue(page, 'Bought')).toHaveText('1998');
  // And the page itself does not scroll sideways: the header's three actions
  // wrap onto their own row and the hanger strip scrolls inside itself, both
  // of which w360.css:347-357 and :559-565 exist to do.
  const spill = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(spill, 'the record page runs off the side of a phone').toBeLessThanOrEqual(1);
});
