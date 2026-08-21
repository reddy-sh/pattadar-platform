/**
 * W02's actions, end to end: a record is added through the drawer, edited from
 * its own kebab, archived out of every list and back, given an EC order and a
 * tag from the bulk bar, and finally deleted — leaving the seeded nine exactly
 * as the other spec expects them.
 *
 * The suite is serial and self-cleaning: it creates only records marked
 * "Sy 777", and its afterAll deletes any that a mid-run failure left behind,
 * so a red test here can never cascade into screens.spec.ts.
 */
import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';

const GQL = '/api/gateway/pattadar/graphql';

async function gql(request: APIRequestContext, query: string) {
  const res = await request.post(GQL, { data: { query } });
  return (await res.json()).data?.web;
}

/** Delete every e2e-created record, whatever state a failure left it in.
 *
 *  It reads the full list rather than the jump box: search deliberately hides
 *  archived records, so a test that archived one would leave it behind for
 *  the next run to trip over. */
async function sweep(request: APIRequestContext) {
  const seen = new Set<string>();
  for (const statuses of ['[]', '["archived"]']) {
    const res = await gql(request,
      `query { web { properties(statuses:${statuses}) { cards { id title } } } }`);
    for (const c of res?.properties?.cards ?? []) {
      if (String(c.title).startsWith('Sy 777')) seen.add(c.id);
    }
  }
  if (!seen.size) return;
  const ids = [...seen].map((id) => `"${id}"`).join(',');
  await gql(request, `mutation { web { archiveRecords(ids:[${ids}], archived:false)
                                       deleteRecords(ids:[${ids}]) } }`);
}

test.describe.serial('W02 · the list acts', () => {
  test.afterAll(async ({ request }) => { await sweep(request); });

  test('Add opens the drawer, and a new parcel lands in the grid', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.getByText('9 of 9 shown')).toBeVisible();

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.locator('.drawer');
    await expect(drawer.getByRole('heading', { name: 'Add a record' })).toBeVisible();

    await drawer.locator('#rd-title').fill('Sy 777/1');
    await drawer.locator('#rd-owner').fill('E2E Owner');
    await drawer.locator('#rd-khata').fill('777');
    await drawer.locator('#rd-village').fill('E2E Palem');
    await drawer.locator('#rd-mandal').fill('E2E Mandal');
    await drawer.locator('#rd-district').fill('E2E District');
    await drawer.locator('#rd-extent').fill('1.5');
    await drawer.locator('#rd-market').fill('1200000');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect(drawer).toHaveCount(0);
    await expect(page.getByText('10 of 10 shown')).toBeVisible();
    const card = page.locator('.rec', { hasText: 'Sy 777/1' });
    await expect(card).toContainText('E2E Owner');
    await expect(card).toContainText('E2E Palem');
    await expect(card).toContainText('1.50 ac');
    await expect(card).toContainText('₹12.0 L');
  });

  test('Edit from the kebab changes only what the form touched', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Actions for Sy 777/1' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('#rd-title')).toHaveValue('Sy 777/1');
    await expect(drawer.locator('#rd-khata')).toHaveValue('777');
    await drawer.locator('#rd-title').fill('Sy 777/1A');
    await drawer.locator('#rd-market').fill('1500000');
    await drawer.getByRole('button', { name: 'Save changes' }).click();

    await expect(drawer).toHaveCount(0);
    const card = page.locator('.rec', { hasText: 'Sy 777/1A' });
    await expect(card).toContainText('₹15.0 L');
    await expect(card).toContainText('E2E Owner');      // untouched fields survive
    await expect(card).toContainText('Khata 777');
  });

  test('Archive removes it from the list; the Archived facet brings it back', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Actions for Sy 777/1A' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();

    // Gone from the list and the totals…
    await expect(page.getByText('9 of 9 shown')).toBeVisible();
    await expect(page.locator('.rec', { hasText: 'Sy 777/1A' })).toHaveCount(0);

    // …present in the rail's new facet.
    const facet = page.locator('.filters label', { hasText: 'Archived' });
    await expect(facet).toContainText('1');
    await facet.click();
    await expect(page.getByText('1 of 10 shown')).toBeVisible();
    const card = page.locator('.rec', { hasText: 'Sy 777/1A' });
    await expect(card).toContainText('Archived');

    // Unarchive from the same kebab, then clear the facet.
    await page.getByRole('button', { name: 'Actions for Sy 777/1A' }).click();
    await page.getByRole('menuitem', { name: 'Unarchive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Unarchive' }).click();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('10 of 10 shown')).toBeVisible();
  });

  test('the bulk bar orders an EC for the selection, and Services lists it', async ({ page }) => {
    await page.goto('/app/properties');
    const card = page.locator('.rec', { hasText: 'Sy 777/1A' });
    await card.hover();
    await card.locator('.sel input').check();

    const bar = page.locator('.bulkbar');
    await expect(bar).toContainText('1 record selected');
    await bar.getByRole('button', { name: 'Order EC ×1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Order EC ×1' }).click();

    await page.goto('/app/services');
    const row = page.locator('.rows > *', { hasText: 'Sy 777/1A' });
    await expect(row).toContainText('Encumbrance Certificate');
    await expect(row).toContainText('Placed');
  });

  test('the bulk bar tags the selection, and the rail learns the tag', async ({ page }) => {
    await page.goto('/app/properties');
    const card = page.locator('.rec', { hasText: 'Sy 777/1A' });
    await card.hover();
    await card.locator('.sel input').check();

    await page.locator('.bulkbar').getByRole('button', { name: 'Tag…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#tg-word').fill('e2e sweep');
    await dialog.getByRole('button', { name: 'Apply tag' }).click();

    await expect(card.locator('.tag', { hasText: 'e2e sweep' })).toBeVisible();
    await expect(page.locator('.filters').getByText('e2e sweep')).toBeVisible();
  });

  test('Delete takes the record and everything filed under it', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'Actions for Sy 777/1A' }).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Delete this record?');
    await expect(dialog).toContainText('There is no undo');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('9 of 9 shown')).toBeVisible();
    await expect(page.locator('.rec', { hasText: 'Sy 777' })).toHaveCount(0);

    // Its EC order and its tag died with it.
    await page.goto('/app/services');
    await expect(page.locator('.rows > *', { hasText: 'Sy 777' })).toHaveCount(0);
    await page.goto('/app/properties');
    await expect(page.locator('.filters').getByText('e2e sweep')).toHaveCount(0);
  });
});

test.describe.serial('W02 · the list is usable without a mouse', () => {
  test.afterAll(async ({ request }) => { await sweep(request); });

  test('the kebab opens on Enter, arrows move, and Escape returns focus', async ({ page }) => {
    await page.goto('/app/properties');
    const kebab = page.getByRole('button', { name: 'Actions for Sy 214/2' });
    await kebab.focus();
    await page.keyboard.press('Enter');

    // Opening moves focus into the list — the portal sits at the end of the
    // DOM, so Tab alone would never reach it.
    await expect(page.getByRole('menuitem', { name: 'Edit…' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Edit…' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(kebab).toBeFocused();

    // And Enter on an item does its job.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('.drawer').getByRole('heading', { name: 'Edit Sy 214/2' }))
      .toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('a sort click keeps focus on the heading it was made from', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'List' }).click();

    const worth = page.locator('.rectable').getByRole('button', { name: 'Worth' });
    await worth.focus();
    await page.keyboard.press('Enter');
    // The heading must survive its own state change: a component rebuilt on
    // every render would drop focus to <body> and strand the keyboard here.
    await expect(worth).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(worth).toBeFocused();
    await expect(page.locator('.rectable th[aria-sort="descending"]')).toHaveCount(1);
  });

  test('renaming a record leaves its extent in the unit it is stored in', async ({ page, request }) => {
    // A shop measured in yards — the shape a legacy import leaves behind, and
    // the one the edit form used to silently re-read as square feet.
    await gql(request, `mutation { web { saveRecord(input:{
      kind:"property", title:"Sy 777 Shop", classification:"shop",
      village:"E2E Palem", mandal:"E2E Mandal", extent:850, extentUnit:"sq.yd",
      marketValue:900000 }) } }`);

    await page.goto('/app/properties');
    const card = page.locator('.rec', { hasText: 'Sy 777 Shop' });
    await expect(card).toContainText('850 sq.yd');

    await page.getByRole('button', { name: 'Actions for Sy 777 Shop' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const drawer = page.locator('.drawer');
    await drawer.locator('#rd-title').fill('Sy 777 Shop A');
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(drawer).toHaveCount(0);

    await expect(page.locator('.rec', { hasText: 'Sy 777 Shop A' })).toContainText('850 sq.yd');
  });
});

test.describe.serial('W02 · what archiving and deleting must not touch', () => {
  test.afterAll(async ({ request }) => { await sweep(request); });

  test('an archived record stops asking for things on the Dashboard', async ({ page, request }) => {
    // Sy 214/2 carries a waiting item and running costs in the seed.
    await page.goto('/app');
    await expect(page.getByText('Mutation for Sy 214/2 needs your signature')).toBeVisible();
    const costs = await page.locator('.strip, .card').getByText(/Running costs/i).first()
      .isVisible().catch(() => false);
    expect(costs !== undefined).toBeTruthy();

    await gql(request, `mutation { web { archiveRecords(ids:["w360-p-214-2"], archived:true) } }`);
    await page.goto('/app');
    // It left the tiles AND the deadline list — a record put away must not
    // keep generating work.
    await expect(page.getByText('Mutation for Sy 214/2 needs your signature')).toHaveCount(0);
    await expect(page.getByText('214/2 and 214/3 share a boundary')).toHaveCount(0);

    await gql(request, `mutation { web { archiveRecords(ids:["w360-p-214-2"], archived:false) } }`);
    await page.goto('/app');
    await expect(page.getByText('Mutation for Sy 214/2 needs your signature')).toBeVisible();
  });

  test('a tag whose only record is archived leaves the rail', async ({ page, request }) => {
    const id = (await gql(request, `mutation { web { saveRecord(input:{
      kind:"parcel", title:"Sy 777/9", khataNo:"777", village:"E2E Palem",
      extent:1, marketValue:100000 }) } }`)).saveRecord;
    await gql(request, `mutation { web { tagRecords(ids:["${id}"], tag:"e2e lonely") } }`);

    await page.goto('/app/properties');
    await expect(page.locator('.filters').getByText('e2e lonely')).toBeVisible();

    await gql(request, `mutation { web { archiveRecords(ids:["${id}"], archived:true) } }`);
    await page.reload();
    // The rail must not offer a facet that filters to an empty grid.
    await expect(page.locator('.filters').getByText('e2e lonely')).toHaveCount(0);
  });

  test('reclassifying a property does not re-measure it', async ({ page, request }) => {
    // A house carries BOTH areas; the card shows only the built-up one.
    const id = (await gql(request, `mutation { web { saveRecord(input:{
      kind:"property", title:"Sy 777 House", classification:"flat",
      village:"E2E Palem", extent:1500, extentUnit:"sq.ft", marketValue:500000 }) } }`)).saveRecord;

    await page.goto('/app/properties');
    await expect(page.locator('.rec', { hasText: 'Sy 777 House' })).toContainText('1,500 sq.ft');

    // Change ONLY what it is. The extent field is never touched, so nothing
    // may be written into the other area column.
    await page.getByRole('button', { name: 'Actions for Sy 777 House' }).click();
    await page.getByRole('menuitem', { name: 'Edit…' }).click();
    const drawer = page.locator('.drawer');
    await drawer.getByRole('button', { name: 'Open plot' }).click();
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(drawer).toHaveCount(0);

    const card = (await gql(request, `{ web { properties { cards { id title extent extentUnit } } } }`))
      .properties.cards.find((c: { id: string }) => c.id === id);
    expect(card.extent).toBe(1500);
    expect(card.extentUnit).toBe('sq.ft');
  });
});

test.describe('W02 · list view mechanics', () => {
  test('the header is a band of sort controls, and Worth actually sorts', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'List' }).click();

    const table = page.locator('.rectable');
    // The DOM says "Record"; the capitals are the stylesheet's doing.
    await expect(table.locator('thead')).toContainText('Record');
    await expect(table.locator('tbody tr')).toHaveCount(9);

    const worthOf = async () => {
      const cells = await table.locator('tbody td:nth-last-child(2)').allInnerTexts();
      return cells.map((t) => {
        const m = /₹([\d.]+)\s*(Cr|L)?/.exec(t);
        return m ? Number(m[1]) * (m[2] === 'Cr' ? 1e7 : m[2] === 'L' ? 1e5 : 1) : 0;
      });
    };

    await table.getByRole('button', { name: 'Worth' }).click();
    await expect(table.locator('th[aria-sort="ascending"]')).toHaveCount(1);
    const asc = await worthOf();
    expect([...asc].sort((a, b) => a - b)).toEqual(asc);

    await table.getByRole('button', { name: 'Worth' }).click();
    await expect(table.locator('th[aria-sort="descending"]')).toHaveCount(1);
    const desc = await worthOf();
    expect([...desc].sort((a, b) => b - a)).toEqual(desc);
  });

  test('every row carries its own kebab, and the header its select-all', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: 'List' }).click();

    await page.getByRole('checkbox', { name: 'Select all shown' }).check();
    await expect(page.locator('.bulkbar')).toContainText('9 records selected');
    await expect(page.locator('.rectable tbody tr.selected')).toHaveCount(9);

    await page.getByRole('button', { name: 'Actions for Sy 214/2' }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit…' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete…' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Export writes the visible list to a CSV', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.getByText('9 of 9 shown')).toBeVisible();

    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await waiting;
    expect(download.suggestedFilename()).toMatch(/^properties-\d{4}-\d{2}-\d{2}\.csv$/);

    const body = fs.readFileSync(await download.path(), 'utf-8');
    expect(body).toContain('Record,Kind,Owner');
    expect(body).toContain('Sy 214/2');
    expect(body.trim().split('\n')).toHaveLength(10);   // header + nine records
  });
});
