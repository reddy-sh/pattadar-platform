/**
 * The sections nobody redrew, and the app that is still holding them up.
 *
 * Seven entries on the rail — Families & Groups, Invitations, Notifications,
 * Tools, Audit Log, Admin & Ref Data, Profile — open onto the SAME component,
 * apps/web/src/w360/pages/Section.tsx. It is a signpost: an eyebrow, a title,
 * one paragraph saying what the section is for, a card admitting the redesign
 * has not reached it, and a link into `/legacy/<section>` where the previous
 * interface still does the work. Nothing else on it moves, and nothing on it
 * asks the API for anything.
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

// ── the signposts under /app ───────────────────────────────────────────

/** Section.tsx SECTIONS, copied field for field. Writing the wording out twice
 *  is the point: a change to either copy has to be a deliberate one. */
const SIGNPOSTS = [
  {
    path: 'groups', eyebrow: 'People', title: 'Families & Groups',
    blurb: 'Who is in the family, what each person may see, and which records a group holds together.',
    legacyHeading: 'Families & Groups',
  },
  {
    path: 'invitations', eyebrow: 'People', title: 'Invitations',
    blurb: 'People you have asked to join, and the ones who have asked to join you.',
    legacyHeading: 'Invitations',
  },
  {
    path: 'notifications', eyebrow: 'Waiting on you', title: 'Notifications',
    blurb: 'Everything with a deadline, in one place. The two most urgent also sit on your dashboard.',
    legacyHeading: 'Notifications',
  },
  {
    path: 'tools', eyebrow: 'Reference', title: 'Tools',
    blurb: 'Stamp duty, market value, unit conversion and the SRO directory.',
    legacyHeading: 'Tools',
  },
  {
    path: 'audit', eyebrow: 'Reference', title: 'Audit Log',
    blurb: 'Every link opened, every paper downloaded, every record changed — with who and when.',
    legacyHeading: 'Audit Log',
  },
  {
    path: 'admin', eyebrow: 'Reference', title: 'Admin & Ref Data',
    blurb: 'Districts, mandals, villages, SRO offices, deed types and the fee schedule behind them.',
    legacyHeading: 'Admin & Reference Data',
  },
  {
    path: 'profile', eyebrow: 'You', title: 'Profile',
    blurb: 'Your name, your language, how you sign in, and how you would like to be told about things.',
    legacyHeading: 'Profile',
  },
] as const;

/** The twelve items the previous app's own menu carries (AppShell.tsx:75-90). */
const LEGACY_MENU = [
  'Dashboard', 'Passbooks', 'Land & Properties', 'Vault', 'Families & Groups',
  'Invitations', 'Notifications', 'Wallet', 'Tools', 'Audit Log',
  'Admin & Ref Data', 'Profile',
] as const;

test.describe('the sections the redesign has not reached', () => {
  for (const s of SIGNPOSTS) {
    test(`${s.title} admits it has not been redrawn and points at the screen that still works`, async ({ page }) => {
      await page.goto(`/app/${s.path}`);

      await expect(page.getByRole('heading', { level: 1, name: s.title })).toBeVisible();
      // The eyebrow is a <p class="eyebrow"> (w360/ui.tsx:286) — no role of its
      // own, so it is addressed inside the page head it belongs to.
      await expect(page.locator('.pagehead .eyebrow')).toHaveText(s.eyebrow);
      await expect(page.getByText(s.blurb)).toBeVisible();

      await expect(page.getByRole('heading', { name: 'Not yet redrawn' })).toBeVisible();
      await expect(page.getByText(
        /This section still runs on the previous interface — it works, it just has not been redrawn yet\./,
      )).toBeVisible();

      await expect(page.getByRole('link', { name: `Open ${s.title}` }))
        .toHaveAttribute('href', `/legacy/${s.path}`);
    });
  }

  test('a signpost is a page of words — it asks the API for nothing of its own', async ({ page, world }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    world.clearCalls();

    await page.getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Tools', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Not yet redrawn' })).toBeVisible();

    // Section.tsx has no hook in it at all: whatever the rail re-reads on a
    // navigation belongs to the shell, and the screen itself reads nothing.
    expect(world.calls('portfolio')).toHaveLength(0);
    expect(world.escapes()).toEqual([]);
  });

  test('the link into the previous interface opens in this window, not a second tab', async ({ page }) => {
    // It used to carry the open-in-new-window glyph and promise a tab it never
    // opened; /legacy is this same app, one route over (Section.tsx:64-68).
    await page.goto('/app/audit');
    const open = page.getByRole('link', { name: 'Open Audit Log' });
    await expect(open).not.toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('href', '/legacy/audit');
  });

  test('every signpost names a section the rail also carries, so neither can drift', async ({ page }) => {
    await page.goto('/app');
    const rail = page.getByRole('navigation', { name: 'Sections' });
    for (const s of SIGNPOSTS) {
      // The rail's Notifications entry carries a waiting badge in its name.
      await expect(rail.getByRole('link', { name: new RegExp(`^${s.title}( \\d+)?$`) })).toHaveCount(1);
    }
  });
});

test.describe('following a signpost into the previous interface', () => {
  // Each legacy screen asks the OLD GraphQL surface, which the seal refuses
  // with a 400 (see the file header). Chromium logs that refusal as a console
  // error; that refusal is the point of these tests, not a fault in them.
  test.use({ allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  for (const s of SIGNPOSTS) {
    test(`${s.title} hands me over to the screen that still works`, async ({ page }) => {
      await page.goto(`/app/${s.path}`);
      await page.getByRole('link', { name: `Open ${s.title}` }).click();

      await expect(page).toHaveURL(new RegExp(`/legacy/${s.path}$`));
      await expect(page.getByRole('heading', { level: 1, name: s.legacyHeading }))
        .toBeVisible({ timeout: 25_000 });
      await expect(page.getByText('There is no page at that address')).toHaveCount(0);
    });
  }
});

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
    { from: '/legacy/sro', to: /\/legacy\/tools\?tab=sro$/, heading: 'Tools' },
    { from: '/legacy/stamp-duty', to: /\/legacy\/tools\?tab=stamp-duty$/, heading: 'Tools' },
    { from: '/legacy/market-value', to: /\/legacy\/tools\?tab=market-value$/, heading: 'Tools' },
    { from: '/legacy/calculator', to: /\/legacy\/tools\?tab=calculator$/, heading: 'Tools' },
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

  test('a passbook the service could not be asked about should not be called not mine', async ({ page }) => {
    // DEFECT — pages/detail/PassbookDetailPage.tsx:379 renders NotFoundCard
    // ("Passbook not found or not yours") whenever `data.passbook` is null, and
    // data/useLiveOrSample.ts:50 hands it null for an OUTAGE exactly as readily
    // as for a real 404. An owner whose api is down is told the land may not be
    // theirs. They are owed a sentence naming the outage — which is what this
    // asserts, and what is missing today.
    test.fail();
    await page.goto('/legacy/passbooks/pb-1');
    await expect(page.getByText(/could not be reached|Service unreachable|not reachable/i))
      .toBeVisible({ timeout: 25_000 });
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

  test('the old holdings screen, with no service, offers the first holding', async ({ page }) => {
    await page.goto('/legacy/parcels');
    await expect(page.getByRole('heading', { level: 1, name: 'Land & Properties' })).toBeVisible();
    await expect(page.getByText('Add your first holding')).toBeVisible();
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

  test('the old invitations screen, with no service, has nothing to export', async ({ page }) => {
    await page.goto('/legacy/invitations');
    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    await expect(page.getByText('Invites you send to family members and partners appear here.')).toBeVisible();
    await expect(page.getByText('No invitations yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
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

  test('the old profile, with no service, refuses to let me save over what it could not read', async ({ page }) => {
    await page.goto('/legacy/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByText('Service unreachable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Profile' })).toBeDisabled();
    await expect(page.getByText('District list loads from the live service')).toBeVisible();
    await expect(page.getByText('Not provided')).toBeVisible();
  });

  test('the old wallet still says plainly that it is not live yet', async ({ page }) => {
    await page.goto('/legacy/wallet');
    await expect(page.getByRole('heading', { level: 1, name: 'Wallet' })).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add money' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await expect(page.getByText('Available for payments once the wallet goes live')).toBeVisible();
  });

  test('the old wallet should not print transactions nobody made', async ({ page }) => {
    // DEFECT — data/hooks.ts:322-324 `useWallet()` returns the BUNDLED sample
    // wallet with `isSample: true` and no fetch at all, so the screen flies a
    // "Service unreachable" chip over five invented payments ("EC application
    // fee — Sy 123/2A", "Added money — UPI") under the heading "Recent
    // transactions". The founder's rule (data/useLiveOrSample.ts:1-7) is that
    // no mock row may ever render. The owner is owed an empty history.
    test.fail();
    await page.goto('/legacy/wallet');
    await expect(page.getByRole('heading', { level: 2, name: 'Recent transactions' })).toBeVisible();
    await expect(page.getByText('EC application fee — Sy 123/2A')).toHaveCount(0);
  });

  test('nothing the previous app asks for slips past the seal', async ({ page, world }) => {
    for (const path of ['/legacy', '/legacy/groups', '/legacy/invitations', '/legacy/notifications',
      '/legacy/audit', '/legacy/admin', '/legacy/profile', '/legacy/wallet']) {
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

test.describe('invitations, on the previous interface', () => {
  test.beforeEach(() => { test.slow(); });

  test('every invitation I have sent is listed with its scope, its role and where it stands', async ({ page }) => {
    const legacy = await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');

    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    await expect(page.getByText('1 invitation waiting for a response.')).toBeVisible();

    await expect(page.getByRole('cell', { name: '+91 98480 11111' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'PENDING' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'ACCEPTED' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'REVOKED' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '31/12/2026' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '02/08/2026, 15:00' })).toBeVisible();

    expect(legacy.unanswered, 'this screen reads only invitations').toEqual([]);
  });

  test('a pending invitation can be accepted, revoked or deleted', async ({ page }) => {
    await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');
    await page.getByRole('row', { name: /\+91 98480 11111/ }).getByRole('button', { name: 'Invitation actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Revoke' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  });

  test('an invitation already accepted is not offered acceptance again', async ({ page }) => {
    await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');
    await page.getByRole('row', { name: /lakshmi@example\.com/ }).getByRole('button', { name: 'Invitation actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Accept' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Revoke' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  });

  test('a revoked invitation can only be deleted', async ({ page }) => {
    await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');
    await page.getByRole('row', { name: /branch@bank\.example/ }).getByRole('button', { name: 'Invitation actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Accept' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Revoke' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  });

  test('revoking an invitation sends exactly that, for exactly that invitation', async ({ page }) => {
    const legacy = await legacyApi(page, {
      invitations: INVITATIONS, updateInvitationStatus: { id: 'w-inv-brother' },
    });
    await page.goto('/legacy/invitations');
    await page.getByRole('row', { name: /\+91 98480 11111/ }).getByRole('button', { name: 'Invitation actions' }).click();
    await page.getByRole('menuitem', { name: 'Revoke' }).click();

    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({
      field: 'updateInvitationStatus',
      vars: { id: 'w-inv-brother', status: 'revoked' },
    });
    await expect(page.getByText('Invitation revoked')).toBeVisible();
  });

  test('an invitation with no contact and no scope is not sent, and both fields say so', async ({ page }) => {
    const legacy = await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');

    await page.getByRole('button', { name: 'Send Invitation' }).click();
    await expect(page.getByRole('heading', { name: 'Send Invitation' })).toBeVisible();
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Contact is required')).toBeVisible();
    await expect(page.getByText('Scope ID is required')).toBeVisible();
    expect(legacy.sent).toHaveLength(0);
  });

  test('an invitation is sent with the contact, scope and role that were chosen', async ({ page }) => {
    const legacy = await legacyApi(page, {
      invitations: INVITATIONS, createInvitation: { id: 'w-inv-new', token: 'tok-new' },
    });
    await page.goto('/legacy/invitations');

    await page.getByRole('button', { name: 'Send Invitation' }).click();
    await page.getByLabel('Invitee Contact (Mobile / Email)').fill('lakshmi@example.com');
    await page.getByRole('combobox', { name: 'Scope Type' }).click();
    await page.getByRole('option', { name: 'Passbook' }).click();
    await page.getByLabel('Scope ID').fill('w-pb-4471');
    await page.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Manage' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({
      field: 'createInvitation',
      vars: {
        inviteeContact: 'lakshmi@example.com', scopeType: 'passbook',
        scopeId: 'w-pb-4471', role: 'manage',
      },
    });
    await expect(page.getByText('Invitation sent')).toBeVisible();
  });

  test('an invitation the server refuses is reported, not swallowed', async ({ page }) => {
    await legacyApi(page, {
      invitations: INVITATIONS,
      createInvitation: refused('that contact has already been invited to this parcel'),
    });
    await page.goto('/legacy/invitations');

    await page.getByRole('button', { name: 'Send Invitation' }).click();
    await page.getByLabel('Invitee Contact (Mobile / Email)').fill('lakshmi@example.com');
    await page.getByLabel('Scope ID').fill('w-pb-4471');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Could not send the invitation')).toBeVisible();
  });

  test('deleting an invitation asks first, and says it cannot be undone', async ({ page }) => {
    const legacy = await legacyApi(page, { invitations: INVITATIONS, deleteInvitation: true });
    await page.goto('/legacy/invitations');
    await page.getByRole('row', { name: /branch@bank\.example/ }).getByRole('button', { name: 'Invitation actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    await expect(page.getByRole('heading', { name: 'Delete this invitation?' })).toBeVisible();
    await expect(page.getByText('This cannot be undone.')).toBeVisible();
    expect(legacy.sent).toHaveLength(0);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({ field: 'deleteInvitation', vars: { id: 'w-inv-bank' } });
    await expect(page.getByText('Invitation deleted')).toBeVisible();
  });

  test('with invitations on the table the export is offered in all three formats', async ({ page }) => {
    await legacyApi(page, { invitations: INVITATIONS });
    await page.goto('/legacy/invitations');
    const exportButton = page.getByRole('button', { name: 'Export' });
    await expect(exportButton).toBeEnabled();
    await exportButton.click();
    await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Excel (.xlsx)' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'CSV' })).toBeVisible();
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

// ── the profile screen ─────────────────────────────────────────────────

test.describe('the profile screen, on the previous interface', () => {
  // ProfilePage seeds `interests` from the profile (ProfilePage.tsx:75) as soon
  // as `me` lands, which can be before useDistricts (:40) has answered — and a
  // MUI Select holding a value that is not yet one of its options logs an
  // out-of-range error. It is a race on which of two queries answers first, so
  // it is allowed here rather than asserted.
  test.use({ allowConsole: true });
  test.beforeEach(() => { test.slow(); });

  const PROFILE_WORLD = { me: ME, districts: DISTRICTS };

  test('my profile shows who the account belongs to and how it was signed in to', async ({ page }) => {
    const legacy = await legacyApi(page, PROFILE_WORLD);
    await page.goto('/legacy/profile');

    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Shankar Reddy' })).toBeVisible();
    await expect(page.getByText('shankarreddy.t@pattadar.local')).toBeVisible();
    await expect(page.getByText(/You're signed in via the platform\./)).toBeVisible();
    expect(legacy.unanswered, 'this screen reads me and the district list').toEqual([]);
  });

  test('the profile form opens already holding what was last saved', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/legacy/profile');

    await expect(page.getByRole('combobox', { name: 'Preferred Language' })).toHaveText('English');
    await expect(page.getByLabel('My Address')).toHaveValue('Katragunta, Markapur mandal, Prakasam');
    await expect(page.getByText('On file: XXXX XXXX 4471')).toBeVisible();
    // districtsOfInterest holds an id; the chip must show the district's NAME.
    // Addressed through the select rather than by text, because the same word
    // is sitting in the address box above it.
    await expect(page.getByRole('combobox', { name: 'Districts of Interest' }))
      .toHaveText('Prakasam');
    await expect(page.getByRole('checkbox', { name: 'Email' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'SMS' })).not.toBeChecked();
  });

  test('an Aadhaar typed into the profile is digits only, and never longer than twelve', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/legacy/profile');
    const field = page.getByPlaceholder('Enter 12-digit Aadhaar to update (stored masked, never raw)');
    await field.fill('1234-5678 9012 3456');
    await expect(field).toHaveValue('123456789012');
  });

  test('saving the profile sends exactly what the form is holding', async ({ page }) => {
    const legacy = await legacyApi(page, {
      ...PROFILE_WORLD,
      updateProfile: { kycRefMasked: 'XXXX XXXX 9012' },
    });
    await page.goto('/legacy/profile');

    await page.getByRole('combobox', { name: 'Preferred Language' }).click();
    await page.getByRole('option', { name: /Telugu/ }).click();
    await page.getByLabel('My Address').fill('Tarlupadu, Prakasam');
    await page.getByRole('checkbox', { name: 'SMS' }).check();
    await page.getByPlaceholder('Enter 12-digit Aadhaar to update (stored masked, never raw)').fill('123456789012');
    await page.getByRole('button', { name: 'Save Profile' }).click();

    await expect.poll(() => legacy.sent.length).toBe(1);
    expect(legacy.sent[0]).toMatchObject({
      field: 'updateProfile',
      vars: {
        l: 'te', a: 'Tarlupadu, Prakasam', n: 'email,sms',
        k: '123456789012', m: false, d: 'w-dist-prakasam',
      },
    });
    await expect(page.getByText('Profile saved')).toBeVisible();
  });

  test('a saved profile forgets the Aadhaar it was given and keeps only the mask', async ({ page }) => {
    await legacyApi(page, { ...PROFILE_WORLD, updateProfile: { kycRefMasked: 'XXXX XXXX 9012' } });
    await page.goto('/legacy/profile');

    const field = page.getByPlaceholder('Enter 12-digit Aadhaar to update (stored masked, never raw)');
    await field.fill('123456789012');
    await page.getByRole('button', { name: 'Save Profile' }).click();

    await expect(page.getByText('On file: XXXX XXXX 9012')).toBeVisible();
    await expect(field).toHaveValue('');
  });

  test('a profile the server refuses to save says so', async ({ page }) => {
    await legacyApi(page, { ...PROFILE_WORLD, updateProfile: null });
    await page.goto('/legacy/profile');
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(page.getByText('Could not save the profile')).toBeVisible();
  });

  test('the profile points at the one place privacy and deletion actually live', async ({ page }) => {
    await legacyApi(page, PROFILE_WORLD);
    await page.goto('/legacy/profile');
    await expect(page.getByRole('link', { name: 'Privacy, export and account deletion' }))
      .toHaveAttribute('href', '/app/account');
  });
});

// ── the tools ──────────────────────────────────────────────────────────

test.describe('the tools the previous app still owns', () => {
  test.beforeEach(() => { test.slow(); });

  test('all four tools sit under one screen, and the SRO directory opens first', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/legacy/tools');

    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
    await expect(page.getByText('Everyday land utilities — offices, duty, market value and area conversions.'))
      .toBeVisible();
    for (const name of ['Find SRO', 'Stamp Duty', 'Market Value', 'Area Calculator']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toHaveAttribute('aria-selected', 'true');
  });

  test('?tab= opens the tool the old address pointed at', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await expect(page.getByRole('tab', { name: 'Area Calculator' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { level: 2, name: 'Area Calculator' })).toBeVisible();
  });

  test('a ?tab= nobody wrote a tool for falls back to the SRO directory', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/legacy/tools?tab=nonsense');
    await expect(page.getByRole('tab', { name: 'Find SRO' })).toHaveAttribute('aria-selected', 'true');
  });

  // -- Find SRO --------------------------------------------------------

  test('the SRO directory lists the office for every mandal it knows', async ({ page }) => {
    const legacy = await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/legacy/tools?tab=sro');

    await expect(page.getByRole('heading', { level: 2, name: 'SRO Offices' })).toBeVisible();
    await expect(page.getByText('Find the Sub-Registrar Office for your village before you plan a registration visit.'))
      .toBeVisible();
    await expect(page.getByRole('cell', { name: 'Markapur', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: '1607' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Ongole' }).first()).toBeVisible();
    expect(legacy.unanswered, 'this tab reads only the SRO directory').toEqual([]);
  });

  test('searching the SRO directory narrows it to the district I asked for', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/legacy/tools?tab=sro');
    await page.getByPlaceholder('Search office, district, mandal…').fill('Guntur');

    await expect(page.getByRole('cell', { name: 'Mangalagiri', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Markapur', exact: true })).toHaveCount(0);
  });

  test('an SRO search that matches nothing says so, and suggests what to type', async ({ page }) => {
    await legacyApi(page, { sroOffices: SRO_OFFICES });
    await page.goto('/legacy/tools?tab=sro');
    await page.getByPlaceholder('Search office, district, mandal…').fill('Mumbai');

    await expect(page.getByText('No offices match')).toBeVisible();
    await expect(page.getByText('Try a district or mandal name — for example Guntur, Gannavaram or Kurnool.'))
      .toBeVisible();
  });

  test.describe('with no directory behind it', () => {
    // No legacyApi here, so the old query is refused with a 400 and logged.
    test.use({ allowConsole: true });

    test('an SRO directory that never loaded should not blame my search', async ({ page }) => {
      // DEFECT — pages/ToolsPage.tsx:78-86 draws the "No offices match / Try a
      // district or mandal name" empty state whenever `rows` is empty, which
      // includes the case where NOTHING was typed and the directory never
      // arrived. The owner is told their search is wrong when they have not
      // searched. They are owed the outage, which the header chip beside it
      // already knows about.
      test.fail();
      await page.goto('/legacy/tools?tab=sro');
      await expect(page.getByText('Service unreachable')).toBeVisible();
      await expect(page.getByText('No offices match')).toHaveCount(0);
    });
  });

  // -- Stamp duty ------------------------------------------------------

  test('the stamp duty tool waits for a deed type and two figures before it says anything', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/legacy/tools?tab=stamp-duty');

    await expect(page.getByRole('heading', { level: 2, name: 'Stamp Duty & Fee Calculator' })).toBeVisible();
    await expect(page.getByText('Enter values and click Calculate')).toBeVisible();
    await expect(page.getByText('Duty is charged on the higher of the consideration and the guideline market value.'))
      .toBeVisible();
  });

  test('pressing Calculate with nothing chosen says exactly what is missing', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/legacy/tools?tab=stamp-duty');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.getByText('Pick a deed type and enter the consideration and market value.')).toBeVisible();
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
    await page.goto('/legacy/tools?tab=stamp-duty');

    await page.getByRole('combobox', { name: 'Deed Type' }).click();
    await page.getByRole('option', { name: 'Sale of immovable property — Sale' }).click();
    await page.getByLabel('Consideration Amount (₹)').fill('5000000');
    await page.getByLabel('Market / Guideline Value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Duty & Fee Breakup' })).toBeVisible();
    await expect(page.getByText('3,00,000')).toBeVisible();
    await expect(page.getByText('4,56,000')).toBeVisible();
    await expect(page.getByText('Online payment for stamp duty will be available in a future release.'))
      .toBeVisible();

    expect(legacy.sent).toHaveLength(0);
    expect(legacy.unanswered).toEqual([]);
  });

  test('a duty the service cannot work out is worked out on the spot instead', async ({ page }) => {
    // calculateStampDuty is left unanswered, so `gql` comes back with nothing
    // for it and StampDutyTool.tsx:71 runs @pattadar/core calcStampDuty on the
    // selected row's rates. 5% of the 60,00,000 basis is 3,00,000, and the four
    // charges together are 4,56,000 — the same answer, computed here.
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/legacy/tools?tab=stamp-duty');

    await page.getByRole('combobox', { name: 'Deed Type' }).click();
    await page.getByRole('option', { name: 'Sale of immovable property — Sale' }).click();
    await page.getByLabel('Consideration Amount (₹)').fill('5000000');
    await page.getByLabel('Market / Guideline Value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Duty & Fee Breakup' })).toBeVisible();
    await expect(page.getByText('Sale of immovable property — Sale')).toBeVisible();
    await expect(page.getByText('3,00,000')).toBeVisible();
    await expect(page.getByText('4,56,000')).toBeVisible();
  });

  test('a gift of the same land costs a fifth of what a sale costs', async ({ page }) => {
    await legacyApi(page, { feeSchedule: FEES });
    await page.goto('/legacy/tools?tab=stamp-duty');

    await page.getByRole('combobox', { name: 'Deed Type' }).click();
    await page.getByRole('option', { name: 'Gift to family member — Gift' }).click();
    await page.getByLabel('Consideration Amount (₹)').fill('0');
    await page.getByLabel('Market / Guideline Value (₹)').fill('6000000');
    await page.getByRole('button', { name: 'Calculate' }).click();

    // 1% + 0.5% + 0.5% + 0.1% of 60,00,000 = 60,000 + 30,000 + 30,000 + 6,000.
    await expect(page.getByText('1,26,000')).toBeVisible();
  });

  test.describe('with no fee schedule behind it', () => {
    test.use({ allowConsole: true });

    test('a stamp duty tool with no fee schedule should not claim to be using one', async ({ page }) => {
      // DEFECT — pages/tools/StampDutyTool.tsx:146-150 prints "Working from the
      // bundled fee schedule — the live service is not reachable" whenever
      // `isSample` is set, but data/useLiveOrSample.ts:14-26 hands it an EMPTY
      // list, not the bundled one. The deed-type picker offers nothing, its
      // placeholder reads "(0 AP deed types)", and Calculate can never produce
      // an answer. The owner is owed either the bundled schedule the caption
      // promises, or a sentence saying the tool cannot run at all.
      test.fail();
      await page.goto('/legacy/tools?tab=stamp-duty');
      await expect(page.getByText('Working from the bundled fee schedule — the live service is not reachable.'))
        .toBeVisible();
      await page.getByRole('combobox', { name: 'Deed Type' }).click();
      await expect(page.getByRole('option')).not.toHaveCount(0);
    });
  });

  // -- Market value ----------------------------------------------------

  test('the guideline rates are named as reference figures, not as a valuation', async ({ page }) => {
    const legacy = await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/legacy/tools?tab=market-value');
    // The whole legacy bundle — MUI included — is served cold on a worker's
    // first visit, and this is the first thing this test looks at.
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible({ timeout: 25_000 });

    await expect(page.getByText(/These are reference guideline values published by the AP Registration/))
      .toBeVisible();
    await expect(page.getByText('Actual market values may vary.')).toBeVisible();
    expect(legacy.unanswered, 'this tab reads only the guideline rates').toEqual([]);
  });

  test('the district, mandal and village pickers narrow each other in order', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/legacy/tools?tab=market-value');

    await page.getByRole('combobox', { name: 'District' }).click();
    await page.getByRole('option', { name: 'Prakasam' }).click();

    await page.getByRole('combobox', { name: 'Mandal' }).click();
    // Guntur's mandal has been narrowed out of the list entirely.
    await expect(page.getByRole('option', { name: 'Markapur' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Tarlupadu' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Mangalagiri' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Markapur' }).click();

    await page.getByRole('combobox', { name: 'Village' }).click();
    await expect(page.getByRole('option', { name: 'Katragunta' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Nidamarru' })).toHaveCount(0);
  });

  test('choosing a village puts its rates up as cards, one per classification', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/legacy/tools?tab=market-value');

    await page.getByRole('combobox', { name: 'District' }).click();
    await page.getByRole('option', { name: 'Prakasam' }).click();
    await page.getByRole('combobox', { name: 'Mandal' }).click();
    await page.getByRole('option', { name: 'Markapur' }).click();
    await page.getByRole('combobox', { name: 'Village' }).click();
    await page.getByRole('option', { name: 'Katragunta' }).click();

    await expect(page.getByText('₹18,50,000').first()).toBeVisible();
    await expect(page.getByText('₹4,200').first()).toBeVisible();
    await expect(page.getByText('Katragunta, Markapur · effective 01/04/2026').first()).toBeVisible();
    // The other mandal's rate is gone from the table below.
    await expect(page.getByText('₹11,00,000')).toHaveCount(0);
  });

  test('changing the district throws away the mandal and village that no longer apply', async ({ page }) => {
    await legacyApi(page, { marketValues: MARKET_VALUES });
    await page.goto('/legacy/tools?tab=market-value');

    await page.getByRole('combobox', { name: 'District' }).click();
    await page.getByRole('option', { name: 'Prakasam' }).click();
    await page.getByRole('combobox', { name: 'Mandal' }).click();
    await page.getByRole('option', { name: 'Markapur' }).click();
    await expect(page.getByRole('combobox', { name: 'Mandal' })).toHaveText('Markapur');

    await page.getByRole('combobox', { name: 'District' }).click();
    await page.getByRole('option', { name: 'Guntur' }).click();
    await expect(page.getByRole('combobox', { name: 'Mandal' })).toHaveText('All mandals');
    await expect(page.getByRole('combobox', { name: 'Village' })).toHaveText('All villages');
  });

  test.describe('with no guideline rates behind it', () => {
    test.use({ allowConsole: true });

    test('a market value table with no rows should not blame a selection nobody made', async ({ page }) => {
      // DEFECT — pages/tools/MarketValueTool.tsx:155-163 prints "No guideline
      // rates match this selection." for an EMPTY table, and the caption at
      // :168-172 adds "Sample data — the live service is not reachable" beneath
      // a table that is showing no sample at all. Two sentences, both untrue,
      // for one outage. The owner is owed a single honest one.
      test.fail();
      await page.goto('/legacy/tools?tab=market-value');
      await expect(page.getByText('No guideline rates match this selection.')).toBeVisible();
      await expect(page.getByText('Sample data — the live service is not reachable.')).toHaveCount(0);
    });
  });

  // -- Area calculator -------------------------------------------------

  test('the area calculator needs no service at all — it is arithmetic', async ({ page, world }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await expect(page.getByRole('heading', { level: 2, name: 'Area Calculator' })).toBeVisible();
    await expect(page.getByText(/Convert between Indian land units, measure a plot, estimate fencing/))
      .toBeVisible();
    for (const name of ['Unit Converter', 'Plot Area', 'Fencing', 'Map Area']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    expect(world.escapes()).toEqual([]);
  });

  test('one acre converts to every unit an Andhra farmer actually uses', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await expect(page.getByText('1 Acres =')).toBeVisible();

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
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByLabel('Amount').fill('2');
    await page.getByRole('combobox', { name: 'Unit' }).click();
    await page.getByRole('option', { name: 'Guntas' }).click();

    await expect(page.getByText('2 Guntas =')).toBeVisible();
    await expect(page.getByText('5 Cents')).toBeVisible();
  });

  test('a hundred by fifty foot plot is eleven and a half cents, and its perimeter is offered to the fencing tool', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot Area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByLabel('Width').fill('50');

    await expect(page.getByText('11.48 Cents')).toBeVisible();
    await expect(page.getByText('Perimeter ≈ 300 ft')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use in Fencing →' })).toBeVisible();
  });

  test('a triangle measured in metres is turned into acres without my converting anything', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot Area' }).click();
    await page.getByRole('button', { name: 'Triangle' }).click();
    await page.getByRole('combobox', { name: 'Measured in' }).click();
    await page.getByRole('option', { name: 'Metres' }).click();
    await page.getByLabel('Side A').fill('100');
    await page.getByLabel('Side B').fill('100');
    await page.getByLabel('Side C').fill('100');

    // An equilateral triangle of 100 m sides is 46,609 sq ft. The readout is in
    // acres and cents, which is how a passbook writes it down — never sq ft.
    await expect(page.getByText('1 Acre 7 Cents')).toBeVisible();
  });

  test('an impossible triangle is worth nothing rather than a number somebody might believe', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot Area' }).click();
    await page.getByRole('button', { name: 'Triangle' }).click();
    await page.getByLabel('Side A').fill('10');
    await page.getByLabel('Side B').fill('10');
    await page.getByLabel('Side C').fill('90');
    await expect(page.getByText('0 Cents')).toBeVisible();
  });

  test('the perimeter I measured carries into the fencing estimate instead of being typed twice', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Plot Area' }).click();
    await page.getByLabel('Length').fill('100');
    await page.getByLabel('Width').fill('50');
    await page.getByRole('button', { name: 'Use in Fencing →' }).click();

    await expect(page.getByRole('tab', { name: 'Fencing' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Perimeter (ft)')).toHaveValue('300');
    await expect(page.getByText('38')).toBeVisible();    // ceil(300 / 8) posts
    await expect(page.getByText('900')).toBeVisible();   // 300 ft × 3 strands
  });

  test('a fence with no prices quoted keeps quiet about the cost', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Fencing' }).click();
    await page.getByLabel('Perimeter (ft)').fill('300');
    await expect(page.getByText('Est. cost')).toBeVisible();
    await expect(page.getByText('—', { exact: true })).toBeVisible();

    await page.getByLabel('Cost per post (₹)').fill('250');
    await expect(page.getByText('₹9,500')).toBeVisible();   // 38 posts × ₹250
  });

  test('a boundary with fewer than three corners is not an area, and says so', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map Area' }).click();
    await expect(page.getByText('Add at least 3 points to compute an area.')).toBeVisible();
  });

  test('a boundary pasted as GeoJSON is measured in acres and in metres of fence', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map Area' }).click();
    await page.getByPlaceholder(/"type":"Polygon"/).fill(
      '{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}',
    );

    await expect(page.getByText('11 Acres 74.37 Cents')).toBeVisible();
    await expect(page.getByText('Perimeter ≈ 2,858.36 ft (871.23 m)')).toBeVisible();
  });

  test('nonsense pasted where GeoJSON was asked for is refused rather than guessed at', async ({ page }) => {
    await page.goto('/legacy/tools?tab=calculator');
    await page.getByRole('tab', { name: 'Map Area' }).click();
    await page.getByPlaceholder(/"type":"Polygon"/).fill('not json at all');
    await expect(page.getByText('Add at least 3 points to compute an area.')).toBeVisible();
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
