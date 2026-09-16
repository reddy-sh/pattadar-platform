/**
 * W16 · a service ticket, from ordered to filed.
 *
 * The Services list could always show that work had been asked for. What it
 * could never show is whether anything happened: who was written to, on which
 * number, whether they answered, what came back, whether it was any good, and
 * where the money went. These tests walk that whole road on a record of their
 * own — order, set money aside, send it out on all three channels, put
 * somebody on it, receive work, keep two things and refuse one, accept — and
 * then ask the API, not the screen, whether the sketch is REALLY on the land.
 *
 * Two rules this file keeps, because breaking either one breaks other specs:
 *
 *   · A ticket leaves rows nothing in the UI can delete — events, dispatches,
 *     deliverables, ledger lines. So every test that files anything runs on a
 *     scratch record and takes it with it. `deleteRecords` cascades the first
 *     three; the ledger is deliberately kept, which is why the money-honesty
 *     block runs BEFORE any block that releases money. The wallet asserts
 *     exact figures, and a settlement from a later test would move them.
 *
 *   · Nothing here may pass on a screen alone. Every state change is read back
 *     through GraphQL, because a pill that says "Accepted" and a row that says
 *     nothing of the kind look identical from the outside.
 */
import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test, NOMINATIM, TILE_HOSTS } from './harness';

type Pg = Page;

const GQL = '/api/gateway/pattadar/graphql';

/** GraphQL straight at the API, already unwrapped to `web`. The proxy injects
 *  the demo identity, so this is the same user the browser is. */
const gql = async (request: APIRequestContext, query: string) =>
  (await (await request.post(GQL, { data: { query } })).json()).data?.web;

/** No screen may reach the user with a console error on it. Copied from
 *  screens.spec.ts rather than shared, for the same reason that file has it
 *  inline: a gate that lives somewhere else is a gate people forget to arm. */
async function watchConsole(page: Pg): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    const where = m.location()?.url ?? '';
    const fromTiles = TILE_HOSTS.test(m.text()) || TILE_HOSTS.test(where)
      || NOMINATIM.test(m.text()) || NOMINATIM.test(where);
    if (m.type() === 'error' && !m.text().includes('favicon') && !fromTiles) {
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

// The seeded six, one in every state worth seeing.
const T2094 = 'w360-PT-2094';   // submitted, four things waiting
const T2101 = 'w360-PT-2101';   // placed, unsent, unfunded
const T2102 = 'w360-PT-2102';   // sent over WhatsApp, unanswered
const T2103 = 'w360-PT-2103';   // accepted and filed
const T2104 = 'w360-PT-2104';   // sent back, then cancelled with a part settlement
const PARCEL = 'w360-p-214-2';

/** The answers the survey's two required questions want. An order with a
 *  required question blank is refused by the API, which is correct and is not
 *  what any of these tests are about. */
const SURVEY_ANSWERS = { which_side: 'North', dispute: 'No' };

/** Four corners, which is one more than the fewest that encloses anything. */
const RING = '16.8412,80.1233;16.8419,80.1251;16.8404,80.1259;16.8397,80.1240';

/** A GraphQL string literal holding JSON — quoted twice, so the escaping is
 *  the language's problem and not a hand-typed backslash's. */
const json = (o: unknown) => JSON.stringify(JSON.stringify(o));

// ── Scratch records ────────────────────────────────────────────────────

async function scratchRecord(request: APIRequestContext, title: string): Promise<string> {
  const out = await gql(request, `mutation { web { saveRecord(input:{
    kind:"parcel", title:"${title}", classification:"agri", khataNo:"9916",
    village:"E2E Palem", mandal:"E2E Mandal", extent:2, extentUnit:"ac" }) } }`);
  const id = String(out?.saveRecord ?? '');
  expect(id, `the scratch record ${title} was not created`).not.toBe('');
  return id;
}

/** Delete a scratch record and prove nothing of its ticket outlived it.
 *  `includeClosed` matters: an accepted ticket is closed, and a closed ticket
 *  is invisible to the default query — which would make this assertion pass
 *  for the wrong reason. */
async function dropRecord(request: APIRequestContext, id: string): Promise<void> {
  if (!id) return;
  await gql(request, `mutation { web { deleteRecords(ids:["${id}"]) } }`);
  const left = await gql(request,
    `{ web { orders(recordId:"${id}", includeClosed:true) { id } } }`);
  expect(left?.orders ?? [], 'a ticket outlived the record it was filed against').toEqual([]);
}

/** Order a real, priced service against a record and hand back the ticket.
 *  `orderService` answers with a count, so the id comes from reading the
 *  orders back — which is also proof it was filed. */
async function placeOrder(
  request: APIRequestContext, recordId: string, kind = 'survey',
  answers: Record<string, string> = SURVEY_ANSWERS,
): Promise<{ id: string; ref: string; quoted: number }> {
  const made = await gql(request, `mutation { web { orderService(
    recordIds:["${recordId}"], kind:"${kind}", params:${json(answers)}) } }`);
  expect(made?.orderService, 'the order was not filed').toBe(1);
  const out = await gql(request,
    `{ web { orders(recordId:"${recordId}") { id ref kind } } }`);
  const rows = (out?.orders ?? []) as { id: string; ref: string; kind: string }[];
  const t = rows.find((o) => o.kind === kind);
  expect(t, `no ${kind} order came back`).toBeTruthy();
  const view = await gql(request, `{ web { ticket(id:"${t!.id}") { money { quoted } } } }`);
  return { id: t!.id, ref: t!.ref, quoted: Number(view?.ticket?.money?.quoted ?? 0) };
}

/** A request nobody is on and nobody is paying for — the other way a ticket
 *  is born, and the one `createRequest` files. */
async function raiseRequest(
  request: APIRequestContext, recordId: string, message: string,
): Promise<{ id: string; ref: string }> {
  const out = await gql(request, `mutation { web { createRequest(recordId:"${recordId}",
    kind:"survey", message:"${message}", requester:"the owner", shared:"") } }`);
  const id = String(out?.createRequest ?? '');
  expect(id, 'the request was not filed').not.toBe('');
  const view = await gql(request, `{ web { ticket(id:"${id}") { ref } } }`);
  return { id, ref: String(view?.ticket?.ref ?? '') };
}

// ── Page helpers ───────────────────────────────────────────────────────

/** Open the ticket's kebab and pick an item. The kebab's own name carries the
 *  reference, so two tickets on one screen can never be confused — and so a
 *  test has to know which ticket it is acting on. */
async function fromKebab(page: Pg, ref: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${ref}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** A submitted item is a named article, so nested layout cards cannot make an
 *  action land on the wrong deliverable. */
const deliverable = (page: Pg, label: string) =>
  page.getByRole('article', { name: label, exact: true });

/** A confirmation that stops the page, whichever way it was drawn. */
const modal = (page: Pg) => page.locator('[role="dialog"], .dialog');

/**
 * The words a screen may not say while the payments provider is a stub.
 *
 * "charged" is stripped out of the honest sentences first, deliberately: the
 * copy this rule exists to protect is "Recorded, not charged", and a regex
 * that forbids the word outright fails the page that tells the truth and
 * passes the page that says nothing at all.
 */
async function assertNoChargeClaimed(page: Pg): Promise<void> {
  const said = (await page.locator('main').innerText())
    .replace(/\b(?:not|nothing is|nothing has been|nothing was)\s+charged\b/gi, '');
  expect(said, 'a screen claimed money moved while the provider is a stub')
    .not.toMatch(/\b(Paid|Payment successful|debited|charged|Transaction ID|UTR|RRN)\b/);
}

// ── The seeded tickets, read only ──────────────────────────────────────

test.describe('W360 · a ticket tracks itself', () => {
  test('the Services list opens a ticket', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/services');

    // Filtered on the reference, not on the title: other specs in this suite
    // raise their own "Boundary re-survey" requests and leave them on the
    // seeded parcel, and a title filter would grade whichever row it found.
    const row = page.locator('.rows.boxed > div').filter({ hasText: 'PT-2094' });
    await expect(row).toContainText('Boundary re-survey');
    await expect(row).toContainText('Waiting on you');

    await row.getByRole('link', { name: 'Open ticket' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/tickets/${T2094}$`));
    await expect(page.getByRole('heading', { name: 'Boundary re-survey' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Track order still expands in place', async ({ page }) => {
    // This test is not about tickets. It pins the behaviour crud-360.spec.ts
    // depends on twice over, so that a change made in the name of the ticket
    // page cannot quietly remove the panel it expands.
    await page.goto(`/app/records/${PARCEL}/services`);
    await page.getByRole('button', { name: 'Track order' }).first().click();
    await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
  });

  test('the ticket says who has it and what has happened', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${T2094}`);

    // Named on the page — the assignee card, the trail and the dispatch all
    // say it, so first() rather than a count.
    await expect(page.getByText('G. Srinivas').first()).toBeVisible();

    const trail = page.locator('.card').filter({ hasText: 'Everything that happened' }).first();
    await expect(trail).toContainText('You put G. Srinivas on it');
    await expect(trail).toContainText('Work came back');

    // Four pips, and the fourth is lit. A rail with no words in it says
    // nothing to a screen reader, which is what the label is for.
    await expect(page.locator('[aria-label*="Stage"]').first())
      .toHaveAttribute('aria-label', /Stage 4 of 4/);
    expect(errors).toEqual([]);
  });

  test('nine days of silence says so and offers one thing to do', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${T2102}`);

    await expect(page.getByText(/Nothing has happened for \d+ days/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send it again' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cancel this job' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ── Sending it out ─────────────────────────────────────────────────────

test.describe.serial('W360 · sending a ticket out', () => {
  let record = '';
  let ticket = { id: '', ref: '' };

  test.beforeAll(async ({ request }) => {
    record = await scratchRecord(request, 'Sy SEND-TEST');
    ticket = await raiseRequest(request, record, 'E2E send this out');
  });

  test.afterAll(async ({ request }) => { await dropRecord(request, record); });

  test('the system sends it and can take it back', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    await page.getByRole('button', { name: 'Send this to someone' }).click();
    await page.getByLabel('Their name').fill('E2E Surveyor');
    await page.getByLabel('Email or phone').fill('surveyor@example.com');
    await page.getByLabel('Send it by').selectOption('email');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    // Recognisable to the owner, useless in a screenshot.
    await expect(page.getByText('surv…@example.com')).toBeVisible();
    await expect(page.getByText('Recorded, not sent').first()).toBeVisible();

    await page.getByRole('button', { name: 'See what was sent' }).click();
    await expect(page.getByText(/A landowner using Pattadar has asked for/)).toBeVisible();

    // Two taps, because a withdrawal is told to the other person.
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByRole('button', { name: 'Withdraw' }).last().click();
    await expect(page.getByText('Withdrawn').first()).toBeVisible();

    const out = await gql(request,
      `{ web { ticket(id:"${ticket.id}") { status dispatches { provider status revoked } } } }`);
    // Back to placed: nothing of this ticket is out in the world any more.
    expect(out?.ticket?.status).toBe('placed');
    expect(out?.ticket?.dispatches).toHaveLength(1);
    expect(out?.ticket?.dispatches[0]).toMatchObject({
      provider: 'stub', status: 'logged', revoked: true,
    });
    expect(errors).toEqual([]);
  });

  test('a dispatch contains a revocable worker access link', async ({ page }) => {
    await page.goto(`/app/tickets/${ticket.id}`);
    await page.getByRole('button', { name: 'See what was sent' }).click();
    const body = await page.locator('pre').first().innerText();
    expect(body).toMatch(/Pattadar/);
    expect(body, 'the worker needs a usable scoped request URL').toMatch(/\/work\/[A-Za-z0-9_-]{43}/);
  });

  test('RequestWork still sends nothing itself', async ({ page }) => {
    // Restated from crud-360.spec.ts on purpose. The page now has a system
    // that can write to an outsider, and the failure mode of that feature is
    // a "Send by WhatsApp" button appearing on the screen that must not have
    // one — so the assertion also fails here, where the change would be made.
    await page.goto(`/app/records/${PARCEL}/request?kind=survey`);
    await expect(page.getByRole('button', { name: /WhatsApp/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Send by email/ })).toHaveCount(0);
  });
});

// ── Work comes back ────────────────────────────────────────────────────

test.describe.serial('W360 · work comes back and is reviewed', () => {
  let record = '';
  let ticket = { id: '', ref: '' };

  test.beforeAll(async ({ request }) => {
    record = await scratchRecord(request, 'Sy REVIEW-TEST');
    ticket = await raiseRequest(request, record, 'E2E review what comes back');
    // Somebody has to be on it before anything can come back from them: the
    // machine offers `deliver` from assigned, on site and sent back, and from
    // nowhere else.
    await gql(request,
      `mutation { web { assignRequest(requestId:"${ticket.id}", assignee:"E2E Surveyor") } }`);
  });

  test.afterAll(async ({ request }) => { await dropRecord(request, record); });

  test('recording something moves the ticket to waiting on you', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    await fromKebab(page, ticket.ref, 'Record what came back');
    await page.getByLabel('What is it').selectOption('feature');
    await page.getByLabel('What to call it').fill('E2E bore well');
    await page.getByLabel('What condition it is in').selectOption({ label: 'Needs attention' });
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect(page.getByText('E2E bore well').first()).toBeVisible();
    await expect(page.getByText('Waiting on you').first()).toBeVisible();

    const out = await gql(request,
      `{ web { ticket(id:"${ticket.id}") { status needsYou stageLabel } } }`);
    expect(out?.ticket).toMatchObject({
      status: 'submitted', needsYou: true, stageLabel: 'Delivered',
    });
    expect(errors).toEqual([]);
  });

  test('accept is refused while anything is undecided', async ({ page, request }) => {
    await page.goto(`/app/tickets/${ticket.id}`);
    // A thing nobody has looked at is not a thing anybody meant to file.
    await expect(page.getByRole('button', { name: 'Accept and file' }).first()).toBeDisabled();

    // And the button is not the only guard: the API refuses it too, so a
    // stale tab cannot file what the owner never decided on.
    const out = await gql(request,
      `mutation { web { acceptTicket(ticketId:"${ticket.id}", note:"") } }`);
    expect(out?.acceptTicket).toBe(0);
  });

  test('accepting files it onto the property', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    await deliverable(page, 'E2E bore well').getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByText('Keeping it').first()).toBeVisible();

    await page.getByRole('button', { name: 'Accept and file' }).first().click();
    await modal(page).getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByText('Accepted').first()).toBeVisible();
    await expect(page.getByText(/Filed \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

    // The screen says it was filed. The record is what decides whether it was.
    await page.goto(`/app/records/${record}/features`);
    await expect(page.getByText('E2E bore well').first()).toBeVisible();

    const out = await gql(request, `{ web { ticket(id:"${ticket.id}") {
      status closed money { released fee }
      deliverables { review filedTable filedId } } } }`);
    expect(out?.ticket?.status).toBe('accepted');
    expect(out?.ticket?.closed).toBe(true);
    const filed = (out?.ticket?.deliverables ?? []) as
      { review: string; filedTable: string; filedId: string }[];
    expect(filed[0].review).toBe('accepted');
    expect(filed[0].filedTable).toBe('land_features');
    expect(filed[0].filedId).not.toBe('');
    // Nothing was set aside on a request nobody priced, so nothing is owed.
    expect(out?.ticket?.money?.released).toBe(0);

    // Asked of the features themselves, because a card is a picture and a row
    // is a fact. The condition is the one the surveyor reported, not "unknown".
    const feats = await gql(request,
      `{ web { features(recordId:"${record}") { features { label conditionState } } } }`);
    const made = ((feats?.features?.features ?? []) as
      { label: string; conditionState: string }[]).find((f) => f.label === 'E2E bore well');
    expect(made, 'the accepted deliverable never reached the record').toBeTruthy();
    expect(made!.conditionState).toBe('warn');
    expect(errors).toEqual([]);
  });

  test('sending it back keeps what was sent as evidence', async ({ page, request }) => {
    // A second ticket on the same scratch record: the first is accepted and
    // closed, and an accepted ticket has nowhere left to go.
    const second = await raiseRequest(request, record, 'E2E send this back');
    await gql(request,
      `mutation { web { assignRequest(requestId:"${second.id}", assignee:"E2E Surveyor") } }`);
    await gql(request, `mutation { web { addDeliverable(ticketId:"${second.id}",
      kind:"feature", label:"E2E wrong shed", payload:${json({ condition_state: 'bad' })}) } }`);

    await page.goto(`/app/tickets/${second.id}`);
    await deliverable(page, 'E2E wrong shed').getByRole('button', { name: 'Not this one' }).click();
    await page.getByLabel('What is wrong with it').fill('E2E wrong field');
    await page.getByRole('button', { name: 'Send back' }).click();

    // Kept, refused, and the reason kept with it — a rejected deliverable is
    // evidence of what was sent, so it is never deleted.
    const card = deliverable(page, 'E2E wrong shed');
    await expect(card).toContainText('Not this one');
    await expect(card).toContainText('E2E wrong field');

    await page.getByRole('button', { name: 'Send it back' }).first().click();
    await page.getByLabel('What is missing').fill('E2E the shed is on the wrong field');
    await page.getByRole('button', { name: 'Send it back' }).last().click();
    await expect(page.getByText('Sent back').first()).toBeVisible();

    const out = await gql(request, `{ web { ticket(id:"${second.id}") {
      status deliverables { review reviewNote filedId } } } }`);
    expect(out?.ticket?.status).toBe('changes');
    expect(out?.ticket?.deliverables[0]).toMatchObject({
      review: 'rejected', filedId: '',
    });
    // And nothing of it reached the land.
    const feats = await gql(request,
      `{ web { features(recordId:"${record}") { features { label } } } }`);
    expect(((feats?.features?.features ?? []) as { label: string }[])
      .some((f) => f.label === 'E2E wrong shed'),
      'a refused deliverable was filed anyway').toBe(false);
  });
});

// ── Money, while nothing has actually moved ────────────────────────────
//
// Declared BEFORE any block that releases money. The wallet asserts exact
// figures against the seed, and a settlement written by a later test would
// move them — the ledger is append-only and deleting a record does not
// remove it, which is the point of it.

test.describe.serial('W360 · money is honest while the stub is on', () => {
  test.afterAll(async ({ request }) => {
    // Belt and braces: the funding test undoes itself inline, and this catches
    // the run where it did not get that far. Cancelling an already-cancelled
    // ticket is refused and harmless.
    await gql(request,
      `mutation { web { cancelTicket(ticketId:"${T2101}", reason:"e2e", payAnyway:0) } }`);
  });

  test('a ticket with nothing set aside says so', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${T2101}`);

    // The headline and the empty ledger both say it; the headline is first.
    await expect(page.getByText('Nothing set aside yet').first()).toBeVisible();
    // Enabled, and it really writes. A disabled control here would make the
    // whole prototype untestable, and an honest "Not charged" row is more
    // truthful than a button that lies about being clickable.
    await expect(page.getByRole('button', { name: /^Set ₹1,180 aside$/ })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('setting money aside records it and does not charge', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${T2101}`);
    await page.getByRole('button', { name: /^Set ₹1,180 aside$/ }).click();

    await expect(page.getByText('₹1,180 set aside for this job')).toBeVisible();
    await expect(page.getByText('Not charged').first()).toBeVisible();
    await assertNoChargeClaimed(page);

    const out = await gql(request, `{ web { ticket(id:"${T2101}") {
      money { held live } ledger { entry provider status amount } } } }`);
    expect(out?.ticket?.money).toMatchObject({ held: 1180, live: false });
    expect(out?.ticket?.ledger).toHaveLength(1);
    expect(out?.ticket?.ledger[0]).toMatchObject({
      entry: 'hold', provider: 'stub', status: 'recorded', amount: 1180,
    });

    // Put the money back before anything counts it: the wallet's figures are
    // asserted two tests down, and a hold left standing moves every one of
    // them by 1,180.
    const undo = await gql(request,
      `mutation { web { cancelTicket(ticketId:"${T2101}", reason:"e2e", payAnyway:0) } }`);
    expect(undo?.cancelTicket).toBe(true);
    const back = await gql(request,
      `{ web { ticket(id:"${T2101}") { money { held returned } } } }`);
    expect(back?.ticket?.money).toMatchObject({ held: 0, returned: 1180 });
    expect(errors).toEqual([]);
  });

  test('no screen claims a payment happened', async ({ page }) => {
    for (const url of ['/app/wallet', `/app/tickets/${T2103}`, `/app/tickets/${T2104}`]) {
      await page.goto(url);
      await assertNoChargeClaimed(page);
    }
  });

  test('the wallet adds up', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/wallet');

    await expect(page.getByText('Payments are not switched on yet.')).toBeVisible();

    const strip = page.locator('.strip');
    await expect(strip.locator('div').filter({ hasText: /Set aside on jobs/i }).first())
      .toContainText('₹8,600');
    await expect(strip.locator('div').filter({ hasText: /Gone out/i }).first())
      .toContainText('₹1,150');
    // Adding money is not switched on, and the button says so rather than
    // pretending to work.
    await expect(page.getByRole('button', { name: 'Add money' })).toBeDisabled();

    const out = await gql(request, `{ web { wallet { setAside paidOut live } } }`);
    expect(out?.wallet).toMatchObject({ setAside: 8600, paidOut: 1150, live: false });
    expect(errors).toEqual([]);
  });

  test('a cancelled job shows what was settled and what came back', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${T2104}`);

    await expect(page.getByText('Cancelled').first()).toBeVisible();
    // He was paid for the trips he made; the rest went back.
    await expect(page.locator('main')).toContainText('₹1,500');
    await expect(page.locator('main')).toContainText('₹630');
    await expect(page.getByText('Not charged').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ── The whole road, on one ticket ──────────────────────────────────────

test.describe.serial('W360 · the whole journey, on one job', () => {
  let record = '';
  let ticket = { id: '', ref: '', quoted: 0 };
  let assignee = '';

  test.beforeAll(async ({ request }) => {
    record = await scratchRecord(request, 'Sy JOURNEY-TEST');
    ticket = await placeOrder(request, record);
    // The price is frozen on the ticket at order time — the number a dispute
    // would later be about.
    expect(ticket.quoted).toBe(2900);
  });

  test.afterAll(async ({ request }) => { await dropRecord(request, record); });

  test('money is set aside, and the job goes out on all three channels',
    async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    await page.getByRole('button', { name: /^Set ₹2,900 aside$/ }).click();
    await expect(page.getByText('₹2,900 set aside for this job')).toBeVisible();
    await assertNoChargeClaimed(page);

    // Email, WhatsApp and SMS in turn. The channel is a choice the owner
    // makes, and asking to email a phone number is refused rather than
    // silently re-routed — so each of these is sent as what it is.
    const sends: [string, string, string, string][] = [
      ['E2E Surveyor', 'surveyor@example.com', 'email', 'surv…@example.com'],
      ['E2E Advocate', '+919848012345', 'whatsapp', '+91 98••• ••345'],
      ['E2E Caretaker', '+919848055512', 'sms', '+91 98••• ••512'],
    ];
    for (const [name, contact, channel, masked] of sends) {
      await page.getByRole('button', { name: 'Send this to someone' }).click();
      await page.getByLabel('Their name').fill(name);
      await page.getByLabel('Email or phone').fill(contact);
      await page.getByLabel('Send it by').selectOption(channel);
      await page.getByLabel('Anything else they should know')
        .fill('E2E the north boundary, please.');
      await page.getByRole('button', { name: 'Send it', exact: true }).click();
      await expect(page.getByText(masked)).toBeVisible();
    }

    const out = await gql(request, `{ web { ticket(id:"${ticket.id}") {
      status money { held quoted funded live }
      dispatches { channel purpose provider status revoked } } } }`);
    expect(out?.ticket?.status).toBe('sent');
    expect(out?.ticket?.money).toMatchObject({
      held: 2900, quoted: 2900, funded: true, live: false,
    });
    const dx = (out?.ticket?.dispatches ?? []) as
      { channel: string; purpose: string; provider: string; status: string }[];
    expect(dx.map((d) => d.channel).sort()).toEqual(['email', 'sms', 'whatsapp']);
    // Every one of them recorded, none of them sent, and the row itself says
    // which — not a flag somebody has to remember to read.
    for (const d of dx) {
      expect(d).toMatchObject({ purpose: 'invite', provider: 'stub', status: 'logged' });
    }
    expect(errors).toEqual([]);
  });

  test('somebody is put on it, and goes to site', async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    const picker = page.locator('#tk-assign');
    await expect(picker).toBeVisible();
    const names = await picker.locator('option').allInnerTexts();
    expect(names.length, 'nobody available to assign to').toBeGreaterThan(1);
    assignee = names[1].trim();
    await picker.selectOption({ index: 1 });

    await expect(page.getByRole('button', { name: "They're on site" })).toBeVisible();
    await page.getByRole('button', { name: "They're on site" }).click();
    await expect(page.getByText('On site').first()).toBeVisible();

    const out = await gql(request,
      `{ web { ticket(id:"${ticket.id}") { status assignee stage stageLabel } } }`);
    expect(out?.ticket).toMatchObject({
      status: 'on_site', assignee, stage: 2, stageLabel: 'On site',
    });
    expect(errors).toEqual([]);
  });

  test('what comes back waits on the owner, and nothing touches the land yet',
    async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    // The first thing back, through the screen the owner actually uses.
    await fromKebab(page, ticket.ref, 'Record what came back');
    await page.getByLabel('What is it').selectOption('boundary');
    await page.getByLabel('What to call it').fill('E2E corrected outline');
    await page.getByLabel('The corners').fill(RING);
    await page.getByRole('button', { name: 'Add it' }).click();
    await expect(page.getByText('E2E corrected outline').first()).toBeVisible();

    // The rest through the API: recording the first one moves the ticket to
    // "waiting on you", and the machine offers no `deliver` from there, so
    // the kebab no longer carries the item. See the HANDOFF in this file's
    // report — the screen cannot yet record a second thing.
    await gql(request, `mutation { web { addDeliverable(ticketId:"${ticket.id}",
      kind:"feature", label:"E2E journey bore well",
      note:"Found 40 ft in from the north stone.",
      payload:${json({ condition_state: 'warn', category: 'water' })}) } }`);
    await gql(request, `mutation { web { addDeliverable(ticketId:"${ticket.id}",
      kind:"feature", label:"E2E journey wrong shed",
      payload:${json({ condition_state: 'good' })}) } }`);

    const out = await gql(request, `{ web { ticket(id:"${ticket.id}") {
      status needsYou deliverables { kind label review goesTo filedId } } } }`);
    expect(out?.ticket).toMatchObject({ status: 'submitted', needsYou: true });
    const items = (out?.ticket?.deliverables ?? []) as
      { kind: string; label: string; review: string; goesTo: string; filedId: string }[];
    expect(items).toHaveLength(3);
    // Nothing is filed, and nothing is decided, until somebody has looked.
    for (const d of items) {
      expect(d.review).toBe('pending');
      expect(d.filedId).toBe('');
      expect(d.goesTo).not.toBe('');
    }
    // And the land is still what it was.
    const before = await gql(request, `{ web { boundary(recordId:"${record}") { ring } } }`);
    expect(before?.boundary?.ring ?? []).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('two are kept, one is refused, and the money follows the decision',
    async ({ page, request }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/tickets/${ticket.id}`);

    await deliverable(page, 'E2E corrected outline')
      .getByRole('button', { name: 'Keep it' }).click();
    await deliverable(page, 'E2E journey bore well')
      .getByRole('button', { name: 'Keep it' }).click();

    // A survey that comes back with a good sketch and one thing in the wrong
    // field must not force an all-or-nothing decision, or the owner accepts
    // rubbish rather than lose the sketch.
    await deliverable(page, 'E2E journey wrong shed')
      .getByRole('button', { name: 'Not this one' }).click();
    await page.getByLabel('What is wrong with it').fill('E2E that shed is next door');
    await page.getByRole('button', { name: 'Send back' }).click();
    await expect(deliverable(page, 'E2E journey wrong shed')).toContainText('Not this one');

    await page.getByRole('button', { name: 'Accept and file' }).first().click();
    await modal(page).getByRole('button', { name: 'Accept and file' }).click();
    await expect(page.getByText('Accepted').first()).toBeVisible();
    await assertNoChargeClaimed(page);

    const out = await gql(request, `{ web { ticket(id:"${ticket.id}") {
      status closed statusLabel stageLabel
      money { held released fee returned payeeShare live headline }
      deliverables { label review filedTable filedId }
      ledger { entry amount payee provider status } } } }`);

    expect(out?.ticket).toMatchObject({
      status: 'accepted', closed: true, statusLabel: 'Accepted', stageLabel: 'Delivered',
    });
    // Released is the whole promise: the money goes to the person who did the
    // work at the moment the owner says the work is good, and not one step
    // before. The fee is the remainder, so the two add back to the hold.
    expect(out?.ticket?.money).toMatchObject({
      held: 0, released: 2610, fee: 290, returned: 0, payeeShare: 0.9, live: false,
    });
    expect(out?.ticket?.money?.headline).toContain('₹2,610');
    expect(out?.ticket?.money?.headline).not.toMatch(/\bpaid\b|\bcharged\b|\bdebited\b/i);

    const rows = (out?.ticket?.ledger ?? []) as
      { entry: string; amount: number; payee: string; provider: string; status: string }[];
    expect(rows.map((r) => r.entry).sort()).toEqual(['fee', 'hold', 'release']);
    for (const r of rows) expect(r).toMatchObject({ provider: 'stub', status: 'recorded' });
    expect(rows.find((r) => r.entry === 'release')!.payee).toBe(assignee);

    const filed = (out?.ticket?.deliverables ?? []) as
      { label: string; review: string; filedTable: string; filedId: string }[];
    const outline = filed.find((d) => d.label === 'E2E corrected outline')!;
    const well = filed.find((d) => d.label === 'E2E journey bore well')!;
    const shed = filed.find((d) => d.label === 'E2E journey wrong shed')!;
    expect(outline).toMatchObject({ review: 'accepted', filedTable: 'parcels' });
    expect(well).toMatchObject({ review: 'accepted', filedTable: 'land_features' });
    expect(well.filedId).not.toBe('');
    // Refused, kept, and filed nowhere.
    expect(shed).toMatchObject({ review: 'rejected', filedTable: '', filedId: '' });
    expect(errors).toEqual([]);
  });

  test('and the record itself now carries the work', async ({ page, request }) => {
    // The point of the whole feature: not that a ticket says "accepted", but
    // that the land it was ordered against has changed.
    const bound = await gql(request, `{ web { boundary(recordId:"${record}") { ring } } }`);
    const ring = (bound?.boundary?.ring ?? []) as number[];
    expect(ring, 'the corrected outline never reached the parcel').toHaveLength(8);
    expect(ring[0]).toBeCloseTo(16.8412, 4);
    expect(ring[1]).toBeCloseTo(80.1233, 4);

    const feats = await gql(request,
      `{ web { features(recordId:"${record}") { features { label conditionState } } } }`);
    const labels = ((feats?.features?.features ?? []) as
      { label: string; conditionState: string }[]);
    const well = labels.find((f) => f.label === 'E2E journey bore well');
    expect(well, 'the accepted feature never reached the record').toBeTruthy();
    expect(well!.conditionState).toBe('warn');
    expect(labels.some((f) => f.label === 'E2E journey wrong shed'),
      'a refused deliverable was filed anyway').toBe(false);

    // And it is on the screen the owner would look at, under the name they
    // were shown before they said yes.
    await page.goto(`/app/records/${record}/features`);
    await expect(page.getByText('E2E journey bore well').first()).toBeVisible();
    await expect(page.getByText('E2E journey wrong shed')).toHaveCount(0);
  });
});

// ── When it goes wrong ─────────────────────────────────────────────────

test.describe.serial('W360 · a job that goes wrong gives the money back', () => {
  let record = '';

  test.beforeAll(async ({ request }) => {
    record = await scratchRecord(request, 'Sy REFUND-TEST');
  });

  test.afterAll(async ({ request }) => { await dropRecord(request, record); });

  test('cancelling a refused job returns everything that was set aside',
    async ({ page, request }) => {
    const errors = await watchConsole(page);
    const t = await placeOrder(request, record, 'title_opinion', { years: '30 years' });

    const held = await gql(request, `mutation { web { fundTicket(ticketId:"${t.id}") } }`);
    expect(String(held?.fundTicket ?? ''), 'the hold was not written').not.toBe('');
    await gql(request,
      `mutation { web { assignRequest(requestId:"${t.id}", assignee:"E2E Advocate") } }`);
    await gql(request, `mutation { web { addDeliverable(ticketId:"${t.id}",
      kind:"paper", label:"E2E opinion, unsigned") } }`);

    const back = await gql(request,
      `{ web { ticket(id:"${t.id}") { deliverables { id } } } }`);
    const item = String(back?.ticket?.deliverables?.[0]?.id ?? '');
    expect(item, 'nothing came back to review').not.toBe('');
    await gql(request, `mutation { web { reviewDeliverable(deliverableId:"${item}",
      review:"rejected", note:"E2E unsigned and undated") } }`);

    await page.goto(`/app/tickets/${t.id}`);
    // Cancelling is behind the kebab, not on the page: closing a job somebody
    // is working on is not a thing to have under the cursor by accident.
    await fromKebab(page, t.ref, 'Cancel this job');
    const dialog = modal(page);
    await dialog.getByLabel('Why').fill('E2E unsigned and undated');
    await dialog.getByRole('button', { name: 'Cancel this job' }).click();

    await expect(page.getByText('Cancelled').first()).toBeVisible();
    await assertNoChargeClaimed(page);

    const out = await gql(request, `{ web { ticket(id:"${t.id}") {
      status closed outcomeNote money { held released returned }
      ledger { entry amount } } } }`);
    expect(out?.ticket).toMatchObject({ status: 'cancelled', closed: true });
    // Nothing was owed to anybody, and every rupee went back to the wallet.
    expect(out?.ticket?.money).toMatchObject({ held: 0, released: 0, returned: 4500 });
    const rows = (out?.ticket?.ledger ?? []) as { entry: string; amount: number }[];
    expect(rows.map((r) => r.entry).sort()).toEqual(['hold', 'return']);
    expect(rows.find((r) => r.entry === 'return')!.amount).toBe(4500);
    expect(errors).toEqual([]);
  });

  test('a cancellation can still settle part of what was set aside', async ({ request }) => {
    const t = await placeOrder(request, record, 'site_visit', { check: 'General condition' });
    await gql(request, `mutation { web { fundTicket(ticketId:"${t.id}") } }`);
    await gql(request,
      `mutation { web { assignRequest(requestId:"${t.id}", assignee:"E2E Caretaker") } }`);

    // He made the trips. The gross is split the same way an acceptance is —
    // one rule, not two — and the rest goes back.
    const done = await gql(request, `mutation { web { cancelTicket(ticketId:"${t.id}",
      reason:"E2E called off after two visits", payAnyway:700) } }`);
    expect(done?.cancelTicket).toBe(true);

    const out = await gql(request, `{ web { ticket(id:"${t.id}") {
      status money { held released fee returned } ledger { entry amount payee } } } }`);
    expect(out?.ticket?.status).toBe('cancelled');
    expect(out?.ticket?.money).toMatchObject({
      held: 0, released: 630, fee: 70, returned: 500,
    });
    const rows = (out?.ticket?.ledger ?? []) as
      { entry: string; amount: number; payee: string }[];
    expect(rows.map((r) => r.entry).sort()).toEqual(['fee', 'hold', 'release', 'return']);
    // Every rupee that was set aside is accounted for in one direction or the
    // other. This is the whole reason the ledger is a ledger: the three rows a
    // cancellation writes must add back to the one row that funded it.
    const of = (entry: string) => rows.find((r) => r.entry === entry)!.amount;
    expect(of('return') + of('release') + of('fee')).toBe(of('hold'));
    expect(rows.find((r) => r.entry === 'release')!.payee).toBe('E2E Caretaker');
  });
});

// ── The machine refuses what it does not allow ─────────────────────────

test.describe.serial('W360 · a move the machine does not allow is refused', () => {
  let record = '';
  let ticket = { id: '', ref: '' };

  test.beforeAll(async ({ request }) => {
    record = await scratchRecord(request, 'Sy REFUSE-TEST');
    ticket = await raiseRequest(request, record, 'E2E nobody is on this');
  });

  test.afterAll(async ({ request }) => { await dropRecord(request, record); });

  test('a placed ticket cannot be started or accepted', async ({ request }) => {
    // Nobody is on it. "On site" and "accepted" are both claims about a person
    // who has not been named, and the API says no rather than repairing the
    // state — a machine that quietly fixes itself cannot be reconstructed six
    // months later when the money is being argued about.
    const started = await gql(request,
      `mutation { web { startTicket(ticketId:"${ticket.id}", note:"") } }`);
    expect(started?.startTicket).toBe(false);
    const accepted = await gql(request,
      `mutation { web { acceptTicket(ticketId:"${ticket.id}", note:"") } }`);
    expect(accepted?.acceptTicket).toBe(0);

    const out = await gql(request,
      `{ web { ticket(id:"${ticket.id}") { status can } } }`);
    expect(out?.ticket?.status).toBe('placed');
    // The client draws its buttons from this, so a screen can never offer a
    // move the server will refuse.
    expect((out?.ticket?.can ?? []).sort()).toEqual(['assign', 'cancel', 'dispatch']);
  });

  test('an accepted ticket is finished with', async ({ request }) => {
    // A released payout cannot be un-released on any rail we will use, so the
    // remedy for a wrong acceptance is a fresh ticket, not a reopened one.
    const back = await gql(request,
      `mutation { web { sendBackTicket(ticketId:"${T2103}", reason:"E2E too late") } }`);
    expect(back?.sendBackTicket).toBe(false);
    const cancelled = await gql(request,
      `mutation { web { cancelTicket(ticketId:"${T2103}", reason:"E2E too late", payAnyway:0) } }`);
    expect(cancelled?.cancelTicket).toBe(false);

    const out = await gql(request, `{ web { ticket(id:"${T2103}") { status can } } }`);
    expect(out?.ticket?.status).toBe('accepted');
    expect(out?.ticket?.can ?? []).toEqual([]);
  });

  test('a ticket that is not yours is not there', async ({ request }) => {
    const out = await gql(request, `{ web { ticket(id:"not-a-ticket") { id } } }`);
    expect(out?.ticket).toBeNull();
  });

  test('sending it back needs a reason', async ({ request }) => {
    // "Changes please" with no changes named is a round trip nobody can act
    // on, and the person at the other end has to ring back to ask.
    const t = await placeOrder(request, record, 'patta_copy', { copies: '1' });
    await gql(request,
      `mutation { web { assignRequest(requestId:"${t.id}", assignee:"E2E Clerk") } }`);
    await gql(request, `mutation { web { addDeliverable(ticketId:"${t.id}",
      kind:"feature", label:"E2E something") } }`);
    const out = await gql(request,
      `mutation { web { sendBackTicket(ticketId:"${t.id}", reason:"") } }`);
    expect(out?.sendBackTicket).toBe(false);
    const still = await gql(request, `{ web { ticket(id:"${t.id}") { status } } }`);
    expect(still?.ticket?.status).toBe('submitted');
  });
});
