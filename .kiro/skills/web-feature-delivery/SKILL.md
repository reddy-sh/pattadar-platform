---
name: web-feature-delivery
description: Use this skill when implementing or reviewing an active Pattadar web feature in apps/web—routes, W360 screens, components, hooks, themes, responsive states, maps, public capability pages, account pages, or landing/app UI—and when deciding the correct design source, service contract, and browser test instrument. For a heuristic UX audit or redline of an existing screen, use heuristic-ux-audit.
compatibility: Requires pattadar-platform apps/web, design/specs, and retained Playwright suites. Do not target founder/production data.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-27"
---

# Web Feature Delivery

Confirm the target first: `apps/web` is the web client (`apps/web-next` was
removed on 20/09/2026). Classify the surface as marketing, signed-in app, or
public content/legal before applying design rules.

## Workflow

1. Read `design.md` and the applicable feature/component spec. Preserve frozen
   copy, token-only colors, the one face (no `font-family` or weight of your
   own), accessible themes, responsive states, reduced motion, and the
   app-versus-marketing macrostructure. Use `design-system-governance` for
   token, typography, component-reuse, accessibility, motion, icon, or
   cross-client design changes.
   Before writing markup, look in `apps/web/src/w360/ui.tsx` (or
   `apps/web/src/components/` on a previous-app screen) for the card, tabs,
   field, empty state, readout or key/value row you need. Compose it, or add a
   prop to it; never define a page-local copy (design.md § "One component per
   concern").
2. Trace route → page/component → data hook/core operation → API contract. Put
   reusable domain/format rules in `packages/core`, not UI components.
   Reconstruct the user's task on the screen, not just its styling: name the
   primary action and count how many controls expose it, including empty
   states, rails and headers. A guard pass or a clean token/contrast audit does
   not answer "does this screen offer one action six ways?" That count
   (`design-system-governance` step 4) is mandatory on every screen you build
   or change. A review of an existing screen against Material 3, a redline, or
   a current-versus-proposed board goes to `heuristic-ux-audit`. Implement only
   the changes the user accepts, and leave anything it marks as Reddy's
   decision until he decides.
3. Decide whether the change also requires `backend-contract-change` or
   `sync-ios`. W360 `Query.web` work is normally NOTE, not automatic Swift.
4. Read `references/test-routing.md`, add the narrowest behavior test, and keep
   each suite's safety model intact. Any UI or CSS change runs every
   `scripts/*-tests.ts` guard — `typography-tests.ts` and
   `shared-components-tests.ts` among them. When the surface creates, reads, updates,
   deletes, or adds content, use `functional-acceptance` to exercise every one
   of those operations end to end — including its failure path — rather than
   treating a passing typecheck, build, or empty state as done.
5. Finish with `verify-change`; use `security-review` for auth, sharing, storage,
   payments, identity, PII, or public routes.

## Safety

Never point mutating suites at founder/production data, loosen the sealed
`e2e-app` harness, run unsealed/live tests without explicit request, hand-edit
generated `apps/mobile/ios`/`android`, casually rewrite frozen product copy, or
promote web-next implicitly.
