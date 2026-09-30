# Invitations, invitee onboarding and referrals

Status: **P0, P1 and the P3 core are implemented in code** (this change). P2
(real access grants) and P4 (growth loops) are not. Nothing here is deployed
evidence, and no notification provider was activated.

## Model

Every invitation has a **purpose**, derived from `invitations.scope_type`:

| scope_type | purpose | on acceptance |
|---|---|---|
| `beneficiary`, `family` | heir / family member | member verified, account linked (`family_members.linked_principal`), setup tasks written |
| `parcel`, `passbook` | `co_manage` | acceptance recorded (`accepted_by`, `accepted_at`); **no access is granted yet** (P2) |

Every claimed invitation also attributes the new account to the inviter as a
referral (first attribution wins).

## Invitee flow

1. Link: `/i/<token>` (new) or `/verify/<token>` (links already sent). Both render
   `apps/web/src/pages/InvitePage.tsx`.
2. `invitePreview(token)` is **public** (API `RequireAuthenticatedRoot` and the
   gateway `public_graphql.py` allowlist, as the only public *query*). It returns
   the state, the purpose, the inviter as "First L.", the expiry and the steps. It
   never returns land, shares or documents.
3. Signed out: "Create your account" / "I already have an account". The token is
   kept in `localStorage` and `Shell.tsx` resumes it once after sign-in. Heirs can
   still verify without an account (the original `verifyBeneficiary` path).
4. `claimInvitation(token, inactivityEmailConsent)` is authenticated.
   - Possession of the single-use, hashed, expiring token is the proof of
     contact control, the same model `verifyBeneficiary` already used.
   - The sender cannot claim their own invitation.
   - For heirs it runs `_verify_by_token(..., link_principal=uid)` in one
     transaction.
5. Setup tasks (`setup_tasks`) are listed by `setupTasks`, and their completion is
   derived from real rows:
   - `heir_confirm`: done once `heir_confirmed` is set.
   - `heir_profile`: done once date of birth and address are present, plus the
     spouse if married.
   - `first_record`: done once the account has a passbook or a property.
6. The heir's screen is `/app/heir/:id` (`myHeirRecords`, `updateMyHeirProfile`,
   `confirmMyHeirDetails`). The owner sees "Confirmed by them" / "Asked for a
   correction" in the Families & groups member table.

## Owner-side fixes (P0)

- `createInvitation`:
  - accepts only `parcel`/`passbook` scopes, `view`/`manage` roles, a real
    contact, and an expiry from today to one year out;
  - checks ownership per scope type;
  - stores the token hash only;
  - sends through `notify.notify_contact` and records `delivery_status`;
  - returns the `/i/<token>` path once, so the owner can share it by hand when
    nothing was delivered.
- `updateInvitationStatus` accepts only `revoked`. Accepted and expired belong to
  the system.
- `dashboardStats.pendingInvitations` counts every invitation the caller owns.
- `addBeneficiary` audit text no longer claims an invite was sent.
- Expo `/verify/[token]` now carries the safeguard-email consent.

## Referral

- `referral_codes`: one code per account, `STEM123`, shared as `/r/CODE`.
- `redeemReferralCode(code)` attributes the signed-in account, but not when:
  - it is the caller's own code,
  - the account is already attributed,
  - the account already has records.
- `/r/:code` stores the code, and the shell redeems it once.
- **Qualification:** the referred account files a first record, checked lazily in
  `myReferral`. Both sides then earn `REFERRAL_REWARD_CREDITS` AI credits
  (default 1). The referrer's rewards are capped at `REFERRAL_MONTHLY_CAP` per
  calendar month (default 10).
- **Rewards are recorded entitlements** (`referral_rewards.state='earned'`).
  Nothing is redeemed, charged or paid. Redemption is a separate, approved change.
- UI: `/app/refer` ("Invite & earn", Shared group of the rail).

## Data

- New columns:
  - `invitations`: `owner_user_id`, `delivery_status`, `accepted_by`, `accepted_at`
  - `family_members`: `linked_principal`, `heir_confirmed`, `heir_note`
- New tables: `setup_tasks`, `referral_codes`, `referral_attributions`,
  `referral_rewards`. Each keys its person by `owner_user_id`, so account export
  and erasure include them through the catalog.
- Tokens stay hashed and omitted from export.

## Not done, and needing Reddy's decision

- **P2 access grants:** what `view`/`manage` actually open for an accepted
  `co_manage` invitee, and whether a verified heir may see more than their own
  listing.
- **Providers:** Resend/MSG91 DLT/WhatsApp activation and cost. Until then,
  outside local development delivery records `failed` and the owner shares the
  link by hand.
- **Rewards:** kind, budget and redemption.
- **Legal copy:** third-party-contact attestation and referral terms.
- **iOS parity:** invitations remain web-only per the M-series spec. `sync-ios`
  is needed before any phone surface.
