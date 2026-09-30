/**
 * SHAPE TEMPLATES — not data.
 *
 * These exports exist for exactly one reason: `useLiveOrSample(key, fetchLive,
 * template)` needs a value of the right shape to derive a shape-correct EMPTY
 * dataset from when a live read fails. `emptyLike()` maps arrays → [],
 * numbers → 0, strings → '', booleans → false, so NOTHING declared in this
 * file has reached a screen since the founder decision of 2026-07-26 ("it is
 * real application now — NO mock/sample rows may ever render").
 *
 * Until now they were also a 599-line invented estate: a named owner with a
 * masked Aadhaar reference and a Guntur street address, nine khatas and survey
 * numbers, rupee valuations, family members with phone numbers and birthdates,
 * an audit trail of things nobody did, and a wallet holding ₹12,500. None of it
 * rendered, but all of it shipped in the browser bundle, and one edit
 * (`q.data ?? sample` instead of `q.data ?? emptyLike(sample)`) was all it took
 * to put the whole estate on screen as if it were someone's records. That is
 * what `useWallet` had already done.
 *
 * So the fiction is gone and the structure is kept. Every export, every key,
 * every array length and every cross-reference id survives, because the shape
 * builders in the detail pages look rows up by id (`sampleParcels.find`,
 * `samplePassbooks.find`, `sampleGroups.find`, `sampleDocuments.filter`) and a
 * missed lookup silently changes which branch a screen renders. Ids and enum
 * members are therefore structure, not content; everything a reader could
 * mistake for a fact is empty.
 *
 * Adding a realistic value back here is a defect. `scripts/provenance-tests.ts`
 * fails the build if you do.
 */
import type {
  AuditEvent,
  DashboardStats,
  DocumentRecord,
  FeeScheduleRow,
  Group,
  Invitation,
  MarketValueRow,
  Member,
  NotificationEntry,
  Parcel,
  Passbook,
  Profile,
  Property,
  RegisteredDocument,
  ServiceRequest,
  SroOffice,
  WalletSummary,
} from './types';

export const sampleProfile: Profile = {
  id: '',
  name: '',
  email: '',
  address: '',
  language: '',
  districtsOfInterest: '',
  notificationPrefs: '',
  kycRefMasked: '',
  mfaEnabled: false,
};

export const samplePassbooks: Passbook[] = [
  {
    id: 'pb-1',
    ref: '',
    pattadarNo: '',
    ownerName: '',
    fatherHusbandName: '',
    state: '',
    district: '',
    mandal: '',
    village: '',
    photo: '',
    totalExtent: 0,
    groupId: 'grp-1',
    createdAt: '',
  },
  {
    id: 'pb-2',
    ref: '',
    pattadarNo: '',
    ownerName: '',
    fatherHusbandName: '',
    state: '',
    district: '',
    mandal: '',
    village: '',
    photo: '',
    totalExtent: 0,
    groupId: 'grp-1',
    createdAt: '',
  },
  {
    id: 'pb-3',
    ref: '',
    pattadarNo: '',
    ownerName: '',
    fatherHusbandName: '',
    state: '',
    district: '',
    mandal: '',
    village: '',
    photo: '',
    totalExtent: 0,
    groupId: 'grp-2',
    createdAt: '',
  },
];

/** One row per id the detail-page shape builders look up. `passbookId` is the
 *  join key `sampleFor()` walks, so it stays; nothing else here is a value. */
const parcelTemplate = {
  ref: '',
  surveyNo: '',
  subdivision: '',
  extent: 0,
  unit: '',
  classification: '',
  status: '',
  label: '',
  geoPoint: '',
  currentOwner: '',
  purchasePrice: 0,
  purchaseDate: '',
  guidelineValue: 0,
  marketValue: 0,
  loanAmount: 0,
  regDocNo: '',
  sro: '',
  regDate: '',
  ecStatus: '',
  ecDate: '',
  taxPaidUpto: '',
  litigation: false,
  createdAt: '',
};

export const sampleParcels: Parcel[] = [
  { id: 'par-1', passbookId: 'pb-1', ...parcelTemplate },
  { id: 'par-2', passbookId: 'pb-1', ...parcelTemplate },
  { id: 'par-3', passbookId: 'pb-2', ...parcelTemplate },
  { id: 'par-4', passbookId: 'pb-2', ...parcelTemplate },
  { id: 'par-5', passbookId: 'pb-3', ...parcelTemplate },
  { id: 'par-6', passbookId: 'pb-3', ...parcelTemplate },
];

/** `type` is a union member, so it is structure the compiler needs, not a
 *  claim about anything the owner holds. */
const propertyTemplate = {
  label: '',
  city: '',
  district: '',
  landArea: 0,
  landUnit: '',
  builtupArea: 0,
  builtupUnit: '',
  holdingStatus: '',
  currentValue: 0,
  marketValue: 0,
  guidelineValue: 0,
  purchasePrice: 0,
  litigation: false,
  taxPaidUpto: '',
  ecStatus: '',
  ecDate: '',
  attributes: '',
  createdAt: '',
};

export const sampleProperties: Property[] = [
  { id: 'prop-1', type: 'open_plot', ...propertyTemplate },
  { id: 'prop-2', type: 'flat', ...propertyTemplate },
  { id: 'prop-3', type: 'commercial', ...propertyTemplate },
  { id: 'prop-4', type: 'independent_house', ...propertyTemplate },
];

export const sampleDocuments: DocumentRecord[] = [
  { id: 'doc-1', fileRef: '', docType: '', parcelId: 'par-1', passbookId: 'pb-1', createdAt: '' },
  { id: 'doc-2', fileRef: '', docType: '', parcelId: '', passbookId: 'pb-1', createdAt: '' },
  { id: 'doc-3', fileRef: '', docType: '', parcelId: 'par-1', passbookId: 'pb-1', createdAt: '' },
  { id: 'doc-4', fileRef: '', docType: '', parcelId: 'par-2', passbookId: 'pb-1', createdAt: '' },
  { id: 'doc-5', fileRef: '', docType: '', parcelId: 'par-3', passbookId: 'pb-2', createdAt: '' },
  { id: 'doc-6', fileRef: '', docType: '', parcelId: 'par-4', passbookId: 'pb-2', createdAt: '' },
  { id: 'doc-7', fileRef: '', docType: '', parcelId: 'par-5', passbookId: 'pb-3', createdAt: '' },
];

const deedTemplate = {
  ref: '',
  docType: '',
  documentNo: '',
  regYear: '',
  sro: '',
  surveyNo: '',
  plotNo: '',
  consideration: 0,
  village: '',
  district: '',
  createdAt: '',
  parties: '',
  stampDuty: 0,
};

export const sampleRegisteredDocuments: RegisteredDocument[] = [
  { id: 'rd-1', passbookId: 'pb-1', parcelId: 'par-1', ...deedTemplate },
  { id: 'rd-2', passbookId: 'pb-1', parcelId: 'par-2', ...deedTemplate },
  { id: 'rd-3', passbookId: 'pb-2', parcelId: 'par-3', ...deedTemplate },
  { id: 'rd-4', passbookId: 'pb-3', parcelId: 'par-5', ...deedTemplate },
  { id: 'rd-5', passbookId: '', parcelId: '', ...deedTemplate },
];

export const sampleGroups: Group[] = [
  {
    id: 'grp-1',
    ownerUserId: '',
    type: 'family',
    name: '',
    description: '',
    myRole: '',
    memberCount: 0,
    landCount: 0,
    totalExtent: 0,
    totalShare: 0,
    createdAt: '',
  },
  {
    id: 'grp-2',
    ownerUserId: '',
    type: 'partnership',
    name: '',
    description: '',
    myRole: '',
    memberCount: 0,
    landCount: 0,
    totalExtent: 0,
    totalShare: 0,
    createdAt: '',
  },
];

/** `groupId` is the key `familiesData.sampleGroupMembers()` filters on, and
 *  `isSelf` decides which branch the dashboard's member roll-up takes, so both
 *  stay. No name, relation, phone, email, birthdate or Aadhaar reference does. */
const memberTemplate = {
  name: '',
  relation: '',
  gender: '',
  dob: '',
  phone: '',
  email: '',
  role: '',
  isBeneficiary: false,
  sharePct: 0,
  status: '',
  aadhaarMasked: '',
  phoneVerified: false,
  emailVerified: false,
};

export const sampleMembers: Member[] = [
  { id: 'mem-1', groupId: 'grp-1', isSelf: true, ...memberTemplate },
  { id: 'mem-2', groupId: 'grp-1', isSelf: false, ...memberTemplate },
  { id: 'mem-3', groupId: 'grp-1', isSelf: false, ...memberTemplate },
  { id: 'mem-4', groupId: 'grp-1', isSelf: false, ...memberTemplate },
  { id: 'mem-5', groupId: 'grp-1', isSelf: false, ...memberTemplate },
  { id: 'mem-6', groupId: 'grp-1', isSelf: false, ...memberTemplate },
  { id: 'mem-7', groupId: 'grp-2', isSelf: true, ...memberTemplate },
  { id: 'mem-8', groupId: 'grp-2', isSelf: false, ...memberTemplate },
  { id: 'mem-9', groupId: 'grp-2', isSelf: false, ...memberTemplate },
];

const invitationTemplate = {
  scopeType: '',
  role: '',
  inviteeContact: '',
  token: '',
  expiry: '',
  status: '',
  createdAt: '',
};

export const sampleInvitations: Invitation[] = [
  { id: 'inv-1', scopeId: 'grp-1', ...invitationTemplate },
  { id: 'inv-2', scopeId: 'grp-1', ...invitationTemplate },
  { id: 'inv-3', scopeId: 'grp-2', ...invitationTemplate },
  { id: 'inv-4', scopeId: 'grp-1', ...invitationTemplate },
];

const notificationTemplate = {
  channel: '',
  recipient: '',
  subject: '',
  body: '',
  provider: '',
  status: '',
  error: '',
  createdAt: '',
};

export const sampleNotifications: NotificationEntry[] = [
  { id: 'ntf-1', ...notificationTemplate },
  { id: 'ntf-2', ...notificationTemplate },
  { id: 'ntf-3', ...notificationTemplate },
  { id: 'ntf-4', ...notificationTemplate },
  { id: 'ntf-5', ...notificationTemplate },
  { id: 'ntf-6', ...notificationTemplate },
];

const auditTemplate = { actor: '', action: '', target: '', details: '', timestamp: '' };

export const sampleAuditEvents: AuditEvent[] = [
  { id: 'ae-1', ...auditTemplate },
  { id: 'ae-2', ...auditTemplate },
  { id: 'ae-3', ...auditTemplate },
  { id: 'ae-4', ...auditTemplate },
  { id: 'ae-5', ...auditTemplate },
  { id: 'ae-6', ...auditTemplate },
  { id: 'ae-7', ...auditTemplate },
  { id: 'ae-8', ...auditTemplate },
];

const requestTemplate = { reqType: '', status: '', details: '', createdAt: '' };

export const sampleServiceRequests: ServiceRequest[] = [
  { id: 'sr-1', parcelId: 'par-5', ...requestTemplate },
  { id: 'sr-2', parcelId: 'par-4', ...requestTemplate },
  { id: 'sr-3', parcelId: 'par-1', ...requestTemplate },
];

const sroTemplate = { code: '', name: '', drZone: '', district: '', mandal: '' };

export const sampleSroOffices: SroOffice[] = [
  { id: 'sro-1', ...sroTemplate },
  { id: 'sro-2', ...sroTemplate },
  { id: 'sro-3', ...sroTemplate },
  { id: 'sro-4', ...sroTemplate },
  { id: 'sro-5', ...sroTemplate },
  { id: 'sro-6', ...sroTemplate },
  { id: 'sro-7', ...sroTemplate },
  { id: 'sro-8', ...sroTemplate },
];

/** Rates are zero, not plausible. A guideline rate that looks right is worse
 *  than none: the reference tables are government data and belong in the
 *  database, where `AdminRefDataPage` reads them. */
const feeTemplate = {
  regTypeEn: '',
  natureEn: '',
  stampRate: 0,
  transferRate: 0,
  regRate: 0,
  userRate: 0,
};

export const sampleFeeSchedule: FeeScheduleRow[] = [
  { id: 'fee-1', ...feeTemplate },
  { id: 'fee-2', ...feeTemplate },
  { id: 'fee-3', ...feeTemplate },
  { id: 'fee-4', ...feeTemplate },
  { id: 'fee-5', ...feeTemplate },
  { id: 'fee-6', ...feeTemplate },
];

const marketValueTemplate = {
  district: '',
  mandal: '',
  village: '',
  classification: '',
  ratePerUnit: 0,
  unit: '',
  effectiveFrom: '',
};

export const sampleMarketValues: MarketValueRow[] = [
  { id: 'mv-1', ...marketValueTemplate },
  { id: 'mv-2', ...marketValueTemplate },
  { id: 'mv-3', ...marketValueTemplate },
  { id: 'mv-4', ...marketValueTemplate },
  { id: 'mv-5', ...marketValueTemplate },
  { id: 'mv-6', ...marketValueTemplate },
];

export const sampleDashboardStats: DashboardStats = {
  totalPassbooks: 0,
  totalParcels: 0,
  totalDocuments: 0,
  totalBeneficiaries: 0,
  pendingInvitations: 0,
  estimatedValue: 0,
  totalExtent: 0,
  totalGroups: 0,
};

/** `direction` is a union member the compiler needs. The balance is zero and
 *  the descriptions are empty: this is the shape of a ledger row, not a ledger. */
export const sampleWallet: WalletSummary = {
  balance: 0,
  transactions: [
    { id: 'wt-1', date: '', description: '', category: '', direction: 'credit', amount: 0 },
    { id: 'wt-2', date: '', description: '', category: '', direction: 'debit', amount: 0 },
    { id: 'wt-3', date: '', description: '', category: '', direction: 'debit', amount: 0 },
    { id: 'wt-4', date: '', description: '', category: '', direction: 'debit', amount: 0 },
    { id: 'wt-5', date: '', description: '', category: '', direction: 'credit', amount: 0 },
  ],
};

export const sampleLastVisit = '';
