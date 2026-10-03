/**
 * Pattadar Network — the landing section promises nothing that does not exist,
 * and the register-interest consent and public-root allowlists stay in step
 * across web, gateway and API. `bun run scripts/network-interest-tests.ts`.
 *
 * Discovered automatically by the `scripts/*-tests.ts` loop in
 * .github/workflows/ci.yml.
 *
 * Why each group exists (docs/specs/TODO-pattadar-network.md):
 *
 *  A. Nothing in the network is onboarded. Every card is "Coming soon", the
 *     section says so in words, and no copy claims a listing or a verified
 *     professional exists today.
 *  B. The section's copy lives in landingContent.ts, and the two roadmap items
 *     it absorbed (legal professionals, document writers) are not announced
 *     twice.
 *  C. A stored consent is only meaningful if the text the visitor saw is the
 *     text the server versioned: the web copy's SHA-256 must equal
 *     CONSENT_TEXT_SHA256 and its version CONSENT_VERSION in network.py.
 *  D. registerNetworkInterest is credential-less, so both the gateway
 *     allowlist and the API's RequireAuthenticatedRoot must name it — one
 *     without the other either breaks the form or widens a layer silently.
 *  E. The TODO spec keeps every heading the design requires.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NETWORK, NETWORK_INTEREST, ROADMAP } from '../apps/web/src/pages/landing/landingContent';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── A · nothing is claimed as available ──────────────────────────────
check('A1 the section has exactly eight offerings', NETWORK.items.length === 8, `found ${NETWORK.items.length}`);
check('A2 every offering is badged "Coming soon"', NETWORK.chip === 'Coming soon', NETWORK.chip);
check(
  'A3 the section says nothing is on Pattadar today',
  NETWORK.note.includes('No listings or professionals are on Pattadar today.'),
);
const copy = JSON.stringify([NETWORK, NETWORK_INTEREST]).toLowerCase();
for (const banned of ['available now', 'verified professionals', 'browse listings', 'book now']) {
  check(`A4 the network copy never says "${banned}"`, !copy.includes(banned));
}

// ── B · copy in one place, said once ─────────────────────────────────
const page = read('apps/web/src/pages/landing/LandingPage.tsx');
check('B1 LandingPage renders #network', page.includes('id="network"'));
check('B2 the heading comes from NETWORK', page.includes('{NETWORK.h2}'));
check('B3 LandingPage has no literal section copy', !page.includes(NETWORK.h2) && !page.includes(NETWORK.note));
const roadmap = JSON.stringify(ROADMAP);
check('B4 ROADMAP no longer lists Legal connect', !roadmap.includes('Legal connect'));
check('B5 ROADMAP no longer lists Trusted document writers', !roadmap.includes('Trusted document writers'));
const form = read('apps/web/src/pages/landing/NetworkInterestForm.tsx');
check('B6 the form takes its copy from NETWORK_INTEREST', form.includes('NETWORK_INTEREST'));
check('B7 the form has no literal consent text', !form.includes(NETWORK_INTEREST.consent));

// ── C · consent text and version match the server ────────────────────
const networkPy = read('services/api/src/network.py');
const version = /^CONSENT_VERSION = "([^"]+)"$/m.exec(networkPy)?.[1];
const hash = /^CONSENT_TEXT_SHA256 = "([0-9a-f]{64})"$/m.exec(networkPy)?.[1];
check('C1 consentVersion equals network.CONSENT_VERSION', NETWORK_INTEREST.consentVersion === version,
  `web ${NETWORK_INTEREST.consentVersion}, api ${version}`);
const digest = new Bun.CryptoHasher('sha256').update(NETWORK_INTEREST.consent).digest('hex');
check('C2 SHA-256 of the consent text equals CONSENT_TEXT_SHA256', digest === hash,
  'changing the wording means bumping CONSENT_VERSION and CONSENT_TEXT_SHA256 together');
check(
  'C3 the consent text contains its link text exactly once',
  NETWORK_INTEREST.consent.split(NETWORK_INTEREST.consentLinkText).length === 2,
);

// ── D · both allowlists name the credential-less root ────────────────
const gateway = read('services/gateway/src/public_graphql.py');
check('D1 the gateway public allowlist names registerNetworkInterest',
  /\{[^}]*"registerNetworkInterest"[^}]*\}/.test(gateway));
const main = read('services/api/src/main.py');
check('D2 RequireAuthenticatedRoot.public_mutations names registerNetworkInterest',
  /public_mutations = \{[^}]*"registerNetworkInterest"[^}]*\}/.test(main));

// ── E · the TODO spec keeps its headings ─────────────────────────────
const spec = read('docs/specs/TODO-pattadar-network.md');
for (const heading of [
  'Vision',
  'Offerings',
  'Built now: interest capture',
  'Future: "Sell / List this property" from My portfolio',
  'Open decisions for Reddy',
  'Security/privacy invariants carried forward',
  'Phasing',
  'Docs to update when each phase lands',
  'Decisions recorded 03/10/2026',
]) {
  check(`E1 the TODO spec has "${heading}"`, new RegExp(`^## \\d*\\.? ?${heading.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'm').test(spec));
}

console.log(failures === 0 ? 'NETWORK INTEREST TESTS PASS' : `NETWORK INTEREST TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
