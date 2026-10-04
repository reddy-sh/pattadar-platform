/**
 * The public doors — everything a stranger reaches with no account at all.
 *
 * routes.tsx mounts ten of them outside RequireAuth: "/" (the landing
 * page), /pricing, /login, /signup, /forgot-password, /privacy, /terms,
 * /auth/callback, /verify/:token and /active/:token. This file drives all
 * nine, plus the two things that happen to somebody who is NOT signed in and
 * asks for something else: the bounce that sends a deep /app URL to /login
 * carrying where it was aiming, and the 404 a stranger gets for a URL that
 * matches nothing at all.
 *
 * Five things a reader must know before changing anything below.
 *
 *  · THE SEAL DOES NOT COVER THESE SCREENS. /login, /signup and
 *    /forgot-password never touch /api: apps/web/src/auth/cognitoNative.ts
 *    posts SRP straight to https://cognito-idp.<region>.amazonaws.com/, and
 *    the social button redirects to auth.pattadar.com. fixtures/world.ts only
 *    answers /api, so an un-stubbed submit here would reach the founder's
 *    REAL user pool in ap-south-1 — a live authentication attempt against a
 *    production pool, from a test. A file-level beforeEach therefore ABORTS
 *    every request to both hosts, and each test that means to exercise a
 *    branch installs `stubCognito` over the top of it. Nothing in this file
 *    can reach AWS; a test that forgets its stub fails with the app's own
 *    network wording rather than signing anybody in.
 *
 *  · WHAT CANNOT BE FAKED, AND WHY IT IS NOT HERE. SRP is a two-round-trip
 *    zero-knowledge exchange; a SUCCESSFUL sign-in would need this file to be
 *    the user pool and compute the server half of the maths. So every
 *    sign-in branch asserted here is one Cognito refuses — wrong password,
 *    unconfirmed, unknown email, throttled, unreachable — and the happy path
 *    stays where it belongs, in the `@live` project backed by a real token
 *    from fixtures/session.ts. cognitoNative.ts:126's
 *    newPasswordRequired branch sits behind the same wall and is not
 *    asserted. Everything reachable WITHOUT completing SRP is asserted:
 *    sign-up, confirmation, resend, password reset — none of those is an SRP
 *    exchange, so all of them are driven end to end.
 *
 *  · THE BUILD DECIDES THE SOCIAL BUTTONS. enabledSocialProviders()
 *    (AuthProvider.tsx:54) reads VITE_SOCIAL_PROVIDERS, which
 *    scripts/start-local.sh:333 sets to "Google". That list is DISCOVERED off
 *    the dev server rather than written down here — Vite inlines
 *    import.meta.env into every module it serves — which is the same trick
 *    fixtures/session.ts uses to find the app client id. A spec that
 *    hard-coded "Google" would go green against a build that shows no social
 *    button at all, which is the regression worth catching.
 *
 *  · PUBLIC CAPABILITY PAGES NEVER ACT ON GET. /verify and /active expose
 *    deliberate controls and post exactly one AST-allowlisted mutation through
 *    the sealed gateway fixture. This protects against email-link scanners
 *    consuming a membership or safeguard credential merely by previewing it.
 *    The tests intercept only that named mutation and assert the raw token is
 *    never rendered into page copy.
 *
 *  · SIGNED OUT IS THE FILE'S DEFAULT. test.use({ signedIn: false }) at the
 *    top; the one describe that needs a session says so itself, because
 *    "what these doors do to somebody who is ALREADY signed in" is part of
 *    their behaviour (LandingPage.tsx:172, LoginPage.tsx:55,
 *    SignupPage.tsx:53, ForgotPasswordPage.tsx:40).
 */
import { test, expect } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

test.use({ signedIn: false });

// ── the world outside /api ─────────────────────────────────────────────

/** The SRP endpoint cognitoNative.ts posts to. Anchored on the trailing
 *  slash so it cannot also swallow the OIDC discovery document, which lives
 *  on the same host under the pool id. */
const COGNITO_API = /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/$/;

/** Everything this file must never let out of the browser. */
const OFF_SITE = /^https:\/\/(cognito-idp\.[a-z0-9-]+\.amazonaws\.com|auth\.pattadar\.com)\//;

/** A cross-origin fulfill is still subject to CORS; without these the
 *  browser discards the body and the app sees a network failure instead of
 *  the answer the test wrote. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': '*',
};

type Fault = { kind: 'fault'; type: string; message: string; delayMs?: number };
type Ok = { kind: 'ok'; payload: Record<string, unknown>; delayMs?: number };
type Unreachable = { kind: 'unreachable' };
type CognitoAnswer = Fault | Ok | Unreachable;

/** Cognito's own refusal, spelled the way the service spells it: `__type` is
 *  what amazon-cognito-identity-js/src/Client.js:119 reads to set err.code,
 *  which cognitoNative.ts:51 then maps to plain language. */
const fault = (type: string, message = ''): Fault => ({ kind: 'fault', type, message });
const ok = (payload: Record<string, unknown> = {}): Ok => ({ kind: 'ok', payload });
const unreachable = (): Unreachable => ({ kind: 'unreachable' });
const after = <T extends Fault | Ok>(ms: number, answer: T): T => ({ ...answer, delayMs: ms });

interface CognitoCall {
  target: string;
  params: Record<string, unknown>;
}

/**
 * Answer the user pool from the test instead of from ap-south-1.
 *
 * Keyed by operation — the tail of X-Amz-Target — because that is the only
 * thing that distinguishes one POST to the same URL from another. An
 * operation the test did not plan for comes back as a loud fault rather than
 * as a request to the real pool, for the same reason fixtures/world.ts
 * refuses to invent an answer: a screen that quietly did something else is
 * the regression the suite exists to catch.
 */
async function stubCognito(
  page: Page,
  answers: Record<string, CognitoAnswer>,
): Promise<CognitoCall[]> {
  const calls: CognitoCall[] = [];
  await page.route(COGNITO_API, async (route) => {
    const request = route.request();
    // The SRP POST carries X-Amz-Target and an amz content type, so the
    // browser preflights it. Playwright routes the OPTIONS too, and a
    // preflight left unanswered fails the real request with no explanation.
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const target = (request.headers()['x-amz-target'] ?? '').split('.').pop() ?? '';
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      /* a body that is not JSON is recorded as an empty one */
    }
    calls.push({ target, params });

    const answer = answers[target];
    if (!answer) {
      return route.fulfill({
        status: 400,
        headers: { ...CORS, 'content-type': 'application/x-amz-json-1.1' },
        body: JSON.stringify({
          __type: 'InternalErrorException',
          message: `The test world has no answer for Cognito's ${target}.`,
        }),
      });
    }
    if (answer.kind === 'unreachable') return route.abort('failed');
    if (answer.delayMs) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
    if (answer.kind === 'fault') {
      return route.fulfill({
        status: 400,
        headers: { ...CORS, 'content-type': 'application/x-amz-json-1.1' },
        body: JSON.stringify({ __type: answer.type, message: answer.message }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/x-amz-json-1.1' },
      body: JSON.stringify(answer.payload),
    });
  });
  return calls;
}

/**
 * The one console error a refused sign-in is ALLOWED to produce.
 *
 * Cognito answers a wrong password with HTTP 400 and a `__type` body, and
 * Chromium logs every failed request itself — in production exactly as here.
 * So the three describes that drive refusals turn the harness console guard
 * off and run this stricter one instead: that line, and nothing else. A real
 * exception from the app still fails the test.
 */
const REFUSAL = /Failed to load resource: the server responded with a status of 4\d\d/;

const refusalsOnly = (consoleErrors: string[]) =>
  expect(
    consoleErrors.filter((line) => !REFUSAL.test(line)),
    'the screen logged something that was not the pool refusing',
  ).toEqual([]);

/** What Cognito answers when it has emailed somebody a code. */
const CODE_SENT = {
  CodeDeliveryDetails: { Destination: 's***@e.com', DeliveryMedium: 'EMAIL', AttributeName: 'email' },
};

// ── what the running bundle was built with ─────────────────────────────

let discovered: Promise<Record<string, string>> | null = null;

/**
 * The VITE_* values compiled into the app under test.
 *
 * Vite dev prefixes every module it transforms with a literal
 * `import.meta.env = { … }`, so the running build's configuration is readable
 * from the dev server itself. fixtures/session.ts reads the app client id the
 * same way and for the same reason: a constant written down in the suite goes
 * stale silently, and the failure then looks like broken auth.
 */
async function buildEnv(baseURL: string): Promise<Record<string, string>> {
  discovered ??= (async () => {
    const response = await fetch(`${baseURL}/src/auth/AuthProvider.tsx`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    const hit = /import\.meta\.env\s*=\s*(\{[^\n]*?\});/.exec(body);
    return hit ? (JSON.parse(hit[1]) as Record<string, string>) : {};
  })();
  return discovered;
}

/** AuthProvider.tsx:54, in the test's own words — the same mapping, so a
 *  provider added to the env shows up as an expectation here. */
const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
  signinwithapple: 'Apple',
};

async function configuredSocials(baseURL: string): Promise<string[]> {
  const env = await buildEnv(baseURL);
  return (env.VITE_SOCIAL_PROVIDERS ?? '')
    .split(',')
    .map((entry) => PROVIDER_LABEL[entry.trim().toLowerCase()])
    .filter((label): label is string => Boolean(label));
}

// ── the landing page's product copy (pages/landing/landingContent.ts) ───

const HERO_LINE_1 = 'One piece of land.';
const HERO_LINE_2 = 'Many places to look.';
const HERO_LEAD = 'Revenue entries, survey maps and registered deeds tell different parts of the story. Pattadar helps your family keep its copies together; official records stay with the state.';

/** Each primary-nav entry and the heading the section it names carries. */
const NAV_SECTIONS: Array<[label: string, heading: string]> = [
  ['About', 'Why one property has many records'],
  ['Features', 'What you can do'],
  ['Pattadar AI', 'An assistant for your records'],
  ['How it works', 'How Pattadar works'],
  ['Land records', 'What to keep with a property'],
  ['Network', 'A network around your land'],
  ['Services', "Services we're building next"],
  ['FAQ', 'Asked by families like yours'],
];

// ── nothing leaves for AWS ─────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // Registered first, so any stubCognito a test installs takes precedence.
  // What is left over is what nobody planned for, and it must not travel.
  await page.route(OFF_SITE, (route) => route.abort('failed'));
});

// ═══ the front page ════════════════════════════════════════════════════

test.describe('the front page', () => {
  test('says what Pattadar is in concrete terms', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /One piece of land/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_LINE_1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_LINE_2);
    await expect(page.getByText('India · Andhra Pradesh · Telangana')).toBeVisible();
    await expect(page.getByRole('banner').getByText('Pattadar.', { exact: true })).toBeVisible();
    await expect(page.locator('.hero__lead')).toHaveText(HERO_LEAD);
  });

  test('states specific protections without a storage-region promise', async ({ page }) => {
    await page.goto('/');
    for (const claim of [
      'Encrypted storage',
      'Aadhaar field masked',
      'You choose access',
    ]) {
      await expect(page.locator('.site').getByText(claim)).toBeVisible();
    }
  });

  test('the front page shows no invented portfolio figures', async ({ page }) => {
    // The "Land portfolio · sample" card was removed on 27/09/2026 (design.md
    // § Copy freeze). Its invented rupee total and survey numbers must not
    // come back as an unlabelled figure either.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Land portfolio · sample' })).toHaveCount(0);
    await expect(page.getByText('₹2,84,50,000')).toHaveCount(0);
    await expect(page.getByText('12 parcels · 3 passbooks · 2 properties')).toHaveCount(0);
  });

  test('a visitor who asks for less motion gets the same readable lead', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route(OFF_SITE, (route) => route.abort('failed'));
    await page.goto('/');
    await expect(page.locator('.hero__lead')).toHaveText(HERO_LEAD);
    await expect(page.locator('.hero-story__narration')).toContainText('Keep the copies in one place.');
    await expect(page.getByRole('group', { name: 'Land record story chapters' }).getByRole('button', { name: /Pattadar/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero-story__note')).toHaveText('Illustrative landscape and record trail');
    await context.close();
  });

  test('the hero shows the land and the distinct record sources, not an app mockup', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero__landscape')).toHaveCSS('background-image', /land-records-hero\.jpg/);
    await expect(page.locator('.hero-story__record')).toHaveCount(3);
    await expect(page.locator('.hero-story__record-text').nth(0)).toContainText('1-B / Adangal');
    await expect(page.locator('.hero-story__record-text').nth(1)).toContainText('FMB / village map');
    await expect(page.locator('.hero-story__record-text').nth(2)).toContainText('Registered deed');
    await expect(page.locator('.hero-scene__svg')).toHaveCount(0);
  });

  test('the context links to the official record sources', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#story a[href="https://dolr.gov.in/en/programmes-schemes/dilrmp-2/"]')).toBeVisible();
    await expect(page.locator('#story a[href="https://meebhoomi.ap.gov.in/"]')).toBeVisible();
    await expect(page.locator('#story a[href="https://bhubharati.telangana.gov.in/"]')).toBeVisible();
  });

  test('the record trail settles on Pattadar’s limited role', async ({ page }) => {
    await page.goto('/');
    const chapters = page.getByRole('group', { name: 'Land record story chapters' });
    await expect(chapters.getByRole('button', { name: /Pattadar/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 12000 });
    await expect(page.locator('.hero-story__narration')).toContainText('Organise the papers you have');
    await expect(page.locator('.hero__lead')).toContainText('official records stay with the state');
  });

  test('the record chapters can be selected and stop autoplay', async ({ page }) => {
    await page.goto('/');
    const chapters = page.getByRole('group', { name: 'Land record story chapters' });
    await chapters.getByRole('button', { name: /Survey/ }).click();
    await expect(page.locator('.hero-story__narration')).toContainText('The shape is in another.');
    await page.waitForTimeout(3100);
    await expect(chapters.getByRole('button', { name: /Survey/ })).toHaveAttribute('aria-pressed', 'true');
    await chapters.getByRole('button', { name: /Deed/ }).click();
    await expect(page.locator('.hero-story__narration')).toContainText('The transaction has its own trail.');
    await chapters.getByRole('button', { name: /Pattadar/ }).click();
    await expect(page.locator('[data-stage="pattadar-arrival"]')).toContainText('Your copies, kept together');
  });

  test('record chapters change instantly under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const chapters = page.getByRole('group', { name: 'Land record story chapters' });
    await expect(chapters.getByRole('button', { name: /Pattadar/ })).toHaveAttribute('aria-pressed', 'true');
    await chapters.getByRole('button', { name: /Revenue/ }).click();
    await expect(page.locator('.hero-story__narration')).toContainText('The name is in one record.');
    await context.close();
  });

  test('the journey shows each product workflow when its step is selected', async ({ page }) => {
    await page.goto('/');
    const journey = page.locator('#how');
    await journey.scrollIntoViewIfNeeded();
    const steps = journey.locator('.journey__step-btn');
    const inviteReveal = journey.locator('[data-stage="invite-reveal"]');
    const documentsReveal = journey.locator('[data-stage="organised-reveal"]');

    await steps.nth(1).click();
    await expect.poll(async () => Number.parseFloat(await inviteReveal.getAttribute('width') ?? '0')).toBeGreaterThan(500);
    await expect(steps.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await steps.nth(2).click();
    await expect.poll(async () => Number.parseFloat(await documentsReveal.getAttribute('width') ?? '0')).toBeGreaterThan(500);
    await expect(steps.nth(2)).toHaveAttribute('aria-pressed', 'true');

    await steps.nth(0).click();
    await expect.poll(async () => Number.parseFloat(await inviteReveal.getAttribute('width') ?? '510')).toBeLessThan(1);
    await expect.poll(async () => Number.parseFloat(await documentsReveal.getAttribute('width') ?? '510')).toBeLessThan(1);
  });

  test('skipping a journey step still shows each product view in order', async ({ page }) => {
    await page.goto('/');
    const journey = page.locator('#how');
    await journey.scrollIntoViewIfNeeded();
    const steps = journey.locator('.journey__step-btn');
    await steps.nth(0).click();
    await expect.poll(async () => journey.locator('[data-stage="invite-reveal"]').evaluate(
      (rect) => Number.parseFloat(rect.getAttribute('width') ?? '0'),
    )).toBeLessThan(1);

    const sampling = journey.evaluate(async (root) => {
      const invite = root.querySelector('[data-stage="invite-reveal"]');
      const organised = root.querySelector('[data-stage="organised-reveal"]');
      return new Promise<Array<[number, number]>>((resolve) => {
        const samples: Array<[number, number]> = [];
        const started = performance.now();
        const sample = () => {
          samples.push([
            Number.parseFloat(invite?.getAttribute('width') ?? '0'),
            Number.parseFloat(organised?.getAttribute('width') ?? '0'),
          ]);
          if (performance.now() - started >= 1500) resolve(samples);
          else requestAnimationFrame(sample);
        };
        sample();
      });
    });
    await steps.nth(2).click();
    const samples = await sampling;
    expect(samples.some(([invite, organised]) => invite > 20 && invite < 490 && organised < 1)).toBe(true);
    expect(samples.some(([invite, organised]) => invite > 509 && organised > 20 && organised < 490)).toBe(true);
    expect(samples.every(([invite, organised]) => organised < 1 || invite > 509)).toBe(true);

    await steps.nth(0).click();
    await steps.nth(1).click();
    await expect.poll(async () => journey.locator('[data-stage="invite-reveal"]').evaluate(
      (rect) => Number.parseFloat(rect.getAttribute('width') ?? '0'),
    )).toBeGreaterThan(509);
    await expect.poll(async () => journey.locator('[data-stage="organised-reveal"]').evaluate(
      (rect) => Number.parseFloat(rect.getAttribute('width') ?? '0'),
    )).toBeLessThan(1);
    await expect(steps.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('a narrow phone can open and use the section menu', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Land record story chapters' }).getByRole('button', { name: /Pattadar/ })).toBeVisible();
    await expect.poll(async () => page.locator('#story .section-eyebrow').evaluate(
      (label) => label.getBoundingClientRect().top,
    )).toBeLessThan(700);
    const menu = page.getByRole('button', { name: 'Sections' });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Land records' }).click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'What to keep with a property' })).toBeInViewport();
  });

  test('the hero leaves the next section visible at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('.hero-story__narration')).toBeVisible();
    await expect.poll(async () => page.locator('#story .section-eyebrow').evaluate(
      (label) => label.getBoundingClientRect().top,
    )).toBeLessThan(812);
    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )).toBe(0);
  });

  /** Every way in, where each one lives, and where it goes. "Sign in" is for
   *  somebody with an account (startSignIn → /login); "Get started" is for
   *  somebody without one (startSignUp → /signup, the page Pricing's "Create
   *  an account" opens). Neither may ever leave pattadar.com. */
  const WAYS_IN: Array<[where: string, button: string, url: RegExp, heading: string]> = [
    ['banner', 'Sign in', /\/login$/, 'Sign in'],
    ['region', 'Get started', /\/signup$/, 'Create your account'],
    ['region', 'Sign in', /\/login$/, 'Sign in'],
    ['contentinfo', 'Create an account', /\/signup$/, 'Create your account'],
  ];

  for (const [where, button, url, heading] of WAYS_IN) {
    test(`the ${where === 'region' ? 'hero' : where} "${button}" button opens our own "${heading}" page, never somebody else's`, async ({ page }) => {
      await page.goto('/');
      const scope =
        where === 'region'
          ? page.getByRole('region', { name: /One piece of land/ })
          : page.getByRole(where as 'banner' | 'contentinfo');
      await scope.getByRole('button', { name: button, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  test('the three stages are tabs: one answer at a time, reachable by arrow keys', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('tablist', { name: 'With you at every stage' });
    const before = tabs.getByRole('tab', { name: 'Before buying or selling' });
    const during = tabs.getByRole('tab', { name: 'During the transaction' });
    const after = tabs.getByRole('tab', { name: 'After the transaction' });
    const panel = page.getByRole('tabpanel');

    await expect(before).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toContainText('Stage 1');
    await expect(panel).toContainText('get discrepancies checked before you commit');
    await expect(page.getByText('The registrar confirms the official requirements', { exact: false })).toHaveCount(0);

    await during.click();
    await expect(during).toHaveAttribute('aria-selected', 'true');
    await expect(before).toHaveAttribute('aria-selected', 'false');
    await expect(panel).toContainText('Stage 2');
    await expect(panel).toContainText('The registrar confirms the official requirements');

    await page.keyboard.press('ArrowRight');
    await expect(after).toBeFocused();
    await expect(after).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toContainText('Stage 3');
    // Wraps: the last tab's right is the first tab.
    await page.keyboard.press('ArrowRight');
    await expect(before).toBeFocused();
    await expect(panel).toContainText('Stage 1');
    await page.keyboard.press('End');
    await expect(after).toBeFocused();
  });

  test('stage tabs change instantly for visitors who prefer reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('tab', { name: 'During the transaction' }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText('Stage 2');
    await expect(panel.locator('.stages__panel-content')).toHaveCSS('opacity', '1');
    await expect(panel.locator('.stages__panel-content')).toHaveCSS('transform', 'none');
    await context.close();
  });

  test('the primary nav jumps to every section it names, and each one is really there', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const [label, heading] of NAV_SECTIONS) {
      await nav.getByRole('button', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
        `"${label}" should have scrolled its section into view`,
      ).toBeInViewport();
    }
  });

  test('an FAQ answer stays folded away until it is asked for', async ({ page }) => {
    await page.goto('/');
    const question = page.getByText('Is my Aadhaar number safe here?');
    const answer = page.getByText('Pattadar shows saved Aadhaar numbers masked', { exact: false });
    await expect(answer).toBeHidden();
    await question.click();
    await expect(answer).toBeVisible();
    await expect(answer).toContainText('Pattadar does not perform Aadhaar authentication');
  });

  test('the front page says plainly that it is not a government website', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Is Pattadar a government website?').click();
    await expect(page.getByText('No. Pattadar is a private service', { exact: false })).toBeVisible();
  });

  test('the small print links to the privacy notice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  });

  test('the small print links to the terms', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Terms' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
  });

  test('the grievance address is a real mailto, not a page that does not exist', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Grievance: grievance@pattadar.com' }),
    ).toHaveAttribute('href', 'mailto:grievance@pattadar.com');
  });

  test('the header offers Pricing exactly once and opens it at the top of the same portal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const pricing = page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true });
    await expect(pricing).toHaveCount(1);
    await pricing.click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Start free');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
  });

  test('@phone the front page fits a phone, and keeps every way in', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /One piece of land/ })).toBeVisible();
    await expect(
      page.getByRole('region', { name: /One piece of land/ }).getByRole('button', { name: 'Get started' }),
    ).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Pricing' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
  });
});

// ═══ /pricing ═════════════════════════════════════════════════════════

test.describe('the pricing page', () => {
  test('states the free allowance and every planned price without offering checkout', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Start free');
    await expect(page.getByRole('heading', { name: 'Free', exact: true })).toBeVisible();
    await expect(page.getByText('1 Family', { exact: true })).toBeVisible();
    await expect(page.getByText('2 holdings', { exact: true })).toBeVisible();
    await expect(page.getByText('1 GB storage', { exact: true })).toBeVisible();
    await expect(page.getByText('₹249 / month', { exact: true })).toBeVisible();
    await expect(page.getByText('₹599 / month', { exact: true })).toBeVisible();
    await expect(page.getByText('₹1,499 / month', { exact: true })).toBeVisible();
    await expect(page.getByText('10 GB additional storage · 1,000 file versions')).toBeVisible();
    await expect(page.getByText('100 GB additional storage · 10,000 file versions')).toBeVisible();
    await expect(page.getByText('Planned free allowance')).toHaveCount(1);
    await expect(page.getByText('Paid checkout coming later')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /buy|checkout|choose plan/i })).toHaveCount(0);
  });

  test('has one free account action and truthful route metadata', async ({ page }) => {
    await page.goto('/pricing');
    const start = page.getByRole('link', { name: 'Create an account' });
    await expect(start).toHaveCount(1);
    await expect(start).toHaveAttribute('href', '/signup');
    await expect(page).toHaveTitle('Pricing · Pattadar');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/pricing$/);
  });

  test('@phone fits without hiding Pricing or creating a second navigation copy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pricing');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Pricing' })).toHaveCount(1);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'Pricing scrolls sideways on a phone').toBeLessThanOrEqual(1);
  });

  test('keeps its structure in forced-colour mode', async ({ browser }) => {
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await page.route(OFF_SITE, (route) => route.abort('failed'));
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Estate' })).toBeVisible();
    await context.close();
  });
});

// ═══ /login ════════════════════════════════════════════════════════════

test.describe('the sign-in page', () => {
  // See REFUSAL above: the pool's own 400 is logged by the browser, not by
  // the app, so the harness guard is replaced with a stricter one.
  test.use({ allowConsole: true });
  test.afterEach(async ({ consoleErrors }) => refusalsOnly(consoleErrors));

  test('renders our own form, on our own domain', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Welcome back. Sign in to see your land records.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    // The founder rule the whole native-auth module exists for: the form is
    // ours, on our origin, and no redirect took the customer anywhere else.
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/login$/);
  });

  test('an empty sign-in names both missing things, and asks Cognito nothing', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    expect(calls, 'an empty form must never reach the user pool').toEqual([]);
  });

  test('an email with no @ in it is refused before it leaves the browser', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankarreddy');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('a missing password is named on its own field, not as a general failure', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await expect(page.getByText('Enter your email address.')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test('an email padded with spaces is trimmed rather than rejected', async ({ page }) => {
    const calls = await stubCognito(page, {
      InitiateAuth: fault('NotAuthorizedException', 'Incorrect username or password.'),
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill('  shankar@pattadar.local  ');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ AuthParameters: { USERNAME: 'shankar@pattadar.local' } });
  });

  test('the wrong password comes back in plain language, not as a Cognito exception', async ({ page }) => {
    await stubCognito(page, {
      InitiateAuth: fault('NotAuthorizedException', 'Incorrect username or password.'),
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByLabel('Password').fill('not-the-password-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
    // And the form is usable again, rather than stuck in its sending state.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  });

  test('an email nobody has an account for says so, instead of blaming the password', async ({ page }) => {
    await stubCognito(page, { InitiateAuth: fault('UserNotFoundException', 'User does not exist.') });
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('We could not find an account with that email.');
  });

  test('too many tries asks you to wait, and says roughly how long', async ({ page }) => {
    await stubCognito(page, { InitiateAuth: fault('TooManyRequestsException', 'Rate exceeded') });
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Too many attempts. Please wait a few minutes and try again.',
    );
  });

  test('an account that was never confirmed is taken to the confirmation step, not told off', async ({ page }) => {
    await stubCognito(page, {
      InitiateAuth: fault('UserNotConfirmedException', 'User is not confirmed.'),
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill('halfway@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(
      'This account has not been confirmed yet. Enter the code from your email, or resend it.',
    );
    // The email it carried over is the one they typed — otherwise the code
    // they were emailed belongs to nobody on this screen.
    await expect(page.getByLabel('Email')).toHaveValue('halfway@pattadar.local');
    await expect(page.getByLabel('Confirmation code')).toBeFocused();
  });

  test('while a sign-in is in flight the button says so and cannot be pressed twice', async ({ page }) => {
    const calls = await stubCognito(page, {
      InitiateAuth: after(2_000, fault('NotAuthorizedException', 'Incorrect username or password.')),
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const busy = page.getByRole('button', { name: 'Signing in…' });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
    expect(calls, 'a disabled button must not be able to send a second attempt').toHaveLength(1);
  });

  test('the sign-in page offers the way to a new account', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('New to Pattadar?')).toBeVisible();
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  });

  test('the sign-in page offers the way out of a forgotten password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
  });

  test('the social buttons on offer are exactly the ones this build configured', async ({ page, baseURL }) => {
    const expected = await configuredSocials(baseURL!);
    await page.goto('/login');

    if (expected.length === 0) {
      await expect(page.getByText('or continue with')).toHaveCount(0);
    } else {
      await expect(page.getByText('or continue with')).toBeVisible();
    }
    for (const label of expected) {
      await expect(page.getByRole('button', { name: `Continue with ${label}` })).toBeVisible();
    }
    for (const label of ['Google', 'Facebook', 'Apple'].filter((l) => !expected.includes(l))) {
      await expect(
        page.getByRole('button', { name: `Continue with ${label}` }),
        `${label} is not in VITE_SOCIAL_PROVIDERS, so it must not be offered`,
      ).toHaveCount(0);
    }
  });
});

test.describe('the sign-in page with the pool out of reach', () => {
  // An aborted request logs net::ERR_FAILED as well as the app's own handling,
  // and the app's own handling is the whole point of the test, so the console
  // guard is off for this one rather than narrowed.
  test.use({ allowConsole: true });

  test('a pool that cannot be reached is explained, not quoted', async ({ page }) => {
    // DEFECT: amazon-cognito-identity-js/src/Client.js:106 throws the literal
    // string "Network error" for a request that never arrived, and
    // apps/web/src/auth/cognitoNative.ts:91 lets the default branch pass that
    // raw message through untranslated — so a farmer on a bad connection is
    // shown two words of developer English, on the one screen the whole
    // native-auth module exists to keep in plain language. Every other branch
    // in that switch is written out properly; this one is owed the same, e.g.
    // "We could not reach the sign-in service. Check your connection and try
    // again."
    test.fail();
    await stubCognito(page, { InitiateAuth: unreachable() });
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toHaveText('Network error');
    await expect(alert).toHaveText(/could not reach|connection|try again/i);
  });

  test('a pool that cannot be reached still gives the form back', async ({ page }) => {
    // Whatever it says, it must not strand the person in the sending state —
    // LoginPage.tsx:84 clears `submitting` on the way out of the catch.
    await stubCognito(page, { InitiateAuth: unreachable() });
    await page.goto('/login');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByLabel('Password').fill('whatever-1A!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Email')).toHaveValue('shankar@pattadar.local');
  });
});

// ═══ the bounce, and what it remembers ═════════════════════════════════

test.describe('a deep link followed without an account', () => {
  /** Where the reader was aiming. Each is a real route under RequireAuth
   *  (routes.tsx:247), and one carries a query string, because
   *  RequireAuth.tsx:28 preserves pathname + search and dropping the search
   *  would land a shared, filtered list on the unfiltered one. */
  const AIMED_AT = [
    '/app',
    '/app/papers',
    `/app/records/${ID.parcel}`,
    '/app/properties?kind=parcel',
  ];

  for (const deep of AIMED_AT) {
    test(`${deep} lands on sign-in, and remembers it was aiming there`, async ({ page }) => {
      await page.goto(deep);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

      // The aim is not on the screen — it rides in the router's location
      // state, which react-router keeps under history.state.usr. That is the
      // only place it exists, so it is the only place it can be asserted,
      // and LoginPage.tsx:46 reads it from exactly there.
      const aim = await page.evaluate(
        () => (window.history.state as { usr?: { returnTo?: string } } | null)?.usr?.returnTo ?? null,
      );
      expect(aim).toBe(deep);
    });
  }

  test('the bounce replaces the guarded URL rather than stacking it, so Back does not loop', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}`);
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page, 'Back returned to the guarded URL, which bounces again').not.toHaveURL(
      /\/app\/records/,
    );
  });

  test('a signed-out deep link never asks the API for the record it could not show', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}`);
    await expect(page).toHaveURL(/\/login$/);
    expect(
      world.askedFields(),
      'RequireAuth must decide before any screen mounts and starts fetching',
    ).toEqual([]);
  });
});

// ═══ the social door ═══════════════════════════════════════════════════

test.describe('the social sign-in redirect', () => {
  /**
   * Stand in for Cognito's discovery document and its hosted UI.
   *
   * oidc-client-ts asks the authority for /.well-known/openid-configuration
   * before it can build an authorize URL, then navigates the top-level
   * document to the authorization_endpoint. The navigation is ABORTED rather
   * than answered, on purpose: an aborted main-frame navigation leaves the
   * browser on /login, which is the only origin whose localStorage holds the
   * OAuth state this test has to read.
   */
  async function stubHostedUi(page: Page, authority: string): Promise<string[]> {
    const authorized: string[] = [];
    await page.route(/\/\.well-known\/openid-configuration$/, (route) =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: authority,
          authorization_endpoint: 'https://auth.pattadar.com/oauth2/authorize',
          token_endpoint: 'https://auth.pattadar.com/oauth2/token',
          userinfo_endpoint: 'https://auth.pattadar.com/oauth2/userInfo',
          end_session_endpoint: 'https://auth.pattadar.com/logout',
          jwks_uri: `${authority}/.well-known/jwks.json`,
          response_types_supported: ['code'],
          scopes_supported: ['openid', 'email', 'profile'],
          code_challenge_methods_supported: ['S256'],
        }),
      }),
    );
    await page.route(/^https:\/\/auth\.pattadar\.com\//, (route) => {
      authorized.push(route.request().url());
      return route.abort('aborted');
    });
    return authorized;
  }

  test('Continue with Google leaves for our own auth domain, straight to Google, and carries the aim with it', async ({
    page,
    baseURL,
  }) => {
    const env = await buildEnv(baseURL!);
    const socials = await configuredSocials(baseURL!);
    test.skip(socials.length === 0, 'this build offers no social sign-in');
    const authorized = await stubHostedUi(page, env.VITE_COGNITO_AUTHORITY);

    // Arrive the way somebody following a shared link arrives.
    await page.goto(`/app/records/${ID.parcel}`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: `Continue with ${socials[0]}` }).click();

    await expect.poll(() => authorized.length).toBeGreaterThan(0);
    const url = new URL(authorized[0]);
    // Founder rule (AuthProvider.tsx:8): the only URL a customer may see that
    // is not pattadar.com is our own auth subdomain.
    expect(url.origin).toBe('https://auth.pattadar.com');
    expect(url.pathname).toBe('/oauth2/authorize');
    // identity_provider is what skips Cognito's own chooser page.
    expect(url.searchParams.get('identity_provider')).toBe(socials[0] === 'Apple' ? 'SignInWithApple' : socials[0]);
    expect(url.searchParams.get('client_id')).toBe(env.VITE_COGNITO_CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(`${baseURL}/auth/callback`);

    // And the destination survives the round trip: it is written into the
    // OAuth state, which is what /auth/callback reads back.
    const stored = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('oidc.'))
        .map((key) => localStorage.getItem(key) ?? '')
        .join('\n'),
    );
    expect(stored, 'the aim was dropped on the way to the provider').toContain(
      `/app/records/${ID.parcel}`,
    );
  });
});

// ═══ /auth/callback ════════════════════════════════════════════════════

test.describe('the social sign-in return', () => {
  test('a callback with nothing in it says so, instead of spinning for ever', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page.getByRole('heading', { name: 'Sign-in could not be completed' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to home' })).toBeVisible();
  });

  test('the way out of a failed callback is the front page, and it works', async ({ page }) => {
    await page.goto('/auth/callback');
    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /One piece of land/ })).toBeVisible();
  });

  test('a callback explains itself in words a customer wrote, not the ones a library did', async ({ page }) => {
    // DEFECT: apps/web/src/auth/AuthCallbackPage.tsx:30 hands
    // `e.message` straight to the screen (rendered at :50). With nothing in the URL,
    // oidc-client-ts throws the literal string "No state in response"
    // (oidc-client-ts/dist/umd/oidc-client-ts.js:2019), so a customer whose
    // social sign-in was interrupted is shown a sentence from inside an OAuth
    // library. The owner is owed one plain sentence — the same treatment
    // cognitoNative.ts:51 gives every Cognito failure — with the raw text
    // kept for the log.
    test.fail();
    await page.goto('/auth/callback');
    await expect(page.getByRole('heading', { name: 'Sign-in could not be completed' })).toBeVisible();
    await expect(page.getByText('No state in response')).toHaveCount(0);
  });
});

// ═══ /signup ═══════════════════════════════════════════════════════════

test.describe('creating an account', () => {
  // See REFUSAL above: the pool's own 400 is logged by the browser, not by
  // the app, so the harness guard is replaced with a stricter one.
  test.use({ allowConsole: true });
  test.afterEach(async ({ consoleErrors }) => refusalsOnly(consoleErrors));

  const PASSWORD_HINT =
    'At least 8 characters, with upper and lower case letters, a number and a symbol.';

  const fillSignup = async (page: Page, email: string, password: string) => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
  };

  test('the page asks for an email, a password, and says what a password must be', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    await expect(
      page.getByText("Keep your family's land records safe, in one place."),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByText(PASSWORD_HINT)).toBeVisible();
  });

  test('an empty sign-up names both missing things, and asks Cognito nothing', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/signup');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Choose a password.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('an email with no @ in it is refused before an account is attempted', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/signup');
    await fillSignup(page, 'shankarreddy', 'Str0ng-enough!');
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('a password under eight characters is refused here rather than by Cognito', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/signup');
    await fillSignup(page, 'new@pattadar.local', 'Ab1!');
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    // And the hint it replaced comes back to say what IS needed.
    expect(calls).toEqual([]);
  });

  test('a good sign-up moves to the code step and says where the code went', async ({ page }) => {
    const calls = await stubCognito(page, {
      SignUp: ok({ UserConfirmed: false, UserSub: 'w-sub-1', ...CODE_SENT }),
    });
    await page.goto('/signup');
    await fillSignup(page, 'new@pattadar.local', 'Str0ng-enough!');

    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(
      'We have emailed a confirmation code to new@pattadar.local. Enter it below.',
    );
    await expect(page.getByLabel('Confirmation code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend code' })).toBeVisible();
    // The email is fixed now — an account was created against it.
    await expect(page.getByLabel('Email')).toBeDisabled();
    expect(calls.map((c) => c.target)).toEqual(['SignUp']);
    expect(calls[0].params).toMatchObject({ Username: 'new@pattadar.local' });
  });

  test('an email that already has an account is told to sign in, on the email field', async ({ page }) => {
    await stubCognito(page, {
      SignUp: fault('UsernameExistsException', 'An account with the given email already exists.'),
    });
    await page.goto('/signup');
    await fillSignup(page, 'shankar@pattadar.local', 'Str0ng-enough!');
    await expect(
      page.getByText('An account with this email already exists. Try signing in instead.'),
    ).toBeVisible();
    // Still on the form: the point is to correct the email, not start over.
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  });

  test("a password the pool refuses says what the pool wanted, without the pool's prefix", async ({ page }) => {
    await stubCognito(page, {
      SignUp: fault(
        'InvalidPasswordException',
        'Password did not conform with policy: Password must have symbol characters',
      ),
    });
    await page.goto('/signup');
    await fillSignup(page, 'new@pattadar.local', 'Str0ngenough');
    await expect(page.getByText('Password must have symbol characters')).toBeVisible();
    await expect(page.getByText('Password did not conform with policy')).toHaveCount(0);
  });

  test('a sign-up the pool refuses for a reason of its own is still said in one sentence', async ({ page }) => {
    await stubCognito(page, {
      SignUp: fault('InvalidParameterException', 'Invalid email address format.'),
    });
    await page.goto('/signup');
    await fillSignup(page, 'new@pattadar.local', 'Str0ng-enough!');
    await expect(page.getByRole('alert')).toHaveText('Invalid email address format.');
  });

  /** Arrive at the code step the way a fresh sign-up does. */
  async function reachConfirmStep(
    page: Page,
    answers: Record<string, CognitoAnswer>,
  ): Promise<CognitoCall[]> {
    const calls = await stubCognito(page, {
      SignUp: ok({ UserConfirmed: false, UserSub: 'w-sub-1', ...CODE_SENT }),
      ...answers,
    });
    await page.goto('/signup');
    await page.getByLabel('Email').fill('new@pattadar.local');
    await page.getByLabel('Password').fill('Str0ng-enough!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    return calls;
  }

  test('confirming with no code asks for the code rather than calling the pool', async ({ page }) => {
    const calls = await reachConfirmStep(page, {});
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Enter the code from your email.')).toBeVisible();
    expect(calls.map((c) => c.target)).toEqual(['SignUp']);
  });

  test('a code that is not the one we emailed says so, on the code field', async ({ page }) => {
    await reachConfirmStep(page, {
      ConfirmSignUp: fault('CodeMismatchException', 'Invalid verification code provided.'),
    });
    await page.getByLabel('Confirmation code').fill('000000');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(
      page.getByText('That code is not correct. Check the email we sent you and try again.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  test('a code that has gone stale tells you to ask for another one', async ({ page }) => {
    await reachConfirmStep(page, {
      ConfirmSignUp: fault('ExpiredCodeException', 'Invalid code provided, please request a code again.'),
    });
    await page.getByLabel('Confirmation code').fill('123456');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('That code has expired. Request a new one.')).toBeVisible();
  });

  test('Resend code sends another one and says where it went', async ({ page }) => {
    const calls = await reachConfirmStep(page, { ResendConfirmationCode: ok(CODE_SENT) });
    await page.getByRole('button', { name: 'Resend code' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'We have sent a new code to new@pattadar.local.',
    );
    expect(calls.map((c) => c.target)).toEqual(['SignUp', 'ResendConfirmationCode']);
  });

  test('a resend the pool throttles says to wait, rather than pretending it sent one', async ({ page }) => {
    await reachConfirmStep(page, {
      ResendConfirmationCode: fault('LimitExceededException', 'Attempt limit exceeded'),
    });
    await page.getByRole('button', { name: 'Resend code' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many attempts' })).toBeVisible();
    await expect(page.getByText('We have sent a new code')).toHaveCount(0);
  });

  test('a confirmed account whose automatic sign-in cannot be completed lands on sign-in, told why', async ({ page }) => {
    // The real path signs the new account straight in (SignupPage.tsx:106).
    // That half is an SRP exchange this file cannot be the far end of, so the
    // pool refuses it here — which is exactly the fall-through the page was
    // written for, and the only way /login's success notice is ever reached.
    await reachConfirmStep(page, {
      ConfirmSignUp: ok({}),
      InitiateAuth: fault('NotAuthorizedException', 'Incorrect username or password.'),
    });
    await page.getByLabel('Confirmation code').fill('123456');
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toHaveText('Your email is confirmed. Please sign in.');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('the sign-up page offers the way back to signing in', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

// ═══ /forgot-password ══════════════════════════════════════════════════

test.describe('resetting a forgotten password', () => {
  // See REFUSAL above: the pool's own 400 is logged by the browser, not by
  // the app, so the harness guard is replaced with a stricter one.
  test.use({ allowConsole: true });
  test.afterEach(async ({ consoleErrors }) => refusalsOnly(consoleErrors));

  test('the page asks only for the email it will send a code to', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
    await expect(
      page.getByText('Enter the email you signed up with and we will send you a code.'),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
    await expect(page.getByLabel('Code')).toHaveCount(0);
  });

  test('an empty request asks for the email, and sends nothing', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/forgot-password');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('an email with no @ in it is refused before a code is sent', async ({ page }) => {
    const calls = await stubCognito(page, {});
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('shankarreddy');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('an email with no account says so on the field, not as a failure', async ({ page }) => {
    await stubCognito(page, {
      ForgotPassword: fault('UserNotFoundException', 'Username/client id combination not found.'),
    });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody@pattadar.local');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('We could not find an account with that email.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  test('while the code is being sent the button says so', async ({ page }) => {
    await stubCognito(page, { ForgotPassword: after(2_000, ok(CODE_SENT)) });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByRole('button', { name: 'Send code' }).click();
    const busy = page.getByRole('button', { name: 'Sending code…' });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();
  });

  /** Get to the second step, where the code and the new password are asked for. */
  async function reachResetStep(
    page: Page,
    answers: Record<string, CognitoAnswer>,
  ): Promise<CognitoCall[]> {
    const calls = await stubCognito(page, { ForgotPassword: ok(CODE_SENT), ...answers });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('shankar@pattadar.local');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();
    return calls;
  }

  test('once the code is sent the page says where, and asks for it beside a new password', async ({ page }) => {
    await reachResetStep(page, {});
    await expect(page.getByRole('alert')).toHaveText(
      'We have emailed a code to shankar@pattadar.local. Enter it below with your new password.',
    );
    await expect(
      page.getByText('Enter the code from your email and choose a new password.'),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toBeDisabled();
    await expect(page.getByLabel('Code')).toBeFocused();
    await expect(page.getByLabel('New password')).toBeVisible();
    await expect(
      page.getByText('At least 8 characters, with upper and lower case letters, a number and a symbol.'),
    ).toBeVisible();
  });

  test('an empty reset names both missing things, and changes nothing', async ({ page }) => {
    const calls = await reachResetStep(page, {});
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Enter the code from your email.')).toBeVisible();
    await expect(page.getByText('Choose a new password.', { exact: true })).toBeVisible();
    expect(calls.map((c) => c.target)).toEqual(['ForgotPassword']);
  });

  test('a new password under eight characters is refused before it is sent', async ({ page }) => {
    const calls = await reachResetStep(page, {});
    await page.getByLabel('Code').fill('123456');
    await page.getByLabel('New password').fill('Ab1!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
    expect(calls.map((c) => c.target)).toEqual(['ForgotPassword']);
  });

  test('a wrong code says so on the code field, keeping the password typed', async ({ page }) => {
    await reachResetStep(page, {
      ConfirmForgotPassword: fault('CodeMismatchException', 'Invalid verification code provided.'),
    });
    await page.getByLabel('Code').fill('000000');
    await page.getByLabel('New password').fill('Str0ng-enough!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(
      page.getByText('That code is not correct. Check the email we sent you and try again.'),
    ).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveValue('Str0ng-enough!');
  });

  test('a new password the pool refuses says what it wanted instead', async ({ page }) => {
    await reachResetStep(page, {
      ConfirmForgotPassword: fault(
        'InvalidPasswordException',
        'Password did not conform with policy: Password must have uppercase characters',
      ),
    });
    await page.getByLabel('Code').fill('123456');
    await page.getByLabel('New password').fill('str0ng-enough!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password must have uppercase characters')).toBeVisible();
  });

  test('a changed password ends at sign-in, saying the password is the new one', async ({ page }) => {
    const calls = await reachResetStep(page, { ConfirmForgotPassword: ok({}) });
    await page.getByLabel('Code').fill('123456');
    await page.getByLabel('New password').fill('Str0ng-enough!');
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toHaveText(
      'Your password has been changed. Sign in with the new password.',
    );
    expect(calls.map((c) => c.target)).toEqual(['ForgotPassword', 'ConfirmForgotPassword']);
    expect(calls[1].params).toMatchObject({
      Username: 'shankar@pattadar.local',
      ConfirmationCode: '123456',
    });
  });

  test('the reset page offers the way back for somebody who has remembered', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

// ═══ the frame the auth pages share ════════════════════════════════════

test.describe('the frame around the auth pages', () => {
  for (const path of ['/login', '/signup', '/forgot-password']) {
    test(`${path} carries the wordmark home`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('banner').getByRole('link', { name: 'Pattadar' }).click();
      await expect(page).toHaveURL(/localhost:\d+\/$/);
      await expect(page.getByRole('heading', { level: 1, name: /One piece of land/ })).toBeVisible();
    });
  }

  test('the auth pages keep the privacy notice and the terms within reach', async ({ page }) => {
    await page.goto('/login');
    const foot = page.getByRole('contentinfo');
    await expect(foot.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(foot.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    await foot.getByRole('link', { name: 'Terms' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
  });

  test('@phone the sign-in form fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ═══ /privacy and /terms ═══════════════════════════════════════════════

test.describe('the legal pages', () => {
  test('the privacy notice is readable without an account, and dated', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByText('12/09/2026')).toBeVisible();
    for (const section of [
      'What you put in Pattadar',
      'What the information is used for',
      'Document reading and service messages',
      'Storage and access',
      'Sharing with another person',
      'Your records and choices',
      'Retention and deletion',
      'Questions and requests',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
  });

  test('the privacy notice names the AI provider and says the reading may leave India', async ({ page }) => {
    await page.goto('/privacy');
    const disclosure = page.getByText('When you ask for an AI reading', { exact: false });
    await expect(disclosure).toContainText('currently Anthropic');
    await expect(disclosure).toContainText('This processing may occur outside India');
  });

  test('the privacy notice can be read in Telugu, and switched back', async ({ page }) => {
    await page.goto('/privacy');
    await page.getByRole('button', { name: 'తెలుగులో చదవండి' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'గోప్యతా ప్రకటన' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'What you put in Pattadar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Read in English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  });

  test('the terms are readable without an account, and say what Pattadar is not', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
    for (const section of [
      'About the service',
      'Your account and records',
      'Review before relying on a result',
      'Sharing and service work',
      'Prices and payments',
      'Leaving the service',
      'Support',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByText('It does not issue government records', { exact: false })).toBeVisible();
  });

  test('the terms can be read in Telugu, and switched back', async ({ page }) => {
    await page.goto('/terms');
    await page.getByRole('button', { name: 'తెలుగులో చదవండి' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'వినియోగ నిబంధనలు' })).toBeVisible();
    await page.getByRole('button', { name: 'Read in English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeVisible();
  });

  test('the terms point at the privacy notice they must be read with', async ({ page }) => {
    await page.goto('/terms');
    await page.getByRole('link', { name: 'Privacy notice' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  });

  for (const path of ['/privacy', '/terms']) {
    test(`${path} carries the wordmark home and a grievance address`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole('contentinfo').getByRole('link', { name: 'grievance@pattadar.com' }),
      ).toHaveAttribute('href', 'mailto:grievance@pattadar.com');
      await page.getByRole('banner').getByRole('link', { name: 'Pattadar' }).click();
      await expect(page).toHaveURL(/localhost:\d+\/$/);
    });
  }

  test("the privacy notice's own settings link bounces a signed-out reader to sign-in, remembering it", async ({ page }) => {
    await page.goto('/privacy');
    await page.getByRole('link', { name: 'Manage my data and choices' }).click();
    await expect(page).toHaveURL(/\/login$/);
    const aim = await page.evaluate(
      () => (window.history.state as { usr?: { returnTo?: string } } | null)?.usr?.returnTo ?? null,
    );
    expect(aim, 'the reader must land back on their settings after signing in').toBe('/app/account');
  });

  test('@phone the privacy notice reflows onto a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ═══ /verify/:token and /active/:token ═════════════════════════════════

test.describe('public family capability links', () => {
  const TOKEN = '6f1b0a2c-4d3e-4f50-9a11-2b7c8d9e0f12';

  async function watchMutation(
    page: Page,
    operation: 'verifyBeneficiary' | 'acknowledgeInactivity',
    answer: unknown,
  ): Promise<string[]> {
    const asked: string[] = [];
    await page.route(/\/graphql$/, (route) => {
      const body = route.request().postData() ?? '';
      if (!body.includes(operation)) return route.fallback();
      asked.push(body);
      return route.fulfill({ json: { data: { [operation]: answer } } });
    });
    return asked;
  }

  test('/verify opens publicly, verifies deliberately, and never prints the token', async ({ page }) => {
    const asked = await watchMutation(page, 'verifyBeneficiary', { id: 'member-a' });
    await page.goto(`/verify/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Verify membership' })).toBeVisible();
    await expect(page.getByText(TOKEN)).toHaveCount(0);
    await expect.poll(() => asked.length).toBe(0);

    await page.getByRole('button', { name: 'Verify membership' }).click();
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain(TOKEN);
    await expect(page.getByText('Your membership details are verified.')).toBeVisible();
  });

  test('/verify records optional safeguard-email consent explicitly', async ({ page }) => {
    const asked = await watchMutation(page, 'verifyBeneficiary', { id: 'member-a' });
    await page.goto(`/verify/${TOKEN}`);
    await page.getByRole('checkbox', { name: /receive household inactivity safeguard emails/i }).check();
    await page.getByRole('button', { name: 'Verify membership' }).click();
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain('"consent":true');
  });

  test('/verify reports a spent or invalid credential', async ({ page }) => {
    await watchMutation(page, 'verifyBeneficiary', null);
    await page.goto('/verify/not-a-real-token');
    await page.getByRole('button', { name: 'Verify membership' }).click();
    await expect(page.getByText(/invalid, expired, or has already been used/i)).toBeVisible();
  });

  test('/active requires a deliberate click before closing the sequence', async ({ page }) => {
    const asked = await watchMutation(page, 'acknowledgeInactivity', true);
    await page.goto(`/active/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Confirm this safeguard message' })).toBeVisible();
    await expect(page.getByText(TOKEN)).toHaveCount(0);
    await expect.poll(() => asked.length).toBe(0);

    await page.getByRole('button', { name: 'Confirm this message' }).click();
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain(TOKEN);
    await expect(page.getByText('Thank you. This reminder sequence is now closed.')).toBeVisible();
  });

  test('/active can close the sequence and withdraw future safeguard email', async ({ page }) => {
    const asked = await watchMutation(page, 'acknowledgeInactivity', true);
    await page.goto(`/active/${TOKEN}`);
    await page.getByRole('button', { name: 'Stop future safeguard email' }).click();
    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain('"withdraw":true');
    await expect(page.getByText(/future safeguard email to you is turned off/i)).toBeVisible();
  });

  test('/active reports an expired or already-used credential', async ({ page }) => {
    await watchMutation(page, 'acknowledgeInactivity', false);
    await page.goto('/active/not-a-real-token');
    await page.getByRole('button', { name: 'Confirm this message' }).click();
    await expect(page.getByText(/invalid, expired, or has already been used/i)).toBeVisible();
  });
});

// ═══ Pattadar Network · coming soon + register interest ═══════════════

test.describe('the Pattadar Network section', () => {
  const RECEIVED = 'Thanks. We will contact you when Pattadar Network opens near you.';
  const FAILED = "We couldn't save that. Please try again.";
  const ID_NUMBER = "Please don't enter Aadhaar or other ID numbers here.";

  /** Stub the one mutation the form sends; everything else falls through. */
  async function stubRegister(
    page: Page,
    answer: { status: string; field?: string } | { httpStatus: number },
  ): Promise<string[]> {
    const asked: string[] = [];
    await page.route(/\/graphql$/, (route) => {
      const body = route.request().postData() ?? '';
      if (!body.includes('RegisterNetworkInterest')) return route.fallback();
      asked.push(body);
      if ('httpStatus' in answer) return route.fulfill({ status: answer.httpStatus, json: { message: 'Unauthorized' } });
      return route.fulfill({ json: { data: { registerNetworkInterest: { field: '', ...answer } } } });
    });
    return asked;
  }

  async function fill(page: Page, { phone = '98480 12345', name = 'Ravi Kumar', consent = true } = {}) {
    const form = page.locator('#network form');
    await form.getByLabel('I am interested in').selectOption('sell');
    await form.getByLabel('Your name').fill(name);
    if (phone) await form.getByLabel('Mobile number').fill(phone);
    if (consent) await form.getByRole('checkbox', { name: /I agree that Pattadar may contact me/ }).check();
    return form;
  }

  test('shows eight coming-soon offerings and says none exist yet', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#network');
    await expect(section.getByRole('heading', { level: 2, name: 'A network around your land' })).toBeVisible();
    await expect(section.locator('li.card .badge')).toHaveCount(8);
    for (const badge of await section.locator('li.card .badge').all()) await expect(badge).toHaveText('Coming soon');
    await expect(section.getByText('No listings or professionals are on Pattadar today.', { exact: false })).toBeVisible();
    await expect(section.locator('li.card .card__h')).toHaveText([
      'Sell a property', 'Buy a property', 'Rent or lease', 'Lawyers and legal connect',
      'Licensed surveyors', 'Document writers', 'Land developers', 'Property valuers',
    ]);
    await expect(section.locator('li.card .card__h', { hasText: /^Legal connect$/ })).toHaveCount(0);
    const roadmap = page.locator('#services');
    await expect(roadmap).not.toContainText('Legal connect');
    await expect(roadmap).not.toContainText('Trusted document writers');
    await expect(roadmap).toContainText('AI Watch Dog');
    await expect(roadmap).toContainText('On-demand property visits');
  });

  test('a valid registration is sent once and thanked', async ({ page }) => {
    const asked = await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = await fill(page);
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(page.locator('#network').getByRole('status')).toHaveText(RECEIVED);
    expect(asked).toHaveLength(1);
    const sent = JSON.parse(asked[0]).variables.input;
    expect(sent).toMatchObject({ interest: 'sell', name: 'Ravi Kumar', consent: true, consentVersion: '2026-10-03', website: '' });
  });

  test('without consent nothing is sent and the box says why', async ({ page }) => {
    const asked = await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = await fill(page, { consent: false });
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText('Tick the box to agree before you register.');
    await expect(form.getByRole('checkbox', { name: /I agree/ })).toBeFocused();
    expect(asked).toHaveLength(0);
  });

  test('an invalid or non-ASCII phone is refused before sending', async ({ page }) => {
    const asked = await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = await fill(page, { phone: '+91 5123456789' });
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a 10-digit Indian mobile number.');
    await form.getByLabel('Mobile number').fill('９８４８０１２３４５');
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a 10-digit Indian mobile number.');
    expect(asked).toHaveLength(0);
  });

  test('neither phone nor email marks both', async ({ page }) => {
    await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = await fill(page, { phone: '' });
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByText('Give a mobile number or an email.')).toHaveCount(3); // phone, email, summary
  });

  test('an Aadhaar-like number in the name is refused on that field', async ({ page }) => {
    const asked = await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = await fill(page, { name: 'Ravi 1234 5678 9012' });
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText(ID_NUMBER);
    await expect(form.getByLabel('Your name')).toBeFocused();
    expect(asked).toHaveLength(0);
  });

  test('a server-side field error lands on that field', async ({ page }) => {
    await stubRegister(page, { status: 'invalid', field: 'phone' });
    await page.goto('/');
    const form = await fill(page);
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a 10-digit Indian mobile number.');
  });

  test('a server-only ID-number refusal shows the ID-number sentence', async ({ page }) => {
    // Telugu digits pass the ASCII-only client mirror; the server refuses them.
    await stubRegister(page, { status: 'invalid', field: 'name' });
    await page.goto('/');
    const form = await fill(page, { name: 'Ravi ౧౨౩౪ ౫౬౭౮ ౯౦౧౨' });
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByRole('alert')).toHaveText(ID_NUMBER);
    await expect(form.getByLabel('Your name')).toBeFocused();
  });

  test('the hourly ceiling asks to try later', async ({ page }) => {
    await stubRegister(page, { status: 'rate_limited' });
    await page.goto('/');
    const form = await fill(page);
    await form.getByRole('button', { name: 'Register interest' }).click();
    await expect(form.getByText('Too many requests right now. Please try again later.')).toBeVisible();
  });

  test.describe('a stale session', () => {
    // The stubbed 401 is logged by Chromium itself; nothing else may be.
    test.use({ allowConsole: true });
    test.afterEach(async ({ consoleErrors }) => refusalsOnly(consoleErrors));

    test('a 401 keeps the values, stays on the page and says it could not save', async ({ page }) => {
      await stubRegister(page, { httpStatus: 401 });
      await page.goto('/');
      const form = await fill(page);
      await form.getByRole('button', { name: 'Register interest' }).click();
      await expect(form.getByText(FAILED)).toBeVisible();
      await expect(page.getByText('Your session has ended')).toHaveCount(0);
      await expect(page).toHaveURL(/\/$/);
      await expect(form.getByLabel('Your name')).toHaveValue('Ravi Kumar');
    });
  });

  test('the form completes from the keyboard and the honeypot is never in the Tab order', async ({ page }) => {
    const asked = await stubRegister(page, { status: 'received' });
    await page.goto('/');
    const form = page.locator('#network form');
    await expect(form.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    await form.getByLabel('I am interested in').focus();
    // Type-ahead picks "Sell a property"; ArrowDown on macOS opens the picker
    // instead of changing the value.
    await page.keyboard.type('Sell');
    await expect(form.getByLabel('I am interested in')).toHaveValue('sell');
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Your name')).toBeFocused();
    await page.keyboard.type('Ravi Kumar');
    await page.keyboard.press('Tab');
    await page.keyboard.type('9848012345');
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Tab'); // email, district, mandal, note, consent
    await expect(form.getByRole('checkbox', { name: /I agree/ })).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab'); // the privacy-notice link inside the label
    await page.keyboard.press('Tab');
    await expect(form.getByRole('button', { name: 'Register interest' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#network').getByRole('status')).toHaveText(RECEIVED);
    expect(asked).toHaveLength(1);
  });

  test('@phone the network section and its form reflow onto a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#network form').scrollIntoViewIfNeeded();
    await expect(page.locator('#network li.card .badge')).toHaveCount(8);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the privacy notice describes Network interest in English and Telugu', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 2, name: 'Pattadar Network interest' })).toBeVisible();
    await page.getByRole('button', { name: 'తెలుగులో చదవండి' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'పట్టాదార్ నెట్‌వర్క్ ఆసక్తి' })).toBeVisible();
  });
});

// ═══ a URL that is nobody's ════════════════════════════════════════════

test.describe('an address that matches nothing', () => {
  test('names the address that failed and offers the front page', async ({ page }) => {
    await page.goto('/not-a-real-page');
    await expect(page.getByRole('heading', { name: 'There is no page at that address' })).toBeVisible();
    await expect(page.getByText('/not-a-real-page')).toBeVisible();
    await page.getByRole('link', { name: 'Go to the front page' }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test('is kept out of search results, because the server answers 200 for it', async ({ page }) => {
    await page.goto('/not-a-real-page');
    await expect(page.getByRole('heading', { name: 'There is no page at that address' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});

// ═══ the doors, to somebody who is already inside ══════════════════════

test.describe('somebody who is already signed in', () => {
  test.use({ signedIn: true });

  test('typing pattadar.com goes straight to their own records, not the pitch again', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/app$/);
    // The rail is behind React.lazy and the app chunk is the biggest one Vite
    // has to build; on a laptop that is also running the founder's stack this
    // is the first request that pays for it, and ten seconds is not always
    // enough. The wait is generous on purpose — what is being asserted is
    // that the landing page handed over to the app, not how fast dev-mode
    // esbuild is (routes.tsx:134 shows the spinner in the meantime).
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible({ timeout: 45_000 });
  });

  test('/login does not ask them to sign in twice', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toHaveCount(0);
  });

  test('/forgot-password does not offer to reset a password they are signed in with', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('/signup sends them to their account settings, welcomed rather than signed up again', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/app\/account\?welcome=1$/);
    // Generous for the same reason as the rail above: first build of the app chunk.
    await expect(page.getByRole('heading', { level: 1, name: 'Your account and data' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Welcome to Pattadar', { exact: false })).toBeVisible();
  });

  test('/auth/callback with nothing in it still ends somewhere real', async ({ page }) => {
    // A second tab finishing a redirect that the first one already consumed.
    await page.goto('/auth/callback');
    await expect(page.getByRole('heading', { name: 'Sign-in could not be completed' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});
