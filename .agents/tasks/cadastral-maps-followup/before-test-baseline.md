# Before-test baseline (step 1, 03/10/2026)

Main checkout at HEAD `c685d22` plus every session's uncommitted working tree, before any edit
from this run. Dev server `http://localhost:5173/app` answered 200 before each run.

Run 1 (all seven specs, both projects), from `tests/e2e-app`:
`APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test 03-properties 05-record-papers 06-record-features 11c-documents-files 17-villages 01-shell 24-responsive --project=app --project=phone --reporter=line --output=…/.local/impl-scratch/cadastral-followup-pw-baseline`
→ 760 tests: 529 passed, 231 failed (7.4m).

Run 2 (re-run to separate flips from stable failures; app only, the four specs this run edits or
whose "+ Filter" it touches): `… playwright test 03-properties 05-record-papers 06-record-features 17-villages --project=app …--output=…/cadastral-followup-pw-baseline2`
→ 394 tests: 346 passed, 48 failed (3.3m). The 48 are exactly the run-1 failures of 03/05/06; every
17-villages test passed.

## Per spec and project (run 1)

| Project | Spec | Tests | Failed | Attribution |
|---|---|---|---|---|
| app | 01-shell | 113 | 69 | 66 console guard only, 3 assertions; harness noise / other sessions |
| app | 03-properties | 117 | 27 | stable in run 2; pre-existing, not ours (e.g. "My stake" facet group not found) |
| app | 05-record-papers | 62 | 18 | stable in run 2; pre-existing, not ours |
| app | 06-record-features | 95 | 3 | stable in run 2; pre-existing, not ours |
| app | 11c-documents-files | 29 | 0 | |
| app | 17-villages | 120 | 19 | 14 Vite error overlay, 4 console guard (HTTP 500), 1 assertion (:2628, under the overlay window); all 120 pass in run 2 → transient |
| app | 24-responsive | 100 | 44 | 35 console guard only, 9 assertions; harness noise |
| phone | 01-shell | 6 | 6 | console guard only |
| phone | 03-properties | 0 | 0 | |
| phone | 05-record-papers | 1 | 0 | |
| phone | 06-record-features | 2 | 0 | |
| phone | 11c-documents-files | 1 | 0 | |
| phone | 17-villages | 14 | 0 | |
| phone | 24-responsive | 100 | 45 | 35 console guard only, 10 assertions; harness noise |

Notes:
- "Vite error overlay": `<vite-error-overlay>` intercepted pointer events during part of run 1, i.e.
  another session's mid-edit briefly broke the dev build. Not ours (nothing edited yet).
- "Console guard only": the test's own steps passed and `fixtures/harness.ts:161` failed on logged
  `Failed to load resource` errors (HTTP 400/500/503). The brief's harness noise; not ours.
- Every test not listed below passed in run 1. Compare later runs test by test against this table;
  a 03/05/06 failure listed here as "fail again" is pre-existing.

## Every failing test (run 1), with run-2 result

| Project | Test | Title | Run-1 cause | Run 2 |
|---|---|---|---|---|
| app | 01-shell.spec.ts:199:7 | the rail › Help & resources sits at the foot of the rail, with the University opening in a new tab | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:210:7 | the rail › the bell opens the Notifications inbox, not a signpost | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:228:7 | the rail › the operator’s desk sits at the foot of the rail, under the sections that are mine | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:290:7 | the rail › the number beside Services is the number of jobs Services lists | assertion: Error: the seeded world has open jobs to count | not re-run |
| app | 01-shell.spec.ts:306:7 | the rail › the number beside Notifications is the reminders the Dashboard is showing | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:386:7 | the rail › with nothing ordered and nothing waiting the rail wears no badges at all | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:355:7 | the rail › dismissing a reminder takes the number beside Notifications down with it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:413:7 | the rail › collapsing the rail leaves every section reachable by name | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:458:7 | the rail › a window I drag narrow hands the rail to the hamburger and gets it out of the way | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:120:7 | the rail › the rail lights up the section I am actually looking at | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:429:7 | the rail › a collapsed rail is still collapsed when I come back to the app | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:439:7 | the rail › walking from screen to screen does not re-ask the server for the frame | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:489:7 | the jump box › the jump box finds a record, a paper and a person in the same breath | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:477:7 | the rail › a collapsed rail still takes me where I ask | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:519:7 | the jump box › picking a paper out of the jump box opens the paper, not the record it belongs to | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:566:7 | the jump box › one letter is not a search, and nothing is asked of the server for it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:574:7 | the jump box › ⌘K puts the caret in the jump box from anywhere on the page | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:166:7 | the rail › every section that has been redrawn opens from the rail | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:543:7 | the jump box › a jump that could not run says so, and never claims my parcel is missing | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:557:7 | the jump box › while the answer is still coming the box says it is searching, not that there is nothing | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:581:7 | the jump box › Ctrl-K does the same, for the half of the country not on a Mac | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:588:7 | the jump box › the arrow keys walk the hits and Enter takes the one I am on | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:615:7 | the jump box › ArrowDown on the last hit stays on the last hit | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:673:7 | the jump box › Enter on an empty jump box leaves me exactly where I was | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:645:7 | the jump box › changing my mind mid-word puts the highlight back on the first hit | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:632:7 | the jump box › the hit my pointer is resting on is the one Enter takes | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:695:7 | the jump box › Escape closes the results and leaves what I typed alone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:685:7 | the jump box › a box with nothing but spaces in it is not a search | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:706:7 | the jump box › clicking away from the jump box puts the results away | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:720:7 | the jump box › coming back to the box with the words still in it opens the results again | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:731:7 | the jump box › going somewhere empties the jump box behind me | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:739:7 | the jump box › Enter on a search with no hits hands the words to Properties rather than doing nothing | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:526:7 | the jump box › picking a person out of the jump box lands on the people of their record | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| app | 01-shell.spec.ts:803:7 | the top bar › the wordmark takes me home from anywhere | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:869:9 | the top bar › the account menu › the way out of the app is on it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:901:9 | the top bar › the account menu › both account screens are one click away, and land where they say | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:973:9 | the top bar › on a machine with no ⌘ key › and Ctrl-K works there whatever the hint says | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:875:9 | the top bar › the account menu › signing out leaves the app for the front door | noise: console guard only (HTTP 400,501) | not re-run |
| app | 01-shell.spec.ts:1217:7 | the assistant › the assistant button opens the drawer and the assistant introduces itself | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1261:7 | the assistant › the send button will not fire on an empty question | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1231:7 | the assistant › the assistant drawer closes and gives the screen back | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1242:7 | the assistant › opening the assistant asks the assistant service for nothing until I say something | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1249:7 | the assistant › Escape puts the assistant away without touching the screen behind it | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1405:7 | toasts › a write the server refuses says so, in the owner’s words and with the reason | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1317:9 | the assistant › when the assistant service is answering › an answer cut off halfway keeps what arrived and says the line dropped | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1295:9 | the assistant › when the assistant service is answering › the assistant answers, and my question is still there above the answer | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1444:7 | toasts › two refusals stack up rather than one covering the other | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1433:7 | toasts › a toast can be put away | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1456:7 | toasts › putting one failure away leaves the other one standing | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1471:7 | toasts › a column of failures stops at four rather than burying the screen behind it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1418:7 | toasts › a failure sits there until I put it away | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1338:9 | the assistant › when the assistant service is answering › a second question goes into the same conversation rather than starting a new one | noise: console guard only (HTTP 400,503) | not re-run |
| app | 01-shell.spec.ts:1500:7 | toasts › Escape clears a column of failures in one go | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1371:9 | the assistant › when the assistant service is not running › the assistant says plainly that it could not be reached, and that my records are safe | assertion: TimeoutError: locator.fill: Timeout 10000ms exceeded. | not re-run |
| app | 01-shell.spec.ts:1521:7 | a dialog › a dialog takes the keyboard with it when it opens | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1526:7 | a dialog › Tab cannot walk out of a dialog and into the page behind it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1536:7 | a dialog › Escape closes a dialog and hands focus back to what opened it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1551:7 | a dialog › a click INSIDE a dialog is not a click away from it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1543:7 | a dialog › a click beside a dialog closes it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1584:7 | a dialog › a dialog says plainly what it is about to do, and offers the way out first | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1590:7 | a dialog › Keep it keeps it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1632:7 | on a phone › Escape shuts the drawer and puts me back on the button I opened it with @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1643:7 | on a phone › the dark panel beside the drawer shuts it @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1654:7 | on a phone › following a link out of the drawer closes the drawer behind me @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1665:7 | on a phone › a link out of the drawer leaves me on what I opened, not back on the hamburger @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1676:7 | on a phone › the jump box is still on the phone, and still jumps @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1559:7 | a dialog › while the write is in flight a click beside the dialog does not throw it away either | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1572:7 | a dialog › while the write is in flight Escape does not throw the dialog away under it | noise: console guard only (HTTP 400) | not re-run |
| app | 01-shell.spec.ts:1617:7 | on a phone › the rail is a drawer behind the hamburger, and nothing of it is in the way until I ask @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 03-properties.spec.ts:389:7 | W02 · the list as it arrives › the head says how many records, how much land and what it is all worth | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:468:7 | W02 · narrowing the list › the facets open from one chip, and each group counts its own options | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:520:7 | W02 · narrowing the list › what is narrowing the list reads back as a chip that names its group | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:530:7 | W02 · narrowing the list › the × on a chip takes that one filter off and leaves the others on | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 03-properties.spec.ts:541:7 | W02 · narrowing the list › two facets narrow together, and the URL carries both | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 03-properties.spec.ts:849:7 | W02 · grid, list and map › the map draws the records that know where they are and names the one that does not | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:868:7 | W02 · grid, list and map › a map with nothing it can draw says so rather than leaving an empty frame | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:882:7 | W02 · grid, list and map › a map of records nobody has surveyed does not claim a survey | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:900:7 | W02 · grid, list and map › a map that cannot place five records names three and owns up to the rest | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:935:7 | W02 · grid, list and map › picking a record off the map’s list says what it is and where to go next | assertion: Error: expect(locator).toHaveAttribute(expected) failed | fail again |
| app | 03-properties.spec.ts:980:7 | W02 · acting on several records › picking a card raises the bar, and every label on it counts the selection | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:997:7 | W02 · acting on several records › select-all ticks every row and the bar says how many are in hand | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:1312:7 | W02 · Export › Export writes the list I am looking at, a row per card | assertion: Error: expect(received).toBe(expected) // Object.is equality | fail again |
| app | 03-properties.spec.ts:1023:7 | W02 · acting on several records › archiving what I picked asks first, then sends exactly those records | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:1043:7 | W02 · acting on several records › a server that moved only some of them says so and keeps the dialog open | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 03-properties.spec.ts:1133:7 | W02 · acting on several records › a server that moved none of them says so rather than closing on a lie | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 03-properties.spec.ts:1150:7 | W02 · acting on several records › deleting several at once counts them and says what goes with them | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:1184:7 | W02 · acting on several records › a tag that reached only some of them says which, and holds on to the rest | assertion: TimeoutError: locator.fill: Timeout 10000ms exceeded. | fail again |
| app | 03-properties.spec.ts:1294:7 | W02 · acting on several records › a selection of archived records offers to bring them back, not to archive them again | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:1700:7 | W02 · adding from the paper › the deed a record was read from is filed against the record it made | noise: console guard only (HTTP 400) | fail again |
| app | 03-properties.spec.ts:1585:7 | W02 · adding from the paper › the deed I hand it fills the boxes and says in words what it took from them | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:1643:7 | W02 · adding from the paper › a deed only says what the boxes do not already | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:1677:7 | W02 · adding from the paper › a deed the reader cannot make sense of opens the form itself and says why | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:1851:7 | W02 · the menu on one record › deleting a record says what goes with it before the red button does it | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 03-properties.spec.ts:1817:7 | W02 · the menu on one record › Order a service lands on that record’s own order screen, already asking what to do on it | assertion: Error: expect(locator).toHaveAttribute(expected) failed | fail again |
| app | 03-properties.spec.ts:1993:7 | W02 · a list with nothing on it › an account with no records says so and does not draw a screenful of furniture over nothing | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 03-properties.spec.ts:2019:7 | W02 · a list with nothing on it › an account whose every record is archived is told where they went | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 05-record-papers.spec.ts:545:5 | Remove unfiles the paper whose row asked, and no other | assertion: Error: expect(received).toEqual(expected) // deep equality | fail again |
| app | 05-record-papers.spec.ts:320:5 | searching the papers narrows them, and a search nothing matches says so rather than looking empty | assertion: Error: expect(locator).toHaveAttribute(expected) failed | fail again |
| app | 05-record-papers.spec.ts:386:5 | a paper’s name opens that paper in the Reader | assertion: Error: expect(page).toHaveURL(expected) failed | fail again |
| app | 05-record-papers.spec.ts:788:5 | a scan the reader could read is filed under the register’s own name, on the Title shelf | assertion: Error: expect(received).toEqual(expected) // deep equality | fail again |
| app | 05-record-papers.spec.ts:638:5 | the picker lives in the panel, and takes a scan or a photograph of one | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 05-record-papers.spec.ts:666:5 | the panel offers the shelf as a choice, with the reader deciding by default | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 05-record-papers.spec.ts:1102:7 | the upload error path › an upload the storage gateway refuses says so, in the sentence this screen already means | noise: console guard only (HTTP 503) | fail again |
| app | 05-record-papers.spec.ts:1125:7 | the upload error path › a failed upload still leaves nothing half-filed: no row, and no paper on the shelf | noise: console guard only (HTTP 503) | fail again |
| app | 05-record-papers.spec.ts:745:5 | a wrong file is taken out of the pick before a byte of it is sent | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 05-record-papers.spec.ts:720:5 | one oversize scan in a pick refuses the whole pick, each named and sized | assertion: Error: expect(locator).toContainText(expected) failed | fail again |
| app | 05-record-papers.spec.ts:1009:5 | a deed photographed on a phone is filed as a picture, with its one page | assertion: Error: expect(locator).toHaveText(expected) failed | fail again |
| app | 05-record-papers.spec.ts:1392:5 | the rail counts the stills apart from the clips, because a clip is not a photo | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 05-record-papers.spec.ts:1316:5 | sharing the record makes a link to the whole record, not to one paper | assertion: Error: expect(locator).toBeEnabled() failed | fail again |
| app | 05-record-papers.spec.ts:1355:5 | a share that never reaches the server says nothing has been shared | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 05-record-papers.spec.ts:1339:5 | a link the server would not make says so, and keeps the name that was typed | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | fail again |
| app | 05-record-papers.spec.ts:1402:5 | a gallery that comes back empty over a record that counts photos says which is which | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 05-record-papers.spec.ts:1417:5 | a record with nothing photographed is offered the picker, not a gallery that does not exist | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 06-record-features.spec.ts:335:7 | W07 · what is on this land › the grid says how it is ordered and that each feature carries its own pin and photos | assertion: Error: expect(locator).toBeVisible() failed | fail again |
| app | 06-record-features.spec.ts:911:7 | W07 · filing a feature › the primary will not file a feature nothing has been said about | assertion: Error: expect(locator).toBeDisabled() failed | fail again |
| app | 05-record-papers.spec.ts:1429:5 | an oversize photo picked from the record page is refused by name, before a byte is sent | assertion: Error: locator.setInputFiles: Test timeout of 45000ms exceeded. | fail again |
| app | 06-record-features.spec.ts:1328:7 | W07 · turning a name into a record › a feature cannot be saved with its name rubbed out | assertion: Error: expect(locator).toBeDisabled() failed | fail again |
| app | 17-villages.spec.ts:1792:5 | the fence calculator opens over the map with the plot’s own corners counted | noise: console guard only (HTTP 500) | pass |
| app | 17-villages.spec.ts:1470:5 | a paper list that fails to refresh is not a denial that the papers exist | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1822:5 | the estimate is its own bill added up, not a second opinion | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1852:5 | a fence with no gate in it carries wire the whole way round | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1871:5 | the fence panel moves to whichever hand suits me | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1891:5 | leaving a side out opens the run and takes it off the bill | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1934:5 | the estimate leaves the screen as work on the record it belongs to | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:2002:5 | the fence calculator prices the shape I walked, not the plot behind it | noise: console guard only (HTTP 500) | pass |
| app | 17-villages.spec.ts:2057:5 | Escape backs out of the fence calculator before it backs out of anything else | noise: console guard only (HTTP 500) | pass |
| app | 17-villages.spec.ts:1956:5 | a refused fence request keeps the estimate on screen and says it was not accepted | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1907:5 | the rates I typed are still there the next time I price a plot | noise: console guard only (HTTP 500) | pass |
| app | 17-villages.spec.ts:1969:5 | a fence request the desk could not take says what the desk said | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:1985:5 | a plot that is nobody’s record can be printed and not much else | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:2019:5 | a tape with two points in it prices an open run, not a plot | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:2043:5 | closing the fence calculator goes back up to the village, not out of it | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:2628:5 | typing a village name does not move the map @phone | assertion: Error: the matching village is drawn under the map | pass |
| app | 24-responsive.spec.ts:301:7 | on a 390px screen › while the drawer is shut the next Tab takes me to the search box, not through nineteen links I cannot see @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:323:7 | on a 390px screen › Escape shuts the drawer and gives me back the button I opened it with @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:336:7 | on a 390px screen › the dark panel beside the drawer shuts it, and hands the button back too @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:350:7 | on a 390px screen › going somewhere from inside the drawer shuts it behind me and leaves my focus on what loaded @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 17-villages.spec.ts:2610:5 | the map’s tools and its plot search do not sit on top of each other @phone | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 24-responsive.spec.ts:375:7 | on a 390px screen › a rail I collapsed at my desk does not lock the drawer shut on my phone @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 17-villages.spec.ts:2674:5 | the village map hands off to my own land on the map | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 17-villages.spec.ts:2684:5 | Print prints the village that is on the stage | noise: Vite error overlay intercepts pointer (another session mid-edit) | pass |
| app | 24-responsive.spec.ts:263:7 | on a 390px screen › every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:292:7 | on a 390px screen › opening the drawer puts my focus inside it rather than behind it @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:452:7 | at a desk, the same button does the other thing › a collapsed rail keeps every section one click away and still named @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:433:7 | at a desk, the same button does the other thing › above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:482:7 | at a desk, the same button does the other thing › narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:467:7 | at a desk, the same button does the other thing › the collapse is remembered when I come back; the drawer never is @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:242:7 | on a 390px screen › the rail folds into a drawer and I am never left with no way to get anywhere @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/tools without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/audit without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/groups without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/invitations without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:419:7 | on a 390px screen › the drawer covers the page rather than shoving it sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/profile without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/refer without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:500:7 | at a desk, the same button does the other thing › 900px is still a phone and 901 is not — the button changes its mind on the pixel the stylesheet does @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:517:7 | at a desk, the same button does the other thing › widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:614:8 | nothing takes the page sideways › reading a deed fits a phone @phone | assertion: ? | not re-run |
| app | 24-responsive.spec.ts:736:7 | what re-flows on a phone › the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:753:7 | what re-flows on a phone › what the jump box finds stays inside the screen and still takes me there @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1009:7 | what re-flows on a phone › the dashboard strip stacks its figures one to a row rather than squeezing five across @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1083:7 | what re-flows on a phone › a dialog sits inside the phone rather than over its edges @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:694:7 | nothing takes the page sideways › a URL that matches nothing still fits, and still offers the way back @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| app | 24-responsive.spec.ts:709:7 | nothing takes the page sideways › a screen that failed fits a phone — the apology does not run off the side @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| app | 24-responsive.spec.ts:1100:7 | what re-flows on a phone › a refused write says so inside the phone, not off the side of it @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1117:7 | what re-flows on a phone › the assistant opens on a phone and takes the screen rather than hanging off it @phone | noise: console guard only (HTTP 400,503) | not re-run |
| app | 24-responsive.spec.ts:846:7 | what re-flows on a phone › the vault wall stacks to one shelf a row, and all eight are still a tap away @phone | assertion: Error: expect(locator).toHaveCount(expected) failed | not re-run |
| app | 24-responsive.spec.ts:1203:9 | the desk on a phone › I can run the desk from a phone: who covers what does not drag the page sideways @phone | noise: console guard only (HTTP n/a) | not re-run |
| app | 24-responsive.spec.ts:903:7 | what re-flows on a phone › a brand-new service leads with who can do it and ends with the reference material @phone | assertion: TimeoutError: locator.boundingBox: Timeout 10000ms exceeded. | not re-run |
| app | 24-responsive.spec.ts:867:7 | what re-flows on a phone › a service stacks its story over its rail and keeps the buttons that act on it @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| app | 24-responsive.spec.ts:1210:7 | the desk on a phone › the desk is one tap away in the phone drawer, under Operations where it belongs @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:978:7 | what re-flows on a phone › a service that has gone quiet offers all three remedies inside the phone @phone | assertion: Error: expect(locator).toContainText(expected) failed | not re-run |
| app | 24-responsive.spec.ts:1390:7 | the desk on a phone › the coverage grid scrolls its columns inside its own card, never taking the page with it @phone | noise: console guard only (HTTP n/a) | not re-run |
| app | 24-responsive.spec.ts:1530:7 | what a thumb has to hit › the scrim beside the drawer is a real target, not a hairline @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1518:7 | what a thumb has to hit › every entry in the drawer is big enough to hit with a thumb @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 01-shell.spec.ts:1632:7 | on a phone › Escape shuts the drawer and puts me back on the button I opened it with @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 01-shell.spec.ts:1643:7 | on a phone › the dark panel beside the drawer shuts it @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1281:7 | the desk on a phone › one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| phone | 01-shell.spec.ts:1665:7 | on a phone › a link out of the drawer leaves me on what I opened, not back on the hamburger @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 01-shell.spec.ts:1654:7 | on a phone › following a link out of the drawer closes the drawer behind me @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1310:7 | the desk on a phone › the reason I have to type before taking somebody off a job fits a phone @phone | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | not re-run |
| phone | 01-shell.spec.ts:1676:7 | on a phone › the jump box is still on the phone, and still jumps @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1203:9 | the desk on a phone › I can run the desk from a phone: one associate's own page does not drag the page sideways @phone | noise: console guard only (HTTP n/a) | not re-run |
| phone | 01-shell.spec.ts:1617:7 | on a phone › the rail is a drawer behind the hamburger, and nothing of it is in the way until I ask @phone | noise: console guard only (HTTP 400) | not re-run |
| app | 24-responsive.spec.ts:1357:7 | the desk on a phone › one associate stacks their record over their number, and the number stays inside the screen @phone | noise: console guard only (HTTP n/a) | not re-run |
| phone | 24-responsive.spec.ts:323:7 | on a 390px screen › Escape shuts the drawer and gives me back the button I opened it with @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:336:7 | on a 390px screen › the dark panel beside the drawer shuts it, and hands the button back too @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:350:7 | on a 390px screen › going somewhere from inside the drawer shuts it behind me and leaves my focus on what loaded @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:375:7 | on a 390px screen › a rail I collapsed at my desk does not lock the drawer shut on my phone @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:433:7 | at a desk, the same button does the other thing › above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:452:7 | at a desk, the same button does the other thing › a collapsed rail keeps every section one click away and still named @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:467:7 | at a desk, the same button does the other thing › the collapse is remembered when I come back; the drawer never is @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:482:7 | at a desk, the same button does the other thing › narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:242:7 | on a 390px screen › the rail folds into a drawer and I am never left with no way to get anywhere @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:263:7 | on a 390px screen › every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:301:7 | on a 390px screen › while the drawer is shut the next Tab takes me to the search box, not through nineteen links I cannot see @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:292:7 | on a 390px screen › opening the drawer puts my focus inside it rather than behind it @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:419:7 | on a 390px screen › the drawer covers the page rather than shoving it sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/groups without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/tools without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/invitations without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/audit without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:500:7 | at a desk, the same button does the other thing › 900px is still a phone and 901 is not — the button changes its mind on the pixel the stylesheet does @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:517:7 | at a desk, the same button does the other thing › widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/profile without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:548:9 | nothing takes the page sideways › I can read every word on /app/refer without dragging the page sideways @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:614:8 | nothing takes the page sideways › reading a deed fits a phone @phone | assertion: ? | not re-run |
| phone | 24-responsive.spec.ts:736:7 | what re-flows on a phone › the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:753:7 | what re-flows on a phone › what the jump box finds stays inside the screen and still takes me there @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:1009:7 | what re-flows on a phone › the dashboard strip stacks its figures one to a row rather than squeezing five across @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:709:7 | nothing takes the page sideways › a screen that failed fits a phone — the apology does not run off the side @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| phone | 24-responsive.spec.ts:1083:7 | what re-flows on a phone › a dialog sits inside the phone rather than over its edges @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:694:7 | nothing takes the page sideways › a URL that matches nothing still fits, and still offers the way back @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| phone | 24-responsive.spec.ts:1100:7 | what re-flows on a phone › a refused write says so inside the phone, not off the side of it @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:1117:7 | what re-flows on a phone › the assistant opens on a phone and takes the screen rather than hanging off it @phone | noise: console guard only (HTTP 400,503) | not re-run |
| phone | 24-responsive.spec.ts:867:7 | what re-flows on a phone › a service stacks its story over its rail and keeps the buttons that act on it @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| phone | 24-responsive.spec.ts:846:7 | what re-flows on a phone › the vault wall stacks to one shelf a row, and all eight are still a tap away @phone | assertion: Error: expect(locator).toHaveCount(expected) failed | not re-run |
| phone | 24-responsive.spec.ts:978:7 | what re-flows on a phone › a service that has gone quiet offers all three remedies inside the phone @phone | assertion: Error: expect(locator).toContainText(expected) failed | not re-run |
| phone | 24-responsive.spec.ts:903:7 | what re-flows on a phone › a brand-new service leads with who can do it and ends with the reference material @phone | assertion: TimeoutError: locator.boundingBox: Timeout 10000ms exceeded. | not re-run |
| phone | 24-responsive.spec.ts:1203:9 | the desk on a phone › I can run the desk from a phone: who covers what does not drag the page sideways @phone | noise: console guard only (HTTP n/a) | not re-run |
| phone | 24-responsive.spec.ts:1210:7 | the desk on a phone › the desk is one tap away in the phone drawer, under Operations where it belongs @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:1390:7 | the desk on a phone › the coverage grid scrolls its columns inside its own card, never taking the page with it @phone | noise: console guard only (HTTP n/a) | not re-run |
| phone | 24-responsive.spec.ts:1489:8 | what a thumb has to hit › the primary button on a screen is big enough to hit with a thumb @phone | assertion: ? | not re-run |
| phone | 24-responsive.spec.ts:1518:7 | what a thumb has to hit › every entry in the drawer is big enough to hit with a thumb @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:1530:7 | what a thumb has to hit › the scrim beside the drawer is a real target, not a hairline @phone | noise: console guard only (HTTP 400) | not re-run |
| phone | 24-responsive.spec.ts:1281:7 | the desk on a phone › one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone | assertion: Error: expect(locator).toBeVisible() failed | not re-run |
| phone | 24-responsive.spec.ts:1310:7 | the desk on a phone › the reason I have to type before taking somebody off a job fits a phone @phone | assertion: TimeoutError: locator.click: Timeout 10000ms exceeded. | not re-run |
| phone | 24-responsive.spec.ts:1203:9 | the desk on a phone › I can run the desk from a phone: one associate's own page does not drag the page sideways @phone | noise: console guard only (HTTP n/a) | not re-run |
| phone | 24-responsive.spec.ts:1357:7 | the desk on a phone › one associate stacks their record over their number, and the number stays inside the screen @phone | noise: console guard only (HTTP n/a) | not re-run |
