/**
 * The assistant's record results, drawn by the app instead of retyped by the
 * model (services/assistant/src/domain/record_views.py → AssistantPanel.tsx).
 *
 * Sealed like every spec here: the conversation, capability and stream routes
 * are answered from inside the test, so no model is called and no row is read.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';

const sse = (...events: unknown[]) =>
  events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');

const partyView = {
  type: 'records',
  id: 'toolu_party',
  kind: 'table',
  title: 'Deeds naming “Sankara Reddy Telukutla”',
  columns: [
    { key: 'matched_name', label: 'Name in deed' },
    { key: 'score', label: 'Name match' },
    { key: 'side', label: 'Side' },
    { key: 'village', label: 'Village' },
    { key: 'survey_no', label: 'Survey number' },
    { key: 'reg_date', label: 'Registered' },
    { key: 'extent', label: 'Extent' },
  ],
  rows: Array.from({ length: 12 }, (_, i) => ({
    matched_name: i === 0 ? 'SANKARA REDDY TELUKUTLA' : `TELUKUTLA RAVI SANKARA REDDY ${i}`,
    score: i === 0 ? 1 : i < 6 ? 0.86 : 0.62,
    side: i % 2 ? 'executant' : 'claimant',
    village: i === 0 ? 'KATRAGUNTA' : 'TRIPURANTHAKAM',
    survey_no: i === 0 ? '120-2' : `258/${i}`,
    reg_date: '2019-10-10',
    extent: i === 0 ? '<b>2.8</b>' : '124.94 sq_yards',
  })),
  total: 87,
  note: null,
};

function answering(world: World, ...events: unknown[]) {
  world.route(/\/assistant\/api\/capabilities/, () => ({
    json: { public_records: { ready: true, status: 'ready', tool_count: 8, semantic_search_ready: false, coverage: '1975–2029' } },
  }));
  world.route(/\/assistant\/api\/conversations/, () => ({ json: { id: 'w-conv-records', conversations: [] } }));
  world.route(/\/assistant\/api\/usage/, () => ({
    json: { today_usd: 0.2677, month_usd: 1.5, requests_today: 5, credit_status: 'ok', balance_usd: null },
  }));
  world.route(/\/assistant\/api\/models/, () => ({
    json: { default: 'claude-sonnet-4-6', models: [
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', tier: 'Fast', input_per_mtok: 1, output_per_mtok: 5, default: false },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'Balanced', input_per_mtok: 3, output_per_mtok: 15, default: true },
    ] },
  }));
  world.route(/\/assistant\/api\/chat\/stream/, () => ({ contentType: 'text/event-stream', body: sse(...events) }));
}

async function openAndAsk(page: Page, question: string) {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByLabel('Message the Pattadar Assistant').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe('assistant record results', () => {
  // /home's home asks for `auditTrail`, which fixtures/seed.ts does not answer yet
  // (a 400 from the seal on 2026-10-04, unrelated to the assistant). Nothing
  // asserted here depends on it.
  test.use({ allowConsole: true });

  test('a party search arrives as a table with a confidence column, not retyped text', async ({ page, world }) => {
    answering(
      world,
      { type: 'tool_start', name: 'mcp__pattadar_records__find_properties_by_party', id: 'toolu_party' },
      { type: 'tool_end', name: 'mcp__pattadar_records__find_properties_by_party', content: '{}' },
      partyView,
      { type: 'token', text: 'I found 87 deeds; the closest is in Katragunta, Sy 120-2.' },
      '[DONE]',
    );
    await openAndAsk(page, 'properties for sankara reddy telukutla');

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(page.getByText('Deeds naming “Sankara Reddy Telukutla”')).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Name match' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '100% · High' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '86% · Medium' }).first()).toBeVisible();
    await expect(table.getByRole('cell', { name: '62% · Low' }).first()).toBeVisible();
    // claimant/executant read as the words people use.
    await expect(table.getByRole('cell', { name: 'Buyer' }).first()).toBeVisible();
    await expect(table.getByRole('cell', { name: 'Seller' }).first()).toBeVisible();
    // A deed value is text, never markup.
    await expect(table.getByRole('cell', { name: '<b>2.8</b>' })).toBeVisible();
    await expect(page.getByText('12 of 87')).toBeVisible();
    // Any answer drawn from public records carries the coverage and the disclaimer.
    await expect(page.getByText('Public records ready (1975–2029) · reference only')).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Public records 1975–2029.');
    await expect(page.getByRole('note')).toContainText('may contain errors and may not be accurate');
    await expect(page.getByRole('note')).toContainText('Pattadar is not responsible');

    // Ten rows first, the rest on request.
    await expect(table.locator('tbody tr')).toHaveCount(10);
    await page.getByRole('button', { name: 'Show all 12' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(12);
  });

  test('a generated report renders its markdown tables as tables', async ({ page, world }) => {
    answering(
      world,
      {
        type: 'records', id: 'toolu_report', kind: 'report', title: 'Report',
        markdown: '# PATTADAR PARTY REPORT\n\n| Metric | Value |\n|---|---|\n| Deed rows | 87 |\n\n> Historical reference only.',
      },
      { type: 'token', text: 'Your report is ready below.' },
      '[DONE]',
    );
    await openAndAsk(page, 'portfolio report for sankara reddy telukutla');
    await expect(page.getByText('PATTADAR PARTY REPORT')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Deed rows' })).toBeVisible();
    await expect(page.getByText('|---|')).toHaveCount(0);
  });

  test('the panel goes full screen and back, and its left edge drags wider', async ({ page, world }) => {
    answering(world, '[DONE]');
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    const paper = page.locator('.MuiDrawer-paper');
    await expect(paper).toBeVisible();
    const before = (await paper.boundingBox())!.width;
    expect(Math.round(before)).toBe(520);
    // The docked panel's open edge is rounded; full screen is square.
    await expect(paper).toHaveCSS('border-top-left-radius', '20px');

    await page.getByRole('button', { name: 'Expand assistant to full screen' }).click();
    await expect.poll(async () => Math.round((await paper.boundingBox())!.width)).toBe(1400);
    await expect(paper).toHaveCSS('border-top-left-radius', '0px');
    await page.getByRole('button', { name: 'Restore assistant size' }).click();
    await expect.poll(async () => Math.round((await paper.boundingBox())!.width)).toBe(520);

    const handle = page.getByRole('separator', { name: 'Resize assistant panel' });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(600, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await paper.boundingBox())!.width)).toBe(800);

    // The width is remembered for the next time the panel opens.
    await page.getByRole('button', { name: 'Close assistant' }).click();
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect.poll(async () => Math.round((await paper.boundingBox())!.width)).toBe(800);
  });

  test('New conversation stays new while the panel keeps polling', async ({ page, world }) => {
    // AssistantPanel's 3 s readiness poll used to re-open the newest saved
    // chat whenever none was active, which undid New conversation at once.
    answering(world, '[DONE]');
    world.route(/\/assistant\/api\/conversations\?/, () => ({
      json: { conversations: [{ id: 'c-old', title: 'Old search', status: 'active', message_count: 2, updated_at: '2026-10-04T10:00:00Z' }] },
    }));
    world.route(/\/assistant\/api\/conversations\/c-old/, () => ({
      json: { id: 'c-old', messages: [
        { role: 'human', content: 'properties for sankara reddy telukutla' },
        { role: 'ai', content: 'Here are the earlier results.' },
      ] },
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText('Here are the earlier results.')).toBeVisible();

    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Hello! I'm your Pattadar Assistant.")).toBeVisible();
    // Two poll ticks later it is still the fresh conversation.
    await page.waitForTimeout(6_500);
    await expect(page.getByText('Here are the earlier results.')).toHaveCount(0);
    await expect(page.getByText("Hello! I'm your Pattadar Assistant.")).toBeVisible();
  });

  test('each reply shows its cost, and spend and credit stay visible at the bottom', async ({ page, world }) => {
    answering(
      world,
      { type: 'token', text: 'Done.' },
      { type: 'usage', cost_usd: 0.0421, cache_read_tokens: 13088, cache_write_tokens: 5491, output_tokens: 425 },
      '[DONE]',
    );
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    await expect(page.getByText('$0.04 · 13.1k cached · 5.5k cache write · 425 out')).toBeVisible();
    const footer = page.getByLabel('Assistant spend', { exact: true });
    await expect(footer).toContainText('Today $0.27');
    await expect(footer).toContainText('This month $1.50');
    await expect(footer.getByRole('button', { name: 'Set the credit balance' })).toBeVisible();

    // The spend refreshes after the request and again on a click; both are local reads.
    const before = world.restCalls(/\/assistant\/api\/usage/).length;
    expect(before, 'fetched on open and after the reply').toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Refresh assistant spend' }).click();
    await expect.poll(() => world.restCalls(/\/assistant\/api\/usage/).length).toBe(before + 1);
  });

  test('an empty credit balance is said plainly, in the reply and the footer', async ({ page, world }) => {
    answering(world, {
      type: 'error', code: 'credit_exhausted',
      text: "The assistant's Anthropic API credits have run out, so it cannot answer right now. Add credits at console.anthropic.com → Billing, then ask again.",
    }, '[DONE]');
    // After the refusal the service reports the last run as credit-exhausted.
    world.route(/\/assistant\/api\/usage/, () => ({
      json: { today_usd: 0.2677, month_usd: 1.5, requests_today: 5, credit_status: 'exhausted', balance_usd: null },
    }));
    await openAndAsk(page, 'properties for usharani bobba');
    await expect(page.getByText(/API credits have run out/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Estimated credit balance — update' }).or(page.getByRole('button', { name: 'Set the credit balance' }))).toHaveText('Credits ran out — top up');
  });

  test('follow-up questions under a result ask themselves when tapped', async ({ page, world }) => {
    answering(world, { ...partyView, follow_ups: [
      { label: 'Report on the 2 exact name matches?', prompt: 'Generate a party report for Sankara Reddy Telukutla using only the deeds where the name matches exactly.' },
    ] }, { type: 'token', text: 'Found them.' }, '[DONE]');
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    await page.getByRole('button', { name: 'Report on the 2 exact name matches?' }).click();
    await expect(page.getByText('Generate a party report for Sankara Reddy Telukutla using only the deeds where the name matches exactly.')).toBeVisible();
    const asked = world.restCalls(/chat\/stream/).map((call) => JSON.stringify(call));
    expect(asked.some((call) => call.includes('the name matches exactly'))).toBe(true);
  });

  test('an incognito chat goes to the no-storage endpoint and creates no conversation', async ({ page, world }) => {
    answering(world, '[DONE]');
    world.route(/\/assistant\/api\/chat\/incognito\/stream/, () => ({
      contentType: 'text/event-stream',
      body: sse({ type: 'token', text: 'Nothing about this is saved.' }, { type: 'usage', cost_usd: 0.012 }, '[DONE]'),
    }));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Start an incognito conversation' }).click();
    await expect(page.getByText(/Incognito: this conversation is not saved/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attach files' })).toBeDisabled();
    await page.getByLabel('Message the Pattadar Assistant').fill('properties for usharani bobba');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Nothing about this is saved.')).toBeVisible();
    await expect(page.getByLabel('Assistant spend', { exact: true })).toContainText('+$0.01 incognito');
    const posts = world.restCalls(/\/assistant\/api\/(conversations|chat\/stream|attachments)/)
      .filter((call) => JSON.stringify(call).includes('POST'));
    expect(posts, 'incognito must not create a conversation or use the stored chat route').toEqual([]);

    // Leaving incognito erases the chat from the screen.
    await page.getByRole('button', { name: 'Leave incognito conversation' }).click();
    await expect(page.getByText('Nothing about this is saved.')).toHaveCount(0);
  });

  test('a record table downloads as a PDF, Excel or CSV without asking the model', async ({ page, world }) => {
    answering(world, partyView, { type: 'token', text: 'Found them.' }, '[DONE]');
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    await expect(page.getByText('Found them.')).toBeVisible();
    const streamsBefore = world.restCalls(/chat\/stream/).length;
    for (const [format, extension] of [['PDF', '.pdf'], ['Excel (.xlsx)', '.xlsx'], ['CSV', '.csv']]) {
      await page.getByRole('button', { name: 'Download Deeds naming “Sankara Reddy Telukutla”' }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('menuitem', { name: format }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^pattadar-deeds-naming-sankara-reddy-telukutla-\\d{4}-\\d{2}-\\d{2}\\${extension}$`));
    }
    expect(world.restCalls(/chat\/stream/).length, 'exporting is local; no model call').toBe(streamsBefore);
  });

  test('a cheaper model can be picked, and the reply says which model answered', async ({ page, world }) => {
    answering(world, { type: 'token', text: 'Done.' },
      { type: 'usage', model: 'claude-haiku-4-5', cost_usd: 0.0243, output_tokens: 300 }, '[DONE]');
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    const picker = page.getByLabel('Assistant model');
    await expect(picker).toHaveValue('claude-sonnet-4-6');
    await picker.selectOption('claude-haiku-4-5');
    await page.getByLabel('Message the Pattadar Assistant').fill('properties for sankara reddy telukutla');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Haiku 4.5 · $0.02 · 300 out')).toBeVisible();
    const sent = world.restCalls(/chat\/stream/).map((call) => JSON.stringify(call));
    expect(sent.some((call) => call.includes('claude-haiku-4-5'))).toBe(true);
  });

  test('the credit balance is entered once and then shown as an estimate', async ({ page, world }) => {
    answering(world, '[DONE]');
    let saved = 0;
    world.route(/\/assistant\/api\/usage\/credit/, () => { saved += 1; return { json: { balance_usd: 18.4 } }; });
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Set the credit balance' }).click();
    await page.getByLabel('Credit balance in US dollars').fill('18.40');
    world.route(/\/assistant\/api\/usage$/, () => ({
      json: { today_usd: 0.27, month_usd: 1.5, requests_today: 5, credit_status: 'ok', balance_usd: 18.13, balance_set_at: '2026-10-04T18:00:00Z' },
    }));
    await page.getByRole('button', { name: 'Save balance' }).click();
    await expect.poll(() => saved).toBe(1);
    await expect(page.getByRole('button', { name: 'Estimated credit balance — update' })).toHaveText('≈ $18.13 credit left');
  });

  test('a reply that is still thinking shows one spinner, not two', async ({ page, world }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    answering(world, '[DONE]');
    await page.route(/\/assistant\/api\/chat\/stream/, async (route) => {
      await held;
      await route.fulfill({ contentType: 'text/event-stream', body: sse({ type: 'token', text: 'Done.' }, '[DONE]') });
    });
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    // Before anything streams there is exactly one progress indicator in the
    // drawer: the reply's pending dots. No spinner sits beside it.
    await expect(page.getByRole('status', { name: 'Assistant is preparing a reply' })).toHaveCount(1);
    await expect(page.locator('.MuiDrawer-paper .MuiCircularProgress-root')).toHaveCount(0);
    release();
    await expect(page.getByText('Done.')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Assistant is preparing a reply' })).toHaveCount(0);
  });

  test('a reply can be stopped while it is coming, and the composer is ready again', async ({ page, world }) => {
    answering(world, '[DONE]');
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let settle: () => void = () => {};
    const lateAnswerTried = new Promise<void>((resolve) => { settle = resolve; });
    await page.route(/\/assistant\/api\/chat\/stream/, async (route) => {
      await held;
      await route.fulfill({ contentType: 'text/event-stream', body: sse({ type: 'token', text: 'Too late.' }, '[DONE]') })
        .catch(() => undefined);
      settle();
    });
    let aborted = 0;
    page.on('requestfailed', (request) => {
      if (/\/chat\/stream/.test(request.url())) aborted += 1;
    });
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    // While the reply is pending, Send has become Stop.
    await expect(page.getByRole('button', { name: 'Send message' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop generating' }).click();
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    // Stopping is not an error: no interrupted step, no error text.
    await expect(page.getByText('Request interrupted')).toHaveCount(0);
    await expect(page.getByText('The assistant could not answer.')).toHaveCount(0);
    // The abort reached the network, not just the UI.
    await expect.poll(() => aborted).toBe(1);
    await expect(page.getByRole('status').filter({ hasText: 'Reply stopped.' })).toHaveCount(1);
    release();
    // Only once the late answer has actually been attempted is its absence meaningful.
    await lateAnswerTried;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText('Too late.')).toHaveCount(0);
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  });

  test('Regenerate asks the same question again and replaces the last reply', async ({ page, world }) => {
    answering(world, { type: 'token', text: 'First answer.' }, '[DONE]');
    await openAndAsk(page, 'price rates in katragunta');
    await expect(page.getByText('First answer.')).toBeVisible();
    world.route(/\/assistant\/api\/chat\/stream/, () => ({
      contentType: 'text/event-stream', body: sse({ type: 'token', text: 'Second answer.' }, '[DONE]'),
    }));
    await page.getByRole('button', { name: 'Regenerate reply' }).click();
    await expect(page.getByText('Second answer.')).toBeVisible();
    await expect(page.getByText('First answer.')).toHaveCount(0);
    // The question is not duplicated, and it was sent twice.
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Assistant reply' })).toHaveCount(1);
    const asked = world.restCalls(/chat\/stream/).map((call) => JSON.stringify(call));
    expect(asked.filter((call) => call.includes('price rates in katragunta')).length).toBe(2);
    // The service is told which turn this replaces, so saved history holds one Q&A.
    const [first, second] = world.restCalls(/chat\/stream/).map((call) => JSON.parse(call.body ?? '{}') as { run_id?: string; replaces_run_id?: string });
    expect(first.replaces_run_id).toBeUndefined();
    expect(second.replaces_run_id).toBe(first.run_id);
    expect(second.run_id).not.toBe(first.run_id);
  });

  test('the last question can be edited and asked again', async ({ page, world }) => {
    answering(world, { type: 'token', text: 'Answer to the typo.' }, '[DONE]');
    await openAndAsk(page, 'properties for sankra reddy');
    await expect(page.getByText('Answer to the typo.')).toBeVisible();
    world.route(/\/assistant\/api\/chat\/stream/, () => ({
      contentType: 'text/event-stream', body: sse({ type: 'token', text: 'Answer to the fix.' }, '[DONE]'),
    }));
    await page.getByRole('button', { name: 'Edit message' }).click();
    const editor = page.getByLabel('Edit your message');
    await expect(editor).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit message' })).toBeFocused();
    await page.getByRole('button', { name: 'Edit message' }).click();
    await expect(editor).toHaveValue('properties for sankra reddy');
    await editor.fill('properties for sankara reddy telukutla');
    await page.getByRole('button', { name: 'Save & resend' }).click();
    await expect(page.getByText('Answer to the fix.')).toBeVisible();
    // Focus carries on in the composer, not lost to the page.
    await expect(page.getByLabel('Message the Pattadar Assistant')).toBeFocused();
    await expect(page.getByText('Answer to the typo.')).toHaveCount(0);
    await expect(page.getByText('properties for sankra reddy', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText(/properties for sankara reddy telukutla/);
    const asked = world.restCalls(/chat\/stream/).map((call) => JSON.stringify(call));
    expect(asked.some((call) => call.includes('properties for sankara reddy telukutla'))).toBe(true);
  });

  test('a reply and a question copy their text to the clipboard', async ({ page, world }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { copied.push(text); } },
      });
    });
    answering(world, { type: 'token', text: 'Katragunta, **Sy 120-2**.' }, '[DONE]');
    await openAndAsk(page, 'where is my land');
    await expect(page.getByText('Sy 120-2')).toBeVisible();
    await page.getByRole('button', { name: 'Copy reply' }).click();
    await page.getByRole('button', { name: 'Copy message' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied))
      .toEqual(['Katragunta, **Sy 120-2**.', 'where is my land']);
    // The button confirms the copy for a moment.
    await expect(page.getByRole('toolbar', { name: 'Reply actions' }).getByTestId('CheckIcon')).toBeVisible();
  });

  test('a suggestion card on the empty chat asks its question', async ({ page, world }) => {
    answering(world, { type: 'token', text: 'Stamp duty is a share of the value.' }, '[DONE]');
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Suggested questions' }).getByRole('button')).toHaveCount(4);
    await page.getByRole('button', { name: /^Explain stamp duty/ }).click();
    await expect(page.getByText('Stamp duty is a share of the value.')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText(/Explain how stamp duty is calculated for a sale deed/);
    const asked = world.restCalls(/chat\/stream/).map((call) => JSON.stringify(call));
    expect(asked.some((call) => call.includes('Explain how stamp duty is calculated for a sale deed'))).toBe(true);
  });

  test('markdown answers draw real tables and code blocks that copy, and never raw HTML', async ({ page, world }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { copied.push(text); } },
      });
    });
    answering(
      world,
      { type: 'token', text: '## Duty by value\n\n| Value | Duty |\n|---|---:|\n| ₹10,00,000 | ₹50,000 |\n' },
      { type: 'token', text: '| ₹20,00,000 | ₹1,00,000 |\n\nWork it out:\n\n```python\nduty = value * 0.05\n```\n\n' },
      { type: 'token', text: 'See [a bad link](javascript:alert(1)) and [IGRS](https://registration.ap.gov.in).\n\n<script>alert(1)</script>' },
      '[DONE]',
    );
    await openAndAsk(page, 'explain stamp duty');
    const reply = page.getByRole('article', { name: 'Assistant reply' });
    const table = reply.getByRole('region', { name: 'Table' }).getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Duty' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '₹1,00,000' })).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(reply.getByText('|---|')).toHaveCount(0);
    await expect(reply.getByText('python', { exact: true })).toBeVisible();
    await expect(reply.getByText('duty = value * 0.05')).toBeVisible();
    await reply.getByRole('button', { name: 'Copy python to clipboard' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied))
      .toEqual(['duty = value * 0.05']);
    // Raw HTML is text, a javascript: link is not a link, an https link opens safely.
    await expect(reply.locator('script')).toHaveCount(0);
    await expect(reply.getByText('<script>alert(1)</script>', { exact: false })).toBeVisible();
    await expect(reply.getByRole('link', { name: 'a bad link' })).toHaveCount(0);
    const igrs = reply.getByRole('link', { name: 'IGRS' });
    await expect(igrs).toHaveAttribute('href', 'https://registration.ap.gov.in');
    await expect(igrs).toHaveAttribute('target', '_blank');
    await expect(igrs).toHaveAttribute('rel', 'noreferrer noopener');
  });

  test('a party search leads with summary figures above its table', async ({ page, world }) => {
    answering(world, {
      ...partyView,
      summary: {
        total_matches: 87, exact_matches: 2, as_buyer: 7, as_seller: 13,
        consideration_total: 4038900, first_date: '1984-08-07', last_date: '2019-10-10',
        villages: ['KATRAGUNTA', 'TRIPURANTHAKAM', 'NALLAPADU', 'PEDDAPALEM', 'ONGOLE', 'KANDUKUR', 'MARKAPUR'],
      },
    }, { type: 'token', text: 'Found them.' }, '[DONE]');
    await openAndAsk(page, 'properties for sankara reddy telukutla');
    const summary = page.getByRole('group', { name: 'Summary of these results' });
    await expect(summary).toBeVisible();
    for (const [label, value] of [['Matches', '87'], ['Exact name', '2'], ['As buyer', '7'], ['As seller', '13'], ['Villages', '7']]) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
      await expect(summary.locator('dd').filter({ hasText: new RegExp(`^${value}$`) }).first()).toBeVisible();
    }
    await expect(summary.getByText('Consideration', { exact: true })).toBeVisible();
    await expect(summary.getByText('Period', { exact: true })).toBeVisible();
    await expect(summary.getByText('1984–2019')).toBeVisible();
    // The cards sit above the table, inside the same result.
    const cards = (await summary.boundingBox())!;
    const table = (await page.getByRole('table').boundingBox())!;
    expect(cards.y + cards.height).toBeLessThanOrEqual(table.y + 1);
  });

  test('a smoothly streamed reply ends with every word, and the caret goes away', async ({ page, world }) => {
    // The stream is a page-side body the test feeds, so the reply can be held
    // half-way (a routed response arrives all at once). Nothing leaves the page.
    await page.addInitScript(() => {
      const scope = window as unknown as { __feed?: (text: string) => void; __end?: () => void };
      const original = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!/\/chat\/stream/.test(url)) return original(input, init);
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            scope.__feed = (text) => controller.enqueue(encoder.encode(text));
            scope.__end = () => controller.close();
          },
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
      };
    });
    const words = Array.from({ length: 120 }, (_, i) => `word${i + 1}`);
    const tokens = (from: number, to: number) => sse(
      ...words.slice(from, to).map((word, i) => ({ type: 'token', text: from + i === 0 ? word : ` ${word}` })),
    );
    answering(world, '[DONE]');
    await openAndAsk(page, 'say a lot');
    await page.waitForFunction(() => typeof (window as unknown as { __feed?: unknown }).__feed === 'function');
    const prose = page.getByRole('article', { name: 'Assistant reply' }).locator('.assistant-prose');
    const caret = page.locator('.MuiDrawer-paper [data-streaming-caret]');

    await page.evaluate((chunk) => (window as unknown as { __feed: (t: string) => void }).__feed(chunk), tokens(0, 60));
    await expect(prose).toContainText('word60');
    await expect(prose).not.toContainText('word61');
    await expect(caret).toHaveCount(1);

    await page.evaluate((chunk) => {
      const scope = window as unknown as { __feed: (t: string) => void; __end: () => void };
      scope.__feed(chunk);
      scope.__end();
    }, tokens(60, 120) + sse('[DONE]'));
    await expect(prose).toHaveText(words.join(' '));
    await expect(page.getByRole('status').filter({ hasText: 'Reply complete.' })).toHaveCount(1);
    await expect(caret).toHaveCount(0);
    await expect(page.locator('.MuiDrawer-paper .assistant-streaming')).toHaveCount(0);
  });
});
