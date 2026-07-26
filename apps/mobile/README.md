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
- **Amazon Cognito** (same user pool as web) via hosted UI + PKCE — same tokens flow
  through the gateway and produce the same `x-user-id`. Zero backend changes for
  mobile. TODO(Phase 4): needs a **native app client** in the Cognito pool
  (custom-scheme redirect `pattadar://`) — an infra change, not yet created.
- **@tanstack/react-query** + the shared GraphQL client from `@pattadar/core` — all
  queries, mutations, types, and domain logic live in core, not in this app.
  TODO(Phase 4): wire the client to the gateway.
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
- `src/data/hooks.ts` — live-or-sample hooks (web semantics: fetch failure →
  bundled sample data flagged isSample). Operations come from
  `@pattadar/core/src/api/operations.ts`; valuation math from
  `@pattadar/core/src/portfolio/value.ts`.
- `src/api/client.ts` — shared GraphQL transport from core. Local dev sends a
  dev-only `x-user-id` (start-mobile.sh; `EXPO_PUBLIC_DEV_USER`, only attached
  when `__DEV__`). The seeded local DB's data belongs to users `u01`–`u06` —
  run `EXPO_PUBLIC_DEV_USER=u01 ./scripts/start-mobile.sh ios` to see data.
- `app.json` — bundle ids `com.rfactory.pattadar`, scheme `pattadar`, Android
  App Link intent filter for `https://pattadar.com/verify/*`.
- Not yet: Cognito native client (blocks real sign-in), documents/storage
  screens (need Cognito Bearer for the gateway), push, ML Kit scanner (needs
  an EAS dev build), EAS project id.
