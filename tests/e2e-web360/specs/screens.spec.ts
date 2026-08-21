/**
 * Every screen in the W01–W15 handover, asserted on the figures that appear on
 * more than one of them.
 *
 * The rule these tests encode: a number a user can cross-check between two
 * screens must agree. Sy 214/2 is 3.24 ac and ₹72.9 L on the card, in the 360
 * hero and on the map. Its features are 14 with 2 needing repair, both in the
 * tab label and in the chip. Nine records are nine everywhere.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const PARCEL = 'w360-p-214-2';   // Sy 214/2 — the record every screen is drawn around
const BIG = 'w360-p-88';         // Sy 88 — the 30-acre holding bought in two lots
const FLAT = 'w360-r-flat4b';    // Flat 4B — the let property, for the rent ledger
const DEED = 'w360-d-deed-4417'; // Sale Deed 4417/2019

/** No screen may reach the user with a console error on it. */
async function watchConsole(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    // A missing favicon is the dev server, not the app.
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('W01 · dashboard', () => {
  test('states the portfolio, and its totals are its own records summed', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app');

    await expect(page.getByText('Your portfolio')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sankara');

    // The stat strip — the seven figures the mock leads with.
    const strip = page.locator('.strip').first();
    await expect(strip).toContainText('44.82');
    await expect(strip).toContainText('6 parcels');
    await expect(strip).toContainText('742');
    await expect(strip).toContainText('1 open plot');
    await expect(strip).toContainText('1,760');
    await expect(strip).toContainText('1 flat, 1 shop');
    await expect(strip).toContainText('₹3.62 Cr');   // invested
    await expect(strip).toContainText('₹42.0 L');    // loans outstanding

    // Gain must equal worth − invested, not be a stored number.
    const worth = await strip.locator('div', { hasText: 'WORTH NOW' }).first().innerText();
    const gain = await strip.locator('div', { hasText: 'GAIN' }).first().innerText();
    const cr = (s: string) => Number(/([\d.]+)\s*Cr/.exec(s)?.[1] ?? 0);
    expect(cr(gain)).toBeCloseTo(cr(worth) - 3.62, 1);

    // Two things with a deadline — the map insight is NOT one of them.
    await expect(page.getByText('Mutation for Sy 214/2 needs your signature')).toBeVisible();
    await expect(page.getByText("Advocate's link to 4 papers expires tomorrow")).toBeVisible();
    await expect(page.getByText('214/2 and 214/3 share a boundary')).toHaveCount(0);

    // Where the value sits: every bar has a visible fill, not an empty track.
    const fills = page.locator('.bar .fill');
    await expect(fills.first()).toBeVisible();
    const width = await fills.first().evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(20);

    await expect(page.getByText('Recently opened')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the recently-opened strip mixes parcels and built property', async ({ page }) => {
    await page.goto('/app');
    const cards = page.locator('.cards .rec');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Sy 214/2');
    await expect(cards.nth(1)).toContainText('Flat 4B, Sai Enclave');
  });
});

test.describe('W02 · properties', () => {
  test('one faceted list, and the rail agrees with the grid', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/properties');

    await expect(page.getByText('9 of 9 shown')).toBeVisible();
    await expect(page.locator('.cards .rec')).toHaveCount(9);

    // Facet counts, exactly as drawn.
    const rail = page.locator('.filters');
    await expect(rail.getByText('Land parcels')).toBeVisible();
    await expect(rail.locator('label', { hasText: 'Land parcels' })).toContainText('6');
    await expect(rail.locator('label', { hasText: 'Properties' })).toContainText('3');
    await expect(rail.locator('label', { hasText: 'For sale' })).toContainText('2');
    await expect(rail.locator('label', { hasText: 'Disputed' })).toContainText('1');

    // A record's figures read on one line, never wrapped into two.
    const first = page.locator('.cards .rec').first();
    await expect(first).toContainText('3.24 ac');
    await expect(first).toContainText('₹72.9 L');
    expect(await first.locator('.figure').evaluate((el) => el.getBoundingClientRect().height))
      .toBeLessThan(40);

    expect(errors).toEqual([]);
  });

  test('a facet narrows the grid, and the hidden count explains the rest', async ({ page }) => {
    await page.goto('/app/properties');
    await page.locator('.filters label', { hasText: 'For sale' }).click();

    await expect(page).toHaveURL(/status=for_sale/);
    await expect(page.getByText('2 of 9 shown')).toBeVisible();
    await expect(page.getByText('7 properties hidden by your filter')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('9 of 9 shown')).toBeVisible();
  });

  test('the filter lives in the URL, so a narrowed list is shareable', async ({ page }) => {
    await page.goto('/app/properties?status=disputed');
    await expect(page.getByText('1 of 9 shown')).toBeVisible();
    await expect(page.locator('.cards .rec').first()).toContainText('Shop 2, Main Rd');
  });
});

test.describe('W03 · the record 360', () => {
  test('hero, hangers and the right rail', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.getByText('Land parcel · Khata 10021 · Agri')).toBeVisible();
    await expect(page.getByText('Kothapalli, Peddapuram, Kakinada — Andhra Pradesh')).toBeVisible();

    const strip = page.locator('.strip').first();
    await expect(strip).toContainText('3.24');
    await expect(strip).toContainText('3 Acres 9.6 Guntas · 324 Cents · 15,682 Sq.yd');
    await expect(strip).toContainText('₹72.9 L');
    await expect(strip).toContainText('₹22.5 L');   // per acre
    await expect(strip).toContainText('2019');

    const tabs = page.locator('.tabs').first();
    await expect(tabs).toContainText('Papers');
    await expect(tabs).toContainText('11');
    await expect(tabs).toContainText('Features');
    await expect(tabs).toContainText('14');
    await expect(tabs).toContainText('People');

    // Eleven papers, the first with its registration line.
    await expect(page.locator('.rows.boxed > div')).toHaveCount(11);
    await expect(page.getByText('Sale Deed 4417/2019')).toBeVisible();
    await expect(page.getByText('Registered 06/09/2019 · SRO Peddapuram · ₹58,00,000 · 22 pages')).toBeVisible();

    // The rail: no ISO dates ever reach prose.
    await expect(page.getByText(/Newest \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(page.getByText('Ramesh says the buyer wants possession after the kharif harvest.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the paper shelf chips filter the list', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}`);
    await page.getByRole('button', { name: /^Title/ }).click();
    await expect(page.locator('.rows.boxed > div')).toHaveCount(3);
  });
});

test.describe('W07 · features', () => {
  test('fourteen features, worst first, chips matching the categories', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/features`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('On this land');
    await expect(page.getByText(/14 features · 2 need repair · walked 12\/08\/2026 by M. Satyanarayana/))
      .toBeVisible();

    for (const [label, n] of [['Water', '6'], ['Structures', '3'], ['Power', '2'],
      ['Planting', '2'], ['Access', '1'], ['Needs repair', '2']] as const) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toContainText(n);
    }

    // Worst condition first, and a broken one is drawn as an alert.
    const cards = page.locator('.cards > article');
    await expect(cards.first()).toContainText('Borewell 1');
    await expect(cards.first()).toContainText('Yield dropped');
    await expect(cards.first()).toHaveClass(/alert/);

    await page.getByRole('button', { name: /^Needs repair/ }).click();
    await expect(page.locator('.cards > article')).toHaveCount(3);   // 2 + the add card
    expect(errors).toEqual([]);
  });
});

test.describe('W08 · people', () => {
  test('five people, graded by whether you pay them', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/people`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who looks after it');
    await expect(page.getByText(/5 people · ₹1,200 a month going out · ₹42,000 a season coming in/))
      .toBeVisible();

    await expect(page.getByText('M. Satyanarayana')).toBeVisible();
    await expect(page.getByText('Through Pattadar')).toBeVisible();
    await expect(page.getByText('₹1,200 / month')).toBeVisible();
    await expect(page.getByText('This parcel only')).toBeVisible();

    // The tenant is not a user of the app, and the card says so.
    await expect(page.getByText('Nothing — not a user')).toBeVisible();

    // Escrow is money that has NOT moved, and is labelled separately.
    await expect(page.getByText('releases when you accept the sketch')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('W10 · money', () => {
  test('paid, government and market are three separate numbers', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${BIG}/money`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/What it cost, what it.s worth/);
    await expect(page.getByText('What you actually paid')).toBeVisible();
    await expect(page.getByText('Government value today')).toBeVisible();
    await expect(page.locator('.card .eyebrow', { hasText: 'Market estimate' })).toBeVisible();

    // Two lots, and the blended row is their sum — not a stored total.
    await expect(page.getByText('B. Venkanna')).toBeVisible();
    await expect(page.getByText('K. Satyavathi & 2 others')).toBeVisible();
    await expect(page.getByText('Sale Deed 1188/2022 · SRO Peddapuram')).toBeVisible();
    const total = page.locator('tr.total');
    await expect(total).toContainText('Together');
    await expect(total).toContainText('30.00 ac');
    await expect(total).toContainText('₹1.68 Cr');

    // Capital work is listed apart from the purchase price.
    await expect(page.getByText('Everything else you put in')).toBeVisible();
    await expect(page.getByText('Stamp & registration')).toBeVisible();
    await expect(page.getByText('An assumption you chose, not a valuation.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('changing the appreciation rate changes the estimate, and says it is an assumption', async ({ page }) => {
    await page.goto(`/app/records/${BIG}/money`);
    await expect(page.locator('.card', { hasText: 'Appreciation used' })).toContainText('10%');
    await page.getByRole('button', { name: '14%', exact: true }).click();
    await expect(page.locator('.card', { hasText: 'Appreciation used' })).toContainText('14%');
  });
});

test.describe('W11 + W12 · the ledger', () => {
  test('a parcel splits capital from running, and states the cost of holding', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${BIG}/expenses`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses');
    const strip = page.locator('.strip').first();
    await expect(strip).toContainText('Capital · adds to cost');
    await expect(strip).toContainText('Running');
    await expect(strip).toContainText('Owed back by tenant');

    // A receipt figure is never shortened to lakhs.
    const boreRow = page.locator('tbody tr', { hasText: 'Bore flushing and new starter panel' });
    await expect(boreRow).toHaveCount(1);
    await expect(boreRow).toContainText('₹18,400');   // never shortened to lakhs
    await expect(boreRow).toContainText('Capital');
    await expect(page.getByText("Tenant's share — recoverable at harvest")).toBeVisible();
    await expect(page.getByText(/Capital rows lift the cost base on the Money tab/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a let property puts rent in the same list as money in', async ({ page }) => {
    await page.goto(`/app/records/${FLAT}/expenses`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses & rent');
    await expect(page.locator('.strip').first()).toContainText('Rent received');
    await expect(page.locator('.strip').first()).toContainText('Net yield on value');
    // Rent is monthly, so the year holds twelve income rows in the same list.
    await expect(page.locator('tr.income')).toHaveCount(12);
    await expect(page.locator('tr.income', { hasText: 'Rent · June' })).toHaveCount(1);
    await expect(page.getByText(/One ledger, two vocabularies/)).toBeVisible();
  });

  test('the drawer files an expense as capital or running', async ({ page }) => {
    await page.goto(`/app/records/${BIG}/expenses`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const before = await page.locator('tbody tr').count();

    await page.getByRole('button', { name: 'Add an expense' }).click();
    await expect(page.getByRole('complementary', { name: 'Add an expense' })).toBeVisible();
    await expect(page.getByText('Photograph the receipt first')).toBeVisible();
    await expect(page.getByText('New work that lasts. Lifts your cost base.')).toBeVisible();

    await page.getByLabel('What it was').fill('Playwright test row');
    await page.getByRole('button', { name: /^No — running/ }).click();
    await page.getByRole('button', { name: 'Save expense' }).click();

    await expect(page.getByRole('complementary', { name: 'Add an expense' })).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(before + 1);
    await expect(page.locator('tbody tr', { hasText: 'Playwright test row' })).toHaveCount(1);
  });
});

test.describe('W04 · map and boundary', () => {
  test('four marks, one moved, and deleting one keeps its history', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Map & boundary');
    await expect(page.getByText('Drag any numbered mark to correct it. Marks are versioned — nothing is overwritten.'))
      .toBeVisible();
    await expect(page.getByText('South-west stone')).toBeVisible();
    await expect(page.getByText('South-east stone moved ~4 ft in')).toBeVisible();

    // The destructive action is only offered with its consequence stated.
    await expect(page.getByRole('button', { name: 'Delete mark' })).toBeVisible();
    await expect(page.getByText(/Deleting a mark keeps the old position in History/)).toBeVisible();

    await expect(page.locator('.card', { hasText: 'FMB sheet — 214' })).toContainText('v1 kept');
    expect(errors).toEqual([]);
  });

  test('accepting a moved position settles the mark', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/map`);
    await page.getByRole('button', { name: 'Accept new position' }).click();
    await expect(page.getByRole('button', { name: 'Accept new position' })).toHaveCount(0);
  });
});

test.describe('W05 + W14 · photos', () => {
  test('the gallery states provenance and allows only the caption to change', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/photos`);

    await expect(page.getByText(/31 photos · 1 video · 4 site visits/)).toBeVisible();
    await expect(page.getByText('geo-stamped')).toBeVisible();
    await expect(page.getByText('Caption is editable — click and type. It is the only thing on this photo you can change.'))
      .toBeVisible();
    await expect(page.getByLabel('Caption')).toHaveValue('South-east boundary stone');
    await expect(page.getByText('Photo 1 of 32')).toBeVisible();

    // Delete names what the photo is doing elsewhere rather than just warning.
    await expect(page.getByText(/archives for 30 days first/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a caption edit persists', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    const caption = page.getByLabel('Caption');
    await caption.fill('South-east boundary stone, re-shot');
    await caption.blur();
    await page.reload();
    await expect(page.getByLabel('Caption')).toHaveValue('South-east boundary stone, re-shot');
    // Put it back, so the suite is re-runnable.
    await page.getByLabel('Caption').fill('South-east boundary stone');
    await page.getByLabel('Caption').blur();
  });

  test('scoped to a feature it becomes the provenance panel', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/features`);
    await page.locator('.cards > article').first().getByText(/photos$/).click();

    await expect(page).toHaveURL(/feature=/);
    await expect(page.getByText('Why this is Borewell 1')).toBeVisible();
    await expect(page.getByText('Shot inside Pattadar, not picked from a gallery')).toBeVisible();
    await expect(page.getByText('Device clock matched our server to the second')).toBeVisible();
    await expect(page.getByText(/Unedited since capture/)).toBeVisible();
    await expect(page.getByText('This photo is doing three jobs')).toBeVisible();

    // A forwarded photo is kept but never used as evidence.
    await expect(page.getByText(/prove nothing/)).toBeVisible();
    await expect(page.getByText(/Forwarding strips the location/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('W15 · the vault', () => {
  test('eight shelves and every link out', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/papers');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Papers');
    for (const shelf of ['Title', 'Revenue record', 'Map', 'Identity', 'Search & tax',
      'Old record', 'Photos', 'Unsorted']) {
      await expect(page.locator('.shelf', { hasText: shelf }).first()).toBeVisible();
    }
    // Every shelf carries a count. The exact numbers are a property of the
    // portfolio, not of the software — the mock's 14/18/31 was a snapshot of an
    // account with one documented parcel — so what is asserted is that no shelf
    // is empty and that the header equals their sum (next test).
    for (const shelf of ['Title', 'Revenue record', 'Map', 'Photos']) {
      const n = await page.locator('.shelf', { hasText: shelf }).first()
        .locator('.num').innerText();
      expect(Number(n.trim()), `${shelf} shelf count`).toBeGreaterThan(0);
    }

    await expect(page.getByText(/Out on a link right now · \d+/)).toBeVisible();
    await expect(page.getByText('K. Prasad, advocate — 4 papers')).toBeVisible();
    await expect(page.getByText(/Revoking kills a link in seconds rather than at expiry/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the header total is the shelves added up', async ({ page }) => {
    await page.goto('/app/papers');
    await expect(page.locator('.shelf').first()).toBeVisible();
    const counts = await page.locator('.shelf .num').allInnerTexts();
    const sum = counts.reduce((n, t) => n + Number(t.trim()), 0);
    await expect(page.getByText(`${sum} papers, encrypted in Mumbai (ap-south-1)`, { exact: false }))
      .toBeVisible();
  });

  test('revoking a link removes it from the list', async ({ page }) => {
    await page.goto('/app/papers');
    await expect(page.locator('.rows.boxed > div').first()).toBeVisible();
    const before = await page.locator('.rows.boxed > div').count();
    const row = page.locator('.rows.boxed > div', { hasText: 'SBI Kakinada, loan desk' });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('SBI Kakinada, loan desk', { exact: false })).toHaveCount(0);
    await expect(page.locator('.rows.boxed > div')).toHaveCount(before - 1);
  });
});

test.describe('W13 · reading a document', () => {
  test('the scan on the left, what was read from it on the right', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/papers/${DEED}`);

    await expect(page.getByText('Sale Deed 4417/2019').first()).toBeVisible();
    await expect(page.getByText(/Sy 214\/2 · Title · 22 pages/)).toBeVisible();

    // The registration facts, read off the paper.
    const facts = page.locator('.kv');
    await expect(facts).toContainText('06/09/2019');
    await expect(facts).toContainText('SRO Peddapuram');
    await expect(facts).toContainText('Bhogadi Venkanna');
    await expect(facts).toContainText('₹58,00,000');

    // The reading is labelled as a reading, and says where it was unsure.
    await expect(page.getByText('What the reader found')).toBeVisible();
    await expect(page.getByText('The sub-division digit is smudged on page 4')).toBeVisible();

    // v1 is kept even after a better rescan replaced it.
    await expect(page.getByText('Colour rescan, 300 dpi')).toBeVisible();
    await expect(page.getByText(/kept, never deleted/)).toBeVisible();

    await expect(page.getByText('1 / 22')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('paging moves through the scan', async ({ page }) => {
    await page.goto(`/app/papers/${DEED}`);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('2 / 22')).toBeVisible();
  });
});

test.describe('W09 · shared with me', () => {
  test("someone else's kit, read-only, and out of your totals", async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/shared');

    await expect(page.getByText('Kept out of your portfolio. Nothing here counts toward your acres.'))
      .toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(page.getByText('Read-only · not your record')).toBeVisible();
    await expect(page.getByText(/Sent by B. Venkat, agent/)).toBeVisible();

    // What they gave you, with the two things that fall short flagged.
    await expect(page.getByText('Sale Deed 2214/2016')).toBeVisible();
    await expect(page.getByText('stops 3 years short')).toBeVisible();
    await expect(page.getByText('no date or location stamp')).toBeVisible();

    // The four unconfirmed things, priced, ordered in your name.
    await expect(page.getByText('What nobody has confirmed')).toBeVisible();
    await expect(page.getByRole('button', { name: /Order all four · ₹13,500/ })).toBeVisible();
    await expect(page.getByText('Ordered in your name. The seller is not told.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a shared kit's acres are not in the portfolio total", async ({ page }) => {
    await page.goto('/app');
    // The kit is 4.10 ac. 44.82 is the owned farmland; 48.92 would mean the
    // recipient's list had been unioned into the owner's.
    await expect(page.locator('.strip').first()).toContainText('44.82');
    await expect(page.locator('.strip').first()).not.toContainText('48.92');
  });
});

test.describe('W06 · find by map', () => {
  test('colour is status, and hovering a row lights its shape', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/map');

    await expect(page.getByText('In view · 9 properties')).toBeVisible();
    await expect(page.getByText('Colour is status')).toBeVisible();
    await expect(page.getByText('214/2 and 214/3 share a boundary')).toBeVisible();
    await expect(page.getByText(/basemap placeholder/)).toBeVisible();

    const shapes = page.locator('.plot polygon');
    expect(await shapes.count()).toBeGreaterThanOrEqual(9);

    await page.locator('aside .rows a').first().hover();
    await expect(page.locator('.hovercard')).toBeVisible();
    await expect(page.locator('.hovercard')).toContainText('Sy 214/2');
    await expect(page.locator('.hovercard')).toContainText('Khata 10021');
    expect(errors).toEqual([]);
  });

  test('a facet narrows both the map and the list', async ({ page }) => {
    await page.goto('/app/map');
    await page.getByRole('button', { name: /^Disputed/ }).click();
    // Singular, now that the header agrees with its count.
    await expect(page.getByText('In view · 1 property', { exact: false })).toBeVisible();
  });
});

test.describe('the shell', () => {
  test('every rail destination resolves and none errors', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app');
    await expect(page.locator('.nav a').first()).toBeVisible();
    const links = await page.locator('.nav a').all();
    expect(links.length).toBe(14);

    for (const link of links) {
      const href = await link.getAttribute('href');
      await page.goto(href!);
      await expect(page.locator('main')).toBeVisible();
      // Never a blank screen: every section states what it is.
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('the scheme toggle survives a reload', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'dark');
    await page.getByRole('button', { name: 'Switch to light' }).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'light');
    await page.reload();
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'light');
    await page.getByRole('button', { name: 'Switch to dark' }).click();
  });

  test('the jump box actually jumps — parcel, paper, person', async ({ page }) => {
    await page.goto('/app');
    const box = page.locator('#w360-search');

    // A parcel by its survey number.
    await box.fill('214/2');
    const results = page.locator('.jump-results');
    await expect(results).toBeVisible();
    await results.getByRole('option', { name: /Sy 214\/2/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${PARCEL}$`));

    // Navigation clears the box (an effect); wait for it or the next fill races it.
    await expect(box).toHaveValue('');

    // A paper by its name — Enter takes the first hit.
    await box.fill('Sale Deed 4417');
    await expect(results.getByRole('option', { name: /Sale Deed 4417\/2019/ }).first()).toBeVisible();
    await box.press('Enter');
    await expect(page).toHaveURL(/\/app\/papers\/w360-d-deed-4417/);

    await expect(box).toHaveValue('');

    // A person by theirs, landing on the record's People hanger.
    await box.fill('Satyanarayana');
    await results.getByRole('option', { name: /M. Satyanarayana/ }).first().click();
    await expect(page).toHaveURL(/\/people$/);
  });

  test('a search with no hits says so, and Enter still lands somewhere', async ({ page }) => {
    await page.goto('/app');
    const box = page.locator('#w360-search');
    await box.fill('zzzz-nothing');
    await expect(page.locator('.jump-results')).toContainText('Nothing matches');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/app\/properties\?q=zzzz-nothing/);
    await expect(page.getByText('Nothing matches “zzzz-nothing”')).toBeVisible();
  });

  test('at desktop the hamburger collapses the rail to icons, and remembers', async ({ page }) => {
    await page.goto('/app');
    const nav = page.locator('.nav');
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeVisible();

    // Collapsed: the words go, the icons stay, every section still clickable.
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(nav).toBeVisible();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();
    expect(await nav.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(80);
    await expect(nav.locator('a')).toHaveCount(14);

    // A preference, not a moment — it survives a reload.
    await page.reload();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();

    // An icon still navigates while collapsed…
    await nav.getByRole('link', { name: 'Papers', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/papers/);
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();

    // …and the hamburger brings the words back.
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeVisible();
  });

  test('on a phone the hamburger opens the rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app');

    // Off-canvas at rest, visible after the hamburger, closed again by use.
    await expect(page.locator('.nav')).not.toBeInViewport();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('.nav')).toBeInViewport();
    await page.locator('.nav').getByText('Properties').click();
    await expect(page).toHaveURL(/\/app\/properties/);
    await expect(page.locator('.nav')).not.toBeInViewport();
  });

  test('⌘K focuses the jump box', async ({ page }) => {
    await page.goto('/app');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('#w360-search')).toBeFocused();
  });

  test('the old vocabulary still resolves', async ({ page }) => {
    await page.goto('/app/documents');
    await expect(page).toHaveURL(/\/app\/papers/);
    await page.goto('/app/parcels');
    await expect(page).toHaveURL(/\/app\/properties\?kind=parcel/);
  });

  test('a record that is not yours is refused, not crashed', async ({ page }) => {
    await page.goto('/app/records/does-not-exist');
    await expect(page.getByText('That record is not in your portfolio')).toBeVisible();
  });
});

test.describe('no record renders as an empty shell', () => {
  test('every record in the list has figures, papers, features and people', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(9);
    const hrefs = await page.locator('.cards .rec').evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!));
    expect(hrefs.length).toBe(9);

    for (const href of hrefs) {
      await page.goto(href);
      const strip = page.locator('.strip').first();
      // The three things that read as "broken" when a record is bare.
      await expect(strip, `${href} market value`).not.toContainText('₹0');
      await expect(page.getByText('0.0000° N, 0.0000° E'), `${href} pin`).toHaveCount(0);
      await expect(page.getByText('No paper here matches that.'), `${href} papers`).toHaveCount(0);

      const tabs = page.locator('.tabs').first();
      for (const hanger of ['Papers', 'Features', 'People']) {
        const label = await tabs.locator('a', { hasText: hanger }).innerText();
        expect(Number(/\d+/.exec(label)?.[0] ?? 0), `${href} ${hanger}`).toBeGreaterThan(0);
      }
    }
  });

  test("a record's money and ledger both have rows", async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(9);
    const href = await page.locator('.cards .rec').nth(4)
      .evaluate((e) => (e as HTMLAnchorElement).getAttribute('href')!);

    await page.goto(`${href}/money`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText('Everything else you put in')).toBeVisible();

    await page.goto(`${href}/expenses`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});

test.describe('the record body fills the window', () => {
  // The two columns used to size themselves to their content and stop
  // two-thirds down a tall window, leaving the right rail in dead space.
  for (const [name, height] of [['tall', 1400], ['short', 800]] as const) {
    test(`${name} window · the two columns reach the bottom of the region`, async ({ page }) => {
      await page.setViewportSize({ width: 1512, height });
      await page.goto(`/app/records/${PARCEL}`);
      await page.waitForLoadState('networkidle');

      const { mainH, splitH } = await page.evaluate(() => {
        const m = document.querySelector('.w360 main')!.getBoundingClientRect();
        const s = document.querySelector('.w360 main > .split')!.getBoundingClientRect();
        return { mainH: m.height, splitH: s.height };
      });
      // The split owns everything under the page head, so it must be within a
      // page-head's worth of main's height — never a fraction of it.
      expect(splitH / mainH, `${name} window`).toBeGreaterThan(0.6);
    });
  }
});

test.describe('responsive', () => {
  for (const [name, width] of [['laptop', 1512], ['tablet', 900], ['phone', 390]] as const) {
    test(`${name} · no page scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/app', '/app/properties', `/app/records/${PARCEL}`,
        `/app/records/${PARCEL}/features`, `/app/records/${BIG}/money`, '/app/papers']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});
