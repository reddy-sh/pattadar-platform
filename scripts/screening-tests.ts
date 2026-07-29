/** Photo screening tests — `bun run scripts/screening-tests.ts`. */
import { looksLikeScreenshot, screenPhoto } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

// A real iPhone capture: camera identity present.
const CAMERA = { Make: 'Apple', Model: 'iPhone 15 Pro', LensModel: 'iPhone 15 Pro back camera', FNumber: 1.78 };
check('a camera photo is not a screenshot', !looksLikeScreenshot(CAMERA));
check('a camera photo passes screening', screenPhoto(CAMERA).verdict === 'ok');

// A screenshot: metadata exists, but nothing optical produced it.
const SHOT = { PixelWidth: 1320, PixelHeight: 2868, Orientation: 1, DateTimeOriginal: '2026:07:27 10:40:00' };
check('a screenshot is detected', looksLikeScreenshot(SHOT));
const s = screenPhoto(SHOT);
check('a screenshot warns rather than hard-blocks', s.verdict === 'warn', s.verdict);
check('a screenshot offers Documents instead', s.offerAsDocument);
check('the message says what to do', /Documents/.test(s.body), s.body);

// Nested iOS dictionaries still count as camera evidence.
check('nested TIFF make/model counts', !looksLikeScreenshot({ '{TIFF}': { Make: 'Apple', Model: 'iPhone 12' } }));
check('nested Exif optics count', !looksLikeScreenshot({ '{Exif}': { FNumber: 2.2, ExposureTime: 0.008 } }));

// No metadata at all is NOT evidence of anything — never punish it.
check('absent EXIF passes', screenPhoto(undefined).verdict === 'ok');
check('empty EXIF passes', screenPhoto({}).verdict === 'ok');
check('absent EXIF is not called a screenshot', !looksLikeScreenshot(undefined));


// ── classifier verdicts (CL-600..603) ───────────────────────────────────────
import { screenClassification, suggestedCategory } from '../packages/core/src/index';
const cls = (kind: string, confidence = 'high', category = 'general', reason = '') =>
  ({ kind, confidence, category, reason }) as never;

let f2 = 0;
const c2 = (name: string, ok: boolean, detail = '') => {
  if (!ok) { f2 += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

// Hard blocks: privacy failures, no override.
c2('an ID document is blocked', screenClassification(cls('id_document')).verdict === 'block');
c2('an ID block offers Documents', screenClassification(cls('id_document')).offerAsDocument);
c2('an ID block explains the protections lost', /encrypted/.test(screenClassification(cls('id_document')).body));
c2('a person photo is blocked', screenClassification(cls('person')).verdict === 'block');

// Everything else stays overridable — this is the half that keeps the feature usable.
c2('a document only warns', screenClassification(cls('document')).verdict === 'warn');
c2('a screenshot only warns', screenClassification(cls('screenshot')).verdict === 'warn');
c2('an unrelated photo only warns', screenClassification(cls('other')).verdict === 'warn');
c2('an unrecognised answer only warns', screenClassification(cls('')).verdict === 'warn');

// A bare fallow field is land. This is the case the founder warned about.
c2('confident land passes', screenClassification(cls('land', 'high', 'overview')).verdict === 'ok');
c2('low-confidence land warns but never blocks', screenClassification(cls('land', 'low')).verdict === 'warn');
c2('no classification at all passes', screenClassification(null).verdict === 'ok');

// CL-603: the suggested category pre-selects, with a sane fallback.
c2('a land category is suggested', suggestedCategory(cls('land', 'high', 'water')) === 'water');
c2('general falls back', suggestedCategory(cls('land', 'high', 'general')) === 'boundary');
c2('a non-land answer suggests nothing', suggestedCategory(cls('document', 'high', 'water')) === 'boundary');

const total = failures + f2;
console.log(total === 0 ? 'SCREENING + CLASSIFIER TESTS PASS' : `SCREENING TESTS FAILED (${total})`);
process.exit(total === 0 ? 0 : 1);
