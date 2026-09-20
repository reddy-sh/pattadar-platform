/**
 * Typed reads for the record-360 screens (W01–W16).
 *
 * Every query goes through `Query.web` (services/api/src/web360.py) so this
 * surface can grow without touching the iOS-facing schema. Queries are written
 * out in full rather than composed from fragments: each screen asks for exactly
 * the fields it draws, which keeps the payloads honest and makes it obvious in
 * review which screen is responsible for which field.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiFetch, gql } from '../api/client';
import { useToast } from './Toast';

// ── Shapes ─────────────────────────────────────────────────────────────

export interface Tile { key: string; label: string; value: string; unit: string; note: string; tone: string }
export interface WaitingItem {
  id: string; title: string; detail: string; icon: string;
  actionLabel: string; actionKind: string; recordId: string;
}
export interface ValueBar { label: string; value: number; share: number }
export interface RecordCard {
  id: string; kind: string; title: string;
  /** The khata a parcel sits under; '' for built property, which has none.
   *  A parcel's group is a property of this passbook, not of the parcel. */
  passbookId: string;
  /** The family / firm / trust holding it, or '' for your own name. */
  groupId: string;
  subtitle: string; classification: string;
  status: string; stake: string; khataNo: string; ownerName: string; village: string;
  mandal: string; district: string; placeLine: string; extent: number; extentUnit: string;
  extentAlt: string; marketValue: number; tags: string[];
  /** What the card can draw of itself — see RecordCard in web360.py. */
  lat: number; lon: number; ring: number[]; coverFileRef: string;
}
export interface Portfolio {
  displayName: string;
  farmExtent: number; farmCount: number; plotExtent: number; plotCount: number;
  builtExtent: number; builtFlats: number; builtShops: number; invested: number;
  worthNow: number; gain: number; loans: number; managedCount: number; watchedCount: number;
  waitingCount: number; runningCosts: number; paperCount: number; backupVerifiedOn: string;
  /** Whether this account may open /app/desk, and its associate row if it has
   *  one. Both ride on the portfolio rather than on a query of their own:
   *  Shell.tsx mounts exactly two queries — usePortfolio and useOrders — and
   *  anything added there is paid for on every screen in the app, forever, to
   *  decide whether one rail entry is drawn. Two scalars on a read the Shell
   *  already makes is the whole cost. `associateId` is '' for everyone until
   *  associates get accounts (phase 5); the rail reads it, nothing else does. */
  isPlatformAdmin: boolean; isSuperAdmin: boolean; associateId: string;
  tiles: Tile[]; waiting: WaitingItem[]; valueBars: ValueBar[]; recent: RecordCard[];
}
export interface FacetOption { key: string; label: string; count: number; active: boolean }
export interface FacetGroup { key: string; label: string; options: FacetOption[] }
export interface PropertyList {
  shown: number; total: number; hidden: number; filterSummary: string;
  hiddenPlaces: string[]; activeCount: number; cards: RecordCard[]; facets: FacetGroup[];
}
export interface RecordDetail {
  id: string; kind: string; title: string; eyebrow: string; classification: string;
  status: string; stake: string; khataNo: string; ownerName: string;
  village: string; mandal: string; district: string; placeLine: string;
  placeLineTe: string; state: string; extent: number; extentUnit: string; extentDetail: string;
  marketValue: number; perUnitValue: number; perUnitLabel: string; boughtYear: string;
  lat: number; lon: number; ring: number[]; mapCaption: string;
  paperCount: number; featureCount: number;
  peopleCount: number; serviceCount: number; photoCount: number; photoNote: string;
  tags: string[]; noteBody: string; noteAuthor: string; noteAt: string;
}
export interface Paper {
  id: string; title: string; detail: string; shelf: string; icon: string;
  tags: string[]; shared: boolean; pageCount: number; fileRef: string;
}
/** A note filed against a record. Append-only on the server — there is no
 *  update or delete resolver for `notes` — which is the whole point of it:
 *  what an owner wrote down about a visit is not editable after the fact, and
 *  filing one writes an audit line saying so. */
export interface RecordNote {
  id: string; body: string; createdAt: string;
}
export interface Feature {
  id: string; label: string; spec: string; icon: string; category: string;
  condition: string; conditionState: string; note: string; lat: number; lon: number;
  pinLabel: string; photoCount: number; actions: string[];
  typeKey: string; schemaVersion: number; attributes: string; geometry: string; version: number;
  costTotal: number; costCount: number; receiptCount: number;
}
export interface FeatureFieldDefinition {
  key: string; label: string; kind: 'text' | 'number' | 'date' | 'select' | 'boolean';
  unit: string; placeholder: string; options: string[]; required: boolean;
  dependsOn: string; dependsValue: string;
}
export interface FeatureTypeDefinition {
  key: string; label: string; category: string; icon: string; geometryKind: string;
  schemaVersion: number; fields: FeatureFieldDefinition[];
}
export interface FeatureList {
  features: Feature[]; total: number; needsRepair: number;
  walkedOn: string; walkedBy: string; categories: FacetOption[]; types: FeatureTypeDefinition[];
}
export interface Person {
  id: string; name: string; initials: string; role: string; badges: string[];
  summary: string; arrangement: string; payLabel: string; payValue: string;
  dueLabel: string; dueValue: string; visibility: string; actions: string[]; compact: boolean;
}
export interface Payment {
  id: string; title: string; subtitle: string; occurredOn: string;
  method: string; amount: number; direction: string; state: string;
}
export interface PeopleView {
  people: Person[]; payments: Payment[]; count: number; monthlyOut: number;
  seasonalIn: number; walletBalance: number; walletNote: string; walletLive: boolean;
}
export interface BoundaryMark {
  id: string; seq: number; label: string; state: string; detail: string;
  lat: number; lon: number; photoCount: number; notedOn: string;
}
/** `shape` — the 0..1 sketch rectangle — is deliberately NOT requested. It was
 *  seed filler that every unsurveyed record drew as though it were its outline;
 *  W04 is on a real basemap now and has no use for it. */
export interface BoundaryView {
  recordId: string; title: string; lat: number; lon: number; setBy: string;
  accuracy: string; extentLabel: string; caption: string;
  /** The surveyed corners on real ground: flat [lat,lon,…] in the order the
   *  sheet walks them. `shape` is the 0..1 sketch and means nothing off-screen;
   *  this is what a map can draw. Empty when the record has never been
   *  surveyed — which the screen must say rather than paper over. */
  ring: number[];
  sheetTitle: string; sheetDetail: string; sheetId: string; marks: BoundaryMark[];
}
export interface Photo {
  id: string; caption: string; category: string; fileName: string; fileRef: string;
  mediaKind: string;
  capturedAt: string; localTime: string; capturedBy: string; lat: number; lon: number;
  accuracyM: number; orderRef: string; source: string; sha256: string; verified: boolean;
  deviceClockOk: boolean; pinDistanceM: number; width: number; height: number;
  featureId: string; tags: string[]; isCover: boolean;
}
export interface PhotoList {
  photos: Photo[]; total: number; videoCount: number; visitCount: number;
  latestVisit: string; latestVisitCount: number; verifiedCount: number;
  unprovenCount: number; subject: string;
}
export interface PurchaseLot {
  id: string; boughtOn: string; extent: number; extentUnit: string; rate: number;
  paid: number; govtValue: number; seller: string; deedNo: string; sro: string;
}
export interface MoneyView {
  recordId: string; title: string; eyebrow: string; paidTotal: number; paidPerUnit: number;
  extrasTotal: number; govtTotal: number; govtPerUnit: number; govtRevised: string;
  marketTotal: number;
  /** Null, not 0, when nothing is on file as paid. A gain measured against an
   *  unknown cost is not a number — the resolver used to report the whole
   *  market value as profit at +0%. */
  marketGain: number | null; marketGainPct: number | null;
  extent: number;
  extentUnit: string; lots: PurchaseLot[]; blendedRate: number; blendedPaid: number;
  blendedGovt: number; extras: { id: string; label: string; amount: number }[];
  rates: { label: string; value: number; unit: string }[];
  series: { year: string; market: number; government: number; paid: number }[];
  appreciationPct: number; isBuilt: boolean; landArea: number; landRate: number;
  landValue: number; buildArea: number; buildRate: number; buildValue: number;
  depreciation: number; depreciationYears: number;
}
export interface Expense {
  id: string; title: string; subtitle: string; onLabel: string; onIcon: string;
  kind: string; paidBy: string; amount: number; spentOn: string; category: string;
  recoverable: boolean; recoverableNote: string; hasReceipt: boolean;
  vendor: string; invoiceNo: string; warrantyUntil: string; receiptFileRef: string;
  receiptFileName: string; receiptMimeType: string; receiptSizeBytes: number;
}
export interface ExpenseView {
  recordId: string; title: string; eyebrow: string; isBuilt: boolean; year: string;
  years: string[]; spent: number; capital: number; running: number; owedBack: number;
  income: number; netYield: number; perUnitRunning: number; extent: number;
  extentUnit: string; categories: FacetOption[]; rows: Expense[]; featureOptions: FacetOption[];
}
export interface ShareLink {
  id: string; audience: string; subject: string; terms: string; docCount: number;
  openedCount: number; lastOpenedAt: string; expiresOn: string; daysLeft: number; initials: string;
}
export interface VaultView {
  total: number; regionNote: string;
  shelves: { key: string; label: string; note: string; count: number }[];
  links: ShareLink[];
}
export interface DocumentView {
  id: string; title: string; subtitle: string; shelf: string; recordId: string;
  recordTitle: string; pageCount: number; sizeLabel: string; registeredOn: string;
  fileRef: string; mimeType: string;
  office: string; buyer: string; seller: string; consideration: number;
  readerSummary: string; readerFlag: string; readerFlagPage: number; tags: string[];
  shared: boolean;
  versions: { id: string; version: number; label: string; madeOn: string; madeBy: string; note: string }[];
  link: ShareLink | null;
}
export interface SharedKit {
  id: string; title: string; headline: string; kind: string; purpose: string;
  listLine: string; senderName: string; senderInitials: string; senderNote: string;
  sharedAt: string; terms: string; openedCount: number; daysLeft: number;
  expiredOn: string; askedPrice: number; photoCount: number; featureCount: number;
  state: string;
  items: { id: string; title: string; shelf: string; note: string; verdict: string }[];
  checks: { id: string; title: string; note: string; price: number }[];
  checksTotal: number;
}
export interface MapRecord {
  id: string; kind: string; title: string; subtitle: string; status: string;
  classification: string; marketValue: number; extent: number; extentUnit: string;
  khataNo: string; ownerName: string; village: string; lat: number; lon: number;
  shape: number[]; ring: number[]; featureChips: string[]; watcher: string; watcherPay: string;
  paperCount: number; photoCount: number;
}
export interface SearchHit {
  id: string; kind: string; title: string; subtitle: string; route: string;
}

/** Portable governance document envelope. `document` stays JSON because the
 * server stores and versions the same unit that will move to the planned
 * document database; the UI validates the small shape it consumes. */
export interface GovernancePolicy {
  id: string; scopeKey: string; countryCode: string; stateCode: string;
  districtCode: string; revision: number; status: string; schemaVersion: number;
  document: string; sourceDigest: string; createdBy: string; createdAt: string;
  publishedBy: string; publishedAt: string;
}
export interface GovernancePolicyEvent {
  id: string; policyId: string; scopeKey: string; revision: number;
  actor: string; action: string; detail: string; sourceDigest: string; createdAt: string;
}

export interface GovernanceItem {
  key: string; title: string; why: string; level: string; share: string; sourceIds: string[];
}
export interface GovernancePropertyType {
  key: string; label: string; matches: string[]; items: GovernanceItem[];
}
export interface GovernanceGuide { key: string; label: string; items: string[] }
export interface GovernanceServiceGuide {
  key: string; label: string; purpose: string; share: string[]; doNotShare: string[];
  controls: string[]; sourceIds: string[];
}
export interface GovernanceWorkforceRule {
  key: string; category: string; title: string; rule: string; enforcement: string;
}
export interface GovernanceDocument {
  schemaVersion: number;
  jurisdiction: {
    countryCode: string; countryName: string; stateCode: string; stateName: string;
    districtCode: string; districtName: string; authorityName: string;
    localTerms: Record<string, string>;
  };
  policy: { name: string; effectiveOn: string; reviewBy: string; legalNotice: string };
  propertyTypes: GovernancePropertyType[];
  guides: GovernanceGuide[];
  serviceRequests: GovernanceServiceGuide[];
  secureSharing: {
    label: string; shareWhenNeeded: string[]; neverByDefault: string[];
    controls: string[]; sourceIds: string[];
  };
  workforceCompliance?: GovernanceWorkforceRule[];
  sources: {
    id: string; authority: string; title: string; url: string; appliesTo: string[];
  }[];
}
export interface MapView {
  areaLabel: string; records: MapRecord[]; counts: FacetOption[];
  insights: { id: string; title: string; detail: string }[];
}
export interface Order {
  id: string; kind: string; serviceKey: string; title: string; detail: string; assignee: string;
  cost: number; stage: number; stageLabel: string; needsYou: boolean;
  dueDate: string; recordId: string; recordTitle: string; params: string;
  /** The eight-valued truth behind the four-valued `stage`. `stageLabel` still
   *  says Placed / Assigned / On site / Delivered; `statusLabel` is allowed to
   *  say "Sent out" or "Waiting on you", which is what the row is actually
   *  about. Both are sent because the Rail draws one and the pill the other. */
  status: string; statusLabel: string; statusState: string; ref: string;
  /** The associate behind `assignee`, or '' when that name was typed by hand.
   *  A free-text reassignment clears it on the server, so a row can never
   *  carry a stale identity — and therefore a stale phone number — under a
   *  name somebody has since changed. */
  assigneeRef: string;
  /** What is set aside on this job, and how many things that came back nobody
   *  has looked at yet — both aggregates, so a list of forty orders is still
   *  three queries and not eighty. */
  held: number; pendingReview: number;
  /** Related jobs placed together. Empty on older and single-service orders. */
  batchId: string; batchRef: string;
  /** Record context for filtering the cross-record Services list. */
  recordKind: string; recordClassification: string; recordLocation: string;
}

/** A label/value the server has already decided how to word. `k`/`v` rather
 *  than `key`/`value` because `key` is React's, and a list of these is exactly
 *  what gets mapped. */
export interface Pair { k: string; v: string }

/** One line of a ticket's trail. `headline` is composed at write time, so a
 *  2027 rewording cannot re-word a 2026 event. */
export interface TicketEvent {
  id: string; kind: string; action: string; headline: string; detail: string;
  actorLabel: string; actorKind: string; tone: string; at: string; atLabel: string;
}

/** Something that came back on a ticket and is not yet a paper, a photo, a
 *  boundary or a feature. It becomes one when the owner accepts it — `goesTo`
 *  is the server saying, in words, where it would land. */
export interface TicketDeliverable {
  id: string; kind: string; label: string; note: string; fileRef: string;
  fileName: string; mimeType: string; sizeBytes: number; payload: string;
  submittedBy: string; submittedAt: string; fileAs: string;
  fileTargets: Pair[]; goesTo: string; review: string; reviewNote: string;
  filedTable: string; filedId: string; filedAt: string;
}

/** One time this ticket left the building. The contact comes back masked and
 *  the token never comes back at all: the client has no business holding
 *  either, and a screenshot of this screen must not be usable. */
export interface TicketDispatch {
  id: string; purpose: string; channel: string; contactMasked: string;
  personName: string; subject: string; body: string; provider: string;
  live: boolean; status: string; statusWord: string; error: string;
  expiresOn: string; daysLeft: number; revoked: boolean; revokeReason: string;
  sentAt: string;
}

/** One movement between two named buckets. `simulated` is the row saying the
 *  rupees in it were never real — the screen reads that rather than a flag
 *  somebody has to remember to flip. */
export interface TicketLedgerRow {
  id: string; entry: string; label: string; amount: number; fromBucket: string;
  toBucket: string; payee: string; provider: string; simulated: boolean;
  status: string; note: string; ticketId: string; ticketRef: string; at: string;
}

/** `headline` and `honesty` are written by the server, not composed here: the
 *  sentence under a figure has to stay true when the payments provider stops
 *  being a stub, and one place deciding that is one place to change. */
export interface TicketMoney {
  quoted: number; held: number; released: number; fee: number; returned: number;
  payeeShare: number; provider: string; live: boolean; funded: boolean;
  headline: string; honesty: string;
}

/** The person who is actually on this job, when that person is an associate
 *  Pattadar knows rather than a name the owner typed.
 *
 *  Null on a ticket nobody is on AND on a ticket held by a hand-typed name —
 *  the "Who is on it" card has three branches and the server decides which one
 *  by whether it sends this at all. `contact` is the real number, and it
 *  arrives filled in only when every condition in the spec holds at once: the
 *  ticket is live or lately accepted, the caller owns it, the assignee is a
 *  real associate, and that associate agreed at enrolment that an owner may
 *  see their number. Otherwise `contact` is '' and `contactShown` is false,
 *  with `contactWhy` giving the sentence to print instead. The client never
 *  reconstructs a number from anywhere else on the page: there is nowhere else
 *  on the page it is allowed to come from. */
export interface AssignedPerson {
  associateId: string; name: string; firm: string; initials: string;
  discipline: string; disciplineLabel: string;
  contact: string; contactShown: boolean; contactWhy: string;
  jobsOpen: number; assignedAt: string; via: string;
}

/** Everything the ticket page draws, in one read. `can` is the server's list
 *  of legal moves, so a screen can never offer a button the API will refuse. */
export interface TicketView {
  id: string; ref: string; kind: string; title: string; detail: string;
  recordId: string; recordTitle: string; recordPlace: string;
  status: string; statusLabel: string; statusState: string;
  stage: number; stageLabel: string; needsYou: boolean; closed: boolean;
  assignee: string; dueDate: string; quietDays: number; quiet: boolean;
  outcomeNote: string; acceptedAt: string; createdAt: string;
  can: string[]; answers: Pair[]; money: TicketMoney;
  /** Who is on it, and where the job stands with the desk. `dispatchState` is
   *  a word — nobody yet, on somebody, asked and waiting — and is deliberately
   *  not another status: `status`/`stage` are untouched by any of this. */
  assignedTo: AssignedPerson | null; dispatchState: string;
  myRating: number; myRatingNote: string;
  events: TicketEvent[]; deliverables: TicketDeliverable[];
  dispatches: TicketDispatch[]; ledger: TicketLedgerRow[];
}

export interface WalletJob {
  ticketId: string; ref: string; title: string; recordTitle: string;
  statusLabel: string; held: number;
}

/** The four figures the Wallet leads with are each labelled on the page, and
 *  deliberately do not have to agree with the People rail's balance: that one
 *  is what is in the wallet, this one names what is set aside on top of it. */
export interface WalletView {
  available: number; setAside: number; paidOut: number; putIn: number;
  autoTopUp: boolean; provider: string; live: boolean; notice: string;
  jobs: WalletJob[]; rows: TicketLedgerRow[];
}

/** One question a service asks before it can be worked on. */
export interface ServiceField {
  name: string; label: string; kind: string;
  required: boolean; options: string[]; help: string;
}
export interface ServiceOffer {
  key: string; label: string; price: number; group: string;
  blurb: string; days: number; shelves: string[]; fields: ServiceField[];
}

export interface ServiceBatchReceipt {
  batchId: string; ref: string; orderCount: number; total: number;
}

// ── Query documents ────────────────────────────────────────────────────

const CARD = `id kind title passbookId groupId subtitle classification status stake khataNo ownerName
  village mandal district placeLine extent extentUnit extentAlt marketValue tags
  lat lon ring coverFileRef`;

const Q_PORTFOLIO = `{ web { portfolio {
  displayName
  farmExtent farmCount plotExtent plotCount builtExtent builtFlats builtShops
  invested worthNow gain loans managedCount watchedCount waitingCount runningCosts
  paperCount backupVerifiedOn isPlatformAdmin isSuperAdmin associateId
  tiles { key label value unit note tone }
  waiting { id title detail icon actionLabel actionKind recordId }
  valueBars { label value share }
  recent { ${CARD} }
} } }`;

const Q_PROPERTIES = `query P($kinds:[String!],$statuses:[String!],$stakes:[String!],$derived:[String!],$tags:[String!],$groups:[String!]) {
  web { properties(kinds:$kinds,statuses:$statuses,stakes:$stakes,derived:$derived,tags:$tags,groups:$groups) {
    shown total hidden filterSummary hiddenPlaces activeCount
    cards { ${CARD} }
    facets { key label options { key label count active } }
  } } }`;

const Q_RECORD = `query R($id:String!) { web { record(id:$id) {
  id kind title eyebrow classification status stake khataNo ownerName
  village mandal district placeLine
  placeLineTe state extent extentUnit extentDetail marketValue perUnitValue perUnitLabel
  boughtYear lat lon ring mapCaption paperCount featureCount peopleCount serviceCount
  photoCount photoNote tags noteBody noteAuthor noteAt
} } }`;

const Q_PAPERS = `query D($id:String!) { web { papers(recordId:$id) {
  id title detail shelf icon tags shared pageCount fileRef } } }`;

const Q_FEATURES = `query F($id:String!) { web { features(recordId:$id) {
  total needsRepair walkedOn walkedBy
  categories { key label count active }
  features { id label spec icon category condition conditionState note lat lon
             pinLabel photoCount actions typeKey schemaVersion attributes geometry version
             costTotal costCount receiptCount }
  types { key label category icon geometryKind schemaVersion
          fields { key label kind unit placeholder options required dependsOn dependsValue } }
} } }`;

const Q_PEOPLE = `query PE($id:String!) { web { people(recordId:$id) {
  count monthlyOut seasonalIn walletBalance walletNote walletLive
  people { id name initials role badges summary arrangement payLabel payValue
           dueLabel dueValue visibility actions compact }
  payments { id title subtitle occurredOn method amount direction state }
} } }`;

const Q_BOUNDARY = `query B($id:String!) { web { boundary(recordId:$id) {
  recordId title lat lon setBy accuracy extentLabel ring caption sheetTitle sheetDetail sheetId
  marks { id seq label state detail lat lon photoCount notedOn }
} } }`;

const Q_PHOTOS = `query PH($id:String!,$featureId:String) { web { photos(recordId:$id,featureId:$featureId) {
  total videoCount visitCount latestVisit latestVisitCount verifiedCount unprovenCount subject
  photos { id caption category fileName fileRef mediaKind capturedAt localTime capturedBy lat lon
           accuracyM orderRef source sha256 verified deviceClockOk pinDistanceM width height
           featureId tags isCover }
} } }`;

const Q_MONEY = `query M($id:String!,$appreciation:Float) { web { money(recordId:$id,appreciation:$appreciation) {
  recordId title eyebrow paidTotal paidPerUnit extrasTotal govtTotal govtPerUnit govtRevised
  marketTotal marketGain marketGainPct extent extentUnit blendedRate blendedPaid blendedGovt
  appreciationPct isBuilt landArea landRate landValue buildArea buildRate buildValue
  depreciation depreciationYears
  lots { id boughtOn extent extentUnit rate paid govtValue seller deedNo sro }
  extras { id label amount }
  rates { label value unit }
  series { year market government paid }
} } }`;

const Q_EXPENSES = `query E($id:String!,$year:String) { web { expenses(recordId:$id,year:$year) {
  recordId title eyebrow isBuilt year years spent capital running owedBack income
  netYield perUnitRunning extent extentUnit
  categories { key label count active }
  featureOptions { key label }
  rows { id title subtitle onLabel onIcon kind paidBy amount spentOn category
         recoverable recoverableNote hasReceipt vendor invoiceNo warrantyUntil
         receiptFileRef receiptFileName receiptMimeType receiptSizeBytes }
} } }`;

const Q_VAULT = `{ web { vault {
  total regionNote
  shelves { key label note count }
  links { id audience subject terms docCount openedCount lastOpenedAt expiresOn daysLeft initials }
} } }`;

const Q_DOCUMENT = `query DOC($id:String!) { web { document(id:$id) {
  id title subtitle shelf recordId recordTitle pageCount sizeLabel registeredOn office
  fileRef mimeType
  buyer seller consideration readerSummary readerFlag readerFlagPage tags shared
  versions { id version label madeOn madeBy note }
  link { id audience subject terms docCount openedCount lastOpenedAt expiresOn daysLeft initials }
} } }`;

const KIT = `id title headline kind purpose listLine senderName senderInitials senderNote
  sharedAt terms openedCount daysLeft expiredOn askedPrice photoCount featureCount state
  checksTotal
  items { id title shelf note verdict }
  checks { id title note price }`;

const Q_KITS = `{ web { sharedKits { ${KIT} } } }`;
const Q_KIT = `query K($id:String!) { web { sharedKit(id:$id) { ${KIT} } } }`;

const Q_MAP = `{ web { mapRecords {
  areaLabel
  counts { key label count active }
  insights { id title detail }
  records { id kind title subtitle status classification marketValue extent extentUnit
            khataNo ownerName village lat lon shape ring featureChips watcher watcherPay
            paperCount photoCount }
} } }`;

// ── Hooks ──────────────────────────────────────────────────────────────

type Wrapped<K extends string, T> = { web: Record<K, T> };
const KEY = 'w360';

/** The whole of Home, and the rail's badge counts with it — so the Shell asks
 *  for it on every authenticated route, on screens that draw none of it.
 *
 *  The staleTime is what stops that: at the 30s global default a tab focused
 *  after lunch, or a route change a minute later, re-ran the aggregate. A
 *  write still refreshes it immediately — an invalidation refetches an active
 *  query however fresh it is — so this only governs how old an UNTOUCHED
 *  answer may be before the page asks again. */
const BADGE_STALE = 5 * 60 * 1000;

export function usePortfolio() {
  return useQuery({
    queryKey: [KEY, 'portfolio'],
    staleTime: BADGE_STALE,
    queryFn: async () => (await gql<Wrapped<'portfolio', Portfolio>>(Q_PORTFOLIO)).web.portfolio,
  });
}

const GOVERNANCE_FIELDS = `id scopeKey countryCode stateCode districtCode revision status
  schemaVersion document sourceDigest createdBy createdAt publishedBy publishedAt`;

export function parseGovernanceDocument(policy: GovernancePolicy | null | undefined): GovernanceDocument | null {
  if (!policy?.document) return null;
  try {
    const value = JSON.parse(policy.document) as GovernanceDocument;
    return value?.schemaVersion === 1 && Array.isArray(value.propertyTypes) ? value : null;
  } catch {
    return null;
  }
}

/** Published guidance is owner-visible. Draft and provenance access uses the
 * separate admin query below and is denied by the server, not by this hook. */
export function useGovernancePolicy(
  countryCode = 'IN', stateCode = 'AP', districtCode = '*', enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'governance', countryCode, stateCode, districtCode],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => (await gql<Wrapped<'governancePolicy', GovernancePolicy | null>>(
      `query GP($countryCode:String!,$stateCode:String!,$districtCode:String!) {
        web { governancePolicy(countryCode:$countryCode,stateCode:$stateCode,districtCode:$districtCode) {
          ${GOVERNANCE_FIELDS}
        } }
      }`, { countryCode, stateCode, districtCode },
    )).web.governancePolicy,
  });
}

export function useGovernanceAdminPolicy(
  countryCode = 'IN', stateCode = '*', districtCode = '*', enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'governanceAdmin', countryCode, stateCode, districtCode],
    queryFn: async () => (await gql<Wrapped<'governanceAdminPolicy', GovernancePolicy | null>>(
      `query GAP($countryCode:String!,$stateCode:String!,$districtCode:String!) {
        web { governanceAdminPolicy(countryCode:$countryCode,stateCode:$stateCode,districtCode:$districtCode) {
          ${GOVERNANCE_FIELDS}
        } }
      }`, { countryCode, stateCode, districtCode },
    )).web.governanceAdminPolicy,
  });
}

export function useGovernanceAdminPolicies(countryCode = 'IN', enabled = true) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'governanceAdminPolicies', countryCode],
    queryFn: async () => (await gql<Wrapped<'governanceAdminPolicies', GovernancePolicy[]>>(
      `query GAPS($countryCode:String!) { web { governanceAdminPolicies(countryCode:$countryCode) {
        ${GOVERNANCE_FIELDS}
      } } }`, { countryCode },
    )).web.governanceAdminPolicies,
  });
}

export function useGovernancePolicyHistory(scopeKey: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!scopeKey,
    queryKey: [KEY, 'governancePolicyHistory', scopeKey],
    queryFn: async () => (await gql<Wrapped<'governancePolicyHistory', GovernancePolicyEvent[]>>(
      `query GPH($scopeKey:String!) { web { governancePolicyHistory(scopeKey:$scopeKey) {
        id policyId scopeKey revision actor action detail sourceDigest createdAt
      } } }`, { scopeKey },
    )).web.governancePolicyHistory,
  });
}

export interface PropertyFilter {
  kinds: string[]; statuses: string[]; stakes: string[]; derived: string[]; tags: string[];
  /** Family / group ids, plus `'personal'` for holdings in your own name.
   *  This is what Families & Groups deep-links into: one filter on the real
   *  Properties screen rather than a second list screen of its own. */
  groups: string[];
}

/** The facet key for "in your own name" — mirrors PERSONAL in web360.py. */
export const PERSONAL_GROUP = 'personal';
export const EMPTY_FILTER: PropertyFilter = {
  kinds: [], statuses: [], stakes: [], derived: [], tags: [], groups: [],
};

export function useProperties(filter: PropertyFilter) {
  return useQuery({
    queryKey: [KEY, 'properties', filter],
    // Hold the last good answer while a new one is fetched. Without it every
    // change of filter, year or rate unmounted the whole screen into a
    // skeleton — the rail vanished from under the pointer mid-click, and the
    // page visibly rebuilt itself to show one number changing. Two screens had
    // reimplemented this locally with a ref; it belongs on the query.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'properties', PropertyList>>(Q_PROPERTIES, { ...filter })).web.properties,
  });
}

export function useRecord(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'record', id],
    queryFn: async () => (await gql<Wrapped<'record', RecordDetail | null>>(Q_RECORD, { id })).web.record,
  });
}

export function usePapers(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'papers', id],
    queryFn: async () => (await gql<Wrapped<'papers', Paper[]>>(Q_PAPERS, { id })).web.papers,
  });
}

/** The entity type a record's notes are filed under.
 *
 *  Not the record's `kind`. The notes table is shared with passbooks and
 *  documents and keys on (entity_type, entity_id); records — parcels and built
 *  properties alike — have always been written as 'record' (see the seeder and
 *  `record`'s own note lookup), so reading them as 'parcel' would return an
 *  empty list on every record in the system. */
export const NOTE_ENTITY = 'record';

/** `notes` and `addNote` are root fields, not `web` ones: they predate the
 *  w360 schema and are shared with the legacy screens, so there is nothing to
 *  unwrap here. Newest first, which the server does with its own ORDER BY. */
const Q_NOTES = `query N($t:String!,$i:String!) {
  notes(entityType:$t,entityId:$i) { id body createdAt } }`;

export function useNotes(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'notes', id],
    queryFn: async () =>
      (await gql<{ notes: RecordNote[] }>(Q_NOTES, { t: NOTE_ENTITY, i: id })).notes,
  });
}

export const useAddNote = (reportError = true) =>
  useW360Mutation<{ entityId: string; body: string }, { addNote: { id: string } }>(
    `mutation AN($entityId:String!,$body:String!) {
       addNote(entityType:"${NOTE_ENTITY}",entityId:$entityId,body:$body) { id } }`,
    'That note',
    reportError,
  );

export function useFeatures(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'features', id],
    queryFn: async () => (await gql<Wrapped<'features', FeatureList>>(Q_FEATURES, { id })).web.features,
  });
}

export function usePeople(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'people', id],
    queryFn: async () => (await gql<Wrapped<'people', PeopleView>>(Q_PEOPLE, { id })).web.people,
  });
}

export function useBoundary(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'boundary', id],
    queryFn: async () =>
      (await gql<Wrapped<'boundary', BoundaryView | null>>(Q_BOUNDARY, { id })).web.boundary,
  });
}

export function usePhotos(id: string | undefined, featureId?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'photos', id, featureId ?? ''],
    queryFn: async () =>
      (await gql<Wrapped<'photos', PhotoList>>(Q_PHOTOS, { id, featureId: featureId ?? null })).web.photos,
  });
}

export function useMoney(id: string | undefined, appreciation?: number) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'money', id, appreciation ?? 10],
    // Hold the last good answer while a new one is fetched. Without it every
    // change of filter, year or rate unmounted the whole screen into a
    // skeleton — the rail vanished from under the pointer mid-click, and the
    // page visibly rebuilt itself to show one number changing. Two screens had
    // reimplemented this locally with a ref; it belongs on the query.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'money', MoneyView | null>>(Q_MONEY, { id, appreciation: appreciation ?? null })).web.money,
  });
}

export function useExpenses(id: string | undefined, year?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'expenses', id, year ?? ''],
    // Hold the last good answer while a new one is fetched. Without it every
    // change of filter, year or rate unmounted the whole screen into a
    // skeleton — the rail vanished from under the pointer mid-click, and the
    // page visibly rebuilt itself to show one number changing. Two screens had
    // reimplemented this locally with a ref; it belongs on the query.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'expenses', ExpenseView | null>>(Q_EXPENSES, { id, year: year ?? null })).web.expenses,
  });
}

export function useVault() {
  return useQuery({
    queryKey: [KEY, 'vault'],
    queryFn: async () => (await gql<Wrapped<'vault', VaultView>>(Q_VAULT)).web.vault,
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'document', id],
    queryFn: async () =>
      (await gql<Wrapped<'document', DocumentView | null>>(Q_DOCUMENT, { id })).web.document,
  });
}

export function useSharedKits() {
  return useQuery({
    queryKey: [KEY, 'kits'],
    queryFn: async () => (await gql<Wrapped<'sharedKits', SharedKit[]>>(Q_KITS)).web.sharedKits,
    // Recover an already-open page after a local API restart instead of
    // preserving the first network failure until the owner clicks retry.
    //
    // It backs off: three seconds catches the restart it was written for, and
    // doubling to a minute stops a page left open on a failing backend from
    // asking the same question every three seconds for the rest of the day —
    // the shape that keeps a struggling server from coming back.
    refetchInterval: (query) => query.state.status === 'error'
      ? Math.min(3_000 * 2 ** Math.min(query.state.errorUpdateCount - 1, 5), 60_000)
      : false,
  });
}

export function useSharedKit(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'kit', id],
    queryFn: async () =>
      (await gql<Wrapped<'sharedKit', SharedKit | null>>(Q_KIT, { id })).web.sharedKit,
  });
}

const Q_SEARCH = `query S($q:String!) { web { search(q:$q) {
  id kind title subtitle route
} } }`;

/** The jump box. Enabled from two characters; results are cheap ILIKEs, so a
 *  short staleTime keeps typing snappy without hammering the API. */
const Q_VAULT_PAPERS = `query VP($shelf:String!) { web { vaultPapers(shelf:$shelf) {
  id title detail shelf icon tags shared pageCount fileRef
} } }`;

/** Every paper on one shelf, across every record. The shelf cards on W13 have
 *  linked here since they were drawn; until `vaultPapers` existed they linked
 *  to the wall they were already on. */
export function useVaultPapers(shelf: string | undefined) {
  return useQuery({
    enabled: !!shelf,
    queryKey: [KEY, 'vaultPapers', shelf],
    queryFn: async () =>
      (await gql<Wrapped<'vaultPapers', Paper[]>>(Q_VAULT_PAPERS, { shelf })).web.vaultPapers,
  });
}

export function useSearch(q: string) {
  return useQuery({
    enabled: q.trim().length >= 2,
    queryKey: [KEY, 'search', q.trim()],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'search', SearchHit[]>>(Q_SEARCH, { q: q.trim() })).web.search,
    staleTime: 30_000,
  });
}

/** Scalars only, and it stays that way: the Shell fires this on every
 *  authenticated route for its badge, so a money object or an events list here
 *  would be paid for on screens that draw neither. */
const Q_ORDERS = `query O($recordId:String,$includeClosed:Boolean) { web {
  orders(recordId:$recordId,includeClosed:$includeClosed) {
  id kind serviceKey title detail assignee cost stage stageLabel needsYou dueDate recordId recordTitle params
  status statusLabel statusState ref assigneeRef held pendingReview batchId batchRef
  recordKind recordClassification recordLocation
} } }`;

/** The whole ticket in one round trip. It is a lot of fields, but they are all
 *  drawn on the one page, and splitting them would mean the trail, the money
 *  and the deliverables could disagree about which moment they describe. */
const Q_TICKET = `query TKT($id:String!) { web { ticket(id:$id) {
  id ref kind title detail recordId recordTitle recordPlace
  status statusLabel statusState stage stageLabel needsYou closed
  assignee dueDate quietDays quiet outcomeNote acceptedAt createdAt
  can answers { k v }
  dispatchState
  myRating myRatingNote
  assignedTo { associateId name firm initials discipline disciplineLabel
               contact contactShown contactWhy jobsOpen assignedAt via }
  money { quoted held released fee returned payeeShare provider live funded headline honesty }
  events { id kind action headline detail actorLabel actorKind tone at atLabel }
  deliverables { id kind label note fileRef fileName mimeType sizeBytes payload
                 submittedBy submittedAt fileAs fileTargets { k v } goesTo
                 review reviewNote filedTable filedId filedAt }
  dispatches { id purpose channel contactMasked personName subject body provider live
               status statusWord error expiresOn daysLeft revoked revokeReason sentAt }
  ledger { id entry label amount fromBucket toBucket payee provider simulated status note ticketId ticketRef at }
} } }`;

const Q_WALLET = `query WAL($limit:Int) { web { wallet(limit:$limit) {
  available setAside paidOut putIn autoTopUp provider live notice
  jobs { ticketId ref title recordTitle statusLabel held }
  rows { id entry label amount fromBucket toBucket payee provider simulated status note ticketId ticketRef at }
} } }`;

const Q_SERVICES = `query SO($q:String,$key:String) { web { servicesOffered(q:$q,key:$key) {
  key label price group blurb days shelves fields { name label kind required options help }
} } }`;

/** No `enabled`: the Shell asks for this on every route to count what is
 *  waiting on you. `includeClosed` defaults false so every caller that was
 *  written before tickets existed asks for, and gets, exactly what it did. */
export function useOrders(recordId?: string, includeClosed = false, alwaysFresh = false) {
  return useQuery({
    queryKey: [KEY, 'orders', recordId ?? '', includeClosed],
    staleTime: alwaysFresh ? 0 : BADGE_STALE,
    refetchOnMount: alwaysFresh ? 'always' : true,
    queryFn: async () =>
      (await gql<Wrapped<'orders', Order[]>>(Q_ORDERS, {
        recordId: recordId ?? null,
        includeClosed,
      })).web.orders,
  });
}

/** One ticket, everything on it. Null when the id is not this account's —
 *  indistinguishable from not-found on purpose, so a stranger's ticket id
 *  cannot be probed for existence. */
export function useTicket(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'ticket', id],
    queryFn: async () =>
      (await gql<Wrapped<'ticket', TicketView | null>>(Q_TICKET, { id })).web.ticket,
  });
}

/** The wallet's own arithmetic. It is asked for as a whole rather than derived
 *  from the ledger rows here, because a balance computed in two places
 *  disagrees exactly once and then forever. */
export function useWallet() {
  return useQuery({
    queryKey: [KEY, 'wallet'],
    queryFn: async () => (await gql<Wrapped<'wallet', WalletView>>(Q_WALLET, { limit: 60 })).web.wallet,
  });
}

/** `enabled` because Properties draws this only in its map view, and that is
 *  not the view it lands in. Fetching every record's geometry on a visit that
 *  never opens a map is a request nobody asked for. */
export function useMapRecords(enabled = true) {
  return useQuery({
    queryKey: [KEY, 'map'],
    queryFn: async () => (await gql<Wrapped<'mapRecords', MapView>>(Q_MAP)).web.mapRecords,
    enabled,
  });
}

// ── Writes ─────────────────────────────────────────────────────────────

/** Invalidate the whole w360 tree — these screens cross-reference each other
 *  (a tag shows on the card, the rail count and the 360 header), so a
 *  surgical invalidation would leave one of the three stale.
 *
 *  Every write in this module goes through here, and until now this had an
 *  `onSuccess` and no `onError`. A refused mutation — an expired session, a
 *  validation the server rejected, a dropped connection — therefore resolved
 *  into silence: callers that awaited it closed their drawer anyway, callers
 *  that did not never learned. Roughly a dozen separate "fails silently"
 *  defects across this module were all this one missing callback.
 *
 *  The toast is raised HERE rather than in each caller so no future write can
 *  forget it. A caller that wants a more specific message still passes its own
 *  `onError` to `mutate`, and react-query runs both — this one first.
 *
 *  `what` names the thing in the owner's words: "That expense could not be
 *  saved", not "saveExpense failed".
 *
 *  `invalidate` is the one way out, and it exists for a BATCH: filing ten
 *  photos ran ten whole-tree invalidations, each one refetching the portfolio,
 *  the orders and the record while the remaining uploads were still going. A
 *  batch takes the refresh off its own writes and calls `useRefreshW360` once,
 *  at the end — it does not skip it. */
function useW360Mutation<V, R = unknown>(
  doc: string, what: string, reportError = true, invalidate = true,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: V) => gql<R>(doc, vars as Record<string, unknown>),
    onSuccess: invalidate ? () => qc.invalidateQueries({ queryKey: [KEY] }) : undefined,
    onError: reportError
      ? (e) => toast.bad(`${what} could not be saved. Nothing has changed.`, e)
      : undefined,
  });
}

/** The refresh a batch owes, once its last write has landed. */
export function useRefreshW360() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: [KEY] }); };
}

export const useSetTag = () =>
  useW360Mutation<{ entityType: string; entityId: string; tag: string; on: boolean }>(
    `mutation T($entityType:String!,$entityId:String!,$tag:String!,$on:Boolean!) {
       web { setTag(entityType:$entityType,entityId:$entityId,tag:$tag,on:$on) } }`,
    'That tag',
  );

export const useSaveExpense = (what = 'That expense') =>
  useW360Mutation<{
    recordId: string; title: string; amount: number; spentOn: string; kind: string;
    category: string; paidBy: string; onLabel: string; featureId: string; recoverable: boolean;
    fiscalYear: string;
  }>(
    `mutation SE($recordId:String!,$title:String!,$amount:Float!,$spentOn:String!,$kind:String!,
                 $category:String!,$paidBy:String!,$onLabel:String!,$featureId:String!,
                 $recoverable:Boolean!,$fiscalYear:String!) {
       web { saveExpense(recordId:$recordId,title:$title,amount:$amount,spentOn:$spentOn,
                         kind:$kind,category:$category,paidBy:$paidBy,onLabel:$onLabel,
                         featureId:$featureId,recoverable:$recoverable,fiscalYear:$fiscalYear) } }`,
    what,
  );

/** Record one registration the land was bought in — the write the Money
 *  hanger's "How you bought it" card was missing. `paid` is the only figure it
 *  needs; the rest is optional. The rate is derived server-side from
 *  paid / extent, so it is not sent. */
export const useSavePurchase = () =>
  useW360Mutation<{
    recordId: string; boughtOn: string; paid: number; extent: number;
    extentUnit: string; govtValue: number; seller: string; deedNo: string; sro: string;
  }, Wrapped<'savePurchase', string>>(
    `mutation SPu($recordId:String!,$boughtOn:String!,$paid:Float!,$extent:Float!,
                  $extentUnit:String!,$govtValue:Float!,$seller:String!,$deedNo:String!,$sro:String!) {
       web { savePurchase(recordId:$recordId,boughtOn:$boughtOn,paid:$paid,extent:$extent,
                          extentUnit:$extentUnit,govtValue:$govtValue,seller:$seller,
                          deedNo:$deedNo,sro:$sro) } }`,
    'That purchase',
  );

export const useDeletePurchase = () =>
  useW360Mutation<{ lotId: string }, Wrapped<'deletePurchase', boolean>>(
    `mutation DPu($lotId:String!) { web { deletePurchase(lotId:$lotId) } }`,
    'Removing that purchase',
    false,
  );

export const useUpdateCaption = () =>
  useW360Mutation<{ photoId: string; caption: string }>(
    `mutation UC($photoId:String!,$caption:String!) {
       web { updateCaption(photoId:$photoId,caption:$caption) } }`,
    'That caption',
  );

/** Files a photo whose bytes are already in storage. The upload itself is a
 *  separate multipart POST (see uploadToDrive) — GraphQL carries only the
 *  node id that comes back from it. Resolves to '' when the record is not
 *  the caller's or the ref is empty. */
/** `invalidate: false` is for the batch filer, which refreshes once at the end
 *  of the pick rather than after every file in it. */
export const useAddPhoto = (invalidate = true) =>
  useW360Mutation<{
    recordId: string; fileRef: string; fileName: string; caption: string;
    category: string; mediaKind: string; width: number; height: number;
    sha256: string; capturedAt: string;
  }, Wrapped<'addPhoto', string>>(
    `mutation AP($recordId:String!,$fileRef:String!,$fileName:String!,$caption:String!,
                 $category:String!,$mediaKind:String!,$width:Int!,$height:Int!,
                 $sha256:String!,$capturedAt:String!) {
       web { addPhoto(recordId:$recordId,fileRef:$fileRef,fileName:$fileName,caption:$caption,
                      category:$category,mediaKind:$mediaKind,width:$width,height:$height,
                      sha256:$sha256,capturedAt:$capturedAt) } }`,
    'That photo',
    true,
    invalidate,
  );

export const useAddPerson = () =>
  useW360Mutation<{
    recordId: string; personName: string; role: string; summary: string;
    arrangement: string; payLabel: string; payValue: string;
  }, Wrapped<'addPerson', string>>(
    `mutation APe($recordId:String!,$personName:String!,$role:String!,$summary:String!,
                  $arrangement:String!,$payLabel:String!,$payValue:String!) {
       web { addPerson(recordId:$recordId,personName:$personName,role:$role,summary:$summary,
                       arrangement:$arrangement,payLabel:$payLabel,payValue:$payValue) } }`,
    'That person',
    false,
  );

export const useUpdatePerson = () =>
  useW360Mutation<{ personId: string; personName: string; role: string; summary: string }, Wrapped<'updatePerson', boolean>>(
    `mutation UPe($personId:String!,$personName:String!,$role:String!,$summary:String!) {
       web { updatePerson(personId:$personId,personName:$personName,role:$role,summary:$summary) } }`,
    'That person',
    false,
  );

export const useDeletePerson = () =>
  useW360Mutation<{ personId: string }, Wrapped<'deletePerson', boolean>>(
    `mutation DPe($personId:String!) { web { deletePerson(personId:$personId) } }`,
    'Removing that person',
    false,
  );

export const useDeletePhoto = () =>
  useW360Mutation<{ photoId: string }, Wrapped<'deletePhoto', boolean>>(
    `mutation DPh($photoId:String!) { web { deletePhoto(photoId:$photoId) } }`,
    'Deleting that photo',
  );

export const useSetCoverPhoto = () =>
  useW360Mutation<{ photoId: string }, Wrapped<'setCoverPhoto', boolean>>(
    `mutation SCP($photoId:String!) { web { setCoverPhoto(photoId:$photoId) } }`,
    'That cover photo',
  );

export const useUpdatePaper = (reportError = true) =>
  useW360Mutation<{ paperId: string; name: string; shelf: string }, Wrapped<'updatePaper', boolean>>(
    `mutation UPa($paperId:String!,$name:String!,$shelf:String!) {
       web { updatePaper(paperId:$paperId,name:$name,shelf:$shelf) } }`,
    'That paper',
    reportError,
  );

export const useDeleteExpense = () =>
  useW360Mutation<{ expenseId: string }, Wrapped<'deleteExpense', boolean>>(
    `mutation DEx($expenseId:String!) { web { deleteExpense(expenseId:$expenseId) } }`,
    'Deleting that expense',
  );

export interface FeatureCostInput {
  purchaseKind: string; purchaseTitle: string; purchaseAmount: number; purchasedOn: string;
  vendor: string; invoiceNo: string; warrantyUntil: string; receiptFileRef: string;
  receiptFileName: string; receiptMimeType: string; receiptSizeBytes: number;
}

/** Files the typed feature in one write. An optional first cost is inserted in
 *  the same transaction, so a saved receipt never points at a missing feature. */
export const useAddFeature = () =>
  useW360Mutation<{
    recordId: string; label: string; typeKey: string; schemaVersion: number;
    attributes: string; geometry: string; pinLabel: string; condition: string;
    conditionState: string; note: string;
  } & FeatureCostInput, Wrapped<'addFeature', string>>(
    `mutation AF($recordId:String!,$label:String!,$typeKey:String!,$schemaVersion:Int!,
                 $attributes:String!,$geometry:String!,$pinLabel:String!,$condition:String!,
                 $conditionState:String!,$note:String!,$purchaseKind:String!,
                 $purchaseTitle:String!,$purchaseAmount:Float!,$purchasedOn:String!,
                 $vendor:String!,$invoiceNo:String!,$warrantyUntil:String!,
                 $receiptFileRef:String!,$receiptFileName:String!,$receiptMimeType:String!,
                 $receiptSizeBytes:Int!) {
       web { addFeature(recordId:$recordId,label:$label,typeKey:$typeKey,
                        schemaVersion:$schemaVersion,attributes:$attributes,geometry:$geometry,
                        pinLabel:$pinLabel,condition:$condition,conditionState:$conditionState,
                        note:$note,purchaseKind:$purchaseKind,purchaseTitle:$purchaseTitle,
                        purchaseAmount:$purchaseAmount,purchasedOn:$purchasedOn,vendor:$vendor,
                        invoiceNo:$invoiceNo,warrantyUntil:$warrantyUntil,
                        receiptFileRef:$receiptFileRef,receiptFileName:$receiptFileName,
                        receiptMimeType:$receiptMimeType,receiptSizeBytes:$receiptSizeBytes) } }`,
    'That feature',
    false,
  );

/** Every field is nullable on purpose. `undefined` means "leave it alone",
 *  `''` means "clear it" — the editor sends the whole form, so clearing a
 *  spec or a note is a real edit and not a silent no-op. */
export const useUpdateFeature = () =>
  useW360Mutation<{
    featureId: string; label?: string; spec?: string; condition?: string;
    conditionState?: string; note?: string; typeKey?: string; schemaVersion?: number;
    attributes?: string; geometry?: string; pinLabel?: string; expectedVersion?: number;
  }, Wrapped<'updateFeature', boolean>>(
    `mutation UF($featureId:String!,$label:String,$spec:String,$condition:String,
                 $conditionState:String,$note:String,$typeKey:String,$schemaVersion:Int,
                 $attributes:String,$geometry:String,$pinLabel:String,$expectedVersion:Int) {
       web { updateFeature(featureId:$featureId,label:$label,spec:$spec,
                           condition:$condition,conditionState:$conditionState,note:$note,
                           typeKey:$typeKey,schemaVersion:$schemaVersion,attributes:$attributes,
                           geometry:$geometry,pinLabel:$pinLabel,
                           expectedVersion:$expectedVersion) } }`,
    'That feature',
    false,
  );

export const useSaveFeatureCost = () =>
  useW360Mutation<{
    featureId: string; title: string; amount: number; purchasedOn: string; kind: string;
    vendor: string; invoiceNo: string; warrantyUntil: string; receiptFileRef: string;
    receiptFileName: string; receiptMimeType: string; receiptSizeBytes: number;
  }, Wrapped<'saveFeatureCost', string>>(
    `mutation SFC($featureId:String!,$title:String!,$amount:Float!,$purchasedOn:String!,
                  $kind:String!,$vendor:String!,$invoiceNo:String!,$warrantyUntil:String!,
                  $receiptFileRef:String!,$receiptFileName:String!,$receiptMimeType:String!,
                  $receiptSizeBytes:Int!) {
       web { saveFeatureCost(featureId:$featureId,title:$title,amount:$amount,
                             purchasedOn:$purchasedOn,kind:$kind,vendor:$vendor,
                             invoiceNo:$invoiceNo,warrantyUntil:$warrantyUntil,
                             receiptFileRef:$receiptFileRef,receiptFileName:$receiptFileName,
                             receiptMimeType:$receiptMimeType,receiptSizeBytes:$receiptSizeBytes) } }`,
    'That feature cost',
    false,
  );

export const useDeleteFeature = () =>
  useW360Mutation<{ featureId: string }, Wrapped<'deleteFeature', boolean>>(
    `mutation DF($featureId:String!) { web { deleteFeature(featureId:$featureId) } }`,
    'Removing that feature',
    false,
  );

export const useAddPaper = (reportError = true) =>
  useW360Mutation<{
    recordId: string; fileRef: string; name: string; subtitle: string;
    shelf: string; pageCount: number; mimeType: string; sizeBytes: number;
  }, Wrapped<'addPaper', string>>(
    `mutation ADP($recordId:String!,$fileRef:String!,$name:String!,$subtitle:String!,
                  $shelf:String!,$pageCount:Int!,$mimeType:String!,$sizeBytes:Int!) {
       web { addPaper(recordId:$recordId,fileRef:$fileRef,name:$name,subtitle:$subtitle,
                      shelf:$shelf,pageCount:$pageCount,mimeType:$mimeType,
                      sizeBytes:$sizeBytes) } }`,
    'That paper',
    reportError,
  );

export const useDeletePaper = (reportError = true) =>
  useW360Mutation<{ paperId: string }, Wrapped<'deletePaper', boolean>>(
    `mutation DELP($paperId:String!) { web { deletePaper(paperId:$paperId) } }`,
    'Deleting that paper',
    reportError,
  );

export const useAcceptMark = () =>
  useW360Mutation<{ markId: string }, Wrapped<'acceptMark', boolean>>(
    `mutation AM($markId:String!) { web { acceptMarkPosition(markId:$markId) } }`,
    'Accepting that mark',
  );

export const useDeleteMark = () =>
  useW360Mutation<{ markId: string }, Wrapped<'deleteMark', boolean>>(
    `mutation DM($markId:String!) { web { deleteMark(markId:$markId) } }`,
    'Deleting that mark',
  );

export const useRevokeLink = () =>
  useW360Mutation<{ linkId: string }, Wrapped<'revokeShareLink', boolean>>(
    `mutation RL($linkId:String!) { web { revokeShareLink(linkId:$linkId) } }`,
    'Revoking that link',
  );

export const useExtendLink = () =>
  useW360Mutation<{ linkId: string; days: number }, Wrapped<'extendLink', boolean>>(
    `mutation EL($linkId:String!,$days:Int!) { web { extendShareLink(linkId:$linkId,days:$days) } }`,
    'Extending that link',
  );

export const useDismissWaiting = () =>
  useW360Mutation<{ id: string }>(
    `mutation DW($id:String!) { web { dismissWaiting(id:$id) } }`,
    'That item',
  );

/** One form for both kinds; an update sends only what changed — an omitted
 *  field is left alone on the server, never blanked. */
export interface RecordInput {
  id?: string | null; kind?: string; title?: string; classification?: string;
  status?: string; stake?: string; khataNo?: string; ownerName?: string;
  village?: string; mandal?: string; district?: string; extent?: number;
  extentUnit?: string; marketValue?: number; purchasePrice?: number;
}

/** Create or partially update one record. Resolves to the record's id either
 *  way — which is what lets the add drawer file the deed it was read from
 *  against the record that deed just created. */
export const useSaveRecord = () =>
  useW360Mutation<{ input: RecordInput }, Wrapped<'saveRecord', string>>(
    `mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }`,
    'That record',
  );

/** Move a record's pin. Invalidates the record and boundary caches so the
 *  hero, the location card and W04 all agree the moment it lands. */
export const useSetPin = () =>
  useW360Mutation<{ recordId: string; lat: number; lon: number }>(
    `mutation SP($recordId:String!,$lat:Float!,$lon:Float!) {
       web { setPin(recordId:$recordId, lat:$lat, lon:$lon) } }`,
    'That location',
  );

/** Save a boundary the owner drew, or one read from their KML. An empty ring
 *  clears it — withdrawing a wrong outline has to be as easy as drawing it. */
export const useSetBoundary = () =>
  useW360Mutation<{ recordId: string; ring: number[] }, Wrapped<'setBoundary', boolean>>(
    `mutation SB($recordId:String!,$ring:[Float!]!) {
       web { setBoundary(recordId:$recordId, ring:$ring) } }`,
    'That boundary',
    false,
  );

/** Place a new boundary mark. Returns its id, or "" when refused. */
export const useAddMark = () =>
  useW360Mutation<{
    recordId: string; label: string; lat: number; lon: number; detail: string;
  }>(
    `mutation AM($recordId:String!,$label:String!,$lat:Float!,$lon:Float!,$detail:String!) {
       web { addMark(recordId:$recordId, label:$label, lat:$lat, lon:$lon, detail:$detail) } }`,
    'That mark',
  );

/** Rename a mark, or say what it is. There was no way to do either. */
export const useUpdateMark = () =>
  useW360Mutation<{ markId: string; label: string; detail: string }>(
    `mutation UM($markId:String!,$label:String!,$detail:String!) {
       web { updateMark(markId:$markId, label:$label, detail:$detail) } }`,
    'That mark',
  );

/** Drag a mark to a new position; the old one is kept in History. */
export const useMoveMark = () =>
  useW360Mutation<{ markId: string; lat: number; lon: number }>(
    `mutation MM($markId:String!,$lat:Float!,$lon:Float!) {
       web { moveMark(markId:$markId, lat:$lat, lon:$lon) } }`,
    'Moving that mark',
  );

/** One mark per corner of the saved boundary — the KML already named them. */
export const useMarksFromBoundary = () =>
  useW360Mutation<{ recordId: string }>(
    `mutation MFB($recordId:String!) { web { marksFromBoundary(recordId:$recordId) } }`,
    'Those marks',
  );

export const useDeleteRecords = (reportError = true) =>
  useW360Mutation<{ ids: string[] }, Wrapped<'deleteRecords', number>>(
    `mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }`,
    'Deleting those records',
    reportError,
  );

export const useArchiveRecords = (reportError = true) =>
  useW360Mutation<{ ids: string[]; archived: boolean }, Wrapped<'archiveRecords', number>>(
    `mutation AR($ids:[String!]!,$archived:Boolean!) {
       web { archiveRecords(ids:$ids,archived:$archived) } }`,
    'Archiving those records',
    reportError,
  );

export const useTagRecords = (reportError = true) =>
  useW360Mutation<{ ids: string[]; tag: string }, Wrapped<'tagRecords', number>>(
    `mutation TR($ids:[String!]!,$tag:String!) { web { tagRecords(ids:$ids,tag:$tag) } }`,
    'Those tags',
    reportError,
  );

export const useCreateRequest = () =>
  useW360Mutation<{ recordId: string; kind: string; message: string;
                    requester: string; shared: string; attachmentManifest?: string },
                   Wrapped<'createRequest', string>>(
    `mutation CR($recordId:String!,$kind:String!,$message:String!,
                 $requester:String!,$shared:String!,$attachmentManifest:String! = "{}") {
       web { createRequest(recordId:$recordId,kind:$kind,message:$message,
                           requester:$requester,shared:$shared,attachmentManifest:$attachmentManifest) } }`,
    'That request',
  );

export const useAssignRequest = () =>
  useW360Mutation<{ requestId: string; assignee: string },
                   Wrapped<'assignRequest', boolean>>(
    `mutation AR($requestId:String!,$assignee:String!) {
       web { assignRequest(requestId:$requestId,assignee:$assignee) } }`,
    'That assignment',
  );

/** Names a request can be handed to — people this account has worked with. */
export function useAssignable() {
  return useQuery({
    queryKey: [KEY, 'assignable'],
    queryFn: async () =>
      (await gql<Wrapped<'assignable', string[]>>(`{ web { assignable } }`)).web.assignable,
  });
}

export const useCreateShareLink = (reportError = true) =>
  useW360Mutation<{ recordId: string; audience: string; terms: string; days: number; documentIds?: string[]; includeBoundary?: boolean },
                   Wrapped<'createShareLink', string>>(
    `mutation CSL($recordId:String!,$audience:String!,$terms:String!,$days:Int!,$documentIds:[String!],$includeBoundary:Boolean! = false) {
       web { createShareLink(recordId:$recordId,audience:$audience,terms:$terms,days:$days,documentIds:$documentIds,includeBoundary:$includeBoundary) } }`,
    'That share link',
    reportError,
  );

/** One value that was changed on a record, and what it used to be. */
export interface Correction {
  id: string; field: string; was: string; now: string; at: string; by: string;
}

const Q_CORRECTIONS = `query C($id:String!) { web { corrections(recordId:$id) {
  id field was now at by } } }`;

export function useCorrections(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'corrections', id],
    queryFn: async () =>
      (await gql<Wrapped<'corrections', Correction[]>>(Q_CORRECTIONS, { id })).web.corrections,
  });
}

/** One audited change to a record — an add, an edit, a removal. Broader than a
 *  Correction (which is only a changed field): every action filed against the
 *  record shows here, newest first. `action` is the server's raw verb. */
export interface HistoryEvent {
  id: string; action: string; detail: string; at: string; by: string;
}

const Q_HISTORY = `query H($id:String!) { web { recordHistory(recordId:$id) {
  id action detail at by } } }`;

export function useRecordHistory(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'recordHistory', id],
    queryFn: async () =>
      (await gql<Wrapped<'recordHistory', HistoryEvent[]>>(Q_HISTORY, { id })).web.recordHistory,
  });
}

/** The service catalogue, searched server-side so the client never holds it all. */
export function useServicesOffered(q: string, key = '', enabled = true) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'services', q, key],
    queryFn: async () =>
      (await gql<Wrapped<'servicesOffered', ServiceOffer[]>>(Q_SERVICES, { q, key }))
        .web.servicesOffered,
  });
}

export interface OrderVars {
  recordIds: string[]; kind: string; note?: string; params?: string;
  attachmentManifest?: string; idempotencyKey?: string;
}

export const useOrderService = (reportError = true) =>
  useW360Mutation<OrderVars, Wrapped<'orderService', number>>(
    `mutation OS($recordIds:[String!]!,$kind:String!,$note:String,$params:String,$attachmentManifest:String! = "{}",$idempotencyKey:String! = "") {
       web { orderService(recordIds:$recordIds,kind:$kind,note:$note,params:$params,attachmentManifest:$attachmentManifest,idempotencyKey:$idempotencyKey) } }`,
    'That order',
    reportError,
  );

export const useOrderServiceBatch = (reportError = true) =>
  useW360Mutation<{
    recordId: string; items: string; note?: string; idempotencyKey: string;
  }, Wrapped<'orderServiceBatch', ServiceBatchReceipt | null>>(
    `mutation OSB($recordId:String!,$items:String!,$note:String,$idempotencyKey:String!) {
       web { orderServiceBatch(recordId:$recordId,items:$items,note:$note,
                               idempotencyKey:$idempotencyKey) {
         batchId ref orderCount total
       } } }`,
    'That batch request',
    reportError,
  );

export const useSaveGovernancePolicy = (reportError = true) =>
  useW360Mutation<{
    countryCode: string; stateCode: string; districtCode: string;
    document: string; reason: string; expectedRevision: number;
  }, Wrapped<'saveGovernancePolicy', GovernancePolicy | null>>(
    `mutation SGP($countryCode:String!,$stateCode:String!,$districtCode:String!,
                  $document:String!,$reason:String!,$expectedRevision:Int!) {
       web { saveGovernancePolicy(countryCode:$countryCode,stateCode:$stateCode,
              districtCode:$districtCode,document:$document,reason:$reason,
              expectedRevision:$expectedRevision) { ${GOVERNANCE_FIELDS} } } }`,
    'That policy draft', reportError,
  );

export const usePublishGovernancePolicy = (reportError = true) =>
  useW360Mutation<{ policyId: string; reason: string },
                   Wrapped<'publishGovernancePolicy', GovernancePolicy | null>>(
    `mutation PGP($policyId:String!,$reason:String!) {
       web { publishGovernancePolicy(policyId:$policyId,reason:$reason) {
         ${GOVERNANCE_FIELDS}
       } } }`,
    'Publishing that policy', reportError,
  );

export const useArchiveGovernancePolicy = (reportError = true) =>
  useW360Mutation<{ policyId: string; reason: string }, Wrapped<'archiveGovernancePolicy', boolean>>(
    `mutation AGP($policyId:String!,$reason:String!) {
       web { archiveGovernancePolicy(policyId:$policyId,reason:$reason) } }`,
    'Archiving that policy', reportError,
  );

export const usePostTicketMessage = (reportError = true) =>
  useW360Mutation<{ ticketId: string; message: string }, Wrapped<'postTicketMessage', boolean>>(
    `mutation PTM($ticketId:String!,$message:String!) {
       web { postTicketMessage(ticketId:$ticketId,message:$message) } }`,
    'That message',
    reportError,
  );

/** Filing an order, once, from anywhere.
 *
 *  Three screens call `orderService` and each one JSON-stringified its own
 *  params, defaulted its own manifest and decided for itself what the returned
 *  count means — which is how the Properties list's bulk "Order EC × 12" came
 *  to carry no idempotency key at all: pressed twice on a slow connection, it
 *  files twelve more.
 *
 *  The count is returned raw and deliberately: `orderService` answers 0 for a
 *  refusal rather than raising, so a caller has to be able to tell "the server
 *  said no" from "the request never arrived". Throwing here would erase that
 *  distinction, which is the whole of the flow's three different error
 *  sentences. */
export async function placeOrder(
  run: (v: OrderVars) => Promise<Wrapped<'orderService', number>>,
  v: {
    recordIds: string[]; kind: string; note?: string;
    params?: Record<string, string>; manifest?: object; idempotencyKey: string;
  },
): Promise<number> {
  const res = await run({
    recordIds: v.recordIds,
    kind: v.kind,
    note: v.note,
    params: JSON.stringify(v.params ?? {}),
    attachmentManifest: JSON.stringify(v.manifest ?? {}),
    idempotencyKey: v.idempotencyKey,
  });
  return res.web.orderService;
}

// ── Tickets ────────────────────────────────────────────────────────────
//
// Every one of these resolves to a falsy value when the server refuses —
// '' for an id, 0 for a count, false for a yes-or-no — rather than throwing,
// which is how the rest of Mutation.web reports "that did not happen". The
// caller reads the value; there is no error to catch for a refusal, only for
// the network.

/** Sets the quoted price aside against this one job. It really writes the
 *  ledger row even while the payments provider is a stub — a button that
 *  refuses to be pressed would make the whole thing untestable, and a row
 *  labelled "recorded, not charged" is more honest than a disabled control. */
export const useFundTicket = () =>
  useW360Mutation<{ ticketId: string }, Wrapped<'fundTicket', string>>(
    `mutation FTK($ticketId:String!) { web { fundTicket(ticketId:$ticketId) } }`,
    'Setting money aside',
  );

export function usePaymentConfig() {
  return useQuery({
    queryKey: [KEY, 'payment-config'],
    queryFn: async () => {
      const response = await apiFetch('/api/gateway/pattadar/payments/config');
      if (!response.ok) throw new Error('Payment settings could not be loaded. Refresh and try again.');
      return response.json() as Promise<{ enabled: boolean; mode: 'off' | 'test' | 'live'; live: boolean }>;
    },
    staleTime: 30_000,
  });
}

/** Records a dispatch with an expiring worker link. A live provider sends it;
 * the owner can also copy the recorded link, with the same revocation rules. */
export const useDispatchTicket = () =>
  useW360Mutation<{ ticketId: string; contact: string; personName: string;
                    channel: string; purpose: string; note: string; expiresDays: number },
                   Wrapped<'dispatchTicket', string>>(
    `mutation DTK($ticketId:String!,$contact:String!,$personName:String!,$channel:String!,
                  $purpose:String!,$note:String!,$expiresDays:Int!) {
       web { dispatchTicket(ticketId:$ticketId,contact:$contact,personName:$personName,
                            channel:$channel,purpose:$purpose,note:$note,
                            expiresDays:$expiresDays) } }`,
    'Sending that out',
  );

/** Takes a dispatch back. The person is told it is off, and when nothing live
 *  is left the ticket goes back to being unsent. */
export const useRevokeDispatch = () =>
  useW360Mutation<{ dispatchId: string; reason: string }, Wrapped<'revokeDispatch', boolean>>(
    `mutation RVK($dispatchId:String!,$reason:String!) {
       web { revokeDispatch(dispatchId:$dispatchId,reason:$reason) } }`,
    'Revoking that dispatch',
  );

export const useStartTicket = () =>
  useW360Mutation<{ ticketId: string; note: string }, Wrapped<'startTicket', boolean>>(
    `mutation STK($ticketId:String!,$note:String!) {
       web { startTicket(ticketId:$ticketId,note:$note) } }`,
    'Starting that job',
  );

/** Records one thing that came back. `fileRef` is a node id from a separate
 *  multipart upload (see uploadToDrive), the way addPaper and addPhoto already
 *  work; `payload` is JSON text for the kinds that carry more than a file —
 *  a ring for a boundary, a condition for a feature. Nothing here touches the
 *  record: filing happens on acceptance. Returns the deliverable's id. */
export const useAddDeliverable = () =>
  useW360Mutation<{ ticketId: string; kind: string; label: string; note: string;
                    fileRef: string; fileName: string; mimeType: string; sizeBytes: number;
                    payload: string; fileAs: string; submittedBy: string },
                   Wrapped<'addDeliverable', string>>(
    `mutation ADV($ticketId:String!,$kind:String!,$label:String!,$note:String!,
                  $fileRef:String!,$fileName:String!,$mimeType:String!,$sizeBytes:Int!,
                  $payload:String!,$fileAs:String!,$submittedBy:String!) {
       web { addDeliverable(ticketId:$ticketId,kind:$kind,label:$label,note:$note,
                            fileRef:$fileRef,fileName:$fileName,mimeType:$mimeType,
                            sizeBytes:$sizeBytes,payload:$payload,fileAs:$fileAs,
                            submittedBy:$submittedBy) } }`,
    'What came back',
  );

/** Says yes or no to one item on its own. A survey that comes back with a good
 *  sketch and two photos of the wrong field must not be an all-or-nothing
 *  decision, or the owner accepts rubbish rather than lose the sketch. */
export const useReviewDeliverable = () =>
  useW360Mutation<{ deliverableId: string; review: string; fileAs: string; note: string },
                   Wrapped<'reviewDeliverable', boolean>>(
    `mutation RVW($deliverableId:String!,$review:String!,$fileAs:String!,$note:String!) {
       web { reviewDeliverable(deliverableId:$deliverableId,review:$review,
                               fileAs:$fileAs,note:$note) } }`,
    'That review',
  );

/** Files everything kept, releases what was set aside, and closes the job.
 *  Resolves to the number of rows that landed on the record — 0 means it was
 *  refused, which happens while any item is still undecided. */
export const useAcceptTicket = () =>
  useW360Mutation<{ ticketId: string; note: string }, Wrapped<'acceptTicket', number>>(
    `mutation ACT($ticketId:String!,$note:String!) {
       web { acceptTicket(ticketId:$ticketId,note:$note) } }`,
    'Accepting that work',
  );

/** The reason is not optional: it is what goes out to the person, on the
 *  channel the job went out on. */
export const useSendBackTicket = () =>
  useW360Mutation<{ ticketId: string; reason: string }, Wrapped<'sendBackTicket', boolean>>(
    `mutation SBK($ticketId:String!,$reason:String!) {
       web { sendBackTicket(ticketId:$ticketId,reason:$reason) } }`,
    'Sending that back',
  );

/** Pulls the job. `payAnyway` is the gross settled out of what is held — the
 *  trips somebody made are still owed even when the work never arrived — and
 *  the rest goes back to the wallet. */
export const useCancelTicket = () =>
  useW360Mutation<{ ticketId: string; reason: string; payAnyway: number },
                   Wrapped<'cancelTicket', boolean>>(
    `mutation CTK($ticketId:String!,$reason:String!,$payAnyway:Float!) {
       web { cancelTicket(ticketId:$ticketId,reason:$reason,payAnyway:$payAnyway) } }`,
    'Cancelling that job',
  );

// ── The desk and the associates roster ─────────────────────────────────
//
// An associate is somebody who does the work — a surveyor, an advocate, a
// document writer, a caretaker. What ships here is the roster, the desk that
// puts a name on a job by hand, and the owner finally seeing who is on their
// job and that person's number.
//
// Two rules hold this whole surface up, and a hook added here later must not
// quietly break either of them:
//
//  • Every read below except `disciplines` and `associatesForTicket` is
//    admin-only. `desk`, `associates`, `coverage` and `deskTasks` are the only
//    reads in the API that see other people's jobs at all; each one is guarded
//    server-side and each one leaves an audit row behind. A non-admin gets
//    null or an empty list rather than an error, and the rail simply never
//    draws /app/desk for them — see `Portfolio.isPlatformAdmin`.
//
//  • Contact numbers are masked everywhere except two places: the admin roster,
//    which exists in order to be phoned from, and one owner looking at the one
//    person on their own live job (`TicketView.assignedTo`, and only when that
//    associate agreed to it). That is why `AssociateCard` — the picker the
//    OWNER sees — has no contact field at all, and why no query below asks it
//    for one. A screenshot of a desk page must not be a phone book.
//
// There are no offer hooks here, and no dispatcher. Offers and the accept race
// come later; the columns exist in the database but nothing reads them yet, so
// the counters below (`offersSent`, `offersOut`, `dispatchRound`, and friends)
// all answer 0 or '' until they do. They are read from the server rather than
// assumed zero here so that the day they start moving, no screen has to change.

/** One of the nine lines of work, as `associates.DISCIPLINES` defines them.
 *  Reference data, identical for every caller and every session. `areaGrain`
 *  is the consequential one: a surveyor is village-scoped because somebody has
 *  to walk the land, an advocate is state-scoped because a title opinion is
 *  document work. `fanout` is how many people a later offer round would go to. */
export interface DisciplineInfo {
  key: string; label: string; blurb: string; kinds: string[];
  areaGrain: string; credential: string; fanout: number;
}

/** One place somebody works. `name` is what the desk typed — "Peddapuram (R)" —
 *  and `label` is what a screen prints; the server keeps a folded key of its
 *  own for matching, which is deliberately not sent because nothing here has
 *  any business matching on it. */
export interface AssociateArea { id: string; level: string; name: string; label: string }

/** One line of work one person does, with how much of it they will hold.
 *  `openCount` against `capacity` is the "2 of 4 in hand" line. */
export interface AssociateDiscipline {
  key: string; label: string; state: string; stateWord: string;
  capacity: number; openCount: number; credentialState: string;
}

/** A licence or a registration. The number comes back masked and only masked:
 *  an admin verifying a licence needs the last digits and the authority, not a
 *  copy of somebody's enrolment number sitting in a browser cache. */
export interface AssociateCredential {
  id: string; discipline: string; kind: string; numberMasked: string;
  authority: string; expiresOn: string; daysLeft: number;
  expiring: boolean; lapsed: boolean;
  review: string; reviewNote: string; fileRef: string; fileName: string;
}

/** One person on the roster, as the desk sees them.
 *
 *  `contact` is the real number and `contactMasked` is the same number fit to
 *  be on a screen somebody photographs. Both are sent because this type is
 *  admin-only — the roster is the phone book the desk works from, and masking
 *  it there defeats the only reason to open the screen — while every other
 *  surface in the app is built on the masked one. `contactVisible` is the
 *  associate's own answer to "may an owner see this while you are on their
 *  job", and it is the only thing that unmasks a number for anybody else.
 *
 *  `dispatchable` and `whyNot` are the server's judgement, in its words, so a
 *  screen never has to re-derive eligibility from capacity, state and licences
 *  and get a different answer from the desk that assigns the job. */
export interface Associate {
  id: string; name: string; firm: string; initials: string;
  contact: string; contactMasked: string; contactVisible: boolean;
  state: string; stateWord: string; stateState: string; stateReason: string;
  disciplines: AssociateDiscipline[]; areas: AssociateArea[];
  credentials: AssociateCredential[];
  claimed: boolean; dispatchable: boolean; whyNot: string[];
  jobsOpen: number; jobsDone: number;
  ratingAverage: number; ratingCount: number;
  trainingState: string; trainingNote: string;
  offersSent: number; offersTaken: number; offersDeclined: number;
  acceptRate: number; lastOfferedAt: string;
  note: string; createdAt: string;
}

/** The same person as the OWNER may see them, when they pick somebody for
 *  their own job. No contact, no state reason, no counts of other owners'
 *  work — `jobsOpen` and `jobsDone` are totals, which is what "they are busy"
 *  honestly means, and `why` is the server's sentence for why this name is on
 *  the list at all. */
export interface AssociateCard {
  id: string; name: string; firm: string; initials: string;
  disciplines: string[]; disciplineLabels: string[]; areas: string[];
  verified: boolean; jobsOpen: number; jobsDone: number;
  acceptsMore: boolean; why: string[];
}

/** One line of an associate's trail. `headline` is composed at write time, the
 *  way ticket events are, so a re-wording in 2027 cannot re-word a 2026 event. */
export interface AssociateEvent {
  id: string; kind: string; headline: string; detail: string;
  actorLabel: string; actorKind: string; at: string; atLabel: string;
}

/** One square of the coverage grid: a place against a line of work.
 *  `activeCount` 0 with `openJobs` above it is a problem; 0 with no open job
 *  is only a fact, and `risk` is the server saying which of the two this is
 *  rather than the grid guessing from the numbers. */
export interface CoverageCell {
  level: string; name: string; discipline: string; disciplineLabel: string;
  activeCount: number; openJobs: number; records: number; risk: string;
}

/** Something the desk needs to look at. Written by the paths that cannot ask a
 *  human at the time — nobody is notified, because the desk IS the screen and
 *  the operator opens it. */
export interface DeskTask {
  id: string; kind: string; headline: string; detail: string;
  associateId: string; ticketId: string; to: string; at: string;
}

/** One job on the desk, across every owner. This is a narrow, purpose-built
 *  row and not a TicketView: an admin reading every owner's queue sees what the
 *  work is, where it is and what it is worth, and never the record behind it.
 *
 *  `assigneeContact` is unmasked — this screen is the phone call, and the two
 *  rows it matters on are "nobody has touched this in nine days" and "take them
 *  off it". It is the assignee's number, never the owner's; the owner does not
 *  appear on this type at all. */
export interface DeskJob {
  ticketId: string; ref: string; kind: string; serviceLabel: string; place: string;
  status: string; statusLabel: string; statusState: string;
  assignee: string; assigneeRef: string; assigneeContact: string;
  orderedAt: string; ageDays: number; dueDate: string; overdue: boolean;
  quiet: boolean; quietDays: number; quoted: number; held: number;
  dispatchState: string; dispatchRound: number; nextRoundAt: string;
  offersOut: number; offersDeclined: number; lastResponse: string;
  candidateCount: number; stuck: boolean;
}

/** The desk in one read. `jobs` is what nobody is on; `silent` is what somebody
 *  IS on and has gone quiet — the second list is the failure that actually
 *  happens, and it is a separate list because it needs different buttons.
 *
 *  The counters are the strip across the top, and the zero-state standard says
 *  the strip is not drawn at all when they are zero rather than drawn as a row
 *  of noughts. */
export interface Desk {
  mode: string; modeWord: string;
  jobs: DeskJob[]; silent: DeskJob[];
  unassigned: number; ageing: number; silentCount: number; stuck: number;
  associatesActive: number; associatesPending: number;
  credentialsExpiring: number; coverageGaps: number; tasksOpen: number;
}

// ── Desk query documents ───────────────────────────────────────────────

const ASSOCIATE_AREA = `id level name label`;

const ASSOCIATE_DISCIPLINE = `key label state stateWord capacity openCount credentialState`;

const ASSOCIATE_CREDENTIAL = `id discipline kind numberMasked authority expiresOn daysLeft
  expiring lapsed review reviewNote fileRef fileName`;

const ASSOCIATE = `id name firm initials contact contactMasked contactVisible
  state stateWord stateState stateReason claimed dispatchable whyNot
  jobsOpen jobsDone ratingAverage ratingCount trainingState trainingNote
  offersSent offersTaken offersDeclined acceptRate lastOfferedAt
  note createdAt
  disciplines { ${ASSOCIATE_DISCIPLINE} }
  areas { ${ASSOCIATE_AREA} }
  credentials { ${ASSOCIATE_CREDENTIAL} }`;

const DESK_JOB = `ticketId ref kind serviceLabel place status statusLabel statusState
  assignee assigneeRef assigneeContact orderedAt ageDays dueDate overdue quiet quietDays
  quoted held dispatchState dispatchRound nextRoundAt offersOut offersDeclined
  lastResponse candidateCount stuck`;

const Q_DESK = `query DSK($scope:String!) { web { desk(scope:$scope) {
  mode modeWord unassigned ageing silentCount stuck
  associatesActive associatesPending credentialsExpiring coverageGaps tasksOpen
  jobs { ${DESK_JOB} }
  silent { ${DESK_JOB} }
} } }`;

const Q_ASSOCIATES = `query ASSOCS($q:String!,$discipline:String!,$area:String!,$state:String!) {
  web { associates(q:$q,discipline:$discipline,area:$area,state:$state) { ${ASSOCIATE} } } }`;

const Q_ASSOCIATE = `query ASSOC($id:String!) { web { associate(id:$id) { ${ASSOCIATE} } } }`;

const Q_ASSOCIATE_EVENTS = `query AEV($id:String!) { web { associateEvents(id:$id) {
  id kind headline detail actorLabel actorKind at atLabel
} } }`;

const Q_COVERAGE = `query COV($level:String!) { web { coverage(level:$level) {
  level name discipline disciplineLabel activeCount openJobs records risk
} } }`;

const Q_DESK_TASKS = `{ web { deskTasks {
  id kind headline detail associateId ticketId to at
} } }`;

const Q_DISCIPLINES = `{ web { disciplines {
  key label blurb kinds areaGrain credential fanout
} } }`;

const Q_ASSOCIATES_FOR_TICKET = `query AFT($ticketId:String!) {
  web { associatesForTicket(ticketId:$ticketId) {
    id name firm initials disciplines disciplineLabels areas
    verified jobsOpen jobsDone acceptsMore why
  } } }`;

// ── Desk reads ─────────────────────────────────────────────────────────

/** Every job waiting for somebody, and every job somebody is sitting on.
 *  Null for anyone who is not a platform admin — refusal is an empty answer
 *  here, never an error, so a non-admin who types the URL gets the page's
 *  failed state and no hint that a desk exists.
 *
 *  `scope` is open | silent | stuck | all, and the last answer is held across a
 *  change of it: without that, every tab switch unmounted the list into a
 *  skeleton and the row under the pointer moved as it came back.
 *
 *  The rail badge mounts this on every route an admin visits, and the resolver
 *  reads every owner's jobs and writes an audit row for each answer, so the
 *  staleTime is what keeps routine navigation from being a platform-wide scan
 *  and a row in the ledger. A write still invalidates it. A minute, not the
 *  five the badge queries take: the same answer draws the desk itself, where
 *  what arrived while the operator was in another tab is the point. */
export function useDesk(scope = 'open') {
  return useQuery({
    queryKey: [KEY, 'desk', scope],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'desk', Desk | null>>(Q_DESK, { scope })).web.desk,
  });
}

/** What the roster is filtered by. Every field is optional and '' means "do
 *  not filter on this", which is what lets the chips and the search box each
 *  set one key and leave the others alone. */
export interface AssociateFilter {
  q?: string; discipline?: string; area?: string; state?: string;
}

/** The roster. Admin-only, and it comes back with the real contact numbers on
 *  it — see the note on `Associate`.
 *
 *  The filter is normalised into the query key rather than hashed as an object
 *  so that a fresh `{}` on every render is not a fresh cache entry. */
export function useAssociates(f: AssociateFilter = {}) {
  const vars = {
    q: f.q ?? '', discipline: f.discipline ?? '', area: f.area ?? '', state: f.state ?? '',
  };
  return useQuery({
    queryKey: [KEY, 'associates', vars.q, vars.discipline, vars.area, vars.state],
    // Hold the last good roster while a filtered one is fetched: a chip press
    // must not empty the list under the finger that pressed it.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'associates', Associate[]>>(Q_ASSOCIATES, vars)).web.associates,
  });
}

/** One person, everything the desk holds about them. Null when the id is not
 *  one this account may read — indistinguishable from not-found on purpose. */
export function useAssociate(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'associate', id],
    queryFn: async () =>
      (await gql<Wrapped<'associate', Associate | null>>(Q_ASSOCIATE, { id })).web.associate,
  });
}

/** Everything that has happened to one associate, newest first. Asked for
 *  separately from the associate because the aside that draws it is the last
 *  thing on the page and the head above it should not wait for it. */
export function useAssociateEvents(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'associateEvents', id],
    queryFn: async () =>
      (await gql<Wrapped<'associateEvents', AssociateEvent[]>>(Q_ASSOCIATE_EVENTS, { id }))
        .web.associateEvents,
  });
}

/** The grid of places against lines of work. One flat list of cells, not a
 *  matrix: the screen decides which are rows and which are columns, and a flat
 *  list survives a place with no records and a discipline with nobody in it. */
export function useCoverage(level = 'mandal') {
  return useQuery({
    queryKey: [KEY, 'coverage', level],
    queryFn: async () =>
      (await gql<Wrapped<'coverage', CoverageCell[]>>(Q_COVERAGE, { level })).web.coverage,
  });
}

/** What the desk still has to look at. The limit is the server's default: a
 *  desk with more than a hundred open tasks has a problem no page size fixes. */
export function useDeskTasks() {
  return useQuery({
    queryKey: [KEY, 'deskTasks'],
    queryFn: async () =>
      (await gql<Wrapped<'deskTasks', DeskTask[]>>(Q_DESK_TASKS)).web.deskTasks,
  });
}

/** The company disciplines. Pure reference data — no database behind it, the same
 *  answer for everybody, and it cannot change while a tab is open.
 *
 *  Keyed OUTSIDE the `w360` tree on purpose. Every write in this module
 *  invalidates `[KEY]` wholesale (see useW360Mutation) and an invalidation
 *  refetches an active query however fresh it is, so on the shared key this
 *  constant would be re-read after every roster edit, on a screen that is
 *  usually the enrolment form doing the editing. The long staleTime then
 *  actually means something. */
export function useDisciplines() {
  return useQuery({
    queryKey: ['w360-ref', 'disciplines'],
    queryFn: async () =>
      (await gql<Wrapped<'disciplines', DisciplineInfo[]>>(Q_DISCIPLINES)).web.disciplines,
    staleTime: 6 * 60 * 60 * 1000,
  });
}

/** The names the OWNER of one ticket may put on it. Owner-scoped, not
 *  admin-scoped: the roster query is admin-only, so without this the picker on
 *  the owner's own ticket would have had nothing behind it and "who is on it"
 *  would only ever work on jobs the desk had assigned.
 *
 *  An empty array is a real answer — nobody covers that place for that kind of
 *  work yet — and the picker must tell the owner so. `undefined` is the read
 *  still being in flight; the two are not the same and the page is required to
 *  distinguish them. */
export function useAssociatesForTicket(ticketId?: string) {
  return useQuery({
    enabled: !!ticketId,
    queryKey: [KEY, 'associatesForTicket', ticketId],
    queryFn: async () =>
      (await gql<Wrapped<'associatesForTicket', AssociateCard[]>>(
        Q_ASSOCIATES_FOR_TICKET, { ticketId })).web.associatesForTicket,
  });
}

// ── Desk writes ────────────────────────────────────────────────────────
//
// Every one of these answers falsy when the desk refuses — '' for an id, false
// for a yes-or-no — rather than raising, exactly as the rest of Mutation.web
// does. A caller therefore has to read the resolved value: awaiting one of
// these and carrying on is how a screen comes to report a change that never
// happened. There is an error to catch only for the network.

/** Writes somebody down and sends them their link. Resolves to the new
 *  associate's id, or '' when it was refused — a name, a contact, one kind of
 *  work and one place are all required, and a contact already on the roster is
 *  refused rather than duplicated.
 *
 *  They appear on the roster immediately, but allocation waits until each
 *  active discipline has a verified credential or company verification. */
export const useInviteAssociate = (reportError = true) =>
  useW360Mutation<{
    name: string; contact: string; disciplines: string[]; areas: string[];
    firm?: string; note?: string; channel?: string;
  }, Wrapped<'inviteAssociate', string>>(
    `mutation INV($name:String!,$contact:String!,$disciplines:[String!]!,$areas:[String!]!,
                  $firm:String! = "",$note:String! = "",$channel:String! = "auto") {
       web { inviteAssociate(name:$name,contact:$contact,disciplines:$disciplines,
                             areas:$areas,firm:$firm,note:$note,channel:$channel) } }`,
    'That associate',
    reportError,
  );

/** Edits one person's details. Every field but the id is optional, and an
 *  omitted one is left exactly as it was — this hook sends the line the drawer
 *  actually changed and nothing else, so two operators editing different
 *  fields cannot wipe each other's work.
 *
 *  `contactVisible` is a three-valued thing and typed like one: true and false
 *  are the associate's answer to "may an owner see this number while you are on
 *  their job", and leaving it out is not an answer at all. */
export const useUpdateAssociate = () =>
  useW360Mutation<{
    id: string; name?: string; contact?: string; altContact?: string;
    firm?: string; note?: string; channel?: string; contactVisible?: boolean | null;
  }, Wrapped<'updateAssociate', boolean>>(
    `mutation UAS($id:String!,$name:String! = "",$contact:String! = "",$altContact:String! = "",
                  $firm:String! = "",$note:String! = "",$channel:String! = "",
                  $contactVisible:Boolean) {
       web { updateAssociate(id:$id,name:$name,contact:$contact,altContact:$altContact,
                             firm:$firm,note:$note,channel:$channel,
                             contactVisible:$contactVisible) } }`,
    'That associate',
  );

/** Sets what somebody does, as a whole set: what is sent is what they will do
 *  afterwards, so dropping a discipline means sending the survivors without it.
 *  `capacities` is positional against `disciplines` — the stepper beside each
 *  row — and omitting it leaves each capacity as it stands. */
export const useSetAssociateDisciplines = () =>
  useW360Mutation<{ id: string; disciplines: string[]; capacities?: number[] },
                   Wrapped<'setAssociateDisciplines', boolean>>(
    `mutation SAD($id:String!,$disciplines:[String!]!,$capacities:[Int!]) {
       web { setAssociateDisciplines(id:$id,disciplines:$disciplines,capacities:$capacities) } }`,
    'What they do',
  );

/** Sets where somebody works, as a whole set. Each entry is "level:name" —
 *  "village:Peddapuram", "district:Kakinada", "state:Telangana" — and the
 *  server folds the name for matching while keeping what was typed for the
 *  screen. Removing a chip means sending the chips that are left. */
export const useSetAssociateAreas = () =>
  useW360Mutation<{ id: string; areas: string[] }, Wrapped<'setAssociateAreas', boolean>>(
    `mutation SAA($id:String!,$areas:[String!]!) {
       web { setAssociateAreas(id:$id,areas:$areas) } }`,
    'Where they work',
  );

/** Pauses somebody, stops them, or starts them again. The reason is not
 *  decoration: the server refuses a pause or a block without one, so the dialog
 *  that demands it is enforcing a rule rather than being polite.
 *
 *  Stopping somebody does not move the jobs they already hold. Those stay with
 *  them until a human takes each one off by hand from the desk. */
export const useSetAssociateState = () =>
  useW360Mutation<{ id: string; state: string; reason?: string },
                   Wrapped<'setAssociateState', boolean>>(
    `mutation SAS($id:String!,$state:String!,$reason:String! = "") {
       web { setAssociateState(id:$id,state:$state,reason:$reason) } }`,
    'Their state',
  );

export const useSetAssociateCertification = () =>
  useW360Mutation<{
    id: string; discipline: string; certified: boolean;
    note?: string; authority?: string; expiresOn?: string;
  }, Wrapped<'setAssociateCertification', boolean>>(
    `mutation SAC($id:String!,$discipline:String!,$certified:Boolean!,
                  $note:String! = "",$authority:String! = "Pattadar",$expiresOn:String! = "") {
       web { setAssociateCertification(id:$id,discipline:$discipline,certified:$certified,
                                       note:$note,authority:$authority,expiresOn:$expiresOn) } }`,
    'That certification',
  );

export const useSetAssociateTraining = () =>
  useW360Mutation<{ id: string; state: string; note?: string },
                   Wrapped<'setAssociateTraining', boolean>>(
    `mutation SAT($id:String!,$state:String!,$note:String! = "") {
       web { setAssociateTraining(id:$id,state:$state,note:$note) } }`,
    'That training decision',
  );

export const useMessageAssociate = () =>
  useW360Mutation<{ id: string; message: string }, Wrapped<'messageAssociate', boolean>>(
    `mutation MAS($id:String!,$message:String!) {
       web { messageAssociate(id:$id,message:$message) } }`,
    'That message',
  );

export const useRateAssociate = () =>
  useW360Mutation<{ ticketId: string; rating: number; note?: string },
                   Wrapped<'rateAssociate', boolean>>(
    `mutation RAS($ticketId:String!,$rating:Int!,$note:String! = "") {
       web { rateAssociate(ticketId:$ticketId,rating:$rating,note:$note) } }`,
    'That rating',
  );

/** The one hard delete on this surface, and it is narrow on purpose: somebody
 *  the desk typed in who never claimed their record and never held a job has no
 *  account behind them, so there is no other way to take them back out. Anyone
 *  who has been on a job is refused — their history is somebody else's ticket
 *  trail — and the answer is false, not an error. */
export const useDeleteUnclaimedAssociate = () =>
  useW360Mutation<{ id: string }, Wrapped<'deleteUnclaimedAssociate', boolean>>(
    `mutation DUA($id:String!) { web { deleteUnclaimedAssociate(id:$id) } }`,
    'Removing that associate',
  );

/** The OWNER putting an associate on their own job. False when the job is not
 *  theirs or the state does not allow it — read the value: a picker that
 *  awaits this and closes regardless is how a select comes to show a name the
 *  server never accepted. */
export const useAssignAssociate = (reportError = true) =>
  useW360Mutation<{ requestId: string; associateId: string },
                   Wrapped<'assignAssociate', boolean>>(
    `mutation ASA($requestId:String!,$associateId:String!) {
       web { assignAssociate(requestId:$requestId,associateId:$associateId) } }`,
    'That assignment',
    reportError,
  );

/** The desk putting somebody on somebody else's job. This is the phase-1
 *  product: one click, cross-owner, and the owner sees the name and the number
 *  on their ticket the moment it lands. */
export const useDeskAssign = () =>
  useW360Mutation<{ ticketId: string; associateId: string; note?: string },
                   Wrapped<'deskAssign', boolean>>(
    `mutation DAS($ticketId:String!,$associateId:String!,$note:String! = "") {
       web { deskAssign(ticketId:$ticketId,associateId:$associateId,note:$note) } }`,
    'That assignment',
  );

/** Takes somebody off a job. The job goes back on the queue and the person is
 *  told; nothing moves in the money, and the owner is not asked for anything
 *  extra. The reason is mandatory because it is what goes out to them. */
export const useDeskUnassign = () =>
  useW360Mutation<{ ticketId: string; reason: string }, Wrapped<'deskUnassign', boolean>>(
    `mutation DUN($ticketId:String!,$reason:String!) {
       web { deskUnassign(ticketId:$ticketId,reason:$reason) } }`,
    'Taking them off that job',
  );

/** Grants or removes the one boolean this subsystem has. There is no other
 *  role anywhere in the API: somebody either may open the desk or may not.
 *  The environment's allowlist is additive with this, and an empty allowlist
 *  grants nobody anything — so the first admin is made by deployment, never by
 *  pressing a button on a page nobody can open. */
export const useSetPlatformAdmin = () =>
  useW360Mutation<{ uid: string; on: boolean }, Wrapped<'setPlatformAdmin', boolean>>(
    `mutation SPA($uid:String!,$on:Boolean!) { web { setPlatformAdmin(uid:$uid,on:$on) } }`,
    'That desk permission',
  );

/** Marks one desk task seen. Nothing else closes them — no timer, no read
 *  receipt — because the desk is a screen a person opens, not a queue that
 *  drains itself. */
export const useCloseDeskTask = () =>
  useW360Mutation<{ taskId: string }, Wrapped<'closeDeskTask', boolean>>(
    `mutation CDT($taskId:String!) { web { closeDeskTask(taskId:$taskId) } }`,
    'Closing that task',
  );
