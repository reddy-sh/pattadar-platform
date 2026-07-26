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

## Current state

- `src/app/_layout.tsx` — PaperProvider (light/dark from tokens) + React Query provider.
- `src/app/index.tsx` — placeholder home proving tokens theming + core formatters
  end-to-end. Replace with the real portfolio dashboard.
- `app.json` — bundle ids `com.rfactory.pattadar`, scheme `pattadar`, Android
  App Link intent filter for `https://pattadar.com/verify/*`.
- Not yet: Cognito native client, GraphQL wiring, push, ML Kit, EAS project id,
  local start script (`scripts/start-mobile.sh` — planned).
