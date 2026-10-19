# Hydrogeology layer and bore-point suggestions

Status: web layer built locally, 13/10/2026; the rest is design. § Where it
sits in the app describes what is built. A working prototype and its validation live in
`docs/specs/water-flow/`. Local only; nothing here is applied to production.

Built locally 13/10/2026 (web only, labelled **Hydrogeology** at Reddy's
request): `services/api/src/terrain.py` runs the prototype per record on
request from the elevation tiles on the API host (`TERRAIN_DEM_DIR`, default
`~/india-ref-data-crawlings/elevation`), as a background reading cached in
`terrain_parcel_result` and polled through `web.waterFlow(recordId, source)`;
the chip, map layer and card are in `RecordBoundary.tsx`, `MapCanvas.tsx` and
`WaterFlowCard.tsx`. Its libraries are in `services/api/requirements-terrain.txt`,
not the Docker image. `services/api/tests/test_terrain.py` reproduces both
fixture KMLs exactly. Not built: the `services/terrain` batch job, S3 line
chunks and CloudFront path, `recordBorewell` and borewell reports, iOS and
Android, Telugu strings.
Asked by: Reddy, 12/10/2026: "when we show the data on the map, we show the
option of the different source in the drop down and based on that we tell the
flow of the water and good options for bore points"; 13/10/2026: "have a
feature like satellite, have a hydrogeology".
Owners: `reference-data-ingestion` (elevation tiles and the terrain job),
`backend-contract-change` (GraphQL field and mutation), `web-feature-delivery`
(Location tab), `mobile-feature-delivery` and `sync-ios` (native clients),
`infrastructure-change` (S3 prefix and CloudFront behaviour),
`dependency-change` (rasterio, pysheds), `pattadar-security-review` (borewell
reports).

## What it is

A **Hydrogeology** chip on the property's Location tab, next to Satellite,
Cadastral map and Measure. Turned on, the map shows:

- **Blue lines:** where rainwater runs across and around the parcel, drawn
  from a 30 m elevation map the owner picks from a dropdown.
- **Red outline:** all the land that drains to the main stream passing the
  parcel.
- **Pink outline:** all the land that drains to the selected suggestion.
- **Up to 3 numbered pins:** the best spots on those lines for a borewell,
  each with a confidence level (High, Medium, Low) and a one-line reason.

It describes surface drainage, not groundwater. Every screen that shows it
says so and recommends a resistivity survey before drilling. Nothing in the
app promises water, and nothing uses words like "100% accuracy".

## Name: "Hydrogeology" (Reddy, 13/10/2026)

The chip, the card and every owner-facing string say **Hydrogeology** — the
tooltip ("Show hydrogeology: where rainwater flows and suggested bore
points"), the loading line ("Preparing the hydrogeology map…") and the
server's reasons in `terrain.py` ("The hydrogeology reading failed…",
"Hydrogeology is not installed on this server."). One concept, one name.
The disclaimer still says plainly that the lines show where rainwater flows
on the surface; that sentence describes what the layer shows, not a second
name.

Superseded argument, kept for the record: hydrogeology is the study of
groundwater in rock, and this layer shows surface drainage (hydrology), so
the design first proposed "Water flow" and kept "Hydrogeology" for a later
layer with real groundwater data. Reddy chose "Hydrogeology" for the chip on
13/10/2026; the disclaimer carries the limit instead.

## What was validated (12–13/10/2026)

The trigger was a YouTube borewell consultant who draws "water flow lines"
over Google Earth. We reproduced his lines and measured the match:

| Map | How it was made | Site 1: his lines within 30 m of ours (chance) | Match score, site 1 | Match score, site 2 |
| --- | --- | --- | --- | --- |
| SRTM 1″ | NASA radar, 2000 | 85% (54%) | 0.67 | 0.67 |
| NASADEM | SRTM re-processed, 2020 | 82% (54%) | 0.61 | 0.64 |
| AW3D30 | JAXA optical stereo, 2006–2011 | 75% (56%) | 0.43 | 0.24 |
| Copernicus GLO-30 | ESA/DLR radar, 2011–2015 | 74% (55%) | 0.43 | below chance |

Match score = share within 30 m, rescaled so 0 is chance and 1 is perfect.
Site 1 is near 13.62 N, 78.33 E; site 2 is near Yadadri, 17.48 N, 78.93 E.
The consultant uses free SRTM data with a standard D8 drainage calculation:
fill pits and depressions, resolve flats, flow direction, flow accumulation,
and a line wherever more than 10 cells (about 0.9 ha) drain through. Nothing
he uses is proprietary or from the Indian government.

**One map is not enough on flat land.** On the founder's own 4.7 ha parcel
(about 12 m of height spread within 1 km), three independent maps agree on a
small line at the best point. Only SRTM and NASADEM put a 515 ha stream beside
it; Copernicus and AW3D30 place that stream 550–600 m away. SRTM and NASADEM
come from the same 2000 radar flight, so they count as one vote. That is why
the default view combines the maps and shows where they agree.

## Where it sits in the app

**Web (`apps/web/src/w360/pages/RecordBoundary.tsx`), as built.** A fourth
wash chip in `.mapchips`: Satellite · Cadastral map · Measure ·
**Hydrogeology**. Like Measure, it changes only what you see, so it never goes
in the "Changes this property's saved boundary" tools panel, and the two take
turns. It is shown only when the property has a saved boundary (`surveyed`),
and disabled while editing. When on, the right column shows a card titled
"Hydrogeology" (`WaterFlowCard.tsx`), in this order:

- the disclaimer first, so it is in view with the lines however long the
  card is: "These lines show where rainwater flows on the surface. They do
  not guarantee groundwater. Before drilling, get a resistivity survey and
  ask neighbours about their borewells.";
- **Elevation map**, a select inside the card (not above the map), in owner
  words (design.md E2): All maps agree (default) · NASA radar, 2000 (SRTM) ·
  NASA radar re-processed, 2020 (NASADEM) · Japanese satellite photos,
  2006–2011 (AW3D30) · European radar, 2011–2015 (Copernicus); a note under
  it says what the chosen map is. CartoDEM is added when its data is loaded;
- view controls, disabled until there is an answer: "Show only the bore
  points", a "Draw lines draining at least … ac" slider, "Area draining to
  the main stream" (red) and "Area draining to the chosen bore point" (pink),
  both on by default, "Colour lines by how many maps agree" (opt-in, off by
  default) and "Show the other maps' lines faintly";
- the height-spread and main-stream sentences, then up to 3 suggested bore
  points, each with a confidence chip, reason, acres draining, whether lines
  meet, ground height, one sentence "N of 3 maps agree", coordinates with
  Copy and "Navigate in Google Maps";
- "What the other maps say": one row per other map (the current map's own
  row is left out, since it repeats bore point 1);
- the licence credit line, the only place the agencies and dataset names
  appear (NASA, JAXA, DLR/Airbus, ESA).

The map key names the lines in the same short owner words ("Drainage lines,
NASA radar") and folds behind a "Map key" button on a phone.

**Loading and retry.** The answer is a background reading polled through
`web.waterFlow`. The first reading ("Preparing the hydrogeology map…", about
half a minute) shows one progress indicator, on the map; the card carries a
plain note, and a hidden status region announces only the start and the end.
Changing the map keeps the last answer dimmed until the new one arrives. A
GraphQL error and the server's "failed" both show the shared Failed block;
on "failed", Try again asks the server to read again at once (`retry: true`)
instead of waiting out the 10-minute cache. Not built yet: the "Record your
borewell" button.

`MapCanvas` gets one new optional prop, following the `village`/`showVillage`
pattern: `waterFlow?: { lines; mainCatchment?; pinCatchment?; pins; agreeColours: boolean } | null`.
Lines are drawn under the boundary and pins, above the imagery.

**Line style.** Width by area draining through: thin under 10 ha, medium
10–100 ha, thick over 100 ha. Lines use one cyan, like the consultant's
maps. "Colour lines by how many maps agree" is an opt-in checkbox (off by
default, in every view): solid for 3 of 3 maps, lighter for 2, dashed for 1. Small arrowheads show which way
water runs. Tapping a line: "About 36 acres of land drains through here".

**Telugu strings** (first draft; a native editor must check them):

| English | Telugu |
| --- | --- |
| Hydrogeology | to translate (the draft నీటి ప్రవాహం means "water flow") |
| All maps agree | అన్ని మ్యాప్‌లు ఒప్పుకునేవి |
| Suggested bore points | సూచించిన బోరు స్థలాలు |
| High / Medium / Low confidence | అధిక / మధ్యస్థ / తక్కువ నమ్మకం |
| These lines show where rainwater flows on the surface. They do not guarantee groundwater. | ఈ గీతలు వర్షపు నీరు నేల మీద ఎటు ప్రవహిస్తుందో చూపిస్తాయి. భూగర్భ జలానికి ఇవి హామీ కాదు. |
| Record your borewell | మీ బోరు వివరాలు నమోదు చేయండి |

A working UI reference is `docs/specs/water-flow/reference/simulator.html`
(the founder's interactive prototype, data stripped).

## Data sources

All four maps are already downloaded and verified for every 1° tile touching
India: 368 tiles, 26.6 GB, in `~/india-ref-data-crawlings/elevation` on the
founder's Mac. Andhra Pradesh is 32 of those tiles. Each holds one height per
1 arc-second (about 30 m), in metres, WGS84.

| Folder | Map | File | India | Andhra Pradesh | Credit the app must show |
| --- | --- | --- | --- | --- | --- |
| `srtm/` | SRTM 1″ (NASA) | `N15E079.hgt.gz`, 3601² int16 | 3.4 GB | 0.27 GB | none required; "SRTM, NASA" |
| `nasadem/` | NASADEM (NASA) | `NASADEM_HGT_n15e079.tif`, COG | 4.1 GB | 0.31 GB | none required |
| `aw3d30/` | AW3D30 (JAXA) | `ALPSMLC30_N015E079_DSM.tif`, COG | 5.0 GB | 0.38 GB | "© JAXA" |
| `copernicus/` | Copernicus GLO-30 | `Copernicus_DSM_COG_10_N15_00_E079_00_DEM.tif`, COG float32 | 14.1 GB | 1.13 GB | "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |

- **Where they come from:** SRTM from the AWS Terrain Tiles open dataset
  (`s3://elevation-tiles-prod/skadi`); Copernicus from the AWS open dataset
  (`s3://copernicus-dem-30m`); NASADEM and AW3D30 from Microsoft Planetary
  Computer (anonymous SAS tokens). No login is needed for any of them.
  `docs/specs/water-flow/prototype/download_dem.py` re-downloads anything
  missing and checks sizes against `tiles_india.csv`.
- **Licences:** SRTM and NASADEM are public domain. AW3D30 and Copernicus
  allow commercial use with the credit above. Re-check each provider's
  current terms before launch.
- **ISRO CartoDEM v3 R1** is only on Bhuvan, behind a login, with a daily
  download limit. Our tests could not reach it; AW3D30 is the closest
  stand-in, since both are built from optical stereo photos. The design
  treats CartoDEM as a fifth source with no code change.
- **All four are surface models:** treetops and roofs are in the heights.
  Tree rows on field bunds bend lines on flat land.

## Terrain job (`services/terrain`, new)

A batch job that runs once per data version and writes static files to S3.
Phones never compute flow. Start from `prototype/water_flow.py`, which does
all of this for one parcel.

For each 1° tile, for each map and for the combined map:

1. **Read the tile plus a 0.25° buffer**, mosaicking neighbours through a GDAL
   VRT. The buffer makes upslope areas up to about 700 km² exact.
2. **Read whole cells only.** Round every read window to whole cells
   (`from_bounds(...).round_offsets().round_lengths()` in rasterio). A
   fractional window reads the rounded cells but labels them with the
   fractional position. That put everything 9–15 m in the wrong place in our
   first runs (see Pitfalls).
3. **Put every map on one grid** (SRTM's: cell centres on whole
   arc-seconds), resampling bilinearly through each file's own
   georeferencing. AW3D30 is pixel-is-area while the others are
   pixel-is-point; mixing arrays by index shifts it by half a cell.
4. **Combined map:** per cell, the median of three family values: mean of
   SRTM and NASADEM, AW3D30, Copernicus.
5. **Condition:** fill single-cell pits, priority-flood depressions, resolve
   flats. Least-cost breaching (WhiteboxTools) is worth a trial on flat
   tiles.
6. **Flow:** D8 direction, then accumulation, converted to hectares per cell
   row (cell area shrinks with latitude).
7. **Rasters per map** as Cloud-Optimized GeoTIFFs, cropped back to the tile:
   `fdir` (uint8), `upslope_ha` (float32), `agree` (uint8, 0–3 families with
   a line within 30 m) and `relief_1km` (uint8, the 95th minus 5th percentile
   of height within 1 km on the combined map).
8. **Lines:** wherever more than 10 cells drain, split at junctions and run
   downstream. Each line's `upslope_ha` comes from its own cells, **leaving
   out its last vertex**: that vertex is the confluence and belongs to the
   stream below. `agree` is the number of families with a line within 30 m
   along at least 60% of it.
9. **Publish:** lines clipped into 0.05° chunks, one gzipped GeoJSON per chunk
   per map, coordinates to 6 decimals, plus a `manifest.json` with data
   version, thresholds, credits and per-tile checks.

```
terrain/v1/manifest.json
terrain/v1/raster/{map}/{fdir|upslope_ha|agree|relief_1km}/N15E079.tif
terrain/v1/lines/{map}/1560_7940.geojson.gz        (chunk lower-left, 0.05° steps)
```

`{map}` is `srtm`, `nasadem`, `aw3d30`, `copernicus` or `combined`, and later
`cartodem`. Estimated sizes, to confirm on the first Andhra Pradesh run:
Andhra Pradesh is 160 runs, about 2 hours on 8 cores, about 1 GB of lines and
4 GB of rasters; India is 1,840 runs, about 120 core-hours, 11 GB of lines and
45 GB of rasters.

## Suggestions and drainage areas

Computed per parcel on request from the rasters, then cached. The thresholds
are constants at the top of `water_flow.py`.

- **Candidates:** every line cell inside the parcel, or within 30 m outside,
  with at least 5 ha draining to it. A candidate outside is moved to the
  nearest point 3 m inside the boundary.
- **Score:**
  `0.5·min(1, log10(A)/log10(500)) + 0.15·J + 0.35·G/3 − 0.10·[moved > 20 m]`.
  A is hectares draining. J is 1 when two lines meet within 30 m. G is how
  many of the 3 map families have a line within 30 m. The top 3 are kept, at
  least 50 m apart.
- **Confidence:** High when G = 3, the parcel's 1 km height spread is at least
  20 m, and A is at least 10 ha. Medium when G is at least 2. Low otherwise,
  or when the spread is under 10 m and G is under 3.
- **Pink area:** the catchment of the candidate's own grid cell, as a polygon.
- **Main stream and red area:** the nearest cell with at least 100 ha
  draining, within 300 m of the parcel, and its catchment. The card says
  where it runs and how many maps agree on it. On the founder's parcel:
  "A larger stream (about 1,300 acres draining) passes 32 m east of the farm
  on this map; 1 of 3 maps put a line there."
- **Response shape:** exactly `water_flow.py`'s output per map: `points[]`
  (rank, lat, lon, confidence, upslope_ha, junction, agree, families,
  moved_m, elevation_m, reason, catchment {area_ha, geometry}) and
  `main_stream` (upslope_ha, distance_m, bearing, agree, crosses_parcel,
  catchment). The lines come from the static chunks, not from the API.

## API (`services/api`)

- `Parcel.waterFlow(map: TerrainMap = COMBINED): WaterFlowResult` and the
  same on `Property`. The resolver reads the record's `boundary` text
  (`"lat,lng;lat,lng;…"`, as saved by `update_parcel_boundary` and
  `update_property_boundary`). It answers only for records the caller can
  read, through the same ownership checks those mutations use. A record with
  no boundary returns null with a reason.
- `recordBorewell(input: BorewellInput!)`: the farmer's report (below).
- Results are cached in `terrain_parcel_result`, keyed by the hash of the
  boundary, so an edited boundary recomputes.
- Line chunks are public open data with no user data, served from a new
  CloudFront behaviour `/terrain/*` pointing at the S3 `terrain/` prefix,
  cached 30 days, same origin as the app.

## Native clients

- **iOS** (`apps/ios`, SwiftUI `Map` in `PropertiesMap.swift`): decode chunks
  in `PattadarKit`, draw a `MapPolyline` per line, show the red and pink areas
  as `MapPolygon`, and put the map choice in a `Picker`. Check that more than
  1,000 polylines stay smooth on older iPhones; if not, draw only lines over
  1 ha.
- **Android** (`apps/mobile`, react-native-maps): `Polyline` and `Polygon` on
  `property/[id].tsx`.
- **Shared:** chunk maths, styling rules and wording live in `packages/core`,
  with Swift parity vectors per the parity contract.
- **Offline:** cache the chunks and the last result for each of the owner's
  parcels.

## Data model

- `terrain_dataset(version pk, sources jsonb, thresholds jsonb, manifest_key, published_at)`
- `terrain_parcel_result(record_id, map, data_version, boundary_hash, result jsonb, computed_at)`,
  primary key on all of the first four columns.
- `borewell_report(id, record_id, owner_subject, lat, lon, drilled_on, depth_ft, water_struck_ft,
  yield_inches, status [working|seasonal|dry|abandoned], suggested_rank, map_used,
  share_consent [private|anonymous_aggregate], created_at, updated_at)`.
  Drillers in Andhra Pradesh quote depth in feet and yield in inches; store
  what they say. Reports are private by default. Any shared figure is
  village-level, only from consenting reports, and only when a village has
  at least 5.

## Tests and fixtures

Fixtures that contain the founder's parcels stay **outside the repo**, in
`~/india-ref-data-crawlings/elevation/fixtures/`:

| Fixture | What it checks |
| --- | --- |
| `owner-parcel.kml` + `expected-owner-parcel.json` | SRTM pin 1 drains 14.8 ha; main stream about 530 ha, 32 m east, red area 530 ha; combined pins Medium (flat land) |
| `sloka-farms.kml` + `expected-sloka-farms.json` | SRTM pins drain 21–30 ha, High, with 3 of 3 maps agreeing; main stream 104 ha, 141 m north; height spread 23.5 m |
| `consultant-site1/`, `consultant-site2/` | His screenshot, its georeference and the imagery frame: SRTM must stay the best match, with at least 80% of his lines within 30 m at site 1 |

Regression rules for the terrain job (CI, `services/terrain/tests`):

- `water_flow.py` and the production job give the same pins, within one cell,
  on both parcel fixtures.
- A window whose bounds fall mid-cell gives the same geography as a
  whole-cell window. This guards pitfall 1.
- A side stream's `upslope_ha` is less than the stream it joins. This guards
  pitfall 2.
- AW3D30 and SRTM resampled onto the common grid agree within 1 m on a smooth
  synthetic surface. This guards pitfall 3.
- On a tilted synthetic plane every line runs straight downhill; on a flat,
  no lines appear.

How to re-run the validation is in `docs/specs/water-flow/README.md`.

## Pitfalls found in the prototype

1. **Fractional read windows.** `from_bounds` returns a window at a fraction
   of a cell. rasterio reads the rounded cells but `window_transform` keeps
   the fraction, so the data sits up to half a cell (15 m) from where it is
   labelled. Our first runs were 9 m off on the founder's land and 14 m off
   at consultant site 1. Most of the "18 m offset" we had blamed on the
   consultant's software was this bug. Always round windows to whole cells.
2. **The confluence vertex.** In pysheds' `extract_river_network`, each line
   ends on the confluence cell of the stream below. Taking a line's area as
   the maximum over all its vertices gave every side stream the main
   stream's area, so they drew thick and passed area filters.
3. **Pixel-is-point against pixel-is-area.** Never mix tiles by array index.
4. **pysheds returns cell corners**, so add half a cell to get centres. Lines
   already run downstream.
5. **pysheds 0.4 calls `np.in1d`**, which NumPy 2 removed; the prototype
   shims it.
6. **Flat land.** Under about 10–20 m of height spread within 1 km, the maps
   disagree on where the big stream runs. Cap confidence there and say so.
7. **Where the height spread is measured.** It is measured within 1 km of the
   parcel's area centroid. The mean of the boundary's corner points sat 160 m
   away on the Sloka parcel, and gave 18.5 m instead of 23.5 m, which turned
   High into Medium. Use the area centroid. Values near 20 m are fragile
   either way; consider showing the spread on the card.

## Rollout

1. Terrain job for Andhra Pradesh, with regression fixtures green.
2. Parcel API and the CloudFront path.
3. Web chip and card.
4. iOS and Android.
5. Pilot in 2–3 villages with borewell reporting; about 100 reports before
   the confidence weights are re-tuned.
6. India-wide, plus CartoDEM if it can be obtained.

Estimate for one engineer: about 6 weeks to steps 1–4. The pilot length
depends on the drilling season.

## Decisions reserved for Reddy

- The new Python dependencies in the job and the API: rasterio, pysheds,
  scipy, shapely (`dependency-change`).
- The public `/terrain/*` CloudFront path and the S3 prefix
  (`infrastructure-change`), and where the batch job runs: a laptop, ECS
  Fargate or spot EC2 (`cloud-cost-governance`).
- Consent wording and retention for borewell reports under the DPDP Act
  (`pattadar-security-review`).
- Whether the feature is free or part of a paid plan.
- Whether to pursue CartoDEM (Bhuvan login, licence).

## Open questions

- Which Andhra Pradesh borewell rules should the card warn about: WALTA
  distances from public drinking-water sources, and over-exploited villages?
  Confirm the current rules first.
- Smallest parcel to show pins for: under about 1 ha the parcel is a handful
  of cells. Show the nearest line instead?
- Should the red area use the nearest main-stream cell (as now) or the
  largest stream within 300 m?
