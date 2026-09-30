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
 *   · The filter is the shared FacetFilter (ui.tsx), not a chip row: "+ Filter"
 *     opens a panel with two groups, Category and Condition, that combine.
 *     Both are counted off the features on screen, so the server's `all`,
 *     `needs_repair` and `unchecked` facets (web360.py `features`) are never
 *     drawn as options — Condition is its own group in the four state words.
 *     Tests about filtering build their own list; tests about DRAWING use the
 *     shared seed, which is the world as it ships.
 *   · `conditionState` is one of good/warn/bad/unknown (web360.py _STATES),
 *     and the card, the filter and the rail all say it in one word each —
 *     Working · Watch it · Broken · Not checked (design.md § App vocabulary,
 *     "Property tabs"). What was typed about it is the card's detail line,
 *     not its state. The shared seed spelled the good one `ok` until
 *     28/09/2026; the state-word scenarios below still seed their own rows.
 *   · A write that succeeds invalidates the whole `w360` key, so the list is
 *     re-read before `mutateAsync` resolves. The mutation answers in these
 *     tests therefore MUTATE a local array that the `features` answer is read
 *     from — otherwise a filed feature would never come back from the server
 *     and the editor, which is drawn inside that feature's own card, would
 *     have no card to open in.
 *
 *   · The one thing on this page that costs money no longer happens on it.
 *     "Ask for a site visit" (it was "Ask for a check" until 28/09/2026) is a
 *     `<Link>` into the order flow at
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
import { FEATURE_TYPES } from '../fixtures/featureTypes';

// ── the land, shaped the way the server shapes it ──────────────────────

interface Feat {
  id: string; label: string; spec: string; icon: string; category: string;
  condition: string; conditionState: string; note: string;
  lat: number; lon: number; pinLabel: string; photoCount: number; actions: string[];
  // Selected since 37ae2ca (w360/api.ts Q_FEATURES). `typeKey` is what the
  // edit panel opens its schema on; a feature without one opens with no name
  // box and a Save that refuses until a type is chosen.
  typeKey: string; schemaVersion: number; attributes: string; geometry: string;
  version: number; costTotal: number; costCount: number; receiptCount: number;
}

/** One feature, with every field the query selects filled in. Anything left
 *  out draws as `undefined` on a card, which is the bug, not the fixture. */
const feat = (over: Partial<Feat> & Pick<Feat, 'id' | 'label'>): Feat => ({
  spec: '', icon: 'feature', category: 'other', condition: '', conditionState: 'good',
  note: '', lat: 0, lon: 0, pinLabel: '', photoCount: 0, actions: [],
  typeKey: 'custom', schemaVersion: 1, attributes: '{}', geometry: '{}',
  version: 1, costTotal: 0, costCount: 0, receiptCount: 0, ...over,
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
    // The catalogue the Add-a-feature panel draws its type chips from; the
    // API sends it with every features answer (fixtures/featureTypes.ts).
    types: FEATURE_TYPES,
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
    // One write carries the whole feature since 37ae2ca: type, attributes,
    // condition and note all arrive with the add. The API also derives the
    // spec line and the icon; the test world only has to be consistent.
    rows.push(feat({
      id, label: String(vars.label), typeKey: String(vars.typeKey),
      attributes: String(vars.attributes), condition: String(vars.condition),
      conditionState: String(vars.conditionState), note: String(vars.note),
    }));
    return id;
  });
  world.set('updateFeature', (vars) => {
    const row = rows.find((r) => r.id === vars.featureId);
    if (!row) return false;
    Object.assign(row, {
      label: String(vars.label), typeKey: String(vars.typeKey), attributes: String(vars.attributes),
      condition: String(vars.condition), conditionState: String(vars.conditionState),
      note: String(vars.note), version: row.version + 1,
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

/** Every FEATURE card in the grid. The dashed "Add a feature" invitation that
 *  used to end the grid is gone (the section head's button opens the same
 *  drawer), so a grid of two features is two. */
const cards = (page: Page) => page.getByRole('article');
/** The dashed invitation card that used to end the grid. It was removed —
 *  the header button is the one way in — and is kept only so tests can assert
 *  it stays gone. */
const addCard = (page: Page) => page.locator('button.addcard');
/** The header's own "Add a feature". Scoped to the section head, not told
 *  apart by name: the card above used to carry a description in its
 *  accessible name, and once that copy was trimmed both read exactly "Add a
 *  feature", so `exact` alone matched two. */
const addButton = (page: Page) =>
  page.locator('header.sechead').getByRole('button', { name: 'Add a feature', exact: true });
/** The panel both of those open. Named by its own <h2>, the way the shared
 *  Drawer names every one of them. */
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Add a feature' });
/** The drawer's primary. It reads "Saving…" while the write is in flight
 *  (Drawer.DrawerAction). */
const fileIt = (page: Page) => page.getByRole('button', { name: 'Add the feature' });
const cardFor = (page: Page, label: string) => page.getByRole('article')
  .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
/** The panel a card's pencil opens. Rewritten 27/09/2026: editing used to
 *  replace the card with an inline form; since 07944a0 the pencil opens the
 *  same drawer as filing, named "Edit <label>", over the page. */
const editPanel = (page: Page, label: string) => page.getByRole('dialog', { name: `Edit ${label}` });
/** The shared confirmation (PropertyActions.tsx ConfirmDialog) a removal asks
 *  in, titled with the feature it would delete. */
const removeDialog = (page: Page, label: string) => page.getByRole('dialog', { name: `Remove ${label}?` });
const saveIt = (page: Page) => page.getByRole('button', { name: 'Save changes' });
/** The drawer's name box. It appears once a type has been chosen. Labelled
 *  "Name on this property" since the record → property wording (was "Name on
 *  this record", which found nothing). */
const nameBox = (scope: ReturnType<Page['locator']>) => scope.getByLabel('Name on this property');
/** The summary line under the tab's own heading. Since 07944a0 it is the
 *  `p.note` of the section head; `p.lede` belongs to the record header and
 *  holds the place line on every tab. */
const summary = (page: Page) => page.locator('header.sechead p.note');

/** The filter above the grid is the shared FacetFilter (ui.tsx): "+ Filter"
 *  opens a panel named "Filter site features" holding two groups, Category
 *  and Condition. Every option is a toggle named for its word and the count
 *  of cards it would leave — the count is also what tells it apart from the
 *  type chips in the drawer ("Crop 1" narrows the grid, "Crop" is what a new
 *  one will be). */
const filterPanel = (page: Page) => page.getByRole('group', { name: 'Filter site features' });
const openFilter = async (page: Page) => {
  const trigger = page.getByRole('button', { name: '+ Filter' });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(filterPanel(page)).toBeVisible();
  return filterPanel(page);
};
const reEscape = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
/** One option in the open panel, by its whole name — "Water 1" is not also
 *  "Water 12". */
const filterOption = (page: Page, label: string, count: number) =>
  filterPanel(page).getByRole('button', { name: new RegExp('^' + reEscape(label) + '\\s*' + count + '$') });
/** One group of the open panel, by the eyebrow over it. */
const filterGroup = (page: Page, label: 'Category' | 'Condition') =>
  filterPanel(page).locator('.fgrp').filter({ has: page.locator('.eyebrow', { hasText: label }) });
/** The chip a pressed option leaves in the bar, with the × that lets it go. */
const activeFilter = (page: Page, group: 'Category' | 'Condition', label: string) =>
  page.getByRole('button', { name: `Remove filter ${group} ${label}` });

/** A card in the rail, by its own heading (ui.tsx Card is a section.card
 *  headed by an h2). */
const railCard = (page: Page, title: string) => page.getByRole('complementary')
  .locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
/** The count the rail's Condition card gives one of the four state words. */
const conditionCount = (page: Page, word: string) => railCard(page, 'Condition')
  .locator('.kv > div').filter({ has: page.locator('.k', { hasText: new RegExp('^' + reEscape(word) + '$') }) })
  .locator('.v');

const featuresUrl = (id: string) => `/app/records/${id}/features`;

// ── what the world ships with ──────────────────────────────────────────

test.describe('W07 · what is on this land', () => {
  test('every feature on the parcel is drawn with its name, what it is and the condition it is in', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));

    // The record is the page's <h1> on every tab since 07944a0; the tab's own
    // question is the section head's <h2>.
    await expect(page.locator('header.sechead h2')).toHaveText('Site features');
    expect(world.lastVars('features')).toMatchObject({ id: ID.parcel });

    // Four seeded features, and the one way to file a fifth is the header's.
    await expect(cards(page)).toHaveCount(4);
    await expect(addButton(page)).toBeVisible();
    await expect(addCard(page)).toHaveCount(0);

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

  test('the headline says which record you are standing in', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    // Rewritten 27/09/2026. The tab's own heading is true of every record, so
    // the record has to be named somewhere. Since 07944a0 that is the record
    // header's <h1>, with the place line beside it, on every tab.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.locator('p.lede')).toContainText('Katragunta, Markapur, Prakasam');
  });

  test('the summary line counts the features, and the rail says what state they are in and since when', async ({ page }) => {
    // Each fact once (RecordFeatures.tsx featuresSub): the line under the
    // heading is the total, and the conditions and the day somebody was last
    // on the ground are the rail's Condition card. It used to say all three
    // there and again in the chips.
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toHaveText('4 site features');

    const condition = railCard(page, 'Condition');
    await expect(condition).toContainText('Last checked on the ground 12/08/2026 by Shankar Reddy.');
    for (const [word, n] of [['Working', 2], ['Watch it', 1], ['Broken', 0], ['Not checked', 1]] as const) {
      await expect(conditionCount(page, word)).toHaveText(String(n));
    }
  });

  test('the categories on the record become the Category options, counted off the cards', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    await openFilter(page);
    // In the order the cards first name them, and nothing else: an option
    // that quietly counted the server's facet instead of the cards is a filter
    // that promises cards it does not have.
    await expect(filterGroup(page, 'Category').getByRole('button'))
      .toHaveText([/^Water\s*2$/, /^Boundary\s*1$/, /^Crop\s*1$/]);
    // The conditions are their own group, in the four words and in their
    // order, and a word nothing is in is not offered.
    await expect(filterGroup(page, 'Condition').getByRole('button'))
      .toHaveText([/^Working\s*2$/, /^Watch it\s*1$/, /^Not checked\s*1$/]);
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
    await expect(summary(page)).toHaveText('1 site feature');
    // The one place the date is said: the rail's Condition card, DD/MM/YYYY.
    await expect(railCard(page, 'Condition'))
      .toContainText('Last checked on the ground 12/08/2026 by Ramana Rao.');
  });

  test('a record nobody has walked says so, and puts no date or name to it', async ({ page, world }) => {
    world.set('features', land([feat({ id: FEATURE.well, label: 'Open well', conditionState: 'bad', condition: 'Dry' })],
      { walkedOn: '', walkedBy: '' }));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toHaveText('1 site feature');
    const condition = railCard(page, 'Condition');
    await expect(condition).toContainText('Not checked on the ground yet.');
    await expect(condition).not.toContainText('Last checked');
  });

  test('a name with no date behind it is not hung off the repair count', async ({ page, world }) => {
    // Was a test.fail() marker for "2 features · 1 needs repair by Ramana
    // Rao". Fixed in committed code: the name now sits inside the walked term
    // (RecordFeatures.tsx featuresSub), so with no date it is dropped. The
    // marker was removed with the fix, 27/09/2026.
    world.set('features', land([
      feat({ id: FEATURE.well, label: 'Open well', conditionState: 'bad', condition: 'Dry' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence' }),
    ], { walkedOn: '', walkedBy: 'Ramana Rao' }));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toContainText('2 site features');
    await expect(summary(page)).not.toContainText('repair by Ramana Rao');
    // Nor in the rail, where the date now lives: a name with no day is not a
    // visit (RecordFeatures.tsx, the Condition card's note).
    await expect(railCard(page, 'Condition')).toContainText('Not checked on the ground yet.');
    await expect(railCard(page, 'Condition')).not.toContainText('Ramana Rao');
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

  test('a feature whose condition is in its own words keeps those words, under the state word', async ({ page, world }) => {
    // One word per state on every surface of this tab — the card, the filter
    // and the rail count the same thing — and what somebody typed about it is
    // the card's detail line (design.md § App vocabulary, "Property tabs").
    world.set('features', land(mixed()));
    await page.goto(featuresUrl(ID.parcel));
    const fence = cardFor(page, 'Barbed fence');
    await expect(fence.locator('.state.bad')).toHaveText('Broken');
    await expect(fence.locator('p.note').filter({ hasText: 'Cut on the east' })).toBeVisible();
    const pump = cardFor(page, 'Submersible pump');
    await expect(pump.locator('.state.warn')).toHaveText('Watch it');
    await expect(pump.locator('p.note').filter({ hasText: 'Yield dropped' })).toBeVisible();
  });

  test('typed words that are only the state word again are not said twice', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-bare', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    const well = cardFor(page, 'Open well');
    await expect(well.locator('.state.good')).toHaveText('Working');
    await expect(well.getByText('Working', { exact: true })).toHaveCount(1);
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

    // The repair count is said where the conditions are counted — the rail
    // and the filter — and both agree with the cards drawn as an alarm.
    await expect(summary(page)).toHaveText('3 site features');
    await expect(page.locator('article.alert')).toHaveCount(2);
    await expect(conditionCount(page, 'Broken')).toHaveText('2');
    await openFilter(page);
    await expect(filterOption(page, 'Broken', 2)).toBeVisible();
  });

  test('one feature is said in the singular', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Barbed fence', condition: 'Cut on the east', conditionState: 'bad' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));
    await expect(summary(page)).toHaveText('1 site feature');
    await expect(conditionCount(page, 'Broken')).toHaveText('1');
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
});

// ── the chips ──────────────────────────────────────────────────────────

test.describe('W07 · narrowing the grid', () => {
  const orchard = () => [
    feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    feat({ id: 'w-feat-pump', label: 'Submersible pump', category: 'water', condition: 'Yield dropped', conditionState: 'warn' }),
    feat({ id: 'w-feat-fence', label: 'Barbed fence', category: 'boundary', condition: 'Cut on the east', conditionState: 'bad' }),
    feat({ id: 'w-feat-shed', label: 'Old shed', category: 'structure', conditionState: 'unknown' }),
  ];

  test('the whole list is the one you land on, with no filter on and no tally', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveAttribute('aria-expanded', 'false');
    // The bar carries a chip only for a filter that is on, and says "n of m
    // shown" only while something is narrowing.
    await expect(page.locator('.filterbar .fchip')).toHaveCount(0);
    await expect(page.locator('.filterbar .tally')).toHaveCount(0);
  });

  test('a category narrows the grid to what it names, and the bar says how far', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Water', 2).click();
    await expect(filterOption(page, 'Water', 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, 'Open well')).toBeVisible();
    await expect(cardFor(page, 'Submersible pump')).toBeVisible();
    await expect(cardFor(page, 'Barbed fence')).toHaveCount(0);
    await expect(activeFilter(page, 'Category', 'Water')).toBeVisible();
    await expect(page.locator('.filterbar .tally')).toHaveText('2 of 4 shown');
  });

  test('a category and a condition combine rather than replace each other', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Water', 2).click();
    await filterOption(page, 'Watch it', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, 'Submersible pump')).toBeVisible();
    await expect(page.locator('.filterbar .tally')).toHaveText('1 of 4 shown');
  });

  test('Clear all puts the whole list back', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Boundary', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(page.locator('.filterbar .fchip')).toHaveCount(0);
  });

  test('the chip a filter leaves in the bar lets that filter go', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Boundary', 1).click();
    await page.keyboard.press('Escape');
    await expect(filterPanel(page)).toHaveCount(0);
    await activeFilter(page, 'Category', 'Boundary').click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('Broken leaves only what is broken on the screen', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Broken', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, 'Barbed fence')).toBeVisible();
    // "Yield dropped" is Watch it, not Broken — the two must not be counted
    // together.
    await expect(cardFor(page, 'Submersible pump')).toHaveCount(0);
  });

  test('Not checked is its own condition, and keeps the never-inspected apart from the broken', async ({ page, world }) => {
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await expect(filterOption(page, 'Not checked', 1)).toBeVisible();
    await filterOption(page, 'Not checked', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cardFor(page, 'Old shed')).toBeVisible();
  });

  test('the filter is words, not alarms: the broken card carries the alarm and no option does', async ({ page, world }) => {
    // The Needs repair chip used to be filled red, and a pressed chip amber,
    // beside the header's buttons. The shared filter draws every option the
    // same way and washes the pressed one; the red belongs to the card that is
    // broken (design.md § App-surface rules).
    world.set('features', land(orchard()));
    await page.goto(featuresUrl(ID.parcel));

    await expect(cardFor(page, 'Barbed fence')).toHaveClass(/alert/);
    await openFilter(page);
    await expect(filterOption(page, 'Broken', 1)).toBeVisible();
    await expect(filterPanel(page).locator('.alert')).toHaveCount(0);
  });

  test('an option with nothing in it is not a filter, so it is never drawn', async ({ page, world }) => {
    // Everything on this land is sound: Watch it, Broken and Not checked would
    // all count zero.
    world.set('features', land([
      feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    // The panel, first — the absences below are true of a page that has not
    // drawn — and then the whole of it: one category, one condition.
    await openFilter(page);
    await expect(filterOption(page, 'Water', 1)).toBeVisible();
    await expect(filterPanel(page).getByRole('button')).toHaveText([/^Water\s*1$/, /^Working\s*1$/]);
    await expect(filterPanel(page).getByRole('button', { name: /^Broken/ })).toHaveCount(0);
    await expect(filterPanel(page).getByRole('button', { name: /^Not checked/ })).toHaveCount(0);
  });

  test('fixing the last broken thing takes the Broken filter off with it', async ({ page, world }) => {
    // An option the cards stop offering cannot be un-pressed, so the grid
    // would empty with nothing on screen saying a filter was on.
    const rows = liveLand(world, orchard());
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Broken', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Escape');

    await cardFor(page, 'Barbed fence').getByRole('button', { name: 'Remove Barbed fence' }).click();
    await removeDialog(page, 'Barbed fence').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(activeFilter(page, 'Condition', 'Broken')).toHaveCount(0);
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

  test('the panel asks for the detail before anything is written, and files it all in one write', async ({ page, world }) => {
    // Rewritten 27/09/2026. The panel used to file a name with `addFeature` and
    // send a free-text spec in a second `updateFeature`. Since 37ae2ca each
    // type has its own questions, and one `addFeature` carries all of them.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Transformer', exact: true }).click();
    await panel.getByLabel('Capacity (kVA)', { exact: true }).fill('63');
    await panel.getByLabel('Condition detail', { exact: true }).fill('Oil leak on the bushing');
    await panel.getByRole('button', { name: 'Watch it', exact: true }).click();
    await panel.getByLabel('Note', { exact: true }).fill('DISCOM replaced it after the storm');
    await fileIt(page).click();

    // The ring that says "this is the thing you just filed", asserted first
    // because it is a class on the card and lives only 1.6s. The grid is sorted
    // worst-condition-first, so a new feature does not necessarily land at the
    // end of it and this is what says which one is yours.
    await expect(cardFor(page, 'Transformer')).toHaveClass(/flash/);

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature')).toMatchObject({
      recordId: ID.parcel, label: 'Transformer', typeKey: 'transformer',
      condition: 'Oil leak on the bushing', conditionState: 'warn',
      note: 'DISCOM replaced it after the storm',
    });
    expect(JSON.parse(String(world.lastVars('addFeature').attributes))).toEqual({ capacityKva: '63' });
    expect(world.calls('updateFeature')).toHaveLength(0);

    // So the card arrives finished, rather than as a name with a green dot
    // beside it waiting for somebody to come back and say what it is.
    await expect(cardFor(page, 'Transformer')).toContainText('Oil leak on the bushing');
    await expect(panel).toHaveCount(0);
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
    // The name box appears once a type is chosen, and for "Something else" it
    // starts empty (RecordFeatures.tsx chooseType). What it proves is
    // unchanged: the typed name is what gets filed.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await expect(nameBox(panel)).toHaveCount(0);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await expect(nameBox(panel)).toHaveValue('');
    await nameBox(panel).fill('Cattle trough');
    await fileIt(page).click();

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(world.lastVars('addFeature'))
      .toMatchObject({ recordId: ID.parcel, label: 'Cattle trough' });
    await expect(cardFor(page, 'Cattle trough')).toBeVisible();
    await expect(panel).toHaveCount(0);
    // The panel is unmounted when it closes, so re-opening starts blank rather
    // than on the last feature filed — which is what emptying the box did.
    await addButton(page).click();
    await expect(nameBox(drawer(page))).toHaveCount(0);
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
    await nameBox(panel).fill('Silt trap');
    await nameBox(panel).press('Enter');

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
    await nameBox(panel).fill('   ');
    await expect(fileIt(page)).toBeDisabled();
    expect(world.calls('addFeature')).toHaveLength(0);

    // Choosing a named type over a blank name fills the name in, which is what
    // lets the primary file it. Rewritten 27/09/2026: pressing the chosen type
    // again used to clear it; since 37ae2ca it keeps the choice
    // (chooseType returns early on the same key), so the primary stays ready.
    const bore = panel.getByRole('button', { name: 'Bore', exact: true });
    await bore.click();
    await expect(bore).toHaveAttribute('aria-pressed', 'true');
    await expect(nameBox(panel)).toHaveValue('Bore');
    await expect(fileIt(page)).toBeEnabled();
    await bore.click();
    await expect(bore).toHaveAttribute('aria-pressed', 'true');
    expect(world.calls('addFeature')).toHaveLength(0);
  });

  test('filing a feature while a filter is on puts the whole list back, so the new card is not filed out of sight', async ({ page, world }) => {
    liveLand(world, [
      feat({ id: 'w-feat-well', label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: 'w-feat-fence', label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]);
    await page.goto(featuresUrl(ID.parcel));

    await openFilter(page);
    await filterOption(page, 'Water', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Escape');

    await addButton(page).click();
    await drawer(page).getByRole('button', { name: 'Gate', exact: true }).click();
    await fileIt(page).click();

    await expect(page.locator('.filterbar .fchip')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
  });

  test('while one feature is being edited, nothing else can be filed underneath it', async ({ page, world }) => {
    // Rewritten 27/09/2026. This used to prove that filing did not throw away
    // an inline editor left open on a card. Since 07944a0 editing is a modal
    // panel: the page behind it is `inert` (Drawer.tsx useSealedPage), so the
    // hazard cannot arise. What is worth holding is that the seal is there.
    liveLand(world, [feat({ id: FEATURE.well, label: 'Open well', category: 'water' })]);
    await page.goto(featuresUrl(ID.parcel));

    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await expect(editPanel(page, 'Open well')).toBeVisible();

    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(addButton(page).locator('xpath=ancestor-or-self::*[@inert]')).not.toHaveCount(0);
    expect(world.calls('addFeature')).toHaveLength(0);
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
      .toHaveText('The feature details were not accepted. Check the values and try again.');
    await expect(drawer(page)).toBeVisible();
    expect(world.calls('addFeature')).toHaveLength(1);
  });

  test('a filing that fell over keeps every word that was typed, because retyping it is the insult', async ({ page, world }) => {
    world.set('addFeature', World.gqlError('land_features is not accepting writes'));
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await nameBox(panel).fill('Cattle trough');
    await panel.getByLabel('Description').fill('8 ft, brick');
    await fileIt(page).click();

    // Only the opening sentence is asserted: the rest of it is copy the
    // uncommitted work shortened ("…What you entered is still here; try
    // again." at HEAD, "…Try again." in the working tree).
    await expect(panel.getByRole('alert')).toContainText('That feature did not save.');
    // And it is. The panel asks for more than a name now, so there is more to
    // lose than there was — all of it is still in the boxes.
    await expect(nameBox(panel)).toHaveValue('Cattle trough');
    await expect(panel.getByLabel('Description')).toHaveValue('8 ft, brick');
  });

  test('a type’s own questions travel with the feature, in the same one write', async ({ page, world }) => {
    // Rewritten 27/09/2026. This used to cover a detail saved by a second
    // write failing after the feature was filed ("Bore was filed, but its
    // detail was not saved", "Save the detail"). Since 37ae2ca there is no
    // second write, so there is no half-filed feature to report.
    liveLand(world, []);
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Bore', exact: true }).click();
    await panel.getByLabel('Depth (ft)', { exact: true }).fill('420');
    await panel.getByLabel('Diameter (in)', { exact: true }).fill('5');
    await fileIt(page).click();

    await expect.poll(() => world.calls('addFeature').length).toBe(1);
    expect(JSON.parse(String(world.lastVars('addFeature').attributes)))
      .toEqual({ depthFt: '420', diameterIn: '5' });
    expect(world.calls('updateFeature')).toHaveLength(0);
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
      // "Tree", singular: the list comes from the API's catalogue since
      // 37ae2ca (feature_schema.py FEATURE_TYPES), not a list in the page.
      'Shed', 'House', 'Compound wall', 'Tree', 'Crop', 'Road', 'Bund', 'Canal',
      'Something else',
    ]);
    await expect(nameBox(drawer(page))).toHaveCount(0);
    await kinds.last().click();
    await expect(nameBox(drawer(page))).toHaveAttribute('placeholder', 'Something else');
  });

  test('the primary says it is filing while the feature is still being filed', async ({ page, world }) => {
    world.set('features', land([]));
    world.set('addFeature', World.slow(1200, 'w-feat-slow'));
    await page.goto(featuresUrl(ID.parcel));

    await addButton(page).click();
    const panel = drawer(page);
    await panel.getByRole('button', { name: 'Something else' }).click();
    await nameBox(panel).fill('Cattle trough');
    await fileIt(page).click();

    // "Saving…", the working word this panel passes to Drawer.DrawerAction.
    await expect(panel.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    // And the typed name is still in the box while it goes, because it is the
    // thing being filed — the panel closes when the feature exists, not before.
    await expect(nameBox(panel)).toHaveValue('Cattle trough');
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
    await expect(panel.locator('.eyebrow')).toHaveText('Sy 214/2 · Site features');

    // Cancel is a deliberate press, so it closes at once — it is Escape and a
    // slipped click on the scrim that ask about typed work — and focus goes back
    // to the control that opened it.
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer(page)).toHaveCount(0);
    await expect(addButton(page)).toBeFocused();
  });
});

// ── the editor ─────────────────────────────────────────────────────────

/**
 * Rewritten 27/09/2026 against the committed screen. Editing used to replace a
 * card with an inline form (Name, What it is, Condition, Note, Save, Cancel).
 * Since 07944a0 a card's pencil opens the same drawer as filing, named
 * "Edit <label>", and since 37ae2ca it asks each type's own questions instead
 * of a free-text spec, and sends `typeKey`, `attributes` and `expectedVersion`
 * rather than `spec`. Every scenario the old block held is kept where the
 * behaviour still exists; the one about focus landing in the name box now
 * lands on the type chips, because that is where the panel puts it.
 */
test.describe('W07 · turning a name into a record', () => {
  const bore = () => [feat({
    id: FEATURE.well, label: 'Borewell 1', spec: '420 ft · 5 in · 2005', category: 'water',
    condition: 'Yield dropped', conditionState: 'warn', note: 'Ran dry in May',
    lat: 15.7408, lon: 79.2697, pinLabel: 'W1',
    typeKey: 'bore', attributes: JSON.stringify({ depthFt: 420, diameterIn: 5 }), version: 3,
  })];
  const pencil = (page: Page, label: string) =>
    cardFor(page, label).getByRole('button', { name: `Edit ${label}` });

  test('the pencil opens the whole feature in the panel, filled with what is already on it', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();

    const panel = editPanel(page, 'Borewell 1');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Bore', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(nameBox(panel)).toHaveValue('Borewell 1');
    await expect(panel.getByLabel('Depth (ft)', { exact: true })).toHaveValue('420');
    await expect(panel.getByLabel('Diameter (in)', { exact: true })).toHaveValue('5');
    await expect(panel.getByLabel('Condition detail', { exact: true })).toHaveValue('Yield dropped');
    await expect(panel.getByLabel('Note', { exact: true })).toHaveValue('Ran dry in May');
    await expect(panel.getByRole('button', { name: 'Watch it', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByLabel('Latitude')).toHaveValue('15.7408');
    await expect(panel.getByLabel('Longitude')).toHaveValue('79.2697');
  });

  test('the panel opens on the type chips, the same place filing starts', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();

    await expect(editPanel(page, 'Borewell 1').locator('#fa-kinds button').first()).toBeFocused();
  });

  test('a save sends the whole form, so a detail that was cleared is actually cleared', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await panel.getByLabel('Depth (ft)', { exact: true }).fill('');
    await saveIt(page).click();

    await expect.poll(() => world.calls('updateFeature').length).toBe(1);
    const sent = world.lastVars('updateFeature');
    expect(sent).toMatchObject({
      featureId: FEATURE.well,
      label: 'Borewell 1',
      typeKey: 'bore',
      condition: 'Yield dropped',
      conditionState: 'warn',
      note: 'Ran dry in May',
      expectedVersion: 3,
    });
    // Cleared is removed, not sent as an empty value; what was not touched
    // goes back exactly as it came.
    expect(JSON.parse(String(sent.attributes))).toEqual({ diameterIn: 5 });
    await expect(panel).toHaveCount(0);
  });

  test('the words that go to the server are the typed ones without the spaces around them', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await nameBox(panel).fill('  Borewell 1  ');
    await panel.getByLabel('Condition detail', { exact: true }).fill('  Yield dropped  ');
    await panel.getByLabel('Note', { exact: true }).fill('  Ran dry in May  ');
    await saveIt(page).click();

    await expect.poll(() => world.calls('updateFeature').length).toBe(1);
    // A stray space is what a thumb on a phone keyboard leaves behind; stored,
    // it is a name that no longer matches itself in a search or a sort.
    expect(world.lastVars('updateFeature')).toMatchObject({
      featureId: FEATURE.well,
      label: 'Borewell 1',
      condition: 'Yield dropped',
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

    await openFilter(page);
    await filterOption(page, 'Water', 1).click();
    await expect(cards(page)).toHaveCount(1);
    await page.keyboard.press('Escape');

    await pencil(page, 'Open well').click();
    await editPanel(page, 'Open well').getByLabel('Condition detail', { exact: true }).fill('Silted');
    await saveIt(page).click();

    // An edit can move a feature out of the filter it was found under, and a
    // card that vanishes as it is saved reads as a card that was deleted.
    await expect(page.locator('.filterbar .fchip')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(2);
    await expect(cardFor(page, 'Open well').locator('.state.good')).toHaveText('Working');
    await expect(cardFor(page, 'Open well').locator('p.note').filter({ hasText: 'Silted' })).toBeVisible();
  });

  test('a saved edit hands the cursor back to the pencil it came from', async ({ page, world }) => {
    // Under the inline editor this was a known flake: focus was restored from
    // a map that could hold a detached button. The drawer now returns focus
    // itself (Drawer.tsx useSealedPage: the opener if it is still connected,
    // else `returnFocus`). Kept unmarked; if it flakes again, that is the
    // finding, not the suite.
    liveLand(world, [
      feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]);
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Open well').click();
    await editPanel(page, 'Open well').getByLabel('Condition detail', { exact: true }).fill('Silted');
    await saveIt(page).click();

    await expect(cardFor(page, 'Open well').locator('p.note').filter({ hasText: 'Silted' })).toBeVisible();
    await expect(pencil(page, 'Open well')).toBeFocused();
  });

  test('an edited feature comes back onto its card in the words that were typed', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await nameBox(panel).fill('Borewell 1 (east)');
    await panel.getByLabel('Condition detail', { exact: true }).fill('Dead');
    await panel.getByRole('button', { name: 'Broken', exact: true }).click();
    await panel.getByLabel('Note', { exact: true }).fill('Starter panel burnt out');
    await saveIt(page).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    const card = cardFor(page, 'Borewell 1 (east)');
    // The state in its one word, and the typed words under it.
    await expect(card.locator('.state.bad')).toHaveText('Broken');
    await expect(card.locator('p.note').filter({ hasText: 'Dead' })).toBeVisible();
    await expect(card).toContainText('Starter panel burnt out');
    await expect(card).toHaveClass(/alert/);
  });

  test('the condition chips are the four words a condition can be, and one is always pressed', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    for (const word of ['Working', 'Watch it', 'Broken', 'Not checked']) {
      await expect(panel.getByRole('button', { name: word, exact: true })).toBeVisible();
    }
    await panel.getByRole('button', { name: 'Working', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Working', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('button', { name: 'Watch it', exact: true }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  test('a feature the server has never had a word for opens on Not checked', async ({ page, world }) => {
    liveLand(world, [feat({ id: FEATURE.fence, label: 'Barbed fence', typeKey: 'fence', conditionState: 'unknown' })]);
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Barbed fence').click();
    await expect(editPanel(page, 'Barbed fence').getByRole('button', { name: 'Not checked', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('a save the server refuses keeps the panel open and says why, above the button that asked', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await panel.getByLabel('Condition detail', { exact: true }).fill('Dead');
    await saveIt(page).click();

    // A refusal here is most often somebody else's edit landing first, which
    // is why the save carries `expectedVersion`.
    await expect(panel.getByRole('alert')).toHaveText(
      'This feature changed elsewhere or the values were not accepted. Reload and try again.');
    await expect(panel.getByLabel('Condition detail', { exact: true })).toHaveValue('Dead');
    await expect(saveIt(page)).toBeEnabled();
  });

  test('a save that fell over says so, and the typed words are still there', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', World.gqlError('the write timed out'));
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await panel.getByLabel('Note', { exact: true }).fill('Panel replaced 12 Aug');
    await saveIt(page).click();

    // The opening sentence only: the rest is copy the uncommitted work shortened.
    await expect(panel.getByRole('alert')).toContainText('That feature did not save.');
    await expect(panel.getByLabel('Note', { exact: true })).toHaveValue('Panel replaced 12 Aug');
  });

  test('a feature cannot be saved with its name rubbed out', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    await nameBox(editPanel(page, 'Borewell 1')).fill('   ');
    await expect(saveIt(page)).toBeDisabled();
    expect(world.calls('updateFeature')).toHaveLength(0);
  });

  test('the Save button says it is saving while the answer is still coming', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', World.slow(1200, true));
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await panel.getByLabel('Condition detail', { exact: true }).fill('Dead');
    await saveIt(page).click();

    await expect(panel.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  test('Cancel closes the panel and puts the cursor back on the pencil it came from', async ({ page, world }) => {
    liveLand(world, bore());
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    const panel = editPanel(page, 'Borewell 1');
    await panel.getByLabel('Condition detail', { exact: true }).fill('Dead');
    await panel.getByRole('button', { name: 'Cancel' }).click();

    await expect(panel).toHaveCount(0);
    await expect(cardFor(page, 'Borewell 1').locator('.state.warn')).toHaveText('Watch it');
    await expect(cardFor(page, 'Borewell 1').locator('p.note').filter({ hasText: 'Yield dropped' })).toBeVisible();
    await expect(cardFor(page, 'Borewell 1')).not.toContainText('Dead');
    await expect(pencil(page, 'Borewell 1')).toBeFocused();
    expect(world.calls('updateFeature')).toHaveLength(0);
  });

  test('a refusal on one feature does not follow the pencil onto the next one', async ({ page, world }) => {
    world.set('features', land([
      feat({ id: FEATURE.well, label: 'Open well', category: 'water', condition: 'Working', conditionState: 'good' }),
      feat({ id: FEATURE.fence, label: 'Barbed fence', category: 'boundary', conditionState: 'unknown' }),
    ]));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Open well').click();
    await saveIt(page).click();
    await expect(editPanel(page, 'Open well').getByRole('alert')).toBeVisible();
    await editPanel(page, 'Open well').getByRole('button', { name: 'Cancel' }).click();

    // The panel is unmounted on close, so the next feature's panel starts
    // with nothing to report.
    await pencil(page, 'Barbed fence').click();
    await expect(nameBox(editPanel(page, 'Barbed fence'))).toHaveValue('Barbed fence');
    await expect(editPanel(page, 'Barbed fence').getByRole('alert')).toHaveCount(0);
  });

  test('reopening a panel that was refused does not reopen the refusal with it', async ({ page, world }) => {
    world.set('features', land(bore()));
    world.set('updateFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    await pencil(page, 'Borewell 1').click();
    await saveIt(page).click();
    await expect(editPanel(page, 'Borewell 1').getByRole('alert')).toBeVisible();
    await editPanel(page, 'Borewell 1').getByRole('button', { name: 'Cancel' }).click();

    await pencil(page, 'Borewell 1').click();
    await expect(editPanel(page, 'Borewell 1').getByRole('alert')).toHaveCount(0);
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

    // The shared confirmation, naming the feature and saying what goes with
    // it and what stays (delete_feature deletes the row; photos and costs
    // keep theirs).
    const dialog = removeDialog(page, 'Barbed fence');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Its details, condition and pin are deleted and cannot be brought back.'
      + ' Photos of it stay in Media, and its costs stay in Money.');
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(world.calls('deleteFeature')).toHaveLength(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test('the second press takes it, and the card it was on goes with it', async ({ page, world }) => {
    const rows = liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await removeDialog(page, 'Barbed fence').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deleteFeature').length).toBe(1);
    expect(world.lastVars('deleteFeature')).toMatchObject({ featureId: FEATURE.fence });
    await expect(removeDialog(page, 'Barbed fence')).toHaveCount(0);
    await expect(cardFor(page, 'Barbed fence')).toHaveCount(0);
    await expect(cardFor(page, 'Open well')).toBeVisible();
    expect(rows.map((r) => r.id)).toEqual([FEATURE.well]);
  });

  test('after a feature is gone the keyboard lands on the control that files the next one', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await removeDialog(page, 'Barbed fence').getByRole('button', { name: 'Remove', exact: true }).click();

    // The card that held the pressed control is gone, so focus goes to the one
    // control on this screen that is always there — the header's own button,
    // which is also what the drawer returns focus to.
    await expect(addButton(page)).toBeFocused();
  });

  test('Cancel leaves the card the way it was, with the cursor where it started', async ({ page, world }) => {
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    await removeDialog(page, 'Barbed fence').getByRole('button', { name: 'Cancel' }).click();

    await expect(removeDialog(page, 'Barbed fence')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Remove Barbed fence' })).toBeFocused();
    expect(world.calls('deleteFeature')).toHaveLength(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test('a removal the server refuses keeps the feature, and says so in the confirmation that asked', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    const dialog = removeDialog(page, 'Barbed fence');
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(dialog.getByRole('alert'))
      .toHaveText('That feature could not be removed. Reload the page and try again.');
    // The confirmation stays open: shutting it while the card is still there
    // reads as "Remove does not work".
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
  });

  test('a removal that fell over says the feature is still filed here', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', World.gqlError('the delete never reached the database'));
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    const dialog = removeDialog(page, 'Barbed fence');
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(dialog.getByRole('alert'))
      .toHaveText('That feature could not be removed. It is still filed here.');
    await expect(cardFor(page, 'Barbed fence')).toBeVisible();
  });

  test('a removal in flight says so, and will not take a second press', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', World.slow(1200, true));
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    const dialog = removeDialog(page, 'Barbed fence');
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

    // The shared confirmation's busy word, on the one button that would send
    // it again; the dialog holds until the server has answered.
    await expect(dialog.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await expect(dialog).toHaveAttribute('aria-busy', 'true');
    await expect(dialog).toHaveCount(0);
    expect(world.calls('deleteFeature')).toHaveLength(1);
  });

  test('asking to remove a second time takes back the refusal the first ask got', async ({ page, world }) => {
    world.set('features', land(two()));
    world.set('deleteFeature', false);
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    const dialog = removeDialog(page, 'Barbed fence');
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();

    // The question is being asked again, so the answer to the last one is no
    // longer the answer to anything.
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('while the confirmation is open the page behind it cannot be reached', async ({ page, world }) => {
    // Was "opening the pencil on a card takes back the question the bin
    // asked": the question used to be a pair of buttons inside the card, so a
    // pencil elsewhere could still be pressed. It is a modal now (Dialog.tsx),
    // and the one way out of it is its own Cancel.
    liveLand(world, two());
    await page.goto(featuresUrl(ID.parcel));

    const card = cardFor(page, 'Barbed fence');
    await card.getByRole('button', { name: 'Remove Barbed fence' }).click();
    const dialog = removeDialog(page, 'Barbed fence');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Opening focus lands on Cancel, the safe choice, and Tab stays inside.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await expect(nameBox(editPanel(page, 'Open well'))).toHaveValue('Open well');
    expect(world.calls('deleteFeature')).toHaveLength(0);
  });
});

// ── handing the order flow a job, and buying nothing ───────────────────

/**
 * Nothing on this screen files an order any more.
 *
 * "Ask for a site visit" (then "Ask for a check") used to buy the ₹1,200 site visit from a confirm dialog:
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

/** Whichever shape the site-visit control is wearing — a link when the orders
 *  are known and there is no visit yet, a disabled button while they are not.
 *  Used where a test is about the CONTROL rather than about which of the two
 *  it is. It is named for the catalogue's service, a site visit: "check" on
 *  this tab is the look somebody takes at a feature, not a thing you buy
 *  (design.md § App vocabulary, "Property tabs"). */
const askForVisit = (page: Page) =>
  page.getByRole('link', { name: /^Ask for a site visit/ })
    .or(page.getByRole('button', { name: /^Ask for a site visit/ }));
const visitLink = (page: Page) => page.getByRole('link', { name: /^Ask for a site visit/ });

test.describe('W07 · asking for a site visit', () => {
  test('the price is on the control that asks for one, because a visit costs money', async ({ page }) => {
    await page.goto(featuresUrl(ID.parcel));
    // The catalogue's own price (servicesOffered, site_visit), not a number
    // typed into the page.
    await expect(visitLink(page)).toContainText('₹1,200');
  });

  test('asking for a site visit hands the order flow the land, the service and the brief', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));

    await expect(visitLink(page)).toHaveAttribute('href', ORDER_CHECK);
    // And it is a way in, not a purchase: no question is asked on this screen
    // and no order leaves it.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('following it lands on the step that chooses the work, with the site visit already chosen', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));
    await visitLink(page).click();

    await expect(page).toHaveURL(ORDER_CHECK);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' }))
      .toBeVisible();
    // The land came with it, so the flow never asks which property this is
    // for — and the service came with it, so the tile is already pressed.
    await expect(page.getByRole('button', { name: /^Site visit/ }))
      .toHaveAttribute('aria-pressed', 'true');
    // Title opinion, not Boundary re-survey: the seeded parcel already has a
    // re-survey running (W-2102), and a service already on order is drawn as
    // its open request rather than as a tile that can be pressed.
    await expect(page.getByRole('button', { name: /^Title opinion/ }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('the visit arrives at the questions already told what to look at', async ({ page, world }) => {
    await page.goto(featuresUrl(ID.parcel));
    await visitLink(page).click();
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

    await expect(page.getByRole('link', { name: 'Open the site visit order' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    // Not the order flow under another name: a second paid visit cannot be
    // started from here at all, in either shape.
    await expect(askForVisit(page)).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('while the existing orders are still being read the way in is a button nothing can follow', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto(featuresUrl(ID.parcel));

    // "Looking up", not "Checking": check on this tab means a look on the
    // ground.
    const waiting = page.getByRole('button', { name: 'Looking up your orders…' });
    await expect(waiting).toBeDisabled();
    // The shape matters and not only the greying: a <Link> has no `disabled`,
    // so a class that dims it still navigates on a click, on Enter and on a
    // middle click into a new tab. A real button is refused by the browser.
    await expect(visitLink(page)).toHaveCount(0);
    await waiting.click({ force: true });
    await expect(page).toHaveURL(featuresUrl(ID.parcel));
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('if the orders could not be read at all the page says so and refuses to charge blind', async ({ page, world }) => {
    world.set('orders', World.gqlError('orders are not readable'));
    await page.goto(featuresUrl(ID.parcel));

    // The failure, and why the control beside it is greyed.
    const said = page.getByRole('alert')
      .filter({ hasText: 'Your existing orders did not load, so a site visit cannot be ordered yet.' });
    await expect(said).toBeVisible();

    // Still priced, so nobody reads it as a different offer — but inert, and
    // inert the way the browser enforces rather than the way a stylesheet
    // suggests. A duplicate guard that could not run is not a guard.
    const asked = page.getByRole('button', { name: /^Ask for a site visit/ });
    await expect(asked).toBeDisabled();
    await expect(asked).toContainText('₹1,200');
    await expect(visitLink(page)).toHaveCount(0);
    await asked.click({ force: true });
    await expect(page).toHaveURL(featuresUrl(ID.parcel));
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('Try again on the orders line brings the way into the order flow back', async ({ page, world }) => {
    world.set('orders', World.gqlError('orders are not readable'));
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByRole('button', { name: /^Ask for a site visit/ })).toBeDisabled();

    world.set('orders', []);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(visitLink(page)).toHaveAttribute('href', ORDER_CHECK);
    await expect(page.getByText('Your existing orders did not load')).toHaveCount(0);
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
    await drawer(page).getByLabel('Condition detail', { exact: true }).fill('Dry');
    await fileIt(page).click();
    await expect(drawer(page)).toHaveCount(0);
    await cardFor(page, 'Open well').getByRole('button', { name: 'Edit Open well' }).click();
    await page.getByRole('dialog', { name: 'Edit Open well' }).getByLabel('Condition detail', { exact: true }).fill('Silted');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cardFor(page, 'Open well').getByRole('button', { name: 'Remove Open well' }).click();
    await removeDialog(page, 'Open well').getByRole('button', { name: 'Remove', exact: true }).click();

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

    // The waiting word names what it waits for, the way the failure does
    // ("Site features did not load").
    await expect(page.getByText('Loading site features…')).toBeVisible();
    await expect(addCard(page)).toHaveCount(0);
    await expect(addButton(page)).toBeDisabled();
  });

  test('a read that did not come back says so, and stops offering to file into it', async ({ page, world }) => {
    world.set('features', World.gqlError('the features store is down'));
    await page.goto(featuresUrl(ID.parcel));

    const panel = page.getByRole('alert').filter({ hasText: 'Site features did not load' });
    await expect(panel).toBeVisible();
    // The reason, verbatim, for whoever is being asked "what does it say?"
    await expect(panel).toContainText('the features store is down');
    // And the sentence that stops a failed read reading as a lost record.
    await expect(panel).toContainText('Check your connection and try again.');
    await expect(panel.getByRole('button', { name: 'Try again' })).toBeEnabled();
    // Filing against a record that would not load is not a safe offer, so
    // neither way into the drawer is drawn.
    await expect(addCard(page)).toHaveCount(0);
    await expect(addButton(page)).toHaveCount(0);
  });

  test('Try again on a failed read brings the land back', async ({ page, world }) => {
    world.set('features', World.gqlError('the features store is down'));
    await page.goto(featuresUrl(ID.parcel));
    await expect(page.getByText('Site features did not load')).toBeVisible();

    world.set('features', land([feat({ id: FEATURE.well, label: 'Open well', condition: 'Working' })]));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(cardFor(page, 'Open well')).toBeVisible();
    await expect(page.getByText('Site features did not load')).toHaveCount(0);
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
    await expect(page.getByText('Site features did not load')).toHaveCount(0);
    await expect(cardFor(page, 'Open well')).toBeVisible();
  });

  test('a record with nothing on it offers the first feature instead of an empty grid', async ({ page }) => {
    await page.goto(featuresUrl(ID.plot));

    await expect(page.locator('header.sechead h2')).toHaveText('Site features');
    await expect(summary(page)).toHaveText('0 site features');
    // No feature cards at all, and no dashed invitation either: the header's
    // button is the one way to file the first.
    await expect(cards(page)).toHaveCount(0);
    await expect(addButton(page)).toBeVisible();
    await expect(addCard(page)).toHaveCount(0);
    // The footnote is about cards; with no cards there is nothing for any of
    // its sentences to be about.
    await expect(page.getByText('Changing what a feature is, or the condition it is in, is the pencil'))
      .toHaveCount(0);
  });

  test('an empty hanger stops claiming an order it has no cards to keep', async ({ page }) => {
    // Was a DEFECT: "Worst condition first · every one carries its own pin and
    // its own photos" was drawn outside the loading/failed/loaded branch, over
    // an empty grid. The copy rename dropped both halves of that line from the
    // section head, so it is asserted absent rather than expected to fail.
    await page.goto(featuresUrl(ID.plot));
    await expect(addButton(page)).toBeVisible();
    await expect(page.getByText('Worst condition first')).toHaveCount(0);
  });

  test('a record that is not in the portfolio says that, rather than that it has no features', async ({ page }) => {
    await page.goto(featuresUrl(ID.missing));
    await expect(page.getByRole('heading', { name: "This property isn't in your account" })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Site features' })).toHaveCount(0);
  });

  test('a record whose own read failed never draws the features hanger at all', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(featuresUrl(ID.parcel));

    await expect(page.getByText('This property did not load')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Site features' })).toHaveCount(0);
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

  test('the filter sits above the grid, and its panel fits the glass @phone', async ({ page, world }) => {
    // Was "the chips and the sentence beside them stack rather than squeeze":
    // the sentence left the section head before 28/09/2026 and the chip row
    // became the shared filter, so what is left to hold on a phone is that
    // the filter comes before the cards and its panel stays on screen.
    world.set('features', land([
      feat({ id: 'w-feat-1', label: 'Open well', category: 'water', condition: 'Working' }),
    ]));
    await page.goto(featuresUrl(ID.parcel));

    const trigger = await page.getByRole('button', { name: '+ Filter' }).boundingBox();
    const card = await cardFor(page, 'Open well').boundingBox();
    expect(trigger).not.toBeNull();
    expect(card).not.toBeNull();
    expect(card!.y).toBeGreaterThan(trigger!.y + trigger!.height - 1);

    await openFilter(page);
    const panel = await filterPanel(page).boundingBox();
    expect(panel).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(390 + 1);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
