# Board format

One board per audit: two panels side by side, drawn from
`assets/board-template.html`.

## Files

```text
.local/ux-audits/<yyyy-mm-dd>-<slug>/
  board.html   the filled template, and the text version of the image
  board.png    rendered from board.html
  evidence/    sealed captures or copied user screenshots
```

- The slug is the page in lowercase with hyphens: `landing`, `pricing`,
  `w360-money-tab`.
- The folder sits three levels below the repository root, which is what the
  template's `../../../apps/web/src/styles/tokens.css` link needs. The same is
  true of `docs/ux-audits/<yyyy-mm-dd>-<slug>/`, used only when the user asks
  to keep an audit.

## Layout

- Left panel "Current". Right panel "Google / Material 3 style" unless the
  user named the standard differently.
- Each panel is a schematic screen followed by its notes.
- Left notes: "What is not Google-like" (the numbered findings), then drift
  lines.
- Right notes, in this order: What changes, Already meets the standard, Same
  rules on every section, Guardrails.
- Footer: page and route, widths, evidence, revision, date (DD/MM/YYYY) and
  the standard, then a "Not verified" line. The revision is the short SHA of
  `HEAD`, followed by "+ working tree" when `git status --short` lists any
  owning file of the page.

## Looks

- `bloom-dark` for marketing, content, legal and auth pages.
- `wire-light` for `/app/*`. W360 ships Light, Dark and High Contrast, so its
  schematic stays neutral and shows structure, not a scheme.
- Both panels use the same look. The look supplies every colour: add no
  colours, gradients or shadows to a schematic.

## Schematic rules

- Draw what renders, in render order, at 1512 wide. A phone finding may add a
  narrow second screen (`style="max-width: 320px"`) under the first, in both
  panels.
- One block per section. Nest only where the page nests.
- Headings, buttons, chips and nav labels are verbatim from source. Everything
  else is a structural note in `.s-note` ("5 timeline rows", "8 cards, even
  grid"). Never invent or paraphrase copy.
- Use fixture records or generic labels, never real data.
- Use `is-filled` only where the page has a filled button, and so on for every
  emphasis primitive.
- The right panel has the same fidelity. Draw the whole proposal, keep
  unchanged blocks identical to the left, and put `data-reddy` on every block
  that depends on a Reddy decision, so the picture never implies approval.

## Primitives

| Class | Draws |
|---|---|
| `.s-nav` `.s-brand` `.s-links` `.s-actions` | a header; `<b>.</b>` in the brand is the amber dot |
| `.s-btn` + `.is-filled` / `.is-outlined` / `.is-text` | the three M3 emphasis levels |
| `.s-hero` + `.s-media` | a copy column and a named scene or media block |
| `.s-eyebrow` `.s-h1` (`<em>` accent line) `.s-h2` `.s-lead` | type roles |
| `.s-row` `.s-note` | a head with a right-aligned structural note |
| `.s-cta` `.s-chips` `.s-chip` (`.is-selected`) `.s-badge` | action rows, assist or filter chips, a status pill |
| `.s-grid` (`style="--cols: N"`) `.s-card` (`.is-wide`, `.is-tba`) | card grids, wide spans, dashed roadmap cards |
| `.s-tabs` `.s-tab` (`.is-active`) | primary tabs |
| `.s-steps` `.s-step` with `<i>N</i>` | numbered steps |
| `.s-list` `.s-band` `.s-stat` `.s-lines` | rows, a band, a figure, placeholder text lines |
| `.s-shell` `.s-rail` | the W360 rail and main column |

W360 shell, for `wire-light` boards:

```html
<div class="s-section s-shell" data-marker="1">
  <div class="s-rail"><p class="s-eyebrow">Your portfolio</p><span class="is-active">Properties</span><span>Documents</span></div>
  <div>
    <div class="s-row"><p class="s-h2">{{Page title}}</p><span class="s-actions"><span class="s-btn is-filled">{{Primary}}</span></span></div>
    <div class="s-tabs"><span class="s-tab is-active">{{Tab}}</span><span class="s-tab">{{Tab}}</span></div>
  </div>
</div>
```

## Markers

- `data-marker="N"` on a full-width block puts N in the gutter. For a part
  inside a block, put `<span class="pin">N</span>` beside it.
- Number from 1, top to bottom in render order.
- Every marker has exactly one finding with its number, and every finding has
  a marker. A page-wide finding (motion, vocabulary) marks the first block
  where it shows.
- The right panel has no markers. Its changes cite finding numbers in `.refs`.

## Writing limits

- Findings: at most 10. Each is one sentence stating a count and what was
  counted, followed by an `.ev` line with the source label and the citation.
  No adjective without a number. Anything beyond 10 goes in the chat report.
- Drift: one `.drift` line per contradiction, giving the claim and where it
  is, then what the code does and where.
- What changes: one line each, with `.refs` first, then the change, then one
  tag, `within authority` or `Reddy's decision`.
- Already meets the standard: a short list, including items a prior baseline
  raised that are now resolved.
- Same rules on every section: at most 6, each checkable on any section.
- Guardrails: exactly three lines, in this order: identity kept; needs Reddy,
  naming the file or design.md section each item would amend; possible within
  current authority.
- Source labels exactly as the checklist defines them: `design.md §…`,
  `spec §…`, `M3 <topic>`, `WCAG 2.2.2`, `audit`.
- Sentence case, plain words, dates as DD/MM/YYYY.

## Render

Before rendering, `grep -n '{{' board.html` must print nothing. Then, from the
repository root with absolute paths:

```sh
tests/e2e-app/node_modules/.bin/playwright screenshot --full-page --viewport-size=2040,1200 \
  "file://<repo>/.local/ux-audits/<slug>/board.html" \
  "<repo>/.local/ux-audits/<slug>/board.png"
```

This uses Playwright's cached Chromium. If it reports a missing browser, stop
and ask before `playwright install`, because that is a download.

## Read back

Open `board.png` with the image reader. Fix and re-render until all of these
hold:

1. The look rendered: warm near-black screens with amber filled buttons for
   `bloom-dark`, neutral grey and ink for `wire-light`.
2. Markers 1 to N are all visible in the gutter and match the findings list.
3. No text is clipped or overlapping, and no `{{` placeholder remains.
4. Both panels have the same fidelity, and every block that needs a decision
   carries its "needs Reddy" tag.
5. The footer's evidence label says what was actually used.

The schematics are `aria-hidden`, so the notes in `board.html` must stand
alone: every finding, drift line, change and guardrail reads without the
picture.
