/**
 * Every service the order flow explains points at a University guide that
 * exists — `bun run scripts/service-guides-tests.ts`.
 *
 * The catalogue's `guides` (services/api/src/catalogue.py) name slugs in
 * apps/university/src/data/recordGuides.json. A slug renamed on the University
 * side would otherwise just drop the link from the order screen without a word.
 */
import { readFileSync } from 'node:fs';
import { missingGuides, passbookGuideHref } from '../apps/web/src/w360/serviceGuides';
import guides from '../apps/university/src/data/recordGuides.json';

// The guide slugs live on the catalogue (services/api/src/catalogue.py); this
// reads its snapshot, which services/api/tests/test_catalogue.py holds equal.
const { offers } = JSON.parse(readFileSync(new URL('../tests/e2e-app/fixtures/catalogue.json', import.meta.url), 'utf8'));
const missing = missingGuides(offers);
// The ⓘ beside a passbook (Documents, the add drawer) links a fixed guide per state.
for (const code of ['AP', 'TS'] as const) {
  const slug = passbookGuideHref(code).split('/records/')[1];
  if (!guides.some((g) => g.stateCode === code && g.slug === slug)) missing.push(`passbook ⓘ → ${code}/${slug}`);
}
if (missing.length > 0) {
  console.error(`FAIL: University guides not found: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('service guides: every mapped slug resolves');
