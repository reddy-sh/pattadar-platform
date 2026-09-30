/**
 * Invitations data, for the W360 screen at /app/invitations.
 *
 * Same reason `groupsData.ts` exists beside `familiesData.ts`: the legacy read
 * (`useInvitationsList`) swallows every error into an empty sample list, so an
 * outage and an account with no invitations looked identical. This read keeps
 * the failure so the screen can say `Failed` and mean it.
 *
 * The writes are the legacy GraphQL documents, imported rather than copied.
 * Each gets a react-query wrapper for `isPending` (no double posts), a toast
 * on failure (no silent refusals) and a targeted invalidation.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invitation } from '@pattadar/core';

import { gql } from '../api/client';
import {
  deleteInvitation,
  updateInvitationStatus,
} from '../pages/families/familiesData';
import { useToast } from './Toast';

const INVITATIONS = ['w360', 'invitations'] as const;

/** An invitation as this screen reads it — never with its token. */
export type InvitationRow = Omit<Invitation, 'token'> & { deliveryStatus: string; acceptedAt: string };

/** What sending returned: the one-time link path, and whether it left. */
export interface SentInvitation { id: string; token: string; deliveryStatus: string }

/** Invitations this account has sent, newest first (the resolver orders them).
 *  The `token` field is stripped server-side and is not selected here. */
export function useInvitations() {
  return useQuery({
    queryKey: [...INVITATIONS, 'list'],
    queryFn: async () =>
      (
        await gql<{ invitations: InvitationRow[] }>(
          `query { invitations { id scopeType scopeId role inviteeContact expiry status createdAt deliveryStatus acceptedAt } }`,
        )
      ).invitations ?? [],
    staleTime: 15_000,
  });
}

function useInvitationWrite<V, R = unknown>(run: (vars: V) => Promise<R>, what: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITATIONS });
      // Flag (not refetch) the legacy subtree, whose dashboard counts invitations.
      void qc.invalidateQueries({ queryKey: ['pattadar'], refetchType: 'none' });
    },
    onError: (e) => toast.bad(`${what} Nothing has changed.`, e),
  });
}

export interface NewInvitation {
  scopeType: 'parcel' | 'passbook';
  scopeId: string;
  role: string;
  inviteeContact: string;
  /** YYYY-MM-DD */
  expiry: string;
}

export const useCreateInvitation = () =>
  useInvitationWrite<NewInvitation, SentInvitation>(async (v) => (await gql<{ createInvitation: SentInvitation }>(
    'mutation($scopeType:String!,$scopeId:String!,$role:String!,$inviteeContact:String!,$expiry:String!){ '
    + 'createInvitation(scopeType:$scopeType,scopeId:$scopeId,role:$role,inviteeContact:$inviteeContact,expiry:$expiry)'
    + '{ id token deliveryStatus } }', { ...v },
  )).createInvitation, 'That invitation could not be sent.');

export const useSetInvitationStatus = () =>
  useInvitationWrite<{ id: string; status: 'revoked' }>(
    (v) => updateInvitationStatus(v.id, v.status),
    'That invitation could not be updated.',
  );

export const useDeleteInvitation = () =>
  useInvitationWrite<{ id: string }>((v) => deleteInvitation(v.id), 'That invitation could not be deleted.');
