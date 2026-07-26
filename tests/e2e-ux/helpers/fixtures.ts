/**
 * Shared fixtures for the UX + functionality review suite.
 *
 * Every test automatically FAILS on (teardown-asserted, soft so a test
 * collects everything wrong at once):
 *   1. page console errors (uncaught page errors always; resource-load
 *      errors except the known local-degradation endpoints, see
 *      CONSOLE_IGNORE),
 *   2. a new tab / popup opening (founder hard rule — share links wa.me /
 *      sms: / mailto: are the only allowed exceptions, and no test clicks
 *      them),
 * and `uxCheck(page, label)` — called by every spec — additionally probes:
 *   3. horizontal overflow (document scrollWidth > clientWidth),
 *   4. icon-only buttons without an accessible name,
 *   5. basic keyboard-focus visibility (Tab moves focus into the page and
 *      the focused element carries a visible indicator).
 */
import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

/* ── GraphQL (same endpoint + proxy the app itself uses) ─────────────── */

export const GRAPHQL_URL = 'http://localhost:5174/api/gateway/pattadar/graphql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gql<T = any>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await request.post(GRAPHQL_URL, { data: { query, variables } });
  expect(res.ok(), `GraphQL HTTP ${res.status()} for ${query.slice(0, 60)}…`).toBeTruthy();
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  expect(body.errors, `GraphQL errors: ${JSON.stringify(body.errors)}`).toBeFalsy();
  return body.data as T;
}

/* ── Formatter replicas (mirror @pattadar/core exactly) ──────────────── */

export const round2 = (n: number): number =>
  Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/** Mirror of @pattadar/core formatArea — "102 Acres 81 Cents". */
export function formatArea(acres: number): string {
  const a0 = Number(acres) || 0;
  if (a0 <= 0) return '0 Cents';
  const totalCents = round2(a0 * 100);
  const ac = Math.floor(totalCents / 100 + 1e-9);
  const ct = round2(totalCents - ac * 100);
  const parts: string[] = [];
  if (ac > 0) parts.push(`${ac} ${ac === 1 ? 'Acre' : 'Acres'}`);
  if (ct > 0 || ac === 0) parts.push(`${round2(ct)} ${ct === 1 ? 'Cent' : 'Cents'}`);
  return parts.join(' ');
}

/** Mirror of @pattadar/core formatINR — computed IN THE BROWSER so the ICU
 * output is byte-identical to what the app renders. */
export async function formatINR(page: Page, value: number): Promise<string> {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Math.round(Number(v) || 0)),
    value,
  );
}

/** Mirror of apps/web lib/format fmtLocal (dateOnly) — "23/07/2026". */
export function fmtLocalDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/* ── Auto UX gate ────────────────────────────────────────────────────── */

/** Console errors that are environment noise, not app findings:
 *  - /api/gateway/storage/* → cloud file storage does not exist locally;
 *    the app's own designed degradation ("storage offline" alert) covers it,
 *  - map tile / CDN fetches → external-network flake, not app behaviour. */
const CONSOLE_IGNORE: RegExp[] = [
  /\/api\/gateway\/storage\//i,
  /tile\.openstreetmap\.org|basemaps|arcgisonline|server\.arcgis/i,
  /Download the React DevTools/i,
];

/** The only tolerated new-page targets (share links; never clicked by tests). */
const POPUP_ALLOW: RegExp[] = [/^https:\/\/(wa\.me|api\.whatsapp\.com)/i, /^(sms|mailto|tel):/i];

export interface UxState {
  consoleErrors: string[];
  pageErrors: string[];
  popups: { url: string }[];
}

export const test = base.extend<{ ux: UxState }>({
  ux: [
    async ({ page, context }, use) => {
      const state: UxState = { consoleErrors: [], pageErrors: [], popups: [] };
      context.on('page', (p) => {
        if (p === page) return;
        const rec = { url: p.url() };
        state.popups.push(rec);
        p.waitForLoadState('domcontentloaded', { timeout: 2_000 })
          .then(() => (rec.url = p.url()))
          .catch(() => (rec.url = p.url()));
      });
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const loc = msg.location();
        state.consoleErrors.push(`${msg.text()}${loc?.url ? ` [${loc.url}]` : ''}`);
      });
      page.on('pageerror', (err) => state.pageErrors.push(String(err)));

      await use(state);

      if (state.popups.length) await page.waitForTimeout(500); // let popup URLs settle
      const badPopups = state.popups
        .map((p) => p.url)
        .filter((u) => !POPUP_ALLOW.some((re) => re.test(u)));
      expect
        .soft(badPopups, 'HARD RULE: the portal must never open a new tab/popup')
        .toEqual([]);
      const errs = state.consoleErrors.filter((e) => !CONSOLE_IGNORE.some((re) => re.test(e)));
      expect.soft(errs, 'Pages must not log console errors').toEqual([]);
      expect.soft(state.pageErrors, 'Pages must not throw uncaught errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/* ── Per-page UX probe (call in every spec) ──────────────────────────── */

export async function uxCheck(page: Page, label: string): Promise<void> {
  // 3. no horizontal page scroll
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return { sw: el.scrollWidth, cw: el.clientWidth };
  });
  expect
    .soft(
      overflow.sw <= overflow.cw + 1,
      `${label}: page scrolls horizontally (scrollWidth ${overflow.sw} > clientWidth ${overflow.cw})`,
    )
    .toBe(true);

  // 4. icon-only buttons must expose an accessible name
  const unnamed = await page.evaluate(() => {
    const out: string[] = [];
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const node of Array.from(candidates)) {
      const el = node as HTMLElement;
      if (el.getClientRects().length === 0) continue; // hidden (keepMounted drawers etc.)
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) continue; // has visible text = has a name
      const name =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('aria-labelledby');
      if (!name) out.push(el.outerHTML.slice(0, 140));
    }
    return out;
  });
  expect
    .soft(unnamed, `${label}: icon-only buttons without an accessible name`)
    .toEqual([]);

  // 5. keyboard focus lands in the page and is visibly indicated.
  // Reset focus first so Tab targets the FIRST tabbable element (pressing Tab
  // from the last tabbable would legitimately leave the page for browser UI).
  const hasTabbables = await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    return Boolean(
      document.querySelector(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  });
  if (hasTabbables) {
    await page.keyboard.press('Tab');
    // After a programmatic blur Chromium consumes one Tab re-establishing the
    // sequential-focus start point — a second Tab enters the page.
    if (await page.evaluate(() => document.activeElement === document.body))
      await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement)
        return { focused: false, visible: false, tag: '' };
      const cs = getComputedStyle(el);
      // Visible indicator = outline / box-shadow on the element itself, a MUI
      // keyboard-focus ripple (Mui-focusVisible), or a focused MUI field
      // wrapper (Mui-focused restyles the fieldset border).
      const wrapper = el.closest('.MuiInputBase-root');
      const visible =
        cs.outlineStyle !== 'none' ||
        cs.boxShadow !== 'none' ||
        el.classList.contains('Mui-focusVisible') ||
        Boolean(el.querySelector('.Mui-focusVisible')) ||
        Boolean(el.closest('.Mui-focusVisible')) ||
        Boolean(wrapper && wrapper.classList.contains('Mui-focused'));
      return { focused: true, visible, tag: el.tagName };
    });
    expect.soft(focus.focused, `${label}: pressing Tab must move focus into the page`).toBe(true);
    if (focus.focused)
      expect
        .soft(focus.visible, `${label}: keyboard focus on <${focus.tag}> has no visible indicator`)
        .toBe(true);
  }
}

/** Navigate into the signed-in app shell (mock auth signs the dev user in). */
export async function openApp(page: Page, path = '/app'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.MuiDrawer-docked')).toBeVisible();
}
