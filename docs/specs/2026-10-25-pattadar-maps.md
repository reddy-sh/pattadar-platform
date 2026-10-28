# Pattadar Maps — one map, one set of layers, two places

Decided by Reddy, 25/10/2026: "Cadastral maps" becomes **Maps**, a global
feature, and a property's **Location** tab becomes its **Maps** tab. Both show
the same map with the same layers — Satellite, Cadastral, Hydrogeology,
Climate, Properties and the rest — and the layers are built so that the
options a reader turns on never draw over each other.

Code: `apps/web/src/w360/mapLayers.ts` (the model and its rules, unit-tested
in `mapLayers.test.ts`), `MapLayerControl.tsx` (the one control), and the two pages
that use them, `pages/VillageMaps.tsx` (Maps) and `pages/RecordBoundary.tsx`
(a property's Maps tab). Single-layer specs it builds on:
`2026-10-13-water-flow-layer.md`, `2026-10-23-land-suitability-layer.md`,
`2026-10-23-rainfall-card.md`.

## Why two renderers and one model

The two screens keep their own canvases. `VillageCanvas` answers "which of
these thousands of parcels is mine" (canvas-rendered mesh, label pass, tape);
`MapCanvas` answers "where is this property and what shape is it" (ring,
corners, side lengths, the boundary editor). That split was deliberate and
merging them would rebuild both. What the reader sees as "the same map" is the
same layer vocabulary, the same control, the same rules and the same keys, so
those are what is shared. Each layer's drawing code is shared too where both
canvases draw it (`flowLayer.ts`, `propertiesLayer.ts`, `parcelShade.ts`).

## The layers

| Group | Layer | Draws | Scale |
|---|---|---|---|
| Map type (exactly one) | Satellite · Street map · Boundaries | the ground under everything; Boundaries is no ground at all | — |
| On the map (any number) | Cadastral map | the village's survey parcels, as a mesh | parcel |
| | Parcel numbers | each parcel's number, where it fits | parcel |
| | Your properties | every property of yours with a boundary (outline) or a pin (dot) | parcel |
| | Measurements | this property's side lengths and corner letters (property tab only) | parcel |
| Insight (one at a time) | Extent | parcels shaded by size | parcel |
| | Suitability | parcels shaded by land grade, where graded | parcel |
| | Hydrogeology | where rainwater runs, and bore points, for one of your properties | parcel |
| | Climate | rainfall, temperature, soil moisture or crop health (NASA) | district |

Tools are not layers. Measure on satellite and marking land (Maps), and Add a
boundary mark, Move the pin and Draw boundary (a property) change the map's
behaviour or the record; they stay where they are and borrow what they need.

## The rules, and why

1. **One map type, always.** The ground is never "off" by accident; Boundaries
   is the choice to have none. Clicking the one already on flips it (Satellite
   to Boundaries, anything else back to Satellite) — the Maps page's existing
   switch, now on both.
2. **Reference layers stack.** Cadastral map, Parcel numbers, Your properties
   and Measurements are lines, labels and outlines in neutral or accent ink.
   None of them encodes a quantity in colour, so any combination reads.
3. **One insight at a time.** Every insight encodes a quantity in colour and
   brings its own key. Two at once is two keys and colour nobody can read (is
   that orange a "Fair" grade, a 30 °C pixel or a medium-confidence bore
   point?). So insights are one choice: picking one replaces the last.
4. **Turning a layer on brings what it needs.** Parcel numbers, Extent and
   Suitability draw on the cadastral parcels, so they turn Cadastral map on.
   Extent and Suitability are coloured for imagery (their hues are validated
   against it, not against a street map or the page), so they also switch the
   map type to Satellite.
5. **A conflict pauses, it never unticks.** When something a chosen layer
   needs goes away — Cadastral map turned off under Extent, Street map chosen
   under Suitability, the selected parcel no longer one of yours under
   Hydrogeology — that layer stays chosen and is marked paused, with the
   reason. It comes back on its own when the conflict clears. The reader's
   choice changes only when the reader changes it.
6. **Scale decides what shares the screen.** Climate is a district picture
   (a pixel is 250 m to 10 km), so the map zooms out to the district and every
   parcel-scale layer is paused while it is on: at that zoom a parcel is under
   a pixel and a mesh is a smudge over the colour. The land is marked by one
   ringed dot (a property) or the village's dashed edge (Maps). Turning Climate
   off returns to the view it left, with every paused layer back.
7. **Labels do not sit on labels.** Measurements write side lengths and corner
   letters on the boundary; Hydrogeology writes numbered bore points on the
   same ground. While Hydrogeology is on, Measurements are paused (and the
   boundary stones' numbers step aside, as before).
8. **Tools borrow and give back.** A tool states what it needs and the
   resolver applies it on top of the reader's choice without changing it:
   measuring pins the map type to Satellite (you measure ground you can see)
   and pauses the insight; editing a boundary pauses every layer that would
   take a click or move the camera. Leaving the tool shows exactly what was
   chosen before. The pinned map type is shown held, with the reason.
9. **Unavailable is shown, with the reason, and never ticked.** A layer this
   place cannot have yet is listed unticked and disabled — a tick would read as
   "on" over a map that does not show it (Reddy, 25/10/2026: Cadastral map
   looked selected on the Maps overview) — with why, and what makes it
   possible. A choice already made is kept, and the layer comes on by itself
   once the place can have it: "Not graded
   for this village yet", "Select one of your properties with a saved
   boundary", "Open a village first". A layer that cannot apply to a kind of
   place at all (Measurements on the Maps page) is not listed.
10. **Same order, same words, both places.** Only availability differs.

The resolver (`resolveLayers`) is a pure function of the reader's choice and
the place (`LayerPlace`: which layers it offers, which are unavailable and
why, and the active tool). It returns what is drawn and why anything chosen is
not. `chooseLayer` is the only way a click changes the choice, and is where
rule 4 lives. Both are unit-tested against every rule above.

## Where each layer comes from

| Layer | Maps (village open) | Maps (overview) | A property's Maps tab |
|---|---|---|---|
| Cadastral map | the village's parcels | every village's outline, name and click area — the overview is the cadastral map at district scale, so it is ticked and switches like any layer | its village's cadastral map, if one is on file |
| Parcel numbers | the village | "Open a village first" | its village's cadastral map, if one is on file |
| Your properties | outlines and pins; an outline too small to see on screen also gets a dot | the same — at overview scale every one is a dot | your other properties |
| Measurements | not listed | not listed | when a boundary is saved |
| Extent | the village | "Open a village first" | its village's cadastral map |
| Suitability | when graded | "Open a village first" | its village's grades, read when Suitability is chosen (most villages are not graded yet, so the tab never probes for them unasked); "Not graded for … yet." when there are none |
| Hydrogeology | one of your properties with a saved boundary: the one selected, else turning it on picks one (the selected parcel, one in the open village, else your first) and opens the map on it; "None of your properties has a saved boundary yet." when there is none | the same — turning it on opens a village on your property | when a boundary is saved |
| Climate | around the view | around the view | around the land (a pin or a boundary) |

## UX

- **Map type** stays one click, on the map, as three chips: Satellite ·
  Street map · Boundaries.
- **What is on stays named on the map** with the panel shut: a chip per
  chosen layer under the map-type chips, in the list pages' filter-chip look
  (the insight first, marked "Insight"), each with × to turn it off. A paused
  one is outlined and reads "· paused", with the reason on hover; one held by
  a tool has no ×. A layer this place cannot have at all gets no chip.
- **Layers** is one button beside the map types. It
  opens a panel in two parts: *On the map* (tick boxes; Parcel numbers is
  indented under Cadastral map because it is part of it) and *Insight · one at
  a time* (radio buttons, with None). Each row carries one line: what the
  layer shows, or why it is paused or unavailable. The panel stays open while
  layers are changed and closes on Escape, a click elsewhere, or the button.
- The chosen insight's **key** sits on the map as before (Extent, Suitability,
  Hydrogeology, Climate), so what the colours mean is visible with the panel
  shut. Climate's four pictures are picked in its key.
- Tools keep their places: Measure on satellite and the marking button on
  Maps, the "Changes this property's saved boundary" panel on a property.
- **A control shows only where it works** (Reddy, 25/10/2026). The parcel
  finder ("Find a parcel or survey number") is drawn only while a village's
  parcels are on the map — not under Climate, not with Cadastral map off.
  Under Climate a property's boundary tools fold behind their button and its
  stones' numbers go, as Measurements do: the map is a district. With the
  villages off the overview (Cadastral map off, or paused), nothing on the
  page counts them: no map badge, no band tally, and the head's summary says
  what the map is showing instead. With Your properties on that is their
  summary, in acres as the Properties page states them, and what the map
  cannot draw yet: "2 of 30 properties on the map · 5.00 ac · 28 without a
  pin or boundary". Beside the map, a **Your properties** panel lists each one in the
  Properties map's rows (place, extent, status, boundary or pin): a row or a
  dot picks it — lit on the map and framed — and its link opens its Maps tab.
- **Full screen** on both maps (`useFullscreen`, as on a holding's map): a
  "View full screen" chip in the map-type row, drawn only where the browser
  allows it; Esc or "Exit full screen" brings the page back, and the map is
  framed again for its new size.
- **How current Climate is, in words.** The key asks NASA which date it has
  published last (GIBS DescribeDomains, one small read per layer) and loads
  that day: "Newest from NASA 24/10/2026 · 2 days ago", then what one picture
  is ("the day's average rain rate; NASA publishes it a day or two later").
  If NASA cannot be asked, the older date-trying way loads a picture and the
  key says it cannot vouch that it is the newest. On a village the place is
  a ringed dot, because its dashed edge is a few pixels at district zoom.

## Not done here

- The layer choice is per screen and per visit; it is not carried between
  Maps and a property's Maps tab, or remembered.
- The Properties page's Map view (its third view) is a portfolio map and is
  unchanged.
- Native iOS and Expo maps are not changed (web only).
- The routes stay `/maps` and `/properties/:id/location`; only the labels
  changed.
