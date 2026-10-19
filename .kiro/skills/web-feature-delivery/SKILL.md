---
name: web-feature-delivery
description: "Use this skill when implementing or reviewing a Pattadar web feature in apps/web or apps/university: routes, W360 screens, components, themes, responsive states, maps, landing, account and public capability pages, University lessons, or UI copy (button labels, error/empty-state wording). Not for a heuristic UX audit or redline of an existing screen (heuristic-ux-audit) or token, type, icon or accessibility rules alone (design-system-governance)."
compatibility: Requires pattadar-platform apps/web or apps/university, design.md, docs/specs/ feature specs, and retained Playwright suites. Do not target founder/production data.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Web Feature Delivery

Confirm the target first: `apps/web` is the owner web client (`apps/web-next`
was removed on 20/09/2026) and `apps/university` is the separate University app
(see University below). Classify the surface as marketing, signed-in app, or
public content/legal before applying design rules.

Not this skill: Expo screens (`mobile-feature-delivery`). A feature's own unit
test uses bun:test, never Vitest.

## Workflow

1. Read `design.md` and the applicable feature spec in `docs/specs/`. Preserve
   frozen copy, token-only colors, the one face (no `font-family` or weight of
   your own), accessible themes, responsive states, reduced motion, and the
   app-versus-marketing macrostructure. Owner-facing copy follows design.md
   § Naming standard (voice, casing, actions) and § App vocabulary, held by
   `scripts/vocab-tests.ts`; landing strings (§ Copy freeze) change only on
   Reddy's explicit request. Use `design-system-governance` for token,
   typography, component-reuse, accessibility, motion, icon, or cross-client
   design changes.
   Before writing markup, search `apps/web/src/w360/` (`ui.tsx` plus `Dialog`,
   `Drawer`, `Toast`, `skeletons`, `PropertyTable`, `ServiceList`) and
   `apps/web/src/components/` (previous app) for the card, tabs, overlay,
   toast, empty state, readout or key/value row you need. Compose it, or add a
   prop to it; never define a page-local copy. A concern with no shared
   component yet (form fields, tables) moves into `ui.tsx` at its second copy
   (design.md § "One component per concern"). `shared-components-tests.ts`
   counts only `ui.tsx` names, so passing it does not prove reuse.
   Every signed-in screen opens with `PageHead` (design.md § Page head,
   locked by Reddy on 09/10/2026): crumbs on a detail page and no eyebrow on a
   top-level one, commands as `HeadActions` data, and on every top-level rail
   page a `summary` line of the page's own figures under the title, as on
   Properties ("1 property · 5.00 ac") — a placeholder while the first read is
   pending, none when it failed or the account has none yet. A new route or
   rail entry fails `shared-components-tests.ts` (SC-H*) and
   `tests/e2e-app/specs/31-page-head.spec.ts` until it does; never give a
   feature its own header variant.
   Every rows-and-columns view follows design.md § Tables (founder, 10/10/2026)
   from the shared parts in `ui.tsx` § Tables: tick boxes on every data table,
   a total row (`<tfoot>`, `<th scope="row">`) on every table with ticks or
   sums whatever its size, `SelectionBar` with Export, `TablePager` (20
   default), Grid · Table on every collection page, `SectionHead` over a table
   inside a section. Do not exempt a table because it is small, has no bulk
   action or "has only one view" — those are the exemptions the founder had to
   reverse. Ordering has one flow: every "Order a service" links through
   `orderHref` (orderFlow.ts) into `/order`, on the services step when
   the properties are known; never a second order dialog or route (SC-O1).
   Loading follows design.md § Loading: a region's first read is a skeleton of
   its own shape (`SkTable`, `SkGrid`, `SkRows`), never the generic `Loading`
   box (SC-L1); a re-read with new arguments keeps the last answer dimmed
   (`keepPreviousData`) instead of blanking.
2. Trace route → page/component → data hook/core operation → API contract. Put
   reusable domain/format rules in `packages/core`, not UI components.
   Reconstruct the user's task on the screen, not just its styling: name the
   primary action and count how many controls expose it, including empty
   states, rails and headers. A guard pass or a clean token/contrast audit does
   not answer "does this screen offer one action six ways?" That count
   (`design-system-governance`, "Audit the interaction before the paint") is
   mandatory on every screen you build or change. A review of an existing
   screen against Material 3, a redline, or a current-versus-proposed board
   goes to `heuristic-ux-audit`. Implement only the changes the user accepts,
   and leave anything it marks as Reddy's decision until he decides.
3. Decide whether the change also requires `backend-contract-change` or
   `sync-ios`. W360 `Query.web` work is normally NOTE, not automatic Swift.
4. Read [references/test-routing.md](references/test-routing.md), add the narrowest behavior test
   (`bun:test` for units), and keep each suite's safety model intact. Any UI or
   CSS change runs every `scripts/*-tests.ts` guard — `typography-tests.ts`,
   `shared-components-tests.ts` and `vocab-tests.ts` among them — plus
   `scripts/ux-guards.ts` and `scripts/icon-guard.ts`, which CI runs after that
   loop. When the surface creates, reads, updates, deletes, or adds content,
   use `functional-acceptance` to exercise every one of those operations end
   to end — including its failure path — rather than treating a passing
   typecheck, build, or empty state as done.
5. Finish with `verify-change`; use `security-review` for auth, sharing, storage,
   payments, identity, PII, or public routes.

## University (`apps/university`)

A separate React/Vite app for university.pattadar.com, not W360: compose
`apps/university/src/components`, take colours from `@pattadar/tokens`
(`apps/university/tokens.css` only aliases them), and keep the one face.

- Dev server: `bun run --filter @pattadar/university dev` (:5181, strict
  port); without Cognito env it runs as `preview-learner`. `start-local.sh`
  serves it on :5181 too, so if :5181 answers, that is the founder's (Safety).
- Checks: `bun run --filter @pattadar/university typecheck`,
  `bun test apps/university/src` (includes the government-only reference check
  in `src/domain/learning.test.ts`), and `bun run --filter
  @pattadar/university build` (SEO assets and prerender). No browser suite
  covers it; report browser behaviour as NOT_RUN.
- Every push to `main` deploys it to production
  (`.github/workflows/deploy-university.yml`), so a merge publishes; push or
  merge only when Reddy asks.
- `apps/university/scripts/renderRecordVideos.py` needs extra Python packages and downloads
  the Kokoro voice model; install or run it only with Reddy's approval.

## Safety

Never point mutating suites at founder/production data, loosen the sealed
`e2e-app` harness, run unsealed/live tests without explicit request, hand-edit
generated `apps/mobile/ios`/`android`, or casually rewrite frozen product copy.
The `scripts/start-local.sh` stack (api :8080, gateway :8082, University
:5181, web :5173, or :5180 asking as `shankarreddy.t`) is the founder's,
on his real records: never start, stop or rerun it, and get explicit approval
before mutating it by hand or through Playwright MCP or other
browser automation (`functional-acceptance`, "Distinguish a code defect from a missing backend").
Keep the shipped iOS payment link: the app opens `/app/tickets/<id>/pay`
(`apps/ios/Pattadar/Sources/ServicesScreen.swift`) and `apps/web/src/routes.tsx`
redirected `tickets/:id/pay` to the checkout; never remove that
redirect. Drift (11/10/2026): the move to top-level addresses (design.md
§ Addresses and ids: no `/app` prefix, no redirects) removed it, so the iOS
link reaches the not-found page; the checkout is now `/services/:id/pay`.
Do not restore or drop either side on your own — stop and ask Reddy.
