/**
 * UX guards — run with `bun run scripts/ux-guards.ts`.
 *
 * These assert CLASSES of defect, not single instances. The Portal-in-modal
 * guard once passed while four dialogs were dead because it only checked for
 * `<Menu`; every guard here is written to fail for the next occurrence too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  actionLabel,
  collapseAuditBursts,
  dayHeading,
  eventEntity,
  isDestructiveAction,
} from '../packages/core/src/index';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/**
 * Guards read intent, not commentary — a comment must never satisfy one.
 *
 * This was a pair of regexes, and the block-comment one could not tell a
 * comment from a string: `type: ['application/pdf', 'image/*']` opened a
 * "comment" at the `/*` inside the MIME pattern that ran to the next `*''/`
 * eighty-eight lines later. Everything in between vanished before the guards
 * saw it, so assertions about that code passed by inspecting nothing —
 * silently, which is the worst way for a test to fail.
 *
 * So this is a scanner rather than a regex: it walks the source tracking
 * whether it is inside a string, template or comment, and only strips what is
 * genuinely a comment. Strings survive intact, because guards legitimately
 * assert on user-facing copy.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
const code = (p: string) => stripComments(read(p));

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── CL-546: an audit row never says the same thing twice ────────────────────
// The exact rows from the screenshot, verbatim from the database.
check(
  'CL-546 delete_registered_document does not restate its label',
  eventEntity('delete_registered_document', 'x', 'Deleted registered document') === '',
);
check('CL-546 delete_property does not restate its label', eventEntity('delete_property', 'x', 'Deleted property') === '');
check('CL-546 update_profile does not restate its label', eventEntity('update_profile', 'x', 'profile updated') === '');
// ...while anything that names the object survives. This is the half that
// matters: a suppression rule that eats real information is worse than none.
check(
  'CL-547 a named object survives',
  eventEntity('add_member', 'x', 'Member: Sankara Reddy Telukutla') === 'Member: Sankara Reddy Telukutla',
);
check(
  'CL-547 a khata number survives',
  eventEntity('create_passbook', 'x', 'Created passbook PB-ATP-2024-001') === 'Created passbook PB-ATP-2024-001',
);
check('CL-547 a UUID is never shown', eventEntity('delete_group', '75fc1d4d-1c31-40e2-9b0a-e42378b312b6', '') === '');

// ── CL-547: the backend records WHAT it deleted, read before the delete ─────
const api = code('services/api/src/main.py');
for (const [mutation, table] of [
  ['delete_passbook', 'passbooks'],
  ['delete_parcel', 'parcels'],
  ['delete_group', 'groups'],
  ['remove_member', 'family_members'],
  ['delete_property', 'properties'],
  ['delete_registered_document', 'registered_documents'],
] as const) {
  const body = api.split(`async def ${mutation}(`)[1]?.split('@strawberry.mutation')[0] ?? '';
  check(
    `CL-547 ${mutation} logs a name, not just an id`,
    /_named\(/.test(body),
    'audit detail is empty or hard-coded — the object cannot be named after it is gone',
  );
  check(
    `CL-547 ${mutation} reads the name BEFORE deleting from ${table}`,
    body.indexOf('SELECT') < body.indexOf(`DELETE FROM ${table}`),
    'the SELECT must precede the DELETE or there is nothing left to read',
  );
}

// ── CL-548/551: collapsing and severity are shared, not per-screen ──────────
const burst = collapseAuditBursts([
  { id: 'a', actor: 'u', action: 'delete_registered_document', target: '1', timestamp: '2026-07-27T14:29:10Z' },
  { id: 'b', actor: 'u', action: 'delete_registered_document', target: '2', timestamp: '2026-07-27T14:29:05Z' },
  { id: 'c', actor: 'u', action: 'delete_registered_document', target: '3', timestamp: '2026-07-27T14:29:00Z' },
] as never[]);
check('CL-548 three identical deletes collapse to one row', burst.length === 1 && burst[0].count === 3);
check('CL-551 deletes are destructive', isDestructiveAction('delete_group') && isDestructiveAction('remove_member'));
check('CL-551 additions are not', !isDestructiveAction('create_group') && !isDestructiveAction('add_member'));

// ── CL-549: day headings compare calendar days, not elapsed hours ───────────
const midnight = new Date(2026, 6, 27, 0, 10);
check('CL-549 late-evening yesterday is not "Today"', dayHeading(new Date(2026, 6, 26, 23, 50).toISOString(), midnight) === 'Yesterday');
check('CL-549 same day is "Today"', dayHeading(new Date(2026, 6, 27, 8, 0).toISOString(), midnight) === 'Today');

const activity = code('apps/mobile/src/app/activity.tsx');
check('CL-548 the full log collapses like Home', /collapseAuditBursts/.test(activity));
check('CL-549 the full log groups by day', /dayHeading/.test(activity));
check('CL-549 the full log leads with relative time', /relativeTime/.test(activity));
check('CL-550 the full log shows a display name, not a login handle', /displayName/.test(activity));
check('CL-551 the full log colours destructive rows', /isDestructiveAction/.test(activity));
check('CL-552 the full log can be filtered and searched', /Searchbar/.test(activity) && /setFilter/.test(activity));
check('CL-546 the full log uses the shared redundancy rule', /eventEntity/.test(activity) && !/humanEntity/.test(activity));
check(
  'CL-546 Home and the full log use the SAME rule',
  /eventEntity/.test(code('apps/mobile/src/app/(tabs)/index.tsx')),
  'Home had its own ad-hoc comparison; one rule or they drift apart again',
);

// ── CL-537/541: every empty state is the shared component ──────────────────
const SCREENS = [
  'apps/mobile/src/app/(tabs)/passbooks.tsx',
  'apps/mobile/src/app/(tabs)/holdings.tsx',
  'apps/mobile/src/app/(tabs)/family.tsx',
  'apps/mobile/src/app/documents.tsx',
];
for (const f of SCREENS) {
  check(`CL-537 ${f} renders the shared EmptyState`, /<EmptyState/.test(code(f)));
}

// ── CL-538/539: chrome and the FAB are gone at zero ────────────────────────
for (const f of SCREENS.slice(0, 3)) {
  const src = code(f);
  check(`CL-538 ${f} computes an empty-collection flag`, /const noData = /.test(src));
}

// Each screen's chrome is different, so name the actual control per screen
// rather than trusting one regex to describe all three.
check(
  'CL-538 Passbooks hides village filters and sort at zero',
  /\{!noData && \(/.test(code('apps/mobile/src/app/(tabs)/passbooks.tsx')),
);
check(
  'CL-538/616 Properties hides grouping, sort and map when the SEGMENT is empty',
  /\{!segmentEmpty && \(/.test(code('apps/mobile/src/app/(tabs)/holdings.tsx')),
  'keyed on the account being empty, "Plots (0)" still rendered a full control bar',
);
check(
  'CL-538 Groups offers no search until there is something to search',
  /onSearch=\{allGroups\.length >= \d+ \?/.test(code('apps/mobile/src/app/(tabs)/family.tsx')),
);

// ── CL-540: one empty message per screen ──────────────────────────────────
check(
  'CL-540 Properties no longer stacks two empty messages',
  !/Nothing to show/.test(code('apps/mobile/src/app/(tabs)/holdings.tsx')),
);

// ── CL-557: one word for documents, everywhere the user can read it ───────
for (const f of [...SCREENS, 'apps/mobile/src/app/activity.tsx']) {
  const strings = code(f).match(/>[^<>{}]*registered document[^<>{}]*</gi) ?? [];
  check(`CL-557 ${f} does not say "registered document" to the user`, strings.length === 0, strings.join(' | '));
}
check(
  'CL-557 the audit log labels both document actions the same way',
  actionLabel('delete_registered_document') === actionLabel('delete_document'),
);

// ── Emoji are ALLOWED in user-facing copy ────────────────────────────────
// This guard used to forbid them (CL-535/558, flagged eight times). The
// founder has since asked for them back — "keep the emojis as much as
// possible" — so the rule is reversed, not merely deleted, and the greeting
// must carry the namaste symbol.
check(
  'the greeting carries the namaste symbol',
  /🙏 Namaste/.test(code('apps/mobile/src/app/(tabs)/index.tsx')),
);

// ── CL-565: a GPS reading is a claim, not the parcel's location ───────────
const holding = code('apps/mobile/src/app/holding/[id].tsx');
check(
  'CL-565 the saved pin is checked against the village',
  /const savedSanity = checkLocation\(geo, approx/.test(holding),
);
check(
  'CL-565 the village is geocoded even when a pin exists',
  !/if \(geo \|\| !localityQuery/.test(holding),
  'skipping the geocode when a pin is saved leaves nothing to check it against',
);
check(
  'CL-565 a far pin cannot be written without confirmation',
  /if \(!force && checkLocation\(p, approx, placeName\)\.suspect\)/.test(holding),
  'saveGeo must gate on the check, not merely display a warning',
);
// CL-565: a warning that only states the problem leaves the person stuck. Both
// places that can show a suspect pin must also offer the way back to the
// village — the detail screen for a pin already saved, and the picker for one
// being placed. The picker's correction is the warning box itself, which is
// tappable; the assertion follows the behaviour, not the old wording.
const picker = code('apps/mobile/src/app/set-location.tsx');
check(
  'CL-565 the warning offers the correction (saved pin)',
  /Move to \{placeName/.test(holding),
);
check(
  'CL-565 the warning offers the correction (pin being placed)',
  /sanity\.suspect/.test(picker) && /onPress=\{\(\) => approx && goTo\(approx/.test(picker),
  'the suspect-pin warning in the picker must be a control, not just text',
);
check('CL-571 clearing a location asks first', /confirmClearGeo/.test(holding));
check(
  'CL-571 Clear is no longer a bare red button under the map',
  !/textColor=\{theme\.colors\.error\}[\s\S]{0,120}onPress=\{clearGeo\}/.test(holding),
);
check('CL-572 coordinates are copyable', /Copy coordinates \$\{geo\.latitude/.test(holding));

// ── CL-561..564: photos are evidence, so the metadata is not optional ─────
const photoApi = api.split('async def add_parcel_photo(')[1]?.split('@strawberry.mutation')[0] ?? '';
check(
  'CL-563 a photo records where, which way and when',
  ['latitude', 'longitude', 'heading', 'captured_at', 'captured_by'].every((c) => photoApi.includes(c)),
);
check(
  'CL-561 a photo can only be attached to a parcel the caller owns',
  /SELECT 1 FROM parcels WHERE id=%s AND passbook_id IN/.test(photoApi),
);
check(
  'CL-563 coordinates are nullable, never defaulted to zero',
  /latitude DOUBLE PRECISION,\n\s*longitude DOUBLE PRECISION/.test(api),
  '0,0 is a real place in the Gulf of Guinea — a missing fix must read as missing',
);
check(
  'CL-568 one cover per parcel is enforced by the database',
  /CREATE UNIQUE INDEX IF NOT EXISTS parcel_photos_one_cover_idx/.test(api),
);
check(
  'a cover is never assigned automatically',
  !/not first/.test(photoApi) && /uid, False, now/.test(photoApi),
  'first-photo-wins put scanned documents and an Aadhaar card on the Properties rows',
);
check(
  'deleting the cover does not promote an unchosen replacement',
  !/UPDATE parcel_photos SET is_cover=TRUE WHERE id=\(/.test(api),
);
const photoUi = code('apps/mobile/src/components/PhotoSection.tsx');
check('CL-562 the category list comes from core, not this screen', /PHOTO_CATEGORIES/.test(photoUi));
check(
  'CL-564 a photo location is checked against the village like a map pin',
  /checkLocation\(pendingFix, villageCentroid/.test(photoUi),
);
const capture = code('apps/mobile/src/lib/photoCapture.ts');
check('CL-563 EXIF is requested at capture', /exif: true/.test(capture));
check(
  'CL-563 a library pick does not borrow the phone’s current position',
  /source === 'camera' \? await liveFix\(\) : null/.test(capture),
  "where the user is standing today says nothing about where an old photo was taken",
);
check(
  'CL-563 EXIF hemisphere refs are applied',
  /LatitudeRef/.test(capture) && /LongitudeRef/.test(capture),
  'ignoring S/W puts southern and western coordinates in the wrong quadrant',
);

// ── CL-575..584: parcel rows line up whatever their content ───────────────
const holdings = code('apps/mobile/src/app/(tabs)/holdings.tsx');
check(
  'CL-575 one leading slot serves both a cover and an icon',
  /<View\s+style=\{\[\s*styles\.leading/.test(holdings) && !/styles\.rowCover/.test(holdings),
  'a cover image and a List.Icon have different footprints — they cannot each style themselves',
);
// What must stay true is ALIGNMENT: the slot always reserves the same width so
// every title starts at the same x. Whether it draws anything is a design
// choice — twenty-one identical placeholders were noise, so it draws nothing
// without a photo.
check(
  'CL-575 the leading slot is a fixed square',
  /leading: \{\s*width: 40,\s*height: 40,/.test(holdings),
);
check(
  'CL-575/578 the row height is fixed, not a minimum',
  /height: 56,/.test(holdings) && !/minHeight: 44,[\s\S]{0,200}paddingLeft/.test(holdings),
  'a minimum height lets a thumbnail row grow taller and its overflow button drift out of line',
);
check(
  'CL-575 the extent column stays right-aligned and unshrinkable',
  /extentCol: \{ minWidth: \d+, textAlign: 'right', flexShrink: 0/.test(holdings),
  'it was a fixed width, which is what truncated "3 Acres 20 Cents"',
);
check(
  'CL-576 row thumbnails come only from parcel photos, never documents or KYC images',
  /for \(const ph of photosResult\?\.data \?\? \[\]\)/.test(holdings) && !/registeredDocuments|docType/.test(holdings),
);
check(
  'CL-580 a lone group renders no group header',
  /groupBy !== 'none' && sections\.length > 1 && \(/.test(holdings),
);
check(
  'CL-583 segment counts respect the other active filters',
  /const counts = useMemo\(\s*\(\) => \(\{\s*all: countable\.length/.test(holdings),
  'counting every owned row while a filter is applied describes a set the user is not looking at',
);
check('CL-579 the active-filter chip is outlined like its neighbours', !/mode="flat" icon="filter-variant"/.test(holdings));

// ── CL-601/602: screening runs on-device and never hard-blocks ────────────
const screening = code('packages/core/src/land/photoScreening.ts');
// Hard blocks exist ONLY for privacy failures. Everything about "is this
// land" must stay overridable, or a bare fallow field becomes unrecordable.
check(
  'only identity documents and people are hard-blocked',
  (screening.match(/verdict: 'block'/g) ?? []).length === 2,
  'a block for anything else means a legitimate land photo can be refused outright',
);
check(
  'an unrecognised or low-confidence answer never blocks',
  /if \(c\.kind === '' \|\| c\.confidence === 'low'\)[\s\S]{0,200}verdict: 'warn'/.test(screening),
);
check(
  'the classifier is advisory, not an authorisation gate',
  /return null;/.test(code('apps/mobile/src/api/client.ts')),
  'an unreachable classifier must not stop someone recording their land',
);
check(
  'the classifier endpoint persists nothing',
  /async def classify_parcel_photo/.test(api) &&
    !/INSERT INTO/.test(api.split('async def classify_parcel_photo')[1]?.split('@app.post')[0] ?? ''),
  'an Aadhaar must not be stored in order to discover it should not be stored',
);
check('CL-603 the suggested category pre-selects', /setCategory\(suggestedCategory\(verdict\)\)/.test(photoUi));
check('a blocked photo cannot be saved', /disabled=\{busy \|\| checking \|\| blocked\}/.test(photoUi));
check(
  'absent EXIF is never treated as evidence',
  /const hasExif = /.test(screening) && /if \(!hasExif\) return SCREENING_OK/.test(screening),
);
check(
  'the photo sheet screens before upload',
  /screenPhoto\(pending\.exif\)/.test(photoUi),
  'screening after upload defeats the point — the bytes have already left',
);
check('CL-608 a rejected image can be filed as a document in one tap', /Add as a document instead/.test(photoUi));

// ── Automation leads; typing is the fallback ─────────────────────────────
// Both create screens used to open onto a blank form, which made hand-entry
// the primary path in an app whose whole point is reading the paper for you.
for (const f of ['apps/mobile/src/app/add-parcel.tsx', 'apps/mobile/src/app/add-property.tsx']) {
  const src = code(f);
  check(`${f} leads with the scan card`, /<ScanFirstCard/.test(src));
  check(
    `${f} puts the scan card ABOVE the form`,
    src.indexOf('<ScanFirstCard') < src.indexOf('<InlinePicker'),
    'a scan option below the form is not automation-first',
  );
  check(`${f} prefills the form from what was read`, /onFields=\{\(f, file\) =>/.test(src));
}
check(
  'the Plots tab does not send people to scan a passbook',
  !/No plots yet[\s\S]{0,400}Scan passbook/.test(code('apps/mobile/src/app/(tabs)/holdings.tsx')),
  'a plot has no passbook — that route cannot work',
);
check(
  'a non-agricultural deed creates a plot',
  /propertyFromDocument\.mutateAsync/.test(code('apps/mobile/src/app/documents.tsx')) &&
    /async def create_property_from_document/.test(api),
);

// ── CL-610: one word per concept ─────────────────────────────────────────
// "Holding" and "item" were third and fourth synonyms for the same things.
// Property is the umbrella; a parcel is farmland under a passbook; a plot is
// non-agricultural and comes from a deed.
for (const f of [...SCREENS, 'apps/mobile/src/app/allocation.tsx']) {
  // Only text the user can read. `['pattadar', 'holdings']` is a cache key and
  // `/holdings` is a route — neither is copy.
  const rendered = (code(f).match(/>[^<>{}]*[Hh]olding[^<>{}]*</g) ?? []).concat(
    (code(f).match(/(?:title|label|placeholder|accessibilityLabel)=["'][^"']*[Hh]olding[^"']*["']/g) ?? []),
  );
  check(`CL-610 ${f} does not say "holding" to the user`, rendered.length === 0, rendered.join(' | '));
}
check(
  'CL-612 the summary pairs each count with its own unit',
  /nParcels > 0[\s\S]{0,200}formatExtent\(sumExtent[\s\S]{0,200}nProps > 0[\s\S]{0,200}Sq\.yd/.test(holdings),
  'acres and square yards must never land in one figure',
);
check('CL-616 controls hide on an empty segment', /\{!segmentEmpty && \(/.test(holdings));
check(
  'CL-617 plots are not sorted by survey number',
  /kind === 'property'[\s\S]{0,120}Sort by plot no\./.test(holdings),
);

// ── No floating action buttons; creation is inline + overflow ────────────
const LIST_SCREENS = [
  'apps/mobile/src/app/(tabs)/passbooks.tsx',
  'apps/mobile/src/app/(tabs)/holdings.tsx',
  'apps/mobile/src/app/(tabs)/family.tsx',
  'apps/mobile/src/app/(tabs)/index.tsx',
];
for (const f of LIST_SCREENS) {
  check(`${f} has no floating action button`, !/<AppFab/.test(code(f)));
  check(`${f} declares its own overflow actions`, /menuItems=\{\[/.test(code(f)));
}
for (const f of LIST_SCREENS.slice(0, 3)) {
  check(`${f} ends its list with an inline add row`, /<AddRow/.test(code(f)));
  check(
    `${f} does not show the add row on an empty list`,
    /(!noData && <AddRow|segmentEmpty \? null)/.test(code(f)),
    'the empty state already carries a call to action; two would be duplication',
  );
}
check(
  'the add row is an action, not a card',
  !/<Card/.test(code('apps/mobile/src/components/AddRow.tsx')),
);
check(
  'list bottom inset no longer reserves room for a FAB',
  /TAB_BAR_CLEARANCE = 60 \+ 24/.test(code('apps/mobile/src/lib/listInset.ts')),
  'keeping the old 244pt leaves dead space under every list',
);

// ── CL-618..621: a tab root is never anonymous ───────────────────────────
for (const f of LIST_SCREENS) {
  const src = code(f);
  check(`CL-618 ${f} pins a title bar on scroll`, /<StickyTitleBar/.test(src));
  check(`CL-618 ${f} tracks the scroll offset`, /useAnimatedScrollHandler/.test(src));
  check(
    `CL-618 ${f} keeps its actions reachable from the pinned bar`,
    /<StickyTitleBar[\s\S]{0,400}menuItems=\{\[/.test(src),
    'a pinned bar without the actions is a label, not a navigation bar',
  );
}
const sticky = code('apps/mobile/src/components/StickyTitleBar.tsx');
check(
  'CL-619 the pinned bar is opaque so content cannot show through under the clock',
  /backgroundColor: theme\.colors\.background/.test(sticky) && !/rgba|opacity: 0\.\d/.test(sticky),
);
check(
  'the pinned bar ignores taps until it is visible',
  /pointerEvents=\{shown \? 'auto' : 'none'\}/.test(sticky),
  'an invisible bar that swallows taps is worse than no bar',
);
// Scope the check to the worklet body — searching the whole file would match
// the legitimate `pointerEvents` prop on the View below it.
const worklet = sticky.slice(sticky.indexOf('useAnimatedStyle('), sticky.indexOf('}));') + 4);
check(
  'pointerEvents is never returned from a worklet',
  !/pointerEvents/.test(worklet),
  'it is not an animatable property; Reanimated cannot apply it',
);
check('CL-621 Home has an inline title', /title="Home"/.test(code('apps/mobile/src/app/(tabs)/index.tsx')));
check(
  'CL-620 the summary pins with the title where there is one',
  /subtitle=\{/.test(code('apps/mobile/src/app/(tabs)/holdings.tsx')) &&
    /subtitle=\{/.test(code('apps/mobile/src/app/(tabs)/passbooks.tsx')),
);

// ── Hooks run on every render ────────────────────────────────────────────
// Home shipped a crash because a useSharedValue landed BELOW its
// `if (isLoading || !result) return …` guard: on the loading render React saw
// fewer hooks, and the next render threw "Rendered more hooks than during the
// previous render". Any hook after a component-level early return is the bug.
for (const f of LIST_SCREENS) {
  const src = code(f);
  const body = src.slice(src.search(/^export default function/m));
  const guard = body.search(/^  if \([\s\S]{0,120}?\n?\s*return \(/m);
  const hook = body.search(/^  const \w+ = use(SharedValue|State|Memo|Ref|AnimatedScrollHandler)\(/m);
  check(
    `no hook sits below an early return in ${f}`,
    guard === -1 || hook === -1 || hook < guard,
    'a conditional hook crashes React on the render after loading finishes',
  );
}

// ── A deed's extent is parsed, never digit-stripped ──────────────────────
check(
  'the API parses extent instead of joining digits',
  /_area_sq_yd\(doc\["extent"\]\)/.test(api) && !/ch\.isdigit\(\) or ch == "\."/.test(api),
  '"418-1/2 sq. yards" becomes 41812 — a hundredfold error in a land record',
);
for (const f of ['apps/mobile/src/app/add-property.tsx', 'apps/mobile/src/app/add-parcel.tsx']) {
  check(`${f} parses the extent it prefills`, /parseAreaSqYd\(f\.extent\)/.test(code(f)));
}
check(
  'the segment picker is never hidden',
  !/\{!segmentEmpty && \(\s*<>\s*<View style=\{styles\.controlRow\}>\s*\{\/\* CL-47/.test(holdings),
  'hiding it on an empty segment leaves no way back to a non-empty one',
);

// ── A failure names itself ───────────────────────────────────────────────
check(
  'AI failures never interpolate a bare exception',
  !/AI call failed: \$\{e\}/.test(api) && !/"error": "AI call failed"/.test(api),
  'httpx.ReadError has an empty str() — the user read "AI call failed:" and nothing else',
);
check('AI failures go through one message builder', /_ai_failure_message\(/.test(api));

// ── An unconfigured build can configure itself ───────────────────────────
const offline = code('apps/mobile/src/components/OfflineBanner.tsx');
check(
  'no address and unreachable are different messages',
  /No server address is set/.test(offline),
  '"can\'t reach the server" for a build with no server sends people to check their wifi',
);
check('an unconfigured build offers a way to set the address', /Set server address/.test(offline));
check(
  'the server row is reachable when nothing is configured',
  /\(showDebug \|\| !\(currentUrl \|\| API_URL\)\)/.test(code('apps/mobile/src/app/account.tsx')),
  'hiding the only way to set an address behind seven taps strands the app',
);

// ── Entering animations never live inside a worklet-driven scroller ──────
// Home's cards all start at opacity 0 under `entering={FadeInDown}`. Once the
// ScrollView became an Animated.ScrollView with a UI-thread scroll handler,
// those animations stopped playing and every card stayed invisible — a blank
// screen over perfectly good data.
for (const f of LIST_SCREENS) {
  const src = code(f);
  const worklet = /useAnimatedScrollHandler/.test(src);
  check(
    `${f} has no entering animation inside its animated scroller`,
    !worklet || !/entering=\{/.test(src),
    'content that starts invisible and never animates in is content the user never sees',
  );
}

// ── The number never gives way to the label ──────────────────────────────
// "3 Acres 20 Ce…", "27 Acr…", "Katr…" — in every case a fixed-width or
// freely-shrinking numeric column lost space to text beside it, truncating the
// one thing the row exists to show.
for (const f of ['apps/mobile/src/app/(tabs)/holdings.tsx', 'apps/mobile/src/app/(tabs)/passbooks.tsx']) {
  check(
    `${f} lets the extent column keep its width`,
    /extentCol: \{ minWidth: \d+, textAlign: 'right', flexShrink: 0/.test(code(f)),
    'a fixed width both truncated the number and refused the whitespace beside it',
  );
}
check(
  'the passbook address has its own row',
  /addressRow/.test(code('apps/mobile/src/app/(tabs)/passbooks.tsx')),
  'sharing a line with the khata number collapsed the village to "Kat…"',
);
check(
  'the group extent has its own row and does not shrink',
  /groupStats/.test(code('apps/mobile/src/app/(tabs)/family.tsx')) &&
    /noShrink/.test(code('apps/mobile/src/app/(tabs)/family.tsx')),
);
check(
  'groups open a detail screen instead of expanding in place',
  !/isOpen/.test(code('apps/mobile/src/app/(tabs)/family.tsx')) &&
    /pathname: '\/group\/\[id\]'/.test(code('apps/mobile/src/app/(tabs)/family.tsx')),
);

// ── Space goes to what differs, not what repeats ─────────────────────────
const docs = code('apps/mobile/src/app/documents.tsx');
check(
  'the document type chip is dropped when every row shares it',
  /const typeVaries = docTypes\.size > 1/.test(docs),
  '"Pattadar Passbook" on twelve rows is decoration crowding out the name',
);
check('the document name is not squeezed to one line', /variant="titleSmall" numberOfLines=\{2\}/.test(docs));
check(
  'the activity actor is hidden when it never varies',
  /const actorVaries = /.test(activity),
  'a constant name on every row is the least useful thing in it',
);

// ── Timestamps mean what they say ────────────────────────────────────────
check(
  'audit timestamps are parsed as UTC',
  /export function parseAuditTime/.test(read('packages/core/src/format/audit.ts')),
  'the API writes naive UTC; new Date() reads it as local and shifts every row',
);
check(
  'no screen parses an audit timestamp with a bare new Date',
  !/new Date\(e\.timestamp\)/.test(activity) && !/new Date\(e\.timestamp\)/.test(code('apps/mobile/src/app/(tabs)/index.tsx')),
);

// ── Nothing internal reaches the user ────────────────────────────────────
check('no template placeholder ships as copy', !/\{name\}\?/.test(code('apps/mobile/src/app/add-member.tsx')));
check(
  'schema enums are humanised before display',
  /humanizeTokens\(humanEntity/.test(read('packages/core/src/format/audit.ts')),
  '"independent_house" is vocabulary, not copy',
);
check(
  'no roadmap language ships',
  !/Phase \d/.test(code('apps/mobile/src/app/assistant.tsx')),
);
check(
  'the Assistant icon is gone until it does something',
  !/icon="shimmer"/.test(code('apps/mobile/src/components/AppHeader.tsx')) &&
    !/icon="shimmer"/.test(code('apps/mobile/src/components/StickyTitleBar.tsx')),
  'a permanent affordance that never works trains users to ignore that corner',
);
check(
  'an error names the field the screen shows',
  !/Khata, survey number/.test(code('apps/mobile/src/app/add-parcel.tsx')),
  'the field is labelled "Passbook"',
);
check(
  'a picker cannot stretch its sibling field',
  /row: \{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' \}/.test(code('apps/mobile/src/app/add-parcel.tsx')),
  'the Extent field inflated into a 700pt box when the unit list opened',
);

// ── CL-544: a KYC image can never become the avatar ───────────────────────
const avatar = code('apps/mobile/src/lib/avatar.ts');
check(
  'CL-544 the avatar has exactly one write path',
  (avatar.match(/copyAsync|downloadAsync/g) ?? []).length === 2,
  'a third writer means a KYC scan could reach the avatar file',
);
for (const f of ['apps/mobile/src/app/account.tsx', 'apps/mobile/src/app/documents.tsx', 'apps/mobile/src/app/add-member.tsx']) {
  const src = code(f);
  // The KYC read returns `a.uri`; the avatar setter must never receive it.
  check(
    `CL-544 ${f} never feeds a scanned card to the avatar`,
    !/setAvatarFile\.mutateAsync\(\s*a\.uri/.test(src),
  );
}

// ── A file upload is never read into JavaScript memory ────────────────────
// A 14 MB scanned deed was turned into a Blob and handed to fetch. The phone
// announced Content-Length: 14439321 and the connection died mid-body — ngrok
// logged status 0, duration 0 — while the app said "Can't reach the server"
// about a host it had queried successfully seconds earlier. Uploads stream
// from disk via expo-file-system's upload task, which also gives real byte
// progress. Any `form.append('file', blob)` is this bug returning.
for (const f of ['apps/mobile/src/api/client.ts', 'apps/mobile/src/api/storage.ts']) {
  const src = code(f);
  check(
    `${f} streams uploads instead of buffering them`,
    !/form\.append\(\s*'file'/.test(src) && !/\.blob\(\)/.test(src.replace(/^\s*\*.*$/gm, '')),
    'a file upload was buffered into a JS Blob',
  );
  check(
    `${f} uses the native upload task`,
    /createUploadTask\(/.test(src),
  );
}

// ── Scan-first, with a fallback that appears exactly when it is needed ────
// The form is folded away so the scan owns an uncluttered screen, which is
// only safe if a failed read opens it again. A collapsed form plus a silent
// failure would be a dead end with nothing to do.
const scanCard = code('apps/mobile/src/components/ScanFirstCard.tsx');
check(
  'a failed read opens the hand-entry form',
  /catch \(e\)[\s\S]{0,400}onManualOpenChange\(true\)/.test(scanCard),
  'the fallback must appear on failure, not stay behind another tap',
);
check(
  'a failed read collapses the scan to a single retry',
  /const collapsed = !!error && !reading;/.test(scanCard),
);
check(
  'a successful read opens the form to be checked',
  /onFields\(fields, \{ uri, name, mime \}\);\s*\n\s*onManualOpenChange\(true\);/.test(scanCard),
);
check(
  'the AI summary is labelled as AI-read and unverified',
  /Read by AI from the file you gave/.test(scanCard),
  'an extracted summary presented as fact is a claim the app cannot make',
);
for (const f of ['apps/mobile/src/app/add-property.tsx', 'apps/mobile/src/app/add-parcel.tsx']) {
  const src = code(f);
  check(`${f} folds its form behind the scan`, /\{manualOpen && \(/.test(src));
  check(
    `${f} passes the fold state to the scan card`,
    /manualOpen=\{manualOpen\}/.test(src) && /onManualOpenChange=\{setManualOpen\}/.test(src),
  );
}
// A notification about something already on screen is noise, not news.
const notify = code('apps/mobile/src/lib/notify.ts');
check(
  'notifications only fire when the user has looked away',
  /if \(!isBackgrounded\(\)\) return;/.test(notify),
);

// ── A summary cannot outlive the document it describes ───────────────────
// The summary is a statement ABOUT one file. Stored anywhere but on that
// file's own row it would need something to remember to delete it, and the
// thing that gets forgotten is the deletion. Deleting a property took its
// `documents` but left `registered_documents` behind — deeds, their parties
// and their summaries survived a property that no longer existed.
const apiSrc = code('services/api/src/main.py');
check(
  'the summary is a column on the document, not a table of its own',
  /ADD COLUMN IF NOT EXISTS summary TEXT/.test(apiSrc) && !/CREATE TABLE IF NOT EXISTS document_summaries/.test(apiSrc),
);
check(
  'deleting a property deletes its registered deeds',
  /DELETE FROM registered_documents WHERE property_id=%s AND owner_user_id=%s/.test(apiSrc),
  'a deed outliving its property is an orphan pointing at nothing',
);
check(
  'deleting a property deletes those deeds’ parties',
  /DELETE FROM document_parties WHERE document_id IN[\s\S]{0,120}registered_documents WHERE property_id/.test(apiSrc),
);
const docDetail = code('apps/mobile/src/app/document/[id].tsx');
check(
  'an AI summary is never presented as established fact',
  /Read by AI from this file\. It can be wrong/.test(docDetail),
);
check(
  'deleting a document says the summary goes with it',
  /this summary, the parties and the\s*\n?\s*extracted details — goes with it/.test(docDetail),
);
check(
  'tapping a document shows what it says before the raw file',
  /pathname: '\/document\/\[id\]'/.test(code('apps/mobile/src/app/documents.tsx')),
);

// ── A query may not ask for a field the schema does not have ─────────────
// Widening DOCUMENTS_QUERY to fetch `propertyId` broke the ENTIRE query: the
// column existed and the resolver set it, but RegisteredDocumentType never
// declared it, so GraphQL rejected the document and the Documents screen would
// have gone blank. One missing field takes the whole screen with it, so the
// selection set is checked against the type it selects from.
const ops = read('packages/core/src/api/operations.ts');
const docsQuery = ops.match(/DOCUMENTS_QUERY = `([^`]*)`/)?.[1] ?? '';
const selection = docsQuery.match(/registeredDocuments \{([^}]*)\}/)?.[1] ?? '';
const typeBlock = apiSrc.split('class RegisteredDocumentType:')[1]?.split('\n@strawberry')[0] ?? '';
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
for (const field of selection.trim().split(/\s+/).filter(Boolean)) {
  check(
    `DOCUMENTS_QUERY.${field} exists on RegisteredDocumentType`,
    new RegExp(`(^|\\n)\\s*${snake(field)}\\s*:`).test(typeBlock) ||
      new RegExp(`def ${snake(field)}\\(`).test(typeBlock),
    'a selection set naming an undeclared field fails the whole query, not just that field',
  );
}

// ── A record made from a document keeps the document ─────────────────────
// Scanning a deed filled the form and then discarded the file, so the holding
// reported "No documents attached yet" about the very deed that created it —
// and the AI summary read out of that deed had nowhere to live.
for (const f of ['apps/mobile/src/app/add-property.tsx', 'apps/mobile/src/app/add-parcel.tsx']) {
  const src = code(f);
  check(`${f} keeps the scanned file`, /setScanned\(\{ file, fields: f \}\)/.test(src));
  check(
    `${f} files the deed after the record is created`,
    /fileDocument\.mutateAsync\(\{ \.\.\.scanned\.fields/.test(src),
  );
  check(
    `${f} links the filed deed to what it created`,
    /link(RegisteredToProperty|Registered)\.mutateAsync\(/.test(src),
  );
  check(
    `${f} does not lose the record when filing fails`,
    /setSavedId\(/.test(src) && /could not be filed/.test(src),
    'the record is already saved; a failed attachment must not read as a failed save',
  );
}
check(
  'a holding shows the deeds it was made from',
  /linkedDeeds/.test(code('apps/mobile/src/app/holding/[id].tsx')),
);

// ── Attaching a document keeps what was read from it ─────────────────────
// The holding screen's Add-document button spent ~100s having the deed read
// by AI and then kept only `doc_type`, filing a bare row that could say
// nothing about itself and had no file off the phone.
const holdingSrc = code('apps/mobile/src/app/holding/[id].tsx');
check(
  'Add document files a registered document, not a bare row',
  /fileDocument\.mutateAsync\(\{ \.\.\.fields, _fileRef: fileRef \}\)/.test(holdingSrc),
  'a bare documents row cannot carry the summary or the extracted fields',
);
check(
  'Add document links what it filed to this holding',
  /linkRegisteredToParcel\.mutateAsync\(/.test(holdingSrc) &&
    /linkRegisteredToProperty\.mutateAsync\(/.test(holdingSrc),
);
check(
  'Add document uploads the file, not only a local copy',
  /uploadToDrive\(a\.uri, a\.name, mime\)/.test(holdingSrc),
);
check(
  'a long read says what it is doing',
  /setDocStage\('Reading'\)/.test(holdingSrc) && /\$\{docStage\} the document… \$\{docSecs\}s/.test(holdingSrc),
  'a silent 100-second wait is indistinguishable from a button that did nothing',
);

// ── The summary is written and set like a news story ─────────────────────
// A seven-line block of legal narrative is not read, it is skipped. Inverted
// pyramid: headline, scannable facts, then short paragraphs.
check(
  'the reader is asked for a headline and key points',
  /HEADLINE — one line, max 90 characters/.test(apiSrc) && /KEY_POINTS —/.test(apiSrc),
);
check(
  'the reader is asked for paragraphs, not a wall of text',
  /separated by a blank line/.test(apiSrc) && /never a single wall of/.test(apiSrc),
);
check(
  'the screen renders the headline above the prose',
  /variant="headlineSmall" style=\{styles\.headline\}/.test(docDetail),
);
check(
  'the screen keeps paragraphs apart',
  /split\(\/\\n\\s\*\\n\/\)/.test(docDetail),
  'losing the blank lines turns the story back into a block',
);
check('the screen renders the key points', /keyPoints\.map\(/.test(docDetail));

// ── Who transferred to whom is never presented as settled ────────────────
// Repeated readings of the same GPA disagreed about which party granted and
// which received — an inversion of who controls the land, delivered silently.
// It cannot be made deterministic, so it is always flagged instead.
check(
  'the transfer direction is always a caveat',
  /ALWAYS include, as the FIRST caveat, one line naming who you took as the person/.test(apiSrc),
);
check(
  'the GPA role mapping is pinned, not guessed',
  /A GPA HAS NO SELLER AND NO BUYER/.test(apiSrc) && /takes role \\"seller\\"/.test(apiSrc),
);
check(
  'the narrative may not contradict the parties list',
  /THE NARRATIVE MUST AGREE WITH `parties`/.test(apiSrc),
  'a headline naming the buyer as seller inverts ownership',
);
// Thinking is billed against max_tokens; on a 14 MB deed it alone exceeded the
// old 8000 ceiling and the JSON was cut off mid-object.
check(
  'the token ceiling leaves room for reasoning AND the answer',
  !/"max_tokens": 8000/.test(apiSrc) && /"max_tokens": 16000/.test(apiSrc),
);
check(
  'running out of room retries before failing',
  /retrying with lower effort/.test(apiSrc),
);

// ── A plausibility check that does not gate the write is decoration ──────
// The picker computed `sanity`, rendered a red banner about it, and then saved
// regardless. One live parcel reads exactly 16.500000, 80.600000 — the screen's
// own hardcoded default — 150 km from its village.
const picker2 = code('apps/mobile/src/app/set-location.tsx');
check(
  'the location picker gates the write on its own check',
  /if \(!force && sanity\.suspect\) \{/.test(picker2),
  'a warning the Save button ignores is worse than no warning',
);
check(
  'a coordinate nobody aimed at cannot be saved',
  /const \[aimed, setAimed\]/.test(picker2) && /disabled=\{!centre \|\| !aimed \|\| saving\}/.test(picker2),
  'the map reports its centre on layout, so Save wrote wherever it happened to open',
);
check(
  'the map does not open on a saveable national default',
  !/latitudeDelta: saved \? 0\.01 : 4/.test(picker2),
);
// ── Extents reach the API in the canonical unit ──────────────────────────
// `extent` is decimal acres; `unit` is a provenance label. Writing "40" with
// unit "Guntas" stores forty ACRES.
for (const f of ['apps/mobile/src/app/add-khata.tsx', 'apps/mobile/src/app/add-parcel.tsx']) {
  const src = code(f);
  check(`${f} converts extent to acres before writing`, /toAcres\(/.test(src));
  check(
    `${f} never sends a raw extracted extent`,
    !/extent: p\.extent,/.test(src),
    'the unit label is not a conversion',
  );
}

// ── Sign-in redirects to the app, never to Metro ─────────────────────────
// Cognito allows exactly one callback (pattadar://auth). A build attached to
// Metro made makeRedirectUri return exp://127.0.0.1:8081/--/auth, and the
// hosted UI answered with "Something went wrong" before any login form.
const auth = code('apps/mobile/src/auth/useCognitoAuth.ts');
check(
  'the OAuth redirect is pinned to the app scheme',
  /native: 'pattadar:\/\/auth'/.test(auth),
  'an environment-derived redirect_uri is rejected by Cognito',
);

console.log(failures === 0 ? 'UX GUARDS PASS' : `UX GUARDS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
