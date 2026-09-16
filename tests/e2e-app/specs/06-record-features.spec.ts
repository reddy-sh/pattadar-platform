/**
 * 06 · the features hanger — /app/records/:id/features (W07).
 *
 * What is on the land, and whether it works. Every card here is a thing an
 * expense, a photo and a repair history hang off, which is why this screen has
 * more write paths than any other hanger: a feature is filed from the drawer,
 * corrected by the pencil on its own card, and taken away behind a second
 * press. All three of those answer a refusal by RESOLVING falsy rather than by
 * throwing (api.ts:802-830), so every one of them is asserted twice — once
 * refused, once dropped on the floor — because the two land in different
 * branches and used to land in the same silence.
 *
 * What a reader needs to know before changing anything here:
 *
 *   · ADDING IS A DRAWER (RecordFeatures.FeatureDrawer over the shared
 *     Drawer.tsx). The header's "Add a feature" opens it; it no longer scrolls
 *     the page to a dashed card and flashes a ring at it. The card at the end
 *     of the grid is still there and still says what a feature becomes, but it
 *     is a `<button class="card dashed addcard">` that only opens the same
 *     drawer — it holds no chip row and no name box, so the one-press file is
 *     gone. Two consequences for the locators below: the add card is no longer
 *     an `<article>`, so `cards()` counts features ONLY and every count here is
 *     one lower than it was; and "Add a feature" is now the accessible name of
 *     two controls, so the header one is addressed with `exact: true` (the
 *     card's name runs on into the sentence under its heading).
 *   · The drawer asks for the spec, the condition and the note BEFORE anything
 *     is written, which is what the per-card editor used to be opened for
 *     immediately after a chip press. So filing is `addFeature` and then, only
 *     if any of those was actually filled in, `updateFeature` — and the editor
 *     is no longer opened on the new card. The pencil and its inline editor are
 *     unchanged and still have their own describe below.
 *
 *   · The page does not sort. `web360.py:2921` ranks bad → warn → unknown →
 *     good and the screen draws that order, so the fixtures in this file sort
 *     the same way the server does (`land()` below) rather than hand-listing a
 *     order that would drift from it.
 *   · The chip row is the server's too, including the `all` chip and the two
 *     derived ones, `needs_repair` and `unchecked` (web360.py:2923-2935). The
 *     shared seed in fixtures/seed.ts carries only the four plain categories,
 *     so tests about filtering build their own list; tests about DRAWING use
 *     the shared seed, which is the world as it ships.
 *   · `conditionState` is one of good/warn/bad/unknown (ticketing.py:347).
 *     The shared seed spells the good one `ok`, which is why the state-word
 *     scenarios below seed their own rows.
 *   · A write that succeeds invalidates the whole `w360` key, so the list is
 *     re-read before `mutateAsync` resolves. The mutation answers in these
 *     tests therefore MUTATE a local array that the `features` answer is read
 *     from — otherwise a filed feature would never come back from the server
 *     and the editor, which is drawn inside that feature's own card, would
 *     have no card to open in.
 *
 *   · The one thing on this page that costs money no longer happens on it.
 *     "Ask for a check" is a `<Link>` into the order flow at
 *     `/app/records/:id/order` (RecordFeatures.tsx:243-244), so there is no
 *     dialog, no `orderService` call and no refusal sentence to assert here
 *     any more — `world.calls('orderService')` is empty on every path through
 *     this screen, and the four steps behind that link are 13-services.spec.ts.
 *     What the page kept is the pair of guards on the control itself: a visit
 *     already filed turns it into a way back to the job, and orders it could
 *     not read turn it into a real disabled `<button>` rather than a link
 *     dressed as one, because a `<Link>` has no `disabled` and navigates
 *     anyway.
 *
 *   · An assertion that something is ABSENT is true of a page that has not
 *     drawn yet, so every one of them below stands AFTER something positive on
 *     the same screen. One of these — the row of dead labels — was passing
 *     against a blank document before that rule was applied to it.
 *
 * Deliberately not asserted: the 1.6s `flash` ring is a class on a card with no
 * accessible counterpart, so it is checked once, immediately after the filing
 * that raises it, and nowhere else. It only ever rings a real feature's card
 * now — the literal 'add' the header button used to flash has no card to point
 * at any more.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, FEATURE } from '../fixtures/ids';

// ── the land, shaped the way the server shapes it ──────────────────────

interface Feat {
  id: string; label: string; spec: string; icon: string; category: string;
  condition: string; conditionState: string; note: string;
  lat: number; lon: number; pinLabel: string; photoCount: number; actions: string[];
}

/** One feature, with every field the query selects filled in. Anything left
 *  out draws as `undefined` on a card, which is the bug, not the fixture. */
const feat = (over: Partial<Feat> & Pick<Feat, 'id' | 'label'>): Feat => ({
  spec: '', icon: 'feature', category: 'other', condition: '', conditionState: 'good',
  note: '', lat: 0, lon: 0, pinLabel: '', photoCount: 0, actions: [], ...over,
});

/** web360.py:2921 — worst first, stable within a condition. */
const RANK: Record<string, number> = { bad: 0, warn: 1, unknown: 2, good: 3 };

/**
 * A FeatureList as `Query.web.features` builds one: sorted worst-first, with
 * the `all` chip, one chip per category in first-seen order, and the two
 * derived chips counted off the rows themselves. Counting the chips here
 * rather than writing them by hand is what lets a test add a row and assert
 * the chip that names it without keeping two numbers in step.
 */
function land(rows: Feat[], over: Record<string, unknown> = {}) {
  const features = [...rows].sort(
    (a, b) => (RANK[a.conditionState] ?? 3) - (RANK[b.conditionState] ?? 3));
  const seen: string[] = [];
  for (const f of features) if (!seen.includes(f.category)) seen.push(f.category);
  const count = (p: (f: Feat) => boolean) => features.filter(p).length;
  return {
    total: features.length,
    needsRepair: count((f) => f.conditionState === 'bad'),
    walkedOn: '2026-08-12',
    walkedBy: 'Ramana Rao',
    categories: [
      { key: 'all', label: 'All', count: features.length, active: true },
      ...seen.map((c) => ({
        key: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
        count: count((f) => f.category === c),
        active: false,
      })),
      { key: 'needs_repair', label: 'Needs repair', count: count((f) => f.conditionState === 'bad'), active: false },
      { key: 'unchecked', label: 'Not checked', count: count((f) => f.conditionState === 'unknown'), active: false },
    ],
    features,
    ...over,
  };
}

/**
 * A features list that the page's own writes actually change.
 *
 * `useW360Mutation` invalidates every w360 query on success and react-query
 * awaits that refetch inside `mutateAsync`, so a screen that files a feature
 * has the new row in hand by the time it opens the editor on it. A static
 * answer would break that chain and hide half of what this screen does.
 */
function liveLand(world: World, rows: Feat[]): Feat[] {
  let filed = 0;
  world.set('features', () => land(rows));
  world.set('addFeature', (vars) => {
    const id = `w-feat-filed-${++filed}`;
    // The API reads the category and the icon off the label; the test world
    // only has to be consistent, not clever.
    rows.push(feat({ id, label: String(vars.label), conditionState: 'unknown' }));
    return id;
  });
  world.set('updateFeature', (vars) => {
    const row = rows.find((r) => r.id === vars.featureId);
    if (!row) return false;
    Object.assign(row, {
      label: String(vars.label), spec: String(vars.spec), condition: String(vars.condition),
      conditionState: String(vars.conditionState), note: String(vars.note),
    });
    return true;
  });
  world.set('deleteFeature', (vars) => {
    const at = rows.findIndex((r) => r.id === vars.featureId);
    if (at < 0) return false;
    rows.splice(at, 1);
    return true;
  });
  return rows;
}

// ── locators ───────────────────────────────────────────────────────────

/** Every FEATURE card in the grid. The invitation at the end of it is a
 *  `<button class="card dashed addcard">` rather than an `<article>` now, so it
 *  is no longer in this count — a grid of two features is two, not "2 + the add
 *  card". */
const cards = (page: Page) => page.getByRole('article');
/** The invitation at the end of the grid. Addressed by its class because its
 *  accessible name is its whole contents — heading and sentence together — so
 *  no name filter tells it apart from the header button cleanly, and `hasText`
 *  on a role would catch both. */
const addCard = (page: Page) => page.locator('button.addcard');
/** The header's own "Add a feature". `exact` because the card above shares the
 *  first three words of its accessible name. */
const addButton = (page: Page) =>
  page.getByRole('button', { name: 'Add a feature', exact: true });
/** The panel both of those open. Named by its own <h2>, the way the shared
 *  Drawer names every one of them. */
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Add a feature' });
/** The drawer's primary. It reads "Filing…" while the write is in flight, and
 *  "Save the detail" once the feature exists but its detail does not. */
const fileIt = (page: Page) => page.getByRole('button', { name: 'Add the feature' });
const cardFor = (page: Page, label: string) => page.getByRole('article')
  .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
/** The one card whose editor is open — a card being edited has no heading to
 *  be found by, because the form replaces the whole card. */
const openEditor = (page: Page) => page.getByRole('article')
  .filter({ has: page.getByLabel('Name', { exact: true }) });
/** The summary line under the headline. It is prose with no role or label of
 *  its own, and `.lede` is the only handle on it. */
const summary = (page: Page) => page.locator('p.lede');

/** One of the filter chips above the grid, addressed by the count it carries.
 *  The count is the only thing that tells it apart from the type chips in the
 *  drawer: "Crop 5" narrows the grid, "Crop" is what the new one will be. The
 *  two can now be on screen at once — the drawer does not replace the page — so
 *  the count still matters. */
const filterChip = (page: Page, label: string, count: number) =>
  page.getByRole('button', { name: `${label} ${count}`, exact: true });

/** The whole filter row, in the order the server sent it. A count badge is the
 *  one thing every filter chip has and nothing else on this screen does — the
 *  type chips carry no number and the tab strip's counts are links, not
 *  buttons — so it is also what lets a test say "and no other chip". */
const filterChips = (page: Page) =>
  page.getByRole('button').filter({ has: page.locator('span.n') });

const featuresUrl = (id: string) => `/app/records/${id}/features`;

// ── what the world ships with ──────────────────────────────────────────

test.describe('W07 · what is on this land', () => {
  test('every feature on the parcel is drawn with its name, what it is and the condition it is in', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('On this land');
    expect(world.lastVars('features')).toMatchObject({ id: ID.parcel });

    // Four seeded features. The invitation that files the fifth stands beside
    // them but is a <button>, not an <article>, so it is not one of these.
    await expect(cards(page)).toHaveCount(4);
    await expect(addCard(page)).toBeVisible();

    const well = cardFor(page, 'Open well');
    await expect(well).toContainText('30 ft · 6 in pipe');
    await expect(well).toContainText('Working');
    await expect(well).toContainText('Rewired in 2024');

    const pump = cardFor(page, 'Submersible pump');
    await expect(pump).toContainText('5 HP');
    await expect(pump).toContainText('Needs repair');
    await expect(pump).toContainText('Starter burnt out');

    await expect(cardFor(page, 'Barbed fence')).toContainText('420 m · 4 strand');
    await expect(cardFor(page, 'Mango trees')).toContainText('46 trees · 12 years');
  });

  test('the line above the headline says which record you are standing in', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    // "On this land" is true of every record, so the record has to be named
    // somewhere on a tab that never repeats its title in the headline. It is
    // the title and the village — the place line cut at its first comma.
    await expect(page.locator('p.eyebrow')).toHaveText('Sy 214/2 · Katragunta');
  });

  test('the summary line counts the features, the repairs and the day somebody walked it', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page))
      .toHaveText('14 features · 2 need repair · walked 12 Aug 2026 by Shankar Reddy');
  });

  test('the categories on the record become the chips above the grid', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    for (const [label, n] of [['Water', 4], ['Power', 2], ['Boundary', 3], ['Crop', 5]] as const) {
      await expect(filterChip(page, label, n)).toBeVisible();
    }
    // In the server's order, and nothing else: a chip row that quietly grew a
    // fifth entry, or reordered itself, is a different screen from this one.
    await expect(filterChips(page))
      .toHaveText([/^Water\s*4$/, /^Power\s*2$/, /^Boundary\s*3$/, /^Crop\s*5$/]);
  });

  test('the grid says how it is ordered and that each feature carries its own pin and photos', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByText('Worst condition first · every one carries its own pin and its own photos'))
      .toBeVisible();
  });

  test('a walked date the server sends as a plain ISO day is read out as a date', async ({ page, world }) => {
    world.set('features', land([feat({ id: FEATURE.well, label: 'Open well' })],
      { walkedOn: '2026-08-12', walkedBy: 'Ramana Rao' }));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toHaveText('1 feature · walked 12/08/2026 by Ramana Rao');
  });

  test('a record nobody has walked says nothing at all about walking it', async ({ page, world }) => {
    world.set('features', land([feat({ id: FEATURE.well, label: 'Open well', conditionState: 'bad', condition: 'Dry' })],
      { walkedOn: '', walkedBy: '' }));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toHaveText('1 feature · 1 needs repair');
  });

  test('a name with no date behind it is not hung off the repair count', async ({ page, world }) => {
    // DEFECT. RecordFeatures.tsx:291-292 gates the date on `walkedOn` and the
    // name on `walkedBy` separately, so a photo filed with a photographer and
    // no timestamp — which the server will happily send, web360.py:2944-2946
    // reads the two out of one row independently — prints
    // "2 features · 1 needs repair by Ramana Rao". The owner is owed either
    // "walked by Ramana Rao" or no mention of him at all; a name welded to the
    // repair count says he is the one who needs repairing.
    test.fail();
    world.set('features', land([
      feat({ id: FEATURE.well, label: 'Open well', conditionState: 'bad', condition: 'Dry' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence' }),
    ], { walkedOn: '', walkedBy: 'Ramana Rao' }));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toContainText('2 features');
    await expect(summary(page)).not.toContainText('repair by Ramana Rao');
  });
});

// ── condition, and the four words for it ───────────────────────────────

test.describe('W07 · the condition of each thing', () => {
  const mixed = () => [
    feat({ id: 'w-feat-good', label: 'Compound wall', category: 'boundary', condition: 'Solid', conditionState: 'good' }),
    feat({ id: 'w-feat-unknown', label: 'Old shed', category: 'structure', conditionState: 'unknown' }),
    feat({ id: 'w-feat-warn', label: 'Submersible pump', category: 'water', condition: 'Yield dropped', conditionState: 'warn' }),
    feat({ id: 'w-feat-bad', label: 'Barbed fence', category: 'boundary', condition: 'Cut on the east', conditionState: 'bad' }),
  ];

  test('the worst thing on the land is the first card, and the sound one is the last', async ({ page, world }) => {
    world.set('features', land(mixed()));
    await page.goto(featuresUrl(ID.parcel));
    await expect(cards(page)).toHaveCount(4);
    await expect(cards(page).nth(0)).toContainText('Barbed fence');
    await expect(cards(page).nth(1)).toContainText('Submersible pump');
    await expect(cards(page).nth(2)).toContainText('Old shed');
    await expect(cards(page).nth(3)).toContainText('Compound wall');
  });

  test('only a broken feature is drawn as an alarm', async ({ page, world }) => {
    world.set('features', land(mixed()));
    await page.goto(featuresUrl(ID.parcel));
    // The alert treatment is a class on the card; the colour of the rule down
    // its side is the whole signal and there is nothing accessible to read.
    await expect(cardFor(page, 'Barbed fence')).toHaveClass(/alert/);
    await expect(cardFor(page, 'Submersible pump')).not.toHaveClass(/alert/);
    await expect(cardFor(page, 'Old shed')).not.toHaveClass(/alert/);
    await expect(cardFor(page, 'Compound wall')).not.toHaveClass(/alert/);
  });

  test('a feature nobody has stood next to says Not checked instead of showing a green dot', async ({ page, world }) => {
    world.set('features', land(mixed()));
    await page.goto(featuresUrl(ID.parcel));
    const shed = cardFor(page, 'Old shed');
    await expect(shed).toContainText('Not checked');
    // `.state.unknown` is the hollow ring; a filled dot here would be the app
    // claiming an inspection that never happened.
    await expect(shed.locator('.state.unknown')).toBeVisible();
  });

  test('a feature whose condition is in its own words keeps those words', async ({ page, world }) => {
    world.set('features', land(mixed()));
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Barbed fence').locator('.state.bad')).toHaveText('Cut on the east');
    await expect(cardFor(page, 'Submersible pump').locator('.state.warn')).toHaveText('Yield dropped');
  });

  test('a feature with a state but nothing written about it falls back to the state word', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-bare', label: 'Transformer', category: 'power', condition: '', conditionState: 'bad' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Transformer').locator('.state.bad')).toHaveText('Broken');
  });

  test('a feature with no spec has no empty line where the spec would be', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-bare', label: 'Farm gate', spec: '', condition: 'Locked', conditionState: 'good' }),
      feat({ id: 'w-feat-spec', label: 'Open well', spec: '30 ft · 6 in pipe', condition: 'Working', conditionState: 'good' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    // The spec is the one mono line on a card; a card with no spec must not
    // draw the element at all, which is what reads as a rendering fault.
    await expect(cardFor(page, 'Farm gate').locator('.note.mono')).toHaveCount(0);
    await expect(cardFor(page, 'Open well').locator('.note.mono')).toHaveText('30 ft · 6 in pipe');
  });

  test('the repair count on the summary line agrees with the cards carrying the alarm', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Barbed fence', category: 'boundary', condition: 'Cut on the east', conditionState: 'bad' }),
      feat({ id: 'w-feat-2', label: 'Transformer', category: 'power', condition: 'Burnt out', conditionState: 'bad' }),
      feat({ id: 'w-feat-3', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    await expect(summary(page)).toHaveText('3 features · 2 need repair · walked 12/08/2026 by Ramana Rao');
    await expect(page.locator('article.alert')).toHaveCount(2);
    await expect(filterChip(page, 'Needs repair', 2)).toBeVisible();
  });

  test('one broken thing is said in the singular', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Barbed fence', condition: 'Cut on the east', conditionState: 'bad' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toContainText('1 feature · 1 needs repair');
  });
});

// ── pins and photos ────────────────────────────────────────────────────

test.describe('W07 · where each thing is, and what has been photographed of it', () => {
  test('a pinned feature prints the coordinates it was pinned at', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    // Four decimal places — about eleven metres, which is the honest precision
    // of a phone standing next to a bore.
    const well = cardFor(page, 'Open well');
    await expect(well).toContainText('15.7408, 79.2697');
    // The seeded well also carries the name a surveyor gave the pin, "W1". A
    // real fix replaces it: two answers to "where is this" on one line, one of
    // them a note to somebody who has already been and gone, is the line
    // nobody can act on.
    await expect(well).not.toContainText('W1');
  });

  test('a feature nobody has pinned says there is no pin yet', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Barbed fence')).toContainText('No pin yet');
    await expect(cardFor(page, 'Barbed fence')).not.toContainText('0.0000');
  });

  test('a feature the surveyor named but never pinned shows the name he gave it', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: FEATURE.fence, label: 'Barbed fence', lat: 0, lon: 0, pinLabel: 'To be walked' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Barbed fence')).toContainText('To be walked');
  });

  test('a feature carrying photographs says how many, in the right number', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Open well').getByRole('link', { name: '4 photos' })).toBeVisible();
    await expect(cardFor(page, 'Submersible pump').getByRole('link', { name: '1 photo' })).toBeVisible();
  });

  test('a feature with nothing photographed of it offers no gallery to open', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    const fence = cardFor(page, 'Barbed fence');
    // Drawn first: both assertions below are satisfied by a blank page.
    await expect(fence).toContainText('No pin yet');
    await expect(fence.getByRole('link', { name: /photo/ })).toHaveCount(0);
    await expect(fence).not.toContainText('0 photos');
  });

  test('opening a feature’s photographs asks the gallery for that feature and no other', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));
    await cardFor(page, 'Open well').getByRole('link', { name: '4 photos' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/photos\\?feature=${FEATURE.well}$`));
    await expect.poll(() => world.asked('photos')).toBe(true);
    expect(world.lastVars('photos')).toMatchObject({ id: ID.parcel, featureId: FEATURE.well });
  });
});

// ── the action labels the record carries ───────────────────────────────

test.describe('W07 · the labels a feature carries, and where they go', () => {
  const withActions = () => land([
    feat({
      id: FEATURE.well, label: 'Borewell 1', category: 'water', condition: 'Yield dropped',
      conditionState: 'warn', photoCount: 2, lat: 15.7408, lon: 79.2697, pinLabel: 'W1',
      actions: ['Fix it', 'Update', 'Photos 2', 'Bills'],
    }),
    feat({
      id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown',
      photoCount: 0, actions: ['Order fencing', 'Photos', 'Deed clause'],
    }),
  ]);

  test('a label that names a screen of its own is a way in', async ({ page, world }) => {
    world.set('features', withActions());
    await page.goto(featuresUrl(ID.parcel));

    const bore = cardFor(page, 'Borewell 1');
    await expect(bore.getByRole('link', { name: 'Bills' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/expenses`);
    await expect(bore.getByRole('link', { name: 'Photos 2' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/photos?feature=${FEATURE.well}`);
    await expect(cardFor(page, 'Barbed fence').getByRole('link', { name: 'Deed clause' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
  });

  test('a label with nothing behind it is dropped rather than drawn as a dead button', async ({ page, world }) => {
    world.set('features', withActions());
    await page.goto(featuresUrl(ID.parcel));
    // Every assertion below is a count of zero, and an empty document answers
    // all of them. So: the card, drawn, with a label that DID survive.
    await expect(cardFor(page, 'Borewell 1').getByRole('link', { name: 'Bills' })).toBeVisible();

    for (const dead of ['Fix it', 'Update', 'Order fencing']) {
      await expect(page.getByRole('link', { name: dead })).toHaveCount(0);
      await expect(page.getByRole('button', { name: dead })).toHaveCount(0);
    }
    // Asked of the feature cards, not of the grid: the card that FILES a
    // feature holds an Add button that is disabled until a name is typed into
    // the box beside it, which is a form refusing an empty name rather than a
    // control that leads nowhere. Asked of every card, this assertion was true
    // only for as long as the page had not rendered.
    for (const label of ['Borewell 1', 'Barbed fence']) {
      await expect(cardFor(page, label).locator('button:disabled')).toHaveCount(0);
    }
  });

  test('a Photos label on a feature with no photographs leads nowhere, so it is not drawn', async ({ page, world }) => {
    world.set('features', withActions());
    await page.goto(featuresUrl(ID.parcel));
    const fence = cardFor(page, 'Barbed fence');
    // The card's OTHER label is drawn, so the missing one is a decision about
    // this label rather than a row that never rendered.
    await expect(fence.getByRole('link', { name: 'Deed clause' })).toBeVisible();
    await expect(fence.getByRole('link', { name: 'Photos' })).toHaveCount(0);
  });

  test('the rest of the labels this land actually carries each land on the screen that answers them', async ({ page, world }) => {
    // Every label here is one the founder's own seed puts on a feature
    // (scripts/seed-web360.py:107-146). "Bills" and "Deed clause" are proved
    // above; these are the five that were left, and each of them is a
    // different branch of destOf (RecordFeatures.tsx:77-102).
    world.set('features', land([
      feat({ id: FEATURE.pump, label: 'Pump set', category: 'power', condition: 'Serviced 06/2026',
             conditionState: 'warn', actions: ['Update', 'Service log'] }),
      feat({ id: FEATURE.trees, label: 'Coconut trees', category: 'crop', condition: 'Bearing · 2 lost',
             actions: ['Update count', 'Income'] }),
      feat({ id: FEATURE.well, label: 'Drip irrigation', category: 'water', condition: 'Working',
             actions: ['Papers 1'] }),
      feat({ id: FEATURE.fence, label: 'Standing crop', category: 'crop', condition: 'Sown 18/06/2026',
             actions: ['Lease'] }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    const ledger = `/app/records/${ID.parcel}/expenses`;
    const papers = `/app/records/${ID.parcel}`;
    await expect(cardFor(page, 'Pump set').getByRole('link', { name: 'Service log' }))
      .toHaveAttribute('href', ledger);
    await expect(cardFor(page, 'Coconut trees').getByRole('link', { name: 'Income' }))
      .toHaveAttribute('href', ledger);
    await expect(cardFor(page, 'Drip irrigation').getByRole('link', { name: 'Papers 1' }))
      .toHaveAttribute('href', papers);
    await expect(cardFor(page, 'Standing crop').getByRole('link', { name: 'Lease' }))
      .toHaveAttribute('href', papers);
    // "Update count" is the pencil on the card, said twice.
    await expect(page.getByRole('link', { name: 'Update count' })).toHaveCount(0);
  });

  test('the footnote under the grid says where the dropped labels actually happen', async ({ page, world }) => {
    world.set('features', withActions());
    await page.goto(featuresUrl(ID.parcel));

    const foot = page.getByText('Changing what a feature is, or the condition it is in, is the pencil');
    await expect(foot).toBeVisible();
    await expect(foot).toContainText('does not arrange a repair, a fencing crew or a silt clearing yet');
    await expect(page.getByRole('link', { name: 'ledger' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/expenses`);
  });
});

// ── the chips ──────────────────────────────────────────────────────────

test.describe('W07 · narrowing the grid', () => {
  const orchard = () => [
    feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    feat({ id: 'w-feat-pump', label: 'Submersible pump', category: 'water', condition: 'Yield dropped', conditionState: 'warn' }),
    feat({ id: 'w-feat-fence', label: 'Barbed fence', category: 'boundary', condition: 'Cut on the east', conditionState: 'bad' }),
    feat({ id: 'w-feat-shed', label: 'Old shed', category: 'structure', conditionState: 'unknown' }),
  ];

  test('the whole list is the one you land on, and All is the chip that is pressed', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));
    await expect(filterChip(page, 'All', 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(4);
  });

  test('a category chip narrows the grid to what it names', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Water', 2).click();
    await expect(filterChip(page, 'Water', 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, 'Open well')).toBeVisible();
    await expect(cardFor(page, 'Submersible pump')).toBeVisible();
    await expect(cardFor(page, 'Barbed fence')).toHaveCount(0);
  });

  test('All puts the whole list back', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Boundary', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await filterChip(page, 'All', 4).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('Needs repair leaves only what is broken on the screen', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Needs repair', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, 'Barbed fence')).toBeVisible();
    // "Yield dropped" is a warning, not a repair — the two must not be
    // counted together.
    await expect(cardFor(page, 'Submersible pump')).toHaveCount(0);
  });

  test('Not checked is its own chip, and keeps the never-inspected apart from the broken', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await expect(filterChip(page, 'Not checked', 1)).toBeVisible();
    await filterChip(page, 'Not checked', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, 'Old shed')).toBeVisible();
  });

  test('the chip that counts what is broken is the only one drawn as an alarm', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    // The red is the whole point of that chip and there is nothing accessible
    // to read it by; the dot it carries is aria-hidden (ui.tsx Chip).
    await expect(filterChip(page, 'Needs repair', 1)).toHaveClass(/alert/);
    // "Not checked" is a job, not an alarm — a red chip over four features
    // nobody has walked yet says the land is broken when it is only unvisited.
    await expect(filterChip(page, 'Not checked', 1)).not.toHaveClass(/alert/);
    await expect(filterChip(page, 'Water', 2)).not.toHaveClass(/alert/);
    await expect(filterChip(page, 'All', 4)).not.toHaveClass(/alert/);
  });

  test('a chip with nothing in it is not a filter, so it is never drawn', async ({ page, world }) => {
    // Everything on this land is sound: the derived chips both count zero.
    world.set('features', land([
      feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    // The row, first — the two absences below are true of a page that has not
    // drawn — and then the whole of it: All and Water, and no third chip.
    await expect(filterChip(page, 'Water', 1)).toBeVisible();
    await expect(filterChips(page)).toHaveText([/^All\s*1$/, /^Water\s*1$/]);
    await expect(page.getByRole('button', { name: /^Needs repair/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Not checked \d/ })).toHaveCount(0);
  });

  test('fixing the last broken thing takes the Needs repair filter off with it', async ({ page, world }) => {
    // The chip the server stops offering cannot be un-pressed, so the grid
    // would empty with nothing on screen saying a filter was on.
    const rows = liveLand(world, orchard());
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Needs repair', 1).click();
    await expect(cards(page)).toHaveCount(1);

    await cardFor(page, 'Barbed fence').getByRole('button', { name: 'Remove Barbed fence' }).click();
    await cardFor(page, 'Barbed fence').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page.getByRole('button', { name: /^Needs repair/ })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);              // the three that are left
    expect(rows.map((r) => r.label)).not.toContain('Barbed fence');
  });
});

// ── filing a feature ───────────────────────────────────────────────────

test.describe('W07 · filing a feature', () => {
  test('a type chip and the primary file a feature without a word being typed', async ({ page, world }) => {
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Bore', exact: true }).click();
    await fileIt(page).click();

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature')).toMatchObject({ recordId: ID.parcel, label: 'Bore' });
    // Nothing else was said about it, so nothing else is sent. A second write
    // carrying four empty strings would be an edit nobody made.
    expect(world.calls('updateFeature')).toHaveLength(0);
    await expect(drawer(page)).toHaveCount(0);
    await expect(cardFor(page, 'Bore')).toBeVisible();
  });

  test('the panel asks for the detail before anything is written, and files both halves at once', async ({ page, world }) => {
    // REPLACES "a feature filed by chip opens for editing". A chip press used to
    // file a bare name on the spot and then open the per-card editor over the
    // new card to ask what the thing actually was — one feature, two writes, in
    // two places, with the page jumping between them. The panel asks first, so
    // `addFeature` names it and `updateFeature` carries everything else, and no
    // editor is opened afterwards.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Transformer', exact: true }).click();
    await panel.getByLabel('Size, depth, year').fill('63 kVA · 2011');
    await panel.getByLabel('Condition', { exact: true }).fill('Oil leak on the bushing');
    await panel.getByRole('button', { name: 'Watch it', exact: true }).click();
    await panel.getByLabel('Note', { exact: true }).fill('DISCOM replaced it after the storm');
    await fileIt(page).click();

    // The ring that says "this is the thing you just filed", asserted first
    // because it is a class on the card and lives only 1.6s. The grid is sorted
    // worst-condition-first, so a new feature does not necessarily land at the
    // end of it and this is what says which one is yours.
    await expect(cardFor(page, 'Transformer')).toHaveClass(/flash/);

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature'))
      .toMatchObject({ recordId: ID.parcel, label: 'Transformer' });
    await expect.poll(() => world.calls('updateFeature').length).toBe(1);
    expect(world.lastVars('updateFeature')).toMatchObject({
      label: 'Transformer', spec: '63 kVA · 2011',
      condition: 'Oil leak on the bushing', conditionState: 'warn',
      note: 'DISCOM replaced it after the storm',
    });

    // So the card arrives finished, rather than as a name with a green dot
    // beside it waiting for somebody to come back and say what it is.
    await expect(cardFor(page, 'Transformer')).toContainText('63 kVA · 2011');
    await expect(cardFor(page, 'Transformer')).toContainText('Oil leak on the bushing');
    await expect(openEditor(page)).toHaveCount(0);
  });

  test('the panel opens on Not checked, because that is what a feature is until somebody stands next to it', async ({ page, world }) => {
    // The condition is what the per-card editor used to be opened for the
    // instant a chip was pressed: a feature filed as a name alone got a green
    // dot and an empty card, "claiming everything was fine". It is asked here,
    // up front, and the honest answer is the one already selected.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await expect(panel.getByRole('button', { name: 'Not checked', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    for (const word of ['Working', 'Watch it', 'Broken']) {
      await expect(panel.getByRole('button', { name: word, exact: true }))
        .toHaveAttribute('aria-pressed', 'false');
    }

    // Left where it opened it is not something anybody changed, so it does not
    // provoke the second write on its own.
    await panel.getByRole('button', { name: 'Bore', exact: true }).click();
    await fileIt(page).click();
    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.calls('updateFeature')).toHaveLength(0);
    await expect(cardFor(page, 'Bore')).toContainText('Not checked');
  });

  test('a name of your own files that name, and the panel closes only once it exists', async ({ page, world }) => {
    // The name box is behind the last chip now — "Something else" is what
    // reveals it — because a free-text box standing open beside sixteen chips
    // was one question with two answers. What it proves is unchanged: the typed
    // name is what gets filed, and it is still on screen until the feature is.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await expect(panel.getByLabel('Name it')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill('Cattle trough');
    await fileIt(page).click();

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature'))
      .toMatchObject({ recordId: ID.parcel, label: 'Cattle trough' });
    await expect(cardFor(page, 'Cattle trough')).toBeVisible();
    await expect(panel).toHaveCount(0);
    // The panel is unmounted when it closes, so re-opening starts blank rather
    // than on the last feature filed — which is what emptying the box did.
    await addButton(page).click();
    await expect(drawer(page).getByLabel('Name it')).toHaveCount(0);
    await expect(drawer(page).locator('#fa-kinds button[aria-pressed="true"]')).toHaveCount(0);
  });

  test('a typed name is filed by pressing Enter, the way a form should be', async ({ page, world }) => {
    // The panel IS a <form> with a real submit for its primary (Drawer.tsx), so
    // a feature can still be filed without ever reaching for the mouse.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill('Silt trap');
    await panel.getByLabel('Name it').press('Enter');

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature')).toMatchObject({ label: 'Silt trap' });
  });

  test('the primary will not file a feature nothing has been said about', async ({ page, world }) => {
    // Nothing is pre-selected in the chip row — a pre-selected "Bore" is a
    // feature filed by one unread press of the primary — so the panel opens
    // with its primary refusing, and whitespace does not change that.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await expect(panel.locator('#fa-kinds button[aria-pressed="true"]')).toHaveCount(0);
    await expect(fileIt(page)).toBeDisabled();

    await panel.getByRole('button', { name: 'Something else' }).click();
    await expect(fileIt(page)).toBeDisabled();
    await panel.getByLabel('Name it').fill('   ');
    await expect(fileIt(page)).toBeDisabled();
    expect(world.calls('addFeature')).toHaveLength(0);

    // And pressing the chosen type again clears it rather than leaving it stuck
    // on, which puts the primary straight back to refusing.
    const bore = panel.getByRole('button', { name: 'Bore', exact: true });
    await bore.click();
    await expect(bore).toHaveAttribute('aria-pressed', 'true');
    await expect(fileIt(page)).toBeEnabled();
    await bore.click();
    await expect(bore).toHaveAttribute('aria-pressed', 'false');
    await expect(fileIt(page)).toBeDisabled();
    expect(world.calls('addFeature')).toHaveLength(0);
  });

  test('filing a feature while a filter is on puts the whole list back, so the new card is not filed out of sight', async ({ page, world }) => {
    liveLand(world, [
      feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: 'w-feat-fence', label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]);
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Water', 1).click();
    await expect(cards(page)).toHaveCount(1);

    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Gate', exact: true }).click();
    await fileIt(page).click();

    await expect(filterChip(page, 'All', 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(3);
  });

  test('filing from the panel does not reach over and throw away the editor that is open', async ({ page, world }) => {
    // REPLACES "filing a second feature does not throw away the editor", which
    // could only happen when a chip press opened one. The hazard is the same in
    // the other direction and still live: filing drops the category filter and
    // re-reads the whole list under whatever the owner already had open.
    liveLand(world, [feat({ id: FEATURE.well, label: 'Open well', category: 'water' })]);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await openEditor(page).getByLabel('What it is', { exact: true }).fill('420 ft · 5 in');

    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Pond', exact: true }).click();
    await fileIt(page).click();

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    await expect(cardFor(page, 'Pond')).toBeVisible();
    // Still one editor, still the same one, still holding what was typed.
    await expect(openEditor(page)).toHaveCount(1);
    await expect(openEditor(page).getByLabel('Name', { exact: true })).toHaveValue('Open well');
    await expect(openEditor(page).getByLabel('What it is', { exact: true }))
      .toHaveValue('420 ft · 5 in');
  });

  test('a filing the server refuses says so in the panel, and keeps it open', async ({ page, world }) => {
    world.set('addFeature', '');
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Bore', exact: true }).click();
    await fileIt(page).click();

    // The reason now stands in the panel that asked for it, above the button
    // that was pressed — it used to be a line under the dashed card in the grid,
    // which is not where the press happened.
    await expect(drawer(page).getByRole('alert'))
      .toHaveText('That feature could not be filed. Reload the page and try again.');
    await expect(drawer(page)).toBeVisible();
    await expect(openEditor(page)).toHaveCount(0);
  });

  test('a filing that fell over keeps every word that was typed, because retyping it is the insult', async ({ page, world }) => {
    world.set('addFeature', World.gqlError('land_features is not accepting writes'));
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill('Cattle trough');
    await panel.getByLabel('Size, depth, year').fill('8 ft, brick');
    await fileIt(page).click();

    await expect(panel.getByRole('alert'))
      .toHaveText('That feature did not save. What you typed is still here — try again.');
    // And it is. The panel asks for more than a name now, so there is more to
    // lose than there was — all of it is still in the boxes.
    await expect(panel.getByLabel('Name it')).toHaveValue('Cattle trough');
    await expect(panel.getByLabel('Size, depth, year')).toHaveValue('8 ft, brick');
  });

  test('a detail that would not save says the feature itself went in, and will not file it twice', async ({ page, world }) => {
    // Two mutations, because the API has no single call that takes a feature and
    // its detail. So the halves have to be reported apart: the feature EXISTS by
    // the time the second one fails, and a second press must finish it rather
    // than file a duplicate — which is what the relabelled primary is for.
    liveLand(world, []);
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Bore', exact: true }).click();
    await panel.getByLabel('Size, depth, year').fill('420 ft · 5 in');
    await fileIt(page).click();

    await expect(panel.getByRole('alert')).toContainText('Bore was filed, but its detail was not saved.');
    await expect(panel.getByRole('button', { name: 'Save the detail' })).toBeVisible();
    await expect(fileIt(page)).toHaveCount(0);

    await panel.getByRole('button', { name: 'Save the detail' }).click();
    await expect.poll(() => world.calls('updateFeature').length).toBe(2);
    // One feature, not two.
    expect(world.calls('addFeature')).toHaveLength(1);
  });

  test('the card at the end of the grid says what a feature becomes, and only opens the panel', async ({ page }) => {
    // On the empty record, where it is the only thing in the grid. It used to BE
    // the form: a chip row and a name box that filed a feature on one press,
    // under a bare name, before anyone had said what condition it was in. It is
    // one control now, so there is nothing in it to file with.
    await page.goto(featuresUrl(ID.plot));
    const add = addCard(page);

    await expect(add.getByRole('heading', { name: 'Add a feature' })).toBeVisible();
    await expect(add).toContainText(
      'A bore, a fence, a shed. It becomes a pin, a photo slot and a repair history.');
    await expect(add.locator('button[aria-pressed]')).toHaveCount(0);
    await expect(add.locator('input')).toHaveCount(0);
    // It says what it is going to do before it is pressed, like every other
    // trigger on the record.
    await expect(add).toHaveAttribute('aria-haspopup', 'dialog');

    await add.click();
    await expect(drawer(page)).toBeVisible();
  });

  test('the panel offers the sixteen names it has, and a way to say something else', async ({ page }) => {
    // REPLACES the same assertion made against the dashed card, which is where
    // this row used to live. The starter kit is a shortcut for somebody standing
    // in a field, so what is on it and what order it is in is the feature
    // (RecordFeatures.tsx TYPES).
    await page.goto(featuresUrl(ID.plot));
    await addButton(page).click();

    const kinds = drawer(page).locator('#fa-kinds button');
    await expect(kinds).toHaveText([
      'Bore', 'Well', 'Pond', 'Transformer', 'Meter', 'Solar', 'Fence', 'Gate',
      'Shed', 'House', 'Compound wall', 'Trees', 'Crop', 'Road', 'Bund', 'Canal',
      'Something else',
    ]);
    await expect(drawer(page).getByLabel('Name it')).toHaveCount(0);
    await kinds.last().click();
    await expect(drawer(page).getByLabel('Name it'))
      .toHaveAttribute('placeholder', 'Something else…');
  });

  test('the primary says it is filing while the feature is still being filed', async ({ page, world }) => {
    world.set('features', land([]));
    world.set('addFeature', World.slow(1200, 'w-feat-slow'));
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await panel.getByLabel('Name it').fill('Cattle trough');
    await fileIt(page).click();

    // "Filing…", not "Adding…": every drawer's primary says the same word for
    // the same state now (Drawer.DrawerAction).
    await expect(panel.getByRole('button', { name: 'Filing…' })).toBeDisabled();
    // And the typed name is still in the box while it goes, because it is the
    // thing being filed — the panel closes when the feature exists, not before.
    await expect(panel.getByLabel('Name it')).toHaveValue('Cattle trough');
  });

  test('the button at the top of the page opens the panel with the type chips under the cursor', async ({ page }) => {
    // REPLACES "the Add button at the top goes to the box at the bottom of the
    // grid". It used to scroll the page to the dashed card, focus its name box
    // and flash a ring at it for 1.4s — the one add affordance in the app that
    // never opened anything. Focus lands on the first type chip rather than the
    // Close button, because picking one is the first thing to do here and
    // nothing is picked for you.
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();

    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(panel.locator('#fa-kinds button').first()).toBeFocused();
    // The panel covers the header that names the record, so it carries the
    // record's own name in its eyebrow (Drawer.drawerEyebrow).
    await expect(panel.locator('.eyebrow')).toHaveText('Sy 214/2 · Features');
    await expect(panel).toContainText(
      'A bore, a fence, a shed. It becomes a pin, a photo slot and a repair history of its own.');

    // Cancel is a deliberate press, so it closes at once — it is Escape and a
    // slipped click on the scrim that ask about typed work — and focus goes back
    // to the control that opened it.
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer(page)).toHaveCount(0);
    await expect(addButton(page)).toBeFocused();
  });
});

// ── the editor ─────────────────────────────────────────────────────────

test.describe('W07 · turning a name into a record', () => {
  const bore = () => [feat({
    id: FEATURE.well, label: 'Borewell 1', spec: '420 ft · 5 in · 2005', category: 'water',
    condition: 'Yield dropped', conditionState: 'warn', note: 'Ran dry in May',
    lat: 15.7408, lon: 79.2697, pinLabel: 'W1',
  })];

  test('the pencil opens the whole card as a form, filled with what is already on it', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();

    const editor = openEditor(page);
    await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Borewell 1');
    await expect(editor.getByLabel('What it is', { exact: true })).toHaveValue('420 ft · 5 in · 2005');
    await expect(editor.getByLabel('Condition', { exact: true })).toHaveValue('Yield dropped');
    await expect(editor.getByLabel('Note', { exact: true })).toHaveValue('Ran dry in May');
    await expect(editor.getByRole('button', { name: 'Watch it', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    // The card it replaced is gone; typing a spec beside a stale copy of the
    // same spec is how two of them end up disagreeing.
    await expect(page.getByText('420 ft · 5 in · 2005', { exact: true })).toHaveCount(0);
  });

  test('the form opens with the cursor already in the name, so a phone can type straight away', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();

    await expect(openEditor(page).getByLabel('Name', { exact: true })).toBeFocused();
  });

  test('a save sends the whole form, so a spec that was cleared is actually cleared', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('What it is', { exact: true }).fill('');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => world.calls('updateFeature').length).toBe(1);
    expect(world.lastVars('updateFeature')).toEqual({
      featureId: FEATURE.well,
      label: 'Borewell 1',
      spec: '',
      condition: 'Yield dropped',
      conditionState: 'warn',
      note: 'Ran dry in May',
    });
    await expect(cardFor(page, 'Borewell 1').locator('.note.mono')).toHaveCount(0);
  });

  test('the words that go to the server are the typed ones without the spaces around them', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Name', { exact: true }).fill('  Borewell 1  ');
    await editor.getByLabel('What it is', { exact: true }).fill('  420 ft · 5 in  ');
    await editor.getByLabel('Note', { exact: true }).fill('  Ran dry in May  ');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => world.calls('updateFeature').length).toBe(1);
    // A stray space is what a thumb on a phone keyboard leaves behind; stored,
    // it is a name that no longer matches itself in a search or a sort.
    expect(world.lastVars('updateFeature')).toEqual({
      featureId: FEATURE.well,
      label: 'Borewell 1',
      spec: '420 ft · 5 in',
      condition: 'Yield dropped',
      conditionState: 'warn',
      note: 'Ran dry in May',
    });
    await expect(cardFor(page, 'Borewell 1')).toBeVisible();
  });

  test('a saved edit puts the whole list back, so the card being saved does not vanish under a filter', async ({ page, world }) => {
    liveLand(world, [
      feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]);
    await page.goto(featuresUrl(ID.parcel));

    await filterChip(page, 'Water', 1).click();
    await expect(cards(page)).toHaveCount(1);

    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await openEditor(page).getByLabel('Condition', { exact: true }).fill('Silted');
    await openEditor(page).getByRole('button', { name: 'Save' }).click();

    // An edit can move a feature out of the chip it was filed under, and a
    // card that vanishes as it is saved reads as a card that was deleted.
    await expect(filterChip(page, 'All', 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, 'Open well').locator('.state.good')).toHaveText('Silted');
  });

  test('a saved edit hands the cursor back to the pencil it came from', async ({ page, world }) => {
    // DEFECT, and a flaky one — this test goes red roughly one run in two, and
    // the red is the app losing a coin toss rather than the suite wobbling.
    //
    // RecordFeatures.tsx:133-135 restores the row's focus one animation frame
    // after the save, from the `editTriggers` map — and :540 only ever WRITES
    // to that map (`if (node)`), so the entry for a card whose pencil is
    // currently replaced by the editor is the DETACHED button from before the
    // editor opened. save() (:196) runs after an `await`, so React commits the
    // re-rendered card from the scheduler rather than from the click, and that
    // commit races the frame. Lose the race and `focus()` is called on a node
    // with `isConnected === false` — measured, not guessed — the call does
    // nothing, the Save button it was standing on is removed, and the keyboard
    // is dumped on <body>: the next Tab starts again at the top of the page.
    // Cancel (:444-449) is reliable only because it runs inside the click,
    // where React has already flushed. The fix is to focus from an effect
    // after the commit, or to clear the map entry when the ref is handed null.
    // It is NOT marked test.fail(), because a marker that is wrong half the
    // time is worse than the flake it documents.
    liveLand(world, [
      feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await openEditor(page).getByLabel('Condition', { exact: true }).fill('Silted');
    await openEditor(page).getByRole('button', { name: 'Save' }).click();

    await expect(cardFor(page, 'Open well').locator('.state.good')).toHaveText('Silted');
    await expect(cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' })).toBeFocused();
  });

  test('an edited feature comes back onto its card in the words that were typed', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Name', { exact: true }).fill('Borewell 1 (east)');
    await editor.getByLabel('Condition', { exact: true }).fill('Dead');
    await editor.getByRole('button', { name: 'Broken', exact: true }).click();
    await editor.getByLabel('Note', { exact: true }).fill('Starter panel burnt out');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect(openEditor(page)).toHaveCount(0);
    const card = cardFor(page, 'Borewell 1 (east)');
    await expect(card.locator('.state.bad')).toHaveText('Dead');
    await expect(card).toContainText('Starter panel burnt out');
    await expect(card).toHaveClass(/alert/);
  });

  test('the condition chips are the four words a condition can be, and one is always pressed', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    for (const word of ['Working', 'Watch it', 'Broken', 'Not checked']) {
      await expect(editor.getByRole('button', { name: word, exact: true })).toBeVisible();
    }
    await editor.getByRole('button', { name: 'Working', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Working', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: 'Watch it', exact: true }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  test('a feature the server has never had a word for opens on Not checked', async ({ page, world }) => {
    liveLand(world, [feat({ id: FEATURE.fence, label: 'Barbed fence', conditionState: 'unknown' })]);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Barbed fence').getByRole('button', { name: 'Edit Barbed fence' }).click();
    await expect(openEditor(page).getByRole('button', { name: 'Not checked', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('a save the server refuses keeps the form open and says why, above the button that asked', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Condition', { exact: true }).fill('Dead');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect(editor.getByRole('alert'))
      .toHaveText('That change was not saved. Reload the page and try again.');
    await expect(editor.getByLabel('Condition', { exact: true })).toHaveValue('Dead');
    await expect(editor.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('a save that fell over says the typed words are still here, and they are', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', World.gqlError('the write timed out'));
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Note', { exact: true }).fill('Panel replaced 12 Aug');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect(editor.getByRole('alert'))
      .toHaveText('That change could not be saved. What you typed is still here.');
    await expect(editor.getByLabel('Note', { exact: true })).toHaveValue('Panel replaced 12 Aug');
  });

  test('a feature cannot be saved with its name rubbed out', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Name', { exact: true }).fill('   ');
    await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(world.calls('updateFeature')).toHaveLength(0);
  });

  test('the Save button says it is saving while the answer is still coming', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', World.slow(1200, true));
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    const editor = openEditor(page);
    await editor.getByLabel('Condition', { exact: true }).fill('Dead');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect(editor.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  test('Cancel closes the form and puts the cursor back on the pencil it came from', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    await openEditor(page).getByLabel('Condition', { exact: true }).fill('Dead');
    await openEditor(page).getByRole('button', { name: 'Cancel' }).click();

    await expect(openEditor(page)).toHaveCount(0);
    await expect(cardFor(page, 'Borewell 1').locator('.state.warn')).toHaveText('Yield dropped');
    await expect(cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' })).toBeFocused();
    expect(world.calls('updateFeature')).toHaveLength(0);
  });

  test('a refusal on one card does not follow the pencil onto the next one', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await openEditor(page).getByRole('button', { name: 'Save' }).click();
    await expect(openEditor(page).getByRole('alert')).toBeVisible();

    // Straight from one card's pencil to another's, without closing the first:
    // the message is one piece of state shared by every editor on the page, so
    // a fence that has never been saved would open under a refusal.
    await cardFor(page, 'Barbed fence').getByRole('button', { name: 'Edit Barbed fence' }).click();
    await expect(openEditor(page).getByLabel('Name', { exact: true })).toHaveValue('Barbed fence');
    await expect(openEditor(page).getByRole('alert')).toHaveCount(0);
  });

  test('reopening a form that was refused does not reopen the refusal with it', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    await openEditor(page).getByRole('button', { name: 'Save' }).click();
    await expect(openEditor(page).getByRole('alert')).toBeVisible();
    await openEditor(page).getByRole('button', { name: 'Cancel' }).click();

    await cardFor(page, 'Borewell 1').getByRole('button', { name: 'Edit Borewell 1' }).click();
    await expect(openEditor(page).getByRole('alert')).toHaveCount(0);
  });
});

// ── taking a feature away ──────────────────────────────────────────────

test.describe('W07 · taking a feature away', () => {
  const two = () => [
    feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
  ];

  test('Remove asks first, and nothing is taken on the first press', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();

    await expect(card.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Keep' })).toBeVisible();
    expect(world.calls('deleteFeature')).toHaveLength(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test('the second press takes it, and the card it was on goes with it', async ({ page, world }) => {
    const rows = liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deleteFeature').length).toBe(1);
    expect(world.lastVars('deleteFeature')).toMatchObject({ featureId: FEATURE.fence });
    await expect(cardFor(page, 'Barbed fence')).toHaveCount(0);
    await expect(cardFor(page, 'Open well')).toBeVisible();
    expect(rows.map((r) => r.id)).toEqual([FEATURE.well]);
  });

  test('after a feature is gone the keyboard lands on the control that files the next one', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();

    // The card that held the pressed control is gone, so focus goes to the one
    // control on this screen that is always there — the header's own button,
    // which is also what the drawer returns focus to.
    await expect(addButton(page)).toBeFocused();
  });

  test('Keep puts the card back the way it was, with the cursor where it started', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Keep' }).click();

    await expect(card.getByRole('button', { name: 'Remove Barbed fence' })).toBeFocused();
    expect(world.calls('deleteFeature')).toHaveLength(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test('a removal the server refuses keeps the feature, and says so on that card alone', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(card.getByRole('alert'))
      .toHaveText('That feature could not be removed. Reload the page and try again.');
    // The confirm row stays open: shutting it while the card is still there
    // reads as "Remove does not work".
    await expect(card.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(cardFor(page, 'Open well').getByRole('alert')).toHaveCount(0);
  });

  test('a removal that fell over says the feature is still filed here', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', World.gqlError('the delete never reached the database'));
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(card.getByRole('alert'))
      .toHaveText('That feature could not be removed. It is still filed here.');
    await expect(cardFor(page, 'Barbed fence')).toBeVisible();
  });

  test('the card being removed is the only one that greys out while it goes', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', World.slow(1200, true));
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(card.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    await expect(cardFor(page, 'Open well').getByRole('button', { name: 'Remove Open well' })).toBeEnabled();
  });

  test('asking to remove a second time takes back the refusal the first ask got', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(card.getByRole('alert')).toBeVisible();

    await card.getByRole('button', { name: 'Keep' }).click();
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();

    // The question is being asked again, so the answer to the last one is no
    // longer the answer to anything.
    await expect(card.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(card.getByRole('alert')).toHaveCount(0);
  });

  test('opening the pencil on a card takes back the question the bin asked', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();

    await expect(cardFor(page, 'Barbed fence').getByRole('button', { name: 'Remove', exact: true }))
      .toHaveCount(0);
    await expect(openEditor(page).getByLabel('Name', { exact: true })).toHaveValue('Open well');
  });
});

// ── handing the order flow a job, and buying nothing ───────────────────

/**
 * Nothing on this screen files an order any more.
 *
 * "Ask for a check" used to buy the ₹1,200 site visit from a confirm dialog:
 * one tap, no review of what was being bought, no idempotency key, no
 * reference to come back to, and no check that the record could even say where
 * the land is. It is now a `<Link>` into the order flow
 * (RecordFeatures.tsx:243-244) carrying the three things this screen already
 * knows — the land, the service, and what the visitor is being asked to look
 * at. What the flow does with them is 13-services.spec.ts's argument. What
 * belongs here is that the handover is complete, that this screen files
 * nothing on any path, and that the two guards it kept are still guarding.
 */

/** The whole handover, spelled out. Every part of it is load-bearing: without
 *  `step` the flow opens on its own first question, without `a.check` it asks
 *  the owner something this screen has already answered, and without `why` the
 *  order goes in with no record of where it was asked for. */
const ORDER_CHECK = `/app/records/${ID.parcel}/order`
  + '?service=site_visit&step=pick&a.check=General+condition&why=features';

/** A site visit already running on this parcel. The seeded orders for it are
 *  an EC and a corner survey — neither of them a check — so a test that wants
 *  the duplicate guard has to put one there. */
const visitOrdered = [{
  id: 'w-tkt-visit', kind: 'site_visit', title: 'Site visit', detail: 'General condition',
  assignee: 'Ravi Kumar, licensed surveyor', cost: 1_200, stage: 2, stageLabel: 'Assigned',
  needsYou: false, dueDate: '2026-09-25', recordId: ID.parcel, recordTitle: 'Sy 214/2',
  params: '{}', status: 'assigned', statusLabel: 'Assigned', statusState: '', ref: 'W-2107',
  held: 1_200, pendingReview: 0,
}];

/** Whichever shape the check control is wearing — a link when the orders are
 *  known and there is no visit yet, a disabled button while they are not. Used
 *  where a test is about the CONTROL rather than about which of the two it is. */
const askForCheck = (page: Page) =>
  page.getByRole('link', { name: /^Ask for a check/ })
    .or(page.getByRole('button', { name: /^Ask for a check/ }));

test.describe('W07 · asking for a check', () => {
  test('the price is on the control that asks for one, because a visit costs money', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByRole('link', { name: /^Ask for a check/ })).toContainText('₹1,200');
  });

  test('asking for a check hands the order flow the land, the service and the brief', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByRole('link', { name: /^Ask for a check/ }))
      .toHaveAttribute('href', ORDER_CHECK);
    // And it is a way in, not a purchase: no question is asked on this screen
    // and no order leaves it.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('following it lands on the step that chooses the work, with the site visit already chosen', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));
    await page.getByRole('link', { name: /^Ask for a check/ }).click();

    await expect(page).toHaveURL(ORDER_CHECK);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' }))
      .toBeVisible();
    // The land came with it, so the flow never asks which property this is
    // for — and the service came with it, so the tile is already pressed.
    await expect(page.getByRole('button', { name: /^Site visit/ }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Boundary re-survey/ }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('the visit arrives at the questions already told what to look at', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));
    await page.getByRole('link', { name: /^Ask for a check/ }).click();
    await page.getByRole('button', { name: 'Answer what it needs' }).click();

    await expect(page.getByRole('heading', { name: 'What we need to know' })).toBeVisible();
    // `a.check` is the catalogue's own `check` field. Asked from the features
    // list, the brief is not in question — the features are what needs looking
    // at — so the owner is not made to answer it again.
    await expect(page.getByLabel('What to check')).toHaveValue('General condition');
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('a record that already has a site visit on it opens the one it has instead of selling a second', async ({ page, world }) => {
    world.set('orders', visitOrdered);
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByRole('link', { name: 'Open ordered check' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    // Not the order flow under another name: a second paid visit cannot be
    // started from here at all, in either shape.
    await expect(askForCheck(page)).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('while the existing orders are still being read the way in is a button nothing can follow', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto(featuresUrl(ID.parcel));

    const waiting = page.getByRole('button', { name: 'Checking orders…' });
    await expect(waiting).toBeDisabled();
    // The shape matters and not only the greying: a <Link> has no `disabled`,
    // so a class that dims it still navigates on a click, on Enter and on a
    // middle click into a new tab. A real button is refused by the browser.
    await expect(page.getByRole('link', { name: /^Ask for a check/ })).toHaveCount(0);
    await waiting.click({ force: true });
    await expect(page).toHaveURL(featuresUrl(ID.parcel));
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('if the orders could not be read at all the page says so and refuses to charge blind', async ({ page, world }) => {
    world.set('orders', World.gqlError('orders are not readable'));
    await page.goto(featuresUrl(ID.parcel));

    const said = page.getByRole('alert')
      .filter({ hasText: 'Existing orders could not be checked, so another paid visit is disabled' });
    await expect(said).toBeVisible();

    // Still priced, so nobody reads it as a different offer — but inert, and
    // inert the way the browser enforces rather than the way a stylesheet
    // suggests. A duplicate guard that could not run is not a guard.
    const asked = page.getByRole('button', { name: /^Ask for a check/ });
    await expect(asked).toBeDisabled();
    await expect(asked).toContainText('₹1,200');
    await expect(page.getByRole('link', { name: /^Ask for a check/ })).toHaveCount(0);
    await asked.click({ force: true });
    await expect(page).toHaveURL(featuresUrl(ID.parcel));
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('Try again on the orders line brings the way into the order flow back', async ({ page, world }) => {
    world.set('orders', World.gqlError('orders are not readable'));
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByRole('button', { name: /^Ask for a check/ })).toBeDisabled();

    world.set('orders', []);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('link', { name: /^Ask for a check/ }))
      .toHaveAttribute('href', ORDER_CHECK);
    await expect(page.getByText('Existing orders could not be checked')).toHaveCount(0);
  });

  test('the footnote under the grid points at a control that is actually on this page', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));

    // The footnote is where the grid says what Pattadar does and does not
    // book. It names this control by its words and by where it stands, so a
    // control that moved, was renamed or went inert leaves the sentence lying.
    await expect(page.getByText('Pattadar books a site visit')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ask for a check/ })).toBeEnabled();
  });

  test('nothing about the features themselves ever files an order', async ({ page, world }) => {
    // Every write this screen has, one after another, on the one path where a
    // stray order would be easiest to miss.
    liveLand(world, [feat({ id: FEATURE.well, label: 'Open well', condition: 'Working' })]);
    await page.goto(featuresUrl(ID.parcel));

    // Filing now goes through the drawer, and the condition it asks for is part
    // of the same write rather than a second trip through the per-card editor.
    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Bore', exact: true }).click();
    await drawer(page).getByLabel('Condition', { exact: true }).fill('Dry');
    await fileIt(page).click();
    await expect(drawer(page)).toHaveCount(0);
    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await openEditor(page).getByLabel('Condition', { exact: true }).fill('Silted');
    await openEditor(page).getByRole('button', { name: 'Save' }).click();
    await cardFor(page, 'Open well').getByRole('button', { name: 'Remove Open well' }).click();
    await cardFor(page, 'Open well').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(cardFor(page, 'Bore')).toBeVisible();
    await expect(cardFor(page, 'Open well')).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
  });
});

// ── the three states ───────────────────────────────────────────────────

test.describe('W07 · loading, empty and failed', () => {
  test('while the land is still coming the page says so and files nothing into a list nobody can see', async ({ page, world }) => {
    world.set('features', World.never());
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(addCard(page)).toHaveCount(0);
    await expect(addButton(page)).toBeDisabled();
  });

  test('a read that did not come back says so, and stops offering to file into it', async ({ page, world }) => {
    world.set('features', World.gqlError('the features store is down'));
    await page.goto(featuresUrl(ID.parcel));

    const panel = page.getByRole('alert').filter({ hasText: 'What is on this land did not load' });
    await expect(panel).toBeVisible();
    // The reason, verbatim, for whoever is being asked "what does it say?"
    await expect(panel).toContainText('the features store is down');
    // And the sentence that stops a failed read reading as a lost record.
    await expect(panel).toContainText('Nothing has been lost');
    await expect(panel).toContainText('Your records are untouched.');
    await expect(panel.getByRole('button', { name: 'Try again' })).toBeEnabled();
    // Filing against a record that would not load is not a safe offer, so
    // neither way into the drawer is drawn.
    await expect(addCard(page)).toHaveCount(0);
    await expect(addButton(page)).toHaveCount(0);
  });

  test('Try again on a failed read brings the land back', async ({ page, world }) => {
    world.set('features', World.gqlError('the features store is down'));
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByText('What is on this land did not load')).toBeVisible();

    world.set('features', land([feat({ id: FEATURE.well, label: 'Open well', condition: 'Working' })]));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(cardFor(page, 'Open well')).toBeVisible();
    await expect(page.getByText('What is on this land did not load')).toHaveCount(0);
    await expect(addButton(page)).toBeEnabled();
  });

  test('a background read that fails leaves the features that are already on screen alone', async ({ page, world }) => {
    liveLand(world, [feat({ id: FEATURE.well, label: 'Open well', condition: 'Working' })]);
    await page.goto(featuresUrl(ID.parcel));
    await expect(cardFor(page, 'Open well')).toBeVisible();

    // The next read fails; a refetch is provoked by a write that succeeds.
    world.set('features', World.gqlError('the features store went away'));
    world.set('addFeature', 'w-feat-new');
    const read = world.calls('features').length;
    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Shed', exact: true }).click();
    await fileIt(page).click();

    // The failing read has to have actually been made: an error panel that is
    // absent because nothing was re-read proves nothing about a cache.
    await expect.poll(() => world.calls('features').length).toBeGreaterThan(read);
    await expect(page.getByText('What is on this land did not load')).toHaveCount(0);
    await expect(cardFor(page, 'Open well')).toBeVisible();
  });

  test('a record with nothing on it offers the first feature instead of an empty grid', async ({ page }) => {
    await page.goto(featuresUrl(ID.plot));

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('On this land');
    await expect(summary(page)).toHaveText('0 features');
    // No feature cards at all — the invitation is a button, not one of them.
    await expect(cards(page)).toHaveCount(0);
    await expect(addCard(page)).toBeVisible();
    // The footnote is about cards; with no cards there is nothing for any of
    // its sentences to be about.
    await expect(page.getByText('Changing what a feature is, or the condition it is in, is the pencil'))
      .toHaveCount(0);
  });

  test('an empty hanger stops claiming an order it has no cards to keep', async ({ page }) => {
    // DEFECT. RecordFeatures.tsx:381-399 draws "Worst condition first · every
    // one carries its own pin and its own photos" outside the
    // loading/failed/loaded branch, so it is printed over an empty grid, over
    // the skeleton, and over the error panel — the same fault the footnote at
    // :645 was fixed for. The owner is owed that line only where there are
    // cards for it to describe.
    test.fail();
    await page.goto(featuresUrl(ID.plot));
    await expect(addCard(page)).toBeVisible();
    await expect(page.getByText('Worst condition first')).toHaveCount(0);
  });

  test('a record that is not in the portfolio says that, rather than that it has no features', async ({ page }) => {
    await page.goto(featuresUrl(ID.missing));
    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'On this land' })).toHaveCount(0);
  });

  test('a record whose own read failed never draws the features hanger at all', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByText('This record did not load')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'On this land' })).toHaveCount(0);
  });
});

// ── the phone ──────────────────────────────────────────────────────────

test.describe('W07 · on a phone', () => {
  // Both scenarios here are about WIDTH, so the width is set rather than
  // inherited from the project. The phone project runs them on a real iPhone
  // profile; setting it explicitly means the desktop project proves them too,
  // at the same 390px, on whatever browser the machine actually has.
  test.use({ viewport: { width: 390, height: 844 } });

  test('the feature cards stack one to a row, and nothing runs off the side @phone', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Barbed fence', category: 'boundary', condition: 'Cut on the east', conditionState: 'bad' }),
      feat({ id: 'w-feat-2', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good', lat: 15.7408, lon: 79.2697, photoCount: 4 }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    const first = await cardFor(page, 'Barbed fence').boundingBox();
    const second = await cardFor(page, 'Open well').boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.x).toBeCloseTo(first!.x, 0);
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the chips and the sentence beside them stack rather than squeeze @phone', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Open well', category: 'water', condition: 'Working' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    const chip = await filterChip(page, 'All', 1).boundingBox();
    const note = await page.getByText('Worst condition first · every one carries its own pin and its own photos')
      .boundingBox();
    expect(note!.y).toBeGreaterThan(chip!.y + chip!.height - 1);
  });
});
