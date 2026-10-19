/**
 * The assistant's split view (founder, 11/10/2026): full screen on a wide
 * window lays out conversations · thread · results, like Claude.ai. A party
 * search opens in a closable results pane with its filters; the thread keeps
 * a compact card that reopens it. The drawer and narrow windows are unchanged.
 *
 * Sealed like every spec here: the conversation, capability, stream and
 * party-search routes are answered from inside the test.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';

const sse = (...events: unknown[]) =>
  events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');

const partyView = {
  type: 'records',
  id: 'toolu_party',
  kind: 'table',
  title: 'Deeds naming “Usharani Bobba”',
  columns: [
    { key: 'matched_name', label: 'Name in deed' },
    { key: 'score', label: 'Name match' },
    { key: 'location', label: 'Location' },
    { key: 'rid', label: 'RID' },
  ],
  rows: [
    { matched_name: 'BOBBA USHARANI', score: 1, location: 'Plot 6, VINUKONDA', rid: 'AP080813198900001576', s_no: 3 },
    { matched_name: 'BOBBA USHA RANI', score: 0.92, location: 'Plot 2, KATRAGUNTA', rid: 'AP080813200100011234', s_no: 1 },
  ],
  total: 16,
  note: null,
  facets: {
    villages: [{ name: 'VINUKONDA', count: 9 }, { name: 'KATRAGUNTA', count: 7 }],
    sros: [{ name: 'VINUKONDA', count: 9 }],
    confidence: { exact: 4, high: 2, medium: 10, low: 0 },
  },
  query: { name: 'Usharani Bobba', villages: [], sro: null, min_similarity: 0.6, side: null },
};

const CONVERSATIONS = [
  { id: 'c-one', title: 'Plots in Vinukonda', status: 'active', message_count: 2, updated_at: '2026-10-10T10:00:00Z' },
  { id: 'c-two', title: 'Old search', status: 'active', message_count: 2, updated_at: '2026-10-09T10:00:00Z' },
];

function answering(world: World, { listFails = false } = {}) {
  world.route(/\/assistant\/api\/capabilities/, () => ({
    json: { public_records: { ready: true, status: 'ready', tool_count: 8, semantic_search_ready: false, coverage: '1975–2029' } },
  }));
  world.route(/\/assistant\/api\/usage/, () => ({
    json: { today_usd: 0.1, month_usd: 1, requests_today: 1, credit_status: 'ok', balance_usd: null },
  }));
  world.route(/\/assistant\/api\/models/, () => ({ json: { default: 'claude-sonnet-4-6', models: [] } }));
  world.route(/\/assistant\/api\/conversations/, (_route, call) => {
    if (call.method === 'POST') return { json: { id: 'c-new', title: null, status: 'active', message_count: 0, updated_at: '2026-10-11T10:00:00Z' } };
    if (/conversations\/c-one/.test(call.url)) {
      return { json: { id: 'c-one', messages: [
        { role: 'human', content: 'plots in vinukonda' },
        { role: 'ai', content: 'Vinukonda has two of your plots.' },
      ] } };
    }
    if (/conversations\/c-two/.test(call.url)) {
      return { json: { id: 'c-two', messages: [
        { role: 'human', content: 'old search' },
        { role: 'ai', content: 'Here are the earlier results.' },
      ] } };
    }
    if (/conversations\/c-new/.test(call.url)) return { json: { id: 'c-new', messages: [] } };
    return listFails ? { status: 500, json: { detail: 'down' } } : { json: { conversations: CONVERSATIONS } };
  });
  world.route(/\/assistant\/api\/chat\/stream/, () => ({
    contentType: 'text/event-stream',
    body: sse(
      { type: 'tool_start', name: 'mcp__pattadar_records__find_properties_by_party', id: 'toolu_party' },
      { type: 'tool_end', name: 'mcp__pattadar_records__find_properties_by_party', content: '{}' },
      partyView,
      { type: 'token', text: 'I found 16 deeds naming Usharani Bobba.' },
      '[DONE]',
    ),
  }));
  world.route(/\/assistant\/api\/records\/party-search/, () => ({
    json: {
      text: 'Refined: 1 deed in KATRAGUNTA.',
      view: {
        ...partyView,
        id: 'refine-1',
        rows: [partyView.rows[1]],
        total: 1,
        facets: { villages: [{ name: 'KATRAGUNTA', count: 1 }], sros: [], confidence: { exact: 0, high: 1, medium: 0, low: 0 } },
        query: { name: 'Usharani Bobba', villages: ['KATRAGUNTA'], sro: null, min_similarity: 0.6, side: null },
      },
    },
  }));
}

async function openFullScreen(page: Page, width = 1512) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Expand assistant to full screen' }).click();
}

async function ask(page: Page, question: string) {
  await page.getByLabel('Message the Pattadar Assistant').fill(question);
  await page.getByRole('button', { name: 'Send message' }).click();
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Conversations' });
const results = (page: Page) => page.getByRole('complementary', { name: 'Results' });

test.describe('assistant split view', () => {
  // /home asks for `auditTrail`, unseeded (see 40-assistant-records).
  test.use({ allowConsole: true });
  test('the RID leads each row, shows whole, and Add asks for that one deed', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page);
    await sidebar(page).getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    const pane = results(page);
    const headers = pane.getByRole('columnheader');
    // The first header is the Add column; the RID comes straight after it.
    await expect(headers.nth(1)).toHaveAccessibleName('RID');
    const rid = pane.getByRole('cell', { name: 'AP080813198900001576', exact: true });
    await expect(rid).toBeVisible();
    expect(await rid.evaluate((cell) => cell.scrollWidth <= cell.clientWidth)).toBe(true);

    await pane.getByRole('button', { name: 'Add deed AP080813198900001576 to my properties' }).click();
    await expect.poll(() => world.restCalls(/\/assistant\/api\/chat\//).length).toBe(2);
    const asked = JSON.parse(world.restCalls(/\/assistant\/api\/chat\//)[1].body ?? '{}');
    expect(JSON.stringify(asked)).toContain('Add the deed with RID AP080813198900001576, schedule 3 to my properties.');
  });


  test('full screen on a wide window shows conversations beside the thread; a chat opens from the list', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page);
    const nav = sidebar(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Plots in Vinukonda', exact: true })).toBeVisible();
    // The history toggle is the drawer's; the sidebar replaces it here.
    await expect(page.getByRole('button', { name: 'Conversation history' })).toHaveCount(0);
    // The newest chat opens on its own and is marked current.
    await expect(page.getByText('Vinukonda has two of your plots.')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Plots in Vinukonda', exact: true })).toHaveAttribute('aria-current', 'true');

    await nav.getByRole('button', { name: 'Old search', exact: true }).click();
    await expect(page.getByText('Here are the earlier results.')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Old search', exact: true })).toHaveAttribute('aria-current', 'true');
    // No results yet, so no results pane.
    await expect(results(page)).toHaveCount(0);

    await nav.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.getByText("Hello! I'm your Pattadar Assistant.")).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Old search', exact: true })).not.toHaveAttribute('aria-current', 'true');
  });

  test('a party search opens in the results pane with its filters; the thread keeps a card that reopens it', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page);
    await sidebar(page).getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    await expect(page.getByText('I found 16 deeds naming Usharani Bobba.')).toBeVisible();

    const pane = results(page);
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('heading', { name: 'Public records · Usharani Bobba' })).toBeVisible();
    await expect(pane.getByText('16 matches')).toBeVisible();
    await expect(pane.getByRole('table')).toBeVisible();
    await expect(pane.getByRole('cell', { name: 'BOBBA USHARANI', exact: true })).toBeVisible();
    await expect(pane.getByRole('group', { name: 'Villages' })).toBeVisible();
    // The thread shows a compact card, not a second copy of the table.
    const card = page.getByRole('button', { name: 'Open Deeds naming “Usharani Bobba”' });
    await expect(card).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(1);

    // Refine runs the search again with no model call, and the pane follows it.
    await pane.getByRole('checkbox', { name: /KATRAGUNTA/ }).check();
    await pane.getByRole('button', { name: 'Refine results' }).click();
    await expect(page.getByText('Refined: 1 deed in KATRAGUNTA.')).toBeVisible();
    await expect(pane.getByText('1 match', { exact: true })).toBeVisible();
    await expect(pane.getByRole('cell', { name: 'BOBBA USHARANI', exact: true })).toHaveCount(0);
    const posts = world.restCalls(/\/assistant\/api\/records\/party-search/);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body ?? '{}')).toMatchObject({ name: 'Usharani Bobba', villages: ['KATRAGUNTA'] });
    expect(world.restCalls(/\/assistant\/api\/chat\//)).toHaveLength(1);
    await expect(card).toHaveCount(2);

    // Close gives the thread the room back; Esc does the same from inside the pane.
    await pane.getByRole('button', { name: 'Close results' }).click();
    await expect(results(page)).toHaveCount(0);
    await card.first().click();
    await expect(results(page)).toBeFocused();
    await expect(results(page).getByText('16 matches')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(results(page)).toHaveCount(0);
    // Esc closed the pane only; the assistant and focus stay put.
    await expect(card.first()).toBeFocused();
    await expect(sidebar(page)).toBeVisible();
  });

  test('the sidebar folds away and stays folded next time', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page);
    await expect(sidebar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Hide conversations' }).click();
    await expect(sidebar(page)).toHaveCount(0);
    // Folded, the head carries New conversation and incognito instead.
    await expect(page.getByRole('button', { name: 'New conversation' })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Expand assistant to full screen' }).click();
    await expect(page.getByRole('button', { name: 'Show conversations' })).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show conversations' }).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test('a narrow window keeps the single column and the results inline', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page, 1000);
    await expect(sidebar(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Conversation history' })).toBeVisible();
    await page.getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    await expect(page.getByText('I found 16 deeds naming Usharani Bobba.')).toBeVisible();
    await expect(results(page)).toHaveCount(0);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Refine Deeds naming “Usharani Bobba”' })).toBeVisible();
  });

  test('the results pane widens by drag or keyboard, keeps the thread readable and remembers its width', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page, 1600);
    await sidebar(page).getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    const pane = results(page);
    await expect(pane).toBeVisible();
    // Each pane is its own rounded surface.
    for (const surface of [pane, sidebar(page)]) {
      expect(parseFloat(await surface.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(0);
    }

    const splitter = page.getByRole('separator', { name: 'Resize results' });
    const before = (await pane.boundingBox())!.width;
    const handle = (await splitter.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
    await page.mouse.down();
    await page.mouse.move(handle.x - 100, handle.y + 200, { steps: 5 });
    await page.mouse.up();
    const dragged = (await pane.boundingBox())!.width;
    expect(dragged).toBeGreaterThan(before + 80);

    await splitter.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await pane.boundingBox())!.width).toBeGreaterThan(dragged + 10);

    // End asks for the most room: the thread keeps its 420px.
    await page.keyboard.press('End');
    const thread = page.getByLabel('Message the Pattadar Assistant');
    await expect.poll(async () => {
      const left = (await page.getByRole('separator', { name: 'Resize conversations' }).boundingBox())!;
      return (await splitter.boundingBox())!.x - (left.x + left.width);
    }).toBeGreaterThanOrEqual(419);
    await expect(thread).toBeVisible();
    const widest = Number(await splitter.getAttribute('aria-valuenow'));

    await page.reload();
    await openFullScreen(page, 1600);
    await sidebar(page).getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    await expect(page.getByRole('separator', { name: 'Resize results' })).toHaveAttribute('aria-valuenow', String(widest));
  });

  test('a results table column drags wider and the last column scrolls into view', async ({ page, world }) => {
    answering(world);
    await openFullScreen(page, 1600);
    await sidebar(page).getByRole('button', { name: 'New conversation' }).click();
    await ask(page, 'properties for usharani bobba');
    const pane = results(page);
    const header = pane.getByRole('columnheader', { name: 'Name in deed' });
    const before = (await header.boundingBox())!.width;
    const grip = (await pane.getByRole('separator', { name: 'Resize Name in deed column' }).boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 600, grip.y + grip.height / 2, { steps: 5 });
    await page.mouse.up();
    expect((await header.boundingBox())!.width).toBeGreaterThan(before + 300);

    // Wider than the pane now: the card scrolls sideways to the last column instead of clipping it.
    const scroller = pane.getByRole('table').locator('xpath=..');
    const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeGreaterThan(0);
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const last = await pane.getByRole('columnheader', { name: 'Location' }).boundingBox();
    const box = (await scroller.boundingBox())!;
    expect(last!.x + last!.width).toBeLessThanOrEqual(box.x + box.width + 1);
    // One-line rows: a long cell ends in an ellipsis instead of stretching the row.
    const rowHeights = await pane.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(Math.max(...rowHeights)).toBeLessThan(40);

    await pane.getByRole('separator', { name: 'Resize Location column' }).focus();
    const location = Number(await pane.getByRole('separator', { name: 'Resize Location column' }).getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect(pane.getByRole('separator', { name: 'Resize Location column' })).toHaveAttribute('aria-valuenow', String(location + 16));
  });

  test('a conversation list that does not load says so, and Try again loads it', async ({ page, world }) => {
    answering(world, { listFails: true });
    await openFullScreen(page);
    const nav = sidebar(page);
    await expect(nav.getByRole('alert')).toContainText('Conversations did not load');
    answering(world);
    await nav.getByRole('button', { name: 'Try again' }).click();
    await expect(nav.getByRole('button', { name: 'Plots in Vinukonda', exact: true })).toBeVisible();
    await expect(nav.getByRole('alert')).toHaveCount(0);
  });
});
