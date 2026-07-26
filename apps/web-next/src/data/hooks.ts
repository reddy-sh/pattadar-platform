/**
 * Per-view data hooks. Each tries LIVE GraphQL first — using the exact field
 * names the rhub pattadar app queries — and falls back to the bundled sample
 * datasets on any failure (see useLiveOrSample).
 */
import {
  sampleAuditEvents,
  sampleDashboardStats,
  sampleDocuments,
  sampleFeeSchedule,
  sampleGroups,
  sampleInvitations,
  sampleLastVisit,
  sampleMarketValues,
  sampleMembers,
  sampleNotifications,
  sampleParcels,
  samplePassbooks,
  sampleProfile,
  sampleProperties,
  sampleServiceRequests,
  sampleSroOffices,
  sampleWallet,
} from '@pattadar/core';
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
  ServiceRequest,
  SroOffice,
  WalletSummary,
} from '@pattadar/core';
import { gql } from '../api/client';
import { useLiveOrSample } from './useLiveOrSample';
import type { DashMember } from './portfolio';

const PARCEL_FIELDS =
  'id ref passbookId surveyNo subdivision extent unit classification status label geoPoint currentOwner purchasePrice purchaseDate guidelineValue marketValue loanAmount regDocNo sro regDate ecStatus ecDate taxPaidUpto litigation createdAt';
const PASSBOOK_FIELDS =
  'id ref pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt';
const PROPERTY_FIELDS =
  'id type label city district landArea landUnit builtupArea builtupUnit holdingStatus currentValue marketValue guidelineValue purchasePrice litigation taxPaidUpto ecStatus ecDate attributes createdAt';
const GROUP_FIELDS =
  'id ownerUserId type name description myRole memberCount landCount totalExtent totalShare createdAt';
const MEMBER_FIELDS =
  'id name relation gender dob phone email role isSelf isBeneficiary sharePct status aadhaarMasked phoneVerified emailVerified';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  stats: DashboardStats;
  meName: string;
  lastVisit: string;
  parcels: Parcel[];
  passbooks: Passbook[];
  properties: Property[];
  groups: Group[];
  invitations: Invitation[];
  audit: AuditEvent[];
  requests: ServiceRequest[];
  documents: DocumentRecord[];
  members: DashMember[];
}

const dashboardSample: DashboardData = {
  stats: sampleDashboardStats,
  meName: sampleProfile.name.split(' ')[0] || 'there',
  lastVisit: sampleLastVisit,
  parcels: sampleParcels,
  passbooks: samplePassbooks,
  properties: sampleProperties,
  groups: sampleGroups,
  invitations: sampleInvitations.filter((i) => i.status === 'pending'),
  audit: sampleAuditEvents,
  requests: sampleServiceRequests,
  documents: sampleDocuments,
  members: sampleMembers.map((m) => ({ isSelf: m.isSelf, status: m.status })),
};

export function useDashboard() {
  return useLiveOrSample<DashboardData>(
    'dashboard',
    async () => {
      const d = await gql<{
        dashboardStats: DashboardStats;
        me: { name: string; lastActiveAt: string } | null;
        parcels: Parcel[];
        passbooks: Passbook[];
        properties: Property[];
        groups: Group[];
        pendingInvitations: Invitation[];
        recentAuditEvents: AuditEvent[];
        serviceRequests: ServiceRequest[];
        documents: DocumentRecord[];
      }>(`query {
        dashboardStats { totalPassbooks totalParcels totalDocuments totalBeneficiaries pendingInvitations estimatedValue totalExtent totalGroups }
        me { name lastActiveAt }
        parcels { ${PARCEL_FIELDS} }
        passbooks { ${PASSBOOK_FIELDS} }
        properties { ${PROPERTY_FIELDS} }
        groups { ${GROUP_FIELDS} }
        pendingInvitations { id scopeType scopeId role inviteeContact token expiry status createdAt }
        recentAuditEvents { id actor action target details timestamp }
        serviceRequests { id reqType parcelId status details createdAt }
        documents { id fileRef docType parcelId passbookId }
      }`);
      const perGroup = await Promise.all(
        (d.groups ?? []).map((g) =>
          gql<{ members: DashMember[] }>(
            `query($gid: String!) { members(groupId: $gid) { isSelf status } }`,
            { gid: g.id },
          ).catch(() => ({ members: [] as DashMember[] })),
        ),
      );
      return {
        stats: d.dashboardStats,
        meName: (d.me?.name || '').split(/[@\s.]/)[0] || 'there',
        lastVisit: d.me?.lastActiveAt || '',
        parcels: d.parcels ?? [],
        passbooks: d.passbooks ?? [],
        properties: d.properties ?? [],
        groups: d.groups ?? [],
        invitations: d.pendingInvitations ?? [],
        audit: d.recentAuditEvents ?? [],
        requests: d.serviceRequests ?? [],
        documents: d.documents ?? [],
        members: perGroup.flatMap((r) => r.members ?? []),
      };
    },
    dashboardSample,
  );
}

// ---------------------------------------------------------------------------
// Portfolio views — field selections copied verbatim from the rhub pattadar
// app (RemoteApp.tsx PassbooksView / HoldingsView + AllHoldingsView.tsx).
// ---------------------------------------------------------------------------

export interface PassbooksData {
  passbooks: Passbook[];
  parcels: Pick<Parcel, 'passbookId' | 'purchasePrice'>[];
  groups: Pick<Group, 'id' | 'name'>[];
}

export function usePassbooks() {
  return useLiveOrSample<PassbooksData>(
    'passbooks',
    async () => {
      const d = await gql<PassbooksData>(
        `query { passbooks { id ref ownerUserId pattadarNo ownerName fatherHusbandName state district mandal village photo totalExtent groupId createdAt } parcels { passbookId purchasePrice } groups { id name } }`,
      );
      return { passbooks: d.passbooks ?? [], parcels: d.parcels ?? [], groups: d.groups ?? [] };
    },
    { passbooks: samplePassbooks, parcels: sampleParcels, groups: sampleGroups },
  );
}

/** Narrowed live shapes for the merged Land & Properties page. */
export type HoldingParcel = Pick<
  Parcel,
  | 'id'
  | 'surveyNo'
  | 'subdivision'
  | 'extent'
  | 'unit'
  | 'classification'
  | 'status'
  | 'litigation'
  | 'stake'
  | 'currentOwner'
  | 'purchasePrice'
  | 'marketValue'
  | 'passbookId'
  | 'createdAt'
  | 'geoPoint'
>;
export type HoldingPassbook = Pick<
  Passbook,
  'id' | 'pattadarNo' | 'ownerName' | 'village' | 'mandal' | 'district' | 'groupId'
>;
export type HoldingProperty = Pick<
  Property,
  | 'id'
  | 'type'
  | 'label'
  | 'city'
  | 'district'
  | 'landArea'
  | 'landUnit'
  | 'builtupArea'
  | 'builtupUnit'
  | 'holdingStatus'
  | 'stake'
  | 'currentValue'
  | 'currentOwner'
  | 'groupId'
  | 'createdAt'
>;
export type HoldingDocument = Pick<DocumentRecord, 'parcelId' | 'propertyId' | 'docType' | 'tags' | 'fileRef'>;

export interface HoldingsData {
  parcels: HoldingParcel[];
  passbooks: HoldingPassbook[];
  properties: HoldingProperty[];
  documents: HoldingDocument[];
  groups: Pick<Group, 'id' | 'name'>[];
}

export function useHoldings() {
  return useLiveOrSample<HoldingsData>(
    'holdings',
    async () => {
      const d = await gql<HoldingsData>(
        `query {
      parcels { id surveyNo subdivision extent unit classification status litigation stake currentOwner purchasePrice marketValue passbookId createdAt geoPoint }
      passbooks { id pattadarNo ownerName village mandal district groupId }
      properties { id type label city district landArea landUnit builtupArea builtupUnit holdingStatus stake currentValue currentOwner groupId createdAt }
      documents { parcelId propertyId docType tags fileRef }
      groups { id name }
    }`,
      );
      return {
        parcels: d.parcels ?? [],
        passbooks: d.passbooks ?? [],
        properties: d.properties ?? [],
        documents: d.documents ?? [],
        groups: d.groups ?? [],
      };
    },
    {
      parcels: sampleParcels,
      passbooks: samplePassbooks,
      properties: sampleProperties,
      documents: sampleDocuments,
      groups: sampleGroups,
    },
  );
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface DocumentsData {
  documents: DocumentRecord[];
  parcels: Pick<Parcel, 'id' | 'surveyNo' | 'subdivision'>[];
  passbooks: Pick<Passbook, 'id' | 'pattadarNo' | 'ownerName' | 'village'>[];
}

export function useDocuments() {
  return useLiveOrSample<DocumentsData>(
    'documents',
    async () => {
      const d = await gql<DocumentsData>(
        `query { documents { id fileRef docType parcelId passbookId } parcels { id surveyNo subdivision } passbooks { id pattadarNo ownerName village } }`,
      );
      return { documents: d.documents ?? [], parcels: d.parcels ?? [], passbooks: d.passbooks ?? [] };
    },
    { documents: sampleDocuments, parcels: sampleParcels, passbooks: samplePassbooks },
  );
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export interface GroupsData {
  groups: Group[];
  members: Member[];
}

export function useGroups() {
  return useLiveOrSample<GroupsData>(
    'groups',
    async () => {
      const d = await gql<{ groups: Group[] }>(`query { groups { ${GROUP_FIELDS} } }`);
      const groups = d.groups ?? [];
      const perGroup = await Promise.all(
        groups.map(async (g) => {
          const r = await gql<{ members: Omit<Member, 'groupId'>[] }>(
            `query($gid: String!) { members(groupId: $gid) { ${MEMBER_FIELDS} } }`,
            { gid: g.id },
          ).catch(() => ({ members: [] as Omit<Member, 'groupId'>[] }));
          return (r.members ?? []).map((m) => ({ ...m, groupId: g.id }));
        }),
      );
      return { groups, members: perGroup.flat() };
    },
    { groups: sampleGroups, members: sampleMembers },
  );
}

export function useInvitations() {
  return useLiveOrSample<Invitation[]>(
    'invitations',
    async () =>
      (
        await gql<{ invitations: Invitation[] }>(
          `query { invitations { id scopeType scopeId role inviteeContact token expiry status createdAt } }`,
        )
      ).invitations ?? [],
    sampleInvitations,
  );
}

// ---------------------------------------------------------------------------
// Wallet — design-forward placeholder (no live endpoint yet; always sample).
// ---------------------------------------------------------------------------

export function useWallet(): { data: WalletSummary; isSample: boolean } {
  return { data: sampleWallet, isSample: true };
}

// ---------------------------------------------------------------------------
// Tools & system
// ---------------------------------------------------------------------------

export function useSroOffices() {
  return useLiveOrSample<SroOffice[]>(
    'sro',
    async () =>
      (await gql<{ sroOffices: SroOffice[] }>(`query { sroOffices { id code name drZone district mandal } }`))
        .sroOffices ?? [],
    sampleSroOffices,
  );
}

export function useFeeSchedule() {
  return useLiveOrSample<FeeScheduleRow[]>(
    'feeSchedule',
    async () =>
      (
        await gql<{ feeSchedule: FeeScheduleRow[] }>(
          `query { feeSchedule { id regTypeEn natureEn stampRate transferRate regRate userRate } }`,
        )
      ).feeSchedule ?? [],
    sampleFeeSchedule,
  );
}

export function useMarketValues() {
  return useLiveOrSample<MarketValueRow[]>(
    'marketValues',
    async () =>
      (
        await gql<{ marketValues: MarketValueRow[] }>(
          `query { marketValues { id district mandal village classification ratePerUnit unit effectiveFrom } }`,
        )
      ).marketValues ?? [],
    sampleMarketValues,
  );
}

export function useNotificationLog() {
  return useLiveOrSample<NotificationEntry[]>(
    'notificationLog',
    async () =>
      (
        await gql<{ notificationLog: NotificationEntry[] }>(
          `query { notificationLog(limit: 200) { id channel recipient subject body provider status error createdAt } }`,
        )
      ).notificationLog ?? [],
    sampleNotifications,
  );
}

export function useAuditEvents() {
  return useLiveOrSample<AuditEvent[]>(
    'audit',
    async () =>
      (
        await gql<{ auditEvents: AuditEvent[] }>(
          `query { auditEvents { id actor action target details timestamp } }`,
        )
      ).auditEvents ?? [],
    sampleAuditEvents,
  );
}

export function useProfile() {
  return useLiveOrSample<Profile>(
    'profile',
    async () => {
      const d = await gql<{ me: Profile | null }>(
        `query { me { id name email address language districtsOfInterest notificationPrefs kycRefMasked mfaEnabled } }`,
      );
      if (!d.me) throw new Error('no profile');
      return d.me;
    },
    sampleProfile,
  );
}
