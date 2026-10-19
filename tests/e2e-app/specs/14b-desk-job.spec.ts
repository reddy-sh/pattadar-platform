/**
 * The desk's job page — `/desk/jobs/:id` — which took over every dispatch
 * tool the owner's order page used to carry (service order spec §7): who could
 * take the order and Assign, taking somebody off, sending it to a provider and
 * withdrawing it, marking it started, recording work handed in by another
 * route, and answering the owner's thread as "Pattadar desk".
 *
 * It reads `deskTicket(id)` (fixtures/seed.ts `deskTicketOf`, mirroring
 * web360.py `desk_ticket`) and `candidates` for the roster, and draws every
 * control from the desk's own `can`. Refusals are falsy answers or
 * `World.gqlError`; the desk's own sentence says "job", which the desk keeps.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { TICKET } from '../fixtures/ids';
import { SEED } from '../fixtures/seed';

const MOVE_FAILED =
  'That did not go through. Nothing on this job has changed — reload the page and try again.';
const SEND_FAILED =
  'That did not go out. Nothing was sent — check the number or the email and try again.';
const ADD_FAILED =
  'That was not recorded. Nothing was added to this job — check what you typed and try again.';
const REPLY_FAILED = 'That reply was not added. Nothing was sent — try again.';

const jobAt = (page: Page, id: string) => page.goto(`/desk/jobs/${id}`);
const card = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const roster = (page: Page) => card(page, 'Available providers');
const sendDialog = (page: Page) => page.getByRole('dialog', { name: /^(Send this to a provider|Send it again)$/ });
const recordDialog = (page: Page) => page.getByRole('dialog', { name: 'Record submitted work' });
const drawn = (page: Page, title: string) =>
  expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · the page', () => {
  test('the head names the job by its reference and its service', async ({ page, world }) => {
    await jobAt(page, TICKET.placed);
    await drawn(page, 'Encumbrance certificate');
    expect(world.lastVars('deskTicket')).toMatchObject({ id: TICKET.placed });
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Pattadar desk' })).toHaveAttribute('href', '/desk');
    await expect(crumbs).toContainText('PT-2101');
  });

  test('somebody who is not Pattadar staff is told so, and nothing is read', async ({ page, world }) => {
    world.patch('portfolio', { isPlatformAdmin: false });
    world.set('deskTicket', null);
    await jobAt(page, TICKET.placed);
    await expect(page.getByRole('heading', { level: 1, name: 'This screen is for Pattadar staff' })).toBeVisible();
    expect(world.calls('candidates')).toHaveLength(0);
  });

  test('a job that does not exist says so, with the way back', async ({ page, world }) => {
    world.set('deskTicket', null);
    await jobAt(page, TICKET.missing);
    await expect(page.getByRole('heading', { level: 1, name: 'This job is not on the desk' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Pattadar desk' })).toHaveAttribute('href', '/desk');
  });

  test('the desk sees the whole trail, payment and dispatch lines and their detail included', async ({ page }) => {
    await jobAt(page, TICKET.assigned);
    const trail = card(page, 'Activity');
    await expect(trail).toContainText('You placed this order · Ordered from Sy 214/2');
    await expect(trail).toContainText('Sent to Ravi Kumar on SMS — recorded, not sent (stub) · A job on Sy 214/2');
    await expect(trail).toContainText('₹6,500 held');
  });

  test('an owner who asked for an update is flagged on the job and on the desk queue', async ({ page, world }) => {
    world.set('deskTicket', () => ({
      job: { ticketId: TICKET.placed, ref: 'PT-2101', kind: 'ec', serviceLabel: 'Encumbrance certificate', place: 'Katragunta, Markapur', status: 'placed', statusLabel: 'Placed', statusState: 'unknown', assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-09-09', ageDays: 4, dueDate: '20/09/2026', overdue: false, quiet: false, quietDays: 0, quoted: 1180, held: 1180, dispatchState: '', dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false, askedAt: '13/09/2026' },
      can: ['assign', 'dispatch', 'message'], events: [], deliverables: [], dispatches: [],
    }));
    await jobAt(page, TICKET.placed);
    await expect(page.locator('header.pagehead')).toContainText('Owner asked for an update 13/09/2026');
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · who could take it', () => {
  test('the roster is the server\'s ranking, with the reason for each person', async ({ page, world }) => {
    await jobAt(page, TICKET.placed);
    const rows = roster(page).locator('.rows.boxed > div');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('G. Srinivas');
    await expect(rows.nth(0)).toContainText('1 in hand · Never offered a job yet · Covers Katragunta');
    await expect(rows.nth(1)).toContainText('K. Anitha');
    expect(world.lastVars('candidates')).toMatchObject({ ticketId: TICKET.placed });
  });

  test('somebody who cannot take it says why, and offers no Assign', async ({ page }) => {
    await jobAt(page, TICKET.placed);
    const anitha = roster(page).locator('.rows.boxed > div').filter({ hasText: 'K. Anitha' });
    await expect(anitha).toContainText('Already holds 3');
    await expect(anitha.getByRole('button', { name: /Assign/ })).toHaveCount(0);
  });

  test('a number on the roster is masked on the screen and dialled whole', async ({ page }) => {
    await jobAt(page, TICKET.placed);
    const link = roster(page).getByRole('link', { name: '••••••2345' });
    await expect(link).toHaveAttribute('href', 'tel:9848012345');
    expect(await roster(page).innerText()).not.toContain('9848012345');
  });

  test('Assign puts that person on the job, by id', async ({ page, world }) => {
    await jobAt(page, TICKET.placed);
    await roster(page).getByRole('button', { name: 'Assign G. Srinivas' }).click();
    await expect.poll(() => world.calls('deskAssign')).toHaveLength(1);
    expect(world.lastVars('deskAssign')).toEqual({ ticketId: TICKET.placed, associateId: 'as-ravi', note: '' });
  });

  test('a refused assignment says nothing on this job has changed', async ({ page, world }) => {
    world.set('deskAssign', false);
    await jobAt(page, TICKET.placed);
    await roster(page).getByRole('button', { name: 'Assign G. Srinivas' }).click();
    await expect(roster(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('an assignment the server refuses with a reason says the same, and the reason is toasted', async ({ page, world }) => {
    world.set('deskAssign', World.gqlError('This order is not paid yet.'));
    await jobAt(page, TICKET.placed);
    await roster(page).getByRole('button', { name: 'Assign G. Srinivas' }).click();
    await expect(roster(page).getByText(MOVE_FAILED)).toBeVisible();
    await expect(page.getByText('This order is not paid yet.')).toBeVisible();
  });

  test('nobody who could take it is said, with the way to add somebody', async ({ page, world }) => {
    world.set('candidates', []);
    await jobAt(page, TICKET.placed);
    await expect(roster(page)).toContainText('No provider is available today');
    await expect(roster(page).getByRole('link', { name: 'Add a member' })).toHaveAttribute('href', '/desk/enrol');
  });

  test('a roster that will not load says so and offers to read it again', async ({ page, world }) => {
    world.set('candidates', World.gqlError('the roster is down'));
    await jobAt(page, TICKET.placed);
    await expect(roster(page).getByText('The roster did not load')).toBeVisible();
    world.set('candidates', []);
    await roster(page).getByRole('button', { name: 'Try again' }).click();
    await expect(roster(page)).toContainText('No provider is available today');
  });

  test('a job the desk may not assign is not offered a roster, and does not ask for one', async ({ page, world }) => {
    world.set('deskTicket', (vars) => ({
      job: { ticketId: String(vars.id), ref: 'PT-2105', kind: 'survey', serviceLabel: 'Corner survey', place: 'Katragunta, Markapur', status: 'submitted', statusLabel: 'Waiting on you', statusState: 'warn', assignee: 'Ravi Kumar', assigneeRef: 'as-ravi', assigneeContact: '', orderedAt: '2026-09-04', ageDays: 5, dueDate: '25/09/2026', overdue: false, quiet: false, quietDays: 0, quoted: 6500, held: 6500, dispatchState: '', dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false, askedAt: '' },
      can: ['dispatch', 'message'], events: [], deliverables: [], dispatches: [],
    }));
    await jobAt(page, TICKET.needsYou);
    await drawn(page, 'Corner survey');
    await expect(card(page, 'Assigned provider')).toBeVisible();
    await expect(roster(page)).toHaveCount(0);
    expect(world.calls('candidates')).toHaveLength(0);
    // Nor marking it started or taking anybody off: the desk's `can` has neither.
    await expect(page.getByRole('button', { name: 'Mark started' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Take them off this job' })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · who is on it', () => {
  test('taking somebody off needs a reason, and sends it', async ({ page, world }) => {
    await jobAt(page, TICKET.assigned);
    await card(page, 'Assigned provider').getByRole('button', { name: 'Take them off this job' }).click();
    const dialog = page.getByRole('dialog', { name: 'Take G. Srinivas off PT-2102?' });
    await expect(dialog.getByRole('button', { name: 'Take them off' })).toBeDisabled();
    await dialog.getByLabel('Why are they coming off').fill('Not answering since the 4th.');
    await dialog.getByRole('button', { name: 'Take them off' }).click();

    await expect.poll(() => world.calls('deskUnassign')).toHaveLength(1);
    expect(world.lastVars('deskUnassign')).toEqual({ ticketId: TICKET.assigned, reason: 'Not answering since the 4th.' });
  });

  test('a refused take-off says so inside the dialog', async ({ page, world }) => {
    world.set('deskUnassign', false);
    await jobAt(page, TICKET.assigned);
    await card(page, 'Assigned provider').getByRole('button', { name: 'Take them off this job' }).click();
    const dialog = page.getByRole('dialog', { name: 'Take G. Srinivas off PT-2102?' });
    await dialog.getByLabel('Why are they coming off').fill('Not answering.');
    await dialog.getByRole('button', { name: 'Take them off' }).click();
    await expect(dialog.getByText(MOVE_FAILED)).toBeVisible();
  });

  test('marking it started is the desk\'s, and is sent for this job', async ({ page, world }) => {
    await jobAt(page, TICKET.assigned);
    await card(page, 'Assigned provider').getByRole('button', { name: 'Mark started' }).click();
    await expect.poll(() => world.calls('deskStartTicket')).toHaveLength(1);
    expect(world.lastVars('deskStartTicket')).toEqual({ ticketId: TICKET.assigned, note: '' });
  });

  test('a refused start says so in the card that offered it', async ({ page, world }) => {
    world.set('deskStartTicket', false);
    await jobAt(page, TICKET.assigned);
    await card(page, 'Assigned provider').getByRole('button', { name: 'Mark started' }).click();
    await expect(card(page, 'Assigned provider').getByText(MOVE_FAILED)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · sending it to a provider', () => {
  test('sending says what the other person will see, and waits for somewhere to write to', async ({ page }) => {
    await jobAt(page, TICKET.placed);
    await card(page, 'Sent to provider').getByRole('button', { name: 'Send this to a provider' }).click();

    const dialog = sendDialog(page);
    await expect(dialog).toContainText('They see the job, the place, what the owner asked for, the fee and the due date — nothing else.');
    await expect(dialog.getByRole('button', { name: 'Send it' })).toBeDisabled();
    await expect(dialog.getByText('An email or a phone number first.')).toBeVisible();
    await expect(dialog.getByLabel('Their name')).toBeFocused();
  });

  test('sending records exactly what I typed, as an invite with a fourteen-day link', async ({ page, world }) => {
    await jobAt(page, TICKET.placed);
    await card(page, 'Sent to provider').getByRole('button', { name: 'Send this to a provider' }).click();
    const dialog = sendDialog(page);
    await dialog.getByLabel('Their name').fill('G. Srinivas');
    await dialog.getByLabel('Email or phone').fill('98480 12345');
    await dialog.getByLabel('Send it by').selectOption('whatsapp');
    await dialog.getByLabel('Anything else they should know').fill('Gate key is with the neighbour.');
    await dialog.getByRole('button', { name: 'Send it' }).click();

    await expect.poll(() => world.calls('deskDispatchTicket')).toHaveLength(1);
    expect(world.lastVars('deskDispatchTicket')).toEqual({
      ticketId: TICKET.placed, contact: '98480 12345', personName: 'G. Srinivas', channel: 'whatsapp',
      purpose: 'invite', note: 'Gate key is with the neighbour.', expiresDays: 14,
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a refused send says nothing was sent and keeps what I typed', async ({ page, world }) => {
    world.set('deskDispatchTicket', '');
    await jobAt(page, TICKET.placed);
    await card(page, 'Sent to provider').getByRole('button', { name: 'Send this to a provider' }).click();
    const dialog = sendDialog(page);
    await dialog.getByLabel('Email or phone').fill('98480 12345');
    await dialog.getByRole('button', { name: 'Send it' }).click();
    await expect(dialog.getByText(SEND_FAILED)).toBeVisible();
    await expect(dialog.getByLabel('Email or phone')).toHaveValue('98480 12345');
  });

  test('a send the server refuses with a reason says the same thing', async ({ page, world }) => {
    world.set('deskDispatchTicket', World.gqlError('This order is not paid yet, so nothing was sent.'));
    await jobAt(page, TICKET.placed);
    await card(page, 'Sent to provider').getByRole('button', { name: 'Send this to a provider' }).click();
    const dialog = sendDialog(page);
    await dialog.getByLabel('Email or phone').fill('98480 12345');
    await dialog.getByRole('button', { name: 'Send it' }).click();
    await expect(dialog.getByText(SEND_FAILED)).toBeVisible();
  });

  test('sending it again is a reminder that asks for the number again', async ({ page, world }) => {
    await jobAt(page, TICKET.assigned);
    await card(page, 'Sent to provider').getByRole('button', { name: 'Send it again' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send it again' });
    await expect(dialog).toContainText('This one is a reminder. Type their number again.');
    await expect(dialog.getByLabel('Their name')).toHaveValue('Ravi Kumar');
    await expect(dialog.getByLabel('Email or phone')).toHaveValue('');
    await dialog.getByLabel('Email or phone').fill('9848012345');
    await dialog.getByRole('button', { name: 'Send it' }).click();
    await expect.poll(() => world.calls('deskDispatchTicket')).toHaveLength(1);
    expect(world.lastVars('deskDispatchTicket')).toMatchObject({ purpose: 'nudge', contact: '9848012345', channel: 'sms' });
  });

  test('a dispatch keeps the contact masked and the work link hidden until asked for', async ({ page }) => {
    await jobAt(page, TICKET.assigned);
    const sent = card(page, 'Sent to provider');
    await expect(sent).toContainText('SMS · ••••••2345 · 05/09/2026');
    await expect(sent).toContainText('Recorded, not sent');
    expect(await sent.innerText()).not.toContain('/work/');
    await sent.getByRole('button', { name: 'See what was sent' }).click();
    await expect(sent).toContainText('/work/e2e-fixture-worker-token-xxxxxxxxxxxxxxxxxx');
  });

  test('withdrawing asks first, and backing out calls nothing', async ({ page, world }) => {
    await jobAt(page, TICKET.assigned);
    const sent = card(page, 'Sent to provider');
    await sent.getByRole('button', { name: 'Withdraw' }).click();
    await expect(sent).toContainText('They are told it is off.');
    await sent.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sent.getByRole('button', { name: 'Withdraw' })).toHaveCount(1);
    expect(world.calls('deskRevokeDispatch')).toHaveLength(0);
  });

  test('withdrawing takes that one dispatch back', async ({ page, world }) => {
    await jobAt(page, TICKET.assigned);
    const sent = card(page, 'Sent to provider');
    await sent.getByRole('button', { name: 'Withdraw' }).click();
    await sent.getByRole('button', { name: 'Withdraw' }).click();
    await expect.poll(() => world.calls('deskRevokeDispatch')).toHaveLength(1);
    expect(world.lastVars('deskRevokeDispatch')).toEqual({ dispatchId: 'w-dsp-1', reason: '' });
  });

  test('a refused withdrawal is reported in the card that offered it', async ({ page, world }) => {
    world.set('deskRevokeDispatch', false);
    await jobAt(page, TICKET.assigned);
    const sent = card(page, 'Sent to provider');
    await sent.getByRole('button', { name: 'Withdraw' }).click();
    await sent.getByRole('button', { name: 'Withdraw' }).click();
    await expect(sent.getByText(MOVE_FAILED)).toBeVisible();
    await expect(page.getByText(MOVE_FAILED)).toHaveCount(1);
  });

  test('a withdrawn dispatch is kept as evidence and offers no second withdrawal', async ({ page, world }) => {
    world.set('deskTicket', (vars) => {
      const id = String(vars.id);
      return {
        job: { ticketId: id, ref: 'PT-2102', kind: 'survey', serviceLabel: 'Corner survey', place: 'Katragunta, Markapur', status: 'placed', statusLabel: 'Placed', statusState: 'unknown', assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-09-04', ageDays: 5, dueDate: '25/09/2026', overdue: false, quiet: false, quietDays: 0, quoted: 6500, held: 6500, dispatchState: '', dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false, askedAt: '' },
        can: ['assign', 'dispatch', 'message'], events: [], deliverables: [],
        dispatches: [{ id: 'w-dsp-1', purpose: 'invite', channel: 'sms', contactMasked: '••••••2345', personName: 'Ravi Kumar', subject: '', body: 'x', provider: 'stub', live: false, status: 'sent', statusWord: 'Sent', error: '', expiresOn: '', daysLeft: 0, revoked: true, revokeReason: 'He is away this week.', sentAt: '05/09/2026' }],
      };
    });
    await jobAt(page, TICKET.assigned);
    const sent = card(page, 'Sent to provider');
    await expect(sent).toContainText('Withdrawn');
    await expect(sent).toContainText('He is away this week.');
    await expect(sent.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await expect(sent.getByRole('button', { name: 'Send this to a provider' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · recording submitted work', () => {
  const open = async (page: Page) => {
    await jobAt(page, TICKET.assigned);
    await card(page, 'Work handed in').getByRole('button', { name: 'Record submitted work' }).click();
    return recordDialog(page);
  };

  test('recording promises nothing reaches the property until the owner keeps it, and waits for a name', async ({ page }) => {
    const dialog = await open(page);
    await expect(dialog).toContainText('Nothing here touches the owner’s property until they keep it.');
    await expect(dialog.getByRole('button', { name: 'Add it' })).toBeDisabled();
    await expect(dialog.getByText('Give it a name first.')).toBeVisible();
    await dialog.getByLabel('What to call it').fill('Corner sketch');
    await expect(dialog.getByRole('button', { name: 'Add it' })).toBeEnabled();
  });

  test('a corrected outline asks for corners instead of a file', async ({ page, world }) => {
    const dialog = await open(page);
    await dialog.getByLabel('What is it').selectOption('boundary');
    await expect(dialog.getByRole('button', { name: 'Choose a file' })).toHaveCount(0);
    await dialog.getByLabel('What to call it').fill('Eight corners');
    await dialog.getByLabel('The corners').fill('15.3133,80.0729;15.3140,80.0740;15.3120,80.0750');
    await dialog.getByRole('button', { name: 'Add it' }).click();

    await expect.poll(() => world.calls('deskAddDeliverable')).toHaveLength(1);
    expect(world.lastVars('deskAddDeliverable')).toMatchObject({
      ticketId: TICKET.assigned, kind: 'boundary', label: 'Eight corners', fileRef: '',
      payload: JSON.stringify({ ring: '15.3133,80.0729;15.3140,80.0740;15.3120,80.0750' }),
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('something on the land asks what condition it is in, in the site-feature words', async ({ page, world }) => {
    const dialog = await open(page);
    await dialog.getByLabel('What is it').selectOption('feature');
    await expect(dialog.getByLabel('What condition it is in').getByRole('option'))
      .toHaveText(['Working', 'Watch it', 'Broken', 'Not checked']);
    await dialog.getByLabel('What to call it').fill('Open well');
    await dialog.getByLabel('What condition it is in').selectOption('warn');
    await dialog.getByRole('button', { name: 'Add it' }).click();
    await expect.poll(() => world.calls('deskAddDeliverable')).toHaveLength(1);
    expect(world.lastVars('deskAddDeliverable')).toMatchObject({
      kind: 'feature', label: 'Open well', payload: JSON.stringify({ condition_state: 'warn' }),
    });
  });

  test('recording a document uploads the bytes first and files the node id', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-uploaded', name: 'report.pdf', sizeBytes: 2048, mimeType: 'application/pdf' },
    }));
    const dialog = await open(page);
    await dialog.getByLabel('What to call it').fill('Surveyor report');
    await page.getByLabel('Submitted file').setInputFiles({
      name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 report'),
    });
    await expect(dialog.getByText('report.pdf · 0.0 MB')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add it' }).click();

    await expect.poll(() => world.calls('deskAddDeliverable')).toHaveLength(1);
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(1);
    expect(world.lastVars('deskAddDeliverable')).toMatchObject({
      kind: 'paper', label: 'Surveyor report', fileRef: 'file-uploaded', fileName: 'report.pdf', mimeType: 'application/pdf',
    });
  });

  test('a file over the limit is refused before anything is uploaded', async ({ page, world }) => {
    const dialog = await open(page);
    await dialog.getByLabel('What to call it').fill('A very large scan');
    await page.getByLabel('Submitted file').setInputFiles({
      name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024, 0x20),
    });
    await dialog.getByRole('button', { name: 'Add it' }).click();
    await expect(dialog.getByText('huge.pdf is 16.0 MB. The limit is 15.0 MB — nothing was uploaded.')).toBeVisible();
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(0);
    expect(world.calls('deskAddDeliverable')).toHaveLength(0);
  });

  test('a refused recording says nothing was added, and keeps the name', async ({ page, world }) => {
    world.set('deskAddDeliverable', '');
    const dialog = await open(page);
    await dialog.getByLabel('What to call it').fill('Corner sketch');
    await dialog.getByRole('button', { name: 'Add it' }).click();
    await expect(dialog.getByText(ADD_FAILED)).toBeVisible();
    await expect(dialog.getByLabel('What to call it')).toHaveValue('Corner sketch');
  });
});

test.describe('Desk job · a storage outage while recording', () => {
  test.use({ allowConsole: true });

  test('an upload that fails says the file could not be uploaded, and records nothing', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ status: 503, json: { detail: 'Storage is offline' } }));
    await jobAt(page, TICKET.assigned);
    await card(page, 'Work handed in').getByRole('button', { name: 'Record submitted work' }).click();
    const dialog = recordDialog(page);
    await dialog.getByLabel('What to call it').fill('Surveyor report');
    await page.getByLabel('Submitted file').setInputFiles({
      name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 report'),
    });
    await dialog.getByRole('button', { name: 'Add it' }).click();

    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByText(ADD_FAILED)).toHaveCount(0);
    expect(world.calls('deskAddDeliverable')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('Desk job · the thread with the owner', () => {
  const withThread = (world: World) => world.set('deskTicket', (vars) => ({
    job: { ticketId: String(vars.id), ref: 'PT-2101', kind: 'ec', serviceLabel: 'Encumbrance certificate', place: 'Katragunta, Markapur', status: 'placed', statusLabel: 'Placed', statusState: 'unknown', assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-09-09', ageDays: 4, dueDate: '20/09/2026', overdue: false, quiet: false, quietDays: 0, quoted: 1180, held: 1180, dispatchState: '', dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false, askedAt: '' },
    can: ['assign', 'dispatch', 'message'], deliverables: [], dispatches: [],
    events: [{ id: 'm1', kind: 'message', action: 'message', headline: 'You sent a message', detail: 'Where are you on this?', actorLabel: 'You', actorKind: 'owner', tone: '', at: '2026-09-12T05:00:00Z', atLabel: '12/09/2026', attachments: [{ fileRef: 'n1', fileName: 'deed.pdf', mimeType: 'application/pdf', sizeBytes: 204_800 }] }],
  }));

  test('the owner\'s message reaches the desk, files and all', async ({ page, world }) => {
    withThread(world);
    await jobAt(page, TICKET.placed);
    const thread = card(page, 'Conversation');
    await expect(thread).toContainText('Owner ·');
    await expect(thread).toContainText('Where are you on this?');
    await expect(thread).toContainText('deed.pdf · 0.2 MB');
  });

  test('a reply goes on the thread as Pattadar desk', async ({ page, world }) => {
    withThread(world);
    await jobAt(page, TICKET.placed);
    const thread = card(page, 'Conversation');
    await expect(thread.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    await thread.getByRole('textbox', { name: 'Reply' }).fill('We have two surveyors free on Monday.');
    await thread.getByRole('button', { name: 'Send reply' }).click();

    await expect.poll(() => world.calls('deskPostTicketMessage')).toHaveLength(1);
    expect(world.lastVars('deskPostTicketMessage')).toEqual({ ticketId: TICKET.placed, message: 'We have two surveyors free on Monday.' });
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveValue('');
  });

  test('a refused reply says nothing was sent, and keeps the words', async ({ page, world }) => {
    withThread(world);
    world.set('deskPostTicketMessage', false);
    await jobAt(page, TICKET.placed);
    const thread = card(page, 'Conversation');
    await thread.getByRole('textbox', { name: 'Reply' }).fill('Monday.');
    await thread.getByRole('button', { name: 'Send reply' }).click();
    await expect(thread.getByText(REPLY_FAILED)).toBeVisible();
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveValue('Monday.');
  });

  test('a cancelled job has no reply box', async ({ page }) => {
    await jobAt(page, TICKET.cancelled);
    await drawn(page, 'Corner survey');
    await expect(card(page, 'Conversation').getByRole('textbox')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════

test.describe('Company members · the table view', () => {
  test('the table totals every member, sorts by a figure and pages past five', async ({ page, world }) => {
    const three = SEED.associates({}) as Record<string, unknown>[];
    // Eight members cycled from the three seeded people.
    world.set('associates', () => Array.from({ length: 8 }, (_, i) => ({
      ...three[i % 3], id: `as-page-${i + 1}`, name: `Member ${'ABCDEFGH'[i]}`,
    })));
    await page.goto('/admin/members?view=table');
    const table = page.getByRole('table', { name: 'Company members' });
    const foot = table.locator('tfoot');
    const pager = page.getByRole('navigation', { name: 'Company members pages' });
    // 1 + 3 + 0 open and 14 + 6 + 2 done, over A–H: three of each of the first
    // two people and two of the third.
    await expect(foot).toContainText('Total · 8 members');
    // td 0 is the tick-box column.
    await expect(foot.locator('td').nth(1)).toHaveText('12');
    await expect(foot.locator('td').nth(2)).toHaveText('64');
    await expect(pager).toContainText('1–8 of 8');

    await pager.getByRole('button', { name: '5', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(pager).toContainText('6–8 of 8');
    // The footer still sums all eight, not this page.
    await expect(foot.locator('td').nth(2)).toHaveText('64');

    // A new sort starts again from the top; most completed first on a second press.
    await table.getByRole('button', { name: 'Completed' }).click();
    await table.getByRole('button', { name: 'Completed' }).click();
    await expect(pager).toContainText('1–5 of 8');
    await expect(table.locator('tbody tr').first()).toContainText('14');
  });

  test('ticking two members sums just them, and the bar offers Export', async ({ page }) => {
    await page.goto('/admin/members?view=table');
    const table = page.getByRole('table', { name: 'Company members' });
    const foot = table.locator('tfoot');
    const boxes = table.locator('tbody td.selcol input');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(foot).toContainText('2 members selected');
    const open = await table.locator('tbody tr.selected td:nth-child(9)').allTextContents();
    await expect(foot.locator('td').nth(1)).toHaveText(String(open.reduce((n, t) => n + Number(t), 0)));
    const bar = page.getByRole('group', { name: 'Act on the selected members' });
    await expect(bar).toContainText('2 members selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
  });
});
