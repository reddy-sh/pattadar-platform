/**
 * The app on a phone — apps/web/src/w360/Shell.tsx and the breakpoints in
 * apps/web/src/w360/w360.css.
 *
 * Most of this product's owners will only ever open it on a 390px screen, so
 * "does it fit" is not a polish question here, it is the question. This file
 * asserts three things and nothing else:
 *
 *   1. NAVIGATION SURVIVES THE BREAKPOINT. Below 900px the rail leaves the
 *      layout and becomes an off-canvas drawer behind the hamburger
 *      (w360.css:634-653). The failure it replaced was a phone with NO
 *      navigation at all, so every test below is really asking the same
 *      question: is there still a way to every section, and is the way in
 *      still keyboard-reachable, modal and dismissible. Above 900px the very
 *      same button does something else entirely — it collapses the rail in
 *      place (Shell.tsx:184-187) — and that fork is asserted from both sides,
 *      including the resize that crosses it live. The rail is eighteen entries
 *      in named groups — Your portfolio, Shared, Money, Account, Operations,
 *      and Help & resources at the foot — and one is not the owner's: W17 dropped "Admin & Ref
 *      Data", and the Pattadar desk sits in Operations for a platform admin,
 *      which the sealed world is — so the drawer here always carries it, and
 *      the desk's own six screens are asserted below. The groups are counted
 *      here only as the links inside them: `SECTIONS` is the destinations, and
 *      a heading is not a destination.
 *   2. NOTHING TAKES THE PAGE SIDEWAYS. Every route in APP_ROUTES, every
 *      hanger of a record, and all six screens of the Pattadar desk (W17) are
 *      opened at 390px and the DOCUMENT is measured.
 *      A ledger, a seven-column table, a code block or a Leaflet pane is
 *      allowed to scroll inside its own box — `.scroll-x` and `.tabs` exist
 *      for exactly that — so the assertion is on `documentElement.scrollWidth`
 *      and the per-element walk beside it skips anything inside a scroller.
 *      `site.css:21-24` clips horizontal overflow ONLY under `.site`; /app is
 *      deliberately not clipped, so a sideways page here is a real sideways
 *      page and not a stylesheet hiding one.
 *   3. THE THINGS A THUMB HAS TO HIT ARE BIG ENOUGH. 40px is the floor this
 *      file holds the topbar and the primary buttons to.
 *
 * FIVE DEFECTS ARE RECORDED HERE, as seven `test.fail()` scenarios, each with
 * the file, the line and what the owner is owed. They are not softened
 * assertions — each one goes green the day the product is fixed:
 *
 *   · /shared is 714px wide on a 390px screen. Shared.tsx:86 writes the
 *     two-column track as an INLINE style, which the phone rule at
 *     w360.css:848 cannot beat.
 *   · /papers/:id is 496px wide. Reader.tsx:394 writes `7rem
 *     minmax(0,1fr) 24rem` inline and the file has no phone rule at all — only
 *     a print one. Reading a deed is what this product is opened for.
 *   · The drawer is modal in every way but the one that matters: nothing
 *     behind it is `inert`, so Tab walks out of it into controls hidden under
 *     the scrim. This module already ships `useFocusTrap` (Dialog.tsx:50).
 *   · `.iconbtn` is 32×32px at every width (w360.css:221-231), so all three
 *     topbar controls — including the hamburger, which IS the navigation on a
 *     phone — are under the 40px floor.
 *   · `.btn` measures ~34px tall at every width (w360.css:378-395), so every
 *     screen's primary action is under it too.
 *
 * Three things a reader must know before changing anything here.
 *
 *  · EVERY TEST CARRIES `@phone` AND SETS ITS OWN WIDTH. The `phone` project
 *    is `devices['iPhone 14']`, a WebKit device, and the suite is normally run
 *    with `--project=app` (Chromium, 1512px). A responsive test that trusted
 *    the project's viewport would silently assert nothing there, so each
 *    describe below states the width it is about with `test.use({ viewport })`.
 *    That also makes the desktop-side tests honest: they get 1280px in BOTH
 *    projects, so the "above the breakpoint" branch is never run at 390.
 *  · READINESS IS `aria-busy`, NOT A SLEEP. Every skeleton in
 *    w360/skeletons.tsx is a `role="status" aria-busy="true"` wrapper
 *    (skeletons.tsx:79), so "the screen has finished arriving" is one
 *    web-first assertion, and `document.fonts.ready` is awaited after it
 *    because a fallback face measures differently from the real one.
 *  · THE DRAWER IS `inert`, NOT `display:none`. It is closed with
 *    `translateX(-105%)` (w360.css:647) and taken out of the tab order and the
 *    accessibility tree with `inert` (Shell.tsx:408). So "the drawer is shut"
 *    is asserted as the attribute, never as `toBeHidden()` — the links are
 *    still painted, just off the left edge, and Playwright's visibility check
 *    would call them visible.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { APP_ROUTES, HANGERS, ID, PAPER, SHELVES, TICKET } from '../fixtures/ids';
import { CARDS } from '../fixtures/seed';

const PHONE = { width: 390, height: 844 };
/** Comfortably above the 900px drawer breakpoint, and still a laptop. */
const DESK = { width: 1280, height: 900 };

/** Every section the rail carries, in the order the rail draws them — which is
 *  now group by group: Your portfolio, Shared, Money, Account, and Operations
 *  (the desk, for a platform admin only). Written out rather than imported: if an entry is
 *  dropped on the way to the phone, a list derived from the same source would
 *  drop it too.
 *
 *  "Admin & Ref Data" is gone from the rail entirely — it pointed at a stub,
 *  and /admin is no address at all now (routes.tsx) — and "Pattadar
 *  desk" is drawn only when `portfolio.isPlatformAdmin`. The sealed world IS an
 *  admin (fixtures/seed.ts:193), so the desk entry is in the drawer in every
 *  test in this file. Eighteen entries, grouped; Help & resources (Tools,
 *  Pattadar University, Help & support) is pinned to the foot of the rail. */
const SECTIONS = [
  // Holdings is not here: it joins the rail only once the account has a
  // holding (Shell.tsx showHoldings), and the seed has none.
  'Home', 'Properties', 'Families & groups', 'Maps', 'Documents',
  'Shared with me', 'Waiting on you', 'Invitations', 'Invite & earn',
  'Services', 'Wallet',
  // Notifications is a topbar bell beside the assistant now, not a rail entry.
  'Profile', 'Privacy & your data', 'Activity',
  'Pattadar desk',
  'Tools', 'Pattadar University', 'Help & support',
] as const;

/** The group headings, in the order the rail stacks them (Operations only
 *  for a platform admin, which the sealed world is). They are not
 *  links and never were: each group is a `role="group"` whose accessible name
 *  is the heading (Shell.tsx), so a reader gets the grouping and `SECTIONS`
 *  above stays a list of destinations. */
const GROUPS = ['Your portfolio', 'Shared', 'Money', 'Account', 'Operations', 'Help & resources'] as const;

const rail = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

/** The hamburger. Its accessible name is the whole point of the fork — "Menu"
 *  on a phone, "Hide navigation" / "Show navigation" at a desk
 *  (Shell.tsx:219) — so it is addressed by the class it wears instead, and
 *  the name is asserted rather than used. Nothing better exists: the button's
 *  only child is an icon. */
const hamburger = (page: Page) => page.locator('.w360 button.menu-btn');

/** Wait until the screen has actually arrived: no skeleton left standing and
 *  the real face loaded, so a measurement is of the page and not of a
 *  fallback font mid-swap.
 *
 *  Any heading, not an `h1`: a hanger writes its own headline and several of
 *  them use `h2` because the record above already owns the `h1`
 *  (RecordPhotos.tsx:63 is the one that caught this). */
async function settled(page: Page): Promise<void> {
  // The shell first. Every screen here is behind React.lazy (routes.tsx), and
  // while a chunk is downloading the page holds `RouteFallback` — a bare
  // spinner with no heading and no `aria-busy`. Both assertions below are
  // vacuously true of that, so waiting it out has to come first or a cold
  // route races them.
  await expect(page.locator('.w360')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('progressbar', { name: 'Loading' })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

interface Sideways {
  limit: number;
  scrollWidth: number;
  offenders: string[];
}

/**
 * What the document measures, and who is past the right edge.
 *
 * The ASSERTION is on the document: `scrollWidth > clientWidth` is the reader
 * dragging the whole page sideways to read the end of a sentence. The walk
 * beside it only exists to name a culprit in the failure message, and it
 * deliberately skips anything under an element that scrolls or clips its own
 * overflow — a wide table inside `.scroll-x`, the hanger strip inside `.tabs`,
 * Leaflet's translated tile pane — because those are the sanctioned way to be
 * wider than a phone.
 */
async function sideways(page: Page): Promise<Sideways> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    const contained = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible') return true;
        // A fixed layer (the drawer, the scrim, a toast) is painted over the
        // page and adds nothing to the document's scrollable width.
        if (s.position === 'fixed') return true;
      }
      return false;
    };
    const offenders: string[] = [];
    const body = document.querySelector('.w360') ?? document.body;
    for (const el of Array.from(body.querySelectorAll('*'))) {
      if (!el.getClientRects().length) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed') continue;
      const rect = el.getBoundingClientRect();
      if (rect.right <= limit + 1) continue;
      if (contained(el)) continue;
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
      const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.length ? `.${cls.join('.')}` : ''}`;
      offenders.push(`${name} reaches ${Math.round(rect.right)}px · “${(el.textContent ?? '').trim().slice(0, 40)}”`);
      if (offenders.length >= 6) break;
    }
    return { limit, scrollWidth: root.scrollWidth, offenders };
  });
}

/** The one assertion the route sweep is made of. `toPass` rather than a bare
 *  evaluate so a late layout shift retries instead of flaking, and so the
 *  offender list in the message is the one from the final attempt. */
async function fitsTheScreen(page: Page, where: string): Promise<void> {
  await expect(async () => {
    const seen = await sideways(page);
    expect(
      seen.scrollWidth,
      `${where} is ${seen.scrollWidth}px wide inside a ${seen.limit}px screen — the reader has to drag the page sideways. Past the right edge: ${seen.offenders.join(' | ') || '(no single element; a grid track or a min-width on a container)'}`,
    ).toBeLessThanOrEqual(seen.limit + 1);
  }).toPass({ timeout: 8_000 });
}

/** The smallest side of a control's hit area, rounded the way a finger cares. */
async function tapSize(page: Page, locator: ReturnType<Page['locator']>): Promise<{ w: number; h: number }> {
  const box = await locator.boundingBox();
  expect(box, 'the control is not on screen at all').not.toBeNull();
  return { w: Math.round(box!.width), h: Math.round(box!.height) };
}

/** The order a reader actually meets things in, top to bottom.
 *
 *  Measured rather than read off the DOM on purpose: below 1200px `.split`
 *  collapses to one column (w360.css:670-673) and the rail falls UNDER the
 *  main column, so source order and reading order only agree if the collapse
 *  really happened. A y-sort proves both at once, and names what it found when
 *  it disagrees instead of failing on an opaque index. */
async function readingOrder(
  page: Page, blocks: [string, ReturnType<Page['locator']>][],
): Promise<string[]> {
  const seen: { name: string; y: number }[] = [];
  for (const [name, at] of blocks) {
    const box = await at.first().boundingBox();
    expect(box, `"${name}" is not on the screen at all`).not.toBeNull();
    seen.push({ name, y: Math.round(box!.y) });
  }
  return [...seen].sort((a, b) => a.y - b.y).map((b) => b.name);
}

/** The main column of the one-service screen — the half with every decision in
 *  it. `.split`'s first child is the `div.stack`; the rail is the `<aside>`. */
const mainColumn = (page: Page) => page.locator('.w360 .split > div.stack').first();

// ── below 900px: the rail is a drawer ──────────────────────────────────

test.describe('on a 390px screen', () => {
  test.use({ viewport: PHONE });

  test('the rail folds into a drawer and I am never left with no way to get anywhere @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);

    // The rail is still in the document — it has not been deleted, it has been
    // put away. `inert` (Shell.tsx:408) is what keeps it out of the tab order
    // and off a screen reader while it is off-screen.
    await expect(rail(page)).toBeAttached();
    await expect(rail(page)).toHaveAttribute('inert', '');

    const menu = hamburger(page);
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAccessibleName('Menu');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  });

  test('every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();

    for (const section of SECTIONS) {
      await expect(
        // A badge count, or — for Pattadar University — the new-tab warning.
        rail(page).getByRole('link', {
          name: new RegExp(`^${section.replace(/[&]/g, '\\&')}( \\d+| \\(opens in a new tab\\))?$`),
        }),
        `"${section}" must be reachable from the phone drawer`,
      ).toHaveCount(1);
    }
    await expect(rail(page).getByRole('link')).toHaveCount(SECTIONS.length);

    // And the four groups come with them. A phone drawer is where grouping
    // matters most — it is the only width at which the whole rail does not fit
    // on screen at once — so the headings are asserted here rather than at a
    // desk. Each is the name of a `role="group"`, not a link, which is why
    // the count above is unaffected by them.
    for (const group of GROUPS) {
      await expect(
        rail(page).getByRole('group', { name: group }),
        `the drawer must still group its entries under "${group}"`,
      ).toHaveCount(1);
    }
  });

  test('opening the drawer puts my focus inside it rather than behind it @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    // Shell.tsx:118 focuses the first link, so the next Tab walks the menu
    // instead of walking the page underneath it.
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeFocused();
  });

  test('while the drawer is shut the next Tab takes me to the search box, not through nineteen links I cannot see @phone', async ({ page, browserName }) => {
    // WebKit does not put links in the Tab order by default (Safari's
    // "Press Tab to highlight each item" is off), so the iPhone project cannot
    // walk to the logo link at all. The rule is checked at 390px in Chromium.
    test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by default');
    await page.goto('/home');
    await settled(page);

    // The number in this test's name is the thing being skipped, so it is
    // asserted rather than left as prose: fifteen after W17, nineteen once
    // Help & resources, Privacy & your data and Invite & earn joined.
    await expect(rail(page).getByRole('link')).toHaveCount(SECTIONS.length);

    await hamburger(page).focus();
    await page.keyboard.press('Tab');
    // Brand, then the jump box. Never a rail link — that is what `inert` buys.
    // Scoped to the topbar: the rail carries a link whose name also starts with
    // "Pattadar" (the desk, under Operations), and the wordmark is the one in
    // the bar.
    await expect(
      page.locator('.w360 .topbar').getByRole('link', { name: /^Pattadar/ }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Search properties, documents, people')).toBeFocused();
  });

  test('Escape shuts the drawer and gives me back the button I opened it with @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    const menu = hamburger(page);
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(rail(page)).toHaveAttribute('inert', '');
    await expect(menu).toBeFocused();
  });

  test('the dark panel beside the drawer shuts it, and hands the button back too @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    const menu = hamburger(page);
    await menu.click();

    // The scrim covers the width; the drawer sits on the left 17rem of it, so
    // the tap has to land to the right of the drawer to reach the scrim.
    await page.getByRole('button', { name: 'Close menu' }).click({ position: { x: 350, y: 400 } });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(rail(page)).toHaveAttribute('inert', '');
    await expect(menu).toBeFocused();
  });

  test('going somewhere from inside the drawer shuts it behind me and leaves my focus on what loaded @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    const menu = hamburger(page);
    await menu.click();
    await rail(page).getByRole('link', { name: 'Documents', exact: true }).click();

    await expect(page).toHaveURL(/\/papers$/);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(rail(page)).toHaveAttribute('inert', '');
    // Only Escape and the scrim put focus back on the hamburger. A link that
    // routed lands focus on the page that loaded, its heading, so a
    // screen-reader user starts where they asked to go.
    await expect(menu).not.toBeFocused();
    await expect(page.locator('.w360 .body h1')).toBeFocused();
  });

  test('the drawer never opens itself — a fresh screen is a screen with the page on it @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);
    await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(rail(page)).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
  });

  test('a rail I collapsed at my desk does not lock the drawer shut on my phone @phone', async ({ page }) => {
    // The collapse preference is written to localStorage (Shell.tsx:84) and
    // survives onto the phone, where `data-rail="hidden"` means nothing —
    // the rules that read it are scoped above the breakpoint (w360.css:252).
    await page.addInitScript(() => {
      try { window.localStorage.setItem('w360.rail', 'hidden'); } catch { /* private mode */ }
    });
    await page.goto('/home');
    await settled(page);

    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await hamburger(page).click();
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Wallet', exact: true })).toBeVisible();
  });

  test('the drawer holds my Tab key while it is open, instead of walking me into the page behind it @phone', async ({ page }) => {
    // The open drawer is modal: Shell.tsx runs `useFocusTrap` (Dialog.tsx) on
    // it, so Tab off the last entry wraps to the first instead of walking into
    // controls hidden behind the scrim.
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();

    const links = rail(page).getByRole('link');
    await links.nth(SECTIONS.length - 1).focus();
    await page.keyboard.press('Tab');

    const inside = await page.evaluate(() =>
      !!document.activeElement?.closest('nav[aria-label="Sections"], .nav-scrim'));
    expect(inside, 'Tab left the open drawer and landed on the page behind the scrim').toBe(true);
  });

  test('the drawer covers the page rather than shoving it sideways @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeFocused();
    await fitsTheScreen(page, 'the dashboard with the drawer open');
  });
});

// ── above 900px: the same button collapses the rail instead ────────────

test.describe('at a desk, the same button does the other thing', () => {
  test.use({ viewport: DESK });

  test('above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);

    const menu = hamburger(page);
    await expect(menu).toHaveAccessibleName('Hide navigation');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(rail(page)).not.toHaveAttribute('inert', '');

    await menu.click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await expect(menu).toHaveAccessibleName('Show navigation');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Collapsed, not gone: there is no scrim, and every entry is still here.
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
    await expect(rail(page).getByRole('link')).toHaveCount(SECTIONS.length);
    await expect(rail(page)).not.toHaveAttribute('inert', '');
  });

  test('a collapsed rail keeps every section one click away and still named @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');

    // The words are hidden and the icons stay (w360.css:256-257). The name a
    // pointer and a reader get back is the tooltip Shell.tsx:425 sets only
    // while the rail is collapsed.
    const properties = rail(page).getByRole('link', { name: /^Properties/ });
    await expect(properties).toHaveAttribute('title', 'Properties');
    await expect(properties.locator('.lbl')).toBeHidden();
    await expect(rail(page).getByRole('link', { name: /^Wallet/ })).toHaveAttribute('title', 'Wallet');
  });

  test('the collapse is remembered when I come back; the drawer never is @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');

    // `w360.rail` is the only piece of shell state the harness does NOT write
    // in an init script, so a reload here proves the app's memory, not the
    // fixture's opinion.
    await page.reload();
    await settled(page);
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await expect(hamburger(page)).toHaveAccessibleName('Show navigation');
  });

  test('narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');

    // Shell.tsx:89-96 watches the media query rather than sampling it inside
    // the click handler — which is what lets `inert` below depend on it.
    await page.setViewportSize(PHONE);
    await expect(hamburger(page)).toHaveAccessibleName('Menu');
    await expect(rail(page)).toHaveAttribute('inert', '');

    await hamburger(page).click();
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link')).toHaveCount(SECTIONS.length);
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();
  });

  test('599px is still a phone, 600 to 900 is the icon rail, and 901 is the desk — the button changes its mind on the pixel the stylesheet does @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);

    // Shell.tsx's useMedia queries and w360.css's 599/600 blocks have to agree
    // about which side a window is on, or the drawer slides while the rail is
    // still in the layout.
    await page.setViewportSize({ width: 599, height: 844 });
    await expect(hamburger(page)).toHaveAccessibleName('Menu');
    await expect(rail(page)).toHaveAttribute('inert', '');

    // From 600 the rail is in the layout as icons, collapsed until asked.
    await page.setViewportSize({ width: 600, height: 844 });
    await expect(hamburger(page)).toHaveAccessibleName('Show navigation');
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();

    await page.setViewportSize({ width: 901, height: 844 });
    await expect(hamburger(page)).toHaveAccessibleName('Hide navigation');
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  });

  test('widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

    await page.setViewportSize(DESK);
    // The drawer state is transient and means nothing at this width: the rail
    // is back in the layout, nothing is inert, and the button describes the
    // desktop rail again.
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    await expect(hamburger(page)).toHaveAccessibleName(/navigation$/);
    await fitsTheScreen(page, 'the dashboard back at desktop width');
  });
});

// ── the sweep: nothing anywhere takes the page sideways ────────────────

/** Seven groups across every type, for /groups in the sweep. */
function seedManyGroups(world: World) {
  const row = (id: string, type: string, name: string) => ({
    id, ownerUserId: 'u-1', type, name, description: '', myRole: '', landCount: 0, memberCount: 2,
    totalExtent: 0, totalShare: 0, createdAt: '2026-09-01T00:00:00Z', parcelCount: 1, propertyCount: 2,
    headName: 'You', lastActiveAt: '2026-09-20T00:00:00Z', inactivityStage: 'active', inactivityNextAt: '',
    inactivityLastOutcome: '', inactiveContactGaps: 0,
  });
  world.set('root.groups', [
    row('g-own', 'family', 'Telukutla Family'),
    row('g-parents', 'family', 'Telukutla Family (parents) — Markapur and Konakalamitla'),
    row('g-inlaws', 'family', 'Kondapalli Family'),
    row('g-huf', 'huf', 'Telukutla HUF'),
    row('g-firm', 'partnership', 'Reddy & Sons'),
    row('g-trust', 'trust', 'Temple Trust'),
    row('g-flats', 'company', 'Rental flats'),
  ]);
  world.set('root.members', []);
  world.set('root.groupActivity', []);
  world.set('root.notifiers', []);
}

/** Root-schema reads the swept screens make, which fixtures/seed.ts does not
 *  answer yet (each is a logged 400 from the seal otherwise): Home's activity
 *  trail, Tools' three reference lists, Invitations, Invite & earn's referral
 *  summary, and Profile's account row and district list. Empty is enough —
 *  the sweep measures width, and each screen draws its empty state. */
const ROOT_READS = {
  'root.auditTrail': [],
  'root.sroOffices': [],
  'root.feeSchedule': [],
  'root.marketValues': [],
  'root.invitations': [],
  'root.myReferral': {
    code: 'SHANKAR123', path: '/r/SHANKAR123', joined: 0, qualified: 0, creditsEarned: 0,
    monthlyCap: 10, referredBy: '', rewards: [],
  },
  'root.me': {
    id: 'owner', name: 'Shankar Reddy', email: '', address: '', language: 'en',
    districtsOfInterest: '', notificationPrefs: 'email', kycRefMasked: '', mfaEnabled: false,
  },
  'root.districts': [],
};

test.describe('nothing takes the page sideways', () => {
  test.use({ viewport: PHONE });

  // `/shared` is swept separately, below, because it does not fit.
  for (const route of APP_ROUTES.filter((r) => r !== '/shared')) {
    test(`I can read every word on ${route} without dragging the page sideways @phone`, async ({ page, world }) => {
      // Families & groups reads through the root schema, which the seed does
      // not answer. Seven groups, so the phone measures the card grid (the
      // list, Groups.tsx) at its fullest and not an empty state.
      if (route === '/groups') seedManyGroups(world);
      world.setAll(ROOT_READS);
      await page.goto(route);
      await settled(page);
      await fitsTheScreen(page, route);
    });
  }

  test('I can read every word on /shared without dragging the page sideways @phone', async ({ page }) => {
    // Was a DEFECT: an inline `gridTemplateColumns: '18rem minmax(0,1fr)'` on
    // the inbox beat the 900px stacking rule, so the document measured 714px.
    // The width is `.withrail.wide` in w360.css now, beside the breakpoint
    // that overrides it (content-header audit F18).
    await page.goto('/shared');
    await settled(page);
    await fitsTheScreen(page, '/shared');
  });

  for (const hanger of HANGERS) {
    const route = hanger ? `/properties/${ID.parcel}/${hanger}` : `/properties/${ID.parcel}`;
    test(`the ${hanger || 'papers'} hanger of a record fits a phone @phone`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      await fitsTheScreen(page, route);
    });
  }

  test('a service someone is waiting on me for fits a phone @phone', async ({ page }) => {
    await page.goto(`/services/${TICKET.needsYou}`);
    await settled(page);
    await fitsTheScreen(page, `/services/${TICKET.needsYou}`);
  });

  // The one-service screen draws a different set of blocks in each of its
  // states — a full-width roster on a job nobody is on, a three-button banner
  // on one that has gone quiet, "Outcome" on a closed one — so fitting a
  // phone is a promise each state has to keep on its own. The needsYou state
  // above is the one with deliverables in it; these are the other three.
  for (const [what, id] of [
    ['a service nobody is on yet', TICKET.placed],
    ['a service that has gone quiet', TICKET.quiet],
    ['a service that is finished with', TICKET.closed],
  ] as const) {
    test(`${what} fits a phone @phone`, async ({ page }) => {
      await page.goto(`/services/${id}`);
      await settled(page);
      await fitsTheScreen(page, `${what} — /services/${id}`);
    });
  }

  test('a shelf of the vault fits a phone @phone', async ({ page }) => {
    await page.goto('/papers/shelf/title');
    await settled(page);
    await fitsTheScreen(page, '/papers/shelf/title');
  });

  test('reading a deed fits a phone @phone', async ({ page }) => {
    // Was a DEFECT, fixed: Reader.tsx now lays the reader out with a
    // `.rd-grid` class instead of an inline three-track grid, so a stylesheet
    // can stack it on a phone. The write-up it replaced, for the history:
    // apps/web/src/w360/pages/Reader.tsx:394 laid the reader out as
    //     <div className="rd-grid" style={{ gridTemplateColumns: '7rem minmax(0,1fr) 24rem' }}>
    // — a 7rem page strip, the sheet, and a 24rem inspector. That is 496px of
    // fixed track before the scan itself gets a pixel, so on a 390px screen
    // the whole reader is 496px wide and the document drags sideways.
    //
    // There is no phone rule to fix it with, either: the only media query in
    // the file is PRINT_CSS (Reader.tsx:60-70), which stacks the reader for
    // paper and says nothing about a narrow screen, and the columns are an
    // inline style anyway, so a stylesheet could not reach them.
    //
    // What the owner is owed: a phone reader that is the SCAN, with the page
    // strip and the inspector behind controls rather than beside it — the same
    // move w360.css:2612-2618 already makes for the village map (`.vm-body`
    // collapses to one column and the stage takes 56vh). Reading a deed on a
    // phone is the single most common thing this product is opened for.
    await page.goto(`/papers/${PAPER.deed}`);
    await settled(page);
    await fitsTheScreen(page, `/papers/${PAPER.deed}`);
  });

  test('ordering work against a record fits a phone @phone', async ({ page }) => {
    // The one way into ordering (orderHref): the flow with this record chosen,
    // on the services step.
    const href = `/order?for=${ID.parcel}&step=services`;
    await page.goto(href);
    await settled(page);
    await expect(page.getByRole('group', { name: 'Ordering for' })).toBeVisible();
    await fitsTheScreen(page, href);
  });

  test('asking someone for work on a record fits a phone @phone', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await settled(page);
    await fitsTheScreen(page, `/properties/${ID.parcel}/request`);
  });

  test('a record with almost nothing filed against it fits a phone @phone', async ({ page }) => {
    // ID.plot is the unsurveyed one: no ring, no pin, no papers. Empty states
    // are drawn by `Empty boxed`, which has its own fixed heights, so they are
    // worth measuring rather than assuming.
    await page.goto(`/properties/${ID.plot}`);
    await settled(page);
    await fitsTheScreen(page, `/properties/${ID.plot}`);
  });

  test('a property whose name is its whole postal address still fits a phone @phone', async ({ page, world }) => {
    // Not a synthetic 200-character string: this is how a flat in Hyderabad is
    // actually written on a deed, and a card that cannot hold it takes the
    // grid — and the page — sideways with it.
    const long = structuredClone(CARDS.find((c) => c.id === ID.flat)!);
    long.title = 'Flat 4B, Sai Residency Apartments, Kukatpally Housing Board Colony';
    long.subtitle = 'Kukatpally Housing Board Colony, Kukatpally, Medchal-Malkajgiri · 1,450 sft';
    long.placeLine = 'Kukatpally Housing Board Colony, Kukatpally, Medchal-Malkajgiri, Telangana';
    world.set('properties', {
      shown: 1, total: 1, hidden: 0, filterSummary: '', hiddenPlaces: [],
      activeCount: 0, cards: [long], facets: [],
    });
    await page.goto('/properties');
    await settled(page);
    await expect(page.getByText('Flat 4B, Sai Residency Apartments, Kukatpally Housing Board Colony')).toBeVisible();
    await fitsTheScreen(page, '/properties with a long property name');
  });

  test.describe('in the light scheme', () => {
    test.use({ scheme: 'light' });
    // The Dashboard reads the activity trail through the root schema
    // (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer yet;
    // `settled` waits long enough to see the seal's 400 as a console error.
    test.beforeEach(({ world }) => { world.set('root.auditTrail', []); });

    test('the light scheme fits a phone exactly as the dark one does @phone', async ({ page }) => {
      await page.goto('/home');
      await settled(page);
      await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
      await fitsTheScreen(page, '/home in the light scheme');

      await page.goto('/papers');
      await settled(page);
      await fitsTheScreen(page, '/papers in the light scheme');
    });
  });

  test('a URL that matches nothing still fits, and still offers the way back @phone', async ({ page }) => {
    await page.goto('/no-such-place');
    await expect(page.getByRole('heading', { name: 'There is no page at that address' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
    await fitsTheScreen(page, '/no-such-place');
  });

  test('a screen that is still loading fits a phone too — a skeleton is not allowed to be wider than the screen @phone', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/properties');
    // The skeleton IS the state under test, so `settled` would wait it out.
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
    await fitsTheScreen(page, '/properties while it is still loading');
  });

  test('a screen that failed fits a phone — the apology does not run off the side @phone', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(`/properties/${ID.parcel}`);
    await expect(page.getByText(/could not|did not load|not in your portfolio|went wrong/i).first()).toBeVisible();
    await fitsTheScreen(page, 'a record whose query failed');
  });

  test('an empty portfolio fits a phone — so does the sentence that admits it @phone', async ({ page, world }) => {
    // Written out rather than patched: the seeded `properties` answer is a
    // FUNCTION (it filters the five cards by the variables the screen sent),
    // so `seedOf` refuses it and there is no shape to spread.
    world.set('properties', {
      shown: 0, total: 0, hidden: 0, filterSummary: '', hiddenPlaces: [],
      activeCount: 0, cards: [], facets: [],
    });
    await page.goto('/properties');
    await settled(page);
    await expect(page.getByText(/No properties yet|Nothing filed yet|Nothing active/)).toBeVisible();
    await fitsTheScreen(page, '/properties with nothing in it');
  });
});

// ── what re-flows, and what stays reachable after it has ───────────────

test.describe('what re-flows on a phone', () => {
  test.use({ viewport: PHONE });

  test('the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);

    const jump = page.getByLabel('Search properties, documents, people');
    await expect(jump).toBeVisible();
    // w360.css:652 — "the keyboard hint means nothing to a thumb".
    await expect(page.locator('.w360 .search kbd')).toBeHidden();

    // One line: the hamburger, the wordmark, the box and the account all sit
    // at the same height rather than stacking the bar into three rows.
    const bar = await page.locator('.w360 .topbar').boundingBox();
    expect(bar, 'the topbar is not on screen').not.toBeNull();
    expect(bar!.height, 'the topbar has wrapped onto a second row').toBeLessThan(72);
    expect(bar!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('what the jump box finds stays inside the screen and still takes me there @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);

    await page.getByLabel('Search properties, documents, people').fill('katragunta');
    const results = page.locator('#w360-jump-results');
    await expect(results).toBeVisible();

    const box = await results.boundingBox();
    expect(box, 'the results panel is not on screen').not.toBeNull();
    expect(Math.round(box!.x), 'the results panel starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width), 'the results panel runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);

    await page.getByRole('option', { name: /Sy 214\/2/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));
  });

  test('the properties grid becomes one card to a row, and every card fits @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);

    const cards = page.locator('.w360 .cards .rec');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count, 'the seeded portfolio draws five cards').toBeGreaterThan(1);

    // One column: every card shares a left edge, and none is wider than the
    // screen. `.cards` is `repeat(auto-fill, minmax(19rem, 1fr))` (w360.css)
    // and 19rem is 304px, so this is the track actually collapsing rather
    // than two cards being coincidentally narrow.
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await cards.nth(i).boundingBox();
      expect(box).not.toBeNull();
      lefts.add(Math.round(box!.x));
      expect(Math.round(box!.x + box!.width), `card ${i + 1} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }
    expect([...lefts], 'the cards are not in one column').toHaveLength(1);
  });

  test('the controls over the properties grid stay reachable once it has re-flowed @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);

    // Under 600px the head keeps the filled "Add a property" and moves Export
    // into the ⋮; the band keeps + Filter, and the view toggle goes
    // icon-only with each icon keeping its word as its name (design.md §
    // Page head, Phone). Everything the screen offers is inside the screen.
    for (const name of ['+ Filter', 'Grid', 'Table', 'Map', 'More actions for Properties', 'Add a property']) {
      const control = page.getByRole('button', { name, exact: true }).first();
      await expect(control, `"${name}" is missing from the phone`).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `"${name}" is not on screen`).not.toBeNull();
      expect(Math.round(box!.x + box!.width), `"${name}" runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
      expect(Math.round(box!.x), `"${name}" starts off the left edge`).toBeGreaterThanOrEqual(0);
    }

    // Export is one tap into the ⋮, and the menu stays on the screen.
    await page.getByRole('button', { name: 'More actions for Properties' }).click();
    const exportItem = page.getByRole('menuitem', { name: 'Export' });
    await expect(exportItem).toBeVisible();
    const exportBox = (await exportItem.boundingBox())!;
    expect(Math.round(exportBox.x + exportBox.width)).toBeLessThanOrEqual(PHONE.width);
    await page.keyboard.press('Escape');

    // And the chip actually opens its popover at this width rather than
    // dropping it off the side (w360.css:1073 sizes `.fpop` to the viewport).
    await page.getByRole('button', { name: '+ Filter', exact: true }).click();
    const pop = page.locator('.w360 .fpop');
    await expect(pop).toBeVisible();
    const popBox = await pop.boundingBox();
    expect(Math.round(popBox!.x + popBox!.width)).toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/properties with the filter popover open');
  });

  test('the six hangers of a record stay reachable — they scroll in their own strip, not the page @phone', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}`);
    await settled(page);

    const tabs = page.locator('.w360 nav.tabs');
    await expect(tabs).toBeVisible();
    for (const label of ['Documents', 'Site features', 'People', 'Services', 'Money', 'Activity']) {
      await expect(tabs.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveCount(1);
    }

    // The strip is the scroller (w360.css:559-564), so the page behind it is
    // not: the last hanger is reachable by scrolling the strip and the
    // document never moves.
    const last = tabs.getByRole('link', { name: /^Activity/ });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await fitsTheScreen(page, 'a record with its hanger strip scrolled to the end');

    await last.click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}/activity$`));
  });

  test('the Documents controls stay inside the phone, and every one of them is a tap away @phone', async ({ page }) => {
    // The shelf wall is gone: Documents is a file list with folders now
    // (Vault.tsx header), and the eight shelves are the "Type" facet of its
    // filter. What a phone owes the list is its controls — filter, search,
    // sort, layout, a new folder and the way to add — inside the screen.
    // Under 600px the search is an icon that opens a full-width field, and
    // New folder is in the head's ⋮ beside the filled add (design.md § Page
    // head, Phone).
    await page.goto('/papers');
    await settled(page);

    for (const control of [
      page.getByRole('button', { name: '+ Filter' }),
      page.getByRole('button', { name: /^Search documents/ }),
      page.getByRole('button', { name: /^Sort: / }),
      page.getByRole('group', { name: 'View' }),
      page.getByRole('button', { name: 'More actions for Documents' }),
      page.getByRole('button', { name: 'Add documents' }).first(),
    ]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(Math.round(box!.x), `${control} starts off the left edge`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box!.x + box!.width), `${control} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }
    await fitsTheScreen(page, '/papers');

    // The search icon opens a field across the band, still inside the screen.
    await page.getByRole('button', { name: /^Search documents/ }).click();
    const field = page.getByPlaceholder('Search documents');
    await expect(field).toBeFocused();
    const fieldBox = (await field.boundingBox())!;
    expect(Math.round(fieldBox.x + fieldBox.width)).toBeLessThanOrEqual(PHONE.width);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'More actions for Documents' }).click();
    await expect(page.getByRole('menuitem', { name: 'New folder' })).toBeVisible();
    await fitsTheScreen(page, '/papers with its ⋮ open');
  });

  test('a service stacks into one column and keeps the button that acts on it @phone', async ({ page }) => {
    await page.goto(`/services/${TICKET.needsYou}`);
    await settled(page);

    // `.split` is one column below 1200px; Details then sits in the main
    // column above Activity (service order spec §10), so every block shares
    // one left edge.
    const blocks = mainColumn(page).locator('> section');
    const count = await blocks.count();
    expect(count, 'the service is a stack of blocks').toBeGreaterThan(2);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await blocks.nth(i).boundingBox();
      if (box && box.height > 0) lefts.add(Math.round(box.x));
    }
    expect([...lefts], 'the service is still side by side on a phone').toHaveLength(1);

    const keep = page.getByRole('button', { name: /^Accept work$/ });
    await expect(keep).toBeVisible();
    const box = await keep.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the button that files the work is off the side')
      .toBeLessThanOrEqual(PHONE.width);
  });

  // ── the one-service screen (service order spec §10) ──────────────────
  //
  // At 390px the order reads: head, the vertical tracker, the Next step
  // panel, Delivered work when there is any, Details, then Activity. Source
  // order is reading order, so the three tests below are the whole promise.

  test('a brand-new service leads with where it stands and what happens next, and ends with Activity @phone', async ({ page }) => {
    // Placed, nobody on it, nothing held (fixtures/seed.ts, TICKET.placed).
    await page.goto(`/services/${TICKET.placed}`);
    await settled(page);

    const order = ['the service name', 'Order progress', 'Next step', 'Details', 'Activity'];
    expect(await readingOrder(page, [
      ['the service name', page.getByRole('heading', { name: 'Encumbrance certificate', level: 1 })],
      ['Order progress', page.getByRole('list', { name: 'Order progress' })],
      ['Next step', page.locator('section.card.next-step')],
      ['Details', page.getByRole('heading', { name: 'Details', exact: true, level: 2 })],
      ['Activity', page.getByRole('heading', { name: 'Activity', exact: true, level: 2 })],
    ]), 'the blocks do not arrive in the order the screen is built to be read in').toEqual(order);
    // The roster and the desk's tools are not on the owner's page at all.
    await expect(page.getByRole('heading', { name: 'Available providers' })).toHaveCount(0);
    await fitsTheScreen(page, `/services/${TICKET.placed}`);
  });

  test('the block that is waiting on me is the first thing in the column, and holds its one filled button @phone', async ({ page }) => {
    for (const [id, button] of [
      [TICKET.placed, /^Hold ₹1,200$/],
      [TICKET.needsYou, /^Accept work$/],
    ] as const) {
      await page.goto(`/services/${id}`);
      await settled(page);

      const first = mainColumn(page).locator('> *').first();
      await expect(first, `the Next step panel is not the first block of ${id}`).toHaveClass(/next-step/);
      await expect(first.getByRole('button', { name: button })).toHaveClass(/primary/);

      // One ring: the panel, and nothing else, wears the accent.
      const ring = page.locator('.w360 main .accent');
      await expect(ring, 'more than one block claims to be the one waiting on me').toHaveCount(1);
      await expect(ring).toHaveClass(/next-step/);

      // The head has no filled button; on a phone its commands fold into the ⋮.
      await expect(page.locator('.w360 .pagehead .btn')).toHaveCount(0);
      await expect(page.locator('.w360 .pagehead .actions button')).toHaveCount(1);
      // And the panel starts in the top half of an 844px screen.
      expect((await first.boundingBox())!.y, `${id}: the panel starts too low`).toBeLessThan(422);
    }
  });

  test('a service that has gone quiet offers asking for an update inside the phone, and no alert box @phone', async ({ page }) => {
    await page.goto(`/services/${TICKET.quiet}`);
    await settled(page);

    await expect(page.locator('.w360 .card.alert')).toHaveCount(0);
    const panel = page.locator('section.card.next-step');
    await expect(panel).toContainText('No word from your provider · 9 days');
    const ask = panel.getByRole('button', { name: 'Ask for an update', exact: true });
    await expect(ask).toBeVisible();
    const box = (await ask.boundingBox())!;
    expect(Math.round(box.x), '"Ask for an update" starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width), '"Ask for an update" runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);
    // Resend and Remove provider left with the desk; Cancel order is in the ⋮.
    for (const gone of ['Resend', 'Remove provider']) {
      await expect(page.getByRole('button', { name: gone })).toHaveCount(0);
    }
    await fitsTheScreen(page, `/services/${TICKET.quiet}`);
  });

  test('the Overview cards share the phone two by two rather than squeezing four across @phone', async ({ page, world }) => {
    // The 26/09 Home replaced the figure strip with four Overview cards
    // (Dashboard.tsx), so the promise moved with it: no card runs off the
    // side, none is squeezed narrower than a figure, and they are at most two
    // to a row.
    world.set('root.auditTrail', []);
    await page.goto('/home');
    await settled(page);

    const cards = page.getByRole('region', { name: 'Overview', exact: true }).getByRole('link');
    await expect(cards).toHaveCount(4);
    const lefts = new Set<number>();
    for (let i = 0; i < 4; i += 1) {
      const box = await cards.nth(i).boundingBox();
      expect(box, `overview card ${i + 1} is not on screen`).not.toBeNull();
      lefts.add(Math.round(box!.x));
      expect(Math.round(box!.x), `overview card ${i + 1} starts off the left edge`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box!.x + box!.width), `overview card ${i + 1} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
      expect(box!.width, `overview card ${i + 1} is squeezed`).toBeGreaterThanOrEqual(140);
    }
    expect([...lefts].length, 'the cards are more than two to a row on a phone').toBeLessThanOrEqual(2);
    await fitsTheScreen(page, '/home overview');
  });

  test('the list view scrolls its seven columns inside its own card, never taking the page with it @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);
    await page.getByRole('button', { name: 'Table', exact: true }).click();

    // Properties.tsx:1189 gives the table `min-width: 46rem` on purpose — a
    // ledger will not shrink below its content — and parks it in a
    // `.card.scroll-x` (w360.css:740). The card is the scroller; the document
    // must not be.
    const table = page.locator('.w360 table.rectable');
    await expect(table).toBeVisible();
    const scroller = page.locator('.w360 .card.scroll-x').first();
    const box = await scroller.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the card holding the table is itself off the side')
      .toBeLessThanOrEqual(PHONE.width);
    expect(
      await scroller.evaluate((el) => el.scrollWidth > el.clientWidth),
      'the table is not actually overflowing its card, so this proves nothing',
    ).toBe(true);
    await fitsTheScreen(page, '/properties in list view');
  });

  test('the map view keeps the whole portfolio inside the screen @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    const stage = page.locator('.w360 .pf-stage').first();
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
    // w360.css:3045-3051 gives the stage its own phone height rather than
    // letting it collapse inside a scrolling column.
    expect(box!.height, 'the map has collapsed to nothing on a phone').toBeGreaterThan(200);
    await fitsTheScreen(page, '/properties in map view');
  });

  test('the add-a-property drawer takes the whole width of the phone and still fits it @phone', async ({ page }) => {
    await page.goto('/properties');
    await settled(page);
    await page.getByRole('button', { name: 'Add a property', exact: true }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    // `.drawer` is `width: min(26rem, 100vw)` (w360.css:1276) — 26rem is
    // 416px, so on a 390px screen it is the screen.
    expect(Math.round(box!.x)).toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/properties with the add drawer open');

    // And the drawer's own controls are reachable, which is the point of a
    // full-width panel rather than a 416px one hanging off the edge.
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('a dialog sits inside the phone rather than over its edges @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(Math.round(box!.x), 'the dialog starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width), 'the dialog runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);
    // Both answers are on screen and tappable, not stacked off the bottom.
    await expect(page.getByRole('button', { name: 'Dismiss it' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    await fitsTheScreen(page, '/home with a dialog open');
  });

  test('a refused write says so inside the phone, not off the side of it @phone', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/home');
    await settled(page);
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();

    const toast = page.getByRole('alert');
    await expect(toast).toContainText('That item could not be saved. Nothing has changed.');
    const box = await toast.boundingBox();
    expect(Math.round(box!.x), 'the toast starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width), 'the toast runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);
    await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toBeInViewport();
    await fitsTheScreen(page, '/home with a failure toast up');
  });

  test('the assistant opens on a phone and takes the screen rather than hanging off it @phone', async ({ page, world }) => {
    // w360.css:665-671 is explicit that the assistant button STAYS on a phone:
    // hiding it left most of this product's users with no route to it at all.
    // So the panel it opens has to work at this width.
    //
    // The rebuilt panel reads its history, capabilities, usage and models the
    // moment it opens; the seal answers the assistant 503 (not running), and
    // each refusal is a console error. Answered here as a running service, so
    // what is measured is the working panel and not its outage notice.
    world.route(/\/assistant\/api\/capabilities/, () => ({ json: { public_records: { ready: false, status: 'off' } } }));
    world.route(/\/assistant\/api\/conversations/, () => ({ json: { conversations: [] } }));
    world.route(/\/assistant\/api\/usage/, () => ({ json: { today_usd: 0, month_usd: 0, requests_today: 0, credit_status: 'ok', balance_usd: null } }));
    world.route(/\/assistant\/api\/models/, () => ({ json: { default: '', models: [] } }));
    await page.goto('/home');
    await settled(page);
    const button = page.getByRole('button', { name: 'Assistant', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();

    const panel = page.locator('.MuiDrawer-paper').first();
    await expect(panel).toBeVisible();
    // MUI slides the panel in over ~225ms and `toBeVisible` is true from the
    // first frame of that, so the measurement has to wait for it to land
    // rather than catch it mid-slide.
    await expect(async () => {
      const box = await panel.boundingBox();
      // AssistantPanel.tsx:217 — `width: { xs: '100%', sm: 380 }`, and MUI's
      // `xs` runs to 600px, so a 390px screen gets the whole width.
      expect(Math.round(box!.width)).toBe(PHONE.width);
      expect(Math.round(box!.x), 'the assistant is still hanging off the right edge').toBe(0);
    }).toPass({ timeout: 5_000 });
    // And the box to type in is inside it.
    const composer = page.getByLabel('Message the Pattadar Assistant');
    await expect(composer).toBeVisible();
    const cbox = await composer.boundingBox();
    expect(Math.round(cbox!.x + cbox!.width), 'the box to type in runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);

    // The button itself is asserted BEFORE the click: MUI's Modal marks the
    // rest of the document `aria-hidden` while the panel is open, so once it
    // is up the topbar is out of the accessibility tree by design and
    // `getByRole` cannot see it.
  });

  test('the record 360 stacks its map under what it says rather than beside it @phone', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/location`);
    await settled(page);

    const halves = page.locator('.w360 .split > *');
    const count = await halves.count();
    expect(count).toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await halves.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
    }
    expect([...lefts], 'the boundary screen is still side by side on a phone').toHaveLength(1);
    await fitsTheScreen(page, 'the boundary hanger');
  });
});

// ── the desk: six operator screens, on the operator's phone ────────────

/** G. Srinivas, the surveyor the sealed roster is built around and the one
 *  associate on it who can take another job. `ids.ts` is the cast for the
 *  OWNER's world — six records, eight papers, nine tickets — and the desk's
 *  roster is not in it, so this id is read off fixtures/seed.ts:834-876 rather
 *  than invented. */
const SRINIVAS = 'as-ravi';

/** The six screens W17 added under /desk (routes.tsx), each with what it
 *  is for. The phrase, not the path, is what goes into the test's name and its
 *  failure message: `/desk/jobs/w-tkt-assigned` names a URL, and the thing
 *  that has to fit a phone is a screen. */
const DESK_SCREENS: [string, string][] = [
  ['/desk', 'the desk — every job waiting for somebody'],
  [`/desk/jobs/${TICKET.assigned}`, 'one job, and the people who could take it'],
  ['/desk/associates', 'the roster'],
  [`/desk/associates/${SRINIVAS}`, "one associate's own page"],
  ['/desk/enrol', 'enrolling somebody'],
  ['/desk/coverage', 'who covers what'],
];

/**
 * The Pattadar desk is the densest thing in this product and the one screen
 * whose reader is NOT the owner: a five-figure strip, a roster of people, and
 * a coverage grid that is nine disciplines wide. It is mounted inside the same
 * shell as everything else on purpose (routes.tsx), which means it is inside
 * the same breakpoint — and the operator running it is at least as likely to
 * be standing in an SRO office with a phone as sitting at a desk.
 *
 * The sealed world is a platform admin (fixtures/seed.ts:193), so every one of
 * these screens draws for real here rather than falling through to
 * `NotTheDesk` (Desk.tsx:118).
 */
test.describe('the desk on a phone', () => {
  test.use({ viewport: PHONE });

  for (const [route, what] of DESK_SCREENS) {
    test(`I can run the desk from a phone: ${what} does not drag the page sideways @phone`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      await fitsTheScreen(page, `${route} — ${what}`);
    });
  }

  test('the desk is one tap away in the phone drawer, under Operations where it belongs @phone', async ({ page }) => {
    // The entry is drawn only for a platform admin, in its own Operations group
    // at the foot of a drawer of fifteen — well down a list that scrolls on a
    // 390px screen, which is the first place an entry goes missing. Asserted
    // inside its group, so a desk that drifts back into Money or into Account
    // fails here rather than passing quietly.
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();

    const desk = rail(page).getByRole('group', { name: 'Operations' })
      .getByRole('link', { name: /^Pattadar desk/ });
    await desk.scrollIntoViewIfNeeded();
    await expect(desk).toBeInViewport();
    const box = await desk.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the desk entry runs off the right edge of the drawer')
      .toBeLessThanOrEqual(PHONE.width);

    await desk.click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByRole('heading', { name: 'Pattadar desk', level: 1 })).toBeVisible();
  });

  test('the five figures over the desk stack one to a row rather than squeezing five across @phone', async ({ page }) => {
    await page.goto('/desk');
    await settled(page);

    // Desk.tsx:305-319 draws a `.strip` cell for each figure above zero, and
    // the seeded desk has all five: 2 waiting, 1 ageing, 1 silent, 1 stuck,
    // 2 people taking work. w360.css:697-699 turns the strip from columns into
    // rows below 900px — five 78px columns is five unreadable figures.
    const cells = page.locator('.w360 .strip > *');
    await expect(cells).toHaveCount(5);
    const lefts = new Set<number>();
    for (let i = 0; i < 5; i += 1) {
      const box = await cells.nth(i).boundingBox();
      expect(box, `figure ${i + 1} is not on screen`).not.toBeNull();
      lefts.add(Math.round(box!.x));
      expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
    }
    expect([...lefts], 'the desk figures are still in columns on a phone').toHaveLength(1);
    await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible();
  });

  test('every job on the desk keeps the button that puts somebody on it inside the screen @phone', async ({ page }) => {
    await page.goto('/desk');
    await settled(page);

    // Two jobs with nobody on them and one that has gone quiet (seed.ts
    // DESK_JOBS), drawn as `.rows.boxed` inside a card. w360.css:831-839 lets
    // the row's actions wrap under the title rather than pushing the page.
    const rows = page.locator('.w360 .rows.boxed > *');
    const count = await rows.count();
    expect(count, 'the seeded desk has jobs on it').toBeGreaterThan(1);
    for (let i = 0; i < count; i += 1) {
      const box = await rows.nth(i).boundingBox();
      expect(box, `job row ${i + 1} is not on screen`).not.toBeNull();
      expect(Math.round(box!.x + box!.width), `job row ${i + 1} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }

    // The one control that matters on this screen: the way from a job nobody
    // is on to the person who will take it.
    const find = page.getByRole('link', { name: 'Find someone' }).first();
    await expect(find).toBeVisible();
    const fbox = await find.boundingBox();
    expect(Math.round(fbox!.x + fbox!.width), 'the button that finds somebody is off the side')
      .toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/desk');
  });

  test('one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone', async ({ page }) => {
    await page.goto(`/desk/jobs/${TICKET.assigned}`);
    await settled(page);

    // DeskJob.tsx:212 is a `.split` — the roster beside a 22rem aside — and it
    // collapses to one column below 1200px (w360.css:670-673).
    const halves = page.locator('.w360 .split > *');
    const count = await halves.count();
    expect(count, 'the job screen is built from a two-column split').toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await halves.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
    }
    expect([...lefts], 'the job is still side by side on a phone').toHaveLength(1);

    // G. Srinivas is already on this job (seed.ts DESK_JOBS), so the roster row
    // says so rather than offering him again, and the aside carries the one
    // control that takes him off it.
    await expect(page.getByText('On this job', { exact: true })).toBeVisible();
    const off = page.getByRole('button', { name: 'Take them off this job' });
    await expect(off).toBeVisible();
    const box = await off.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the button that takes somebody off is off the side')
      .toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, `/desk/jobs/${TICKET.assigned}`);
  });

  test('the reason I have to type before taking somebody off a job fits a phone @phone', async ({ page }) => {
    await page.goto(`/desk/jobs/${TICKET.assigned}`);
    await settled(page);
    await page.getByRole('button', { name: 'Take them off this job' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(Math.round(box!.x), 'the dialog starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width), 'the dialog runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);
    // Both the box the reason goes in and the button it unlocks are on screen:
    // Desk.tsx:151-218 holds the button until something is typed, which is only
    // a rule and not a trap if a thumb can reach both.
    await expect(page.getByLabel('Why are they coming off')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Take them off', exact: true })).toBeInViewport();
    await fitsTheScreen(page, 'the desk with the take-them-off dialog open');
  });

  test('the roster keeps every person, what they do and the way into their page inside the screen @phone', async ({ page }) => {
    await page.goto('/desk/associates');
    await settled(page);

    const rows = page.locator('.w360 .rows.boxed > *');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      const box = await rows.nth(i).boundingBox();
      expect(box, `roster row ${i + 1} is not on screen`).not.toBeNull();
      expect(Math.round(box!.x + box!.width), `roster row ${i + 1} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }

    // The filter bar over it wraps rather than scrolling: the search box is
    // 15rem wide (DeskAssociates.tsx:157) inside a 390px screen, with chips
    // and a tally beside it.
    const bar = page.locator('.w360 .filterbar');
    const barBox = await bar.boundingBox();
    expect(Math.round(barBox!.x + barBox!.width), 'the filter bar runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);

    const open = page.getByRole('link', { name: 'Open', exact: true }).first();
    const box = await open.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the way into a person’s page is off the side')
      .toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/desk/associates');
  });

  test('one associate stacks their record over their number, and the number stays inside the screen @phone', async ({ page }) => {
    await page.goto(`/desk/associates/${SRINIVAS}`);
    await settled(page);
    await expect(page.getByRole('heading', { name: 'G. Srinivas', level: 1 })).toBeVisible();

    // DeskAssociate.tsx:663 is the same `.split` the job screen uses: what they
    // do and their papers on the left, how to reach them on the right. And the
    // head above it is `flex-wrap: nowrap` (DeskAssociate.tsx:639) so the
    // avatar cannot drop under the name — which is exactly the kind of row
    // that takes a 390px page sideways if the name beside it cannot shrink.
    const halves = page.locator('.w360 .split > *');
    const count = await halves.count();
    expect(count, "the associate's page is built from a two-column split").toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await halves.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
    }
    expect([...lefts], 'the associate is still side by side on a phone').toHaveLength(1);

    // The number is the reason this page is opened on a phone. It is masked
    // until somebody asks for it (DeskAssociate.tsx:542), and what comes back
    // has to be inside the screen rather than off the right of a 22rem aside.
    await page.getByRole('button', { name: 'Show the number' }).click();
    const number = page.getByRole('link', { name: '9848012345' });
    await expect(number).toBeVisible();
    const box = await number.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the number runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, `/desk/associates/${SRINIVAS} with the number shown`);
  });

  test('the coverage grid scrolls its columns inside its own card, never taking the page with it @phone', async ({ page }) => {
    await page.goto('/desk/coverage');
    await settled(page);

    // DeskCoverage.tsx:132 gives the grid `min-width: 52rem` on purpose — a
    // place, nine disciplines and a sentence will not shrink into 390px — and
    // parks it in a `.card.scroll-x` (w360.css:780). The card is the scroller;
    // the document must not be.
    const table = page.locator('.w360 table.rectable');
    await expect(table).toBeVisible();
    const scroller = page.locator('.w360 .card.scroll-x').first();
    const box = await scroller.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the card holding the grid is itself off the side')
      .toBeLessThanOrEqual(PHONE.width);
    expect(
      await scroller.evaluate((el) => el.scrollWidth > el.clientWidth),
      'the grid is not actually overflowing its card, so this proves nothing',
    ).toBe(true);

    // And the far end of it is reachable by scrolling the card rather than the
    // page: the last column is the one that says where the gap is.
    await table.locator('th', { hasText: 'Where the gap is' }).scrollIntoViewIfNeeded();
    await fitsTheScreen(page, '/desk/coverage scrolled to the last column');
  });

  test('ticking two places turns the coverage footer into their sum and offers Export @phone', async ({ page }) => {
    await page.goto('/desk/coverage');
    await settled(page);
    await page.getByRole('checkbox', { name: 'Select Markapur' }).check();
    await page.getByRole('checkbox', { name: 'Select Hyderabad' }).check();
    const foot = page.locator('.w360 table.rectable tfoot tr');
    await expect(foot.locator('th')).toHaveText('2 states selected');
    await expect(foot).toContainText('4 records');
    const bar = page.getByRole('group', { name: 'Act on the selected states' });
    await expect(bar.getByRole('status')).toHaveText('2 states selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  test('enrolling somebody stacks its paired fields into one column on a phone @phone', async ({ page }) => {
    await page.goto('/desk/enrol');
    await settled(page);

    // DeskEnrol.tsx:168 and :181 pair the name with the firm, and the number
    // with how work is sent to it, in `.two` — 1.55fr beside 1fr, and one
    // column below 1200px (w360.css:671).
    const fields = page.locator('.w360 .two > *');
    const count = await fields.count();
    expect(count, 'the form pairs its fields at a desk').toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await fields.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
      expect(Math.round(box.x + box.width), `field ${i + 1} runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }
    expect([...lefts], 'the fields are still paired on a phone').toHaveLength(1);

    // The thing the form is for, still inside the screen at the bottom of it.
    // It is held until the four things an offer needs have been typed
    // (DeskEnrol.tsx:311-314), and the sentence saying so must be on screen with
    // it rather than wrapped off the side.
    const add = page.getByRole('button', { name: 'Add the member' });
    await expect(add).toBeVisible();
    const box = await add.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the button that files the person is off the side')
      .toBeLessThanOrEqual(PHONE.width);
    await expect(page.getByText(
      'Add their name, contact, full address, one kind of work and one coverage area.')).toBeVisible();
  });
});

// ── thumbs ─────────────────────────────────────────────────────────────

test.describe('what a thumb has to hit', () => {
  test.use({ viewport: PHONE });

  /**
   * 44px is the floor: Apple's 44pt and the web's usual target size.
   */
  const FLOOR = 44;

  test('the hamburger is big enough to hit with a thumb @phone', async ({ page, isMobile }) => {
    // A thumb is on a touch screen: w360.css's `(pointer: coarse)` block sizes
    // these for it. A desktop window narrowed to 390px keeps pointer-sized ones.
    test.skip(!isMobile, 'touch-target sizes apply to touch screens only');
    // Was a defect, fixed by the `(pointer: coarse)` block in w360.css: apps/web/src/w360/w360.css:221-231 — `.iconbtn` is a fixed
    // `width: 2rem; height: 2rem`, i.e. 32×32px, at every width. On a phone
    // that is the ONLY way to the navigation: the rail is off-canvas and this
    // button is the door. What the owner is owed is a tap target of at least
    // 40px below the drawer breakpoint — the icon can stay 20px, the button
    // around it cannot stay 32. A `@media (max-width: 900px)` rule setting
    // `.w360 .iconbtn { width: 2.5rem; height: 2.5rem }` is the whole fix.
    await page.goto('/home');
    await settled(page);
    const { w, h } = await tapSize(page, hamburger(page));
    expect(Math.min(w, h), `the hamburger is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test('the buttons in the top bar are big enough to hit with a thumb @phone', async ({ page, isMobile }) => {
    // A thumb is on a touch screen: w360.css's `(pointer: coarse)` block sizes
    // these for it. A desktop window narrowed to 390px keeps pointer-sized ones.
    test.skip(!isMobile, 'touch-target sizes apply to touch screens only');
    // Was a defect (same cause, same fix): apps/web/src/w360/w360.css:221-231. The theme
    // menu and the assistant button are `.iconbtn` too, so all three
    // controls in the bar are 32×32 on the screen where they matter most.
    // w360.css:665-671 already has a `max-width: 640px` block for the topbar;
    // the sizes belong in it.
    await page.goto('/home');
    await settled(page);
    for (const name of ['Change theme', 'Assistant']) {
      const { w, h } = await tapSize(page, page.getByRole('button', { name, exact: true }));
      expect(Math.min(w, h), `"${name}" is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  test('the primary button on a screen is big enough to hit with a thumb @phone', async ({ page, isMobile }) => {
    // A thumb is on a touch screen: w360.css's `(pointer: coarse)` block sizes
    // these for it. A desktop window narrowed to 390px keeps pointer-sized ones.
    test.skip(!isMobile, 'touch-target sizes apply to touch screens only');
    // Was a defect, fixed by the `(pointer: coarse)` block in w360.css: apps/web/src/w360/w360.css:378-395 — `.btn` is
    // `padding: 0.5rem 1rem` over a 0.8125rem face, which measures ~34px tall
    // and never changes below the breakpoint. Every screen's main action is
    // one of these: "Add" here, "Add documents" in the vault, "Accept and file"
    // on a ticket. The owner is owed a phone-width rule that lifts `.btn` to a
    // 40px minimum height (`min-height: 2.5rem`), leaving the desktop metric
    // alone — `.btn` is the same class on both, so it has to be a media rule
    // rather than a new number.
    await page.goto('/properties');
    await settled(page);
    const add = page.getByRole('button', { name: 'Add a property', exact: true });
    await expect(add).toBeVisible();
    const { w, h } = await tapSize(page, add);
    expect(h, `the primary button on Properties is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test('the button that files a paper is big enough to hit with a thumb @phone', async ({ page, isMobile }) => {
    // A thumb is on a touch screen: w360.css's `(pointer: coarse)` block sizes
    // these for it. A desktop window narrowed to 390px keeps pointer-sized ones.
    test.skip(!isMobile, 'touch-target sizes apply to touch screens only');
    // Was a defect (same rule, same fix): apps/web/src/w360/w360.css:378-395. Named separately
    // because the vault's primary action is the one a phone is most often
    // opened to press — someone standing in an SRO office with a receipt.
    await page.goto('/papers');
    await settled(page);
    const file = page.getByRole('button', { name: 'Add documents', exact: true });
    await expect(file).toBeVisible();
    const { w, h } = await tapSize(page, file);
    expect(h, `the primary button on Papers is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test('every entry in the drawer is big enough to hit with a thumb @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();

    const links = rail(page).getByRole('link');
    for (let i = 0; i < SECTIONS.length; i += 1) {
      const { w, h } = await tapSize(page, links.nth(i));
      expect(h, `"${SECTIONS[i]}" is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  test('the scrim beside the drawer is a real target, not a hairline @phone', async ({ page }) => {
    await page.goto('/home');
    await settled(page);
    await hamburger(page).click();

    const scrim = page.getByRole('button', { name: 'Close menu' });
    const box = await scrim.boundingBox();
    expect(box, 'there is no scrim beside the open drawer').not.toBeNull();
    // It covers everything under the topbar (w360.css:207-213), so the part
    // of it that is not behind the drawer is comfortably tappable.
    expect(Math.round(box!.width)).toBe(PHONE.width);
    expect(box!.height).toBeGreaterThan(PHONE.height / 2);
  });
});
