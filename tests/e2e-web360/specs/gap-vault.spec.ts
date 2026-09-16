/**
 * The vault, the Reader and the three doors that make a share link.
 *
 * W13/W15 were asserted from the outside only. screens.spec.ts:2140-2188 reads
 * the eight shelf cards and the link list and revokes one row; crud-360.spec.ts
 * :523 makes a link from a RECORD and stops at the URL shape. Everything
 * between those two — where a shelf card goes, which papers a link actually
 * hands a stranger, what the Reader says about a link that lapsed a month ago,
 * and how a shared title deed is deleted — has never run:
 *
 *   · /app/papers/shelf/:key, the destination of all eight shelf cards and the
 *     only cross-record view of papers, had never been opened by a test. Its
 *     own header comment says those cards used to resolve to the page they
 *     were already on, so a regression to that is invisible from the wall.
 *
 *   · The vault header's two buttons ("Add papers", "Share a property") were
 *     both handler-less decoration before they were wired. Nothing presses
 *     either, so both could go back to doing nothing and the suite stays green.
 *
 *   · createShareLink is called from three places with two different manifests
 *     — the Vault and a record share ALL documents (all_documents=True in
 *     capabilities.snapshot), the Reader shares exactly one (documentIds) —
 *     and no test has ever looked at what the recipient receives from any of
 *     them. capabilities.spec.ts serves that endpoint from a literal it writes
 *     itself, so the resolver's own manifest is untested. Here the recipient
 *     page is served from the suite's real API (the gateway is deliberately
 *     unreachable at :15182), so the rows under test are the rows the server
 *     built.
 *
 *   · The Reader's share dialog, its share-link card and its typed-phrase
 *     delete — the one deletion in the app that destroys a live share link as
 *     a side effect — had no coverage at all. `deletePaper` appears nowhere in
 *     tests/.
 *
 * One test here is test.fail(): the Reader tells the owner a link that expired
 * on 16/08/2026 "expires tomorrow". It asserts what the screen owes the owner,
 * so it goes green the day Reader.tsx gets the fix Vault.tsx already has.
 *
 * CLEANUP. Everything filed here is registered and swept in `afterEach`, never
 * at the end of a body: Playwright abandons a test at its first failed
 * assertion, and screens.spec.ts — which runs after this file — asserts the
 * seeded totals, the vault's paper count and the number of link rows. A link
 * outlives the record it points at, so links are revoked BEFORE the record is
 * deleted, the way crud-360.spec.ts:458-466 does it.
 */
import { expect, test, stubDocumentReader } from './harness';

type Pg = import('@playwright/test').Page;
type Req = import('@playwright/test').APIRequestContext;

const PARCEL = 'w360-p-214-2';
const DEED = 'w360-d-deed-4417';

/** The suite's own API, which serves the recipient manifest at /public/{scope}/
 *  {token}. The web bundle asks the GATEWAY for it, and this suite points the
 *  gateway proxy at a dead port on purpose — so the one route that has to reach
 *  a real resolver is forwarded by hand below. */
const API = `http://127.0.0.1:${process.env.E2E_API_PORT || 18080}`;

/** GraphQL straight at the API through the web proxy, which injects the demo
 *  identity — the same door crud-360.spec.ts uses. */
const gql = (request: Req, query: string) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query } }).then((r) => r.json());

/** Scratch records and the audiences of every link made through the UI.
 *  Swept together in afterEach so a failed assertion cannot leak either. */
const MADE: string[] = [];
const SHARED: string[] = [];
const made = (id: string): string => { MADE.push(id); return id; };
const shared = (audience: string): string => { SHARED.push(audience); return audience; };

/** Revoke first, then delete. Never throws: a failing cleanup must not turn a
 *  passing test red, nor mask the real failure of a failing one. */
async function sweep(request: Req): Promise<void> {
  const audiences = SHARED.splice(0);
  const ids = MADE.splice(0);
  try {
    if (audiences.length) {
      const out = await gql(request, '{ web { vault { links { id audience } } } }');
      const links = (out?.data?.web?.vault?.links ?? []) as { id: string; audience: string }[];
      for (const l of links) {
        if (audiences.includes(l.audience)) {
          await gql(request, `mutation { web { revokeShareLink(linkId:"${l.id}") } }`);
        }
      }
    }
    if (ids.length) {
      const list = ids.map((id) => JSON.stringify(id)).join(',');
      await gql(request, `mutation { web { deleteRecords(ids:[${list}]) } }`);
    }
  } catch {
    // Swept on the next run by purge-e2e-records; nothing here is worth failing on.
  }
}

/** A scratch parcel nothing else counts, registered for the sweep. */
async function scratchRecord(request: Req, title: string): Promise<string> {
  const out = await gql(request, `mutation { web { saveRecord(input:{ kind:"parcel",
    title:${JSON.stringify(title)}, classification:"agri", khataNo:"7311",
    village:"E2E Palem", mandal:"E2E Mandal", extent:1, extentUnit:"ac" }) } }`);
  const id = out?.data?.web?.saveRecord ?? '';
  expect(id, 'the scratch record was not created').not.toBe('');
  return made(id);
}

/** A private in-memory byte store, so a real multipart browser upload has
 *  somewhere to land without the founder's gateway or bucket. Trimmed from
 *  crud-360.spec.ts:341 to the two calls filing a paper actually makes. */
async function withStorageFixture(page: Pg): Promise<void> {
  const files = new Map<string, { id: string; mimeType: string; bytes: Buffer }>();
  await page.route('**/api/gateway/storage/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/files') && request.method() === 'POST') {
      const form = await new Request('http://fixture.invalid/upload', {
        method: 'POST', headers: request.headers(), body: request.postDataBuffer()!,
      }).formData();
      const file = form.get('file') as File;
      const node = { id: `e2e-node-${files.size + 1}`, mimeType: file.type,
        bytes: Buffer.from(await file.arrayBuffer()) };
      files.set(node.id, node);
      await route.fulfill({ json: { id: node.id, name: file.name, mimeType: file.type, sizeBytes: file.size } });
      return;
    }
    const nodeId = url.pathname.match(/\/files\/([^/]+)\/content$/)?.[1]
      || url.pathname.match(/\/nodes\/([^/]+)$/)?.[1];
    const node = nodeId ? files.get(nodeId) : undefined;
    if (node) await route.fulfill({ contentType: node.mimeType, body: node.bytes });
    else await route.fulfill({ status: 404, json: { error: 'not in the fixture store' } });
  });
}

/** File one PDF against a record through the real upload control and hand back
 *  the row the server made, so a test can open it in the Reader by id. */
async function fileAPaper(page: Pg, request: Req, recordId: string, reader: Record<string, unknown>,
): Promise<{ id: string; title: string }> {
  await withStorageFixture(page);
  await stubDocumentReader(page, reader);
  await page.goto(`/app/records/${recordId}`);
  // Filing a paper is a drawer now (RecordPapers.PaperDrawer over Drawer.tsx) and
  // the picker lives inside it, so the panel has to be opened first and the pick
  // is not sent until the primary is pressed. The section head's button is the
  // one used here: a record with nothing filed grows a second "Add a paper" in
  // its empty state, and both open this same panel.
  await page.locator('header.sechead').getByRole('button', { name: 'Add a paper' }).click();
  const panel = page.getByRole('dialog', { name: /^File (a paper|\d+ papers)$/ });
  await expect(panel).toBeVisible();
  await page.locator('main input[type=file]').first().setInputFiles({
    name: 'e2e-vault.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not a real deed'),
  });
  await panel.getByRole('button', { name: /^File (the paper|\d+ papers)$/ }).click();
  // Wait for the row to paint before reading the id back: the upload, the
  // reader fixture and the filing are three round trips, and querying straight
  // after setInputFiles returns an empty list that reads as a missing paper.
  await expect(page.locator('.rows.boxed > div').first()).toBeVisible();
  const papers = async () => {
    const res = await gql(request, `{ web { papers(recordId:"${recordId}"){ id title } } }`);
    return (res?.data?.web?.papers ?? []) as { id: string; title: string }[];
  };
  await expect.poll(async () => (await papers()).length,
    { message: 'the uploaded paper never reached the record' }).toBe(1);
  return (await papers())[0];
}

/** Serve /share/:token from the suite's API instead of the dead gateway proxy,
 *  so the manifest under test is the one capabilities.snapshot wrote rather
 *  than one the spec made up. Scoped to the share document itself; the
 *  per-file route is left alone (a seeded paper has no bytes to serve). */
async function forwardRecipientManifest(page: Pg, request: Req): Promise<void> {
  await page.route('**/api/gateway/capabilities/shares/*', async (route) => {
    const token = new URL(route.request().url()).pathname.split('/').pop()!;
    const res = await request.get(`${API}/public/shares/${token}`);
    await route.fulfill({ status: res.status(), contentType: 'application/json', body: await res.text() });
  });
}

/** The token half of "/share/<43 chars>", read out of the result panel. */
async function tokenFromResult(page: Pg): Promise<string> {
  const url = await page.getByLabel('Recipient link').inputValue();
  expect(url, 'the share result did not hold a /share/<token> URL').toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);
  return url.split('/share/')[1];
}

test.describe('the vault wall', () => {
  test.afterEach(async ({ request }) => { await sweep(request); });

  test('a shelf card opens that shelf, and the list it opens agrees with the count on the card', async ({ page }) => {
    await page.goto('/app/papers');
    const card = page.locator('.shelf', { hasText: 'Title' }).first();
    const printed = Number((await card.locator('.num').innerText()).trim());
    // A card reading 0 would make every assertion below vacuously true.
    expect(printed, 'the Title shelf card printed no count').toBeGreaterThan(1);

    await card.click();
    await expect(page).toHaveURL(/\/app\/papers\/shelf\/title$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Title');
    // The breadcrumb is the only way back, and it has to point at the wall —
    // this route is not a child of /app/papers, it replaces it.
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Papers' })).toHaveAttribute('href', '/app/papers');

    // vault's count and vaultPapers' list read the same `shelf` column, so a
    // card saying 14 over a list of 4 is a lie the two queries can tell
    // together. This is the assertion that catches it.
    const rows = page.locator('.rows.boxed > a');
    await expect(rows).toHaveCount(printed);

    // Papers from more than one record — that is what makes this a vault view
    // and not the record's own Papers tab wearing a different heading.
    await expect(rows.filter({ hasText: 'Sale Deed 4417/2019' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Will of T. Subbarao, 2021' })).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('href', /^\/app\/papers\/[\w-]+$/);

    const search = page.getByLabel('Search the Title shelf');
    await search.fill('Sale Deed 4417');
    await expect(rows).toHaveCount(1);

    // A search that matches nothing must say so and offer the way out. An
    // empty card with no Clear button is a shelf that looks emptied.
    await search.fill('zzzz-no-such-paper');
    await expect(rows).toHaveCount(0);
    await expect(page.getByText(/Nothing on this shelf matches/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(rows).toHaveCount(printed);
  });

  test('Add papers asks which property and lands on that record, where a paper can actually be filed', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();

    const dialog = page.getByRole('dialog', { name: 'Which property are these papers for?' });
    await expect(dialog).toBeVisible();
    // The dialog exists to explain WHY the vault cannot just take a file: a
    // paper is filed against the property it belongs to, which is what lets a
    // deed be checked against the record it names.
    await expect(dialog.getByText('Every paper is filed against')).toBeVisible();

    await dialog.getByLabel('Search your properties').fill('214/2');
    await dialog.getByRole('button', { name: 'Sy 214/2', exact: true }).click();

    // The journey has to END somewhere a paper can be filed. This button used
    // to have no onClick at all, and a dialog that closes onto the vault it
    // opened from is the same dead control with extra steps.
    await expect(page).toHaveURL(new RegExp(`/app/records/${PARCEL}$`));
    // "a paper can actually be filed" is now one press deeper: the picker lives
    // inside the drawer, so asserting an attached `input[type=file]` on arrival
    // would only ever find the assistant's own attachment picker on <body>. The
    // journey has to end at a panel that takes a file.
    const addPaper = page.locator('header.sechead').getByRole('button', { name: 'Add a paper' });
    await expect(addPaper).toBeVisible();
    await addPaper.click();
    await expect(page.getByRole('dialog', { name: 'File a paper' })).toBeVisible();
    await expect(page.locator('main input[type=file]').first()).toBeAttached();
  });

  test('Share a property picks the property first, then makes the link', async ({ page }) => {
    const AUDIENCE = shared('E2E Vault Share');
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();

    // Said out loud rather than left to a greyed-out button: nothing can be
    // made until a property is chosen, and the button alone does not say why.
    await expect(page.getByText('A link carries one property’s papers')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Make the link' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Search your properties').fill('214/2');
    await page.getByRole('button', { name: 'Sy 214/2', exact: true }).click();

    // The picked property stays on screen with a way back to the list: this is
    // a link to a stranger, and "which property was that again" must not be a
    // question the owner has to close the dialog to answer.
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
    await page.getByRole('button', { name: 'Change' }).click();
    await expect(page.getByLabel('Search your properties')).toBeVisible();
    await page.getByRole('button', { name: 'Sy 214/2', exact: true }).click();

    // A link nobody is named on cannot be revoked with any confidence about
    // who loses access, so the audience gates the submit here too.
    await expect(submit).toBeDisabled();
    await page.getByLabel('Who the link is for').fill(AUDIENCE);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByLabel('Recipient link')).toHaveValue(/\/share\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByText('The link is ready to copy and send.')).toBeVisible();
    // One dialog, one link: the submit unmounts so a second press cannot hand
    // out a second credential the owner does not know about.
    await expect(submit).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    // A new link runs 30 days, so it belongs in the live list, not in Lapsed.
    const row = page.locator('.rows.boxed > div').filter({ hasText: AUDIENCE });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('30 days left');
  });
});

test.describe('the Reader', () => {
  test.afterEach(async ({ request }) => { await sweep(request); });

  // Declared first on purpose: the seeded deed's card is resolved with
  // `SELECT * FROM share_links WHERE document_id=%s AND revoked=false LIMIT 1`,
  // so a second live link on the same deed — which the tests below make — can
  // win that LIMIT 1 and change what this card says.
  test('the Reader does not tell the owner a link that lapsed last month expires tomorrow', async ({ page }) => {
    // DEFECT: apps/web/src/w360/pages/Reader.tsx:625 renders
    // `daysLeft <= 1 ? 'link expires tomorrow'`, and the server's _days_until
    // (services/api/src/web360.py:1488-1498) ends in `max(0, …)` — every past
    // date arrives as 0. Vault.tsx:50-80 parses expiresOn itself for exactly
    // this reason and says `expired 16/08/2026`; Reader.tsx never got the fix,
    // so the two screens contradict each other about one row today.
    test.fail();
    await page.goto(`/app/papers/${DEED}`);

    // Anchor on the card without depending on the buggy sentence.
    await expect(page.getByText('K. Prasad, advocate has opened this 6 times')).toBeVisible();
    await expect(page.getByText('Last 13/08/2026 16:02 IST')).toBeVisible();

    // The Vault already knows this link is dead, on the same data.
    await page.goto('/app/papers');
    await expect(page.locator('.rows.boxed > div').filter({ hasText: 'K. Prasad, advocate' })
      .first()).toContainText('expired 16/08/2026');

    await page.goto(`/app/papers/${DEED}`);
    // The lie this test exists to kill: an owner who reads this believes an
    // advocate still has their title deed for one more day.
    await expect(page.getByText('link expires tomorrow')).toHaveCount(0);
    await expect(page.getByText(/expired 16\/08\/2026/)).toBeVisible();
  });

  test('the Reader shares one paper, and the paper then says it is shared', async ({ page, request }) => {
    const AUDIENCE = shared('E2E Reader Share');
    const record = await scratchRecord(request, 'Sy SHAREME');
    const paper = await fileAPaper(page, request, record, {
      doc_type: 'Encumbrance Certificate', document_no: '', reg_year: '',
    });

    await page.goto(`/app/papers/${paper.id}`);
    await page.getByRole('button', { name: 'Share securely' }).click();

    // The Reader is the only caller in the app that passes documentIds, and
    // the dialog has to say so — a recipient who expects one paper and gets
    // the whole record is the failure this sentence prevents.
    await expect(page.getByText('This link carries only this paper')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Share', exact: true });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Who is it for').fill(AUDIENCE);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByLabel('Recipient link')).toHaveValue(/\/share\/[A-Za-z0-9_-]{43}$/);
    // Nothing on the screen behind the dialog changes as the link is made, so
    // the confirmation is the only thing that says it exists — and it has to
    // say where the link can be taken back.
    await expect(page.getByText('The link is ready to copy. Revoke it any time from the Vault.')).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();

    // createShareLink writes share_links.document_id when exactly one document
    // is named (web360.py:4776), and the paper resolver reads it back — so
    // after a reload the paper knows it is out on a link. If that column stops
    // being written, this marker and the card below silently disappear.
    await expect(page.locator('aside.rd-side').getByText('shared', { exact: true })).toBeVisible();
    await expect(page.getByText(`${AUDIENCE} has opened this 0 times`)).toBeVisible();

    const out = await gql(request, '{ web { vault { links { audience } } } }');
    const links = (out?.data?.web?.vault?.links ?? []) as { audience: string }[];
    expect(links.some((l) => l.audience === AUDIENCE), 'the link never reached the vault').toBe(true);
  });

  test('a shared title deed asks for its number before it goes, and takes its link with it', async ({ page, request }) => {
    const AUDIENCE = shared('E2E Deed Share');
    const record = await scratchRecord(request, 'Sy DELETEME');
    const paper = await fileAPaper(page, request, record, {
      doc_type: 'Partition Deed', document_no: '7788', reg_year: '2026',
      registration_date: '26/08/2013', sro: 'SRO Tarlupadu',
    });
    expect(paper.title, 'the reader fixture did not produce a numbered title deed')
      .toBe('Partition Deed 7788/2026');

    // Shared through the API rather than the dialog: the dialog is the test
    // above, and what this one needs is only the state it leaves behind.
    await gql(request, `mutation { web { createShareLink(recordId:"${record}",
      audience:${JSON.stringify(AUDIENCE)}, documentIds:["${paper.id}"]) } }`);
    const before = await gql(request, '{ web { vault { total links { id audience } } } }');
    const vaultBefore = before?.data?.web?.vault;
    expect((vaultBefore?.links ?? []).some((l: { audience: string }) => l.audience === AUDIENCE),
      'the paper was not shared, so the phrase gate would never arm').toBe(true);

    await page.goto(`/app/papers/${paper.id}`);
    await expect(page.getByRole('heading', { name: 'Delete this document' })).toBeVisible();

    // A title deed that is out on a link is the one paper in the vault whose
    // deletion also destroys a stranger's access. The copy has to name both.
    await expect(page.getByText('so it asks you to type 7788/2026 first')).toBeVisible();
    await expect(page.getByText('The link is revoked with it')).toBeVisible();

    // The ordinary two-tap Delete/Remove pair must not be reachable here — a
    // deed is evidence, and one stray click in the rail must not unfile it.
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toHaveCount(0);

    const box = page.getByLabel('Type 7788/2026 to confirm deletion');
    const del = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(del).toBeDisabled();
    await box.fill('7788');           // the number without its year is not the phrase
    await expect(del).toBeDisabled();
    await box.fill('7788/2026');
    await expect(del).toBeEnabled();
    await del.click();

    // Back to the record, not to "This paper is not in your vault" — which is
    // what staying here would show, and reads as though the deletion broke
    // something rather than as the deletion that was asked for.
    await expect(page).toHaveURL(new RegExp(`/app/records/${record}$`));

    const after = await gql(request, '{ web { vault { total links { id audience } } } }');
    const vaultAfter = after?.data?.web?.vault;
    // delete_paper DELETEs from share_links as well as documents. If it ever
    // stops doing that, the link outlives the paper and keeps pointing at a
    // row nobody can see any more.
    expect((vaultAfter?.links ?? []).some((l: { audience: string }) => l.audience === AUDIENCE),
      'the share link survived the paper it pointed at').toBe(false);
    expect(Number(vaultAfter?.total), 'the vault total did not drop with the deleted paper')
      .toBe(Number(vaultBefore?.total) - 1);
  });
});

test.describe('what a recipient actually receives', () => {
  test.afterEach(async ({ request }) => { await sweep(request); });

  test('a record link carries every paper on the record, and the Reader’s carries exactly one', async ({ page, request }) => {
    await forwardRecipientManifest(page, request);

    const filed = await gql(request, `{ web { papers(recordId:"${PARCEL}"){ title } } }`);
    const titles = ((filed?.data?.web?.papers ?? []) as { title: string }[]).map((p) => p.title);
    expect(titles.length, 'the seeded parcel has no papers to share').toBeGreaterThan(1);

    // ── the record's own Share panel: no documentIds, so all_documents=True ──
    await page.goto(`/app/records/${PARCEL}`);
    await page.getByRole('button', { name: 'Share securely' }).click();
    await page.getByLabel('Who is it for').fill(shared('E2E Manifest'));
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const wholeRecord = await tokenFromResult(page);

    await page.goto(`/share/${wholeRecord}`);
    await expect(page.getByRole('heading', { name: 'Selected files' })).toBeVisible();
    await expect(page.getByText(/^Available until \d{2}\/\d{2}\/\d{4}\./)).toBeVisible();
    // Every paper on the record, named the way the owner filed it. The bug
    // this guards is the opposite of a leak: a manifest that quietly narrows
    // to one row hands a buyer a deed with no passbook behind it.
    for (const title of titles) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    // Every seeded document has file_ref='', so the owner who shares the demo
    // record hands over twelve rows a recipient cannot open — and is told
    // nothing about it on the way out. Asserted so the day storage-backed
    // papers arrive, this count changes and someone has to look.
    await expect(page.getByText('Original file unavailable')).toHaveCount(titles.length);
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(0);

    // ── the Reader's panel on one of those same papers: documentIds=[id] ──
    await page.goto(`/app/papers/${DEED}`);
    await page.getByRole('button', { name: 'Share securely' }).click();
    await page.getByLabel('Who is it for').fill(shared('E2E Manifest One'));
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const onePaper = await tokenFromResult(page);
    expect(onePaper, 'the two entry points returned the same token').not.toBe(wholeRecord);

    await page.goto(`/share/${onePaper}`);
    await expect(page.getByRole('heading', { name: 'Selected files' })).toBeVisible();
    await expect(page.getByText('Sale Deed 4417/2019', { exact: true })).toBeVisible();
    await expect(page.getByText('Original file unavailable')).toHaveCount(1);
    // The rest of the record must not travel with it. A one-paper link that
    // silently carries eleven more is the leak the Reader's dialog promises
    // will not happen ("This link carries only this paper").
    for (const title of titles.filter((t) => t !== 'Sale Deed 4417/2019')) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
  });
});
