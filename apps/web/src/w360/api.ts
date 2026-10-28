/**
 * Typed reads for the record-360 screens (W01–W16).
 *
 * Every query goes through `Query.web` (services/api/src/web360.py) so this
 * surface can grow without touching the iOS-facing schema. Queries are written
 * out in full rather than composed from fragments: each screen asks for exactly
 * the fields it draws, which keeps the payloads honest and makes it obvious in
 * review which screen is responsible for which field.
 */
import { useQuery, useQueries, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  /** The extent in the units it is argued in — "3 Acres 1.6 Guntas · 304
   *  Cents · 14,714 Sq.yd" for land, "1,450 Sq.ft built · 200 Sq.yd land" for
   *  a flat on its own plot. '' when it would only repeat `extent`. */
  extentDetail: string;
  /** What is filed against it, counted the way the record's own tabs count. */
  paperCount: number; photoCount: number; featureCount: number;
  /** "D.No 4521/2019 · Markapur SRO", or '' when no deed is recorded. */
  deedLine: string;
  /** A court case is on it. Separate from `status`, which land can hold at the
   *  same time as being plainly owned. */
  litigation: boolean;
  /** An image scan to show when there is no photograph. Never a PDF — the
   *  gateway cannot thumbnail one. See _paper_heroes in web360.py. */
  paperFileRef: string;
  /** WHO holds it (decision memo 06/10/2026): the family or group's name, or
   *  '' when it is held in your own name. */
  groupName: string;
  /** What the "Held by" column prints: the group's name, or "In your own name". */
  holderLabel: string;
  /** WHICH holding it is part of, or '' when it stands alone. */
  holdingId: string; holdingName: string;
  /** The government's Land Parcel number (LP / survey number, "456/3"); '' when none. */
  surveyNo: string;
  /** The deed: registrar's number ("1234/2019"), office, and registration
   *  date (ISO as stored). '' when not recorded. */
  docNo: string; sro: string; regDate: string;
  /** The register's facts (RecordCard in web360.py). '' / 0 is "not recorded".
   *  The provenance and people fields are filled on the Properties list only. */
  parentage: string; coOwnerCount: number;
  managerLine: string; managerCount: number;
  purchasePrice: number; purchaseDate: string;
  mutationStatus: string; ecStatus: string;
  /** UTC ISO timestamps, as stored. */
  createdAt: string;
  lastActivityAt: string; lastActivityBy: string; lastActivityAction: string;
}
export interface Portfolio {
  displayName: string;
  farmExtent: number; farmCount: number; plotExtent: number; plotCount: number;
  builtExtent: number; builtFlats: number; builtShops: number; invested: number;
  worthNow: number; gain: number; loans: number; managedCount: number; watchedCount: number;
  waitingCount: number; runningCosts: number; paperCount: number; backupVerifiedOn: string;
  /** Whether this account may open /desk, and its associate row if it has
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
export interface GeographyRow {
  id: string; name: string; code: string; lgdCode: string; nameLocal: string;
  sourceId: string; sourceUrl: string; sourceEffectiveAt: string; active: boolean;
  stateId?: string; stateName?: string; stateLgdCode?: string;
  districtId?: string; districtName?: string; districtLgdCode?: string;
  mandalId?: string; mandalName?: string; mandalLgdCode?: string;
  governmentLevelName?: string; census2011Code?: string;
}
export interface ReferenceDataSource {
  id: string; name: string; authority: string; description: string;
  catalogUrl: string; publisherUrl: string; licenseName: string; licenseUrl: string;
  cadence: string; updatedAt: string;
}
export interface ReferenceDataSyncRun {
  id: string; sourceId: string; mode: string; status: string; sourceEffectiveAt: string;
  startedAt: string; finishedAt: string; countsJson: string;
}
export interface GeographyReference {
  states: GeographyRow[]; districts: GeographyRow[]; mandals: GeographyRow[];
  villages: GeographyRow[]; sources: ReferenceDataSource[]; runs: ReferenceDataSyncRun[];
  summary: {
    states: number; districts: number; mandals: number; villages: number;
    lastCompletedAt: string; sourceName: string;
  };
}
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
  peopleCount: number; serviceCount: number; photoCount: number; mediaCount: number; photoNote: string;
  tags: string[]; noteBody: string; noteAuthor: string; noteAt: string;
  /** The holding this record is part of, or '' when it stands alone. A record
   *  belongs to at most one — the API enforces that cardinality with two partial
   *  unique indexes, so this is a pair of strings rather than a list. */
  combinedId: string; combinedName: string;
  /** Who holds it — "Held by {holderLabel}". `groupId` '' = in your own name. */
  groupId: string; groupName: string; holderLabel: string;
  /** The LP number and the deed, for the edit drawer to show what it edits. */
  surveyNo: string; docNo: string; sro: string; regDate: string;
}
export interface Paper {
  id: string; title: string; detail: string; shelf: string; icon: string;
  tags: string[]; shared: boolean; pageCount: number; fileRef: string;
  mimeType: string; recordId: string; recordTitle: string;
  linkedProperties: { id: string; title: string; kind: string; documentId: string }[];
  createdAt: string; jointFmbId: string;
  /** The owner's own folder (VaultFolder.id); '' at the top level. Optional
   *  because the per-record `papers` read does not select it. */
  folderId?: string; sizeBytes?: number;
  /** A kept Aadhaar card, filed under <person> › Aadhaar. Only the
   *  `vaultPapers` read selects it. */
  aadhaarCard?: boolean;
  /** Deed details the owner (or a reading) set: the deed number, the
   *  registration date as DD/MM/YYYY and the registration office. Optional:
   *  only the vault reads select them. */
  docNo?: string; registeredOn?: string; office?: string;
  /** The owner chose this name (Rename); otherwise Documents names the file
   *  by what it is (paperTitle.ts). */
  nameSet?: boolean;
  /** The name the file was uploaded with. */
  fileName?: string;
}
/** One of the owner's own folders in Documents, sent flat with its parent. */
export interface VaultFolder {
  id: string; name: string; parentId: string; fileCount: number; folderCount: number; createdAt: string;
  /** Whose folder this is in the per-person tree (the account's id or a
   *  family member's id); '' for a folder the owner made. */
  personId?: string;
}
/** A note filed against a record. `body` is Markdown (RichText.tsx), its first
 *  line the headline. Editable in place through `updateNote` (13/10/2026);
 *  adding or editing one writes an audit line on the record's Activity. */
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
  photoRef: string;
}
export interface Payment {
  id: string; title: string; subtitle: string; occurredOn: string;
  method: string; amount: number; direction: string; state: string;
}
export interface PeopleView {
  people: Person[]; payments: Payment[]; count: number; monthlyOut: number;
  seasonalIn: number; walletBalance: number; walletNote: string; walletLive: boolean;
}
export interface Owner {
  id: string; name: string; initials: string; parentage: string; address: string;
  role: string; isCurrent: boolean; acquiredVia: string; photoRef: string;
}
export interface OwnersView {
  owners: Owner[]; count: number; currentName: string;
}
/** One endpoint of a transfer. `extent`/`share` are meaningful on the 'to'
 *  side, where a split is measured; the server sends the rendered labels so no
 *  screen reinvents "1/2" out of two integers or prints an unstated area as 0. */
export interface TransferParty {
  id: string; side: 'from' | 'to'; ownerId: string; name: string;
  parentage: string; address: string; extent: number; extentUnit: string;
  shareNum: number; shareDen: number; isGpa: boolean;
  shareLabel: string; extentLabel: string;
}
/** One event in the chain of title. `verified` false means a reading proposed
 *  it and nobody has confirmed the direction yet — the deed reader itself warns
 *  that seller/buyer can be inverted, so an unconfirmed edge is drawn as a
 *  proposal rather than as settled title. */
export interface Transfer {
  id: string; kind: string; deedDocumentId: string; deedNo: string; sro: string;
  registeredOn: string; priorTransferId: string; note: string; source: string;
  verified: boolean; fromParties: TransferParty[]; toParties: TransferParty[];
}
export interface TransfersView {
  transfers: Transfer[]; count: number; unverifiedCount: number;
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
  /** The deed number; the owner sets it in Edit details. */
  docNo?: string; nameSet?: boolean;
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
  districtCode: string; mandalCode: string; villageCode: string;
  revision: number; status: string; schemaVersion: number;
  document: string; sourceDigest: string; createdBy: string; createdAt: string;
  publishedBy: string; publishedAt: string;
}
export interface GovernancePolicyEvent {
  id: string; policyId: string; scopeKey: string; revision: number;
  actor: string; action: string; detail: string; sourceDigest: string; createdAt: string;
}

/** One revision of a scope's service price and availability overrides
 *  (spec 2026-10-09 §7). `document` is the override JSON. */
export interface CatalogueSet {
  id: string; scopeKey: string; stateCode: string; districtCode: string; revision: number; status: string;
  document: string; sourceDigest: string; createdBy: string; createdAt: string;
  publishedBy: string; publishedAt: string;
}
/** A service as owners at a scope are offered it; `source` is the scope that
 *  last changed it ('' = the code baseline). */
export interface CatalogueEntry {
  key: string; label: string; group: string; blurb: string; price: number; days: number;
  enabled: boolean; source: string;
  /** What the owner receives ("You get …"). */
  deliverable: string;
  /** Where it is offered: no states = everywhere; a chosen state with
   *  districts listed ("AP/GUNTUR") is limited to them. */
  states: string[]; districts: string[];
}
export interface CatalogueAdmin {
  scopeKey: string; stateCode: string; districtCode: string; current: CatalogueSet | null;
  services: CatalogueEntry[]; inherited: CatalogueEntry[]; scopes: CatalogueSet[];
}
export interface CatalogueEvent {
  id: string; setId: string; scopeKey: string; revision: number; actor: string;
  action: string; detail: string; sourceDigest: string; createdAt: string;
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
export interface GovernanceServiceVisual {
  serviceKey: string; assetKey: string; alt: string; caption: string;
}
export interface GovernanceWorkforceRule {
  key: string; category: string; title: string; rule: string; enforcement: string;
}
export interface GovernanceDocument {
  schemaVersion: number;
  jurisdiction: {
    countryCode: string; countryName: string; stateCode: string; stateName: string;
    districtCode: string; districtName: string; authorityName: string;
    /** Absent on documents saved before mandal/village scoping shipped, or
     *  wherever the scope is wider than a mandal or village. Read as '*'. */
    mandalCode?: string; mandalName?: string; villageCode?: string; villageName?: string;
    localTerms: Record<string, string>;
  };
  policy: { name: string; effectiveOn: string; reviewBy: string; legalNotice: string };
  propertyTypes: GovernancePropertyType[];
  guides: GovernanceGuide[];
  serviceRequests: GovernanceServiceGuide[];
  serviceVisuals?: GovernanceServiceVisual[];
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
export interface AssignedProfessionalCredential {
  kind: string; numberMasked: string; authority: string;
  issuedOn: string; expiresOn: string; state: string;
}
export interface AssignedTrainingCertificate {
  certificateNo: string; courseTitle: string; courseCode: string;
  issuedOn: string; validUntil: string; verificationState: string; verificationCode: string;
}
export interface AssignedResourceTrust {
  associateId: string; name: string; firm: string; initials: string; role: string;
  ratingAverage: number; ratingCount: number; professionalVerified: boolean;
  professionalCredentials: AssignedProfessionalCredential[];
  trainingCertificates: AssignedTrainingCertificate[];
}
export interface Order {
  id: string; kind: string; serviceKey: string; title: string; detail: string; assignee: string;
  cost: number; stage: number; stageLabel: string; needsYou: boolean;
  dueDate: string; recordId: string; recordTitle: string; params: string;
  /** The eight-valued truth behind the four-valued `stage`. `stageLabel` still
   *  says Placed / Assigned / On site / Delivered; `statusLabel` is the
   *  owner's word — "In progress", "Waiting on you", and "Placed" for an order
   *  the desk has sent out — which is what the row is actually about. Both are
   *  sent because the Rail draws one and the pill the other. */
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
  /** Public proof for the roster member assigned to this owner's service.
   * Contact details and uploaded evidence are intentionally absent. */
  assignedResource: AssignedResourceTrust | null;
}

/** A label/value the server has already decided how to word. `k`/`v` rather
 *  than `key`/`value` because `key` is React's, and a list of these is exactly
 *  what gets mapped. */
export interface Pair { k: string; v: string }

/** A file sent with a message: a storage node id (open it the way any stored
 *  file is opened) and what it is called. */
export interface TicketAttachment {
  fileRef: string; fileName: string; mimeType: string; sizeBytes: number;
}

/** One line of a ticket's trail. `headline` is composed at write time, so a
 *  2027 rewording cannot re-word a 2026 event, and new lines are already in
 *  the requester's words ("You placed this order", "Ravi Kumar started work").
 *
 *  On the OWNER's ticket the server has already cut the desk's working:
 *  no `dispatch` or `payment` rows, no status rows for the desk's offer moves
 *  (`dispatch`/`withdraw`), no refused move that was not the owner's own, and
 *  `detail` is '' on every kind but `message` and `refused` — so an old row's
 *  "BR-5388 · ordered from rec-…" never reaches the page. `kind` is one of
 *  status · message · nudge · deliverable · filed (plus dispatch · payment ·
 *  refused on the desk's read). `actorKind` is owner · worker · system: the
 *  page labels owner "You", worker "{name} · Provider", system "Pattadar desk". */
export interface TicketEvent {
  id: string; kind: string; action: string; headline: string; detail: string;
  actorLabel: string; actorKind: string; tone: string; at: string; atLabel: string;
  attachments: TicketAttachment[];
}

/** One of the owner's own files that went with the order, as its manifest froze
 *  it when the order was placed. `kind` is document · parcel_photo ·
 *  property_photo. */
export interface TicketFile { id: string; kind: string; title: string; fileRef: string }

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
 *  order is open (never after it is accepted or cancelled), the caller owns it, the assignee is a
 *  real associate, and that associate agreed at enrolment that an owner may
 *  see their number. Otherwise `contact` is '' and `contactShown` is false,
 *  with `contactWhy` giving the sentence to print instead. The client never
 *  reconstructs a number from anywhere else on the page: there is nowhere else
 *  on the page it is allowed to come from. */
export interface AssignedPerson {
  associateId: string; name: string; firm: string; initials: string;
  discipline: string; disciplineLabel: string;
  contact: string; contactShown: boolean; contactWhy: string;
  assignedAt: string; via: string;
}

/** Everything the OWNER's order page draws, in one read: a requester view
 *  (service order spec §7). It carries no dispatch data at all — no
 *  dispatches, no dispatch state, no provider workload; those are on
 *  `DeskTicket`.
 *
 *  `statusLabel` is the requester's word: `sent` reads "Placed", `on_site`
 *  reads "In progress". `can` is the owner's legal actions and only ever a
 *  subset of cancel · accept · send_back · message · nudge · rate, so a screen
 *  can never offer a button the API will refuse. `overdueDays` is whole days
 *  past `dueDate` (dd/mm/yyyy) while open, else 0. `askedAt` is the ISO time of
 *  the owner's last "Ask for an update" ('' when never); `nudge` leaves `can`
 *  for 24 hours after it. `files` are the owner's own files sent with the
 *  order. */
export interface TicketView {
  id: string; ref: string; kind: string; title: string; detail: string;
  recordId: string; recordTitle: string; recordPlace: string;
  status: string; statusLabel: string; statusState: string;
  stage: number; stageLabel: string; needsYou: boolean; closed: boolean;
  assignee: string; dueDate: string; quietDays: number; quiet: boolean;
  outcomeNote: string; acceptedAt: string; createdAt: string;
  can: string[]; answers: Pair[]; money: TicketMoney;
  /** Only what the order page draws: Verified and the rating. Credentials stay
   *  on the desk and in the Services list's proof panel (spec §7, §13). */
  assignedTo: AssignedPerson | null;
  assignedResource: Pick<AssignedResourceTrust, 'professionalVerified' | 'ratingAverage' | 'ratingCount'> | null;
  myRating: number; myRatingNote: string;
  events: TicketEvent[]; deliverables: TicketDeliverable[];
  ledger: TicketLedgerRow[];
  overdueDays: number; askedAt: string; files: TicketFile[];
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
export interface ServiceVisual {
  assetKey: string; src: string; alt: string; caption: string; sourceScope: string;
}
export interface ServiceOffer {
  key: string; label: string; price: number; group: string;
  blurb: string; days: number; shelves: string[]; fields: ServiceField[];
  visual: ServiceVisual;
  /** What lands in the owner's hands ("You get …"). */
  deliverable: string;
  /** The shelf a delivered paper is filed on. */
  filesTo: string;
  /** Legacy `work_requests.kind` values that mean this service. */
  aliases: string[];
  /** Its answers belong to one record, so it is never ordered for a set. */
  perRecord: boolean;
  /** The field to answer when the land is not on the map; '' when none. */
  directionsField: string;
  guides: ServiceGuide[];
  /** Words owners use for it, for free-text matching. */
  synonyms: string[];
  alsoCalled: string;
  flatPriceNote: string;
  featured: boolean;
}
/** A University page for a service in one state: a record guide (`slug`) or
 *  a topic on the state guide (`topic` + `title`). */
export interface ServiceGuide {
  state: string; slug: string; topic: string; title: string; ownPaper: boolean;
}

export interface ServiceBatchReceipt {
  batchId: string; ref: string; orderCount: number; total: number;
}

// ── Query documents ────────────────────────────────────────────────────

const CARD = `id kind title passbookId groupId subtitle classification status stake khataNo ownerName
  village mandal district placeLine extent extentUnit extentAlt marketValue tags
  lat lon ring coverFileRef
  extentDetail paperCount photoCount featureCount deedLine litigation paperFileRef
  groupName holderLabel holdingId holdingName surveyNo docNo sro regDate
  parentage coOwnerCount managerLine managerCount purchasePrice purchaseDate
  mutationStatus ecStatus createdAt lastActivityAt lastActivityBy lastActivityAction`;

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

const Q_PROPERTIES = `query P($kinds:[String!],$statuses:[String!],$stakes:[String!],$villages:[String!],$khatas:[String!],$owners:[String!],$tags:[String!],$groups:[String!],$holdings:[String!]) {
  web { properties(kinds:$kinds,statuses:$statuses,stakes:$stakes,villages:$villages,khatas:$khatas,owners:$owners,tags:$tags,groups:$groups,holdings:$holdings) {
    shown total hidden filterSummary hiddenPlaces activeCount
    cards { ${CARD} }
    facets { key label options { key label count active } }
  } } }`;

const Q_RECORD = `query R($id:String!) { web { record(id:$id) {
  id kind title eyebrow classification status stake khataNo ownerName
  village mandal district placeLine
  placeLineTe state extent extentUnit extentDetail marketValue perUnitValue perUnitLabel
  boughtYear lat lon ring mapCaption paperCount featureCount peopleCount serviceCount
  photoCount mediaCount photoNote tags noteBody noteAuthor noteAt combinedId combinedName
  groupId groupName holderLabel surveyNo docNo sro regDate
} } }`;

const Q_PAPERS = `query D($id:String!) { web { papers(recordId:$id) {
  id title detail shelf icon tags shared pageCount fileRef mimeType recordId recordTitle createdAt jointFmbId
  linkedProperties { id title kind documentId }
} } }`;

const Q_FEATURES = `query F($id:String!) { web { features(recordId:$id) {
  total needsRepair walkedOn walkedBy
  categories { key label count active }
  features { id label spec icon category condition conditionState note lat lon
             pinLabel photoCount actions typeKey schemaVersion attributes geometry version
             costTotal costCount receiptCount }
  types { key label category icon geometryKind schemaVersion
          fields { key label kind unit placeholder options required dependsOn dependsValue } }
} } }`;

const Q_OWNERS = `query OW($id:String!) { web { owners(recordId:$id) {
  count currentName
  owners { id name initials parentage address role isCurrent acquiredVia photoRef }
} } }`;

const Q_PEOPLE = `query PE($id:String!) { web { people(recordId:$id) {
  count monthlyOut seasonalIn walletBalance walletNote walletLive
  people { id name initials role badges summary arrangement payLabel payValue
           dueLabel dueValue visibility actions compact photoRef }
  payments { id title subtitle occurredOn method amount direction state }
} } }`;

const TRANSFER_PARTY_FIELDS = `id side ownerId name parentage address
  extent extentUnit shareNum shareDen isGpa shareLabel extentLabel`;

const Q_TRANSFERS = `query TR($id:String!) { web { transfers(recordId:$id) {
  count unverifiedCount
  transfers {
    id kind deedDocumentId deedNo sro registeredOn priorTransferId note source verified
    fromParties { ${TRANSFER_PARTY_FIELDS} }
    toParties { ${TRANSFER_PARTY_FIELDS} }
  }
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
  fileRef mimeType docNo nameSet
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

export function useGeographyReference(
  stateId: string, districtId: string, mandalId: string, enabled = true,
) {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
    enabled,
    queryKey: [KEY, 'geographyReference', stateId, districtId, mandalId],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const data = await gql<{
        states: GeographyRow[];
        districtsByState: GeographyRow[];
        mandalsByDistrict: GeographyRow[];
        villagesByMandal: GeographyRow[];
        referenceDataSources: ReferenceDataSource[];
        referenceDataSyncRuns: ReferenceDataSyncRun[];
        referenceDataSummary: GeographyReference['summary'];
      }>(`query GeographyReference($stateId:String!,$districtId:String!,$mandalId:String!) {
        states { id name code lgdCode nameLocal sourceId sourceUrl sourceEffectiveAt active }
        districtsByState(stateId:$stateId) {
          id name code lgdCode nameLocal stateId stateName stateLgdCode
          sourceId sourceUrl sourceEffectiveAt active
        }
        mandalsByDistrict(districtId:$districtId) {
          id name code lgdCode nameLocal districtId districtName districtLgdCode
          stateId stateName stateLgdCode governmentLevelName
          sourceId sourceUrl sourceEffectiveAt active
        }
        villagesByMandal(mandalId:$mandalId) {
          id name code lgdCode nameLocal mandalId mandalName mandalLgdCode
          districtId districtName districtLgdCode stateId stateName stateLgdCode
          census2011Code sourceId sourceUrl sourceEffectiveAt active
        }
        referenceDataSources {
          id name authority description catalogUrl publisherUrl licenseName licenseUrl cadence updatedAt
        }
        referenceDataSyncRuns(limit:20) {
          id sourceId mode status sourceEffectiveAt startedAt finishedAt countsJson
        }
        referenceDataSummary { states districts mandals villages lastCompletedAt sourceName }
      }`, { stateId, districtId, mandalId });
      return {
        states: data.states ?? [], districts: data.districtsByState ?? [],
        mandals: data.mandalsByDistrict ?? [], villages: data.villagesByMandal ?? [],
        sources: data.referenceDataSources ?? [], runs: data.referenceDataSyncRuns ?? [],
        summary: data.referenceDataSummary,
      } satisfies GeographyReference;
    },
  });
}

const GOVERNANCE_FIELDS = `id scopeKey countryCode stateCode districtCode mandalCode villageCode
  revision status schemaVersion document sourceDigest createdBy createdAt publishedBy publishedAt`;

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
  countryCode = 'IN', stateCode = 'AP', districtCode = '*',
  mandalCode = '*', villageCode = '*', enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'governance', countryCode, stateCode, districtCode, mandalCode, villageCode],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => (await gql<Wrapped<'governancePolicy', GovernancePolicy | null>>(
      `query GP($countryCode:String!,$stateCode:String!,$districtCode:String!,
                $mandalCode:String!,$villageCode:String!) {
        web { governancePolicy(countryCode:$countryCode,stateCode:$stateCode,districtCode:$districtCode,
              mandalCode:$mandalCode,villageCode:$villageCode) {
          ${GOVERNANCE_FIELDS}
        } }
      }`, { countryCode, stateCode, districtCode, mandalCode, villageCode },
    )).web.governancePolicy,
  });
}

/** Intelligence (super-admin): which AI reads documents. `providers` is the
 *  server's registry, so a new provider appears with no client change.
 *  Credentials are write-only; the server says only where one comes from. */
export type IntelligenceProviderId = string;
/** `unreadable`: saved, but it no longer decrypts; Claude reads meanwhile. */
export interface IntelligenceCredential { source: '' | 'form' | 'server' | 'unreadable'; updatedAt: string }
export interface IntelligenceProvider {
  id: IntelligenceProviderId; name: string; vendor: string; model: string;
  models: { id: string; name: string }[]; modelsCheckedAt: string; key: IntelligenceCredential;
  /** Why it cannot read documents yet; '' = ready. */
  needs: string;
}
export interface IntelligenceSettings {
  reader: IntelligenceProviderId; activeReader: IntelligenceProviderId;
  providers: IntelligenceProvider[];
  ocr: { enabled: boolean; processor: string; account: IntelligenceCredential };
  updatedAt: string;
  /** False: the server has no PLATFORM_SECRETS_KEY, so keys come from its env only. */
  canStoreCredentials: boolean;
}
const INTELLIGENCE_FIELDS = `reader activeReader updatedAt canStoreCredentials
  providers { id name vendor model models { id name } modelsCheckedAt key { source updatedAt } needs }
  ocr { enabled processor account { source updatedAt } }`;

/** Null for anyone but a super-admin (the server decides). */
export function useIntelligenceSettings(enabled = true) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'intelligence'],
    queryFn: async () => (await gql<Wrapped<'intelligenceSettings', IntelligenceSettings | null>>(
      `query IS { web { intelligenceSettings { ${INTELLIGENCE_FIELDS} } } }`,
    )).web.intelligenceSettings,
  });
}

export function useGovernanceAdminPolicy(
  countryCode = 'IN', stateCode = '*', districtCode = '*',
  mandalCode = '*', villageCode = '*', enabled = true,
) {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
    enabled,
    queryKey: [KEY, 'governanceAdmin', countryCode, stateCode, districtCode, mandalCode, villageCode],
    queryFn: async () => (await gql<Wrapped<'governanceAdminPolicy', GovernancePolicy | null>>(
      `query GAP($countryCode:String!,$stateCode:String!,$districtCode:String!,
                 $mandalCode:String!,$villageCode:String!) {
        web { governanceAdminPolicy(countryCode:$countryCode,stateCode:$stateCode,
              districtCode:$districtCode,mandalCode:$mandalCode,villageCode:$villageCode) {
          ${GOVERNANCE_FIELDS}
        } }
      }`, { countryCode, stateCode, districtCode, mandalCode, villageCode },
    )).web.governanceAdminPolicy,
  });
}

const CATALOGUE_SET = `id scopeKey stateCode districtCode revision status document sourceDigest
  createdBy createdAt publishedBy publishedAt`;
const CATALOGUE_ENTRY = 'key label group blurb deliverable price days enabled source states districts';

export function useServiceCatalogueAdmin(stateCode = '*', districtCode = '*', enabled = true) {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
    enabled,
    queryKey: [KEY, 'serviceCatalogueAdmin', stateCode, districtCode],
    queryFn: async () => (await gql<Wrapped<'serviceCatalogueAdmin', CatalogueAdmin | null>>(
      `query SCA($stateCode:String!,$districtCode:String!) { web {
        serviceCatalogueAdmin(stateCode:$stateCode,districtCode:$districtCode) {
        scopeKey stateCode districtCode current { ${CATALOGUE_SET} }
        services { ${CATALOGUE_ENTRY} } inherited { ${CATALOGUE_ENTRY} }
        scopes { ${CATALOGUE_SET} }
      } } }`, { stateCode, districtCode },
    )).web.serviceCatalogueAdmin,
  });
}

/** Every revision at one place, newest first: the versions to reopen,
 *  restore as a new draft, or publish. */
export function useServiceCatalogueRevisions(stateCode = '*', districtCode = '*', enabled = true) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'serviceCatalogueRevisions', stateCode, districtCode],
    queryFn: async () => (await gql<Wrapped<'serviceCatalogueRevisions', CatalogueSet[]>>(
      `query SCR($stateCode:String!,$districtCode:String!) { web {
        serviceCatalogueRevisions(stateCode:$stateCode,districtCode:$districtCode) { ${CATALOGUE_SET} }
      } }`, { stateCode, districtCode },
    )).web.serviceCatalogueRevisions,
  });
}

export function useServiceCatalogueHistory(stateCode = '*', districtCode = '*', enabled = true) {
  return useQuery({
    enabled,
    queryKey: [KEY, 'serviceCatalogueHistory', stateCode, districtCode],
    queryFn: async () => (await gql<Wrapped<'serviceCatalogueHistory', CatalogueEvent[]>>(
      `query SCH($stateCode:String!,$districtCode:String!) { web {
        serviceCatalogueHistory(stateCode:$stateCode,districtCode:$districtCode) {
        id setId scopeKey revision actor action detail sourceDigest createdAt
      } } }`, { stateCode, districtCode },
    )).web.serviceCatalogueHistory,
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
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
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
  kinds: string[]; statuses: string[]; stakes: string[];
  /** Village and khata are two facets, not one: a village is a place and a
   *  khata is a revenue-record number, and each narrows within itself by OR
   *  and against the other by AND (this village AND that khata). */
  villages: string[]; khatas: string[];
  /** Owner name as it reads on the card — a parcel inherits its passbook's
   *  owner, a built property carries its own. */
  owners: string[];
  tags: string[];
  /** Family / group ids, plus `'personal'` for holdings in your own name.
   *  This is what Families & Groups deep-links into: one filter on the real
   *  Properties screen rather than a second list screen of its own. */
  groups: string[];
  /** Holding ids, plus `'none'` (NOT_IN_HOLDING) for properties in no holding.
   *  The "Holding" facet, next to "Holder" (facet key `group`). */
  holdings: string[];
}

/** The facet key for "in your own name" — mirrors PERSONAL in web360.py. */
export const PERSONAL_GROUP = 'personal';
/** The facet key for "Not in a holding" — mirrors NOT_IN_HOLDING in web360.py. */
export const NOT_IN_HOLDING = 'none';
/** What a property held by no family or group says — mirrors OWN_NAME. */
export const OWN_NAME = 'In your own name';
export const EMPTY_FILTER: PropertyFilter = {
  kinds: [], statuses: [], stakes: [], villages: [], khatas: [], owners: [], tags: [], groups: [],
  holdings: [],
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

/** Rewrites a note in place. `updateNote` answers null when the note is not
 *  the caller's or is gone, which the screen reports itself. */
export const useUpdateNote = (reportError = true) =>
  useW360Mutation<{ id: string; body: string }, { updateNote: { id: string } | null }>(
    `mutation UN($id:String!,$body:String!) { updateNote(id:$id,body:$body) { id } }`,
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

export function useOwners(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'owners', id],
    queryFn: async () => (await gql<Wrapped<'owners', OwnersView>>(Q_OWNERS, { id })).web.owners,
  });
}

export function useTransfers(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'transfers', id],
    queryFn: async () =>
      (await gql<Wrapped<'transfers', TransfersView>>(Q_TRANSFERS, { id })).web.transfers,
  });
}

// ── The master record (Overview tab) ──────────────────────────────────
// docs/specs/2026-10-11-property-overview.md §3. One query of its own, so the
// other tabs do not pay for the claims and the summary.

/** Who said a field's value: a deed reading, the public record, a passbook
 *  reading, the owner, or a value from before sources were kept. */
export interface RecordFieldSource {
  source: string; label: string; sourceRef: string; documentId: string; setAt: string; confidence: string;
}
export interface RecordFieldClaim { id: string; value: string; display: string; source: RecordFieldSource }
export interface RecordField {
  key: string;
  /** identity | physical | title | status */
  group: string;
  label: string; value: string; display: string;
  important: boolean; howToFill: string;
  /** null = not set. */
  source: RecordFieldSource | null;
  /** Later claims that disagree with the value shown. */
  conflicts: RecordFieldClaim[];
}
export interface AcquisitionParty {
  name: string; parentage: string; role: string; relationship: string;
  shareNum: number; shareDen: number; isGpa: boolean;
}
export interface RecordAcquisition {
  mode: string; modeLabel: string; registered: string;
  docNo: string; regDate: string; execDate: string; sro: string;
  consideration: number; govtValue: number; stampDuty: number;
  proofNo: string; transferId: string; deedDocumentId: string;
  fromParties: AcquisitionParty[]; toParties: AcquisitionParty[];
  chainLength: number; source: RecordFieldSource | null;
}
export interface RecordSummary {
  paperCount: number; newestPaper: string; newestPaperAt: string;
  featureCount: number; featureAttention: number; ownerCount: number;
  hasPin: boolean; hasOutline: boolean; photoCount: number; mediaCount: number;
  noteCount: number; newestNoteAt: string;
  servicesOpen: number; servicesDone: number;
  paidTotal: number; marketTotal: number;
  newestActivity: string; newestActivityAt: string;
}
export interface RecordOverview {
  id: string; fields: RecordField[]; acquisition: RecordAcquisition | null;
  summary: RecordSummary; conflictCount: number; missing: RecordField[];
  /** 'parcel' when a property reads as farmland saved as a plot (Reddy,
   *  12/10/2026, D1), with the reason in words; '' otherwise. */
  suggestKind: string; suggestReason: string;
  /** What changing this property to agricultural land would do, worked out by
   *  the server's own conversion code; null on farmland, or when its unit
   *  cannot convert (the change then says why). */
  convertTarget: ConvertTarget | null;
  /** The Compliance check, run on every read (services/api/src/compliance.py). */
  compliance: RecordCompliance | null;
}
export interface ComplianceCheck {
  key: string; label: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown' | string;
  /** One line: what was found, or why it cannot be told. */
  detail: string;
  /** add: the field `fieldKey`'s drawer · upload: a document · order: the service `serviceKind`. */
  action: 'add' | 'upload' | 'order' | 'none' | string;
  fieldKey: string; serviceKind: string;
}
export interface RecordCompliance {
  /** UTC, ISO. */
  checkedAt: string; passed: number; total: number; checks: ComplianceCheck[];
}
export interface ConvertTarget {
  /** true: it joins the khata `khataNo` the owner already has in `village`. */
  reuse: boolean; khataNo: string; village: string;
  fromArea: number; fromUnit: string; acres: number;
}
export interface AcquisitionPartyInput {
  name: string; parentage?: string; relationship?: string; role?: string; shareNum?: number; shareDen?: number;
}
export interface AcquisitionInput {
  mode: string; registered?: string; docNo?: string; regDate?: string; execDate?: string; sro?: string;
  consideration?: number; govtValue?: number; stampDuty?: number; proofNo?: string;
  fromParties?: AcquisitionPartyInput[];
}

const SOURCE = 'source label sourceRef documentId setAt confidence';
const FIELD = `key group label value display important howToFill
  source { ${SOURCE} } conflicts { id value display source { ${SOURCE} } }`;
const PARTY = 'name parentage role relationship shareNum shareDen isGpa';
const OVERVIEW = `id conflictCount suggestKind suggestReason
  convertTarget { reuse khataNo village fromArea fromUnit acres }
  fields { ${FIELD} }
  missing { ${FIELD} }
  acquisition { mode modeLabel registered docNo regDate execDate sro consideration govtValue stampDuty
    proofNo transferId deedDocumentId chainLength
    fromParties { ${PARTY} } toParties { ${PARTY} } source { ${SOURCE} } }
  compliance { checkedAt passed total checks { key label status detail action fieldKey serviceKind } }
  summary { paperCount newestPaper newestPaperAt featureCount featureAttention ownerCount
    hasPin hasOutline photoCount mediaCount noteCount newestNoteAt servicesOpen servicesDone
    paidTotal marketTotal newestActivity newestActivityAt }`;

const Q_RECORD_OVERVIEW = `query RO($id:String!) { web { recordOverview(id:$id) { ${OVERVIEW} } } }`;

export function useRecordOverview(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'recordOverview', id],
    queryFn: async () =>
      (await gql<Wrapped<'recordOverview', RecordOverview | null>>(Q_RECORD_OVERVIEW, { id })).web.recordOverview,
  });
}

/** The owner's own entry for one or more fields (a `manual` claim each). */
export const useSetRecordFields = (reportError = false) =>
  useW360Mutation<
    { recordId: string; fields: { key: string; value: string }[] },
    Wrapped<'setRecordFields', RecordOverview>
  >(
    `mutation SRF($recordId:String!,$fields:[FieldValueInput!]!) {
       web { setRecordFields(recordId:$recordId, fields:$fields) { id } } }`,
    'Those details',
    reportError,
  );

/** How the land was acquired, as the owner tells it. */
export const useSetAcquisition = () =>
  useW360Mutation<{ recordId: string; input: AcquisitionInput }, Wrapped<'setAcquisition', RecordOverview>>(
    `mutation SA($recordId:String!,$input:AcquisitionInput!) {
       web { setAcquisition(recordId:$recordId, input:$input) { id } } }`,
    'Title',
    false,
  );

/** "Use this" on a disagreeing claim: the owner adopts it as their own.
 *  `claimId: 'keep'` is "Keep mine": the value shown becomes the owner's own
 *  entry and the conflict clears. */
export const useChooseFieldClaim = () =>
  useW360Mutation<{ recordId: string; key: string; claimId: string }, Wrapped<'chooseFieldClaim', RecordOverview>>(
    `mutation CFC($recordId:String!,$key:String!,$claimId:String!) {
       web { chooseFieldClaim(recordId:$recordId, key:$key, claimId:$claimId) { id } } }`,
    'That choice',
  );

/** Move a property to the farmland register: same id and address, the extent
 *  in acres, under a khata (D1). The server refuses one with a building. */
export const useConvertRecordKind = () =>
  useW360Mutation<{ recordId: string; to: 'parcel' }, Wrapped<'convertRecordKind', RecordOverview>>(
    `mutation CRK($recordId:String!,$to:String!) {
       web { convertRecordKind(recordId:$recordId, to:$to) { id } } }`,
    'The change to agricultural land',
    false,
  );

/** File a deed reading onto the record: the server loads the caller's own
 *  read job and writes the acquisition and its claims in one transaction.
 *  It refreshes the tree like every other write: with the refresh off, the
 *  Overview kept its pre-deed read after "Upload the deed" had filed it. */
export const useFileDeedReading = () =>
  useW360Mutation<{ recordId: string; paperId: string; jobId: string }, Wrapped<'fileDeedReading', RecordOverview>>(
    `mutation FDR($recordId:String!,$paperId:String!,$jobId:String!) {
       web { fileDeedReading(recordId:$recordId, paperId:$paperId, jobId:$jobId) { id } } }`,
    'The deed reading',
    false,
  );

export function useBoundary(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'boundary', id],
    queryFn: async () =>
      (await gql<Wrapped<'boundary', BoundaryView | null>>(Q_BOUNDARY, { id })).web.boundary,
  });
}

/** The Hydrogeology layer's answer for one elevation map (services/api/src/terrain.py).
 *  Lines run downstream; coordinates are GeoJSON [lon, lat]. */
export type FlowConfidence = 'high' | 'medium' | 'low';
export type FlowMap = 'combined' | 'srtm' | 'nasadem' | 'aw3d30' | 'copernicus';
type GeoPolygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
export interface FlowArea { area_ha: number; geometry: GeoPolygon }
export interface FlowPin {
  rank: number; lat: number; lon: number; confidence: FlowConfidence; upslope_ha: number;
  junction: boolean; agree: number; families: Record<string, boolean>; moved_m: number;
  elevation_m: number; reason: string; catchment: FlowArea | null;
}
export interface WaterFlowData {
  parcel: { centroid: [number, number]; area_ha: number; relief_1km_m: number; terrain: string };
  map: FlowMap;
  lines: { features: Array<{ properties: { upslope_ha: number; agree: number };
    geometry: { coordinates: Array<[number, number]> } }> };
  points: FlowPin[];
  main_stream: { upslope_ha: number; distance_m: number; bearing: string; agree: number;
    crosses_parcel: boolean; catchment: FlowArea | null } | null;
  summary: Array<{ map: FlowMap; confidence: FlowConfidence | null; upslope_ha: number | null; agree: number | null }>;
}
export interface WaterFlowView {
  status: 'ready' | 'computing' | 'unavailable' | 'failed';
  reason: string;
  data: WaterFlowData | null;
}

/** How often a computing reading is asked about again. */
const POLL_SECONDS = 4;

const Q_WATER_FLOW = `query WF($id:String!,$source:String!,$retry:Boolean!) { web { waterFlow(recordId:$id,source:$source,retry:$retry) {
  status reason data
} } }`;

async function fetchWaterFlow(id: string | undefined, source: FlowMap, retry = false): Promise<WaterFlowView | null> {
  const v = (await gql<Wrapped<'waterFlow', (Omit<WaterFlowView, 'data'> & { data: string }) | null>>(
    Q_WATER_FLOW, { id, source, retry })).web.waterFlow;
  return v && { ...v, data: v.data ? (JSON.parse(v.data) as WaterFlowData) : null };
}

/** The other maps' answers, for drawing their lines faintly beside the chosen
 *  one. Same cache entries as useWaterFlow, so switching to one is instant. */
export function useWaterFlowOthers(id: string | undefined, sources: FlowMap[], enabled: boolean) {
  return useQueries({
    queries: sources.map((source) => ({
      enabled: !!id && enabled,
      queryKey: [KEY, 'waterFlow', id, source],
      queryFn: () => fetchWaterFlow(id, source),
      staleTime: 10 * 60_000,
      refetchInterval: (q: { state: { data?: WaterFlowView | null } }) =>
        (q.state.data?.status === 'computing' ? POLL_SECONDS * 1000 : false),
    })),
  });
}

/** A first reading takes about half a minute, so it is asked again every few
 *  seconds while the server says it is computing, and never otherwise. */
export function useWaterFlow(id: string | undefined, source: FlowMap, enabled: boolean) {
  return useQuery({
    enabled: !!id && enabled,
    queryKey: [KEY, 'waterFlow', id, source],
    queryFn: () => fetchWaterFlow(id, source),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'computing' ? POLL_SECONDS * 1000 : false),
    refetchIntervalInBackground: false,
  });
}

/** Try again on a failed reading. A plain refetch is served the cached
 *  failure for STALE_MINUTES (services/api/src/terrain.py); this asks the
 *  server to read it again now, and the answer ("computing") starts the poll. */
export function useRetryWaterFlow(id: string | undefined, source: FlowMap) {
  const qc = useQueryClient();
  const key = [KEY, 'waterFlow', id, source];
  return () => fetchWaterFlow(id, source, true)
    .then((v) => { qc.setQueryData(key, v); })
    .catch(() => qc.invalidateQueries({ queryKey: key }));
}

/** Area rainfall around a record, for its NASA POWER grid cell
 *  (services/api/src/weather.py). Dates are ISO; the screen formats them. */
export interface RainfallView {
  status: 'ready' | 'unavailable' | 'failed';
  reason: string;
  source: string;
  cellLabel: string;
  asOf: string;
  last7Mm: number | null;
  last30Mm: number | null;
  seasonFrom: string;
  seasonMm: number | null;
  normalMm: number | null;
  seasonPct: number | null;
  tMax7: number | null;
  tMin7: number | null;
  months: Array<{ month: string; mm: number; normalMm: number }>;
}

const Q_RAINFALL = `query RF($id:String!,$retry:Boolean!) { web { rainfall(recordId:$id,retry:$retry) {
  status reason source cellLabel asOf last7Mm last30Mm seasonFrom seasonMm normalMm seasonPct
  tMax7 tMin7 months { month mm normalMm }
} } }`;

async function fetchRainfall(id: string | undefined, retry = false): Promise<RainfallView | null> {
  return (await gql<Wrapped<'rainfall', RainfallView | null>>(Q_RAINFALL, { id, retry })).web.rainfall;
}

/** POWER is 2–7 days behind and the server keeps an answer for six hours, so
 *  one read per visit is plenty. `enabled` is false for a record with no place. */
export function useRainfall(id: string | undefined, enabled: boolean) {
  return useQuery({
    enabled: !!id && enabled,
    queryKey: [KEY, 'rainfall', id],
    queryFn: () => fetchRainfall(id),
    staleTime: 60 * 60_000,
  });
}

/** Try again on a failed read. A plain refetch is served the remembered
 *  failure for ten minutes (weather.FAILED_MINUTES); this asks POWER now. */
export function useRetryRainfall(id: string | undefined) {
  const qc = useQueryClient();
  const key = [KEY, 'rainfall', id];
  return () => fetchRainfall(id, true)
    .then((v) => { qc.setQueryData(key, v); })
    .catch(() => qc.invalidateQueries({ queryKey: key }));
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
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
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
  id title detail shelf icon tags shared pageCount fileRef mimeType recordId recordTitle createdAt jointFmbId
  folderId sizeBytes aadhaarCard docNo registeredOn office nameSet fileName
  linkedProperties { id title kind documentId }
} } }`;

const Q_VAULT_FOLDERS = `query VF { web { vaultFolders {
  id name parentId fileCount folderCount createdAt personId
} } }`;

/** Every folder the owner has made, flat. Documents draws its breadcrumbs,
 *  its folder rows and its move-to picker from this one read. */
export function useVaultFolders() {
  return useQuery({
    queryKey: [KEY, 'vaultFolders'],
    queryFn: async () =>
      (await gql<Wrapped<'vaultFolders', VaultFolder[]>>(Q_VAULT_FOLDERS)).web.vaultFolders,
  });
}

// Folder writes that a dialog answers itself (a clash, a bad name) report no
// toast of their own: the dialog stays open and says why, in place.
export const useCreateVaultFolder = () =>
  useW360Mutation<{ name: string; parentId: string }, Wrapped<'createVaultFolder', string>>(
    `mutation CVF($name:String!,$parentId:String!) {
       web { createVaultFolder(name:$name,parentId:$parentId) } }`,
    'That folder', false,
  );

export const useRenameVaultFolder = () =>
  useW360Mutation<{ folderId: string; name: string }, Wrapped<'renameVaultFolder', boolean>>(
    `mutation RVF($folderId:String!,$name:String!) {
       web { renameVaultFolder(folderId:$folderId,name:$name) } }`,
    'That folder', false,
  );

export const useMoveVaultFolder = () =>
  useW360Mutation<{ folderId: string; parentId: string }, Wrapped<'moveVaultFolder', boolean>>(
    `mutation MVF($folderId:String!,$parentId:String!) {
       web { moveVaultFolder(folderId:$folderId,parentId:$parentId) } }`,
    'Moving that folder', false,
  );

export const useDeleteVaultFolder = () =>
  useW360Mutation<{ folderId: string }, Wrapped<'deleteVaultFolder', boolean>>(
    `mutation DVF($folderId:String!) { web { deleteVaultFolder(folderId:$folderId) } }`,
    'Removing that folder', false,
  );

export const useMovePapersToFolder = () =>
  useW360Mutation<{ paperIds: string[]; folderId: string }, Wrapped<'movePapersToFolder', number>>(
    `mutation MPF($paperIds:[String!]!,$folderId:String!) {
       web { movePapersToFolder(paperIds:$paperIds,folderId:$folderId) } }`,
    'Moving those files', false,
  );

export const useTagPapers = () =>
  useW360Mutation<{ paperIds: string[]; tag: string; on: boolean }, Wrapped<'tagPapers', number>>(
    `mutation TP($paperIds:[String!]!,$tag:String!,$on:Boolean!) {
       web { tagPapers(paperIds:$paperIds,tag:$tag,on:$on) } }`,
    'That tag', false,
  );

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

/** Files a selected set of private vault items under one property the owner controls. */
export const useLinkPapers = () =>
  useW360Mutation<{ paperIds: string[]; recordIds: string[] }, Wrapped<'linkPapers', boolean>>(
    `mutation LP($paperIds:[String!]!,$recordIds:[String!]!) {
       web { linkPapers(paperIds:$paperIds,recordIds:$recordIds) } }`,
    'Those documents',
  );

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
  assignedResource { associateId name firm initials role ratingAverage ratingCount professionalVerified
    professionalCredentials { kind numberMasked authority issuedOn expiresOn state }
    trainingCertificates { certificateNo courseTitle courseCode issuedOn validUntil verificationState verificationCode } }
} } }`;

/** The whole ticket in one round trip. It is a lot of fields, but they are all
 *  drawn on the one page, and splitting them would mean the trail, the money
 *  and the deliverables could disagree about which moment they describe. */
const TICKET_EVENT = `id kind action headline detail actorLabel actorKind tone at atLabel
  attachments { fileRef fileName mimeType sizeBytes }`;

const TICKET_DELIVERABLE = `id kind label note fileRef fileName mimeType sizeBytes payload
  submittedBy submittedAt fileAs fileTargets { k v } goesTo
  review reviewNote filedTable filedId filedAt`;

const Q_TICKET = `query TKT($id:String!) { web { ticket(id:$id) {
  id ref kind title detail recordId recordTitle recordPlace
  status statusLabel statusState stage stageLabel needsYou closed
  assignee dueDate quietDays quiet outcomeNote acceptedAt createdAt
  overdueDays askedAt files { id kind title fileRef }
  can answers { k v }
  myRating myRatingNote
  assignedTo { associateId name firm initials discipline disciplineLabel
               contact contactShown contactWhy assignedAt via }
  assignedResource { professionalVerified ratingAverage ratingCount }
  money { quoted held released fee returned payeeShare provider live funded headline honesty }
  events { ${TICKET_EVENT} }
  deliverables { ${TICKET_DELIVERABLE} }
  ledger { id entry label amount fromBucket toBucket payee provider simulated status note ticketId ticketRef at }
} } }`;

const Q_WALLET = `query WAL($limit:Int) { web { wallet(limit:$limit) {
  available setAside paidOut putIn autoTopUp provider live notice
  jobs { ticketId ref title recordTitle statusLabel held }
  rows { id entry label amount fromBucket toBucket payee provider simulated status note ticketId ticketRef at }
} } }`;

/** Every field of a ServiceOffer, read the same way wherever the catalogue is. */
const SERVICE_OFFER_FIELDS = `key label price group blurb days shelves fields { name label kind required options help }
  visual { assetKey src alt caption sourceScope }
  deliverable filesTo aliases perRecord directionsField
  guides { state slug topic title ownPaper }
  synonyms alsoCalled flatPriceNote featured`;

const Q_SERVICES = `query SO($q:String,$key:String,$recordId:String) { web { servicesOffered(q:$q,key:$key,recordId:$recordId) {
  ${SERVICE_OFFER_FIELDS}
} } }`;

/** What each chosen property can order, priced for its own state and
 *  district (the order page's second step). Off until something is chosen. */
export function useServicesForRecords(recordIds: string[]) {
  return useQuery({
    enabled: recordIds.length > 0,
    queryKey: [KEY, 'servicesForRecords', [...recordIds].sort().join(',')],
    // Adding or dropping a property keeps the last answer on screen (dimmed)
    // instead of blanking the table while the new prices load.
    placeholderData: keepPreviousData,
    queryFn: async () => (await gql<Wrapped<'servicesForRecords', { recordId: string; offers: ServiceOffer[] }[]>>(
      `query SFR($recordIds:[String!]!) { web { servicesForRecords(recordIds:$recordIds) {
        recordId offers { ${SERVICE_OFFER_FIELDS} }
      } } }`, { recordIds },
    )).web.servicesForRecords,
  });
}

/** No `enabled`: the Shell asks for this on every route to count what is
 *  waiting on you. `includeClosed` defaults false so every caller that was
 *  written before tickets existed asks for, and gets, exactly what it did. */
export function useOrders(recordId?: string, includeClosed = false, alwaysFresh = false) {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
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

/** Correct one recorded purchase lot in place (web360 `update_purchase`).
 *  Same fields as savePurchase; the server derives the rate again and answers
 *  false for a lot that is not the caller's. */
export const useUpdatePurchase = () =>
  useW360Mutation<{
    lotId: string; boughtOn: string; paid: number; extent: number;
    extentUnit: string; govtValue: number; seller: string; deedNo: string; sro: string;
  }, Wrapped<'updatePurchase', boolean>>(
    `mutation UPu($lotId:String!,$boughtOn:String!,$paid:Float!,$extent:Float!,
                  $extentUnit:String!,$govtValue:Float!,$seller:String!,$deedNo:String!,$sro:String!) {
       web { updatePurchase(lotId:$lotId,boughtOn:$boughtOn,paid:$paid,extent:$extent,
                            extentUnit:$extentUnit,govtValue:$govtValue,seller:$seller,
                            deedNo:$deedNo,sro:$sro) } }`,
    'That correction',
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
export const useAddPhoto = (invalidate = true, reportError = true) =>
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
    reportError,
    invalidate,
  );

export const useAddPerson = () =>
  useW360Mutation<{
    recordId: string; personName: string; role: string; summary: string;
    arrangement: string; payLabel: string; payValue: string; photoRef: string;
  }, Wrapped<'addPerson', string>>(
    `mutation APe($recordId:String!,$personName:String!,$role:String!,$summary:String!,
                  $arrangement:String!,$payLabel:String!,$payValue:String!,$photoRef:String!) {
       web { addPerson(recordId:$recordId,personName:$personName,role:$role,summary:$summary,
                       arrangement:$arrangement,payLabel:$payLabel,payValue:$payValue,
                       photoRef:$photoRef) } }`,
    'That person',
    false,
  );

export const useUpdatePerson = () =>
  useW360Mutation<{
    personId: string; personName: string; role: string; summary: string; photoRef: string;
  }, Wrapped<'updatePerson', boolean>>(
    `mutation UPe($personId:String!,$personName:String!,$role:String!,$summary:String!,$photoRef:String!) {
       web { updatePerson(personId:$personId,personName:$personName,role:$role,summary:$summary,
                          photoRef:$photoRef) } }`,
    'That person',
    false,
  );

export const useDeletePerson = () =>
  useW360Mutation<{ personId: string }, Wrapped<'deletePerson', boolean>>(
    `mutation DPe($personId:String!) { web { deletePerson(personId:$personId) } }`,
    'Removing that person',
    false,
  );

export const useAddOwner = () =>
  useW360Mutation<{
    recordId: string; name: string; parentage: string; address: string;
    role: string; isCurrent: boolean; acquiredVia: string; photoRef: string;
  }, Wrapped<'addOwner', string>>(
    `mutation AOw($recordId:String!,$name:String!,$parentage:String!,$address:String!,
                  $role:String!,$isCurrent:Boolean!,$acquiredVia:String!,$photoRef:String!) {
       web { addOwner(recordId:$recordId,name:$name,parentage:$parentage,address:$address,
                      role:$role,isCurrent:$isCurrent,acquiredVia:$acquiredVia,
                      photoRef:$photoRef) } }`,
    'That owner',
    false,
  );

export const useUpdateOwner = () =>
  useW360Mutation<{
    ownerId: string; name: string; parentage: string; address: string;
    role: string; isCurrent: boolean; photoRef: string;
  }, Wrapped<'updateOwner', boolean>>(
    `mutation UOw($ownerId:String!,$name:String!,$parentage:String!,$address:String!,
                  $role:String!,$isCurrent:Boolean!,$photoRef:String!) {
       web { updateOwner(ownerId:$ownerId,name:$name,parentage:$parentage,address:$address,
                         role:$role,isCurrent:$isCurrent,photoRef:$photoRef) } }`,
    'That owner',
    false,
  );

export const useDeleteOwner = () =>
  useW360Mutation<{ ownerId: string }, Wrapped<'deleteOwner', boolean>>(
    `mutation DOw($ownerId:String!) { web { deleteOwner(ownerId:$ownerId) } }`,
    'Removing that owner',
    false,
  );

// ── Transfers: the chain of title ────────────────────────────────────
// A transfer is created empty and then given its endpoints, which is the order
// the graph editor works in: draw the link, then say how much went to whom.

export const useAddTransfer = () =>
  useW360Mutation<{
    recordId: string; kind: string; deedDocumentId: string; deedNo: string;
    sro: string; registeredOn: string; priorTransferId: string; note: string;
    source: string; verified: boolean;
  }, Wrapped<'addTransfer', string>>(
    `mutation ATr($recordId:String!,$kind:String!,$deedDocumentId:String!,$deedNo:String!,
                  $sro:String!,$registeredOn:String!,$priorTransferId:String!,$note:String!,
                  $source:String!,$verified:Boolean!) {
       web { addTransfer(recordId:$recordId,kind:$kind,deedDocumentId:$deedDocumentId,
                         deedNo:$deedNo,sro:$sro,registeredOn:$registeredOn,
                         priorTransferId:$priorTransferId,note:$note,source:$source,
                         verified:$verified) } }`,
    'That transfer',
    false,
  );

export const useUpdateTransfer = () =>
  useW360Mutation<{
    transferId: string; kind: string; deedDocumentId: string; deedNo: string;
    sro: string; registeredOn: string; note: string; verified?: boolean | null;
  }, Wrapped<'updateTransfer', boolean>>(
    `mutation UTr($transferId:String!,$kind:String!,$deedDocumentId:String!,$deedNo:String!,
                  $sro:String!,$registeredOn:String!,$note:String!,$verified:Boolean) {
       web { updateTransfer(transferId:$transferId,kind:$kind,deedDocumentId:$deedDocumentId,
                            deedNo:$deedNo,sro:$sro,registeredOn:$registeredOn,note:$note,
                            verified:$verified) } }`,
    'That transfer',
    false,
  );

export const useDeleteTransfer = () =>
  useW360Mutation<{ transferId: string }, Wrapped<'deleteTransfer', boolean>>(
    `mutation DTr($transferId:String!) { web { deleteTransfer(transferId:$transferId) } }`,
    'Removing that transfer',
    false,
  );

export const useSetTransferParty = () =>
  useW360Mutation<{
    transferId: string; side: 'from' | 'to'; ownerId: string; name: string;
    parentage: string; address: string; extent: number; extentUnit: string;
    shareNum: number; shareDen: number; isGpa: boolean; partyId: string;
  }, Wrapped<'setTransferParty', string>>(
    `mutation STP($transferId:String!,$side:String!,$ownerId:String!,$name:String!,
                  $parentage:String!,$address:String!,$extent:Float!,$extentUnit:String!,
                  $shareNum:Int!,$shareDen:Int!,$isGpa:Boolean!,$partyId:String!) {
       web { setTransferParty(transferId:$transferId,side:$side,ownerId:$ownerId,name:$name,
                              parentage:$parentage,address:$address,extent:$extent,
                              extentUnit:$extentUnit,shareNum:$shareNum,shareDen:$shareDen,
                              isGpa:$isGpa,partyId:$partyId) } }`,
    'That party',
    false,
  );

export const useRemoveTransferParty = () =>
  useW360Mutation<{ partyId: string }, Wrapped<'removeTransferParty', boolean>>(
    `mutation RTP($partyId:String!) { web { removeTransferParty(partyId:$partyId) } }`,
    'Removing that party',
    false,
  );

export const useLinkTransferPrior = () =>
  useW360Mutation<
    { transferId: string; priorTransferId: string },
    Wrapped<'linkTransferPrior', boolean>
  >(
    `mutation LTP($transferId:String!,$priorTransferId:String!) {
       web { linkTransferPrior(transferId:$transferId,priorTransferId:$priorTransferId) } }`,
    'That link',
    false,
  );

export const useDeletePhoto = (reportError = true) =>
  useW360Mutation<{ photoId: string }, Wrapped<'deletePhoto', boolean>>(
    `mutation DPh($photoId:String!) { web { deletePhoto(photoId:$photoId) } }`,
    'Deleting that photo',
    reportError,
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
    'That document',
    reportError,
  );

/** A document's details: its type, deed number, registration date
 *  (DD/MM/YYYY) and office. Every field is sent every time — the server
 *  replaces all four, so an omitted one would be erased. */
export const useUpdatePaperDetails = () =>
  useW360Mutation<{ paperId: string; shelf: string; docNo: string; registeredOn: string; office: string },
                   Wrapped<'updatePaperDetails', boolean>>(
    `mutation UPD($paperId:String!,$shelf:String!,$docNo:String!,$registeredOn:String!,$office:String!) {
       web { updatePaperDetails(paperId:$paperId,shelf:$shelf,docNo:$docNo,registeredOn:$registeredOn,office:$office) } }`,
    'Those details',
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
    /** The Documents folder it was uploaded from; '' or absent is the top level. */
    folderId?: string;
  }, Wrapped<'addPaper', string>>(
    `mutation ADP($recordId:String!,$fileRef:String!,$name:String!,$subtitle:String!,
                  $shelf:String!,$pageCount:Int!,$mimeType:String!,$sizeBytes:Int!,$folderId:String) {
       web { addPaper(recordId:$recordId,fileRef:$fileRef,name:$name,subtitle:$subtitle,
                      shelf:$shelf,pageCount:$pageCount,mimeType:$mimeType,
                      sizeBytes:$sizeBytes,folderId:$folderId) } }`,
    'That document',
    reportError,
  );

export const useDeletePaper = (reportError = true) =>
  useW360Mutation<{ paperId: string; recordId?: string }, Wrapped<'deletePaper', boolean>>(
    `mutation DELP($paperId:String!,$recordId:String) { web { deletePaper(paperId:$paperId,recordId:$recordId) } }`,
    'Deleting that document',
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
  /** The title deed (RecordInput doc_no / sro / reg_date, ISO yyyy-mm-dd). */
  docNo?: string; sro?: string; regDate?: string;
  /** Master-record fields (property-overview spec §3), all optional. */
  acquisitionMode?: string; execDate?: string; govtValue?: number;
  plotNo?: string; doorNo?: string; landClass?: string; lpNo?: string;
  /** The caller's own read job, so the server can label its claims. */
  readingJobId?: string;
}

/** Create or partially update one record. Resolves to the record's id either
 *  way — which is what lets the add drawer file the deed it was read from
 *  against the record that deed just created. */
export const useSaveRecord = (reportError = true, invalidate = true) =>
  useW360Mutation<{ input: RecordInput }, Wrapped<'saveRecord', string>>(
    `mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }`,
    'That property',
    reportError,
    invalidate,
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
    'Deleting those properties',
    reportError,
  );

// ── Holder: WHO holds a property ──────────────────────────────────────
//
// Decision memo 06/10/2026. A built property moves alone; a parcel is held
// through its khata, so setting its holder moves every parcel on that khata.
// `useHolderChange` previews exactly that list (writes nothing), so "Set
// holder" can name the parcels that move too before anything happens; the
// write answers with the same shape.

export interface HolderChangeRecord {
  id: string; kind: string; title: string;
  passbookId: string; khataNo: string;
  /** false = not chosen, moves only because it shares the khata. */
  requested: boolean;
  /** Who held it before ('' / "In your own name" for nobody). */
  fromGroupId: string; fromHolderLabel: string;
}
/** A member's share tied to a parcel the change takes out of the member's
 *  group. The share stays with the member; the group no longer holds the land. */
export interface HolderChangeShare {
  memberId: string; memberName: string;
  groupId: string; groupName: string;
  recordId: string; recordTitle: string;
  sharePct: number;
}
export interface HolderChange {
  /** '' = in your own name. */
  groupId: string;
  holderLabel: string;
  records: HolderChangeRecord[];
  /** Parcels carried along by their khata. */
  siblingCount: number;
  memberShares: HolderChangeShare[];
}

const HOLDER_CHANGE = `groupId holderLabel siblingCount
  records { id kind title passbookId khataNo requested fromGroupId fromHolderLabel }
  memberShares { memberId memberName groupId groupName recordId recordTitle sharePct }`;

/** Preview of a holder change. `groupId` '' (or 'personal') = in your own name. */
export function useHolderChange(recordIds: string[], groupId: string, enabled = true) {
  return useQuery({
    enabled: enabled && recordIds.length > 0,
    queryKey: [KEY, 'holder-change', recordIds, groupId],
    queryFn: async () => (await gql<Wrapped<'holderChange', HolderChange>>(
      `query HC($recordIds:[String!]!,$groupId:String!) {
         web { holderChange(recordIds:$recordIds,groupId:$groupId) { ${HOLDER_CHANGE} } } }`,
      { recordIds, groupId },
    )).web.holderChange,
    staleTime: 0,
  });
}

/** Set who holds these properties. Rejects with the owner's sentence. */
export async function setRecordHolder(recordIds: string[], groupId: string): Promise<HolderChange> {
  return (await gql<Wrapped<'setRecordHolder', HolderChange>>(
    `mutation SRH($recordIds:[String!]!,$groupId:String!) {
       web { setRecordHolder(recordIds:$recordIds,groupId:$groupId) { ${HOLDER_CHANGE} } } }`,
    { recordIds, groupId },
  )).web.setRecordHolder;
}

/** "Set holder" on a Properties selection. Refreshes every w360 read —
 *  the cards, the record, the holding's "Held by" and the group pages. */
export const useSetRecordHolder = (reportError = true) =>
  useW360Mutation<{ recordIds: string[]; groupId: string }, Wrapped<'setRecordHolder', HolderChange>>(
    `mutation SRH($recordIds:[String!]!,$groupId:String!) {
       web { setRecordHolder(recordIds:$recordIds,groupId:$groupId) { ${HOLDER_CHANGE} } } }`,
    'That holder',
    reportError,
  );

/** A holding a delete would empty — and so delete, shared expenses and all. */
export interface EmptiedHolding { id: string; name: string; expenseTotal: number; expenseCount: number }

/** Which holdings deleting exactly these properties would take with them
 *  (web360 `deleteImpact`). Writes nothing; the delete dialogs say it first. */
export function useDeleteImpact(ids: string[], enabled = true) {
  return useQuery({
    enabled: enabled && ids.length > 0,
    queryKey: [KEY, 'delete-impact', ids],
    queryFn: async () => (await gql<Wrapped<'deleteImpact', EmptiedHolding[]>>(
      `query DI($ids:[String!]!) { web { deleteImpact(ids:$ids) { id name expenseTotal expenseCount } } }`,
      { ids },
    )).web.deleteImpact,
    staleTime: 0,
  });
}

export const useArchiveRecords = (reportError = true) =>
  useW360Mutation<{ ids: string[]; archived: boolean }, Wrapped<'archiveRecords', number>>(
    `mutation AR($ids:[String!]!,$archived:Boolean!) {
       web { archiveRecords(ids:$ids,archived:$archived) } }`,
    'Archiving those properties',
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

export const useCreateShareLink = (reportError = true) =>
  useW360Mutation<{ recordId: string; audience: string; terms: string; days: number; documentIds?: string[]; includeBoundary?: boolean },
                   Wrapped<'createShareLink', string>>(
    `mutation CSL($recordId:String!,$audience:String!,$terms:String!,$days:Int!,$documentIds:[String!],$includeBoundary:Boolean! = false) {
       web { createShareLink(recordId:$recordId,audience:$audience,terms:$terms,days:$days,documentIds:$documentIds,includeBoundary:$includeBoundary) } }`,
    'That share link',
    reportError,
  );

/** A link to chosen documents, wherever they are filed — not to a property.
 *  Same expiry and terms as a property link. Answers the recipient path, or
 *  '' when the server refused (a document that is not the owner's, an
 *  Aadhaar card). */
export const useCreateDocumentShareLink = () =>
  useW360Mutation<{ documentIds: string[]; audience: string; terms: string; days: number },
                   Wrapped<'createDocumentShareLink', string>>(
    `mutation CDSL($documentIds:[String!]!,$audience:String!,$terms:String!,$days:Int!) {
       web { createDocumentShareLink(documentIds:$documentIds,audience:$audience,terms:$terms,days:$days) } }`,
    'That share link',
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
 *  record shows here, newest first. `action` is the server's raw verb; `by` is
 *  who acted, already in words ("You", "Pattadar desk"). A correction carries
 *  its field and old and new values in `field`/`was`/`now` (empty otherwise). */
export interface HistoryEvent {
  id: string; action: string; detail: string; at: string; by: string;
  field: string; was: string; now: string;
  /** "Created from deed.pdf", "Created from public record · RID … · schedule 3",
   *  "Deed … filed as the title deed" (D2); '' otherwise. */
  source: string;
}

/** The trail stops at this many events (services/api web360.py `_trail`,
 *  LIMIT 200), so a list this long says it is the latest ones, not all. */
export const HISTORY_CAP = 200;

const Q_HISTORY = `query H($id:String!) { web { recordHistory(recordId:$id) {
  id action detail at by field was now source } } }`;

export function useRecordHistory(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'recordHistory', id],
    queryFn: async () =>
      (await gql<Wrapped<'recordHistory', HistoryEvent[]>>(Q_HISTORY, { id })).web.recordHistory,
  });
}

/** The service catalogue, searched server-side so the client never holds it all. */
export function useServicesOffered(q: string, key = '', enabled = true, recordId = '') {
  return useQuery({
    enabled,
    queryKey: [KEY, 'services', q, key, recordId],
    queryFn: async () =>
      (await gql<Wrapped<'servicesOffered', ServiceOffer[]>>(Q_SERVICES, { q, key, recordId }))
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
    mandalCode: string; villageCode: string;
    document: string; reason: string; expectedRevision: number;
  }, Wrapped<'saveGovernancePolicy', GovernancePolicy | null>>(
    `mutation SGP($countryCode:String!,$stateCode:String!,$districtCode:String!,
                  $mandalCode:String!,$villageCode:String!,
                  $document:String!,$reason:String!,$expectedRevision:Int!) {
       web { saveGovernancePolicy(countryCode:$countryCode,stateCode:$stateCode,
              districtCode:$districtCode,mandalCode:$mandalCode,villageCode:$villageCode,
              document:$document,reason:$reason,
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

export const useSaveServiceCatalogue = (reportError = true) =>
  useW360Mutation<{ stateCode: string; districtCode: string; document: string; reason: string;
                    expectedRevision: number },
                  Wrapped<'saveServiceCatalogue', CatalogueSet | null>>(
    `mutation SSC($stateCode:String!,$districtCode:String!,$document:String!,$reason:String!,
                  $expectedRevision:Int!) {
       web { saveServiceCatalogue(stateCode:$stateCode,districtCode:$districtCode,document:$document,
             reason:$reason,expectedRevision:$expectedRevision) { ${CATALOGUE_SET} } } }`,
    'That price draft', reportError,
  );

export const usePublishServiceCatalogue = (reportError = true) =>
  useW360Mutation<{ setId: string; reason: string }, Wrapped<'publishServiceCatalogue', CatalogueSet | null>>(
    `mutation PSC($setId:String!,$reason:String!) {
       web { publishServiceCatalogue(setId:$setId,reason:$reason) { ${CATALOGUE_SET} } } }`,
    'Publishing those prices', reportError,
  );

export const useArchiveServiceCatalogue = (reportError = true) =>
  useW360Mutation<{ setId: string; reason: string }, Wrapped<'archiveServiceCatalogue', boolean>>(
    `mutation ASC($setId:String!,$reason:String!) {
       web { archiveServiceCatalogue(setId:$setId,reason:$reason) } }`,
    'Archiving those prices', reportError,
  );

export const useArchiveGovernancePolicy = (reportError = true) =>
  useW360Mutation<{ policyId: string; reason: string }, Wrapped<'archiveGovernancePolicy', boolean>>(
    `mutation AGP($policyId:String!,$reason:String!) {
       web { archiveGovernancePolicy(policyId:$policyId,reason:$reason) } }`,
    'Archiving that policy', reportError,
  );

type IntelligenceSaved<K extends string> = Wrapped<K, IntelligenceSettings | null>;

/** Null = refused and nothing changed. */
export const useSetIntelligenceReader = () =>
  useW360Mutation<{ provider: IntelligenceProviderId }, IntelligenceSaved<'setIntelligenceReader'>>(
    `mutation SIR($provider:String!) { web { setIntelligenceReader(provider:$provider) { ${INTELLIGENCE_FIELDS} } } }`,
    'That reader switch',
  );

/** A blank `apiKey` keeps the saved key; `forgetKey` removes it. */
export const useSaveIntelligenceProvider = () =>
  useW360Mutation<{ provider: IntelligenceProviderId; model: string; apiKey: string; forgetKey: boolean },
                   IntelligenceSaved<'saveIntelligenceProvider'>>(
    `mutation SIP($provider:String!,$model:String!,$apiKey:String!,$forgetKey:Boolean!) {
       web { saveIntelligenceProvider(provider:$provider,model:$model,apiKey:$apiKey,forgetKey:$forgetKey) {
         ${INTELLIGENCE_FIELDS} } } }`,
    'Those provider settings',
  );

export const useSaveIntelligenceOcr = () =>
  useW360Mutation<{ enabled: boolean; processor: string; serviceAccount: string; forgetServiceAccount: boolean },
                   IntelligenceSaved<'saveIntelligenceOcr'>>(
    `mutation SIO($enabled:Boolean!,$processor:String!,$serviceAccount:String!,$forgetServiceAccount:Boolean!) {
       web { saveIntelligenceOcr(enabled:$enabled,processor:$processor,serviceAccount:$serviceAccount,
             forgetServiceAccount:$forgetServiceAccount) { ${INTELLIGENCE_FIELDS} } } }`,
    'Those Document AI settings',
  );

/** Lists the provider's models with its key: the connection check. */
export const useCheckIntelligenceProvider = () =>
  useW360Mutation<{ provider: IntelligenceProviderId },
                   Wrapped<'checkIntelligenceProvider', { ok: boolean; message: string; count: number } | null>>(
    `mutation CIP($provider:String!) { web { checkIntelligenceProvider(provider:$provider) { ok message count } } }`,
    'That connection check', false,
  );

/** A file already in storage (`uploadToDrive`'s node), sent with a message.
 *  `fileRef` must be the storage node id; anything else refuses the message. */
export interface MessageFile { fileRef: string; fileName?: string; mimeType?: string; sizeBytes?: number }

/** The owner writing on their order's thread. Text, files (at most ten), or
 *  both; both empty is refused. Pattadar desk reads every thread, and the
 *  provider reads it on their work link. Resolves false on a refusal. */
export const usePostTicketMessage = (reportError = true) =>
  useW360Mutation<{ ticketId: string; message: string; attachments?: MessageFile[] },
                   Wrapped<'postTicketMessage', boolean>>(
    `mutation PTM($ticketId:String!,$message:String!,$attachments:[MessageFile!]) {
       web { postTicketMessage(ticketId:$ticketId,message:$message,attachments:$attachments) } }`,
    'That message',
    reportError,
  );

/** "Ask for an update": tells Pattadar desk an order has gone quiet or is
 *  late. Offered only while `can` has `nudge` (quiet 4 days or overdue, before
 *  delivery, not while unpaid, once a day); false when refused. */
export const useNudgeTicket = (reportError = true) =>
  useW360Mutation<{ ticketId: string }, Wrapped<'nudgeTicket', boolean>>(
    `mutation NTK($ticketId:String!) { web { nudgeTicket(ticketId:$ticketId) } }`,
    'Asking for an update',
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
    'Cancelling that order',
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
//  • Every read below except `disciplines` is admin-only, and the owner's
//    order page reads none of them (service order spec §7). `desk`,
//    `deskTicket`, `candidates`, `associates`, `coverage` and `deskTasks` are the only
//    reads in the API that see other people's jobs at all; each one is guarded
//    server-side and each one leaves an audit row behind. A non-admin gets
//    null or an empty list rather than an error, and the rail simply never
//    draws /desk for them — see `Portfolio.isPlatformAdmin`.
//
//  • Contact numbers are masked everywhere except two places: the admin roster,
//    which exists in order to be phoned from, and one owner looking at the one
//    person on their own live job (`TicketView.assignedTo`, and only when that
//    associate agreed to it). The owner has no picker and no roster at all.
//    A screenshot of a desk page must not be a phone book.
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
  authority: string; issuedOn: string; expiresOn: string; daysLeft: number;
  expiring: boolean; lapsed: boolean;
  review: string; reviewNote: string; fileRef: string; fileName: string;
  reviewedBy: string; reviewedAt: string;
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
  addressLine: string; villageLocality: string; postOffice: string;
  mandalCity: string; district: string; stateName: string; postalCode: string;
  addressLabel: string; addressComplete: boolean;
  state: string; stateWord: string; stateState: string; stateReason: string;
  disciplines: AssociateDiscipline[]; areas: AssociateArea[];
  credentials: AssociateCredential[];
  claimed: boolean; dispatchable: boolean; whyNot: string[];
  jobsOpen: number; jobsDone: number; lastCompletedAt: string;
  ratingAverage: number; ratingCount: number;
  trainingState: string; trainingNote: string;
  offersSent: number; offersTaken: number; offersDeclined: number;
  acceptRate: number; lastOfferedAt: string;
  note: string; createdAt: string;
}

/** Somebody who could take one particular order, best first, as the desk sees
 *  them (`candidates`, admin-only, place-matched). An ineligible person is
 *  listed with `whyNot` rather than dropped. `contact` is unmasked: the desk
 *  phones from this list. */
export interface Candidate {
  associateId: string; name: string; initials: string; contact: string;
  discipline: string; areaMatch: string; openCount: number; capacity: number;
  acceptRate: number; lastOfferedAt: string; rank: number;
  why: string[]; eligible: boolean; whyNot: string[];
  alreadyOffered: boolean; alreadyDeclined: boolean;
}

/** One line of an associate's trail. `headline` is composed at write time, the
 *  way ticket events are, so a re-wording in 2027 cannot re-word a 2026 event. */
export interface AssociateEvent {
  id: string; kind: string; headline: string; detail: string;
  actorLabel: string; actorKind: string; at: string; atLabel: string;
}

/** A signed Pattadar University internal training credential. Professional
 * licensing remains the separate AssociateCredential gate above. */
export interface TrainingCertificate {
  id: string; certificateNo: string; associateId: string; recipientName: string;
  courseCode: string; courseTitle: string; courseVersion: string;
  trainerName: string; trainerRef: string; completedOn: string; issuedOn: string;
  validUntil: string; hours: number; skills: string[]; evidenceRef: string; note: string;
  status: string; verificationState: string; verificationCode: string; intact: boolean;
  revokedAt: string; revokeReason: string; issuedBy: string;
}

/** One square of the coverage grid: a place against a line of work.
 *  `activeCount` 0 with `openJobs` above it is a problem; 0 with no open job
 *  is only a fact, and `risk` is the server saying which of the two this is
 *  rather than the grid guessing from the numbers. */
export interface CoverageCell {
  level: string; scopeKey: string; name: string;
  stateKey: string; stateName: string; districtKey: string; districtName: string;
  mandalKey: string; mandalName: string;
  discipline: string; disciplineLabel: string;
  activeCount: number; openJobs: number; records: number; risk: string;
}

export interface CoverageAssociate {
  id: string; name: string; firm: string; initials: string;
  state: string; stateWord: string; stateState: string; jobsOpen: number;
  disciplines: AssociateDiscipline[]; areas: AssociateArea[];
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
  /** When the owner last asked for an update (dd/mm/yyyy), '' when never. */
  askedAt: string;
}

/** One order as the desk works it (`deskTicket`, admin-only, cross-owner):
 *  its desk row, the desk's moves, the whole trail with every detail —
 *  dispatch, payment and refused rows included — what came back, and every
 *  time it left the building. `can` is the desk's (`system`) moves: dispatch ·
 *  withdraw · assign · unassign · start · deliver as the status allows, plus
 *  `message` while it is not cancelled. No record id, owner, answers or ledger. */
export interface DeskTicket {
  job: DeskJob; can: string[];
  events: TicketEvent[]; deliverables: TicketDeliverable[]; dispatches: TicketDispatch[];
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

const ASSOCIATE_CREDENTIAL = `id discipline kind numberMasked authority issuedOn expiresOn daysLeft
  expiring lapsed review reviewNote fileRef fileName reviewedBy reviewedAt`;

const ASSOCIATE = `id name firm initials contact contactMasked contactVisible
  addressLine villageLocality postOffice mandalCity district stateName postalCode
  addressLabel addressComplete
  state stateWord stateState stateReason claimed dispatchable whyNot
  jobsOpen jobsDone lastCompletedAt ratingAverage ratingCount trainingState trainingNote
  offersSent offersTaken offersDeclined acceptRate lastOfferedAt
  note createdAt
  disciplines { ${ASSOCIATE_DISCIPLINE} }
  areas { ${ASSOCIATE_AREA} }
  credentials { ${ASSOCIATE_CREDENTIAL} }`;

const DESK_JOB = `ticketId ref kind serviceLabel place status statusLabel statusState
  assignee assigneeRef assigneeContact orderedAt ageDays dueDate overdue quiet quietDays
  quoted held dispatchState dispatchRound nextRoundAt offersOut offersDeclined
  lastResponse candidateCount stuck askedAt`;

export const TRAINING_CERTIFICATE = `id certificateNo associateId recipientName courseCode
  courseTitle courseVersion trainerName trainerRef completedOn issuedOn validUntil hours skills
  evidenceRef note status verificationState verificationCode intact revokedAt revokeReason issuedBy`;

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

const Q_ASSOCIATE_JOBS = `query AJB($id:String!,$includeClosed:Boolean!) {
  web { associateJobs(id:$id,includeClosed:$includeClosed) { ${DESK_JOB} } } }`;

const Q_ASSOCIATE_TRAINING_CERTIFICATES = `query ATC($id:String!) {
  web { associateTrainingCertificates(id:$id) { ${TRAINING_CERTIFICATE} } } }`;

const Q_COVERAGE = `query COV($level:String!,$stateKey:String!,$districtKey:String!) {
  web { coverage(level:$level,stateKey:$stateKey,districtKey:$districtKey) {
  level scopeKey name stateKey stateName districtKey districtName mandalKey mandalName
  discipline disciplineLabel activeCount openJobs records risk
} } }`;

const Q_COVERAGE_ASSOCIATES = `query COVA($scopeKey:String!) {
  web { coverageAssociates(scopeKey:$scopeKey) {
    id name firm initials state stateWord stateState jobsOpen
    disciplines { ${ASSOCIATE_DISCIPLINE} }
    areas { ${ASSOCIATE_AREA} }
  } } }`;

const Q_DESK_TASKS = `{ web { deskTasks {
  id kind headline detail associateId ticketId to at
} } }`;

const Q_DISCIPLINES = `{ web { disciplines {
  key label blurb kinds areaGrain credential fanout
} } }`;

const Q_DESK_TICKET = `query DTKT($id:String!) { web { deskTicket(id:$id) {
  job { ${DESK_JOB} }
  can
  events { ${TICKET_EVENT} }
  deliverables { ${TICKET_DELIVERABLE} }
  dispatches { id purpose channel contactMasked personName subject body provider live
               status statusWord error expiresOn daysLeft revoked revokeReason sentAt }
} } }`;

const Q_CANDIDATES = `query CND($ticketId:String!) { web { candidates(ticketId:$ticketId) {
  associateId name initials contact discipline areaMatch openCount capacity acceptRate
  lastOfferedAt rank why eligible whyNot alreadyOffered alreadyDeclined
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

/** All current and historical assignments for this member. Unlike the desk
 * query this includes normally progressing jobs, which is the point here. */
export function useAssociateJobs(id?: string, includeClosed = true) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'associateJobs', id, includeClosed],
    queryFn: async () =>
      (await gql<Wrapped<'associateJobs', DeskJob[]>>(Q_ASSOCIATE_JOBS, { id, includeClosed }))
        .web.associateJobs,
  });
}

export function useAssociateTrainingCertificates(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'associateTrainingCertificates', id],
    queryFn: async () =>
      (await gql<Wrapped<'associateTrainingCertificates', TrainingCertificate[]>>(
        Q_ASSOCIATE_TRAINING_CERTIFICATES, { id })).web.associateTrainingCertificates,
  });
}

/** The grid of places against lines of work. One flat list of cells, not a
 *  matrix: the screen decides which are rows and which are columns, and a flat
 *  list survives a place with no records and a discipline with nobody in it. */
export function useCoverage(level = 'state', stateKey = '', districtKey = '') {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
    queryKey: [KEY, 'coverage', level, stateKey, districtKey],
    queryFn: async () =>
      (await gql<Wrapped<'coverage', CoverageCell[]>>(
        Q_COVERAGE, { level, stateKey, districtKey },
      )).web.coverage,
  });
}

export function useCoverageAssociates(scopeKey = '') {
  return useQuery({
    enabled: !!scopeKey,
    queryKey: [KEY, 'coverage-associates', scopeKey],
    queryFn: async () =>
      (await gql<Wrapped<'coverageAssociates', CoverageAssociate[]>>(
        Q_COVERAGE_ASSOCIATES, { scopeKey },
      )).web.coverageAssociates,
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

/** One order as the desk works it. Null for a non-admin and for an id that
 *  does not exist — the same answer on purpose. Replaces finding the row in
 *  `useDesk('all')`, which could not show a closed order. */
export function useDeskTicket(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'deskTicket', id],
    queryFn: async () =>
      (await gql<Wrapped<'deskTicket', DeskTicket | null>>(Q_DESK_TICKET, { id })).web.deskTicket,
  });
}

/** Who could take this order, best first, eligibility reasons included — the
 *  roster the owner's page used to show, now the desk's alone. [] for a
 *  non-admin. */
export function useDeskCandidates(ticketId?: string) {
  return useQuery({
    enabled: !!ticketId,
    queryKey: [KEY, 'candidates', ticketId],
    queryFn: async () =>
      (await gql<Wrapped<'candidates', Candidate[]>>(Q_CANDIDATES, { ticketId })).web.candidates,
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
 *  associate's id, or '' when it was refused — a name, contact, complete postal
 *  hierarchy, one kind of work and one coverage area are required, and a
 *  contact already on the roster is refused rather than duplicated.
 *
 *  They appear on the roster immediately, but allocation waits until each
 *  active discipline has a verified credential or company verification. */
export const useInviteAssociate = (reportError = true) =>
  useW360Mutation<{
    name: string; contact: string; disciplines: string[]; areas: string[];
    firm?: string; note?: string; channel?: string;
    addressLine?: string; villageLocality?: string; postOffice?: string;
    mandalCity?: string; district?: string; stateName?: string; postalCode?: string;
  }, Wrapped<'inviteAssociate', string>>(
    `mutation INV($name:String!,$contact:String!,$disciplines:[String!]!,$areas:[String!]!,
                  $firm:String! = "",$note:String! = "",$channel:String! = "auto",
                  $addressLine:String! = "",$villageLocality:String! = "",$postOffice:String! = "",
                  $mandalCity:String! = "",$district:String! = "",$stateName:String! = "",
                  $postalCode:String! = "") {
       web { inviteAssociate(name:$name,contact:$contact,disciplines:$disciplines,
                             areas:$areas,firm:$firm,note:$note,channel:$channel,
                             addressLine:$addressLine,villageLocality:$villageLocality,
                             postOffice:$postOffice,mandalCity:$mandalCity,district:$district,
                             stateName:$stateName,postalCode:$postalCode) } }`,
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
    addressLine?: string; villageLocality?: string; postOffice?: string;
    mandalCity?: string; district?: string; stateName?: string; postalCode?: string;
  }, Wrapped<'updateAssociate', boolean>>(
    `mutation UAS($id:String!,$name:String! = "",$contact:String! = "",$altContact:String! = "",
                  $firm:String! = "",$note:String! = "",$channel:String! = "",
                  $contactVisible:Boolean,$addressLine:String! = "",$villageLocality:String! = "",
                  $postOffice:String! = "",$mandalCity:String! = "",$district:String! = "",
                  $stateName:String! = "",$postalCode:String! = "") {
       web { updateAssociate(id:$id,name:$name,contact:$contact,altContact:$altContact,
                             firm:$firm,note:$note,channel:$channel,
                             contactVisible:$contactVisible,addressLine:$addressLine,
                             villageLocality:$villageLocality,postOffice:$postOffice,
                             mandalCity:$mandalCity,district:$district,stateName:$stateName,
                             postalCode:$postalCode) } }`,
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
    note?: string; authority?: string; issuedOn?: string; expiresOn?: string;
    credentialRef?: string; evidenceRef?: string; evidenceName?: string;
  }, Wrapped<'setAssociateCertification', boolean>>(
    `mutation SAC($id:String!,$discipline:String!,$certified:Boolean!,
                  $note:String! = "",$authority:String! = "Pattadar",$issuedOn:String! = "",
                  $expiresOn:String! = "",$credentialRef:String! = "",
                  $evidenceRef:String! = "",$evidenceName:String! = "") {
       web { setAssociateCertification(id:$id,discipline:$discipline,certified:$certified,
                                       note:$note,authority:$authority,issuedOn:$issuedOn,
                                       expiresOn:$expiresOn,credentialRef:$credentialRef,
                                       evidenceRef:$evidenceRef,evidenceName:$evidenceName) } }`,
    'That certification',
  );

export const useSetAssociateTraining = () =>
  useW360Mutation<{ id: string; state: string; note?: string },
                   Wrapped<'setAssociateTraining', boolean>>(
    `mutation SAT($id:String!,$state:String!,$note:String! = "") {
       web { setAssociateTraining(id:$id,state:$state,note:$note) } }`,
    'That training decision',
  );

export const useIssueTrainingCertificate = () =>
  useW360Mutation<{
    id: string; courseCode: string; courseTitle: string; courseVersion: string;
    trainerName: string; trainerRef?: string; completedOn: string; validUntil?: string;
    hours: number; skills?: string[]; evidenceRef: string; note?: string;
  }, Wrapped<'issueTrainingCertificate', string>>(
    `mutation ITC($id:String!,$courseCode:String!,$courseTitle:String!,$courseVersion:String!,
                  $trainerName:String!,$trainerRef:String! = "",$completedOn:String!,
                  $validUntil:String! = "",$hours:Float!,$skills:[String!],
                  $evidenceRef:String!,$note:String! = "") {
       web { issueTrainingCertificate(id:$id,courseCode:$courseCode,courseTitle:$courseTitle,
              courseVersion:$courseVersion,trainerName:$trainerName,trainerRef:$trainerRef,
              completedOn:$completedOn,validUntil:$validUntil,hours:$hours,skills:$skills,
              evidenceRef:$evidenceRef,note:$note) } }`,
    'That training certificate',
  );

export const useRevokeTrainingCertificate = () =>
  useW360Mutation<{ id: string; reason: string }, Wrapped<'revokeTrainingCertificate', boolean>>(
    `mutation RTC($id:String!,$reason:String!) {
       web { revokeTrainingCertificate(id:$id,reason:$reason) } }`,
    'That training certificate',
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

/** The desk putting somebody on somebody else's job. This is the phase-1
 *  product: one click, cross-owner, and the owner sees the name and the number
 *  on their ticket the moment it lands.
 *
 *  For an admin a refusal RAISES with the reason the desk can print (order
 *  closed, not on the roster, not taking work: "Already holds 3", status past
 *  assigning, not paid while payments are on); the toast carries it. A
 *  non-admin still gets a bare false. */
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

/** Pattadar desk sends an order to a provider (purpose `invite`), or writes to
 *  them again (`nudge`, `message`, `changes`). Records the message with an
 *  expiring work link. Resolves to the dispatch id, '' when refused; RAISES
 *  "This order is not paid yet, so nothing was sent." for an invite while
 *  payments are on and nothing is held. */
export const useDeskDispatchTicket = () =>
  useW360Mutation<{ ticketId: string; contact: string; personName: string;
                    channel: string; purpose: string; note: string; expiresDays: number },
                   Wrapped<'deskDispatchTicket', string>>(
    `mutation DDT($ticketId:String!,$contact:String!,$personName:String!,$channel:String!,
                  $purpose:String!,$note:String!,$expiresDays:Int!) {
       web { deskDispatchTicket(ticketId:$ticketId,contact:$contact,personName:$personName,
                                channel:$channel,purpose:$purpose,note:$note,
                                expiresDays:$expiresDays) } }`,
    'Sending that to a provider',
  );

/** Pattadar desk takes an offer back. The provider is told; when nothing is
 *  left out the order goes back to Placed. */
export const useDeskRevokeDispatch = () =>
  useW360Mutation<{ dispatchId: string; reason: string }, Wrapped<'deskRevokeDispatch', boolean>>(
    `mutation DRV($dispatchId:String!,$reason:String!) {
       web { deskRevokeDispatch(dispatchId:$dispatchId,reason:$reason) } }`,
    'Withdrawing that offer',
  );

/** Pattadar desk records that the provider has started (they phoned it in). */
export const useDeskStartTicket = () =>
  useW360Mutation<{ ticketId: string; note: string }, Wrapped<'deskStartTicket', boolean>>(
    `mutation DST($ticketId:String!,$note:String!) {
       web { deskStartTicket(ticketId:$ticketId,note:$note) } }`,
    'Marking that started',
  );

/** Pattadar desk records one thing a provider handed in by another route.
 *  `fileRef` is a storage node id; `payload` is JSON text for a boundary ring
 *  or a feature's condition. Nothing is filed until the owner accepts. Moves
 *  the order to Waiting on you. Resolves to the deliverable id, '' if refused. */
export const useDeskAddDeliverable = () =>
  useW360Mutation<{ ticketId: string; kind: string; label: string; note: string;
                    fileRef: string; fileName: string; mimeType: string; sizeBytes: number;
                    payload: string; fileAs: string; submittedBy: string },
                   Wrapped<'deskAddDeliverable', string>>(
    `mutation DAD($ticketId:String!,$kind:String!,$label:String!,$note:String!,
                  $fileRef:String!,$fileName:String!,$mimeType:String!,$sizeBytes:Int!,
                  $payload:String!,$fileAs:String!,$submittedBy:String!) {
       web { deskAddDeliverable(ticketId:$ticketId,kind:$kind,label:$label,note:$note,
                                fileRef:$fileRef,fileName:$fileName,mimeType:$mimeType,
                                sizeBytes:$sizeBytes,payload:$payload,fileAs:$fileAs,
                                submittedBy:$submittedBy) } }`,
    'Recording that work',
  );

/** Pattadar desk answers on an order's thread (text only); the owner reads it
 *  as "Pattadar desk", the provider on their work link. */
export const useDeskPostTicketMessage = () =>
  useW360Mutation<{ ticketId: string; message: string }, Wrapped<'deskPostTicketMessage', boolean>>(
    `mutation DPM($ticketId:String!,$message:String!) {
       web { deskPostTicketMessage(ticketId:$ticketId,message:$message) } }`,
    'That reply',
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

// Server contract: GraphQL fields/args, response fields, query keys and the `combined_*` tables keep the server's `combined` name; only web identifiers say Holding (Reddy, 03/10/2026).
// ── Holdings ─────────────────────────────────────────────────────────────
//
// Several records held as one property: thirty acres and thirty acres, two
// khatas, one fence. Every figure below is a SUM of member figures and every
// paper, boundary and survey-level cost still belongs to the member it was
// filed against — which is why `recordTitle` rides along on almost everything
// here. Nothing in this section is a new legal record, and none of it reaches
// the portfolio: `usePortfolio` reads the records themselves, so an acre inside
// a holding is counted exactly once.

export interface HoldingMember {
  /** The membership row. Removing this does not touch the record. */
  id: string;
  recordId: string;
  recordKind: string;
  title: string;
  placeLine: string;
  khataNo: string;
  ownerName: string;
  status: string;
  extent: number;
  extentUnit: string;
  extentDetail: string;
  marketValue: number;
  paperCount: number;
  /** surveyed | pinned | unplaced — what the combined map can draw of it. */
  ground: string;
  sheetTitle: string;
  sheetId: string;
  archived: boolean;
  sort: number;
  /** Who holds this member: its family or group, '' = in your own name. */
  groupId: string;
  /** The group's name, or "In your own name". */
  holderLabel: string;
}

/** One line of a holding's "Held by" — a holder and how many of the
 *  holding's properties it holds. Read-only; largest first. */
export interface HoldingHolder {
  /** '' for properties held in your own name. */
  groupId: string;
  /** The group's name, or "In your own name". */
  name: string;
  count: number;
}

export interface HoldingCard {
  id: string;
  name: string;
  note: string;
  memberCount: number;
  parcelCount: number;
  propertyCount: number;
  /** Three extents, never one: acres, plot yards and built square feet do not
   *  add up, and one figure would have to drop two of them. */
  farmExtent: number;
  plotExtent: number;
  builtExtent: number;
  extentLine: string;
  marketValue: number;
  invested: number;
  paperCount: number;
  surveyedCount: number;
  /** Spent on the whole holding, and spent on its members. Only the first is
   *  the holding's own money. */
  combinedSpend: number;
  memberSpend: number;
  placeLine: string;
  /** False when a member record has been deleted from Properties: the holding
   *  survives, with its costs, and says it is short of a survey. */
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
  members: HoldingMember[];
  /** "Held by" — only `useHolding` (one holding) selects it. */
  heldBy?: HoldingHolder[];
}

export interface HoldingPaper {
  id: string;
  title: string;
  detail: string;
  shelf: string;
  icon: string;
  tags: string[];
  shared: boolean;
  pageCount: number;
  fileRef: string;
  recordId: string;
  recordTitle: string;
}

export interface HoldingSurveyShape {
  recordId: string;
  title: string;
  kind: string;
  /** Flat [lat, lon, …]; empty when there is no outline to draw. */
  ring: number[];
  lat: number;
  lon: number;
  extentLabel: string;
  sheetTitle: string;
  sheetId: string;
  ground: string;
  note: string;
  /** The outline's own measurements, so a holding is at least as useful
   *  as the record it gathers. `sideLengths` is metres in corner order and is
   *  rounded to whole metres when drawn — a boundary traced over imagery and
   *  stored at six decimals cannot support a centimetre. */
  corners: number;
  sideLengths: number[];
  sideBearings: number[];
  perimeterM: number;
  /** Area OF THE OUTLINE in acres — not the extent on record. */
  measuredAc: number;
  /** This member's own extent from the register, and whether the two figures
   *  can be compared at all. Per member so the screen can total whichever
   *  surveys the reader has selected rather than only the whole holding. */
  recordedAc: number;
  comparable: boolean;
  /** True when `sheetTitle` is this member's copy of a joint FMB. */
  sheetJoint: boolean;
}

/** One joint FMB: a single sheet covering several members, filed as a copy on
 *  each. `paperIds` line up with `recordIds`. */
export interface HoldingJointSheet {
  id: string;
  name: string;
  recordIds: string[];
  recordTitles: string[];
  paperIds: string[];
  createdAt: string;
  /** The single stored file behind every copy. */
  fileRef: string;
}

export interface HoldingRelation {
  fromRecordId: string;
  toRecordId: string;
  fromTitle: string;
  toTitle: string;
  /** adjoining | overlapping | corner | apart */
  relation: string;
  gapM: number;
  runM: number;
  detail: string;
}

export interface HoldingFmb {
  id: string;
  name: string;
  shapes: HoldingSurveyShape[];
  relations: HoldingRelation[];
  drawnCount: number;
  surveyedCount: number;
  sheetCount: number;
  pieceCount: number;
  caption: string;
  missing: string[];
  /** The drawn outlines added up, against what the register says for the same
   *  land. `comparable` is false when they are not all measured in acres. */
  measuredAc: number;
  recordedAc: number;
  comparable: boolean;
  jointSheets: HoldingJointSheet[];
}

export interface HoldingExpenseRow {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  category: string;
  amount: number;
  spentOn: string;
  paidBy: string;
  vendor: string;
  note: string;
  recoverable: boolean;
  hasReceipt: boolean;
  fiscalYear: string;
  /** combined — the whole holding; record — one survey. */
  scope: string;
  recordId: string;
  recordTitle: string;
  invoiceNo: string;
  warrantyUntil: string;
  receiptFileRef: string;
  receiptFileName: string;
  receiptMimeType: string;
  receiptSizeBytes: number;
}

export interface HoldingExpenseView {
  id: string;
  name: string;
  year: string;
  years: string[];
  spent: number;
  capital: number;
  running: number;
  income: number;
  owedBack: number;
  combinedSpend: number;
  memberSpend: number;
  farmExtent: number;
  perAcreRunning: number;
  categories: FacetOption[];
  scopes: FacetOption[];
  rows: HoldingExpenseRow[];
}

const HOLDING_FIELDS = `id name note memberCount parcelCount propertyCount
  farmExtent plotExtent builtExtent extentLine marketValue invested paperCount
  surveyedCount combinedSpend memberSpend placeLine isComplete createdAt updatedAt`;

const HOLDING_MEMBER_FIELDS = `id recordId recordKind title placeLine khataNo
  ownerName status extent extentUnit extentDetail marketValue paperCount ground
  sheetTitle sheetId archived sort groupId holderLabel`;

const Q_HOLDING_LIST = `{ web { combinedProperties {
  ${HOLDING_FIELDS} members { ${HOLDING_MEMBER_FIELDS} } } } }`;

const Q_HOLDING = `query CP($id:String!) { web { combinedProperty(id:$id) {
  ${HOLDING_FIELDS} members { ${HOLDING_MEMBER_FIELDS} }
  heldBy { groupId name count } } } }`;

const Q_HOLDING_PAPERS = `query CPP($id:String!) { web { combinedPapers(id:$id) {
  id title detail shelf icon tags shared pageCount fileRef recordId recordTitle } } }`;

const Q_HOLDING_FMB = `query CPF($id:String!) { web { combinedFmb(id:$id) {
  id name drawnCount surveyedCount sheetCount pieceCount caption missing
  measuredAc recordedAc comparable
  shapes { recordId title kind ring lat lon extentLabel sheetTitle sheetId ground note
           corners sideLengths sideBearings perimeterM measuredAc recordedAc comparable
           sheetJoint }
  relations { fromRecordId toRecordId fromTitle toTitle relation gapM runM detail }
  jointSheets { id name recordIds recordTitles paperIds createdAt fileRef }
} } }`;

const Q_HOLDING_EXPENSES = `query CPE($id:String!,$year:String) {
  web { combinedExpenses(id:$id,year:$year) {
    id name year years spent capital running income owedBack combinedSpend
    memberSpend farmExtent perAcreRunning
    categories { key label count active }
    scopes { key label count active }
    rows { id title subtitle kind category amount spentOn paidBy vendor note
           recoverable hasReceipt fiscalYear scope recordId recordTitle invoiceNo
           warrantyUntil receiptFileRef receiptFileName receiptMimeType receiptSizeBytes }
  } } }`;

export function useHoldings() {
  return useQuery({
    queryKey: [KEY, 'combined'],
    queryFn: async () =>
      (await gql<Wrapped<'combinedProperties', HoldingCard[]>>(Q_HOLDING_LIST))
        .web.combinedProperties,
  });
}

export function useHolding(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'combined', id],
    queryFn: async () =>
      (await gql<Wrapped<'combinedProperty', HoldingCard | null>>(Q_HOLDING, { id }))
        .web.combinedProperty,
  });
}

export function useHoldingPapers(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'combined-papers', id],
    queryFn: async () =>
      (await gql<Wrapped<'combinedPapers', HoldingPaper[]>>(Q_HOLDING_PAPERS, { id }))
        .web.combinedPapers,
  });
}

export function useHoldingFmb(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'combined-fmb', id],
    queryFn: async () =>
      (await gql<Wrapped<'combinedFmb', HoldingFmb | null>>(Q_HOLDING_FMB, { id }))
        .web.combinedFmb,
  });
}

export function useHoldingExpenses(id: string | undefined, year?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'combined-expenses', id, year ?? ''],
    // Hold the last good answer while the next year is fetched, like the
    // record's own ledger: changing the year must not unmount the page.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await gql<Wrapped<'combinedExpenses', HoldingExpenseView | null>>(
        Q_HOLDING_EXPENSES, { id, year: year ?? null })).web.combinedExpenses,
  });
}

/** What a holding's Services tab draws of an order.
 *
 *  A narrow `Pick` rather than `Order`, because the selection set below is
 *  narrow: this is a read-only list that links to the order's own page, and
 *  claiming the full `Order` shape while asking for a third of it would put
 *  `assignedResource: undefined` behind a type that says it is never missing. */
export type HoldingOrder = Pick<Order,
  'id' | 'ref' | 'kind' | 'serviceKey' | 'title' | 'detail' | 'recordId' | 'recordTitle'
  | 'status' | 'statusLabel' | 'statusState' | 'stage' | 'stageLabel' | 'needsYou'
  | 'dueDate' | 'cost' | 'held' | 'pendingReview'>;

/** Every service ordered against any member of the holding.
 *
 *  The same `orders` read the record's own Services hanger uses, filtered by
 *  membership — because an order is still placed against ONE survey. A patta
 *  copy is issued for a survey number, not for whatever the owner calls the
 *  group, so this gathers the members' orders rather than inventing an order
 *  against the aggregate. */
export function useHoldingOrders(id: string | undefined, includeClosed = false) {
  return useQuery({
    // A new scope, toggle or id keeps the last answer on screen, dimmed,
    // instead of blanking (design.md § Loading).
    placeholderData: keepPreviousData,
    enabled: !!id,
    queryKey: [KEY, 'combined-orders', id, includeClosed],
    queryFn: async () =>
      (await gql<Wrapped<'orders', HoldingOrder[]>>(
        `query CPO($id:String!,$includeClosed:Boolean!) {
           web { orders(combinedId:$id,includeClosed:$includeClosed) {
             id ref kind serviceKey title detail recordId recordTitle status statusLabel
             statusState stage stageLabel needsYou dueDate cost held pendingReview } } }`,
        { id, includeClosed })).web.orders,
  });
}

export const useCreateHolding = (reportError = true) =>
  useW360Mutation<{ name: string; recordIds: string[]; note?: string },
                   Wrapped<'createCombinedProperty', string>>(
    `mutation CCP($name:String!,$recordIds:[String!]!,$note:String! = "") {
       web { createCombinedProperty(name:$name,recordIds:$recordIds,note:$note) } }`,
    'That holding',
    reportError,
  );

export const useRenameHolding = (reportError = true) =>
  useW360Mutation<{ id: string; name: string; note?: string },
                   Wrapped<'updateCombinedProperty', boolean>>(
    `mutation UCP($id:String!,$name:String!,$note:String! = "") {
       web { updateCombinedProperty(id:$id,name:$name,note:$note) } }`,
    'That change',
    reportError,
  );

/** The whole membership list in one write. A refusal leaves the holding exactly
 *  as it was rather than half-changed. */
export const useSetHoldingMembers = (reportError = true) =>
  useW360Mutation<{ id: string; recordIds: string[] },
                   Wrapped<'setCombinedMembers', boolean>>(
    `mutation SCM($id:String!,$recordIds:[String!]!) {
       web { setCombinedMembers(id:$id,recordIds:$recordIds) } }`,
    'Those properties',
    reportError,
  );

/** Every member of the holding to one stake, Mine or I manage it, in one write
 *  (a member's stake cannot change on its own while it is in a holding). */
export const useSetHoldingStake = (reportError = true) =>
  useW360Mutation<{ id: string; stake: 'owned' | 'managed' },
                   Wrapped<'setCombinedStake', boolean>>(
    `mutation SCS($id:String!,$stake:String!) {
       web { setCombinedStake(id:$id,stake:$stake) } }`,
    'That stake',
    reportError,
  );

export const useDeleteHolding = (reportError = true) =>
  useW360Mutation<{ id: string }, Wrapped<'deleteCombinedProperty', boolean>>(
    `mutation DCP($id:String!) { web { deleteCombinedProperty(id:$id) } }`,
    'Removing that holding',
    reportError,
  );

/** One cost against the whole holding — the thing a holding exists
 *  for. It is not divided between the members: dividing it would invent a split
 *  nobody agreed. */
export const useSaveHoldingExpense = (reportError = true) =>
  useW360Mutation<{
    combinedId: string; title: string; amount: number; spentOn: string; kind: string;
    category: string; paidBy: string; vendor: string; note: string; recoverable: boolean;
  }, Wrapped<'saveCombinedExpense', string>>(
    `mutation SCE($combinedId:String!,$title:String!,$amount:Float!,$spentOn:String!,
                  $kind:String!,$category:String!,$paidBy:String!,$vendor:String!,
                  $note:String!,$recoverable:Boolean!) {
       web { saveCombinedExpense(combinedId:$combinedId,title:$title,amount:$amount,
                                 spentOn:$spentOn,kind:$kind,category:$category,
                                 paidBy:$paidBy,vendor:$vendor,note:$note,
                                 recoverable:$recoverable) } }`,
    'That cost',
    reportError,
  );

export const useDeleteHoldingExpense = (reportError = true) =>
  useW360Mutation<{ expenseId: string }, Wrapped<'deleteCombinedExpense', boolean>>(
    `mutation DCE($expenseId:String!) { web { deleteCombinedExpense(expenseId:$expenseId) } }`,
    'Removing that cost',
    reportError,
  );

/** File ONE uploaded FMB sheet across several members (a joint FMB). The server
 *  writes a flagged copy onto every chosen survey, so it stays on the records it
 *  covers. Resolves to the shared joint id, or "" when refused. */
export const useAddJointFmb = (reportError = true) =>
  useW360Mutation<{
    combinedId: string; fileRef: string; name: string; mimeType: string;
    sizeBytes: number; recordIds: string[];
  }, Wrapped<'addJointFmb', string>>(
    `mutation AJF($combinedId:String!,$fileRef:String!,$name:String!,$mimeType:String!,
                  $sizeBytes:Int!,$recordIds:[String!]!) {
       web { addJointFmb(combinedId:$combinedId,fileRef:$fileRef,name:$name,
                         mimeType:$mimeType,sizeBytes:$sizeBytes,recordIds:$recordIds) } }`,
    'That joint FMB',
    reportError,
  );

/** Unfile every copy of one joint FMB. The stored file is left alone. */
export const useDeleteJointFmb = (reportError = true) =>
  useW360Mutation<{ jointId: string }, Wrapped<'deleteJointFmb', boolean>>(
    `mutation DJF($jointId:String!) { web { deleteJointFmb(jointId:$jointId) } }`,
    'Removing that joint FMB',
    reportError,
  );

// ── Profile (/profile) ─────────────────────────────────────────────
//
// The one screen here that reads through the ROOT schema rather than
// `Query.web`: `me`, `updateMe` and `updateProfile` are the cross-client
// contract iOS and mobile already speak, and a `web` twin of each would be a
// second place for the same row to be written. Each document selects exactly
// one root field, so the sealed e2e world can route it as `root.<field>`.

/** The account row. `name` is seeded with the principal id on first contact,
 *  so the screen treats an id-shaped name as no name at all. */
export interface Me {
  id: string; name: string; email: string; address: string; language: string;
  districtsOfInterest: string; notificationPrefs: string; kycRefMasked: string;
  mfaEnabled: boolean;
  /** When the PREVIOUS visit began (the `me` read writes this one's), ISO. */
  lastActiveAt: string;
}
export interface District { id: string; name: string }

export function useMe() {
  return useQuery({
    queryKey: [KEY, 'profile', 'me'],
    queryFn: async () => {
      const d = await gql<{ me: Me | null }>(
        `query Me { me { id name email address language districtsOfInterest
                         notificationPrefs kycRefMasked mfaEnabled lastActiveAt } }`,
      );
      if (!d.me) throw new Error('The server returned no profile.');
      return d.me;
    },
    // Seeding a form from a read that refetches on focus would overwrite what
    // is being typed. The form re-seeds after its own save instead.
    refetchOnWindowFocus: false,
  });
}

export function useDistricts() {
  return useQuery({
    queryKey: [KEY, 'profile', 'districts'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () =>
      (await gql<{ districts: District[] | null }>(`query Districts { districts { id name } }`))
        .districts ?? [],
  });
}

/** Name and contact email. An empty value leaves the stored one (the API's
 *  rule), so the screen never sends a blank it did not mean. Errors are the
 *  screen's to word, because a save is two writes and it has to say which
 *  half landed. */
export const useUpdateMe = () =>
  useW360Mutation<{ name: string; email: string }, { updateMe: { id: string } | null }>(
    `mutation UpdateMe($name:String!,$email:String!) {
       updateMe(name:$name,email:$email) { id } }`,
    'Your name',
    false,
  );

/** Every preference is sent, including the two with no control on this
 *  screen (language, mfaEnabled), echoed back as stored: a sent "" clears.
 *  `kycRef` is "" unless a new number was typed; "" leaves the stored one. */
export const useUpdateProfile = () =>
  useW360Mutation<{
    language: string; districtsOfInterest: string; notificationPrefs: string;
    kycRef: string; mfaEnabled: boolean; address: string;
  }, { updateProfile: { kycRefMasked: string } | null }>(
    `mutation UpdateProfile($language:String!,$districtsOfInterest:String!,
                            $notificationPrefs:String!,$kycRef:String!,$mfaEnabled:Boolean!,
                            $address:String!) {
       updateProfile(language:$language,districtsOfInterest:$districtsOfInterest,
                     notificationPrefs:$notificationPrefs,kycRef:$kycRef,
                     mfaEnabled:$mfaEnabled,address:$address) { kycRefMasked } }`,
    'Your preferences',
    false,
  );
