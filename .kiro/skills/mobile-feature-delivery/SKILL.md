---
name: mobile-feature-delivery
description: "Use this skill when implementing or reviewing features in the Expo/React Native client in apps/mobile (Android and compatibility client): Expo Router screens, auth/session storage, maps/location, document/image capture, notifications, offline/cache, deep links, native permissions, Maestro flows, or EAS/store readiness. Not for the native SwiftUI app in apps/ios (sync-ios) or Expo token/type/accessibility decisions (design-system-governance)."
compatibility: Requires apps/mobile and shared packages. Never hand-edit generated apps/mobile/ios or apps/mobile/android, and never run interactive/device/store operations without explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Mobile Feature Delivery

Treat `apps/mobile` as an implemented compatibility client, not docs-only. Keep
shared domain/network rules in `packages/core`; platform behavior stays native.
Native iOS is `apps/ios` (SwiftUI), not this client.
Not this skill: apps/ios (apps/ios/design.md governs it; sync-ios ports web changes there); for Expo work use it instead of generic React Native skills.

## Workflow

1. Trace Expo Router route → screen/state/query → shared core/API/gateway
   contract → native module/permission → tests/deep links.
2. Read current source/config before relying on phase-oriented README text.
3. Review auth tokens in SecureStore, refresh/logout races, offline/cache
   semantics, permission denial/recovery, safe areas, dynamic type, reduced
   motion, background/resume behavior, and Android/iOS divergence. Hand-off
   links (maps, share text) carry the coordinate only, never record text such
   as a title, survey number or address (Reddy, 03/10/2026): build them with
   `navigateLink()` from `@pattadar/core`. The open Expo follow-ups
   (`src/app/property/[id].tsx`, `src/app/(tabs)/passbooks.tsx`) are listed in
   `docs/specs/2026-08-22-web-ios-parity-contract.md`.
4. Use `design-system-governance` for tokens/accessibility and
   `backend-contract-change` for service changes. Expo's theme is
   `src/theme/paper.ts`: iOS HIG colour literals and Paper's system face today,
   not built from `@pattadar/tokens` (six screens import its `tokens`
   directly). The web's one-face rule does not reach Expo yet. The move to the
   palette pack, Atkinson and the four schemes (`docs/specs/TODO-one-platform.md`
   § One palette) happens only as Reddy schedules it; propose a font or palette
   change with evidence and wait. Each decision goes in `design.md` § Design
   authority as its step lands, and the TODO item is updated to match.
   Screen-local components go into `src/components/` by the same one-component
   rule. Do not add libraries (Zod, React Hook Form, and so on) that
   `apps/mobile/package.json` lacks; a new or upgraded package composes with
   `dependency-change`.
5. Bun tests go in `apps/mobile/tests/` (CI and nightly `bun test` sweep no
   other `apps/mobile` path) or a `scripts/<name>-tests.ts` guard, on pure
   modules or with `expo-*` mocked (`mock.module`, as in
   `apps/mobile/tests/accessToken.test.ts`). UI or icon changes run every
   `scripts/*-tests.ts` guard plus `icon-guard.ts` and `ux-guards.ts`.
   Maestro flows in `tests/e2e-mobile` need a booted simulator and a real
   signed-in session: run them only with explicit approval, otherwise report
   them NOT_RUN. Document any missing EAS/binary/store gate rather than
   pretending `build` creates one.
6. When the change touches a surface that creates, reads, updates, deletes,
   uploads or adds content (for example `src/components/PhotoSection.tsx` add,
   edit, cover and delete), use `functional-acceptance`: list every operation
   and its failure path, and report legs that need a simulator or live backend
   as NOT_RUN.
7. Use `security-review` for auth/session and SecureStore, identity,
   Aadhaar or deed PII, storage and sharing, and the public `verify/[token]`
   deep link; run `secret-scan` before commit when `app.json`, `EXPO_PUBLIC_*`
   or credentials change. Finish with `verify-change` for typecheck/tests.

## Boundaries

Never start Metro (`expo start`, `expo run:*`, `scripts/start-mobile.sh`), a
simulator/emulator or a device without explicit approval. EAS, native
generation, signing, device install, push credentials, and store rollout are
separate approved operations. Never edit generated native projects, expose
secrets in Expo config, reuse web macrostructures blindly, weaken secure
storage, or silently add native permissions.
Provider/store activation composes with `provider-activation` and release
evidence with `release-readiness`.
