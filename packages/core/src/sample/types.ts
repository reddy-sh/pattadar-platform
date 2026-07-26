/**
 * Typed shapes mirroring the pattadar GraphQL API (camelCase, same field
 * names as the rhub app's queries). The web app's data hooks fetch live data
 * in these shapes and fall back to the sample datasets in `data.ts`.
 */

export interface DashboardStats {
  totalPassbooks: number;
  totalParcels: number;
  totalDocuments: number;
  totalBeneficiaries: number;
  pendingInvitations: number;
  estimatedValue: number;
  totalExtent: number;
  totalGroups: number;
}

export interface Passbook {
  id: string;
  ref: string;
  /** Owning user id (live shape; absent from older samples). */
  ownerUserId?: string;
  pattadarNo: string;
  ownerName: string;
  fatherHusbandName: string;
  state: string;
  district: string;
  mandal: string;
  village: string;
  photo: string;
  totalExtent: number;
  groupId: string;
  createdAt: string;
}

export interface Parcel {
  id: string;
  ref: string;
  passbookId: string;
  surveyNo: string;
  subdivision: string;
  extent: number;
  unit: string;
  classification: string;
  status: string;
  label: string;
  geoPoint: string;
  currentOwner: string;
  purchasePrice: number;
  purchaseDate: string;
  guidelineValue: number;
  marketValue: number;
  loanAmount: number;
  regDocNo: string;
  sro: string;
  regDate: string;
  ecStatus: string;
  ecDate: string;
  taxPaidUpto: string;
  litigation: boolean;
  createdAt: string;
  /** My relationship to the holding: 'owned' | 'managed' | 'watch'. */
  stake?: string;
}

export type PropertyType =
  | 'open_plot'
  | 'flat'
  | 'independent_house'
  | 'villa'
  | 'commercial'
  | 'rental'
  | 'other';

export interface Property {
  id: string;
  type: PropertyType;
  label: string;
  city: string;
  district: string;
  landArea: number;
  landUnit: string;
  builtupArea: number;
  builtupUnit: string;
  holdingStatus: string;
  currentValue: number;
  marketValue: number;
  guidelineValue: number;
  purchasePrice: number;
  litigation: boolean;
  taxPaidUpto: string;
  ecStatus: string;
  ecDate: string;
  /** JSON string of type-specific attributes (bhk, plot_no, monthly_rent…). */
  attributes: string;
  createdAt: string;
  /** My relationship to the holding: 'owned' | 'managed' | 'watch'. */
  stake?: string;
  currentOwner?: string;
  groupId?: string;
}

export interface DocumentRecord {
  id: string;
  fileRef: string;
  docType: string;
  parcelId: string;
  passbookId: string;
  createdAt: string;
  propertyId?: string;
  tags?: string;
}

export interface RegisteredDocument {
  id: string;
  ref: string;
  docType: string;
  documentNo: string;
  regYear: string;
  sro: string;
  surveyNo: string;
  plotNo: string;
  consideration: number;
  village: string;
  district: string;
  passbookId: string;
  parcelId: string;
  createdAt: string;
  /** Sample-only enrichments (not in the live shape — shown as "—" when live). */
  parties?: string;
  stampDuty?: number;
}

export type GroupType = 'family' | 'partnership' | 'company' | 'huf' | 'trust';

export interface Group {
  id: string;
  ownerUserId: string;
  type: GroupType;
  name: string;
  description: string;
  myRole: string;
  memberCount: number;
  landCount: number;
  totalExtent: number;
  totalShare: number;
  createdAt: string;
}

export interface Member {
  id: string;
  groupId: string;
  name: string;
  relation: string;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  role: string;
  isSelf: boolean;
  isBeneficiary: boolean;
  sharePct: number;
  status: string; // 'pending' | 'verified'
  aadhaarMasked: string;
  phoneVerified: boolean;
  emailVerified: boolean;
}

export interface Invitation {
  id: string;
  scopeType: string;
  scopeId: string;
  role: string;
  inviteeContact: string;
  token: string;
  expiry: string;
  status: string; // 'pending' | 'accepted' | 'expired'
  createdAt: string;
}

export interface NotificationEntry {
  id: string;
  channel: string; // 'email' | 'whatsapp' | 'sms'
  recipient: string;
  subject: string;
  body: string;
  provider: string;
  status: string; // 'sent' | 'failed' | 'stubbed'
  error: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface ServiceRequest {
  id: string;
  reqType: string;
  parcelId: string;
  status: string; // 'pending' | 'in_progress' | 'completed'
  details: string;
  createdAt: string;
}

export interface SroOffice {
  id: string;
  code: string;
  name: string;
  drZone: string;
  district: string;
  mandal: string;
}

export interface FeeScheduleRow {
  id: string;
  regTypeEn: string;
  natureEn: string;
  stampRate: number;
  transferRate: number;
  regRate: number;
  userRate: number;
}

export interface MarketValueRow {
  id: string;
  district: string;
  mandal: string;
  village: string;
  classification: string;
  ratePerUnit: number;
  unit: string;
  effectiveFrom: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  address: string;
  language: string;
  districtsOfInterest: string;
  notificationPrefs: string;
  kycRefMasked: string;
  mfaEnabled: boolean;
}

/** Wallet is design-forward/coming-soon — sample-only shapes. */
export interface WalletTransaction {
  id: string;
  date: string;
  description: string;
  category: string;
  direction: 'credit' | 'debit';
  amount: number;
}

export interface WalletSummary {
  balance: number;
  transactions: WalletTransaction[];
}
