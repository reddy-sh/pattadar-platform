# Naming research: the "Combined views" feature

Date: 27/10/2026. Research and recommendation only; no product copy or code changed.

## What is being named

From `docs/specs/2026-09-25-combined-properties.md` and `apps/web/src/w360/pages/Combined.tsx`:
two or more records that the account holds **in its own name**, treated as one
piece of ground ("sixty acres bought as two registrations, behind one fence").
It has a name, a list of members, a combined map, combined documents and costs
that belong to the whole unit. Each official record stays separate: no merged
title, khata, FMB or mutation. A record can be in only one of these.

Scope note for Reddy: the brief describes "the combined property of a person or
trust". The model has **no owner entity**. It is ground-first (records held
together), not owner-first (everything one person or trust owns). Rule 3 of the
spec also rules out land held for somebody else. A per-owner rollup (for example,
a trust's whole estate) would be a different feature with a model change, and it
would overlap Families & groups, which already decide *who* holds land. The
names below are for the feature as built.

## Recommendation: **Holdings** (singular: *holding*)

The Agriculture Census of India defines an *operational holding* as "all land … operated as one technical unit by one person alone or with others, regardless of the form of ownership" ([GKToday summary of the Agriculture Census definition](https://www.gktoday.in/operational-land-holding/); same wording on [agcensus.da.gov.in](https://agcensus.da.gov.in/acindianeedoph.html), which returned 403 to my fetch). That matches the feature closely: one unit on the ground, with title left alone. Supporting points:

- It works for any holder (person, trust, HUF) and any land type (farm, plot, built), so it does not limit the feature to agriculture.
- The founder's own spec and code comments already use the word ("the whole holding, as it sits on the ground"; "a holding is made OF records"). The internal word and the visible word would finally match.
- "Holding" is ordinary vocabulary in Indian land administration (landholding, consolidation of holdings, ceiling on holdings). In Telugu, *kamatam* (కమతం) is the census term, which helps a future Telugu UI.

Risks that need Reddy's decision:

1. **It reverses a founder decision.** `design.md` § App vocabulary (26/09/2026) says the concept is "Combined view" and lists both "holdings" (for Properties) and "holding" (for this feature) under *Not*. A rename means editing that table.
2. **The plural can sound like "everything I own".** Indian brokerages use "Holdings" for the full list of what you own. Zerodha's Kite docs say "Holdings contain the user's portfolio of long term equity delivery stocks" ([Kite Connect: Portfolio](https://kite.trade/docs/connect/v3/portfolio/)). A user could read "Holdings" next to "Properties" as the same list. Mitigation: keep the page eyebrow as a definition ("Several properties held as one"), use the singular inside an object ("This holding", "Remove this holding"), and never write "your holdings" to mean all of your land.
3. **"Holding" has a legal meaning in AP.** Under the AP land-ceiling law, the land of a family unit is added together to make one "holding". That sits close to the Family concept. This comes from domain knowledge: the statute page on indiankanoon.org returned 403, so I could not quote it. Most owners will not notice, but lawyers and revenue staff might.

## Runners-up

| Candidate | Rationale | Precedent | Why it is not first |
|---|---|---|---|
| **Estates** | A landed unit under one owner, made of several parcels. Indian users know it from coffee, tea and mango estates. | Wikipedia: "An estate is a large parcel of land under single ownership" ([Estate (land)](https://en.wikipedia.org/wiki/Estate_(land))) | It also means a deceased person's estate ([Estate planning](https://en.wikipedia.org/wiki/Estate_planning)), which sits too close to **Family** and any future succession or nominee feature. In AP revenue history "estate" also means former zamindari land (from domain knowledge, not fetched). It sounds too grand for two house plots. |
| **Combined views** (keep) | Already approved, and honest that nothing is merged ("Views, not properties", `Shell.tsx`) | `design.md` vocabulary table | "View" sounds like a saved filter, not a thing that has its own costs, documents and map. That gap is part of why the page feels unlike its neighbours. |
| **Farms** | Plain-language match for the main case: fields behind one fence, sharing a well | Farm-management software commonly nests fields under a farm. Not fetched; vendor pages are JS-rendered. | Too narrow: combined plots and built property are allowed (`ExtentLine` shows ac, Sq.yd and Sq.ft built). |

Considered and rejected:

- **Portfolios.** Stessa groups properties into Portfolios and lets you "assign expenses to the Portfolio level" once you have "at least two Properties" ([Stessa help](https://support.stessa.com/en/articles/3840221-assigning-transactions-reporting-portfolios-properties-and-units); [portfolio-level expenses](https://www.stessa.com/blog/portfolio-level-expenses/)). That is a close functional match, but Pattadar's rail group is already "Your portfolio", which means everything.
- **Khata.** This is the official AP account of one pattadar's land in a village. The 1-B ROR "contains details about all the agriculture properties owned by an individual in a village" ([Landeed: ROR 1-B](https://web.landeed.com/andhra-pradesh/ror-1b)). Using it would imply an official status the feature does not have.
- **Assemblage.** This is the real-estate term for combining adjacent parcels ([Plottage](https://en.wikipedia.org/wiki/Plottage)), but it is jargon. **Consolidation** and **Amalgamation** are also out because they are legal processes (consolidation of holdings, plot amalgamation), and the spec says "no office has been told anything".
- **Owners / Entities / Groups.** These are people-first names. They copy what Families & groups already does.

## How it reads next to Family and Groups

Rail today: *Your portfolio* has Properties · **[this]** · Cadastral maps · Documents. *Shared* has … · Families & groups.

- Families & groups answers **who**: people with legal standing who hold land together.
- Holdings answers **which land is held as one**: properties seen together as one unit, owned by the account.

The names come from different families of words, people versus land, so there is no overlap in the rail or the breadcrumbs: Holdings › Ramaiah mango holding › Sy. No. 12. The one place to watch is risk 2, Holdings next to Properties. The definition eyebrow and singular usage handle that.

## Decision and implementation stance

- **The final name is Reddy's decision** as product owner. It changes a founder-approved vocabulary entry in `design.md`. This document is a recommendation, not approval.
- Until Reddy decides, the visible label stays **"Combined views"**. Today the label is hard-coded in many places: `Shell.tsx`, `Combined.tsx`, `CombinedProperty.tsx`, `RecordHead.tsx`, `Vault.tsx`, `CombinedLedger.tsx` and `api.ts` error copy. I found no shared constant. The implementation step should move the noun (singular, plural, eyebrow and the empty-state wording) into one source of truth, so a rename is a one-place edit plus updates to `design.md` and the guards.
- Evidence limits: searches were rate-limited. agcensus.da.gov.in and indiankanoon.org returned 403, so the AP-law and zamindari points are unverified domain knowledge. I did not do any user testing with AP owners.
