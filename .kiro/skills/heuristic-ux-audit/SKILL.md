---
name: heuristic-ux-audit
description: Use this skill when asked for a heuristic UX audit, redline, design critique, or current-versus-proposed board of an existing Pattadar web screen (landing, pricing, W360 app pages, content/auth frames) judged against design.md's Material 3 principles, or when asked whether a web screen is Google-like or Material 3-like. From current code and sealed screenshots it returns side-by-side CURRENT versus standard images (a chat-sized compare.png and the full board) ahead of a short summary of what changes. Analysis only and web only for now; implementation, token changes and Expo/iOS screens belong to other skills.
compatibility: Requires pattadar-platform apps/web, design.md and tests/e2e-app (its pinned Playwright 1.62.0 CLI renders boards and sealed captures). Never uses founder or production data, starts or stops servers, installs browsers or packages without approval, or edits product code, tokens, copy or design.md.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-02"
  upstream-inspiration: nngroup ten usability heuristics and material-components/material-web docs
---

# Heuristic UX Audit

A heuristic UX audit checks an existing screen against a published design
standard instead of against user testing. Shown as an annotated before-and-after,
it is a redline. Pattadar's standard is `design.md`, which applies Google
Material 3 principles inside the Bloom identity. Material 3 guidance fills the
gaps design.md leaves; where the two differ, design.md wins.

The deliverable is two side-by-side images, CURRENT on the left and the
standard on the right (default label "Google / Material 3 style"), shown before
any text: `compare.png`, the two screens alone at a size chat can show, and
`board.png`, the full board with numbered findings, drift, what changes, the
rules applied to every section, and the guardrails that need Reddy. A short
summary of what changes follows them. This skill judges and proposes. It never
builds.

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
   screen. Get the current state by `references/evidence-capture.md` (the
   user's screenshot, a temporary sealed capture, or the source alone),
   covering every state its § Interaction states lists. The board says
   which of the three it used.
3. **Inventory before judging.** Count controls and where each one leads,
   text inputs and what each one searches, popover options by what they do
   (narrow, open or navigate), filled buttons per viewport, section heads and
   eyebrows, numbering styles, status labels and their treatments, and moving
   parts and whether they stop. Record file:line for every count.
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
   by `references/board-format.md`, render `compare.png` and `board.png` from
   it with the pinned Playwright CLI, then read both PNGs back and fix what
   they show before presenting them.
8. **Report** as Output says, images first, hand off, then clean up before
   calling the audit done.

## Output

`.local/ux-audits/<yyyy-mm-dd>-<slug>/` holds `compare.png`, `board.png`,
`board.html` (the text version of both) and `evidence/`. `.local/` is
git-ignored. Copy the folder to `docs/ux-audits/<yyyy-mm-dd>-<slug>/` only when
the user asks to keep it.

The reply starts with the images. Never present an audit result without them
shown inline or opened.

1. **Images**, `compare.png` first, then `board.png`. For each:
   - register it with `create_artifact` (kind `image`, `sourcePath` its
     absolute path) and embed it inline as `![<title>](kiro-artifact://<id>)`;
   - print its absolute path on its own line, for clients that show no inline
     images;
   - in a local macOS session, run `open "<absolute path>"` and say it was
     opened.
2. **Summary**: "What changes" bullets keyed to the marker numbers, the
   decisions waiting on Reddy, and what was not verified (states not captured,
   widths not rendered, accessibility not proven).
3. **Findings in full**, with citations and, when a baseline exists, the
   resolved, open and new items, in chat or as a pointer to `board.html`.

A workflow step or sub-agent cannot show images in the user's chat. When one
runs the audit, its final message starts with the absolute paths of
`compare.png` and `board.png`, one per line, and the top-level agent that
presents the result does item 1 itself.

## Handoffs

- Implementing accepted changes: `web-feature-delivery`, with
  `functional-acceptance` for create/read/update/delete surfaces and
  `verify-change` for the checks.
- Accepted changes, once built: the implementer returns sealed BEFORE | AFTER
  captures side by side (`references/evidence-capture.md`), presented as in
  Output.
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
- `open` is a local display action only, used on the audit's rendered PNGs; it
  changes nothing.
- Never read back an image with a side over 2000 px. Check it with
  `sips -g pixelWidth -g pixelHeight`, and read a `sips -Z 2000` copy written
  under `.local/` instead. The model rejects any side over 8000 px and the
  session fails; a 390 full-page capture at 3× is about 8800 px tall.
