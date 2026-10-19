# red-runs

(placeholder — filled in later tasks)

## Before running heuristic-ux-audit output case 3 (Cadastral maps, 8c6a2d4)

Clauses 1 (interaction states captured) and 6 (the map's position measured in
each state) grade a render, and a sealed capture renders whatever the dev
server serves. On 02/10/2026 the server on :5173 runs from this checkout's
`apps/web`: 8c6a2d4 plus uncommitted edits that change only the page head and
unrelated rules (skill-review.md). Once Task 6, or any later Cadastral maps
change, lands in this checkout, that server no longer renders 8c6a2d4's screen.

- A run that is to pass clauses 1 and 6 as captured and measured needs a
  server serving 8c6a2d4's `apps/web`, passed to the capture as
  `APP_WEB_URL`. Whoever runs the eval starts it, with the user's approval;
  the skill never starts a server.
- Without one, the agent falls back to source only. Clause 1 still holds as
  written when every state is listed by name as not verified. Clause 6 can
  then be judged only from source at 8c6a2d4: record it here as "source
  only, not measured", never as measured.

## Tasks 5–7 — new tests on current code, before any product edit (03/10/2026)

Product files (`VillageMaps.tsx`, `w360.css`) untouched by this step at the
time of the run; only `17-villages.spec.ts` had the new tests added.

Command (from `tests/e2e-app`, server on :5173 answered 200 first):

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/17-villages.spec.ts \
  --project=app --project=phone --reporter=line \
  -g 'focus ring around the whole field|keeps one 3px ring|own search shows where focus is|narrows by district and mandal|does not move the map|choosing a matching village|Escape closes the matches|a click away from the search|tabbing out of the village search|take turns rather than covering' \
  --output=.local/impl-scratch/cadastral-search-pw-red
```

Result: 12 failed, 0 passed (10 tests; the two `@phone` ones in both projects).

| Task | Test | Project | Failing assertion |
|---|---|---|---|
| 5 | the village search draws its focus ring around the whole field, not inside it | app | `ring(.vm-village-search)` received `{ style: 'none', width: '3px' }`, expected `solid`/`2px` (spec line 976) |
| 5 | in High Contrast the village search keeps one 3px ring, on the field | app | pill received `style: 'none'`, expected `solid` 3px (line 997) |
| 5 | the Filter's own search shows where focus is | app | `ring(.fpop-head)` received `{ style: 'none', width: '3px' }`, expected `solid`/`2px` (line 1016) |
| 6 | the Filter narrows by district and mandal, and finding a village by name is the header search's job | app | `.fgrp > .eyebrow` received `District, Mandal, Village`, expected `District, Mandal` (line 680) |
| 7 | typing a village name does not move the map @phone | app, phone | "the matches pushed the map down": expected ≤ 1, received 77 (line 2443) |
| 7 | choosing a matching village closes the matches and clears the search | app | `.vm-villages` count expected 0, received 1 (line 872) |
| 7 | Escape closes the matches and keeps what I typed | app | rows count expected 0, received 1 (line 891) |
| 7 | a click away from the search closes its matches | app | rows count expected 0, received 1 (line 920) |
| 7 (added) | tabbing out of the village search closes its matches, as a click away does | app | rows count expected 0, received 1 (line 935) |
| 7 (added) | the Filter and the village matches take turns rather than covering each other @phone | app, phone | Filter popover count expected 0, received 1 (line 953) |

Chromium reports `outline-width: 3px` (the initial `medium`) for an element
whose outline style is `none`, so the tests assert the style of the inner
inputs, never a zero width.

Same day, the full `17-villages` run with only the new tests added (before
any product edit): 13 failed, 102 passed. The 13 are the 12 above plus the
known baseline failure at `:607` (was `:570`), "the village list follows the
mandal I pick", on its stale "Search districts or mandals" label.

## Task 7 follow-up — a refusal that lands after the matches close (03/10/2026)

Found reviewing my own Task 7 change: the refusal line had moved inside the
matches, so a refusal arriving after Escape was not on screen. Test added
inside `test.describe('when the server refuses')`, then run with my own
in-flow fallback line taken out (`{false && rmErr && !findShown && …}`), then
put back.

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/17-villages.spec.ts \
  --project=app --project=phone --reporter=line -g 'refused after I put the matches away' \
  --output=.local/impl-scratch/cadastral-search-pw-red2
```

| Test | Project | Failing assertion |
|---|---|---|
| a removal refused after I put the matches away is still said | app | `.vm-map-filters` toContainText "that village map is in use": received "+ Filter1 village" (spec line 2352) |

With the line restored, the full `17-villages` run passed 116 of 116.

## Iteration 2 — review findings 1, 5, 6 and 8, before any product edit (03/10/2026)

Product files (`VillageMaps.tsx`, `w360.css`) byte-identical to the
iteration-2 start snapshot (`.local/impl-scratch/cadastral-search-iter2-start/`)
at the time of the run; only `17-villages.spec.ts` had changed (new tests,
`@phone` on the three ring tests, class-locator helpers).

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/17-villages.spec.ts \
  --project=app --project=phone --reporter=line \
  -g "Enter on a matching village|next Escape is the page|after I remove a village from the matches|keeps one 3px ring, inside its row|top bar.s search draws its ring|shows all of its focus ring|3px ring is all there too|tapping a matching village|focus ring around the whole field|keeps one 3px ring, on the field|own search shows where focus is" \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/cadastral-search-pw-iter2-red
```

Result: 7 failed, 13 passed (`cadastral-search-pw-iter2-red.log`).

Red, each on its own product assertion:

| Finding | Test | Project | Failing assertion |
|---|---|---|---|
| 1 | tapping a matching village opens it and leaves the keyboard down @phone-only | phone | `search` expected not focused, received focused (line 2644) |
| 5 | after I remove a village from the matches, Escape still puts the rest of them away @phone | app, phone | `matches` count expected 0, received 1 (line 1002) |
| 6 | a matching village shows all of its focus ring, not one cut off at the list's edge @phone | app, phone | "the row's ring runs past the edge of the list": `ringWhole(row)` false (line 1155) |
| 6 | in High Contrast a matching village's 3px ring is all there too @phone | app, phone | the same, line 1171 |

Green before the change, as intended: these guard behaviour that is already
right, or cover what iteration 1 shipped untested (finding 8). None of them
is evidence for a product change.

| Test | Projects | Why it passes now |
|---|---|---|
| Enter on a matching village opens it and puts me back in the search @phone | app, phone | keyboard choice already refocuses; guards it through the finding-1 fix |
| once the matches are away, the next Escape is the page's again and puts the plot away | app | the box's Escape already stops only while the matches show |
| in High Contrast the Filter's own search keeps one 3px ring, inside its row @phone | app, phone | iteration 1's HC `.fpop-head` rule |
| the top bar's search draws its ring around the whole field as well @phone | app, phone | iteration 1's `.search:has(…)` rule |
| the three iteration-1 ring tests, now `@phone` | phone | the same rules hold in WebKit |

## Iteration 2, Reddy's approved finding 4: the Filter's empty line (03/10/2026)

Run before any edit to `ui.tsx` or `VillageMaps.tsx`. The only change was the
new test in `17-villages.spec.ts`, with `ground()`'s empty `catalog.json`.
`ui.tsx` at that moment carried another session's uncommitted hunks (its type
import block and `TabStrip`/`TabPanel`), none of them in `FacetFilter`.

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/17-villages.spec.ts \
  --project=app --project=phone --reporter=line -g "says nothing matched only once I have typed" \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/cadastral-search-pw-ff-red
```

Result: 1 failed (`app`; the test has no `@phone` tag, so the phone project
does not run it). Log: `cadastral-search-pw-ff-red.log`.

| Test | Project | Failing assertion |
|---|---|---|
| the Filter says nothing matched only once I have typed something for it to match | app | `getByText('No filter options match that search.')` inside the "Narrow villages by area" group: expected count 0, received 1 (line 744), with nothing typed |

The same test failed the same way in the full baseline run before it
(`cadastral-search-pw-ff-before.log`, its one `17-villages` failure).

Finding 2, the page closing the Filter through a `FacetFilter` handle instead
of a DOM click, keeps today's behaviour, so it has no red run. The existing
take-turns test, "the Filter and the village matches take turns rather than
covering each other @phone", guards it in both engines, and it passed in the
baseline run.
