/**
 * W03 · Overview — the property master record, the index of /properties/:id.
 *
 * docs/specs/2026-10-11-property-overview.md §1–§2. Sy 214/2 is the deed-read
 * case (fixtures/seed.ts `overviewOf`): a sale under deed 4412/1998, one field
 * where the owner's entry and a later deed disagree, and two important gaps.
 * Sy 88 is the bare case: nothing known about how it was acquired.
 *
 * Covered: the read (source tags and their tips, conflict, the Compliance
 * check's tally, tick marks and its Add / Upload / Order ways in, summary links), the zero
 * state, the loading and failed reads, and every write the tab makes —
 * setAcquisition, setRecordFields, chooseFieldClaim (Use this, and Keep mine
 * through its 'keep' claim) — with a refused save; the deed filed from
 * Overview refreshing the tab, and its refused filing offering Enter it; a
 * box emptied in the acquisition drawer cleared through setRecordFields; a
 * watched record's drawer asking no names; and a deed added on Documents
 * offering itself for "Title" (fileDeedReading only on the owner's yes).
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PAPER } from '../fixtures/ids';
import { overviewOf, recordOf } from '../fixtures/seed';

const at = (id: string, tail = '') => `/properties/${id}${tail ? `/${tail}` : ''}`;
const tabs = (page: Page) => page.getByRole('navigation', { name: 'This property' });
const card = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

const DEED_FILE = { name: 'deed-scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2_048) };

/** Storage takes the scan and the reader reads it as a sale deed (job 'w-reading'). */
function readerSaysDeed(world: World): void {
  world.route(/\/api\/gateway\/storage\/files\?/, () => ({
    json: { id: 'file-deed-1576', name: 'deed-scan.pdf', sizeBytes: 2_048, mimeType: 'application/pdf' },
  }));
  world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
    json: { state: 'done', fields: { doc_type: 'Sale Deed', document_no: '1576', reg_year: '1989', sro: 'Ongole' } },
  }));
}

test.describe('the Overview tab', () => {
  test('is the front door: first tab, current at the bare URL; Documents lives at /documents', async ({ page }) => {
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
    const links = tabs(page).getByRole('link');
    await expect(links).toHaveCount(10);
    await expect(links.first()).toHaveText('Overview');
    await expect(tabs(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(tabs(page).getByRole('link', { name: /^Documents/ }))
      .toHaveAttribute('href', at(ID.parcel, 'documents'));
    await tabs(page).getByRole('link', { name: /^Documents/ }).click();
    await expect(page).toHaveURL(new RegExp(`${at(ID.parcel, 'documents')}$`));
    await expect(page.getByRole('heading', { name: 'Documents', exact: true, level: 2 })).toBeVisible();
    await expect(tabs(page).getByRole('link', { name: /^Documents/ })).toHaveAttribute('aria-current', 'page');
  });

  test('says how the land is held, from whom, under which document, and who said so', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const hold = card(page, 'Title');
    await expect(hold.getByText('Sale', { exact: true })).toBeVisible();
    await expect(hold.getByText('Registered', { exact: true })).toBeVisible();
    // The parties are labelled fields named the way the deed names them.
    const parties = hold.locator('dl.ov-parties > div');
    await expect(parties.filter({ hasText: 'Seller' })).toContainText('K. Narayana S/o Venkaiah');
    await expect(parties.filter({ hasText: 'Buyer' })).toContainText('Telukutla Shankar Reddy S/o T. Narayana Reddy · 1/1');
    await expect(hold.getByText(/^From .* · seller$/)).toHaveCount(0);
    await expect(hold.getByText(/^Held by /)).toHaveCount(0);
    const docRow = hold.locator('dl > div').filter({ has: page.getByText('Document number', { exact: true }) });
    await expect(docRow).toContainText('4412/1998');
    await expect(docRow.getByRole('button', { name: 'From deed 4412/1998', exact: true })).toHaveText('Deed');
    await expect(hold.locator('dl > div').filter({ hasText: 'Registered on' })).toContainText('12/03/1998');
    // The source line is the link to the file it came from (D2), so no second "Open the deed".
    await expect(hold.getByRole('link', { name: 'From deed 4412/1998', exact: true }))
      .toHaveAttribute('href', `/papers/${PAPER.deed}`);
    await expect(hold.getByRole('link', { name: 'Open the deed' })).toHaveCount(0);
    await expect(hold.getByRole('link', { name: 'Earlier owners (1)' })).toHaveAttribute('href', at(ID.parcel, 'people'));
  });

  test('marks each field with its source and runs the Compliance check', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const identity = card(page, 'Identity');
    await expect(identity.locator('dl > div').filter({ hasText: 'Village' }).getByRole('button', { name: 'From passbook 1042' })).toBeVisible();
    await expect(identity.locator('dl > div').filter({ hasText: 'Survey number' }).getByRole('button', { name: 'From deed 4412/1998' })).toBeVisible();
    // Unset fields are never empty rows.
    await expect(identity.locator('dl > div').filter({ hasText: 'Old survey number' })).toHaveCount(0);
    await expect(identity.getByText(/^Missing:/)).toHaveCount(0);
    const checks = card(page, 'Compliance check');
    await expect(checks.getByText('5 of 14 checks passed')).toBeVisible();
    await expect(checks.getByRole('progressbar', { name: 'Checks passed' })).toHaveAttribute('aria-valuenow', '5');
    await expect(checks.getByText('Checked 12/10/2026 14:05')).toBeVisible();
    await expect(checks.getByText(/facts known/)).toHaveCount(0);
    await expect(card(page, 'Complete this property')).toHaveCount(0);
    await expect(card(page, 'Physical').locator('dl > div').filter({ hasText: 'Kind of land' }))
      .toContainText('Entered before sources were kept');
    // Nothing set in the status group: one line with its way in, never a card of blanks.
    await expect(card(page, 'Status')).toHaveCount(0);
    const status = page.locator('section.card.ov-bare').filter({ hasText: 'Status · nothing recorded yet' });
    await expect(status).toBeVisible();
    await expect(status.locator('dl')).toHaveCount(0);
    await expect(page.getByText('1 field where your sources disagree')).toBeVisible();
  });

  test('a source is a short tag that says it in full on hover, focus and tap', async ({ page, world }) => {
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as { fields: Record<string, unknown>[] };
      return {
        ...o,
        fields: o.fields.map((f) => (f.key === 'district'
          ? { ...f, source: { source: 'public_record', label: 'Public record', sourceRef: 'pr:4412_1998_1204:3',
                               documentId: '', setAt: '2026-10-11T05:00:00Z', confidence: '' } }
          : f)),
      };
    });
    await page.goto(at(ID.parcel));
    const identity = card(page, 'Identity');
    const villageRow = identity.locator('dl > div').filter({ hasText: 'Village' });
    // A screen reader hears the whole source, not the short word.
    const village = villageRow.getByRole('button', { name: 'From passbook 1042', exact: true });
    await expect(village).toHaveText('Passbook');
    const tip = villageRow.locator('.infotip-body');
    await expect(tip).toBeHidden();
    await village.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('From passbook 1042');
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    // Focus shows it, Escape puts it away; a tap toggles it.
    await village.focus();
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    const district = identity.locator('dl > div').filter({ hasText: 'District' })
      .getByRole('button', { name: 'From public record · RID 4412_1998_1204 · schedule 3', exact: true });
    await district.click();
    await expect(identity.locator('dl > div').filter({ hasText: 'District' }).locator('.infotip-body'))
      .toBeVisible();
    await expect(card(page, 'Physical').locator('dl > div').filter({ hasText: 'Kind of land' })
      .getByRole('button', { name: 'Entered before sources were kept', exact: true })).toHaveText('Earlier');
    // One tag per value, never a line of words under every row.
    await expect(identity.locator('dd .note')).toHaveCount(0);
  });

  test('Boundaries have their own card laid out as a compass; Physical keeps the extent', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const physical = card(page, 'Physical');
    await expect(physical.getByText('North')).toHaveCount(0);
    const compass = card(page, 'Boundaries').locator('.ov-compass');
    await expect(compass.locator('.ov-dir')).toHaveText(['N', 'W', 'E', 'S']);
    await expect(compass.locator('.ov-side-north')).toContainText('Road');
    await expect(compass.locator('.ov-side-south')).toContainText('Not set');
    await expect(compass.locator('.ov-side-north').getByText('North:')).toBeAttached();
    await expect(physical.locator('dl > div').filter({ hasText: 'Extent' }))
      .toContainText('4 acres 12 guntas');
  });

  test('every check is listed in the rail, grouped like Missing documents', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const checks = card(page, 'Compliance check');
    // A rail card beside the property, as on the Documents tab.
    await expect(page.locator('.ov-split > aside').locator(checks)).toBeVisible();
    const rows = checks.getByRole('listitem');
    await expect(rows).toHaveCount(14);
    await expect(checks.getByRole('button', { name: /^Show all/ })).toHaveCount(0);
    // Groups in the Documents order, each with a heading and where it stands.
    const groups = checks.locator('section.missing-group');
    await expect(groups.locator('strong')).toHaveText(['Title deeds', 'Revenue records', 'EC & tax receipts', 'Map & boundaries', 'Status']);
    const title = checks.getByRole('region', { name: 'Title deeds' });
    await expect(title.locator('> .note')).toHaveText('All met');
    // Inside a group: fails first, passed last.
    const map = checks.getByRole('region', { name: 'Map & boundaries' });
    await expect(map.getByRole('listitem').first()).toHaveClass(/\b(fail|warn)\b/);
    // A passed check is a tick: no way in, said "Passed" to a screen reader.
    const deed = rows.filter({ hasText: 'Registered title deed on file' });
    await expect(deed).toHaveClass(/\bpass\b/);
    await expect(deed.locator('svg.ov-mark')).toBeVisible();
    await expect(deed.getByText('Passed.')).toBeAttached();
    await expect(deed.getByRole('button')).toHaveCount(0);
    await expect(checks.locator('li.pass')).toHaveCount(5);
    // A failure says what is missing, with its one way in.
    const sides = rows.filter({ hasText: 'Boundaries recorded' });
    await expect(map).toContainText('South, East, West not recorded');
    await expect(sides.getByRole('button', { name: 'Add: Boundaries recorded' })).toBeVisible();
    // A warning says what was found.
    await expect(checks.getByRole('region', { name: 'Revenue records' }))
      .toContainText('Deed says 4.12 ac, passbook says 4.30 ac');
    // What the data cannot tell is a dash with the reason, never a guess.
    const lp = rows.filter({ hasText: 'LP number / ULPIN' });
    await expect(lp).toHaveClass(/\bunknown\b/);
    await expect(lp.getByText('Cannot tell.')).toBeAttached();
    // The area's policy adds its own: a review with no way in.
    await expect(rows.filter({ hasText: 'Restriction and dispute review' }).getByRole('button')).toHaveCount(0);
  });

  test('a check’s Add opens the drawer its field is in, on that field', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const checks = card(page, 'Compliance check');
    await checks.getByRole('button', { name: 'Add: LP number / ULPIN' }).click();
    const identity = page.getByRole('dialog', { name: 'Edit identity' });
    await expect(identity.getByLabel('LP number (resurvey)')).toBeFocused();
    await identity.getByRole('button', { name: 'Cancel' }).click();
    await expect(identity).toHaveCount(0);
    await checks.getByRole('button', { name: 'Add: Mutation in your name' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit status' }).getByLabel('Mutation')).toBeFocused();
  });

  test('a title check opens Title; Upload files a document; Order opens the order flow on that service', async ({ page }) => {
    await page.goto(at(ID.plot));
    const checks = card(page, 'Compliance check');
    await checks.getByRole('button', { name: 'Add: Title chain recorded' }).click();
    const hold = page.getByRole('dialog', { name: 'Title' });
    await expect(hold).toBeVisible();
    await hold.getByRole('button', { name: 'Cancel' }).click();
    await expect(hold).toHaveCount(0);
    await checks.getByRole('button', { name: 'Upload: Land tax receipt on file' }).click();
    const file = page.getByRole('dialog', { name: 'File a document' });
    await expect(file).toBeVisible();
    await file.getByRole('button', { name: 'Cancel' }).click();
    await expect(file).toHaveCount(0);
    const ec = checks.getByRole('link', { name: 'Order: Encumbrance certificate on file' });
    await expect(ec).toHaveAttribute('href', `/order?for=${ID.plot}&step=services&service=ec`);
    await ec.click();
    await expect(page).toHaveURL(/\/order\?.*service=ec/);
  });

  test('an empty Status says so in one line, and its Add is the way in', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    const status = page.locator('section.card.ov-bare').filter({ hasText: 'Status · nothing recorded yet' });
    await status.getByRole('button', { name: 'Add status' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit status' });
    await drawer.getByLabel('Encumbrance').fill('Nil EC to 2024');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.lastVars('setRecordFields'))
      .toEqual({ recordId: ID.parcel, fields: [{ key: 'ec_status', value: 'Nil EC to 2024' }] });
  });

  test('a refused group save keeps the drawer and what was typed, and says why', async ({ page, world }) => {
    world.set('setRecordFields', World.gqlError('lp_no is too long'));
    await page.goto(at(ID.parcel));
    await card(page, 'Identity').getByRole('button', { name: 'Edit identity' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit identity' });
    await drawer.getByLabel('LP number (resurvey)').fill('LP 312');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer.getByRole('alert')).toContainText('lp_no is too long');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('LP number (resurvey)')).toHaveValue('LP 312');
    expect(world.calls('setRecordFields')).toHaveLength(1);
  });

  test('a refused choice keeps the conflict and says it was not saved', async ({ page, world }) => {
    world.set('chooseFieldClaim', World.gqlError('that claim is gone'));
    await page.goto(at(ID.parcel));
    const row = card(page, 'Physical').locator('dl > div').filter({ hasText: 'Extent' });
    await row.getByRole('button', { name: 'Use this: extent from the deed' }).click();
    await expect.poll(() => world.calls('chooseFieldClaim').length).toBe(1);
    await expect(page.getByRole('alert').filter({ hasText: 'That choice could not be saved' })).toBeVisible();
    await expect(row.getByText('Deed 4412/1998 says 4.12 ac')).toBeVisible();
    await expect(row).toContainText('4.30 ac');
    await expect(row.getByRole('button', { name: 'Keep mine: your extent' })).toBeEnabled();
  });

  test('nothing passed: every check listed as a failure, an empty bar, no tick', async ({ page, world }) => {
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as { compliance: { checks: Record<string, unknown>[] } };
      const checks = o.compliance.checks.map((c) => ({ ...c, status: 'fail', action: 'none' }));
      return { ...o, compliance: { ...o.compliance, checks, passed: 0, total: checks.length } };
    });
    await page.goto(at(ID.parcel));
    const checks = card(page, 'Compliance check');
    await expect(checks.getByText('0 of 14 checks passed')).toBeVisible();
    await expect(checks.locator('li.fail')).toHaveCount(14);
    await expect(checks.locator('li.pass')).toHaveCount(0);
    await expect(checks.getByText('All met')).toHaveCount(0);
  });

  test('an unknown the owner can answer sits in its group with its way in', async ({ page, world }) => {
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as { compliance: { checks: Record<string, unknown>[] } };
      const keep = new Set(['boundaries', 'court', 'policy.restrictions']);
      const checks = o.compliance.checks.map((c) => (keep.has(String(c.key)) ? c : { ...c, status: 'pass', action: 'none' }));
      return { ...o, compliance: { ...o.compliance, checks, passed: checks.length - 3, total: checks.length } };
    });
    await page.goto(at(ID.parcel));
    const checks = card(page, 'Compliance check');
    const status = checks.getByRole('region', { name: 'Status' });
    const court = status.getByRole('listitem').filter({ hasText: 'No court case recorded' });
    await expect(court).toHaveClass(/\bunknown\b/);
    await expect(court.getByRole('button', { name: 'Add: No court case recorded' })).toBeVisible();
    await expect(checks.getByRole('region', { name: 'Title deeds' }).locator('> .note')).toHaveText('All met');
  });

  test('a long boundary wraps by words and leaves West and East their room', async ({ page, world }) => {
    const long = 'Land of Sri Gopalakrishna Venkata Subrahmanyeswara Rao and the panchayat cart track to Katragunta tank bund';
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as { fields: Record<string, unknown>[] };
      return {
        ...o,
        fields: o.fields.map((f) => {
          if (f.key === 'boundary_north') return { ...f, value: long, display: long };
          if (f.key === 'boundary_west' || f.key === 'boundary_east') return { ...f, value: 'Sy 213', display: 'Sy 213' };
          // Only the boundaries in Physical: the card is bare, Boundaries holds them.
          if (f.group === 'physical') return { ...f, value: '', display: '', conflicts: [] };
          return f;
        }),
      };
    });
    await page.goto(at(ID.parcel));
    const compass = card(page, 'Boundaries').locator('.ov-compass');
    await expect(compass.locator('.ov-side-north')).toContainText(long);
    for (const dir of ['west', 'east']) {
      const box = await compass.locator(`.ov-side-${dir}`).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(120);
    }
    await expect(card(page, 'Physical')).toHaveCount(0);
    await expect(page.locator('section.card.ov-bare').filter({ hasText: 'Physical · nothing recorded yet' }))
      .toBeVisible();
  });

  test('every check passed: all ticks, a full bar, no ways in', async ({ page, world }) => {
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as { compliance: { checks: Record<string, unknown>[] } };
      const checks = o.compliance.checks.map((c) => ({ ...c, status: 'pass', action: 'none' }));
      return { ...o, compliance: { ...o.compliance, checks, passed: checks.length, total: checks.length } };
    });
    await page.goto(at(ID.parcel));
    const checks = card(page, 'Compliance check');
    await expect(checks.getByText('14 of 14 checks passed')).toBeVisible();
    // Every group says it is met; every check a tick, with no ways in.
    await expect(checks.locator('section.missing-group > .note')).toHaveText(Array(5).fill('All met'));
    await expect(checks.locator('li.pass')).toHaveCount(14);
    await expect(checks.getByRole('button')).toHaveCount(0);
    await expect(checks.locator('.fill.good')).toBeVisible();
  });

  test('the summary strip counts every tab and links to it', async ({ page }) => {
    await page.goto(at(ID.parcel));
    const strip = page.locator('.overview-strip');
    const docs = strip.getByRole('link', { name: /Documents/ });
    await expect(docs).toHaveAttribute('href', at(ID.parcel, 'documents'));
    await expect(docs).toContainText('5');
    await expect(docs).toContainText('Sale deed 4412 of 1998');
    await expect(strip.getByRole('link', { name: /Location/ })).toContainText('Pinned');
    await expect(strip.getByRole('link', { name: /Notes/ })).toContainText('14/08/2026');
    await expect(strip.getByRole('link', { name: /Activity/ })).toHaveAttribute('href', at(ID.parcel, 'activity'));
    // A long note is one cut line with its whole text as the title.
    await expect(docs.locator('.s span')).toHaveAttribute('title', 'Sale deed 4412 of 1998');
  });

  test('Use this adopts the deed’s value as the owner’s own, and the conflict clears', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    const row = card(page, 'Physical').locator('dl > div').filter({ hasText: 'Extent' });
    await expect(row.getByText('Deed 4412/1998 says 4.12 ac')).toBeVisible();
    await row.getByRole('button', { name: 'Use this: extent from the deed', exact: true }).click();
    await expect.poll(() => world.calls('chooseFieldClaim').length).toBe(1);
    expect(world.calls('chooseFieldClaim')[0].vars)
      .toEqual({ recordId: ID.parcel, key: 'extent', claimId: 'w-claim-extent-deed' });
    await expect(row.getByText('Deed 4412/1998 says 4.12 ac')).toHaveCount(0);
    await expect(row).toContainText('4.12 ac');
    await expect(row.getByRole('button', { name: 'You entered', exact: true })).toBeVisible();
    await expect(page.getByText(/where your sources disagree/)).toHaveCount(0);
  });

  test('Keep mine keeps the value shown through the keep path, and the conflict clears', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    const row = card(page, 'Physical').locator('dl > div').filter({ hasText: 'Extent' });
    await expect(row.getByText('Deed 4412/1998 says 4.12 ac')).toBeVisible();
    await row.getByRole('button', { name: 'Keep mine: your extent', exact: true }).click();
    await expect.poll(() => world.calls('chooseFieldClaim').length).toBe(1);
    expect(world.calls('chooseFieldClaim')[0].vars).toEqual({ recordId: ID.parcel, key: 'extent', claimId: 'keep' });
    // Not a re-save of the same value, which the server skips as a no-op.
    expect(world.calls('setRecordFields')).toHaveLength(0);
    await expect(row.getByRole('button', { name: /^Keep mine/ })).toHaveCount(0);
    await expect(row.getByText('Deed 4412/1998 says 4.12 ac')).toHaveCount(0);
    await expect(row).toContainText('4.30 ac');
    await expect(page.getByText(/where your sources disagree/)).toHaveCount(0);
  });

  test('the buyer comes first, two names a side, and +N more opens every party', async ({ page, world }) => {
    const party = (name: string, role: string) => ({ name, parentage: '', role, relationship: '', shareNum: 0, shareDen: 0, isGpa: false });
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as Record<string, unknown>;
      return {
        ...o,
        acquisition: {
          ...(o.acquisition as Record<string, unknown>),
          toParties: ['B One', 'B Two', 'B Three'].map((n) => party(n, 'buyer')),
          fromParties: ['S One', 'S Two', 'S Three', 'S Four'].map((n) => party(n, 'seller')),
        },
      };
    });
    await page.goto(at(ID.parcel));
    const parties = card(page, 'Title').locator('dl.ov-parties > div');
    await expect(parties.nth(0)).toContainText('Buyers');
    await expect(parties.nth(1)).toContainText('Sellers');
    await expect(parties.nth(0)).toContainText('B Two');
    await expect(parties.nth(0)).not.toContainText('B Three');
    await expect(parties.nth(1)).not.toContainText('S Three');
    await parties.nth(1).getByRole('button', { name: '+2 more' }).click();
    const drawer = page.getByRole('dialog', { name: 'Parties' });
    await expect(drawer.getByRole('listitem')).toHaveText(['B One', 'B Two', 'B Three', 'S One', 'S Two', 'S Three', 'S Four']);
  });

  test('a public-record acquisition names its RID and schedule', async ({ page, world }) => {
    world.set('recordOverview', (vars, _q, w) => {
      const o = overviewOf(String(vars.id), w) as Record<string, unknown>;
      const acq = o.acquisition as Record<string, unknown>;
      return {
        ...o,
        acquisition: {
          ...acq, deedDocumentId: '', chainLength: 1,
          source: { source: 'public_record', label: 'Public record', sourceRef: 'pr:4412_1998_1204:2',
                    documentId: '', setAt: '2026-10-11T05:00:00Z', confidence: '' },
        },
      };
    });
    await page.goto(at(ID.parcel));
    const hold = card(page, 'Title');
    await expect(hold.getByText('From public record · RID 4412_1998_1204 · schedule 2', { exact: true })).toBeVisible();
    await expect(hold.getByRole('link', { name: 'Open the deed' })).toHaveCount(0);
  });

  test('editing only a seller’s parentage is a change: Save sends it, and closing asks first', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    await card(page, 'Title').getByRole('button', { name: 'Edit title' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await expect(drawer.getByLabel('Parentage 1')).toHaveValue('S/o Venkaiah');
    await drawer.getByLabel('Parentage 1').fill('S/o Ramaiah');
    // Dirty on the parentage alone: dismissing it asks before throwing it away.
    await page.keyboard.press('Escape');
    const ask = page.getByRole('dialog', { name: 'Discard what you have entered?' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Keep editing' }).click();
    await expect(drawer.getByLabel('Parentage 1')).toHaveValue('S/o Ramaiah');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.lastVars('setAcquisition')).toMatchObject({
      recordId: ID.parcel,
      input: { mode: 'sale', docNo: '4412/1998', fromParties: [{ name: 'K. Narayana', parentage: 'S/o Ramaiah' }] },
    });
  });

  test('Registered: No sends no document number, date or office, even when they were filled', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    await card(page, 'Title').getByRole('button', { name: 'Edit title' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await expect(drawer.getByLabel('Document number (no/year)')).toHaveValue('4412/1998');
    await drawer.getByLabel('Registered', { exact: true }).selectOption('no');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect((world.lastVars('setAcquisition').input as Record<string, unknown>)).toMatchObject({
      registered: 'no', docNo: '', regDate: '', sro: '', execDate: '1998-03-10',
    });
  });

  test('emptying a box clears it through setRecordFields after setAcquisition', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    await card(page, 'Title').getByRole('button', { name: 'Edit title' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await expect(drawer.getByLabel('Registration office')).not.toHaveValue('');
    await drawer.getByLabel('Registration office').fill('');
    await drawer.getByLabel('Consideration (₹)').fill('');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('setAcquisition')).toHaveLength(1);
    // A blank is "not stated" to setAcquisition; the clear is its own write.
    expect(world.lastVars('setRecordFields')).toEqual({
      recordId: ID.parcel, fields: [{ key: 'sro', value: '' }, { key: 'consideration', value: '' }],
    });
  });

  test('a save that empties nothing sends no clear', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    await card(page, 'Title').getByRole('button', { name: 'Edit title' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await drawer.getByLabel('Registration office').fill('Ongole');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('setAcquisition')).toHaveLength(1);
    expect(world.calls('setRecordFields')).toHaveLength(0);
  });

  test('a group’s Edit sends only the field that changed', async ({ page, world }) => {
    await page.goto(at(ID.parcel));
    await card(page, 'Identity').getByRole('button', { name: 'Edit identity' }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit identity' });
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('LP number (resurvey)').fill('LP 312');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('setRecordFields')[0].vars)
      .toEqual({ recordId: ID.parcel, fields: [{ key: 'lp_no', value: 'LP 312' }] });
  });
});

test.describe('a property nothing is known about', () => {
  test('asks how the land was got instead of drawing empty cards', async ({ page }) => {
    await page.goto(at(ID.plot));
    const hold = card(page, 'Title');
    await expect(hold.getByText('How did you get this land? Add the deed, or tell us.')).toBeVisible();
    await expect(hold.getByRole('button', { name: 'Upload the deed' })).toBeVisible();
    await expect(hold.getByRole('button', { name: 'Enter it' })).toBeVisible();
    await expect(hold.locator('dl')).toHaveCount(0);
    // The empty Physical group is one line, not a card of blanks; its gap is listed once.
    await expect(card(page, 'Physical')).toHaveCount(0);
    await expect(page.locator('section.card.ov-bare').filter({ hasText: 'Physical · nothing recorded yet' }))
      .toBeVisible();
    const checks = card(page, 'Compliance check');
    await expect(checks.getByRole('listitem').filter({ hasText: 'Survey number and extent recorded' })).toContainText('Extent not recorded');
    await checks.getByRole('button', { name: 'Add: Survey number and extent recorded' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit physical' }).getByLabel('Extent')).toBeFocused();
  });

  test('Upload the deed files the reading, and the tab refetches to show it', async ({ page, world }) => {
    readerSaysDeed(world);
    await page.goto(at(ID.plot));
    const hold = card(page, 'Title');
    await hold.getByRole('button', { name: 'Upload the deed' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    const reads = world.calls('recordOverview').length;
    await drawer.getByRole('button', { name: 'File the document' }).click();
    await expect.poll(() => world.calls('fileDeedReading').length).toBe(1);
    expect(world.lastVars('fileDeedReading')).toEqual({ recordId: ID.plot, paperId: 'w-paper-new', jobId: 'w-reading' });
    await expect(drawer).toHaveCount(0);
    // No reload: the write refreshed the Overview's read.
    await expect.poll(() => world.calls('recordOverview').length).toBeGreaterThan(reads);
    await expect(hold.getByText('From deed 1576/1989', { exact: true })).toBeVisible();
    await expect(hold.getByText('How did you get this land? Add the deed, or tell us.')).toHaveCount(0);
  });

  test('Enter it saves how the land was acquired, and will not save without a mode', async ({ page, world }) => {
    await page.goto(at(ID.plot));
    await card(page, 'Title').getByRole('button', { name: 'Enter it' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await expect(drawer.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(drawer.getByText('Choose how you got this land to save it.')).toBeVisible();
    await drawer.getByLabel('How you got it').selectOption('inheritance');
    await drawer.getByLabel('Registered', { exact: true }).selectOption('no');
    await expect(drawer.getByLabel('Document number (no/year)')).toHaveCount(0);
    await drawer.getByLabel('Legal-heir or succession certificate number').fill('LHC 44/2019');
    await drawer.getByLabel('Name 1').fill('Ramaiah');
    await drawer.getByLabel('Relationship 1').fill('father');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('setAcquisition')[0].vars).toMatchObject({
      recordId: ID.plot,
      input: {
        mode: 'inheritance', registered: 'no', proofNo: 'LHC 44/2019',
        fromParties: [{ name: 'Ramaiah', relationship: 'father', role: 'deceased' }],
      },
    });
  });

  test('Upload the deed that cannot fill the record says so and offers Enter it', async ({ page, world }) => {
    readerSaysDeed(world);
    world.set('fileDeedReading', World.gqlError('That reading has not finished'));
    await page.goto(at(ID.plot));
    await card(page, 'Title').getByRole('button', { name: 'Upload the deed' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    await drawer.getByRole('button', { name: 'File the document' }).click();
    // Filed as a paper, but never closed as if the record were filled.
    await expect(drawer.getByRole('alert')).toContainText('could not fill Title');
    await expect(drawer.getByRole('alert')).toContainText('That reading has not finished');
    expect(world.calls('addPaper')).toHaveLength(1);
    await drawer.getByRole('button', { name: 'Enter it' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible();
  });

  test('Upload the deed the reader cannot read says so and offers Enter it', async ({ page, world }) => {
    // Storage takes the file; the seal's default reader reads nothing from it.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-deed-1576', name: 'deed-scan.pdf', sizeBytes: 2_048, mimeType: 'application/pdf' },
    }));
    await page.goto(at(ID.plot));
    await card(page, 'Title').getByRole('button', { name: 'Upload the deed' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    await drawer.getByRole('button', { name: 'File the document' }).click();
    await expect(drawer.getByRole('alert')).toContainText('could not fill Title');
    expect(world.calls('fileDeedReading')).toHaveLength(0);
    await drawer.getByRole('button', { name: 'Enter it' }).click();
    await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible();
  });

  test('a refused save keeps the drawer and what was typed, and says so', async ({ page, world }) => {
    world.set('setAcquisition', World.gqlError('mode is not allowed'));
    await page.goto(at(ID.plot));
    await card(page, 'Title').getByRole('button', { name: 'Enter it' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await drawer.getByLabel('How you got it').selectOption('gift');
    await drawer.getByLabel('Name 1').fill('Lakshmi');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer.getByRole('alert')).toContainText('mode is not allowed');
    await expect(drawer.getByLabel('Name 1')).toHaveValue('Lakshmi');
  });
});

test.describe('a deed added on Documents', () => {
  test('offers itself for Title, and files the reading only on yes', async ({ page, world }) => {
    readerSaysDeed(world);
    await page.goto(at(ID.parcel, 'documents'));
    await page.locator('header.sechead').getByRole('button', { name: 'Add a document' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    await drawer.getByRole('button', { name: 'File the document' }).click();
    await expect.poll(() => world.calls('addPaper').length).toBe(1);
    // Filed as a paper, and held open with the question — never filed onto
    // the master record by itself (an older deed in the chain must not win).
    const use = drawer.getByRole('button', { name: 'Use this deed as the title deed' });
    await expect(use).toBeVisible();
    await expect(drawer.getByText(/^Sale Deed 1576\/1989 reads as a deed/)).toBeVisible();
    expect(world.calls('fileDeedReading')).toHaveLength(0);
    await use.click();
    await expect.poll(() => world.calls('fileDeedReading').length).toBe(1);
    expect(world.lastVars('fileDeedReading')).toEqual({ recordId: ID.parcel, paperId: 'w-paper-new', jobId: 'w-reading' });
    await expect(drawer).toHaveCount(0);
  });

  test('Done leaves the deed a document and files nothing onto the record', async ({ page, world }) => {
    readerSaysDeed(world);
    await page.goto(at(ID.parcel, 'documents'));
    await page.locator('header.sechead').getByRole('button', { name: 'Add a document' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    await drawer.getByRole('button', { name: 'File the document' }).click();
    await expect(drawer.getByRole('button', { name: 'Use this deed as the title deed' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Done' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.calls('fileDeedReading')).toHaveLength(0);
  });

  test('a refused filing says so in the drawer and keeps the offer', async ({ page, world }) => {
    readerSaysDeed(world);
    world.set('fileDeedReading', World.gqlError('That reading has not finished'));
    await page.goto(at(ID.parcel, 'documents'));
    await page.locator('header.sechead').getByRole('button', { name: 'Add a document' }).click();
    const drawer = page.getByRole('dialog', { name: 'File a document' });
    await drawer.getByLabel('Add a document to this property').setInputFiles(DEED_FILE, { timeout: 60_000 });
    await drawer.getByRole('button', { name: 'File the document' }).click();
    await drawer.getByRole('button', { name: 'Use this deed as the title deed' }).click();
    await expect(drawer.getByRole('alert')).toContainText('could not fill Title');
    await expect(drawer.getByRole('button', { name: 'Use this deed as the title deed' })).toBeVisible();
  });
});

test.describe('a watched property', () => {
  test('asks no names in Title, says why, and sends none', async ({ page, world }) => {
    await page.goto(at(ID.watched));
    await card(page, 'Title').getByRole('button', { name: 'Enter it' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title' });
    await expect(drawer.getByText(/You are watching this land, so the names/)).toBeVisible();
    await expect(drawer.getByLabel('Name 1')).toHaveCount(0);
    await expect(drawer.getByText('From whom')).toHaveCount(0);
    await drawer.getByLabel('How you got it').selectOption('sale');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer).toHaveCount(0);
    expect(world.lastVars('setAcquisition')).toMatchObject({ recordId: ID.watched, input: { mode: 'sale', fromParties: [] } });
  });
});

test.describe('the Overview read', () => {
  test('holds its shape while the first read is pending', async ({ page, world }) => {
    world.set('recordOverview', World.never());
    await page.goto(at(ID.parcel));
    await expect(page.getByRole('status', { name: 'Loading the overview' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a failed read says so once, inside the frame', async ({ page, world }) => {
    world.set('recordOverview', World.gqlError('overview exploded'));
    await page.goto(at(ID.parcel));
    await expect(page.getByText("This property's overview did not load")).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(tabs(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });
});

/** D1 (Reddy, 12/10/2026): Sy 88 as the assistant once saved Katragunta — a
 *  13.05-acre holding filed as an open plot in square yards. The server flags
 *  it until convertRecordKind moves it. */
function farmlandPlot(world: World, target: Record<string, unknown> = {}): void {
  world.set('record', (vars) => (String(vars.id) === ID.plot
    ? { ...recordOf(ID.plot), kind: 'property', eyebrow: 'Open plot', classification: 'Open plot',
        extent: 63_162, extentUnit: 'sq.yd', extentDetail: '' }
    : recordOf(String(vars.id))));
  world.set('recordOverview', (vars, _q, w) => {
    const moved = w.calls('convertRecordKind').some((c) => c.vars.recordId === vars.id);
    return {
      ...overviewOf(String(vars.id), w),
      suggestKind: String(vars.id) === ID.plot && !moved ? 'parcel' : '',
      suggestReason: String(vars.id) === ID.plot && !moved
        ? 'The public record measures it in acres and names no plot or house' : '',
      // The server's preview, from the same code as the move (F1/F10).
      convertTarget: String(vars.id) === ID.plot && !moved
        ? { reuse: false, khataNo: '', village: 'Katragunta', fromArea: 63_162, fromUnit: 'sq.yd',
            acres: 13.05, ...target }
        : null,
    };
  });
}

const PROMPT = 'This reads as farmland — keep it as agricultural land in acres?';

test.describe('farmland saved as a plot (D1)', () => {
  test('asks once, says what changes, and Convert moves it at the same address', async ({ page, world }) => {
    farmlandPlot(world);
    await page.goto(at(ID.plot));
    await expect(page.getByText(PROMPT)).toBeVisible();
    await expect(page.getByText('The public record measures it in acres and names no plot or house.')).toBeVisible();
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Change to agricultural land?' });
    await expect(dlg).toContainText('63,162 sq.yd becomes 13.05 ac');
    await expect(dlg).toContainText('It moves under a new khata you can fill in later.');
    await dlg.getByRole('button', { name: 'Change to agricultural land' }).click();
    await expect.poll(() => world.calls('convertRecordKind').length).toBe(1);
    expect(world.lastVars('convertRecordKind')).toEqual({ recordId: ID.plot, to: 'parcel' });
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText(PROMPT)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${at(ID.plot)}$`));
  });

  test('says the unit the property is in and the khata the server will use', async ({ page, world }) => {
    farmlandPlot(world, { reuse: true, khataNo: '399', fromArea: 40, fromUnit: 'guntas', acres: 1 });
    await page.goto(at(ID.plot));
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Change to agricultural land?' });
    await expect(dlg).toContainText('40 guntas becomes 1.00 ac');
    await expect(dlg).toContainText('It moves under your khata 399 in Katragunta.');
    await expect(dlg).not.toContainText('sq.yd');
  });

  test('Not now hides the prompt, sends nothing, and stays hidden on this browser', async ({ page, world }) => {
    farmlandPlot(world);
    await page.goto(at(ID.plot));
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText(PROMPT)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
    await expect(page.getByText(PROMPT)).toHaveCount(0);
    expect(world.calls('convertRecordKind')).toHaveLength(0);
  });

  test('Not now answers for one property, not the next one opened in the same page', async ({ page, world }) => {
    farmlandPlot(world);
    world.set('recordOverview', (vars, _q, w) => ({
      ...overviewOf(String(vars.id), w), suggestKind: 'parcel', suggestReason: '' }));
    await page.goto(at(ID.plot));
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText(PROMPT)).toHaveCount(0);
    // A client-side move to another record: the component may be reused.
    await page.evaluate((url) => {
      history.pushState({}, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    }, at(ID.flat));
    await expect(page).toHaveURL(new RegExp(`${at(ID.flat)}$`));
    await expect(page.getByText(PROMPT)).toBeVisible();
  });

  test('the ⋮ menu offers it on land in sq.yd, and a refusal is said in the dialog', async ({ page, world }) => {
    farmlandPlot(world);
    world.set('convertRecordKind',
      World.gqlError('It has a door number, so it reads as a house, so it cannot become agricultural land.'));
    await page.goto(at(ID.plot));
    await page.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Change to agricultural land' }).click();
    const dlg = page.getByRole('dialog', { name: 'Change to agricultural land?' });
    await dlg.getByRole('button', { name: 'Change to agricultural land' }).click();
    await expect(dlg.getByRole('alert')).toContainText('it cannot become agricultural land');
    expect(world.calls('convertRecordKind')).toHaveLength(1);
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(PROMPT)).toBeVisible();
  });

  test('is not offered on farmland or on a building', async ({ page }) => {
    for (const id of [ID.parcel, ID.flat]) {
      await page.goto(at(id));
      await page.getByRole('button', { name: /^Actions for / }).click();
      await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Change to agricultural land' })).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await expect(page.getByText(PROMPT)).toHaveCount(0);
  });
});

test.describe('the creating source on Activity (D2)', () => {
  test('says which file or public record the property was created from', async ({ page, world }) => {
    world.set('recordHistory', [
      { id: 'e2', action: 'record.source_bound', detail: '', field: '', was: '', now: '',
        at: '2026-10-12T06:00:00Z', by: 'You',
        source: 'Deed katragunta-1989.pdf filed as the title deed' },
      { id: 'e1', action: 'create_parcel', detail: 'Sy 214/2', field: '', was: '', now: '',
        at: '2026-10-11T06:00:00Z', by: 'You', source: 'Created from katragunta-1989.pdf' },
    ]);
    await page.goto(at(ID.parcel, 'activity'));
    await expect(page.getByText('Created from katragunta-1989.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText('Filed the deed as its source', { exact: true })).toBeVisible();
    await expect(page.getByText('Deed katragunta-1989.pdf filed as the title deed')).toBeVisible();
  });

  test('a bound deed whose detail says the same sentence shows it once', async ({ page, world }) => {
    const line = 'Deed katragunta-1989.pdf filed as the title deed';
    world.set('recordHistory', [
      { id: 'e2', action: 'record.source_bound', detail: line, field: '', was: '', now: '',
        at: '2026-10-12T06:00:00Z', by: 'You', source: line },
    ]);
    await page.goto(at(ID.parcel, 'activity'));
    await expect(page.getByText('Filed the deed as its source', { exact: true })).toBeVisible();
    await expect(page.getByText(line, { exact: true })).toHaveCount(1);
  });
});
