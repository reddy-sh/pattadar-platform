# iOS — the M-series redesign (Pattadar Mobile comps, M01–M50)

Source of truth: the founder's `Pattadar Mobile.dc.html` comp set, 50 frames at
402×874. The comp's own subtitle is the contract: *"iOS ergonomics, amber
identity. Tint #AA5910 replaces System Blue; grouped lists, sheets, Dynamic
Type sizes and haptic targets stay exactly as the repo has them."* This is an
evolution of the shipped app, not a rebuild. `apps/ios/design.md` stays the
locked system; nothing here overrides it — no colour literals, no readiness
thresholds in views, `Font.scaled` not `system(size:)`.

## Ground rules for this pass

- **Dummy data where the API has no answer yet.** New screens (Services,
  Orders, Bills, Wallet…) render seeded sample data behind a single
  `SampleData` source so the wiring is one obvious seam when the API lands.
  Existing screens keep their live loads.
- **Every noun gets the full verb set.** View → add → edit → delete with the
  two-tier delete (archive + undo toast; typed confirm only when shared) from
  M14. No dead-end screens: every list row opens, every detail can act.
- **Navigation is the segue map below.** Tab renames: Vault → **Papers**,
  You → **More**. Centre File button stays a button.
- Main branch, incremental commits, `verify.sh` green after each completed
  change (founder rule).

## Tab bar (all frames)

`Home · Properties · File(+) · Papers · More` — File remains the accent-filled
centre button (`isButton` for VoiceOver). Papers uses `description`-style doc
glyph, More uses ellipsis. M25 lets the first three slots be reordered; More is
always last; Papers can never leave the bar (it is where shared docs land).

## Screen digests

### M01 Home — "what needs you, then what you own"
- Header: avatar initial circle (accent wash) · serif **Pattadar** · search ·
  more. As-of pill centred under header (exists as overlay today).
- Stat triple card: Farmland `44 / Ac 82 Ce` · Plots `742 sq.yd` · Built
  `1,760 sq.ft` — mono figures, hairline dividers.
- **Worth today** card: `₹5.02 Cr` `+39%` vs `₹3.62 Cr paid`; split progress
  bar (grey = paid, amber = gain); "Costs this year"; **Loans outstanding** in
  danger red; "Owned only…" footnote; category chip row (6 farm parcels · 1
  open plot · 1 flat · 1 shop) with per-category glyph colours.
- Two 56pt quick actions: **Passbook**, **Property** (accent tiles).
- **Upcoming** card list (land revenue overdue, EC stale) → each row deep-links
  to its holding.
- **Needs attention** card (disputed shop, danger).
- **Recently opened** card with "All properties" link.

### M02 / M22 Properties
- Header: serif title + count line ("9 yours · 3 shared · 2 assigned to you");
  search; filter icon with applied-count badge.
- Segmented **All | Mine**. Chip row: `Group: Passbook` · `Sort: Survey no.` ·
  `Map`. Applied facet chips (amber fill, ×) + `Clear`.
- First card is a **hero card** (category-wash banner, giant ghost motif,
  Yours/Shared pill, kind pill, owner, place row, khata/family dotted chips +
  user-tag chips, extent line + kind) — remaining rows compact.
- Compact rows carry Yours (green) / Shared (slate) pills; shared rows say
  "By Ramesh T. · view only · not in your totals".
- **Mine** tab (M22) is the only state showing the portfolio-totals triple
  card. Add FAB bottom-right. Alert lines (EC stale / Disputed) in danger.

### M03 Filter sheet
Facets exactly five + tags: **Kind** (All/Land parcels/Properties), **Status**
(Owned/For sale/Sold/Disputed), **My stake** (Owned/Managed/Watch), grouped
rows **Family/group · Passbook · Village**, **Your tags** chip cloud. Footer
button **"Show N properties"** with live count. Reset / Done.

### M04 Parcel 360 (owned)
- 230pt photo hero (photos count pill), glass back/share/more buttons.
- Kicker `LAND PARCEL · KHATA 10021`, serif `Sy 214/2` + Owned pill, place
  line, Telugu place line in accent.
- Stat trio: Extent (+ Guntas subline) · Market · Per acre.
- **Hanger chips**: Papers 11 · Features 14 · People 5 · Services 2 · Money ·
  History — selected chip amber. Below: preview card of selected hanger
  (papers list w/ Add), "All 11 papers" link.
- Pinned bottom bar: **Share securely** + handshake (services) square.

### M23 Shared property 360
Same six hangers; Services/Money/History rows locked (lock glyph, 45%
opacity, still visible). Slate "Ramesh T. shared this with you" banner with
"Ask for edit access" / "Leave". Not counted in totals.

### M05 Add sheet ("Add to Pattadar")
Scan-first card (amber border): Camera / Photos / Files tiles. Divider "or
start from scratch": Land parcel · Property · Passbook · Family member rows.

### M06 Confirm reading ("Check the deed")
- "What this document says" prose card + **"Worth checking yourself"** inset
  (grey) with per-doubt bullets.
- "Read by AI…" disclaimer. Divider "check and correct".
- Field rows; low-confidence rows get amber wash + `error_outline` + "low
  confidence" tag. **Filed as** dotted chips + dashed "+ your tag".

### M07 Papers
- Count subhead ("64 papers · all encrypted at rest"), green banner (Mumbai +
  Face ID note).
- 2-col shelf grid — the eight `packages/core` spines, each card left-bordered
  in its spine colour with count. **Shared right now** row (3 links · 1
  expires tomorrow) → share management.

### M08 Share sheet
Three modes (Expiring link + OTP ✓ default / Named people only / View-only
watermarked); Who-and-how-long group (Recipient, Expires, Mask Aadhaar & PAN
toggle, Tell-me-each-open toggle); revoke-in-seconds footnote; **Create link**.

### M09 Services storefront (dummy data)
Contextual bundle card ("Because Sy 214/2 is for sale" — EC + survey ₹4,800,
Order both / Not now). Category chips. Six-row price list (EC ₹1,900, Survey
₹2,900, Caretaker ₹1,200/mo, Legal opinion ₹7,500, Mutation ₹6,000, Land
management → Quote). "All 12 services".

### M10 Order detail (dummy)
Timeline card: Visit done (IST + your-time), photos filed (thumb strip +11),
**One thing needs you** (amber) with "Order re-survey ₹2,900" / "Call him".
Paid/Method/Next visit group. Invoice · Chat footer links.

### M11 Family group
Member rows (you-chip, verified ✓ green / sent ⏱ amber). Invite someone row.
**"Lakshmi hasn't verified yet"** amber card (Resend on WhatsApp / Copy link).
Succession card: "set for 7 of 9 — Sy 214/2 and the flat have no nominee".

### M12 Passbook detail — edit in place
Mono `10021` display. "Record — tap any value to change it" group; the active
row gets amber wash + accent caret (no edit mode). Audit-log footnote.
Parcels-on-khata group (+ Add). Mutation-recorded row.

### M13 Search
Jump-to-one-thing: sections Properties / Papers / **Actions** ("Order an EC
for Sy 214/2", "Share proof of ownership"), match substrings highlighted amber.
Footnote: search jumps, Filter narrows.

### M14 Two-tier delete
Archive dialog (leaves lists, keeps papers, restore-until date). Shared-paper
delete = typed-confirm (`4417/2019`) card with danger border. Undo toast.

### M15 Find by map
Village map w/ boundary shapes at zoom 15+, search pill, layer chips (All 9 /
For sale 2 / Bore 4 / red-dot 1). Bottom card: selected parcel (amber border):
title+For sale pill, extent/khata, ₹, features strip (Bore · 25 kVA · Pond ·
Broken fence), watched-by row, **Open Sy 214/2** + share. Adjacency footnote.

### M16 Features list ("On this land")
Chips All 14 / Water 6 / Power 2 / Repair 2(red). Broken feature gets card
w/ danger border, photo strip, note, actions (Order a repair / Update /
History). Rest are rows: name, mono spec line, status dot, chevron. Footnote:
deleting keeps photos/history.

### M17 People & pay
Money trio (Out/month · In/season · Wallet). Caretaker card (amber border):
verified pills, bio line, Pay/Next payout/Can-see grid, Message + Change pay.
"Also on this land" rows (tenant self-hired, family unpaid, advocate, surveyor
escrow). Slate explainer: Pattadar vs self-hired vs family.

### M18 Features on the map
Feature pins (colour by kind, white ring), Drop-here dashed pin. Bottom sheet
"Where is Borewell 3?" — GPS row (accent left border, "Use") vs drop-by-hand;
green tip: ask caretaker to stand & tap; Save this location / Later; audit
footnote.

### M19 Bills & accounts (dummy)
Due-this-month card (autopaid vs waiting-on-you split). Urgent bill card
(amber border, `8 days` pill, Amount/Units/Due grid, Pay + Autopay). Connection
rows (auto badge, ₹). Dashed **Add a connection** card — scan one old bill.

### M20 Account
Profile head (photo picker). **Your identity**: Aadhaar masked, copy (Face ID +
clipboard note), "This isn't me" removal. **Land**: Pattadar Assistant,
Documents, Invitations (web-only, open_in_new), Activity log. **App**: Units,
Language (Telugu note), Appearance, Time zone. **Your data**: Export, Clear
cache, Delete account. **Help & legal** + Sign out.

### M21 Registry records (dummy)
"What the state recognises, holding by holding." No-passbook explainer card
("that is normal, not a gap" + I-do-own-farmland / Hide). Per-holding groups of
registry rows (layout approval, NALA, municipal assessment, RERA; tax, society
share cert, missing OC in amber). Green seven-of-eight summary.

### M24 More
Groups: Maps · Groups · Services · Invitations(badge) / Wallet · Tools · Audit
log / **Customise tabs** · Settings. Account reachable from here (M20).

### M25 Customise tabs
Drag to reorder; first = launch tab; More locked last; Papers cannot be
removed. "Under More" list with Swap in. Persisted (UserDefaults), tab bar
respects order.

### M26 Photographs (per-holding gallery)
Filter chips (All/Boundary/Crop/Structure). 3-col grid: `cover` badge,
amber `!` = off-village, `location_off`, `Waiting` = upload pending. Footer
explainer. Bottom bar: Take a photo / From library.

### M27 / M28 Photo viewer (dark)
`3 of 12` pager. Evidence panel: caption; Taken; coordinates + `on the land`
green pill; Facing; who. Actions: Use as cover / Delete. Failure case (M28):
"Not usable as evidence" banner, amber 41-km warning, cover action disabled
("needs a location").

### M29 Portfolio map
Plain/Satellite toggle, white-ring category-tinted parcel shapes, glyph pins,
scale + N↑, "2 properties not on the map" pill, bottom selected-parcel bar.

### M30 Boundary
Corner-numbered polygon over imagery, per-edge length labels, Satellite
dropdown, Lengths/Bearings/Point IDs chips, "corner order inferred" caution,
**Sheet says / Corners give / agrees 0.4 cent** card, corner coordinate table
("See all 5"), datum footnote.

### M31 Filing sheet (centre button)
"What are you filing?" 2×2 kind grid (Title deed / Passbook / EC or search /
Tax receipt). "Or ask someone to do it" → Ask for something row (recorded and
tracked — nobody dispatched or paid from here).

### M32 Keep a paper (no AI read)
Picked-file card, Call it (name), File it against (holding picker), offline
note ("saved on this phone the moment you tap Keep"), **Keep it**.

### M33 Attach existing paper
Search + "Already on this land" (checked) and "Everything else" lists,
check-circle selection, "A paper can sit on more than one holding" note,
**Attach N paper(s)**.

### M34 Readings waiting ("Waiting for you")
Cards per pending reading: status pill (reads clean / 2 pages unclear /
needs you), two-line summary, **Check and save** / Discard, read-N-days-ago.
Nothing written until accepted.

### M35 Set location
Full map, search pill, centre pin + ground dot, my-location button, PIN SITS
AT card w/ coordinates + guidance copy, Save.

### M36 Walk the boundary
Accuracy pill (±3 m good enough). Marked corners + blue live dot, dashed
polygon. Bottom card: "3 corners marked · walked 264 m", **Mark corner 4** /
Undo. Nothing written until the shape closes.

### M37 Edit corners
Map with selected corner enlarged; Corner N + "moved 4.2 m" pill;
Easting/Northing rows; amber warning (area will disagree with sheet, audit);
Revert to sheet / Delete corner.

### M38 / M39 Features & Add-a-feature
M38 rows: icon tile (kind wash), name, mono spec, status dot, note line.
"Add a feature" + why-this-matters footnote. M39 sheet: kind chips,
Measurement rows (Depth/Casing w/ units), Anything else note, "Drop it on the
map — not placed" row.

### M40 Offline
As-of pill; cached rows render normally; uncached region = dashed
"Nothing saved for this yet" card with plain-words copy; amber outbox strip
("2 filings and 1 photograph are waiting to go up").

### M41 Signed out
Centered door: glyph, serif "Signed out", reassurance line, **Sign in**,
lock-note card (queued filings stay local; nothing readable to next user).

### M42 First run
3 dark slides; middle = the promise: "Photograph it. It reads itself." with
FE860F accent on dark, dot progress, Continue.

### M43 Passbook reconcile ("What changed")
Sections: New on the passbook (will be added, green) / Changed (strike-through
old → new, amber tag) / On file, not in this photograph (kept). "Kept unless
you say otherwise" footnote. Accept.

### M44 Document detail
Dark hero (spine glyph, serif title, registered line, chips Sy 214/2 +
read-by-model). "The paper says" label/value group. "See all 24 fields" link.
Shared-right-now group (+ Share with someone). Danger delete footnote.

### M45 All details
Chips All 24 / Unsure 3 (dot) / Edited 1. Full label/value table; unsure rows
get amber `help` glyph. Footnote: tap to correct, correction kept against your
name, original stays on the scan.

### M46 Document viewer (dark)
Page N of M, page canvas, thumbnail rail (active ringed amber), zoom slider.

### M47 Who holds what
Per-holding cards: sole (green pill) / joint (avatars + 50/50) / danger card
"No name recorded against this land."

### M48 Member detail
Dark header (avatar, serif name, role). On-the-records table (Share, Holds
jointly, Born, Aadhaar masked, Phone). If-something-happens card. Invitation
state. Remove from group (danger).

### M49 Spend
Spent-this-year card w/ stacked category bar + cost-base sentence. Where it
went (3 categories w/ ₹). Everything recorded rows (capital rows get green
trending_up). + to add.

### M50 Add an expense
Big mono amount, What for / On / When rows, **Is this capital work?** two-tile
choice (Yes it lasts — lifts cost base / No it is running), explainer, Attach
the bill (optional).

## Segue map (the "seamless" requirement)

- Home stat card → Properties(Mine); Upcoming/Needs-attention rows → the
  holding; Recently opened → holding; quick actions → Add passbook / Add
  property flows.
- Properties row → 360 (owned M04 / shared M23); hero Map chip → M15/M29;
  filter icon → M03; FAB → M05.
- 360 hangers → Papers list→M44→M45/M46; Features→M16→M38/M39→M18;
  People→M17; Services→M09→M10; Money→M49→M50; History→activity.
  Photos pill → M26 → M27/M28. Boundary from map/FMB → M30 → M36/M37, M35.
- File(+) → M31 → scan→M06 / keep→M32 / attach→M33; queued reads → M34 → M06;
  passbook rescan → M43.
- Papers tab → M07 shelves → shelf list → M44; Shared-right-now → M08 manage.
- More → M24 → Maps(M29) / Groups(M11→M48) / Services(M09) / Wallet / Tools /
  Audit / Customise(M25) / Settings+Account(M20) / Who holds what(M47) /
  Registry(M21) / Bills(M19) / Spend(M49).
- Delete anywhere = M14 pattern. Offline = M40 pattern. Signed out = M41.

## Out of scope this pass

Real payments, real service dispatch, real share-link OTP delivery, the web
Invitations flow (stays web-only per M20), Pattadar Assistant chat.
