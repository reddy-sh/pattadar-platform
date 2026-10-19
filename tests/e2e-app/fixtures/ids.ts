/**
 * The cast. One place that decides what exists in the sealed world, so a spec
 * says `ID.parcel` and never a bare string that drifts from the seed.
 *
 * The world is small on purpose — six records, not thirty — and each one is
 * there to be a different SHAPE rather than a different row:
 *
 *   parcel     surveyed farm land: a ring, papers, features, photos, people.
 *              The record every "does the 360 work" scenario opens.
 *   plot       unsurveyed: no ring, no pin, almost nothing filed. The record
 *              every "what does an empty hanger say" scenario opens.
 *   flat       built property: a purchase ledger, expenses, a rental income.
 *              Money and Expenses branch on `isBuilt`, so they need this one.
 *   shop       archived. Proves the archived facet and the archived banner.
 *   watched    somebody else's land that this account watches — `stake` is
 *              not `owned`, which several screens key off.
 *   missing    an id that resolves to null. Not a 404 from the server: a
 *              record the API says is not in this portfolio.
 *
 * Vocabulary (shelves, statuses, kinds) is copied from the app, not invented:
 * apps/web/src/w360/ui.tsx SHELF_LABEL / STATUS_LABEL.
 */

export const ID = {
  parcel: 'w-sy-214-2',
  plot: 'w-sy-88',
  flat: 'w-flat-4b',
  shop: 'w-shop-7',
  watched: 'w-sy-301',
  missing: 'w-no-such-record',
} as const;

export const PAPER = {
  deed: 'w-paper-deed',
  ec: 'w-paper-ec',
  map: 'w-paper-map',
  adangal: 'w-paper-adangal',
  aadhaar: 'w-paper-aadhaar',
  unsorted: 'w-paper-unsorted',
  missing: 'w-no-such-paper',
} as const;

export const FEATURE = {
  well: 'w-feat-well',
  fence: 'w-feat-fence',
  pump: 'w-feat-pump',
  trees: 'w-feat-trees',
} as const;

export const PERSON = {
  watcher: 'w-person-watcher',
  tenant: 'w-person-tenant',
  brother: 'w-person-brother',
} as const;

export const PHOTO = {
  cover: 'w-photo-cover',
  well: 'w-photo-well',
  clip: 'w-photo-clip',
} as const;

export const TICKET = {
  placed: 'w-tkt-placed',
  assigned: 'w-tkt-assigned',
  onSite: 'w-tkt-onsite',
  delivered: 'w-tkt-delivered',
  needsYou: 'w-tkt-needsyou',
  quiet: 'w-tkt-quiet',
  closed: 'w-tkt-closed',
  cancelled: 'w-tkt-cancelled',
  missing: 'w-no-such-ticket',
} as const;

export const KIT = {
  wholeRecord: 'w-kit-record',
  onePaper: 'w-kit-paper',
  expired: 'w-kit-expired',
  work: 'w-kit-work',
} as const;

export const LINK = {
  buyer: 'w-link-buyer',
  bank: 'w-link-bank',
  lapsed: 'w-link-lapsed',
} as const;

export const MARK = {
  ne: 'w-mark-ne',
  se: 'w-mark-se',
  proposed: 'w-mark-proposed',
} as const;

export const EXPENSE = {
  fence: 'w-exp-fence',
  tax: 'w-exp-tax',
  wages: 'w-exp-wages',
} as const;

/** The eight shelves the vault wall is built from (ui.tsx SHELF_LABEL). */
// The order flow's duplicate guard: the seeded ORDERS hold an open EC and an
// open survey on ID.parcel, so `?service=ec` or `?service=survey` deep links on
// it are sent back to the catalogue. Deep-link an orderable service instead —
// `patta_copy` or `title_opinion` — when a test is about the order form.
export const SHELVES = ['title', 'revenue', 'map', 'search', 'identity', 'old', 'photos', 'unsorted'] as const;
export type Shelf = (typeof SHELVES)[number];

/** The statuses a record can carry (ui.tsx STATUS_LABEL). */
export const STATUSES = ['owned', 'for_sale', 'disputed', 'managed', 'watch', 'archived'] as const;

/** The six hangers a record 360 opens onto, as route suffixes. */
export const HANGERS = ['', 'documents', 'site-features', 'people', 'money', 'expenses', 'services', 'activity', 'location', 'media', 'notes'] as const;

/** Every navigable signed-in top-level route, for the routing sweep. */
export const APP_ROUTES = [
  '/home',
  '/properties',
  '/map',
  '/maps',
  '/shared',
  '/assigned',
  '/services',
  '/order',
  '/papers',
  '/wallet',
  '/account',
  '/groups',
  '/invitations',
  '/notifications',
  '/tools',
  '/audit',
  '/profile',
  '/help',
  '/refer',
  // Several properties on one piece of ground (Holdings.tsx).
  '/holdings',
] as const;

/** Old /legacy URLs that must still resolve, and where each must land
 *  (routes.tsx). The signed-in app keeps no old addresses (no legacy links). */
export const REDIRECTS: Array<{ from: string; to: string | RegExp }> = [
  { from: '/legacy/properties', to: '/legacy/parcels?tab=properties' },
  { from: '/legacy/deeds', to: '/legacy/documents' },
  // Tools is drawn in this app now; the old legacy addresses carry their tab in.
  { from: '/legacy/tools', to: '/tools' },
  { from: '/legacy/sro', to: '/tools?tab=sro' },
  { from: '/legacy/stamp-duty', to: '/tools?tab=stamp-duty' },
  { from: '/legacy/market-value', to: '/tools?tab=market-value' },
  { from: '/legacy/calculator', to: '/tools?tab=calculator' },
];

/** The public doors — reachable with no account at all (routes.tsx). */
export const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/login',
  '/signup',
  '/forgot-password',
  '/privacy',
  '/terms',
] as const;
