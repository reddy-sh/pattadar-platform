/**
 * Mobile data hooks — same live-or-sample semantics as the web app
 * (apps/web/src/data/useLiveOrSample.ts): any fetch failure resolves to the
 * bundled sample dataset flagged isSample, queryKey ['pattadar', key],
 * staleTime 30s, no retries. Query documents come from @pattadar/core.
 */
import {
  CREATE_PARCEL_MUTATION,
  CREATE_PASSBOOK_MUTATION,
  DASHBOARD_QUERY,
  DELETE_INVITATION_MUTATION,
  UPDATE_PARCEL_PRICE_MUTATION,
  GROUPS_QUERY,
  GROUP_MEMBERS_QUERY,
  HOLDINGS_QUERY,
  INVITATIONS_QUERY,
  UPDATE_INVITATION_STATUS_MUTATION,
  VERIFY_BENEFICIARY_MUTATION,
  sampleAuditEvents,
  sampleDashboardStats,
  sampleDocuments,
  sampleGroups,
  sampleInvitations,
  sampleLastVisit,
  sampleMembers,
  sampleParcels,
  samplePassbooks,
  sampleProfile,
  sampleProperties,
} from '@pattadar/core';
import type {
  AuditEvent,
  DashboardStats,
  DocumentRecord,
  Group,
  Invitation,
  Member,
  Parcel,
  Passbook,
  Property,
} from '@pattadar/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, hasApi } from '@/api/client';

export interface LiveResult<T> {
  data: T;
  isSample: boolean;
}

function useLiveOrSample<T>(key: string, fetcher: () => Promise<T>, sample: () => T) {
  return useQuery<LiveResult<T>>({
    queryKey: ['pattadar', key],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!hasApi) return { data: sample(), isSample: true };
      try {
        return { data: await fetcher(), isSample: false };
      } catch {
        return { data: sample(), isSample: true };
      }
    },
  });
}

// --- dashboard ---------------------------------------------------------------

export interface DashboardData {
  stats: DashboardStats;
  me: { name: string; lastActiveAt: string } | null;
  parcels: Parcel[];
  passbooks: Passbook[];
  properties: Property[];
  groups: Group[];
  pendingInvitations: Invitation[];
  recent: AuditEvent[];
  documents: Pick<DocumentRecord, 'id' | 'fileRef' | 'docType' | 'parcelId' | 'passbookId'>[];
}

interface DashboardRaw {
  dashboardStats: DashboardStats;
  me: { name: string; lastActiveAt: string } | null;
  parcels: Parcel[] | null;
  passbooks: Passbook[] | null;
  properties: Property[] | null;
  groups: Group[] | null;
  pendingInvitations: Invitation[] | null;
  recentAuditEvents: AuditEvent[] | null;
  serviceRequests: unknown[] | null;
  documents: DashboardData['documents'] | null;
}

export function useDashboard() {
  return useLiveOrSample<DashboardData>(
    'dashboard',
    async () => {
      const d = await api.gql<DashboardRaw>(DASHBOARD_QUERY);
      return {
        stats: d.dashboardStats,
        me: d.me,
        parcels: d.parcels ?? [],
        passbooks: d.passbooks ?? [],
        properties: d.properties ?? [],
        groups: d.groups ?? [],
        pendingInvitations: d.pendingInvitations ?? [],
        recent: d.recentAuditEvents ?? [],
        documents: d.documents ?? [],
      };
    },
    () => ({
      stats: sampleDashboardStats,
      me: { name: sampleProfile.name, lastActiveAt: sampleLastVisit },
      parcels: sampleParcels,
      passbooks: samplePassbooks,
      properties: sampleProperties,
      groups: sampleGroups,
      pendingInvitations: sampleInvitations.filter((i) => i.status === 'pending'),
      recent: sampleAuditEvents,
      documents: sampleDocuments,
    }),
  );
}

// --- holdings ----------------------------------------------------------------

export interface HoldingsData {
  parcels: Parcel[];
  passbooks: Pick<
    Passbook,
    'id' | 'pattadarNo' | 'ownerName' | 'village' | 'mandal' | 'district' | 'groupId'
  >[];
  properties: Property[];
  groups: Pick<Group, 'id' | 'name'>[];
}

export function useHoldings() {
  return useLiveOrSample<HoldingsData>(
    'holdings',
    async () => {
      const d = await api.gql<{
        parcels: Parcel[] | null;
        passbooks: HoldingsData['passbooks'] | null;
        properties: Property[] | null;
        groups: HoldingsData['groups'] | null;
      }>(HOLDINGS_QUERY);
      return {
        parcels: d.parcels ?? [],
        passbooks: d.passbooks ?? [],
        properties: d.properties ?? [],
        groups: d.groups ?? [],
      };
    },
    () => ({
      parcels: sampleParcels,
      passbooks: samplePassbooks,
      properties: sampleProperties,
      groups: sampleGroups,
    }),
  );
}

// --- family groups + members -------------------------------------------------

export interface GroupsData {
  groups: Group[];
  members: Member[];
}

export function useGroups() {
  return useLiveOrSample<GroupsData>(
    'groups',
    async () => {
      const { groups } = await api.gql<{ groups: Group[] | null }>(GROUPS_QUERY);
      const gs = groups ?? [];
      // Server never returns groupId on members — stamp it client-side,
      // and swallow single-group failures (same as web).
      const perGroup = await Promise.all(
        gs.map((g) =>
          api
            .gql<{ members: Omit<Member, 'groupId'>[] }>(GROUP_MEMBERS_QUERY, { gid: g.id })
            .then((r) => r.members.map((m) => ({ ...m, groupId: g.id })))
            .catch(() => [] as Member[]),
        ),
      );
      return { groups: gs, members: perGroup.flat() };
    },
    () => ({ groups: sampleGroups, members: sampleMembers }),
  );
}

// --- invitations -------------------------------------------------------------

export function useInvitations() {
  return useLiveOrSample<Invitation[]>(
    'invitations',
    async () => {
      const d = await api.gql<{ invitations: Invitation[] | null }>(INVITATIONS_QUERY);
      return d.invitations ?? [];
    },
    () => sampleInvitations,
  );
}

/**
 * Invitation state machine per the web UI contract: 'accepted' only from
 * pending, 'revoked' from pending|accepted. 'verified' is never sent from a
 * client — that transition belongs to the public verify-token landing.
 */
export function useInvitationActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pattadar', 'invitations'] });
    qc.invalidateQueries({ queryKey: ['pattadar', 'dashboard'] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'revoked' }) =>
      api.gql<{ updateInvitationStatus: { id: string } | null }>(
        UPDATE_INVITATION_STATUS_MUTATION,
        { id, status },
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.gql<{ deleteInvitation: boolean }>(DELETE_INVITATION_MUTATION, { id }),
    onSuccess: invalidate,
  });
  return { setStatus, remove };
}

// --- create flows ------------------------------------------------------------

export interface NewPassbook {
  pattadarNo: string;
  ownerName: string;
  fatherHusbandName: string;
  state: string;
  district: string;
  mandal: string;
  village: string;
}

export interface NewParcel {
  passbookId: string;
  surveyNo: string;
  subdivision: string;
  /** Canonical decimal acres (caller converts via toAcres). */
  extent: number;
  /** The user's chosen unit key — provenance only, web parity. */
  unit: string;
  classification: string;
  acquisitionSource: string;
  parentParcelId: string;
  source: string;
}

export function useCreateFlows() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pattadar', 'dashboard'] });
    qc.invalidateQueries({ queryKey: ['pattadar', 'holdings'] });
  };

  const createPassbook = useMutation({
    mutationFn: (v: NewPassbook) =>
      api.gql<{ createPassbook: { id: string } | null }>(CREATE_PASSBOOK_MUTATION, {
        ...v,
        groupId: '',
      }),
    onSuccess: invalidate,
  });

  const createParcel = useMutation({
    mutationFn: (v: NewParcel) =>
      api.gql<{ createParcel: { id: string } | null }>(CREATE_PARCEL_MUTATION, { ...v }),
    onSuccess: invalidate,
  });

  const setParcelPrice = useMutation({
    mutationFn: (v: { id: string; purchasePrice: number }) =>
      api.gql<{ updateParcel: { id: string } | null }>(UPDATE_PARCEL_PRICE_MUTATION, v),
    onSuccess: invalidate,
  });

  return { createPassbook, createParcel, setParcelPrice };
}

// --- verify (public) ---------------------------------------------------------

export function useVerifyBeneficiary() {
  return useMutation({
    mutationFn: (token: string) =>
      api.gql<{ verifyBeneficiary: { id: string; status: string } | null }>(
        VERIFY_BENEFICIARY_MUTATION,
        { token },
      ),
  });
}
