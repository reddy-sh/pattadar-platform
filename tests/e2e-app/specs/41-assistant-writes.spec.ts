/**
 * The assistant's write path (docs/specs/2026-10-04-assistant-write-actions.md):
 * the "Add to your properties" card a `proposal` event draws, and the
 * zero-model refine panel under a party search.
 *
 * Sealed like every spec here. The model never writes: the only saveRecord in
 * these tests is the one Save's click sends, through gql() with an
 * x-idempotency-key, and every answer comes from the world below.
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
  title: index === 0 ? 'Plot 96A, RAMANAYYAPETA' : `Plot 9${index}B, RAMANAYYAPETA`,
  village: 'RAMANAYYAPETA',
  mandal: null,
  district: null,
  survey_no: '41/6',
  extent: 133.33,
  extent_unit: 'sq.yd',
  doc_no: `688${index}/2000`,
  sro: 'KAKINADA(R.O)',
  reg_date: '2000-10-16',
  consideration: 47000,
  market_value: 46666,
  boundary_north: '33FT WIDE ROAD',
  boundary_south: 'SITE OF NEMANI SRILAKSHMI',
  boundary_east: '<b>SITE OF KORIPELLA</b>',
  boundary_west: '40FT WIDE ROAD',
  seller_name: 'GUNTAMUKKULA SATYA NARAYANA',
  buyer_name: 'BOBBA USHARANI',
  source_ref: `pr:AP04041320000000688${index}:1`,
  buyer_matches_user: null,
  record_id: null,
  error: null,
  ...over,
});

const proposalEvent = (id: string, items: unknown[], stake: string | null = null) => ({
  type: 'proposal', id, status: 'draft', stake, items,
});

const facetsView = {
  type: 'records',
  id: 'toolu_party',
  kind: 'table',
  title: 'Deeds naming “Usharani Bobba”',
  columns: [
    { key: 'matched_name', label: 'Name in deed' },
    { key: 'score', label: 'Name match' },
    { key: 'side', label: 'Side' },
    { key: 'location', label: 'Location' },
  ],
  rows: [
    { matched_name: 'BOBBA USHARANI', score: 1, side: 'claimant', location: 'Plot 6, VINUKONDA', rid: 'AP07', s_no: 1 },
    { matched_name: 'BOBBA USHA RANI', score: 0.92, side: 'claimant', location: 'Plot 2, KATRAGUNTA', rid: 'AP08', s_no: 1 },
  ],
  total: 2,
  note: null,
  facets: {
    villages: [{ name: 'VINUKONDA', count: 4 }, { name: 'KATRAGUNTA', count: 3 }],
    sros: [{ name: 'NARASARAOPET (R.O)', count: 2 }, { name: 'VINUKONDA', count: 2 }],
    confidence: { exact: 4, high: 2, medium: 1, low: 0 },
  },
  query: { name: 'Usharani Bobba', villages: [], sro: null, min_similarity: 0.6, side: null },
};

function answering(world: World, ...events: unknown[]) {
  world.route(/\/assistant\/api\/capabilities/, () => ({
    json: { public_records: { ready: true, status: 'ready', tool_count: 8, semantic_search_ready: false, coverage: '1975–2029' } },
  }));
  world.route(/\/assistant\/api\/conversations/, () => ({ json: { id: 'w-conv-writes', conversations: [] } }));
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
}

/** Every idempotency key a saveRecord POST carried, in order. */
function keysSent(page: Page): string[] {
  const keys: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/graphql') || !(request.postData() ?? '').includes('saveRecord')) return;
    keys.push(request.headers()['x-idempotency-key'] ?? '(none)');
  });
  return keys;
}

async function openAndAsk(page: Page, question: string) {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByLabel('Message the Pattadar Assistant').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
}

const card = (page: Page) => page.getByRole('region', { name: 'Add to your properties' });

test.describe('assistant write actions', () => {
  // /home's home asks for `auditTrail`, unseeded (see 40-assistant-records).
  test.use({ allowConsole: true });

  test('Save is disabled until a stake is chosen, then sends one keyed saveRecord with the deed facts', async ({ page, world }) => {
    const keys = keysSent(page);
    world.set('saveRecord', 'rec-new-1');
    answering(world,
      proposalEvent('p-one', [deed(0)]),
      { type: 'token', text: 'A confirmation card is shown. Nothing is saved until you click Save.' },
      '[DONE]');
    await openAndAsk(page, 'add the 100% deed to my properties');

    const offer = card(page);
    await expect(offer).toBeVisible();
    await expect(offer.getByText('from deed 6880/2000')).toBeVisible();
    // Deed text is text, never markup.
    await expect(offer.getByText(/<b>SITE OF KORIPELLA<\/b>/)).toBeVisible();
    await expect(offer.getByText('Seller → Buyer · GUNTAMUKKULA SATYA NARAYANA → BOBBA USHARANI')).toBeVisible();
    const save = offer.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await expect(offer.getByText('Choose Owned, Managed or Watching to save.')).toBeVisible();
    // The buyer is the signed-in person by name, so no soft warning.
    await offer.getByRole('button', { name: 'Owned', exact: true }).click();
    await expect(offer.getByText(/not you\?/)).toHaveCount(0);
    expect(world.calls('saveRecord'), 'nothing is written before the click').toHaveLength(0);

    await save.click();
    await expect(offer.getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' })).toBeVisible();
    await expect(offer.getByText('Saved as Owned ·')).toBeVisible();
    await expect(offer.getByRole('link', { name: 'View in Properties' })).toBeVisible();

    expect(world.calls('saveRecord')).toHaveLength(1);
    const input = world.lastVars('saveRecord').input as Record<string, unknown>;
    expect(input).toMatchObject({
      kind: 'property', stake: 'owned', origin: 'assistant', sourceRef: 'pr:AP040413200000006880:1',
      surveyNo: '41/6', docNo: '6880/2000', sro: 'KAKINADA(R.O)', regDate: '2000-10-16',
      boundaryEast: '<b>SITE OF KORIPELLA</b>', sellerName: 'GUNTAMUKKULA SATYA NARAYANA', buyerName: 'BOBBA USHARANI',
      extent: 133.33, extentUnit: 'sq.yd', purchasePrice: 47000, village: 'RAMANAYYAPETA',
    });
    expect(keys).toEqual(['asst:p-one:0:owned']);

    const puts = world.restCalls(/\/assistant\/api\/proposals\/p-one/);
    expect(puts).toHaveLength(1);
    expect(puts[0].method).toBe('PUT');
    expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ status: 'saved', results: [{ index: 0, record_id: 'rec-new-1', error: null, stake: 'owned' }] });

    await offer.getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' }).click();
    await expect(page).toHaveURL(/\/properties\/rec-new-1$/);
  });

  test('a buyer who is not the signed-in person gets a soft warning, never a block', async ({ page, world }) => {
    world.set('saveRecord', 'rec-new-w');
    answering(world, proposalEvent('p-warn', [deed(0, { buyer_name: 'KORIPELLA MURALI' })]), '[DONE]');
    await openAndAsk(page, 'add it');
    const offer = card(page);
    await offer.getByRole('button', { name: 'Owned', exact: true }).click();
    await expect(offer.getByText('Owner in deed is “KORIPELLA MURALI” — not you? Choose “Watching” or “Managed”.')).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await offer.getByRole('button', { name: 'Watching', exact: true }).click();
    await expect(offer.getByText(/not you\?/)).toHaveCount(0);
  });

  test('Watching copies the property facts only — no party names, no price', async ({ page, world }) => {
    world.set('saveRecord', 'rec-watch-1');
    answering(world, proposalEvent('p-watch', [deed(0)], 'watch'), '[DONE]');
    await openAndAsk(page, 'watch this deed');
    const offer = card(page);
    // The event named the stake, so it is preselected.
    await expect(offer.getByRole('button', { name: 'Watching', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(offer.getByText('Watching keeps the property facts only; the parties’ names are not copied.')).toBeVisible();
    await expect(offer.getByText(/Seller → Buyer/)).toHaveCount(0);
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByText('Saved as Watching ·')).toBeVisible();

    const input = world.lastVars('saveRecord').input as Record<string, unknown>;
    expect(input.stake).toBe('watch');
    expect(input.sourceRef).toBe('pr:AP040413200000006880:1');
    for (const key of ['sellerName', 'buyerName', 'ownerName', 'purchasePrice']) {
      expect(input, `${key} must not leave the browser for a watched record`).not.toHaveProperty(key);
    }
    expect(JSON.stringify(input)).not.toContain('BOBBA');
    expect(JSON.stringify(input)).not.toContain('GUNTAMUKKULA');
  });

  test('a double click sends one request', async ({ page, world }) => {
    const keys = keysSent(page);
    world.set('saveRecord', World.slow(900, 'rec-once'));
    answering(world, proposalEvent('p-dbl', [deed(0)], 'owned'), '[DONE]');
    await openAndAsk(page, 'add it');
    const offer = card(page);
    await offer.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await expect(offer.getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' })).toBeVisible();
    expect(world.calls('saveRecord')).toHaveLength(1);
    expect(keys).toEqual(['asst:p-dbl:0:owned']);
  });

  test('a partial failure is shown per row, and Retry reuses the same keys', async ({ page, world }) => {
    const keys = keysSent(page);
    // The second deed is refused once. (A function answer that escalates to a
    // special answer replaces itself in World, so the retry's answer is set
    // explicitly below rather than counted here.)
    world.set('saveRecord', (vars) => (
      String((vars.input as Record<string, unknown>).sourceRef).endsWith('6881:1')
        ? World.gqlError('The village is not in your districts.')
        : 'rec-a'
    ));
    answering(world, proposalEvent('p-two', [deed(0), deed(1)]), '[DONE]');
    await openAndAsk(page, 'add both');
    const offer = card(page);
    await expect(offer.getByText('2 deeds')).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await offer.getByRole('button', { name: 'Owned', exact: true }).click();
    await offer.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(offer.getByText('1 of 2 saved', { exact: true })).toBeVisible();
    await expect(offer.getByText('Plot 91B, RAMANAYYAPETA: The village is not in your districts.')).toBeVisible();
    await expect(offer.getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' })).toBeVisible();
    expect(keys).toEqual(['asst:p-two:0:owned', 'asst:p-two:1:owned']);

    world.set('saveRecord', 'rec-b');
    await offer.getByRole('button', { name: 'Retry failed' }).click();
    await expect(offer.getByText('2 of 2 saved', { exact: true })).toBeVisible();
    // Only the failed row is sent again, under the key it had the first time.
    expect(keys).toEqual(['asst:p-two:0:owned', 'asst:p-two:1:owned', 'asst:p-two:1:owned']);
    await expect(offer.getByRole('button', { name: 'Group these as one holding?' })).toBeVisible();

    const statuses = world.restCalls(/\/assistant\/api\/proposals\/p-two/).map((call) => JSON.parse(call.body ?? '{}').status);
    expect(statuses).toEqual(['partial', 'saved']);
  });

  test('Not now writes nothing and can be undone', async ({ page, world }) => {
    answering(world, proposalEvent('p-no', [deed(0)]), '[DONE]');
    await openAndAsk(page, 'add it');
    const offer = card(page);
    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer.getByText('Not added. Nothing was saved.', { exact: true }).last()).toBeVisible();
    expect(world.calls('saveRecord')).toHaveLength(0);
    expect(JSON.parse(world.restCalls(/\/assistant\/api\/proposals\/p-no/)[0].body ?? '{}').status).toBe('dismissed');
    await offer.getByRole('button', { name: 'Undo' }).click();
    await expect(offer.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('Undo after Not now can still save, and the stored outcome says saved', async ({ page, world }) => {
    world.set('saveRecord', 'rec-undo');
    answering(world, proposalEvent('p-undo', [deed(0)]), '[DONE]');
    await openAndAsk(page, 'add it');
    const offer = card(page);
    await offer.getByRole('button', { name: 'Not now' }).click();
    await offer.getByRole('button', { name: 'Undo' }).click();
    await offer.getByRole('button', { name: 'Owned', exact: true }).click();
    await offer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(offer.getByText('Saved as Owned ·')).toBeVisible();
    // The outcome is announced, and focus lands on the card rather than the page.
    await expect(offer.getByRole('status')).toHaveText('Saved Plot 96A, RAMANAYYAPETA.');
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('section')?.getAttribute('aria-label'))).toBe('Add to your properties');
    const statuses = world.restCalls(/\/assistant\/api\/proposals\/p-undo/).map((call) => JSON.parse(call.body ?? '{}').status);
    expect(statuses).toEqual(['dismissed', 'saved']);
  });

  test('a reloaded chat rebuilds each card from its stored outcome', async ({ page, world }) => {
    answering(world, '[DONE]');
    world.route(/\/assistant\/api\/conversations\?/, () => ({
      json: { conversations: [{ id: 'c-cards', title: 'Cards', status: 'active', message_count: 2, updated_at: '2026-10-04T10:00:00Z' }] },
    }));
    world.route(/\/assistant\/api\/conversations\/c-cards/, () => ({
      json: { id: 'c-cards', messages: [
        { role: 'human', content: 'add my deeds' },
        { role: 'ai', content: 'Here are the cards.', proposals: [
          { type: 'proposal', id: 'p-saved', status: 'saved', stake: null, items: [deed(0, { record_id: 'rec-s' })] },
          { type: 'proposal', id: 'p-gone', status: 'dismissed', stake: null, items: [deed(0)] },
          { type: 'proposal', id: 'p-half', status: 'partial', stake: null, items: [
            deed(0, { record_id: 'rec-h' }), deed(1, { error: 'The village is not in your districts.' })] },
        ] },
      ] },
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText('Here are the cards.')).toBeVisible();
    const cards = card(page);
    await expect(cards).toHaveCount(3);
    // Saved: an Open link, and no Save to press a second time.
    await expect(cards.nth(0).getByRole('link', { name: 'Open Plot 96A, RAMANAYYAPETA' })).toBeVisible();
    await expect(cards.nth(0).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    // Dismissed in an earlier visit: final, no Undo.
    await expect(cards.nth(1).getByText('Not added. Nothing was saved.')).toBeVisible();
    await expect(cards.nth(1).getByRole('button', { name: 'Undo' })).toHaveCount(0);
    // Partial: the saved row stays saved; only the failed one can be retried, after a stake is chosen.
    await expect(cards.nth(2).getByText('1 of 2 saved', { exact: true })).toBeVisible();
    await expect(cards.nth(2).getByText('Plot 91B, RAMANAYYAPETA: The village is not in your districts.')).toBeVisible();
    await expect(cards.nth(2).getByRole('button', { name: 'Retry failed' })).toBeDisabled();
    expect(world.calls('saveRecord')).toHaveLength(0);
  });

  test('incognito never shows the card, even if a proposal event arrives', async ({ page, world }) => {
    answering(world, '[DONE]');
    world.route(/\/assistant\/api\/chat\/incognito\/stream/, () => ({
      contentType: 'text/event-stream',
      body: sse(
        proposalEvent('p-incog', [deed(0)], 'owned'),
        { type: 'token', text: 'Turn off incognito to save records to your account.' },
        { type: 'usage', cost_usd: 0.01 },
        '[DONE]',
      ),
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Start an incognito conversation' }).click();
    await page.getByLabel('Message the Pattadar Assistant').fill('add the 100% deeds to my properties');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Turn off incognito to save records to your account.')).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    expect(world.calls('saveRecord')).toHaveLength(0);
    expect(world.restCalls(/\/assistant\/api\/proposals\//)).toHaveLength(0);
  });

  test('the refine panel posts the chosen places, confidence and side, and appends results with no model call', async ({ page, world }) => {
    answering(world,
      { type: 'tool_start', name: 'mcp__pattadar_records__find_properties_by_party', id: 'toolu_party' },
      { type: 'tool_end', name: 'mcp__pattadar_records__find_properties_by_party', content: '{}' },
      facetsView,
      { type: 'token', text: 'I found 2 deeds naming Usharani Bobba.' },
      '[DONE]');
    world.route(/\/assistant\/api\/records\/party-search/, () => ({
      json: {
        text: 'Refined: 1 deed in KATRAGUNTA at ≥90% confidence.',
        view: {
          ...facetsView,
          id: 'refine-1',
          rows: [facetsView.rows[1]],
          total: 1,
          facets: { villages: [{ name: 'KATRAGUNTA', count: 1 }], sros: [], confidence: { exact: 0, high: 1, medium: 0, low: 0 } },
          query: { name: 'Usharani Bobba', villages: ['KATRAGUNTA'], sro: null, min_similarity: 0.9, side: 'claimant' },
        },
      },
    }));
    await openAndAsk(page, 'properties for usharani bobba');
    await expect(page.getByText('I found 2 deeds naming Usharani Bobba.')).toBeVisible();

    const panel = page.getByRole('region', { name: 'Refine Deeds naming “Usharani Bobba”' }).first();
    await expect(panel.getByRole('group', { name: 'Villages' })).toBeVisible();
    await panel.getByRole('checkbox', { name: /KATRAGUNTA/ }).check();
    await panel.getByRole('radio', { name: /≥ 90%/ }).check();
    await panel.getByRole('button', { name: 'Buyer', exact: true }).click();
    await panel.getByRole('button', { name: 'Refine results' }).click();

    await expect(page.getByText('Refined: 1 deed in KATRAGUNTA at ≥90% confidence.')).toBeVisible();
    await expect(page.getByText('Refine “Usharani Bobba” in KATRAGUNTA with a name match of ≥90% as buyer.')).toBeVisible();

    const posts = world.restCalls(/\/assistant\/api\/records\/party-search/);
    expect(posts).toHaveLength(1);
    expect(posts[0].method).toBe('POST');
    expect(JSON.parse(posts[0].body ?? '{}')).toMatchObject({
      name: 'Usharani Bobba', villages: ['KATRAGUNTA'], min_similarity: 0.9, side: 'claimant',
    });
    // The question was streamed once; the refinement asked no model.
    expect(world.restCalls(/\/assistant\/api\/chat\//)).toHaveLength(1);
    // The refined reply carries its own panel, so refinements chain — and the
    // older one folds, leaving one open filter form.
    const panels = page.getByRole('region', { name: 'Refine Deeds naming “Usharani Bobba”' });
    await expect(panels).toHaveCount(2);
    await expect(panels.nth(0).getByRole('button', { name: /Narrow by place/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(panels.nth(1).getByRole('button', { name: /Narrow by place/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
