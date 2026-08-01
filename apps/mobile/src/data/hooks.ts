/**
 * Mobile data hooks — same live-or-sample semantics as the web app
 * (apps/web/src/data/useLiveOrSample.ts): any fetch failure resolves to the
 * bundled sample dataset flagged isSample, queryKey ['pattadar', key],
 * staleTime 30s, no retries. Query documents come from @pattadar/core.
 */
import {
  ADD_MEMBER_MUTATION,
  CREATE_PARCEL_MUTATION,
  CREATE_PASSBOOK_MUTATION,
  CREATE_PROPERTY_MUTATION,
  CREATE_DOCUMENT_MUTATION,
  DELETE_DOCUMENT_MUTATION,
  LINK_DOCUMENT_PASSBOOK_MUTATION,
  DELETE_REGISTERED_DOCUMENT_MUTATION,
  CREATE_GROUP_MUTATION,
  SET_MEMBER_SHARE_MUTATION,
  UPDATE_MEMBER_MUTATION,
  REVEAL_AADHAAR_MUTATION,
  REVEAL_MY_AADHAAR_MUTATION,
  ADD_PARCEL_PHOTO_MUTATION,
  ALL_PARCEL_PHOTOS_QUERY,
  APPLY_MY_KYC_MUTATION,
  CLEAR_MY_KYC_MUTATION,
  DELETE_PARCEL_PHOTO_MUTATION,
  SET_COVER_PHOTO_MUTATION,
  UPDATE_PARCEL_PHOTO_MUTATION,
  UPDATE_PROFILE_AADHAAR_MUTATION,
  UPDATE_GROUP_MUTATION,
  DELETE_GROUP_MUTATION,
  CREATE_PARCEL_FROM_DOCUMENT_MUTATION,
  CREATE_PROPERTY_FROM_DOCUMENT_MUTATION,
  CREATE_REGISTERED_DOCUMENT_MUTATION,
  LINK_DOCUMENT_PARCEL_MUTATION,
  LINK_DOCUMENT_PROPERTY_MUTATION,
  DASHBOARD_QUERY,
  DOCUMENTS_QUERY,
  DELETE_INVITATION_MUTATION,
  DELETE_PARCEL_MUTATION,
  DELETE_PASSBOOK_MUTATION,
  DELETE_PROPERTY_MUTATION,
  DOCUMENT_REFS_QUERY,
  PASSBOOKS_QUERY,
  PASSBOOK_DOCUMENTS_QUERY,
  REMOVE_MEMBER_MUTATION,
  SET_STAKE_MUTATION,
  UPDATE_PARCEL_GEO_MUTATION,
  UPDATE_PROPERTY_GEO_MUTATION,
  UPDATE_PARCEL_PRICE_MUTATION,
  GROUPS_QUERY,
  GROUP_MEMBERS_QUERY,
  HOLDINGS_QUERY,
  INVITATIONS_QUERY,
  UPDATE_INVITATION_STATUS_MUTATION,
  VERIFY_BENEFICIARY_MUTATION,
} from '@pattadar/core';
import type {
  AuditEvent,
  RegisteredDocument,
  DashboardStats,
  DocumentRecord,
  Group,
  Invitation,
  Member,
  Parcel,
  ParcelPhoto,
  Passbook,
  Property,
} from '@pattadar/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, getIdentity, hasApi } from '@/api/client';
import { mergeOnFailure } from '@/lib/mergeOnFailure';

/** Current signed-in identity ('' = guest). Refreshes with the ['pattadar'] prefix. */
export function useIdentity(): string {
  const { data } = useQuery({
    queryKey: ['pattadar', 'identity'],
    queryFn: () => getIdentity(),
    staleTime: 0,
  });
  return data ?? '';
}

export interface LiveResult<T> {
  data: T;
  isSample: boolean;
}

/**
 * Invalidate every Pattadar cache after a write.
 *
 * Each mutation group used to name the caches it believed it touched, and the
 * lists were quietly wrong: creating a passbook refreshed `dashboard` and
 * `holdings` but not `passbooks`, so the Passbooks tab kept showing stale data
 * until it was pulled down by hand. Assigning land to a group had the mirror
 * problem. There are six caches and every write can reach several of them, so
 * naming subsets is a standing invitation to this bug.
 *
 * Dropping the whole `['pattadar']` prefix cannot be incomplete. React Query
 * refetches only the queries currently mounted; the rest are marked stale and
 * refetch when their screen next appears — so the cost is one request for the
 * visible screen, not six.
 */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['pattadar'] });
}

function useLiveOrSample<T>(key: string, fetcher: () => Promise<T>, empty: () => T) {
  const queryClient = useQueryClient();
  return useQuery<LiveResult<T>>({
    queryKey: ['pattadar', key],
    staleTime: 30_000,
    // The queryFn below swallows failures into `isSample`, so react-query never
    // sees a rejection and its own retry can never fire. That left ONE unlucky
    // request — a request in flight while the app was backgrounded, or during a
    // server restart — showing "can't reach the server" for a full staleTime
    // even though every later call succeeded. The retry lives inside instead.
    retry: false,
    queryFn: async () => {
      // No fake data, ever: a failed fetch returns EMPTY datasets flagged
      // isSample so screens show the can't-reach banner + pull-to-refresh.
      try {
        return { data: await fetcher(), isSample: false };
      } catch {
        // One quick second attempt before declaring the server unreachable.
        await new Promise((r) => setTimeout(r, 700));
        try {
          return { data: await fetcher(), isSample: false };
        } catch {
          // H-6: a transient outage must not wipe already-loaded holdings —
          // keep whatever this query last resolved to, flagged isSample.
          const prev = queryClient.getQueryData<LiveResult<T>>(['pattadar', key]);
          return mergeOnFailure(prev, empty);
        }
      }
    },
    // A screen that believes it is offline must not sit there believing it:
    // recheck when the app comes back to the foreground. That now actually
    // happens (lib/queryLifecycle wires focusManager to AppState), so this no
    // longer has to compensate by refetching on EVERY mount — navigating
    // between tabs re-uses the 30s-fresh cache instead of re-querying.
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// --- dashboard ---------------------------------------------------------------

export interface DashboardData {
  stats: DashboardStats;
  me: { name: string; lastActiveAt: string; kycRefMasked?: string } | null;
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
  me: { name: string; lastActiveAt: string; kycRefMasked?: string } | null;
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
      stats: { totalPassbooks: 0, totalParcels: 0, totalDocuments: 0, totalBeneficiaries: 0, pendingInvitations: 0, estimatedValue: 0, totalExtent: 0, totalGroups: 0 },
      me: null,
      parcels: [],
      passbooks: [],
      properties: [],
      groups: [],
      pendingInvitations: [],
      recent: [],
      documents: [],
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
    () => ({ parcels: [], passbooks: [], properties: [], groups: [] }),
  );
}

// --- passbooks page ----------------------------------------------------------

export interface PassbooksData {
  passbooks: Passbook[];
  parcels: Pick<Parcel, 'passbookId' | 'purchasePrice'>[];
  groups: Pick<Group, 'id' | 'name'>[];
}

export function usePassbooks() {
  return useLiveOrSample<PassbooksData>(
    'passbooks',
    async () => {
      const d = await api.gql<{
        passbooks: Passbook[] | null;
        parcels: PassbooksData['parcels'] | null;
        groups: PassbooksData['groups'] | null;
      }>(PASSBOOKS_QUERY);
      return { passbooks: d.passbooks ?? [], parcels: d.parcels ?? [], groups: d.groups ?? [] };
    },
    () => ({ passbooks: [], parcels: [], groups: [] }),
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
    () => ({ groups: [], members: [] }),
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
    () => [],
  );
}

/**
 * Invitation state machine per the web UI contract: 'accepted' only from
 * pending, 'revoked' from pending|accepted. 'verified' is never sent from a
 * client — that transition belongs to the public verify-token landing.
 */
export function useInvitationActions() {
  const invalidate = useInvalidateAll();
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
  const invalidate = useInvalidateAll();

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

  const createProperty = useMutation({
    mutationFn: (v: { type: string; label: string; city: string; district: string; landArea: number; purchasePrice: number }) =>
      api.gql<{ createProperty: { id: string } | null }>(CREATE_PROPERTY_MUTATION, {
        ...v,
        address: '', locality: '', landUnit: 'Sq.yd', builtupArea: 0, builtupUnit: 'Sq.ft',
        acquisitionMode: 'purchase', projectId: '', groupId: '', attributes: '',
        purchaseDate: '', regDocNo: '', sro: '', regDate: '', sellerName: '', buyerName: '',
      }),
    onSuccess: invalidate,
  });

  return { createPassbook, createParcel, setParcelPrice, createProperty };
}

// --- delete + stake (ported from web pattadarActions.ts) ---------------------

interface DocRef {
  id: string;
  fileRef?: string;
}

/**
 * Document ROWS are removed best-effort before the entity (web parity).
 * Moving file bytes to Trash is a gateway/storage call that needs a Cognito
 * session — mobile skips it (same degradation web accepts when storage is
 * offline); files remain in My Drive on the web until deleted there.
 */
async function deleteDocRows(docs: DocRef[]): Promise<void> {
  await Promise.all(
    docs.map((d) =>
      api.gql(DELETE_DOCUMENT_MUTATION, { id: d.id }).catch(() => undefined),
    ),
  );
}

export function useHoldingActions() {
  const invalidate = useInvalidateAll();

  const deleteParcel = useMutation({
    mutationFn: async (id: string) => {
      const d = await api
        .gql<{ documents: (DocRef & { parcelId: string })[] }>(DOCUMENT_REFS_QUERY)
        .catch(() => ({ documents: [] as (DocRef & { parcelId: string })[] }));
      await deleteDocRows((d.documents ?? []).filter((x) => x.parcelId === id));
      return api.gql<{ deleteParcel: boolean }>(DELETE_PARCEL_MUTATION, { id });
    },
    onSuccess: invalidate,
  });

  const deletePassbook = useMutation({
    mutationFn: async (id: string) => {
      const d = await api
        .gql<{ passbookDocuments: DocRef[] }>(PASSBOOK_DOCUMENTS_QUERY, { id })
        .catch(() => ({ passbookDocuments: [] as DocRef[] }));
      await deleteDocRows(d.passbookDocuments ?? []);
      return api.gql<{ deletePassbook: boolean }>(DELETE_PASSBOOK_MUTATION, { id });
    },
    onSuccess: invalidate,
  });

  const deleteProperty = useMutation({
    // API cascades the doc rows itself for properties.
    mutationFn: (id: string) =>
      api.gql<{ deleteProperty: boolean }>(DELETE_PROPERTY_MUTATION, { id }),
    onSuccess: invalidate,
  });

  const setStake = useMutation({
    mutationFn: (v: { kind: 'parcel' | 'property'; id: string; stake: string }) =>
      api.gql<{ setStake: boolean }>(SET_STAKE_MUTATION, { k: v.kind, id: v.id, s: v.stake }),
    onSuccess: invalidate,
  });

  const setParcelGeo = useMutation({
    mutationFn: (v: { id: string; geoPoint: string }) =>
      api.gql<{ updateParcel: { id: string } | null }>(UPDATE_PARCEL_GEO_MUTATION, v),
    onSuccess: invalidate,
  });

  const setPropertyGeo = useMutation({
    mutationFn: (v: { id: string; geoPoint: string }) =>
      api.gql<{ updateProperty: { id: string } | null }>(UPDATE_PROPERTY_GEO_MUTATION, v),
    onSuccess: invalidate,
  });

  return { deleteParcel, deletePassbook, deleteProperty, setStake, setParcelGeo, setPropertyGeo };
}

// --- documents ----------------------------------------------------------------

export interface DocumentsData {
  documents: Pick<DocumentRecord, 'id' | 'fileRef' | 'docType' | 'parcelId' | 'passbookId' | 'propertyId'>[];
  parcels: Pick<Parcel, 'id' | 'surveyNo' | 'subdivision'>[];
  passbooks: Pick<Passbook, 'id' | 'pattadarNo' | 'ownerName' | 'village'>[];
  registered: Pick<RegisteredDocument, 'id' | 'ref' | 'fileRef' | 'docType' | 'documentNo' | 'regYear' | 'sro' | 'village' | 'district' | 'surveyNo' | 'plotNo' | 'extent' | 'consideration' | 'registrationDate' | 'passbookId' | 'parcelId' | 'propertyId' | 'headline' | 'summary' | 'keyPointList' | 'caveatList' | 'createdAt'>[];
}

export function useDocuments() {
  return useLiveOrSample<DocumentsData>(
    'documents',
    async () => {
      const d = await api.gql<{
        documents: DocumentsData['documents'] | null;
        parcels: DocumentsData['parcels'] | null;
        passbooks: DocumentsData['passbooks'] | null;
        registeredDocuments: DocumentsData['registered'] | null;
      }>(DOCUMENTS_QUERY);
      return {
        documents: d.documents ?? [],
        parcels: d.parcels ?? [],
        passbooks: d.passbooks ?? [],
        registered: d.registeredDocuments ?? [],
      };
    },
    () => ({ documents: [], parcels: [], passbooks: [], registered: [] }),
  );
}

export function useDocumentActions() {
  const invalidate = useInvalidateAll();
  const fileDocument = useMutation({
    // fileRef = My Drive node id (empty when the upload didn't happen); the
    // rest of the extraction travels as the payload, same as web.
    mutationFn: ({ _fileRef, ...payload }: Record<string, unknown> & { _fileRef?: string }) =>
      api.gql<{ createRegisteredDocument: { id: string } | null }>(
        CREATE_REGISTERED_DOCUMENT_MUTATION,
        { fileRef: String(_fileRef ?? ''), payload: JSON.stringify(payload) },
      ),
    onSuccess: invalidate,
  });
  const parcelFromDocument = useMutation({
    mutationFn: (v: { documentId: string; passbookId: string }) =>
      api.gql<{ createParcelFromDocument: { id: string; ref: string } | null }>(
        CREATE_PARCEL_FROM_DOCUMENT_MUTATION,
        { d: v.documentId, p: v.passbookId },
      ),
    onSuccess: invalidate,
  });
  const addDocument = useMutation({
    mutationFn: (v: { parcelId: string; propertyId: string; docType: string }) =>
      api.gql<{ createDocument: { id: string } | null }>(CREATE_DOCUMENT_MUTATION, {
        parcelId: v.parcelId,
        passbookId: '',
        propertyId: v.propertyId,
        docType: v.docType,
        fileRef: '',
        docNo: '',
        sroCode: '',
        regYear: '',
        source: 'mobile',
        tags: '',
      }),
    onSuccess: invalidate,
  });

  const deleteDocument = useMutation({
    mutationFn: (id: string) => api.gql<{ deleteDocument: boolean }>(DELETE_DOCUMENT_MUTATION, { id }),
    onSuccess: invalidate,
  });
  const linkRegistered = useMutation({
    mutationFn: (v: { id: string; passbookId: string }) =>
      api.gql<{ linkDocumentPassbook: { id: string } | null }>(LINK_DOCUMENT_PASSBOOK_MUTATION, {
        id: v.id,
        pb: v.passbookId,
      }),
    onSuccess: invalidate,
  });
  const linkRegisteredToParcel = useMutation({
    mutationFn: (v: { id: string; parcelId: string }) =>
      api.gql<{ linkDocumentParcel: { id: string } | null }>(LINK_DOCUMENT_PARCEL_MUTATION, {
        id: v.id,
        parcel: v.parcelId,
      }),
    onSuccess: invalidate,
  });
  const linkRegisteredToProperty = useMutation({
    mutationFn: (v: { id: string; propertyId: string }) =>
      api.gql<{ linkDocumentProperty: { id: string } | null }>(LINK_DOCUMENT_PROPERTY_MUTATION, {
        id: v.id,
        prop: v.propertyId,
      }),
    onSuccess: invalidate,
  });
  const deleteRegistered = useMutation({
    mutationFn: (id: string) =>
      api.gql<{ deleteRegisteredDocument: boolean }>(DELETE_REGISTERED_DOCUMENT_MUTATION, { id }),
    onSuccess: invalidate,
  });
  const propertyFromDocument = useMutation({
    mutationFn: (documentId: string) =>
      api.gql<{ createPropertyFromDocument: { id: string; label: string } | null }>(
        CREATE_PROPERTY_FROM_DOCUMENT_MUTATION,
        { documentId },
      ),
    onSuccess: invalidate,
  });
  return { fileDocument, parcelFromDocument, propertyFromDocument, addDocument, deleteDocument, linkRegistered, linkRegisteredToParcel, linkRegisteredToProperty, deleteRegistered };
}

// --- family member actions ---------------------------------------------------

export interface NewMember {
  groupId: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
  isBeneficiary: boolean;
  sharePct: number;
  /** KYC fields, typed or read from an Aadhaar scan. All optional. */
  gender?: string;
  dob?: string;
  bio?: string;
  presentAddress?: string;
  aadhaar?: string;
  photo?: string;
}

export function useMemberActions() {
  const invalidate = useInvalidateAll();
  const addMember = useMutation({
    mutationFn: (v: NewMember) =>
      api.gql<{ addMember: { id: string; inviteToken: string } | null }>(ADD_MEMBER_MUTATION, {
        ...v,
        role: 'Member',
        gender: v.gender ?? '',
        dob: v.dob ?? '',
        bio: v.bio ?? '',
        photo: v.photo ?? '',
        fatherId: '', motherId: '', spouseId: '',
        kind: v.isBeneficiary ? 'legalheir' : '',
        parcelId: '',
        presentAddress: v.presentAddress ?? '',
        // Digits only — the API stores it masked and returns aadhaarMasked.
        aadhaar: (v.aadhaar ?? '').replace(/\D/g, ''),
        guardianName: '', guardianContact: '',
        maritalStatus: '', spouseName: '', spouseContact: '', spouseStatus: '',
      }),
    onSuccess: invalidate,
  });
  const createGroup = useMutation({
    mutationFn: (v: { type: string; name: string }) =>
      api.gql<{ createGroup: { id: string } | null }>(CREATE_GROUP_MUTATION, {
        t: v.type,
        n: v.name,
        d: '',
      }),
    onSuccess: invalidate,
  });
  const updateGroup = useMutation({
    mutationFn: (v: { id: string; name: string; description: string }) =>
      api.gql<{ updateGroup: { id: string } | null }>(UPDATE_GROUP_MUTATION, {
        id: v.id,
        n: v.name,
        d: v.description,
      }),
    onSuccess: invalidate,
  });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.gql<{ deleteGroup: boolean }>(DELETE_GROUP_MUTATION, { id }),
    onSuccess: invalidate,
  });
  const setShare = useMutation({
    mutationFn: (v: { id: string; pct: number }) =>
      api.gql<{ setMemberShare: { id: string; sharePct: number } | null }>(SET_MEMBER_SHARE_MUTATION, {
        id: v.id,
        pct: v.pct,
      }),
    onSuccess: invalidate,
  });
  const updateMember = useMutation({
    mutationFn: (v: {
      id: string; name: string; relation: string; role: string; gender: string; dob: string;
      phone: string; email: string; bio: string; photo: string; isBeneficiary: boolean;
      sharePct: number; presentAddress: string; aadhaar: string;
    }) =>
      api.gql<{ updateMember: { id: string } | null }>(UPDATE_MEMBER_MUTATION, {
        ...v,
        aadhaar: (v.aadhaar || '').replace(/\D/g, ''),
      }),
    onSuccess: invalidate,
  });
  const revealAadhaar = useMutation({
    mutationFn: (id: string) =>
      api.gql<{ revealMemberAadhaar: string }>(REVEAL_AADHAAR_MUTATION, { id }),
  });
  const removeMember = useMutation({
    mutationFn: (id: string) =>
      api.gql<{ removeMember: boolean }>(REMOVE_MEMBER_MUTATION, { id }),
    onSuccess: invalidate,
  });
  return { addMember, updateMember, revealAadhaar, removeMember, createGroup, updateGroup, deleteGroup, setShare };
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

// --- account-holder KYC ------------------------------------------------------

export function useMyAadhaar() {
  const invalidate = useInvalidateAll();
  const save = useMutation({
    mutationFn: (aadhaar: string) =>
      api.gql<{ updateProfile: { kycRefMasked: string } }>(UPDATE_PROFILE_AADHAAR_MUTATION, {
        kyc: aadhaar.replace(/\D/g, ''),
      }),
    onSuccess: invalidate,
  });
  const reveal = useMutation({
    mutationFn: () => api.gql<{ revealMyAadhaar: string }>(REVEAL_MY_AADHAAR_MUTATION, {}),
  });
  /** Apply chosen fields to the profile AND every self member row. */
  const apply = useMutation({
    mutationFn: (v: { name: string; dob: string; gender: string; address: string; aadhaar: string }) =>
      api.gql<{ applyMyKyc: { name: string; kycRefMasked: string } }>(APPLY_MY_KYC_MUTATION, {
        ...v,
        aadhaar: v.aadhaar.replace(/\D/g, ''),
      }),
    onSuccess: invalidate,
  });
  /** CL-545: remove an identity applied from someone else's card. */
  const clear = useMutation({
    mutationFn: () => api.gql<{ clearMyKyc: { name: string } }>(CLEAR_MY_KYC_MUTATION, {}),
    onSuccess: invalidate,
  });
  return { save, reveal, apply, clear };
}

// --- parcel photos (CL-561..563/568/569) -------------------------------------

/**
 * Every photo the caller owns, one request.
 *
 * List screens need one cover per row (CL-569) and the parcel screen needs the
 * full set for one parcel; fetching per parcel would mean a request per visible
 * row. Callers filter by parcelId themselves.
 */
export function usePhotos() {
  return useLiveOrSample<ParcelPhoto[]>(
    'photos',
    async () => (await api.gql<{ parcelPhotos: ParcelPhoto[] | null }>(ALL_PARCEL_PHOTOS_QUERY)).parcelPhotos ?? [],
    () => [],
  );
}

export function usePhotoActions() {
  const invalidate = useInvalidateAll();
  const addPhoto = useMutation({
    mutationFn: (v: {
      parcelId: string;
      fileRef: string;
      category: string;
      caption: string;
      latitude: number | null;
      longitude: number | null;
      heading: number | null;
      capturedAt: string;
    }) => api.gql<{ addParcelPhoto: ParcelPhoto | null }>(ADD_PARCEL_PHOTO_MUTATION, v),
    onSuccess: invalidate,
  });
  const updatePhoto = useMutation({
    // category/caption are independently optional: sending only what changed is
    // what stops an edit to one field from blanking the other.
    mutationFn: (v: { id: string; category?: string; caption?: string }) =>
      api.gql<{ updateParcelPhoto: ParcelPhoto | null }>(UPDATE_PARCEL_PHOTO_MUTATION, {
        id: v.id,
        category: v.category ?? null,
        caption: v.caption ?? null,
      }),
    onSuccess: invalidate,
  });
  const setCover = useMutation({
    mutationFn: (id: string) => api.gql<{ setCoverPhoto: boolean }>(SET_COVER_PHOTO_MUTATION, { id }),
    onSuccess: invalidate,
  });
  const deletePhoto = useMutation({
    mutationFn: (id: string) => api.gql<{ deleteParcelPhoto: boolean }>(DELETE_PARCEL_PHOTO_MUTATION, { id }),
    onSuccess: invalidate,
  });
  return { addPhoto, updatePhoto, setCover, deletePhoto };
}
