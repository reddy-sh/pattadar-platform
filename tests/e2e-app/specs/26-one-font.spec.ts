/**
 * One face, every surface — what the browser actually computes.
 *
 * design.md § Typography (founder decision, 27/09/2026): every word apps/web
 * renders is Atkinson Hyperlegible. scripts/typography-tests.ts proves the
 * SOURCE declares one face. It cannot see what the browser draws: the
 * user-agent stylesheet gives <textarea>, <code>, <kbd> and <pre> a monospace
 * face and form controls a system face, and Leaflet's own stylesheet sets
 * Helvetica on the map and Lucida Console on its zoom buttons. So this walks
 * every visible text-bearing element — and every ::before/::after that draws
 * content — on the signed-in, previous-app and public routes, in both
 * projects, and reads the family the browser settled on.
 *
 * The screenshot that started this: the Area calculator's result card drew
 * "1 ACRES =" and "1 Acre" in JetBrains Mono inside a sans card, and the title
 * disagreed with the value about whether one acre is plural. Both are pinned
 * below, and on Chromium the glyphs are traced to the font that drew them.
 *
 * ALLOWED CONSOLE ERRORS AND ESCAPES. This spec asks one question — which face
 * — of ~50 routes. The sealed world refuses several root-schema reads with a
 * 400 (see 19-sections-legacy.spec.ts), and Chromium logs each refusal; the
 * specs that own those screens hold the console and escape guards. A refused
 * read still leaves text on the screen, and that text is audited here like any
 * other; a screen that drew nothing fails the `checked` floor instead.
 */
import { test, expect, type Page } from '../fixtures/harness';
import { APP_ROUTES, HANGERS, ID, PAPER, PUBLIC_ROUTES, TICKET } from '../fixtures/ids';

const FACE = 'Atkinson Hyperlegible';

test.use({ allowConsole: true, allowEscapes: true });

interface Audit {
  /** Every family registered with document.fonts (every @font-face). */
  faces: string[];
  /** Text drawn in another face, one line per distinct element + family. */
  off: string[];
  /** How many text-bearing boxes were read. */
  checked: number;
}

async function audit(page: Page): Promise<Audit> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.evaluate((face) => {
    const unquote = (f: string) => f.trim().replace(/^["']|["']$/g, '');
    const lead = (family: string) => unquote(family.split(',')[0] ?? '');
    const faces = [...new Set([...document.fonts].map((f) => unquote(f.family)))].sort();
    const FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'OPTGROUP']);
    const off: string[] = [];
    const seen = new Set<string>();
    let checked = 0;
    const note = (el: Element, family: string, pseudo = '') => {
      const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      const text = (el.textContent || (el as HTMLInputElement).value || (el as HTMLInputElement).placeholder || '')
        .trim().replace(/\s+/g, ' ').slice(0, 28);
      const line = `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>${pseudo} "${text}" → ${family}`;
      if (!seen.has(line)) { seen.add(line); off.push(line); }
    };
    for (const el of document.querySelectorAll('body *')) {
      if (SKIP.has(el.tagName)) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
      if (ownText || FIELDS.has(el.tagName)) {
        checked += 1;
        if (lead(style.fontFamily) !== face) note(el, style.fontFamily);
      }
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(el, pseudo);
        if (!p.content || p.content === 'none' || p.content === 'normal' || p.content === '""' || p.content === "''") continue;
        checked += 1;
        if (lead(p.fontFamily) !== face) note(el, p.fontFamily, pseudo);
      }
      if (off.length >= 15) break;
    }
    return { faces, off, checked };
  }, FACE);
}

async function expectOneFace(page: Page, where: string) {
  const a = await audit(page);
  expect(a.checked, `${where}: nothing was read — the walk ran before the screen drew`).toBeGreaterThan(5);
  // One assertion, so a failure shows both halves: which faces the page
  // registered, and which elements drew in something else.
  expect(
    { faces: a.faces, off: a.off },
    `${where}: only ${FACE} may be registered, and every text box must draw in it`,
  ).toEqual({ faces: [FACE], off: [] });
}

/** Same arrival test as 24-responsive.spec.ts: the shell, no route fallback,
 *  nothing busy, a heading, and the real face loaded. */
async function settledW360(page: Page) {
  await expect(page.locator('.w360')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('progressbar', { name: 'Loading' })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
}

const W360_ROUTES = [
  ...APP_ROUTES,
  '/app/holdings',
  '/app/desk',
  '/app/tools?tab=stamp-duty',
  '/app/tools?tab=market-value',
  '/app/tools?tab=calculator',
  `/app/papers/${PAPER.deed}`,
  `/app/services/${TICKET.placed}`,
  ...HANGERS.map((h) => (h ? `/app/records/${ID.parcel}/${h}` : `/app/records/${ID.parcel}`)),
  `/app/records/${ID.flat}/money`,
];

test.describe('signed in', () => {
  for (const route of W360_ROUTES) {
    test(`@phone ${route} draws every word in ${FACE}`, async ({ page }) => {
      await page.goto(route);
      await settledW360(page);
      await expectOneFace(page, route);
    });
  }

  test(`@phone the Area calculator result reads in ${FACE}, and agrees with itself`, async ({ page }, info) => {
    await page.goto('/app/tools?tab=calculator');
    const card = page.locator('section.card[aria-label$="="]');
    await expect(card).toBeVisible();
    // The title echoed the picker's plural label ("1 Acres =") over a value
    // that said "1 Acre". One acre is one acre on both lines.
    await expect(card.locator('.eyebrow')).toHaveText('1 Acre =');
    await expect(card.locator('p.num')).toHaveText('1 Acre');

    const read = await card.evaluate((el) =>
      [...el.querySelectorAll('.eyebrow, p.num, td')].map((n) => ({
        family: getComputedStyle(n).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''),
        numeric: getComputedStyle(n).fontVariantNumeric,
        figure: n.classList.contains('num'),
      })),
    );
    expect(new Set(read.map((r) => r.family))).toEqual(new Set([FACE]));
    // The figures still line up — through the face's tabular figures now,
    // not a monospace face.
    expect(read.filter((r) => r.figure).every((r) => r.numeric.includes('tabular-nums'))).toBe(true);

    // Chromium can say which font file actually drew the glyphs, not only
    // which family was asked for. WebKit has no equivalent here.
    if (info.project.name === 'app') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      for (const selector of ['section.card[aria-label$="="] .eyebrow', 'section.card[aria-label$="="] p.num']) {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
        expect(fonts.map((f) => f.familyName), `${selector} was drawn by`).toEqual([FACE]);
      }
    }
  });
});

test.describe('the previous app', () => {
  test.beforeEach(() => { test.slow(); });
  for (const route of ['/legacy', '/legacy/groups', '/legacy/parcels', '/legacy/documents', '/legacy/wallet', '/legacy/audit']) {
    test(`@phone ${route} draws every word in ${FACE}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 25_000 });
      await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 25_000 });
      await expectOneFace(page, route);
    });
  }
});

test.describe('signed out', () => {
  test.use({ signedIn: false });

  for (const route of PUBLIC_ROUTES) {
    test(`@phone ${route} draws every word in ${FACE}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectOneFace(page, route);
    });
  }

  test(`@phone a training certificate draws every word in ${FACE}`, async ({ page, world }) => {
    world.set('root.trainingCertificate', {
      id: 'w-cert-1', certificateNo: 'PU-2026-000123', associateId: 'w-assoc-1',
      recipientName: 'Test Associate', courseCode: 'PU-101', courseTitle: 'Land records basics',
      courseVersion: '1.0', trainerName: 'Test Trainer', trainerRef: 'T-1', completedOn: '2026-09-01',
      issuedOn: '2026-09-02', validUntil: '2028-09-02', hours: 12, skills: ['Passbooks', 'FMB sketches'],
      evidenceRef: 'E-1', note: '', status: 'issued', verificationState: 'valid',
      verificationCode: 'ABCD-1234', intact: true, revokedAt: '', revokeReason: '', issuedBy: 'Pattadar University',
    });
    await page.goto('/certificate/ABCD-1234');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectOneFace(page, '/certificate/:code');
  });
});
