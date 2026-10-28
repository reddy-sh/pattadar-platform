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
import type { Answer, AnswerFn } from './world';
import { ID, PAPER, FEATURE, PERSON, PHOTO, TICKET, KIT, LINK, MARK, EXPENSE } from './ids';
import { FEATURE_TYPES } from './featureTypes';
import CATALOGUE from './catalogue.json';

// ── builders ───────────────────────────────────────────────────────────

/** Every field `CARD` in api.ts selects. Anything omitted here draws as
 *  undefined on a property card, which is the bug, not the fixture. */
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  const c: Record<string, unknown> = {
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
    // What the tile answers without being opened. Every one of these is a
    // branch on the card: a zero count drops out of the digest instead of
    // printing "0 papers", an empty deed line prints no label over no number,
    // and `litigation` is a capsule on the band rather than a status word.
    extentDetail: '4 acres 12 guntas · 430 cents · 20,812 sq.yd',
    paperCount: 6,
    photoCount: 12,
    featureCount: 4,
    deedLine: 'D.No 4521/2019 · Markapur SRO',
    litigation: false,
    paperFileRef: '',
    // WHO holds it and WHICH holding it is part of (web360 `_with_holders`).
    // Every seeded record is held in the owner's own name and in no holding.
    groupId: '',
    groupName: '',
    holderLabel: 'In your own name',
    holdingId: '',
    holdingName: '',
    // The register's facts (web360 `_register_facts`). The first parcel
    // carries every one, so each cell's branch is drawn; overrides that leave
    // them out inherit them, so the other cards blank the provenance below.
    docNo: '4521/2019', sro: 'Markapur', regDate: '2019-06-14',
    parentage: 'T. Venkat Reddy', coOwnerCount: 1,
    managerLine: 'K. Ramaiah · Caretaker', managerCount: 2,
    purchasePrice: 1_850_000, purchaseDate: '2019-06-14',
    mutationStatus: 'Done', ecStatus: 'Clear',
    // 19:00 UTC is 00:30 the next day in India: the table must say 11/10.
    createdAt: '2026-08-01T04:00:00', lastActivityAt: '2026-10-10T19:00:00',
    lastActivityBy: 'You', lastActivityAction: 'record.corrected',
    ...over,
  };
  // The LP is the government's number, which a parcel's title spells as
  // "Sy 214/2"; a built property has none unless it says so.
  if (!('surveyNo' in over)) {
    c.surveyNo = c.kind === 'parcel' ? String(c.title).replace(/^Sy\s+/, '') : '';
  }
  if (!('lastActivityAt' in over) && c.id !== ID.parcel) {
    Object.assign(c, { docNo: '', sro: '', regDate: '', parentage: '', coOwnerCount: 0,
      managerLine: '', managerCount: 0, purchasePrice: 0, purchaseDate: '',
      mutationStatus: '', ecStatus: '', createdAt: '', lastActivityAt: '',
      lastActivityBy: '', lastActivityAction: '' });
  }
  return c;
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
    extentDetail: '1 acre 8 guntas · 120 cents · 5,808 sq.yd',
    // No photograph and no ground, but a scan of its own. The card's artwork
    // chain falls through to the paper rather than to the illustration that is
    // identical on every parcel in the account.
    //
    // A UUID, not `file-sketch-sy88`. `isStorageRef` is a strict UUID test
    // (pages/documents/storage.ts) because legacy rows carry filenames where a
    // node id belongs, so a readable name here would be skipped before any
    // fetch and the card would draw nothing. It is also not named
    // `file-map-…`: the seeded content route answers a PDF for those refs and
    // an image for everything else, and a PDF is exactly what this field is
    // never allowed to carry.
    paperFileRef: '9f1c7e52-3b84-4a17-9d60-6c2f5a8e41bd',
    paperCount: 1,
    photoCount: 0,
    featureCount: 0,
    deedLine: '',
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
    // Both extents. `extent` can only carry the slab, so the ground under it
    // only reaches the reader through this line.
    extentDetail: '1,450 sq.ft built · 200 sq.yd land',
    // A suit, on a holding whose status is plainly `owned`. The two facts are
    // not alternatives, which is the whole reason litigation is its own field
    // and its own capsule.
    litigation: true,
    deedLine: 'D.No 1180/2021 · Kukatpally SRO',
    paperCount: 3,
    photoCount: 5,
    featureCount: 0,
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
    extentDetail: '30 sq.m',
    paperCount: 2,
    photoCount: 0,
    featureCount: 0,
    deedLine: 'D.No 806/2016 · Markapur SRO',
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
    extentDetail: '2 acres · 200 cents · 9,680 sq.yd',
    // A neighbour's land, watched and nothing more. Empty of everything a
    // record accumulates, which is the one case where the card has to write a
    // sentence instead of counting to zero four times.
    paperCount: 0,
    photoCount: 0,
    featureCount: 0,
    deedLine: '',
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
    // Village, khata and owner are three record-derived facets, each counted
    // off the cards' own field so the rail can never disagree with the grid —
    // and each labelled by its own value, exactly like the server does it.
    group('village', 'Village', 'village', {}),
    group('khata', 'Khata', 'khataNo', {}),
    group('owner', 'Owner', 'ownerName', {}),
    { key: 'tags', label: 'Your tags', options: [...tagCounts.entries()].map(([k, count]) => ({ key: k, label: k, count, active: (active.tags ?? []).includes(k) })) },
    // "Holder" (key `group`): each group that holds an active record, then
    // "In your own name". "Holding": each holding an active record is part of,
    // then "Not in a holding" — and no options at all until a holding exists,
    // exactly as web360.py builds them. Every DEFAULT card is personal and in
    // no holding; a test that wants either gives its cards a groupId/holdingId.
    (() => {
      const live = cards.filter((c) => c.status !== 'archived');
      const groups = new Map<string, { label: string; count: number }>();
      for (const c of live) {
        const gid = String(c.groupId ?? '');
        if (!gid) continue;
        const g = groups.get(gid) ?? { label: String(c.groupName || 'Unnamed group'), count: 0 };
        g.count += 1;
        groups.set(gid, g);
      }
      const own = live.filter((c) => !c.groupId).length;
      return {
        key: 'group', label: 'Holder',
        options: [
          ...[...groups.entries()].map(([k, g]) => ({ key: k, label: g.label, count: g.count, active: (active.group ?? []).includes(k) })),
          ...(own ? [{ key: 'personal', label: 'In your own name', count: own, active: (active.group ?? []).includes('personal') }] : []),
        ],
      };
    })(),
    (() => {
      const live = cards.filter((c) => c.status !== 'archived');
      const holdings = new Map<string, { label: string; count: number }>();
      for (const c of live) {
        const hid = String(c.holdingId ?? '');
        if (!hid) continue;
        const h = holdings.get(hid) ?? { label: String(c.holdingName || 'Untitled holding'), count: 0 };
        h.count += 1;
        holdings.set(hid, h);
      }
      const loose = live.filter((c) => !c.holdingId).length;
      return {
        key: 'holding', label: 'Holding',
        options: [
          ...[...holdings.entries()].map(([k, h]) => ({ key: k, label: h.label, count: h.count, active: (active.holding ?? []).includes(k) })),
          ...(holdings.size && loose ? [{ key: 'none', label: 'Not in a holding', count: loose, active: (active.holding ?? []).includes('none') }] : []),
        ],
      };
    })(),
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
  isPlatformAdmin: true, isSuperAdmin: false, associateId: '',
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
    { id: 'w-wait-review', title: 'A surveyor sent back corners to look at', detail: 'Ticket PT-2101, waiting on you for 2 days', icon: 'warn', actionLabel: 'Review what came back', actionKind: 'ticket', recordId: ID.parcel },
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
 *  scenario depends on. A test with a cast of its own (a card in a group or a
 *  holding) answers with `propertiesOver(itsCards)` and keeps the filtering. */
export function propertiesOver(ALL: Record<string, unknown>[]): (vars: Record<string, unknown>) => unknown {
  return (vars) => {
  const want = (key: string) => ((vars[key] as string[] | undefined) ?? []).filter(Boolean);
  const kinds = want('kinds'); const statuses = want('statuses');
  const stakes = want('stakes'); const tags = want('tags');
  // Village, khata and owner each narrow within themselves by OR and across
  // each other by AND — the same shape as every other facet, and the fix for
  // the old combined "derived" facet that matched two villages with AND and
  // drew an empty grid.
  const villages = want('villages'); const khatas = want('khatas'); const owners = want('owners');
  // Holder and holding: `personal` is "In your own name", `none` is "Not in a
  // holding" — OR within each, AND with everything else, as the resolver does.
  const groups = want('groups'); const holdings = want('holdings');

  let cards = ALL.filter((c) => (statuses.includes('archived') ? true : c.status !== 'archived'));
  if (kinds.length) cards = cards.filter((c) => kinds.includes(c.kind as string));
  if (statuses.length) cards = cards.filter((c) => statuses.includes(c.status as string));
  if (stakes.length) cards = cards.filter((c) => stakes.includes(c.stake as string));
  if (villages.length) cards = cards.filter((c) => villages.includes(c.village as string));
  if (khatas.length) cards = cards.filter((c) => khatas.includes(c.khataNo as string));
  if (owners.length) cards = cards.filter((c) => owners.includes(c.ownerName as string));
  if (tags.length) cards = cards.filter((c) => ((c.tags as string[]) ?? []).some((t) => tags.includes(t)));
  if (groups.length) cards = cards.filter((c) => groups.includes(String(c.groupId || 'personal')));
  if (holdings.length) cards = cards.filter((c) => holdings.includes(String(c.holdingId || 'none')));

  const activeCount = kinds.length + statuses.length + stakes.length
    + villages.length + khatas.length + owners.length + tags.length
    + groups.length + holdings.length;
  const total = ALL.length;
  const holderName = (g: string) => (g === 'personal' ? 'In your own name'
    : String(ALL.find((c) => c.groupId === g)?.groupName || g));
  const holdingName = (h: string) => (h === 'none' ? 'Not in a holding'
    : String(ALL.find((c) => c.holdingId === h)?.holdingName || h));
  const summaryBits = [...kinds, ...statuses, ...stakes, ...villages, ...khatas, ...owners, ...tags,
    ...groups.map(holderName), ...holdings.map(holdingName)];
  return {
    shown: cards.length,
    total,
    hidden: total - cards.length,
    filterSummary: summaryBits.length ? summaryBits.join(' · ') : '',
    hiddenPlaces: cards.length === total ? [] : ['Markapur'],
    activeCount,
    cards,
    facets: facetsFor(ALL, {
      kind: kinds, status: statuses, stake: stakes,
      village: villages, khata: khatas, owner: owners, tags,
      group: groups, holding: holdings,
    }),
  };
};
}

const properties: Answer = propertiesOver(CARDS);

// ── Holder: who holds a property (web360 `holderChange` / `setRecordHolder`) ──

/** The groups the default holder answers can name. The default cards are all
 *  in the owner's own name; a test that moves them to a group names one of
 *  these (or answers `holderChange` itself). */
export const HOLDER_GROUPS: Record<string, string> = {
  'w-grp-reddy': 'Reddy Family',
  'w-grp-estate': "Grandfather's estate",
};

/** What the server answers for a holder change over `cards`: the chosen
 *  records first (`requested: true`), then every OTHER parcel on the same
 *  khata (`requested: false`), because a parcel is held through its khata. A
 *  built property moves alone. `groupId` '' or `personal` is your own name.
 *  `shares` is `memberShares` (web360 `_holder_member_shares`): members'
 *  shares tied to a moving parcel in a group that will no longer hold it —
 *  only those whose group is not the target are answered, as the server does. */
export function holderChangeOver(cards: Record<string, unknown>[], names: Record<string, string> = HOLDER_GROUPS, shares: Record<string, unknown>[] = []): (vars: Record<string, unknown>) => unknown {
  return (vars) => {
    const ids = ((vars.recordIds as string[]) ?? []).filter(Boolean);
    if (!ids.length) return World.gqlError('Choose at least one property.');
    const raw = String(vars.groupId ?? '');
    const groupId = raw === 'personal' ? '' : raw;
    const holderLabel = groupId ? (names[groupId] ?? 'Unnamed group') : 'In your own name';
    const byId = new Map(cards.map((c) => [String(c.id), c]));
    const row = (c: Record<string, unknown>, requested: boolean) => ({
      id: c.id, kind: c.kind, title: c.title,
      passbookId: c.kind === 'parcel' && c.khataNo ? `w-pb-${c.khataNo}` : '',
      khataNo: c.kind === 'parcel' ? c.khataNo : '',
      requested,
      fromGroupId: c.groupId ?? '', fromHolderLabel: c.holderLabel ?? 'In your own name',
    });
    const chosen = ids.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
    const khatas = new Set(chosen.filter((c) => c.kind === 'parcel' && c.khataNo).map((c) => c.khataNo));
    const siblings = cards.filter((c) => !ids.includes(String(c.id))
      && c.kind === 'parcel' && c.khataNo && khatas.has(c.khataNo));
    const moving = new Set([...chosen, ...siblings].filter((c) => c.kind === 'parcel').map((c) => String(c.id)));
    return {
      groupId, holderLabel, siblingCount: siblings.length,
      records: [...chosen.map((c) => row(c, true)), ...siblings.map((c) => row(c, false))],
      memberShares: shares.filter((m) => moving.has(String(m.recordId)) && m.groupId !== groupId),
    };
  };
}

// ── W03 · one record ───────────────────────────────────────────────────

export function recordOf(id: string): Record<string, unknown> | null {
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
    // The tab strip's counts, as `Query.web.record` counts them (web360.py
    // `record`): off the same rows each tab lists, so a tab never says a
    // number its own list contradicts. Founder decision 28/09/2026 (design.md
    // § App vocabulary, "Property tabs"): the seed agrees with itself rather
    // than the client recounting. They used to be 12 / 14 / 3 / 2 / 18 over
    // lists of 5 / 4 / 4 / 6 / 2.
    //
    //   papers    — the PAPERS rows for the record;
    //   features  — the FEATURES rows (the parcel's only);
    //   people    — the staff (PEOPLE, the parcel's only) plus the owners
    //               answer, which gives every record its one owner;
    //   services  — the ORDERS against the record that are not closed;
    //   photos    — stills only, videos beside them (web360.py counts
    //               media_kind='photo'), so the clip in PHOTOS is not one;
    //   media     — every row the Media tab lists, clip included.
    paperCount: (PAPERS[id] ?? []).length,
    featureCount: id === ID.parcel ? (FEATURES.features as unknown[]).length : 0,
    peopleCount: (id === ID.parcel ? (PEOPLE.people as unknown[]).length : 0) + 1,
    serviceCount: id === ID.parcel ? TICKET_SHAPES.filter((t) => !t.closed).length : 0,
    photoCount: id === ID.parcel
      ? (PHOTOS.photos as Record<string, unknown>[]).filter((p) => p.mediaKind !== 'video').length
      : 0,
    mediaCount: id === ID.parcel ? (PHOTOS.photos as unknown[]).length : 0,
    photoNote: id === ID.parcel ? 'Last visit 12 Aug 2026' : 'Nothing has been photographed here',
    tags: c.tags,
    noteBody: id === ID.parcel ? 'The eastern boundary is disputed with the adjoining survey.' : '',
    noteAuthor: id === ID.parcel ? 'Shankar Reddy' : '',
    noteAt: id === ID.parcel ? '2026-08-14' : '',
    groupId: c.groupId, groupName: c.groupName, holderLabel: c.holderLabel,
    // The holding is `combinedId/combinedName` on the record (Q_RECORD).
    combinedId: c.holdingId, combinedName: c.holdingName,
    surveyNo: c.surveyNo, docNo: c.docNo, sro: c.sro, regDate: c.regDate,
  };
}

// ── W03 · Overview, the master record (Query.web.recordOverview) ──────
// Mirrors docs/specs/2026-10-11-property-overview.md §3: every field key the
// record kind has, set or not (an unset field has value '' and source null),
// the acquiring transfer, the per-tab summary off the same rows the tabs list,
// and the important gaps. Sy 214/2 is the deed-read case with one conflict
// (the owner typed the extent, a later deed says otherwise); every other
// record is the bare case — nothing known about how it was acquired.
//
// The read answers what the writes so far would have left, as the server does:
// a chooseFieldClaim on the extent ('keep' or the deed's claim) files the
// owner's own value and clears the conflict, and a fileDeedReading on a bare
// record fills "Title" from deed 1576/1989.

const claimSource = (source: string, label: string, setAt: string, sourceRef = '', documentId = '') =>
  ({ source, label, sourceRef, documentId, setAt, confidence: source === 'deed_reading' ? 'high' : '' });

type FieldRow = {
  key: string; group: string; label: string; value: string; display: string; important: boolean;
  howToFill: string; source: ReturnType<typeof claimSource> | null; conflicts: Record<string, unknown>[];
};

const FIELD_KEYS: [string, string, string, string][] = [
  // key, group, label, how to fill
  ['state', 'identity', 'State', ''],
  ['district', 'identity', 'District', ''],
  ['mandal', 'identity', 'Mandal', ''],
  ['village', 'identity', 'Village', ''],
  ['survey_no', 'identity', 'Survey number', 'From your deed or 1-B'],
  ['subdivision', 'identity', 'Subdivision', ''],
  ['lp_no', 'identity', 'LP number (resurvey)', 'From your Adangal or 1-B (Mee Bhoomi), if your village is resurveyed'],
  ['ulpin', 'identity', 'ULPIN', 'From your Adangal or 1-B (Mee Bhoomi), if your village is resurveyed'],
  ['old_survey_no', 'identity', 'Old survey number', ''],
  ['khata_no', 'identity', 'Khata / patta number', 'Upload the 1-B or passbook'],
  ['extent', 'physical', 'Extent', 'From your deed or 1-B'],
  ['classification', 'physical', 'Kind of land', ''],
  ['land_class', 'physical', 'Wet / dry', ''],
  ['boundary_north', 'physical', 'North boundary', ''],
  ['boundary_south', 'physical', 'South boundary', ''],
  ['boundary_east', 'physical', 'East boundary', ''],
  ['boundary_west', 'physical', 'West boundary', ''],
  ['acquisition_mode', 'title', 'How acquired', 'Upload the deed, or tell us how you got it'],
  ['registered', 'title', 'Registered', ''],
  ['doc_no', 'title', 'Document number', 'From your deed'],
  ['reg_date', 'title', 'Registered on', ''],
  ['exec_date', 'title', 'Executed on', ''],
  ['sro', 'title', 'Registration office', ''],
  ['consideration', 'title', 'Consideration', ''],
  ['govt_value', 'title', 'Government value', ''],
  ['stamp_duty', 'title', 'Stamp duty', ''],
  ['ec_status', 'status', 'Encumbrance', ''],
  ['ec_date', 'status', 'EC checked on', ''],
  ['mutation_status', 'status', 'Mutation', ''],
  ['litigation', 'status', 'Litigation', ''],
];

const DEED = claimSource('deed_reading', 'Deed 4412/1998', '2026-08-02T05:00:00Z', 'w-job-deed', PAPER.deed);
const PASSBOOK = claimSource('passbook_reading', 'Passbook 1042', '2026-07-20T05:00:00Z', 'w-job-pb');
const LEGACY = claimSource('legacy', 'Entered before sources were kept', '2026-01-01T00:00:00Z');
const MANUAL = claimSource('manual', 'You entered', '2026-07-01T05:00:00Z');

/** Sy 214/2's set values: [value, display, source]. */
const PARCEL_VALUES: Record<string, [string, string, ReturnType<typeof claimSource>]> = {
  state: ['Andhra Pradesh', 'Andhra Pradesh', PASSBOOK],
  district: ['Prakasam', 'Prakasam', PASSBOOK],
  mandal: ['Markapur', 'Markapur', PASSBOOK],
  village: ['Katragunta', 'Katragunta', PASSBOOK],
  survey_no: ['214/2', '214/2', DEED],
  khata_no: ['1042', '1042', PASSBOOK],
  extent: ['4.3', '4.30 ac', MANUAL],
  classification: ['dry', 'Dry land', LEGACY],
  boundary_north: ['Road', 'Road', DEED],
  acquisition_mode: ['sale', 'Sale', DEED],
  registered: ['yes', 'Yes', DEED],
  doc_no: ['4412/1998', '4412/1998', DEED],
  reg_date: ['1998-03-12', '12/03/1998', DEED],
  exec_date: ['1998-03-10', '10/03/1998', DEED],
  sro: ['Markapur', 'Markapur', DEED],
  consideration: ['240000', '₹2,40,000', DEED],
};

/** The acquisition a filed deed reading leaves on a bare record. */
const FILED_DEED = claimSource('deed_reading', 'Deed 1576/1989', '2026-10-11T05:00:00Z', 'w-paper-new', 'w-paper-new');

export function overviewOf(id: string, world?: World): Record<string, unknown> | null {
  const rec = recordOf(id);
  if (!rec) return null;
  const rich = id === ID.parcel;
  const chose = world?.calls('chooseFieldClaim')
    .filter((c) => c.vars.recordId === id && c.vars.key === 'extent').at(-1);
  const filed = !rich && !!world?.calls('fileDeedReading').some((c) => c.vars.recordId === id);
  const built = rec.kind !== 'parcel';
  // The bare records hold only what the card had, from before sources.
  const bare: Record<string, string> = {
    village: String(rec.village ?? ''), mandal: String(rec.mandal ?? ''), district: String(rec.district ?? ''),
    survey_no: String(rec.surveyNo ?? ''), khata_no: String(rec.khataNo ?? ''),
  };
  const fields: FieldRow[] = FIELD_KEYS
    .filter(([key]) => !(built && ['lp_no', 'ulpin', 'old_survey_no', 'khata_no'].includes(key)))
    .map(([key, group, label, howToFill]) => {
      let set = rich ? PARCEL_VALUES[key] : (bare[key] ? [bare[key], bare[key], LEGACY] as const : undefined);
      if (key === 'extent' && rich && chose) {
        set = chose.vars.claimId === 'keep' ? ['4.3', '4.30 ac', MANUAL] : ['4.12', '4.12 ac', MANUAL];
      }
      const important = built
        ? ['extent', 'acquisition_mode', 'doc_no'].includes(key)
        : ['survey_no', 'khata_no', 'extent', 'acquisition_mode', 'doc_no', 'lp_no', 'ulpin'].includes(key);
      return {
        key, group, label, important, howToFill,
        value: set?.[0] ?? '', display: set?.[1] ?? '', source: set?.[2] ?? null,
        conflicts: rich && key === 'extent' && !chose
          ? [{ id: 'w-claim-extent-deed', value: '4.12', display: '4.12 ac', source: DEED }]
          : [],
      };
    });
  const papers = PAPERS[id] ?? [];
  return {
    id,
    fields,
    missing: fields.filter((f) => f.important && !f.value),
    conflictCount: fields.filter((f) => f.conflicts.length).length,
    // D1's farmland prompt: none in the seeded world; 45-record-overview sets one.
    suggestKind: '', suggestReason: '', convertTarget: null,
    compliance: complianceOf(rich, filed, built, bare),
    acquisition: rich ? {
      mode: 'sale', modeLabel: 'Sale', registered: 'yes',
      docNo: '4412/1998', regDate: '1998-03-12', execDate: '1998-03-10', sro: 'Markapur',
      consideration: 240_000, govtValue: 180_000, stampDuty: 0, proofNo: '',
      transferId: 'w-transfer-1', deedDocumentId: PAPER.deed,
      fromParties: [{ name: 'K. Narayana', parentage: 'S/o Venkaiah', role: 'seller', relationship: '', shareNum: 0, shareDen: 0, isGpa: false }],
      toParties: [{ name: 'Telukutla Shankar Reddy', parentage: 'S/o T. Narayana Reddy', role: 'buyer', relationship: '', shareNum: 1, shareDen: 1, isGpa: false }],
      chainLength: 2, source: DEED,
    } : filed ? {
      mode: 'sale', modeLabel: 'Sale', registered: 'yes',
      docNo: '1576/1989', regDate: '1989-06-02', execDate: '', sro: 'Ongole',
      consideration: 0, govtValue: 0, stampDuty: 0, proofNo: '',
      transferId: 'w-transfer-filed', deedDocumentId: 'w-paper-new',
      fromParties: [{ name: 'P. Subbaiah', parentage: '', role: 'seller', relationship: '', shareNum: 0, shareDen: 0, isGpa: false }],
      toParties: [], chainLength: 1, source: FILED_DEED,
    } : null,
    summary: {
      paperCount: papers.length, newestPaper: String(papers[0]?.title ?? ''), newestPaperAt: papers.length ? '2026-08-02' : '',
      featureCount: rec.featureCount, featureAttention: 0,
      ownerCount: 1, hasPin: !!(rec.lat || rec.lon), hasOutline: ((rec.ring as number[]) ?? []).length >= 6,
      photoCount: rec.photoCount, mediaCount: rec.mediaCount, noteCount: rec.noteBody ? 1 : 0, newestNoteAt: String(rec.noteAt ?? ''),
      servicesOpen: rec.serviceCount, servicesDone: rich ? 1 : 0,
      paidTotal: rich ? 240_000 : 0, marketTotal: Number(rec.marketValue ?? 0),
      newestActivity: rich ? 'Extent corrected' : '', newestActivityAt: rich ? '2026-08-14' : '',
    },
  };
}

// The Compliance check (services/api/src/compliance.py), as the server would
// run it on these facts. Sy 214/2: the deed, chain, khata, survey and FMB pass;
// the deed and the owner disagree on the extent; the EC on file is old; the
// boundaries and the tax receipt are missing; mutation, LP and court cannot be
// told; the AP policy adds the Adangal and the restriction review.
const check = (key: string, label: string, status: string, detail: string, action = 'none', fieldKey = '', serviceKind = '') =>
  ({ key, label, status, detail, action, fieldKey, serviceKind });

function complianceOf(rich: boolean, filed: boolean, built: boolean, bare: Record<string, string>) {
  const checks = rich ? [
    check('deed', 'Registered title deed on file', 'pass', 'Deed 4412/1998 on file'),
    check('chain', 'Title chain recorded', 'pass', '2 deeds in the chain'),
    check('khata', 'Khata / passbook recorded', 'pass', 'Khata 1042'),
    check('mutation', 'Mutation in your name', 'unknown', 'Mutation status not recorded', 'add', 'mutation_status'),
    check('survey', 'Survey number and extent recorded', 'pass', '214/2 · 4.30 ac'),
    check('extent_match', 'Deed extent matches revenue extent', 'warn', 'Deed says 4.12 ac, passbook says 4.30 ac', 'add', 'extent'),
    check('lp', 'LP number / ULPIN', 'unknown', 'Only for resurveyed villages; not known whether yours is', 'add', 'lp_no'),
    check('boundaries', 'Boundaries recorded', 'fail', 'South, East, West not recorded', 'add', 'boundary_south'),
    check('ec', 'Encumbrance certificate on file', 'warn', 'Checked on 02/08/2024, more than 12 months ago', 'order', 'ec_date', 'ec'),
    check('court', 'No court case recorded', 'unknown', 'Not answered yet', 'add', 'litigation'),
    check('tax', 'Land tax receipt on file', 'fail', 'No tax receipt on file', 'upload'),
    check('policy.adangal', 'Current Adangal', 'unknown', 'Not checked from your documents yet: Check land classification, cultivation and survey particulars.', 'upload'),
    check('policy.fmb', 'FMB / cadastral map', 'pass', 'Map in Documents'),
    check('policy.restrictions', 'Restriction and dispute review', 'unknown', 'Check this yourself: Check assigned/grant conditions, prohibited-property lists, acquisition, court disputes, endowment or Wakf interests, and transfer eligibility.'),
  ] : [
    filed ? check('deed', 'Registered title deed on file', 'pass', 'Deed 1576/1989 on file')
      : check('deed', 'Registered title deed on file', 'fail', 'No deed on file', 'upload', 'doc_no'),
    filed ? check('chain', 'Title chain recorded', 'pass', 'Earlier owner: P. Subbaiah')
      : check('chain', 'Title chain recorded', 'fail', 'Who held it before you is not recorded', 'add', 'from_parties'),
    built ? check('khata', 'Khata / tax assessment recorded', 'fail', 'No khata or tax assessment number', 'add', 'khata_no')
      : bare.khata_no ? check('khata', 'Khata / passbook recorded', 'pass', `Khata ${bare.khata_no}`)
        : check('khata', 'Khata / passbook recorded', 'fail', 'No khata or passbook number', 'add', 'khata_no'),
    check('mutation', 'Mutation in your name', 'unknown', 'Mutation status not recorded', 'add', 'mutation_status'),
    check('survey', built ? 'Plot and extent recorded' : 'Survey number and extent recorded', 'fail',
      'Extent not recorded', 'add', 'extent'),
    ...(built ? [] : [
      check('extent_match', 'Deed extent matches revenue extent', 'unknown', 'Needs both the deed and the passbook read', 'upload', 'extent'),
      check('lp', 'LP number / ULPIN', 'unknown', 'Only for resurveyed villages; not known whether yours is', 'add', 'lp_no'),
    ]),
    check('boundaries', 'Boundaries recorded', 'fail', 'No side recorded', 'add', 'boundary_north'),
    check('ec', 'Encumbrance certificate on file', 'fail', 'No EC on file', 'order', 'ec_date', 'ec'),
    check('court', 'No court case recorded', 'unknown', 'Not answered yet', 'add', 'litigation'),
    check('tax', built ? 'Property tax receipt on file' : 'Land tax receipt on file', 'fail', 'No tax receipt on file', 'upload'),
  ];
  return {
    checkedAt: '2026-10-12T08:35:00+00:00',
    passed: checks.filter((c) => c.status === 'pass').length, total: checks.length, checks,
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

// The counts and the words are the ones `Query.web.features` would build from
// these four rows (web360.py `features`): the total and the repair count off
// the rows, one category per category a row is in, a walked date as an ISO
// day, and a condition key out of good / warn / bad / unknown — the API never
// sends the `ok` or the blank this seed used to spell them with. Aligned
// 28/09/2026 with the founder's tab-count decision (design.md § App
// vocabulary, "Property tabs"); it used to claim 14 features, 2 repairs and
// four categories over 4 rows, 0 of them broken.
const FEATURES: Record<string, unknown> = {
  total: 4, needsRepair: 0, walkedOn: '2026-08-12', walkedBy: 'Shankar Reddy',
  // Selected since 37ae2ca; the Add-a-feature panel draws its chips from it.
  types: FEATURE_TYPES,
  categories: [
    { key: 'water', label: 'Water', count: 2, active: false },
    { key: 'boundary', label: 'Boundary', count: 1, active: false },
    { key: 'crop', label: 'Crop', count: 1, active: false },
  ],
  features: [
    { id: FEATURE.well, label: 'Open well', spec: '30 ft · 6 in pipe', icon: 'well', category: 'water', condition: 'Working', conditionState: 'good', note: 'Rewired in 2024', lat: 15.7408, lon: 79.2697, pinLabel: 'W1', photoCount: 4, actions: ['photo', 'repair'] },
    { id: FEATURE.pump, label: 'Submersible pump', spec: '5 HP', icon: 'pump', category: 'water', condition: 'Needs repair', conditionState: 'warn', note: 'Starter burnt out', lat: 15.7407, lon: 79.2698, pinLabel: 'W2', photoCount: 1, actions: ['photo', 'repair'] },
    { id: FEATURE.fence, label: 'Barbed fence', spec: '420 m · 4 strand', icon: 'fence', category: 'boundary', condition: 'Not checked', conditionState: 'unknown', note: '', lat: 0, lon: 0, pinLabel: '', photoCount: 0, actions: ['photo'] },
    { id: FEATURE.trees, label: 'Mango trees', spec: '46 trees · 12 years', icon: 'trees', category: 'crop', condition: 'Working', conditionState: 'good', note: '', lat: 15.7405, lon: 79.2701, pinLabel: 'C1', photoCount: 6, actions: ['photo'] },
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
  title: 'Title deeds', revenue: 'Revenue records', map: 'Map', search: 'EC & tax receipts',
  identity: 'Identity', old: 'Old records', photos: 'Photos & video', unsorted: 'Not sorted yet',
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

/** The order the eight shelves are listed in (fixtures/ids.ts SHELVES). */
const SHELF_ORDER = ['title', 'revenue', 'map', 'search', 'identity', 'old', 'photos', 'unsorted'];

/** A shelf listing. The counts agree with the wall above, because a card that
 *  says 6 and a shelf that lists 2 is exactly the defect worth catching.
 *
 *  Every row carries what Documents' file list reads (Vault.tsx): `createdAt`
 *  (it sorts on it with localeCompare), `mimeType`, `sizeBytes`, `folderId`,
 *  `jointFmbId`, `aadhaarCard` and `linkedProperties` — empty, so
 *  linkedPropertiesFor falls back to recordId/recordTitle. Title deeds is made
 *  the newest shelf, so the deed every test reaches for is on page 1 of 25. */
function shelfPapers(shelf: string): Record<string, unknown>[] {
  const count = SHELF_COUNTS[shelf] ?? 0;
  const s = Math.max(0, SHELF_ORDER.indexOf(shelf));
  const seeded = (PAPERS[ID.parcel] as Record<string, unknown>[]).filter((p) => p.shelf === shelf);
  const made = Array.from({ length: Math.max(0, count - seeded.length) }, (_, i) => ({
    id: `w-paper-${shelf}-${i + 1}`,
    title: `${SHELF_LABEL[shelf] ?? shelf} ${i + 1}`,
    detail: 'Sy 214/2 · Katragunta',
    shelf, icon: shelf, tags: [], shared: false, pageCount: 2,
    fileRef: `file-${shelf}-${i + 1}`,
  }));
  return [...seeded, ...made].map((p, i) => ({
    mimeType: 'application/pdf', sizeBytes: 0, folderId: '', jointFmbId: '', aadhaarCard: false,
    linkedProperties: [],
    createdAt: `2026-09-${String(28 - s).padStart(2, '0')}T10:${String(59 - i).padStart(2, '0')}:00`,
    ...p,
    recordId: ID.parcel, recordTitle: 'Sy 214/2',
  }));
}

/** `shelf: 'all'` is the read Documents makes since it became a file list
 *  (Vault.tsx useVaultPapers('all')): every shelf's rows, 27 in all, the
 *  figure VAULT.total counts. */
const vaultPapers: Answer = (vars) => {
  const shelf = String(vars.shelf ?? '');
  return shelf === 'all' ? SHELF_ORDER.flatMap(shelfPapers) : shelfPapers(shelf);
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
      hits.push({ id: c.id, kind: 'record', title: c.title, subtitle: c.placeLine, route: `/properties/${c.id}` });
    }
  }
  for (const p of PAPERS[ID.parcel] as Record<string, unknown>[]) {
    if (String(p.title).toLowerCase().includes(q)) {
      hits.push({ id: p.id, kind: 'paper', title: p.title, subtitle: p.detail, route: `/papers/${p.id}` });
    }
  }
  for (const person of (PEOPLE.people as Record<string, unknown>[])) {
    if (String(person.name).toLowerCase().includes(q)) {
      hits.push({ id: person.id, kind: 'person', title: person.name, subtitle: String(person.role), route: `/properties/${ID.parcel}/people?section=staff&person=${person.id}` });
    }
  }
  return hits;
};

// ── W10-W12 · services, one service order, the wallet ──────────────────

/** Eight seeded orders, one per state the owner's page draws, so a spec
 *  asserting "this is only offered here" has a row for each instead of
 *  mutating one row eight times. Every field is the server's own shape
 *  (web360.py `ticket`, ticketing.py STATUS_*): `status` is one of the eight
 *  server statuses, `statusLabel` the OWNER's word (`owner_label`: sent reads
 *  "Placed", on_site "In progress"), `ref` is `ticket_ref`'s PT-xxxx, and `can`
 *  is `owner_can` — a subset of cancel · accept · send_back · message · nudge ·
 *  rate, never a desk move (service order spec §7).
 *
 *  `stage` keeps the list's four pips (Orders.tsx Rail); the order page never
 *  reads it. */
interface TicketShape {
  id: string; ref: string; status: string; statusLabel: string; statusState: string;
  stage: number; stageLabel: string; needsYou: boolean; closed: boolean;
  assignee: string; can: string[]; quietDays: number; quiet: boolean;
  funded: boolean; held: number; pendingReview: number; outcomeNote: string; acceptedAt: string;
}

const TICKET_SHAPES: TicketShape[] = [
  // Nothing held, payments off: the panel's one filled button is "Hold ₹1,200".
  { id: TICKET.placed, ref: 'PT-2101', status: 'placed', statusLabel: 'Placed', statusState: 'unknown', stage: 1, stageLabel: 'Placed', needsYou: false, closed: false, assignee: '', can: ['cancel', 'message'], quietDays: 0, quiet: false, funded: false, held: 0, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.assigned, ref: 'PT-2102', status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown', stage: 2, stageLabel: 'Assigned', needsYou: false, closed: false, assignee: 'Ravi Kumar', can: ['cancel', 'message'], quietDays: 1, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.onSite, ref: 'PT-2103', status: 'on_site', statusLabel: 'In progress', statusState: 'unknown', stage: 3, stageLabel: 'On site', needsYou: false, closed: false, assignee: 'K. Anitha', can: ['cancel', 'message'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  // Sent back: the owner returned the work and the provider is reworking it.
  { id: TICKET.delivered, ref: 'PT-2104', status: 'changes', statusLabel: 'Sent back', statusState: 'warn', stage: 3, stageLabel: 'On site', needsYou: false, closed: false, assignee: 'Ravi Kumar', can: ['cancel', 'message'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.needsYou, ref: 'PT-2105', status: 'submitted', statusLabel: 'Waiting on you', statusState: 'warn', stage: 4, stageLabel: 'Delivered', needsYou: true, closed: false, assignee: 'Ravi Kumar', can: ['accept', 'cancel', 'message', 'send_back'], quietDays: 0, quiet: false, funded: true, held: 6_500, pendingReview: 2, outcomeNote: '', acceptedAt: '' },
  // Nine days without a word from the provider: `owner_can` offers `nudge`.
  { id: TICKET.quiet, ref: 'PT-2106', status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown', stage: 2, stageLabel: 'Assigned', needsYou: false, closed: false, assignee: 'Srinivas', can: ['cancel', 'message', 'nudge'], quietDays: 9, quiet: true, funded: true, held: 1_200, pendingReview: 0, outcomeNote: '', acceptedAt: '' },
  { id: TICKET.closed, ref: 'PT-2098', status: 'accepted', statusLabel: 'Accepted', statusState: 'good', stage: 4, stageLabel: 'Delivered', needsYou: false, closed: true, assignee: 'Ravi Kumar', can: ['message'], quietDays: 0, quiet: false, funded: true, held: 0, pendingReview: 0, outcomeNote: '', acceptedAt: '2026-09-11' },
  { id: TICKET.cancelled, ref: 'PT-2099', status: 'cancelled', statusLabel: 'Cancelled', statusState: 'bad', stage: 1, stageLabel: 'Placed', needsYou: false, closed: true, assignee: '', can: [], quietDays: 0, quiet: false, funded: false, held: 0, pendingReview: 0, outcomeNote: 'Found the papers in my own files.', acceptedAt: '' },
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

/** The provider behind the name, on the two orders that have one
 *  (web360.py `_assigned_person`). `contact` is filled only when the server
 *  decided this owner may have it; K. Anitha withheld hers, so `contact` is ''
 *  and `contactWhy` is the sentence printed instead. */
const ASSIGNED_TO: Record<string, Record<string, unknown>> = {
  [TICKET.assigned]: {
    associateId: 'as-ravi', name: 'Ravi Kumar', firm: 'Ravi Surveys', initials: 'RK',
    discipline: 'surveyor', disciplineLabel: 'Licensed surveyor',
    contact: '9848012345', contactShown: true, contactWhy: '',
    assignedAt: '2026-09-05', via: 'the desk',
  },
  [TICKET.onSite]: {
    associateId: 'as-anita', name: 'K. Anitha', firm: '', initials: 'KA',
    discipline: 'advocate', disciplineLabel: 'Advocate',
    contact: '', contactShown: false,
    contactWhy: 'They asked that their number not be shared. Write to them below and Pattadar desk passes it on.',
    assignedAt: '2026-09-06', via: 'the desk',
  },
};

const ORDERS = TICKET_SHAPES.map((t) => ({
  id: t.id, kind: KIND_OF[t.id].kind, title: KIND_OF[t.id].title, detail: KIND_OF[t.id].detail,
  assignee: t.assignee, cost: KIND_OF[t.id].cost, stage: t.stage, stageLabel: t.stageLabel,
  needsYou: t.needsYou, dueDate: t.closed ? '' : '25/09/2026',
  recordId: ID.parcel, recordTitle: 'Sy 214/2', params: '{}',
  // Selected since 8ee7822 (w360/api.ts Order). Orders.tsx recordTypeLabel
  // calls replaceAll on them, so an absent value crashed the Services list.
  recordKind: 'parcel', recordClassification: 'agri', recordLocation: 'Katragunta, Markapur, Prakasam',
  status: t.status, statusLabel: t.statusLabel, statusState: t.statusState, ref: t.ref,
  held: t.held, pendingReview: t.pendingReview,
  // Who holds it, when that is a Pattadar provider (the order's `assignedTo`).
  assigneeRef: String(ASSIGNED_TO[t.id]?.associateId ?? ''),
  assignedResource: null,
}));

const orders: Answer = (vars) => {
  const recordId = vars.recordId as string | undefined;
  const includeClosed = vars.includeClosed === true;
  let rows = ORDERS;
  if (!includeClosed) rows = rows.filter((o) => !TICKET_SHAPES.find((t) => t.id === o.id)?.closed);
  if (recordId) rows = rows.filter((o) => o.recordId === recordId);
  return rows;
};

/** A trail line in the server's own words (ticketing.event_headline). */
const ev = (id: string, kind: string, action: string, headline: string, at: string,
            actorKind = 'owner', actorLabel = 'You', detail = '') => ({
  id, kind, action, headline, detail, actorLabel, actorKind, tone: '',
  at: `${at}T05:00:00Z`, atLabel: `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)}`,
  attachments: [] as Record<string, unknown>[],
});

/** The owner's trail for one seeded order: what `_owner_sees` lets through,
 *  with `detail` cut on every kind but message and refused. */
function ownerEvents(t: TicketShape): ReturnType<typeof ev>[] {
  const out = [ev('w-ev-place', 'status', 'place', 'You placed this order', '2026-09-04')];
  const who = t.assignee;
  const reached = ['assigned', 'on_site', 'submitted', 'changes', 'accepted'].includes(t.status);
  if (who && reached) out.push(ev('w-ev-assign', 'status', 'assign', `Pattadar desk assigned ${who}`, '2026-09-05', 'system', 'Pattadar desk'));
  if (['on_site', 'submitted', 'changes', 'accepted'].includes(t.status)) {
    out.push(ev('w-ev-start', 'status', 'start', `${who} started work`, '2026-09-06', 'worker', who));
  }
  if (['submitted', 'changes', 'accepted'].includes(t.status)) {
    out.push(ev('w-ev-dlv', 'deliverable', '', `${who} delivered “8 corners, walked”`, '2026-09-10', 'system', 'Pattadar desk'));
    out.push(ev('w-ev-deliver', 'status', 'deliver', `${who} delivered the work`, '2026-09-10', 'system', 'Pattadar desk'));
  }
  if (t.status === 'changes') out.push(ev('w-ev-back', 'status', 'send_back', 'You sent the work back', '2026-09-11'));
  if (t.status === 'accepted') {
    out.push(ev('w-ev-accept', 'status', 'accept', 'You accepted the work', '2026-09-11'));
    out.push(ev('w-ev-filed', 'filed', '', "“Surveyor report” was added to this property's Documents", '2026-09-11'));
  }
  if (t.status === 'cancelled') out.push(ev('w-ev-cancel', 'status', 'cancel', 'You cancelled this order', '2026-09-06'));
  return out;
}

const DELIVERABLES_OF = (t: TicketShape) => {
  if (!['submitted', 'changes', 'accepted'].includes(t.status)) return [];
  const accepted = t.status === 'accepted';
  return [
    { id: 'w-dlv-1', kind: 'boundary', label: '8 corners, walked', note: 'GPS, ±3 m', fileRef: '', fileName: '', mimeType: '', sizeBytes: 0, payload: JSON.stringify({ ring: RING }), submittedBy: 'Ravi Kumar', submittedAt: '10/09/2026', fileAs: 'boundary', fileTargets: [{ k: 'boundary', v: 'The outline on file' }], goesTo: 'The outline on file', review: accepted ? 'accepted' : t.status === 'changes' ? 'rejected' : 'pending', reviewNote: t.status === 'changes' ? 'Corner 6 is in the neighbour’s field' : '', filedTable: accepted ? 'parcels' : '', filedId: accepted ? ID.parcel : '', filedAt: accepted ? '11/09/2026' : '' },
    { id: 'w-dlv-2', kind: 'paper', label: 'Surveyor report', note: '3 pages', fileRef: 'file-survey-report', fileName: 'survey-report.pdf', mimeType: 'application/pdf', sizeBytes: 240_000, payload: '{}', submittedBy: 'Ravi Kumar', submittedAt: '10/09/2026', fileAs: 'map', fileTargets: [{ k: 'map', v: 'Map' }, { k: 'title', v: 'Title deeds' }], goesTo: 'Documents › Map', review: accepted ? 'accepted' : 'pending', reviewNote: '', filedTable: accepted ? 'documents' : '', filedId: accepted ? PAPER.map : '', filedAt: accepted ? '11/09/2026' : '' },
  ];
};

/** The ledger in ENTRY_LABEL's words: Held · Released · Pattadar fee · Refunded. */
function ledgerOf(t: TicketShape) {
  const cost = KIND_OF[t.id].cost;
  const row = (id: string, entry: string, label: string, amount: number, from: string, to: string, at: string, payee = '') => ({
    id, entry, label, amount, fromBucket: from, toBucket: to, payee, provider: 'stub', simulated: true,
    status: 'done', note: '', ticketId: t.id, ticketRef: t.ref, at,
  });
  if (t.status === 'cancelled') {
    return [row('w-led-hold', 'hold', 'Held', cost, 'wallet', 'held', '04/09/2026'),
      row('w-led-return', 'return', 'Refunded', cost, 'held', 'wallet', '06/09/2026')];
  }
  if (t.status === 'accepted') {
    return [row('w-led-hold', 'hold', 'Held', cost, 'wallet', 'held', '05/09/2026'),
      row('w-led-release', 'release', 'Released', cost * 0.9, 'held', 'payout', '11/09/2026', 'Ravi Kumar'),
      row('w-led-fee', 'fee', 'Pattadar fee', cost * 0.1, 'held', 'fee', '11/09/2026')];
  }
  return t.funded ? [row('w-led-hold', 'hold', 'Held', t.held, 'wallet', 'held', '05/09/2026')] : [];
}

function ticketOf(id: string): Record<string, unknown> | null {
  const t = TICKET_SHAPES.find((s) => s.id === id);
  if (!t) return null;
  const meta = KIND_OF[id];
  const accepted = t.status === 'accepted';
  return {
    id: t.id, ref: t.ref, kind: meta.kind, title: meta.title, detail: meta.detail,
    recordId: ID.parcel, recordTitle: 'Sy 214/2', recordPlace: 'Katragunta, Markapur, Prakasam',
    status: t.status, statusLabel: t.statusLabel, statusState: t.statusState,
    stage: t.stage, stageLabel: t.stageLabel, needsYou: t.needsYou, closed: t.closed,
    assignee: t.assignee, dueDate: t.closed ? '' : '25/09/2026',
    assignedTo: ASSIGNED_TO[t.id] ?? null, assignedResource: null,
    quietDays: t.quietDays, quiet: t.quiet,
    outcomeNote: t.outcomeNote, acceptedAt: t.acceptedAt, createdAt: '2026-09-04',
    overdueDays: 0, askedAt: '', files: [],
    can: t.can,
    answers: [
      { k: 'Which survey number', v: '214/2' },
      { k: 'How many corners', v: '8' },
    ],
    myRating: 0, myRatingNote: '',
    money: {
      quoted: meta.cost, held: t.held, released: accepted ? meta.cost * 0.9 : 0,
      fee: accepted ? meta.cost * 0.1 : 0, returned: t.status === 'cancelled' ? meta.cost : 0,
      payeeShare: 0.9, provider: 'stub', live: false, funded: t.held > 0,
      headline: t.held > 0 ? `₹${t.held.toLocaleString('en-IN')} held` : 'Nothing held yet',
      honesty: 'Payments are switched off on this build. Nothing has been charged.',
    },
    events: ownerEvents(t),
    deliverables: DELIVERABLES_OF(t),
    ledger: ledgerOf(t),
  };
}

/** The desk's moves per status: every `system` pair in ticketing.TRANSITIONS
 *  but cancel, plus `message` while the order is not cancelled
 *  (web360.py `desk_ticket`). */
const DESK_CAN: Record<string, string[]> = {
  placed: ['assign', 'dispatch', 'message'],
  sent: ['assign', 'dispatch', 'message', 'withdraw'],
  assigned: ['assign', 'deliver', 'dispatch', 'message', 'start', 'unassign'],
  on_site: ['deliver', 'dispatch', 'message', 'unassign'],
  submitted: ['dispatch', 'message'],
  changes: ['deliver', 'dispatch', 'message'],
  accepted: ['message'],
  cancelled: [],
};

/** A worker token as a dispatch body carries it: 43 URL-safe characters. */
const WORK_TOKEN = 'e2e-fixture-worker-token-xxxxxxxxxxxxxxxxxx';

/** One order as the desk reads it (`deskTicket`): the desk row, the desk's
 *  moves, the whole trail with dispatch and payment rows and every detail,
 *  what came back, and every dispatch. */
function deskTicketOf(id: string): Record<string, unknown> | null {
  const t = TICKET_SHAPES.find((s) => s.id === id);
  if (!t) return null;
  const meta = KIND_OF[id];
  const job = DESK_JOBS.find((j) => j.ticketId === id) ?? {
    ticketId: t.id, ref: t.ref, kind: meta.kind, serviceLabel: meta.title,
    place: 'Katragunta, Markapur', status: t.status, statusLabel: t.statusLabel, statusState: t.statusState,
    assignee: t.assignee, assigneeRef: String(ASSIGNED_TO[t.id]?.associateId ?? ''), assigneeContact: '',
    orderedAt: '2026-09-04', ageDays: 5, dueDate: t.closed ? '' : '25/09/2026', overdue: false,
    quiet: t.quiet, quietDays: t.quietDays, quoted: meta.cost, held: t.held, dispatchState: '',
    dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0, lastResponse: '',
    candidateCount: 2, stuck: false, askedAt: '',
  };
  const sent = !!t.assignee;
  const events = [...ownerEvents(t).map((e) => (e.action === 'place'
    ? { ...e, detail: 'Ordered from Sy 214/2' } : e))];
  if (t.funded) events.splice(1, 0, ev('w-ev-pay', 'payment', '', `₹${meta.cost.toLocaleString('en-IN')} held`, '2026-09-05'));
  if (sent) events.splice(1, 0, ev('w-ev-dsp', 'dispatch', '', `Sent to ${t.assignee} on SMS — recorded, not sent (stub)`, '2026-09-05', 'system', 'Pattadar desk', 'A job on Sy 214/2'));
  return {
    job,
    can: DESK_CAN[String(job.status)] ?? [],
    events,
    deliverables: DELIVERABLES_OF(t),
    dispatches: sent
      ? [{ id: 'w-dsp-1', purpose: 'invite', channel: 'sms', contactMasked: '••••••2345', personName: t.assignee, subject: 'A job on Sy 214/2', body: `Sy 214/2 at Katragunta needs 8 corners walked. ₹6,500, wanted by 25/09/2026.\nOpen http://localhost:5173/work/${WORK_TOKEN} to accept.`, provider: 'stub', live: false, status: 'sent', statusWord: 'Sent', error: '', expiresOn: '19/09/2026', daysLeft: 6, revoked: false, revokeReason: '', sentAt: '05/09/2026' }]
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
  // ENTRY_LABEL's words and `_ddmmyyyy` dates, as web360.py `wallet` sends them.
  rows: [
    { id: 'w-wled-1', entry: 'top_up', label: 'Added', amount: 45_000, fromBucket: 'outside', toBucket: 'wallet', payee: '', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: '', ticketRef: '', at: '30/08/2026' },
    { id: 'w-wled-2', entry: 'hold', label: 'Held', amount: 6_500, fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: TICKET.assigned, ticketRef: 'PT-2102', at: '05/09/2026' },
    { id: 'w-wled-3', entry: 'release', label: 'Released', amount: 6_500, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', provider: 'stub', simulated: true, status: 'done', note: '', ticketId: TICKET.closed, ticketRef: 'PT-2098', at: '14/08/2026' },
  ],
};

/** The catalogue, exactly as the API's `servicesOffered` answers it with no
 *  published revision: generated from services/api/src/catalogue.py by
 *  `catalogue-dump.py`, never typed by hand.
 *
 *  A hand copy drifted twice — first into four invented services, then to six
 *  of the twelve — and every assertion about grouping, prices and what an
 *  order delivers was testing a catalogue the product does not sell. A
 *  fixture is allowed to choose the DATA; it is not allowed to invent the
 *  SHAPE, and the catalogue is not fixture data. */
const OFFERS = CATALOGUE.offers;

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

/** The order page's second step: each chosen record with the catalogue its
 *  place offers. Every seeded record is in one place with no published
 *  revision, so each gets the whole baseline; a test about a record priced or
 *  limited elsewhere sets its own answer. */
const servicesForRecords: Answer = (vars, query, world) => (
  (vars.recordIds as string[] ?? []).map((recordId) => ({
    recordId, offers: (servicesOffered as AnswerFn)({}, query, world),
  }))
);

const CORRECTIONS = [
  { id: 'w-corr-1', field: 'Khata number', was: '1041', now: '1042', at: '2026-08-20', by: 'Shankar Reddy', note: 'Corrected from the adangal' },
  { id: 'w-corr-2', field: 'Owner name', was: 'T S Reddy', now: 'Telukutla Shankar Reddy', at: '2026-07-02', by: 'Shankar Reddy', note: '' },
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

/** The server's `disciplines`, generated with the catalogue (catalogue-dump.py). */
const DISCIPLINES = CATALOGUE.disciplines;

const area = (level: string, name: string) =>
  ({ id: `ar-${level}-${name}`.toLowerCase(), level, name, label: `${name} ${level}` });

/** Fields the server sends on every associate as plain strings or numbers,
 *  never null (web360.py `_associate_out`). Nobody seeded here has given an
 *  address, been rated or started training. */
const ASSOCIATE_DEFAULTS = {
  addressLine: '', villageLocality: '', postOffice: '', mandalCity: '', district: '',
  stateName: '', postalCode: '', addressLabel: '', addressComplete: false,
  lastCompletedAt: '', ratingAverage: 0, ratingCount: 0, trainingState: '', trainingNote: '',
};

const ASSOCIATES = [
  {
    ...ASSOCIATE_DEFAULTS,
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
    ...ASSOCIATE_DEFAULTS,
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
    ...ASSOCIATE_DEFAULTS,
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

const DESK_JOBS = [
  {
    ticketId: TICKET.placed, ref: 'PT-2101', kind: 'ec', serviceLabel: 'Encumbrance certificate',
    place: 'Katragunta, Markapur', status: 'placed', statusLabel: 'Placed', statusState: 'unknown',
    assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-09-09',
    ageDays: 4, dueDate: '2026-09-20', overdue: false, quiet: false, quietDays: 0,
    quoted: 1180, held: 0, dispatchState: '', dispatchRound: 0, nextRoundAt: '',
    offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 2, stuck: false, askedAt: '',
  },
  {
    ticketId: TICKET.assigned, ref: 'PT-2102', kind: 'survey', serviceLabel: 'Boundary re-survey',
    place: 'Katragunta, Markapur', status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown',
    assignee: 'G. Srinivas', assigneeRef: 'as-ravi', assigneeContact: '9848012345',
    orderedAt: '2026-08-30', ageDays: 14, dueDate: '2026-09-25', overdue: false,
    quiet: true, quietDays: 9, quoted: 2900, held: 2900, dispatchState: '',
    dispatchRound: 0, nextRoundAt: '', offersOut: 0, offersDeclined: 0,
    lastResponse: '', candidateCount: 2, stuck: false, askedAt: '',
  },
  {
    ticketId: TICKET.onSite, ref: 'PT-2103', kind: 'title_opinion', serviceLabel: 'Title opinion',
    place: 'Kukatpally, Hyderabad', status: 'placed', statusLabel: 'Placed', statusState: 'unknown',
    assignee: '', assigneeRef: '', assigneeContact: '', orderedAt: '2026-08-25',
    ageDays: 19, dueDate: '2026-09-30', overdue: false, quiet: false, quietDays: 0,
    quoted: 4500, held: 0, dispatchState: '', dispatchRound: 0, nextRoundAt: '',
    offersOut: 0, offersDeclined: 0, lastResponse: '', candidateCount: 0, stuck: true, askedAt: '',
  },
];

const DESK = {
  mode: 'off', modeWord: 'Off — the desk sends everything by hand',
  jobs: DESK_JOBS, silent: DESK_JOBS.filter((j) => j.quiet),
  unassigned: 2, ageing: 1, silentCount: 1, stuck: 1,
  associatesActive: 2, associatesPending: 0, credentialsExpiring: 1,
  coverageGaps: 1, tasksOpen: 0,
};

/** Where a coverage cell sits, keyed the way web360.py `_coverage_scope_key`
 *  builds it: level|state|district|mandal, each folded to lower case. */
const MANDAL_SCOPE = {
  Markapur: { scopeKey: 'mandal|andhra pradesh|prakasam|markapur', stateKey: 'andhra pradesh', stateName: 'Andhra Pradesh', districtKey: 'prakasam', districtName: 'Prakasam', mandalKey: 'markapur', mandalName: 'Markapur' },
  Hyderabad: { scopeKey: 'mandal|telangana|hyderabad|hyderabad', stateKey: 'telangana', stateName: 'Telangana', districtKey: 'hyderabad', districtName: 'Hyderabad', mandalKey: 'hyderabad', mandalName: 'Hyderabad' },
} as const;

const COVERAGE = [
  { ...MANDAL_SCOPE.Markapur, level: 'mandal', name: 'Markapur', discipline: 'surveyor', disciplineLabel: 'Licensed surveyor', activeCount: 1, openJobs: 1, records: 3, risk: '' },
  { ...MANDAL_SCOPE.Markapur, level: 'mandal', name: 'Markapur', discipline: 'writer', disciplineLabel: 'Document writer', activeCount: 0, openJobs: 1, records: 3, risk: 'gap' },
  { ...MANDAL_SCOPE.Markapur, level: 'mandal', name: 'Markapur', discipline: 'photo_studio', disciplineLabel: 'Photo & drone studio', activeCount: 0, openJobs: 0, records: 3, risk: 'empty' },
  { ...MANDAL_SCOPE.Hyderabad, level: 'mandal', name: 'Hyderabad', discipline: 'surveyor', disciplineLabel: 'Licensed surveyor', activeCount: 0, openJobs: 0, records: 1, risk: 'empty' },
  { ...MANDAL_SCOPE.Hyderabad, level: 'mandal', name: 'Hyderabad', discipline: 'advocate', disciplineLabel: 'Advocate', activeCount: 1, openJobs: 1, records: 1, risk: '' },
  { ...MANDAL_SCOPE.Hyderabad, level: 'mandal', name: 'Hyderabad', discipline: 'writer', disciplineLabel: 'Document writer', activeCount: 0, openJobs: 0, records: 1, risk: 'empty' },
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
  recordOverview: (vars, _q, world) => overviewOf(String(vars.id ?? ''), world),
  features: (vars) => (String(vars.id) === ID.parcel ? FEATURES : { ...FEATURES, total: 0, needsRepair: 0, features: [], categories: [], walkedOn: '', walkedBy: '' }),
  people: (vars) => (String(vars.id) === ID.parcel ? PEOPLE : { ...PEOPLE, count: 0, people: [], payments: [], monthlyOut: 0, seasonalIn: 0 }),
  boundary: (vars) => boundaryOf(String(vars.id ?? '')),
  // Area rainfall (RainfallCard) asks on every property's map; null draws no
  // card. A test about the card sets its own answer.
  rainfall: null,
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
  // Documents' own folders. None by default, so every screen that opens
  // /papers draws the top level exactly as before folders existed.
  vaultFolders: [],
  // Documents asks for combined views so its filter can find a file through
  // the view its property belongs to. None by default.
  combinedProperties: [],
  // A holding's Documents tab (Holding.tsx, `combinedPapers`). Nothing filed
  // by default; the holding specs set their own.
  combinedPapers: [],
  orders,
  ticket: (vars) => ticketOf(String(vars.id ?? '')),
  // The desk's read of one order (DeskJob.tsx); null for a non-admin.
  deskTicket: (vars) => deskTicketOf(String(vars.id ?? '')),
  wallet: WALLET,
  servicesOffered,
  servicesForRecords,
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
  // One member's jobs and training certificates (DeskAssociate.tsx). None by
  // default; the server answers an empty list, never null.
  associateJobs: () => [],
  associateTrainingCertificates: () => [],
  coverage: () => COVERAGE,
  deskTasks: () => [],
  disciplines: () => DISCIPLINES,
  candidates: () => CANDIDATES,
  // Published owner guidance (w360/GovernanceGuidance.tsx). Null is what the
  // API answers when nothing is published for the scope (web360.py
  // governance_policy), so the guidance card stays off the screens written
  // before governance existed. A test about guidance sets its own policy.
  governancePolicy: null,
  // Current owner chain (RecordHead.tsx useOwners, RecordPapers.tsx useOwners).
  owners: { owners: [{ id: 'w-owner-1', name: 'Shankar Reddy', initials: 'SR', parentage: 'T. Narayana Reddy', address: 'Katragunta, Markapur, Prakasam', role: 'Pattadar', isCurrent: true, acquiredVia: 'hereditary', photoRef: '' }], count: 1, currentName: 'Shankar Reddy' },
  // Chain of title (useTransfers). None recorded is the common case.
  transfers: { transfers: [], count: 0, unverifiedCount: 0 },
  // A property's Activity tab (Orders.tsx RecordHistory, `recordHistory`).
  // Sy 214/2 carries its two corrections as the server words them; every
  // other record has not been changed since it was added. (The app stopped
  // asking for the old `corrections` field, so that answer is retired.)
  recordHistory: (vars) => (String(vars.id) === ID.parcel
    ? CORRECTIONS.map((c) => ({
        id: c.id, action: 'record.corrected', detail: '', field: c.field,
        was: c.was, now: c.now, at: `${c.at}T06:00:00Z`, by: c.by, source: '',
      }))
    : []),
  // Read through the ROOT schema rather than `web` — w360/api.ts useNotes, on
  // every record head — so it is keyed with world.ts's ROOT prefix. Without it
  // the world answered 400 and every record screen failed the console guard.
  'root.notes': [],
  // A record made from a read deed keeps the reading as its first note
  // (PropertyActions.tsx, root `addNote`). Same ROOT prefix as `notes`.
  'root.addNote': { id: 'w-note-new' },
  // A note is edited in place on its card (RecordNotes.tsx, root `updateNote`).
  'root.updateNote': { id: 'w-note-1' },
  // Home reads the account's setup tasks (w360/SetupChecklist.tsx) through the
  // root schema on every visit. None by default, so the checklist stays away.
  'root.setupTasks': [],
  // Home's Recent activity (data/hooks.ts useAuditTrail, Dashboard.tsx) and
  // /audit read the cross-client audit trail through the root schema.
  // Empty by default; a test about activity seeds its own AuditEventV2 rows.
  'root.auditTrail': [],
  // The other root-schema reads drawn screens make, each answered with what
  // the server sends for an account that has nothing there yet:
  // Families & groups, Invitations, Invite & earn, Profile and Tools.
  'root.groups': [],
  'root.invitations': [],
  'root.myReferral': {
    code: 'SHANKAR123', path: '/r/SHANKAR123', joined: 0, qualified: 0, creditsEarned: 0,
    monthlyCap: 10, referredBy: '', rewards: [],
  },
  'root.me': {
    id: 'owner', name: 'Shankar Reddy', email: '', address: '', language: 'en',
    districtsOfInterest: '', notificationPrefs: 'email', kycRefMasked: '', mfaEnabled: false,
    lastActiveAt: '2026-08-01T09:30:00',
  },
  'root.districts': [],
  'root.sroOffices': [],
  'root.feeSchedule': [],
  'root.marketValues': [],
  // An invitation link (/verify/:token, /i/:token — InvitePage via
  // growthData.ts). A live beneficiary invite from the owner; a test about an
  // expired or unknown link overrides it.
  'root.invitePreview': () => ({
    state: 'live', purpose: 'beneficiary', inviter: 'Shankar Reddy', expiresOn: '31/10/2026',
    steps: ['Confirm your mobile number', 'Check the property you were named on'],
    forGuardian: false, canVerifyWithoutAccount: true,
  }),

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
  updatePaperDetails: true,
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
  holderChange: holderChangeOver(CARDS),
  // Which holdings a delete would empty (web360 `deleteImpact`). No default
  // card is in a holding, so no delete empties one.
  deleteImpact: [],
  // Combine on Properties (HoldingActions.tsx CombineDialog) answers the new
  // holding's id.
  createCombinedProperty: 'w-hold-new',
  // A record made from a read deed also files the deed's parties and its
  // transfer (PropertyActions.tsx); each write answers the new row's id.
  addOwner: 'w-owner-new',
  addTransfer: 'w-transfer-new',
  setTransferParty: 'w-party-new',
  setRecordHolder: holderChangeOver(CARDS),
  saveRecord: 'w-record-new',
  // The Overview's writes (RecordOverview.tsx) each answer the fresh overview.
  setRecordFields: (vars, _q, world) => overviewOf(String(vars.recordId ?? ''), world),
  setAcquisition: (vars, _q, world) => overviewOf(String(vars.recordId ?? ''), world),
  chooseFieldClaim: (vars, _q, world) => overviewOf(String(vars.recordId ?? ''), world),
  fileDeedReading: (vars, _q, world) => overviewOf(String(vars.recordId ?? ''), world),
  convertRecordKind: (vars, _q, world) => overviewOf(String(vars.recordId ?? ''), world),
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
  inviteAssociate: 'as-new',
  updateAssociate: true,
  setAssociateDisciplines: true,
  setAssociateAreas: true,
  setAssociateState: true,
  deleteUnclaimedAssociate: true,
  deskAssign: true,
  deskUnassign: true,
  setPlatformAdmin: true,
  closeDeskTask: true,
  createShareLink: 'w-link-new',
  createDocumentShareLink: '/share/w-doclink-new',
  orderService: 1,
  fundTicket: 'w-led-hold-new',
  postTicketMessage: true,
  nudgeTicket: true,
  rateAssociate: true,
  deskDispatchTicket: 'w-dsp-new',
  deskRevokeDispatch: true,
  deskStartTicket: true,
  deskAddDeliverable: 'w-dlv-new',
  deskPostTicketMessage: true,
  reviewDeliverable: true,
  // web360.py accept_ticket: 0 while any item is undecided or when nothing
  // was kept, else how many it filed.
  acceptTicket: async (vars: Record<string, unknown>, _query: string, world: World) => {
    const t = await world.current('ticket', { id: vars.ticketId }) as
      { deliverables?: { review: string; filedId: string }[] } | null | undefined;
    const items = t?.deliverables ?? [];
    if (items.some((d) => d.review === 'pending')) return 0;
    return items.filter((d) => d.review === 'accepted' && !d.filedId).length;
  },
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
  // Native audio/video first mints an exact-file HttpOnly stream session; the
  // sealed world does not model cookies, but it returns the pinned same-origin
  // URL so player/poster behavior remains inside the API seal.
  world.route(/\/api\/gateway\/storage\/files\/[^/]+\/stream-session/, (route) => {
    const url = new URL(route.request().url());
    const node = url.pathname.split('/').at(-2) || 'file';
    return { json: { url: `/api/gateway/storage/files/${node}/content?version=version-1`, expiresIn: 900 } };
  });

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
  // One order's payment state. With payments off the real server
  // (payments.py `_view`) answers 200 and `not_started` for a GET — it does
  // not refuse — and refuses only the writes (checkout, verify).
  world.route(/\/api\/gateway\/pattadar\/payments\/tickets\//, (route) => {
    if (route.request().method() !== 'GET') {
      return { status: 409, json: { error: 'Payments are switched off on this build.' } };
    }
    const id = new URL(route.request().url()).pathname.split('/').filter(Boolean).at(-1) ?? '';
    const meta = KIND_OF[id];
    return { json: {
      status: 'not_started', title: meta?.title ?? 'Service', amount: (meta?.cost ?? 0) * 100,
      currency: 'INR', mode: 'off', enabled: false, operations: [],
    } };
  });

  // Sign-out revokes the media stream sessions (AuthProvider
  // revokeMediaStreams). The gateway answers 204.
  world.route(/\/api\/gateway\/storage\/stream-sessions$/, () => ({ status: 204 }));

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

  // The inbox behind the bell (w360/inbox.ts): empty, nothing running, and
  // browser push switched off — the Shell asks on every screen. A test about
  // notifications seeds its own.
  world.route(/\/api\/gateway\/pattadar\/inbox\/read/, () => ({ json: { marked: 0 } }));
  world.route(/\/api\/gateway\/pattadar\/inbox(\?|$)/, () => ({
    json: { unread: 0, running: 0, items: [] },
  }));
  world.route(/\/api\/gateway\/pattadar\/push\/key/, () => ({ json: { enabled: false, key: '' } }));

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
