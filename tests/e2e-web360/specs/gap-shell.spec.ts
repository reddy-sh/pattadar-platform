/**
 * The shell, the seven undrawn stubs, and the previous app behind them.
 *
 * W01–W15 drew fifteen screens. The other seven sections of the rail — groups,
 * invitations, notifications, tools, audit, admin, profile — were left as a
 * card that says "Not yet redrawn" and one link into `/legacy/*`, the previous
 * app, still mounted one route over. That whole half of the product has never
 * been rendered by a test: `grep -rn "/legacy" specs/` returns nothing but a
 * prose comment at crud.spec.ts:221, and screens.spec.ts:2282 walks the rail
 * asserting only that an `h1, h2` is visible — it paints each stub and never
 * touches the one control on it.
 *
 * So this file walks the door nobody opened, plus the two topbar controls that
 * sit outside `main` and therefore outside the dead-control sweeps in
 * crud-360.spec.ts:1116 (`main button:not([disabled])`, scoped deliberately):
 *
 *   · Every "Open <Title>" link, all seven, actually reaching a legacy screen.
 *     Six of the seven legacy pages render the SAME h1 as the stub in front of
 *     them, so the URL plus a legacy-shell-only marker is the only honest proof
 *     the click went anywhere.
 *   · The legacy drawer, which is a DEFECT on two counts — every one of its 12
 *     links points back at `/app/*`, and nothing in it is ever marked current.
 *     Those two are `test.fail()`: they assert what the previous app owes
 *     someone sent into it, and go green the day AppShell.tsx is fixed.
 *   · "View holdings ›" on a group card, which drops the group id on the floor.
 *     Also `test.fail()`.
 *   · The Assistant drawer and its unreachable fallback.
 *   · The jump box's error line — the branch that stops the app telling someone
 *     their own parcel is not in their account when the request never ran.
 *
 * NOTHING HERE WRITES A ROW. That is deliberate, not incidental: the one gap
 * that needs a group has no `deleteGroup` mutation to undo it (services/api/
 * src/main.py has create_group and nothing to match), and `groups` is not in
 * purge-e2e-records.py's minted-prefix map either — a created group would
 * outlive every reseed and pile up run after run. So the group is a
 * `page.route` fixture over the legacy `groups` query instead, which tests the
 * same client-side defect with nothing to clean. If a test here ever does file
 * something, it gets deleted in afterEach and never as the last line of the
 * body, for the reason crud-360.spec.ts:30 spells out at length.
 */
import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;

/** The seven sections the redesign left standing on the previous app, each
 *  with the label its stub link carries and the h1 the legacy screen renders.
 *  The two differ for `admin` — the button says "Admin & Ref Data"
 *  (Section.tsx:44) and the destination says "Admin & Reference Data"
 *  (AdminRefDataPage.tsx:195) — which is exactly why this table is explicit
 *  rather than derived from the title. */
const UNDRAWN = [
  { id: 'groups', title: 'Families & Groups', legacyHeading: 'Families & Groups' },
  { id: 'invitations', title: 'Invitations', legacyHeading: 'Invitations' },
  { id: 'notifications', title: 'Notifications', legacyHeading: 'Notifications' },
  { id: 'tools', title: 'Tools', legacyHeading: 'Tools' },
  { id: 'audit', title: 'Audit Log', legacyHeading: 'Audit Log' },
  { id: 'admin', title: 'Admin & Ref Data', legacyHeading: 'Admin & Reference Data' },
  { id: 'profile', title: 'Profile', legacyHeading: 'Profile' },
];

/** The permanent drawer. The legacy shell renders its nav TWICE — the
 *  temporary drawer is `keepMounted` (AppShell.tsx:310) so every label exists
 *  in the DOM at both widths — and an unscoped `getByRole('link')` is
 *  therefore strict-mode ambiguous on every one of the twelve. */
const rail = (page: Pg) => page.locator('.MuiDrawer-docked');

/** Present only in the previous app's top bar (AppShell.tsx:272), absent from
 *  the W360 shell. The discriminator that proves a click actually left the
 *  stub, since the stub and its destination share an h1. */
const legacyTopBar = (page: Pg) => page.getByRole('button', { name: 'Account menu' });

test.describe('the seven sections the redesign has not reached', () => {
  for (const { id, title, legacyHeading } of UNDRAWN) {
    test(`the ${title} stub lands on the real ${title} screen, not a dead end`, async ({ page }) => {
      await page.goto(`/app/${id}`);

      // The stub's own h1 (ui.tsx:308) and the card that explains itself. If
      // the promise changes wording, the link below is promising something
      // else and this test should be looked at rather than silently pass.
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Not yet redrawn' })).toBeVisible();

      await page.getByRole('link', { name: `Open ${title}` }).click();

      // The URL is the load-bearing assertion: six of the seven destinations
      // render the same h1 as the stub, so a link that navigated nowhere would
      // pass a heading check.
      await expect(page).toHaveURL(new RegExp(`/legacy/${id}$`));
      await expect(legacyTopBar(page)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: legacyHeading })).toBeVisible();

      // Section.tsx:70-74 says in so many words that this is a same-tab in-app
      // navigation and not an external one. One tab, one page, no dead end.
      expect(page.context().pages()).toHaveLength(1);
      await expect(page.getByText('There is no page at that address')).toHaveCount(0);
    });
  }

  for (const { id, title } of UNDRAWN) {
    test(`the ${title} screen behind the stub reaches the API rather than quietly showing you nothing`, async ({ page }) => {
      // useLiveOrSample.ts:45 swallows EVERY fetch error into emptyLike(sample),
      // so a dropped resolver reads on screen as "you own nothing here" with
      // only a small chip to say otherwise. The stub in front of these screens
      // promises "it works, it just has not been redrawn yet" — an empty table
      // makes that a lie, and nothing in the suite would have failed.
      //
      // Narrow on purpose: an honest empty state ("No groups yet") is fine and
      // expected for w360-demo, which owns no legacy rows. The chip is not.
      await page.goto(`/legacy/${id}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByText('Service unreachable')).toHaveCount(0);
    });
  }
});

test.describe('the previous app, once you are inside it', () => {
  test('the previous app\'s own rail keeps you inside the previous app', async ({ page }) => {
    // DEFECT: apps/web/src/layout/AppShell.tsx:79-90 — all twelve NAV_SECTIONS
    // paths are still `/app*`. Clicking "Audit Log" inside /legacy throws you
    // back out to the /app/audit stub you just came from; "Passbooks" is worse,
    // because routes.tsx:302 redirects /app/passbooks to the W360 property
    // list. The only exit from the stub leads to a screen whose own navigation
    // loops you back into it.
    test.fail();

    await page.goto('/app/tools');
    await page.getByRole('link', { name: 'Open Tools' }).click();
    await expect(page).toHaveURL(/\/legacy\/tools$/);
    await expect(rail(page)).toBeVisible();

    const hrefs = await rail(page).getByRole('link').evaluateAll(
      (els) => els.map((el) => el.getAttribute('href') ?? ''),
    );
    // Twelve, not "at least one": a rail that lost half its items would
    // otherwise satisfy the check below with the two links that survived.
    expect(hrefs).toHaveLength(12);
    expect(hrefs.filter((h) => !h.startsWith('/legacy'))).toEqual([]);

    await rail(page).getByRole('link', { name: 'Audit Log' }).click();
    await expect(page).toHaveURL(/\/legacy\/audit$/);
    // Still the previous app: the shell must survive its own navigation.
    await expect(rail(page)).toBeVisible();
  });

  test('the rail marks the screen you are actually on', async ({ page }) => {
    // DEFECT: AppShell.tsx:146-147 computes `selected` by comparing the
    // pathname against `/app...`, so on any /legacy/* URL no item matches. No
    // Mui-selected pill, and NavLink's own aria-current never appears either —
    // you are somewhere in a twelve-item menu with nothing saying where.
    test.fail();

    await page.goto('/legacy/tools');
    await expect(rail(page)).toBeVisible();

    await expect(rail(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(rail(page).locator('.Mui-selected')).toHaveCount(1);
    await expect(rail(page).locator('.Mui-selected')).toHaveText(/Tools/);
  });

  test('View holdings on a group card shows that group\'s holdings, not everything you own', async ({ page }) => {
    // DEFECT: FamiliesGroupsPage.tsx:183 navigates to /app/parcels?group=<id>,
    // and routes.tsx:295 is a hardcoded `<Navigate to="/app/properties?kind=
    // parcel">` that discards every incoming search param. The group id is gone
    // before the destination ever sees it — and w360/pages/Properties.tsx:249
    // could not honour it anyway: PARAM maps only kind|status|stake|in|tag and
    // PropertyFilter has no group concept at all. So the control is dead at
    // both ends, and its label promises a filter nothing applies.
    //
    // screens.spec.ts:2396 asserts the /app/parcels redirect, but for a bare
    // URL with no query string — it can never observe the dropped param.
    test.fail();

    // The group is a fixture, not a row. create_group mints a raw uuid
    // (main.py:89), there is no deleteGroup mutation to undo it, and `groups`
    // is absent from purge-e2e-records.py's prefix map — a group created here
    // would survive every reseed, for ever. The defect is entirely client-side,
    // so a stubbed query exercises it exactly as well with nothing to sweep.
    const GROUP = 'w360-group-e2e-shell';
    await page.route('**/api/gateway/pattadar/graphql', (route) => {
      const body = route.request().postData() ?? '';
      if (!/\bgroups\s*\{/.test(body)) return route.continue();
      return route.fulfill({
        json: {
          data: {
            groups: [{
              id: GROUP, ownerUserId: 'w360-demo', type: 'family',
              name: 'Shell Gap Family', description: 'Fixture, never written',
              myRole: 'Head', memberCount: 1, landCount: 0,
              totalExtent: 0, totalShare: 0, createdAt: '2026-01-01T00:00:00Z',
            }],
          },
        },
      });
    });

    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    // MUI's Link component="button" renders a real <button>, not an anchor.
    await page.getByRole('button', { name: 'View holdings ›' }).click();

    // Either shape of a working control is accepted: a destination that still
    // carries the group, under either vocabulary. What is not acceptable is the
    // bare list of everything with the group silently gone.
    await expect(page).toHaveURL(new RegExp(`group=${GROUP}`));
  });
});

test.describe('the two topbar controls the sweeps cannot reach', () => {
  test('the Assistant button opens the assistant, and says so honestly when it cannot reach it', async ({ page }) => {
    // The dead-control sweeps scope to `main` (crud-360.spec.ts:1108 says so in
    // a comment); this button lives in the banner and the panel renders in a
    // body-level portal, so neither sweep can ever touch it. The button was
    // only wired to the panel recently — Shell.tsx:366-371, "the button was
    // simply never connected to it here" — which is the kind of change that
    // gets silently reverted.
    //
    // playwright.config.ts already points VITE_GATEWAY_PROXY_TARGET at a dead
    // port, so the assistant is unreachable in this stack anyway. Routing it
    // explicitly makes the intent legible instead of load-bearing on a config
    // line three files away.
    await page.route('**/api/gateway/assistant/**', (route) =>
      route.fulfill({ status: 503, json: { error: 'unreachable' } }));

    await page.goto('/app');
    // CSS, not getByRole: MUI's temporary Drawer marks the app root aria-hidden
    // while it is open, so the button leaves the accessibility tree the moment
    // it does its job and a role query would stop finding it.
    const button = page.locator('.assistant-btn');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeVisible();

    const composer = page.getByRole('textbox', { name: 'Message the assistant' });
    await composer.fill('e2e ping, never answered');
    await page.getByRole('button', { name: 'Send message' }).click();

    // AssistantPanel.tsx:190-200: when nothing streamed at all, both bubbles
    // are dropped and the panel falls back to its soon-state. The failure this
    // guards is the opposite — a user bubble stranded on screen claiming a
    // message was sent to a service that was never reachable.
    await expect(page.getByText('Assistant will be available soon')).toBeVisible();
    await expect(page.getByText('e2e ping, never answered')).toHaveCount(0);
    await expect(composer).toHaveCount(0);

    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(page.getByText('Assistant will be available soon')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('a search that could not run says so, and never reports that nothing matches', async ({ page }) => {
    // Shell.tsx:316-321 gets this right; nothing has ever proved it. The only
    // jump-box tests are screens.spec.ts:2309 and :2337, and :2337 fills
    // 'zzzz-nothing' against a live API — the success-with-zero-rows branch,
    // i.e. precisely the branch that LIES when the request never ran. Drop the
    // `search.isError` guard and the app goes back to telling someone their own
    // parcel is not in their own account, with the suite still green.
    //
    // Fail only the search operation, and with a 200 + GraphQL errors body
    // rather than a 5xx: client.ts:121 throws on either, and this keeps the
    // shell's own portfolio and orders queries loading normally.
    await page.route('**/api/gateway/pattadar/graphql', (route) => {
      const body = route.request().postData() ?? '';
      if (!body.includes('search(q:$q)')) return route.continue();
      return route.fulfill({ status: 200, json: { errors: [{ message: 'search is down' }] } });
    });

    await page.goto('/app');
    // A query that DOES match a seeded record (w360-p-214-2), so "nothing
    // matches" would be provably false rather than merely unhelpful.
    await page.locator('#w360-search').fill('214/2');

    const panel = page.locator('.jump-results');
    // main.tsx:43 sets retry: 1, so isError only settles after a second
    // attempt; the route answers both, and the default timeout covers the gap.
    await expect(panel).toContainText('That search could not run');
    await expect(panel).not.toContainText('Nothing matches');

    // The visually-hidden live region is mounted always (Shell.tsx:334) so it
    // exists before it has anything to say. A screen reader gets the same
    // answer the panel shows, or it gets the lie on its own.
    await expect(page.locator('.jump').getByRole('status')).toHaveText('That search could not run.');
  });
});
