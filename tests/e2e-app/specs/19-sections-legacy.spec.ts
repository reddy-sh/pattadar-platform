/**
 * The sections redrawn out of the previous app, and the app still behind them.
 *
 * Every rail entry has a W360 screen now. Invitations was the last to leave
 * the "still in the previous version" signpost (w360/pages/Section.tsx, now
 * deleted); it, Tools and Profile are tested near the end of this file, and
 * /legacy/invitations, /legacy/tools and /legacy/profile only redirect.
 *
 * `/legacy` is not a second app on a second port. It is the same bundle one
 * route over (routes.tsx `/legacy`), wrapped in the older MUI shell
 * (layout/AppShell.tsx), drawing the twelve screens the W01–W15 handover left
 * in place. Which means this file owns two very different surfaces, and four
 * things a reader must know before changing anything below.
 *
 *  · THE LEGACY SCREENS SPEAK A DIFFERENT API. They call `gql()` with the old
 *    flat documents — `{ groups { … } }`, `{ auditEvents { … } }`,
 *    `{ me { … } }` — not the `{ web { … } }` surface every other spec here
 *    drives. fixtures/world.ts routes on `web { <field>` and answers anything
 *    else with HTTP 400, which never reaches `escapes()`: the seal refuses it,
 *    `useLiveOrSample` swallows the throw (data/useLiveOrSample.ts:50) and
 *    hands the screen a SHAPE-CORRECT EMPTY dataset with `isSample: true`. So
 *    the default state of every legacy screen in this world is its "Service
 *    unreachable" branch — which is worth asserting on its own, because it is
 *    also exactly what the founder sees when the local api is down. When a
 *    test wants the loaded branch it installs `legacyApi()`, registered on the
 *    page AFTER the seal (so Playwright consults it first) and handing every
 *    `web { … }` document back to the world with `route.fallback()`. None of
 *    this belongs in fixtures/seed.ts: the legacy surface is twelve screens
 *    wide and only this file and 07-record-people ever open it.
 *  · A REFUSED /api CALL IS A CONSOLE ERROR. Chromium logs "Failed to load
 *    resource: the server responded with a status of 400" for the seal's
 *    refusal, so every describe that opens a legacy screen WITHOUT answering
 *    its queries carries `test.use({ allowConsole: true })`, with that reason
 *    named on the spot.
 *  · THE LEGACY SHELL'S MENU POINTS AT THE NEW APP. AppShell.tsx:75-90 lists
 *    twelve items whose paths all begin `/app/`, and that shell is only ever
 *    mounted under `/legacy/`. Both consequences — nothing is ever marked
 *    current, and one tap throws you out of the previous app — are recorded as
 *    `test.fail()` rather than softened.
 *  · ONE CALL GENUINELY ESCAPES THE SEAL, and it is named where it happens:
 *    `POST /api/gateway/storage/files` (the legacy Vault's Upload button,
 *    pages/documents/storage.ts:52). fixtures/seed.ts seeds
 *    `storage/(nodes|folders)` and `storage/files/:id/content` but not the
 *    upload door itself, and this suite does not own that seed.
 *  · A CHIP INSIDE A TOOLTIP IS NOT NAMED BY ITS TEXT. MUI's Tooltip puts its
 *    title on the child as an `aria-label`, so an audit row's action cell is
 *    named "create_passbook" rather than "Created a passbook", and a failed
 *    notification's status cell is named after the provider's reason. Both are
 *    asserted in both directions below — what the eye reads by text, what the
 *    screen reader hears by role — and neither is a mistake in the fixture.
 *
 * Nothing here writes: the legacy mutations that do run (create a group, send
 * an invitation, delete a notification, save a profile) are answered inside
 * the browser and asserted from what the screen sent. `refused('…')` is how a
 * write is made to FAIL — a document that simply has no data for its field
 * still resolves through `gql()`, so a refusal has to be a real `errors[]`.
 */
import { test, expect } from '../fixtures/harness';
import type { Page } from '@playwright/test';
import { World } from '../fixtures/world';
import { ID } from '../fixtures/ids';

// ── the legacy GraphQL surface ─────────────────────────────────────────

type Row = Record<string, unknown>;

/** An answer that comes back as a GraphQL `errors[]` — what `gql()` throws on,
 *  and the only way to make a legacy mutation FAIL, since a document with no
 *  data for its field still resolves (api/client.ts:119). */
class Refusal {
  constructor(readonly message: string) {}
}
const refused = (message: string): Refusal => new Refusal(message);

interface Legacy {
  /** One entry per mutation the screen sent: its root field and its variables. */
  sent: Array<{ field: string; vars: Row }>;
  /** Root fields asked for that `answers` had nothing for. Asserted empty by
   *  the tests that care, so a screen gaining a query surfaces by name rather
   *  than as a panel that quietly went blank. */
  unanswered: string[];
}

/**
 * The root fields a legacy document selects, at brace depth 1.
 *
 * Walked rather than regexed because `query($g:String!){ members(groupId:$g) … }`
 * carries identifiers at depth 0 (the variable definitions) and inside the
 * argument list, and neither is a field anybody is asking for.
 */
function rootFields(doc: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < doc.length) {
    const ch = doc[i];
    if (ch === '{') { depth += 1; i += 1; continue; }
    if (ch === '}') { depth -= 1; i += 1; continue; }
    if (depth === 1 && /[A-Za-z_]/.test(ch)) {
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(doc.slice(i))![0];
      i += name.length;
      let j = i;
      while (j < doc.length && /\s/.test(doc[j])) j += 1;
      if (doc[j] === '(') {
        let args = 0;
        while (j < doc.length) {
          if (doc[j] === '(') args += 1;
          else if (doc[j] === ')') { args -= 1; if (args === 0) { j += 1; break; } }
          j += 1;
        }
        i = j;
      }
      out.push(name);
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Answer the previous app's GraphQL surface for one test.
 *
 * `answers` is keyed by root field — `groups`, `auditEvents`, `me`,
 * `createGroup` — and a value may be a function of the operation's variables.
 * Anything the W360 module asks for goes straight back to the world.
 */
async function legacyApi(page: Page, answers: Record<string, unknown> = {}): Promise<Legacy> {
  const out: Legacy = { sent: [], unanswered: [] };
  await page.route(/\/api\/gateway\/pattadar\/graphql/, async (route) => {
    const posted = JSON.parse(route.request().postData() || '{}') as { query?: string; variables?: Row };
    const query = posted.query ?? '';
    if (/\bweb\s*\{/.test(query)) return route.fallback();

    const vars = posted.variables ?? {};
    const data: Row = {};
    for (const field of rootFields(query)) {
      if (!(field in answers)) { out.unanswered.push(field); continue; }
      if (/^\s*mutation/.test(query)) out.sent.push({ field, vars });
      const answer = answers[field];
      if (answer instanceof Refusal) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, errors: [{ message: answer.message }] }),
        });
      }
      data[field] = typeof answer === 'function' ? (answer as (v: Row) => unknown)(vars) : answer;
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
  return out;
}

// ── the cast the legacy surface answers with ───────────────────────────

const GROUP_ID = 'w-grp-telukutla';
const GROUP_2 = 'w-grp-reddy-sons';

/** Every field GROUP_FIELDS selects (pages/families/familiesData.ts:184). */
function group(over: Row = {}): Row {
  return {
    id: GROUP_ID, ownerUserId: 'u-1', type: 'family', name: 'Telukutla family',
    description: 'Who inherits the Katragunta land', myRole: 'Head',
    memberCount: 4, landCount: 2, totalExtent: 7.5, totalShare: 100,
    createdAt: '2026-01-04T00:00:00Z',
    ...over,
  };
}

const GROUPS = [
  group(),
  group({
    id: GROUP_2, type: 'partnership', name: 'Reddy & Sons',
    description: 'The Markapur shop', myRole: 'Managing Partner',
    memberCount: 2, landCount: 1, totalExtent: 0.4, totalShare: 100,
  }),
];

/** Every field MEMBER_FIELDS selects (pages/families/familiesData.ts:171). */
function member(over: Row = {}): Row {
  return {
    id: 'w-mem-brother', ownerUserId: 'u-1', name: 'Venkat Reddy', relation: 'brother',
    gender: 'male', dob: '1979-04-02', phone: '+91 98480 11111', email: '',
    bio: '', photo: '', groupId: GROUP_ID, role: 'Brother', isSelf: false,
    fatherId: '', motherId: '', spouseId: '', isBeneficiary: true, sharePct: 40,
    kind: 'legalheir', status: 'pending', inviteStatus: 'invited', inviteToken: 'tok-venkat',
    phoneVerified: false, emailVerified: false, parcelId: '', presentAddress: '',
    aadhaarMasked: '', isMinor: false, guardianName: '', guardianContact: '',
    maritalStatus: '', spouseName: '', spouseContact: '', spouseStatus: '',
    createdAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

const INVITATIONS = [
  {
    id: 'w-inv-brother', scopeType: 'parcel', scopeId: 'Sy 214/2', role: 'view',
    inviteeContact: '+91 98480 11111', token: 'tok-brother', expiry: '2026-12-31',
    status: 'pending', createdAt: '2026-08-02T09:30:00Z',
  },
  {
    id: 'w-inv-tenant', scopeType: 'passbook', scopeId: 'Khata 4471', role: 'manage',
    inviteeContact: 'lakshmi@example.com', token: 'tok-tenant', expiry: '2026-11-30',
    status: 'accepted', createdAt: '2026-07-19T06:05:00Z',
  },
  {
    id: 'w-inv-bank', scopeType: 'document', scopeId: 'Deed 6950/2018', role: 'view',
    inviteeContact: 'branch@bank.example', token: 'tok-bank', expiry: '2026-09-01',
    status: 'revoked', createdAt: '2026-06-11T11:45:00Z',
  },
];

const NOTIFICATIONS = [
  {
    id: 'w-not-sent', channel: 'email', recipient: 'lakshmi@example.com',
    subject: 'Confirm your details for Sy 214/2', body: 'Open the link to confirm.',
    provider: 'ses', status: 'sent', error: '', createdAt: '2026-08-20T04:15:00Z',
  },
  {
    id: 'w-not-stub', channel: 'sms', recipient: '+91 98480 11111',
    subject: '', body: 'Pattadar: confirm your details for the Katragunta land.',
    provider: 'stub', status: 'stubbed', error: '', createdAt: '2026-08-21T05:00:00Z',
  },
  {
    id: 'w-not-failed', channel: 'whatsapp', recipient: '+91 90000 00000',
    subject: 'Inactivity alert', body: 'No activity for six months.',
    provider: 'gupshup', status: 'failed', error: 'number not on WhatsApp',
    createdAt: '2026-08-22T12:30:00Z',
  },
];

const AUDIT = [
  {
    id: 'w-aud-passbook', actor: 'shankarreddy.t@pattadar.local', action: 'create_passbook',
    target: 'Khata 4471', details: 'Katragunta, Markapur', timestamp: '2026-08-01T05:30:00Z',
  },
  {
    id: 'w-aud-deed', actor: 'shankarreddy.t@pattadar.local', action: 'upload_document',
    target: 'Sale deed 6950/2018', details: 'Sy 214/2', timestamp: '2026-08-14T10:05:00Z',
  },
  {
    // Target is a raw UUID and there is no detail — the entity column must show
    // nothing rather than a machine id (lib/format.ts humanEntity).
    id: 'w-aud-odd', actor: 'venkat@pattadar.local', action: 'rotate_boundary_mark',
    target: '3f2a1b7c-1111-4222-8333-444455556666', details: '', timestamp: '2026-08-30T03:20:00Z',
  },
];

const SRO_OFFICES = [
  { id: 'w-sro-markapur', code: '1607', name: 'Markapur', drZone: 'Ongole', district: 'Prakasam', mandal: 'Markapur' },
  { id: 'w-sro-giddalur', code: '1612', name: 'Giddalur', drZone: 'Ongole', district: 'Prakasam', mandal: 'Giddalur' },
  { id: 'w-sro-mangalagiri', code: '0906', name: 'Mangalagiri', drZone: 'Vijayawada', district: 'Guntur', mandal: 'Mangalagiri' },
];

/** Round rates, so the arithmetic a test asserts is readable on the page. */
const FEES = [
  { id: 'w-fee-sale', regTypeEn: 'Sale', natureEn: 'Sale of immovable property', stampRate: 0.05, transferRate: 0.015, regRate: 0.01, userRate: 0.001 },
  { id: 'w-fee-gift', regTypeEn: 'Gift', natureEn: 'Gift to family member', stampRate: 0.01, transferRate: 0.005, regRate: 0.005, userRate: 0.001 },
];

const MARKET_VALUES = [
  { id: 'w-mv-katragunta-agri', district: 'Prakasam', mandal: 'Markapur', village: 'Katragunta', classification: 'agri', ratePerUnit: 1_850_000, unit: 'acre', effectiveFrom: '2026-04-01' },
  { id: 'w-mv-katragunta-res', district: 'Prakasam', mandal: 'Markapur', village: 'Katragunta', classification: 'residential', ratePerUnit: 4_200, unit: 'sqyd', effectiveFrom: '2026-04-01' },
  { id: 'w-mv-tarlupadu', district: 'Prakasam', mandal: 'Tarlupadu', village: 'Tarlupadu', classification: 'agri', ratePerUnit: 1_100_000, unit: 'acre', effectiveFrom: '2025-10-01' },
  { id: 'w-mv-nidamarru', district: 'Guntur', mandal: 'Mangalagiri', village: 'Nidamarru', classification: 'residential', ratePerUnit: 9_500, unit: 'sqyd', effectiveFrom: '2026-01-01' },
];

const ME = {
  id: 'shankarreddy.t', name: 'Shankar Reddy', email: 'shankarreddy.t@pattadar.local',
  address: 'Katragunta, Markapur mandal, Prakasam', language: 'en',
  districtsOfInterest: 'w-dist-prakasam', notificationPrefs: 'email',
  kycRefMasked: 'XXXX XXXX 4471', mfaEnabled: false,
};

const DISTRICTS = [
  { id: 'w-dist-prakasam', name: 'Prakasam', code: '20' },
  { id: 'w-dist-guntur', name: 'Guntur', code: '17' },
];

const STATES = [
  { id: 'w-st-ap', name: 'Andhra Pradesh', code: 'AP' },
  { id: 'w-st-ts', name: 'Telangana', code: 'TS' },
];

const DEED_TYPES = [
  { id: 'w-dt-sale', regTypeEn: 'Sale', regTypeTe: 'అమ్మకం', natureEn: 'Sale of immovable property', natureTe: 'స్థిరాస్తి అమ్మకం' },
  { id: 'w-dt-gift', regTypeEn: 'Gift', regTypeTe: 'దానం', natureEn: 'Gift to family member', natureTe: '' },
];

/** The two passbooks the group screens and the holdings list share. */
const PASSBOOKS = [
  { id: 'w-pb-4471', ref: 'PB-4471', pattadarNo: '4471', ownerName: 'Shankar Reddy', village: 'Katragunta', mandal: 'Markapur', district: 'Prakasam', totalExtent: 4.3, groupId: GROUP_ID },
  { id: 'w-pb-9012', ref: 'PB-9012', pattadarNo: '9012', ownerName: 'Shankar Reddy', village: 'Tarlupadu', mandal: 'Tarlupadu', district: 'Prakasam', totalExtent: 3.2, groupId: '' },
];

const HOLDING_PARCELS = [
  { id: 'w-pcl-214-2', surveyNo: '214', subdivision: '2', extent: 4.3, unit: 'acre', classification: 'agri', status: 'owned', litigation: false, stake: 'owned', currentOwner: 'Shankar Reddy', purchasePrice: 3_400_000, marketValue: 7_950_000, passbookId: 'w-pb-4471', createdAt: '2026-01-10T00:00:00Z', geoPoint: '' },
  { id: 'w-pcl-88', surveyNo: '88', subdivision: '', extent: 3.2, unit: 'acre', classification: 'agri', status: 'owned', litigation: false, stake: 'owned', currentOwner: 'Shankar Reddy', purchasePrice: 2_100_000, marketValue: 3_520_000, passbookId: 'w-pb-9012', createdAt: '2026-02-10T00:00:00Z', geoPoint: '' },
];

// ── the previous app's own menu ────────────────────────────────────────
//
// The signposts that used to live under /app (w360/pages/Section.tsx) are
// gone: Invitations was the last section without a W360 screen, and it is
// drawn now (w360/pages/Invitations.tsx, tested further down this file).

/** The twelve items the previous app's own menu carries (AppShell.tsx:75-90). */
const LEGACY_MENU = [
  'Dashboard', 'Passbooks', 'Land & Properties', 'Vault', 'Families & Groups',
  'Invitations', 'Notifications', 'Wallet', 'Tools', 'Audit Log',
  'Admin & Ref Data', 'Profile',
] as const;


// ── the shell the previous app still wears ─────────────────────────────

test.describe('the shell the previous app still wears', () => {
  // /legacy/groups is opened without answers on purpose here: the shell is what
  // is under test, and the screen inside it refuses its query with a 400.
  test.use({ allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  test('the previous app still carries its own twelve-item menu', async ({ page }) => {
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();

    // The MUI Drawer sets no navigation landmark, so the menu is addressed by
    // its links. The mobile drawer is kept mounted but display:none at this
    // width, which keeps it out of the accessibility tree and out of these.
    for (const label of LEGACY_MENU) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(1);
    }
  });

  test('the previous app says who is signed in, and offers the way out', async ({ page }) => {
    await page.goto('/legacy/groups');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: /@/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });

  test('the previous app still offers the three theme choices', async ({ page }) => {
    await page.goto('/legacy/groups');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Light' })).toBeVisible();
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemradio', { name: 'High Contrast' })).toBeVisible();
  });

  test('the previous app keeps its footer promise about how dates are written', async ({ page }) => {
    await page.goto('/legacy/groups');
    await expect(page.getByText('Pattadar — your land and property, in one place. Dates shown DD/MM/YYYY.'))
      .toBeVisible();
  });

  test('a mistyped /legacy address keeps the previous app around it and names the address that failed', async ({ page }) => {
    await page.goto('/legacy/no-such-screen');
    await expect(page.getByRole('heading', { level: 1, name: 'There is no page at that address' })).toBeVisible();
    await expect(page.getByText('/legacy/no-such-screen')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the previous app' })).toHaveAttribute('href', '/legacy');
    // The shell is still there — a wrong URL must not strand anyone.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  });

  test('the previous app never marks the screen I am standing on', async ({ page }) => {
    // DEFECT — layout/AppShell.tsx:75-90 points every menu item at /app/<x>
    // while the shell is only ever mounted under /legacy/<x>, so the `selected`
    // test at AppShell.tsx:146-147 is false on every legacy route and NavLink
    // marks nothing. Standing on Families & Groups, the menu shows no current
    // item at all. The owner is owed the item they are looking at, lit.
    test.fail();
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test('one tap on the previous app menu should stay inside the previous app', async ({ page }) => {
    // DEFECT — same cause (AppShell.tsx:75-90). Tapping "Passbooks" inside
    // /legacy navigates to /app/passbooks, which routes.tsx redirects to
    // /app/properties?kind=parcel: the owner is thrown out of the app they were
    // working in, into a screen they did not ask for. They are owed
    // /legacy/passbooks.
    test.fail();
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    await page.getByRole('link', { name: 'Passbooks', exact: true }).click();
    await expect(page).toHaveURL(/\/legacy\/passbooks$/);
  });

  test('leaving the previous app by its menu lands somewhere real, at least', async ({ page }) => {
    // The consolation prize for the defect above: the redirect resolves, so
    // nobody lands on an error page. Asserted so a future fix that breaks the
    // landing is visible even while the defect stands.
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    await page.getByRole('link', { name: 'Passbooks', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/properties\?kind=parcel$/);
    await expect(page.getByText('There is no page at that address')).toHaveCount(0);
  });
});

// ── the old addresses the previous app still answers ───────────────────

test.describe('the old addresses the previous app still answers', () => {
  test.use({ allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  const REDIRECTS: Array<{ from: string; to: RegExp; heading: string | RegExp }> = [
    { from: '/legacy/properties', to: /\/legacy\/parcels\?tab=properties$/, heading: 'Land & Properties' },
    { from: '/legacy/deeds', to: /\/legacy\/documents$/, heading: 'Vault' },
    // The tool aliases now land in this app's Tools screen, tab intact.
    { from: '/legacy/tools', to: /\/app\/tools$/, heading: 'Tools' },
    { from: '/legacy/sro', to: /\/app\/tools\?tab=sro$/, heading: 'Tools' },
    { from: '/legacy/stamp-duty', to: /\/app\/tools\?tab=stamp-duty$/, heading: 'Tools' },
    { from: '/legacy/market-value', to: /\/app\/tools\?tab=market-value$/, heading: 'Tools' },
    { from: '/legacy/calculator', to: /\/app\/tools\?tab=calculator$/, heading: 'Tools' },
  ];

  for (const r of REDIRECTS) {
    test(`${r.from} still lands on the screen that took it over`, async ({ page }) => {
      await page.goto(r.from);
      await expect(page).toHaveURL(r.to);
      await expect(page.getByRole('heading', { level: 1, name: r.heading })).toBeVisible({ timeout: 25_000 });
    });
  }

  test('an old bookmark for one passbook is carried into the previous app with its id', async ({ page }) => {
    // routes.tsx ToLegacyPassbook: a passbook id is not a record id, so the
    // W360 360 would claim it is not in the portfolio — which is false.
    await page.goto('/app/passbooks/pb-1');
    await expect(page).toHaveURL(/\/legacy\/passbooks\/pb-1$/);
  });

  test('a passbook the service could not be asked about is not called not mine', async ({ page }) => {
    // WAS A DEFECT — the owner of a passbook whose api is down was owed a
    // sentence naming the outage, and got none: the header's only signal was a
    // chip reading "Sample data", whose tooltip ("…showing bundled sample
    // data") was both invisible to `getByText` and false — no sample row has
    // painted since 2026-07-26. Fixed with the rest of that vocabulary: the
    // chip now says what actually happened.
    //
    // Note on the mechanism, because the original defect note had it wrong:
    // NotFoundCard is NOT what renders here. `emptyLike` returns a zeroed
    // passbook OBJECT rather than null, so `!pb` is false and the page draws
    // its header. A record with every field blank, under a chip that says the
    // service is unreachable, is the intended shape-correct-emptiness — not a
    // 404 and not an invention.
    await page.goto('/legacy/passbooks/pb-1');
    await expect(page.getByText('Service unreachable')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Passbook not found or not yours')).toHaveCount(0);
    await expect(page.getByText('Sample data')).toHaveCount(0);
  });
});

// ── every legacy screen, with nothing behind it ────────────────────────

test.describe('the previous app with nothing behind it', () => {
  // Every screen below refuses its own query through the seal (HTTP 400) and
  // takes the "Service unreachable" branch. That is the state worth pinning:
  // it is what the founder sees whenever the local api is not running.
  test.use({ allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  test('the old dashboard, with no service, asks for one upload instead of inventing figures', async ({ page }) => {
    await page.goto('/legacy');
    await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening),/ })).toBeVisible();
    await expect(page.getByText('Welcome — start with one upload')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload your passbook' })).toBeVisible();
    await expect(page.getByText('Everything stays in your own secure drive — nothing is shared unless you share it.'))
      .toBeVisible();
  });

  test('the old passbooks screen, with no service, offers the first passbook rather than a blank list', async ({ page }) => {
    await page.goto('/legacy/passbooks');
    await expect(page.getByRole('heading', { level: 1, name: 'Passbooks' })).toBeVisible();
    await expect(page.getByText('Start your land record')).toBeVisible();
    await expect(page.getByText('Up to 5 documents at once · or enter the details manually')).toBeVisible();
  });

  test('the old properties screen, with no service, offers the first property', async ({ page }) => {
    await page.goto('/legacy/parcels');
    await expect(page.getByRole('heading', { level: 1, name: 'Land & Properties' })).toBeVisible();
    await expect(page.getByText('Add your first property')).toBeVisible();
  });

  test('the old vault, with no service, still says which two shelves it has', async ({ page }) => {
    await page.goto('/legacy/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'Vault' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All files' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Registered deeds' })).toBeVisible();
    await expect(page.getByText('Service unreachable')).toBeVisible();
  });

  test('an empty vault should say it is empty', async ({ page }) => {
    // DEFECT — pages/documents/DocumentsTab.tsx:912 suppresses the empty state
    // whenever the folder view is at its top level, and the folder grid above
    // it (line 876) only draws shelves that HAVE files. With nothing filed, the
    // screen paints a header, a search box and an Upload button over a blank
    // page. The founder's zero-state standard asks for a named empty state;
    // the owner is owed "No documents yet" here as much as on any other shelf.
    test.fail();
    await page.goto('/legacy/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'Vault' })).toBeVisible();
    await expect(page.getByText('No documents yet')).toBeVisible();
  });

  test('the old registered-deeds shelf, with no service, says so and offers the way in', async ({ page }) => {
    await page.goto('/legacy/documents');
    await page.getByRole('tab', { name: 'Registered deeds' }).click();
    await expect(page.getByText('No registered deeds yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register a Deed' }).first()).toBeVisible();
  });

  test('the old groups screen, with no service, says the service is unreachable and offers a first group', async ({ page }) => {
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    await expect(page.getByText('Service unreachable')).toBeVisible();
    await expect(page.getByText('No groups yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create your first group' })).toBeVisible();
  });


  test('the old notifications screen, with no service, counts nothing in both filters', async ({ page }) => {
    await page.goto('/legacy/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Failures (0)' })).toBeVisible();
    await expect(page.getByText('Nothing sent yet')).toBeVisible();
  });

  test('the old audit log, with no service, says nothing is recorded rather than showing a blank table', async ({ page }) => {
    await page.goto('/legacy/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible();
    await expect(page.getByText('No activity recorded')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  test('the old reference data, with no service, counts every table at zero', async ({ page }) => {
    await page.goto('/legacy/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin & Reference Data' })).toBeVisible();
    for (const name of ['States (0)', 'Districts (0)', 'Deed Types (0)', 'Fee Schedule (0)']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    await expect(page.getByText('No rows')).toBeVisible();
  });

  // The old profile left this app: /legacy/profile redirects into the drawn
  // /app/profile, whose failed read is covered in "the profile, drawn in this
  // app" below.

  test('the old wallet still says plainly that it is not live yet', async ({ page }) => {
    await page.goto('/legacy/wallet');
    await expect(page.getByRole('heading', { level: 1, name: 'Wallet' })).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add money' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await expect(page.getByText('Available for payments once the wallet goes live')).toBeVisible();
  });

  test('the old wallet prints no transactions nobody made', async ({ page }) => {
    // WAS A DEFECT — `useWallet()` returned the BUNDLED sample wallet with
    // `isSample: true` and no fetch at all, so the screen flew a "Service
    // unreachable" chip over five invented payments ("EC application fee — Sy
    // 123/2A", "Added money — UPI") under the heading "Recent transactions".
    // The founder's rule (data/useLiveOrSample.ts:1-7) is that no mock row may
    // ever render. Fixed: the hook zero-fills like every other one, so the
    // history is empty, the balance is ₹0, and the chip is gone — no read was
    // attempted, so "Service unreachable" would have been a second untruth.
    await page.goto('/legacy/wallet');
    await expect(page.getByRole('heading', { level: 2, name: 'Recent transactions' })).toBeVisible();
    await expect(page.getByText('EC application fee — Sy 123/2A')).toHaveCount(0);
    await expect(page.getByText('Added money — UPI')).toHaveCount(0);
    await expect(page.getByText('No payments yet — the wallet is not live.')).toBeVisible();
    await expect(page.getByText('Service unreachable')).toHaveCount(0);
  });

  test('nothing the previous app asks for slips past the seal', async ({ page, world }) => {
    for (const path of ['/legacy', '/legacy/groups', '/legacy/notifications',
      '/legacy/audit', '/legacy/admin', '/legacy/wallet']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 25_000 });
    }
    // The old surface is refused, not escaped: it posts to the same /graphql
    // path the world owns, and the world answers it with a 400 rather than a
    // 501. Anything in this list would be a call nobody has seeded.
    expect(world.escapes()).toEqual([]);
  });
});

// ── families & groups ──────────────────────────────────────────────────

test.describe('families & groups, on the previous interface', () => {
  test.beforeEach(() => { test.slow(); });

  const GROUPS_WORLD = { groups: GROUPS, members: [], parcels: [], me: { address: ME.address } };

  test('the two groups I keep are drawn as cards that say who is in them', async ({ page }) => {
    const legacy = await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');

    await expect(page.getByRole('heading', { level: 1, name: 'Families & Groups' })).toBeVisible();
    await expect(page.getByText('Service unreachable')).toHaveCount(0);

    // `exact` throughout: the detail panel below repeats every one of these
    // inside one longer sentence ("Your role: Head · 4 members · 2 passbooks"),
    // and a substring match would find both. The group's NAME is in two places
    // by design — the card and the detail heading under it — so that one takes
    // the first, which is the card.
    await expect(page.getByText('Telukutla family', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('4 members', { exact: true })).toBeVisible();
    await expect(page.getByText('2 passbooks', { exact: true })).toBeVisible();
    await expect(page.getByText('Your role: Head', { exact: true })).toBeVisible();

    await expect(page.getByText('Reddy & Sons', { exact: true })).toBeVisible();
    await expect(page.getByText('2 members', { exact: true })).toBeVisible();
    await expect(page.getByText('1 passbook', { exact: true })).toBeVisible();
    await expect(page.getByText('Your role: Managing Partner', { exact: true })).toBeVisible();

    expect(legacy.unanswered, 'this screen reads groups, members, parcels and me').toEqual([]);
  });

  test('the first group opens beneath the cards without my asking', async ({ page }) => {
    await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 2, name: 'Telukutla family' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
    await expect(page.getByText('No members yet — click Add member.')).toBeVisible();
  });

  test('tapping the other card swaps the detail beneath it', async ({ page }) => {
    await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { level: 2, name: 'Telukutla family' })).toBeVisible();

    await page.getByText('Reddy & Sons', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Reddy & Sons' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Telukutla family' })).toHaveCount(0);
  });

  test('only a family carries the inactivity safeguard, because only a family has heirs', async ({ page }) => {
    await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');
    await expect(page.getByText('Inactivity safeguard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure notifiers' })).toBeVisible();

    await page.getByText('Reddy & Sons', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Reddy & Sons' })).toBeVisible();
    await expect(page.getByText('Inactivity safeguard')).toHaveCount(0);
  });

  test('a member of the family is listed with the share they hold and the invite that is out', async ({ page }) => {
    await legacyApi(page, { ...GROUPS_WORLD, members: [member()] });
    await page.goto('/legacy/groups');

    await expect(page.getByRole('cell', { name: 'Venkat Reddy' })).toBeVisible();
    await expect(page.getByText('1 heir ·')).toBeVisible();
    await expect(page.getByText('40% allocated')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Invited' })).toBeVisible();
  });

  test('a group with no name is not created, and the field says which one is missing', async ({ page }) => {
    const legacy = await legacyApi(page, { ...GROUPS_WORLD, createGroup: { id: 'w-grp-new' } });
    await page.goto('/legacy/groups');

    await page.getByRole('button', { name: 'Create Group' }).click();
    await expect(page.getByRole('heading', { name: 'Create a group' })).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByText('Give the group a name')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create a group' })).toBeVisible();
    expect(legacy.sent).toHaveLength(0);
  });

  test('a group is created with exactly the type and name that were typed', async ({ page }) => {
    const legacy = await legacyApi(page, { ...GROUPS_WORLD, createGroup: { id: 'w-grp-new' } });
    await page.goto('/legacy/groups');

    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByRole('combobox', { name: 'Type' }).click();
    await page.getByRole('option', { name: /HUF/ }).click();
    await page.getByLabel(/^Name/).fill('Telukutla HUF');
    await page.getByLabel('Description (optional)').fill('The undivided share');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({
      field: 'createGroup',
      vars: { t: 'huf', n: 'Telukutla HUF', d: 'The undivided share' },
    });
    await expect(page.getByText('Group created')).toBeVisible();
  });

  test('a group the server refuses to create says so instead of pretending', async ({ page }) => {
    await legacyApi(page, { ...GROUPS_WORLD, createGroup: null });
    await page.goto('/legacy/groups');

    await page.getByRole('button', { name: 'Create Group' }).click();
    await page.getByLabel(/^Name/).fill('Telukutla HUF');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByText('Could not create group')).toBeVisible();
  });

  test('the Land tab says what the family holds, even when that is nothing', async ({ page }) => {
    await legacyApi(page, { ...GROUPS_WORLD, passbooks: [] });
    await page.goto('/legacy/groups');
    await page.getByRole('tab', { name: 'Land' }).click();
    await expect(page.getByText('Land held by Telukutla family · 0 passbooks · 0 Cents')).toBeVisible();
    await expect(page.getByText('No passbooks assigned to this group yet.')).toBeVisible();
  });

  test('the Land tab lists the khata the family actually holds', async ({ page }) => {
    await legacyApi(page, { ...GROUPS_WORLD, passbooks: PASSBOOKS });
    await page.goto('/legacy/groups');
    await page.getByRole('tab', { name: 'Land' }).click();
    await expect(page.getByText('Land held by Telukutla family · 1 passbook · 4 Acres 30 Cents')).toBeVisible();
    await expect(page.getByRole('cell', { name: '4471' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Katragunta, Markapur, Prakasam' })).toBeVisible();
  });

  test('the Activity tab is honest about an empty history', async ({ page }) => {
    await legacyApi(page, { ...GROUPS_WORLD, groupActivity: [] });
    await page.goto('/legacy/groups');
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText('No activity yet.')).toBeVisible();
  });

  test('the Activity tab reads back what was done to the family', async ({ page }) => {
    await legacyApi(page, {
      ...GROUPS_WORLD,
      groupActivity: [{
        id: 'w-ga-1', actor: 'shankarreddy.t', action: 'add_member',
        target: 'Venkat Reddy', details: 'Brother · 40%', timestamp: '2026-08-11T04:00:00Z',
      }],
    });
    await page.goto('/legacy/groups');
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByRole('cell', { name: 'add member' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Brother · 40%' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '11/08/2026, 09:30' })).toBeVisible();
  });

  test('the group Invitations tab lists only the heirs still waiting to confirm', async ({ page }) => {
    await legacyApi(page, {
      ...GROUPS_WORLD,
      members: [member(), member({ id: 'w-mem-sister', name: 'Lakshmi Devi', status: 'verified' })],
    });
    await page.goto('/legacy/groups');
    await page.getByRole('tab', { name: 'Invitations' }).click();
    await expect(page.getByRole('cell', { name: 'Venkat Reddy' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Lakshmi Devi' })).toHaveCount(0);
  });

  test('View holdings on a group card should open that group holdings', async ({ page }) => {
    // DEFECT — pages/FamiliesGroupsPage.tsx:183 navigates to
    // `/app/parcels?group=<id>`, and routes.tsx routes `/app/parcels` to
    // <Navigate to="/app/properties?kind=parcel" replace>, which DISCARDS the
    // query it was given. The owner asks for one family's land and is handed
    // the unfiltered list of everything they own, with nothing on screen
    // saying a family was named. The legacy holdings screen still honours
    // ?group= (LandPropertiesPage.tsx:225-227) — the link just never reaches it.
    test.fail();
    await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');
    await page.getByRole('button', { name: 'View holdings ›' }).first().click();
    // Wait for the redirect to land before reading the address — for one tick
    // the URL still carries the group the Navigate is about to throw away.
    await expect(page).toHaveURL(/\/app\/properties/, { timeout: 25_000 });
    await expect(page).toHaveURL(new RegExp(`group=${GROUP_ID}`));
  });

  test('View holdings in the group detail should open that group holdings', async ({ page }) => {
    // DEFECT — same discarded query, second door: GroupDetail.tsx:157.
    test.fail();
    await legacyApi(page, GROUPS_WORLD);
    await page.goto('/legacy/groups');
    await page.getByRole('button', { name: 'View holdings ›' }).last().click();
    await expect(page).toHaveURL(/\/app\/properties/, { timeout: 25_000 });
    await expect(page).toHaveURL(new RegExp(`group=${GROUP_ID}`));
  });

  test('the holdings screen itself does filter by family when it is actually asked to', async ({ page }) => {
    await legacyApi(page, {
      groups: GROUPS.map((g) => ({ id: g.id, name: g.name })),
      parcels: HOLDING_PARCELS,
      passbooks: PASSBOOKS,
      properties: [],
      documents: [],
    });
    await page.goto(`/legacy/parcels?group=${GROUP_ID}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Land & Properties' })).toBeVisible();
    await expect(page.getByText('Filtered by')).toBeVisible();
    await expect(page.getByText('Sy 214/2').first()).toBeVisible();
    await expect(page.getByText('Sy 88', { exact: true })).toHaveCount(0);
  });
});

// ── invitations ────────────────────────────────────────────────────────
//
// Drawn in this app now (w360/pages/Invitations.tsx). It reads and writes
// through the ROOT schema — `invitations`, `createInvitation`,
// `updateInvitationStatus`, `deleteInvitation` — so every answer below is a
// `root.` key, and the scope picker reads the seeded `web.properties`.

test.describe('invitations, drawn in this app', () => {
  const row = (page: Page, who: RegExp) => page.getByRole('row', { name: who });
  const actions = (page: Page, contact: string) =>
    page.getByRole('button', { name: `Actions for the invitation to ${contact}` });

  test('the old address lands on the new screen', async ({ page, world }) => {
    world.set('root.invitations', INVITATIONS);
    await page.goto('/legacy/invitations');
    await expect(page).toHaveURL(/\/app\/invitations$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    await expect(page.getByRole('link', { name: /previous version/ })).toHaveCount(0);
  });

  test('every invitation I have sent is listed with what it opens, its role and where it stands', async ({ page, world }) => {
    world.set('root.invitations', INVITATIONS);
    await page.goto('/app/invitations');

    await expect(page.getByText('1 invitation waiting for a response')).toBeVisible();
    await expect(row(page, /\+91 98480 11111/)).toContainText('Pending');
    await expect(row(page, /\+91 98480 11111/)).toContainText('31/12/2026');
    await expect(row(page, /\+91 98480 11111/)).toContainText('02/08/2026');
    await expect(row(page, /lakshmi@example\.com/)).toContainText('Accepted');
    await expect(row(page, /lakshmi@example\.com/)).toContainText('Whole khata');
    await expect(row(page, /branch@bank\.example/)).toContainText('Revoked');
    expect(world.escapes()).toEqual([]);
  });

  test('each invitation offers only what its state allows', async ({ page, world }) => {
    world.set('root.invitations', INVITATIONS);
    await page.goto('/app/invitations');

    // Accepting is the invitee's act (/i/:token); the owner can only revoke.
    await actions(page, '+91 98480 11111').click();
    await expect(page.getByRole('menuitem')).toHaveText(['Revoke', 'Delete']);
    await page.keyboard.press('Escape');

    await actions(page, 'lakshmi@example.com').click();
    await expect(page.getByRole('menuitem')).toHaveText(['Revoke', 'Delete']);
    await page.keyboard.press('Escape');

    await actions(page, 'branch@bank.example').click();
    await expect(page.getByRole('menuitem')).toHaveText(['Delete']);
  });

  test('revoking sends exactly that, for exactly that invitation', async ({ page, world }) => {
    world.setAll({ 'root.invitations': INVITATIONS, 'root.updateInvitationStatus': { id: 'w-inv-brother' } });
    await page.goto('/app/invitations');
    await actions(page, '+91 98480 11111').click();
    await page.getByRole('menuitem', { name: 'Revoke' }).click();

    await expect.poll(() => world.calls('root.updateInvitationStatus').length).toBe(1);
    expect(world.lastVars('root.updateInvitationStatus')).toEqual({ id: 'w-inv-brother', status: 'revoked' });
    await expect(page.getByText('The invitation to +91 98480 11111 is revoked')).toBeVisible();
  });

  test('an invitation is not sent without a contact, and is sent with the land and role chosen', async ({ page, world }) => {
    world.setAll({
      'root.invitations': INVITATIONS,
      'root.createInvitation': { id: 'w-inv-new', token: '/i/tok-new', deliveryStatus: 'failed' },
    });
    await page.goto('/app/invitations');

    await page.getByRole('button', { name: 'Invite someone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite someone' });
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Add a mobile number or an email address.');
    expect(world.calls('root.createInvitation')).toHaveLength(0);

    await dialog.getByLabel('Mobile number or email').fill('lakshmi@example.com');
    await dialog.getByRole('radiogroup', { name: 'Invite them to' }).getByRole('radio').first().click();
    await expect(dialog.getByLabel('Open for')).toHaveValue('30');
    await dialog.getByLabel('Role').selectOption('manage');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    await expect.poll(() => world.calls('root.createInvitation').length).toBe(1);
    expect(world.lastVars('root.createInvitation')).toMatchObject({
      inviteeContact: 'lakshmi@example.com', scopeType: 'parcel', scopeId: ID.parcel, role: 'manage',
    });
    // Nothing was delivered, so the owner is told so and handed the link.
    const result = page.getByRole('dialog', { name: 'Saved, but not sent' });
    await expect(result).toContainText('/i/tok-new');
    await expect(result.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /wa\.me/);
    await expect(dialog).toHaveCount(0);
  });

  test('an invitation the server refuses is reported, and the typed work stays', async ({ page, world }) => {
    world.setAll({
      'root.invitations': INVITATIONS,
      'root.createInvitation': World.gqlError('Not authorized for this scope'),
    });
    await page.goto('/app/invitations');
    await page.getByRole('button', { name: 'Invite someone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite someone' });
    await dialog.getByLabel('Mobile number or email').fill('98480 22222');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByText('That invitation could not be sent. Nothing has changed.')).toBeVisible();
    await expect(dialog.getByLabel('Mobile number or email')).toHaveValue('98480 22222');
  });

  test('deleting asks first, then deletes exactly that invitation', async ({ page, world }) => {
    world.setAll({ 'root.invitations': INVITATIONS, 'root.deleteInvitation': true });
    await page.goto('/app/invitations');
    await actions(page, 'branch@bank.example').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete this invitation?' });
    await expect(dialog).toContainText('This cannot be undone.');
    expect(world.calls('root.deleteInvitation')).toHaveLength(0);

    await dialog.getByRole('button', { name: 'Delete invitation' }).click();
    await expect.poll(() => world.calls('root.deleteInvitation').length).toBe(1);
    expect(world.lastVars('root.deleteInvitation')).toEqual({ id: 'w-inv-bank' });
    await expect(page.getByText('Invitation deleted')).toBeVisible();
  });

  test('a list that did not load says so instead of claiming there are none', async ({ page, world }) => {
    world.set('root.invitations', World.gqlError('the invitations service is down'));
    await page.goto('/app/invitations');
    await expect(page.getByText('Your invitations did not load')).toBeVisible();
    await expect(page.getByText('No invitations yet')).toHaveCount(0);
  });
});

// ── the invitee's side: the link, the heir record, referrals ───────────
//
// InvitePage (/i/:token, /verify/:token), w360/pages/Heir.tsx, Refer.tsx and
// the Home checklist. All root-schema reads, so every answer is a `root.` key.

const HEIR = {
  memberId: 'w-mem-ravi', listedBy: 'Telukutla R.', groupName: 'Telukutla family', relation: 'son',
  kind: 'coowner', sharePct: 25, isMinor: false, dob: '', presentAddress: '', gender: '',
  maritalStatus: '', spouseName: '', confirmed: '', note: '', complete: false,
};

test.describe('an invitation, from the side of the person invited', () => {
  const live = {
    state: 'live', purpose: 'beneficiary', inviter: 'Telukutla R.', expiresOn: '04/10/2026',
    steps: ['Confirm this invitation is for you', 'Complete your heir profile: date of birth and address'],
    forGuardian: false, canVerifyWithoutAccount: true,
  };

  test('the link says who invited me, for what, and what is waiting, and accepting opens my heir record', async ({ page, world }) => {
    world.setAll({
      'root.invitePreview': live,
      'root.claimInvitation': { purpose: 'beneficiary', memberId: HEIR.memberId, message: '' },
      'root.myHeirRecords': [HEIR],
    });
    await page.goto('/i/tok-heir');
    await expect(page.getByRole('heading', { level: 4, name: 'Telukutla R. listed you as an heir' })).toBeVisible();
    await expect(page.getByText('Complete your heir profile: date of birth and address')).toBeVisible();
    await page.getByLabel(/safeguard emails/).check();
    await page.getByRole('button', { name: 'Accept and continue' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/heir/${HEIR.memberId}$`));
    expect(world.lastVars('root.claimInvitation')).toEqual({ t: 'tok-heir', c: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Listed by Telukutla R.' })).toBeVisible();
  });

  test('a spent link says so and asks for a new one', async ({ page, world }) => {
    world.set('root.invitePreview', { ...live, state: 'expired', inviter: '', steps: [] });
    await page.goto('/i/tok-old');
    await expect(page.getByRole('heading', { name: 'This invitation cannot be used' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept and continue' })).toHaveCount(0);
  });

  test('an heir can ask for a correction, and must say what', async ({ page, world }) => {
    world.setAll({ 'root.myHeirRecords': [HEIR], 'root.confirmMyHeirDetails': true });
    await page.goto(`/app/heir/${HEIR.memberId}`);
    await page.getByRole('button', { name: 'Something is wrong' }).click();
    await page.getByRole('button', { name: 'Send correction' }).click();
    await expect(page.getByRole('alert')).toHaveText('Say what should be corrected.');
    expect(world.calls('root.confirmMyHeirDetails')).toHaveLength(0);
    await page.getByLabel('What should be corrected?').fill('My share is 50%');
    await page.getByRole('button', { name: 'Send correction' }).click();
    await expect.poll(() => world.calls('root.confirmMyHeirDetails').length).toBe(1);
    expect(world.lastVars('root.confirmMyHeirDetails')).toEqual({ m: HEIR.memberId, a: false, n: 'My share is 50%' });
  });

  test('the heir profile takes a DD/MM/YYYY birth date and refuses one that does not exist', async ({ page, world }) => {
    world.setAll({ 'root.myHeirRecords': [HEIR], 'root.updateMyHeirProfile': true });
    await page.goto(`/app/heir/${HEIR.memberId}`);
    await page.getByLabel('Date of birth').fill('31/02/1990');
    await page.getByLabel('Present address').fill('Katragunta, Markapur');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter your date of birth as DD/MM/YYYY.');
    expect(world.calls('root.updateMyHeirProfile')).toHaveLength(0);

    await page.getByLabel('Date of birth').fill('23/04/1990');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect.poll(() => world.calls('root.updateMyHeirProfile').length).toBe(1);
    expect(world.lastVars('root.updateMyHeirProfile'))
      .toMatchObject({ m: HEIR.memberId, d: '1990-04-23', a: 'Katragunta, Markapur' });
    await expect(page.getByText('Your heir profile is saved')).toBeVisible();
  });

  test('a record that is not linked to me says how to link it', async ({ page, world }) => {
    world.set('root.myHeirRecords', []);
    await page.goto('/app/heir/someone-else');
    await expect(page.getByText('This record is not linked to your account')).toBeVisible();
  });

  test('Home lists what is left to set up, and drops the card when it is all done', async ({ page, world }) => {
    // Home also reads the owner's activity trail through the root schema
    // (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer yet.
    world.set('root.auditTrail', []);
    world.set('root.setupTasks', [
      { id: 't1', kind: 'heir_confirm', title: 'Check how you are listed', detail: 'Confirm it.', route: `/app/heir/${HEIR.memberId}`, done: true },
      { id: 't2', kind: 'heir_profile', title: 'Complete your heir profile', detail: 'Date of birth.', route: `/app/heir/${HEIR.memberId}`, done: false },
    ]);
    await page.goto('/app');
    const card = page.getByRole('region', { name: 'Finish setting up' });
    await expect(card).toContainText('1 of 2 done');
    await expect(card.getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/app/heir/${HEIR.memberId}`);
  });

  test('Invite & earn shows my link and says credits are not spendable yet', async ({ page, world }) => {
    world.set('root.myReferral', {
      code: 'SHANKAR123', path: '/r/SHANKAR123', joined: 2, qualified: 1, creditsEarned: 1,
      monthlyCap: 10, referredBy: '', rewards: [{ kind: 'ai_credit', units: 1, state: 'earned', side: 'referrer', createdAt: '2026-09-20T10:00:00Z' }],
    });
    await page.goto('/app/refer');
    await expect(page.getByText(/\/r\/SHANKAR123$/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /wa\.me.*SHANKAR123/);
    await expect(page.getByText('not spendable yet', { exact: false })).toBeVisible();
    await expect(page.getByText('1 credit · 20/09/2026')).toBeVisible();
  });

  test('a referral link is remembered through sign-up and redeemed once', async ({ page, world }) => {
    // Home also reads the owner's activity trail through the root schema
    // (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer yet.
    world.set('root.auditTrail', []);
    world.set('root.redeemReferralCode', true);
    await page.goto('/r/shankar123');
    // Signed in already (the sealed world is), so it lands on Home and the
    // shell redeems the remembered code exactly once.
    await expect(page).toHaveURL(/\/app$/);
    await expect.poll(() => world.calls('root.redeemReferralCode').length).toBe(1);
    expect(world.lastVars('root.redeemReferralCode')).toEqual({ c: 'SHANKAR123' });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(world.calls('root.redeemReferralCode')).toHaveLength(1);
  });
});


// ── notifications ──────────────────────────────────────────────────────

test.describe('notifications, on the previous interface', () => {
  test.beforeEach(() => { test.slow(); });

  test('every message the system has sent is listed with the channel it went out on', async ({ page }) => {
    const legacy = await legacyApi(page, { notificationLog: NOTIFICATIONS });
    await page.goto('/legacy/notifications');

    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Sent notifications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All (3)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Failures (1)' })).toBeVisible();

    await expect(page.getByRole('cell', { name: 'EMAIL' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'SMS' })).toBeVisible();
    // `exact`, because the failed row's reason ("number not on WhatsApp") is
    // the accessible name of its status cell — see the failures test below.
    await expect(page.getByRole('cell', { name: 'WHATSAPP', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '20/08/2026, 09:45' })).toBeVisible();

    expect(legacy.unanswered, 'this screen reads only the notification log').toEqual([]);
  });

  test('a message recorded with no provider wired says it was not delivered', async ({ page }) => {
    await legacyApi(page, { notificationLog: NOTIFICATIONS });
    await page.goto('/legacy/notifications');
    await expect(page.getByRole('cell', { name: 'stub · not delivered' })).toBeVisible();
    // A message with no subject falls back to the first of its body.
    await expect(page.getByText('Pattadar: confirm your details for the Katragunta land.')).toBeVisible();
  });

  test('the failures filter keeps only the message that did not arrive', async ({ page }) => {
    await legacyApi(page, { notificationLog: NOTIFICATIONS });
    await page.goto('/legacy/notifications');
    await page.getByRole('button', { name: 'Failures (1)' }).click();

    await expect(page.getByRole('cell', { name: '+91 90000 00000' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'lakshmi@example.com' })).toHaveCount(0);
    // The eye gets "failed"; the provider's reason is on the chip as its
    // aria-label (MUI Tooltip), so a screen reader gets that instead.
    await expect(page.getByText('failed', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'number not on WhatsApp' })).toBeVisible();
  });

  test('a failures filter over a clean log says everything went through', async ({ page }) => {
    await legacyApi(page, { notificationLog: NOTIFICATIONS.filter((n) => n.status !== 'failed') });
    await page.goto('/legacy/notifications');
    await page.getByRole('button', { name: 'Failures (0)' }).click();
    await expect(page.getByText('No failed messages')).toBeVisible();
    await expect(page.getByText('Every message went through — nothing to fix here.')).toBeVisible();
  });

  test('a test message with nobody to send it to is not sent', async ({ page }) => {
    const legacy = await legacyApi(page, { notificationLog: NOTIFICATIONS });
    await page.goto('/legacy/notifications');
    await page.getByRole('button', { name: 'Send test' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Enter an email or phone')).toBeVisible();
    expect(legacy.sent).toHaveLength(0);
  });

  test('a test message with no provider wired is honest about only being recorded', async ({ page }) => {
    const legacy = await legacyApi(page, {
      notificationLog: NOTIFICATIONS,
      sendTestNotification: JSON.stringify({ provider: 'stub', channel: 'email' }),
    });
    await page.goto('/legacy/notifications');
    await page.getByRole('button', { name: 'Send test' }).click();
    await page.getByPlaceholder('name@example.com or +91 98765 43210').fill('lakshmi@example.com');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Recorded (stub — no provider wired yet)')).toBeVisible();
    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({
      field: 'sendTestNotification', vars: { to: 'lakshmi@example.com' },
    });
  });

  test('a test message that a real provider took says which one took it', async ({ page }) => {
    await legacyApi(page, {
      notificationLog: NOTIFICATIONS,
      sendTestNotification: JSON.stringify({ provider: 'ses', channel: 'email' }),
    });
    await page.goto('/legacy/notifications');
    await page.getByRole('button', { name: 'Send test' }).click();
    await page.getByPlaceholder('name@example.com or +91 98765 43210').fill('lakshmi@example.com');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Sent via ses (email)')).toBeVisible();
  });

  test('deleting a message from the log asks first', async ({ page }) => {
    const legacy = await legacyApi(page, { notificationLog: NOTIFICATIONS, deleteNotification: true });
    await page.goto('/legacy/notifications');
    await page.getByRole('row', { name: /lakshmi@example\.com/ }).getByRole('button', { name: 'Delete notification' }).click();

    await expect(page.getByRole('heading', { name: 'Delete this notification?' })).toBeVisible();
    expect(legacy.sent).toHaveLength(0);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({ field: 'deleteNotification', vars: { id: 'w-not-sent' } });
    await expect(page.getByText('Notification deleted')).toBeVisible();
  });
});

// ── the audit log ──────────────────────────────────────────────────────

test.describe('the audit log, on the previous interface', () => {
  test.beforeEach(() => { test.slow(); });

  test('every recorded action reads as a sentence, not as a database column', async ({ page }) => {
    const legacy = await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');

    await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible();
    // Each action chip sits in a Tooltip carrying the RAW action, and MUI puts
    // that on the chip as an aria-label — so the cell is named "create_passbook"
    // and the phrase a person reads is the chip's text. Both are asserted.
    await expect(page.getByText('Created a passbook')).toBeVisible();
    await expect(page.getByText('Uploaded a document')).toBeVisible();
    // An action nobody wrote a phrase for still reads as words.
    await expect(page.getByText('Rotate boundary mark')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'create_passbook' })).toBeVisible();

    await expect(page.getByRole('cell', { name: 'shankarreddy.t' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: '01/08/2026, 11:00' })).toBeVisible();

    expect(legacy.unanswered, 'this screen reads only the audit events').toEqual([]);
  });

  test('a raw machine id never reaches the entity column', async ({ page }) => {
    await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');
    await expect(page.getByText('3f2a1b7c-1111-4222-8333-444455556666')).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Katragunta, Markapur' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('opening a row shows the detail the row had no space for', async ({ page }) => {
    await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');
    await expect(page.getByText('Details')).toHaveCount(0);

    await page.getByRole('row').filter({ hasText: 'Uploaded a document' }).click();
    await expect(page.getByText('Details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand details' }).first()).toBeVisible();
  });

  test('searching the log narrows it to the actions that match', async ({ page }) => {
    await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');
    await page.getByPlaceholder('Search actor, action, entity…').fill('deed');

    await expect(page.getByText('Uploaded a document')).toBeVisible();
    await expect(page.getByText('Created a passbook')).toHaveCount(0);
  });

  test('a search that matches nothing says the log is empty rather than showing a blank table', async ({ page }) => {
    await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');
    await page.getByPlaceholder('Search actor, action, entity…').fill('zzzz');
    await expect(page.getByText('No activity recorded')).toBeVisible();
  });

  test('the export offered on the audit log carries the rows the search left behind', async ({ page }) => {
    await legacyApi(page, { auditEvents: AUDIT });
    await page.goto('/legacy/audit');
    await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
    await page.getByPlaceholder('Search actor, action, entity…').fill('zzzz');
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

// ── admin & reference data ─────────────────────────────────────────────

test.describe('admin & reference data, on the previous interface', () => {
  test.beforeEach(() => { test.slow(); });

  const REF_WORLD = { states: STATES, districts: DISTRICTS, deedTypes: DEED_TYPES, feeSchedule: FEES };

  test('each reference table says on its own tab how many rows it holds', async ({ page }) => {
    const legacy = await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');

    await expect(page.getByRole('heading', { level: 1, name: 'Admin & Reference Data' })).toBeVisible();
    for (const name of ['States (2)', 'Districts (2)', 'Deed Types (2)', 'Fee Schedule (2)', 'Analytics']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    expect(legacy.unanswered, 'this screen reads all four reference tables at once').toEqual([]);
  });

  test('the states tab says which state actually has data behind it', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await expect(page.getByText(/Andhra Pradesh has full district \/ mandal \/ SRO data from the IGRS feed\./))
      .toBeVisible();
    await expect(page.getByRole('cell', { name: 'Andhra Pradesh' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'AP' })).toBeVisible();
  });

  test('the districts tab lists the districts by their government code', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await page.getByRole('tab', { name: 'Districts (2)' }).click();
    await expect(page.getByRole('cell', { name: 'Prakasam' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '20' })).toBeVisible();
  });

  test('a deed type with no Telugu name shows a dash rather than an empty cell', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await page.getByRole('tab', { name: 'Deed Types (2)' }).click();
    await expect(page.getByRole('cell', { name: 'Sale of immovable property' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Gift to family member/ }).getByRole('cell', { name: '—' }))
      .toBeVisible();
  });

  test('the fee schedule prints its rates as percentages, not as decimals', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await page.getByRole('tab', { name: 'Fee Schedule (2)' }).click();
    await expect(page.getByText(/Rates are derived from the AP-IGRS sample fee schedule/)).toBeVisible();
    const saleRow = page.getByRole('row', { name: /Sale of immovable property/ });
    await expect(saleRow.getByRole('cell', { name: '5.00%' })).toBeVisible();
    await expect(saleRow.getByRole('cell', { name: '1.50%' })).toBeVisible();
    await expect(saleRow.getByRole('cell', { name: '1.00%' })).toBeVisible();
    await expect(saleRow.getByRole('cell', { name: '0.10%' })).toBeVisible();
  });

  test('searching a reference table narrows it, and says so when nothing matches', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await page.getByPlaceholder('Search…').fill('Telangana');
    await expect(page.getByRole('cell', { name: 'Telangana' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Andhra Pradesh' })).toHaveCount(0);

    await page.getByPlaceholder('Search…').fill('Karnataka');
    await expect(page.getByText('No rows')).toBeVisible();
    await expect(page.getByText('Reference data loads from the live service — nothing matches this search.'))
      .toBeVisible();
  });

  test('the analytics tab promises nothing it cannot do yet', async ({ page }) => {
    await legacyApi(page, REF_WORLD);
    await page.goto('/legacy/admin');
    await page.getByRole('tab', { name: 'Analytics' }).click();
    await expect(page.getByText('Analytics Dashboard')).toBeVisible();
    await expect(page.getByText(/coming in\s+a later release/)).toBeVisible();
  });
});

// ── the profile ────────────────────────────────────────────────────────
//
// Profile is drawn in this app now (w360/pages/Profile.tsx) and the MUI
// screen that sat at /legacy/profile is deleted; that address only redirects.
// It reads and writes the ROOT schema — `me`, `districts`, `updateProfile`,
// `updateMe` — the same cross-client contract iOS and mobile speak, so like
// Tools it keeps using `legacyApi()` from this file.

test.describe('the profile, drawn in this app', () => {
  const PROFILE_WORLD = { me: ME, districts: DISTRICTS };
  const saveButton = (page: Page) => page.getByRole('button', { name: 'Save profile' });
  const aadhaarField = (page: Page) => page.getByLabel('Replace with a new number');

  test('my profile opens already holding what was last saved', async ({ page }) => {
    const legacy = await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');

    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('Shankar Reddy');
    await expect(page.getByLabel('Email for notices')).toHaveValue('shankarreddy.t@pattadar.local');
    await expect(page.getByLabel('My address')).toHaveValue('Katragunta, Markapur mandal, Prakasam');
    // districtsOfInterest holds an id; what is shown is the district's NAME.
    await expect(page.getByRole('button', { name: 'Districts of interest' })).toHaveText(/1 district/);
    await expect(page.getByText('Prakasam', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Email' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'SMS' })).not.toBeChecked();
    await expect(page.getByText('XXXX XXXX 4471')).toBeVisible();
    // Nothing typed, nothing to save — and the screen says why.
    await expect(saveButton(page)).toBeDisabled();
    await expect(page.getByText('Nothing has changed yet.')).toBeVisible();
    expect(legacy.unanswered, 'this screen reads me and the district list').toEqual([]);
    expect(legacy.sent).toEqual([]);
  });

  test('the old address carries me into the redrawn profile, not a signpost', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/legacy/profile');
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('link', { name: /previous version/ })).toHaveCount(0);
  });

  test('a login id is not shown as my name', async ({ page }) => {
    // `me` seeds `name` with the principal id on first contact.
    const id = `subject_${'f3'.repeat(32)}`;
    await legacyApi(page, { ...PROFILE_WORLD, me: { ...ME, id, name: id } });
    await page.goto('/app/profile');
    await expect(page.getByLabel('Your name')).toHaveValue('');
    await expect(page.getByText('No name yet')).toBeVisible();
    await expect(page.getByText(id)).toHaveCount(0);
  });

  test('an Aadhaar typed here is digits only, and Save waits for all twelve', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');
    await aadhaarField(page).fill('1234-5678 9012 3456');
    await expect(aadhaarField(page)).toHaveValue('123456789012');
    await aadhaarField(page).fill('12345');
    await expect(saveButton(page)).toBeDisabled();
    await expect(page.getByText('An Aadhaar number is 12 digits.')).toBeVisible();
  });

  test('saving my preferences sends exactly what the form holds, and leaves my name alone', async ({ page }) => {
    const legacy = await legacyApi(page, {
      ...PROFILE_WORLD,
      updateProfile: { kycRefMasked: 'XXXX-XXXX-9012' },
    });
    await page.goto('/app/profile');

    await page.getByLabel('My address').fill('Tarlupadu, Prakasam');
    await page.getByRole('checkbox', { name: 'SMS' }).check();
    await page.getByRole('button', { name: 'Districts of interest' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Guntur' }).click();
    await page.keyboard.press('Escape');
    await aadhaarField(page).fill('123456789012');
    await saveButton(page).click();

    await expect(page.getByText('Profile saved')).toBeVisible();
    expect(legacy.sent).toEqual([{
      field: 'updateProfile',
      vars: {
        // The two stored values with no control here go back unchanged.
        language: 'en', mfaEnabled: false,
        address: 'Tarlupadu, Prakasam', notificationPrefs: 'email,sms',
        districtsOfInterest: 'w-dist-prakasam,w-dist-guntur', kycRef: '123456789012',
      },
    }]);
  });

  test('changing my name sends my name, and nothing about my preferences', async ({ page }) => {
    const legacy = await legacyApi(page, { ...PROFILE_WORLD, updateMe: { id: ME.id } });
    await page.goto('/app/profile');
    await page.getByLabel('Your name').fill('T. Shankar Reddy');
    await saveButton(page).click();

    await expect(page.getByText('Profile saved')).toBeVisible();
    expect(legacy.sent).toEqual([{
      field: 'updateMe',
      vars: { name: 'T. Shankar Reddy', email: 'shankarreddy.t@pattadar.local' },
    }]);
  });

  test('a saved Aadhaar leaves the field empty and shows only the new mask', async ({ page }) => {
    let me: Row = { ...ME };
    await legacyApi(page, {
      districts: DISTRICTS,
      me: () => me,
      updateProfile: (vars: Row) => {
        me = { ...me, kycRefMasked: `XXXX-XXXX-${String(vars.kycRef).slice(-4)}` };
        return { kycRefMasked: me.kycRefMasked };
      },
    });
    await page.goto('/app/profile');
    await aadhaarField(page).fill('123456789012');
    await saveButton(page).click();

    await expect(page.getByText('XXXX XXXX 9012')).toBeVisible();
    await expect(aadhaarField(page)).toHaveValue('');
    await expect(page.getByText('123456789012')).toHaveCount(0);
  });

  test('a profile the server refuses to save says nothing changed, and tries nothing else', async ({ page }) => {
    const legacy = await legacyApi(page, {
      ...PROFILE_WORLD,
      updateProfile: refused('the profile store is down'),
      updateMe: { id: ME.id },
    });
    await page.goto('/app/profile');
    await page.getByLabel('Your name').fill('T. Shankar Reddy');
    await page.getByLabel('My address').fill('Tarlupadu, Prakasam');
    await saveButton(page).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Your profile could not be saved. Nothing has changed.' }))
      .toBeVisible();
    await expect(page.getByText('the profile store is down')).toBeVisible();
    expect(legacy.sent.map((s) => s.field)).toEqual(['updateProfile']);
    // What was typed is still there to try again.
    await expect(page.getByLabel('My address')).toHaveValue('Tarlupadu, Prakasam');
  });

  test('a save the server answers with nothing is not called saved', async ({ page }) => {
    await legacyApi(page, { ...PROFILE_WORLD, updateProfile: null });
    await page.goto('/app/profile');
    await page.getByLabel('My address').fill('Tarlupadu, Prakasam');
    await saveButton(page).click();
    await expect(page.getByText('Your profile could not be saved. Nothing has changed.')).toBeVisible();
    await expect(page.getByText('Profile saved')).toHaveCount(0);
  });

  test('when only half a save lands, the screen says which half', async ({ page }) => {
    await legacyApi(page, {
      ...PROFILE_WORLD,
      updateProfile: { kycRefMasked: ME.kycRefMasked },
      updateMe: refused('name refused'),
    });
    await page.goto('/app/profile');
    await page.getByLabel('Your name').fill('T. Shankar Reddy');
    await page.getByLabel('My address').fill('Tarlupadu, Prakasam');
    await saveButton(page).click();
    await expect(page.getByText('Your preferences were saved, but your name and email were not.')).toBeVisible();
  });

  test('a profile that did not load offers no form to save blanks over it', async ({ page }) => {
    await legacyApi(page, { ...PROFILE_WORLD, me: refused('the account store is down') });
    await page.goto('/app/profile');
    await expect(page.getByText('Your profile did not load')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(saveButton(page)).toHaveCount(0);
  });

  // ── what a Google sign-in brings ──────────────────────────────────────
  //
  // The sealed session's ID token carries only an email. These add the two
  // claims a Google sign-in brings — `name`, and `picture` once the pool maps
  // it (cognito.tf) — by rewriting the stored token AFTER the harness writes
  // it (init scripts run in registration order). Nothing in fixtures/ changes.
  const FACE = 'https://lh3.googleusercontent.com/a/sealed-face=s96-c';
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  async function googleSession(page: Page, claims: Record<string, string>) {
    await page.addInitScript((extra) => {
      const key = Object.keys(localStorage).find((k) => k.endsWith('.idToken'));
      if (!key) return;
      const [head, body, sig] = (localStorage.getItem(key) ?? '').split('.');
      const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
      const next = btoa(JSON.stringify({ ...json, ...extra }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(key, `${head}.${next}.${sig}`);
    }, claims);
  }

  test('with no name on the account, the Google name is offered, and Save keeps it', async ({ page }) => {
    await googleSession(page, { name: 'Sankara Telukutla' });
    const id = `subject_${'f3'.repeat(32)}`;
    const legacy = await legacyApi(page, {
      ...PROFILE_WORLD, me: { ...ME, id, name: id }, updateMe: { id },
    });
    await page.goto('/app/profile');

    await expect(page.getByLabel('Your name')).toHaveValue('Sankara Telukutla');
    await expect(page.getByText('From the account you signed in with. Save to keep it.')).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
    expect(legacy.sent).toEqual([{
      field: 'updateMe',
      vars: { name: 'Sankara Telukutla', email: 'shankarreddy.t@pattadar.local' },
    }]);
  });

  test('a name I saved is never replaced by the one Google has', async ({ page }) => {
    await googleSession(page, { name: 'Sankara Telukutla' });
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');
    await expect(page.getByLabel('Your name')).toHaveValue('Shankar Reddy');
    await expect(page.getByText('From the account you signed in with.', { exact: false })).toHaveCount(0);
    await expect(saveButton(page)).toBeDisabled();
  });

  test('the Google photo is my face on the profile and on the account button', async ({ page }) => {
    await page.route(FACE, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1PX }));
    await googleSession(page, { name: 'Sankara Telukutla', picture: FACE });
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');

    const faces = page.locator(`img[src="${FACE}"]`);
    // One in the Profile card, one inside the topbar's account button.
    await expect(faces).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Your account/ }).locator('img')).toHaveAttribute('src', FACE);
    // The page address is not handed to Google with the image request.
    await expect(faces.first()).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  test('a Google photo that will not load falls back to initials, not a broken image', async ({ page }) => {
    // Bytes that are not an image, rather than a 404: the browser logs a 4xx
    // as a console error, and a photo that cannot be decoded is the same
    // failure for the screen without tripping the harness guard.
    await page.route(FACE, (route) => route.fulfill({ contentType: 'image/png', body: 'not an image' }));
    await googleSession(page, { name: 'Sankara Telukutla', picture: FACE });
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');
    await expect(page.getByLabel('Your name')).toHaveValue('Shankar Reddy');
    await expect(page.locator(`img[src="${FACE}"]`)).toHaveCount(0);
    // The seeded portfolio greets "Shankar Reddy".
    await expect(page.getByRole('button', { name: /^Your account/ })).toHaveText('SR');
  });

  test('a picture claim that is not an https address is never drawn', async ({ page }) => {
    await googleSession(page, { picture: 'javascript:alert(1)' });
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');
    await expect(page.getByLabel('Your name')).toHaveValue('Shankar Reddy');
    await expect(page.locator('main img, header img')).toHaveCount(0);
  });

  test('the profile points at the one place privacy and deletion actually live', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/app/profile');
    await expect(page.getByRole('link', { name: 'Privacy, export and account deletion' }))
      .toHaveAttribute('href', '/app/account');
  });
});

// ── the tools ──────────────────────────────────────────────────────────
//
// Tools is drawn in this app now (w360/pages/Tools.tsx) and the MUI screen
// that used to sit at /legacy/tools is deleted. It still reads the old flat
// reference documents — `{ sroOffices }`, `{ feeSchedule }`, `{ marketValues }`
// and `calculateStampDuty` — so it keeps using `legacyApi()` from this file,
// which is why these tests live here rather than in a spec of their own.

/** The duty breakup card, by its heading. The deed-type <select> carries the
 *  same "Sale of immovable property — Sale" words as an <option>, so page-wide
 *  text lookups would be ambiguous; the answer is asserted where it is shown. */
const breakup = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { level: 2, name: 'Duty & fee breakup' }) });

test.describe('the tools, drawn in this app', () => {
  test.beforeEach(() => { test.slow(); });

  test('all five tools sit under one screen, and the SRO directory opens first', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools');

    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
    // Tools is a top-level page under Help & resources: no eyebrow over it.
    await expect(page.locator('main .pagehead .eyebrow')).toHaveCount(0);
    await expect(page.getByText('SRO finder · Stamp duty · Guideline values · Area · Fencing', { exact: true }))
      .toBeVisible();
    for (const name of ['Find SRO', 'Stamp duty', 'Market value', 'Area calculator', 'Fence calculator']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toHaveAttribute('aria-selected', 'true');
    // Not the signpost it replaced: nothing here sends you to /legacy.
    await expect(page.getByRole('link', { name: 'Open Tools' })).toHaveCount(0);
  });

  test('?tab= opens the tool the address names', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await expect(page.getByRole('tab', { name: 'Area calculator', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { level: 2, name: 'Area calculator' })).toBeVisible();
  });

  test('choosing a tool writes it into the address, so the tool can be linked', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Stamp duty', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/tools\?tab=stamp-duty$/);
  });

  test('a ?tab= nobody wrote a tool for falls back to the SRO directory', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=nonsense');
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the old tools address carries its tab into this app', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await expect(page).toHaveURL(/\/app\/tools\?tab=calculator$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Area calculator' })).toBeVisible();
  });

  test('the tab strips answer the arrow keys, not only the pointer', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Area calculator', exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toBeFocused();
  });

  // -- Find SRO --------------------------------------------------------

  test('the SRO directory lists the office for every mandal it knows', async ({ page }) => {
    const legacy = await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=sro');

    await expect(page.getByRole('heading', { level: 2, name: 'SRO offices' })).toBeVisible();
    await expect(page.getByText('The Sub-Registrar Office that serves your village.'))
      .toBeVisible();
    await expect(page.getByRole('cell', { name: 'Markapur', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: '1607' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Ongole' }).first()).toBeVisible();
    expect(legacy.unanswered, 'this tab reads only the SRO directory').toEqual([]);
  });

  test('searching the SRO directory narrows it to the district I asked for', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=sro');
    await page.getByRole('searchbox', { name: 'Search SRO offices' }).fill('Guntur');

    await expect(page.getByRole('cell', { name: 'Mangalagiri', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Markapur', exact: true })).toHaveCount(0);
  });

  test('the SRO search starts at the table\'s left edge and has one frame, not two', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=sro');
    const box = page.getByRole('searchbox', { name: 'Search SRO offices' });
    await expect(box).toBeVisible();
    const search = await page.locator('main .search').first().boundingBox();
    const table = await page.locator('main .scroll-x').first().boundingBox();
    expect(search && table, 'both the search and the table are drawn').toBeTruthy();
    expect(Math.abs(search!.x - table!.x)).toBeLessThanOrEqual(1);
    // Only the .search pill draws a frame; the field inside it has none.
    expect(await box.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
  });

  test('an SRO search that matches nothing says so, and suggests what to type', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/app/tools?tab=sro');
    await page.getByPlaceholder('Search office, district, mandal…').fill('Mumbai');

    await expect(page.getByText('No offices match')).toBeVisible();
    await expect(page.getByText('Try a district or mandal name — for example Guntur, Gannavaram or Kurnool.'))
      .toBeVisible();
  });

  test.describe('with no directory behind it', () => {
    // No legacyApi here, so the old query is refused with a 400 and logged.
    test.use({ allowConsole: true });

    test('an SRO directory that never loaded says so, and does not blame my search', async ({ page }) => {
      await page.goto('/app/tools?tab=sro');
      await expect(page.getByText('The office directory did not load')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(page.getByText('No offices match')).toHaveCount(0);
    });
  });

  // -- Stamp duty ------------------------------------------------------

  test('the stamp duty tool waits for a deed type and two figures before it says anything', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/app/tools?tab=stamp-duty');

    await expect(page.getByRole('heading', { level: 2, name: 'Stamp duty & fee calculator' })).toBeVisible();
    await expect(page.getByText('Enter values and click Calculate')).toBeVisible();
    await expect(page.getByText('Duty is on the higher of the sale price and the guideline value.'))
      .toBeVisible();
  });

  test('pressing Calculate with nothing chosen says exactly what is missing', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/app/tools?tab=stamp-duty');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.getByRole('alert')).toHaveText('Pick a deed type and enter the consideration and market value.');
  });

  test('the duty is charged on the market value when it is the higher of the two', async ({ page }) => {
    // The service answers, so what is asserted is the service's arithmetic
    // arriving on the page — the local fallback is the test below.
    const legacy = await legacyApi(page, {
      feeSchedule: FEES,
      calculateStampDuty: (vars: Row) => ({
        deedType: 'Sale of immovable property',
        consideration: vars.consideration, marketValue: vars.marketValue,
        stampDuty: 300_000, transferDuty: 90_000, registrationFee: 60_000,
        userCharges: 6_000, total: 456_000,
      }),
    });
    await page.goto('/app/tools?tab=stamp-duty');

    await page.getByLabel('Deed type').selectOption({ label: 'Sale of immovable property — Sale' });
    await page.getByLabel('Consideration amount (₹)').fill('5000000');
    await page.getByLabel('Market / guideline value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    await expect(breakup(page)).toBeVisible();
    await expect(breakup(page).getByText('₹3,00,000')).toBeVisible();
    await expect(breakup(page).getByText('₹4,56,000')).toBeVisible();
    await expect(page.getByText('Online stamp-duty payment is not available yet.'))
      .toBeVisible();

    expect(legacy.sent).toHaveLength(0);
    expect(legacy.unanswered).toEqual([]);
  });

  test('a duty the service cannot work out is worked out on the spot instead', async ({ page }) => {
    // calculateStampDuty is left unanswered, so `gql` comes back with nothing
    // for it and Tools.tsx runs @pattadar/core calcStampDuty on the chosen
    // row's rates. 5% of the 60,00,000 basis is 3,00,000, and the four charges
    // together are 4,56,000 — the same answer, computed here.
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/app/tools?tab=stamp-duty');

    await page.getByLabel('Deed type').selectOption({ label: 'Sale of immovable property — Sale' });
    await page.getByLabel('Consideration amount (₹)').fill('5000000');
    await page.getByLabel('Market / guideline value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    await expect(breakup(page).getByText('Sale of immovable property — Sale')).toBeVisible();
    await expect(breakup(page).getByText('₹3,00,000')).toBeVisible();
    await expect(breakup(page).getByText('₹4,56,000')).toBeVisible();
  });

  test('a gift of the same land costs a fifth of what a sale costs', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/app/tools?tab=stamp-duty');

    await page.getByLabel('Deed type').selectOption({ label: 'Gift to family member — Gift' });
    await page.getByLabel('Consideration amount (₹)').fill('0');
    await page.getByLabel('Market / guideline value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    // 1% + 0.5% + 0.5% + 0.1% of 60,00,000 = 60,000 + 30,000 + 30,000 + 6,000.
    await expect(breakup(page).getByText('₹1,26,000')).toBeVisible();
  });

  test.describe('with no fee schedule behind it', () => {
    test.use({ allowConsole: true });

    test('a stamp duty tool with no fee schedule says it cannot run, rather than claim one', async ({ page }) => {
      // WAS A DEFECT (test-fail-register 1605) — the legacy StampDutyTool
      // printed "Working from the bundled fee schedule" over an EMPTY list:
      // useLiveOrSample hands a failed read an empty shape, not the bundled
      // one. The picker offered nothing and Calculate could never answer. The
      // redrawn tool says the schedule did not load and offers a retry.
      await page.goto('/app/tools?tab=stamp-duty');
      await expect(page.getByText('The AP fee schedule did not load')).toBeVisible();
      await expect(page.getByText(/bundled fee schedule/)).toHaveCount(0);
      await expect(page.getByLabel('Deed type')).toHaveCount(0);
    });
  });

  // -- Market value ----------------------------------------------------

  test('the guideline rates are named as reference figures, not as a valuation', async ({ page }) => {
    const legacy = await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/app/tools?tab=market-value');
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible({ timeout: 25_000 });

    await expect(page.getByText(/These are reference guideline values published by the AP Registration/))
      .toBeVisible();
    await expect(page.getByText(/Actual market values may vary\./)).toBeVisible();
    expect(legacy.unanswered, 'this tab reads only the guideline rates').toEqual([]);
  });

  test('the district, mandal and village pickers narrow each other in order', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/app/tools?tab=market-value');

    await page.getByLabel('District').selectOption({ label: 'Prakasam' });

    const mandal = page.getByLabel('Mandal');
    // Guntur's mandal has been narrowed out of the list entirely.
    await expect(mandal.locator('option', { hasText: 'Markapur' })).toHaveCount(1);
    await expect(mandal.locator('option', { hasText: 'Tarlupadu' })).toHaveCount(1);
    await expect(mandal.locator('option', { hasText: 'Mangalagiri' })).toHaveCount(0);
    await mandal.selectOption({ label: 'Markapur' });

    const village = page.getByLabel('Village');
    await expect(village.locator('option', { hasText: 'Katragunta' })).toHaveCount(1);
    await expect(village.locator('option', { hasText: 'Nidamarru' })).toHaveCount(0);
  });

  test('choosing a village puts its rates up, one per classification', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/app/tools?tab=market-value');

    await page.getByLabel('District').selectOption({ label: 'Prakasam' });
    await page.getByLabel('Mandal').selectOption({ label: 'Markapur' });
    await page.getByLabel('Village').selectOption({ label: 'Katragunta' });

    await expect(page.getByText('₹18,50,000').first()).toBeVisible();
    await expect(page.getByText('₹4,200').first()).toBeVisible();
    await expect(page.getByText('Katragunta, Markapur · effective 01/04/2026').first()).toBeVisible();
    // The other mandal's rate is gone from the table below.
    await expect(page.getByText('₹11,00,000')).toHaveCount(0);
  });

  test('changing the district throws away the mandal and village that no longer apply', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/app/tools?tab=market-value');

    await page.getByLabel('District').selectOption({ label: 'Prakasam' });
    await page.getByLabel('Mandal').selectOption({ label: 'Markapur' });
    await expect(page.getByLabel('Mandal').locator('option:checked')).toHaveText('Markapur');

    await page.getByLabel('District').selectOption({ label: 'Guntur' });
    await expect(page.getByLabel('Mandal').locator('option:checked')).toHaveText('All mandals');
    await expect(page.getByLabel('Village').locator('option:checked')).toHaveText('All villages');
  });

  test.describe('with no guideline rates behind it', () => {
    test.use({ allowConsole: true });

    test('guideline rates that never loaded say so, and do not blame a selection nobody made', async ({ page }) => {
      await page.goto('/app/tools?tab=market-value');
      await expect(page.getByText('The guideline rates did not load')).toBeVisible();
      await expect(page.getByText('No guideline rates match this selection.')).toHaveCount(0);
      await expect(page.getByText(/sample data/i)).toHaveCount(0);
    });
  });

  // -- Area calculator -------------------------------------------------

  test('the area calculator needs no service at all — it is arithmetic', async ({ page, world }) => {
    await page.goto('/app/tools?tab=calculator');
    await expect(page.getByRole('heading', { level: 2, name: 'Area calculator' })).toBeVisible();
    await expect(page.getByText(/Unit conversion, plot measurement and boundary area\./))
      .toBeVisible();
    for (const name of ['Unit converter', 'Plot area', 'Map area']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    // One fence calculator in Tools: the old feet sub-tab is retired.
    await expect(page.getByRole('tab', { name: 'Fencing', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Perimeter (ft)')).toHaveCount(0);
    expect(world.escapes()).toEqual([]);
  });

  test('one acre converts to every unit an Andhra farmer actually uses', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    // One acre is singular on both lines: the title used to echo the picker's
    // plural label ("1 Acres =") over a value that said "1 Acre".
    await expect(page.getByText('1 Acre =', { exact: true })).toBeVisible();

    const row = (label: string) => page.getByRole('row').filter({ hasText: new RegExp(`^${label}`) });
    await expect(row('Cents')).toContainText('100');
    await expect(row('Guntas')).toContainText('40');
    await expect(row('Sq. yards')).toContainText('4,840');
    await expect(row('Sq. feet')).toContainText('43,560');
    await expect(row('Sq. metres')).toContainText('4,046.86');
    await expect(row('Hectares')).toContainText('0.4');
    await expect(row('Ankanam')).toContainText('605');
  });

  test('two guntas is five cents, and the converter says so in the language of the passbook', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByLabel('Amount').fill('2');
    await page.getByLabel('Unit', { exact: true }).selectOption({ label: 'Guntas' });

    await expect(page.getByText('2 Guntas =')).toBeVisible();
    await expect(page.getByText('5 Cents')).toBeVisible();
  });

  test('a hundred by fifty foot plot is eleven and a half cents, and its perimeter is offered to the fencing tool', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByLabel('Width').fill('50');

    await expect(page.getByText('11.48 Cents')).toBeVisible();
    await expect(page.getByText('Perimeter ≈ 300 ft')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use in Fencing →' })).toBeVisible();
  });

  test('a triangle measured in metres is turned into acres without my converting anything', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByRole('button', { name: 'Triangle' }).click();
    await expect(page.getByRole('button', { name: 'Triangle' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Measured in').selectOption({ label: 'Metres' });
    await page.getByLabel('Side A').fill('100');
    await page.getByLabel('Side B').fill('100');
    await page.getByLabel('Side C').fill('100');

    // An equilateral triangle of 100 m sides is 46,609 sq ft. The readout is in
    // acres and cents, which is how a passbook writes it down — never sq ft.
    await expect(page.getByText('1 Acre 7 Cents')).toBeVisible();
  });

  test('an impossible triangle is worth nothing rather than a number somebody might believe', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByRole('button', { name: 'Triangle' }).click();
    await page.getByLabel('Side A').fill('10');
    await page.getByLabel('Side B').fill('10');
    await page.getByLabel('Side C').fill('90');
    await expect(page.getByText('0 Cents')).toBeVisible();
  });

  test('the sides I measured carry into the fence calculator, in metres, instead of being typed twice', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByLabel('Width').fill('50');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page).toHaveURL(/\/app\/tools\?tab=fence$/);
    await expect(page.getByRole('tab', { name: 'Fence calculator', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    // 100 × 50 ft is 30.48 × 15.24 m, round the four sides.
    await expect(page.getByLabel('Side A–B (m)')).toHaveValue('30.48');
    await expect(page.getByLabel('Side B–C (m)')).toHaveValue('15.24');
    await expect(page.getByLabel('Side C–D (m)')).toHaveValue('30.48');
    await expect(page.getByLabel('Side D–A (m)')).toHaveValue('15.24');
    await expect(page.locator('.fs-tool')).toContainText('4 sides');
    await expect(page.locator('.fs-tool')).toContainText('91.4 m');
  });

  test('a triangle hands over its three sides, not four', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByRole('button', { name: 'Triangle' }).click();
    await page.getByLabel('Measured in').selectOption({ label: 'Metres' });
    await page.getByLabel('Side A', { exact: true }).fill('100');
    await page.getByLabel('Side B', { exact: true }).fill('100');
    await page.getByLabel('Side C', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page).toHaveURL(/\/app\/tools\?tab=fence$/);
    await expect(page.getByLabel('Side A–B (m)')).toHaveValue('100');
    await expect(page.getByLabel('Side B–C (m)')).toHaveValue('100');
    await expect(page.getByLabel('Side C–A (m)')).toHaveValue('100');
    await expect(page.getByLabel('Side D–A (m)')).toHaveCount(0);
    await expect(page.locator('.fs-tool')).toContainText('3 sides');
  });

  test('a quadrilateral hands over its four sides, and the diagonal is not one of them', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByRole('button', { name: 'Quadrilateral' }).click();
    await page.getByLabel('Measured in').selectOption({ label: 'Metres' });
    await page.getByLabel('Side 1').fill('40');
    await page.getByLabel('Side 2').fill('30');
    await page.getByLabel('Side 3').fill('40');
    await page.getByLabel('Side 4').fill('30');
    await page.getByLabel('Diagonal (corner 1→3)').fill('50');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page.getByLabel('Side A–B (m)')).toHaveValue('40');
    await expect(page.getByLabel('Side D–A (m)')).toHaveValue('30');
    await expect(page.getByLabel('Side E–A (m)')).toHaveCount(0);
    await expect(page.locator('.fs-tool')).toContainText('4 sides');
    await expect(page.locator('.fs-tool')).toContainText('140.0 m');
  });

  test('a side I have not measured arrives blank, not as a 0 m side', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page.getByLabel('Side A–B (m)')).toHaveValue('30.48');
    await expect(page.getByLabel('Side B–C (m)')).toHaveValue('');
    await expect(page.getByLabel('Side C–D (m)')).toHaveValue('30.48');
    await expect(page.getByLabel('Side D–A (m)')).toHaveValue('');
    await expect(page.locator('.fs-tool')).toContainText('2 sides');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a handed-over side I then spoil is refused, as a typed one is', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByLabel('Width').fill('50');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await page.getByLabel('Side A–B (m)').fill('-5');
    await expect(page.getByText('Enter each side as a length in metres, more than 0.')).toBeVisible();
    await expect(page.getByLabel('Side A–B (m)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Print for the supplier' })).toBeDisabled();
  });

  test('a boundary with fewer than three corners is not an area, and says so', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map area' }).click();
    await expect(page.getByText('Add at least 3 points to compute an area.')).toBeVisible();
  });

  test('a boundary pasted as GeoJSON is measured in acres and in metres of fence', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map area' }).click();
    await page.getByLabel('Boundary as GeoJSON').fill(
      '{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}',
    );

    await expect(page.getByText('11 Acres 74.37 Cents')).toBeVisible();
    await expect(page.getByText('Perimeter ≈ 2,858.36 ft (871.23 m)')).toBeVisible();
  });

  test('a pasted boundary hands each of its sides to the fence calculator', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map area' }).click();
    await page.getByLabel('Boundary as GeoJSON').fill(
      '{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}',
    );
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page).toHaveURL(/\/app\/tools\?tab=fence$/);
    for (const n of ['A–B', 'B–C', 'C–D', 'D–A']) {
      await expect(page.getByLabel(`Side ${n} (m)`)).not.toHaveValue('');
    }
    await expect(page.getByLabel('Side E–A (m)')).toHaveCount(0);
    await expect(page.locator('.fs-tool')).toContainText('4 sides');
    await expect(page.locator('.fs-tool')).toContainText('871.2 m');
  });

  test('nonsense pasted where GeoJSON was asked for is refused rather than guessed at', async ({ page }) => {
    await page.goto('/app/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map area' }).click();
    await page.getByLabel('Boundary as GeoJSON').fill('not json at all');
    await expect(page.getByText('Add at least 3 points to compute an area.')).toBeVisible();
  });

  // -- Fence calculator ------------------------------------------------
  //
  // The village-map fence calculator without the map: the same bill
  // (apps/web/src/w360/fenceBill.ts) over sides typed in metres.

  const fenceBill = (page: Page) => page.locator('.fs-tool .fs-bill');
  const billRow = (page: Page, th: string) =>
    fenceBill(page).locator('tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${th}$`) }) }).first();
  const fillSides = async (page: Page, sides: string[]) => {
    const names = ['A–B', 'B–C', 'C–D', 'D–A'];
    for (let i = 0; i < sides.length; i += 1) {
      await page.getByLabel(`Side ${names[i]} (m)`).fill(sides[i]);
    }
  };

  test('?tab=fence opens the fence calculator, and it needs no service at all', async ({ page, world }) => {
    await page.goto('/app/tools?tab=fence');
    await expect(page.getByRole('tab', { name: 'Fence calculator', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { level: 2, name: 'Fence calculator' })).toBeVisible();
    await expect(page.getByText('Enter the length of each side to price a fence')).toBeVisible();
    expect(world.escapes()).toEqual([]);
  });

  test('a hundred by eighty metre plot is 122 posts and 1,440 m of wire, priced at my rates', async ({ page }) => {
    await page.goto('/app/tools?tab=fence');
    await fillSides(page, ['100', '80', '100', '80']);
    await page.getByLabel('Gates', { exact: true }).fill('0');

    await expect(billRow(page, 'Corner posts')).toContainText('4');
    await expect(billRow(page, 'Line posts')).toContainText('118');
    await expect(billRow(page, 'Posts')).toContainText('122');
    await expect(billRow(page, 'Wire')).toContainText('1,440');
    await expect(page.getByText(/4 sides · 360(\.0)? m to fence/)).toBeVisible();

    await page.getByLabel('₹ per post').fill('250');
    await page.getByLabel('₹ per m of wire').fill('12');
    // 122 × ₹250 + 1,440 m × ₹12
    await expect(page.locator('.fs-tool .fs-total')).toContainText('₹47,780');
  });

  test('a side that is not a length is refused, and with no sides there is nothing to print', async ({ page }) => {
    await page.goto('/app/tools?tab=fence');
    await fillSides(page, ['100', '80', '100', '80']);
    const ab = page.getByLabel('Side A–B (m)');
    await ab.fill('-5');
    await expect(ab).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveText('Enter each side as a length in metres, more than 0.');
    // The bad side is left out of the sum rather than subtracted from it.
    await expect(page.getByText(/3 sides · 260(\.0)? m to fence/)).toBeVisible();
    // Printing now would hand the supplier a sheet with that side missing.
    await expect(page.getByRole('button', { name: 'Print for the supplier' })).toBeDisabled();
    await ab.fill('100');
    await expect(page.getByRole('button', { name: 'Print for the supplier' })).toBeEnabled();

    await fillSides(page, ['', '', '', '']);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Enter the length of each side to price a fence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print for the supplier' })).toBeDisabled();
  });

  test('sides can be added and removed, and an open run has one more corner than sides', async ({ page }) => {
    await page.goto('/app/tools?tab=fence');
    await page.getByRole('button', { name: 'Add a side' }).click();
    await expect(page.getByLabel('Side E–A (m)')).toBeVisible();
    await page.getByRole('button', { name: 'Remove side E–A' }).click();
    await expect(page.getByLabel('Side E–A (m)')).toHaveCount(0);

    await page.getByLabel('The fence goes all the way round').uncheck();
    await expect(page.getByLabel('Side D–E (m)')).toBeVisible();
    await page.getByLabel('Side A–B (m)').fill('50');
    await page.getByLabel('Side B–C (m)').fill('50');
    // Two 50 m sides at 3 m: three corners, 16 line posts on each side.
    await expect(billRow(page, 'Corner posts')).toContainText('3');
  });

  test('the estimate prints as a sheet for the supplier, and Clear empties the sides', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => { (window as unknown as { __printed: number }).__printed += 1; };
    });
    await page.goto('/app/tools?tab=fence');
    await fillSides(page, ['100', '80', '100', '80']);
    await page.getByRole('button', { name: 'Print for the supplier' }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    const sheet = page.locator('.fs-tool .fs-sheet');
    await expect(sheet).toContainText('Fence estimate');
    await expect(sheet).toContainText('A–B');
    // Dated, and not titled a second time under the "Fence estimate" heading.
    await expect(sheet.locator('header p')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
    // Typed sides have no shape to draw.
    await expect(sheet.locator('svg.fs-plan')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByLabel('Side A–B (m)')).toHaveValue('');
    await expect(page.getByLabel('Side D–A (m)')).toHaveValue('');
    await expect(page.getByText('Enter the length of each side to price a fence')).toBeVisible();
  });

  test('a side left blank keeps the other sides under the letters they have on screen', async ({ page }) => {
    await page.goto('/app/tools?tab=fence');
    await fillSides(page, ['100', '', '100', '80']);
    await expect(page.getByRole('button', { name: 'Print for the supplier' })).toBeEnabled();

    const sheet = page.locator('.fs-tool .fs-sheet');
    const lines = sheet.locator('.fs-sheet-grid > div').first().locator('tbody tr:not(.fs-sum) th');
    await expect(lines).toHaveText(['A–B', 'C–D', 'D–A']);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the fence calculator fits the width of a phone @phone', async ({ page }) => {
      await page.goto('/app/tools?tab=fence');
      await fillSides(page, ['100', '80', '100', '80']);
      await expect(page.locator('.fs-tool .fs-bill')).toBeVisible();
      const [scroll, inner] = await page.evaluate(() =>
        [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scroll).toBeLessThanOrEqual(inner);
    });
  });
});

// ── the one call that does escape ──────────────────────────────────────

test.describe('the upload door the sealed world has no answer for', () => {
  // ESCAPE, deliberately: the legacy Vault's Upload button posts to
  // /api/gateway/storage/files (pages/documents/storage.ts:52), and
  // fixtures/seed.ts seeds only storage/(nodes|folders) and
  // storage/files/:id/content. Adding the upload door to the shared seed is not
  // this file's to do, and the interesting thing is what the screen does when a
  // storage call comes back refused — which is exactly what a founder with no
  // MinIO running sees. allowConsole for the same refusal in the console.
  test.use({ allowEscapes: true, allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  test('a file the storage could not take is reported by name, and nothing is filed', async ({ page, world }) => {
    const legacy = await legacyApi(page, { documents: [], parcels: [], passbooks: [] });
    await page.goto('/legacy/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'Vault' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sale-deed.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 not really a deed'),
    });

    await expect(page.getByText('Upload failed — sale-deed.pdf')).toBeVisible();
    expect(world.escapes()).toContain('POST /api/gateway/storage/files');
    // Nothing was written down: the vault row is only created once the bytes
    // are stored (pages/documents/upload.ts:64-66).
    expect(legacy.sent).toHaveLength(0);
  });
});
