---
name: mobile-feature-delivery
description: Use this skill when implementing or reviewing Pattadar Expo/React Native compatibility-client features, Expo Router screens, auth/session storage, maps/location, document/image capture, notifications, offline/cache behavior, deep links, native permissions, Maestro flows, or EAS/store readiness in apps/mobile.
compatibility: Requires apps/mobile and shared packages. Never hand-edit generated apps/mobile/ios or apps/mobile/android, and never run interactive/device/store operations without explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Mobile Feature Delivery

Treat `apps/mobile` as an implemented compatibility client, not docs-only. Keep
shared domain/network rules in `packages/core`; platform behavior stays native.

## Workflow

1. Trace Expo Router route → screen/state/query → shared core/API/gateway
   contract → native module/permission → tests/deep links.
2. Read current source/config before relying on phase-oriented README text.
3. Review auth tokens in SecureStore, refresh/logout races, offline/cache
   semantics, permission denial/recovery, safe areas, dynamic type, reduced
   motion, background/resume behavior, and Android/iOS divergence.
4. Use `design-system-governance` for tokens/accessibility and
   `backend-contract-change` for service changes.
5. Add focused TypeScript tests and the appropriate Maestro YAML flow; document
   any missing EAS/binary/store gate rather than pretending `build` creates one.
6. Use `verify-change` for typecheck/tests. EAS, native generation, signing,
   device install, push credentials, and store rollout are separate approved
   operations.

## Boundaries

Never edit generated native projects, expose secrets in Expo config, reuse web
macrostructures blindly, weaken secure storage, or silently add native
permissions. Provider/store activation composes with `provider-activation` and
release evidence with `release-readiness`.
