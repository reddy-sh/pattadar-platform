/**
 * Invitation claim, setup tasks, the heir's own view, and referrals
 * (services/api/src/growth.py). Root-schema documents, read through `gql`.
 *
 * The pending invite token and referral code survive sign-up in browser
 * storage, so a person who arrives by a link and has to create an account
 * lands back where the link was taking them. Shell.tsx resumes both.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { gql } from '../api/client';
import { useToast } from './Toast';

const KEY = ['w360', 'growth'] as const;

export const PENDING_INVITE = 'pattadar.pendingInvite';
export const PENDING_REFERRAL = 'pattadar.pendingReferral';

export interface InvitePreview {
  state: 'live' | 'expired' | 'used' | 'invalid';
  purpose: '' | 'beneficiary' | 'family' | 'co_manage';
  inviter: string;
  expiresOn: string;
  steps: string[];
  forGuardian: boolean;
  canVerifyWithoutAccount: boolean;
}

export interface SetupTask { id: string; kind: string; title: string; detail: string; route: string; done: boolean }

export interface HeirRecord {
  memberId: string; listedBy: string; groupName: string; relation: string; kind: string;
  sharePct: number; isMinor: boolean; dob: string; presentAddress: string; gender: string;
  maritalStatus: string; spouseName: string; confirmed: '' | 'agreed' | 'disputed'; note: string;
  complete: boolean;
}

export interface ReferralSummary {
  code: string; path: string; joined: number; qualified: number; creditsEarned: number;
  monthlyCap: number; referredBy: string;
  rewards: { kind: string; units: number; state: string; side: string; createdAt: string }[];
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const d = await gql<{ invitePreview: InvitePreview }>(
    'query InvitePreview($t:String!){ invitePreview(token:$t){ state purpose inviter expiresOn steps forGuardian canVerifyWithoutAccount } }',
    { t: token },
  );
  return d.invitePreview;
}

export async function claimInvitation(token: string, consent: boolean) {
  const d = await gql<{ claimInvitation: { purpose: string; memberId: string; message: string } }>(
    'mutation($t:String!,$c:Boolean!){ claimInvitation(token:$t, inactivityEmailConsent:$c){ purpose memberId message } }',
    { t: token, c: consent },
  );
  return d.claimInvitation;
}

export async function redeemReferral(code: string): Promise<boolean> {
  const d = await gql<{ redeemReferralCode: boolean }>(
    'mutation($c:String!){ redeemReferralCode(code:$c) }', { c: code },
  );
  return d.redeemReferralCode;
}

export function useSetupTasks() {
  return useQuery({
    queryKey: [...KEY, 'tasks'],
    queryFn: async () =>
      (await gql<{ setupTasks: SetupTask[] }>('query { setupTasks { id kind title detail route done } }')).setupTasks ?? [],
    staleTime: 15_000,
  });
}

export function useHeirRecords() {
  return useQuery({
    queryKey: [...KEY, 'heir'],
    queryFn: async () =>
      (await gql<{ myHeirRecords: HeirRecord[] }>(
        'query { myHeirRecords { memberId listedBy groupName relation kind sharePct isMinor dob presentAddress gender maritalStatus spouseName confirmed note complete } }',
      )).myHeirRecords ?? [],
  });
}

export function useReferral() {
  return useQuery({
    queryKey: [...KEY, 'referral'],
    queryFn: async () =>
      (await gql<{ myReferral: ReferralSummary }>(
        'query { myReferral { code path joined qualified creditsEarned monthlyCap referredBy rewards { kind units state side createdAt } } }',
      )).myReferral,
  });
}

function useGrowthWrite<V>(run: (v: V) => Promise<unknown>, what: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.bad(`${what} Nothing has changed.`, e),
  });
}

export interface HeirProfileVars {
  memberId: string; dob: string; presentAddress: string; gender: string; maritalStatus: string; spouseName: string;
}

export const useUpdateHeirProfile = () =>
  useGrowthWrite<HeirProfileVars>((v) => gql(
    'mutation($m:String!,$d:String!,$a:String!,$g:String!,$s:String!,$sp:String!){ updateMyHeirProfile(memberId:$m,dob:$d,presentAddress:$a,gender:$g,maritalStatus:$s,spouseName:$sp) }',
    { m: v.memberId, d: v.dob, a: v.presentAddress, g: v.gender, s: v.maritalStatus, sp: v.spouseName },
  ), 'Your profile could not be saved.');

export const useConfirmHeir = () =>
  useGrowthWrite<{ memberId: string; agree: boolean; note: string }>((v) => gql(
    'mutation($m:String!,$a:Boolean!,$n:String!){ confirmMyHeirDetails(memberId:$m,agree:$a,note:$n) }',
    { m: v.memberId, a: v.agree, n: v.note },
  ), 'Your answer could not be saved.');
