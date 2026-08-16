/**
 * The vault's shelves — ONE taxonomy, shared.
 *
 * The web filtered by `Deeds · EC · Records · Survey · Legal · Photos · Other`
 * while the phone grouped by `Title · Revenue record · Map · Identity ·
 * Search & tax · Old record · Unsorted`. Same documents, same person, two
 * different filing cabinets, and no way to tell someone where their deed is
 * without asking which device they were holding.
 *
 * This is the iOS set, because it earned it: it is derived from what the
 * reader actually emits (free text like "ROR/Adangal" or "1-B Register"), it
 * already drives the tints, the identity masking and the FMB handling, and it
 * classifies an UNREAD file by name — which the web set could not do, having
 * been built around a fixed list of `doc_type` keys. The one thing it lacked,
 * a home for photos and video, is added here.
 *
 * The Swift twin is `documentFamily` / `familyLabel` in
 * `PattadarKit/Format/DocSpine.swift`. The two must agree exactly; the labels
 * below are the copy of record, and `docFamilies.test.ts` guards the pairing.
 */

export type DocFamily =
  | 'title'
  | 'revenue'
  | 'map'
  | 'identity'
  | 'search'
  | 'old_record'
  | 'photo'
  | 'unsorted';

/** Display order — how the shelves read, left to right / top to bottom. The
 *  papers that prove ownership come first; the drawer of unsorted comes last. */
export const DOC_FAMILIES: DocFamily[] = [
  'title',
  'revenue',
  'map',
  'identity',
  'search',
  'old_record',
  'photo',
  'unsorted',
];

const LABELS: Record<DocFamily, string> = {
  title: 'Title',
  revenue: 'Revenue record',
  map: 'Map',
  identity: 'Identity',
  search: 'Search & tax',
  old_record: 'Old record',
  photo: 'Photos',
  unsorted: 'Unsorted',
};

/** One line saying what belongs on this shelf — the folder card's subtitle. */
const BLURBS: Record<DocFamily, string> = {
  title: 'Deeds, wills, agreements — what proves the land is yours',
  revenue: 'Passbooks, ROR / Adangal, mutations',
  map: 'FMB sheets, tippons, survey sketches',
  identity: 'Aadhaar, PAN — the people, not the land',
  search: 'ECs, tax receipts, challans',
  old_record: 'Sethwar, khasra, settlement registers',
  photo: 'Photographs and video of the land',
  unsorted: 'Not read yet, or nothing recognised it',
};

/** The colour NAME for a family; each app maps names to its own palette. Kept
 *  as names rather than hex so the two platforms can honour their own themes
 *  while still agreeing which shelf is which. */
const TINTS: Record<DocFamily, string> = {
  title: 'blue',
  revenue: 'green',
  map: 'cyan',
  identity: 'purple',
  search: 'orange',
  old_record: 'brown',
  photo: 'pink',
  unsorted: 'gray',
};

export const familyLabel = (family: string): string =>
  LABELS[family as DocFamily] ?? LABELS.unsorted;

export const familyBlurb = (family: string): string =>
  BLURBS[family as DocFamily] ?? BLURBS.unsorted;

export const familyTint = (family: string): string =>
  TINTS[family as DocFamily] ?? TINTS.unsorted;

/**
 * Which shelf a paper belongs on, read out of whatever it calls itself.
 *
 * A direct port of `documentFamily` in DocSpine.swift — the ORDER of the tests
 * matters wherever the words overlap, and each reordering below is load-bearing:
 *
 *   · "settlement register" is an old record; a "settlement deed" is title, so
 *     the old-record test runs first. Bare "old" is never matched — "household"
 *     is not an old record.
 *   · A "GPA deed" is tested with title, but it does not transfer title the way
 *     a sale deed does; the caller that cares reads the doc_type, not the shelf.
 *   · An unknown paper says "unsorted". Defaulting to title would dress any
 *     unread scrap in deed blue, and posing is worse than admitting.
 */
export function documentFamily(docType: string, mimeType = ''): DocFamily {
  const t = String(docType || '').toLowerCase();

  // A photo or a video is one by its bytes, whatever anyone typed.
  const m = String(mimeType || '').toLowerCase();
  if (m.startsWith('image/') || m.startsWith('video/')) return 'photo';
  if (t === 'photo' || t === 'video') return 'photo';

  if (
    t.includes('sethwar') ||
    t.includes('khasra') ||
    t.includes('faisal') ||
    t.includes('settlement register') ||
    t.includes('resettlement') ||
    t.includes('re-settlement') ||
    t.includes('old record')
  ) {
    return 'old_record';
  }
  if (
    t.includes('deed') ||
    t.includes('gpa') ||
    t.includes('attorney') ||
    t.includes('will') ||
    t.includes('testament') ||
    t.includes('agreement') ||
    t.includes('mortgage')
  ) {
    return 'title';
  }
  if (
    t.includes('passbook') ||
    t.includes('ror') ||
    t.includes('adangal') ||
    t.includes('pahani') ||
    t.includes('1b') ||
    t.includes('1-b') ||
    t.includes('mutation')
  ) {
    return 'revenue';
  }
  if (t.includes('fmb') || t.includes('map') || t.includes('tippon') || t.includes('sketch')) {
    return 'map';
  }
  if (
    t.includes('aadhaar') ||
    t.includes('aadhar') ||
    t === 'pan' ||
    t.includes('pan card') ||
    t.includes('permanent account')
  ) {
    return 'identity';
  }
  if (
    t.includes('encumbrance') ||
    t === 'ec' ||
    t.includes('tax') ||
    t.includes('receipt') ||
    t.includes('kist') ||
    t.includes('challan')
  ) {
    return 'search';
  }
  return 'unsorted';
}
