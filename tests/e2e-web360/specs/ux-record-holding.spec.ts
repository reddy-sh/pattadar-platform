/**
 * UX conformance · every Record tab and every Holding tab, in a real browser.
 *
 * Why this file exists. `design.md:7` makes Google Material 3 the authority for
 * "accessible hierarchy, adaptive layout, expressive shape, purposeful motion,
 * and clear interaction states", and design.md's own "Design authority" section
 * makes accessibility an OUTCOME requirement rather than a quality default.
 * Nothing measured it. The doc that wrote the gates down —
 * `docs/specs/2026-07-26-ux-redesign-m3.md:51` — is marked historical, and the
 * Playwright suite that enforced them (`tests/e2e-ux`) was retired on
 * 2026-09-16. `scripts/ux-guards.ts` has 173 checks but only 8 touch the web,
 * and all 8 are layout/scroll OWNERSHIP read out of source text.
 * `scripts/a11y-web-tests.ts` closed the statically checkable half — accessible
 * names, palette slots, colour literals, unresolved tokens — and said plainly
 * that the rest needs a browser. This is the rest.
 *
 * What a browser can see that source cannot: whether a box is bigger than the
 * drawing inside it, whether a page scrolls sideways at 390px, whether a focus
 * ring is actually painted, whether a heading level is skipped once the real
 * data lands, and how big a control ends up after its padding, font and border
 * resolve.
 *
 * Scope. Both frames that share the tab-strip contract: `/app/records/:id`
 * (nine tabs) and `/app/holdings/:id` (six). The strips are read out of the DOM
 * rather than imported, so this file cannot drift from `TABS` /
 * `HOLDING_TABS`; `ux-guards.ts` already pins those inventories at nine and six.
 *
 * Two of the checks below are expected to FAIL and carry `test.fail()` with the
 * diagnosis, which is this repo's convention for a defect that is recorded
 * rather than softened. They are the dead band under the People chain and the
 * 44px target floor. Do not "fix" them by loosening the assertion.
 *
 * One number is deliberately not asserted yet: filled buttons per region. M3
 * says exactly one, `design.md` agrees, but "region" has no single meaning on
 * these screens and guessing a budget before measuring is how a gate starts
 * lying. The last test prints the counts so the budget can be set from real
 * numbers rather than from an assumption.
 */
import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;
type Req = import('@playwright/test').APIRequestContext;

/** Sy 214/2 — the seeded record that actually has something on every tab:
 *  11 papers, 14 features, owners, photos, notes, services and a money ledger.
 *  A record with empty tabs would pass a layout audit by having no layout. */
const RECORD = 'w360-p-214-2';

/** Two OWNED seeded records, the same pair `holdings.spec.ts` uses: a holding
 *  may only be built from records held outright. */
const MEMBERS = ['Sy 88', 'Sy 331/2'];

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/** Material's own floor is 48dp; the retired gate here said 44x44 and
 *  `apps/ios/design.md:122-137` says 44pt, so 44 is this project's number. */
const TARGET_MIN = 44;

/** What may sit between a viewport instrument's stage and the bottom of the
 *  window: `main`'s `--space-lg` padding plus the card's own `--space-lg`, so
 *  48px and a border. Anything near the old `--space-3xl` (96px) means the
 *  document scrolling room came back. */
const PAGE_FOOT_MAX = 64;

const gql = (request: Req, query: string, variables: Record<string, unknown> = {}) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query, variables } })
    .then((r) => r.json());

/** Holdings this file made, swept whether the test passed or failed — the same
 *  discipline holdings.spec.ts keeps, because screens.spec.ts asserts the
 *  seeded portfolio totals and a holding left behind would break that file
 *  rather than this one. */
const MADE: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of MADE.splice(0)) {
    try {
      await gql(request, 'mutation D($id:String!){ web { deleteCombinedProperty(id:$id) } }', { id });
    } catch {
      // Never worth failing a UX test over; the next run starts clean.
    }
  }
});

async function combine(page: Pg, name: string): Promise<string> {
  await page.goto('/app/properties?view=list');
  await expect(page.locator('table.rectable tbody tr').first()).toBeVisible();
  for (const title of MEMBERS) {
    await page.getByRole('checkbox', { name: `Select ${title}` }).check();
  }
  await page.getByRole('button', { name: 'Combine…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Combine into one holding' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('What do you call it').fill(name);
  await dialog.getByRole('button', { name: /^Combine \d+ records$/ }).click();
  await page.waitForURL(/\/app\/holdings\/cp-/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const id = page.url().split('/app/holdings/')[1].split(/[/?]/)[0];
  MADE.push(id);
  return id;
}

/** Every tab in the frame's own strip, as {label, href}. Read from the DOM on
 *  purpose — see the file header. */
async function tabsOf(page: Pg): Promise<Array<{ label: string; href: string }>> {
  const strip = page.locator('nav.tabs').first();
  await expect(strip).toBeVisible();
  return strip.locator('a').evaluateAll((links) =>
    links.map((a) => ({
      // The count badge lives inside the link, so the label is the first text
      // node rather than textContent.
      label: (a.childNodes[0]?.textContent ?? a.textContent ?? '').trim(),
      href: (a as HTMLAnchorElement).getAttribute('href') ?? '',
    })));
}

/** Land on a tab and wait for the frame to settle. `nav.tabs` proves the shared
 *  frame is drawn; waiting on it stops a lazy chunk being measured mid-arrival. */
async function openTab(page: Pg, href: string): Promise<void> {
  await page.goto(href);
  await expect(page.locator('nav.tabs').first()).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
}

// ── the measurements ───────────────────────────────────────────────────

/** Heading levels in document order, so a skip (h1 → h3) can be named. */
const headingLevels = (page: Pg) =>
  page.locator('main :is(h1,h2,h3,h4,h5,h6)').evaluateAll((hs) =>
    hs.filter((h) => (h as HTMLElement).offsetParent !== null || h.tagName === 'H1')
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').trim().slice(0, 40) })));

/** Controls with no readable text, and whether anything names them. */
const unnamedControls = (page: Pg) =>
  page.locator('main :is(button,a,[role="button"])').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => ((el.textContent ?? '').trim() === ''))
      .filter((el) => !el.getAttribute('aria-label')
        && !el.getAttribute('aria-labelledby')
        && !el.getAttribute('title'))
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '(no class)').toString().split(' ')[0]}`));

/** Visible interactive controls whose smaller side is under the target floor. */
const smallTargets = (page: Pg, min: number) =>
  page.locator('main :is(button,a,input,select,[role="button"])').evaluateAll((els, floor) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          what: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`,
          label: (el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()).slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      // Zero-size elements are not on screen in any meaningful sense; the
      // chain's read-only connection handles are deliberately 1px.
      .filter((m) => m.w > 1 && m.h > 1)
      .filter((m) => Math.min(m.w, m.h) < floor), min);

/** Document-level sideways scroll. The one overflow a phone reader cannot
 *  recover from, and `design.md`'s `minmax(0, Nfr)` rule exists because of it. */
const overflowsSideways = (page: Pg) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });

// ── the suites ─────────────────────────────────────────────────────────

test.describe('every Record tab', () => {
  test.beforeEach(() => { test.slow(); });

  test('draws one main and one h1, and never skips a heading level', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openTab(page, `/app/records/${RECORD}`);
    for (const tab of await tabsOf(page)) {
      await openTab(page, tab.href);
      await expect(page.locator('main'), `${tab.label}: one main landmark`).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 }), `${tab.label}: one h1`).toHaveCount(1);

      const levels = await headingLevels(page);
      const skips = levels.filter((h, i) => i > 0 && h.level - levels[i - 1].level > 1)
        .map((h) => `h${h.level} "${h.text}"`);
      expect(skips, `${tab.label}: a skipped level leaves a screen reader's outline with a hole`)
        .toEqual([]);
    }
  });

  test('never scrolls sideways, at desktop or on a phone', async ({ page }) => {
    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size);
      await openTab(page, `/app/records/${RECORD}`);
      for (const tab of await tabsOf(page)) {
        await openTab(page, tab.href);
        const { scroll, client } = await overflowsSideways(page);
        expect(scroll, `${tab.label} at ${size.width}px: ${scroll} > ${client}`)
          .toBeLessThanOrEqual(client + 1);
      }
    }
  });

  test('names every control that shows only an icon', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openTab(page, `/app/records/${RECORD}`);
    for (const tab of await tabsOf(page)) {
      await openTab(page, tab.href);
      expect(await unnamedControls(page),
        `${tab.label}: an icon with no name is announced as "button"`).toEqual([]);
    }
  });

  test('paints a focus ring the keyboard can see', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openTab(page, `/app/records/${RECORD}`);
    // Tab strip first: it is the frame's own navigation and the first thing a
    // keyboard reaches inside the record.
    const first = page.locator('nav.tabs a').first();
    await first.focus();
    const ring = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineWidth, shadow: s.boxShadow, style: s.outlineStyle };
    });
    const painted = (ring.outline !== '0px' && ring.style !== 'none') || ring.shadow !== 'none';
    expect(painted, `focus ring absent: ${JSON.stringify(ring)}`).toBe(true);
  });
});

test.describe('every Holding tab', () => {
  test.beforeEach(() => { test.slow(); });

  test('draws one main and one h1, and never skips a heading level', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const id = await combine(page, 'UX audit holding');
    await openTab(page, `/app/holdings/${id}`);
    for (const tab of await tabsOf(page)) {
      await openTab(page, tab.href);
      await expect(page.locator('main'), `${tab.label}: one main landmark`).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 }), `${tab.label}: one h1`).toHaveCount(1);

      const levels = await headingLevels(page);
      const skips = levels.filter((h, i) => i > 0 && h.level - levels[i - 1].level > 1)
        .map((h) => `h${h.level} "${h.text}"`);
      expect(skips, `${tab.label}: skipped heading level`).toEqual([]);
    }
  });

  test('never scrolls sideways, at desktop or on a phone', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const id = await combine(page, 'UX audit overflow');
    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size);
      await openTab(page, `/app/holdings/${id}`);
      for (const tab of await tabsOf(page)) {
        await openTab(page, tab.href);
        const { scroll, client } = await overflowsSideways(page);
        expect(scroll, `${tab.label} at ${size.width}px: ${scroll} > ${client}`)
          .toBeLessThanOrEqual(client + 1);
      }
    }
  });

  test('names every control that shows only an icon', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const id = await combine(page, 'UX audit names');
    await openTab(page, `/app/holdings/${id}`);
    for (const tab of await tabsOf(page)) {
      await openTab(page, tab.href);
      expect(await unnamedControls(page), `${tab.label}: unnamed icon control`).toEqual([]);
    }
  });
});

// ── recorded defects ───────────────────────────────────────────────────

test.describe('the stage a viewport instrument actually fills', () => {
  test.beforeEach(() => { test.slow(); });

  test('the People chain stage runs to the bottom of the window', async ({ page }) => {
    // The bottom margin, pinned.
    //
    // The People Chain is a viewport instrument — `design.md` § "A tab declares
    // who owns vertical space", and Record.tsx sets `data-tab-layout="viewport"`
    // for `people`. But `.w360 main` carries `padding-bottom: var(--space-3xl)`
    // (96px) for document scrolling, and the chain never took the exemption
    // `main:has(> .lightbox)` takes for exactly this reason. With a footer note
    // under the views on top of that, the stage stopped roughly 130px short and
    // the page ended in a band of nothing.
    //
    // Founder direction, 2026-09-25: the canvas should go to the bottom. Both
    // causes are gone — the footer note is removed and w360.css now drops this
    // main's bottom padding to `--space-lg`. What is left below the stage is
    // real chrome and nothing else: `--space-lg` of main padding plus the
    // `.ownerchain` card's own `--space-lg`, so 48px and a border.
    //
    // Deliberately NOT asserted here: the slack between the drawing and the
    // bottom of the stage. `alignTop` (OwnerChain.tsx:1067-1091) lifts the graph
    // to the top, and with a full-height stage a short chain leaves that slack
    // below it. Inside a bordered, pannable canvas that reads as stage rather
    // than as page margin, which is the point of the direction above. The number
    // is printed so a later decision to centre the drawing has a baseline.
    await page.setViewportSize(DESKTOP);
    await openTab(page, `/app/records/${RECORD}/people`);

    const canvas = page.locator('.ownerchain-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.ownerchain-node').first()).toBeVisible();

    const m = await page.evaluate(() => {
      const stage = document.querySelector('.ownerchain-canvas');
      const nodes = [...document.querySelectorAll('.ownerchain-node')];
      if (!stage) return null;
      const box = stage.getBoundingClientRect();
      const lowest = nodes.length
        ? Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom))
        : box.bottom;
      return {
        belowStage: Math.round(window.innerHeight - box.bottom),
        stageHeight: Math.round(box.height),
        slackUnderDrawing: Math.round(box.bottom - lowest),
      };
    });

    expect(m, 'measured no chain on screen').not.toBeNull();
    const { belowStage, stageHeight, slackUnderDrawing } = m as NonNullable<typeof m>;
    console.log(`\nPeople chain · stage ${stageHeight}px · ${belowStage}px below it`
      + ` · ${slackUnderDrawing}px of slack under the drawing\n`);

    expect(belowStage,
      'dead page margin under the chain stage — main kept its document scrolling room')
      .toBeLessThanOrEqual(PAGE_FOOT_MAX);
  });

  test('every control on a Record tab clears the 44px target floor', async ({ page }) => {
    // DEFECT — w360.css:540-565 sizes `.btn` at 0.5rem padding over a
    // 0.8125rem font (~36px tall) and `.btn.sm` at 0.3125rem over 0.75rem
    // (~29px). Neither clears 44. The retired gate
    // (`docs/specs/2026-07-26-ux-redesign-m3.md:51`) required 44x44,
    // `apps/ios/design.md:122-137` requires 44pt and the iOS client honours it,
    // and `docs/specs/2026-09-14-web-component-kit-contract.md:1475` puts
    // `minHeight: TOUCH` on the staged kit's controls — so web is the one client
    // that does not.
    //
    // This is a token-level change (`.btn` min-height plus the rows that assume
    // its height), not a per-screen fix, which is why it is recorded here rather
    // than patched alongside a copy edit. The failure message lists offenders so
    // the change can be scoped before it is made.
    test.fail();
    await page.setViewportSize(DESKTOP);
    await openTab(page, `/app/records/${RECORD}`);

    const offenders: string[] = [];
    for (const tab of await tabsOf(page)) {
      await openTab(page, tab.href);
      for (const m of await smallTargets(page, TARGET_MIN)) {
        offenders.push(`${tab.label}: ${m.what} "${m.label}" ${m.w}x${m.h}`);
      }
    }
    expect(offenders.slice(0, 25), `${offenders.length} controls under ${TARGET_MIN}px`).toEqual([]);
  });
});

// ── measured, not yet asserted ─────────────────────────────────────────

test('filled-button counts per region, for the record', async ({ page }) => {
  // M3 principle 1 and `docs/specs/2026-07-26-ux-redesign-m3.md:4`: "Exactly one
  // filled (primary) button per view region." The rule is right and the word
  // "region" is the problem — a page head, a card footer and a rail are all
  // regions, and a budget guessed before measuring is a gate that lies. This
  // prints the counts. When the numbers are agreed, this becomes an assertion
  // and this comment goes away.
  test.slow();
  await page.setViewportSize(DESKTOP);
  await openTab(page, `/app/records/${RECORD}`);
  const counted: string[] = [];
  for (const tab of await tabsOf(page)) {
    await openTab(page, tab.href);
    const n = await page.evaluate(() => ({
      main: document.querySelectorAll('main .btn.primary').length,
      head: document.querySelectorAll('main > header.pagehead .btn.primary').length,
      worstCard: Math.max(0, ...[...document.querySelectorAll('main section.card')]
        .map((c) => c.querySelectorAll('.btn.primary').length)),
    }));
    counted.push(`${tab.label}: main=${n.main} head=${n.head} worstCard=${n.worstCard}`);
  }
  console.log(`\nfilled buttons per region\n  ${counted.join('\n  ')}\n`);
  // The one thing worth failing on today: a region cannot hold five.
  for (const line of counted) {
    const worst = Number(line.match(/worstCard=(\d+)/)?.[1] ?? 0);
    expect(worst, `${line} — a card offering five filled actions has no primary action`)
      .toBeLessThanOrEqual(2);
  }
});
