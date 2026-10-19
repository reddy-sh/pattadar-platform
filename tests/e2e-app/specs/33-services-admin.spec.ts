/**
 * Service catalogue (w360/pages/ServicesAdmin.tsx), the super-admin's view of
 * the service marketplace at /admin/catalogue (spec 2026-10-09 §7).
 *
 * Owners browse the same catalogue read-only (OrderLand's ServiceList); here
 * the same list is in its `manage` mode: a row opens the drawer that edits a
 * service and where it is offered, a price can differ by state and district
 * (each place its own versioned drafts), and a super-admin publishes.
 *
 * The world here is a small in-memory catalogue that answers the way
 * web360.py does: `current` is the newest draft-or-published revision at the
 * place, a save is refused unless it names that revision, publish supersedes
 * the place's previous published revision, and `services` / `inherited` are
 * the code baseline with the published wider places (and `current`) applied,
 * widest first. The server side of the same rules is proven on a real
 * database by services/api/tests/test_catalogue.py.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Locator, Page } from '@playwright/test';

type Vars = Record<string, unknown>;
type CatSet = {
  id: string; scopeKey: string; stateCode: string; districtCode: string; revision: number; status: string;
  document: string; sourceDigest: string; createdBy: string; createdAt: string;
  publishedBy: string; publishedAt: string;
};
type Svc = { label: string; group: string; blurb: string; deliverable: string; price: number; days: number };
type Layer = [string, Record<string, Record<string, unknown>>];

const BASE: Record<string, Svc> = {
  ec: { label: 'Encumbrance certificate', group: 'Records', blurb: 'The registrar\'s list of transactions.', deliverable: 'A certificate', price: 1180, days: 10 },
  survey: { label: 'Land survey', group: 'On the ground', blurb: 'A surveyor walks the boundary.', deliverable: 'A surveyor\'s sheet', price: 2900, days: 14 },
  title_opinion: { label: 'Title opinion', group: 'Legal', blurb: 'An advocate reads the title.', deliverable: 'A written opinion', price: 4500, days: 7 },
};
const FIELDS = ['label', 'blurb', 'deliverable', 'price', 'days', 'enabled'] as const;
const STATES = [
  { id: 'st-ap', name: 'Andhra Pradesh', code: 'AP', lgdCode: '28', nameLocal: '', sourceId: 'lgd', sourceUrl: '', sourceEffectiveAt: '', active: true },
  { id: 'st-ts', name: 'Telangana', code: 'TS', lgdCode: '36', nameLocal: '', sourceId: 'lgd', sourceUrl: '', sourceEffectiveAt: '', active: true },
];

function catalogueStore(world: World) {
  const sets: CatSet[] = [];
  const events: Array<Record<string, unknown>> = [];
  let n = 0;
  const keyOf = (state: string, district: string) =>
    (state === '*' ? 'IN/*' : district === '*' ? `IN/${state}` : `IN/${state}/${district}`);
  const chain = (state: string, district: string) =>
    ['IN/*', ...(state === '*' ? [] : [`IN/${state}`]), ...(state !== '*' && district !== '*' ? [`IN/${state}/${district}`] : [])];
  const doc = (s?: CatSet) => (s ? JSON.parse(s.document).services ?? {} : {});
  const newest = (k: string, statuses: string[]) => sets
    .filter((s) => s.scopeKey === k && statuses.includes(s.status))
    .sort((a, b) => b.revision - a.revision)[0];
  const apply = (layers: Layer[]) => Object.entries(BASE).map(([k, v]) => {
    // The code baseline offers every service in Andhra Pradesh and Telangana.
    const out: Record<string, unknown> = { key: k, ...v, enabled: true, source: '', states: ['AP', 'TS'], districts: [] };
    for (const [scope, services] of layers) {
      const o = services[k];
      if (!o) continue;
      for (const f of FIELDS) if (f in o) out[f] = o[f];
      if (o.areas) Object.assign(out, o.areas as object);
      out.source = scope;
    }
    return out;
  });
  const record = (s: CatSet, action: string, detail: string) => events.unshift({
    id: `sce-${++n}`, setId: s.id, scopeKey: s.scopeKey, revision: s.revision, actor: 'shankarreddy.t',
    action, detail, sourceDigest: `digest${n}`.padEnd(12, '0'), createdAt: '2026-10-09T11:00:00+00:00',
  });
  const place = (v: Vars) => {
    const state = String(v.stateCode || '*');
    return { state, district: state === '*' ? '*' : String(v.districtCode || '*') };
  };
  world.setAll({
    serviceCatalogueAdmin: (v: Vars) => {
      const { state, district } = place(v);
      const k = keyOf(state, district);
      const wider: Layer[] = chain(state, district).filter((key) => key !== k)
        .map((key) => newest(key, ['published'])).filter(Boolean)
        .map((s) => [s!.scopeKey, doc(s)] as Layer);
      const cur = newest(k, ['draft', 'published']);
      const latest = new Map<string, CatSet>();
      for (const s of sets) if ((latest.get(s.scopeKey)?.revision ?? 0) < s.revision) latest.set(s.scopeKey, s);
      return {
        scopeKey: k, stateCode: state, districtCode: district, current: cur ?? null,
        services: apply(cur ? [...wider, [k, doc(cur)]] : wider),
        inherited: apply(wider),
        scopes: [...latest.values()],
      };
    },
    serviceCatalogueRevisions: (v: Vars) => {
      const { state, district } = place(v);
      return sets.filter((s) => s.scopeKey === keyOf(state, district)).sort((a, b) => b.revision - a.revision);
    },
    serviceCatalogueHistory: (v: Vars) => {
      const { state, district } = place(v);
      return events.filter((e) => e.scopeKey === keyOf(state, district));
    },
    saveServiceCatalogue: (v: Vars) => {
      const { state, district } = place(v);
      const k = keyOf(state, district);
      if (!String(v.reason).trim()) return null;
      if ((newest(k, ['draft', 'published'])?.revision ?? 0) !== v.expectedRevision) return null;
      const top = Math.max(0, ...sets.filter((s) => s.scopeKey === k).map((s) => s.revision));
      const made: CatSet = {
        id: `scs-${++n}`, scopeKey: k, stateCode: state, districtCode: district, revision: top + 1, status: 'draft',
        document: String(v.document), sourceDigest: `d${n}`, createdBy: 'shankarreddy.t',
        createdAt: '2026-10-09', publishedBy: '', publishedAt: '',
      };
      sets.push(made);
      record(made, top ? 'revise' : 'create', String(v.reason));
      return made;
    },
    publishServiceCatalogue: (v: Vars) => {
      const s = sets.find((x) => x.id === v.setId);
      if (!s || s.status !== 'draft') return null;
      for (const x of sets) if (x.scopeKey === s.scopeKey && x.status === 'published') x.status = 'superseded';
      s.status = 'published'; s.publishedBy = 'shankarreddy.t'; s.publishedAt = '2026-10-09';
      record(s, 'publish', String(v.reason) || 'Published revision');
      return s;
    },
    archiveServiceCatalogue: (v: Vars) => {
      const s = sets.find((x) => x.id === v.setId);
      if (!s || !['draft', 'published'].includes(s.status) || !String(v.reason).trim()) return false;
      s.status = 'archived';
      record(s, 'archive', String(v.reason));
      return true;
    },
    'root.states': STATES,
  });
  return { sets, events };
}

/** The sealed world answers a root document by its first field only, and the
 *  reference read asks for a state's districts in the same document. This one
 *  read is answered here, still from fixtures, never the network. */
async function andhraDistricts(page: Page) {
  await page.route(/\/api\/gateway\/pattadar\/graphql/, async (route) => {
    const body = route.request().postDataJSON() as { query?: string; variables?: Record<string, unknown> };
    if (!body?.query?.includes('districtsByState') || body.variables?.stateId !== 'st-ap') return route.fallback();
    return route.fulfill({ json: { data: {
      states: STATES, mandalsByDistrict: [], villagesByMandal: [], referenceDataSources: [],
      referenceDataSyncRuns: [], referenceDataSummary: null,
      districtsByState: ['Guntur', 'Krishna', 'Prakasam'].map((name, i) => ({
        id: `d-${i}`, name, code: '', lgdCode: '', nameLocal: '', stateId: 'st-ap', stateName: 'Andhra Pradesh',
        stateLgdCode: '28', sourceId: 'lgd', sourceUrl: '', sourceEffectiveAt: '', active: true,
      })),
    } } });
  });
}

const TITLE = 'Service catalogue';
const ALL = 'All states and union territories';

async function open(page: Page, world: World) {
  world.set('portfolio', { ...world.seedOf('portfolio'), isSuperAdmin: true });
  const store = catalogueStore(world);
  await page.goto('/admin/catalogue');
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  return store;
}

const head = (page: Page) => page.locator('header.pagehead');
/** One service in the marketplace list (ServiceList's <li>). */
const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
// A Card is an unnamed <section>, so a card is found by its heading.
const card = (page: Page, title: string) => page.locator('.card', { has: page.getByRole('heading', { name: title }) });

/** Open a service's drawer from its row, change it, give a reason, save. */
async function editService(page: Page, name: string, changes: (drawer: Locator) => Promise<void>,
                           reason = 'Registrar fee rose') {
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  const drawer = page.getByRole('dialog', { name });
  await changes(drawer);
  await drawer.getByLabel('Change reason').fill(reason);
  await drawer.getByRole('button', { name: 'Save draft' }).click();
  await expect(drawer).toHaveCount(0);
}

async function publishDraft(page: Page) {
  await head(page).getByRole('button', { name: 'Publish draft' }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish these prices?' });
  await confirm.getByRole('button', { name: 'Publish draft' }).click();
  await expect(confirm).toHaveCount(0);
}

/** Type into a ChipPicker and choose the option with the keyboard: the
 *  first match is the active one, and Enter picks it. (A mouse pick is
 *  covered once, in the districts test.) */
async function pick(scope: Locator, label: string, typed: string, option: string) {
  const box = scope.getByRole('combobox', { name: label });
  await box.fill(typed);
  await expect(scope.page().getByRole('option', { name: option })).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
}

test.describe('the service catalogue', () => {
  test('the manager sees the owners\' marketplace, grouped, with every figure', async ({ page, world }) => {
    await open(page, world);
    await expect(head(page).locator('.pagehead-summary')).toHaveText('3 services · 3 offered');
    await expect(page.getByLabel('Price scope')).toContainText(ALL);
    await expect(row(page, 'Encumbrance certificate')).toContainText('₹1,180');
    await expect(row(page, 'Encumbrance certificate')).toContainText('about 10 days');
    await expect(row(page, 'Land survey')).toContainText('set by Standard');
    await expect(page.getByText('On the ground', { exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${TITLE} · Pattadar`);
  });

  test('a row opens its drawer; a change is saved as a draft of only what changed, then published', async ({ page, world }) => {
    const store = await open(page, world);
    await editService(page, 'Encumbrance certificate', async (d) => {
      await d.getByLabel('Price in rupees').fill('1500');
    });
    expect(world.lastVars('saveServiceCatalogue')).toMatchObject({ stateCode: '*', districtCode: '*', expectedRevision: 0 });
    // A second service, edited into the same draft: the first change is kept.
    await editService(page, 'Land survey', async (d) => {
      await d.getByLabel('Turnaround in days').fill('12');
    });
    expect(world.lastVars('saveServiceCatalogue')).toMatchObject({ expectedRevision: 1 });
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document))).toEqual({
      schemaVersion: 1, services: { ec: { price: 1500 }, survey: { days: 12 } },
    });
    await expect(head(page).getByText('Draft', { exact: true })).toBeVisible();
    await expect(head(page).locator('.pagehead-summary')).toHaveText('3 services · 3 offered · 2 set here');

    await head(page).getByRole('button', { name: 'Publish draft' }).click();
    const confirm = page.getByRole('dialog', { name: 'Publish these prices?' });
    await expect(confirm).toContainText('orders already placed keep their price');
    await confirm.getByRole('button', { name: 'Publish draft' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(head(page).getByText('Published', { exact: true })).toBeVisible();
    expect(store.sets.find((x) => x.revision === 2)?.status).toBe('published');
    await expect(row(page, 'Encumbrance certificate')).toContainText('₹1,500');
    await expect(row(page, 'Encumbrance certificate')).toContainText(`set by ${ALL} · was ₹1,180`);

    // Publishing is the head's job; the page carries no versions or history panel.
    await expect(card(page, 'Versions')).toHaveCount(0);
    await expect(card(page, 'Change history')).toHaveCount(0);
  });

  test('the drawer edits the description owners read', async ({ page, world }) => {
    await open(page, world);
    await editService(page, 'Title opinion', async (d) => {
      await d.getByLabel('Description owners read').fill('An advocate reads the title chain.');
    });
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services)
      .toEqual({ title_opinion: { blurb: 'An advocate reads the title chain.' } });
    await expect(row(page, 'Title opinion')).toContainText('An advocate reads the title chain.');
  });

  test('the drawer edits what the owner gets, and refuses it empty without sending', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Edit Title opinion' }).click();
    const drawer = page.getByRole('dialog', { name: 'Title opinion' });
    await drawer.getByLabel('What the owner gets').fill('');
    await drawer.getByLabel('Change reason').fill('Try');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer.getByRole('alert')).toHaveText(
      'The draft could not be saved. Enter a name, a description and what the owner gets.');
    expect(world.calls('saveServiceCatalogue')).toHaveLength(0);
    await drawer.getByLabel('What the owner gets').fill('A signed opinion on the title');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer).toHaveCount(0);
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services)
      .toEqual({ title_opinion: { deliverable: 'A signed opinion on the title' } });
  });

  test('every service starts in Andhra Pradesh and Telangana; removing a state limits it', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Edit Land survey' }).click();
    const drawer = page.getByRole('dialog', { name: 'Land survey' });
    const where = drawer.getByRole('group', { name: 'Where it is offered' });
    await expect(where.getByRole('radio', { name: /Only in chosen states/ })).toBeChecked();
    await expect(where.getByRole('button', { name: 'Remove Andhra Pradesh' })).toBeVisible();
    await where.getByRole('button', { name: 'Remove Telangana' }).click();
    await expect(where.getByRole('button', { name: 'Remove Telangana' })).toHaveCount(0);
    await drawer.getByLabel('Change reason').fill('No surveyors in Telangana yet');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer).toHaveCount(0);
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services)
      .toEqual({ survey: { areas: { states: ['AP'], districts: [] } } });
  });

  test('within a state, districts are found by typing and limit the service to them', async ({ page, world }) => {
    await andhraDistricts(page);
    await open(page, world);
    await page.getByRole('button', { name: 'Edit Encumbrance certificate' }).click();
    const drawer = page.getByRole('dialog', { name: 'Encumbrance certificate' });
    const districts = drawer.getByRole('group', { name: 'Districts of Andhra Pradesh' });
    await expect(districts).toContainText('All 3 districts');
    await districts.getByRole('combobox', { name: 'Districts of Andhra Pradesh' }).fill('pra');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option', { name: 'Prakasam' }).click();
    await pick(districts, 'Districts of Andhra Pradesh', 'gun', 'Guntur');
    await expect(districts.getByRole('button', { name: 'Remove Prakasam' })).toBeVisible();
    await expect(districts.getByRole('button', { name: 'Remove Guntur' })).toBeVisible();
    await drawer.getByLabel('Change reason').fill('Pilot districts');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer).toHaveCount(0);
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services.ec.areas)
      .toEqual({ states: ['AP', 'TS'], districts: ['AP/PRAKASAM', 'AP/GUNTUR'] });
  });

  test('a service is cloned to a district as a draft, priced there, and published', async ({ page, world }) => {
    await andhraDistricts(page);
    const store = await open(page, world);
    await page.getByRole('button', { name: 'Edit Encumbrance certificate' }).click();
    const drawer = page.getByRole('dialog', { name: 'Encumbrance certificate' });
    await drawer.getByLabel('Price in rupees').fill('1500');
    await drawer.getByRole('button', { name: 'Set a price for another place' }).click();
    const clone = page.getByRole('dialog', { name: 'Set a price for Encumbrance certificate in another place' });
    await pick(clone, 'State', 'andh', 'Andhra Pradesh');
    await pick(clone, 'District', 'pra', 'Prakasam');
    await clone.getByRole('button', { name: 'Clone as a draft' }).click();

    await expect(page).toHaveURL(/state=AP&district=PRAKASAM/);
    await expect(page.getByLabel('Price scope')).toContainText('Prakasam');
    const there = page.getByRole('dialog', { name: 'Encumbrance certificate' });
    await expect(there.getByLabel('Price in rupees')).toHaveValue('1500');
    await expect(there.getByLabel('Change reason')).toHaveValue(`Priced separately from ${ALL}`);
    await there.getByRole('button', { name: 'Save draft' }).click();
    await expect(there).toHaveCount(0);
    expect(world.lastVars('saveServiceCatalogue')).toMatchObject({ stateCode: 'AP', districtCode: 'PRAKASAM', expectedRevision: 0 });
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services).toEqual({ ec: { price: 1500 } });

    // The draft is Prakasam's own, published from the head.
    await publishDraft(page);
    await expect(head(page).getByText('Published', { exact: true })).toBeVisible();
    expect(store.sets.find((s) => s.scopeKey === 'IN/AP/PRAKASAM')?.status).toBe('published');
    await expect(row(page, 'Encumbrance certificate')).toContainText('set by Prakasam, Andhra Pradesh · was ₹1,180');
  });

  test('services are cards by default, a list on request, with the price on the right', async ({ page, world }) => {
    await open(page, world);
    const list = page.getByRole('list', { name: `Services for ${ALL}: Records` });
    await expect(list).toBeVisible();
    // Grid: the list draws as cards (ServiceList layout="grid").
    await expect(page.locator('.svc-list.grid')).toHaveCount(1);
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page).toHaveURL(/[?&]view=list/);
    await expect(page.locator('.svc-list.grid')).toHaveCount(0);
    const rowBox = await row(page, 'Encumbrance certificate').boundingBox();
    const price = await row(page, 'Encumbrance certificate').getByText('₹1,180').boundingBox();
    expect(rowBox && price && rowBox.x + rowBox.width - (price.x + price.width)).toBeLessThan(40);
  });

  test('a card\'s ⋮ switches a service off as a draft, with a reason', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Actions for Land survey' }).click();
    await page.getByRole('menuitem', { name: `Switch off in ${ALL}` }).click();
    const confirm = page.getByRole('dialog', { name: `Switch off Land survey in ${ALL}?` });
    await confirm.getByRole('button', { name: 'Switch off' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('The draft could not be saved. Enter a reason.');
    expect(world.calls('saveServiceCatalogue')).toHaveLength(0);
    await confirm.getByLabel('Reason').fill('No surveyors free this month');
    await confirm.getByRole('button', { name: 'Switch off' }).click();
    await expect(confirm).toHaveCount(0);
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services)
      .toEqual({ survey: { enabled: false } });
    await expect(row(page, 'Land survey')).toContainText('Off');
    // And back on, from the same menu.
    await page.getByRole('button', { name: 'Actions for Land survey' }).click();
    await page.getByRole('menuitem', { name: `Offer in ${ALL}` }).click();
    await page.getByRole('dialog', { name: `Offer Land survey in ${ALL}?` }).getByLabel('Reason').fill('Surveyors back');
    await page.getByRole('dialog', { name: `Offer Land survey in ${ALL}?` }).getByRole('button', { name: 'Offer it' }).click();
    expect(world.lastVars('saveServiceCatalogue')).toMatchObject({ expectedRevision: 1 });
    expect(JSON.parse(String(world.lastVars('saveServiceCatalogue').document)).services).toEqual({});
  });

  test('a card\'s ⋮ opens the clone dialog, and offers no versions', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Actions for Title opinion' }).click();
    await page.getByRole('menuitem', { name: 'Set a price for another place' }).click();
    await expect(page.getByRole('dialog', { name: 'Set a price for Title opinion in another place' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Set a price for Title opinion in another place' })
      .getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Title opinion' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Actions for Title opinion' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(
      ['Edit', 'Set a price for another place', `Switch off in ${ALL}`]);
    await page.keyboard.press('Escape');
  });

  test('the band narrows by search and state, and says how many it shows', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('textbox', { name: 'Search services' }).fill('survey');
    await expect(page.getByText('1 of 3 shown')).toBeVisible();
    await expect(row(page, 'Land survey')).toBeVisible();
    await expect(row(page, 'Title opinion')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Search services' }).fill('nothing like this');
    await expect(page.getByText('No service matches')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all' }).last().click();
    await expect(page.getByText('3 of 3 shown')).toBeVisible();

    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('button', { name: /^Telangana/ }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/[?&]state=TS/);
    await expect(page.getByLabel('Price scope')).toContainText('Uses the prices for all states');
  });

  test('a draft is refused without a reason or with an impossible price, and nothing is sent', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Edit Encumbrance certificate' }).click();
    const drawer = page.getByRole('dialog', { name: 'Encumbrance certificate' });
    await drawer.getByLabel('Price in rupees').fill('0');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer.getByRole('alert')).toHaveText('The draft could not be saved. Enter a change reason.');
    await drawer.getByLabel('Change reason').fill('Try');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer.getByRole('alert')).toHaveText(
      'The draft could not be saved. Enter a price above ₹0 and at most ₹10,00,000.');
    expect(world.calls('saveServiceCatalogue')).toHaveLength(0);
  });

  test('a save refused by the server keeps the drawer and its edits, and says why', async ({ page, world }) => {
    await open(page, world);
    world.set('saveServiceCatalogue', null);
    await page.getByRole('button', { name: 'Edit Encumbrance certificate' }).click();
    const drawer = page.getByRole('dialog', { name: 'Encumbrance certificate' });
    await drawer.getByLabel('Price in rupees').fill('1300');
    await drawer.getByLabel('Change reason').fill('Fee rose');
    await drawer.getByRole('button', { name: 'Save draft' }).click();
    await expect(drawer.getByRole('alert')).toHaveText(
      'The draft could not be saved. Reload the page; these prices may have been changed meanwhile.');
    expect(world.calls('saveServiceCatalogue')).toHaveLength(1);
    await expect(drawer.getByLabel('Price in rupees')).toHaveValue('1300');
  });

  test('archiving a draft asks first, needs a reason, and leaves owners\' prices alone', async ({ page, world }) => {
    const store = await open(page, world);
    await editService(page, 'Encumbrance certificate', async (d) => {
      await d.getByLabel('Price in rupees').fill('1300');
    });
    await page.getByRole('button', { name: `More actions for ${TITLE}` }).click();
    await page.getByRole('menuitem', { name: 'Archive draft' }).click();
    const confirm = page.getByRole('dialog', { name: 'Archive this draft?' });
    await expect(confirm).toContainText('The prices owners pay now do not change.');
    await confirm.getByRole('button', { name: 'Archive draft' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('The prices could not be archived. Enter an archive reason.');
    expect(world.calls('archiveServiceCatalogue')).toHaveLength(0);
    await confirm.getByLabel('Archive reason').fill('Wrong figure');
    await confirm.getByRole('button', { name: 'Archive draft' }).click();
    await expect(confirm).toHaveCount(0);
    expect(store.sets[0].status).toBe('archived');
    await expect(row(page, 'Encumbrance certificate')).toContainText('₹1,180');
    await expect(head(page).getByText('Draft', { exact: true })).toHaveCount(0);
  });
});

test.describe('the service catalogue: access and failures', () => {
  test.use({ allowConsole: true }); // a failed read is the point of the last test

  test('anyone but a super-admin is told it is restricted and nothing is read', async ({ page, world }) => {
    catalogueStore(world);
    await page.goto('/admin/catalogue');
    await expect(page.getByText('The service catalogue is restricted')).toBeVisible();
    expect(world.asked('serviceCatalogueAdmin')).toBe(false);
  });

  test('a failed catalogue read says so under the same head', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), isSuperAdmin: true });
    catalogueStore(world);
    world.set('serviceCatalogueAdmin', World.gqlError('catalogue store down'));
    await page.goto('/admin/catalogue');
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText('The service catalogue did not load')).toBeVisible();
  });
});

test.describe('the service catalogue on a phone', () => {
  test('@phone-only a row opens its drawer and nothing scrolls sideways', async ({ page, world }) => {
    await open(page, world);
    await page.getByRole('button', { name: 'Edit Encumbrance certificate' }).click();
    await expect(page.getByRole('dialog', { name: 'Encumbrance certificate' }).getByLabel('Price in rupees')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
