---
name: design-system-governance
description: Use this skill when changing or auditing Pattadar visual tokens, themes, typography, icons, motion, accessibility, responsive behavior, component primitives, or cross-client brand consistency across active web, staged Next, Expo, and native iOS.
compatibility: Requires Pattadar design authorities and client source. Generic palettes/fonts/components never override project-owned Bloom or native platform rules.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
  upstream-inspiration: nextlevelbuilder/ui-ux-pro-max-skill and anthropics/frontend-design
---

# Design System Governance

Pattadar already has a distinctive locked identity. Use external design
principles as critique prompts—not as permission to regenerate palettes, fonts,
layouts, copy, or component stacks.

## Workflow

1. Classify client/surface: web marketing, web app, content/auth/legal, staged
   Next, Expo, or SwiftUI. Read its authority (`design.md`, component contract,
   or `apps/ios/design.md`).
2. Read `references/quality-gates.md` for cross-client checks. Inspect actual
   theme/token/component use before changing a source of truth.
3. Preserve subject-specific land-record vocabulary/content; avoid generic SaaS
   cards, invented metrics/copy, decorative icons, and visual enrichment on
   functional app pages.
4. Audit the interaction before the paint. Count how many times each primary
   action appears on the screen: a control that opens one flow, files to one
   place, or leads to one destination belongs on the screen ONCE. Repeated,
   near-identical, or competing affordances for the same action (several drop
   zones or buttons that open the same drawer, an inline card plus a header
   button, an empty-state grid of identical tiles) are a defect even when every
   token, contrast ratio, and role is correct — they read as a set of choices
   that is not one. Confirm each visible control leads somewhere distinct, and
   that repetition is real structure (categories, scopes) rather than filler.
5. Audit accessibility: semantics/focus, text/non-text contrast, dynamic
   type/zoom, reduced motion, target size, keyboard/gesture alternatives,
   errors, safe areas, and responsive overflow.
6. Check token ownership and cross-client obligations. Web macrostructures do
   not cross to iOS; brand crossings are explicitly limited by iOS design.
7. Produce a drift table or coherent token/component patch; hand feature code to
   the relevant delivery skill and final checks to `verify-change`.

Do not import UI UX Pro Max datasets/scripts/fonts, Tailwind/shadcn, generic
palettes, or third-party font loads. Copy remains byte-frozen unless explicitly
approved.
