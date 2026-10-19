# Combined view Overview: heuristic UX audit findings

Board: `.local/ux-audits/2026-10-01-combined-overview/board.png` (text version `board.html`, measurements in `evidence/`).
Skill: `heuristic-ux-audit`. Analysis only; no product code was changed.

```yaml
audit:
  page: Combined view, Overview tab
  route: /app/combined/:id
  owning_files:
    - apps/web/src/w360/pages/CombinedProperty.tsx   # CombinedOverview :221-247, MemberCard :260-297
    - apps/web/src/w360/w360.css                     # main :447-452, .strip :824-832, .row :1038-1039, .stack :1044-1046, .cards :1104
  revision: a593eaf            # no owning file modified in the working tree
  date: 01/10/2026
  evidence: >
    Sealed capture through tests/e2e-app (app 1512x950 + phone 390 projects) against the user's
    Vite server on :5173, with the invented holding from specs/27-combined-map.spec.ts
    ("Katragunta Land": Sy 214/2, Sy 214/3, Sy 88). The temporary spec was deleted after each run
    and the tests/ status hash is unchanged. No founder data, no e2e-web360, no server started.
  widths_rendered: [1512 rail open, 1512 rail collapsed, 1920, 390]
  report_verified: true        # all three reported issues reproduce in the render

root_cause_vertical_gap:
  measured_px: 0               # strip bottom -> cards top, in all 5 Overview captures
  chain:
    - CombinedOverview returns a bare fragment (CombinedProperty.tsx:227-245), so .strip (:228) and .cards (:242) are direct children of <main>.
    - ".w360 main is a flex column with no gap (w360.css:447-452; computed row-gap: normal = 0)."
    - .strip has no margin (w360.css:824-832) and .cards has no margin (w360.css:1104).
    - "Every other strip is spaced by an inline margin on itself or its neighbour: RecordExpenses.tsx:391 (24px, measured), Wallet.tsx:65 (16px, measured), Desk.tsx:311, Tools.tsx:614, skeletons.tsx:329. The Overview has none."
  same_defect_elsewhere: Combined Costs tab, strip -> scope chips = 0px (CombinedLedger.tsx:201, :213; evidence/costs-tab.json)

findings:
  - id: 1
    what: 3 facts told twice above the fold (extent, record count, boundary count)
    evidence: CombinedProperty.tsx:83, 229-230, 44, 46
    class: reddy_decision        # dropping content
    proposal: Drop the strip's Extent cell, or drop the head chip on this tab only. Extends design.md § Property tabs "Tell a fact once" to the combined frame.
  - id: 2
    what: '"Shared costs" sums scope=combined but links to the unfiltered ledger (opens on "Everything")'
    evidence: CombinedProperty.tsx:234-239; CombinedLedger.tsx:132; services/api/src/web360.py:7567-7575
    class: within_authority
    proposal: Change the link at CombinedProperty.tsx:236 to `.../expenses?scope=combined`, mirroring :239's `?scope=record`.
    note: Not in Reddy's report. Changes where the click lands (to the shared-only rows its figure counts).
  - id: 3
    what: 0px between strip and record cards (the reported "stuck together")
    evidence: see root_cause_vertical_gap; evidence/overview-app-seam.png
    class: within_authority
    proposal: Wrap the strip and the cards in `<div className="stack lg">` in CombinedOverview (w360.css:1046, --space-lg = 24px; already used by DeskEnrol.tsx:171, Profile.tsx:184, RecordMoney.tsx:520). Do not add a gap to `main` or a margin to `.strip` globally; both change every W360 page.
  - id: 4
    what: Each card links to its record twice (title link :267-270 and "Open record" :291)
    class: reddy_decision        # dropping content
    proposal: Drop "Open record"; the title is the way in, as Properties cards already do (Properties.tsx:122-125).
  - id: 5
    what: One state with 3 wordings ("Boundary on file" :261, "with boundaries" :224-225, Records "Boundary" :340); no pin is "Not located" here and "Nothing yet" on Records (:341)
    class: reddy_decision        # copy
    proposal: Use "Boundary saved" (design.md:365, App vocabulary) and one word for no pin or boundary across both tabs.
  - id: 6
    what: Card buttons 6px apart (.row.tight raw 0.375rem, w360.css:1039) and 0px under the status line (:286 margin 0, :290 no margin)
    evidence: evidence/overview-app-card.png; the same pair on Combined map is 12px apart (.pf-pick, w360.css:4837)
    class: within_authority
    proposal: On MemberCard's action row only (CombinedProperty.tsx:290), gap var(--space-sm) (12px, the M3 standard button-group default) and margin-top var(--space-md) (16px). Leave the shared .row.tight alone (144 uses).
  - id: 7
    what: The record's map has 2 labels in one frame ("View boundary" :293 vs "Its boundary" CombinedFmb.tsx:278)
    class: reddy_decision        # copy
    proposal: One label across the frame, e.g. the Map tab's "Its boundary".
  - id: 8
    what: Cards fill 3 of 5 auto-fill tracks at 1920 (954/1600px, 60%, 646px empty); 75% at 1512 with the rail collapsed; 66% for 2 records at 1512; 100% for 3 records at 1512
    evidence: w360.css:1104; evidence/overview-1920*.png/json, overview-rail-collapsed.json, overview-two-records.json
    class: reddy_decision        # no existing shared W360 grid fills the row for a variable count
    proposal: A .cards variant with auto-fit (empty tracks collapse; about 523px per card at 1920). The only W360 auto-fit grid is the filter popover .fpop (w360.css:1978).
    rejected_alternative: The shared .grid3 (w360.css:1052, used by RecordMoney.tsx:459) would count as within authority, but it fills only a 3-record row, leaves 2 records at 66%, and squeezes cards to 183-283px at 901-1200px (computed, not rendered).

drift:
  - design.md § App-surface rules (design.md:512-513) says the routed area is capped at 80rem; W360 main has no max-width (w360.css:447-452), so the column is 1600px at 1920.
  - CombinedProperty.tsx:217-219 says an empty cell "offers the way to change it"; "Not valued" has no link (:231-233).

within_authority: [3, 6, 2]     # all in CombinedProperty.tsx, existing tokens and shared .stack; 3 and 6 are the reported spacing issues
reddy_decision: [8, 1, 4, 5, 7]  # 8 is the reported card-width issue

outside_this_board:            # seen in passing, not audited
  - Costs tab has the same 0px strip seam (CombinedLedger.tsx:201-213).
  - Costs tab strip says "On its surveys" (CombinedLedger.tsx:205) for the Overview's "Costs on its records"; API scope chips say "The whole holding" / "One survey" (web360.py:7568-7573), both "Not" words in the vocabulary table.
  - Costs tab empty state repeats the head's filled "Record a cost" (design.md:378, one flow once).
  - The 2 linked strip cells have no resting link cue (the .strip-link .s accent needs a note; these have none).
  - At 390 the 4 cells stack to 347px; the first card starts at 616 of a 664px viewport.
  - The 19rem .cards floor would scroll sideways below a 336px viewport (computed, not rendered).

not_verified: [loading/failed/not-found states, incomplete view, archived or non-owned members, 901-1200px, 1728px, light and High Contrast schemes, Reddy's own screenshot (no file given), keyboard/focus/contrast/one-face (design-system-governance)]
```
