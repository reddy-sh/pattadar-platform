/**
 * Compliance rules (w360/pages/ComplianceAdmin.tsx), the super-admin's
 * policy screen at /admin/compliance:
 *
 *   head  — "Compliance rules", the in-effect policy's status pill, a summary
 *           of every configured scope, and two commands: New scope (a dialog)
 *           and Government naming (a drawer).
 *   band  — the scope's place line over the State · District · Mandal ·
 *           Village filter.
 *   tabs  — nine views of the policy; Manage holds the draft editor, publish,
 *           archive and the change history.
 *
 * The world here is a small in-memory policy store that answers the way
 * web360.py does: the admin read is the most specific draft-or-published
 * row (_policy_row with published_only=False), a save adds a draft revision
 * and refuses a stale expectedRevision, publish supersedes the previous
 * published revision, and archive refuses the country fallback while it has
 * no replacement. So each operation is followed by the read the page makes
 * next, not by a canned answer.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '@playwright/test';

type Row = {
  id: string; scopeKey: string; countryCode: string; stateCode: string; districtCode: string;
  mandalCode: string; villageCode: string; revision: number; status: string; schemaVersion: number;
  document: string; sourceDigest: string; createdBy: string; createdAt: string;
  publishedBy: string; publishedAt: string;
};
type Event = {
  id: string; policyId: string; scopeKey: string; revision: number; actor: string;
  action: string; detail: string; sourceDigest: string; createdAt: string;
};
type Vars = Record<string, unknown>;

/** The parts of the policy document the page reads, small enough to read. */
const DOCUMENT = (state = '*') => ({
  schemaVersion: 1,
  jurisdiction: {
    countryCode: 'IN', countryName: 'India', stateCode: state,
    stateName: state === '*' ? 'All states and union territories' : 'Andhra Pradesh',
    districtCode: '*', districtName: 'All districts', authorityName: 'Government of India',
    localTerms: { recordOfRights: 'Adangal / 1-B', cadastralSketch: 'FMB sketch' },
  },
  policy: {
    name: 'Baseline', effectiveOn: '2026-09-20', reviewBy: '2027-03-20',
    legalNotice: 'Operational guidance only. Verify current requirements with the competent authority.',
  },
  propertyTypes: [{
    key: 'agri', label: 'Agricultural land', matches: ['agricultural'],
    items: [
      { key: 'passbook', title: 'Pattadar passbook', why: 'Shows who the revenue record names.', level: 'required', share: 'purpose', sourceIds: ['dolr'] },
      { key: 'ec', title: 'Encumbrance certificate', why: 'Shows registered charges.', level: 'conditional', share: 'purpose', sourceIds: ['dolr'] },
    ],
  }],
  guides: [
    { key: 'buyer', label: 'Buyer guidance', items: ['Read the title chain.', 'Check the encumbrance certificate.'] },
    { key: 'seller', label: 'Seller guidance', items: ['Collect the passbook.'] },
  ],
  serviceRequests: [{
    key: 'survey', label: 'Land survey', purpose: 'Measure the parcel on the ground.',
    share: ['Survey number'], doNotShare: ['Aadhaar'], controls: ['Expire the link'], sourceIds: ['dolr'],
  }],
  secureSharing: {
    label: 'Secure sharing baseline', shareWhenNeeded: ['Property identifiers'],
    neverByDefault: ['Aadhaar', 'Bank details'], controls: ['Allow immediate revocation'], sourceIds: ['dpdp'],
  },
  workforceCompliance: [
    { key: 'cert', category: 'certification', title: 'Certified surveyor', rule: 'Hold a current licence.', enforcement: 'desk' },
    { key: 'rate', category: 'rating', title: 'Retrain below 3 stars', rule: 'Retraining before new work.', enforcement: 'desk' },
  ],
  sources: [
    { id: 'dolr', authority: 'Department of Land Resources', title: 'Registration FAQ', url: 'https://dolr.gov.in/', appliesTo: ['*'] },
    { id: 'dpdp', authority: 'MeitY', title: 'DPDP Act', url: 'https://www.meity.gov.in/', appliesTo: ['*'] },
  ],
});

const row = (over: Partial<Row>): Row => ({
  id: 'gps-x', scopeKey: 'IN/*/*/*/*', countryCode: 'IN', stateCode: '*', districtCode: '*',
  mandalCode: '*', villageCode: '*', revision: 1, status: 'published', schemaVersion: 1,
  document: JSON.stringify(DOCUMENT()), sourceDigest: 'aaaaaaaaaaaaaaaaaaaa', createdBy: 'system-baseline',
  createdAt: '2026-09-20', publishedBy: 'system-baseline', publishedAt: '2026-09-20', ...over,
});

const LEVELS = ['stateCode', 'districtCode', 'mandalCode', 'villageCode'] as const;

/** The policy store, and the world wired to answer from it. */
function policyStore(world: World) {
  const rows: Row[] = [
    row({ id: 'gps-in', scopeKey: 'IN/*/*/*/*' }),
    row({ id: 'gps-ap', scopeKey: 'IN/AP/*/*/*', stateCode: 'AP', document: JSON.stringify(DOCUMENT('AP')), sourceDigest: 'bbbbbbbbbbbbbbbbbbbb' }),
  ];
  const events: Event[] = [
    { id: 'gpe-in', policyId: 'gps-in', scopeKey: 'IN/*/*/*/*', revision: 1, actor: 'system-baseline', action: 'publish', detail: 'Initial researched India baseline', sourceDigest: 'aaaaaaaaaaaaaaaaaaaa', createdAt: '2026-09-20' },
    { id: 'gpe-ap', policyId: 'gps-ap', scopeKey: 'IN/AP/*/*/*', revision: 1, actor: 'system-baseline', action: 'publish', detail: 'Initial researched Andhra Pradesh baseline', sourceDigest: 'bbbbbbbbbbbbbbbbbbbb', createdAt: '2026-09-20' },
  ];
  let n = 0;
  const keyOf = (v: Vars) => `IN/${v.stateCode}/${v.districtCode}/${v.mandalCode ?? '*'}/${v.villageCode ?? '*'}`;
  const record = (r: Row, action: string, detail: string) => events.unshift({
    id: `gpe-${++n}`, policyId: r.id, scopeKey: r.scopeKey, revision: r.revision, actor: 'shankarreddy.t',
    action, detail, sourceDigest: r.sourceDigest, createdAt: '2026-10-09T10:15:00+00:00',
  });
  world.setAll({
    governanceAdminPolicy: (v: Vars) => {
      const fit = (r: Row) => LEVELS.every((l) => r[l] === '*' || r[l] === v[l]);
      const score = (r: Row) => LEVELS.reduce((s, l, i) => s + (r[l] === v[l] ? 8 >> i : 0), 0);
      return rows.filter((r) => fit(r) && (r.status === 'draft' || r.status === 'published'))
        .sort((a, b) => score(b) - score(a) || b.revision - a.revision)[0] ?? null;
    },
    governanceAdminPolicies: () => {
      const latest = new Map<string, Row>();
      for (const r of rows) if ((latest.get(r.scopeKey)?.revision ?? 0) < r.revision) latest.set(r.scopeKey, r);
      return [...latest.values()];
    },
    // Cascades downward like governance.cascade_pattern: a wildcard tail
    // matches every scope under it.
    governancePolicyHistory: (v: Vars) => {
      const key = String(v.scopeKey);
      const stem = key.replace(/(\/\*)+$/, '');
      return events.filter((e) => e.scopeKey === key || (stem !== key && e.scopeKey.startsWith(`${stem}/`)));
    },
    saveGovernancePolicy: (v: Vars) => {
      try { JSON.parse(String(v.document)); } catch { return null; }
      const key = keyOf(v);
      const latest = rows.filter((r) => r.scopeKey === key).sort((a, b) => b.revision - a.revision)[0];
      if (v.expectedRevision && (latest?.revision ?? 0) !== v.expectedRevision) return null;
      const made = row({
        id: `gps-${++n}`, scopeKey: key, stateCode: String(v.stateCode), districtCode: String(v.districtCode),
        mandalCode: String(v.mandalCode ?? '*'), villageCode: String(v.villageCode ?? '*'),
        revision: (latest?.revision ?? 0) + 1, status: 'draft', document: String(v.document),
        sourceDigest: `d${n}`.padEnd(20, '0'), createdBy: 'shankarreddy.t', createdAt: '2026-10-09',
        publishedBy: '', publishedAt: '',
      });
      rows.push(made);
      record(made, latest ? 'revise' : 'create', String(v.reason));
      return made;
    },
    publishGovernancePolicy: (v: Vars) => {
      const r = rows.find((x) => x.id === v.policyId);
      if (!r || r.status !== 'draft') return null;
      for (const x of rows) if (x.scopeKey === r.scopeKey && x.status === 'published') x.status = 'superseded';
      r.status = 'published';
      record(r, 'publish', String(v.reason) || 'Published revision');
      return r;
    },
    archiveGovernancePolicy: (v: Vars) => {
      const r = rows.find((x) => x.id === v.policyId);
      if (!r || r.status === 'archived' || !String(v.reason).trim()) return false;
      if (r.stateCode === '*' && r.districtCode === '*'
          && !rows.some((x) => x.scopeKey === r.scopeKey && x.status === 'published' && x.id !== r.id)) return false;
      r.status = 'archived';
      record(r, 'archive', String(v.reason));
      return true;
    },
    // The new-scope dialog's reference read. Only states are answered, so
    // District falls back to the typed field, as it does before an LGD sync.
    'root.states': [
      { id: 'st-ap', name: 'Andhra Pradesh', code: 'AP', lgdCode: '28', nameLocal: '', sourceId: 'lgd', sourceUrl: '', sourceEffectiveAt: '', active: true },
      { id: 'st-tg', name: 'Telangana', code: 'TG', lgdCode: '36', nameLocal: '', sourceId: 'lgd', sourceUrl: '', sourceEffectiveAt: '', active: true },
    ],
  });
  return { rows, events };
}

const superAdmin = (world: World) =>
  world.set('portfolio', { ...world.seedOf('portfolio'), isSuperAdmin: true });

async function open(page: Page, world: World) {
  superAdmin(world);
  const store = policyStore(world);
  await page.goto('/admin/compliance');
  await expect(page.getByRole('heading', { level: 1, name: 'Compliance rules' })).toBeVisible();
  return store;
}

const head = (page: Page) => page.locator('header.pagehead');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const policyScope = (page: Page) => page.getByLabel('Policy scope');

async function chooseState(page: Page, name: string) {
  // The band's filter is the page's first; a tab's own filter comes after it.
  await page.getByRole('button', { name: '+ Filter' }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${name} \\d`) }).click();
  await page.keyboard.press('Escape');
}

test.describe('the compliance rules head and band', () => {
  test('the head states every configured scope, not one revision', async ({ page, world }) => {
    await open(page, world);
    await expect(head(page).locator('.pagehead-summary')).toHaveText('2 configured scopes · 2 published');
    await expect(head(page).getByText('Published', { exact: true })).toBeVisible();
    await expect(head(page).getByRole('button', { name: 'New scope' })).toBeVisible();
    await expect(head(page).getByRole('button', { name: 'Government naming' })).toBeVisible();
    await expect(page).toHaveTitle('Compliance rules · Pattadar');
  });

  test('the place line names the scope and where its policy comes from', async ({ page, world }) => {
    await open(page, world);
    await expect(policyScope(page)).toContainText('All states and union territories');
    await expect(policyScope(page)).toContainText('Own policy · revision 1');
  });

  test('choosing a state in the filter reads that state\'s own policy', async ({ page, world }) => {
    await open(page, world);
    await chooseState(page, 'Andhra Pradesh');
    await expect(policyScope(page)).toContainText('Andhra Pradesh');
    await expect(policyScope(page)).toContainText('Own policy');
    expect(world.lastVars('governanceAdminPolicy')).toMatchObject({ stateCode: 'AP', districtCode: '*' });
  });

  test('a non-super-admin sees the restriction, never a draft', async ({ page, world }) => {
    policyStore(world);
    await page.goto('/admin/compliance');
    await expect(page.getByText('Compliance administration is restricted')).toBeVisible();
    expect(world.asked('governanceAdminPolicy')).toBe(false);
  });
});

test.describe('the nine policy views', () => {
  test('the views are a real tab list and each panel is headed by its tab', async ({ page, world }) => {
    await open(page, world);
    await expect(page.getByRole('tablist', { name: 'Compliance policy views' }).getByRole('tab')).toHaveCount(9);
    await expect(tab(page, 'Property records')).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: 'Agricultural land' })).toBeVisible();
    await expect(panel).toContainText('Required');
    await expect(panel).toContainText('Conditional');

    await tab(page, 'Property records').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'Buyer')).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('heading', { level: 2, name: 'Buyer guidance' })).toBeVisible();

    for (const [name, heading] of [
      ['Seller', 'Seller guidance'], ['Service requests', 'Land survey'], ['Service visuals', 'Service visuals'],
      ['Company members', 'Company members'], ['Secure sharing', 'Secure sharing baseline'],
      ['Sources', 'Sources'], ['Manage', 'Policy document'],
    ] as const) {
      await tab(page, name).click();
      await expect(panel.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
  });

  test('company member rules filter by category and count with the noun', async ({ page, world }) => {
    await open(page, world);
    await tab(page, 'Company members').click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('2 rules', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('button', { name: /^Certification \d/ }).click();
    await page.keyboard.press('Escape');
    await expect(panel.getByText('1 rule', { exact: true })).toBeVisible();
    await expect(panel.getByText('Certified surveyor')).toBeVisible();
    await expect(panel.getByText('Retrain below 3 stars')).toHaveCount(0);
  });

  test('the government naming drawer lists the terms in sentence case', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Government naming' }).click();
    const drawer = page.getByRole('dialog', { name: 'Government naming' });
    await expect(drawer.getByText('Record of rights', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Adangal / 1-B')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Government naming' })).toBeFocused();
  });
});

test.describe('creating, saving, publishing and archiving a policy', () => {
  test('a new scope is picked in a dialog and cancelling leaves the browsed scope alone', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'New scope' }).click();
    const dialog = page.getByRole('dialog', { name: 'New scope' });
    await dialog.getByLabel('State').selectOption({ label: 'Andhra Pradesh' });
    await expect(dialog.getByRole('button', { name: 'Create revision' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(policyScope(page)).toContainText('All states and union territories');
    await expect(page.getByRole('button', { name: 'New scope' })).toBeFocused();
  });

  test('a district override is created, saved as a draft, published and lands in the history', async ({ page, world }) => {
    const store = await open(page, world);
    await page.getByRole('button', { name: 'New scope' }).click();
    const dialog = page.getByRole('dialog', { name: 'New scope' });
    await dialog.getByLabel('State').selectOption({ label: 'Andhra Pradesh' });
    await dialog.getByLabel('District').fill('Guntur');
    await expect(dialog).toContainText('Andhra Pradesh, Guntur has no policy of its own yet.');
    await dialog.getByRole('button', { name: 'Create override' }).click();

    await expect(tab(page, 'Manage')).toHaveAttribute('aria-selected', 'true');
    await expect(policyScope(page)).toContainText('Guntur');
    await expect(policyScope(page)).toContainText('Inherited from Andhra Pradesh');
    const editor = page.getByLabel('Policy JSON document');
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue(/"districtCode": "GUNTUR"/);
    await expect(editor).toHaveValue(/"districtName": "Guntur"/);

    // Failure path first: no reason, nothing sent.
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('alert')).toHaveText('The draft could not be saved. Enter a change reason.');
    expect(world.calls('saveGovernancePolicy')).toHaveLength(0);

    await page.getByLabel('Change reason').fill('Guntur needs its own sub-registrar note');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(policyScope(page)).toContainText('Own policy · revision 1');
    await expect(head(page).getByText('Draft', { exact: true })).toBeVisible();
    await expect(head(page).locator('.pagehead-summary')).toHaveText('3 configured scopes · 2 published · 1 draft');
    expect(world.lastVars('saveGovernancePolicy')).toMatchObject({
      stateCode: 'AP', districtCode: 'GUNTUR', expectedRevision: 0, reason: 'Guntur needs its own sub-registrar note',
    });

    await page.getByRole('button', { name: 'Publish draft' }).click();
    const confirm = page.getByRole('dialog', { name: 'Publish this draft?' });
    await confirm.getByLabel('Publication reason (optional)').fill('Reviewed with the SRO');
    await confirm.getByRole('button', { name: 'Publish draft' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(head(page).getByText('Published', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create revision' })).toBeFocused();
    expect(store.rows.find((r) => r.scopeKey === 'IN/AP/GUNTUR/*/*')?.status).toBe('published');

    const history = page.locator('.compliance-history');
    await expect(history.getByText('Added', { exact: true })).toBeVisible();
    await expect(history.getByText('Published', { exact: true })).toBeVisible();
    await expect(history).toContainText('Revision 1 · shankarreddy.t · 09/10/2026');
    await expect(history).not.toContainText('2026-10-09');
  });

  test('a save refused by the server says why and keeps the edits', async ({ page, world }) => {
    await open(page, world);
    world.set('saveGovernancePolicy', null);
    await tab(page, 'Manage').click();
    await page.getByRole('button', { name: 'Create revision' }).click();
    const editor = page.getByLabel('Policy JSON document');
    await editor.fill('{"sentinel": true}');
    await page.getByLabel('Change reason').fill('Tighten sharing');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'The draft could not be saved. Check the document is valid, and reload if this scope was revised meanwhile.');
    expect(world.calls('saveGovernancePolicy')).toHaveLength(1);
    await expect(editor).toHaveValue('{"sentinel": true}');
    await expect(page.getByLabel('Change reason')).toHaveValue('Tighten sharing');
  });

  test('archiving asks first, needs a reason and then falls back to the wider scope', async ({ page, world }) => {
    const store = await open(page, world);
    await chooseState(page, 'Andhra Pradesh');
    await tab(page, 'Manage').click();
    await page.getByRole('button', { name: 'Archive scope' }).click();
    const confirm = page.getByRole('dialog', { name: 'Archive this scope?' });
    await expect(confirm).toContainText('Andhra Pradesh stops having its own policy.');

    await confirm.getByRole('button', { name: 'Archive scope' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('The scope could not be archived. Enter an archive reason.');
    expect(world.calls('archiveGovernancePolicy')).toHaveLength(0);

    await confirm.getByLabel('Archive reason').fill('Folded into the national baseline');
    await confirm.getByRole('button', { name: 'Archive scope' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(policyScope(page)).toContainText('Inherited from All states and union territories');
    expect(store.rows.find((r) => r.id === 'gps-ap')?.status).toBe('archived');
    await expect(page.getByRole('button', { name: 'Create override' })).toBeFocused();
    // An archived scope is no longer counted as configured.
    await expect(head(page).locator('.pagehead-summary')).toHaveText('1 configured scope · 1 published');
  });

  test('archiving a draft over a published revision says the published one stays', async ({ page, world }) => {
    const store = await open(page, world);
    await chooseState(page, 'Andhra Pradesh');
    await tab(page, 'Manage').click();
    await page.getByRole('button', { name: 'Create revision' }).click();
    await page.getByLabel('Change reason').fill('Try a stricter list');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('button', { name: 'Archive draft' }).click();
    const confirm = page.getByRole('dialog', { name: 'Archive this draft?' });
    await expect(confirm).toContainText('Andhra Pradesh keeps its published policy if it has one');
    await confirm.getByLabel('Archive reason').fill('Not needed');
    await confirm.getByRole('button', { name: 'Archive draft' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(policyScope(page)).toContainText('Own policy · revision 1');
    await expect(head(page).getByText('Published', { exact: true })).toBeVisible();
    expect(store.rows.find((r) => r.scopeKey === 'IN/AP/*/*/*' && r.revision === 2)?.status).toBe('archived');
  });

  test('the country fallback is never offered for archiving', async ({ page, world }) => {
    await open(page, world);
    await tab(page, 'Manage').click();
    await expect(page.getByRole('button', { name: 'Create revision' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive scope' })).toHaveCount(0);
  });

  test('a refused archive says what to do and leaves the scope alone', async ({ page, world }) => {
    await open(page, world);
    world.set('archiveGovernancePolicy', false);
    await chooseState(page, 'Andhra Pradesh');
    await tab(page, 'Manage').click();
    await page.getByRole('button', { name: 'Archive scope' }).click();
    const confirm = page.getByRole('dialog', { name: 'Archive this scope?' });
    await confirm.getByLabel('Archive reason').fill('Try it');
    await confirm.getByRole('button', { name: 'Archive scope' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('This scope could not be archived. Reload the page and try again.');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(policyScope(page)).toContainText('Own policy');
  });
});

test.describe('the compliance rules failure states', () => {
  test.use({ allowConsole: true }); // a failed read is the point of each test

  test('the policy read failing says so under the same head', async ({ page, world }) => {
    superAdmin(world);
    policyStore(world);
    world.set('governanceAdminPolicy', World.gqlError('policy store down'));
    await page.goto('/admin/compliance');
    await expect(page.getByRole('heading', { level: 1, name: 'Compliance rules' })).toBeVisible();
    await expect(page.getByText('The compliance policy did not load')).toBeVisible();
  });

  test('a failed history read is said, not shown as an empty trail', async ({ page, world }) => {
    await open(page, world);
    world.set('governancePolicyHistory', World.gqlError('events down'));
    await chooseState(page, 'Andhra Pradesh');
    await tab(page, 'Manage').click();
    await expect(page.getByText('The change history did not load')).toBeVisible();
    await expect(page.getByText(/No changes have been recorded/)).toHaveCount(0);
  });
});

test.describe('service visual mappings', () => {
  test('an edited caption saves as an audited draft, and a missing reason is refused', async ({ page, world }) => {
    await open(page, world);
    await tab(page, 'Service visuals').click();
    const panel = page.getByRole('tabpanel');
    await panel.getByRole('button', { name: 'Edit mappings' }).click();
    await panel.getByLabel('Plain-language meaning').first().fill('A surveyor measures the land with the owner present.');

    await panel.getByRole('button', { name: 'Save audited draft' }).click();
    await expect(panel.getByRole('alert')).toHaveText('The visual mapping draft could not be saved. Enter a change reason.');
    expect(world.calls('saveGovernancePolicy')).toHaveLength(0);

    await panel.getByLabel('Change reason').fill('Plainer words');
    await panel.getByRole('button', { name: 'Save audited draft' }).click();
    await expect(panel.getByRole('button', { name: 'Edit mappings' })).toBeVisible();
    const saved = JSON.parse(String(world.lastVars('saveGovernancePolicy').document));
    expect(saved.serviceVisuals.map((v: { caption: string }) => v.caption))
      .toContain('A surveyor measures the land with the owner present.');
    await expect(head(page).getByText('Draft', { exact: true })).toBeVisible();
  });
});

test.describe('the compliance rules page on a phone', () => {
  test('@phone-only the head keeps one row and its commands live in the ⋮', async ({ page, world }) => {
    await open(page, world);
    await expect(head(page).getByRole('button', { name: 'New scope' })).toHaveCount(0);
    const more = page.getByRole('button', { name: 'More actions for Compliance rules' });
    await more.click();
    await page.getByRole('menuitem', { name: 'Government naming' }).click();
    await expect(page.getByRole('dialog', { name: 'Government naming' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
