---
name: heuristic-ux-audit
description: Use this skill when asked for a heuristic UX audit, redline, design critique, or current-versus-proposed board of an existing Pattadar web screen (landing, pricing, W360 app pages, content/auth frames) judged against design.md's Material 3 principles, or when asked whether a web screen is Google-like or Material 3-like. It produces a side-by-side CURRENT versus standard board from current code and sealed screenshots. Analysis only and web only for now; implementation, token changes and Expo/iOS screens belong to other skills.
compatibility: Requires pattadar-platform apps/web, design.md and tests/e2e-app (its pinned Playwright 1.62.0 CLI renders boards and sealed captures). Never uses founder or production data, starts or stops servers, installs browsers or packages without approval, or edits product code, tokens, copy or design.md.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-27"
  upstream-inspiration: nngroup ten usability heuristics and material-components/material-web docs
---

# Heuristic UX Audit

A heuristic UX audit checks an existing screen against a published design
standard instead of against user testing. Shown as an annotated before-and-after,
it is a redline. Pattadar's standard is `design.md`, which applies Google
Material 3 principles inside the Bloom identity. Material 3 guidance fills the
gaps design.md leaves; where the two differ, design.md wins.

The deliverable is one side-by-side board: CURRENT on the left, the standard on
the right (default label "Google / Material 3 style"), with numbered findings,
drift, what changes, the rules applied to every section, and the guardrails that
need Reddy. This skill judges and proposes. It never builds.

## Scope

- Web only: `apps/web` marketing (`/`, `/pricing`), the W360 app (`/app/*`),
  and content, legal and auth frames. `/legacy/*` keeps its own copy until it
  is retired.
- Expo and native iOS are not covered yet. Say so and route to
  `design-system-governance`; never judge a phone screen by web macrostructure.
- `apps/web-next` is staged, not production. Audit it only when asked and hand
  parity questions to `web-next-cutover`.

## Workflow

1. **Scope.** Read `references/web-heuristics.md`. From its page-type table,
   name the page type, route, owning files, frozen-copy files and governing
   design.md sections, plus the widths (1512 desktop and 390 phone by default,
   the sealed harness's two projects).
2. **Evidence.** Read the owning source, `design.md` and any spec for the
   screen. Get the current state by `references/evidence-capture.md`: the
   user's screenshot, a temporary sealed capture, or the source alone. The
   board states which one it used.
3. **Inventory before judging.** Count controls and where each one leads,
   filled buttons per viewport, section heads and eyebrows, numbering styles,
   status labels and their treatments, and moving parts and whether they stop.
   Record file:line for every count.
4. **Judge.** Run all twelve passes in `references/web-heuristics.md`. A
   finding is one countable observation, the rule it breaks with that rule's
   source label, and its evidence. Nielsen's ten heuristics are a coverage
   check, not a score. A contradiction between design.md, a spec or a code
   comment and the code is drift, reported separately from findings.
5. **Compare with any prior board.** A prior board is a baseline, never
   evidence. Re-derive each of its items and mark it resolved, open or
   superseded, add new findings, and check its proposal against today's
   design.md as well.
6. **Propose.** For each finding, give the smallest change that meets the rule
   in Bloom, classified as stays, within current authority, or Reddy's
   decision. Frozen copy, the app vocabulary, a design.md rule or
   macrostructure, and dropping or merging content are always Reddy's decision.
   Invent no copy, metrics or features.
7. **Board.** Copy `assets/board-template.html` into the audit folder, fill it
   by `references/board-format.md`, render the PNG with the pinned Playwright
   CLI, then read the PNG back and fix what it shows before presenting it.
8. **Report and hand off**, then clean up before calling the audit done.

## Output

- `.local/ux-audits/<yyyy-mm-dd>-<slug>/` holding `board.png`, `board.html`
  (the text version of the image) and `evidence/`. `.local/` is git-ignored.
  Copy the folder to `docs/ux-audits/<yyyy-mm-dd>-<slug>/` only when the user
  asks to keep it.
- In chat: the board image, the findings as text with citations, the
  resolved/open/new comparison when a baseline exists, the decisions waiting on
  Reddy, and what was not verified (states not captured, widths not rendered,
  accessibility not proven).

## Handoffs

- Implementing accepted changes: `web-feature-delivery`, with
  `functional-acceptance` for create/read/update/delete surfaces and
  `verify-change` for the checks.
- Contrast, focus, target size, reduced motion and token proof:
  `design-system-governance`. This skill flags them; it does not certify them.
- Documentation drift: `runbook-consistency`.
- Frozen copy, app vocabulary, design.md rules and macrostructure: present the
  evidence, options and tradeoffs for Reddy. Never decide them.

## Safety

- Analysis only. No edits to product code, tokens, frozen copy, `design.md`,
  tests or fixtures. A temporary capture spec is deleted as soon as it has run.
- Sealed evidence only. Never the `live` project, `allowEscapes`, the founder's
  records, `e2e-web360` (it writes to a database), or a browser attached to a
  signed-in session. Never start or stop the dev server.
- A user's screenshot may show real records. Keep it out of tracked paths and
  never transcribe owner names, survey numbers or amounts from it into a board;
  draw the schematic from fixture records instead.
- No new dependencies, no third-party loads in a board, and no browser download
  without the user's approval.
