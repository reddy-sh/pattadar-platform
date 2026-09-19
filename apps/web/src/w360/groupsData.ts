/**
 * Families & Groups data, for the W360 screen at /app/groups.
 *
 * Why this file exists rather than reusing `pages/families/familiesData.ts`
 * wholesale: that module reads through `useFamLive`, which catches EVERY error
 * and resolves it into an empty copy of the sample dataset flagged
 * `isSample: true`. On the legacy screen that was a deliberate demo
 * affordance, but it makes three very different situations look identical —
 * an account with no groups, an expired session, and a server that is down
 * all paint the same empty page with a "Sample data" chip. There is no way to
 * retry, because as far as react-query is concerned the query succeeded.
 *
 * The reads here keep the failure. A page can then say "this did not load,
 * here is why, try again" (`Failed`) and mean it, and tell that apart from
 * "you have no groups yet" (`Empty`). Keys sit under the module's own `w360`
 * prefix so the shared retry in `ui.tsx` — which invalidates `['w360']` —
 * repairs this screen too.
 *
 * The WRITES are the same GraphQL documents the legacy screen posts, imported
 * from `familiesData` rather than copied: two spellings of `addMember`'s
 * twenty-three arguments would drift the first time either was touched. What
 * is added here is a react-query wrapper per write, which buys three things
 * the legacy screen does not have — `isPending` to disable a button so a
 * double-click cannot post twice, a toast on failure so a refused write is
 * never silent, and a *targeted* invalidation.
 *
 * That last one is the "lag". Every mutation on the legacy screen ended in
 * `invalidateQueries({ queryKey: ['pattadar'] })`, which is the root of the
 * key space: renaming one group refetched the portfolio, the passbook list,
 * the document list and every other live `pattadar` query in the app. Here a
 * group write invalidates group queries, and land assignment additionally
 * invalidates the record views it genuinely changes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { gql } from '../api/client';
import {
  GROUP_FIELDS_HOLDINGS,
  MEMBER_FIELDS,
  addMember,
  assignLandToGroup,
  assignPropertyToGroup,
  createGroup,
  deleteGroup,
  inviteMember,
  removeMember,
  setNotifiers,
  updateGroup,
  updateMember,
  updateMemberStatus,
} from '../pages/families/familiesData';
import type {
  GroupActivityEvent,
  GroupMember,
  MemberVars,
  NotifierRow,
  ParcelOption,
  SavedMember,
} from '../pages/families/familiesData';
import { useToast } from './Toast';

const KEY = 'w360';
/** Everything on this screen, and nothing else. */
const GROUPS = [KEY, 'groups'] as const;

/**
 * A group as the `groups` resolver returns it.
 *
 * Deliberately NOT `@pattadar/core`'s `Group`, whose `type` is the union
 * `'family' | 'partnership' | 'company' | 'huf' | 'trust'`. That union is a
 * claim this code cannot honour: `type` is a plain TEXT column, the server
 * validates it against its own dict, and a row written by an older build (or
 * a type added on the server before the web app knows about it) would be a
 * lie in the type system rather than a value the screen can fall back on.
 * `groupTypeDef` already treats it as a string and defaults gracefully.
 */
export interface GroupRow {
  id: string;
  ownerUserId: string;
  type: string;
  name: string;
  description: string;
  myRole: string;
  /** Khatas pointing at this group — NOT how many things it holds. A khata can
   *  contain many parcels or none, and built property has no khata at all. */
  landCount: number;
  memberCount: number;
  /** Agricultural extent in acres, from the parcels under those khatas. */
  totalExtent: number;
  totalShare: number;
  createdAt: string;
  /** Parcels under this group's khatas. */
  parcelCount: number;
  /** Flats, shops and plots assigned to this group directly. */
  propertyCount: number;
  headName: string;
  lastActiveAt: string;
  inactivityStage: string;
  inactivityNextAt: string;
  inactivityLastOutcome: string;
  inactiveContactGaps: number;
}

/** Everything the group holds, however it is held. This is the number the
 *  screen shows, because "3 passbooks" over an empty list is the thing that
 *  made the old panel unreadable. */
export const holdingCount = (g: GroupRow) => g.parcelCount + g.propertyCount;

export interface GroupMembersView {
  members: GroupMember[];
  parcels: ParcelOption[];
  myAddress: string;
}

// ── Reads ──────────────────────────────────────────────────────────────

/** The groups this account owns. `staleTime` is short: this list carries
 *  member and passbook counts that other screens change. */
export function useGroups() {
  return useQuery({
    queryKey: [...GROUPS, 'list'],
    queryFn: async () =>
      (await gql<{ groups: GroupRow[] }>(`query { groups { ${GROUP_FIELDS_HOLDINGS} } }`)).groups ?? [],
    staleTime: 15_000,
  });
}

/**
 * One group's members, plus the two things the member form needs beside them:
 * the parcels a share can be pinned to, and the account's own address to
 * offer as a default.
 *
 * All three in one round trip because the form cannot open without any of
 * them — three queries would mean three loading states for one dialog.
 */
export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    enabled: !!groupId,
    queryKey: [...GROUPS, 'members', groupId ?? ''],
    queryFn: async (): Promise<GroupMembersView> => {
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
    staleTime: 15_000,
  });
}

/* The passbook list that used to live here is gone. The Holdings tab reads
 * `useProperties({ groups: [id] })` from `../api` instead — the SAME query the
 * Properties screen runs, so the two can never disagree about what a group
 * holds, and the group's holdings arrive already shaped as record cards with
 * kind, place, extent and cover photo.
 *
 * Listing passbooks was also the wrong answer to the question. A passbook is a
 * container, not a holding: the panel reported "3 passbooks · 0 Cents" for a
 * group whose khatas were empty, with blank owner and khata columns, while the
 * one parcel the account actually owned hung off a fourth passbook that was
 * not in the group. And it could never show built property at all — a flat has
 * no passbook. */

/** Audit events for this group — the group row, its members, its passbooks. */
export function useGroupActivity(groupId: string | undefined, enabled = true) {
  return useQuery({
    enabled: enabled && !!groupId,
    queryKey: [...GROUPS, 'activity', groupId ?? ''],
    queryFn: async () =>
      (
        await gql<{ groupActivity: GroupActivityEvent[] }>(
          `query($g:String!){ groupActivity(groupId:$g){ id actor action target details timestamp } }`,
          { g: groupId },
        )
      ).groupActivity ?? [],
    staleTime: 15_000,
  });
}

/** The configured escalation order, and everyone eligible to be in it.
 *  Only fetched while the notifier dialog is open. */
export function useNotifiers(groupId: string | undefined, enabled: boolean) {
  return useQuery({
    enabled: enabled && !!groupId,
    queryKey: [...GROUPS, 'notifiers', groupId ?? ''],
    queryFn: async () => {
      const d = await gql<{
        notifiers: NotifierRow[];
        members: {
          id: string;
          name: string;
          relation: string;
          role: string;
          isSelf: boolean;
          email: string;
          emailVerified: boolean;
          inactivityEmailConsent: boolean;
          isMinor: boolean;
        }[];
      }>(
        `query($g:String!){ notifiers(groupId:$g){ memberId name relation contact priority channel eligible }
           members(groupId:$g){ id name relation role isSelf email emailVerified inactivityEmailConsent isMinor } }`,
        { g: groupId },
      );
      return { notifiers: d.notifiers ?? [], members: d.members ?? [] };
    },
    // Not cached between openings: the dialog is an editor over this exact
    // list, and opening it onto a stale order is how two people's edits
    // silently overwrite each other.
    staleTime: 0,
    gcTime: 0,
  });
}

// ── Writes ─────────────────────────────────────────────────────────────

/**
 * The shape every write on this screen shares.
 *
 * `onSuccess` refreshes the group queries and nothing else. `also` names the
 * extra keys a particular write genuinely invalidates — land assignment moves
 * a passbook between a group and personal, which changes the portfolio totals
 * and the property list, so those two are named there and only there.
 *
 * The legacy `['pattadar', 'families']` subtree is marked stale as well. It
 * costs nothing — react-query does not refetch an inactive query, it only
 * flags it — and it means the previous screen at /legacy/groups agrees with
 * this one the moment anybody opens it, instead of serving up to 30 seconds
 * of a group that has already been renamed or deleted.
 *
 * `what` is the subject of the failure sentence, in the owner's words.
 */
function useGroupWrite<V, R>(
  run: (vars: V) => Promise<R>,
  what: string,
  {
    also = [],
    quiet = false,
  }: {
    also?: readonly (readonly unknown[])[];
    /** The caller shows the reason itself, in context. Only the member form
     *  sets this: it prints the server's words in an alert at the top of the
     *  form, beside the fields they refer to, and a toast saying the same
     *  thing in the corner is the same failure reported twice. */
    quiet?: boolean;
  } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS });
      void qc.invalidateQueries({ queryKey: ['pattadar', 'families'] });
      for (const k of also) void qc.invalidateQueries({ queryKey: k });
    },
    // Raised here so no write on this screen can forget it. A caller that
    // wants a more specific message still passes its own onError; react-query
    // runs both, this one first.
    onError: quiet ? undefined : (e) => toast.bad(`${what} Nothing has changed.`, e),
  });
}

export const useCreateGroup = () =>
  useGroupWrite<{ type: string; name: string; description: string }, string>(
    (v) => createGroup(v.type, v.name, v.description),
    'That group could not be created.',
  );

export const useUpdateGroup = () =>
  useGroupWrite<{ id: string; name: string; description: string }, void>(
    (v) => updateGroup(v.id, v.name, v.description),
    'That change could not be saved.',
  );

export const useDeleteGroup = () =>
  useGroupWrite<{ id: string }, void>(
    (v) => deleteGroup(v.id),
    'That group could not be deleted.',
    // A deleted group hands its land back to personal, which the portfolio
    // and the property list both count.
    { also: [[KEY, 'portfolio'], [KEY, 'properties']] },
  );

/** Add or edit one person. `memberId` null means add.
 *
 *  Quiet on failure: PersonDialog catches a rejected submit and prints the
 *  reason at the top of the form, which is where the person looking at the
 *  fields will see it. */
export const useSaveMember = () =>
  useGroupWrite<
    { groupId: string; memberId: string | null; vars: MemberVars },
    SavedMember | null
  >(
    (v) => (v.memberId ? updateMember(v.memberId, v.vars) : addMember(v.groupId, v.vars)),
    'That person could not be saved.',
    { quiet: true },
  );

export const useRemoveMember = () =>
  useGroupWrite<{ id: string }, void>(
    (v) => removeMember(v.id),
    'That person could not be removed.',
  );

export const useInviteMember = () =>
  useGroupWrite<{ id: string }, void>(
    (v) => inviteMember(v.id),
    'That invitation could not be sent.',
  );

export const useSetMemberStatus = () =>
  useGroupWrite<{ id: string; status: 'pending' | 'revoked' }, void>(
    (v) => updateMemberStatus(v.id, v.status),
    'That change could not be saved.',
  );

/**
 * Move a holding into a group, or out of one.
 *
 * Two mutations behind one hook because the grain genuinely differs and the
 * caller has to know: a built property carries its own `group_id` and moves
 * alone, while a parcel has none — agricultural land is grouped through the
 * khata above it, so moving one parcel moves every parcel on that passbook.
 * The screen says so before it acts rather than surprising anyone.
 */
export const useAssignHolding = () =>
  useGroupWrite<
    { kind: 'parcel' | 'property'; passbookId: string; recordId: string; groupId: string },
    void
  >(
    (v) => (v.kind === 'property'
      ? assignPropertyToGroup(v.recordId, v.groupId)
      : assignLandToGroup(v.passbookId, v.groupId)),
    'That holding could not be reassigned.',
    { also: [[KEY, 'portfolio'], [KEY, 'properties'], [KEY, 'map']] },
  );

export const useSetNotifiers = () =>
  useGroupWrite<{ groupId: string; memberIds: string[] }, void>(
    (v) => setNotifiers(v.groupId, v.memberIds),
    'That notifier order could not be saved.',
  );
