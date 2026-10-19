/**
 * Families & Groups data layer — co-located queries/mutations for part 2 of
 * the rebuild (FamiliesGroupsPage / NotificationsPage). The invitation
 * writes below are also used by the W360 screen (w360/invitationsData.ts).
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
  sampleMembers,
  sampleNotifications,
  samplePassbooks,
} from '@pattadar/core';
import type { Group, NotificationEntry } from '@pattadar/core';
import { gql } from '../../api/client';
import { emptyLike, liveQueryOptions } from '../../data/useLiveOrSample';
import groupTypesJson from './groupTypes.json';

// ---------------------------------------------------------------------------
// Group type definitions (port of rhub groups.ts)
// ---------------------------------------------------------------------------

/** One typed fact a group (or a member of it) can carry. The catalogue is
 *  generated from the server's GROUP_TYPES (groupTypes.json), so the web never
 *  hand-copies a label, role, option or rule. */
export interface FactCond {
  key: string;
  in?: string[];
  not?: string[];
}
export interface FactField {
  key: string;
  label: string;
  kind: 'text' | 'date' | 'select' | 'country';
  options?: string[];
  /** Required while the field is visible. */
  required?: boolean;
  /** ALL conditions must hold for the field to show. */
  when?: FactCond[];
  pattern?: string;
  upper?: boolean;
  help?: string;
  /** No future dates. */
  past?: boolean;
  /** Member fields only: the roles the field shows for. */
  roles?: string[];
  /** Whose PAN this is ("firm", "company"…), for the personal-PAN refusal. */
  entity?: string;
  /** Expected 4th PAN letter by sub_kind ('*' = any other); a warning only. */
  pan4?: Record<string, string>;
  default?: string;
}

interface CatalogueType {
  label: string;
  has_tree: boolean;
  primary_role: string;
  default_role: string;
  roles: string[];
  fields: FactField[];
  member_fields: FactField[];
  share_roles: Record<string, string>;
}
const CATALOGUE = groupTypesJson as unknown as Record<string, CatalogueType>;

export interface GroupTypeDef {
  type: string;
  label: string;
  icon: string; // emoji used on cards/dialogs
  hasTree: boolean; // family genealogy semantics (relations vs roles)
  primaryRole: string;
  /** Role a new member starts with (never inferred from list order). */
  defaultRole: string;
  roles: string[];
  fields: FactField[];
  memberFields: FactField[];
  /** Roles that hold a share, mapped to the share input's label. */
  shareRoles: Record<string, string>;
}

// Labels and icons stay here (naming standard: "or", not a slash); everything
// else comes from the server catalogue.
const TYPE_LOOK: { type: string; label: string; icon: string }[] = [
  { type: 'family', label: 'Family', icon: '👪' },
  { type: 'partnership', label: 'Partnership', icon: '🤝' },
  { type: 'company', label: 'Company or LLP', icon: '🏢' },
  { type: 'huf', label: 'HUF', icon: '🏛️' },
  { type: 'trust', label: 'Trust or society', icon: '⚖️' },
  // No "Portfolio / Wallet" type (retired 06/10/2026): a group is a holder,
  // and keeping properties together is what a holding does. The server
  // refuses the type.
];

export const GROUP_TYPES: GroupTypeDef[] = TYPE_LOOK.map(({ type, label, icon }) => {
  const c = CATALOGUE[type];
  return {
    type, label, icon,
    hasTree: c.has_tree,
    primaryRole: c.primary_role,
    defaultRole: c.default_role,
    roles: c.roles,
    fields: c.fields,
    memberFields: c.member_fields,
    shareRoles: c.share_roles,
  };
});

export function groupTypeDef(type: string): GroupTypeDef {
  return GROUP_TYPES.find((g) => g.type === type) || GROUP_TYPES[0];
}

/** How a stored role reads on screen (naming standard N1, N5). The stored
 *  value is what the server and every existing member row carry, so it stays
 *  as it is; only the words an owner reads change. */
const ROLE_WORD: Record<string, string> = {
  'Managing Partner': 'Managing partner',
  'Authorized Signatory': 'Authorised signatory',
};

/** A role as an owner reads it; unknown roles pass through unchanged. */
export const roleWord = (role: string): string => ROLE_WORD[role] ?? role;

export function roleOptions(type: string): { value: string; label: string }[] {
  return groupTypeDef(type).roles.map((r) => ({ value: r, label: roleWord(r) }));
}

/** A typed role in the catalogue's own spelling when it matches one
 *  case-insensitively (the server does the same), else as typed. */
export function catalogueRole(type: string, role: string): string {
  const t = role.split(/\s+/).filter(Boolean).join(' ');
  return groupTypeDef(type).roles.find((r) => r.toLowerCase() === t.toLowerCase()) ?? t;
}

// ---------------------------------------------------------------------------
// Typed facts — same rules as the server's _fact_shown / _clean_facts
// ---------------------------------------------------------------------------

export type Facts = Record<string, string>;

/** A stored facts string as an object; anything unreadable is `{}`. */
export function parseFacts(s?: string | null): Facts {
  if (!s) return {};
  try {
    const o = JSON.parse(s) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: Facts = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** The value a condition reads: an absent country counts as India. */
const condValue = (facts: Facts, key: string) => (key === 'country' ? facts.country || 'IN' : facts[key] || '');

/** Whether a field shows under these facts (and, for member fields, this role). */
export function factShown(f: FactField, facts: Facts, role?: string): boolean {
  if (f.roles && role !== undefined && !f.roles.includes(role)) return false;
  return (f.when ?? []).every((c) => {
    const v = condValue(facts, c.key);
    if (c.in && !c.in.includes(v)) return false;
    if (c.not && c.not.includes(v)) return false;
    return true;
  });
}

/** The fields that show, in catalogue order. A condition reads only values of
 *  fields already shown (as the server reads only what it has kept), so a
 *  stale value behind a hidden field never reveals another. Member fields
 *  pass the group's facts (its country, sub-kind) as `ctx`. */
export function visibleFields(fields: FactField[], facts: Facts, role?: string, ctx: Facts = {}): FactField[] {
  const seen: Facts = { ...ctx };
  const out: FactField[] = [];
  for (const f of fields) {
    if (out.some((o) => o.key === f.key) || !factShown(f, seen, role)) continue;
    out.push(f);
    const v = normFact(f, facts[f.key] || '');
    if (v) seen[f.key] = v;
  }
  return out;
}

/** Today in the viewer's own time zone, as YYYY-MM-DD (not UTC's date). */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Normalise as the server does: collapse spaces, upper-case where set. */
export function normFact(f: FactField, v: string): string {
  const t = (v || '').split(/\s+/).filter(Boolean).join(' ');
  return f.upper || f.kind === 'country' ? t.toUpperCase() : t;
}

/** A format problem that blocks saving, or '' when the value is fine (or empty). */
export function factError(f: FactField, raw: string): string {
  const v = normFact(f, raw);
  if (!v) return '';
  if (v.length > 200) return `${f.label} is too long.`;
  const bad = `${f.label} does not look right.${f.help ? ` ${f.help}` : ''}`;
  if (f.kind === 'select' && !(f.options ?? []).includes(v)) return bad;
  if (f.kind === 'country' && !/^[A-Z]{2}$/.test(v)) return bad;
  if (f.kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(`${v}T00:00:00Z`).getTime())) return bad;
    if (f.past && v > todayIso()) return `${f.label} cannot be in the future.`;
  }
  if (f.pattern && !new RegExp(f.pattern).test(v)) return bad;
  if (f.entity && v.length === 10 && v[3] === 'P') return `This is a personal PAN; enter the ${f.entity}'s PAN.`;
  return '';
}

/** A soft warning when a PAN's 4th letter does not fit the kind of entity. */
export function panWarn(f: FactField, raw: string, facts: Facts): string {
  if (!f.pan4) return '';
  const v = normFact(f, raw);
  if (v.length !== 10 || factError(f, v)) return '';
  const want = f.pan4[facts.sub_kind || ''] ?? f.pan4['*'] ?? '';
  if (!want || want.includes(v[3])) return '';
  return `The 4th letter is usually ${want} for this kind of entity.`;
}

/** Required-and-visible fields left empty. */
export function missingFacts(fields: FactField[], facts: Facts, role?: string, ctx: Facts = {}): FactField[] {
  return visibleFields(fields, facts, role, ctx).filter((f) => f.required && !normFact(f, facts[f.key] || ''));
}

/** The first blocking format error among the visible fields, or ''. */
export function firstFactError(fields: FactField[], facts: Facts, role?: string, ctx: Facts = {}): string {
  for (const f of visibleFields(fields, facts, role, ctx)) {
    const e = factError(f, facts[f.key] || '');
    if (e) return e;
  }
  return '';
}

/** Only the visible, non-empty facts, normalised, as the JSON string the
 *  server takes. `ctx` is read by conditions but never saved here (a member
 *  field reading the group's country). */
export function pickFacts(fields: FactField[], facts: Facts, role?: string, ctx: Facts = {}): string {
  const out: Facts = {};
  for (const f of visibleFields(fields, facts, role, ctx)) {
    const v = normFact(f, facts[f.key] || '');
    if (v) out[f.key] = v;
  }
  return JSON.stringify(out);
}

/** The label a member's share input carries, or '' when the role holds none. */
export const shareLabel = (type: string, role: string): string => groupTypeDef(type).shareRoles[role] ?? '';

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
  /** The heir's own answer after claiming their invitation: '' | agreed | disputed. */
  heirConfirmed?: string;
  heirNote?: string;
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
  inactivityEmailConsent: boolean;
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
  /** JSON object string of the member's typed facts (DIN, appointed on…). */
  facts?: string;
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
  contact: string;
  priority: number;
  channel: string;
  eligible: boolean;
}

// Exact field list the rhub UnifiedFamilyView queries.
export const MEMBER_FIELDS =
  'id ownerUserId name relation gender dob phone email bio photo groupId role isSelf ' +
  'fatherId motherId spouseId isBeneficiary sharePct kind status inviteStatus inviteToken ' +
  'phoneVerified emailVerified inactivityEmailConsent parcelId presentAddress aadhaarMasked isMinor guardianName ' +
  'guardianContact maritalStatus spouseName spouseContact spouseStatus createdAt heirConfirmed heirNote facts';

export const GROUP_FIELDS =
  'id ownerUserId type name description myRole memberCount landCount totalExtent totalShare createdAt facts';

/** As above plus what the group actually HOLDS. Kept separate from
 *  GROUP_FIELDS so the legacy screen's query is untouched: `landCount` counts
 *  khatas, which is not the same number as the things in them. */
export const GROUP_FIELDS_HOLDINGS = `${GROUP_FIELDS} parcelCount propertyCount headName lastActiveAt inactivityStage inactivityNextAt inactivityLastOutcome inactiveContactGaps`;

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
  const q = useQuery(liveQueryOptions(['pattadar', 'families', key], fetchLive));
  return {
    data: q.data ?? emptyLike(sample),
    isSample: q.isError,
    isLoading: q.isPending,
    error: q.error,
    refetch: () => void q.refetch(),
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
      inactivityEmailConsent: false,
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

export async function createGroup(type: string, name: string, description: string, facts?: string): Promise<string> {
  const d = await gql<{ createGroup: { id: string } | null }>(
    `mutation($t:String!,$n:String!,$d:String!,$x:String){ createGroup(type:$t,name:$n,description:$d,facts:$x){ id } }`,
    { t: type, n: name, d: description, x: facts ?? null },
  );
  return d.createGroup?.id || '';
}

/** Omitting `facts` (null) keeps what is stored, so a rename never wipes them. */
export async function updateGroup(id: string, name: string, description: string, facts?: string): Promise<void> {
  await gql(
    `mutation($id:String!,$n:String!,$d:String!,$x:String){ updateGroup(id:$id,name:$n,description:$d,facts:$x){ id } }`,
    { id, n: name, d: description, x: facts ?? null },
  );
}

export async function deleteGroup(id: string): Promise<void> {
  const d = await gql<{ deleteGroup: boolean }>(`mutation($id:String!){ deleteGroup(id:$id) }`, { id });
  if (!d.deleteGroup) throw new Error('Group not found — reload and try again');
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
  aadhaarCandidateId?: string;
  guardianName: string;
  guardianContact: string;
  maritalStatus: string;
  spouseName: string;
  spouseContact: string;
  spouseStatus: string;
  /** Omitted (null) keeps the stored facts. */
  facts?: string;
}

// NOTE: updateMember has no groupId arg on the backend (a member never changes
// group; the resolver derives it from the existing row) — only addMember does.
const MEMBER_ARG_DEF =
  '$name:String!,$relation:String!,$role:String!,$gender:String!,$dob:String!,$phone:String!,' +
  '$email:String!,$bio:String!,$photo:String!,$fatherId:String!,$motherId:String!,$spouseId:String!,' +
  '$isBeneficiary:Boolean!,$sharePct:Float!,$kind:String!,$parcelId:String!,$presentAddress:String!,' +
  '$aadhaar:String!,$aadhaarCandidateId:String!,$guardianName:String!,$guardianContact:String!,$maritalStatus:String!,' +
  '$spouseName:String!,$spouseContact:String!,$spouseStatus:String!,$facts:String';
const MEMBER_CALL =
  'name:$name,relation:$relation,role:$role,gender:$gender,dob:$dob,phone:$phone,email:$email,' +
  'bio:$bio,photo:$photo,fatherId:$fatherId,motherId:$motherId,spouseId:$spouseId,' +
  'isBeneficiary:$isBeneficiary,sharePct:$sharePct,kind:$kind,parcelId:$parcelId,' +
  'presentAddress:$presentAddress,aadhaar:$aadhaar,aadhaarCandidateId:$aadhaarCandidateId,guardianName:$guardianName,' +
  'guardianContact:$guardianContact,maritalStatus:$maritalStatus,spouseName:$spouseName,' +
  'spouseContact:$spouseContact,spouseStatus:$spouseStatus,facts:$facts';

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
    { groupId, ...vars, aadhaarCandidateId: vars.aadhaarCandidateId ?? '', facts: vars.facts ?? null },
  );
  return d.addMember;
}

export async function updateMember(id: string, vars: MemberVars): Promise<SavedMember | null> {
  const d = await gql<{ updateMember: SavedMember | null }>(
    `mutation($id:String!,${MEMBER_ARG_DEF}){ updateMember(id:$id,${MEMBER_CALL}){ id inviteToken isMinor guardianContact phone email } }`,
    { id, ...vars, aadhaarCandidateId: vars.aadhaarCandidateId ?? '', facts: vars.facts ?? null },
  );
  return d.updateMember;
}

export async function removeMember(id: string): Promise<void> {
  const d = await gql<{ removeMember: boolean }>(`mutation($id:String!){ removeMember(id:$id) }`, { id });
  if (!d.removeMember) throw new Error('Member not found — reload and try again');
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

/**
 * Move built property — a flat, a shop, an open plot — into a group, or to ''
 * for your own name.
 *
 * The server has had this mutation since groups shipped and nothing called it,
 * which is why a group could only ever hold agricultural land: `properties`
 * has no passbook, so `assignLandToGroup` cannot reach it. A property is
 * assigned one at a time, unlike a khata, because the group lives on the
 * property's own row.
 */
export async function assignPropertyToGroup(propertyId: string, groupId: string): Promise<void> {
  const d = await gql<{ assignPropertyToGroup: boolean }>(
    `mutation($p:String!,$g:String!){ assignPropertyToGroup(propertyId:$p, groupId:$g) }`,
    { p: propertyId, g: groupId },
  );
  if (!d.assignPropertyToGroup) throw new Error('That property was not found — reload and try again');
}

export async function fetchNotifiers(
  groupId: string,
): Promise<{ notifiers: NotifierRow[]; members: { id: string; name: string; relation: string; role: string; isSelf: boolean }[] }> {
  const d = await gql<{
    notifiers: NotifierRow[];
    members: { id: string; name: string; relation: string; role: string; isSelf: boolean }[];
  }>(
    `query($g:String!){ notifiers(groupId:$g){ memberId name relation contact priority channel eligible } members(groupId:$g){ id name relation role isSelf } }`,
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
