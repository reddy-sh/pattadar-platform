/**
 * Families & Groups data layer — co-located queries/mutations for part 2 of
 * the rebuild (FamiliesGroupsPage / InvitationsPage / NotificationsPage).
 *
 * Field selections and mutation shapes are copied verbatim from the rhub
 * pattadar app (family/UnifiedFamilyView.tsx, family/GroupsListView.tsx,
 * family/GroupDetailView.tsx, NotificationsView.tsx, RemoteApp.tsx
 * InvitationsView). Live-first with sample fallback, mirroring the app's
 * useLiveOrSample pattern but kept in this file so parts 1/3 stay untouched.
 */
import { useQuery } from '@tanstack/react-query';
import {
  sampleGroups,
  sampleInvitations,
  sampleMembers,
  sampleNotifications,
  samplePassbooks,
} from '@pattadar/core';
import type { Group, Invitation, NotificationEntry } from '@pattadar/core';
import { gql } from '../../api/client';

// ---------------------------------------------------------------------------
// Group type definitions (port of rhub groups.ts)
// ---------------------------------------------------------------------------

export interface GroupTypeDef {
  type: string;
  label: string;
  icon: string; // emoji used on cards/dialogs
  hasTree: boolean; // family genealogy semantics (relations vs roles)
  primaryRole: string;
  roles: string[];
}

export const GROUP_TYPES: GroupTypeDef[] = [
  {
    type: 'family', label: 'Family', icon: '👪', hasTree: true, primaryRole: 'Head',
    roles: ['Head', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister',
      'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter', 'Other'],
  },
  {
    type: 'partnership', label: 'Partnership', icon: '🤝', hasTree: false,
    primaryRole: 'Managing Partner', roles: ['Managing Partner', 'Partner'],
  },
  {
    type: 'company', label: 'Company / LLP', icon: '🏢', hasTree: false, primaryRole: 'Director',
    roles: ['Director', 'Shareholder', 'Authorized Signatory'],
  },
  {
    type: 'huf', label: 'HUF', icon: '🏛️', hasTree: false, primaryRole: 'Karta',
    roles: ['Karta', 'Coparcener', 'Member'],
  },
  {
    type: 'trust', label: 'Trust / Society', icon: '⚖️', hasTree: false, primaryRole: 'Trustee',
    roles: ['Trustee', 'Beneficiary', 'Member'],
  },
  // Lightweight "wallet": organize holdings without succession machinery.
  {
    type: 'portfolio', label: 'Portfolio / Wallet', icon: '💼', hasTree: false, primaryRole: 'Owner',
    roles: ['Owner', 'Viewer'],
  },
];

export function groupTypeDef(type: string): GroupTypeDef {
  return GROUP_TYPES.find((g) => g.type === type) || GROUP_TYPES[0];
}

export function roleOptions(type: string): { value: string; label: string }[] {
  return groupTypeDef(type).roles.map((r) => ({ value: r, label: r }));
}

/** Family relationship options (port of rhub family/genealogy.ts RELATIONS). */
export const RELATIONS: { value: string; label: string }[] = [
  { value: 'self', label: 'You' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'father_in_law', label: 'Father-in-law' },
  { value: 'mother_in_law', label: 'Mother-in-law' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'grandson', label: 'Grandson' },
  { value: 'granddaughter', label: 'Granddaughter' },
  { value: 'other', label: 'Other relative' },
];

export const relMeta = (r: string) =>
  RELATIONS.find((x) => x.value === r) || { value: r, label: r || 'Relative' };

// ---------------------------------------------------------------------------
// Member (full "Person" shape — superset of @pattadar/core's Member)
// ---------------------------------------------------------------------------

export interface GroupMember {
  id: string;
  ownerUserId: string;
  name: string;
  relation: string;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  bio: string;
  photo: string;
  groupId: string;
  role: string;
  isSelf: boolean;
  fatherId: string;
  motherId: string;
  spouseId: string;
  isBeneficiary: boolean;
  sharePct: number;
  kind: string;
  status: string;
  inviteStatus: string;
  inviteToken: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  parcelId: string;
  presentAddress: string;
  aadhaarMasked: string;
  isMinor: boolean;
  guardianName: string;
  guardianContact: string;
  maritalStatus: string;
  spouseName: string;
  spouseContact: string;
  spouseStatus: string;
  createdAt: string;
}

export interface ParcelOption {
  id: string;
  surveyNo: string;
  subdivision: string;
}

export interface GroupPassbook {
  id: string;
  ownerName: string;
  pattadarNo: string;
  village: string;
  mandal: string;
  district: string;
  totalExtent: number;
  groupId: string;
}

export interface GroupActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface NotifierRow {
  memberId: string;
  name: string;
  relation: string;
  priority: number;
}

// Exact field list the rhub UnifiedFamilyView queries.
export const MEMBER_FIELDS =
  'id ownerUserId name relation gender dob phone email bio photo groupId role isSelf ' +
  'fatherId motherId spouseId isBeneficiary sharePct kind status inviteStatus inviteToken ' +
  'phoneVerified emailVerified parcelId presentAddress aadhaarMasked isMinor guardianName ' +
  'guardianContact maritalStatus spouseName spouseContact spouseStatus createdAt';

export const GROUP_FIELDS =
  'id ownerUserId type name description myRole memberCount landCount totalExtent totalShare createdAt';

/** Member status → the Invited / Active language (port of memberStatusTag). */
export function memberStatusChip(r: {
  status?: string;
  inviteStatus?: string;
  inviteToken?: string;
}): { label: string; color: 'success' | 'error' | 'warning' | 'default' } {
  if (r.status === 'verified') return { label: 'Active', color: 'success' };
  if (r.status === 'revoked') return { label: 'Revoked', color: 'error' };
  if (r.inviteStatus === 'invited' || (r.status === 'pending' && r.inviteToken))
    return { label: 'Invited', color: 'warning' };
  if (r.status === 'pending') return { label: 'Pending', color: 'default' };
  return { label: '—', color: 'default' };
}

export function isMinorDob(dob?: string): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age < 18;
}

/** Center-crop an image file to a square, compact JPEG data-URL (port of shared.ts). */
export function cropSquareDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no ctx'));
        return;
      }
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Live-first hooks (sample fallback), co-located per the rebuild's scope rules.
// Query keys share the app-wide 'pattadar' prefix so the existing
// invalidateQueries({ queryKey: ['pattadar'] }) refresh works here too.
// ---------------------------------------------------------------------------

function useFamLive<T>(key: string, fetchLive: () => Promise<T>, sample: T) {
  const q = useQuery({
    queryKey: ['pattadar', 'families', key],
    queryFn: async (): Promise<{ data: T; isSample: boolean }> => {
      try {
        return { data: await fetchLive(), isSample: false };
      } catch {
        return { data: sample, isSample: true };
      }
    },
    staleTime: 30_000,
    retry: false,
  });
  return {
    data: q.data?.data ?? sample,
    isSample: q.data?.isSample ?? false,
    isLoading: q.isPending,
  };
}

export function useGroupsList() {
  return useFamLive<Group[]>(
    'groups',
    async () => (await gql<{ groups: Group[] }>(`query { groups { ${GROUP_FIELDS} } }`)).groups ?? [],
    sampleGroups,
  );
}

/** Fill the full GroupMember shape from the slimmer core sample Member rows. */
function sampleGroupMembers(groupId: string): GroupMember[] {
  return sampleMembers
    .filter((m) => m.groupId === groupId)
    .map((m) => ({
      ownerUserId: '', bio: '', photo: '', fatherId: '', motherId: '', spouseId: '',
      kind: m.isBeneficiary ? 'legalheir' : '', inviteStatus: '', inviteToken: '',
      parcelId: '', presentAddress: '', isMinor: isMinorDob(m.dob), guardianName: '',
      guardianContact: '', maritalStatus: '', spouseName: '', spouseContact: '',
      spouseStatus: '', createdAt: '',
      ...m,
    }));
}

export interface GroupMembersData {
  members: GroupMember[];
  parcels: ParcelOption[];
  myAddress: string;
}

export function useGroupMembers(groupId: string) {
  return useFamLive<GroupMembersData>(
    `members:${groupId}`,
    async () => {
      const d = await gql<{
        members: GroupMember[];
        parcels: ParcelOption[];
        me: { address: string } | null;
      }>(
        `query($g:String!){ members(groupId:$g){ ${MEMBER_FIELDS} } parcels { id surveyNo subdivision } me { address } }`,
        { g: groupId },
      );
      return {
        members: d.members ?? [],
        parcels: d.parcels ?? [],
        myAddress: d.me?.address || '',
      };
    },
    { members: sampleGroupMembers(groupId), parcels: [], myAddress: '' },
  );
}

export function useGroupPassbooks() {
  return useFamLive<GroupPassbook[]>(
    'passbooks',
    async () =>
      (
        await gql<{ passbooks: GroupPassbook[] }>(
          `query{ passbooks { id ownerName pattadarNo village mandal district totalExtent groupId } }`,
        )
      ).passbooks ?? [],
    samplePassbooks.map((p) => ({
      id: p.id, ownerName: p.ownerName, pattadarNo: p.pattadarNo, village: p.village,
      mandal: p.mandal, district: p.district, totalExtent: p.totalExtent, groupId: p.groupId,
    })),
  );
}

export function useGroupActivity(groupId: string) {
  return useFamLive<GroupActivityEvent[]>(
    `activity:${groupId}`,
    async () =>
      (
        await gql<{ groupActivity: GroupActivityEvent[] }>(
          `query($g:String!){ groupActivity(groupId:$g) { id actor action target details timestamp } }`,
          { g: groupId },
        )
      ).groupActivity ?? [],
    [],
  );
}

export function useInvitationsList() {
  return useFamLive<Invitation[]>(
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

export function useNotificationLogList() {
  return useFamLive<NotificationEntry[]>(
    'notificationLog',
    async () =>
      (
        await gql<{ notificationLog: NotificationEntry[] }>(
          `query { notificationLog(limit: 200){ id channel recipient subject body provider status error createdAt } }`,
        )
      ).notificationLog ?? [],
    sampleNotifications,
  );
}

// ---------------------------------------------------------------------------
// Mutations (shapes verbatim from the rhub app)
// ---------------------------------------------------------------------------

export async function createGroup(type: string, name: string, description: string): Promise<string> {
  const d = await gql<{ createGroup: { id: string } | null }>(
    `mutation($t:String!,$n:String!,$d:String!){ createGroup(type:$t,name:$n,description:$d){ id } }`,
    { t: type, n: name, d: description },
  );
  return d.createGroup?.id || '';
}

export async function updateGroup(id: string, name: string, description: string): Promise<void> {
  await gql(
    `mutation($id:String!,$n:String!,$d:String!){ updateGroup(id:$id,name:$n,description:$d){ id } }`,
    { id, n: name, d: description },
  );
}

export async function deleteGroup(id: string): Promise<void> {
  await gql(`mutation($id:String!){ deleteGroup(id:$id) }`, { id });
}

export interface MemberVars {
  name: string;
  relation: string;
  role: string;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  bio: string;
  photo: string;
  fatherId: string;
  motherId: string;
  spouseId: string;
  isBeneficiary: boolean;
  sharePct: number;
  kind: string;
  parcelId: string;
  presentAddress: string;
  aadhaar: string;
  guardianName: string;
  guardianContact: string;
  maritalStatus: string;
  spouseName: string;
  spouseContact: string;
  spouseStatus: string;
}

// NOTE: updateMember has no groupId arg on the backend (a member never changes
// group; the resolver derives it from the existing row) — only addMember does.
const MEMBER_ARG_DEF =
  '$name:String!,$relation:String!,$role:String!,$gender:String!,$dob:String!,$phone:String!,' +
  '$email:String!,$bio:String!,$photo:String!,$fatherId:String!,$motherId:String!,$spouseId:String!,' +
  '$isBeneficiary:Boolean!,$sharePct:Float!,$kind:String!,$parcelId:String!,$presentAddress:String!,' +
  '$aadhaar:String!,$guardianName:String!,$guardianContact:String!,$maritalStatus:String!,' +
  '$spouseName:String!,$spouseContact:String!,$spouseStatus:String!';
const MEMBER_CALL =
  'name:$name,relation:$relation,role:$role,gender:$gender,dob:$dob,phone:$phone,email:$email,' +
  'bio:$bio,photo:$photo,fatherId:$fatherId,motherId:$motherId,spouseId:$spouseId,' +
  'isBeneficiary:$isBeneficiary,sharePct:$sharePct,kind:$kind,parcelId:$parcelId,' +
  'presentAddress:$presentAddress,aadhaar:$aadhaar,guardianName:$guardianName,' +
  'guardianContact:$guardianContact,maritalStatus:$maritalStatus,spouseName:$spouseName,' +
  'spouseContact:$spouseContact,spouseStatus:$spouseStatus';

export interface SavedMember {
  id: string;
  inviteToken: string;
  isMinor: boolean;
  guardianContact: string;
  phone: string;
  email: string;
}

export async function addMember(groupId: string, vars: MemberVars): Promise<SavedMember | null> {
  const d = await gql<{ addMember: SavedMember | null }>(
    `mutation($groupId:String!,${MEMBER_ARG_DEF}){ addMember(groupId:$groupId,${MEMBER_CALL}){ id inviteToken isMinor guardianContact phone email } }`,
    { groupId, ...vars },
  );
  return d.addMember;
}

export async function updateMember(id: string, vars: MemberVars): Promise<SavedMember | null> {
  const d = await gql<{ updateMember: SavedMember | null }>(
    `mutation($id:String!,${MEMBER_ARG_DEF}){ updateMember(id:$id,${MEMBER_CALL}){ id inviteToken isMinor guardianContact phone email } }`,
    { id, ...vars },
  );
  return d.updateMember;
}

export async function removeMember(id: string): Promise<void> {
  await gql(`mutation($id:String!){ removeMember(id:$id) }`, { id });
}

/** Server-side invite — notify.py fans out to the configured channels
 *  (email / WhatsApp / SMS) and records to the notification log. */
export async function inviteMember(id: string): Promise<void> {
  await gql(`mutation($id:String!){ inviteMember(id:$id){ id } }`, { id });
}

/**
 * Verification status is SYSTEM-MANAGED: pending → verified happens only via
 * the invitee's /verify/:token landing. The UI may only revoke (or reopen to
 * pending) — never set "verified" directly.
 */
export async function updateMemberStatus(id: string, status: 'pending' | 'revoked'): Promise<void> {
  await gql(
    `mutation($id:String!,$status:String!){ updateMemberStatus(id:$id,status:$status){ id } }`,
    { id, status },
  );
}

export async function setMemberPhoto(id: string, photo: string): Promise<void> {
  await gql(`mutation($id:String!,$photo:String!){ setMemberPhoto(id:$id, photo:$photo) }`, {
    id,
    photo,
  });
}

export async function assignLandToGroup(passbookId: string, groupId: string): Promise<void> {
  await gql(`mutation($p:String!,$g:String!){ assignLandToGroup(passbookId:$p, groupId:$g) }`, {
    p: passbookId,
    g: groupId,
  });
}

export async function fetchNotifiers(
  groupId: string,
): Promise<{ notifiers: NotifierRow[]; members: { id: string; name: string; relation: string; role: string; isSelf: boolean }[] }> {
  const d = await gql<{
    notifiers: NotifierRow[];
    members: { id: string; name: string; relation: string; role: string; isSelf: boolean }[];
  }>(
    `query($g:String!){ notifiers(groupId:$g){ memberId name relation priority } members(groupId:$g){ id name relation role isSelf } }`,
    { g: groupId },
  );
  return { notifiers: d.notifiers ?? [], members: d.members ?? [] };
}

export async function setNotifiers(groupId: string, memberIds: string[]): Promise<void> {
  await gql(
    `mutation($g:String!,$ids:[String!]!){ setNotifiers(groupId:$g, memberIds:$ids){ memberId } }`,
    { g: groupId, ids: memberIds },
  );
}

export async function createInvitation(vars: {
  scopeType: string;
  scopeId: string;
  role: string;
  inviteeContact: string;
  expiry: string;
}): Promise<void> {
  await gql(
    `mutation($scopeType: String!, $scopeId: String!, $role: String!, $inviteeContact: String!, $expiry: String!) { createInvitation(scopeType: $scopeType, scopeId: $scopeId, role: $role, inviteeContact: $inviteeContact, expiry: $expiry) { id token } }`,
    vars,
  );
}

export async function updateInvitationStatus(id: string, status: string): Promise<void> {
  await gql(
    `mutation($id: String!, $status: String!) { updateInvitationStatus(id: $id, status: $status) { id } }`,
    { id, status },
  );
}

export async function deleteInvitation(id: string): Promise<void> {
  await gql(`mutation($id: String!) { deleteInvitation(id: $id) }`, { id });
}

export async function deleteNotification(id: string): Promise<void> {
  await gql(`mutation($id: String!) { deleteNotification(id: $id) }`, { id });
}

export async function sendTestNotification(to: string): Promise<{ provider?: string; channel?: string }> {
  const d = await gql<{ sendTestNotification: string }>(
    `mutation($to:String!){ sendTestNotification(to:$to) }`,
    { to },
  );
  try {
    return JSON.parse(d.sendTestNotification || '{}') as { provider?: string; channel?: string };
  } catch {
    return {};
  }
}

/** Public verify link for a member's invite token (same path the rhub app uses). */
export function verifyLink(inviteToken: string): string {
  return `${window.location.origin}/verify/${inviteToken || ''}`;
}
