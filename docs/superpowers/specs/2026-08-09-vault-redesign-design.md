# Vault redesign — design spec

**Date:** 2026-08-09
**Sources of truth:** the founder's two claude.ai Design documents — *Vault Redesign* (interactive prototype, options 1a–1d) and *Vault Extraction Spec* (implementation direction, §1–§10) — exported in `Vault Document Registry Redesign.zip`. This spec maps them onto the shipping iOS app and records the decisions the mapping forced.
**Designed screens:** https://claude.ai/code/artifact/94f0107a-4ccf-499c-b4ea-79680a6556fa — nine frames: vault list (property grouping), group-by-person + needs-review filter, document page (highlights), expanded review card, all-the-details page, identity masking, reading & filing pipeline, missing-document stub, legacy degradation.

## The contract

Every document resolves to the six-slot spine (`DocSpine` in PattadarKit, already written and tested by the prior session): family, identity, place, parties, quantum, review[]. The vault list, search, grouping, and the top of the document page read the spine and nothing else. Fields never lose their page number; raw survives normalisation; an unfillable slot becomes a review item, never a blank.

Documents filed before deep reading (`reading == ""`) synthesise a spine from their stored columns and degrade quietly: no provenance captions, no page map, no review card — a neutral "Filed before deep reading" row offers the rescan.

## Decisions on top of the founder's docs

1. **Unknown family renders grey "Unsorted", not title-blue.** `documentFamily()` currently defaults to `title`; unknown papers must not pose as deeds. An unsorted family raises a review item.
2. **The banner counts reader-emitted review items only.** Legacy caveats promoted from prose itemise on the document page but never inflate "N things need you" (same rationale as commit 695b605, which took chatty caveats off the list).
3. **Amber is review, only review.** Family colour lives in tiles/chips/page map; amber lives in banner/badges/review cards. Search & tax shares the hue but never the shape.
4. **Search collapses into the nav bar** (`.searchable`, today's idiom) rather than the prototype's always-visible field; head controls scroll away with the list.
5. **Property group key is village + survey** ("Mangalakunta · Sy. 1"), per the spec's holding definition. Rows never repeat their own group header; the suppressed slot returns in other group-by modes.
6. **Paper trail v1 is honest:** rail cards come from the deed's own citations (`prior_document_details`) plus same-holding matches labelled *Supports* (suggestions via `surveyParts`/`nameKey`), not asserted chains. Cited-but-absent papers get the dashed *Missing* stub screen. Backend `links[]` upgrades this later without a design change.
7. **Aadhaar/PAN masking ships with the details page in the same change** — the redesign must not be the moment numbers start appearing. Reveal is explicit, re-masks after 60 s, and emits the existing `reveal_aadhaar` activity label. (DPDP note: this is where the stored-encrypted decision becomes user-visible; raise before launch.)
8. **Delete, share, and the caveat reminder re-home** to the ⋯ menu and the review card; destructive actions leave the scroll flow.
9. **Page map shows runs, not pages** ("Sale deed body · p. 3–9"), renders for single-run files too.
10. **Failure states stay visible:** a failed read keeps its card with the stage it died in and a retry.

## Where it lands

| Piece | Files |
|---|---|
| Family colours (kit names + app mapping) | `PattadarKit/Format/` beside `documentFamily()`; app-side beside `documentTintColor` |
| Vault list: cached spines, row, group-by, chips, banner, spine search | `DocumentsScreen.swift` (list half); `VaultFilter` + `vaultKeyInfo` retire in the same cutover as the detail headline |
| Document page: spine tiles, merged review card, cross-check, holding link, rail | `DocumentDetailScreen` (in `DocumentsScreen.swift`) |
| Details page: sectioned fields + provenance + flags + masking + run map | new screen behind "All the details"; `DocDetailsSection`/`FileContentsSection` move there |
| Pipeline card + check-and-file | over existing `BackgroundRead` states; `ReviewQueue` proposal restyle |
| Missing stub | new lightweight screen fed by citations; reuses evidence-based attach flow |

Reader-side (outside apps/ios): the extraction prompt grows `spine`, `review[]`, `fields[]` (value/raw/page/confidence/flag) and `pages[]` **inside the fields dict it already returns** — the filing path stores that dict verbatim, so richer readings need no iOS wire change. Keep it nested: both response parsers keep only `json["fields"]`.

## Build order (this repo)

1. Commit the prior session's `DocSpine.swift` + tests. Kit hardening: public `ReviewItem` init + stable identity, wire `extentsAgree` into synthesis, unsorted family, fold `indianRupees` into `Display.rupees`, family colour names + tests.
2. Vault list cutover (screens 01–02), then document page (03–04), then details + masking (05–06) — `verify.sh` after each completed change.
3. Pipeline surfaces (07), stub (08). Legacy (09) falls out of the doc-page restructure.
