# Approved decisions

On 02/10/2026 Reddy approved the plan in chat by replying 'yes please' to 'Does this plan look good?'. The plan asked two questions, each with a recommended answer, both taken as approved: (1) Remove the Filter popover's Village facet group (option a, recommended) -- the Filter narrows by District and Mandal; the header search finds a village by name. (2) The parallel session editing heuristic-ux-audit is finished, so go ahead with the skill edits. Do not describe this as more than that chat reply. Keep the Task 6 change isolated in its own small hunks, listed by line in the report, so it can be reverted alone if Reddy changes his mind.

## 03/10/2026 — findings 2, 3 and 4 of the implementation review

The coding step asked three questions, each with a recommended option. The parent session relayed them to Reddy with those recommendations. On 03/10/2026 Reddy replied, verbatim: "proceed with recommendations". The recommended option of each question is taken as approved. Do not describe this as more than that reply.

1. Finding 2: the page closed FacetFilter's popover by clicking the component's own + Filter button through the DOM. Options: (a) an optional prop on FacetFilter that lets the page close the popover; (b) lift a shared SearchField; (c) drop the reach-in and accept the overlap at 390. Chosen: (a).
   - As relayed: optional and backward-compatible, and the smallest additive API.
   - With no prop passed, the other 8 FacetFilter pages behave exactly as before.
   - VillageMaps' DOM click on `.addfilter[aria-expanded="true"]` goes, and FacetFilter's doc comment is updated.
2. Finding 3: the village matches are a third page-local search-with-results surface. Options: (a) an exception for now, tracked in TODO-one-platform row 19; (b) lift SearchField into ui.tsx now. Chosen: (a). The exception was granted on 03/10/2026. Row 19 stays: one shared SearchField for the jump box, the plot finder and the village matches, with combobox semantics and arrow keys.
3. Finding 4: with no catalog, + Filter opened on "No filter options match that search." before anything was typed. Options: (a) FacetFilter shows that line only once a query has been typed; (b) hide + Filter when there is nothing to filter by; (c) leave it. Chosen: (a). With no query and no options, nothing shows below the search row. TODO row 20 is marked done.

Scope, as relayed:

- These two additive ui.tsx changes are the only ui.tsx changes approved.
- Existing callers' props stay as they are.
- The + Filter trigger ring and the 44 px targets belong to the follow-up run.
