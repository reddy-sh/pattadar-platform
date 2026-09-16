# Pattadar Mobile (apps/mobile)

Native companion app for Pattadar. **Initialized 26/07/2026** (Phase 4 started):
Expo SDK 57 scaffold with the workspace wired — `bun install` at the repo root, then
`bun run dev:mobile` (or `cd apps/mobile && bun run dev`) starts Metro; scan the QR
with Expo Go, or press `i` for the iOS simulator.

## Stack

- **Expo SDK 57** (React Native 0.86, React 19.2) with **expo-router** for file-based
  navigation (`src/app/`).
- **React Native Paper** (Material 3), themed from `@pattadar/tokens` in
  `src/theme/paper.ts` — one Material brand language shared with the MUI web app.
- **Amazon Cognito** (same user pool as web) via hosted UI + PKCE. The native app
  client exists (`44gv48ihjlgub7h0lnvjbdmj89`, custom-scheme redirect
  `pattadar://`) and is the default in `src/auth/cognitoConfig.ts`. The gateway
  authorizes the immutable issuer+subject principal, not a header — see
  `docs/runbooks/identity-migration.md`.
- **@tanstack/react-query** + the shared GraphQL client from `@pattadar/core` — all
  queries, mutations, types, and domain logic live in core, not in this app.
  `src/api/client.ts` is wired to the gateway and sends a refreshed Cognito
  Bearer (`src/auth/accessToken.ts`, single-flight).
- **expo-secure-store** — token storage (Keychain / Keystore). Installed, config
  plugin registered.
- **expo-notifications** — push: verification invites, inactivity reminders.
  TODO(Phase 4): add with the dev-build step (needs FCM/APNs setup first).
- **ML Kit document scanner** (Expo module) — Aadhaar / land-deed capture with edge
  detection and deskew, feeding the existing AI extraction endpoints.
  TODO(Phase 4): native module — requires a dev build (`eas build --profile
  development`), not Expo Go.
- **EAS Build / Submit** for store releases; **EAS Update** for over-the-air JS fixes.

## Scope: companion-first (v1 screens)

- Dashboard / land portfolio
- Document scan + upload
- Documents (view, offline access)
- Members & invitations
- Notifications
- Public `verify/:token` deep link

Web-only for now: heavy tables, exports, SRO / stamp-duty / market-value reference screens,
audit, admin, assistant.

Because logic lives in `@pattadar/core`, graduating a view from web to mobile is UI-only work.

## Current state (v1 screens live — 26/07/2026)

- `src/app/_layout.tsx` — PaperProvider (light/dark from tokens) + React Query.
- `src/app/(tabs)/` — Dashboard (hero value = server estimatedValue + property
  values, stat tiles, recent activity), Holdings (parcels + properties
  normalized, search + kind filter), Family (groups + members, status chips,
  heir share total), Invitations (pending/accepted/revoked/expired state
  machine with Accept/Revoke/Delete).
- `src/app/verify/[token].tsx` — public verify landing (verifyBeneficiary —
  the gateway's only unauthenticated operation; the web page is still a stub).
- `src/app/add-khata.tsx` — new passbook: photograph/pick a passbook image →
  POST /import-passbook (AI extraction, extract-only) prefills the form and
  holds the parcel rows; save = createPassbook + createParcel per row
  (source `passbook:<id>`, web parity). Manual entry works without a photo.
- `src/app/add-parcel.tsx` — manual parcel: extent canonicalized to acres via
  toAcres() with the chosen unit kept as provenance; optional cost-per-acre
  saved as derived total purchasePrice (second mutation). FAB on Holdings +
  buttons on the dashboard empty state are the entry points.
- `src/data/hooks.ts` — live-or-sample hooks (web semantics: fetch failure →
  bundled sample data flagged isSample). Operations come from
  `@pattadar/core/src/api/operations.ts`; valuation math from
  `@pattadar/core/src/portfolio/value.ts`.
- `src/api/client.ts` — shared GraphQL transport from core. Local dev sends a
  dev-only `x-user-id` (start-mobile.sh; `EXPO_PUBLIC_DEV_USER`, only attached
  when `__DEV__`). The seeded local DB's data belongs to users `u01`–`u06` —
  run `EXPO_PUBLIC_DEV_USER=u01 ./scripts/start-mobile.sh ios` to see data.
- `app.json` — bundle ids `com.pattadar.app`, scheme `pattadar`, Android
  App Link intent filter for `https://pattadar.com/verify/*`.
- Shipping now: real hosted-UI sign-in (`src/app/sign-in.tsx`,
  `src/auth/useCognitoAuth.ts`, incl. Google federation) and the
  documents/storage screens (`src/app/documents.tsx`, `src/app/viewer.tsx`,
  `src/api/storage.ts`) on refreshed Bearer auth.
- Not yet: ML Kit scanner (needs an EAS dev build), EAS project id and
  `eas.json`. `expo-notifications` is installed and `src/lib/notify.ts` exists,
  but delivery still needs FCM/APNs credentials.

## Supported-client status (September 2026)

`apps/ios` is the maintained native iOS app, and `apps/web` is the active web
client. This Expo app remains available for Android and compatibility work;
its existing capabilities have not been removed. Android release ownership
and device validation still need an explicit maintained release plan.

GraphQL, extraction uploads and storage all use the same Cognito access-token
refresh implementation. `x-user-id` is restricted to explicit development
builds with no signed-in token; release builds require Bearer authentication.
Local identity uses issuer and immutable subject, never an email local part.
