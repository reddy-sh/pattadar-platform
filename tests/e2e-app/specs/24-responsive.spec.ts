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
 *      including the resize that crosses it live. The rail is fifteen entries
 *      in four named groups — Your land, Shared, Money & help, Account — and
 *      one of the fifteen is not the owner's: W17 dropped "Admin & Ref Data"
 *      and hung the Pattadar desk off Money & help for a platform admin,
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
 *   · /app/shared is 714px wide on a 390px screen. Shared.tsx:86 writes the
 *     two-column track as an INLINE style, which the phone rule at
 *     w360.css:848 cannot beat.
 *   · /app/papers/:id is 496px wide. Reader.tsx:394 writes `7rem
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
 *  now group by group: Your land, Shared, Money & help (the desk hangs off the
 *  end of it), Account. Written out rather than imported: if an entry is
 *  dropped on the way to the phone, a list derived from the same source would
 *  drop it too.
 *
 *  "Admin & Ref Data" is gone from the rail entirely — it pointed at a stub,
 *  and /app/admin is a redirect into the desk now (routes.tsx) — and "Pattadar
 *  desk" is drawn only when `portfolio.isPlatformAdmin`. The sealed world IS an
 *  admin (fixtures/seed.ts:193), so the desk entry is in the drawer in every
 *  test in this file. Fifteen entries, grouped; not one fewer for grouping. */
const SECTIONS = [
  'Dashboard', 'Properties', 'Maps', 'Papers',
  'Shared with me', 'Waiting on you', 'Invitations', 'Families & Groups',
  'Services', 'Wallet', 'Pattadar desk',
  'Notifications', 'Tools', 'Audit Log', 'Profile',
] as const;

/** The four group headings, in the order the rail stacks them. They are not
 *  links and never were: each group is a `role="group"` whose accessible name
 *  is the heading (Shell.tsx), so a reader gets the grouping and `SECTIONS`
 *  above stays a list of destinations. */
const GROUPS = ['Your land', 'Shared', 'Money & help', 'Account'] as const;

const rail = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

/** The hamburger. Its accessible name is the whole point of the fork — "Menu"
 *  on a phone, "Collapse the rail" / "Show the rail" at a desk
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
    await page.goto('/app');
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
    await expect(rail(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  });

  test('every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();

    for (const section of SECTIONS) {
      await expect(
        rail(page).getByRole('link', { name: new RegExp(`^${section.replace(/[&]/g, '\\&')}( \\d+)?$`) }),
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
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();
    // Shell.tsx:118 focuses the first link, so the next Tab walks the menu
    // instead of walking the page underneath it.
    await expect(rail(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused();
  });

  test('while the drawer is shut the next Tab takes me to the search box, not through fifteen links I cannot see @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);

    // The number in this test's name is the thing being skipped, so it is
    // asserted rather than left as prose. Still fifteen after W17: the rail
    // lost "Admin & Ref Data" and gained "Pattadar desk" (Shell.tsx:543).
    await expect(rail(page).getByRole('link')).toHaveCount(15);

    await hamburger(page).focus();
    await page.keyboard.press('Tab');
    // Brand, then the jump box. Never a rail link — that is what `inert` buys.
    // Scoped to the topbar: the rail carries a link whose name also starts with
    // "Pattadar" (the desk, under Money & help), and the wordmark is the one in
    // the bar.
    await expect(
      page.locator('.w360 .topbar').getByRole('link', { name: /^Pattadar/ }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Jump to a parcel, paper, person')).toBeFocused();
  });

  test('Escape shuts the drawer and gives me back the button I opened it with @phone', async ({ page }) => {
    await page.goto('/app');
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
    await page.goto('/app');
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
    await page.goto('/app');
    await settled(page);
    const menu = hamburger(page);
    await menu.click();
    await rail(page).getByRole('link', { name: 'Papers', exact: true }).click();

    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(rail(page)).toHaveAttribute('inert', '');
    // Shell.tsx:108-112 is explicit that only Escape and the scrim put focus
    // back on the hamburger. A link that routed the page and then threw focus
    // to the topbar would take a screen-reader user away from what they asked
    // for, every single time.
    await expect(menu).not.toBeFocused();
  });

  test('the drawer never opens itself — a fresh screen is a screen with the page on it @phone', async ({ page }) => {
    await page.goto('/app/properties');
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
    await page.goto('/app');
    await settled(page);

    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await hamburger(page).click();
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Wallet', exact: true })).toBeVisible();
  });

  test.fail('the drawer holds my Tab key while it is open, instead of walking me into the page behind it @phone', async ({ page }) => {
    // DEFECT. apps/web/src/w360/Shell.tsx:404-437 renders the drawer as a
    // modal surface — a scrim that swallows the click, Escape that closes it,
    // focus moved inside on open (Shell.tsx:118) — and then does not keep
    // focus in it. Nothing is `inert` while it is OPEN: the routed screen
    // underneath stays in the tab order, so Tab off the last entry walks into
    // controls that are behind a black scrim and cannot be seen, and Shift+Tab
    // off the first walks up into the topbar. On a phone that is every control
    // on the screen.
    //
    // This module already owns the remedy: `useFocusTrap` in
    // apps/web/src/w360/Dialog.tsx:50, which PropertyActions.tsx:335 uses for
    // its own drawer. The owner is owed the same hook here — or `inert` on the
    // routed outlet while `navOpen` is true, which is the mirror of the
    // `inert` the drawer already gets when it is shut.
    await page.goto('/app');
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
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();
    await expect(rail(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused();
    await fitsTheScreen(page, 'the dashboard with the drawer open');
  });
});

// ── above 900px: the same button collapses the rail instead ────────────

test.describe('at a desk, the same button does the other thing', () => {
  test.use({ viewport: DESK });

  test('above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);

    const menu = hamburger(page);
    await expect(menu).toHaveAccessibleName('Collapse the rail');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(rail(page)).not.toHaveAttribute('inert', '');

    await menu.click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await expect(menu).toHaveAccessibleName('Show the rail');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Collapsed, not gone: there is no scrim, and every entry is still here.
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0);
    await expect(rail(page).getByRole('link')).toHaveCount(SECTIONS.length);
    await expect(rail(page)).not.toHaveAttribute('inert', '');
  });

  test('a collapsed rail keeps every section one click away and still named @phone', async ({ page }) => {
    await page.goto('/app');
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
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');

    // `w360.rail` is the only piece of shell state the harness does NOT write
    // in an init script, so a reload here proves the app's memory, not the
    // fixture's opinion.
    await page.reload();
    await settled(page);
    await expect(page.locator('.w360')).toHaveAttribute('data-rail', 'hidden');
    await expect(hamburger(page)).toHaveAccessibleName('Show the rail');
  });

  test('narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone', async ({ page }) => {
    await page.goto('/app');
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

  test('900px is still a phone and 901 is not — the button changes its mind on the pixel the stylesheet does @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);

    // `(max-width: 900px)` — Shell.tsx:89 and w360.css:634 have to agree about
    // which side of 900 a window is on, or the drawer slides while the rail is
    // still in the layout.
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(hamburger(page)).toHaveAccessibleName('Menu');
    await expect(rail(page)).toHaveAttribute('inert', '');

    await page.setViewportSize({ width: 901, height: 844 });
    await expect(hamburger(page)).toHaveAccessibleName('Collapse the rail');
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  });

  test('widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

    await page.setViewportSize(DESK);
    // The drawer state is transient and means nothing at this width: the rail
    // is back in the layout, nothing is inert, and the button describes the
    // desktop rail again.
    await expect(rail(page)).not.toHaveAttribute('inert', '');
    await expect(rail(page).getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(hamburger(page)).toHaveAccessibleName(/the rail$/);
    await fitsTheScreen(page, 'the dashboard back at desktop width');
  });
});

// ── the sweep: nothing anywhere takes the page sideways ────────────────

test.describe('nothing takes the page sideways', () => {
  test.use({ viewport: PHONE });

  // `/app/shared` is swept separately, below, because it does not fit.
  //
  // `/app/admin` is still in APP_ROUTES and still resolves — it is a redirect
  // into `/app/desk` now (routes.tsx), so the screen this sweep measures under
  // that name is the desk. The desk has its own six-screen sweep further down;
  // this one holds the old address to the same standard, because six months of
  // bookmarks and screenshots point at it.
  for (const route of APP_ROUTES.filter((r) => r !== '/app/shared')) {
    test(`I can read every word on ${route} without dragging the page sideways @phone`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      await fitsTheScreen(page, route);
    });
  }

  test.fail('I can read every word on /app/shared without dragging the page sideways @phone', async ({ page }) => {
    // DEFECT. apps/web/src/w360/pages/Shared.tsx:86 draws the kit inbox as
    //     <div className="withrail" style={{ gridTemplateColumns: '18rem minmax(0,1fr)' }}>
    // and an inline style beats a stylesheet. w360.css:847-849 already has the
    // phone rule — `@media (max-width: 900px) { .w360 .withrail {
    // grid-template-columns: minmax(0, 1fr) } }` — and it cannot win against
    // that attribute, so the 18rem filter rail keeps its track on a 390px
    // screen and the kit body is pushed out beside it: the document measures
    // 714px and every sentence about the property somebody is selling you is
    // read by dragging the page sideways.
    //
    // What the owner is owed: the same one-column inbox every other screen
    // gives them below 900px. The fix is to move the override into the
    // stylesheet where the media query can reach it — a `.withrail.wide`
    // class carrying `grid-template-columns: 18rem minmax(0,1fr)` beside
    // `.withrail.solo` (w360.css:815-820) — and drop the inline style.
    await page.goto('/app/shared');
    await settled(page);
    await fitsTheScreen(page, '/app/shared');
  });

  for (const hanger of HANGERS) {
    const route = hanger ? `/app/records/${ID.parcel}/${hanger}` : `/app/records/${ID.parcel}`;
    test(`the ${hanger || 'papers'} hanger of a record fits a phone @phone`, async ({ page }) => {
      await page.goto(route);
      await settled(page);
      await fitsTheScreen(page, route);
    });
  }

  test('a service someone is waiting on me for fits a phone @phone', async ({ page }) => {
    await page.goto(`/app/services/${TICKET.needsYou}`);
    await settled(page);
    await fitsTheScreen(page, `/app/services/${TICKET.needsYou}`);
  });

  // The one-service screen draws a different set of blocks in each of its
  // states — a full-width roster on a job nobody is on, a three-button banner
  // on one that has gone quiet, "How it ended" on a closed one — so fitting a
  // phone is a promise each state has to keep on its own. The needsYou state
  // above is the one with deliverables in it; these are the other three.
  for (const [what, id] of [
    ['a service nobody is on yet', TICKET.placed],
    ['a service that has gone quiet', TICKET.quiet],
    ['a service that is finished with', TICKET.closed],
  ] as const) {
    test(`${what} fits a phone @phone`, async ({ page }) => {
      await page.goto(`/app/services/${id}`);
      await settled(page);
      await fitsTheScreen(page, `${what} — /app/services/${id}`);
    });
  }

  test('a shelf of the vault fits a phone @phone', async ({ page }) => {
    await page.goto('/app/papers/shelf/title');
    await settled(page);
    await fitsTheScreen(page, '/app/papers/shelf/title');
  });

  test.fail('reading a deed fits a phone @phone', async ({ page }) => {
    // DEFECT. apps/web/src/w360/pages/Reader.tsx:394 lays the reader out as
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
    await page.goto(`/app/papers/${PAPER.deed}`);
    await settled(page);
    await fitsTheScreen(page, `/app/papers/${PAPER.deed}`);
  });

  test('ordering work against a record fits a phone @phone', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);
    await settled(page);
    await fitsTheScreen(page, `/app/records/${ID.parcel}/order`);
  });

  test('asking someone for work on a record fits a phone @phone', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await settled(page);
    await fitsTheScreen(page, `/app/records/${ID.parcel}/request`);
  });

  test('a record with almost nothing filed against it fits a phone @phone', async ({ page }) => {
    // ID.plot is the unsurveyed one: no ring, no pin, no papers. Empty states
    // are drawn by `Empty boxed`, which has its own fixed heights, so they are
    // worth measuring rather than assuming.
    await page.goto(`/app/records/${ID.plot}`);
    await settled(page);
    await fitsTheScreen(page, `/app/records/${ID.plot}`);
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
    await page.goto('/app/properties');
    await settled(page);
    await expect(page.getByText('Flat 4B, Sai Residency Apartments, Kukatpally Housing Board Colony')).toBeVisible();
    await fitsTheScreen(page, '/app/properties with a long property name');
  });

  test.describe('in the light scheme', () => {
    test.use({ scheme: 'light' });

    test('the light scheme fits a phone exactly as the dark one does @phone', async ({ page }) => {
      await page.goto('/app');
      await settled(page);
      await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'light');
      await fitsTheScreen(page, '/app in the light scheme');

      await page.goto('/app/papers');
      await settled(page);
      await fitsTheScreen(page, '/app/papers in the light scheme');
    });
  });

  test('a URL that matches nothing still fits, and still offers the way back @phone', async ({ page }) => {
    await page.goto('/app/no-such-place');
    await expect(page.getByRole('heading', { name: 'There is no page at that address' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to your dashboard' })).toBeVisible();
    await fitsTheScreen(page, '/app/no-such-place');
  });

  test('a screen that is still loading fits a phone too — a skeleton is not allowed to be wider than the screen @phone', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/app/properties');
    // The skeleton IS the state under test, so `settled` would wait it out.
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
    await fitsTheScreen(page, '/app/properties while it is still loading');
  });

  test('a screen that failed fits a phone — the apology does not run off the side @phone', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(`/app/records/${ID.parcel}`);
    await expect(page.getByText(/could not|not in your portfolio|went wrong/i).first()).toBeVisible();
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
    await page.goto('/app/properties');
    await settled(page);
    await expect(page.getByText(/Nothing in your portfolio yet|Nothing filed yet|Nothing active/)).toBeVisible();
    await fitsTheScreen(page, '/app/properties with nothing in it');
  });
});

// ── what re-flows, and what stays reachable after it has ───────────────

test.describe('what re-flows on a phone', () => {
  test.use({ viewport: PHONE });

  test('the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);

    const jump = page.getByLabel('Jump to a parcel, paper, person');
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
    await page.goto('/app');
    await settled(page);

    await page.getByLabel('Jump to a parcel, paper, person').fill('katragunta');
    const results = page.locator('#w360-jump-results');
    await expect(results).toBeVisible();

    const box = await results.boundingBox();
    expect(box, 'the results panel is not on screen').not.toBeNull();
    expect(Math.round(box!.x), 'the results panel starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width), 'the results panel runs off the right edge')
      .toBeLessThanOrEqual(PHONE.width);

    await page.getByRole('option', { name: /Sy 214\/2/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
  });

  test('the properties grid becomes one card to a row, and every card fits @phone', async ({ page }) => {
    await page.goto('/app/properties');
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
    await page.goto('/app/properties');
    await settled(page);

    // The head's actions wrap onto their own row rather than pushing the
    // document sideways (w360.css:350-361), and the filter chip below them
    // wraps too. Everything the screen offers is still inside the screen.
    // The names are the app's own: the primary button is "Add", not "Add a
    // record" — Properties.tsx:824-828 is emphatic about why.
    for (const name of ['+ Filter', 'Grid', 'List', 'Map', 'Export', 'Add']) {
      const control = page.getByRole('button', { name, exact: true }).first();
      await expect(control, `"${name}" is missing from the phone`).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `"${name}" is not on screen`).not.toBeNull();
      expect(Math.round(box!.x + box!.width), `"${name}" runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
      expect(Math.round(box!.x), `"${name}" starts off the left edge`).toBeGreaterThanOrEqual(0);
    }

    // And the chip actually opens its popover at this width rather than
    // dropping it off the side (w360.css:1073 sizes `.fpop` to the viewport).
    await page.getByRole('button', { name: '+ Filter', exact: true }).click();
    const pop = page.locator('.w360 .fpop');
    await expect(pop).toBeVisible();
    const popBox = await pop.boundingBox();
    expect(Math.round(popBox!.x + popBox!.width)).toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/app/properties with the filter popover open');
  });

  test('the six hangers of a record stay reachable — they scroll in their own strip, not the page @phone', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}`);
    await settled(page);

    const tabs = page.locator('.w360 nav.tabs');
    await expect(tabs).toBeVisible();
    for (const label of ['Papers', 'Features', 'People', 'Services', 'Money', 'Audit']) {
      await expect(tabs.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveCount(1);
    }

    // The strip is the scroller (w360.css:559-564), so the page behind it is
    // not: the last hanger is reachable by scrolling the strip and the
    // document never moves.
    const last = tabs.getByRole('link', { name: /^Audit/ });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await fitsTheScreen(page, 'a record with its hanger strip scrolled to the end');

    await last.click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/history$`));
  });

  test('the vault wall stacks to one shelf a row, and all eight are still a tap away @phone', async ({ page }) => {
    await page.goto('/app/papers');
    await settled(page);

    const shelves = page.locator('.w360 a.shelf');
    await expect(shelves).toHaveCount(SHELVES.length);

    const lefts = new Set<number>();
    for (let i = 0; i < SHELVES.length; i += 1) {
      const box = await shelves.nth(i).boundingBox();
      expect(box, `shelf ${i + 1} is not on screen`).not.toBeNull();
      lefts.add(Math.round(box!.x));
      expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
      expect(box!.height, 'a shelf card is too short to tap').toBeGreaterThanOrEqual(40);
    }
    expect([...lefts], 'the wall is still more than one shelf wide').toHaveLength(1);

    await shelves.first().click();
    await expect(page).toHaveURL(/\/app\/papers\/shelf\//);
  });

  test('a service stacks its story over its rail and keeps the buttons that act on it @phone', async ({ page }) => {
    await page.goto(`/app/services/${TICKET.needsYou}`);
    await settled(page);

    // `.split` is `1fr 22rem` and collapses to one column below 1200px
    // (w360.css:630-633), so the two halves sit one above the other. The
    // redesign keeps the split — the main column and the rail are still two
    // grid children — so this reads the same after it as before it.
    const halves = page.locator('.w360 .split > *');
    const count = await halves.count();
    expect(count, 'the service is built from a two-column split').toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await halves.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
    }
    expect([...lefts], 'the service is still side by side on a phone').toHaveLength(1);

    const keep = page.getByRole('button', { name: /^Accept and file$/ });
    await expect(keep).toBeVisible();
    const box = await keep.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the button that files the work is off the side')
      .toBeLessThanOrEqual(PHONE.width);
  });

  // ── the one-service screen, rebuilt ──────────────────────────────────
  //
  // The redesign (docs/specs/2026-09-14-service-detail.md) moved four blocks
  // between the two columns and hoists one of them to the top, so what a phone
  // reader meets first is now a decision of the screen's rather than an
  // accident of which column a card happened to live in. At 390px `.split` is
  // one column, so source order IS reading order and the three tests below are
  // the whole promise: the order, what leads it, and that none of it takes the
  // page sideways.

  test('a brand-new service leads with who can do it and ends with the reference material @phone', async ({ page }) => {
    // The emptiest job in the system: placed, nobody on it, nothing come back,
    // nothing sent out, nothing set aside (fixtures/seed.ts, TICKET.placed).
    await page.goto(`/app/services/${TICKET.placed}`);
    await settled(page);

    // The last two entries are the rail's, and they are last because the rail
    // falls UNDER the main column at this width. That is the whole point of
    // moving the roster out of it: on a phone, every block with a decision in
    // it comes before the reference material, and the roster is a decision.
    const order = [
      'the service name',
      'the status',
      'Who can do this',
      'What was asked for',
      'What this costs',
      'nothing has come back yet',
      'Everything that happened',
      'nothing has left the building',
      'On this land',
    ];
    expect(await readingOrder(page, [
      ['the service name', page.getByRole('heading', { name: 'Encumbrance certificate', level: 1 })],
      ['the status', page.locator('.w360 main .state')],
      ['Who can do this', page.getByRole('heading', { name: 'Who can do this', level: 2 })],
      ['What was asked for', page.getByRole('heading', { name: 'What was asked for', level: 2 })],
      ['What this costs', page.getByRole('heading', { name: 'What this costs', level: 2 })],
      ['nothing has come back yet', page.getByText(/^Nothing has come back yet\./)],
      ['Everything that happened', page.getByRole('heading', { name: 'Everything that happened', level: 2 })],
      ['nothing has left the building', page.getByText('Nothing has left the building.')],
      ['On this land', page.getByRole('heading', { name: 'On this land', level: 2 })],
    ]), 'the blocks do not arrive in the order the screen is built to be read in').toEqual(order);
  });

  test('the block that is waiting on me is the first thing under the header @phone', async ({ page }) => {
    // Two services, two different blocks waiting on the owner: nobody is on
    // the placed one, so it is the roster; the other has work sitting in it
    // unlooked-at, so it is what came back.
    for (const [id, title] of [
      [TICKET.placed, 'Who can do this'],
      [TICKET.needsYou, 'What came back'],
    ] as const) {
      await page.goto(`/app/services/${id}`);
      await settled(page);

      const first = mainColumn(page).locator('> *').first();
      await expect(
        first.getByRole('heading', { name: title, level: 2 }),
        `"${title}" is not the block at the top of ${id}`,
      ).toBeVisible();

      // One ring, not two. Exactly one thing on the page wears the accent, and
      // it is that block — either the card itself, or, when the block already
      // carries the accept footer, the footer inside it.
      const ring = page.locator('.w360 main .accent');
      await expect(ring, 'more than one block claims to be the one waiting on me')
        .toHaveCount(1);
      expect(
        await page.evaluate(() => {
          const column = document.querySelector('.w360 .split > div.stack');
          const top = column?.firstElementChild;
          const accent = document.querySelector('.w360 main .accent');
          return !!top && !!accent && (top === accent || top.contains(accent));
        }),
        'the accent ring is not on the block at the top of the page',
      ).toBe(true);

      // And the header above it carries no button of its own any more — the
      // kebab is the only control in it, so the first thing a thumb meets
      // after the menu is the block that explains the consequence.
      await expect(page.locator('.w360 .pagehead .btn')).toHaveCount(0);
      await expect(page.locator('.w360 .pagehead .actions button')).toHaveCount(1);
    }
  });

  test('a service that has gone quiet offers all three remedies inside the phone @phone', async ({ page }) => {
    // The banner leads the column on a stalled job, above whatever comes next
    // in it, and it carries three buttons now rather than two — the sentence
    // inside it has promised three remedies for its whole life. Three buttons
    // in a 390px `.row.tight` is where a row either wraps or hangs off the
    // edge, so each one is measured rather than merely found.
    await page.goto(`/app/services/${TICKET.quiet}`);
    await settled(page);

    const banner = page.locator('.w360 .card.alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Nothing has happened for 9 days.');

    for (const name of ['Send it again', 'Take them off this job', 'Cancel this job']) {
      const button = banner.getByRole('button', { name, exact: true });
      await expect(button, `"${name}" is not offered on a job that has gone quiet`).toBeVisible();
      const box = await button.boundingBox();
      expect(Math.round(box!.x), `"${name}" starts off the left edge`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box!.x + box!.width), `"${name}" runs off the right edge`)
        .toBeLessThanOrEqual(PHONE.width);
    }

    // Nothing is promoted on this one — somebody has it and it is funded — so
    // the banner is followed by the plain card that says so.
    const bannerBox = (await banner.boundingBox())!;
    const next = (await page.getByRole('heading', { name: 'What happens next', level: 2 }).boundingBox())!;
    expect(Math.round(next.y), 'the banner is not the first thing in the column')
      .toBeGreaterThan(Math.round(bannerBox.y));
    await fitsTheScreen(page, `/app/services/${TICKET.quiet}`);
  });

  test('the dashboard strip stacks its figures one to a row rather than squeezing five across @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);

    // w360.css:657-659 turns `.strip` from columns into rows below 900px.
    const cells = page.locator('.w360 .strip > *');
    const count = await cells.count();
    expect(count, 'the dashboard draws a strip of figures').toBeGreaterThan(1);
    const lefts = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const box = await cells.nth(i).boundingBox();
      if (!box || box.height === 0) continue;
      lefts.add(Math.round(box.x));
      expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(PHONE.width);
    }
    expect([...lefts], 'the figures are still in columns on a phone').toHaveLength(1);
  });

  test('the list view scrolls its seven columns inside its own card, never taking the page with it @phone', async ({ page }) => {
    await page.goto('/app/properties');
    await settled(page);
    await page.getByRole('button', { name: 'List', exact: true }).click();

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
    await fitsTheScreen(page, '/app/properties in list view');
  });

  test('the map view keeps the whole portfolio inside the screen @phone', async ({ page }) => {
    await page.goto('/app/properties');
    await settled(page);
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    const stage = page.locator('.w360 .pf-stage').first();
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
    // w360.css:3045-3051 gives the stage its own phone height rather than
    // letting it collapse inside a scrolling column.
    expect(box!.height, 'the map has collapsed to nothing on a phone').toBeGreaterThan(200);
    await fitsTheScreen(page, '/app/properties in map view');
  });

  test('the add-a-property drawer takes the whole width of the phone and still fits it @phone', async ({ page }) => {
    await page.goto('/app/properties');
    await settled(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    // `.drawer` is `width: min(26rem, 100vw)` (w360.css:1276) — 26rem is
    // 416px, so on a 390px screen it is the screen.
    expect(Math.round(box!.x)).toBeGreaterThanOrEqual(0);
    expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(PHONE.width);
    await fitsTheScreen(page, '/app/properties with the add drawer open');

    // And the drawer's own controls are reachable, which is the point of a
    // full-width panel rather than a 416px one hanging off the edge.
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('a dialog sits inside the phone rather than over its edges @phone', async ({ page }) => {
    await page.goto('/app');
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
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeInViewport();
    await fitsTheScreen(page, '/app with a dialog open');
  });

  test('a refused write says so inside the phone, not off the side of it @phone', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
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
    await fitsTheScreen(page, '/app with a failure toast up');
  });

  test('the assistant opens on a phone and takes the screen rather than hanging off it @phone', async ({ page }) => {
    // w360.css:665-671 is explicit that the assistant button STAYS on a phone:
    // hiding it left most of this product's users with no route to it at all.
    // So the panel it opens has to work at this width.
    await page.goto('/app');
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

    // The button itself is asserted BEFORE the click: MUI's Modal marks the
    // rest of the document `aria-hidden` while the panel is open, so once it
    // is up the topbar is out of the accessibility tree by design and
    // `getByRole` cannot see it.
  });

  test('the record 360 stacks its map under what it says rather than beside it @phone', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/map`);
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

/** The six screens W17 added under /app/desk (routes.tsx), each with what it
 *  is for. The phrase, not the path, is what goes into the test's name and its
 *  failure message: `/app/desk/jobs/w-tkt-assigned` names a URL, and the thing
 *  that has to fit a phone is a screen. */
const DESK_SCREENS: [string, string][] = [
  ['/app/desk', 'the desk — every job waiting for somebody'],
  [`/app/desk/jobs/${TICKET.assigned}`, 'one job, and the people who could take it'],
  ['/app/desk/associates', 'the roster'],
  [`/app/desk/associates/${SRINIVAS}`, "one associate's own page"],
  ['/app/desk/enrol', 'enrolling somebody'],
  ['/app/desk/coverage', 'who covers what'],
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

  test('the desk is one tap away in the phone drawer, under Money & help where it belongs @phone', async ({ page }) => {
    // The entry is drawn only for a platform admin, and it is the last thing in
    // the third of four groups in a drawer of fifteen — well down a list that
    // scrolls on a 390px screen, which is the first place an entry goes
    // missing. Asserted inside its group, so a desk that drifts into Account
    // or back to the foot of the rail fails here rather than passing quietly.
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();

    const desk = rail(page).getByRole('group', { name: 'Money & help' })
      .getByRole('link', { name: /^Pattadar desk/ });
    await desk.scrollIntoViewIfNeeded();
    await expect(desk).toBeInViewport();
    const box = await desk.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the desk entry runs off the right edge of the drawer')
      .toBeLessThanOrEqual(PHONE.width);

    await desk.click();
    await expect(page).toHaveURL(/\/app\/desk$/);
    await expect(page.getByRole('heading', { name: 'Jobs waiting for somebody' })).toBeVisible();
  });

  test('the five figures over the desk stack one to a row rather than squeezing five across @phone', async ({ page }) => {
    await page.goto('/app/desk');
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
    await expect(page.getByText('Nobody on it', { exact: true }).first()).toBeVisible();
  });

  test('every job on the desk keeps the button that puts somebody on it inside the screen @phone', async ({ page }) => {
    await page.goto('/app/desk');
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
    await fitsTheScreen(page, '/app/desk');
  });

  test('one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone', async ({ page }) => {
    await page.goto(`/app/desk/jobs/${TICKET.assigned}`);
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
    await fitsTheScreen(page, `/app/desk/jobs/${TICKET.assigned}`);
  });

  test('the reason I have to type before taking somebody off a job fits a phone @phone', async ({ page }) => {
    await page.goto(`/app/desk/jobs/${TICKET.assigned}`);
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
    await page.goto('/app/desk/associates');
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
    await fitsTheScreen(page, '/app/desk/associates');
  });

  test('one associate stacks their record over their number, and the number stays inside the screen @phone', async ({ page }) => {
    await page.goto(`/app/desk/associates/${SRINIVAS}`);
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
    await fitsTheScreen(page, `/app/desk/associates/${SRINIVAS} with the number shown`);
  });

  test('the coverage grid scrolls its columns inside its own card, never taking the page with it @phone', async ({ page }) => {
    await page.goto('/app/desk/coverage');
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
    await fitsTheScreen(page, '/app/desk/coverage scrolled to the last column');
  });

  test('enrolling somebody stacks its paired fields into one column on a phone @phone', async ({ page }) => {
    await page.goto('/app/desk/enrol');
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
    const add = page.getByRole('button', { name: 'Add them' });
    await expect(add).toBeVisible();
    const box = await add.boundingBox();
    expect(Math.round(box!.x + box!.width), 'the button that files the person is off the side')
      .toBeLessThanOrEqual(PHONE.width);
    await expect(page.getByText('A name, a number, one kind of work and one place')).toBeVisible();
  });
});

// ── thumbs ─────────────────────────────────────────────────────────────

test.describe('what a thumb has to hit', () => {
  test.use({ viewport: PHONE });

  /**
   * 40px is the floor. It is below Apple's 44pt and below Material's 48dp,
   * deliberately: this is the number the founder would accept, not the number
   * a guideline would like.
   */
  const FLOOR = 40;

  test.fail('the hamburger is big enough to hit with a thumb @phone', async ({ page }) => {
    // DEFECT. apps/web/src/w360/w360.css:221-231 — `.iconbtn` is a fixed
    // `width: 2rem; height: 2rem`, i.e. 32×32px, at every width. On a phone
    // that is the ONLY way to the navigation: the rail is off-canvas and this
    // button is the door. What the owner is owed is a tap target of at least
    // 40px below the drawer breakpoint — the icon can stay 20px, the button
    // around it cannot stay 32. A `@media (max-width: 900px)` rule setting
    // `.w360 .iconbtn { width: 2.5rem; height: 2.5rem }` is the whole fix.
    await page.goto('/app');
    await settled(page);
    const { w, h } = await tapSize(page, hamburger(page));
    expect(Math.min(w, h), `the hamburger is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test.fail('the buttons in the top bar are big enough to hit with a thumb @phone', async ({ page }) => {
    // DEFECT, same cause: apps/web/src/w360/w360.css:221-231. The theme
    // menu and the assistant button are `.iconbtn` too, so all three
    // controls in the bar are 32×32 on the screen where they matter most.
    // w360.css:665-671 already has a `max-width: 640px` block for the topbar;
    // the sizes belong in it.
    await page.goto('/app');
    await settled(page);
    for (const name of ['Change theme', 'Assistant']) {
      const { w, h } = await tapSize(page, page.getByRole('button', { name, exact: true }));
      expect(Math.min(w, h), `"${name}" is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  test.fail('the primary button on a screen is big enough to hit with a thumb @phone', async ({ page }) => {
    // DEFECT. apps/web/src/w360/w360.css:378-395 — `.btn` is
    // `padding: 0.5rem 1rem` over a 0.8125rem face, which measures ~34px tall
    // and never changes below the breakpoint. Every screen's main action is
    // one of these: "Add" here, "Add papers" in the vault, "Accept and file"
    // on a ticket. The owner is owed a phone-width rule that lifts `.btn` to a
    // 40px minimum height (`min-height: 2.5rem`), leaving the desktop metric
    // alone — `.btn` is the same class on both, so it has to be a media rule
    // rather than a new number.
    await page.goto('/app/properties');
    await settled(page);
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeVisible();
    const { w, h } = await tapSize(page, add);
    expect(h, `the primary button on Properties is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test.fail('the button that files a paper is big enough to hit with a thumb @phone', async ({ page }) => {
    // DEFECT, same rule: apps/web/src/w360/w360.css:378-395. Named separately
    // because the vault's primary action is the one a phone is most often
    // opened to press — someone standing in an SRO office with a receipt.
    await page.goto('/app/papers');
    await settled(page);
    const file = page.getByRole('button', { name: 'Add papers', exact: true });
    await expect(file).toBeVisible();
    const { w, h } = await tapSize(page, file);
    expect(h, `the primary button on Papers is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
  });

  test('every entry in the drawer is big enough to hit with a thumb @phone', async ({ page }) => {
    await page.goto('/app');
    await settled(page);
    await hamburger(page).click();

    const links = rail(page).getByRole('link');
    for (let i = 0; i < SECTIONS.length; i += 1) {
      const { w, h } = await tapSize(page, links.nth(i));
      expect(h, `"${SECTIONS[i]}" is ${w}×${h}px`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  test('the scrim beside the drawer is a real target, not a hairline @phone', async ({ page }) => {
    await page.goto('/app');
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
