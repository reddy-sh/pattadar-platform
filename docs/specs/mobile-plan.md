# Mobile Plan — Pattadar Companion App

**Status:** Approved 25/07/2026 (companion scope per D2; widen per-view later). Built in **Phase 4**, after the MUI web rebuild extracts `packages/core`.

## What it is

A true native app (Expo / React Native — not a webview), sharing everything except markup with web:

- `packages/core` — GraphQL client + generated types, land/duty calculations, validation, DD/MM/YYYY formatting.
- `packages/tokens` — feeds a **React Native Paper (Material 3)** theme: one brand language with MUI web.
- **Auth** — the same Cognito pool via native OAuth (hosted UI + PKCE): same tokens, same `x-user-id`; the backend never knows which head is calling.
- `apps/mobile` stays docs-only until Phase 4 (`bunx create-expo-app@latest` overlay, latest SDK at that time).

## v1 scope (companion)

| Mobile v1 | Web-only for now |
|---|---|
| Portfolio dashboard | Heavy tables + CSV/Excel/PDF exports |
| Document scanning — ML Kit (edge-detect/deskew for Aadhaar & deeds) → upload → AI extraction | SRO / stamp-duty / market-value reference screens |
| Offline document viewing | Audit, admin, super-admin console |
| Members & invitations | Assistant panel |
| Push notifications (invites, inactivity dead-man's-switch) | |
| `pattadar.com/verify/:token` deep link opens the app | |

Views graduate to mobile later as UI-only work — the logic already lives in `core`.

## Delivery pipeline — EAS (Expo Application Services)

EAS does cloud builds, store submission, and **manages all signing credentials** (Apple certs/profiles, Android keystore) — no Xcode signing screens.

### One-time accounts (start early — lead time)

1. **Apple Developer Program** — $99/yr; enrollment can take days.
2. **Google Play Console** — $25 one-time. ⚠️ New *personal* accounts must run a **closed test with 12 testers for 14 continuous days** before production access — schedule it into Phase 4 from day one (~3 weeks to public Android release).
3. Expo account — free tier covers pilot builds (~$19/mo tier if queues bite).
4. Firebase project (FCM for Android push) + APNs key (Apple portal).

### The rhythm

```sh
eas build --profile development   # dev build w/ native modules → hot-reload on device
eas build --profile production    # cloud .ipa + .aab
eas submit -p ios                 # → TestFlight (pilot) → App Store (public)
eas submit -p android             # → Play closed track (pilot + 12-tester clock) → production
eas update                        # OTA JS-only fixes — no store review
```

- **iOS pilot** = TestFlight (up to 10k testers, light review). Native app → no "repackaged website" (4.2) risk.
- **Android pilot** = closed testing track (satisfies the 12-tester requirement while piloting).
- **EAS Update** ships TS/React fixes in minutes; only native/SDK changes need a store build.
- **Deep links**: `/.well-known/apple-app-site-association` + `assetlinks.json` served via CloudFront (behavior reserved in runtime Terraform).

## Pulled earlier (Phase 2, pure lead-time items)

Apple + Play enrollments, Firebase project, APNs key — so nothing administrative blocks Phase 4.
