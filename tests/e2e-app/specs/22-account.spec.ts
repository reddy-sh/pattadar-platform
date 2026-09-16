/**
 * /app/account — "your data": the consent record, the export, and the request
 * to be erased.
 *
 * One screen, one source file (apps/web/src/pages/AccountDataPage.tsx), and the
 * only part of the app where the owner's legal position is the product. Three
 * sections, each with its own endpoint, each of which can be slow, refused or
 * broken independently — so the file is arranged by section and then by state.
 *
 * What a reader of this file should know before changing it:
 *
 *  · This screen is the one corner of /app that is NOT GraphQL. It talks to
 *    three REST endpoints under /api/gateway/account — consent, export and
 *    erasure — so nothing here goes through `world.set`. Every test wires its
 *    own answers with `world.route`, which is registered last-wins and so
 *    overrides the ones `seedRest` put there.
 *  · The seeded consent answer (fixtures/seed.ts:872) is a list of OBJECTS
 *    (`{key,label,required,granted}`), and the real endpoint answers with a
 *    list of KEY STRINGS — `{version, purposes: ['document_processing', …]}`,
 *    services/api/src/account.py:172-173. The screen reads the real shape
 *    (`purposes.includes(key)`, AccountDataPage.tsx:56), so every test here
 *    seeds the real one. The fixture is not editable from a spec and the
 *    mismatch only ever reads as "nothing recorded", which is a legal state,
 *    so it is answered here rather than worked around.
 *  · The seeded erasure POST answer is `{request:{…}}`; the real one is the
 *    receipt itself (services/api/src/account.py:249 returns `receipt(row)`),
 *    and the screen assigns it straight through. Same reason, same answer:
 *    every deletion test seeds its own receipt, with the eight real stage
 *    names from account.py:21.
 *  · The purpose keys and the notice version are the screen's own constants
 *    (AccountDataPage.tsx:6-11) and are validated server-side against
 *    account.py:20 — a drift on either side is a 400, so both are asserted.
 *  · The shell mounts a permanently-present, visually hidden `role="status"`
 *    for the jump box (Shell.tsx:334). Every status and alert assertion here
 *    is scoped to `main`, or it matches that instead.
 *  · An HTTP error status makes Chrome log a failed request, which the console
 *    guard fails on, so the refusal tests sit inside one `allowConsole`
 *    describe. Provoking the error is the whole point of each of them.
 *
 * Eleven defects are recorded as `test.fail()`, each naming its cause:
 *   1. AccountDataPage.tsx:7-11,56 — no purpose is marked required and every
 *      box can be switched off, including `document_processing`, without which
 *      the gateway refuses every upload (routes_account.py:31-32).
 *   2. AccountDataPage.tsx:27 — `res.json()` is unguarded, so a gateway that
 *      answers with an HTML error page shows the owner a JSON parse error.
 *   3. AccountDataPage.tsx:30 — a refusal whose reason is in `detail.message`
 *      or `detail.error` (the shape this API actually raises) is flattened to
 *      "Try again", which is the wrong advice when the account is being erased.
 *   4. AccountDataPage.tsx:41 — a load that failed offers no way to try again;
 *      the only exit is a browser reload.
 *   5. AccountDataPage.tsx:76 — "Refresh status" re-reads consent too and
 *      silently throws away a tick the owner has not saved yet.
 *   6. AccountDataPage.tsx:56-59 — "Your choices have been recorded." stays on
 *      screen after the owner changes a choice, so it describes choices that
 *      are no longer the ones shown.
 *   7. AccountDataPage.tsx:56 — while the choices are being read the screen is
 *      three empty boxes, which is exactly how it draws "you consented to
 *      nothing". Loading and refused must not share a picture with a state.
 *   8. AccountDataPage.tsx:76 — the deletion stages are printed as the
 *      operator runner's column names (`cognito_identity: pending`).
 *   9. AccountDataPage.tsx:76 — the receipt carries `createdAt` and the screen
 *      drops it, so a request under way never says when it was made.
 *  10. AccountDataPage.tsx:39,55 — the section promises "recorded with your
 *      account and the date", the read hands `acceptedAt` over, and the screen
 *      keeps only `purposes`: the date is never shown.
 *  11. AccountDataPage.tsx:56 — an account that has never been asked is drawn
 *      identically to one that refused everything, though the gateway treats
 *      the two oppositely (routes_account.py:31-32).
 * They go green the day they are fixed.
 */
import { readFile } from 'node:fs/promises';

import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';

// ── the world this screen lives in ─────────────────────────────────────

/** The notice version the screen prints and posts (AccountDataPage.tsx:6). */
const VERSION = '2026-09-12';

/** The three purpose keys, as the screen and the API both spell them
 *  (AccountDataPage.tsx:7-11 / services/api/src/account.py:20). */
const KEY = {
  records: 'document_processing',
  ai: 'ai_extraction',
  messages: 'service_notifications',
} as const;

/** Enough of each purpose's sentence to name its checkbox. */
const LABEL = {
  records: 'Store and organise my records',
  ai: 'Use AI providers to read documents',
  messages: 'Send messages about my service requests',
} as const;

/** The eight stages the erasure runner reports (services/api/src/account.py:21). */
const STAGES = [
  'freeze_access', 'storage_objects', 'assistant_objects', 'assistant_data',
  'api_data', 'storage_metadata', 'cognito_identity', 'verify',
] as const;

interface Receipt {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  stages: Array<{ name: string; status: string }>;
  needsOperator: boolean;
}

/** A receipt shaped exactly like `receipt(row)` in services/api/src/account.py. */
function receiptOf(status: string, done: Partial<Record<(typeof STAGES)[number], string>> = {}): Receipt {
  return {
    id: 'erasure-7f3a9c21',
    status,
    createdAt: '2026-09-13T04:30:00+00:00',
    updatedAt: '2026-09-13T04:31:00+00:00',
    completedAt: null,
    stages: STAGES.map((name) => ({ name, status: done[name] ?? 'pending' })),
    needsOperator: status !== 'completed',
  };
}

/** What one of these routes answers with. The same fields `world.route` takes. */
interface Answer {
  status?: number;
  json?: unknown;
  body?: string;
  contentType?: string;
  delayMs?: number;
}

/**
 * GET /consent answers with what has been recorded; POST records it.
 * `get` / `post` replace either half, for the refusal branches. A `post` given
 * as a LIST is consumed one answer per attempt and then the record is kept for
 * real, which is how a test fails a save and lets the retry through.
 *
 * `acceptedAt` is the day the record was made, and `null` is the account that
 * has never been asked at all — a different legal state from one that refused
 * everything, and one the gateway itself branches on
 * (services/gateway/app/routes_account.py:31-32).
 */
function seedConsent(
  world: World,
  opts: { purposes?: string[]; acceptedAt?: string | null; get?: Answer; post?: Answer | Answer[] } = {},
) {
  const state = {
    version: VERSION,
    purposes: [...(opts.purposes ?? [])],
    acceptedAt: opts.acceptedAt === undefined ? '2026-09-10T09:00:00+00:00' : opts.acceptedAt,
  };
  const posted: Array<{ version?: string; purposes?: string[] }> = [];
  const scripted = Array.isArray(opts.post) ? [...opts.post] : null;
  world.route(/\/api\/gateway\/account\/consent/, (_route, call) => {
    if (call.method === 'POST') {
      const body = JSON.parse(call.body ?? '{}') as { version?: string; purposes?: string[] };
      posted.push(body);
      const answer = scripted ? scripted.shift() : (opts.post as Answer | undefined);
      if (answer) return answer;
      state.purposes = body.purposes ?? [];
      // A new consent row, with a new accepted_at (account.py:186).
      state.acceptedAt = '2026-09-13T04:30:00+00:00';
      return { json: { ...state, purposes: [...state.purposes] } };
    }
    // A `get` carrying only a delay still answers with the record; one
    // carrying a body (an HTML error page) must not have JSON put over it.
    if (opts.get) return { ...opts.get, json: opts.get.json ?? (opts.get.body === undefined ? { ...state } : undefined) };
    return { json: { ...state, purposes: [...state.purposes] } };
  });
  return { state, posted };
}

/** GET /erasure answers with the request under way (or none); POST files one. */
function seedErasure(world: World, opts: { current?: Receipt | null; post?: Answer } = {}) {
  const state: { current: Receipt | null } = { current: opts.current ?? null };
  const posted: Array<Record<string, unknown>> = [];
  world.route(/\/api\/gateway\/account\/erasure/, (_route, call) => {
    if (call.method !== 'POST') return { json: { request: state.current } };
    posted.push(JSON.parse(call.body ?? '{}') as Record<string, unknown>);
    if (opts.post) return opts.post;
    state.current = receiptOf('requested');
    return { status: 202, json: state.current };
  });
  return { state, posted };
}

/** What the gateway hands back for an export (routes_account.py:69-79). */
const EXPORT = {
  version: VERSION,
  exportedAt: '2026-09-13T04:30:00+00:00',
  data: { parcels: [{ id: 'p-1', survey_no: '214/2' }], documents: [{ id: 'd-1', title: 'Sale deed' }] },
  files: {
    nodes: [{ id: 'file-deed', name: 'sale-deed.pdf' }, { id: 'file-map', name: 'fmb.png' }],
    versions: [{ id: 'v-1', node_id: 'file-deed', downloadUrl: '/api/gateway/storage/files/file-deed/content?version=v-1' }],
    tags: [], nodeTags: [], shares: [],
  },
  assistant: { conversations: [] },
};

// ── handles ────────────────────────────────────────────────────────────

/** The screen. Scoped, because the shell keeps a live region of its own
 *  (Shell.tsx:334) that would otherwise answer every `role="status"`. */
const screen = (page: Page) => page.getByRole('main');

/** One of the three sections, named by its heading. The page draws bare
 *  `<section>` elements (AccountDataPage.tsx:53,63,73) with no accessible name
 *  of their own, so the heading inside is the only handle there is. */
const section = (page: Page, heading: string) =>
  screen(page).locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });

const choices = (page: Page) => section(page, 'Your recorded choices');
const exporting = (page: Page) => section(page, 'Export your records');
const deletion = (page: Page) => section(page, 'Delete your account');

const box = (page: Page, which: keyof typeof LABEL) =>
  screen(page).getByRole('checkbox', { name: LABEL[which] });

/** The save button by position rather than by name: its label changes to
 *  "Saving…" while the POST is in flight, and the section holds no other. */
const saveButton = (page: Page) => choices(page).getByRole('button');
const exportButton = (page: Page) => exporting(page).getByRole('button');

const confirmField = (page: Page) => page.getByLabel('Type DELETE MY ACCOUNT to request deletion');
const requestButton = (page: Page) => page.getByRole('button', { name: 'Request account deletion' });

const alert = (page: Page) => screen(page).getByRole('alert');
const says = (page: Page, text: string | RegExp) => screen(page).getByRole('status').filter({ hasText: text });

// ── the page as it arrives ─────────────────────────────────────────────

test('the account page lists the three things my consent covers, and ticks the ones I have already agreed to', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records, KEY.ai] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(page.getByRole('heading', { name: 'Your account and data', level: 1 })).toBeVisible();
  await expect(choices(page).getByText(`Notice version ${VERSION}`)).toBeVisible();
  await expect(screen(page).getByRole('checkbox')).toHaveCount(3);
  await expect(box(page, 'records')).toBeChecked();
  await expect(box(page, 'ai')).toBeChecked();
  await expect(box(page, 'messages')).not.toBeChecked();
});

test('each choice is a sentence about what happens, not a key out of the database', async ({ page, world }) => {
  seedConsent(world, { purposes: [] });
  seedErasure(world);
  await page.goto('/app/account');

  // The words beside the box ARE the consent — this is the one screen where
  // the copy is the legal position, so it is asserted whole and in order
  // (AccountDataPage.tsx:8-10) rather than by a prefix that would survive an
  // edit to the end of any sentence.
  await expect(choices(page).locator('label')).toHaveText([
    'Store and organise my records and the people connected to them.',
    'Use AI providers to read documents when I ask for a reading.',
    'Send messages about my service requests and their progress.',
  ]);
});

test('the page says plainly that changing a choice does not undo work already done', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(choices(page)).toContainText('Changes do not undo files already processed or messages already sent.');
});

test('the privacy notice, the terms and a person to complain to are all one click away', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(screen(page).getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy');
  await expect(screen(page).getByRole('link', { name: 'terms of use' })).toHaveAttribute('href', '/terms');
  await expect(screen(page).getByRole('link', { name: 'grievance@pattadar.com' }))
    .toHaveAttribute('href', 'mailto:grievance@pattadar.com');
});

test('an account with nothing recorded yet can still record its first choice', async ({ page, world }) => {
  seedConsent(world, { purposes: [] });
  seedErasure(world);
  await page.goto('/app/account');

  // That this state is drawn as three bare empty boxes, indistinguishable from
  // an account that refused everything, is DEFECT 11 below. What is held here
  // is narrower and stays true after that is fixed: an account with no record
  // is not locked out of making one.
  await expect(saveButton(page)).toBeEnabled();
  for (const which of ['records', 'ai', 'messages'] as const) {
    await expect(box(page, which)).not.toBeChecked();
    await expect(box(page, which)).toBeEnabled();
  }
});

// DEFECT 10 — AccountDataPage.tsx:39,55. The section tells the owner "These
// choices are recorded with your account and the date." The date is on every
// read — `acceptedAt`, services/api/src/account.py:172-173 — and refresh() keeps
// only `purposes` from that answer, so the date is dropped on the floor. A
// consent record whose date the owner cannot see is one they cannot check
// against anything: not the notice they were shown, not the day they signed up,
// not the refusal an upload gave them this morning. The owner is owed the day
// the choices now on screen were recorded.
test.fail('my recorded choices say what day they were recorded', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records, KEY.ai], acceptedAt: '2026-09-10T09:00:00+00:00' });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(box(page, 'records')).toBeChecked();   // the read has landed
  await expect(choices(page)).toContainText(/10 Sep|2026-09-10|10\/09\/2026/, { timeout: 3_000 });
});

// DEFECT 11 — AccountDataPage.tsx:56. An account that has NEVER been asked
// (`acceptedAt: null`, account.py:172-173) is drawn byte for byte like an account
// that WAS asked and refused everything. Those are not the same thing anywhere
// else in this product: the gateway keeps processing uploads for the first
// (routes_account.py:31-32 enforces only once acceptedAt is set) and refuses
// them with 403 CONSENT_REQUIRED for the second. So the one screen that could
// explain why a file was refused shows the same three empty boxes either way.
// The owner is owed the difference said out loud — asserted as a difference
// rather than as a sentence, because any wording that tells them apart is a fix.
test.fail('an account that has never been asked does not look like one that refused everything', async ({ page, world }) => {
  seedConsent(world, { purposes: [], acceptedAt: null });
  seedErasure(world);
  await page.goto('/app/account');
  await expect(saveButton(page)).toBeEnabled();
  const neverAsked = (await choices(page).innerText()).replace(/\s+/g, ' ').trim();

  seedConsent(world, { purposes: [], acceptedAt: '2026-09-10T09:00:00+00:00' });
  await page.reload();
  await expect(saveButton(page)).toBeEnabled();
  const refusedEverything = (await choices(page).innerText()).replace(/\s+/g, ' ').trim();

  expect(neverAsked).not.toEqual(refusedEverything);
});

test('nothing can be saved over my recorded choices while they are still being read', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records, KEY.ai], get: { delayMs: 1_500 } });
  seedErasure(world);
  await page.goto('/app/account');

  // Before the answer lands the screen must not accept an edit — a POST built
  // from boxes it has not filled in yet would erase the real record.
  await expect(saveButton(page)).toBeDisabled();
  await expect(box(page, 'records')).toBeDisabled();

  await expect(saveButton(page)).toBeEnabled();
  await expect(box(page, 'records')).toBeChecked();
});

// DEFECT 7 — AccountDataPage.tsx:56. While the GET is in flight the section is
// three unticked, disabled boxes, which is byte for byte how it draws an
// account that agreed to nothing. The owner is owed the shared waiting state
// the rest of the app uses — `Loading` in w360/ui.tsx:648, a role="status"
// carrying aria-busy and a sentence — so that "still being read" and "you
// declined everything" are never the same picture (founder's zero-state
// standard, 2026-09-12). Asserted on aria-busy rather than on words, because
// the purpose labels already contain "a reading" and would match any wording.
test.fail('while my choices are being read the page says so instead of showing me three empty boxes', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records, KEY.ai], get: { delayMs: 2_500 } });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(choices(page).locator('[aria-busy="true"]')).toBeVisible({ timeout: 3_000 });
});

// ── recording a choice ─────────────────────────────────────────────────

test('changing one choice saves exactly the boxes I left ticked, under the notice version on screen', async ({ page, world }) => {
  const consent = seedConsent(world, { purposes: [KEY.records, KEY.ai] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(box(page, 'ai')).toBeChecked();
  await box(page, 'ai').uncheck();
  await box(page, 'messages').check();
  await saveButton(page).click();

  await expect(says(page, 'Your choices have been recorded.')).toBeVisible();
  expect(consent.posted).toEqual([{ version: VERSION, purposes: [KEY.records, KEY.messages] }]);
});

test('the choice I recorded is still the one showing when I come back to the page', async ({ page, world }) => {
  const consent = seedConsent(world, { purposes: [KEY.records, KEY.ai] });
  seedErasure(world);
  await page.goto('/app/account');

  await box(page, 'ai').uncheck();
  await box(page, 'messages').check();
  await saveButton(page).click();
  await expect(says(page, 'Your choices have been recorded.')).toBeVisible();

  await page.reload();
  await expect(box(page, 'records')).toBeChecked();
  await expect(box(page, 'ai')).not.toBeChecked();
  await expect(box(page, 'messages')).toBeChecked();
  expect(consent.state.purposes).toEqual([KEY.records, KEY.messages]);
});

test('withdrawing every choice records an empty list rather than quietly doing nothing', async ({ page, world }) => {
  const consent = seedConsent(world, { purposes: [KEY.records, KEY.ai, KEY.messages] });
  seedErasure(world);
  await page.goto('/app/account');

  await box(page, 'records').uncheck();
  await box(page, 'ai').uncheck();
  await box(page, 'messages').uncheck();
  await saveButton(page).click();

  await expect(says(page, 'Your choices have been recorded.')).toBeVisible();
  expect(consent.posted).toEqual([{ version: VERSION, purposes: [] }]);
});

test('while my choices are saving the page says so and will not take a second click', async ({ page, world }) => {
  const consent = seedConsent(world, { purposes: [KEY.records], post: { json: { version: VERSION, purposes: [KEY.records, KEY.ai] }, delayMs: 1_500 } });
  seedErasure(world);
  await page.goto('/app/account');

  await box(page, 'ai').check();
  await saveButton(page).click();

  await expect(saveButton(page)).toHaveText('Saving…');
  await expect(saveButton(page)).toBeDisabled();
  await expect(box(page, 'ai')).toBeDisabled();
  await expect(exportButton(page)).toBeDisabled();

  await expect(saveButton(page)).toHaveText('Save choices');
  await expect(says(page, 'Your choices have been recorded.')).toBeVisible();
  expect(consent.posted).toHaveLength(1);
});

// DEFECT 1 — AccountDataPage.tsx:7-11 and :56. Every purpose is drawn as a
// plain, freely clearable checkbox. `document_processing` is not optional in
// this product: services/gateway/app/routes_account.py:31-32 refuses every
// file upload with 403 CONSENT_REQUIRED once it is absent. The owner is owed
// that purpose marked as required and held on — or, at the very least, marked
// as required in the words beside it, so the owner knows what comes off with
// the tick. Either of those is a fix, so the test accepts either: it asks only
// that the box not be an ordinary, unmarked, freely clearable one.
test.fail('the choice the service cannot run without is marked required rather than left looking optional', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records, KEY.ai] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(saveButton(page)).toBeEnabled();   // the read has landed
  const row = choices(page).locator('label').filter({ hasText: LABEL.records });
  await expect
    .poll(async () => (await box(page, 'records').isDisabled()) || /required/i.test(await row.innerText()), {
      timeout: 3_000,
      message: 'document_processing is drawn as a plain checkbox with nothing marking it required',
    })
    .toBe(true);
});

// DEFECT 6 — AccountDataPage.tsx:56-59. `message` is only ever cleared by the
// next run(), so after a save the screen keeps saying the choices on it have
// been recorded while the owner ticks a different set. The owner is owed the
// confirmation withdrawn the moment the boxes stop matching what was sent.
test.fail('the page stops claiming my choices are recorded the moment I change one', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await box(page, 'ai').check();
  await saveButton(page).click();
  await expect(says(page, 'Your choices have been recorded.')).toBeVisible();

  await box(page, 'messages').check();
  await expect(says(page, 'Your choices have been recorded.')).toBeHidden({ timeout: 3_000 });
});

// ── exporting ──────────────────────────────────────────────────────────

test('downloading my data gives me a dated file with my records and the manifest of my stored files in it', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  world.route(/\/api\/gateway\/account\/export/, () => ({
    json: EXPORT,
    headers: { 'Content-Disposition': 'attachment; filename="pattadar-account-export.json"' },
  }));
  await page.goto('/app/account');

  const arriving = page.waitForEvent('download');
  await exportButton(page).click();
  const download = await arriving;

  // Named for the day it was taken (AccountDataPage.tsx:69). The exact date is
  // not asserted: the name is built from UTC and the run is not.
  expect(download.suggestedFilename()).toMatch(/^pattadar-export-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(saved).toEqual(EXPORT);
  expect(saved.files.nodes.map((n: { name: string }) => n.name)).toEqual(['sale-deed.pdf', 'fmb.png']);
  await expect(says(page, 'Your export has been downloaded.')).toBeVisible();
});

test('the export says my original files stay where they are', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(exporting(page)).toContainText('The original files remain available in Papers.');
});

test('while my export is being built the button says so and the rest of the page is held', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  world.route(/\/api\/gateway\/account\/export/, () => ({ json: EXPORT, delayMs: 1_500 }));
  await page.goto('/app/account');

  const arriving = page.waitForEvent('download');
  await exportButton(page).click();

  await expect(exportButton(page)).toHaveText('Preparing export…');
  await expect(exportButton(page)).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();

  await arriving;
  await expect(exportButton(page)).toHaveText('Download my data');
  await expect(says(page, 'Your export has been downloaded.')).toBeVisible();
});

// ── asking to be deleted ───────────────────────────────────────────────

test('the deletion button stays out of reach until I have typed the words exactly', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(requestButton(page)).toBeDisabled();
  await confirmField(page).fill('delete my account');
  await expect(requestButton(page)).toBeDisabled();
  await confirmField(page).fill('DELETE MY ACCOUNT ');
  await expect(requestButton(page)).toBeDisabled();
  await confirmField(page).fill('DELETE MY ACCOUNT');
  await expect(requestButton(page)).toBeEnabled();
});

test('the page warns me to sign in again before asking for deletion, and says it happens in stages', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(deletion(page)).toContainText('Sign in again before requesting deletion.');
  await expect(deletion(page)).toContainText('it is complete only when every required stage succeeds');
});

test('requesting deletion files the request and says plainly that nothing has been deleted yet', async ({ page, world }) => {
  const erasure = seedErasure(world);
  seedConsent(world, { purposes: [KEY.records] });
  await page.goto('/app/account');

  await confirmField(page).fill('DELETE MY ACCOUNT');
  await requestButton(page).click();

  await expect(says(page, 'Your deletion request was recorded. Your data has not been deleted yet.')).toBeVisible();
  expect(erasure.posted).toEqual([{ confirmation: 'DELETE MY ACCOUNT' }]);

  // The form is replaced by the receipt: there is nothing left to confirm.
  await expect(confirmField(page)).toHaveCount(0);
  await expect(says(page, 'Request erasure-7f3a9c21: requested')).toBeVisible();
});

test('while my deletion request is being recorded the button says so and will not take a second click', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  const erasure = seedErasure(world, { post: { status: 202, json: receiptOf('requested'), delayMs: 1_500 } });
  await page.goto('/app/account');

  await confirmField(page).fill('DELETE MY ACCOUNT');
  await requestButton(page).click();

  // The third of the three in-flight words on this screen (AccountDataPage.tsx:81).
  const recording = deletion(page).getByRole('button', { name: 'Recording request…' });
  await expect(recording).toBeVisible();
  await expect(recording).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  await expect(exportButton(page)).toBeDisabled();

  await expect(says(page, 'Your deletion request was recorded. Your data has not been deleted yet.')).toBeVisible();
  // One request, not two — a second one while the first was in flight is
  // exactly what this button being disabled is for.
  expect(erasure.posted).toHaveLength(1);
});

test('checking on my deletion holds the rest of the page until the answer is back', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  // Fast on the way in, slow on the re-read: the point is the second one. A
  // flag rather than a call count, because React's StrictMode runs the mount
  // effect twice in dev and the page therefore arrives having read twice.
  let slow = false;
  world.route(/\/api\/gateway\/account\/erasure/, () => ({
    json: { request: receiptOf('processing', { freeze_access: 'complete' }) },
    delayMs: slow ? 1_500 : 0,
  }));
  await page.goto('/app/account');

  const refresh = deletion(page).getByRole('button', { name: 'Refresh status' });
  await expect(refresh).toBeEnabled();
  slow = true;
  await refresh.click();

  // busy='refresh' (AccountDataPage.tsx:76) holds every control on the page,
  // including the choices — refresh() overwrites them, so an edit made while
  // it is in flight would be thrown away without a word.
  await expect(refresh).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  await expect(exportButton(page)).toBeDisabled();
  await expect(box(page, 'records')).toBeDisabled();

  await expect(refresh).toBeEnabled();
  await expect(saveButton(page)).toBeEnabled();
});

test('a deletion under way shows every stage it still has to get through', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  const done = { freeze_access: 'complete', storage_objects: 'complete' } as const;
  seedErasure(world, { current: receiptOf('processing', done) });
  await page.goto('/app/account');

  await expect(says(page, 'Request erasure-7f3a9c21: processing')).toBeVisible();
  // All eight, in the order the runner works through them, each carrying the
  // status the receipt gave it. A count alone would pass a screen that dropped
  // a stage and repeated another, or that printed every one as pending.
  // (The WORDING is DEFECT 8 below; what this test holds is that nothing is
  // lost, reordered or mislabelled, which stays true after that is fixed.)
  await expect(deletion(page).getByRole('listitem')).toHaveText(
    STAGES.map((name) => `${name}: ${(done as Partial<Record<string, string>>)[name] ?? 'pending'}`),
  );

  // A request already filed is never asked to be confirmed a second time.
  await expect(confirmField(page)).toHaveCount(0);
  await expect(deletion(page).getByRole('button', { name: 'Refresh status' })).toBeVisible();
});

test('a deletion with stages left to run never tells me my account is gone', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world, { current: receiptOf('processing', { freeze_access: 'complete' }) });
  await page.goto('/app/account');

  await expect(says(page, 'Request erasure-7f3a9c21: processing')).toBeVisible();
  await expect(deletion(page)).not.toContainText(/your account has been deleted|deletion is complete|your data has been deleted/i);
});

test('a stage that failed is shown as failed rather than left looking like progress', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  const erasure = seedErasure(world, { current: receiptOf('processing', { freeze_access: 'complete' }) });
  await page.goto('/app/account');

  await expect(deletion(page).getByText('freeze_access: complete')).toBeVisible();

  erasure.state.current = receiptOf('failed', { freeze_access: 'complete', storage_objects: 'failed' });
  await deletion(page).getByRole('button', { name: 'Refresh status' }).click();

  await expect(says(page, 'Request erasure-7f3a9c21: failed')).toBeVisible();
  await expect(deletion(page).getByText('storage_objects: failed')).toBeVisible();
});

test('a deletion that finished every stage says completed, and still offers nothing to confirm', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  const done = Object.fromEntries(STAGES.map((s) => [s, 'complete'])) as Partial<Record<(typeof STAGES)[number], string>>;
  seedErasure(world, { current: { ...receiptOf('completed', done), completedAt: '2026-09-13T05:00:00+00:00', needsOperator: false } });
  await page.goto('/app/account');

  await expect(says(page, 'Request erasure-7f3a9c21: completed')).toBeVisible();
  // "completed" at the top has to mean all eight underneath it said so too —
  // a count would pass a receipt that called itself complete over pending work.
  await expect(deletion(page).getByRole('listitem')).toHaveText(STAGES.map((name) => `${name}: complete`));
  await expect(confirmField(page)).toHaveCount(0);
});

// DEFECT 8 — AccountDataPage.tsx:76. The stage list prints the operator
// runner's own identifiers (services/api/scripts/erase_account.py:288-294):
// "storage_metadata: pending", "cognito_identity: pending". The owner is owed
// the same eight steps in words they can check — what has gone, what has not.
test.fail('the deletion stages are named in words rather than in the runner column names', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world, { current: receiptOf('processing', { freeze_access: 'complete' }) });
  await page.goto('/app/account');

  await expect(says(page, 'Request erasure-7f3a9c21: processing')).toBeVisible();
  await expect(deletion(page)).not.toContainText('cognito_identity', { timeout: 3_000 });
});

// DEFECT 9 — AccountDataPage.tsx:12,76. `createdAt` is in the Receipt type and
// in every answer the API gives (services/api/src/account.py:230), and the
// screen never draws it. A request that is processed in stages, by a person,
// out of band, must say when it was asked for — it is the only thing that tells
// the owner whether the silence is normal.
test.fail('a deletion request under way says when I asked for it', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world, { current: receiptOf('processing', { freeze_access: 'complete' }) });
  await page.goto('/app/account');

  await expect(says(page, 'Request erasure-7f3a9c21: processing')).toBeVisible();
  await expect(deletion(page)).toContainText(/13 Sep|2026-09-13|13\/09\/2026/, { timeout: 3_000 });
});

// DEFECT 5 — AccountDataPage.tsx:34,39,76. "Refresh status" calls refresh(),
// which re-reads consent as well as the receipt and overwrites `purposes` with
// the server's copy. A tick the owner has made and not yet saved disappears
// with no word said. The owner is owed either a refresh that touches only the
// receipt, or a warning before their edit is thrown away.
test.fail('checking on my deletion does not throw away a choice I have not saved yet', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  const erasure = seedErasure(world, { current: receiptOf('requested') });
  await page.goto('/app/account');

  await box(page, 'messages').check();
  await expect(box(page, 'messages')).toBeChecked();

  erasure.state.current = receiptOf('processing', { freeze_access: 'complete' });
  await deletion(page).getByRole('button', { name: 'Refresh status' }).click();
  await expect(says(page, 'Request erasure-7f3a9c21: processing')).toBeVisible();

  await expect(box(page, 'messages')).toBeChecked({ timeout: 3_000 });
});

// ── arriving from sign-up ──────────────────────────────────────────────

test('arriving here from sign-up explains why I am here before I file anything', async ({ page, world }) => {
  seedConsent(world, { purposes: [] });
  seedErasure(world);
  await page.goto('/app/account?welcome=1');

  await expect(screen(page)).toContainText('Welcome to Pattadar. Read the notice and record your choices before adding your first record.');
  await expect(screen(page)).toContainText('AI readings and service messages have separate choices.');
  await expect(screen(page).getByRole('link', { name: 'Continue to my records' })).toHaveAttribute('href', '/app');
});

test('the welcome door sends me on to the page I was heading for', async ({ page, world }) => {
  seedConsent(world, { purposes: [] });
  seedErasure(world);

  // Both halves of the allowlist (AccountDataPage.tsx:18): the new app and the
  // previous one, which is still routed under /legacy (routes.tsx:311) and is
  // where a signed-up owner following an old link is heading.
  for (const wanted of ['/app/papers', '/legacy/documents', '/legacy']) {
    await page.goto(`/app/account?welcome=1&returnTo=${encodeURIComponent(wanted)}`);
    await expect(screen(page).getByRole('link', { name: 'Continue to my records' })).toHaveAttribute('href', wanted);
  }
});

test('a returnTo pointing anywhere but this app is ignored and I am sent to my records', async ({ page, world }) => {
  seedConsent(world, { purposes: [] });
  seedErasure(world);

  for (const hostile of ['https://evil.example/steal', '//evil.example', '/appearances', 'javascript:alert(1)']) {
    await page.goto(`/app/account?welcome=1&returnTo=${encodeURIComponent(hostile)}`);
    await expect(screen(page).getByRole('link', { name: 'Continue to my records' })).toHaveAttribute('href', '/app');
  }
});

test('coming to my data page on my own shows no welcome banner and no way out of it', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(screen(page)).not.toContainText('Welcome to Pattadar');
  await expect(screen(page).getByRole('link', { name: 'Continue to my records' })).toHaveCount(0);
});

// ── when the server says no ────────────────────────────────────────────

test.describe('when the server says no', () => {
  // Every test in here provokes an HTTP error on purpose, and Chrome logs a
  // failed request for each one. The console guard would otherwise fail the
  // very tests whose point is that the screen survives the failure.
  test.use({ allowConsole: true });

  test('a stale sign-in on the way in tells me to sign in again instead of showing me empty choices', async ({ page, world }) => {
    seedConsent(world, { get: { status: 401, json: { detail: { error: 'UNAUTHENTICATED' } } } });
    seedErasure(world);
    await page.goto('/app/account');

    await expect(alert(page)).toHaveText('Sign out and sign in again, then retry.');
    await expect(box(page, 'records')).toBeDisabled();
    await expect(saveButton(page)).toBeDisabled();
  });

  test('a consent read that falls over says so and refuses to let me save over what it could not read', async ({ page, world }) => {
    seedConsent(world, { get: { status: 503, json: { detail: 'Account service unavailable; please retry' } } });
    seedErasure(world);
    await page.goto('/app/account');

    await expect(alert(page)).toHaveText('Account service unavailable; please retry');
    await expect(saveButton(page)).toBeDisabled();
    await expect(box(page, 'ai')).toBeDisabled();
  });

  test('a deletion status that cannot be read is said out loud, not swallowed', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records] });
    world.route(/\/api\/gateway\/account\/erasure/, (_route, call) =>
      call.method === 'GET'
        ? { status: 503, json: { detail: 'Account service unavailable; please retry' } }
        : { status: 202, json: receiptOf('requested') });
    await page.goto('/app/account');

    await expect(alert(page)).toHaveText('Account service unavailable; please retry');
    // The consent half of the same read is discarded with it: Promise.all
    // rejects as a unit, so `loaded` never turns true.
    await expect(saveButton(page)).toBeDisabled();
  });

  test('a save the server will not take says why, and leaves my ticks where I put them', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records], post: { status: 500, json: { detail: 'Unknown notice version or processing purpose' } } });
    seedErasure(world);
    await page.goto('/app/account');

    await box(page, 'ai').check();
    await saveButton(page).click();

    await expect(alert(page)).toHaveText('Unknown notice version or processing purpose');
    await expect(box(page, 'ai')).toBeChecked();
    await expect(saveButton(page)).toBeEnabled();
    await expect(says(page, 'Your choices have been recorded.')).toHaveCount(0);
  });

  test('the complaint about a save that failed is gone the moment the next one goes through', async ({ page, world }) => {
    // The first attempt is refused, the second is kept: run() clears the last
    // refusal before it starts (AccountDataPage.tsx:43), and a page still
    // showing "unavailable" over a choice that WAS recorded is a lie about the
    // record itself.
    const consent = seedConsent(world, {
      purposes: [KEY.records],
      post: [{ status: 503, json: { detail: 'Account service unavailable; please retry' } }],
    });
    seedErasure(world);
    await page.goto('/app/account');

    await box(page, 'ai').check();
    await saveButton(page).click();
    await expect(alert(page)).toHaveText('Account service unavailable; please retry');

    await saveButton(page).click();
    await expect(says(page, 'Your choices have been recorded.')).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    // The retry sent the same thing the first one did — the ticks were not
    // quietly reset by the refusal.
    expect(consent.posted).toEqual([
      { version: VERSION, purposes: [KEY.records, KEY.ai] },
      { version: VERSION, purposes: [KEY.records, KEY.ai] },
    ]);
    expect(consent.state.purposes).toEqual([KEY.records, KEY.ai]);
  });

  test('a save that needs a fresh sign-in says so rather than blaming the choices', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records], post: { status: 401, json: { detail: { error: 'REAUTH_REQUIRED', message: 'Sign in again before requesting account deletion.' } } } });
    seedErasure(world);
    await page.goto('/app/account');

    await box(page, 'ai').check();
    await saveButton(page).click();

    await expect(alert(page)).toHaveText('Sign out and sign in again, then retry.');
    await expect(box(page, 'ai')).toBeChecked();
  });

  test('an export the server cannot build says so and leaves the page usable', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records] });
    seedErasure(world);
    world.route(/\/api\/gateway\/account\/export/, () => ({ status: 503, json: { detail: 'Account service unavailable; please retry' } }));
    await page.goto('/app/account');

    await exportButton(page).click();

    await expect(alert(page)).toHaveText('Account service unavailable; please retry');
    await expect(exportButton(page)).toHaveText('Download my data');
    await expect(exportButton(page)).toBeEnabled();
    await expect(says(page, 'Your export has been downloaded.')).toHaveCount(0);
  });

  test('an export refused for a stale sign-in asks me to sign in again', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records] });
    seedErasure(world);
    world.route(/\/api\/gateway\/account\/export/, () => ({ status: 401, json: { detail: { error: 'UNAUTHENTICATED' } } }));
    await page.goto('/app/account');

    await exportButton(page).click();
    await expect(alert(page)).toHaveText('Sign out and sign in again, then retry.');
  });

  test('a deletion refused for a stale sign-in keeps my confirmation so I can sign in and try again', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records] });
    seedErasure(world, { post: { status: 401, json: { detail: { error: 'REAUTH_REQUIRED', message: 'Sign in again before requesting account deletion.' } } } });
    await page.goto('/app/account');

    await confirmField(page).fill('DELETE MY ACCOUNT');
    await requestButton(page).click();

    await expect(alert(page)).toHaveText('Sign out and sign in again, then retry.');
    await expect(confirmField(page)).toHaveValue('DELETE MY ACCOUNT');
    await expect(requestButton(page)).toBeEnabled();
    await expect(says(page, 'Your deletion request was recorded.')).toHaveCount(0);
  });

  test('a deletion the server rejects out of hand says what it rejected', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records] });
    seedErasure(world, { post: { status: 400, json: { detail: 'Type DELETE MY ACCOUNT to confirm' } } });
    await page.goto('/app/account');

    await confirmField(page).fill('DELETE MY ACCOUNT');
    await requestButton(page).click();

    await expect(alert(page)).toHaveText('Type DELETE MY ACCOUNT to confirm');
    await expect(confirmField(page)).toHaveValue('DELETE MY ACCOUNT');
  });

  // DEFECT 3 — AccountDataPage.tsx:30. Both services raise their refusals as a
  // FastAPI `detail` OBJECT — routes_account.py:25 sends
  // {"detail":{"error":"ACCOUNT_ERASURE_IN_PROGRESS"}} for every write once an
  // erasure is filed, and account.py:_consent_denied sends a detail.message.
  // `read()` only understands a string detail, so both become "The request
  // could not be completed. Try again." — and "try again" is precisely the
  // wrong instruction for an account that is being erased. apiErrorMessage in
  // api/client.ts:97 already reads detail.message and detail.error; this
  // screen has a worse copy of it.
  test.fail('a refusal that names its reason shows the reason, not "try again"', async ({ page, world }) => {
    seedConsent(world, { purposes: [KEY.records], post: { status: 403, json: { detail: { error: 'ACCOUNT_ERASURE_IN_PROGRESS' } } } });
    seedErasure(world);
    await page.goto('/app/account');

    await box(page, 'ai').check();
    await saveButton(page).click();

    await expect(alert(page)).toContainText(/being deleted|erasure|ACCOUNT_ERASURE_IN_PROGRESS/i, { timeout: 3_000 });
  });

  // DEFECT 2 — AccountDataPage.tsx:27. `read()` parses the body before it looks
  // at the status, with no guard. CloudFront and the Vite proxy both answer a
  // dead upstream with an HTML page, and the owner is shown the browser's JSON
  // parse error as though it were the reason. api/client.ts:97 exists for this.
  test.fail('a gateway that answers with an error page says something a person can read', async ({ page, world, consoleErrors }) => {
    seedConsent(world, { get: { status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1></body></html>' } });
    seedErasure(world);
    await page.goto('/app/account');

    await expect(alert(page)).toBeVisible();
    // The parse failure is caught, not thrown at the window: allowConsole is on
    // here for the 502 Chrome logs, and it must not also be covering a crash.
    expect(consoleErrors.filter((line) => line.startsWith('pageerror:'))).toEqual([]);
    await expect(alert(page)).not.toContainText(/JSON/i, { timeout: 3_000 });
  });

  // DEFECT 4 — AccountDataPage.tsx:41. The read happens once, on mount, and a
  // failure leaves the screen with an alert and nothing to press: refresh() is
  // already written and is only offered from inside the deletion receipt. The
  // owner is owed a Try again on the page that failed.
  test.fail('a page that could not read my data offers me a way to try again', async ({ page, world }) => {
    seedConsent(world, { get: { status: 503, json: { detail: 'Account service unavailable; please retry' } } });
    seedErasure(world);
    await page.goto('/app/account');

    await expect(alert(page)).toBeVisible();
    await expect(screen(page).getByRole('button', { name: /try again|retry|reload/i })).toBeVisible({ timeout: 3_000 });
  });
});

// ── the phone ──────────────────────────────────────────────────────────

test('@phone my data page keeps all three sections reachable on a phone', async ({ page, world }) => {
  seedConsent(world, { purposes: [KEY.records] });
  seedErasure(world);
  await page.goto('/app/account');

  await expect(page.getByRole('heading', { name: 'Your account and data', level: 1 })).toBeVisible();
  await expect(box(page, 'records')).toBeVisible();
  await expect(exportButton(page)).toBeVisible();
  await expect(confirmField(page)).toBeVisible();

  // Nothing on this page may push the document sideways — the confirmation
  // field is 100% wide inside a 2rem-padded main (AccountDataPage.tsx:47,77).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
