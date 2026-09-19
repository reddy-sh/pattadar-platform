/**
 * What the sealed world answers with, before a test changes its mind.
 *
 * Every key here is a root field under `web` in apps/web/src/w360/api.ts —
 * all 67 of them, queries and mutations both — and every field a screen
 * SELECTS is present, because a missing field renders as `undefined` and a
 * screen drawing `undefined` is the failure this suite is supposed to catch,
 * not produce.
 *
 * Three rules kept while writing it:
 *
 *   1. Plausible, not placeholder. Katragunta, Markapur mandal, Prakasam
 *      district; extents in acres and guntas; rupees at Andhra Pradesh land
 *      rates. A fixture that reads like `foo/bar/1` cannot catch a screen that
 *      formats a number wrongly, because nobody can see that it did.
 *   2. Shapes, not rows. Six records, each a different branch — surveyed and
 *      not, built and not, owned and watched and archived. Adding a seventh
 *      that behaves like one of the six buys nothing.
 *   3. Derived where the server derives. `properties` filters and counts from
 *      the same cards the facets are built from, so a facet test asserts the
 *      app's filtering rather than two hand-written numbers agreeing.
 *
 * A test changes one answer and leaves the rest standing:
 *      world.set('portfolio', { ...world.seedOf('portfolio'), waiting: [] });
 *      world.set('record', World.gqlError('the database is down'));
 *      world.patch('vault', { total: 0, shelves: [] });
 */
import { World } from './world';
import type { Answer } from './world';
import { ID, PAPER, FEATURE, PERSON, PHOTO, TICKET, KIT, LINK, MARK, EXPENSE } from './ids';

// ── builders ───────────────────────────────────────────────────────────

/** Every field `CARD` in api.ts selects. Anything omitted here draws as
 *  undefined on a property card, which is the bug, not the fixture. */
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID.parcel,
    kind: 'parcel',
    title: 'Sy 214/2',
    subtitle: 'Katragunta · 4 acres 12 guntas',
    classification: 'Dry land',
    status: 'owned',
    stake: 'owned',
    khataNo: '1042',
    ownerName: 'Telukutla Shankar Reddy',
    village: 'Katragunta',
    mandal: 'Markapur',
    district: 'Prakasam',
    placeLine: 'Katragunta, Markapur, Prakasam',
    extent: 4.3,
    extentUnit: 'acres',
    extentAlt: '4 acres 12 guntas',
    marketValue: 8_600_000,
    tags: ['ancestral'],
    lat: 15.7406698,
    lon: 79.2698502,
    ring: [15.7410, 79.2694, 15.7410, 79.2704, 15.7402, 79.2704, 15.7402, 79.2694],
    coverFileRef: 'file-cover-parcel',
    ...over,
  };
}

export const CARDS: Record<string, unknown>[] = [
  card(),
  card({
    id: ID.plot,
    kind: 'parcel',
    title: 'Sy 88',
    subtitle: 'Konakalamitla · 1 acre 8 guntas',
    classification: 'Wet land',
    khataNo: '318',
    village: 'Konakalamitla',
    placeLine: 'Konakalamitla, Markapur, Prakasam',
    extent: 1.2,
    extentAlt: '1 acre 8 guntas',
    marketValue: 2_100_000,
    tags: [],
    // Never surveyed, never pinned: the screens must say so rather than draw
    // a shape they do not have.
    lat: 0,
    lon: 0,
    ring: [],
    coverFileRef: '',
  }),
  card({
    id: ID.flat,
    kind: 'flat',
    title: 'Flat 4B, Sai Residency',
    subtitle: 'Kukatpally · 1,450 sft',
    classification: 'Residential',
    khataNo: '',
    village: 'Kukatpally',
    mandal: 'Kukatpally',
    district: 'Hyderabad',
    placeLine: 'Kukatpally, Hyderabad',
    extent: 1450,
    extentUnit: 'sft',
    extentAlt: '1,450 sft',
    marketValue: 7_250_000,
    tags: ['rented'],
    lat: 17.4948,
    lon: 78.3996,
    ring: [],
    coverFileRef: 'file-cover-flat',
  }),
  card({
    id: ID.shop,
    kind: 'shop',
    title: 'Shop 7, Market Road',
    subtitle: 'Markapur · 320 sft',
    classification: 'Commercial',
    status: 'archived',
    khataNo: '',
    village: 'Markapur',
    placeLine: 'Markapur, Prakasam',
    extent: 320,
    extentUnit: 'sft',
    extentAlt: '320 sft',
    marketValue: 1_900_000,
    tags: [],
    lat: 15.7402,
    lon: 79.2699,
    ring: [],
    coverFileRef: '',
  }),
  card({
    id: ID.watched,
    kind: 'parcel',
    title: 'Sy 301',
    subtitle: 'Katragunta · 2 acres',
    status: 'watch',
    stake: 'watch',
    khataNo: '',
    ownerName: 'Gopal Reddy',
    extent: 2,
    extentAlt: '2 acres',
    marketValue: 4_000_000,
    tags: ['neighbour'],
    ring: [],
    coverFileRef: '',
  }),
];

const BY_ID = new Map(CARDS.map((c) => [c.id as string, c]));

/** The facet groups the server builds, counted off the cards above so a test
 *  never has to keep two numbers in step by hand. */
function facetsFor(cards: Record<string, unknown>[], active: Record<string, string[]>) {
  const group = (key: string, label: string, field: string, labels: Record<string, string>) => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const value = String(c[field] ?? '');
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return {
      key,
      label,
      options: [...counts.entries()].map(([k, count]) => ({
        key: k,
        label: labels[k] ?? k,
        count,
        active: (active[key] ?? []).includes(k),
      })),
    };
  };
  const tagCounts = new Map<string, number>();
  for (const c of cards) for (const t of (c.tags as string[]) ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  return [
    group('kind', 'Kind', 'kind', { parcel: 'Land', flat: 'Flat', shop: 'Shop' }),
    group('status', 'Status', 'status', { owned: 'Owned', watch: 'Watch', archived: 'Archived', for_sale: 'For sale', disputed: 'Disputed', managed: 'Managed' }),
    group('stake', 'Your stake', 'stake', { owned: 'Owned', watch: 'Watching', managed: 'Managed' }),
    { key: 'derived', label: 'What it has', options: [
      { key: 'surveyed', label: 'Surveyed', count: cards.filter((c) => ((c.ring as number[]) ?? []).length > 0).length, active: (active.derived ?? []).includes('surveyed') },
      { key: 'no_papers', label: 'No papers', count: 1, active: (active.derived ?? []).includes('no_papers') },
    ] },
    { key: 'tags', label: 'Tags', options: [...tagCounts.entries()].map(([k, count]) => ({ key: k, label: k, count, active: (active.tags ?? []).includes(k) })) },
  ];
}

// ── W01 · the dashboard ────────────────────────────────────────────────

const PORTFOLIO = {
  displayName: 'Shankar Reddy',
  farmExtent: 7.5, farmCount: 3, plotExtent: 0, plotCount: 0,
  builtExtent: 1770, builtFlats: 1, builtShops: 1,
  invested: 9_400_000, worthNow: 23_850_000, gain: 14_450_000, loans: 1_200_000,
  managedCount: 4, watchedCount: 1, waitingCount: 3, runningCosts: 86_400,
  paperCount: 27, backupVerifiedOn: '2026-09-01',
  // W17 — the Shell decides whether to draw the desk rail from this, so the
  // sealed world is an ADMIN by default. A test that wants the ordinary
  // owner's rail sets it false, which is the cheaper of the two to arrange.
  isPlatformAdmin: true, associateId: '',
  tiles: [
    { key: 'worth', label: 'What it is worth', value: '2.39', unit: 'crore', note: 'Across 5 records', tone: 'good' },
    { key: 'land', label: 'Land', value: '7.5', unit: 'acres', note: '3 records', tone: '' },
    { key: 'built', label: 'Built', value: '1,770', unit: 'sft', note: '1 flat · 1 shop', tone: '' },
    { key: 'papers', label: 'Papers filed', value: '27', unit: '', note: 'Backed up 1 Sep', tone: '' },
    { key: 'costs', label: 'Running costs', value: '86,400', unit: 'a year', note: 'Tax, wages, repairs', tone: 'warn' },
  ],
  waiting: [
    { id: 'w-wait-tax', title: 'Land tax is due on Sy 214/2', detail: 'The receipt for 2025-26 is not on file', icon: 'tax', actionLabel: 'File the receipt', actionKind: 'papers', recordId: ID.parcel },
    { id: 'w-wait-survey', title: 'Sy 88 has never been surveyed', detail: 'No corners have been established', icon: 'map', actionLabel: 'Ask for a survey', actionKind: 'request', recordId: ID.plot },
    { id: 'w-wait-review', title: 'A surveyor sent back corners to look at', detail: 'Ticket W-2101, waiting on you for 2 days', icon: 'warn', actionLabel: 'Review what came back', actionKind: 'ticket', recordId: ID.parcel },
  ],
  valueBars: [
    { label: 'Land', value: 14_700_000, share: 0.62 },
    { label: 'Flat', value: 7_250_000, share: 0.30 },
    { label: 'Shop', value: 1_900_000, share: 0.08 },
  ],
  recent: CARDS.slice(0, 3),
};

// ── W02 · the properties list ──────────────────────────────────────────

/** Filters the seeded cards the way the resolver does, so a facet click is
 *  asserted against real filtering rather than a second hand-written list.
 *  Archived records stay out of the list until the archived facet asks for
 *  them — the behaviour the "Archive removes it, the facet brings it back"
 *  scenario depends on. */
const properties: Answer = (vars) => {
  const want = (key: string) => ((vars[key] as string[] | undefined) ?? []).filter(Boolean);
  const kinds = want('kinds'); const statuses = want('statuses');
  const stakes = want('stakes'); const derived = want('derived'); const tags = want('tags');

  let cards = CARDS.filter((c) => (statuses.includes('archived') ? true : c.status !== 'archived'));
  if (kinds.length) cards = cards.filter((c) => kinds.includes(c.kind as string));
  if (statuses.length) cards = cards.filter((c) => statuses.includes(c.status as string));
  if (stakes.length) cards = cards.filter((c) => stakes.includes(c.stake as string));
  if (derived.includes('surveyed')) cards = cards.filter((c) => ((c.ring as number[]) ?? []).length > 0);
  if (tags.length) cards = cards.filter((c) => ((c.tags as string[]) ?? []).some((t) => tags.includes(t)));

  const activeCount = kinds.length + statuses.length + stakes.length + derived.length + tags.length;
  const total = CARDS.length;
  const summaryBits = [...kinds, ...statuses, ...stakes, ...derived, ...tags];
  return {
    shown: cards.length,
    total,
    hidden: total - cards.length,
    filterSummary: summaryBits.length ? summaryBits.join(' · ') : '',
    hiddenPlaces: cards.length === total ? [] : ['Markapur'],
    activeCount,
    cards,
    facets: facetsFor(CARDS, { kind: kinds, status: statuses, stake: stakes, derived, tags }),
  };
};

// ── W03 · one record ───────────────────────────────────────────────────

function recordOf(id: string): Record<string, unknown> | null {
  const c = BY_ID.get(id);
  if (!c) return null;
  const built = c.kind !== 'parcel';
  return {
    id: c.id, kind: c.kind, title: c.title,
    eyebrow: built ? 'Built property' : 'Agricultural land',
    classification: c.classification, status: c.status, stake: c.stake,
    khataNo: c.khataNo, ownerName: c.ownerName,
    village: c.village, mandal: c.mandal, district: c.district, placeLine: c.placeLine,
    placeLineTe: id === ID.parcel ? 'కత్రగుంట, మార్కాపురం, ప్రకాశం' : '',
    state: 'Andhra Pradesh',
    extent: c.extent, extentUnit: c.extentUnit, extentDetail: c.extentAlt,
    marketValue: c.marketValue,
    perUnitValue: built ? 5_000 : 2_000_000,
    perUnitLabel: built ? 'per sft' : 'per acre',
    boughtYear: id === ID.parcel ? '1998' : id === ID.flat ? '2019' : '',
    lat: c.lat, lon: c.lon, ring: c.ring,
    mapCaption: ((c.ring as number[]) ?? []).length ? 'Walked 12 Aug 2026 · 8 corners' : 'Never surveyed',
    paperCount: id === ID.parcel ? 12 : id === ID.flat ? 5 : 0,
    featureCount: id === ID.parcel ? 14 : 0,
    peopleCount: id === ID.parcel ? 3 : id === ID.flat ? 1 : 0,
    serviceCount: id === ID.parcel ? 2 : 0,
    photoCount: id === ID.parcel ? 18 : 0,
    photoNote: id === ID.parcel ? 'Last visit 12 Aug 2026' : 'Nothing has been photographed here',
    tags: c.tags,
    noteBody: id === ID.parcel ? 'The eastern boundary is disputed with the adjoining survey.' : '',
    noteAuthor: id === ID.parcel ? 'Shankar Reddy' : '',
    noteAt: id === ID.parcel ? '2026-08-14' : '',
  };
}

const PAPERS: Record<string, Record<string, unknown>[]> = {
  [ID.parcel]: [
    { id: PAPER.deed, title: 'Sale deed 4412 of 1998', detail: 'Markapur SRO · 1998 · 14 pages', shelf: 'title', icon: 'title', tags: ['original'], shared: true, pageCount: 14, fileRef: 'file-deed' },
    { id: PAPER.ec, title: 'Encumbrance certificate', detail: '1985 to 2026 · clear', shelf: 'search', icon: 'search', tags: [], shared: false, pageCount: 6, fileRef: 'file-ec' },
    { id: PAPER.map, title: 'FMB sketch', detail: 'Survey 214/2 · village map', shelf: 'map', icon: 'map', tags: [], shared: false, pageCount: 1, fileRef: 'file-map' },
    { id: PAPER.adangal, title: 'Adangal 2025-26', detail: 'Revenue record · Katragunta', shelf: 'revenue', icon: 'revenue', tags: [], shared: false, pageCount: 2, fileRef: 'file-adangal' },
    { id: PAPER.unsorted, title: 'Scan 2026-08-02', detail: 'Not yet sorted onto a shelf', shelf: 'unsorted', icon: 'unsorted', tags: [], shared: false, pageCount: 1, fileRef: 'file-unsorted' },
  ],
  [ID.flat]: [
    { id: PAPER.aadhaar, title: 'Sale agreement', detail: 'Sai Residency · 2019 · 9 pages', shelf: 'title', icon: 'title', tags: [], shared: false, pageCount: 9, fileRef: 'file-flat-deed' },
  ],
  [ID.plot]: [],
  [ID.shop]: [],
  [ID.watched]: [],
};

const FEATURES: Record<string, unknown> = {
  total: 14, needsRepair: 2, walkedOn: '12 Aug 2026', walkedBy: 'Shankar Reddy',
  categories: [
    { key: 'water', label: 'Water', count: 4, active: false },
    { key: 'power', label: 'Power', count: 2, active: false },
    { key: 'boundary', label: 'Boundary', count: 3, active: false },
    { key: 'crop', label: 'Crop', count: 5, active: false },
  ],
  features: [
    { id: FEATURE.well, label: 'Open well', spec: '30 ft · 6 in pipe', icon: 'well', category: 'water', condition: 'Working', conditionState: 'ok', note: 'Rewired in 2024', lat: 15.7408, lon: 79.2697, pinLabel: 'W1', photoCount: 4, actions: ['photo', 'repair'] },
    { id: FEATURE.pump, label: 'Submersible pump', spec: '5 HP', icon: 'pump', category: 'water', condition: 'Needs repair', conditionState: 'warn', note: 'Starter burnt out', lat: 15.7407, lon: 79.2698, pinLabel: 'W2', photoCount: 1, actions: ['photo', 'repair'] },
    { id: FEATURE.fence, label: 'Barbed fence', spec: '420 m · 4 strand', icon: 'fence', category: 'boundary', condition: 'Not checked', conditionState: '', note: '', lat: 0, lon: 0, pinLabel: '', photoCount: 0, actions: ['photo'] },
    { id: FEATURE.trees, label: 'Mango trees', spec: '46 trees · 12 years', icon: 'trees', category: 'crop', condition: 'Working', conditionState: 'ok', note: '', lat: 15.7405, lon: 79.2701, pinLabel: 'C1', photoCount: 6, actions: ['photo'] },
  ],
};

const PEOPLE: Record<string, unknown> = {
  count: 3, monthlyOut: 7_200, seasonalIn: 140_000,
  walletBalance: 24_500, walletNote: 'In your wallet', walletLive: false,
  people: [
    { id: PERSON.watcher, name: 'Ramana Rao', initials: 'RR', role: 'Watchman', badges: ['On site'], summary: 'Walks the land weekly', arrangement: 'Monthly', payLabel: 'Paid', payValue: '₹7,200 / month', dueLabel: 'Next', dueValue: '1 Oct 2026', visibility: 'Sees photos and boundary', actions: ['pay', 'edit'], compact: false },
    { id: PERSON.tenant, name: 'Sai Kumar', initials: 'SK', role: 'Tenant farmer', badges: [], summary: 'Groundnut, one season', arrangement: 'Share', payLabel: 'Share', payValue: '40%', dueLabel: 'Harvest', dueValue: 'Feb 2027', visibility: 'Sees nothing', actions: ['edit'], compact: false },
    { id: PERSON.brother, name: 'Venkat Reddy', initials: 'VR', role: 'Co-owner', badges: ['Family'], summary: 'Brother · equal share', arrangement: '', payLabel: '', payValue: '', dueLabel: '', dueValue: '', visibility: 'Sees everything', actions: ['edit'], compact: true },
  ],
  payments: [
    { id: 'w-pay-1', title: 'Ramana Rao', subtitle: 'Watchman · September', occurredOn: '2026-09-01', method: 'UPI', amount: 7_200, direction: 'out', state: 'done' },
    { id: 'w-pay-2', title: 'Groundnut sale', subtitle: 'Sai Kumar · share', occurredOn: '2026-03-11', method: 'Cash', amount: 140_000, direction: 'in', state: 'done' },
  ],
};

// ── W04 · the ground ───────────────────────────────────────────────────

const RING = [15.7410, 79.2694, 15.7410, 79.2704, 15.7402, 79.2704, 15.7402, 79.2694];

function boundaryOf(id: string): Record<string, unknown> | null {
  const c = BY_ID.get(id);
  if (!c) return null;
  const surveyed = ((c.ring as number[]) ?? []).length > 0;
  return {
    recordId: id, title: c.title,
    lat: c.lat, lon: c.lon,
    setBy: surveyed ? 'Walked by Shankar Reddy' : '',
    accuracy: surveyed ? '±3 m' : '',
    extentLabel: c.extentAlt,
    caption: surveyed ? '8 corners walked 12 Aug 2026' : 'This record has never been surveyed',
    ring: surveyed ? RING : [],
    sheetTitle: surveyed ? 'FMB sketch' : '',
    sheetDetail: surveyed ? 'Survey 214/2 · Katragunta' : '',
    sheetId: surveyed ? PAPER.map : '',
    marks: surveyed
      ? [
          { id: MARK.ne, seq: 1, label: 'North-east stone', state: 'accepted', detail: 'Granite, chipped', lat: 15.7410, lon: 79.2704, photoCount: 2, notedOn: '2026-08-12' },
          { id: MARK.se, seq: 2, label: 'South-east stone', state: 'accepted', detail: '', lat: 15.7402, lon: 79.2704, photoCount: 0, notedOn: '2026-08-12' },
          { id: MARK.proposed, seq: 3, label: 'West corner', state: 'proposed', detail: 'Surveyor moved this 4 m west', lat: 15.7406, lon: 79.2691, photoCount: 1, notedOn: '2026-09-05' },
        ]
      : [],
  };
}

// ── W05 · what has been photographed ───────────────────────────────────

const PHOTOS: Record<string, unknown> = {
  total: 3, videoCount: 1, visitCount: 4, latestVisit: '12 Aug 2026', latestVisitCount: 2,
  verifiedCount: 2, unprovenCount: 1, subject: 'Sy 214/2',
  photos: [
    { id: PHOTO.cover, caption: 'The well from the gate', category: 'feature', fileName: 'well-gate.jpg', fileRef: 'file-photo-cover', mediaKind: 'image', capturedAt: '2026-08-12T06:40:00Z', localTime: '12 Aug 2026, 12:10 pm', capturedBy: 'Shankar Reddy', lat: 15.7408, lon: 79.2697, accuracyM: 4, orderRef: '', source: 'phone', sha256: 'a1b2c3', verified: true, deviceClockOk: true, pinDistanceM: 12, width: 1600, height: 1200, featureId: FEATURE.well, tags: ['water'], isCover: true },
    { id: PHOTO.well, caption: '', category: 'boundary', fileName: 'ne-stone.jpg', fileRef: 'file-photo-well', mediaKind: 'image', capturedAt: '2026-08-12T06:52:00Z', localTime: '12 Aug 2026, 12:22 pm', capturedBy: 'Ramana Rao', lat: 15.7410, lon: 79.2704, accuracyM: 9, orderRef: '', source: 'phone', sha256: 'd4e5f6', verified: true, deviceClockOk: true, pinDistanceM: 88, width: 1600, height: 1200, featureId: '', tags: [], isCover: false },
    { id: PHOTO.clip, caption: 'Walking the eastern edge', category: 'visit', fileName: 'east-walk.mp4', fileRef: 'file-photo-clip', mediaKind: 'video', capturedAt: '2026-06-02T05:10:00Z', localTime: '2 Jun 2026, 10:40 am', capturedBy: 'Shankar Reddy', lat: 0, lon: 0, accuracyM: 0, orderRef: '', source: 'upload', sha256: '', verified: false, deviceClockOk: false, pinDistanceM: 0, width: 1080, height: 1920, featureId: '', tags: [], isCover: false },
  ],
};

// ── W06 · what it cost and what it is worth ────────────────────────────

function moneyOf(id: string): Record<string, unknown> | null {
  const c = BY_ID.get(id);
  if (!c) return null;
  const built = c.kind !== 'parcel';
  return {
    recordId: id, title: c.title, eyebrow: c.placeLine,
    paidTotal: built ? 5_200_000 : 1_850_000,
    paidPerUnit: built ? 3_586 : 430_232,
    extrasTotal: built ? 310_000 : 46_000,
    govtTotal: built ? 4_100_000 : 1_200_000,
    govtPerUnit: built ? 2_827 : 279_069,
    govtRevised: '1 Apr 2026',
    marketTotal: c.marketValue as number,
    marketGain: built ? 2_050_000 : 6_750_000,
    marketGainPct: built ? 39.4 : 364.9,
    extent: c.extent, extentUnit: c.extentUnit,
    lots: [
      { id: 'w-lot-1', boughtOn: built ? '2019-07-18' : '1998-03-04', extent: c.extent as number, extentUnit: c.extentUnit as string, rate: built ? 3_586 : 430_232, paid: built ? 5_200_000 : 1_850_000, govtValue: built ? 4_100_000 : 1_200_000, seller: built ? 'Sai Constructions' : 'Chenna Reddy', deedNo: built ? '8821/2019' : '4412/1998', sro: built ? 'Kukatpally' : 'Markapur' },
    ],
    blendedRate: built ? 3_586 : 430_232,
    blendedPaid: built ? 5_200_000 : 1_850_000,
    blendedGovt: built ? 4_100_000 : 1_200_000,
    extras: [
      { id: 'w-extra-1', label: 'Stamp duty and registration', amount: built ? 310_000 : 46_000 },
    ],
    rates: [
      { label: 'Government value', value: built ? 2_827 : 279_069, unit: built ? 'per sft' : 'per acre' },
      { label: 'Market rate', value: built ? 5_000 : 2_000_000, unit: built ? 'per sft' : 'per acre' },
    ],
    series: [
      { year: '2022', market: built ? 5_800_000 : 5_600_000, government: built ? 3_400_000 : 900_000, paid: built ? 5_200_000 : 1_850_000 },
      { year: '2024', market: built ? 6_600_000 : 7_100_000, government: built ? 3_800_000 : 1_050_000, paid: built ? 5_200_000 : 1_850_000 },
      { year: '2026', market: c.marketValue as number, government: built ? 4_100_000 : 1_200_000, paid: built ? 5_200_000 : 1_850_000 },
    ],
    appreciationPct: 8,
    isBuilt: built,
    landArea: built ? 0 : (c.extent as number),
    landRate: built ? 0 : 2_000_000,
    landValue: built ? 0 : (c.marketValue as number),
    buildArea: built ? (c.extent as number) : 0,
    buildRate: built ? 2_400 : 0,
    buildValue: built ? 3_480_000 : 0,
    depreciation: built ? 12 : 0,
    depreciationYears: built ? 7 : 0,
  };
}

// ── W07 · what it costs to keep ────────────────────────────────────────

function expensesOf(id: string, year?: string): Record<string, unknown> | null {
  const c = BY_ID.get(id);
  if (!c) return null;
  const built = c.kind !== 'parcel';
  const rows = [
    { id: EXPENSE.tax, title: 'Land tax 2025-26', subtitle: 'Paid at the mandal office', onLabel: 'Whole record', onIcon: 'parcelwide', kind: 'running', paidBy: 'Shankar Reddy', amount: 3_400, spentOn: '2026-04-12', category: 'tax', recoverable: false, recoverableNote: '', hasReceipt: true },
    { id: EXPENSE.wages, title: 'Watchman, April to September', subtitle: 'Ramana Rao', onLabel: 'Whole record', onIcon: 'parcelwide', kind: 'running', paidBy: 'Shankar Reddy', amount: 43_200, spentOn: '2026-09-01', category: 'wages', recoverable: false, recoverableNote: '', hasReceipt: false },
    { id: EXPENSE.fence, title: 'Barbed fence, eastern edge', subtitle: '420 m, 4 strand', onLabel: 'Barbed fence', onIcon: 'fence', kind: 'capital', paidBy: 'Venkat Reddy', amount: 68_000, spentOn: '2026-02-20', category: 'repairs', recoverable: true, recoverableNote: 'Half owed back by Venkat', hasReceipt: true },
  ];
  return {
    recordId: id, title: c.title, eyebrow: c.placeLine, isBuilt: built,
    year: year || '2026-27',
    years: ['2026-27', '2025-26', '2024-25'],
    spent: 114_600, capital: 68_000, running: 46_600, owedBack: 34_000,
    income: built ? 216_000 : 140_000,
    netYield: built ? 2.3 : 1.1,
    perUnitRunning: built ? 32 : 10_837,
    extent: c.extent, extentUnit: c.extentUnit,
    categories: [
      { key: 'tax', label: 'Tax', count: 1, active: false },
      { key: 'wages', label: 'Wages', count: 1, active: false },
      { key: 'repairs', label: 'Repairs', count: 1, active: false },
    ],
    rows,
    featureOptions: [
      { key: FEATURE.well, label: 'Open well', count: 0, active: false },
      { key: FEATURE.fence, label: 'Barbed fence', count: 1, active: false },
    ],
  };
}

// ── W15 · the vault ────────────────────────────────────────────────────

const SHELF_COUNTS: Record<string, number> = {
  title: 6, revenue: 5, map: 3, search: 4, identity: 2, old: 4, photos: 2, unsorted: 1,
};
const SHELF_LABEL: Record<string, string> = {
  title: 'Title', revenue: 'Revenue record', map: 'Map', search: 'Search & tax',
  identity: 'Identity', old: 'Old record', photos: 'Photos', unsorted: 'Unsorted',
};
const SHELF_NOTE: Record<string, string> = {
  title: 'Sale deeds, gift deeds, partition deeds',
  revenue: 'Adangal, pahani, 1-B',
  map: 'FMB sketches and village maps',
  search: 'EC, tax receipts, market value',
  identity: 'Aadhaar, PAN, passbooks',
  old: 'Anything filed before 2000',
  photos: 'Scans that are only pictures',
  unsorted: 'Filed, not yet shelved',
};

const SHARE_LINKS = [
  { id: LINK.buyer, audience: 'Prospective buyer', subject: 'Sy 214/2', terms: 'View only · no download', docCount: 4, openedCount: 3, lastOpenedAt: '2026-09-10', expiresOn: '2026-10-01', daysLeft: 18, initials: 'PB' },
  { id: LINK.bank, audience: 'Union Bank, Markapur', subject: 'Flat 4B, Sai Residency', terms: 'View and download', docCount: 2, openedCount: 1, lastOpenedAt: '2026-08-30', expiresOn: '2026-09-20', daysLeft: 7, initials: 'UB' },
  { id: LINK.lapsed, audience: 'Surveyor', subject: 'Sy 214/2', terms: 'View only', docCount: 1, openedCount: 0, lastOpenedAt: '', expiresOn: '2026-08-01', daysLeft: 0, initials: 'S' },
];

const VAULT = {
  total: 27,
  regionNote: 'Stored in Mumbai (ap-south-1) · backed up 1 Sep 2026',
  shelves: Object.keys(SHELF_COUNTS).map((key) => ({
    key, label: SHELF_LABEL[key], note: SHELF_NOTE[key], count: SHELF_COUNTS[key],
  })),
  links: SHARE_LINKS,
};

/** A shelf listing. The counts agree with the wall above, because a card that
 *  says 6 and a shelf that lists 2 is exactly the defect worth catching. */
const vaultPapers: Answer = (vars) => {
  const shelf = String(vars.shelf ?? '');
  const count = SHELF_COUNTS[shelf] ?? 0;
  const seeded = (PAPERS[ID.parcel] as Record<string, unknown>[]).filter((p) => p.shelf === shelf);
  const made = Array.from({ length: Math.max(0, count - seeded.length) }, (_, i) => ({
    id: `w-paper-${shelf}-${i + 1}`,
    title: `${SHELF_LABEL[shelf] ?? shelf} ${i + 1}`,
    detail: 'Sy 214/2 · Katragunta',
    shelf, icon: shelf, tags: [], shared: false, pageCount: 2,
    fileRef: `file-${shelf}-${i + 1}`,
    recordId: ID.parcel, recordTitle: 'Sy 214/2',
  }));
  return [...seeded.map((p) => ({ ...p, recordId: ID.parcel, recordTitle: 'Sy 214/2' })), ...made];
};

function documentOf(id: string): Record<string, unknown> | null {
  const paper = Object.values(PAPERS).flat().find((p) => p.id === id);
  if (!paper) return null;
  const isDeed = id === PAPER.deed;
  return {
    id, title: paper.title, subtitle: paper.detail, shelf: paper.shelf,
    recordId: ID.parcel, recordTitle: 'Sy 214/2',
    pageCount: paper.pageCount, sizeLabel: '2.4 MB',
    registeredOn: isDeed ? '1998-03-04' : '',
    fileRef: paper.fileRef, mimeType: 'application/pdf',
    office: isDeed ? 'Markapur SRO' : '',
    buyer: isDeed ? 'Telukutla Shankar Reddy' : '',
    seller: isDeed ? 'Chenna Reddy' : '',
    consideration: isDeed ? 1_850_000 : 0,
    readerSummary: isDeed ? 'A sale of 4 acres 12 guntas in Sy 214/2, Katragunta, for ₹18,50,000.' : '',
    readerFlag: isDeed ? 'The extent on page 3 is written in guntas and in acres, and the two do not agree.' : '',
    readerFlagPage: isDeed ? 3 : 0,
    tags: paper.tags, shared: paper.shared,
    versions: [
      { id: 'w-ver-1', version: 1, label: 'As filed', madeOn: '2026-07-02', madeBy: 'Shankar Reddy', note: 'Scanned at the SRO' },
    ],
    link: paper.shared ? SHARE_LINKS[0] : null,
  };
}

// ── W13/W14 · what others sent you, and what you sent out ──────────────

const KITS = [
  { id: KIT.wholeRecord, title: 'Sy 214/2', headline: 'Gopal Reddy sent you everything on Sy 214/2', kind: 'record', purpose: 'Sale', listLine: '5 papers · boundary · 18 photos', senderName: 'Gopal Reddy', senderInitials: 'GR', senderNote: 'Have a look before Sunday.', sharedAt: '2026-09-08', terms: 'View only · expires 1 Oct', openedCount: 2, daysLeft: 18, expiredOn: '', askedPrice: 9_200_000, photoCount: 18, featureCount: 14, state: 'open', items: [ { id: PAPER.deed, title: 'Sale deed 4412 of 1998', shelf: 'title', note: '14 pages', verdict: 'ok' }, { id: PAPER.ec, title: 'Encumbrance certificate', shelf: 'search', note: 'clear to 2026', verdict: 'ok' } ], checks: [ { id: 'w-chk-ec', title: 'Fresh EC', note: 'From the SRO, 30 years', price: 1_200 }, { id: 'w-chk-survey', title: 'Corner survey', note: 'A licensed surveyor walks it', price: 6_500 } ], checksTotal: 7_700 },
  { id: KIT.onePaper, title: 'Encumbrance certificate', headline: 'Union Bank sent you one paper', kind: 'paper', purpose: 'Loan', listLine: '1 paper', senderName: 'Union Bank', senderInitials: 'UB', senderNote: '', sharedAt: '2026-09-01', terms: 'View only', openedCount: 0, daysLeft: 4, expiredOn: '', askedPrice: 0, photoCount: 0, featureCount: 0, state: 'open', items: [ { id: PAPER.ec, title: 'Encumbrance certificate', shelf: 'search', note: '6 pages', verdict: 'ok' } ], checks: [], checksTotal: 0 },
  { id: KIT.expired, title: 'Sy 88', headline: 'This link has expired', kind: 'record', purpose: 'Sale', listLine: '', senderName: 'Chenna Reddy', senderInitials: 'CR', senderNote: '', sharedAt: '2026-06-01', terms: 'View only', openedCount: 5, daysLeft: 0, expiredOn: '2026-07-01', askedPrice: 0, photoCount: 0, featureCount: 0, state: 'expired', items: [], checks: [], checksTotal: 0 },
];

// ── W09 · the map ──────────────────────────────────────────────────────

const MAP_VIEW = {
  areaLabel: 'Markapur mandal, Prakasam',
  records: CARDS.filter((c) => (c.lat as number) !== 0).map((c) => ({
    id: c.id, kind: c.kind, title: c.title, subtitle: c.subtitle, status: c.status,
    classification: c.classification, marketValue: c.marketValue,
    extent: c.extent, extentUnit: c.extentUnit, khataNo: c.khataNo, ownerName: c.ownerName,
    village: c.village, lat: c.lat, lon: c.lon, shape: [], ring: c.ring,
    featureChips: c.id === ID.parcel ? ['Well', 'Fence', 'Mango'] : [],
    watcher: c.id === ID.parcel ? 'Ramana Rao' : '', watcherPay: c.id === ID.parcel ? '₹7,200 / month' : '',
    paperCount: c.id === ID.parcel ? 12 : 0, photoCount: c.id === ID.parcel ? 18 : 0,
  })),
  counts: [
    { key: 'parcel', label: 'Land', count: 3, active: false },
    { key: 'flat', label: 'Flat', count: 1, active: false },
  ],
  insights: [
    { id: 'w-ins-1', title: 'Two of your records are in one village', detail: 'Sy 214/2 and Sy 301 share a boundary in Katragunta.' },
  ],
};

// ── the jump box ───────────────────────────────────────────────────────

const search: Answer = (vars) => {
  const q = String(vars.q ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: Record<string, unknown>[] = [];
  for (const c of CARDS) {
    if (String(c.title).toLowerCase().includes(q) || String(c.village).toLowerCase().includes(q)) {
      hits.push({ id: c.id, kind: 'record', title: c.title, subtitle: c.placeLine, route: `/app/records/${c.id}` });
    }
  }
  for (const p of PAPERS[ID.parcel] as Record<string, unknown>[]) {
    if (String(p.title).toLowerCase().includes(q)) {
      hits.push({ id: p.id, kind: 'paper', title: p.title, subtitle: p.detail, route: `/app/papers/${p.id}` });
    }
  }
  for (const person of (PEOPLE.people as Record<string, unknown>[])) {
    if (String(person.name).toLowerCase().includes(q)) {
      hits.push({ id: person.id, kind: 'person', title: person.name, subtitle: String(person.role), route: `/app/records/${ID.parcel}/people` });
    }
  }
  return hits;
};

// ── W10-W12 · services, one ticket, the wallet ─────────────────────────

/** The eight states a job passes through, as eight seeded tickets, so a spec
 *  asserting "this button is only offered at this stage" has a row for each
 *  stage instead of mutating one row eight times. `can` is the server's list
 *  of legal moves and Ticket.tsx gates every button on it
 *  (can: accept · cancel · deliver · dispatch · send_back · start). */
interface TicketShape {
  id: string; ref: string; status: string; statusLabel: string; statusState: string;
  stage: number; stageLabel: string; needsYou: boolean; closed: boolean;
  assignee: string; can: string[]; quietDays: number; quiet: boolean;
  funded: boolean; held: number; pendingReview: number; outcomeNote: string; acceptedAt: string;
}

const TICKET_SHAPES: TicketShape[] = [
  { id: TICKET.placed, ref: 'W-2101', status: 'placed', statusLabel: 'Placed', statusState: '', stage: 1, stageLabel: 'Placed', needsYou: false, closed: false, assignee: '', can: ['assign', 'cancel', 'dispatch'], quietDays: 0, quiet: false, funded: false, held: 0, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.assigned, ref: 'W-2102', status: 'assigned', statusLabel: 'Assigned', statusState: '', stage: 2, stageLabel: 'Assigned', needsYou: false, closed: false, assignee: 'Ravi Kumar, licensed surveyor', can: ['assign', 'cancel', 'deliver', 'dispatch', 'start', 'unassign'], quietDays: 1, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.onSite, ref: 'W-2103', status: 'on_site', statusLabel: 'On site', statusState: '', stage: 3, stageLabel: 'On site', needsYou: false, closed: false, assignee: 'Ravi Kumar, licensed surveyor', can: ['cancel', 'deliver', 'dispatch', 'unassign'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.delivered, ref: 'W-2104', status: 'delivered', statusLabel: 'Delivered', statusState: '', stage: 4, stageLabel: 'Delivered', needsYou: false, closed: false, assignee: 'Ravi Kumar, licensed surveyor', can: ['accept', 'cancel', 'dispatch', 'send_back'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.needsYou, ref: 'W-2105', status: 'waiting_owner', statusLabel: 'Waiting on you', statusState: 'warn', stage: 4, stageLabel: 'Delivered', needsYou: true, closed: false, assignee: 'Ravi Kumar, licensed surveyor', can: ['accept', 'cancel', 'dispatch', 'send_back'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 2, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.quiet, ref: 'W-2106', status: 'assigned', statusLabel: 'Sent out', statusState: 'warn', stage: 2, stageLabel: 'Assigned', needsYou: false, closed: false, assignee: 'Srinivas, document writer', can: ['assign', 'cancel', 'deliver', 'dispatch', 'start', 'unassign'], quietDays: 9, quiet: true, funded: true, held: 1_200, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.closed, ref: 'W-2098', status: 'accepted', statusLabel: 'Done', statusState: 'good', stage: 4, stageLabel: 'Delivered', needsYou: false, closed: true, assignee: 'Ravi Kumar, licensed surveyor', can: [], quietDays: 0, quiet: false, funded: true, held: 0, pendingReview: 0, outcomeNote: 'Eight corners established and filed onto the record.', acceptedAt: '2026-08-14' },
  { id: TICKET.cancelled, ref: 'W-2099', status: 'cancelled', statusLabel: 'Cancelled', statusState: 'bad', stage: 1, stageLabel: 'Placed', needsYou: false, closed: true, assignee: '', can: [], quietDays: 0, quiet: false, funded: false, held: 0, pendingReview: 0, outcomeNote: 'Cancelled before anybody was sent. ₹6,500 came back to the wallet.', acceptedAt: '' },
];

const KIND_OF: Record<string, { kind: string; title: string; detail: string; cost: number }> = {
  [TICKET.placed]: { kind: 'ec', title: 'Encumbrance certificate', detail: '30 years, Markapur SRO', cost: 1_200 },
  [TICKET.assigned]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
  [TICKET.onSite]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
  [TICKET.delivered]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
  [TICKET.needsYou]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
  [TICKET.quiet]: { kind: 'ec', title: 'Encumbrance certificate', detail: '30 years, Markapur SRO', cost: 1_200 },
  [TICKET.closed]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
  [TICKET.cancelled]: { kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners', cost: 6_500 },
};

const ORDERS = TICKET_SHAPES.map((t) => ({
  id: t.id, kind: KIND_OF[t.id].kind, title: KIND_OF[t.id].title, detail: KIND_OF[t.id].detail,
  assignee: t.assignee, cost: KIND_OF[t.id].cost, stage: t.stage, stageLabel: t.stageLabel,
  needsYou: t.needsYou, dueDate: t.closed ? '' : '2026-09-25',
  recordId: ID.parcel, recordTitle: 'Sy 214/2', params: '{}',
  status: t.status, statusLabel: t.statusLabel, statusState: t.statusState, ref: t.ref,
  held: t.held, pendingReview: t.pendingReview,
}));

const orders: Answer = (vars) => {
  const recordId = vars.recordId as string | undefined;
  const includeClosed = vars.includeClosed === true;
  let rows = ORDERS;
  if (!includeClosed) rows = rows.filter((o) => !TICKET_SHAPES.find((t) => t.id === o.id)?.closed);
  if (recordId) rows = rows.filter((o) => o.recordId === recordId);
  return rows;
};


/** The associate behind the name, on the two tickets that have one.
 *
 *  `contactShown` is the whole point of the card: an owner sees the number of
 *  whoever is on THEIR live job, and only when that person agreed to it at
 *  enrolment. The withheld case is seeded too — it is the branch that decides
 *  whether the screen is honest or just optimistic.
 */
const ASSIGNED_TO: Record<string, Record<string, unknown>> = {
  [TICKET.assigned]: {
    associateId: 'as-ravi', name: 'Ravi Kumar', firm: 'Ravi Surveys', initials: 'RK',
    discipline: 'surveyor', disciplineLabel: 'Licensed surveyor',
    contact: '9848012345', contactMasked: '••••••2345', contactShown: true, contactWhy: '',
    jobsOpen: 2, assignedAt: '2026-09-05', via: 'desk',
  },
  [TICKET.onSite]: {
    associateId: 'as-anita', name: 'K. Anitha', firm: '', initials: 'KA',
    discipline: 'advocate', disciplineLabel: 'Advocate',
    contact: '', contactMasked: '••••••2334', contactShown: false,
    contactWhy: 'They asked that their number not be shared. Send them a message instead and Pattadar does the writing.',
    jobsOpen: 3, assignedAt: '2026-09-06', via: 'owner',
  },
};

function ticketOf(id: string): Record<string, unknown> | null {
  const t = TICKET_SHAPES.find((s) => s.id === id);
  if (!t) return null;
  const meta = KIND_OF[id];
  const hasDeliverables = t.pendingReview > 0 || t.status === 'delivered' || t.closed;
  return {
    id: t.id, ref: t.ref, kind: meta.kind, title: meta.title, detail: meta.detail,
    recordId: ID.parcel, recordTitle: 'Sy 214/2', recordPlace: 'Katragunta, Markapur, Prakasam',
    status: t.status, statusLabel: t.statusLabel, statusState: t.statusState,
    stage: t.stage, stageLabel: t.stageLabel, needsYou: t.needsYou, closed: t.closed,
    assignee: t.assignee, dueDate: t.closed ? '' : '2026-09-25',
    // W17 — who is REALLY on it. Two of the seeded tickets carry a Pattadar
    // associate with an id behind the name, and the rest keep the legacy
    // free-text assignee, because both branches of "Who is on it" have to be
    // reachable: one has a number to ring, the other deliberately does not.
    // TICKET.onSite's associate withheld their number, which is the third
    // branch and the one nobody remembers to build.
    assignedTo: ASSIGNED_TO[t.id] ?? null,
    dispatchState: t.id === TICKET.placed ? 'queued' : '',
    quietDays: t.quietDays, quiet: t.quiet,
    outcomeNote: t.outcomeNote, acceptedAt: t.acceptedAt, createdAt: '2026-09-04',
    can: t.can,
    answers: [
      { k: 'Which survey number', v: '214/2' },
      { k: 'How many corners', v: '8' },
    ],
    money: {
      quoted: meta.cost, held: t.held, released: t.closed && t.status === 'accepted' ? meta.cost : 0,
      fee: 0, returned: t.status === 'cancelled' ? meta.cost : 0, payeeShare: meta.cost,
      provider: 'stub', live: false, funded: t.funded,
      headline: t.funded ? `₹${meta.cost.toLocaleString('en-IN')} is set aside for this job` : `₹${meta.cost.toLocaleString('en-IN')} has not been set aside yet`,
      honesty: 'Payments are switched off on this build. Nothing has been charged.',
    },
    events: [
      { id: 'w-ev-1', kind: 'placed', action: 'place', headline: 'You asked for a corner survey', detail: '', actorLabel: 'You', actorKind: 'owner', tone: '', at: '2026-09-04T05:00:00Z', atLabel: '4 Sep 2026' },
      ...(t.assignee ? [{ id: 'w-ev-2', kind: 'assigned', action: 'assign', headline: `Put on ${t.assignee}`, detail: '', actorLabel: 'Pattadar', actorKind: 'system', tone: '', at: '2026-09-05T05:00:00Z', atLabel: '5 Sep 2026' }] : []),
      ...(t.closed ? [{ id: 'w-ev-3', kind: t.status, action: t.status, headline: t.outcomeNote, detail: '', actorLabel: 'You', actorKind: 'owner', tone: t.status === 'cancelled' ? 'bad' : 'good', at: '2026-09-11T05:00:00Z', atLabel: '11 Sep 2026' }] : []),
    ],
    deliverables: hasDeliverables
      ? [
          { id: 'w-dlv-1', kind: 'boundary', label: '8 corners, walked', note: 'GPS, ±3 m', fileRef: '', fileName: '', mimeType: '', sizeBytes: 0, payload: JSON.stringify({ ring: RING }), submittedBy: 'Ravi Kumar', submittedAt: '2026-09-10', fileAs: 'Boundary', fileTargets: [{ k: 'Record', v: 'Sy 214/2' }], goesTo: 'The record boundary', review: t.closed ? 'accepted' : 'pending', reviewNote: '', filedTable: t.closed ? 'boundary' : '', filedId: t.closed ? 'w-boundary-1' : '', filedAt: t.closed ? '2026-09-11' : '' },
          { id: 'w-dlv-2', kind: 'paper', label: 'Surveyor report', note: '3 pages', fileRef: 'file-survey-report', fileName: 'survey-report.pdf', mimeType: 'application/pdf', sizeBytes: 240_000, payload: '', submittedBy: 'Ravi Kumar', submittedAt: '2026-09-10', fileAs: 'Paper', fileTargets: [{ k: 'Shelf', v: 'Map' }], goesTo: 'The map shelf', review: t.closed ? 'accepted' : 'pending', reviewNote: '', filedTable: '', filedId: '', filedAt: '' },
        ]
      : [],
    dispatches: t.assignee
      ? [{ id: 'w-dsp-1', purpose: 'invite', channel: 'sms', contactMasked: '+91 98••• ••432', personName: t.assignee.split(',')[0], subject: 'A job on Sy 214/2', body: 'Please open the link to accept.', provider: 'stub', live: false, status: 'sent', statusWord: 'Sent', error: '', expiresOn: '2026-09-19', daysLeft: 6, revoked: false, revokeReason: '', sentAt: '2026-09-05' }]
      : [],
    ledger: t.funded
      ? [{ id: 'w-led-1', entry: 'hold', label: 'Set aside for W-2102', amount: meta.cost, fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: t.id, ticketRef: t.ref, at: '2026-09-05' }]
      : [],
  };
}

const WALLET = {
  available: 24_500, setAside: 14_200, paidOut: 6_500, putIn: 45_000,
  autoTopUp: false, provider: 'stub', live: false,
  notice: 'Payments are switched off on this build. Nothing here has moved real money.',
  jobs: TICKET_SHAPES.filter((t) => t.held > 0).map((t) => ({
    ticketId: t.id, ref: t.ref, title: KIND_OF[t.id].title, recordTitle: 'Sy 214/2',
    statusLabel: t.statusLabel, held: t.held,
  })),
  rows: [
    { id: 'w-wled-1', entry: 'topup', label: 'Added to the wallet', amount: 45_000, fromBucket: 'bank', toBucket: 'wallet', payee: '', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: '', ticketRef: '', at: '2026-08-30' },
    { id: 'w-wled-2', entry: 'hold', label: 'Set aside for W-2102', amount: 6_500, fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: TICKET.assigned, ticketRef: 'W-2102', at: '2026-09-05' },
    { id: 'w-wled-3', entry: 'release', label: 'Paid to Ravi Kumar', amount: 6_500, fromBucket: 'held', toBucket: 'payee', payee: 'Ravi Kumar', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: TICKET.closed, ticketRef: 'W-2098', at: '2026-08-14' },
  ],
};

/** The catalogue, exactly as `SERVICE_CATALOGUE` in services/api/src/web360.py
 *  holds it — six services, three groups, and the real field tuples.
 *
 *  It used to be four inventions: a `visit` key the server calls `site_visit`,
 *  groups named `Searches` and `Filing` that exist nowhere, and prices nobody
 *  charges. Every assertion about grouping, about which services need the land
 *  located, and about what an order costs was therefore testing a catalogue
 *  the product does not sell. A fixture is allowed to choose the DATA; it is
 *  not allowed to invent the SHAPE. */
const OFFERS = [
  { key: 'ec', label: 'Encumbrance Certificate', price: 1_180, group: 'Records', blurb: "The registrar's list of every transaction on this land, for a period you choose.", days: 7, fields: [
    { name: 'from_year', label: 'From year', kind: 'year', required: false, options: [], help: 'Leave both empty for the full history, which is what the registrar gives by default.' },
    { name: 'to_year', label: 'To year', kind: 'year', required: false, options: [], help: '' },
    { name: 'purpose', label: 'What it is for', kind: 'select', required: false, options: ['Sale', 'Loan', 'Court', 'Own records'], help: '' },
  ] },
  { key: 'survey', label: 'Boundary re-survey', price: 2_900, group: 'On the ground', blurb: 'A licensed surveyor walks the boundary and pins each corner against the FMB sheet.', days: 21, fields: [
    { name: 'which_side', label: 'Which boundary', kind: 'select', required: true, options: ['All four', 'North', 'South', 'East', 'West'], help: '' },
    { name: 'dispute', label: 'Is a neighbour disputing it?', kind: 'select', required: true, options: ['No', 'Yes'], help: 'A disputed boundary is surveyed with both parties present.' },
    { name: 'notes', label: 'Anything the surveyor should know', kind: 'textarea', required: false, options: [], help: '' },
  ] },
  { key: 'site_visit', label: 'Site visit', price: 1_200, group: 'On the ground', blurb: 'Someone stands on the land, photographs it and reports what they found.', days: 7, fields: [
    { name: 'visit_on', label: 'Preferred date', kind: 'date', required: false, options: [], help: 'Left empty, we go within the week.' },
    { name: 'check', label: 'What to check', kind: 'select', required: true, options: ['General condition', 'Crop', 'Encroachment', 'Water', 'Fencing'], help: '' },
    { name: 'meet', label: 'Who to meet on site', kind: 'text', required: false, options: [], help: '' },
  ] },
  { key: 'title_opinion', label: 'Title opinion', price: 4_500, group: 'Legal', blurb: 'An advocate reads the chain of documents and writes whether the title is clean.', days: 14, fields: [
    { name: 'years', label: 'How far back to trace', kind: 'select', required: true, options: ['13 years', '30 years'], help: 'Banks usually ask for 30.' },
    { name: 'for_bank', label: 'Which bank, if it is for a loan', kind: 'text', required: false, options: [], help: '' },
  ] },
  { key: 'mutation', label: 'Mutation / name transfer', price: 2_200, group: 'Records', blurb: "Getting the revenue record moved into the new owner's name after a sale.", days: 30, fields: [
    { name: 'new_owner', label: 'Name to transfer into', kind: 'text', required: true, options: [], help: '' },
    { name: 'deed_no', label: 'Registered deed number', kind: 'text', required: true, options: [], help: '' },
  ] },
  { key: 'patta_copy', label: 'Certified patta copy', price: 450, group: 'Records', blurb: 'A stamped copy of the pattadar passbook entry from the village office.', days: 5, fields: [
    { name: 'copies', label: 'How many copies', kind: 'number', required: true, options: [], help: '' },
  ] },
];

const servicesOffered: Answer = (vars) => {
  const key = String(vars.key ?? '');
  const q = String(vars.q ?? '').trim().toLowerCase();
  let rows = OFFERS;
  if (key) rows = rows.filter((o) => o.key === key);
  // The resolver matches GROUP too, and sorts (group, label) before answering.
  // Both were missing here, so a test could not tell a client that orders the
  // groups itself from one that simply prints what arrived.
  if (q) {
    rows = rows.filter((o) => o.label.toLowerCase().includes(q)
      || o.blurb.toLowerCase().includes(q)
      || o.group.toLowerCase().includes(q));
  }
  return [...rows].sort((a, b) => (a.group === b.group
    ? a.label.localeCompare(b.label)
    : a.group.localeCompare(b.group)));
};

const CORRECTIONS = [
  { id: 'w-corr-1', field: 'Khata number', was: '1041', now: '1042', at: '2026-08-20', by: 'Shankar Reddy', note: 'Corrected from the adangal' },
  { id: 'w-corr-2', field: 'Owner name', was: 'T S Reddy', now: 'Telukutla Shankar Reddy', at: '2026-07-02', by: 'Shankar Reddy', note: '' },
];

const ASSIGNABLE = [
  { id: 'w-asg-1', name: 'Ravi Kumar', role: 'Licensed surveyor', detail: 'Markapur · 14 jobs done' },
  { id: 'w-asg-2', name: 'Srinivas', role: 'Document writer', detail: 'Markapur SRO' },
];

// ── the switchboard ────────────────────────────────────────────────────

/**
 * Every root field under `web`, answered.
 *
 * Reads return the shapes above. Mutations return what api.ts says they
 * return — `Wrapped<'deleteRecords', number>` is a count, `Wrapped<'addPaper',
 * string>` is an id — because a screen that checks `if (!res.web.deletePaper)`
 * treats the wrong type as a refusal and shows an error nobody asked for.
 *
 * Mutations answer with SUCCESS by default. A test that wants a refusal says
 * so in one line — `world.set('deletePaper', false)` or
 * `world.set('deletePaper', World.gqlError('…'))` — which is the shape of
 * nearly every "and what if the server says no" scenario in the suite.
 */

// ── W17 · the associates desk ──────────────────────────────────────────
//
// The roster is deliberately SMALL and deliberately uneven: one person who
// can take more, one who is at capacity, one who is paused, and one district
// with nobody in it at all. A fixture where everybody is available and every
// square is covered tests none of the screens that actually matter — the
// cold-start sentences, the reason somebody cannot be offered a job, and the
// coverage gap — which are the three things an operator reads first.

const DISCIPLINES = [
  { key: 'surveyor', label: 'Licensed surveyor', blurb: '', kinds: ['survey'], areaGrain: 'village', credential: 'Survey licence', fanout: 3 },
  { key: 'advocate', label: 'Advocate', blurb: '', kinds: ['title_opinion', 'opinion'], areaGrain: 'state', credential: 'Bar Council enrolment', fanout: 5 },
  { key: 'writer', label: 'Document writer', blurb: '', kinds: ['ec', 'patta_copy', 'mutation'], areaGrain: 'mandal', credential: "Writer's licence", fanout: 4 },
  { key: 'agent', label: 'Revenue agent', blurb: '', kinds: ['mutation', 'patta_copy', 'ec'], areaGrain: 'mandal', credential: '', fanout: 4 },
  { key: 'photo_studio', label: 'Photo & drone studio', blurb: '', kinds: ['site_visit', 'visit'], areaGrain: 'mandal', credential: 'GST', fanout: 3 },
  { key: 'caretaker', label: 'Caretaker', blurb: '', kinds: ['site_visit', 'visit', 'patta_copy'], areaGrain: 'village', credential: '', fanout: 3 },
  { key: 'contractor', label: 'Fencing & earthwork', blurb: '', kinds: ['fencing'], areaGrain: 'village', credential: '', fanout: 3 },
  { key: 'landscaper', label: 'Landscaping & plantation', blurb: '', kinds: ['fencing'], areaGrain: 'village', credential: '', fanout: 3 },
  { key: 'labour', label: 'Labour & crew', blurb: '', kinds: ['fencing', 'visit'], areaGrain: 'village', credential: '', fanout: 2 },
];

const area = (level: string, name: string) =>
  ({ id: `ar-${level}-${name}`.toLowerCase(), level, name, label: `${name} ${level}` });

const ASSOCIATES = [
  {
    id: 'as-ravi', name: 'G. Srinivas', firm: 'Srinivas Surveys', initials: 'GS',
    contact: '9848012345', contactMasked: '••••••2345', contactVisible: true,
    state: 'active', stateWord: 'Taking work', stateState: 'ok', stateReason: '',
    disciplines: [
      { key: 'surveyor', label: 'Licensed surveyor', state: 'on', stateWord: 'Offering', capacity: 3, openCount: 1, credentialState: 'verified' },
      { key: 'caretaker', label: 'Caretaker', state: 'on', stateWord: 'Offering', capacity: 2, openCount: 0, credentialState: '' },
    ],
    areas: [area('village', 'Katragunta'), area('mandal', 'Markapur'), area('district', 'Prakasam')],
    credentials: [{ id: 'cr-1', discipline: 'surveyor', kind: 'Survey licence', numberMasked: '••••41', authority: 'Survey & Settlement', expiresOn: '2027-03-31', daysLeft: 564, expiring: false, lapsed: false, review: 'verified', reviewNote: '', fileRef: '', fileName: '' }],
    claimed: false, dispatchable: true, whyNot: [],
    jobsOpen: 1, jobsDone: 14, offersSent: 0, offersTaken: 0, offersDeclined: 0,
    acceptRate: 0, lastOfferedAt: '', note: 'Walks the Markapur side himself.',
    createdAt: '2026-08-02',
  },
  {
    id: 'as-anita', name: 'K. Anitha', firm: '', initials: 'KA',
    contact: '9701122334', contactMasked: '••••••2334', contactVisible: false,
    state: 'active', stateWord: 'Taking work', stateState: 'ok', stateReason: '',
    disciplines: [
      { key: 'advocate', label: 'Advocate', state: 'on', stateWord: 'Offering', capacity: 3, openCount: 3, credentialState: 'verified' },
    ],
    areas: [area('state', 'Telangana')],
    credentials: [{ id: 'cr-2', discipline: 'advocate', kind: 'Bar Council enrolment', numberMasked: '••••/09', authority: 'Bar Council of AP', expiresOn: '2026-10-05', daysLeft: 22, expiring: true, lapsed: false, review: 'verified', reviewNote: '', fileRef: '', fileName: '' }],
    claimed: true, dispatchable: false, whyNot: ['Already holds 3'],
    jobsOpen: 3, jobsDone: 6, offersSent: 0, offersTaken: 0, offersDeclined: 0,
    acceptRate: 0, lastOfferedAt: '', note: '', createdAt: '2026-08-11',
  },
  {
    id: 'as-rajesh', name: 'M. Rajesh', firm: 'Rajesh Studio', initials: 'MR',
    contact: 'rajesh@example.com', contactMasked: 'r••••••@example.com', contactVisible: true,
    state: 'paused', stateWord: 'Paused', stateState: 'warn', stateReason: 'Away until October',
    disciplines: [
      { key: 'photo_studio', label: 'Photo & drone studio', state: 'on', stateWord: 'Offering', capacity: 3, openCount: 0, credentialState: '' },
    ],
    areas: [area('mandal', 'Markapur')],
    credentials: [],
    claimed: false, dispatchable: false, whyNot: ['Paused'],
    jobsOpen: 0, jobsDone: 2, offersSent: 0, offersTaken: 0, offersDeclined: 0,
    acceptRate: 0, lastOfferedAt: '', note: '', createdAt: '2026-09-01',
  },
];

const CARD_OF = (a: Record<string, unknown>) => ({
  id: a.id, name: a.name, firm: a.firm, initials: a.initials,
  disciplines: (a.disciplines as Record<string, unknown>[]).map((d) => d.key),
  disciplineLabels: (a.disciplines as Record<string, unknown>[]).map((d) => d.label),
  areas: (a.areas as Record<string, unknown>[]).map((x) => x.name),
  verified: (a.credentials as unknown[]).length > 0,
  jobsOpen: a.jobsOpen, jobsDone: a.jobsDone, acceptsMore: a.dispatchable,
  why: a.dispatchable ? ['Covers Katragunta', 'Nothing in hand'] : (a.whyNot as string[]),
});

const DESK_JOBS = [
  {
    ticketId: TICKET.placed, ref: 'W-2101', kind: 'ec', serviceLabel: 'Encumbrance Certificate',
    place: 'Katragunta, Markapur', status: 'placed', statusLabel: 'Placed', statusState: 'ok',
    assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-09-09',
    ageDays: 4, dueDate: '2026-09-20', overdue: false, quiet: false, quietDays: 0,
    quoted: 1180, held: 0, dispatchState: '', dispatchRound: 0, nextRoundAt: '',
    offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false,
  },
  {
    ticketId: TICKET.assigned, ref: 'W-2102', kind: 'survey', serviceLabel: 'Boundary re-survey',
    place: 'Katragunta, Markapur', status: 'assigned', statusLabel: 'Assigned', statusState: 'ok',
    assignee: 'G. Srinivas', assigneeRef: 'as-ravi', assigneeContact: '9848012345',
    orderedAt: '2026-08-30', ageDays: 14, dueDate: '2026-09-25', overdue: false,
    quiet: true, quietDays: 9, quoted: 2900, held: 2900, dispatchState: '',
    dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0,
    lastResponse: '', candidateCount: 2, stuck: false,
  },
  {
    ticketId: TICKET.onSite, ref: 'W-2103', kind: 'title_opinion', serviceLabel: 'Title opinion',
    place: 'Kukatpally, Hyderabad', status: 'placed', statusLabel: 'Placed', statusState: 'ok',
    assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-08-25',
    ageDays: 19, dueDate: '2026-09-30', overdue: false, quiet: false, quietDays: 0,
    quoted: 4500, held: 0, dispatchState: '', dispatchRound: 0, nextRoundAt: '',
    offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 0, stuck: true,
  },
];

const DESK = {
  mode: 'off', modeWord: 'Off — the desk sends everything by hand',
  jobs: DESK_JOBS, silent: DESK_JOBS.filter((j) => j.quiet),
  unassigned: 2, ageing: 1, silentCount: 1, stuck: 1,
  associatesActive: 2, associatesPending: 0, credentialsExpiring: 1,
  coverageGaps: 1, tasksOpen: 0,
};

const COVERAGE = [
  { level: 'mandal', name: 'Markapur', discipline: 'surveyor', disciplineLabel: 'Licensed surveyor', activeCount: 1, openJobs: 1, records: 3, risk: '' },
  { level: 'mandal', name: 'Markapur', discipline: 'writer', disciplineLabel: 'Document writer', activeCount: 0, openJobs: 1, records: 3, risk: 'gap' },
  { level: 'mandal', name: 'Markapur', discipline: 'photo_studio', disciplineLabel: 'Photo & drone studio', activeCount: 0, openJobs: 0, records: 3, risk: 'empty' },
  { level: 'mandal', name: 'Hyderabad', discipline: 'surveyor', disciplineLabel: 'Licensed surveyor', activeCount: 0, openJobs: 0, records: 1, risk: 'empty' },
  { level: 'mandal', name: 'Hyderabad', discipline: 'advocate', disciplineLabel: 'Advocate', activeCount: 1, openJobs: 1, records: 1, risk: '' },
  { level: 'mandal', name: 'Hyderabad', discipline: 'writer', disciplineLabel: 'Document writer', activeCount: 0, openJobs: 0, records: 1, risk: 'empty' },
];

const ASSOCIATE_EVENTS = [
  { id: 'ae-1', kind: 'enrol', headline: 'Added to the roster', detail: 'Enrolled by the desk', actorLabel: 'Pattadar desk', actorKind: 'desk', at: '2026-08-02T10:00:00', atLabel: '2 Aug' },
  { id: 'ae-2', kind: 'assign', headline: 'Put on Boundary re-survey', detail: 'Sy 214/2, Katragunta', actorLabel: 'Pattadar desk', actorKind: 'desk', at: '2026-08-30T11:30:00', atLabel: '30 Aug' },
];

const CANDIDATES = [
  {
    associateId: 'as-ravi', name: 'G. Srinivas', initials: 'GS', contact: '9848012345',
    discipline: 'surveyor', areaMatch: 'Covers Katragunta', openCount: 1, capacity: 3,
    acceptRate: 0, lastOfferedAt: '', rank: 1,
    why: ['1 in hand', 'Never offered a job yet', 'Covers Katragunta'],
    eligible: true, whyNot: [], alreadyOffered: false, alreadyDeclined: false,
  },
  {
    associateId: 'as-anita', name: 'K. Anitha', initials: 'KA', contact: '9701122334',
    discipline: 'advocate', areaMatch: 'All of Telangana', openCount: 3, capacity: 3,
    acceptRate: 0, lastOfferedAt: '', rank: 2, why: ['3 in hand'],
    eligible: false, whyNot: ['Already holds 3'], alreadyOffered: false, alreadyDeclined: false,
  },
];

export const SEED: Record<string, Answer> = {
  // reads
  portfolio: PORTFOLIO,
  properties,
  record: (vars) => recordOf(String(vars.id ?? '')),
  papers: (vars) => PAPERS[String(vars.id ?? '')] ?? [],
  features: (vars) => (String(vars.id) === ID.parcel ? FEATURES : { ...FEATURES, total: 0, needsRepair: 0, features: [], categories: [], walkedOn: '', walkedBy: '' }),
  people: (vars) => (String(vars.id) === ID.parcel ? PEOPLE : { ...PEOPLE, count: 0, people: [], payments: [], monthlyOut: 0, seasonalIn: 0 }),
  boundary: (vars) => boundaryOf(String(vars.id ?? '')),
  photos: (vars) => {
    if (String(vars.id) !== ID.parcel) return { ...PHOTOS, total: 0, videoCount: 0, visitCount: 0, verifiedCount: 0, unprovenCount: 0, photos: [], latestVisit: '', latestVisitCount: 0 };
    const featureId = vars.featureId ? String(vars.featureId) : '';
    if (!featureId) return PHOTOS;
    const rows = (PHOTOS.photos as Record<string, unknown>[]).filter((p) => p.featureId === featureId);
    return { ...PHOTOS, photos: rows, total: rows.length };
  },
  money: (vars) => moneyOf(String(vars.id ?? '')),
  expenses: (vars) => expensesOf(String(vars.id ?? ''), vars.year ? String(vars.year) : undefined),
  vault: VAULT,
  document: (vars) => documentOf(String(vars.id ?? '')),
  sharedKits: KITS,
  sharedKit: (vars) => KITS.find((k) => k.id === String(vars.id ?? '')) ?? null,
  mapRecords: MAP_VIEW,
  search,
  vaultPapers,
  orders,
  ticket: (vars) => ticketOf(String(vars.id ?? '')),
  wallet: WALLET,
  servicesOffered,
  corrections: (vars) => (String(vars.id) === ID.parcel ? CORRECTIONS : []),
  assignable: ASSIGNABLE.map((a) => a.name),
  // W17 — the desk. `desk` answers null for a non-admin, which is what the
  // screens branch on, so a test that wants the refusal sets it to null.
  desk: (vars) => {
    const scope = String(vars.scope ?? 'open');
    if (scope === 'silent') return { ...DESK, jobs: DESK.silent };
    if (scope === 'stuck') return { ...DESK, jobs: DESK_JOBS.filter((j) => j.stuck) };
    if (scope === 'all') return { ...DESK, jobs: DESK_JOBS };
    return { ...DESK, jobs: DESK_JOBS.filter((j) => !j.assigneeRef) };
  },
  associates: (vars) => {
    const d = String(vars.discipline ?? '');
    const st = String(vars.state ?? '');
    return ASSOCIATES.filter((a) =>
      (!d || (a.disciplines as Record<string, unknown>[]).some((x) => x.key === d))
      && (!st || a.state === st));
  },
  associate: (vars) => ASSOCIATES.find((a) => a.id === String(vars.id ?? '')) ?? null,
  associateEvents: () => ASSOCIATE_EVENTS,
  coverage: () => COVERAGE,
  deskTasks: () => [],
  disciplines: () => DISCIPLINES,
  candidates: () => CANDIDATES,
  associatesForTicket: () => ASSOCIATES.filter((a) => a.state === 'active').map(CARD_OF),

  // writes — the happy answer for each, in the type api.ts expects back
  setTag: true,
  saveExpense: 'w-exp-new',
  updateCaption: true,
  addPhoto: 'w-photo-new',
  addPerson: 'w-person-new',
  updatePerson: true,
  deletePerson: true,
  deletePhoto: true,
  setCoverPhoto: true,
  updatePaper: true,
  deleteExpense: true,
  addFeature: 'w-feat-new',
  updateFeature: true,
  deleteFeature: true,
  addPaper: 'w-paper-new',
  deletePaper: true,
  acceptMarkPosition: true,
  deleteMark: true,
  revokeShareLink: true,
  extendShareLink: true,
  dismissWaiting: true,
  saveRecord: 'w-record-new',
  setPin: true,
  setBoundary: true,
  addMark: 'w-mark-new',
  updateMark: true,
  moveMark: true,
  marksFromBoundary: 3,
  deleteRecords: (vars) => ((vars.ids as string[]) ?? []).length,
  archiveRecords: (vars) => ((vars.ids as string[]) ?? []).length,
  tagRecords: (vars) => ((vars.ids as string[]) ?? []).length,
  createRequest: 'w-req-new',
  assignRequest: true,
  inviteAssociate: 'as-new',
  updateAssociate: true,
  setAssociateDisciplines: true,
  setAssociateAreas: true,
  setAssociateState: true,
  deleteUnclaimedAssociate: true,
  assignAssociate: true,
  deskAssign: true,
  deskUnassign: true,
  setPlatformAdmin: true,
  closeDeskTask: true,
  createShareLink: 'w-link-new',
  orderService: 1,
  fundTicket: 'w-led-hold-new',
  dispatchTicket: 'w-dsp-new',
  revokeDispatch: true,
  startTicket: true,
  addDeliverable: 'w-dlv-new',
  reviewDeliverable: true,
  acceptTicket: 1,
  sendBackTicket: true,
  cancelTicket: true,
};

// ── everything that is not GraphQL ─────────────────────────────────────

/** A 1x1 white JPEG — stands in for every stored photo and paper preview. */
const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** The smallest thing Chrome's PDF viewer will accept as a document. */
const TINY_PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pg==',
  'base64',
);

/**
 * The non-GraphQL half of the seal: storage bytes, payment settings, the
 * capability flags, the consent record, the assistant, the village map store
 * and the document reader.
 *
 * Each is answered the way the local stack answers it on a good day, so a test
 * that does not care about them never has to mention them — and a test that
 * does overrides just that one with `world.route()`.
 */
export function seedRest(world: World): void {
  // Stored bytes. The format is decided by what the app asked for: a paper
  // preview asks for the PDF, a photo tile asks for an image.
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, (route) => {
    const wantsPdf = /file-(deed|ec|map|adangal|unsorted|flat-deed|survey-report)/.test(route.request().url());
    return wantsPdf
      ? { contentType: 'application/pdf', body: TINY_PDF }
      : { contentType: 'image/jpeg', body: PIXEL };
  });

  // An upload. Answers with the node id the app then hands to addPaper /
  // addPhoto / addDeliverable as `fileRef`.
  world.route(/\/api\/gateway\/storage\/(nodes|folders)/, (route) => {
    if (route.request().method() === 'GET') return { json: { nodes: [], folders: [] } };
    return { json: { id: 'file-uploaded', nodeId: 'file-uploaded', name: 'uploaded', size: 1024 } };
  });

  // Payments are OFF, which is the shipping state and the one the screens
  // have honest wording for.
  world.route(/\/api\/gateway\/pattadar\/payments\/config/, () => ({
    json: { enabled: false, mode: 'off', live: false },
  }));
  world.route(/\/api\/gateway\/pattadar\/payments\/tickets\//, () => ({
    status: 409,
    json: { error: 'Payments are switched off on this build.' },
  }));

  // No village maps have been uploaded. A map test that wants one seeds it.
  world.route(/\/api\/gateway\/pattadar\/village-maps/, (route) =>
    route.request().method() === 'GET'
      ? { json: { villages: [], maps: [], entries: [] } }
      : { json: { ok: true } });

  world.route(/\/api\/gateway\/capabilities/, () => ({ json: { capabilities: [], features: {} } }));

  // The account screen: what this person has consented to, and whether a
  // deletion is under way (it is not).
  world.route(/\/api\/gateway\/account\/consent/, (route) =>
    route.request().method() === 'GET'
      ? { json: { purposes: [
          { key: 'service', label: 'Running the service', required: true, granted: true },
          { key: 'improve', label: 'Improving the reading of documents', required: false, granted: false },
          { key: 'marketing', label: 'Telling you about new services', required: false, granted: false },
        ] } }
      : { json: { ok: true } });
  world.route(/\/api\/gateway\/account\/erasure/, (route) =>
    route.request().method() === 'GET' ? { json: { request: null } } : { json: { request: { id: 'w-del-1', state: 'staged', stagedOn: '2026-09-13' } } });
  world.route(/\/api\/gateway\/account\/export/, () => ({
    json: { files: [{ name: 'records.json', sizeLabel: '12 KB' }, { name: 'papers.csv', sizeLabel: '3 KB' }], url: '' },
  }));

  // The assistant is not running locally. The panel has honest wording for
  // that, and it is worth asserting, so the seal says so rather than hanging.
  world.route(/\/api\/gateway\/assistant/, () => ({
    status: 503,
    json: { error: 'The assistant is not running.' },
  }));

  // The document reader. Answers "nothing could be read" by default so no test
  // accidentally depends on a paid extraction; a reading test seeds its own.
  world.route(/\/api\/gateway\/pattadar\/import-[a-z-]+-async/, () => ({ json: { job: 'w-reading' } }));
  world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
    json: { state: 'failed', error: 'Nothing could be read from that file.' },
  }));

  // The dev-only access-token seam. AuthProvider (import.meta.env.DEV only)
  // POSTs this once on mount to mint a Bearer for the storage routes — on the
  // laptop trust root it answers 200 with a token, on the real pool it 404s
  // and the app falls back to no Bearer. Left unrouted it reached the seal's
  // catch-all, which answers 501; a 501 is logged by Chromium as a failed
  // resource, and the console-error guard then failed every test on a call the
  // app already handles gracefully. Answer it the way the local stack does on a
  // good day. The token is never verified here — the sealed session is a
  // fakeJwt and GraphQL is answered off x-user-id — so any well-formed body
  // will do.
  world.route(/\/api\/gateway\/local-auth\/token/, () => ({
    json: { access_token: 'sealed-local-token', expires_in: 3600 },
  }));
}

export { PORTFOLIO, VAULT, WALLET, KITS, ORDERS, OFFERS, PAPERS, FEATURES, PEOPLE, PHOTOS, MAP_VIEW, TICKET_SHAPES, SHARE_LINKS, CORRECTIONS, RING };
