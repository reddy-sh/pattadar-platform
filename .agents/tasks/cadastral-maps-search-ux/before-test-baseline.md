# Baseline before product edits (02/10/2026, HEAD 8c6a2d4)

Command: from tests/e2e-app, APP_WEB_URL=http://localhost:5173 playwright test specs/17-villages.spec.ts specs/01-shell.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=line --output=.local/impl-scratch/cadastral-search-pw-baseline
Full log: .local/impl-scratch/cadastral-search-pw-baseline.log

Totals: 414 tests, 250 passed, 164 failed (4.1m).

By spec/project: 01-shell app 66 failed, 01-shell phone 6, 24-responsive app 45, 24-responsive phone 46, 17-villages app 1, 17-villages phone 0. All other tests passed.

Dominant cause (114 of 164): harness console guard, harness.ts:161 — 'console.error: Failed to load resource: ... 400 (Bad Request)'. Pre-existing (uncommitted work from other sessions / api drift); not ours to fix. Remaining failures are visibility/focus/count assertions in the same specs, mostly downstream of the same 400.

17-villages (ours): 17-villages.spec.ts:570 [app] 'the village list follows the mandal I pick, and a shared name is two villages' — TimeoutError: getByLabel('Search districts or mandals').fill at line 611 (stale label). Expected to go green in Task 6.

## Every failing test with first error

- FAIL 1) [app] › specs/01-shell.spec.ts:198:7 › the rail › Help & resources sits at the foot of the rail, with the University opening in a new tab — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 2) [app] › specs/01-shell.spec.ts:209:7 › the rail › the bell opens the Notifications inbox, not a signpost — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 3) [app] › specs/01-shell.spec.ts:227:7 › the rail › the operator’s desk sits at the foot of the rail, under the sections that are mine — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 4) [app] › specs/01-shell.spec.ts:289:7 › the rail › the number beside Services is the number of jobs Services lists — Error: the seeded world has open jobs to count
- FAIL 5) [app] › specs/01-shell.spec.ts:270:7 › the rail › an owner who does not run Pattadar has no desk on the rail, and the desk is never asked about them — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 6) [app] › specs/01-shell.spec.ts:305:7 › the rail › the number beside Notifications is the reminders the Dashboard is showing — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 7) [app] › specs/01-shell.spec.ts:354:7 › the rail › dismissing a reminder takes the number beside Notifications down with it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 8) [app] › specs/01-shell.spec.ts:405:7 › the rail › while the jobs are still coming the rail does not put a number up early — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 9) [app] › specs/01-shell.spec.ts:412:7 › the rail › collapsing the rail leaves every section reachable by name — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 10) [app] › specs/01-shell.spec.ts:438:7 › the rail › walking from screen to screen does not re-ask the server for the frame — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 11) [app] › specs/01-shell.spec.ts:119:7 › the rail › the rail lights up the section I am actually looking at — Error: expect(locator).toHaveAttribute(expected) failed
- FAIL 12) [app] › specs/01-shell.spec.ts:488:7 › the jump box › the jump box finds a record, a paper and a person in the same breath — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 13) [app] › specs/01-shell.spec.ts:573:7 › the jump box › ⌘K puts the caret in the jump box from anywhere on the page — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 14) [app] › specs/01-shell.spec.ts:542:7 › the jump box › a jump that could not run says so, and never claims my parcel is missing — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 15) [app] › specs/01-shell.spec.ts:580:7 › the jump box › Ctrl-K does the same, for the half of the country not on a Mac — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 16) [app] › specs/01-shell.spec.ts:428:7 › the rail › a collapsed rail is still collapsed when I come back to the app — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 17) [app] › specs/01-shell.spec.ts:556:7 › the jump box › while the answer is still coming the box says it is searching, not that there is nothing — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 18) [app] › specs/01-shell.spec.ts:587:7 › the jump box › the arrow keys walk the hits and Enter takes the one I am on — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 19) [app] › specs/01-shell.spec.ts:165:7 › the rail › every section that has been redrawn opens from the rail — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 20) [app] › specs/01-shell.spec.ts:631:7 › the jump box › the hit my pointer is resting on is the one Enter takes — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 21) [app] › specs/01-shell.spec.ts:659:7 › the jump box › with nothing to jump to, nothing is announced as the row I am on — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 22) [app] › specs/01-shell.spec.ts:644:7 › the jump box › changing my mind mid-word puts the highlight back on the first hit — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 23) [app] › specs/01-shell.spec.ts:672:7 › the jump box › Enter on an empty jump box leaves me exactly where I was — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 24) [app] › specs/01-shell.spec.ts:705:7 › the jump box › clicking away from the jump box puts the results away — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 25) [app] › specs/01-shell.spec.ts:719:7 › the jump box › coming back to the box with the words still in it opens the results again — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 26) [app] › specs/01-shell.spec.ts:802:7 › the top bar › the wordmark takes me home from anywhere — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 27) [app] › specs/01-shell.spec.ts:748:7 › the jump box › the results tell a screen reader how many there are — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 28) [app] › specs/01-shell.spec.ts:757:7 › the jump box › the live region says nothing at all until there is something to say — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 29) [app] › specs/01-shell.spec.ts:525:7 › the jump box › picking a person out of the jump box lands on the people of their record — Error: expect(locator).toBeVisible() failed
- FAIL 30) [app] › specs/01-shell.spec.ts:809:7 › the top bar › the avatar wears my own initials, not a letter chosen for everybody — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 31) [app] › specs/01-shell.spec.ts:920:9 › the top bar › the account menu › Escape puts the menu away and hands focus back to the avatar — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 32) [app] › specs/01-shell.spec.ts:900:9 › the top bar › the account menu › both account screens are one click away, and land where they say — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 33) [app] › specs/01-shell.spec.ts:972:9 › the top bar › on a machine with no ⌘ key › and Ctrl-K works there whatever the hint says — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 34) [app] › specs/01-shell.spec.ts:984:7 › the theme menu › offers all three themes, switches to light and writes the choice down — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 35) [app] › specs/01-shell.spec.ts:1001:7 › the theme menu › and switches straight back to dark — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 36) [app] › specs/01-shell.spec.ts:874:9 › the top bar › the account menu › signing out leaves the app for the front door — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 37) [app] › specs/01-shell.spec.ts:1052:7 › the assistant › opening the assistant asks the assistant service for nothing until I say something — Error: expect(locator).toBeVisible() failed
- FAIL 38) [app] › specs/01-shell.spec.ts:1027:7 › the assistant › the assistant button opens the drawer and the assistant introduces itself — Error: expect(locator).toBeVisible() failed
- FAIL 39) [app] › specs/01-shell.spec.ts:1041:7 › the assistant › the assistant drawer closes and gives the screen back — Error: expect(locator).toBeVisible() failed
- FAIL 40) [app] › specs/01-shell.spec.ts:1059:7 › the assistant › Escape puts the assistant away without touching the screen behind it — Error: expect(locator).toBeVisible() failed
- FAIL 41) [app] › specs/01-shell.spec.ts:1071:7 › the assistant › the send button will not fire on an empty question — Error: expect(locator).toBeDisabled() failed
- FAIL 42) [app] › specs/01-shell.spec.ts:1215:7 › toasts › a write the server refuses says so, in the owner’s words and with the reason — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 43) [app] › specs/01-shell.spec.ts:1127:9 › the assistant › when the assistant service is answering › an answer cut off halfway keeps what arrived and says the line dropped — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 44) [app] › specs/01-shell.spec.ts:1105:9 › the assistant › when the assistant service is answering › the assistant answers, and my question is still there above the answer — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 45) [app] › specs/01-shell.spec.ts:1254:7 › toasts › two refusals stack up rather than one covering the other — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 46) [app] › specs/01-shell.spec.ts:1243:7 › toasts › a toast can be put away — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 47) [app] › specs/01-shell.spec.ts:1148:9 › the assistant › when the assistant service is answering › a second question goes into the same conversation rather than starting a new one — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 48) [app] › specs/01-shell.spec.ts:1228:7 › toasts › a failure sits there until I put it away — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 49) [app] › specs/01-shell.spec.ts:1181:9 › the assistant › when the assistant service is not running › the assistant says plainly that it could not be reached, and that my records are safe — ?
- FAIL 50) [app] › specs/01-shell.spec.ts:1281:7 › toasts › a column of failures stops at four rather than burying the screen behind it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 51) [app] › specs/01-shell.spec.ts:1266:7 › toasts › putting one failure away leaves the other one standing — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 52) [app] › specs/01-shell.spec.ts:1336:7 › a dialog › Tab cannot walk out of a dialog and into the page behind it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 53) [app] › specs/01-shell.spec.ts:1310:7 › toasts › Escape clears a column of failures in one go — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 54) [app] › specs/01-shell.spec.ts:1346:7 › a dialog › Escape closes a dialog and hands focus back to what opened it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 55) [app] › specs/01-shell.spec.ts:1331:7 › a dialog › a dialog takes the keyboard with it when it opens — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 56) [app] › specs/01-shell.spec.ts:1353:7 › a dialog › a click beside a dialog closes it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 57) [app] › specs/01-shell.spec.ts:1361:7 › a dialog › a click INSIDE a dialog is not a click away from it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 58) [app] › specs/01-shell.spec.ts:1394:7 › a dialog › a dialog says plainly what it is about to do, and offers the way out first — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 59) [app] › specs/01-shell.spec.ts:1400:7 › a dialog › Keep it keeps it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 60) [app] › specs/01-shell.spec.ts:1453:7 › on a phone › the dark panel beside the drawer shuts it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 61) [app] › specs/01-shell.spec.ts:1475:7 › on a phone › a link out of the drawer leaves me on what I opened, not back on the hamburger @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 62) [app] › specs/01-shell.spec.ts:1369:7 › a dialog › while the write is in flight a click beside the dialog does not throw it away either — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 63) [app] › specs/01-shell.spec.ts:1464:7 › on a phone › following a link out of the drawer closes the drawer behind me @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 64) [app] › specs/01-shell.spec.ts:1382:7 › a dialog › while the write is in flight Escape does not throw the dialog away under it — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 65) [app] › specs/01-shell.spec.ts:1486:7 › on a phone › the jump box is still on the phone, and still jumps @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 66) [app] › specs/01-shell.spec.ts:1427:7 › on a phone › the rail is a drawer behind the hamburger, and nothing of it is in the way until I ask @phone — Error: expect(locator).toBeFocused() failed
- FAIL 67) [app] › specs/17-villages.spec.ts:570:5 › the village list follows the mandal I pick, and a shared name is two villages — ?
- FAIL 68) [app] › specs/24-responsive.spec.ts:301:7 › on a 390px screen › while the drawer is shut the next Tab takes me to the search box, not through nineteen links I cannot see @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 69) [app] › specs/24-responsive.spec.ts:336:7 › on a 390px screen › the dark panel beside the drawer shuts it, and hands the button back too @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 70) [app] › specs/24-responsive.spec.ts:323:7 › on a 390px screen › Escape shuts the drawer and gives me back the button I opened it with @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 71) [app] › specs/24-responsive.spec.ts:350:7 › on a 390px screen › going somewhere from inside the drawer shuts it behind me and leaves my focus on what loaded @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 72) [app] › specs/24-responsive.spec.ts:375:7 › on a 390px screen › a rail I collapsed at my desk does not lock the drawer shut on my phone @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 73) [app] › specs/24-responsive.spec.ts:433:7 › at a desk, the same button does the other thing › above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 74) [app] › specs/24-responsive.spec.ts:452:7 › at a desk, the same button does the other thing › a collapsed rail keeps every section one click away and still named @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 75) [app] › specs/24-responsive.spec.ts:467:7 › at a desk, the same button does the other thing › the collapse is remembered when I come back; the drawer never is @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 76) [app] › specs/24-responsive.spec.ts:482:7 › at a desk, the same button does the other thing › narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 77) [app] › specs/24-responsive.spec.ts:242:7 › on a 390px screen › the rail folds into a drawer and I am never left with no way to get anywhere @phone — Error: expect(locator).toBeVisible() failed
- FAIL 78) [app] › specs/24-responsive.spec.ts:263:7 › on a 390px screen › every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone — Error: "Dashboard" must be reachable from the phone drawer
- FAIL 79) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 80) [app] › specs/24-responsive.spec.ts:292:7 › on a 390px screen › opening the drawer puts my focus inside it rather than behind it @phone — Error: expect(locator).toBeFocused() failed
- FAIL 81) [app] › specs/24-responsive.spec.ts:419:7 › on a 390px screen › the drawer covers the page rather than shoving it sideways @phone — Error: expect(locator).toBeFocused() failed
- FAIL 82) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/tools without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 83) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/groups without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 84) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/audit without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 85) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/invitations without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 86) [app] › specs/24-responsive.spec.ts:500:7 › at a desk, the same button does the other thing › 900px is still a phone and 901 is not — the button changes its mind on the pixel the stylesheet does @phone — Error: expect(locator).toBeVisible() failed
- FAIL 87) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/refer without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 88) [app] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/profile without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 89) [app] › specs/24-responsive.spec.ts:517:7 › at a desk, the same button does the other thing › widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone — Error: expect(locator).toBeVisible() failed
- FAIL 90) [app] › specs/24-responsive.spec.ts:614:8 › nothing takes the page sideways › reading a deed fits a phone @phone — ?
- FAIL 91) [app] › specs/24-responsive.spec.ts:678:9 › nothing takes the page sideways › in the light scheme › the light scheme fits a phone exactly as the dark one does @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 92) [app] › specs/24-responsive.spec.ts:732:7 › what re-flows on a phone › the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 93) [app] › specs/24-responsive.spec.ts:749:7 › what re-flows on a phone › what the jump box finds stays inside the screen and still takes me there @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 94) [app] › specs/24-responsive.spec.ts:1005:7 › what re-flows on a phone › the dashboard strip stacks its figures one to a row rather than squeezing five across @phone — Error: the dashboard draws a strip of figures
- FAIL 95) [app] › specs/24-responsive.spec.ts:690:7 › nothing takes the page sideways › a URL that matches nothing still fits, and still offers the way back @phone — Error: expect(locator).toBeVisible() failed
- FAIL 96) [app] › specs/24-responsive.spec.ts:705:7 › nothing takes the page sideways › a screen that failed fits a phone — the apology does not run off the side @phone — Error: expect(locator).toBeVisible() failed
- FAIL 97) [app] › specs/24-responsive.spec.ts:1079:7 › what re-flows on a phone › a dialog sits inside the phone rather than over its edges @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 98) [app] › specs/24-responsive.spec.ts:1096:7 › what re-flows on a phone › a refused write says so inside the phone, not off the side of it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 99) [app] › specs/24-responsive.spec.ts:1113:7 › what re-flows on a phone › the assistant opens on a phone and takes the screen rather than hanging off it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 100) [app] › specs/24-responsive.spec.ts:842:7 › what re-flows on a phone › the vault wall stacks to one shelf a row, and all eight are still a tap away @phone — Error: expect(locator).toHaveCount(expected) failed
- FAIL 101) [app] › specs/24-responsive.spec.ts:899:7 › what re-flows on a phone › a brand-new service leads with who can do it and ends with the reference material @phone — ?
- FAIL 102) [app] › specs/24-responsive.spec.ts:863:7 › what re-flows on a phone › a service stacks its story over its rail and keeps the buttons that act on it @phone — Error: expect(locator).toBeVisible() failed
- FAIL 103) [app] › specs/24-responsive.spec.ts:1199:9 › the desk on a phone › I can run the desk from a phone: who covers what does not drag the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 104) [app] › specs/24-responsive.spec.ts:974:7 › what re-flows on a phone › a service that has gone quiet offers all three remedies inside the phone @phone — Error: expect(locator).toContainText(expected) failed
- FAIL 105) [app] › specs/24-responsive.spec.ts:1206:7 › the desk on a phone › the desk is one tap away in the phone drawer, under Operations where it belongs @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 106) [app] › specs/24-responsive.spec.ts:1386:7 › the desk on a phone › the coverage grid scrolls its columns inside its own card, never taking the page with it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 107) [app] › specs/24-responsive.spec.ts:1514:7 › what a thumb has to hit › every entry in the drawer is big enough to hit with a thumb @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 108) [app] › specs/24-responsive.spec.ts:1526:7 › what a thumb has to hit › the scrim beside the drawer is a real target, not a hairline @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 109) [phone] › specs/01-shell.spec.ts:1442:7 › on a phone › Escape shuts the drawer and puts me back on the button I opened it with @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 110) [phone] › specs/01-shell.spec.ts:1453:7 › on a phone › the dark panel beside the drawer shuts it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 111) [phone] › specs/01-shell.spec.ts:1464:7 › on a phone › following a link out of the drawer closes the drawer behind me @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 112) [phone] › specs/01-shell.spec.ts:1475:7 › on a phone › a link out of the drawer leaves me on what I opened, not back on the hamburger @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 113) [app] › specs/24-responsive.spec.ts:1277:7 › the desk on a phone › one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone — Error: expect(locator).toBeVisible() failed
- FAIL 114) [app] › specs/24-responsive.spec.ts:1306:7 › the desk on a phone › the reason I have to type before taking somebody off a job fits a phone @phone — ?
- FAIL 115) [phone] › specs/01-shell.spec.ts:1486:7 › on a phone › the jump box is still on the phone, and still jumps @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 116) [phone] › specs/01-shell.spec.ts:1427:7 › on a phone › the rail is a drawer behind the hamburger, and nothing of it is in the way until I ask @phone — Error: expect(locator).toBeFocused() failed
- FAIL 117) [app] › specs/24-responsive.spec.ts:1199:9 › the desk on a phone › I can run the desk from a phone: one associate's own page does not drag the page sideways @phone — Error: expect(locator).toBeVisible() failed
- FAIL 118) [phone] › specs/24-responsive.spec.ts:323:7 › on a 390px screen › Escape shuts the drawer and gives me back the button I opened it with @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 119) [phone] › specs/24-responsive.spec.ts:336:7 › on a 390px screen › the dark panel beside the drawer shuts it, and hands the button back too @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 120) [app] › specs/24-responsive.spec.ts:1353:7 › the desk on a phone › one associate stacks their record over their number, and the number stays inside the screen @phone — Error: expect(locator).toBeVisible() failed
- FAIL 121) [phone] › specs/24-responsive.spec.ts:375:7 › on a 390px screen › a rail I collapsed at my desk does not lock the drawer shut on my phone @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 122) [phone] › specs/24-responsive.spec.ts:350:7 › on a 390px screen › going somewhere from inside the drawer shuts it behind me and leaves my focus on what loaded @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 123) [phone] › specs/24-responsive.spec.ts:242:7 › on a 390px screen › the rail folds into a drawer and I am never left with no way to get anywhere @phone — Error: expect(locator).toBeVisible() failed
- FAIL 124) [phone] › specs/24-responsive.spec.ts:292:7 › on a 390px screen › opening the drawer puts my focus inside it rather than behind it @phone — Error: expect(locator).toBeFocused() failed
- FAIL 125) [phone] › specs/24-responsive.spec.ts:301:7 › on a 390px screen › while the drawer is shut the next Tab takes me to the search box, not through nineteen links I cannot see @phone — Error: expect(locator).toBeFocused() failed
- FAIL 126) [phone] › specs/24-responsive.spec.ts:433:7 › at a desk, the same button does the other thing › above the breakpoint the hamburger collapses the rail in place instead of sliding a drawer @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 127) [phone] › specs/24-responsive.spec.ts:263:7 › on a 390px screen › every section the rail carries is still in the drawer — nothing is dropped on the way to a phone @phone — Error: "Dashboard" must be reachable from the phone drawer
- FAIL 128) [phone] › specs/24-responsive.spec.ts:467:7 › at a desk, the same button does the other thing › the collapse is remembered when I come back; the drawer never is @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 129) [phone] › specs/24-responsive.spec.ts:452:7 › at a desk, the same button does the other thing › a collapsed rail keeps every section one click away and still named @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 130) [phone] › specs/24-responsive.spec.ts:482:7 › at a desk, the same button does the other thing › narrowing the window past the breakpoint turns the collapsed rail into a drawer without losing a section @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 131) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 132) [phone] › specs/24-responsive.spec.ts:419:7 › on a 390px screen › the drawer covers the page rather than shoving it sideways @phone — Error: expect(locator).toBeFocused() failed
- FAIL 133) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/tools without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 134) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/groups without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 135) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/invitations without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 136) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/audit without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 137) [phone] › specs/24-responsive.spec.ts:500:7 › at a desk, the same button does the other thing › 900px is still a phone and 901 is not — the button changes its mind on the pixel the stylesheet does @phone — Error: expect(locator).toBeVisible() failed
- FAIL 138) [phone] › specs/24-responsive.spec.ts:517:7 › at a desk, the same button does the other thing › widening back past the breakpoint leaves the rail where it was, not stuck behind a scrim @phone — Error: expect(locator).toBeVisible() failed
- FAIL 139) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/profile without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 140) [phone] › specs/24-responsive.spec.ts:548:9 › nothing takes the page sideways › I can read every word on /app/refer without dragging the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 141) [phone] › specs/24-responsive.spec.ts:614:8 › nothing takes the page sideways › reading a deed fits a phone @phone — ?
- FAIL 142) [phone] › specs/24-responsive.spec.ts:678:9 › nothing takes the page sideways › in the light scheme › the light scheme fits a phone exactly as the dark one does @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 143) [phone] › specs/24-responsive.spec.ts:749:7 › what re-flows on a phone › what the jump box finds stays inside the screen and still takes me there @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 144) [phone] › specs/24-responsive.spec.ts:732:7 › what re-flows on a phone › the jump box keeps the top bar to one line and drops the shortcut a thumb cannot press @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 145) [phone] › specs/24-responsive.spec.ts:1005:7 › what re-flows on a phone › the dashboard strip stacks its figures one to a row rather than squeezing five across @phone — Error: the dashboard draws a strip of figures
- FAIL 146) [phone] › specs/24-responsive.spec.ts:705:7 › nothing takes the page sideways › a screen that failed fits a phone — the apology does not run off the side @phone — Error: expect(locator).toBeVisible() failed
- FAIL 147) [phone] › specs/24-responsive.spec.ts:690:7 › nothing takes the page sideways › a URL that matches nothing still fits, and still offers the way back @phone — Error: expect(locator).toBeVisible() failed
- FAIL 148) [phone] › specs/24-responsive.spec.ts:1079:7 › what re-flows on a phone › a dialog sits inside the phone rather than over its edges @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 149) [phone] › specs/24-responsive.spec.ts:1096:7 › what re-flows on a phone › a refused write says so inside the phone, not off the side of it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 150) [phone] › specs/24-responsive.spec.ts:863:7 › what re-flows on a phone › a service stacks its story over its rail and keeps the buttons that act on it @phone — Error: expect(locator).toBeVisible() failed
- FAIL 151) [phone] › specs/24-responsive.spec.ts:842:7 › what re-flows on a phone › the vault wall stacks to one shelf a row, and all eight are still a tap away @phone — Error: expect(locator).toHaveCount(expected) failed
- FAIL 152) [phone] › specs/24-responsive.spec.ts:899:7 › what re-flows on a phone › a brand-new service leads with who can do it and ends with the reference material @phone — ?
- FAIL 153) [phone] › specs/24-responsive.spec.ts:1113:7 › what re-flows on a phone › the assistant opens on a phone and takes the screen rather than hanging off it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 154) [phone] › specs/24-responsive.spec.ts:974:7 › what re-flows on a phone › a service that has gone quiet offers all three remedies inside the phone @phone — Error: expect(locator).toContainText(expected) failed
- FAIL 155) [phone] › specs/24-responsive.spec.ts:1206:7 › the desk on a phone › the desk is one tap away in the phone drawer, under Operations where it belongs @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 156) [phone] › specs/24-responsive.spec.ts:1199:9 › the desk on a phone › I can run the desk from a phone: who covers what does not drag the page sideways @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 157) [phone] › specs/24-responsive.spec.ts:1386:7 › the desk on a phone › the coverage grid scrolls its columns inside its own card, never taking the page with it @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 158) [phone] › specs/24-responsive.spec.ts:1514:7 › what a thumb has to hit › every entry in the drawer is big enough to hit with a thumb @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 159) [phone] › specs/24-responsive.spec.ts:1485:8 › what a thumb has to hit › the primary button on a screen is big enough to hit with a thumb @phone — ?
- FAIL 160) [phone] › specs/24-responsive.spec.ts:1526:7 › what a thumb has to hit › the scrim beside the drawer is a real target, not a hairline @phone — Error: The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).
- FAIL 161) [phone] › specs/24-responsive.spec.ts:1277:7 › the desk on a phone › one job stacks the people who could take it over the job itself, and keeps the way to take them off @phone — Error: expect(locator).toBeVisible() failed
- FAIL 162) [phone] › specs/24-responsive.spec.ts:1306:7 › the desk on a phone › the reason I have to type before taking somebody off a job fits a phone @phone — ?
- FAIL 163) [phone] › specs/24-responsive.spec.ts:1199:9 › the desk on a phone › I can run the desk from a phone: one associate's own page does not drag the page sideways @phone — Error: expect(locator).toBeVisible() failed
- FAIL 164) [phone] › specs/24-responsive.spec.ts:1353:7 › the desk on a phone › one associate stacks their record over their number, and the number stays inside the screen @phone — Error: expect(locator).toBeVisible() failed

# Baseline before the approved FacetFilter change (03/10/2026, HEAD c685d22 plus working tree)

This is the baseline for Reddy's approved findings 2 and 4 (decisions.md,
03/10/2026), taken before any edit to `ui.tsx` or `VillageMaps.tsx`.

- The working tree carried other sessions' uncommitted edits, `ui.tsx`'s
  `TabStrip`/`TabPanel` and import block among them, but none inside
  `FacetFilter`.
- The only change of mine in the tree was the new finding-4 test in
  `17-villages.spec.ts`, which is meant to fail here.
- The dev server on :5173 is Reddy's Vite from this checkout's `apps/web`
  (pid 72141). It started at 18:35:03 after the earlier outage, and `curl`
  printed 200 before each run.

Command, from `tests/e2e-app`, starting at about 18:39:

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/03-properties.spec.ts \
  specs/05-record-papers.spec.ts specs/06-record-features.spec.ts specs/11c-documents-files.spec.ts \
  specs/17-villages.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=line \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/cadastral-search-pw-ff-before
```

Log: `.local/impl-scratch/cadastral-search-pw-ff-before.log`.

Totals: 638 tests, 500 passed, 138 failed, in 7.5 minutes.

Failures by spec and project:

| Spec | app | phone |
|---|---|---|
| 03-properties | 27 | 0 |
| 05-record-papers | 17 | 0 |
| 06-record-features | 3 | 0 |
| 11c-documents-files | 0 | 0 |
| 17-villages | 1 | 0 |
| 24-responsive | 44 | 46 |

The phone project runs only the `@phone` tests.

- 17-villages: the one failure is the new finding-4 test, failing as intended
  (red-runs.md).
- 03-properties: the failures include four in "narrowing the list", which
  drives the shared `+ Filter`:
  - "the facets open from one chip, and each group counts its own options"
    (`:468`)
  - "what is narrowing the list reads back as a chip that names its group"
    (`:520`)
  - "the × on a chip takes that one filter off and leaves the others on"
    (`:530`)
  - "two facets narrow together, and the URL carries both" (`:541`)

  They fail on unchanged `FacetFilter` code, so they come from other
  sessions' work. The rest of 03, 05 and 06 fail on visibility, count and
  click-timeout assertions, or on the console guard's 400.

A Vite restart or dependency re-optimisation would have left these in the log,
and none are there: no 504 "Outdated Optimize Dep", no "Failed to fetch
dynamically imported module", no interrupted navigation. So nothing was re-run
for that reason.

I ran the four Filter specs a second time anyway, still on unchanged code, to
see which failures are flaky. Log: `cadastral-search-pw-ff-before2.log`
(304 tests, 48 failed / 256 passed, 2.6 minutes).

- The failing set was the same as in the first run, with one exception: a
  05-record-papers `[app]` test that failed only in the second sample.
- That test is "a scan the reader could read is filed under the register's
  own name, on the Title shelf".
- Its subtitle came back as "Registered 03/04/1998" where "04/03/1998" was
  expected. That is a flake on unchanged code, outside this change.