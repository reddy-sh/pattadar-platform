/**
 * Every address resolves — apps/web/src/routes.tsx.
 *
 * The route table is the one file nobody opens on purpose and everybody
 * depends on. It is also the file with the longest memory: it carries the old
 * vocabulary (`/app/parcels`, `/app/deeds`, `/app/passbooks/:id`) forward into
 * the new one, it keeps the previous app alive under `/legacy`, and it decides
 * what a person sees when the address is simply wrong. None of that has a
 * screen of its own, so none of it is covered by the fifteen specs beside
 * this one.
 *
 * What this file asserts, in the order the sections appear below:
 *
 *   1. The table still matches the suite. `fixtures/ids.ts` holds APP_ROUTES,
 *      REDIRECTS and PUBLIC_ROUTES; the three lists ids.ts has no section for
 *      — the previous app's screens, the Pattadar desk, and the sections
 *      nobody has redrawn — live in this file beside the sweeps that use them.
 *      The first test READS routes.tsx off disk and compares. A route added to
 *      the app and not to a sweep fails here, loudly, instead of going
 *      untested for a year.
 *   2. Every address under /app draws its own screen, inside the shell, with
 *      the rail still there — driven as a loop, not twenty copy-pasted tests.
 *      The desk's rail entry is the last row of that loop; the five screens
 *      behind it are a loop of their own, because an operator reaches them
 *      from the desk rather than from the rail.
 *   3. Every old address lands where routes.tsx promises, keeps the id it was
 *      carrying, and leaves no trap behind it for the back button — including
 *      the one old address whose redirect is NOT in routes.tsx and so cannot be
 *      in REDIRECTS: `/app/order?record=<id>`, which OrderLand.tsx turns into
 *      `/app/records/<id>/order?step=pick` now that the land is a path segment.
 *   4. An address that matches nothing says which address failed and offers
 *      the way back — three different ways back, because there are three
 *      catch-alls (inside /app, inside /legacy, and at the top level).
 *   5. RequireAuth: the doors that need a session, the doors that must not,
 *      and the address kept so a sign-in can finish the journey.
 *   6. The previous app, still routed under /legacy, with its own frame.
 *   7. A screen whose chunk will not download is contained to that screen.
 *
 * Five of these are `test.fail` — a defect found, written up against the file
 * and line that causes it, and left failing so that the day it is fixed this
 * file turns green on its own: a redirect that drops the filter the link was
 * carrying, a 404 whose way out is unstyled on two of its three mounts, the
 * previous app's menu ejecting you out of the previous app, an ErrorBoundary
 * that never forgets, and /legacy/profile looping on itself while it waits.
 *
 * Five things a reader should know before changing anything below.
 *
 *  · The order flow is FOUR STEPS AT ONE ADDRESS. `/app/order` asks which land
 *    and composes nothing; the order itself is `records/:id/order`, with
 *    `?step=pick|tell|check|done` moving between the steps. Only the two paths
 *    are in routes.tsx, so only the two paths are in APP_ROUTES — the steps are
 *    swept in section 2 as addresses a bookmark can hold, not as routes.
 *  · /app/map is NOT a screen. MapFind.tsx is four lines of `<Navigate>` onto
 *    /app/properties?view=map, and it is in APP_ROUTES because it is an
 *    address the rail and old bookmarks point at. It is the only member of
 *    that list whose URL changes under it, and the sweep says so explicitly.
 *  · The lazy-chunk tests ABORT a module request and then expect the app to
 *    log the failure — ErrorBoundary.componentDidCatch console.errors on
 *    purpose ("a boundary that hides the stack from the people fixing it is
 *    worse than the white screen it replaced"), so that describe block, and
 *    only that block, carries `allowConsole`.
 *  · The Pattadar desk (W17) is six addresses under /app/desk, and the only
 *    part of this app that is not the owner's: the rail draws its entry, and
 *    the screens answer, only for `portfolio.isPlatformAdmin`. The sealed world
 *    seeds that TRUE (fixtures/seed.ts PORTFOLIO), so every sweep here opens
 *    the desk as an operator; the one test that sets it false is the other
 *    half of the same guarantee. `/app/admin` — the rail entry the desk
 *    replaced — is a redirect onto it now, and is proved with the rest of the
 *    old vocabulary rather than as a screen.
 *  · The /legacy screens speak the PREVIOUS API — `query { passbooks … }`,
 *    with no `web { <field>` for the world to route on — so the beforeEach
 *    below answers those documents itself and lets everything else fall
 *    through untouched. Nothing here asserts legacy CONTENT; only that the
 *    address resolved and brought the legacy shell with it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { APP_ROUTES, HANGERS, ID, PAPER, PUBLIC_ROUTES, REDIRECTS, TICKET } from '../fixtures/ids';

// ── addressing the two shells ──────────────────────────────────────────

/** The W360 rail (Shell.tsx aria-label="Sections"). Present on every /app
 *  address, including the ones that resolve to nothing. */
const rail = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

/** The W360 wordmark, which is also the link home (Shell.tsx .brand). `exact`
 *  because /app/account carries a mailto: link to grievance@pattadar.com, and
 *  a substring match claims that one too. */
const brand = (page: Page) => page.getByRole('link', { name: 'Pattadar.', exact: true });

/** The previous app's chrome. Its drawer is a plain Box with no landmark
 *  role and it renders TWICE (permanent + keepMounted temporary), so the
 *  AppBar's account button is the one unambiguous marker of that shell. */
const legacyChrome = (page: Page) => page.getByRole('button', { name: 'Account menu' });

/** The sentence every catch-all renders (routes.tsx NotFound). */
const NOT_FOUND = 'There is no page at that address';

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A URL matcher for an exact path (+ query), anchored at the end. */
const at = (pathAndQuery: string) => new RegExp(`${escapeRe(pathAndQuery)}$`);

/**
 * Quiet the previous app's API, on every test in this file.
 *
 * The /legacy screens post documents like `query { passbooks { … } }` — no
 * `web { <field>`, because they predate that surface — so the world cannot
 * route them and answers HTTP 400. The screens themselves are fine with that
 * (`useLiveOrSample` catches and renders its empty state), but the BROWSER
 * logs every 4xx as a console error, which trips the harness guard on a
 * routing test that never asked about legacy data.
 *
 * So those documents get a 200 carrying `errors[]` instead: the same failure,
 * by the path `data/hooks.ts` already handles, with nothing for the console to
 * complain about. Everything with a `web {` in it falls straight through to
 * the world, untouched — registered here rather than in fixtures/seed.ts
 * because it is this file's problem and nobody else's.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/gateway/pattadar/graphql', (route) => {
    if (/\bweb\s*\{/.test(route.request().postData() ?? '')) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ message: 'Sealed: the previous app is not part of this world.' }] }),
    });
  });
});

// ── the table, as the app actually declares it ─────────────────────────

const ROUTES_TSX = resolve(__dirname, '../../../apps/web/src/routes.tsx');
const SOURCE = readFileSync(ROUTES_TSX, 'utf8');

/** The slice of routes.tsx between two markers, so the three route blocks can
 *  be read apart. Deliberately crude: this is a tripwire, not a parser, and a
 *  restructure of the file SHOULD make it complain. */
function block(from: string, to: string): string {
  const start = SOURCE.indexOf(from);
  expect(start, `routes.tsx no longer contains ${from} — this spec reads the table off disk`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf(to, start + from.length);
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

/** Every `path: '…'` literal in a block, minus the block's own path. */
function literals(src: string, own: string): string[] {
  return [...src.matchAll(/path: '([^']+)'/g)].map((m) => m[1]).filter((p) => p !== own);
}

/** The ones an address bar can reach by hand — no `:param`, no `*`. */
const isStatic = (p: string) => !p.includes(':') && !p.includes('*');

/** The previous app's own screens. `ids.ts` has no list for these — the suite
 *  is about the current design — so this file owns it, and the parity test
 *  below keeps it honest against routes.tsx. */
const LEGACY_ROUTES = [
  '/legacy',
  '/legacy/passbooks',
  '/legacy/parcels',
  '/legacy/documents',
  '/legacy/groups',
  '/legacy/invitations',
  '/legacy/notifications',
  '/legacy/wallet',
  '/legacy/tools',
  '/legacy/audit',
  '/legacy/admin',
  '/legacy/profile',
] as const;

/** The sections the redesign has not reached. Each one renders Section.tsx and
 *  points at its still-working /legacy screen.
 *
 *  Held here rather than taken from `fixtures/ids.ts` because this file is the
 *  only one that asserts on the list AS A LIST — every other spec opens one
 *  section by name — and because the parity test below reads routes.tsx's own
 *  UNDRAWN literal back against it, which is the tripwire that matters. `admin`
 *  left this list with W17: /app/admin is a redirect into the desk now, so a
 *  stub under that key would be a card nothing routes to. `groups` left it
 *  next: it is a real screen in this app's own chrome at /app/groups
 *  (w360/pages/Groups.tsx), so it is swept in APP_SCREENS below like any other
 *  screen and a stub there would be a card pointing out of the app. */
const UNDRAWN_SECTIONS = ['invitations', 'notifications', 'tools', 'audit', 'profile'] as const;

/** The desk's roster, as fixtures/seed.ts seeds it. Not in `fixtures/ids.ts`:
 *  that file is the cast of the OWNER's world — six records, their papers,
 *  their tickets — and an associate is Pattadar's own staff, on the other side
 *  of every one of those jobs. It moves there the day ids.ts grows a desk. */
const ASSOCIATE = {
  /** Takes work, has room for more, and has a note on his page nobody else has. */
  surveyor: 'as-ravi',
} as const;

/** `/app/admin` is a redirect now (routes.tsx:349) and belongs in REDIRECTS —
 *  but `fixtures/ids.ts` is read by the whole suite and still lists it as a
 *  section, so this file carries the entry and merges it in. Written as a merge
 *  rather than a second list so that the day ids.ts learns about it, nothing
 *  here is asserted twice. */
const EXTRA_REDIRECTS: Array<{ from: string; to: string | RegExp }> = [
  { from: '/app/admin', to: '/app/desk' },
  // One ordered service is at /app/services/:id now — "ticket" was internal
  // vocabulary that had reached the address bar. The old pair is NOT
  // housekeeping and must never be deleted: apps/ios ServicesScreen.swift
  // builds `https://pattadar.com/app/tickets/<id>/pay` and that is in a
  // SHIPPED binary, so the phone cannot be told a new path. Every link already
  // sent by SMS or email is in the same position. They live here rather than
  // in fixtures/ids.ts for the same reason /app/admin does — that file is read
  // by the whole suite and has not learned about them yet.
  { from: `/app/tickets/${TICKET.placed}`, to: `/app/services/${TICKET.placed}` },
  { from: `/app/tickets/${TICKET.placed}/pay`, to: `/app/services/${TICKET.placed}/pay` },
];

const ALL_REDIRECTS = [
  ...REDIRECTS,
  ...EXTRA_REDIRECTS.filter((e) => !REDIRECTS.some((r) => r.from === e.from)),
];

// ── what each address must actually draw ───────────────────────────────

interface Screen {
  /** Where to point the browser. */
  path: string;
  /** Where the browser must end up, if that is somewhere else. */
  lands?: string;
  /** The heading that proves this screen, not another, arrived. */
  heading: RegExp;
  /** Everything here owns an h1 except Shared, which gives its h1 to the kit
   *  being read and names the section in the column beside it (Shared.tsx:91). */
  level?: number;
  /** A second sentence, for the screens whose heading is a NAME rather than a
   *  title — the desk's job and associate pages both take theirs from the row
   *  they opened, so the heading alone cannot say which row that was. */
  proves?: RegExp;
}

/** Every address in APP_ROUTES, with the heading that proves it. */
const APP_SCREENS: Screen[] = [
  // The dashboard greets by the hour, so it is matched on the part that does
  // not move between a morning run and an evening one.
  { path: '/app', heading: /Shankar Reddy/ },
  { path: '/app/properties', heading: /^Properties$/ },
  // Not a screen: four lines of <Navigate> keeping saved map links on the
  // same live map and filters as Properties (MapFind.tsx).
  { path: '/app/map', lands: '/app/properties?view=map', heading: /^Properties$/ },
  { path: '/app/villages', heading: /^Maps$/ },
  { path: '/app/shared', heading: /^Shared with me$/, level: 2 },
  { path: '/app/assigned', heading: /^Waiting on you$/ },
  { path: '/app/services', heading: /^Work you can order$/ },
  // Ordering starts by asking which land (OrderLand.tsx). The screen composes
  // nothing — the order itself is composed at /app/records/:id/order, which is
  // a hanger and is swept with the others below — so this address owes exactly
  // one thing: the question, under the eyebrow "Order a service".
  { path: '/app/order', heading: /^Which land is this for\?$/ },
  { path: '/app/papers', heading: /^Papers$/ },
  { path: '/app/wallet', heading: /^What is set aside, and what has gone$/ },
  { path: '/app/account', heading: /^Your account and data$/ },
  { path: '/app/groups', heading: /^Families & Groups$/ },
  { path: '/app/invitations', heading: /^Invitations$/ },
  { path: '/app/notifications', heading: /^Notifications$/ },
  { path: '/app/tools', heading: /^Tools$/ },
  { path: '/app/audit', heading: /^Audit Log$/ },
  { path: '/app/profile', heading: /^Profile$/ },
  // Last in the rail, and drawn for one account (Shell.tsx:543). "Admin & Ref
  // Data" used to be this line; the desk took its address, and the reference
  // data it introduced is untouched at /legacy/admin.
  { path: '/app/desk', heading: /^Jobs waiting for somebody$/ },
];

/** The five screens behind the desk's own entry. Not addresses the rail can
 *  reach — an operator arrives at each of them from the desk — but every one is
 *  a path in routes.tsx, a bookmark, and a link an operator pastes to another
 *  operator, so each owes its own screen at its own address. */
const DESK_SCREENS: Screen[] = [
  // One job, titled with the service and carrying its reference in the eyebrow
  // above (DeskJob.tsx:186-190). TICKET.placed is W-2101, with nobody on it.
  { path: `/app/desk/jobs/${TICKET.placed}`, heading: /^Encumbrance Certificate$/, proves: /W-2101/ },
  { path: '/app/desk/associates', heading: /^Associates$/ },
  // One associate, whose heading is their own name (DeskAssociate.tsx:643).
  { path: `/app/desk/associates/${ASSOCIATE.surveyor}`, heading: /^G\. Srinivas$/,
    proves: /Walks the Markapur side himself/ },
  { path: '/app/desk/enrol', heading: /^Add an associate$/ },
  { path: '/app/desk/coverage', heading: /^Who covers what$/ },
];

/** Every /app path that is a PATTERN rather than an address — a `:param`, or
 *  the catch-all — and therefore can never appear in a static sweep.
 *
 *  This list exists because the parity test below compares routes.tsx against
 *  APP_ROUTES by filtering for paths an address bar can reach by hand, which
 *  silently drops every one of these. Four of them arrived at once when the
 *  one-service screen was rebuilt (`services/:id`, `services/:id/pay`, and the
 *  two `tickets/:id` redirects that keep the shipped phone working), and the
 *  tripwire did not so much as blink. Each entry names where it is proved, and
 *  the check runs both ways: a pattern added to the table and not tested here
 *  fails, and a pattern this file still tests after routes.tsx dropped it fails
 *  too. */
const APP_PATTERNS: string[] = [
  'services/:id',            // "a service is reached by its own address"
  'services/:id/pay',        // "paying for a service is an address under that service"
  'papers/shelf/:key',       // "a shelf is a shelf, not a paper called 'shelf'"
  'papers/:id',              // "one paper opens by its own id, and not as a shelf"
  'desk/jobs/:id',           // DESK_SCREENS
  'desk/associates/:id',     // DESK_SCREENS
  'parcels/:id',             // REDIRECTS — "an old link for ONE parcel…"
  'properties/:id',          // REDIRECTS — the same test, second address
  'tickets/:id',             // EXTRA_REDIRECTS — the old address for one service
  'tickets/:id/pay',         // EXTRA_REDIRECTS — the address the shipped phone builds
  'passbooks/:id',           // REDIRECTS — "a passbook link goes to the screen…"
  '*',                       // section 4, "an address that matches nothing"
];

/** The previous app's screens and their headings (PageHeader component="h1"). */
const LEGACY_SCREENS: Screen[] = [
  { path: '/legacy', heading: /^Good (morning|afternoon|evening),/ },
  { path: '/legacy/passbooks', heading: /^Passbooks$/ },
  { path: '/legacy/parcels', heading: /^Land & Properties$/ },
  { path: '/legacy/documents', heading: /^Vault$/ },
  { path: '/legacy/groups', heading: /^Families & Groups$/ },
  { path: '/legacy/invitations', heading: /^Invitations$/ },
  { path: '/legacy/notifications', heading: /^Notifications$/ },
  { path: '/legacy/wallet', heading: /^Wallet$/ },
  { path: '/legacy/tools', heading: /^Tools$/ },
  { path: '/legacy/audit', heading: /^Audit Log$/ },
  { path: '/legacy/admin', heading: /^Admin & Reference Data$/ },
  { path: '/legacy/profile', heading: /^Profile$/ },
];

// ═══════════════════════════════════════════════════════════════════════
// 1. The table and the fixture still describe the same app
// ═══════════════════════════════════════════════════════════════════════

test('a route added to the table but not to this sweep fails here, not quietly in production', async () => {
  const appBlock = block("path: '/app',", "path: '/legacy',");
  const legacyBlock = block("path: '/legacy',", '// Everything else');
  const publicBlock = SOURCE.slice(SOURCE.indexOf('export const router'), SOURCE.indexOf("path: '/app',"));
  // The record's hangers are nested INSIDE the /app block, and their paths
  // ('features', 'money', …) are relative to the record, not to /app. Read
  // apart, or `features` reads as a sibling of `properties`.
  //
  // The end marker is `groups` rather than the UNDRAWN spread because Families
  // & Groups became a real screen and was declared BETWEEN the two: read to the
  // spread and the record block swallows it, and `groups` is then reported both
  // as a hanger nobody opens and as an /app address routes.tsx no longer
  // declares. The first sibling after the record is the honest boundary.
  const recordBlock = block("path: 'records/:id',", "path: 'groups',");
  const appOwnBlock = appBlock.replace(recordBlock, '');

  // The sections nobody has redrawn are a spread in routes.tsx rather than six
  // literals, so they never appear in `declaredApp` — which is exactly why the
  // list is worth reading back on its own. This is the one assertion in the
  // file that would notice a section being redrawn (or a new one appearing)
  // before the sweep below started opening the wrong screen for it.
  const undrawnLiteral = /const UNDRAWN = \[([^\]]*)\]/.exec(SOURCE)?.[1] ?? '';
  expect(
    [...undrawnLiteral.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    'routes.tsx and this spec disagree about which sections are still undrawn',
  ).toEqual([...UNDRAWN_SECTIONS]);

  // Under /app: every hand-reachable path is either swept as a screen, or is
  // an old address with a redirect test. The desk's four static paths are in
  // DESK_SCREENS rather than in APP_ROUTES, so both sweeps are named here.
  const declaredApp = literals(appOwnBlock, '/app').filter(isStatic).map((p) => `/app/${p}`);
  const coveredApp = new Set<string>([
    ...APP_ROUTES,
    ...APP_SCREENS.map((sc) => sc.path),
    ...DESK_SCREENS.map((sc) => sc.path),
    ...ALL_REDIRECTS.map((r) => r.from),
  ]);
  expect(
    declaredApp.filter((p) => !coveredApp.has(p)),
    'routes.tsx declares an /app address that APP_ROUTES and REDIRECTS in fixtures/ids.ts have never heard of',
  ).toEqual([]);

  // And the other way: nothing in the fixture has quietly been deleted from
  // the app. '/app' is the layout route itself; UNDRAWN is the spread.
  const declaredSet = new Set(declaredApp);
  const undrawn = new Set<string>(UNDRAWN_SECTIONS.map((id) => `/app/${id}`));
  expect(
    [...new Set([...APP_ROUTES, ...APP_SCREENS.map((sc) => sc.path), ...DESK_SCREENS.map((sc) => sc.path)])]
      // The two desk screens that name a row are `desk/jobs/:id` and
      // `desk/associates/:id` in the table, and a concrete id never matches a
      // param — they are proved by opening them, below, not by this list.
      .filter((p) => !p.includes(TICKET.placed) && !p.includes(ASSOCIATE.surveyor))
      .filter((p) => p !== '/app' && !declaredSet.has(p) && !undrawn.has(p)),
    'this spec sweeps an /app address that routes.tsx no longer declares',
  ).toEqual([]);

  // And the paths an address bar cannot reach by hand, which the two sweeps
  // above filter out by construction. Both directions, because the whole point
  // is that a `:param` route can otherwise be added — or removed — without one
  // assertion in this suite noticing.
  const declaredPatterns = literals(appOwnBlock, '/app').filter((p) => !isStatic(p));
  expect(
    declaredPatterns.filter((p) => !APP_PATTERNS.includes(p)),
    'routes.tsx declares an /app path with a :param that this spec never opens',
  ).toEqual([]);
  expect(
    APP_PATTERNS.filter((p) => !declaredPatterns.includes(p)),
    'this spec opens an /app :param path that routes.tsx no longer declares',
  ).toEqual([]);

  // And the record's own hangers, which this file sweeps from HANGERS.
  const declaredHangers = literals(recordBlock, 'records/:id').filter(isStatic);
  const sweptHangers = new Set<string>([...HANGERS.filter(Boolean), 'order', 'request']);
  expect(
    declaredHangers.filter((p) => !sweptHangers.has(p)),
    'routes.tsx hangs something off a record that this spec never opens',
  ).toEqual([]);
  expect(
    [...sweptHangers].filter((p) => !declaredHangers.includes(p)),
    'this spec opens a record hanger routes.tsx no longer declares',
  ).toEqual([]);

  // Under /legacy: the previous app, whose screen list lives in this file.
  const declaredLegacy = literals(legacyBlock, '/legacy').filter(isStatic).map((p) => `/legacy/${p}`);
  const coveredLegacy = new Set<string>([
    ...LEGACY_ROUTES,
    ...ALL_REDIRECTS.map((r) => r.from),
  ]);
  expect(
    declaredLegacy.filter((p) => !coveredLegacy.has(p)),
    'routes.tsx declares a /legacy address this spec does not visit',
  ).toEqual([]);

  // The public doors. /auth/callback is the one static public path this suite
  // cannot open by hand — it needs an OAuth code in the query string — so it
  // is named here rather than swept.
  const declaredPublic = literals(publicBlock, '').filter(isStatic);
  expect(
    declaredPublic.filter((p) => !PUBLIC_ROUTES.includes(p as never) && p !== '/auth/callback'),
    'routes.tsx declares a public door that PUBLIC_ROUTES in fixtures/ids.ts does not list',
  ).toEqual([]);

  // And the token doors, which have params and therefore never appear in a
  // static list. They are asserted individually further down; this is the
  // tripwire for one being removed.
  for (const door of ['/verify/:token', '/active/:token', '/share/:token', '/work/:token']) {
    expect(publicBlock, `${door} is a public door this spec still tests`).toContain(`path: '${door}'`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Every address under /app draws its own screen
// ═══════════════════════════════════════════════════════════════════════

test.describe('every address under /app', () => {
  test('every address the rail can reach draws its own screen, with the shell still around it', async ({ page }) => {
    // Eighteen addresses typed in fresh, each its own React.lazy chunk. The
    // last of them is the desk, which the rail draws for this account and for
    // nobody else — the account the sealed world signs in as is an admin
    // (fixtures/seed.ts PORTFOLIO.isPlatformAdmin).
    test.slow();
    for (const { path, lands, heading, level } of APP_SCREENS) {
      await page.goto(path);
      await expect(page, `${path} must resolve`).toHaveURL(at(lands ?? path));
      await expect(page.getByRole('heading', { level: level ?? 1, name: heading }).first(),
        `${path} must draw its own screen`).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(NOT_FOUND), `${path} must not be a 404`).toHaveCount(0);
      await expect(rail(page), `${path} lost the rail`).toBeVisible();
      await expect(brand(page), `${path} lost the wordmark`).toBeVisible();
    }
  });

  test('every screen behind the desk opens at its own address, inside the same shell', async ({ page, world }) => {
    // The desk is inside the W360 shell on purpose (routes.tsx:309-311): the
    // operator is also an owner with their own land, and a second shell would
    // mean a second wordmark and a sign-out in a different corner for the one
    // person who uses the app most. So the frame is asserted here too.
    test.slow();
    for (const { path, heading, proves } of DESK_SCREENS) {
      await page.goto(path);
      await expect(page, `${path} must resolve`).toHaveURL(at(path));
      await expect(page.getByRole('heading', { level: 1, name: heading }).first(),
        `${path} must draw its own screen`).toBeVisible({ timeout: 20_000 });
      if (proves) {
        await expect(page.getByText(proves).first(),
          `${path} drew the screen but not the row the address named`).toBeVisible();
      }
      await expect(page.getByText(NOT_FOUND), `${path} must not be a 404`).toHaveCount(0);
      await expect(rail(page), `${path} lost the rail`).toBeVisible();
      await expect(brand(page), `${path} lost the wordmark`).toBeVisible();
    }
    // And the one screen that reads a person by id asked for the person the
    // address named, rather than drawing whichever row the roster held first.
    expect(world.lastVars('associate'), 'the associate page opened somebody else')
      .toMatchObject({ id: ASSOCIATE.surveyor });
    // The entry that leads here at all: last in the rail, and the only thing in
    // it drawn for one account (Shell.tsx:543). Asserted here so that the test
    // below, which says it is absent for everybody else, is saying something.
    await expect(rail(page).getByRole('link', { name: /Pattadar desk/ }))
      .toHaveAttribute('href', '/app/desk');
  });

  test('the desk is drawn for the account that runs Pattadar, and told plainly to anybody else', async ({ page, world }) => {
    // The whole subsystem turns on one flag. The sealed world seeds it true,
    // so every other test here is an operator; this is the other side of it,
    // and the only thing standing between somebody else's typed URL and a
    // screen listing every owner's jobs.
    world.patch('portfolio', { isPlatformAdmin: false });

    await page.goto('/app');
    await expect(rail(page)).toBeVisible({ timeout: 20_000 });
    await expect(rail(page).getByRole('link', { name: /Pattadar desk/ }),
      'the desk entry was drawn for an account that is not the desk').toHaveCount(0);

    // The address still resolves — it is in bookmarks, and a redirect target
    // — and what it draws is a sentence, not an empty shell, not a skeleton
    // that never resolves, and not "The desk did not load", which is a failure
    // message for a read that did not fail (Desk.tsx:113-140).
    await page.goto('/app/desk');
    await expect(page).toHaveURL(at('/app/desk'));
    await expect(page.getByRole('heading', { level: 1, name: 'This is not your screen' }))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Nothing here belongs to this account.')).toBeVisible();
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.getByText('Loading the desk'), 'the refusal was drawn as a skeleton')
      .toHaveCount(0);
    await expect(page.getByRole('alert'), 'a refusal was told as a failure').toHaveCount(0);
    // Sent somewhere that IS theirs, rather than left on a dead end.
    await expect(page.getByRole('link', { name: 'Work you have ordered' }))
      .toHaveAttribute('href', '/app/services');
    await expect(rail(page), 'the refusal dropped the frame as well').toBeVisible();
  });

  test('the five sections nobody has redrawn say so, and point at the screen that still works', async ({ page }) => {
    test.slow();
    for (const id of UNDRAWN_SECTIONS) {
      await page.goto(`/app/${id}`);
      await expect(page.getByRole('heading', { name: 'Not yet redrawn' })).toBeVisible({ timeout: 20_000 });
      const title = await page.getByRole('heading', { level: 1 }).first().innerText();
      // Section.tsx draws exactly one way out, and it must go to /legacy.
      await expect(page.getByRole('link', { name: `Open ${title}` })).toHaveAttribute('href', `/legacy/${id}`);
    }
  });

  test('the way out of an undrawn section really does open the previous app', async ({ page }) => {
    await page.goto('/app/tools');
    await page.getByRole('link', { name: 'Open Tools' }).click();
    await expect(page).toHaveURL(at('/legacy/tools'));
    await expect(legacyChrome(page)).toBeVisible({ timeout: 20_000 });
    // The previous app is a different frame, not the same one with new content.
    await expect(rail(page)).toHaveCount(0);
  });

  test('a record 360 opens on every one of its hangers, and every hanger knows which record it is', async ({ page, world }) => {
    test.slow();
    for (const hanger of [...HANGERS, 'order', 'request']) {
      const path = `/app/records/${ID.parcel}${hanger ? `/${hanger}` : ''}`;
      await page.goto(path);
      await expect(page).toHaveURL(at(path));
      // Not every hanger draws an h1 — Photos is full-bleed and puts the
      // record in its header strip, Boundary titles itself "Map & boundary" —
      // so the assertion is the one thing all of them owe: the record's name
      // on screen, and the API asked for that record and no other.
      await expect(page.getByText(/Sy 214\/2/).first(), `${path} must name the record`)
        .toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
      expect(world.lastVars('record'), `${path} asked for the wrong record`).toMatchObject({ id: ID.parcel });
      await expect(rail(page)).toBeVisible();
    }
  });

  /* The order flow is four steps at ONE address: `records/:id/order` is the
   * only path routes.tsx declares for it, and `?step=` is what moves between
   * them (OrderService.tsx:296-298). So the steps are deliberately not rows in
   * APP_SCREENS — that table is checked against the path literals in routes.tsx
   * by the first test in this file, and a query string is not a path. What they
   * are owed instead is this: each one reachable by hand, because every step
   * pushes a history entry and therefore ends up in somebody's Back stack and
   * somebody's bookmarks. */
  test('every step of the order flow is reachable by its own address', async ({ page }) => {
    test.slow();
    const base = `/app/records/${ID.parcel}/order`;
    for (const [query, heading] of [
      ['?step=pick', 'What do you want done on this land?'],
      ['?service=ec&step=tell', 'What we need to know'],
      ['?service=ec&step=check', 'Check this before it goes in'],
    ] as const) {
      await page.goto(base + query);
      await expect(page, `${query} must resolve`).toHaveURL(at(base + query));
      await expect(page.getByRole('heading', { level: 2, name: heading }),
        `${query} must draw its own step`).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
      await expect(rail(page)).toBeVisible();
    }
  });

  test('an order step whose precondition is gone puts the address back, instead of drawing over nothing', async ({ page }) => {
    // `?step=done` is a receipt for an order this tab never placed, and
    // `?step=tell` with no service is a form with no questions behind it. Both
    // are one stale bookmark or one Back press away, and OrderService.tsx
    // :348-355 corrects the address rather than rendering an empty step.
    for (const from of ['?step=done&service=ec', '?step=tell']) {
      await page.goto(`/app/records/${ID.parcel}/order${from}`);
      await expect(page, `${from} was drawn rather than corrected`)
        .toHaveURL(at(`/app/records/${ID.parcel}/order?step=pick`));
      await expect(page.getByRole('heading', { level: 2, name: 'What do you want done on this land?' }))
        .toBeVisible({ timeout: 20_000 });
    }
  });

  test('a shelf is a shelf, not a paper called "shelf"', async ({ page, world }) => {
    // routes.tsx puts 'papers/shelf/:key' ABOVE 'papers/:id' on purpose: the
    // other order let the Reader claim /app/papers/shelf and ask the API for a
    // document whose id is the word "shelf".
    await page.goto('/app/papers/shelf/title');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
    // The Reader's query is `web { document(id:) }` (api.ts useDocument), so
    // that is the field that would carry the word "shelf" as an id.
    expect(world.calls('document').map((c) => c.vars.id), 'the Reader claimed a shelf URL')
      .not.toContain('shelf');
  });

  test('a shelf nobody files anything under says which eight shelves exist', async ({ page, world }) => {
    // `papers/shelf/:key` takes any word at all. Shelf.tsx:35-37 refuses an
    // unknown one BY NAME rather than asking the API for it, which is the
    // difference between a stale bookmark and a spinner that never stops.
    await page.goto('/app/papers/shelf/no-such-shelf');
    // The shared `Empty` primitive titles itself with a <p class="blank-t">,
    // not a heading (ui.tsx:681), so the sentence is addressed as text.
    await expect(page.getByText('There is no shelf by that name'))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: 'Back to your papers' })).toHaveAttribute('href', '/app/papers');
    expect(world.calls('vaultPapers'), 'an unknown shelf key was sent to the API anyway').toHaveLength(0);
  });

  test('one paper opens by its own id, and not as a shelf', async ({ page, world }) => {
    await page.goto(`/app/papers/${PAPER.deed}`);
    await expect(page).toHaveURL(at(`/app/papers/${PAPER.deed}`));
    await expect.poll(() => world.asked('document')).toBe(true);
    expect(world.lastVars('document')).toMatchObject({ id: PAPER.deed });
  });

  test('one ordered service is reached by its own address, not as a seventh hanger on a record', async ({ page, world }) => {
    // The address says `services` and not `tickets`: an owner who ordered a
    // patta copy is not raising a support ticket, and the word had reached the
    // address bar from the API's internals. The GraphQL field behind it is
    // still `ticket`, which is why the world is asked about that name.
    await page.goto(`/app/services/${TICKET.placed}`);
    await expect(page).toHaveURL(at(`/app/services/${TICKET.placed}`));
    // The screen is titled with the service that was ordered (Ticket.tsx h1),
    // so this proves the address drew the service rather than merely resolving.
    await expect(page.getByRole('heading', { level: 1, name: /^Encumbrance certificate$/ }))
      .toBeVisible({ timeout: 20_000 });
    await expect.poll(() => world.asked('ticket')).toBe(true);
    expect(world.lastVars('ticket')).toMatchObject({ id: TICKET.placed });
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(rail(page)).toBeVisible();
  });

  test('paying for a service is an address under that service', async ({ page, world }) => {
    // The seed answers this endpoint 409 ("payments are switched off on this
    // build"), which is the shipping state and belongs to the payments spec.
    // Here the question is only whether the address resolves to the checkout
    // for THIS service, so the world hands it a readable one.
    world.route(/\/api\/gateway\/pattadar\/payments\/tickets\//, () => ({
      json: {
        status: 'unpaid', title: 'Encumbrance certificate', amount: 120_000, currency: 'INR',
        mode: 'off', enabled: false, operations: [],
      },
    }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page).toHaveURL(at(`/app/services/${TICKET.placed}/pay`));
    await expect(page.getByRole('heading', { level: 1, name: /^Encumbrance certificate$/ }))
      .toBeVisible({ timeout: 20_000 });
    expect(world.restCalls(/payments\/tickets\//)[0].path, 'the checkout asked about the wrong service')
      .toContain(TICKET.placed);
    // The way back out of checkout is the service it is paying for — the
    // checkout is the one screen in the app a person can reach with no rail
    // entry pointing at it (PaymentsCheckout.tsx:127).
    await expect(page.getByRole('link', { name: '← Back to the service' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}`);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  });

  test('an address pasted with a trailing slash still opens the list', async ({ page }) => {
    // Mail clients and chat apps append one often enough that this is a real
    // way to arrive. It must not be read as `properties/:id` with a blank id.
    await page.goto('/app/properties/');
    await expect(page.getByRole('heading', { level: 1, name: /^Properties$/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. The old vocabulary still resolves
// ═══════════════════════════════════════════════════════════════════════

test.describe('the old addresses', () => {
  test('every old address lands exactly where the table promises, query string and all', async ({ page }) => {
    test.slow();
    for (const { from, to } of ALL_REDIRECTS) {
      await page.goto(from);
      await expect(page, `${from} must land on ${String(to)}`)
        .toHaveURL(typeof to === 'string' ? at(to) : to);
    }
  });

  test('an old link for ONE parcel still opens that parcel, not the list of everything I own', async ({ page, world }) => {
    for (const from of [`/app/parcels/${ID.parcel}`, `/app/properties/${ID.parcel}`]) {
      await page.goto(from);
      await expect(page, `${from} threw the id away`).toHaveURL(at(`/app/records/${ID.parcel}`));
      await expect(page.getByText(/Sy 214\/2/).first()).toBeVisible({ timeout: 20_000 });
      expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
    }
  });

  test('an old link for a parcel that no longer exists gets the honest answer, not the list', async ({ page }) => {
    await page.goto(`/app/parcels/${ID.missing}`);
    await expect(page).toHaveURL(at(`/app/records/${ID.missing}`));
    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' }))
      .toBeVisible({ timeout: 20_000 });
    // Still inside the app, with the way out in view.
    await expect(rail(page)).toBeVisible();
  });

  /* The one old address whose redirect is NOT in routes.tsx, and therefore not
   * in REDIRECTS: ordering used to carry the property in the query string
   * (`/app/order?record=…`), and the land is a path segment now. OrderLand.tsx
   * :165-170 is what turns the old form into the new one, with `replace`, the
   * way every entry in the table does. It is asserted here rather than added to
   * fixtures/ids.ts because that list is read back out of routes.tsx by the
   * parity test at the top of this file, and this redirect is drawn by a
   * screen. */
  test('an old order link that named the property in the query string still opens that property', async ({ page, world }) => {
    await page.goto(`/app/order?record=${ID.parcel}`);
    await expect(page, 'the old ?record= form threw the property away')
      .toHaveURL(at(`/app/records/${ID.parcel}/order?step=pick`));
    await expect(page.getByRole('heading', { level: 2, name: 'What do you want done on this land?' }))
      .toBeVisible({ timeout: 20_000 });
    expect(world.lastVars('record'), 'the redirect opened the wrong record').toMatchObject({ id: ID.parcel });
  });

  test('an old order link that named the service as well arrives with the service still chosen', async ({ page }) => {
    // The defect written up at the bottom of this describe is that the list
    // redirects drop what the incoming address was carrying. This one does not,
    // and that is worth pinning: both halves of the old two-question URL survive.
    await page.goto(`/app/order?record=${ID.parcel}&service=ec`);
    await expect(page).toHaveURL(at(`/app/records/${ID.parcel}/order?service=ec&step=pick`));
    await expect(page.getByRole('heading', { level: 2, name: 'What do you want done on this land?' }))
      .toBeVisible({ timeout: 20_000 });
    // Carried into the screen, not merely into the address bar: the tile the
    // link named is the one already pressed.
    await expect(page.getByRole('button', { name: /Encumbrance Certificate/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('going back from an old order link leaves it behind, rather than redirecting me forward again', async ({ page }) => {
    // `replace` on the <Navigate>, proved the way the table's own redirects are
    // proved — without it, Back lands on /app/order?record=… and is sent
    // straight forward again, and the owner cannot get out of the flow.
    await backOutOf(page, '/app/properties', [`/app/order?record=${ID.parcel}`]);
  });

  test('the address a shipped phone builds still opens the checkout for that service', async ({ page, world }) => {
    // This is the one redirect in the table that cannot ever be retired.
    // apps/ios ServicesScreen.swift:251 builds
    // `https://pattadar.com/app/tickets/<id>/pay` and that is in a SHIPPED
    // binary — the phone cannot be told a new path, and neither can the links
    // already sent out by SMS. So both halves are asserted: the old address
    // lands on the new one carrying its id, and the checkout it lands on asked
    // about that service rather than drawing whichever one it saw last.
    world.route(/\/api\/gateway\/pattadar\/payments\/tickets\//, () => ({
      json: {
        status: 'unpaid', title: 'Encumbrance certificate', amount: 120_000, currency: 'INR',
        mode: 'off', enabled: false, operations: [],
      },
    }));
    await page.goto('/app/properties');
    await page.goto(`/app/tickets/${TICKET.placed}/pay`);
    await expect(page, 'the address the phone builds no longer lands on the checkout')
      .toHaveURL(at(`/app/services/${TICKET.placed}/pay`));
    await expect(page.getByRole('heading', { level: 1, name: /^Encumbrance certificate$/ }))
      .toBeVisible({ timeout: 20_000 });
    expect(world.restCalls(/payments\/tickets\//)[0].path, 'the redirect threw the service id away')
      .toContain(TICKET.placed);
    // `replace`, so the address the phone opened is not left in history for
    // Back to bounce off. Without it there is no way out of the checkout on a
    // phone at all: Back returns to /app/tickets/<id>/pay and is sent straight
    // forward again.
    await page.goBack();
    await expect(page, 'Back off the phone\'s address landed in a redirect loop')
      .toHaveURL(at('/app/properties'));
  });

  test('the rail entry the desk replaced still opens the desk, rather than nothing', async ({ page }) => {
    // /app/admin was a rail entry for everybody for six months, and is in that
    // many bookmarks and screenshots. It is a redirect now (routes.tsx:349),
    // and the thing it lands on has to be the desk itself rather than the 404
    // an unrouted path would draw.
    await page.goto('/app/admin');
    await expect(page, '/app/admin no longer lands anywhere').toHaveURL(at('/app/desk'));
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs waiting for somebody' }))
      .toBeVisible({ timeout: 20_000 });
    // The reference data it used to introduce is untouched at /legacy/admin,
    // which the previous app's own sweep opens further down this file.
  });

  test('a passbook link goes to the screen that can actually draw a passbook', async ({ page }) => {
    // A passbook id is a `passbooks.id`, not a record id: the 360 would answer
    // "not in your portfolio", which is false (routes.tsx ToLegacyPassbook).
    await page.goto('/app/passbooks/pb-1');
    await expect(page).toHaveURL(at('/legacy/passbooks/pb-1'));
    await expect(legacyChrome(page)).toBeVisible({ timeout: 20_000 });
  });

  /* Every `<Navigate>` in the table carries `replace`, so the old address is
   * never left in history for Back to bounce off. Asserted once per app rather
   * than once per table, because each pass is two full document loads and
   * doing all fourteen in one test is four minutes of navigation.
   *
   * Each pass ends where the next one starts, so the anchor loads once. */
  async function backOutOf(page: Page, anchor: string, froms: string[]) {
    await page.goto(anchor);
    await expect(page).toHaveURL(at(anchor));
    for (const from of froms) {
      await page.goto(from);
      await page.goBack();
      await expect(page, `back out of ${from} landed in a loop`).toHaveURL(at(anchor));
    }
  }

  test('going back from an old /app address leaves it behind, instead of bouncing me forward again', async ({ page }) => {
    test.slow();
    await backOutOf(page, '/app/properties',
      ALL_REDIRECTS.filter((r) => r.from.startsWith('/app/')).map((r) => r.from));
  });

  test('going back from an old /legacy address leaves it behind too', async ({ page }) => {
    test.slow();
    await backOutOf(page, '/legacy/tools',
      ALL_REDIRECTS.filter((r) => r.from.startsWith('/legacy/')).map((r) => r.from));
  });

  // DEFECT — routes.tsx:295, :298, :300, :302 and :330-335 hardcode the
  // destination of every list redirect, so whatever the incoming address was
  // carrying is dropped on the floor. /app/parcels?q=Katragunta becomes
  // /app/properties?kind=parcel and the search is gone; /legacy/properties?pb=…
  // becomes /legacy/parcels?tab=properties and the passbook filter is gone —
  // a filter LandPropertiesPage.tsx:9-11 documents as a supported deep link.
  // The owner is owed what MapFind.tsx:5-8 already does four lines away:
  // read the incoming search, set the one param the redirect is FOR, and
  // carry the rest through. Bookmarks and shared links are the only reason
  // these redirects exist at all, and they are exactly the links that carry
  // a filter.
  test.fail('an old link that carried a filter arrives with the filter still on it', async ({ page }) => {
    await page.goto('/app/parcels?q=Katragunta');
    await expect(page).toHaveURL(/kind=parcel/);
    await expect(page, 'the search the link was carrying was thrown away').toHaveURL(/q=Katragunta/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. An address that matches nothing
// ═══════════════════════════════════════════════════════════════════════

test.describe('an address that matches nothing', () => {
  test('a wrong address inside the app keeps the app around it and says which address failed', async ({ page }) => {
    await page.goto('/app/no-such-screen');
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('/app/no-such-screen', { exact: true })).toBeVisible();
    await expect(page.getByText('Nothing is wrong with your records')).toBeVisible();
    await expect(rail(page), 'a 404 inside the app must not strand me without the rail').toBeVisible();
    await expect(brand(page)).toBeVisible();
  });

  test('the way back off a wrong address actually goes somewhere', async ({ page }) => {
    await page.goto('/app/no-such-screen');
    await page.getByRole('link', { name: 'Go to your dashboard' }).click();
    await expect(page).toHaveURL(at('/app'));
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible({ timeout: 20_000 });
  });

  test('a wrong hanger on a real record is still the app saying so, not a bare error page', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/no-such-hanger`);
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`/app/records/${ID.parcel}/no-such-hanger`, { exact: true })).toBeVisible();
    await expect(rail(page)).toBeVisible();
  });

  test('a wrong address inside the previous app keeps the PREVIOUS app around it', async ({ page }) => {
    await page.goto('/legacy/no-such-screen');
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('/legacy/no-such-screen', { exact: true })).toBeVisible();
    await expect(legacyChrome(page), 'a 404 under /legacy fell through to the top-level page').toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the previous app' })).toHaveAttribute('href', '/legacy');
    await expect(rail(page)).toHaveCount(0);
  });

  test('a stale link from an old email offers the front page, and does not demand a sign-in first', async ({ page }) => {
    await page.goto('/no-such-page-at-all');
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('/no-such-page-at-all', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the front page' })).toHaveAttribute('href', '/');
    // Neither shell: this one is outside both.
    await expect(rail(page)).toHaveCount(0);
    await expect(legacyChrome(page)).toHaveCount(0);
  });

  test('a soft 404 tells crawlers not to index it, because the server answered 200', async ({ page }) => {
    await page.goto('/app/no-such-screen');
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('leaving a soft 404 takes the noindex with it, so a real screen is not left marked', async ({ page }) => {
    await page.goto('/app/no-such-screen');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await page.getByRole('link', { name: 'Go to your dashboard' }).click();
    await expect(page).toHaveURL(at('/app'));
    await expect(page.locator('meta[name="robots"]'),
      'the dashboard was left carrying the 404 page\'s noindex').toHaveCount(0);
  });

  // DEFECT — routes.tsx:217-229 draws NotFound with the W360 vocabulary
  // (`className="lede"`, `"note mono"`, `"btn primary"`), and every one of
  // those rules is scoped `.w360 .btn { … }` in apps/web/src/w360/w360.css:378,
  // :102. Inside /app that scope exists, because Shell.tsx wraps the Outlet in
  // `<div className="w360">`. The other two mounts have no such ancestor —
  // /legacy is the MUI shell, and the top-level catch-all has no shell at
  // all and never loads w360.css — so the way back renders as a bare blue
  // underlined anchor on exactly the two pages a stranger from a stale link
  // reaches. That is the failure this component's own comment says it exists
  // to replace: "unstyled black text … with no nav, no wordmark and no way
  // back". The owner is owed one presentation of this page everywhere: give
  // NotFound its own scoped wrapper (or inline styles, the way ErrorBoundary
  // already does for precisely this reason) instead of borrowing a stylesheet
  // that is only present on one of its three mounts.
  test.fail('the way back off a 404 is drawn as a button wherever the 404 happens', async ({ page }) => {
    for (const [path, label] of [
      ['/no-such-page-at-all', 'Go to the front page'],
      ['/legacy/no-such-screen', 'Go to the previous app'],
    ] as const) {
      await page.goto(path);
      const cta = page.getByRole('link', { name: label });
      await expect(cta).toBeVisible({ timeout: 20_000 });
      await expect(cta, `${path} draws its way out as bare text`)
        .not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. The doors — RequireAuth
// ═══════════════════════════════════════════════════════════════════════

test.describe('the doors', () => {
  test('a signed-in owner who opens the sign-in page is taken back into the app, not asked again', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(at('/app'));
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible({ timeout: 20_000 });
  });

  test.describe('with no account at all', () => {
    test.use({ signedIn: false });

    test('every part of the app asks me to sign in first, including the ones that do not exist', async ({ page }) => {
      test.slow();
      for (const path of [
        '/app',
        '/app/properties',
        '/app/papers',
        `/app/records/${ID.parcel}`,
        `/app/services/${TICKET.placed}`,
        '/app/no-such-screen',
        '/legacy',
        '/legacy/tools',
        '/legacy/no-such-screen',
      ]) {
        await page.goto(path);
        await expect(page, `${path} let a stranger through`).toHaveURL(at('/login'));
        await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible({ timeout: 20_000 });
      }
    });

    test('the address I was aiming for is kept, so signing in finishes the journey', async ({ page }) => {
      const aimed = `/app/records/${ID.parcel}/money?from=email`;
      await page.goto(aimed);
      await expect(page).toHaveURL(at('/login'));
      // RequireAuth.tsx hands the attempted path to /login in router state, and
      // LoginPage.tsx:45 reads it back as `returnTo`. Nothing on the page
      // shows it — there is no visible affordance to assert — so the history
      // entry the router wrote is the only place it can be seen.
      const state = await page.evaluate(() => (history.state as { usr?: { returnTo?: string } } | null)?.usr);
      expect(state?.returnTo, 'the address the visitor aimed at was dropped on the way to /login').toBe(aimed);
    });

    test('every public door opens with no account', async ({ page }) => {
      test.slow();
      for (const path of PUBLIC_ROUTES) {
        await page.goto(path);
        await expect(page, `${path} demanded a sign-in`).toHaveURL(at(path));
        await expect(page.getByRole('heading', { level: 1 }).first(), `${path} drew no heading`)
          .toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
      }
    });

    test('a beneficiary following a verification link is never asked to sign in', async ({ page }) => {
      // routes.tsx's own header promises this: "invitees follow this link
      // before they have accounts". Both spellings of the link are live.
      for (const path of ['/verify/w-invite-token', '/active/w-invite-token']) {
        await page.goto(path);
        await expect(page, `${path} bounced an invitee to /login`).toHaveURL(at(path));
        await expect(page.getByText('Verify membership')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText('w-invite-token')).toBeVisible();
      }
    });

    test('a shared kit opens for whoever holds the link, with no account behind it', async ({ page, world }) => {
      // The seal answers /api/gateway/capabilities with the app-capabilities
      // shape, which is a different endpoint under the same prefix; this
      // screen needs a kit, so the test brings one.
      world.route(/\/api\/gateway\/capabilities\/shares\//, () => ({
        json: {
          title: 'Sy 214/2 — papers for a buyer',
          scope: 'shares',
          expiresOn: '30/09/2026',
          items: [{ id: PAPER.deed, title: 'Sale deed 4412 of 1998', kind: 'title', available: true }],
          boundary: null,
        },
      }));
      await page.goto('/share/w-share-token');
      await expect(page).toHaveURL(at('/share/w-share-token'));
      await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2 — papers for a buyer' }))
        .toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Available until 30/09/2026')).toBeVisible();
    });

    test('a job link opens the job, not the kit, because the address says which it is', async ({ page, world }) => {
      // RecipientAccess reads its scope off the pathname (RecipientAccess.tsx:24),
      // so /work and /share are the same screen told two different things.
      world.route(/\/api\/gateway\/capabilities\/work\//, () => ({
        json: {
          title: 'Corner survey at Sy 214/2',
          scope: 'work',
          expiresOn: '30/09/2026',
          statusLabel: 'Waiting to be accepted',
          note: 'Eight corners to establish.',
          items: [],
          boundary: null,
          actions: ['assign'],
        },
      }));
      await page.goto('/work/w-work-token');
      await expect(page).toHaveURL(at('/work/w-work-token'));
      await expect(page.getByRole('heading', { level: 1, name: 'Corner survey at Sy 214/2' }))
        .toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { level: 2, name: 'Waiting to be accepted' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Accept this job' })).toBeVisible();
    });

    test('a wrong address is still a wrong address, not a sign-in wall', async ({ page }) => {
      // The top-level catch-all sits outside RequireAuth on purpose: whoever
      // followed a dead link may have no account to sign in with.
      await page.goto('/no-such-page-at-all');
      await expect(page).toHaveURL(at('/no-such-page-at-all'));
      await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible({ timeout: 20_000 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. The previous app, still routed
// ═══════════════════════════════════════════════════════════════════════

test.describe('the previous app', () => {
  // The console guard is off for this block alone, and for one named reason:
  // /legacy/profile loops on itself while its query is pending (the defect is
  // written up under "while its API is thinking", below). Whether it logs
  // during this sweep depends on how fast the answer comes back, and a sweep
  // of twelve addresses must not go red or green on that. Every other
  // assertion here is unchanged.
  test.use({ allowConsole: true });

  test('every screen the redesign has not reached is still at its own address', async ({ page }) => {
    test.slow();
    for (const { path, heading } of LEGACY_SCREENS) {
      await page.goto(path);
      await expect(page, `${path} must resolve`).toHaveURL(at(path));
      await expect(page.getByRole('heading', { level: 1, name: heading }).first(),
        `${path} must draw its own screen`).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(NOT_FOUND), `${path} must not be a 404`).toHaveCount(0);
    }
  });

  test('the previous app brings its own frame, not the new one', async ({ page }) => {
    await page.goto('/legacy');
    await expect(legacyChrome(page)).toBeVisible({ timeout: 20_000 });
    await expect(rail(page), 'the two shells were drawn at the same time').toHaveCount(0);
  });

  // DEFECT — apps/web/src/layout/AppShell.tsx:79-90 points every entry in the
  // previous app's own menu at /app/*, not /legacy/*. So from /legacy/tools,
  // "Tools" in the menu beside it navigates to /app/tools — the "Not yet
  // redrawn" card whose only button is "Open Tools", which comes straight
  // back to /legacy/tools. Every other entry does the same, which means the
  // previous app cannot reach a single one of its own screens from its own
  // navigation; the only ways in are a typed URL or a Section card. The same
  // line is why AppShell.tsx:147 highlights nothing while you are in there —
  // it compares the pathname against /app paths that can never match.
  // The owner is owed a menu that navigates the app it is drawn inside.
  test.fail('the previous app\'s own menu can get me around the previous app', async ({ page }) => {
    await page.goto('/legacy/tools');
    await expect(legacyChrome(page)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Audit Log' }).first().click();
    await expect(page, 'the previous app\'s menu ejected me into the new app')
      .toHaveURL(at('/legacy/audit'));
  });
});

test.describe('the previous app, while its API is thinking', () => {
  // This one test IS about what gets logged, so the teardown guard is off and
  // the assertion is made in the body where it can name the screen.
  test.use({ allowConsole: true });

  // DEFECT — /legacy/profile burns the main thread until its query lands.
  //
  // apps/web/src/data/useLiveOrSample.ts:57 returns
  // `q.data?.data ?? emptyLike(sample)` — and while the query is PENDING,
  // `emptyLike(sample)` builds a brand-new object on every render. ProfilePage
  // .tsx:69-77 has `useEffect(… , [me])` seeding its form from that object,
  // and two of the six setters it calls (`setInterests`, `setPrefs`) store
  // freshly-split ARRAYS, so React cannot bail out on equality: effect →
  // setState → render → new `me` → effect → … until React gives up with
  // "Maximum update depth exceeded".
  //
  // It is invisible on a fast answer and certain on a slow one, which is why
  // it shows up as an intermittent failure rather than a broken screen — and
  // why the sweep above runs with the console guard off. What the owner gets
  // on a bad connection is a screen that pins a core and logs a wall of
  // errors while it waits. The owner is owed a stable identity for the
  // pending value — memoise `emptyLike(sample)` in useLiveOrSample, or seed
  // the form from the settled query rather than from every render of it.
  test.fail('the previous app\'s Profile waits for the profile instead of spinning while it waits', async ({ page, consoleErrors }) => {
    // A slow answer, not a sleep in the test: the pending window is the whole
    // scenario, so it has to be wide enough to see.
    await page.route('**/api/gateway/pattadar/graphql', async (route) => {
      if (/\bweb\s*\{/.test(route.request().postData() ?? '')) return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Sealed: the previous app is not part of this world.' }] }),
      });
    });

    await page.goto('/legacy/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible({ timeout: 20_000 });
    expect(consoleErrors, 'Profile looped on itself while waiting for its own data').toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. A screen that will not download
// ═══════════════════════════════════════════════════════════════════════

test.describe('a screen that will not download', () => {
  // ErrorBoundary.componentDidCatch logs the stack deliberately — "a boundary
  // that hides the stack from the people fixing it is worse than the white
  // screen it replaced" — and the browser logs the aborted module fetch. Both
  // are the point of every test below, not an accident in them.
  test.use({ allowConsole: true });

  /** Refuse one lazy chunk, by the source path the router imports it from. */
  const breakChunk = (page: Page, module: RegExp) =>
    page.route((url) => module.test(url.pathname), (route) => route.abort());

  test('a screen whose code will not download says so, and does not take the app down with it', async ({ page }) => {
    await breakChunk(page, /\/w360\/pages\/Wallet\.tsx$|\/Wallet-[A-Za-z0-9_-]+\.js$/);
    await page.goto('/app/wallet');

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Pattadar updated while this tab was open')).toBeVisible();
    await expect(page.getByText('Nothing you have saved is affected.')).toBeVisible();
    // Contained to the one screen: the frame around it is untouched.
    await expect(rail(page), 'one dead chunk white-paged the app').toBeVisible();
    await expect(brand(page)).toBeVisible();
  });

  test('a dead chunk offers the reload that actually fixes it, and nothing that does not', async ({ page }) => {
    await breakChunk(page, /\/w360\/pages\/Wallet\.tsx$|\/Wallet-[A-Za-z0-9_-]+\.js$/);
    await page.goto('/app/wallet');
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible({ timeout: 20_000 });
    // ErrorBoundary.tsx keeps "Go to your dashboard" for a render fault. A
    // stale chunk is not one, and the rail is already right there.
    await expect(page.getByRole('button', { name: 'Go to your dashboard' })).toHaveCount(0);
  });

  // DEFECT — one dead chunk poisons every screen after it, until a reload.
  //
  // routes.tsx:151-159 wraps every route's element in the SAME shape —
  // `<ErrorBoundary><Suspense><Component/></Suspense></ErrorBoundary>` — so as
  // the Outlet swaps one route's element for another's, React sees an
  // ErrorBoundary of the same type in the same position and keeps the
  // instance, state and all. ErrorBoundary.tsx only ever SETS `state.error`
  // (getDerivedStateFromError); nothing anywhere clears it. So after
  // /app/wallet fails to download, clicking Papers in the rail changes the
  // URL, lights the rail, and leaves "Pattadar updated while this tab was
  // open" sitting in the content pane — for Papers, for Properties, for every
  // address the person tries next.
  //
  // That is the opposite of what routes.tsx:142-150 says the boundary is for:
  // "the failure is contained to the one screen that could not load". It is
  // contained to the shell, not to the screen. The owner is owed a boundary
  // that forgets on a route change — `<ErrorBoundary key={pathname}>` in
  // `suspended()`, or a reset when the location moves — so that Reload is the
  // way out of the ONE broken screen rather than out of the whole app.
  test.fail('the rest of the app still works around the screen that could not load', async ({ page }) => {
    await breakChunk(page, /\/w360\/pages\/Wallet\.tsx$|\/Wallet-[A-Za-z0-9_-]+\.js$/);
    await page.goto('/app/wallet');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    await rail(page).getByRole('link', { name: 'Papers', exact: true }).click();
    await expect(page).toHaveURL(at('/app/papers'));
    await expect(page.getByRole('heading', { level: 1, name: 'Papers' }),
      'the screen after the broken one is still showing the broken one').toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('even the shell failing to arrive says something, instead of a white page', async ({ page }) => {
    await breakChunk(page, /\/w360\/Shell\.tsx$|\/Shell-[A-Za-z0-9_-]+\.js$/);
    await page.goto('/app');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Pattadar updated while this tab was open')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. The screens still answer from the world while all of this happens
// ═══════════════════════════════════════════════════════════════════════

test('a failing shell query does not turn every address into a 404', async ({ page, world }) => {
  // The rail is drawn from `portfolio` and `orders`. When those fall over the
  // frame must still be a frame — a routing failure and a data failure are
  // different sentences and must not be told with the same one.
  world.set('portfolio', World.gqlError('the portfolio store is down'));
  world.set('orders', World.gqlError('the work queue is down'));
  await page.goto('/app/papers');
  await expect(page.getByRole('heading', { level: 1, name: 'Papers' })).toBeVisible({ timeout: 20_000 });
  await expect(rail(page)).toBeVisible();
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
});

test('a shell query that never answers still lets every address resolve', async ({ page, world }) => {
  world.set('portfolio', World.never());
  world.set('orders', World.never());
  await page.goto('/app/properties');
  await expect(page).toHaveURL(at('/app/properties'));
  await expect(rail(page)).toBeVisible({ timeout: 20_000 });
  // The avatar is the one piece of chrome that waits on the portfolio, and it
  // says "Your account" rather than pretending to know whose it is.
  await expect(page.getByLabel('Your account', { exact: true })).toBeVisible();
});
