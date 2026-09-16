/**
 * W02 — the properties list, every state of it.
 *
 * One screen: apps/web/src/w360/pages/Properties.tsx, plus the drawer and the
 * two dialogs it opens (pages/PropertyActions.tsx) and the scanner the drawer
 * opens ON (w360/ScanFirst.tsx). The filter row and its popover, the three
 * view shapes, the selection bar, Export, the add/edit drawer, reading a deed
 * and filing it with the record it made, the four empty sentences, the loading
 * skeletons and the failure.
 *
 * ONE DEFECT is recorded, as a `test.fail()` naming its cause: under a search
 * the facet counts are the server's, computed over a list the server was never
 * told the search about — so the popover promises records a click cannot
 * produce. See "a facet counts what clicking it will actually show".
 *
 * Four things a reader of this file has to know.
 *
 * 1. This is written against the REDESIGNED W02 — the one where the facets
 *    live behind a `+ Filter` chip instead of a 14rem rail, where the bulk bar
 *    does not exist until records are selected, and where the grid draws 24
 *    cards and offers to draw more. The screen was rewritten on disk while
 *    this file was being written, so if a test here fails on a selector rather
 *    than on behaviour, check Properties.tsx first: it moved recently.
 *
 * 2. The Add drawer on this screen is `RecordDrawer`, not the four dialogs in
 *    apps/web/src/pages/holdings/ — AddParcelDialog, AddPropertyDialog,
 *    LocationDialog and StakeDialog belong to the LEGACY LandPropertiesPage
 *    (/legacy/parcels, LandPropertiesPage.tsx:809-826) and nothing on
 *    /app/properties can reach them. They are somebody else's spec.
 *
 * 3. The seeded `properties` answer (fixtures/seed.ts:217) counts the archived
 *    record inside `total`, where web360.py:2635 counts only the active rows,
 *    and it files extents as `acres`/`sft` where the server's column is
 *    `ac | sq.yd | sq.ft` (web360.py:147, 3772). fmtExtent, the extent sort
 *    and the portfolio line all key off the real spellings. Fixtures are not
 *    ours to edit, so every test that turns on a count or a unit states its
 *    own answer with the server's arithmetic — `listOf` and `inRealUnits`
 *    below — and the rest assert only what the seed can honestly say.
 *
 * 4. Leaflet itself is NOT driven here. The satellite toggle, Fit all and a
 *    click on a pin belong to tests/e2e-web360, which stands a real map up
 *    against a real server. What this file asserts about the map view is
 *    everything around the canvas: the counts, the sentence about what is and
 *    is not drawn, the results rail, its selection boxes, its search, and
 *    where a record with no location sends you.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';
import { CARDS } from '../fixtures/seed';
import { readFile } from 'node:fs/promises';

type Card = Record<string, unknown>;

const BY_ID = new Map(CARDS.map((c) => [c.id as string, c]));

/** Seeded cards, cloned, in the order asked for. Cloned because `CARDS` is the
 *  suite's shared cast and a test that edited one in place would edit it for
 *  every other spec running beside it. */
const only = (...ids: string[]): Card[] =>
  ids.map((id) => structuredClone(BY_ID.get(id)!));

/** The facet groups the server builds off the seeded five, written out rather
 *  than derived: a test asserting a count wants the number in front of it.
 *
 *  The `label` on each group is what the SERVER calls it, and the screen no
 *  longer uses it: GROUP_WORD (Properties.tsx:337) names all five itself —
 *  Kind, Status, My stake, Village & khata, Your tags — so a heading cannot
 *  read "DERIVED" over a list of village names. Tests therefore look for the
 *  screen's word, not this one. */
const facets = (active: Record<string, string[]> = {}) => {
  const on = (group: string, key: string) => (active[group] ?? []).includes(key);
  return [
    { key: 'kind', label: 'Kind', options: [
      { key: 'parcel', label: 'Land', count: 3, active: on('kind', 'parcel') },
      { key: 'flat', label: 'Flat', count: 1, active: on('kind', 'flat') },
      { key: 'shop', label: 'Shop', count: 1, active: on('kind', 'shop') },
    ] },
    { key: 'status', label: 'Status', options: [
      { key: 'owned', label: 'Owned', count: 3, active: on('status', 'owned') },
      { key: 'archived', label: 'Archived', count: 1, active: on('status', 'archived') },
      { key: 'watch', label: 'Watch', count: 1, active: on('status', 'watch') },
    ] },
    { key: 'stake', label: 'Your stake', options: [
      { key: 'owned', label: 'Owned', count: 4, active: on('stake', 'owned') },
      { key: 'watch', label: 'Watching', count: 1, active: on('stake', 'watch') },
    ] },
    { key: 'tags', label: 'Tags', options: [
      { key: 'ancestral', label: 'ancestral', count: 1, active: on('tags', 'ancestral') },
      { key: 'rented', label: 'rented', count: 1, active: on('tags', 'rented') },
      { key: 'neighbour', label: 'neighbour', count: 1, active: on('tags', 'neighbour') },
    ] },
  ];
};

/** A `properties` answer with the server's own arithmetic: `total` is the list
 *  before the facets and after archiving, `hidden` is what the facets took. */
const listOf = (cards: Card[], over: Record<string, unknown> = {}) => ({
  shown: cards.length,
  total: cards.length,
  hidden: 0,
  filterSummary: '',
  hiddenPlaces: [] as string[],
  activeCount: 0,
  cards,
  facets: facets(),
  ...over,
});

/** The four records an unfiltered list shows — everything but the archived shop. */
const ACTIVE = () => only(ID.parcel, ID.plot, ID.flat, ID.watched);

/** Extents as the server actually spells them (web360.py:1351, 1375). */
const inRealUnits = (cards: Card[]): Card[] =>
  cards.map((c) => ({ ...c, extentUnit: c.kind === 'parcel' ? 'ac' : 'sq.ft' }));

/** A card in the grid. `.rec` is a div: a card carries no role of its own, only
 *  its title is a link (Properties.tsx:213), so there is nothing better to
 *  count. */
const gridCards = (page: Page) => page.locator('.cards .rec');

/** The filter popover, once `+ Filter` has opened it. */
const popover = (page: Page) => page.getByRole('group', { name: 'Narrow the list' });

/** One group inside the popover. The groups have no role and no accessible
 *  name of their own — they are `.fgrp` divs with an eyebrow — and scoping by
 *  name is not optional here: "Owned" is an option under Status AND under Your
 *  stake, whatever the two groups are called this week (Properties.tsx:900). */
const facetGroup = (page: Page, label: string) =>
  popover(page).locator('.fgrp').filter({ hasText: label });

/** Open the filter popover and pick one option.
 *
 *  A click and an assertion rather than anything shorter: the option is a
 *  toggle whose pressed state is read back out of the URL, and react-router
 *  commits `setSearchParams` inside a transition, so for one render after the
 *  click the button still says what the URL said. What a person cares about is
 *  that it ends up on, which is what this waits for. */
async function facet(page: Page, groupLabel: string, name: RegExp, want = true) {
  const filterBtn = page.getByRole('button', { name: '+ Filter' });
  if (!(await popover(page).isVisible())) await filterBtn.click();
  const opt = facetGroup(page, groupLabel).getByRole('button', { name });
  await opt.click();
  await expect(opt).toHaveAttribute('aria-pressed', want ? 'true' : 'false');
  return opt;
}

/** Tick a row's or a card's select box, and wait until it is actually ticked.
 *  `check()` reads the DOM property back in the tick after the click, and a
 *  controlled checkbox under a busy machine has not always committed by then. */
const pick = async (page: Page, name: string) => {
  const box = page.getByRole('checkbox', { name });
  await box.click();
  await expect(box).toBeChecked();
};

const unpick = async (page: Page, name: string) => {
  const box = page.getByRole('checkbox', { name });
  await box.click();
  await expect(box).not.toBeChecked();
};

const selectionBar = (page: Page) =>
  page.getByRole('group', { name: 'Act on the selected records' });

/** What an idempotency key looks like once one has actually been minted.
 *
 *  `mintKey` (orderFlow.ts:207) answers `crypto.randomUUID()` where there is a
 *  secure context and `k-<base36 time>-<base36 noise>` where there is not —
 *  `phone-local.sh` serves this app to a real phone over plain http, which is
 *  not one, and randomUUID is undefined there. Pinning the uuid shape would
 *  pass on this laptop and fail on the rig the product is driven from, so both
 *  are accepted. What is never accepted is the empty string the mutation
 *  defaults to when nobody passes a key (api.ts:1047). */
const KEY_SHAPE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|k-[0-9a-z]+-[0-9a-z]+)$/i;

/** The key the Nth `orderService` of this test carried. */
const keyOf = (world: World, n: number): string =>
  String(world.calls('orderService')[n].vars.idempotencyKey);

/** A sortable column heading, reached through its header cell. The sort chip in
 *  the filter row carries the same words — "Sort: Highest worth" — so a bare
 *  name match finds two buttons the moment the chip starts reporting a column
 *  click (sortLabel, Properties.tsx:297). */
const columnSort = (page: Page, label: string) =>
  page.getByRole('columnheader', { name: label }).getByRole('button');

/** A file somebody picked, at an exact size. `Buffer.alloc` is zero-filled and
 *  cheap — the bytes never matter here, only `File.size` and the type do. */
const fileOf = (name: string, sizeMb: number, mimeType = 'application/pdf') =>
  ({ name, mimeType, buffer: Buffer.alloc(Math.round(sizeMb * 1_048_576)) });

/** The hidden input the scan goes through (ScanFirst.tsx:136). A real button
 *  sits over it; setInputFiles reaches a hidden input happily. */
const scanPicker = (page: Page) => page.getByLabel('Read a deed or passbook');

/** The drawer's reader, answering with one deed.
 *
 *  ScanFirst calls `readDocument` (pages/documents/upload.ts:123), which posts
 *  to /import-registered-document — and `apiFetch` turns that into the ASYNC
 *  reader (api/client.ts:28-34, 74): a POST to `…-async` for a job receipt,
 *  then a poll of /import-status/<job>. So the reading is seeded on the STATUS
 *  path, which is where the fields actually come back.
 *
 *  The seed answers that path `{ state: 'failed' }` on purpose, so that no
 *  test depends on a paid extraction by accident. A test wanting a successful
 *  read says so here. */
const readerSays = (world: World, fields: Record<string, unknown>) =>
  world.route(/\/api\/gateway\/pattadar\/import-status\//,
    () => ({ json: { state: 'done', fields } }));

/** Storage taking the deed. `uploadToDrive` POSTs to `/storage/files?…`
 *  (pages/documents/storage.ts:54); the seeded storage routes answer
 *  `/storage/(nodes|folders)` and `/storage/files/<id>/content`, neither of
 *  which is that path. */
const storageTakes = (world: World, node: Record<string, unknown>) =>
  world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: node }));

const NODE = {
  id: 'file-deed-1', name: 'sale-deed.pdf', sizeBytes: 2_048, mimeType: 'application/pdf',
};

/** One deed, in the reader's own keys.
 *
 *  The keys are the extraction prompt's (services/api main.py), which is the
 *  whole point of writing them out: the buyer arrives inside `parties` and the
 *  khata as `pattadar_no`, and the drawer used to read `buyer` and `khata_no`
 *  — two boxes that were dead on every real document while a stub fed the
 *  fictional spellings (PropertyActions.tsx:445-455). */
const DEED = {
  doc_type: 'Sale Deed', document_no: '4412', reg_year: '1998',
  registration_date: '14/03/1998', sro: 'Markapur SRO',
  survey_no: 'Sy 411/1', pattadar_no: '907',
  village: 'Chintagunta', mandal: 'Markapur', district: 'Prakasam',
  extent: '2.50 acres', consideration: 'Rs. 9,00,000',
  parties: [
    { role: 'seller', name: 'Ramana Reddy' },
    { role: 'buyer', name: 'Telukutla Venkat Reddy' },
  ],
  summary: 'Sale of 2.50 acres in Chintagunta from Ramana Reddy to Telukutla Venkat Reddy for ₹9,00,000.',
  caveats: ['The extent is written in words on page 2 and in figures on page 1.'],
};

/** Open Add on the hand-entry form — what somebody does who has no scan in
 *  front of them. */
async function handEntry(page: Page) {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Add a record' });
  await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
  return drawer;
}

/** The map's right-hand rail, which is a list of the same records the map is
 *  drawing and the only part of the map this file drives. Leaflet itself —
 *  the satellite toggle, Fit all, a click on a pin — is tests/e2e-web360's,
 *  which stands up a real map against a real server. */
const mapRail = (page: Page) =>
  page.getByRole('complementary', { name: 'Map search results' });

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · the list as it arrives', () => {
  test('every record I hold is on the list, with its name, its owner, its place and what it is worth', async ({ page, world }) => {
    await page.goto('/app/properties');

    await expect.poll(() => world.asked('properties')).toBe(true);
    await expect(gridCards(page)).toHaveCount(4);

    const parcel = gridCards(page).filter({ hasText: 'Sy 214/2' });
    await expect(parcel.getByRole('link', { name: 'Sy 214/2' })).toHaveAttribute(
      'href', `/app/records/${ID.parcel}`);
    await expect(parcel.getByText('Telukutla Shankar Reddy')).toBeVisible();
    await expect(parcel.getByText('Katragunta, Markapur, Prakasam')).toBeVisible();
    await expect(parcel.getByText('● Khata 1042')).toBeVisible();
    await expect(parcel.getByText('ancestral')).toBeVisible();
    await expect(parcel.getByText('4 acres 12 guntas')).toBeVisible();
    await expect(parcel.getByText('₹86.0 L')).toBeVisible();

    const flat = gridCards(page).filter({ hasText: 'Flat 4B, Sai Residency' });
    await expect(flat.getByText('Kukatpally, Hyderabad')).toBeVisible();
    await expect(flat.getByText('₹72.5 L')).toBeVisible();
  });

  test('a record I only watch wears the word for it, and one I simply own wears nothing', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await expect(gridCards(page).filter({ hasText: 'Sy 301' }).getByText('Watch')).toBeVisible();
    // "Owned" on three cards out of four is a word that has stopped saying
    // anything (badgeOf, Properties.tsx:94).
    await expect(gridCards(page).filter({ hasText: 'Sy 214/2' }).getByText('Owned')).toHaveCount(0);
  });

  test('a card that knows where it stands prints its coordinate, and one that does not prints nothing', async ({ page }) => {
    await page.goto('/app/properties');

    await expect(gridCards(page).filter({ hasText: 'Sy 214/2' })
      .getByText('15.7407° N, 79.2699° E')).toBeVisible();
    // Sy 88 has never been pinned; "0.0000° N" would be a reading, not a blank.
    await expect(gridCards(page).filter({ hasText: 'Sy 88' }).getByText('° N')).toHaveCount(0);
  });

  test('a record that has been walked draws its own ground on the card', async ({ page }) => {
    await page.goto('/app/properties');

    // MapThumb.tsx:139 — the card's art is the record's boundary, labelled.
    await expect(page.getByRole('img', { name: 'Where Sy 214/2 is' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Where Sy 88 is' })).toHaveCount(0);
  });

  test('the head says how many records, how much land and what it is all worth', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(ACTIVE())));
    await page.goto('/app/properties');

    await expect(page.getByText('4 records · 7.53 ac · ₹2.19 Cr valued')).toBeVisible();
  });

  test('the tally counts what is on screen against everything I hold', async ({ page, world }) => {
    // Two numbers from two different places: the left one is what the screen
    // drew, the right one is what the account holds before the facets got at
    // it. Given the same number twice the tally could be wrong about either
    // and still read correctly, so this answer keeps them apart.
    world.set('properties', listOf(ACTIVE(), { total: 9, hidden: 5 }));
    await page.goto('/app/properties');

    await expect(page.getByText('4 of 9 shown')).toBeVisible();
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('a card prints its extent in the unit the record is filed in', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(ACTIVE())));
    await page.goto('/app/properties');

    await expect(gridCards(page).filter({ hasText: 'Sy 214/2' }).getByText('4.30 ac')).toBeVisible();
    await expect(gridCards(page).filter({ hasText: 'Flat 4B' }).getByText('1,450 sq.ft')).toBeVisible();
  });

  test('a record nobody has valued shows a dash, not ₹0', async ({ page, world }) => {
    const cards = ACTIVE();
    cards[1] = { ...cards[1], marketValue: 0, ownerName: '', tags: [], khataNo: '' };
    world.set('properties', listOf(cards));
    await page.goto('/app/properties');

    const plot = gridCards(page).filter({ hasText: 'Sy 88' });
    await expect(plot.getByText('—')).toBeVisible();
    await expect(plot.getByText('₹0')).toHaveCount(0);
    // No owner line and no khata chip — a card must not promise a name it lacks.
    await expect(plot.getByText('Khata')).toHaveCount(0);
  });

  test('the archived shop stays off the list until the Archived facet asks for it', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await expect(page.getByText('Shop 7, Market Road')).toHaveCount(0);

    await facet(page, 'Status', /^Archived/);

    await expect(page).toHaveURL(/\?status=archived$/);
    await expect.poll(() => world.lastVars('properties').statuses).toEqual(['archived']);
    await expect(gridCards(page)).toHaveCount(1);
    await expect(gridCards(page).filter({ hasText: 'Shop 7, Market Road' })
      .getByText('Archived')).toBeVisible();
  });

  test('a long list draws a screenful and offers to draw the rest', async ({ page, world }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...structuredClone(BY_ID.get(ID.parcel)!), id: `w-many-${i}`, title: `Sy ${400 + i}`,
    }));
    world.set('properties', listOf(many));
    await page.goto('/app/properties');

    await expect(gridCards(page)).toHaveCount(24);
    // The tally is about the answer, not about the batch on screen.
    await expect(page.getByText('30 of 30 shown')).toBeVisible();

    await page.getByRole('button', { name: 'Load 6 more' }).click();

    await expect(gridCards(page)).toHaveCount(30);
    await expect(page.getByRole('button', { name: /^Load/ })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · narrowing the list', () => {
  test('the facets open from one chip, and each group counts its own options', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await expect(popover(page)).toHaveCount(0);
    await page.getByRole('button', { name: '+ Filter' }).click();

    await expect(facetGroup(page, 'Kind').getByRole('button', { name: /^Land/ })).toBeVisible();
    await expect(facetGroup(page, 'Kind')).toContainText('Land3');
    await expect(facetGroup(page, 'Kind')).toContainText('Flat1');
    await expect(facetGroup(page, 'Status')).toContainText('Archived1');
    await expect(facetGroup(page, 'My stake')).toContainText('Watching1');
    await expect(facetGroup(page, 'Your tags')).toContainText('ancestral1');
  });

  test('a group the server sent no options for is not drawn at all', async ({ page, world }) => {
    world.set('properties', listOf(ACTIVE(), {
      facets: [
        { key: 'kind', label: 'Kind', options: [
          { key: 'parcel', label: 'Land', count: 3, active: false }] },
        { key: 'tags', label: 'Your tags', options: [] },
        { key: 'derived', label: 'Derived', options: [
          { key: 'Katragunta', label: 'Katragunta', count: 2, active: false }] },
      ],
    }));
    await page.goto('/app/properties');
    await page.getByRole('button', { name: '+ Filter' }).click();

    await expect(popover(page)).toContainText('Kind');
    // A heading over nothing was the reported defect; so was "DERIVED" as a
    // heading over a list of village names (GROUP_WORD, Properties.tsx:337).
    await expect(popover(page)).not.toContainText('Your tags');
    await expect(popover(page)).not.toContainText('Derived');
    await expect(popover(page)).toContainText('Village & khata');
    await expect(facetGroup(page, 'Village & khata')
      .getByRole('button', { name: /^Katragunta/ })).toBeVisible();
  });

  test('picking a facet puts it in the URL and asks the server for exactly that', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await facet(page, 'Kind', /^Flat/);

    await expect(page).toHaveURL(/\?kind=flat$/);
    await expect.poll(() => world.lastVars('properties')).toMatchObject({
      kinds: ['flat'], statuses: [], stakes: [], derived: [], tags: [],
    });
    await expect(gridCards(page)).toHaveCount(1);
    await expect(gridCards(page).first()).toContainText('Flat 4B, Sai Residency');
  });

  test('what is narrowing the list reads back as a chip that names its group', async ({ page }) => {
    await page.goto('/app/properties?stake=watch');

    // "Owned" is both a status and a stake, so a bare chip would not say which
    // one came off when it was dismissed (Properties.tsx:542).
    const chip = page.locator('.fchip').filter({ hasText: 'Watching' });
    await expect(chip).toContainText('My stake');
    await expect(page.getByRole('button', { name: 'Remove filter My stake Watching' })).toBeVisible();
  });

  test('the × on a chip takes that one filter off and leaves the others on', async ({ page }) => {
    await page.goto('/app/properties?kind=parcel&tag=ancestral');
    await expect(gridCards(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Remove filter Your tags ancestral' }).click();

    await expect(page).toHaveURL(/\?kind=parcel$/);
    await expect(gridCards(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Remove filter Kind Land' })).toBeVisible();
  });

  test('two facets narrow together, and the URL carries both', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await facet(page, 'Kind', /^Land/);
    await expect(gridCards(page)).toHaveCount(3);
    await facet(page, 'Your tags', /^ancestral/);

    await expect(page).toHaveURL(/kind=parcel/);
    await expect(page).toHaveURL(/tag=ancestral/);
    await expect.poll(() => world.lastVars('properties')).toMatchObject({
      kinds: ['parcel'], tags: ['ancestral'],
    });
    await expect(gridCards(page)).toHaveCount(1);
    await expect(gridCards(page).first()).toContainText('Sy 214/2');
  });

  test('Clear all takes the facets off — and the search with them', async ({ page }) => {
    await page.goto('/app/properties?kind=parcel&q=Katragunta');
    await expect(gridCards(page)).toHaveCount(2);
    await expect(page.locator('.fchip')).toHaveCount(2);

    await page.getByRole('button', { name: 'Clear all' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
    await expect(page.locator('.fchip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear all' })).toHaveCount(0);
  });

  test('Escape closes the facets and puts my hand back on the chip that opened them', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    const chip = page.getByRole('button', { name: '+ Filter' });
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await chip.click();
    await expect(popover(page)).toBeVisible();
    await expect(chip).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');

    await expect(popover(page)).toHaveCount(0);
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await expect(chip).toBeFocused();
  });

  test('a click anywhere else puts the facets away and changes nothing', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: '+ Filter' }).click();
    await expect(popover(page)).toBeVisible();

    await page.getByRole('heading', { name: 'Properties', level: 1 }).click();

    // Closed, and nothing narrowed on the way out: a popover that commits
    // something when it is dismissed is a popover nobody dares open.
    await expect(popover(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('a search and a facet that between them match nothing is a filter problem, not a search problem', async ({ page }) => {
    await page.goto('/app/properties?kind=flat&q=Katragunta');

    await expect(gridCards(page)).toHaveCount(0);
    // Two things are narrowing this list, so "try another word" — which is
    // what a bare search gets — would be the wrong remedy to offer
    // (Properties.tsx:988-1019).
    await expect(page.getByRole('heading', { name: 'No records match these filters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Nothing matches/ })).toHaveCount(0);
    await expect(page.getByText('Every filter narrows the same list. Clear one and the records come back.')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();

    // One button, and it takes the search off with the facet — the label says
    // "filters" but the search narrows the same list and would otherwise be
    // left behind holding the list empty (clearAll, Properties.tsx:459-466).
    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('a facet counts what clicking it will actually show, search and all', async ({ page }) => {
    // DEFECT — the search narrows the list in the BROWSER (Properties.tsx:480-
    // 489) while the number beside every facet option comes from the server,
    // which was never told there was a search: `filter` is built from five URL
    // parameters and `q` is not one of them (Properties.tsx:384-390, 415).
    //
    // So under ?q= the popover promises records a click cannot produce. With a
    // search only the flat answers, Kind still reads "Land 3" — and ticking
    // Land empties the screen.
    //
    // This is the one invariant this file opens by claiming for itself: "The
    // facets and the grid come out of a single server query, so the facet
    // counts can never claim 'For sale 2' while the grid renders three"
    // (Properties.tsx:5-7). A search breaks it — and the screen already knows
    // the search has to be allowed for, because the tally beside those very
    // facets corrects itself for it (`shownCount`, Properties.tsx:491).
    //
    // Owed: send `q` with the query like everything else that narrows this
    // list — it is already a chip in the same row, wearing the same ×, and a
    // reader has no way to know one of the four is counted differently.
    test.fail();
    await page.goto('/app/properties?q=Kukatpally');
    await expect(gridCards(page)).toHaveCount(1);

    await page.getByRole('button', { name: '+ Filter' }).click();
    const land = facetGroup(page, 'Kind').getByRole('button', { name: /^Land/ });
    const promised = Number((await land.textContent() ?? '').replace(/\D/g, ''));

    await land.click();

    // Whichever way this is fixed — the count recomputed here, or the search
    // sent with the query — the number on the option and the number of records
    // it produces are the same number.
    await expect(gridCards(page)).toHaveCount(promised);
  });

  test('a filter holding records back in more places than it can name owns up to the rest', async ({ page, world }) => {
    world.set('properties', listOf([], {
      total: 6, hidden: 6, activeCount: 1,
      hiddenPlaces: ['Kukatpally', 'Markapur', 'Ongole', 'Vinukonda'],
      facets: facets({ kind: ['flat'] }),
    }));
    await page.goto('/app/properties?kind=flat');

    // Naming two and stopping there would under-describe a filter hiding
    // records in four (Properties.tsx:1007-1011).
    await expect(page.getByText(
      'The ones being held back are in Kukatpally and Markapur and elsewhere.')).toBeVisible();
  });

  test('a filter that matches nothing says so, and one button puts the records back', async ({ page }) => {
    await page.goto('/app/properties?kind=flat&status=watch');

    await expect(gridCards(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No records match these filters' })).toBeVisible();
    await expect(page.getByText('Every filter narrows the same list. Clear one and the records come back.')).toBeVisible();
    await expect(page.getByText('The ones being held back are in Markapur.')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('picking a facet never takes the list out from under my hand', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: '+ Filter' }).click();
    const opt = facetGroup(page, 'Kind').getByRole('button', { name: /^Land/ });

    // The next answer is slow on purpose: what must survive the round trip is
    // the control that was just pressed and the list already on screen.
    world.set('properties', World.slow(2500, listOf(
      only(ID.parcel, ID.plot, ID.watched), { facets: facets({ kind: ['parcel'] }) },
    )));
    await opt.focus();
    await page.keyboard.press('Enter');

    await expect(opt).toBeFocused();
    await expect(opt).toHaveAttribute('aria-pressed', 'true');
    // The held answer is still drawn — the screen goes quiet, not blank.
    await expect(gridCards(page).filter({ hasText: 'Flat 4B' })).toHaveCount(1);

    // And when it lands, the flat is gone and the control is still there.
    await expect(gridCards(page).filter({ hasText: 'Flat 4B' })).toHaveCount(0);
    await expect(opt).toBeFocused();
  });

  test('picking the same facet again takes it back off', async ({ page, world }) => {
    await page.goto('/app/properties?kind=parcel');
    await expect(gridCards(page)).toHaveCount(3);

    await facet(page, 'Kind', /^Land/, false);

    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect.poll(() => world.lastVars('properties').kinds).toEqual([]);
    await expect(gridCards(page)).toHaveCount(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · grid, list and map', () => {
  test('the view I choose is in the URL, so the list I send opens the same way', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'List' }).click();

    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(gridCards(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('the table draws a row per record, with the word for its status', async ({ page }) => {
    await page.goto('/app/properties?view=list');

    await expect(page.getByRole('row')).toHaveCount(5);     // four records + the head
    const row = page.getByRole('row').filter({ hasText: 'Sy 214/2' });
    await expect(row).toContainText('Telukutla Shankar Reddy');
    await expect(row).toContainText('Katragunta, Markapur, Prakasam');
    await expect(row).toContainText('Owned');
    await expect(row).toContainText('₹86.0 L');
    await expect(page.getByRole('row').filter({ hasText: 'Sy 301' })).toContainText('Watch');
  });

  test('a row with no owner prints a dash rather than an empty cell', async ({ page, world }) => {
    const cards = ACTIVE();
    cards[3] = { ...cards[3], ownerName: '' };
    world.set('properties', listOf(cards));
    await page.goto('/app/properties?view=list');

    await expect(page.getByRole('row').filter({ hasText: 'Sy 301' })).toContainText('—');
  });

  test('sorting by a column reorders the table and keeps the focus on the heading', async ({ page }) => {
    await page.goto('/app/properties?view=list');
    const names = page.locator('tbody a[href^="/app/records/"]');
    await expect(names).toHaveText(['Sy 214/2', 'Sy 88', 'Flat 4B, Sai Residency', 'Sy 301']);

    const heading = columnSort(page, 'Record');
    await heading.click();

    await expect(names).toHaveText(['Flat 4B, Sai Residency', 'Sy 214/2', 'Sy 301', 'Sy 88']);
    await expect(heading).toBeFocused();
    await expect(page.getByRole('columnheader', { name: 'Record' })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('pressing the same heading again turns the order round, and a third press gives it back', async ({ page }) => {
    await page.goto('/app/properties?view=list');
    const names = page.locator('tbody a[href^="/app/records/"]');
    const heading = columnSort(page, 'Worth');

    await heading.click();
    await expect(names).toHaveText(['Sy 88', 'Sy 301', 'Flat 4B, Sai Residency', 'Sy 214/2']);

    await heading.click();
    await expect(names).toHaveText(['Sy 214/2', 'Flat 4B, Sai Residency', 'Sy 301', 'Sy 88']);
    await expect(page.getByRole('columnheader', { name: 'Worth' })).toHaveAttribute('aria-sort', 'descending');

    await heading.click();
    await expect(names).toHaveText(['Sy 214/2', 'Sy 88', 'Flat 4B, Sai Residency', 'Sy 301']);
    await expect(page.getByRole('columnheader', { name: 'Worth' })).not.toHaveAttribute('aria-sort', /.*/);
  });

  test('sorting by extent measures acres against square feet on common ground', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(ACTIVE())));
    await page.goto('/app/properties?view=list');
    const names = page.locator('tbody a[href^="/app/records/"]');

    await columnSort(page, 'Extent').click();

    // 1,450 sq.ft is 161 sq.yd: the flat is the smallest holding on the list,
    // not the largest (SORT_GET.extent, Properties.tsx:266).
    await expect(names).toHaveText(['Flat 4B, Sai Residency', 'Sy 88', 'Sy 301', 'Sy 214/2']);
  });

  test('the sort chip cycles through the orderings it offers', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    const titles = page.locator('.cards .rec h3');
    const chip = page.getByRole('button', { name: /^Sort:/ });

    await expect(chip).toHaveText(/As filed/);
    await chip.click();
    await expect(chip).toHaveText(/Name A–Z/);
    await expect(titles).toHaveText(['Flat 4B, Sai Residency', 'Sy 214/2', 'Sy 301', 'Sy 88']);

    await chip.click();
    await expect(chip).toHaveText(/Largest extent/);
    await chip.click();
    await expect(chip).toHaveText(/Highest worth/);
    await expect(titles).toHaveText(['Sy 214/2', 'Flat 4B, Sai Residency', 'Sy 301', 'Sy 88']);

    await chip.click();
    await expect(chip).toHaveText(/As filed/);
    await expect(titles).toHaveText(['Sy 214/2', 'Sy 88', 'Flat 4B, Sai Residency', 'Sy 301']);
  });

  test('the other two columns sort too — where it is, and what state it is in', async ({ page }) => {
    await page.goto('/app/properties?view=list');
    const names = page.locator('tbody a[href^="/app/records/"]');
    await expect(names).toHaveCount(4);

    await columnSort(page, 'Where').click();
    await expect(names).toHaveText(['Sy 214/2', 'Sy 301', 'Sy 88', 'Flat 4B, Sai Residency']);
    await expect(page.getByRole('columnheader', { name: 'Where' })).toHaveAttribute('aria-sort', 'ascending');

    await columnSort(page, 'Status').click();
    // owned before watch, because the sort is on the stored word, and the
    // three owned records keep the order the server sent them in.
    await expect(names).toHaveText(['Sy 214/2', 'Sy 88', 'Flat 4B, Sai Residency', 'Sy 301']);
    await expect(page.getByRole('columnheader', { name: 'Where' })).not.toHaveAttribute('aria-sort', /.*/);
  });

  test('the sort chip says what a column heading did, not only what it set itself', async ({ page }) => {
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);

    await columnSort(page, 'Owner').click();

    await expect(page.getByRole('button', { name: /^Sort:/ })).toHaveText(/Owner ↑/);
  });

  test('the map draws the records that know where they are and names the one that does not', async ({ page }) => {
    await page.goto('/app/properties?view=map');

    await expect(page.getByText('4 matching records · 3 on map')).toBeVisible();
    await expect(page.getByText(/3 records drawn — 1 from a survey, 2 from a pin\./)).toBeVisible();
    await expect(page.getByText(/1 record is not here: Sy 88 — neither surveyed nor pinned\./)).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Map search results' }))
      .toContainText('Add a location to show on map');
  });

  test('records found on the map can be acted on without going back to the grid', async ({ page }) => {
    await page.goto('/app/properties?view=map');
    await expect(mapRail(page)).toBeVisible();

    await pick(page, 'Select Sy 214/2');

    await expect(selectionBar(page)).toContainText('1 record selected');
  });

  test('a map with nothing it can draw says so rather than leaving an empty frame', async ({ page, world }) => {
    world.set('properties', listOf(only(ID.plot)));
    await page.goto('/app/properties?view=map');

    await expect(page.getByText(
      'None of these records knows where it is yet. A survey or a dropped pin puts one on this map.'))
      .toBeVisible();
    // And the count is not said at all: "0 records drawn — every one from a
    // pin, none from a survey" contradicted itself twice in one sentence
    // (Properties.tsx:1185-1199).
    await expect(page.getByText(/records? drawn/)).toHaveCount(0);
    await expect(mapRail(page)).toContainText('1 matching record · 0 on map');
  });

  test('a map of records nobody has surveyed does not claim a survey', async ({ page, world }) => {
    world.set('properties', listOf(only(ID.flat, ID.watched)));
    await page.goto('/app/properties?view=map');

    await expect(page.getByText(
      '2 records drawn — every one from a pin, none from a survey.')).toBeVisible();
    await expect(mapRail(page)).toContainText('2 matching records · 2 on map');
    // Nothing is missing from this map, so nothing is named as missing.
    await expect(page.getByText(/not here:/)).toHaveCount(0);
  });

  test('one record drawn off its own survey does not read as “every one”', async ({ page, world }) => {
    world.set('properties', listOf(only(ID.parcel)));
    await page.goto('/app/properties?view=map');

    await expect(page.getByText('1 record drawn — from its survey.')).toBeVisible();
  });

  test('a map that cannot place five records names three and owns up to the rest', async ({ page, world }) => {
    const lost = Array.from({ length: 5 }, (_, i) => ({
      ...structuredClone(BY_ID.get(ID.plot)!), id: `w-lost-${i}`, title: `Sy ${900 + i}`,
    }));
    world.set('properties', listOf([...only(ID.parcel), ...lost]));
    await page.goto('/app/properties?view=map');

    const said = page.getByText(/not here:/);
    await expect(said).toContainText('1 record drawn — from its survey.');
    await expect(said).toContainText(
      '5 records are not here: Sy 900, Sy 901, Sy 902 and others — neither surveyed nor pinned.');
    await expect(said).toContainText('Opening one and dropping its pin is enough.');
  });

  test('searching from the map narrows the map, its list and its count together', async ({ page }) => {
    await page.goto('/app/properties?view=map');
    await expect(mapRail(page)).toContainText('4 matching records · 3 on map');

    await page.getByLabel('Search your land on the map').fill('Kukatpally');

    await expect(page).toHaveURL(/q=Kukatpally/);
    await expect(mapRail(page)).toContainText('1 matching record · 1 on map');
    await expect(mapRail(page).getByRole('button', { name: /^Flat 4B/ })).toBeVisible();
    await expect(mapRail(page).getByRole('button', { name: /^Sy 214\/2/ })).toHaveCount(0);
  });

  test('a record the map has nowhere to put sends me to where I can put it', async ({ page }) => {
    await page.goto('/app/properties?view=map');
    const row = mapRail(page).getByRole('button', { name: /^Sy 88/ });
    await expect(row).toContainText('Add a location to show on map');

    await row.click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}/map$`));
  });

  test('picking a record off the map’s list says what it is and where to go next', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(ACTIVE())));
    await page.goto('/app/properties?view=map');

    await mapRail(page).getByRole('button', { name: /^Sy 214\/2/ }).click();

    // A tooltip answers "which one is that" while the pointer is on it; this
    // answers "what is it, and where do I go next" once it has left.
    await expect(page.getByText('Katragunta, Markapur · 4.30 ac')).toBeVisible();
    // `exact`, because every row in the rail beside it offers a
    // "View / measure boundary" of its own.
    await expect(page.getByRole('link', { name: 'Open', exact: true }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(page.getByRole('link', { name: 'Boundary', exact: true }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);
  });

  test('the map view empties into the same panel the other two do', async ({ page }) => {
    await page.goto('/app/properties?view=map&kind=flat&status=watch');

    await expect(page.getByRole('heading', { name: 'No records match these filters' })).toBeVisible();
    // No frame, no rail and no count over nothing to draw.
    await expect(mapRail(page)).toHaveCount(0);
    await expect(page.getByLabel('Search your land on the map')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();

    await expect(page).toHaveURL(/view=map/);
    await expect(mapRail(page)).toContainText('4 matching records · 3 on map');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · acting on several records', () => {
  test('nothing offers to act on many records until I have picked some', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    // "Order EC ×14" as a standing offer, to a reader who had selected
    // nothing, was the reported defect (Properties.tsx:670).
    await expect(selectionBar(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Order EC/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete…' })).toHaveCount(0);
  });

  test('picking a card raises the bar, and every label on it counts the selection', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await pick(page, 'Select Sy 214/2');

    await expect(selectionBar(page)).toContainText('1 record selected — these buttons act on them.');
    await expect(selectionBar(page).getByRole('button', { name: 'Order EC ×1' })).toBeVisible();

    await pick(page, 'Select Sy 88');
    await expect(selectionBar(page)).toContainText('2 records selected');
    await expect(selectionBar(page).getByRole('button', { name: 'Order EC ×2' })).toBeVisible();

    await selectionBar(page).getByRole('button', { name: 'Clear' }).click();
    await expect(selectionBar(page)).toHaveCount(0);
  });

  test('select-all ticks every row and the bar says how many are in hand', async ({ page }) => {
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);

    await pick(page, 'Select all shown');

    await expect(page.getByRole('checkbox', { name: 'Select Sy 214/2' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select Flat 4B, Sai Residency' })).toBeChecked();
    await expect(selectionBar(page)).toContainText('4 records selected');

    await unpick(page, 'Select Sy 88');
    await expect(selectionBar(page)).toContainText('3 records selected');
    await expect(page.getByRole('checkbox', { name: 'Select all shown' })).not.toBeChecked();
  });

  test('changing the filter drops a selection rather than carrying it to records I cannot see', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');
    await expect(selectionBar(page)).toBeVisible();

    await facet(page, 'Kind', /^Flat/);

    await expect(selectionBar(page)).toHaveCount(0);
  });

  test('archiving what I picked asks first, then sends exactly those records', async ({ page, world }) => {
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 214/2');
    await pick(page, 'Select Sy 88');

    await selectionBar(page).getByRole('button', { name: 'Archive' }).click();

    const dialog = page.getByRole('dialog', { name: 'Archive 2 records?' });
    await expect(dialog).toContainText('Archived records leave the list, the map and every total');
    await dialog.getByRole('button', { name: 'Archive' }).click();

    await expect.poll(() => world.calls('archiveRecords')).toHaveLength(1);
    expect(world.lastVars('archiveRecords')).toMatchObject({
      ids: [ID.parcel, ID.plot], archived: true,
    });
    await expect(dialog).toHaveCount(0);
    await expect(selectionBar(page)).toHaveCount(0);
  });

  test('a server that moved only some of them says so and keeps the dialog open', async ({ page, world }) => {
    world.set('archiveRecords', 1);
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select all shown');

    await selectionBar(page).getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archive 4 records?' });
    await dialog.getByRole('button', { name: 'Archive' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'Only 1 of 4 records were changed. Reload before trying the rest again.');
    await expect(dialog).toBeVisible();
  });

  test('a refused archive leaves the dialog up and nothing changed', async ({ page, world }) => {
    world.set('archiveRecords', World.gqlError('the record store is read-only'));
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 301');

    await selectionBar(page).getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archive 1 record?' });
    await dialog.getByRole('button', { name: 'Archive' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'That did not go through. Nothing was changed — try again.');
    await expect(page.getByRole('checkbox', { name: 'Select Sy 301' })).toBeChecked();
  });

  test('tagging the selection sends the word I typed to exactly those records', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');

    await selectionBar(page).getByRole('button', { name: 'Tag…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Tag 1 record' });
    // The tags the account already uses are offered rather than retyped.
    await expect(dialog.getByRole('button', { name: 'ancestral' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Apply tag' })).toBeDisabled();
    await dialog.getByLabel('Your tag').fill('give to lawyer');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();

    await expect.poll(() => world.calls('tagRecords')).toHaveLength(1);
    expect(world.lastVars('tagRecords')).toMatchObject({ ids: [ID.parcel], tag: 'give to lawyer' });
    await expect(dialog).toHaveCount(0);
  });

  test('ordering a certificate for the selection says what it will cost', async ({ page, world }) => {
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select all shown');

    await selectionBar(page).getByRole('button', { name: 'Order EC ×4' }).click();

    const dialog = page.getByRole('dialog', { name: 'Order 4 ECs?' });
    await expect(dialog).toContainText('One Encumbrance Certificate order per record, ₹1,180 each.');
    await dialog.getByRole('button', { name: 'Order EC ×4' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    // `placeOrder` (api.ts:1066) is the one door to this mutation now, and it
    // fills in what each of the three callers used to fill in for itself: an
    // empty answer sheet and an empty manifest, as JSON and never undefined.
    // The bulk order asks no questions and attaches nothing, so both are '{}'.
    expect(world.lastVars('orderService')).toMatchObject({
      recordIds: [ID.parcel, ID.plot, ID.flat, ID.watched], kind: 'ec',
      params: '{}', attachmentManifest: '{}',
    });
    // And a key, so that four certificates at ₹1,180 each cannot be bought
    // twice by a second press on a village connection (Properties.tsx:694).
    expect(keyOf(world, 0)).toMatch(KEY_SHAPE);
  });

  test('a selection survives looking at the same records another way', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');
    await expect(selectionBar(page)).toContainText('1 record selected');

    await page.getByRole('button', { name: 'List' }).click();

    // Grid, List and Map hold the same records, so a reader who picked three
    // parcels and then wanted to see them on a map has not changed what they
    // picked (narrowKey, Properties.tsx:613-614).
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select Sy 214/2' })).toBeChecked();
    await expect(selectionBar(page)).toContainText('1 record selected');
  });

  test('a server that moved none of them says so rather than closing on a lie', async ({ page, world }) => {
    world.set('archiveRecords', 0);
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 214/2');
    await pick(page, 'Select Sy 88');

    await selectionBar(page).getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archive 2 records?' });
    await dialog.getByRole('button', { name: 'Archive' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'None of those records could be changed. Reload the list and try again.');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select Sy 214/2' })).toBeChecked();
  });

  test('deleting several at once counts them and says what goes with them', async ({ page, world }) => {
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 88');
    await pick(page, 'Select Sy 301');

    await selectionBar(page).getByRole('button', { name: 'Delete…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete 2 records?' });
    await expect(dialog).toContainText(
      'Everything filed under them goes too — papers, photos, features, people and the money ledger.');
    await expect(dialog).toContainText('If you only want them out of the way, Archive instead.');
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => world.calls('deleteRecords')).toHaveLength(1);
    expect(world.lastVars('deleteRecords')).toMatchObject({ ids: [ID.plot, ID.watched] });
    await expect(selectionBar(page)).toHaveCount(0);
  });

  test('a tag this account already uses is one press, not something to retype', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 88');

    await selectionBar(page).getByRole('button', { name: 'Tag…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tag 1 record' });
    await dialog.getByRole('button', { name: 'rented' }).click();

    await expect(dialog.getByLabel('Your tag')).toHaveValue('rented');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();

    await expect.poll(() => world.calls('tagRecords')).toHaveLength(1);
    expect(world.lastVars('tagRecords')).toMatchObject({ ids: [ID.plot], tag: 'rented' });
  });

  test('a tag that reached only some of them says which, and holds on to the rest', async ({ page, world }) => {
    world.set('tagRecords', 1);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');
    await pick(page, 'Select Sy 88');

    await selectionBar(page).getByRole('button', { name: 'Tag…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tag 2 records' });
    await dialog.getByLabel('Your tag').fill('give to lawyer');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'The tag reached 1 of 2 records. Reload before trying the rest again.');
    await expect(dialog.getByLabel('Your tag')).toHaveValue('give to lawyer');
  });

  test('a tag the server refuses leaves the word I typed where I can try it again', async ({ page, world }) => {
    world.set('tagRecords', World.gqlError('the tag store is read-only'));
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 301');

    await selectionBar(page).getByRole('button', { name: 'Tag…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tag 1 record' });
    await dialog.getByLabel('Your tag').fill('boundary dispute');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('The tag did not save. Try again.');
    await expect(dialog.getByLabel('Your tag')).toHaveValue('boundary dispute');
    await expect(page.getByRole('checkbox', { name: 'Select Sy 301' })).toBeChecked();
  });

  test('ordering one certificate asks for one, and the bar lets go once it is placed', async ({ page, world }) => {
    world.set('orderService', 1);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');

    await selectionBar(page).getByRole('button', { name: 'Order EC ×1' }).click();

    const dialog = page.getByRole('dialog', { name: 'Order an EC?' });
    await expect(dialog).toContainText('One Encumbrance Certificate order per record, ₹1,180 each.');
    await expect(dialog).toContainText('They appear under Services as they are placed.');
    await dialog.getByRole('button', { name: 'Order EC ×1' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    expect(world.lastVars('orderService')).toMatchObject({
      recordIds: [ID.parcel], kind: 'ec', params: '{}', attachmentManifest: '{}',
    });
    expect(keyOf(world, 0)).toMatch(KEY_SHAPE);
    await expect(dialog).toHaveCount(0);
    await expect(selectionBar(page)).toHaveCount(0);
  });

  test('pressing Order again after the server said no files the same order, not a second one', async ({ page, world }) => {
    // A refusal is the one outcome that leaves the dialog standing with its
    // button live, so it is the outcome that gets pressed twice — which is the
    // press the key exists for. A partial or refused order deliberately KEEPS
    // the intent (Properties.tsx:751-753); only a full success spends it.
    world.set('orderService', 0);
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 214/2');

    await selectionBar(page).getByRole('button', { name: 'Order EC ×1' }).click();
    const dialog = page.getByRole('dialog', { name: 'Order an EC?' });
    await dialog.getByRole('button', { name: 'Order EC ×1' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'None of those records could be changed. Reload the list and try again.');

    await dialog.getByRole('button', { name: 'Order EC ×1' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(2);
    // One intent, one key. The server hashes (key, request) and replays the
    // answer it already gave rather than inserting a second EC, so two presses
    // of the same order are one order — which is only true if the second press
    // carries the key the first one carried.
    expect(keyOf(world, 0)).toMatch(KEY_SHAPE);
    expect(keyOf(world, 1)).toBe(keyOf(world, 0));
  });

  test('ordering a different set of records is a different order, and carries a key of its own', async ({ page, world }) => {
    world.set('orderService', 0);
    await page.goto('/app/properties?view=list');
    await expect(page.getByRole('row')).toHaveCount(5);
    await pick(page, 'Select Sy 214/2');

    await selectionBar(page).getByRole('button', { name: 'Order EC ×1' }).click();
    const one = page.getByRole('dialog', { name: 'Order an EC?' });
    await one.getByRole('button', { name: 'Order EC ×1' }).click();
    await expect(one.getByRole('alert')).toBeVisible();
    await one.getByRole('button', { name: 'Cancel' }).click();

    await pick(page, 'Select Sy 88');
    await selectionBar(page).getByRole('button', { name: 'Order EC ×2' }).click();
    const two = page.getByRole('dialog', { name: 'Order 2 ECs?' });
    await two.getByRole('button', { name: 'Order EC ×2' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(2);
    expect(world.calls('orderService')[1].vars).toMatchObject({
      recordIds: [ID.parcel, ID.plot],
    });
    // Two records is a different request, and the server only replays a key
    // against the hash it first saw: holding the key steady across this change
    // would be answered 0 — the same number it uses to say it refused
    // (Properties.tsx:707-712).
    expect(keyOf(world, 1)).toMatch(KEY_SHAPE);
    expect(keyOf(world, 1)).not.toBe(keyOf(world, 0));
  });

  test('a selection of archived records offers to bring them back, not to archive them again', async ({ page, world }) => {
    await page.goto('/app/properties?status=archived');
    await expect(gridCards(page)).toHaveCount(1);
    await pick(page, 'Select Shop 7, Market Road');

    await selectionBar(page).getByRole('button', { name: 'Unarchive' }).click();

    const dialog = page.getByRole('dialog', { name: 'Unarchive 1 record?' });
    await expect(dialog).toContainText('It rejoins the list, the map and the portfolio totals.');
    await dialog.getByRole('button', { name: 'Unarchive' }).click();

    await expect.poll(() => world.calls('archiveRecords')).toHaveLength(1);
    expect(world.lastVars('archiveRecords')).toMatchObject({ ids: [ID.shop], archived: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · Export', () => {
  test('Export writes the list I am looking at, a row per card', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^properties-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await download.path(), 'utf8');
    const lines = csv.replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).toBe('Record,Kind,Owner,Village,Mandal,District,Khata,Status,Stake,Extent,Unit,Worth (₹),Tags');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe('Sy 214/2,parcel,Telukutla Shankar Reddy,Katragunta,Markapur,Prakasam,1042,owned,owned,4.3,acres,8600000,ancestral');
    // The archived shop is not on the screen, so it is not in the file.
    expect(csv).not.toContain('Shop 7');
  });

  test('Export writes the filtered list, not the whole portfolio', async ({ page }) => {
    await page.goto('/app/properties?kind=flat');
    await expect(gridCards(page)).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);

    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.replace(/^﻿/, '').trim().split('\n')).toHaveLength(2);
    expect(csv).toContain('Flat 4B, Sai Residency');
    expect(csv).not.toContain('Sy 214/2');
  });

  test('a bar that says three records are selected exports three records', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await pick(page, 'Select Sy 214/2');
    await pick(page, 'Select Sy 88');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      selectionBar(page).getByRole('button', { name: 'Export' }).click(),
    ]);

    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.replace(/^﻿/, '').trim().split('\n')).toHaveLength(3);
    expect(csv).toContain('Sy 214/2');
    expect(csv).toContain('Sy 88');
    expect(csv).not.toContain('Flat 4B');
  });

  test('Export is not offered over a list with nothing on it', async ({ page }) => {
    await page.goto('/app/properties?kind=flat&status=watch');

    await expect(gridCards(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · the add drawer', () => {
  test('Add opens on the paper, with hand entry one quiet link away', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Start from the paper')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Choose a file' })).toBeFocused();
    // The form is behind the link, not in front of the scan.
    await expect(drawer.getByLabel('Survey number')).toHaveCount(0);

    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await expect(drawer.getByLabel('Survey number')).toBeVisible();
  });

  test('the drawer will not file a record with no name on it', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();

    await expect(drawer.getByRole('button', { name: 'Add record' })).toBeDisabled();
    await drawer.getByLabel('Village').fill('Katragunta');
    await expect(drawer.getByRole('button', { name: 'Add record' })).toBeDisabled();

    await drawer.getByLabel('Survey number').fill('Sy 411');
    await expect(drawer.getByRole('button', { name: 'Add record' })).toBeEnabled();
  });

  test('a record typed by hand is saved with exactly what I typed', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();

    await drawer.getByLabel('Survey number').fill('Sy 411/1');
    await drawer.getByLabel("Owner's name").fill('Telukutla Venkat Reddy');
    await drawer.getByLabel('Khata no').fill('907');
    await drawer.getByLabel('Village').fill('Chintagunta');
    await drawer.getByLabel('Mandal').fill('Markapur');
    await drawer.getByLabel('District').fill('Prakasam');
    await drawer.getByLabel('Extent · Acres').fill('2.5');
    await drawer.getByLabel('Worth today').fill('4200000');
    await expect(drawer.getByLabel('Worth today')).toHaveValue('₹42,00,000');
    await drawer.getByLabel('What you paid').fill('900000');
    await drawer.getByLabel('Status').selectOption('for_sale');

    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    expect(world.lastVars('saveRecord').input).toEqual({
      kind: 'parcel', title: 'Sy 411/1', classification: 'agri',
      status: 'for_sale', stake: 'owned', khataNo: '907',
      ownerName: 'Telukutla Venkat Reddy', village: 'Chintagunta',
      mandal: 'Markapur', district: 'Prakasam',
      extent: 2.5, extentUnit: 'ac', marketValue: 4200000, purchasePrice: 900000,
    });
    await expect(drawer).toHaveCount(0);
  });

  test('a money box left alone files no figure at all, rather than ₹0', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();

    await expect(drawer.getByLabel('Worth today')).toHaveValue('');
    await drawer.getByLabel('Survey number').fill('Sy 12');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    const input = world.lastVars('saveRecord').input as Record<string, unknown>;
    expect(input).not.toHaveProperty('marketValue');
    expect(input).not.toHaveProperty('purchasePrice');
  });

  test('choosing a built property measures it in square feet and asks what kind it is', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();

    await drawer.getByRole('button', { name: /^Built property/ }).click();

    await expect(drawer.getByLabel('What it is called')).toBeVisible();
    await expect(drawer.getByLabel('Extent · Sq.ft')).toBeVisible();
    await expect(drawer.getByLabel('Locality')).toBeVisible();
    await drawer.getByRole('button', { name: 'Shop', exact: true }).click();

    await drawer.getByLabel('What it is called').fill('Shop 9, Market Road');
    await drawer.getByLabel('Extent · Sq.ft').fill('420');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    expect(world.lastVars('saveRecord').input).toMatchObject({
      kind: 'property', classification: 'shop', extent: 420, extentUnit: 'sq.ft',
    });
  });

  test('Escape on a half-typed record asks before throwing it away', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await drawer.getByLabel('Survey number').fill('Sy 411/1');

    await page.keyboard.press('Escape');

    const asking = page.getByRole('dialog', { name: 'Discard this record?' });
    await expect(asking).toContainText('Nothing has been saved yet.');
    await asking.getByRole('button', { name: 'Keep editing' }).click();

    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 411/1');

    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Discard this record?' })
      .getByRole('button', { name: 'Discard' }).click();
    await expect(drawer).toHaveCount(0);
  });

  test('Escape on a drawer I have not touched just closes it', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Discard this record?' })).toHaveCount(0);
  });

  test('a save the server refuses keeps the drawer open and says why', async ({ page, world }) => {
    world.set('saveRecord', World.gqlError('a record with that survey number already exists'));
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await drawer.getByLabel('Survey number').fill('Sy 214/2');

    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect(drawer.getByText('a record with that survey number already exists')).toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 214/2');
  });

  test('?new=1 opens the drawer on arrival and takes itself back out of the URL', async ({ page }) => {
    await page.goto('/app/properties?new=1');

    await expect(page.getByRole('dialog', { name: 'Add a record' })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/properties$/);
  });

  test('Cancel on a half-typed record is a deliberate press, and closes at once', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    const drawer = await handEntry(page);
    await drawer.getByLabel('Survey number').fill('Sy 411/1');

    await drawer.getByRole('button', { name: 'Cancel' }).click();

    // Only the two ACCIDENTAL paths ask first — Escape and a slipped click on
    // the scrim. Cancel and the header X are somebody saying it
    // (PropertyActions.tsx:271-278).
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Discard this record?' })).toHaveCount(0);
  });

  test('a record added while I am looking at the map lands where its boundary gets drawn', async ({ page, world }) => {
    await page.goto('/app/properties?view=map');
    await expect(mapRail(page)).toBeVisible();

    const drawer = await handEntry(page);
    await drawer.getByLabel('Survey number').fill('Sy 411');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    // A record made from the map has nowhere on it yet, so the one thing to do
    // next is put it there (Properties.tsx:1299-1303). From the grid it just
    // closes, which the tests above cover.
    await expect(page).toHaveURL(/\/app\/records\/w-record-new\/map$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
/**
 * The half of "Add a record" that reads the paper.
 *
 * The drawer opens HERE, not on the form: the deed is in the person's hand
 * and the machine can read it. ScanFirst.tsx has three states — idle, reading,
 * failed — and the drawer then has to file the deed against the record it just
 * made, or say plainly that it could not.
 */
test.describe('W02 · adding from the paper', () => {
  test('the deed I hand it fills the boxes and says in words what it took from them', async ({ page, world }) => {
    readerSays(world, DEED);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });

    await scanPicker(page).setInputFiles(fileOf('sale-deed.pdf', 0.002), { timeout: 60_000 });

    // What was read, in words, before a single box is checked — so the
    // question is "is this the right document?" rather than "are these
    // twenty-six boxes right?".
    await expect(drawer.getByText('What this document says')).toBeVisible();
    await expect(drawer.getByText(DEED.summary)).toBeVisible();
    await expect(drawer.getByText('Worth checking yourself')).toBeVisible();
    await expect(drawer.getByRole('listitem')).toHaveText(DEED.caveats[0]);
    await expect(drawer.getByText(
      "From sale-deed.pdf: filled the survey number, khata, owner's name, village, mandal, "
      + 'district, extent, what you paid. Read by AI — check each one against the paper before you save.'))
      .toBeVisible();

    // And the form is open underneath, holding exactly what was read.
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 411/1');
    await expect(drawer.getByLabel('Khata no')).toHaveValue('907');
    await expect(drawer.getByLabel("Owner's name")).toHaveValue('Telukutla Venkat Reddy');
    await expect(drawer.getByLabel('Village')).toHaveValue('Chintagunta');
    await expect(drawer.getByLabel('Mandal')).toHaveValue('Markapur');
    await expect(drawer.getByLabel('District')).toHaveValue('Prakasam');
    await expect(drawer.getByLabel('Extent · Acres')).toHaveValue('2.5');
    await expect(drawer.getByLabel('What you paid')).toHaveValue('₹9,00,000');
    // Nothing is written until somebody presses Add record.
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('a deed written in square yards is filed in square yards, not in acres', async ({ page, world }) => {
    readerSays(world, { ...DEED, extent: '418-1/2 Sq. Yards' });
    storageTakes(world, NODE);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });

    await scanPicker(page).setInputFiles(fileOf('sale-deed.pdf', 0.002), { timeout: 60_000 });

    // 418.12 acres is what stripping every non-digit and writing the figure
    // under the FORM's unit produced — four thousand times the land, in a land
    // record (deedExtent, PropertyActions.tsx:64-89).
    await expect(drawer.getByLabel('Extent · Sq.yd')).toHaveValue('418.5');
    await expect(drawer.getByLabel('Extent · Acres')).toHaveCount(0);

    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    expect(world.lastVars('saveRecord').input).toMatchObject({
      extent: 418.5, extentUnit: 'sq.yd',
    });
  });

  test('a deed only says what the boxes do not already', async ({ page, world }) => {
    readerSays(world, DEED);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    const drawer = await handEntry(page);
    await drawer.getByLabel('Survey number').fill('Sy 9/1A');

    await scanPicker(page).setInputFiles(fileOf('sale-deed.pdf', 0.002), { timeout: 60_000 });

    // Someone who has already typed a survey number meant it: a machine's
    // reading is not grounds for overwriting what a person put there
    // (applyReading, PropertyActions.tsx:414-471).
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 9/1A');
    await expect(drawer.getByLabel('Khata no')).toHaveValue('907');
    await expect(drawer.getByText(/^From sale-deed\.pdf: filled the khata, owner's name,/))
      .toBeVisible();
  });

  test('a file too big to read is refused before the wait, not after it', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });

    await scanPicker(page).setInputFiles(fileOf('passbook-scan.pdf', 10.4), { timeout: 60_000 });

    await expect(drawer.getByText('passbook-scan.pdf is 10.4 MB. The limit is 10.0 MB.')).toBeVisible();
    // Said before the wait, and the manual road is already open behind it.
    await expect(drawer.getByLabel('Survey number')).toBeVisible();
    // Not one byte left the page: the size is checked here, not reported back
    // by the reader after a minute (ScanFirst.tsx:99-104).
    expect(world.restCalls(/import-/)).toHaveLength(0);
  });

  test('a deed the reader cannot make sense of opens the form itself and says why', async ({ page, world }) => {
    // No route of its own: the seed answers the reader `{ state: 'failed' }`
    // by default (fixtures/seed.ts:896), which is this branch.
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await expect(drawer.getByLabel('Survey number')).toHaveCount(0);

    await scanPicker(page).setInputFiles(fileOf('blurry.jpg', 0.01, 'image/jpeg'), { timeout: 60_000 });

    await expect(drawer.getByText('The deed couldn’t be read')).toBeVisible();
    await expect(drawer.getByText('That file could not be read. Fill the form in by hand.')).toBeVisible();
    // The automatic path has just failed, so the manual one is in front of the
    // reader rather than behind another click — and the scan collapses to one
    // retry instead of offering three big buttons again (ScanFirst.tsx:126-129).
    await expect(drawer.getByLabel('Survey number')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Try another file' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Choose a file' })).toHaveCount(0);
    // Nothing was filed off a reading that did not happen.
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('the deed a record was read from is filed against the record it made', async ({ page, world }) => {
    readerSays(world, DEED);
    storageTakes(world, NODE);
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await scanPicker(page).setInputFiles(fileOf('sale-deed.pdf', 0.002), { timeout: 60_000 });
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 411/1');

    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    // The evidence goes in WITH the record. A record made from a scanned deed
    // that then reported "no documents attached yet" about that very deed is
    // the bug this exists to stop (ScanFirst.tsx:41-48).
    await expect.poll(() => world.calls('addPaper')).toHaveLength(1);
    expect(world.lastVars('addPaper')).toMatchObject({
      recordId: 'w-record-new', fileRef: 'file-deed-1',
      // Named the way the register names it, not "sale-deed.pdf".
      name: 'Sale Deed 4412/1998',
      subtitle: 'Registered 14/03/1998 · Markapur SRO · Chintagunta',
      shelf: 'title', mimeType: 'application/pdf',
    });
    await expect(drawer).toHaveCount(0);
  });

  test.describe('when the drive underneath is down', () => {
    // Chrome logs every non-2xx response itself ("Failed to load resource …
    // 503"), and provoking exactly that on the storage gateway is the point.
    test.use({ allowConsole: true });

    test('a record whose deed would not file is still saved, and the drawer says so', async ({ page, world }) => {
      readerSays(world, DEED);
      world.route(/\/api\/gateway\/storage\/files\?/, () => ({
        status: 503, json: { error: 'the drive is offline' },
      }));
      await page.goto('/app/properties');
      await expect(gridCards(page)).toHaveCount(4);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Add a record' });
      await scanPicker(page).setInputFiles(fileOf('sale-deed.pdf', 0.002), { timeout: 60_000 });
      await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 411/1');

      await drawer.getByRole('button', { name: 'Add record' }).click();

      await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
      // Closing here would carry the message away with the drawer, so the
      // drawer becomes the report (PropertyActions.tsx:392-401).
      await expect(drawer.getByText(/^The record was saved, but its deed could not be filed/))
        .toBeVisible();
      await expect(drawer.getByText(/You can add it from the record's Papers\.$/)).toBeVisible();
      expect(world.calls('addPaper')).toHaveLength(0);

      // And the button stops being a second save: the record already exists.
      const done = drawer.getByRole('button', { name: 'Done' });
      await expect(done).toBeVisible();
      await done.click();

      await expect(drawer).toHaveCount(0);
      expect(world.calls('saveRecord')).toHaveLength(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · the menu on one record', () => {
  test('the kebab names the record it is about before it offers to delete it', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();

    const menu = page.getByRole('menu', { name: 'Actions for Sy 214/2' });
    await expect(menu.getByRole('menuitem', { name: 'Edit…' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Order a service…' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Share…' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Delete…' })).toBeVisible();
    // A column of verbs with no subject, one of which is Delete (ui.tsx Menu).
    await expect(page.locator('.menuhead')).toHaveText('Sy 214/2');
  });

  test('editing one record sends only the field I changed', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.getByRole('dialog', { name: 'Edit Sy 214/2' });
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 214/2');
    await expect(drawer.getByLabel('Khata no')).toHaveValue('1042');
    await expect(drawer.getByLabel('Worth today')).toHaveValue('₹86,00,000');

    await drawer.getByLabel("Owner's name").fill('Telukutla Shankar Reddy Jr');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    expect(world.lastVars('saveRecord').input).toEqual({
      kind: 'parcel', id: ID.parcel, ownerName: 'Telukutla Shankar Reddy Jr',
    });
  });

  test('an edit that changed nothing writes nothing at all', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.getByRole('dialog', { name: 'Edit Sy 88' });
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('Order a service lands on that record\u2019s own order screen, already asking what to do on it', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await page.getByRole('menuitem', { name: 'Order a service…' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/order$`));
    // Ordering is four steps now, and coming in from this menu lands on the
    // second of them: the land is a path segment, so "which property?" is
    // already answered and is never asked (OrderService.tsx:296-298).
    await expect(page.getByRole('heading', {
      name: 'What do you want done on this land?', level: 2 })).toBeVisible();
    // The trail still ends where the menu item said it would.
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toContainText('Order a service');
    // The catalogue is pressable tiles carrying their own price, and nothing
    // has been chosen on the owner's behalf.
    const ec = page.getByRole('button', { name: /^Encumbrance Certificate/ });
    await expect(ec).toHaveAttribute('aria-pressed', 'false');
    await expect(ec).toContainText('₹1,180');
    await expect(page.getByRole('button', { name: 'Answer what it needs' })).toBeDisabled();
  });

  test('Share opens the share panel on that record, not a page to go hunting through', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await page.getByRole('menuitem', { name: 'Share…' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}\\?share=1$`));
  });

  test('deleting a record says what goes with it before the red button does it', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete this record?' });
    await expect(dialog).toContainText('papers, photos, features, people and the money ledger');
    await expect(dialog).toContainText('There is no undo.');
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => world.calls('deleteRecords')).toHaveLength(1);
    expect(world.lastVars('deleteRecords')).toMatchObject({ ids: [ID.plot] });
  });

  test('cancelling a delete deletes nothing', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();

    await page.getByRole('dialog', { name: 'Delete this record?' })
      .getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('deleteRecords')).toHaveLength(0);
  });

  test('archiving one record from its own menu names it in the question', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);

    await page.getByRole('button', { name: 'Actions for Sy 301' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();

    const dialog = page.getByRole('dialog', { name: 'Archive 1 record?' });
    await dialog.getByRole('button', { name: 'Archive' }).click();

    await expect.poll(() => world.calls('archiveRecords')).toHaveLength(1);
    expect(world.lastVars('archiveRecords')).toMatchObject({ ids: [ID.watched], archived: true });
  });

  test('renaming what a property IS does not quietly re-measure it', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(ACTIVE())));
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Flat 4B, Sai Residency' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.getByRole('dialog', { name: 'Edit Flat 4B, Sai Residency' });
    await expect(drawer.getByLabel('Extent · Sq.ft')).toHaveValue('1450');

    // The unit box follows the kind of thing it is …
    await drawer.getByRole('button', { name: 'Open plot' }).click();
    await expect(drawer.getByLabel('Extent · Sq.yd')).toHaveValue('1450');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    // … but the FIGURE does not travel with it. 1,450 sq.ft re-sent as 1,450
    // sq.yd is nine times the land, written by a reclassification nobody
    // thought was a measurement (PropertyActions.tsx:231-240).
    const input = world.lastVars('saveRecord').input as Record<string, unknown>;
    expect(input).toMatchObject({ id: ID.flat, classification: 'open_plot' });
    expect(input).not.toHaveProperty('extent');
    expect(input).not.toHaveProperty('extentUnit');
  });

  test('clearing the worth box leaves the filed figure alone rather than writing ₹0 over it', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.getByRole('dialog', { name: 'Edit Sy 214/2' });
    await expect(drawer.getByLabel('Worth today')).toHaveValue('₹86,00,000');
    await drawer.getByLabel('Worth today').fill('');
    await expect(drawer.getByLabel('Worth today')).toHaveValue('');
    await drawer.getByLabel("Owner's name").fill('Telukutla Shankar Reddy Jr');

    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    // An empty box is "I do not know what it is worth", not ₹0 — and ₹0 over
    // a real valuation is a figure nobody would have noticed going in
    // (PropertyActions.tsx:242-244).
    expect(world.lastVars('saveRecord').input).toEqual({
      kind: 'parcel', id: ID.parcel, ownerName: 'Telukutla Shankar Reddy Jr',
    });
  });

  test('Escape on a changed record asks in the words of an edit, not of a new record', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit Sy 88' });
    await drawer.getByLabel('Khata no').fill('319');

    await page.keyboard.press('Escape');

    const asking = page.getByRole('dialog', { name: 'Discard these changes?' });
    await expect(asking).toContainText('What you have changed here has not been saved.');
    await asking.getByRole('button', { name: 'Keep editing' }).click();

    await expect(drawer.getByLabel('Khata no')).toHaveValue('319');
  });

  test('Escape on an edit I have only looked at just closes it', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(gridCards(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Actions for Sy 88' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit Sy 88' });
    await expect(drawer.getByLabel('Survey number')).toHaveValue('Sy 88');

    await page.keyboard.press('Escape');

    // "A field has something in it" is the wrong question for an edit drawer:
    // it opens full of the record's own values (PropertyActions.tsx:257-265).
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Discard these changes?' })).toHaveCount(0);
  });

  test('an archived record is offered its way back, and its drawer says it is out of the lists', async ({ page }) => {
    await page.goto('/app/properties?status=archived');
    await expect(gridCards(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Actions for Shop 7, Market Road' }).click();
    await expect(page.getByRole('menuitem', { name: 'Unarchive' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.getByRole('dialog', { name: 'Edit Shop 7, Market Road' });
    await expect(drawer).toContainText('This record is archived.');
    await expect(drawer.getByText('Archived. Unarchive the record to give it a status again.')).toBeVisible();
    // No status select to lie with while the record is out of the lists.
    await expect(drawer.getByLabel('Status')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · a list with nothing on it', () => {
  test('an account with no records says so and does not draw a screenful of furniture over nothing', async ({ page, world }) => {
    world.set('properties', listOf([], { facets: [] }));
    await page.goto('/app/properties');

    // Empty's title is a paragraph, not a heading (ui.tsx Empty).
    await expect(page.getByText('Nothing filed yet')).toBeVisible();
    await expect(page.getByText('Add your first parcel or property')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a record' })).toBeVisible();

    // The filter row, the view switch, Export and the tally are all furniture
    // for rows that do not exist.
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.getByText(/of 0 shown/)).toHaveCount(0);
  });

  test('the one thing to do on an empty account opens the drawer', async ({ page, world }) => {
    world.set('properties', listOf([], { facets: [] }));
    await page.goto('/app/properties');

    await page.getByRole('button', { name: 'Add a record' }).click();

    await expect(page.getByRole('dialog', { name: 'Add a record' })).toBeVisible();
  });

  test('an account whose every record is archived is told where they went', async ({ page, world }) => {
    world.set('properties', listOf([], {
      facets: [{ key: 'status', label: 'Status', options: [
        { key: 'archived', label: 'Archived', count: 2, active: false },
      ] }],
    }));
    await page.goto('/app/properties');

    await expect(page.getByText('Nothing active')).toBeVisible();
    await expect(page.getByText('2 records are archived. Archived records leave the list, the map and every total until you bring them back.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show archived' })).toBeVisible();
  });

  test('Show archived turns the facet on for me', async ({ page, world }) => {
    world.set('properties', (vars: Record<string, unknown>) => {
      const wants = ((vars.statuses as string[]) ?? []).includes('archived');
      return listOf(wants ? only(ID.shop) : [], {
        facets: [{ key: 'status', label: 'Status', options: [
          { key: 'archived', label: 'Archived', count: 1, active: wants },
        ] }],
      });
    });
    await page.goto('/app/properties');

    await page.getByRole('button', { name: 'Show archived' }).click();

    await expect(page).toHaveURL(/\?status=archived$/);
    await expect.poll(() => world.lastVars('properties').statuses).toEqual(['archived']);
    await expect(gridCards(page)).toHaveCount(1);
    await expect(gridCards(page).first()).toContainText('Shop 7, Market Road');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · a search that arrived from the jump box', () => {
  test('a search narrows the grid and comes off at its own chip', async ({ page }) => {
    await page.goto('/app/properties?q=Katragunta');

    await expect(gridCards(page)).toHaveCount(2);
    await expect(page.getByText('2 of 5 shown')).toBeVisible();
    const chip = page.locator('.fchip').filter({ hasText: 'Katragunta' });
    await expect(chip).toContainText('Search');

    await page.getByRole('button', { name: 'Clear the search for Katragunta' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('a search that matches nothing says so in its own words, and offers to clear itself', async ({ page }) => {
    await page.goto('/app/properties?q=Vijayawada');

    await expect(gridCards(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Nothing matches “Vijayawada”' })).toBeVisible();
    await expect(page.getByText("Try a survey number, a village, a khata or an owner's name.")).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect(page).toHaveURL(/\/app\/properties$/);
    await expect(gridCards(page)).toHaveCount(4);
  });

  test('the table is not a way to get stuck with a search that matched nothing', async ({ page }) => {
    await page.goto('/app/properties?view=list&q=Vijayawada');

    // Every view empties into the same panel now — the table used to have a
    // row of its own saying "Nothing to list" and nothing else.
    await expect(page.getByRole('heading', { name: 'Nothing matches “Vijayawada”' })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect(page).toHaveURL(/view=list/);
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByRole('row')).toHaveCount(5);
  });

  test('a search finds a record by its khata as well as by its name', async ({ page }) => {
    await page.goto('/app/properties?q=1042');

    await expect(gridCards(page)).toHaveCount(1);
    await expect(gridCards(page).first()).toContainText('Sy 214/2');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W02 · while it loads, and when it does not', () => {
  test('a list still on its way holds the shape of the answer rather than claiming there is nothing', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/app/properties');

    await expect(page.getByRole('status', { name: 'Loading your properties' })).toBeVisible();
    await expect(page.getByText('Nothing filed yet')).toHaveCount(0);
    await expect(page.getByText(/of \d+ shown/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
  });

  test('a list still on its way in the table view looks like a table, not a grid of cards', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/app/properties?view=list');

    const loading = page.getByRole('status', { name: 'Loading your properties' });
    await expect(loading).toBeVisible();
    await expect(loading.getByRole('table')).toBeVisible();
    await expect(page.locator('.cards')).toHaveCount(0);
  });

  test('a list still on its way in the map view looks like a map, not a grid of cards', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/app/properties?view=map');

    // Its own words, because the map is the one view that keeps loading after
    // the list has arrived (SkPortfolioMap, skeletons.tsx:171).
    await expect(page.getByRole('status', { name: 'Loading the map of your properties' })).toBeVisible();
    await expect(page.locator('.cards')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('a list that did not load says so, prints what the server said, and offers to try again', async ({ page, world }) => {
    world.set('properties', World.gqlError('the record store is down'));
    await page.goto('/app/properties');

    const failed = page.getByRole('alert');
    await expect(failed.getByText('Your properties did not load')).toBeVisible();
    await expect(failed).toContainText('Nothing has been lost');
    await expect(failed.getByText('the record store is down')).toBeVisible();
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    // No half-drawn list under the failure.
    await expect(gridCards(page)).toHaveCount(0);
  });

  test('the list comes back the moment the server does', async ({ page, world }) => {
    world.set('properties', World.gqlError('the record store is down'));
    await page.goto('/app/properties');
    await expect(page.getByRole('alert').getByText('Your properties did not load')).toBeVisible();

    world.set('properties', listOf(ACTIVE()));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(gridCards(page)).toHaveCount(4);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test.describe('a server that refuses the connection', () => {
    // Chrome logs every non-2xx response itself ("Failed to load resource …
    // 503"), and provoking exactly that is the point of this one test.
    test.use({ allowConsole: true });

    test('a transport failure is a different sentence from a refusal, and names the code', async ({ page, world }) => {
      world.set('properties', World.httpError(503));
      await page.goto('/app/properties');

      await expect(page.getByRole('alert').getByText('GraphQL HTTP 503')).toBeVisible();
      await expect(page.getByRole('alert').getByText('Your properties did not load')).toBeVisible();
    });
  });
});
