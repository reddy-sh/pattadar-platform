# Baseline before editing (03/10/2026)

Run from the main tree before any change for this task.

- `cd apps/web && bun run typecheck` → exit 0 (the Combined→Holding rename blocker is not present at this point).
- Every `scripts/*-tests.ts` → exit 0: a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast,
  fence, geo, hooks, lifecycle, palette, plural, provenance, screening, shared-components, typography, url-scheme,
  village, vocab.
- `bun run scripts/icon-guard.ts` → exit 0 (ICON GUARD PASSES).
- `bun run scripts/ux-guards.ts` → exit 0 (UX GUARDS PASS).
