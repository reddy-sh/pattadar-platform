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
export const SHELVES = ['title', 'revenue', 'map', 'search', 'identity', 'old', 'photos', 'unsorted'] as const;
export type Shelf = (typeof SHELVES)[number];

/** The statuses a record can carry (ui.tsx STATUS_LABEL). */
export const STATUSES = ['owned', 'for_sale', 'disputed', 'managed', 'watch', 'archived'] as const;

/** The six hangers a record 360 opens onto, as route suffixes. */
export const HANGERS = ['', 'features', 'people', 'money', 'expenses', 'services', 'history', 'map', 'photos'] as const;

/** Every navigable route under /app, for the routing sweep. */
export const APP_ROUTES = [
  '/app',
  '/app/properties',
  '/app/map',
  '/app/villages',
  '/app/shared',
  '/app/assigned',
  '/app/services',
  '/app/order',
  '/app/papers',
  '/app/wallet',
  '/app/account',
  '/app/groups',
  '/app/invitations',
  '/app/notifications',
  '/app/tools',
  '/app/audit',
  '/app/admin',
  '/app/profile',
] as const;

/** The sections the redesign has not reached; each renders Section.tsx. */
export const UNDRAWN = ['groups', 'invitations', 'notifications', 'tools', 'audit', 'admin', 'profile'] as const;

/** Old URLs that must still resolve, and where each must land (routes.tsx). */
export const REDIRECTS: Array<{ from: string; to: string | RegExp }> = [
  { from: '/app/dashboard', to: '/app' },
  { from: '/app/parcels', to: '/app/properties?kind=parcel' },
  { from: '/app/passbooks', to: '/app/properties?kind=parcel' },
  { from: '/app/documents', to: '/app/papers' },
  { from: '/app/deeds', to: '/app/papers' },
  { from: `/app/parcels/${ID.parcel}`, to: `/app/records/${ID.parcel}` },
  { from: `/app/properties/${ID.parcel}`, to: `/app/records/${ID.parcel}` },
  { from: '/app/passbooks/pb-1', to: '/legacy/passbooks/pb-1' },
  { from: '/legacy/properties', to: '/legacy/parcels?tab=properties' },
  { from: '/legacy/deeds', to: '/legacy/documents' },
  { from: '/legacy/sro', to: '/legacy/tools?tab=sro' },
  { from: '/legacy/stamp-duty', to: '/legacy/tools?tab=stamp-duty' },
  { from: '/legacy/market-value', to: '/legacy/tools?tab=market-value' },
  { from: '/legacy/calculator', to: '/legacy/tools?tab=calculator' },
];

/** The public doors — reachable with no account at all (routes.tsx). */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/privacy',
  '/terms',
] as const;
