---
name: design-system-governance
description: Use this skill when changing or auditing Pattadar visual tokens, themes, typography (font families, weights, tabular figures), icons, motion, accessibility, responsive behavior, shared components and whether a screen reuses them instead of building its own, or cross-client brand consistency across active web, Expo, and native iOS. When a heuristic UX audit, redline, or current-versus-proposed board of a web screen is needed, use heuristic-ux-audit instead.
compatibility: Requires Pattadar design authorities and client source. design.md governs the web; generic palettes, fonts and component kits never override it, and code that drifts from it is a finding, not an identity to preserve.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-27"
  upstream-inspiration: nextlevelbuilder/ui-ux-pro-max-skill and anthropics/frontend-design
---

# Design System Governance

`design.md` is the web's authority, and it is enforced, not admired. Code that
drifts from it — a second font, a weight the face does not have, a page-local
copy of a shared component — is a finding even when it looks deliberate or
matches a neighbouring screen. External design principles are critique prompts,
never permission to replace the palette, the face, the copy or the component
stack. Changing the authority itself is Reddy's decision, recorded in design.md
§ Design authority.

## Workflow

1. Classify client/surface: web marketing, web app, content/auth/legal, Expo,
   or SwiftUI. Read its authority (`design.md`, component contract, or
   `apps/ios/design.md`).
2. Read `references/quality-gates.md` for cross-client checks. Inspect actual
   theme/token/component use before changing a source of truth.
3. Audit the type. The web has one face (design.md § Typography): count the
   families and weights the source declares and the browser renders. A
   `font-family` other than a root naming `var(--font-sans)`, a second
   `@fontsource` package, a weight other than 400/700, or digits aligned by a
   monospace face instead of `tabular-nums` is a defect. Run
   `bun run scripts/typography-tests.ts` for the source and
   `tests/e2e-app/specs/26-one-font.spec.ts` for what the browser computes.
   iOS, Expo and PDF type are not under the web rule yet
   (`docs/specs/TODO-one-platform.md`); say so instead of judging them by it.
4. Audit the components. Before any markup, search `apps/web/src/w360/ui.tsx`
   (W360) and `apps/web/src/components/` (the previous app) for the concern. A
   page-local copy — its own card, tab strip, field wrapper, empty state,
   key/value row, or a function named like a ui.tsx export — is a defect:
   extend the shared component with a prop instead. A concern with no shared
   component gets one at its second copy, never a third page-local copy. Unit
   words, plurals, dates and money belong in `packages/core`. Run
   `bun run scripts/shared-components-tests.ts`; its budgets only go down.
5. Preserve subject-specific land-record vocabulary/content; avoid generic SaaS
   cards, invented metrics/copy, decorative icons, and visual enrichment on
   functional app pages.
6. Audit the interaction before the paint. Count how many controls expose each
   primary action: one flow, one filing place or one destination belongs on
   the screen once. Repeated or competing entry points (several drop zones or
   buttons opening one drawer, an inline card plus a header button, an
   empty-state grid of identical tiles) are a defect even when every token,
   contrast ratio and role is correct. Repetition must be real structure, such
   as categories or scopes. When a heuristic UX audit, redline or
   current-versus-proposed board of a web screen is needed, use
   `heuristic-ux-audit`; it runs this count as its first pass and hands
   accessibility proof back here.
7. Audit accessibility: semantics/focus, text/non-text contrast, dynamic
   type/zoom, reduced motion, target size, keyboard/gesture alternatives,
   errors, safe areas, and responsive overflow.
8. Check token ownership and cross-client obligations. Web macrostructures do
   not cross to iOS; brand crossings are explicitly limited by iOS design.
9. Produce a drift table or coherent token/component patch; hand feature code to
   the relevant delivery skill and final checks to `verify-change`. A green
   guard proves only its own rule — it never replaces steps 3, 4 and 6.

Do not import UI UX Pro Max datasets/scripts/fonts, Tailwind/shadcn, generic
palettes, or third-party font loads. Copy remains byte-frozen unless explicitly
approved.
