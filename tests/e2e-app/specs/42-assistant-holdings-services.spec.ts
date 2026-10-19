/**
 * The assistant's holding step, service requests and result timing
 * (docs/specs/2026-10-04-assistant-write-actions.md, decisions D1–D5).
 *
 * Sealed like every spec here: no model runs and nothing reaches a real
 * account. Every write below is one the reader's click sends through gql()
 * with an idempotency key, answered by the world.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';

const sse = (...events: unknown[]) =>
  events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');

const deed = (index: number, over: Record<string, unknown> = {}) => ({
  index,
  rid: `AP04041320000000688${index}`,
  s_no: 1,
  kind: 'property',
  title: `Plot 9${index}B, RAMANAYYAPETA`,
  village: 'RAMANAYYAPETA',
  mandal: null,
  district: null,
  survey_no: `41/${index + 1}`,
  extent: 133.33,
  extent_unit: 'sq.yd',
  doc_no: `688${index}/2000`,
  sro: 'KAKINADA(R.O)',
  reg_date: '2000-10-16',
  consideration: 47000,
  market_value: 46666,
  boundary_north: '33FT WIDE ROAD',
  boundary_south: 'SITE OF NEMANI SRILAKSHMI',
  boundary_east: 'SITE OF KORIPELLA',
  boundary_west: '40FT WIDE ROAD',
  seller_name: 'GUNTAMUKKULA SATYA NARAYANA',
  buyer_name: 'CHINTALAPUDI RANGA SUBBA REDDY S/O VENKATA REDDY',
  source_ref: `pr:AP04041320000000688${index}:1`,
  buyer_matches_user: null,
  record_id: null,
  error: null,
  ...over,
});

const proposalEvent = (id: string, items: unknown[], stake: string | null = null) => ({
  type: 'proposal', id, status: 'draft', stake, items,
});

const serviceEvent = (id: string, records: unknown[], requested: string[], note: string | null = null) => ({
  type: 'service_proposal', id, status: 'draft', records, requested, note,
});

const recordsView = {
  type: 'records',
  id: 'toolu_party',
  kind: 'table',
  title: 'Deeds naming “Ranga Subba Reddy”',
  columns: [{ key: 'matched_name', label: 'Name in deed' }, { key: 'location', label: 'Location' }],
  rows: [{ matched_name: 'CHINTALAPUDI RANGA SUBBA REDDY', location: 'Plot 90B, RAMANAYYAPETA', rid: 'AP1', s_no: 1 }],
  total: 1,
  note: null,
};

/** What GET /conversations/{id} answers as this chat's total; a test may move it. */
let chatTotal = 1.234;

/** The record fixtures the service card's ownership read answers for. */
const SVC_RECORDS: Record<string, string> = { 'rec-svc-1': 'Plot 90B, RAMANAYYAPETA', 'rec-svc-2': 'Plot 91B, RAMANAYYAPETA' };
const ownsSvcRecords = (world: World) => world.set('record', (vars) => {
  const id = String(vars.id ?? '');
  return SVC_RECORDS[id] ? { id, kind: 'property', title: SVC_RECORDS[id], stake: 'owned' } : null;
});

function answering(world: World, ...events: unknown[]) {
  chatTotal = 1.234;
  world.route(/\/assistant\/api\/capabilities/, () => ({
    json: { public_records: { ready: true, status: 'ready', tool_count: 8, semantic_search_ready: false, coverage: '1975–2029' } },
  }));
  world.route(/\/assistant\/api\/conversations/, () => ({
    json: { id: 'w-conv-hs', conversations: [], total_cost_usd: chatTotal },
  }));
  world.route(/\/assistant\/api\/usage/, () => ({
    json: { today_usd: 0.1, month_usd: 1, requests_today: 1, credit_status: 'ok', balance_usd: null },
  }));
  world.route(/\/assistant\/api\/models/, () => ({
    json: { default: 'claude-sonnet-4-6', models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'Balanced', input_per_mtok: 3, output_per_mtok: 15, default: true },
    ] },
  }));
  world.route(/\/assistant\/api\/proposals\//, (_route, call) => ({ json: { id: call.path.split('/').pop(), ...JSON.parse(call.body ?? '{}') } }));
  world.route(/\/assistant\/api\/chat\/stream/, () => ({ contentType: 'text/event-stream', body: sse(...events) }));
  world.set('root.me', {
    id: 'u-founder', name: 'Usharani Bobba', email: 'u@example.com', address: '', language: 'en',
    districtsOfInterest: [], notificationPrefs: '{}', kycRefMasked: '', mfaEnabled: false,
  });
  world.set('root.auditTrail', []);
}

/** Every idempotency key a GraphQL mutation for `field` carried, in order. */
function keysFor(page: Page, field: string): string[] {
  const keys: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/graphql') || !(request.postData() ?? '').includes(`${field}(`)) return;
    keys.push(request.headers()['x-idempotency-key'] ?? '(none)');
  });
  return keys;
}

async function openAndAsk(page: Page, question: string) {
  await page.goto('/home');
  // /app is the live dev server's heaviest first paint; give it time under load.
  await page.getByRole('button', { name: 'Assistant', exact: true }).click({ timeout: 30_000 });
  await page.getByLabel('Message the Pattadar Assistant').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
}

const saveCard = (page: Page) => page.getByRole('region', { name: 'Add to your properties' });
const serviceCard = (page: Page) => page.getByRole('region', { name: 'Order services' });

/** saveRecord answers rec-<index> for each deed, so the members are known. */
const savesByIndex = (vars: Record<string, unknown>) => {
  const ref = String((vars.input as Record<string, unknown>).sourceRef);
  return `rec-${ref.slice(-3, -2)}`;
};

test.describe('assistant holdings, service requests and result timing', () => {
  // /home's home asks for things these tests do not care about (see 41).
  test.use({ allowConsole: true });

  // ── D2: the holding step ────────────────────────────────────────────

  test('managed land is grouped by default, under the edited name, with one createCombinedProperty even on a double click', async ({ page, world }) => {
    const holdingKeys = keysFor(page, 'createCombinedProperty');
    world.set('saveRecord', savesByIndex);
    world.set('combinedProperties', []);
    world.set('createCombinedProperty', World.slow(700, 'cp-new'));
    answering(world, proposalEvent('p-hold', [deed(0), deed(1)], 'managed'), '[DONE]');
    await openAndAsk(page, 'I manage these for my uncle, add them');

    const offer = saveCard(page);
    const group = offer.getByRole('checkbox', { name: 'Group as one holding' });
    await expect(group).toBeChecked();
    const name = offer.getByLabel('Holding name');
    await expect(name).toHaveValue('Chintalapudi Ranga Subba Reddy — Ramanayyapeta (managed)');
    await name.fill('Uncle’s Kakinada plots');

    await offer.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(offer.getByText('Combined into one holding · Uncle’s Kakinada plots')).toBeVisible();
    await expect(offer.getByRole('link', { name: 'Open Plot 90B, RAMANAYYAPETA' })).toBeVisible();
    await expect(offer.getByRole('link', { name: 'Open Plot 91B, RAMANAYYAPETA' })).toBeVisible();

    expect(world.calls('saveRecord')).toHaveLength(2);
    expect(world.calls('saveRecord').map((call) => (call.vars.input as Record<string, unknown>).stake)).toEqual(['managed', 'managed']);
    const made = world.calls('createCombinedProperty');
    expect(made, 'one holding, however often Save is pressed').toHaveLength(1);
    expect(made[0].vars).toMatchObject({ name: 'Uncle’s Kakinada plots', recordIds: ['rec-0', 'rec-1'] });
    expect(holdingKeys).toHaveLength(1);
    expect(holdingKeys[0]).toMatch(/^asst:p-hold:holding:[0-9a-z]+$/);

    // The stored card remembers its holding, so a reload keeps "Open holding".
    const puts = world.restCalls(/\/assistant\/api\/proposals\/p-hold/).map((call) => JSON.parse(call.body ?? '{}'));
    expect(puts.at(-1)).toMatchObject({ status: 'saved', holding_id: 'cp-new' });

    await offer.getByRole('link', { name: 'Open holding' }).click();
    await expect(page).toHaveURL(/\/holdings\/cp-new$/);
  });

  test('a holding that already has exactly these records is reused, never made twice', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('combinedProperties', [{ id: 'cp-old', members: [{ recordId: 'rec-1' }, { recordId: 'rec-0' }] }]);
    world.set('createCombinedProperty', 'cp-dup');
    answering(world, proposalEvent('p-reuse', [deed(0), deed(1)], 'managed'), '[DONE]');
    await openAndAsk(page, 'add them');
    await saveCard(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saveCard(page).getByRole('link', { name: 'Open holding' })).toBeVisible();
    expect(world.calls('createCombinedProperty')).toHaveLength(0);
  });

  test('owned land is offered the holding unchecked, and Save then makes none', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('createCombinedProperty', 'cp-never');
    answering(world, proposalEvent('p-own', [deed(0), deed(1)], 'owned'), '[DONE]');
    await openAndAsk(page, 'these are mine, add them');
    const offer = saveCard(page);
    await expect(offer.getByRole('checkbox', { name: 'Group as one holding' })).not.toBeChecked();
    await expect(offer.getByLabel('Holding name')).toHaveCount(0);
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByText('2 of 2 saved', { exact: true })).toBeVisible();
    expect(world.calls('createCombinedProperty')).toHaveLength(0);
    // Still offered afterwards, as a choice.
    await expect(offer.getByRole('button', { name: 'Group these as one holding?' })).toBeVisible();
  });

  test('mixed stakes are never grouped', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('createCombinedProperty', 'cp-never');
    answering(world, proposalEvent('p-mix', [deed(0), deed(1)]), '[DONE]');
    await openAndAsk(page, 'add them');
    const offer = saveCard(page);
    await offer.getByText('Set each one separately').click();
    await offer.getByRole('group', { name: 'Your stake in Plot 90B, RAMANAYYAPETA' }).getByRole('button', { name: 'Owned' }).click();
    await offer.getByRole('group', { name: 'Your stake in Plot 91B, RAMANAYYAPETA' }).getByRole('button', { name: 'Managed' }).click();
    await expect(offer.getByRole('checkbox', { name: 'Group as one holding' })).toHaveCount(0);
    await expect(offer.getByTestId('holding-not-offered')).toContainText('different stakes');
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByText('2 of 2 saved', { exact: true })).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Group these as one holding?' })).toHaveCount(0);
    expect(world.calls('createCombinedProperty')).toHaveLength(0);
  });

  test('watched land is never offered a holding, before or after saving', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('createCombinedProperty', 'cp-never');
    answering(world, proposalEvent('p-watch', [deed(0), deed(1)], 'watch'), '[DONE]');
    await openAndAsk(page, 'keep an eye on these');
    const offer = saveCard(page);
    await expect(offer.getByRole('checkbox', { name: 'Group as one holding' })).toHaveCount(0);
    await expect(offer.getByTestId('holding-not-offered')).toHaveText('Not offered as one holding: watched land is never combined.');
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByText('2 of 2 saved', { exact: true })).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Group these as one holding?' })).toHaveCount(0);
    expect(world.calls('createCombinedProperty')).toHaveLength(0);
  });

  test('a reloaded save card groups by the stake it was SAVED with, not the draft stake', async ({ page, world }) => {
    answering(world, '[DONE]');
    world.set('combinedProperties', []);
    world.set('createCombinedProperty', 'cp-later');
    world.route(/\/assistant\/api\/conversations\?/, () => ({
      json: { conversations: [{ id: 'c-saved', title: 'Saved', status: 'active', message_count: 2, updated_at: '2026-10-04T10:00:00Z' }] },
    }));
    world.route(/\/assistant\/api\/conversations\/c-saved/, () => ({
      json: { id: 'c-saved', total_cost_usd: 0.5, messages: [
        { role: 'human', content: 'add them' },
        { role: 'ai', content: 'Saved them.', service_proposals: [], proposals: [{
          // The model drafted no stake; the reader saved both as managed and
          // the holding step then failed — so nothing records a holding yet.
          type: 'proposal', id: 'p-saved', status: 'saved', stake: null, holding_id: null,
          items: [
            deed(0, { record_id: 'rec-0', saved_stake: 'managed' }),
            deed(1, { record_id: 'rec-1', saved_stake: 'managed' }),
          ],
        }] },
      ] },
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText('Saved them.')).toBeVisible();
    const offer = saveCard(page);
    await expect(offer.getByText(/Saved as Managed/).first()).toBeVisible();
    await offer.getByRole('button', { name: 'Group these as one holding?' }).click();
    await expect(offer.getByLabel('Holding name')).toHaveValue('Chintalapudi Ranga Subba Reddy — Ramanayyapeta (managed)');
    await offer.getByRole('button', { name: 'Combine', exact: true }).click();
    await expect(offer.getByRole('link', { name: 'Open holding' })).toBeVisible();
    const puts = world.restCalls(/\/assistant\/api\/proposals\/p-saved/).map((call) => JSON.parse(call.body ?? '{}'));
    expect(puts.at(-1)).toMatchObject({
      status: 'saved', holding_id: 'cp-later',
      results: [{ index: 0, record_id: 'rec-0', stake: 'managed' }, { index: 1, record_id: 'rec-1', stake: 'managed' }],
    });
  });

  test('two deeds for the same plot are flagged, and the reader can save only one', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    answering(world, proposalEvent('p-same', [
      deed(0, { title: 'Plot 96A, RAMANAYYAPETA', survey_no: '41/6' }),
      deed(1, { title: 'Plot No. 96A, Ramanayyapeta', survey_no: '41/6', doc_no: '7001/2004' }),
    ], 'owned'), '[DONE]');
    await openAndAsk(page, 'add both');
    const offer = saveCard(page);
    await expect(offer.getByText('Looks like the same property as #1')).toBeVisible();
    await offer.getByRole('button', { name: 'Save only #1' }).click();
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' })).toBeVisible();
    expect(world.calls('saveRecord')).toHaveLength(1);
    expect((world.lastVars('saveRecord').input as Record<string, unknown>).docNo).toBe('6880/2000');
  });

  test('a refused holding leaves the records saved and offers Combine again, which retries', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('combinedProperties', []);
    world.set('createCombinedProperty', World.gqlError('“Plot 91B, RAMANAYYAPETA” is already part of the holding “Old plots”. Take it out of that one first.'));
    answering(world, proposalEvent('p-fail', [deed(0), deed(1)], 'managed'), '[DONE]');
    await openAndAsk(page, 'add them');
    const offer = saveCard(page);
    await offer.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(offer.getByText('2 of 2 saved', { exact: true })).toBeVisible();
    await expect(offer.getByText(/the holding was not made — “Plot 91B, RAMANAYYAPETA” is already part of the holding “Old plots”/)).toBeVisible();
    await expect(offer.getByLabel('Holding name')).toHaveValue('Chintalapudi Ranga Subba Reddy — Ramanayyapeta (managed)');
    expect(world.calls('saveRecord')).toHaveLength(2);

    world.set('createCombinedProperty', 'cp-retry');
    await offer.getByRole('button', { name: 'Combine again' }).click();
    await expect(offer.getByRole('link', { name: 'Open holding' })).toBeVisible();
    expect(world.calls('createCombinedProperty')).toHaveLength(2);
    expect(world.calls('saveRecord'), 'the retry saves nothing again').toHaveLength(2);
  });

  test('a retry under an edited name that finds the first holding shows the name it really has', async ({ page, world }) => {
    world.set('saveRecord', savesByIndex);
    world.set('combinedProperties', []);
    // The first create committed but its answer was lost.
    world.set('createCombinedProperty', World.gqlError('Could not reach the server.'));
    answering(world, proposalEvent('p-lost', [deed(0), deed(1)], 'managed'), '[DONE]');
    await openAndAsk(page, 'add them');
    const offer = saveCard(page);
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByRole('button', { name: 'Combine again' })).toBeVisible();
    world.set('combinedProperties', [{ id: 'cp-first', name: 'First name', members: [{ recordId: 'rec-0' }, { recordId: 'rec-1' }] }]);
    await offer.getByLabel('Holding name').fill('Edited name');
    await offer.getByRole('button', { name: 'Combine again' }).click();
    await expect(offer.getByText('Combined into one holding · First name')).toBeVisible();
    await expect(offer.getByText(/Edited name/)).toHaveCount(0);
    expect(world.calls('createCombinedProperty'), 'reused, never made again').toHaveLength(1);
  });

  // ── D3: service requests ────────────────────────────────────────────

  test('the service card preselects what was asked for, prices it, and places one keyed batch per record', async ({ page, world }) => {
    let placed = false;
    world.set('orderServiceBatch', (vars) => {
      placed = true;
      return { batchId: `b-${String(vars.recordId)}`, ref: 'SB-1001', orderCount: 1, total: 1180 };
    });
    ownsSvcRecords(world);
    world.set('orders', (vars) => (vars.recordId === 'rec-svc-1' && placed
      ? [{ id: 'wr-77', ref: 'SR-2077', kind: 'ec', serviceKey: 'ec', title: 'Encumbrance certificate', batchId: 'b-rec-svc-1', recordId: 'rec-svc-1' }]
      : []));
    answering(world,
      { type: 'token', text: 'A request card is shown. Nothing is ordered until you click Place request.' },
      serviceEvent('s-1', [{ record_id: 'rec-svc-1', title: 'Plot 90B, RAMANAYYAPETA' }], ['encumbrance certificate', 'title opinion'], 'for the bank'),
      '[DONE]');
    await openAndAsk(page, 'get an EC and a title opinion for the deed I saved');

    const cardEl = serviceCard(page);
    await expect(cardEl).toBeVisible();
    await expect(cardEl.getByText('You asked for: encumbrance certificate, title opinion')).toBeVisible();
    const ec = cardEl.getByRole('checkbox', { name: 'Encumbrance certificate for Plot 90B, RAMANAYYAPETA' });
    await expect(ec).toBeChecked();
    // The title opinion must be told how far back to trace, so it opens the full form instead.
    await expect(cardEl.getByRole('checkbox', { name: 'Title opinion for Plot 90B, RAMANAYYAPETA' })).toBeDisabled();
    await expect(cardEl.getByRole('link', { name: 'Open the form' })).toBeVisible();
    await expect(cardEl.getByText(/^Total ₹\s?1,180$/)).toBeVisible();
    await expect(cardEl.getByText('You pay only after you accept the work.')).toBeVisible();
    expect(world.calls('orderServiceBatch'), 'nothing is ordered before the click').toHaveLength(0);

    await cardEl.getByRole('button', { name: 'Place the order' }).dblclick();
    const ref = cardEl.getByRole('link', { name: 'SR-2077 · Encumbrance certificate' });
    await expect(ref).toBeVisible();

    const batches = world.calls('orderServiceBatch');
    expect(batches).toHaveLength(1);
    expect(batches[0].vars).toMatchObject({
      recordId: 'rec-svc-1', idempotencyKey: 'asst:s-1:rec-svc-1:ec', note: 'Ordered from the assistant: for the bank',
    });
    expect(JSON.parse(String(batches[0].vars.items))).toEqual([{ kind: 'ec', params: {} }]);

    // Stored in the service's row shape.
    const puts = world.restCalls(/\/assistant\/api\/proposals\/s-1/).map((call) => JSON.parse(call.body ?? '{}'));
    expect(puts.at(-1)).toEqual({
      status: 'ordered',
      results: [{ index: 0, record_id: 'rec-svc-1', service: 'Encumbrance certificate', order_id: 'wr-77', order_ref: 'SR-2077', error: null }],
    });

    await ref.click();
    await expect(page).toHaveURL(/\/services\/wr-77$/);
  });

  test('two records: ticks are per record, the total follows them, and each record gets its own keyed batch', async ({ page, world }) => {
    ownsSvcRecords(world);
    world.set('orderServiceBatch', (vars) => ({ batchId: `b-${String(vars.recordId)}`, ref: `SB-${String(vars.recordId).slice(-1)}`, orderCount: 1, total: 1180 }));
    answering(world,
      { type: 'token', text: 'A request card is shown.' },
      serviceEvent('s-2', [{ record_id: 'rec-svc-1', title: 'Plot 90B, RAMANAYYAPETA' }, { record_id: 'rec-svc-2', title: 'Plot 91B, RAMANAYYAPETA' }], ['encumbrance certificate']),
      '[DONE]');
    await openAndAsk(page, 'get ECs for both');
    const cardEl = serviceCard(page);
    const ec1 = cardEl.getByRole('checkbox', { name: 'Encumbrance certificate for Plot 90B, RAMANAYYAPETA' });
    const ec2 = cardEl.getByRole('checkbox', { name: 'Encumbrance certificate for Plot 91B, RAMANAYYAPETA' });
    await expect(ec1).toBeChecked();
    await expect(ec2).toBeChecked();
    await expect(cardEl.getByText(/^Total ₹\s?2,360$/)).toBeVisible();
    await ec2.uncheck();
    await expect(ec1, 'unticking one record leaves the other').toBeChecked();
    await expect(cardEl.getByText(/^Total ₹\s?1,180$/)).toBeVisible();
    await ec2.check();
    await expect(cardEl.getByText(/^Total ₹\s?2,360$/)).toBeVisible();
    await cardEl.getByRole('button', { name: 'Place the order' }).click();
    await expect(cardEl.getByText(/Ordered · SB-2/)).toBeVisible();
    const batches = world.calls('orderServiceBatch').map((call) => call.vars);
    expect(batches.map((vars) => [vars.recordId, vars.idempotencyKey])).toEqual([
      ['rec-svc-1', 'asst:s-2:rec-svc-1:ec'],
      ['rec-svc-2', 'asst:s-2:rec-svc-2:ec'],
    ]);
  });

  test('a refused record is shown on the card, and a refusal is never resent unchanged', async ({ page, world }) => {
    ownsSvcRecords(world);
    world.set('orderServiceBatch', (vars) => (vars.recordId === 'rec-svc-2'
      ? null
      : { batchId: 'b-1', ref: 'SB-1', orderCount: 1, total: 1180 }));
    answering(world,
      serviceEvent('s-3', [{ record_id: 'rec-svc-1', title: 'Plot 90B, RAMANAYYAPETA' }, { record_id: 'rec-svc-2', title: 'Plot 91B, RAMANAYYAPETA' }], ['EC']),
      '[DONE]');
    await openAndAsk(page, 'get ECs');
    const cardEl = serviceCard(page);
    await cardEl.getByRole('button', { name: 'Place the order' }).click();
    await expect(cardEl.getByText(/Plot 91B, RAMANAYYAPETA: Not placed. One of these may already be on order/)).toBeVisible();
    await expect(cardEl.getByRole('button', { name: 'Retry failed' })).toHaveCount(0);
    await cardEl.getByRole('button', { name: 'Change and retry' }).click();
    await expect(cardEl.getByRole('alert')).toContainText('Not placed');
    expect(world.calls('orderServiceBatch')).toHaveLength(2);
  });

  test('when nothing could be ordered the card says why, on the card', async ({ page, world }) => {
    ownsSvcRecords(world);
    world.set('orderServiceBatch', null);
    answering(world, serviceEvent('s-4', [{ record_id: 'rec-svc-1', title: 'Plot 90B, RAMANAYYAPETA' }], ['EC']), '[DONE]');
    await openAndAsk(page, 'get an EC');
    const cardEl = serviceCard(page);
    await cardEl.getByRole('button', { name: 'Place the order' }).click();
    await expect(cardEl.getByRole('alert')).toContainText('Not placed. One of these may already be on order');
    await expect(cardEl.getByRole('button', { name: 'Place the order' })).toBeVisible();
  });

  test('a record that is not the reader\'s is never priced or orderable', async ({ page, world }) => {
    ownsSvcRecords(world);
    answering(world, serviceEvent('s-5', [{ record_id: 'p-doesnotexist', title: null }], ['EC']), '[DONE]');
    await openAndAsk(page, 'get an EC');
    const cardEl = serviceCard(page);
    await expect(cardEl.getByText('This is not one of your properties, so nothing can be ordered for it here.')).toBeVisible();
    await expect(cardEl.getByRole('checkbox')).toHaveCount(0);
    await expect(cardEl.getByRole('button', { name: 'Place the order' })).toBeDisabled();
    expect(world.calls('orderServiceBatch')).toHaveLength(0);
  });

  test('a reloaded partial card retries only the failed record, under its own key', async ({ page, world }) => {
    answering(world, '[DONE]');
    ownsSvcRecords(world);
    world.set('orderServiceBatch', { batchId: 'b-2', ref: 'SB-2', orderCount: 1, total: 1180 });
    world.route(/\/assistant\/api\/conversations\?/, () => ({
      json: { conversations: [{ id: 'c-part', title: 'Services', status: 'active', message_count: 2, updated_at: '2026-10-04T10:00:00Z' }] },
    }));
    world.route(/\/assistant\/api\/conversations\/c-part/, () => ({
      json: { id: 'c-part', total_cost_usd: 0.5, messages: [
        { role: 'human', content: 'get ECs' },
        { role: 'ai', content: 'Here is the request.', proposals: [], service_proposals: [{
          type: 'service_proposal', id: 's-part', status: 'partial',
          records: [{ record_id: 'rec-svc-1', title: 'Plot 90B' }, { record_id: 'rec-svc-2', title: 'Plot 91B' }],
          requested: ['EC'], note: null,
          orders: [
            { index: 0, record_id: 'rec-svc-1', service: 'Encumbrance certificate', order_id: 'wr-9', order_ref: 'SR-9', error: null },
            { index: 1, record_id: 'rec-svc-2', service: null, order_id: null, order_ref: null, error: 'Could not reach Pattadar. Retry sends the same request, so nothing is ordered twice.' },
          ],
        }] },
      ] },
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    const cardEl = serviceCard(page);
    await expect(cardEl.getByRole('link', { name: 'SR-9 · Encumbrance certificate' })).toBeVisible();
    await cardEl.getByRole('button', { name: 'Retry failed' }).click();
    await expect(cardEl.getByText(/Ordered · SB-2/)).toBeVisible();
    const batches = world.calls('orderServiceBatch').map((call) => call.vars);
    expect(batches.map((vars) => [vars.recordId, vars.idempotencyKey]), 'the placed record is never placed again')
      .toEqual([['rec-svc-2', 'asst:s-part:rec-svc-2:ec']]);
  });

  test('a reloaded service card shows its stored orders and cannot be placed again', async ({ page, world }) => {
    answering(world, '[DONE]');
    ownsSvcRecords(world);
    world.route(/\/assistant\/api\/conversations\?/, () => ({
      json: { conversations: [{ id: 'c-svc', title: 'Services', status: 'active', message_count: 2, updated_at: '2026-10-04T10:00:00Z' }] },
    }));
    world.route(/\/assistant\/api\/conversations\/c-svc/, () => ({
      json: { id: 'c-svc', total_cost_usd: 0.5, messages: [
        { role: 'human', content: 'get an EC' },
        { role: 'ai', content: 'Here is the request.', proposals: [], service_proposals: [{
          type: 'service_proposal', id: 's-old', status: 'ordered', records: [{ record_id: 'rec-svc-1', title: 'Plot 90B' }],
          requested: ['EC'], note: null,
          orders: [{ index: 0, record_id: 'rec-svc-1', service: 'Encumbrance certificate', order_id: 'wr-9', order_ref: 'SR-9', error: null }],
        }] },
      ] },
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText('Here is the request.')).toBeVisible();
    await expect(serviceCard(page).getByRole('link', { name: 'SR-9 · Encumbrance certificate' })).toBeVisible();
    await expect(serviceCard(page).getByRole('button', { name: 'Place the order' })).toHaveCount(0);
    expect(world.calls('orderServiceBatch')).toHaveLength(0);
  });

  // ── incognito ───────────────────────────────────────────────────────

  test('incognito never shows either card, even if both events arrive', async ({ page, world }) => {
    answering(world, '[DONE]');
    let replies = 0;
    world.route(/\/assistant\/api\/chat\/incognito\/stream/, () => ({
      contentType: 'text/event-stream',
      body: sse(
        proposalEvent(`p-incog-${replies}`, [deed(0), deed(1)], 'managed'),
        serviceEvent(`s-incog-${replies}`, [{ record_id: 'rec-svc-1', title: 'Plot 90B' }], ['EC']),
        { type: 'token', text: `Turn off incognito to request services from the chat (${replies}).` },
        { type: 'usage', cost_usd: replies++ === 0 ? 0.02 : 0.03 },
        '[DONE]',
      ),
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Start an incognito conversation' }).click();
    await page.getByLabel('Message the Pattadar Assistant').fill('get me an EC');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Turn off incognito to request services from the chat (0).')).toBeVisible();
    await expect(saveCard(page)).toHaveCount(0);
    await expect(serviceCard(page)).toHaveCount(0);
    expect(world.calls('servicesOffered')).toHaveLength(0);
    expect(world.calls('orderServiceBatch')).toHaveLength(0);
    expect(world.calls('createCombinedProperty')).toHaveLength(0);
    expect(world.restCalls(/\/assistant\/api\/proposals\//)).toHaveLength(0);
    // D5 in incognito: the sum of its replies in this window — not the last one.
    await expect(page.getByText('This chat $0.02')).toBeVisible();
    await page.getByLabel('Message the Pattadar Assistant').fill('and a patta');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Turn off incognito to request services from the chat (1).')).toBeVisible();
    await expect(page.getByText('This chat $0.05')).toBeVisible();
    await expect(saveCard(page)).toHaveCount(0);
    await expect(serviceCard(page)).toHaveCount(0);
  });

  // ── D4: results after text ──────────────────────────────────────────

  test('while a reply streams its table waits below the text behind a placeholder, then fades in', async ({ page, world }) => {
    answering(world, '[DONE]');
    // A stream the test feeds by hand: the page's fetch for the chat stream
    // gets a body this test pushes into, so "during the stream" is observable.
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      const encoder = new TextEncoder();
      let feed: ReadableStreamDefaultController<Uint8Array> | null = null;
      const pending: string[] = [];
      (window as unknown as { __sse: { push: (s: string) => void; close: () => void } }).__sse = {
        push: (text) => { if (feed) feed.enqueue(encoder.encode(text)); else pending.push(text); },
        close: () => feed?.close(),
      };
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/assistant/api/chat/stream')) return original(input, init);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            feed = controller;
            for (const text of pending.splice(0)) controller.enqueue(encoder.encode(text));
          },
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
      };
    });
    const push = (...events: unknown[]) => page.evaluate((text) => (window as unknown as { __sse: { push: (s: string) => void } }).__sse.push(text), sse(...events));

    await openAndAsk(page, 'properties for ranga subba reddy');
    const placeholder = page.getByRole('status', { name: 'Preparing results' });
    const table = page.getByRole('region', { name: 'Deeds naming “Ranga Subba Reddy”' });
    const followUp = page.getByRole('button', { name: 'Order certified copies of these deeds?' });
    // The view arrives alone, before any text, mid-stream: it must not render
    // (it would sit above the text and be pushed down by it).
    await push(
      { type: 'tool_start', name: 'mcp__pattadar_records__find_properties_by_party', id: 'toolu_party' },
      { type: 'tool_end', name: 'mcp__pattadar_records__find_properties_by_party', content: '{}' },
      recordsView,
    );
    await expect(placeholder).toBeVisible();
    await expect(table, 'no table before the text, mid-stream').toHaveCount(0);
    await push({ type: 'token', text: 'I found one deed naming Ranga Subba Reddy.' });
    const text = page.getByText('I found one deed naming Ranga Subba Reddy.');
    await expect(text).toBeVisible();
    await expect(placeholder).toHaveText('Preparing results…');
    await expect(table, 'no table while the reply streams').toHaveCount(0);
    // The placeholder sits below the text, so nothing pushes the text down.
    // (Polled: the streaming paragraph re-renders as tokens land.)
    const below = async (lower: typeof text) => {
      const upper = await text.boundingBox().catch(() => null);
      const box = await lower.boundingBox().catch(() => null);
      return upper && box ? box.y > upper.y : null;
    };
    await expect.poll(() => below(placeholder)).toBe(true);

    // Usage (follow-ups and cost) arrives while the stream is still open:
    // neither shows until the reply ends, with the results.
    await push({ type: 'usage', cost_usd: 0.031, follow_ups: [{ label: 'Order certified copies of these deeds?', prompt: 'Order certified copies of the deeds saved in this conversation.' }] });
    await expect(placeholder).toBeVisible();
    await expect(followUp, 'no follow-ups mid-stream').toHaveCount(0);
    // The reply's own cost line (the footer's running "This chat" total is
    // not part of the reply).
    const replyCost = page.getByText(/\$0\.03/).filter({ hasNotText: 'This chat' });
    await expect(replyCost, 'no cost line mid-stream').toHaveCount(0);
    await push('[DONE]');
    await page.evaluate(() => (window as unknown as { __sse: { close: () => void } }).__sse.close());

    await expect(table).toBeVisible();
    await expect(placeholder).toHaveCount(0);
    await expect.poll(() => below(table), { message: 'the results land below the text' }).toBe(true);
    // Follow-ups (chat-level, from the usage event) and the cost line arrive with it.
    await expect(followUp).toBeVisible();
    await expect(replyCost.first()).toBeVisible();
  });

  test('a reply with results and no text shows them as soon as the stream ends', async ({ page, world }) => {
    answering(world,
      { type: 'tool_start', name: 'mcp__pattadar_records__find_properties_by_party', id: 'toolu_party' },
      { type: 'tool_end', name: 'mcp__pattadar_records__find_properties_by_party', content: '{}' },
      recordsView,
      { type: 'usage', cost_usd: 0.012 },
      '[DONE]');
    await openAndAsk(page, 'properties for ranga subba reddy');
    await expect(page.getByRole('region', { name: 'Deeds naming “Ranga Subba Reddy”' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Preparing results' })).toHaveCount(0);
  });

  // ── D5: per-chat cost ───────────────────────────────────────────────

  test('the footer shows what this chat has cost, from the service total', async ({ page, world }) => {
    answering(world, { type: 'token', text: 'Done.' }, { type: 'usage', cost_usd: 0.02 }, '[DONE]');
    await openAndAsk(page, 'hello');
    await expect(page.getByText('Done.')).toBeVisible();
    await expect(page.getByText('This chat $1.23')).toBeVisible();
    // Re-read after the reply, totals only.
    await expect.poll(() => world.restCalls(/\/assistant\/api\/conversations\/w-conv-hs\?include_messages=false/).length).toBeGreaterThan(0);
    // A second reply: the service's new total replaces the first one.
    chatTotal = 2.5;
    await page.getByLabel('Message the Pattadar Assistant').fill('and again');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('This chat $2.50')).toBeVisible();
    await expect(page.getByText('This chat $1.23')).toHaveCount(0);
  });
});
