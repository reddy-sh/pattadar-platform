# Web heuristics for Pattadar audits

Checked against `design.md` and the sources below on 27/09/2026. Rules are
paraphrased and linked, never copied.

## Precedence and labels

1. `design.md` and the screen's own spec are the standard. Founder direction
   recorded there may override an aesthetic default (§ Design authority).
2. Material 3 guidance applies where design.md is silent.
3. Audit conventions are this skill's own counting rules.

Label every rule on the board with its source: `design.md §…`, `spec §…` (the
screen's own spec under `docs/specs/`), `M3 <topic>`, `WCAG 2.2.2` or `audit`.
Never present a design.md rule, a spec rule or an audit convention as
Material 3.

When M3 and design.md or the screen's spec differ, the project documents win.
If the audit thinks one of their rules itself hurts clarity (uppercase eyebrows,
the approved nav set, a spec's control model), report that as a Reddy decision
with its evidence, not as a finding against the page.
Accessibility, truthful content, privacy, licensing, responsive usability and
performance are outcome requirements (§ Design authority): no proposal may
trade them for looks.

"Google-like" means M3 structure expressed in Bloom. It never means Google's
brand: no four-colour system, product icons or sparkle branding (§ Provenance).

## Page types

| Type | Routes | Owning source | Governing design.md sections | Frozen |
|---|---|---|---|---|
| Marketing | `/`, `/pricing` | `apps/web/src/pages/landing/`, `apps/web/src/pages/pricing/`, `apps/web/src/styles/site.css` | § Macrostructure family (marketing), § Motion, § CTA voice, § Per-page allowances, § What pages MUST share | `landingContent.ts`, `pricingContent.ts` (§ Copy freeze) |
| W360 app | `/app/*` | `apps/web/src/w360/` (primitives in `ui.tsx`, styles in `w360.css`, screens in `pages/`) | § Macrostructure family (app), § App vocabulary, § App-surface rules, § Data provenance, § Theme choice and persistence | vocabulary table (founder decision) |
| Content, legal, auth | `/privacy`, `/terms`, `/login`, `/signup`, `/forgot-password` | `apps/web/src/pages/legal/`, `apps/web/src/pages/auth/` | § Macrostructure family (content/legal), § Per-page allowances (typography only) | as the page's spec says |

Routes live in `apps/web/src/routes.tsx`. `/legacy/*` keeps its older copy
until it is retired, so audit it only on request.

## The twelve passes

Run every pass, even when a page seems to have nothing for it. Each pass says
what to count first, then the rules that judge the count.

### 1. Actions and emphasis

- Count: filled buttons per viewport (1512×950 and 390); every control grouped
  by where it leads (route, drawer, flow); labels that lead to two places, and
  places reached by two labels.
- Rules: M3 buttons rank emphasis: filled for the important, final action,
  outlined for important but not primary, text for the lowest priority.
  design.md § CTA voice gives the amber to the hero and the final statement,
  keeps the nav CTA ghost, and caps accent at 5% of a viewport. design.md
  § App vocabulary shows one flow once, with no empty-state button repeating
  the section-head action. Audit: one filled button per viewport, and one
  label per destination.
- Nielsen coverage: 4, 8.

### 2. Navigation load

- Count: header controls and their destinations; destinations repeated between
  header, hero and footer; what disappears at 390 and whether it is reachable
  another way.
- Rules: design.md § Macrostructure family records the approved landing nav
  (brand, 8 section links, one Pricing route link, one CTA). A count within it
  is compliant, and proposing fewer is a Reddy decision. W360: rail groups and
  titles follow § App vocabulary, and a page title matches its rail label.
  Audit: every destination must stay reachable at every width.
- Nielsen coverage: 6, 7, 8.

### 3. Section heads and type roles

- Count: sections; sections with an eyebrow; eyebrows that repeat the title,
  the nav label or the brand; distinct head styles; leads longer than one
  sentence; italic-accent uses; font families and weights on the page.
- Rules: M3 typography has five roles (display, headline, title, body, label),
  so one level of head uses one role. design.md § Macrostructure family
  sanctions uppercase eyebrows over marketing section heads. § Typography sets
  every role in the one face, Atkinson Hyperlegible, at 400 or 700: a second
  face (mono labels or figures, a serif accent, a display face), a 500/600/800
  weight or digits aligned by a monospace face is a finding. It limits the
  italic accent to its named slots and bans italic full headers.
  § App vocabulary asks for noun-phrase headings and one factual line under a
  title. The `PageHead` contract in `apps/web/src/w360/ui.tsx` says a top-level
  page does not repeat its rail label as an eyebrow, and standing guidance goes
  behind an ⓘ.
- Nielsen coverage: 4, 8.

### 4. Order and repetition

- Count: how many times the same story, list or fact is told on the page, and
  where each telling sits.
- Rules: audit, one telling per fact, placed where it is used. Repetition must
  be real structure such as categories or scopes, not filler
  (`design-system-governance` step 4). design.md § Motion adds that a scene
  swappable for any other product's diagram is not carrying its weight.
- Nielsen coverage: 8.

### 5. Numbering

- Count: numbering systems on the page (1·2·3, 01–06, "Stage N", 0N indexes)
  and, for each, whether its list has a real order.
- Rules: design.md § Macrostructure family allows numerals only where order
  matters. § Notes bans numbered eyebrows beyond copy that contains numerals.
  Audit: one numbering style per page.
- Nielsen coverage: 4.

### 6. Status, empty and loading states

- Count: each status and its treatment (chip, badge, band, sentence, colour
  alone); the words used for one state; empty states and their actions; zeros
  or placeholders that look measured; loading treatments.
- Rules: M3 chips are typed by purpose (assist, filter, input, suggestion), and
  the W360 `StatusChip` in `ui.tsx` is the non-interactive status chip.
  design.md § App-surface rules says fill means act, so counts and
  classifications stay outlined, and progress tracks stay neutral.
  § Data provenance requires shape-correct emptiness and one sentence for a
  failed read (`UNREACHABLE_NOTE`, `apps/web/src/data/useLiveOrSample.ts`). The
  project guard in `scripts/ux-guards.ts` (CL-563) says a missing value must
  read as missing, never as zero. M3 progress indicators show an ongoing
  process, determinate or indeterminate, and carry a name. Audit: a status is a
  chip, never a band or a sentence, and one state has one word.
- Nielsen coverage: 1, 2.

### 7. Motion

- Count: every moving part with its trigger (load, scroll-in, interval, hover),
  its duration, whether it stops, what it explains, and its reduced-motion
  behaviour.
- Rules: design.md § Motion says motion explains hierarchy, continuity or
  system response. Each part plays once and then rests, nothing on the landing
  page loops indefinitely, reduced motion is resolved before mount, and staged
  timelines remove their own delays. WCAG 2.2.2 says motion that starts on its
  own, lasts over five seconds and sits beside other content needs a way to
  pause, stop or hide it. Auto-updating content needs one at any duration, and
  pausing only while hovered or focused does not count as that mechanism.
  § Microinteractions stance allows a −1px hover lift, never scale or glow.
- Flag WCAG risks only. Proof belongs to `design-system-governance`.
- Nielsen coverage: 3, 8.

### 8. Parallel content

- Count: groups of same-level items and how each is shown (stacked sections,
  grid, tabs, chips, rows); grids with uneven spans; one-of-N content shown all
  at once; filters.
- Rules: M3 tabs group related content at one level of hierarchy, one tab type
  per bar. M3 filter chips choose options that filter content. M3 lists are
  continuous vertical indexes. design.md § Macrostructure family asks for even
  card grids with no wide or bento spans, the dashed tba card for roadmap items,
  stages as primary tabs and FAQ as native details rows. § App-surface rules
  makes `FacetFilter` the one filter and gives every Record and Holding tab a
  `data-tab-layout`.
- Nielsen coverage: 6, 8.

### 9. Layout at 1512 and 390

- Count, at each width: horizontal overflow, hidden content and its
  alternative, columns, line measure, bare `fr` tracks, dead space under a
  viewport instrument.
- Rules: M3 window size classes are compact below 600, medium from 600,
  expanded from 840, large from 1200 and extra-large from 1600, so 390 is
  compact and 1512 is large. design.md § App-surface rules requires
  `minmax(0, Nfr)` tracks and the 80rem measure cap, has viewport instruments
  reach the window bottom, and stacks split instruments at 1200px and below.
  The design-system-governance quality gates add 44px targets and no
  horizontal overflow.
- Nielsen coverage: 4, 7.

### 10. Vocabulary, copy and help

- Count: synonyms per concept; title and rail-label mismatches; terms from the
  vocabulary table's "Not" column; "paid" or "charged" while the payment
  provider is a stub; paragraphs where one factual line is the rule; standing
  guidance printed as permanent text.
- Rules: design.md § App vocabulary, § Copy freeze, and § CTA voice (sentence
  case). The `PageHead` contract puts standing guidance behind an ⓘ.
- A change to a frozen string or a vocabulary term is always Reddy's decision.
- Nielsen coverage: 2, 4, 10.

### 11. Feedback and errors

- Count: actions with no visible result; errors that do not say what to do
  next; success toasts; destructive actions without confirmation; disabled
  controls without a reason; controls that look ready but say the app cannot
  do it yet.
- Rules: design.md § Microinteractions stance keeps success silent with no
  celebratory toasts, and focus visible instantly. § Data provenance gives a
  failed read one sentence. M3 dialogs use the alert type for a confirmation
  that needs an answer, such as a delete. M3 text fields swap supporting text
  for error text when validation fails. W360's shared confirmation is
  `ConfirmDialog` (`apps/web/src/w360/pages/PropertyActions.tsx`).
- Nielsen coverage: 1, 3, 5, 9.

### 12. Accessibility flags

- Count: icon-only controls without names; targets under 44px; colour as the
  only state signal; skipped heading levels; focus traps; text inside images;
  motion without reduced-motion handling (from pass 7).
- Rules: the design-system-governance quality gates (4.5:1 body text, 3:1
  non-text UI, visible focus, 44px web targets, colour never the only signal)
  and design.md § Microinteractions stance (2px focus ring, 3px in High
  Contrast). M3 icon buttons carry supplementary actions and need a name.
- Flag only. Proof comes from `design-system-governance`,
  `scripts/a11y-web-tests.ts` and a browser. A schematic never proves
  accessibility.
- Nielsen coverage: 4.

## Nielsen coverage check

After the passes, walk the ten heuristics (credit: Jakob Nielsen, NN/g, linked
below) and confirm each was considered. They are a coverage check, not a score
and not a board label. In the report, write "considered, nothing found" for a
heuristic with no finding.

| Heuristic | Passes |
|---|---|
| 1 Visibility of system status | 6, 11 |
| 2 Match between the system and the real world | 6, 10 |
| 3 User control and freedom | 7, 11 |
| 4 Consistency and standards | 1, 3, 5, 9, 10, 12 |
| 5 Error prevention | 11 |
| 6 Recognition rather than recall | 2, 8 |
| 7 Flexibility and efficiency of use | 2, 9 |
| 8 Aesthetic and minimalist design | 1, 2, 3, 4, 7, 8 |
| 9 Help users recognize, diagnose, and recover from errors | 11 |
| 10 Help and documentation | 10 |

## Evidence rules

- Cite `file:line` for source evidence, or `evidence/<file>.png` plus the
  region for screenshots.
- Make counts reproducible: say what was counted and where each item is.
- Content counts only when a component renders it. A field the layout ignores
  (for example, `FeatureContent.wide` under an even grid) is not on the page.
- Comments are claims, not evidence. A comment that contradicts the code is
  drift, and so is a design.md sentence that contradicts the code.
- Built bundles (`apps/web/dist`, `.local/e2e-web360-dist-*`) are not evidence
  of current source.
- A prior board, audit or chat summary is a baseline, never evidence.
- A screenshot proves appearance only. Keyboard and screen-reader behaviour
  need tests or source semantics.
- List every state and width not seen (loading, error, empty, phone) as not
  verified.

## Proposal rules

- Keep Bloom: palette, the one face (Atkinson Hyperlegible, 400/700), amber
  discipline, hairlines and the two approved landing scenes. The standard panel
  shows M3 structure in Bloom, drawn with the shared components rather than
  new page-local ones.
- Propose the smallest change that meets the rule. Invent no copy, metrics,
  testimonials, logos or features.
- Classify every change:
  - **Stays**: already meets the standard. Say so, so the standard panel is not
    a wish list.
  - **Within authority**: needs no change to frozen copy, the vocabulary or a
    design.md rule (emphasis, a status treatment, generated numerals, whether a
    rotator stops).
  - **Reddy's decision**: adds, removes, rewords or merges frozen copy; changes
    the vocabulary, a design.md rule, a macrostructure, the nav set or a route
    target named in design.md; drops or moves a section; or changes either
    landing scene's grammar. Name the file and the design.md section it would
    amend.
- Do not re-propose what design.md or the code has already adopted. Mark it
  resolved.

## Sources

- `design.md` at the repository root: the authority line and the sections
  named above.
- Material 3: canonical pages at [m3.material.io](https://m3.material.io/)
  render with JavaScript, so read them in a browser. Text mirrors (Apache-2.0)
  from material-components/material-web:
  [buttons](https://github.com/material-components/material-web/blob/main/docs/components/button.md),
  [chips](https://github.com/material-components/material-web/blob/main/docs/components/chip.md),
  [tabs](https://github.com/material-components/material-web/blob/main/docs/components/tabs.md),
  [lists](https://github.com/material-components/material-web/blob/main/docs/components/list.md),
  [dialogs](https://github.com/material-components/material-web/blob/main/docs/components/dialog.md),
  [progress indicators](https://github.com/material-components/material-web/blob/main/docs/components/progress.md),
  [text fields](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md),
  [icon buttons](https://github.com/material-components/material-web/blob/main/docs/components/icon-button.md),
  [typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md).
- Android Developers,
  [Use window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)
  (documentation under Apache-2.0): the M3 width breakpoints.
- Jakob Nielsen,
  [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/),
  NN/g. Used with credit and a link, as the page asks.
- W3C,
  [Understanding SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
  (W3C Document License).
