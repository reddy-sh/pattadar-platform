/**
 * Typed reads for the record-360 screens (W01–W15).
 *
 * Every query goes through `Query.web` (services/api/src/web360.py) so this
 * surface can grow without touching the iOS-facing schema. Queries are written
 * out in full rather than composed from fragments: each screen asks for exactly
 * the fields it draws, which keeps the payloads honest and makes it obvious in
 * review which screen is responsible for which field.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gql } from '../api/client';

// ── Shapes ─────────────────────────────────────────────────────────────

export interface Tile { key: string; label: string; value: string; unit: string; note: string; tone: string }
export interface WaitingItem {
  id: string; title: string; detail: string; icon: string;
  actionLabel: string; actionKind: string; recordId: string;
}
export interface ValueBar { label: string; value: number; share: number }
export interface RecordCard {
  id: string; kind: string; title: string; subtitle: string; classification: string;
  status: string; stake: string; khataNo: string; ownerName: string; village: string;
  mandal: string; district: string; placeLine: string; extent: number; extentUnit: string;
  extentAlt: string; marketValue: number; tags: string[];
}
export interface Portfolio {
  displayName: string;
  farmExtent: number; farmCount: number; plotExtent: number; plotCount: number;
  builtExtent: number; builtFlats: number; builtShops: number; invested: number;
  worthNow: number; gain: number; loans: number; managedCount: number; watchedCount: number;
  waitingCount: number; runningCosts: number; paperCount: number; backupVerifiedOn: string;
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
  status: string; stake: string; khataNo: string; ownerName: string; placeLine: string;
  placeLineTe: string; extent: number; extentUnit: string; extentDetail: string;
  marketValue: number; perUnitValue: number; perUnitLabel: string; boughtYear: string;
  lat: number; lon: number; mapCaption: string; paperCount: number; featureCount: number;
  peopleCount: number; serviceCount: number; photoCount: number; photoNote: string;
  tags: string[]; noteBody: string; noteAuthor: string; noteAt: string;
}
export interface Paper {
  id: string; title: string; detail: string; shelf: string; icon: string;
  tags: string[]; shared: boolean; pageCount: number;
}
export interface Feature {
  id: string; label: string; spec: string; icon: string; category: string;
  condition: string; conditionState: string; note: string; lat: number; lon: number;
  pinLabel: string; photoCount: number; actions: string[];
}
export interface FeatureList {
  features: Feature[]; total: number; needsRepair: number;
  walkedOn: string; walkedBy: string; categories: FacetOption[];
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
  seasonalIn: number; walletBalance: number; walletNote: string;
}
export interface BoundaryMark {
  id: string; seq: number; label: string; state: string; detail: string;
  lat: number; lon: number; photoCount: number; notedOn: string;
}
export interface BoundaryView {
  recordId: string; title: string; lat: number; lon: number; setBy: string;
  accuracy: string; extentLabel: string; shape: number[]; caption: string;
  sheetTitle: string; sheetDetail: string; marks: BoundaryMark[];
}
export interface Photo {
  id: string; caption: string; category: string; fileName: string; mediaKind: string;
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
  marketTotal: number; marketGain: number; marketGainPct: number; extent: number;
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
  shape: number[]; featureChips: string[]; watcher: string; watcherPay: string;
  paperCount: number; photoCount: number;
}
export interface SearchHit {
  id: string; kind: string; title: string; subtitle: string; route: string;
}
export interface MapView {
  areaLabel: string; records: MapRecord[]; counts: FacetOption[];
  insights: { id: string; title: string; detail: string }[];
}
export interface Order {
  id: string; kind: string; title: string; detail: string; assignee: string;
  cost: number; stage: number; stageLabel: string; needsYou: boolean;
  dueDate: string; recordId: string; recordTitle: string;
}

// ── Query documents ────────────────────────────────────────────────────

const CARD = `id kind title subtitle classification status stake khataNo ownerName
  village mandal district placeLine extent extentUnit extentAlt marketValue tags`;

const Q_PORTFOLIO = `{ web { portfolio {
  displayName
  farmExtent farmCount plotExtent plotCount builtExtent builtFlats builtShops
  invested worthNow gain loans managedCount watchedCount waitingCount runningCosts
  paperCount backupVerifiedOn
  tiles { key label value unit note tone }
  waiting { id title detail icon actionLabel actionKind recordId }
  valueBars { label value share }
  recent { ${CARD} }
} } }`;

const Q_PROPERTIES = `query P($kinds:[String!],$statuses:[String!],$stakes:[String!],$derived:[String!],$tags:[String!]) {
  web { properties(kinds:$kinds,statuses:$statuses,stakes:$stakes,derived:$derived,tags:$tags) {
    shown total hidden filterSummary hiddenPlaces activeCount
    cards { ${CARD} }
    facets { key label options { key label count active } }
  } } }`;

const Q_RECORD = `query R($id:String!) { web { record(id:$id) {
  id kind title eyebrow classification status stake khataNo ownerName placeLine
  placeLineTe extent extentUnit extentDetail marketValue perUnitValue perUnitLabel
  boughtYear lat lon mapCaption paperCount featureCount peopleCount serviceCount
  photoCount photoNote tags noteBody noteAuthor noteAt
} } }`;

const Q_PAPERS = `query D($id:String!) { web { papers(recordId:$id) {
  id title detail shelf icon tags shared pageCount } } }`;

const Q_FEATURES = `query F($id:String!) { web { features(recordId:$id) {
  total needsRepair walkedOn walkedBy
  categories { key label count active }
  features { id label spec icon category condition conditionState note lat lon
             pinLabel photoCount actions }
} } }`;

const Q_PEOPLE = `query PE($id:String!) { web { people(recordId:$id) {
  count monthlyOut seasonalIn walletBalance walletNote
  people { id name initials role badges summary arrangement payLabel payValue
           dueLabel dueValue visibility actions compact }
  payments { id title subtitle occurredOn method amount direction state }
} } }`;

const Q_BOUNDARY = `query B($id:String!) { web { boundary(recordId:$id) {
  recordId title lat lon setBy accuracy extentLabel shape caption sheetTitle sheetDetail
  marks { id seq label state detail lat lon photoCount notedOn }
} } }`;

const Q_PHOTOS = `query PH($id:String!,$featureId:String) { web { photos(recordId:$id,featureId:$featureId) {
  total videoCount visitCount latestVisit latestVisitCount verifiedCount unprovenCount subject
  photos { id caption category fileName mediaKind capturedAt localTime capturedBy lat lon
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
         recoverable recoverableNote hasReceipt }
} } }`;

const Q_VAULT = `{ web { vault {
  total regionNote
  shelves { key label note count }
  links { id audience subject terms docCount openedCount lastOpenedAt expiresOn daysLeft initials }
} } }`;

const Q_DOCUMENT = `query DOC($id:String!) { web { document(id:$id) {
  id title subtitle shelf recordId recordTitle pageCount sizeLabel registeredOn office
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
            khataNo ownerName village lat lon shape featureChips watcher watcherPay
            paperCount photoCount }
} } }`;

// ── Hooks ──────────────────────────────────────────────────────────────

type Wrapped<K extends string, T> = { web: Record<K, T> };
const KEY = 'w360';

export function usePortfolio() {
  return useQuery({
    queryKey: [KEY, 'portfolio'],
    queryFn: async () => (await gql<Wrapped<'portfolio', Portfolio>>(Q_PORTFOLIO)).web.portfolio,
  });
}

export interface PropertyFilter {
  kinds: string[]; statuses: string[]; stakes: string[]; derived: string[]; tags: string[];
}
export const EMPTY_FILTER: PropertyFilter = { kinds: [], statuses: [], stakes: [], derived: [], tags: [] };

export function useProperties(filter: PropertyFilter) {
  return useQuery({
    queryKey: [KEY, 'properties', filter],
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
    queryFn: async () =>
      (await gql<Wrapped<'money', MoneyView | null>>(Q_MONEY, { id, appreciation: appreciation ?? null })).web.money,
  });
}

export function useExpenses(id: string | undefined, year?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [KEY, 'expenses', id, year ?? ''],
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
export function useSearch(q: string) {
  return useQuery({
    enabled: q.trim().length >= 2,
    queryKey: [KEY, 'search', q.trim()],
    queryFn: async () =>
      (await gql<Wrapped<'search', SearchHit[]>>(Q_SEARCH, { q: q.trim() })).web.search,
    staleTime: 30_000,
  });
}

const Q_ORDERS = `query O($recordId:String) { web { orders(recordId:$recordId) {
  id kind title detail assignee cost stage stageLabel needsYou dueDate recordId recordTitle
} } }`;

export function useOrders(recordId?: string) {
  return useQuery({
    queryKey: [KEY, 'orders', recordId ?? ''],
    queryFn: async () =>
      (await gql<Wrapped<'orders', Order[]>>(Q_ORDERS, { recordId: recordId ?? null })).web.orders,
  });
}

export function useMapRecords() {
  return useQuery({
    queryKey: [KEY, 'map'],
    queryFn: async () => (await gql<Wrapped<'mapRecords', MapView>>(Q_MAP)).web.mapRecords,
  });
}

// ── Writes ─────────────────────────────────────────────────────────────

/** Invalidate the whole w360 tree — these screens cross-reference each other
 *  (a tag shows on the card, the rail count and the 360 header), so a
 *  surgical invalidation would leave one of the three stale. */
function useW360Mutation<V>(doc: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => gql<unknown>(doc, vars as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export const useSetTag = () =>
  useW360Mutation<{ entityType: string; entityId: string; tag: string; on: boolean }>(
    `mutation T($entityType:String!,$entityId:String!,$tag:String!,$on:Boolean!) {
       web { setTag(entityType:$entityType,entityId:$entityId,tag:$tag,on:$on) } }`,
  );

export const useSaveExpense = () =>
  useW360Mutation<{
    recordId: string; title: string; amount: number; spentOn: string; kind: string;
    category: string; paidBy: string; onLabel: string; featureId: string; recoverable: boolean;
  }>(
    `mutation SE($recordId:String!,$title:String!,$amount:Float!,$spentOn:String!,$kind:String!,
                 $category:String!,$paidBy:String!,$onLabel:String!,$featureId:String!,
                 $recoverable:Boolean!) {
       web { saveExpense(recordId:$recordId,title:$title,amount:$amount,spentOn:$spentOn,
                         kind:$kind,category:$category,paidBy:$paidBy,onLabel:$onLabel,
                         featureId:$featureId,recoverable:$recoverable) } }`,
  );

export const useUpdateCaption = () =>
  useW360Mutation<{ photoId: string; caption: string }>(
    `mutation UC($photoId:String!,$caption:String!) {
       web { updateCaption(photoId:$photoId,caption:$caption) } }`,
  );

export const useAcceptMark = () =>
  useW360Mutation<{ markId: string }>(
    `mutation AM($markId:String!) { web { acceptMarkPosition(markId:$markId) } }`,
  );

export const useDeleteMark = () =>
  useW360Mutation<{ markId: string }>(
    `mutation DM($markId:String!) { web { deleteMark(markId:$markId) } }`,
  );

export const useRevokeLink = () =>
  useW360Mutation<{ linkId: string }>(
    `mutation RL($linkId:String!) { web { revokeShareLink(linkId:$linkId) } }`,
  );

export const useExtendLink = () =>
  useW360Mutation<{ linkId: string; days: number }>(
    `mutation EL($linkId:String!,$days:Int!) { web { extendShareLink(linkId:$linkId,days:$days) } }`,
  );

export const useDismissWaiting = () =>
  useW360Mutation<{ id: string }>(
    `mutation DW($id:String!) { web { dismissWaiting(id:$id) } }`,
  );

/** One form for both kinds; an update sends only what changed — an omitted
 *  field is left alone on the server, never blanked. */
export interface RecordInput {
  id?: string | null; kind?: string; title?: string; classification?: string;
  status?: string; stake?: string; khataNo?: string; ownerName?: string;
  village?: string; mandal?: string; district?: string; extent?: number;
  extentUnit?: string; marketValue?: number; purchasePrice?: number;
}

export const useSaveRecord = () =>
  useW360Mutation<{ input: RecordInput }>(
    `mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }`,
  );

export const useDeleteRecords = () =>
  useW360Mutation<{ ids: string[] }>(
    `mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }`,
  );

export const useArchiveRecords = () =>
  useW360Mutation<{ ids: string[]; archived: boolean }>(
    `mutation AR($ids:[String!]!,$archived:Boolean!) {
       web { archiveRecords(ids:$ids,archived:$archived) } }`,
  );

export const useTagRecords = () =>
  useW360Mutation<{ ids: string[]; tag: string }>(
    `mutation TR($ids:[String!]!,$tag:String!) { web { tagRecords(ids:$ids,tag:$tag) } }`,
  );

export const useOrderService = () =>
  useW360Mutation<{ recordIds: string[]; kind: string }>(
    `mutation OS($recordIds:[String!]!,$kind:String!) {
       web { orderService(recordIds:$recordIds,kind:$kind) } }`,
  );
