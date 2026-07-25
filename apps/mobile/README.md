# Pattadar Mobile (apps/mobile)

Native companion app for Pattadar. Not yet initialized — this directory is a docs-only
scaffold. TODO(Phase 4): initialize the Expo app here (see "Phase 4 initialization" below).
Deliberately no `package.json` yet — a half-initialized app would break the workspace install.

## Stack

- **Expo** (latest stable SDK) with **expo-router** for file-based navigation.
- **React Native Paper** (Material 3), themed from `@pattadar/tokens` — one Material brand
  language shared with the MUI web app.
- **react-native-auth0** — same Auth0 tenant as the web app, so the same tokens flow through
  the gateway and produce the same `x-user-id`. Zero backend changes for mobile.
- **@tanstack/react-query** + the shared GraphQL client from `@pattadar/core` — all queries,
  mutations, types, and domain logic live in core, not in this app.
- **expo-secure-store** — token storage (Keychain / Keystore).
- **expo-notifications** — push: verification invites, inactivity reminders.
- **ML Kit document scanner** (Expo module) — Aadhaar / land-deed capture with edge detection
  and deskew, feeding the existing AI extraction endpoints.
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

## Phase 4 initialization

TODO(Phase 4):

1. `bunx create-expo-app@latest` overlaid into this directory.
2. Add the dependencies listed above.
3. Copy `app.json.example` to `app.json` and fill in the bundle identifiers.
