---
name: web-feature-delivery
description: Use this skill when implementing or reviewing an active Pattadar web feature in apps/web—routes, W360 screens, components, hooks, themes, responsive states, maps, public capability pages, account pages, or landing/app UI—and when deciding the correct design source, service contract, and browser test instrument.
compatibility: Requires pattadar-platform apps/web, design/specs, and retained Playwright suites. Do not target founder/production data.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Web Feature Delivery

Confirm the target first: `apps/web` is active; `apps/web-next` is staged and is
not production parity. Classify the surface as marketing, signed-in app, or
public content/legal before applying design rules.

## Workflow

1. Read `design.md` and the applicable feature/component spec. Preserve frozen
   copy, token-only colors, accessible themes, responsive states, reduced
   motion, and the app-versus-marketing macrostructure. Use
   `design-system-governance` for token, accessibility, motion, icon, or
   cross-client design changes.
2. Trace route → page/component → data hook/core operation → API contract. Put
   reusable domain/format rules in `packages/core`, not UI components.
3. Decide whether the change also requires `backend-contract-change` or
   `sync-ios`. W360 `Query.web` work is normally NOTE, not automatic Swift.
4. Read `references/test-routing.md`, add the narrowest behavior test, and keep
   each suite's safety model intact.
5. Finish with `verify-change`; use `security-review` for auth, sharing, storage,
   payments, identity, PII, or public routes.

## Safety

Never point mutating suites at founder/production data, loosen the sealed
`e2e-app` harness, run unsealed/live tests without explicit request, hand-edit
generated `apps/mobile/ios`/`android`, casually rewrite frozen product copy, or
promote web-next implicitly.
