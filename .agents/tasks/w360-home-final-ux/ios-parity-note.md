# W360 Home final UX: iOS parity note (02/10/2026)

This note is a report only. Nothing under `apps/ios/**` or `apps/mobile/**`
was edited, and no vectors were regenerated.

The range is the working tree, limited to this task's files. The instrument
is `bun run scripts/parity-check.ts --json`, which is read-only (`git diff`,
`ls-files` and `emit-vectors --check`). It was run once in each pass:

- first pass: `.local/impl-scratch/home-final-parity.json`
- review pass: `.local/impl-scratch/home-final-review-parity.json`

Both runs exit 1, on errors that are not this task's (see §4).

## 1. Adapted → Swift

None.

## 2. Noted, not built

| File (this task) | Parity band | Class | Reason |
|---|---|---|---|
| `apps/web/src/w360/pages/Dashboard.tsx` | note | NOTE | W360 screen on `Query.web`, while iOS reads the root schema only (contract § The schema split). The web macrostructure does not cross to iOS: the For you card, the Overview grid with its new `ov-sec` container, and the compact tile. |
| `apps/web/src/w360/homeGaps.ts` (new) | note | NOTE | The Missing details rule runs in the browser over the `Query.web.properties` cards. It is not in `packages/core`, so there is no PattadarKit twin and no vector. |
| `apps/web/src/w360/homeGaps.test.ts` (new) | note | NOTE | Bun unit test for the above. |
| `apps/web/src/w360/w360.css` | note | NOTE | Web CSS using existing tokens only. The review pass added the Overview's container rule, a nowrap figure, `auto-fit` tiles and full-strength kind colours. No contractual token moved. |
| `docs/specs/2026-08-15-web-360-design.md` | note | NOTE | A spec is a decision to read, not a diff to port. |
| `apps/web/README.md` | none | IGNORE | The route table now describes the current Home. |
| `tests/e2e-app/specs/02-dashboard.spec.ts` | ignore | IGNORE | Web browser harness. |

None of the contract's five buckets is touched:

- no `packages/core` module moved, so no twins;
- no vector source changed;
- no `Queries.swift` field is involved;
- the doc-family taxonomy did not change;
- no contractual design token changed.

Capability noted for later: Home's For you now lists the owner's properties
that are missing a pin, a boundary or documents. Only owned properties
count, and a property that a reminder already names is counted but listed
once. The iOS M-series Home has its own "Needs attention" card, and nothing
here asks it to change. The review pass's grid and contrast fixes are web
layout only.

## 3. For Reddy (not needed for this change)

Should the Missing details rule become a shared rule in `packages/core`,
with a PattadarKit twin and vectors, so the phone can say the same thing?
That is a product and architecture call under the parity contract. This task
keeps the rule web-only.

## 4. Checks

- `parity-check` (review pass) exits 1 on two `twins` errors outside this
  task:
  - `packages/core/src/land/landcalc.ts changed; its twin did not`
    (`Boundary.swift`). `landcalc.ts` belongs to the concurrent fence work
    and is on this task's do-not-touch list.
  - `packages/core/src/api/operations.ts changed; its twin did not`
    (`Queries.swift`). The file is modified in the working tree, but not by
    this task.

  The three `tokens` lines are `info` ("derived — native choice, not a
  defect").
- `swift test` was not run. Nothing was adapted, so there is no Swift to
  test.
