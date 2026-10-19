/**
 * The page head standard — design.md § Page head (founder decision,
 * 09/10/2026), swept across the app.
 *
 * scripts/shared-components-tests.ts holds the SOURCE to the standard (every
 * page composes `PageHead`, commands are `HeadActions` data, no top-level
 * eyebrow). This holds what the BROWSER draws, page by page, so a head that
 * passes the guard and still renders wrong — a second h1, a tab with no name,
 * a filled button that is not rightmost, a view toggle back in the head —
 * fails here:
 *
 *   · one h1, inside the one `header.pagehead`;
 *   · the tab reads "{title} · Pattadar" ("Home · Pattadar" on Home), and a
 *     property's tabs read "LP {survey no} · {extent} {unit} · Pattadar";
 *   · a top-level page has no eyebrow; a detail page has crumbs ending at
 *     itself and never an eyebrow with them;
 *   · at most one filled head button, then the ⋮ last, at most two outlined
 *     ones before the ⋮, and no filled button on a detail page;
 *   · no view toggle or search in the head; the band orders its right half
 *     tally → search → sort → view;
 *   · on a phone, only the filled primary and the ⋮ stay on the title row,
 *     the title never clips, and nothing scrolls sideways;
 *   · every top-level rail page with something on file states its figures
 *     in a summary line under the title (slot 3, "Summary"), and a first-run
 *     page draws the title alone.
 */
import { test, expect } from '../fixtures/harness';
import type { Page, World } from '../fixtures/harness';
import { APP_ROUTES, HANGERS, ID, TICKET } from '../fixtures/ids';

type Kind = 'top' | 'detail' | 'flow';

/** Every signed-in top-level route, and the detail screens the seed can open. `/order`
 *  is a flow (properties, services, review) under one fixed title.
 *  `world` answers a screen's own reads; a not-found, failed or unknown
 *  address is swept too, because those draw the head as well. */
const PAGES: Array<{ path: string; kind: Kind; world?: Record<string, unknown> }> = [
  ...APP_ROUTES.map((path) => ({ path, kind: (path === '/order' ? 'flow' : 'top') as Kind })),
  { path: '/desk/associates', kind: 'top' },
  { path: '/admin/members', kind: 'top' },
  { path: '/admin/catalogue', kind: 'top' },
  { path: '/admin/compliance', kind: 'top' },
  { path: '/admin/geography', kind: 'top' },
  // Every record tab, under the one record head.
  ...HANGERS.map((h) => ({ path: `/properties/${ID.parcel}${h ? `/${h}` : ''}`, kind: 'detail' as Kind })),
  { path: `/properties/${ID.parcel}/request`, kind: 'detail' },
  { path: `/services/${TICKET.placed}`, kind: 'detail' },
  { path: '/services/no-such-order', kind: 'detail', world: { ticket: null } },
  { path: '/papers/shelf/title', kind: 'detail' },
  { path: '/papers/shelf/no-such-shelf', kind: 'detail' },
  { path: `/desk/jobs/${TICKET.placed}`, kind: 'detail' },
  { path: '/desk/associates/as-ravi', kind: 'detail' },
  { path: '/desk/coverage', kind: 'detail' },
  { path: '/desk/enrol', kind: 'detail' },
  // Not on file: the head still says so, with crumbs back.
  { path: '/groups/no-such-group', kind: 'detail' },
  { path: '/holdings/no-such-holding', kind: 'detail', world: { combinedProperty: null } },
  { path: '/heir/no-such-member', kind: 'flow', world: { 'root.myHeirRecords': [] } },
  { path: '/no-such-screen', kind: 'top' },
];

/** Root-schema reads the swept screens make that fixtures/seed.ts does not
 *  answer (the same set 24-responsive.spec.ts sweeps with). Empty is enough:
 *  each screen draws its head over its empty state. */
const ROOT_READS = {
  'root.auditTrail': [],
  'root.sroOffices': [],
  'root.feeSchedule': [],
  'root.marketValues': [],
  'root.invitations': [],
  'root.groups': [],
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

/** The screen has arrived: its lazy chunk loaded, nothing busy, the h1 drawn. */
async function arrived(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('progressbar', { name: 'Loading' })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('header.pagehead h1')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

const head = (page: Page) => page.locator('main header.pagehead');

/** A property's own tabs, whose browser tab names the land rather than the h1. */
const PROPERTY_TABS = new Set<string>(HANGERS.map((h) => `/properties/${ID.parcel}${h ? `/${h}` : ''}`));

test.describe('every page opens with the one page head', () => {
  for (const { path, kind, world: reads } of PAGES) {
    test(`${path} — one h1, a named tab, and commands in their places`, async ({ page, world }) => {
      world.setAll({ ...ROOT_READS, ...reads });
      // The server's acre unit is 'ac' (web360.py); the seed spells it 'acres'.
      const record = world.seedOf<unknown>('record') as (vars: Record<string, unknown>) => Record<string, unknown>;
      if (PROPERTY_TABS.has(path)) world.set('record', (vars: Record<string, unknown>) => ({ ...record(vars), extentUnit: 'ac' }));
      await arrived(page, path);

      // One h1, and it is the head's.
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(head(page)).toHaveCount(1);
      const title = (await head(page).locator('h1').innerText()).trim();

      // The tab (V1). A property's tab names the land: Sy 214/2, 4.30 ac.
      await expect(page).toHaveTitle(PROPERTY_TABS.has(path) ? 'LP 214/2 · 4.30 acres · Pattadar'
        : `${path === '/home' ? 'Home' : title} · Pattadar`);

      // Wayfinding: one device, never two.
      const crumbs = head(page).locator(':scope > .crumbs');
      const eyebrow = head(page).locator(':scope > .eyebrow');
      if (kind === 'top') {
        await expect(eyebrow, `${path} is top-level and has an eyebrow`).toHaveCount(0);
        await expect(crumbs).toHaveCount(0);
      }
      if (kind === 'detail') {
        await expect(crumbs).toHaveCount(1);
        await expect(crumbs.locator('[aria-current="page"]').last()).toBeVisible();
        await expect(eyebrow, `${path} has crumbs and an eyebrow`).toHaveCount(0);
      }

      // Commands: outlined secondaries, then one filled primary, then the ⋮ last.
      const actions = head(page).locator('.pagehead-row > .actions');
      const filled = actions.locator('.btn.primary');
      expect(await filled.count(), `${path} has more than one filled head button`).toBeLessThanOrEqual(1);
      if (kind === 'detail') await expect(filled, `${path} is a detail page with a filled head button`).toHaveCount(0);
      expect(await actions.locator(':scope > .btn:not(.primary)').count()).toBeLessThanOrEqual(2);
      if (await actions.count()) {
        const order = await actions.evaluate((el) => [...el.children].map((c) =>
          c.classList.contains('primary') ? 'primary' : c.classList.contains('btn') ? 'secondary' : 'more'));
        const rank = { secondary: 0, primary: 1, more: 2 } as const;
        const ranks = order.map((o) => rank[o as keyof typeof rank]);
        expect(ranks, `${path} head actions are ${order.join(', ')}`).toEqual([...ranks].sort((a, b) => a - b));
      }

      // View toggles and search live in the band, never the head.
      await expect(head(page).getByRole('group', { name: 'View' })).toHaveCount(0);
      await expect(head(page).locator('input')).toHaveCount(0);

      // The band's right half, in order: tally, search, sort, view.
      const band = page.locator('main .filterbar.band').first();
      if (await band.count()) {
        const seen = await band.evaluate((el) => {
          const parts: Array<[string, Element | null]> = [
            ['filter', el.querySelector(':scope > .addfilter')],
            ['tally', el.querySelector(':scope > .tally')],
            ['search', el.querySelector('.band-tools .bandsearch, .band-tools .bandsearch-open')],
            ['sort', el.querySelector('.band-tools .sortcycle')],
            ['view', el.querySelector('.band-tools [role="group"]')],
          ];
          return parts.filter(([, node]) => node)
            .sort(([, a], [, b]) => (a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
            .map(([name]) => name);
        });
        const canon = ['filter', 'tally', 'search', 'sort', 'view'];
        expect(seen, `${path} band order`).toEqual(canon.filter((n) => seen.includes(n)));
      }
    });
  }
});

test.describe('on a phone, the head keeps one row of commands', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const { path, world: reads } of PAGES) {
    test(`${path} — the filled primary stays, the rest go to the ⋮, nothing clips @phone`, async ({ page, world }) => {
      world.setAll({ ...ROOT_READS, ...reads });
      await arrived(page, path);

      const actions = head(page).locator('.pagehead-row > .actions');
      await expect(actions.locator(':scope > .btn:not(.primary)'), `${path} keeps outlined buttons on a phone`)
        .toHaveCount(0);
      const filled = actions.locator('.btn.primary');
      if (await filled.count()) {
        await expect(filled).toBeInViewport();
        const box = (await filled.boundingBox())!;
        expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(390);
      }

      const h1 = head(page).locator('h1');
      expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${path} clips its title`).toBe(true);
      // Crumbs show only the parent (design.md § Page head, Phone).
      const crumbs = head(page).locator(':scope > .crumbs');
      if (await crumbs.count()) await expect(crumbs).toHaveClass(/\bcrumbs-parent\b/);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('the named exceptions still name the tab', () => {
  // Checkout keeps its own bar (design.md § Page head, "Named exceptions"),
  // but its tab is named after what is being paid for, never bare "Pattadar".
  test('checkout names the tab after the service', async ({ page }) => {
    await page.goto(`/services/${TICKET.placed}/pay`);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveTitle(`${(await h1.innerText()).trim()} · Pattadar`);
  });
});

test.describe('a command the phone moved into the ⋮', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // RecordHead's "Share securely" hands focus back to whatever opened it. On
  // a phone that is the ⋮, not the button the phone does not draw; focus on
  // <body> sends a keyboard or switch user back to the top of the page.
  test('closing the panel it opened puts focus back on the ⋮ @phone', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}`);
    const more = head(page).getByRole('button', { name: 'Actions for Sy 214/2' });
    await expect(more).toBeVisible({ timeout: 20_000 });
    await more.click();
    await page.getByRole('menuitem', { name: 'Share securely' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(more).toBeFocused();
  });
});

// ── The summary line (design.md § Page head, slot 3 "Summary") ──────────
//
// scripts/shared-components-tests.ts SC-H11 holds the source: every rail
// page passes a `summary` to its PageHead. This holds what is drawn. Each
// answer below is in the server's shape; ROOT_READS answers these reads
// empty (a first run), so the worlds here give each page something to count.

/** A full GroupRow (groupsData.ts), as 30-groups.spec.ts builds one: a
 *  family holding two parcels. */
const GROUP = {
  id: 'grp-family', ownerUserId: 'u-1', type: 'family', name: 'Telukutla Family', description: '',
  myRole: 'Head', landCount: 2, memberCount: 2, totalExtent: 4.5, totalShare: 0,
  createdAt: '2026-09-01T00:00:00Z', parcelCount: 2, propertyCount: 0, headName: 'You',
  lastActiveAt: '2026-09-20T00:00:00Z', inactivityStage: 'active', inactivityNextAt: '',
  inactivityLastOutcome: '', inactiveContactGaps: 0,
};

/** One holding (`combinedProperties`), as 29-holdings-list.spec.ts builds one. */
const HOLDING = {
  id: 'cv-banda', name: 'Banda farm', note: '', memberCount: 2, parcelCount: 2, propertyCount: 0,
  farmExtent: 34.53, plotExtent: 0, builtExtent: 0, extentLine: '', marketValue: 0, invested: 0,
  paperCount: 0, surveyedCount: 2, combinedSpend: 0, memberSpend: 0, placeLine: 'Markapur, Prakasam',
  isComplete: true, createdAt: '2026-10-02', updatedAt: '2026-10-01', members: [],
};

/** One uploaded village map, as GET /village-maps answers (main.py
 *  village_maps_index: an array). No outline, so nothing else is fetched. */
const VILLAGE_MAP = {
  key: 'katragunta', village: 'KATRAGUNTA', file: 'katragunta.json', plots: 7,
  source: 'katragunta.kmz', uploadedOn: '2026-09-10T09:12:00', uploaded: true,
  acres: 26.79, centre: [15.7396, 79.2708], outline: [],
};

/** One pending invitation, as 19-sections-legacy.spec.ts builds one. */
const INVITATION = {
  id: 'w-inv-brother', scopeType: 'parcel', scopeId: 'Sy 214/2', role: 'view',
  inviteeContact: '+91 98480 11111', token: 'tok-brother', expiry: '2026-12-31',
  status: 'pending', createdAt: '2026-08-02T09:30:00Z',
};

/** One AuditEventV2 row, as main.py _audit_v2_row serialises it. */
const AUDIT_EVENT = {
  id: 'w-aud-corrected', occurredAt: '2026-09-20 05:30:00+00:00', sourceService: 'api',
  actorPrincipal: 'shankarreddy.t', actorKind: 'owner', affectedOwner: 'shankarreddy.t',
  action: 'record.corrected', resourceType: 'parcel', resourceId: ID.parcel, outcome: 'success',
  dataClass: 'operational', requestId: 'req-w-1', metadata: '{"label": "Sy 214/2"}',
};

/** Every top-level rail page (Shell.tsx), with what gives it figures. Not
 *  swept: /help, SC-H11's named exception (nothing to count), and the
 *  two super-admin screens, /admin/compliance and /admin/geography —
 *  the seed is not a super-admin, and Government geography's reference read
 *  is one root document of seven fields that the world answers by its first
 *  field only. SC-H11 holds those two in the source. */
const RAIL: Array<{ path: string; reads?: Record<string, unknown>; setup?: (world: World) => void }> = [
  { path: '/home' },
  { path: '/properties' },
  { path: '/groups', reads: { 'root.groups': [GROUP] } },
  { path: '/holdings', reads: { combinedProperties: [HOLDING] } },
  {
    path: '/maps',
    setup: (world) => { world.route(/\/pattadar\/village-maps$/, () => ({ json: [VILLAGE_MAP] })); },
  },
  { path: '/papers' },
  { path: '/shared' },
  { path: '/assigned' },
  { path: '/invitations', reads: { 'root.invitations': [INVITATION] } },
  {
    path: '/refer',
    reads: {
      'root.myReferral': {
        code: 'SHANKAR123', path: '/r/SHANKAR123', joined: 2, qualified: 1, creditsEarned: 1,
        monthlyCap: 10, referredBy: '',
        rewards: [{ kind: 'ai_credit', units: 1, state: 'earned', side: 'referrer', createdAt: '2026-09-20T10:00:00Z' }],
      },
    },
  },
  { path: '/services' },
  { path: '/wallet' },
  {
    path: '/profile',
    reads: {
      'root.me': { ...(ROOT_READS['root.me']), districtsOfInterest: 'w-dist-prakasam', kycRefMasked: 'XXXX XXXX 4471' },
      'root.districts': [{ id: 'w-dist-prakasam', name: 'Prakasam', code: '20' }],
    },
  },
  {
    path: '/account',
    // GET /account/consent as account.py answers it: purpose keys, not objects.
    setup: (world) => {
      world.route(/\/api\/gateway\/account\/consent/, () => ({
        json: { version: '2026-10-06', purposes: ['document_processing', 'ai_extraction'], acceptedAt: '2026-09-10T09:00:00+00:00' },
      }));
    },
  },
  { path: '/audit', reads: { 'root.auditTrail': [AUDIT_EVENT] } },
  { path: '/admin/members' },
  { path: '/desk' },
  { path: '/tools', reads: {
    'root.sroOffices': [
      { id: 'w-sro-markapur', code: '1607', name: 'Markapur', drZone: 'Ongole', district: 'Prakasam', mandal: 'Markapur' },
      { id: 'w-sro-mangalagiri', code: '0906', name: 'Mangalagiri', drZone: 'Vijayawada', district: 'Guntur', mandal: 'Mangalagiri' },
    ],
  } },
];

/** First run: the owner has none of what the page lists yet (ROOT_READS and
 *  the seed's empty `combinedProperties`). */
const FIRST_RUN = ['/groups', '/holdings', '/invitations', '/refer', '/profile', '/audit'];

test.describe('every rail page states its figures under the title', () => {
  for (const { path, reads, setup } of RAIL) {
    test(`${path} draws a summary line under its h1`, async ({ page, world }) => {
      world.setAll({ ...ROOT_READS, ...reads });
      setup?.(world);
      await arrived(page, path);

      const summary = head(page).locator('.pagehead-summary');
      await expect(summary).toHaveCount(1);
      // Text, not the loading placeholder, which draws none.
      await expect(summary).toHaveText(/\S/);
      const h1 = (await head(page).locator('h1').boundingBox())!;
      const line = (await summary.boundingBox())!;
      expect(line.y, `${path} draws its summary above the bottom of its h1`).toBeGreaterThanOrEqual(h1.y + h1.height - 1);
    });
  }

  for (const path of FIRST_RUN) {
    test(`${path} on a first run draws the title alone`, async ({ page, world }) => {
      world.setAll(ROOT_READS);
      await arrived(page, path);
      await expect(head(page).locator('.pagehead-summary')).toHaveCount(0);
    });
  }
});
