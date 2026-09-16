/**
 * The suite's own front door: `test` with the outside world already blocked.
 *
 * Every spec here imports `test` from this file rather than from Playwright,
 * and gets a page whose tile servers and geocoder are stubbed before it loads
 * anything. That used to be opt-in — a `stubTiles(page)` at the top of the
 * tests that opened a map — and it stopped being tenable the day the property
 * CARDS started drawing the ground each record sits on: the map moved onto the
 * app's landing screen, so "the tests that open a map" became "the tests".
 *
 * It is not a tidiness fix. The suite's whole premise is a self-contained
 * stack — its own API on :18080, its own built bundle on :5175, its own seeded
 * identity, and the founder's servers never touched. An unstubbed tile makes it
 * the internet's suite instead, and it fails in two ways that look like
 * anything but a network problem:
 *
 *   - Chromium reports a dead <img> as a CONSOLE ERROR, and watchConsole fails
 *     on any of those. The screen under test is fine; the gate says otherwise.
 *   - `waitForLoadState('networkidle')` never settles while forty card
 *     thumbnails are still in flight. Three responsive tests timed out at 60s
 *     each and the full run went from 6 minutes to 49.
 */
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The two key-free basemaps this app draws on. */
export const TILE_HOSTS = /tile\.openstreetmap\.org|server\.arcgisonline\.com/i;

/** OSM's geocoder, asked only when a record has neither a pin nor a survey. */
export const NOMINATIM = /nominatim\.openstreetmap\.org/i;

/** A 1x1 transparent PNG, served in place of every real map tile. */
export const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Markapur, as Nominatim actually answers for it — copied from a real reply
 *  so the shape under test is the shape in production. Stubbed for the same
 *  reason the tiles are: a gate must not depend on a third party being up, and
 *  the interesting behaviour is the FALLBACK ORDER, which is ours. Only the
 *  district resolves here, exactly as in life — Katragunta and Konakalamitla
 *  are not in OpenStreetMap. */
export async function stubGeocoder(page: Page): Promise<void> {
  await page.route(NOMINATIM, (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') ?? '');
    const hit = /^Markapur,/.test(q)
      ? [{ lat: '15.7406698', lon: '79.2698502',
           boundingbox: ['15.7006698', '15.7806698', '79.2298502', '79.3098502'],
           display_name: 'Markapur, Markapuram, Prakasam, Andhra Pradesh, India' }]
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) });
  });
}

export async function stubTiles(page: Page): Promise<void> {
  await page.route(TILE_HOSTS, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));
  await stubGeocoder(page);
}

/** Exercise the durable reader contract without invoking a paid AI provider. */
export async function stubDocumentReader(page: Page, fields: Record<string, unknown> = {}, error = ''): Promise<void> {
  await page.route('**/import-registered-document-async', (route) =>
    route.fulfill({ json: { job: 'e2e-reading-receipt' } }));
  await page.route('**/import-status/e2e-reading-receipt', (route) =>
    route.fulfill({ json: error ? { state: 'failed', error } : { state: 'done', fields } }));
}

/**
 * `page`, wrapped so the stubs are installed before the test body runs.
 *
 * `auto: true` is the point: a fixture a spec has to remember to ask for is
 * the opt-in this file exists to replace. A test that wants to see a tile
 * FAIL — the offline map notice — just routes the same pattern again
 * afterwards; the last route registered wins in Playwright, so overriding
 * stays available and only the default changed.
 */
export const test = base.extend<{ stubbedNetwork: void }>({
  stubbedNetwork: [async ({ page }, use) => {
    await stubTiles(page);
    const unexpectedReads: string[] = [];
    await page.route(/\/api\/gateway\/pattadar\/(?:import-registered-document|import-passbook|extract-property|extract-aadhaar)-async$/, (route) => {
      unexpectedReads.push(route.request().url());
      return route.fulfill({ status: 503, json: { error: 'Reader fixture missing; paid providers are blocked in E2E' } });
    });
    await use();
    expect(unexpectedReads, 'Every document reader call must use an explicit async fixture').toEqual([]);
  }, { auto: true }],
});

export { expect };
