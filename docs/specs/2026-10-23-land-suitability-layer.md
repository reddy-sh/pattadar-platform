# Land suitability layer: proposal

Status: **phase 1 built (23/10/2026), not published.** Reddy said "go" on
23/10/2026; phase 1 uses this proposal's defaults (names, wording,
thresholds, weights, data sources). Phases 2–4 and the open decisions in § 9
still need him.

## 0. Phase 1 as built

- **Build:** `scripts/suitability-build.py` writes
  `<village>/suitability.json` beside each shipped map under
  `apps/web/public/vm`. It ran on all 8 shipped villages (1.3 MB in total).
  `scripts/vm-publish.py` now accepts that one optional file per village;
  publishing to production remains an operator act and has not been done.
- **Web:** a **Suitability** layer chip on a village's Cadastral map, in the
  layer row beside Extent. It shows only for a village that has grades. It:
  - shades each parcel by grade and opens a key with the acres per grade,
    the disclaimer and the data credits;
  - gives the grade and its reason in a selected parcel's card.

  Code: `apps/web/src/w360/suitability.ts`; `VillageCanvas.tsx`
  (`grades`); `pages/VillageMaps.tsx`.
- **Departures from the proposal:**
  - Suitability is a layer chip, like Extent, not a separate chip, because
    it shades parcels exactly as Extent does.
  - Waterlogging is measured as **low-lying ground**: how far a 30 m cell
    sits below the mean of the ~330 m around it (6 m or more scores 1,
    3–6 m scores 2). Flow accumulation would need pysheds in the build.
  - Each parcel's grade is the mean of its 30 m cells. A parcel smaller than
    a cell takes the cell at its centre. A parcel more than half tree cover,
    built-up land, water or wetland is "Not assessed".
- **First results** (Markapuram district):
  - 7,474 of 7,946 parcels grade **Best**, 11 grade Good and 461 are Not
    assessed. None grade Fair or Limited.
  - Rainfall (776–822 mm, which scores 3) is the limiting factor almost
    everywhere; slope is the next.
  - SoilGrids gives one texture (clay loam), pH 6.8–7.4 and organic carbon
    1.0–3.2% across all eight villages.
  - With these thresholds the layer barely separates neighbouring parcels.
    The SoilGrids pH and carbon here should be checked against local soil
    tests before anyone relies on them.
  - Retuning (§ 3 thresholds, or grading relative to the village) is
    Reddy's decision.

Decisions reserved for Reddy are listed in § 9.

## 1. What it is

A map that grades the land in a village, and on each property, for growing
field crops. It is built the way GIS suitability maps are built (example: the
Etche LGA map Reddy shared on 23/10/2026):

1. Several public map layers are each scored.
2. The scores are combined with weights into one score per pixel.
3. The score is cut into four classes.

The four classes follow the FAO land evaluation framework (1976): S1 highly
suitable, S2 moderately suitable, S3 marginally suitable, N not suitable.
Pattadar would use **owner-facing names** instead of those (see § 6).

Where it shows:

- **Cadastral maps:** a **Suitability** chip beside Climate. The whole village
  is shaded, plot by plot, with a key and an area table (acres per class),
  like the table in the corner of the example map.
- **A property's Location tab:** the same chip, with the boundary over the
  shading. A **Land suitability** card in the right column gives the share of
  the parcel in each class and the **main limiting factor**, for example "Fair:
  steep slope on the west side" or "Good: sandy soil holds less water".

The limiting factor is the useful part. An owner cannot change "Fair", but can
act on "steep slope" (bunding) or "acidic soil" (liming).

## 2. Inputs (all free, all already public)

| Factor | Source | Pixel | Licence | Note |
|---|---|---|---|---|
| Slope | Copernicus DEM GLO-30, SRTM, NASADEM, AW3D30 | 30 m | free, attribution | **Already on hand** for Hydrogeology (`services/api/src/terrain.py`) |
| Soil texture (clay, sand %) | ISRIC SoilGrids 2.0 | 250 m | CC BY 4.0 | 0–30 cm depth |
| Soil pH | SoilGrids 2.0 | 250 m | CC BY 4.0 | |
| Soil organic carbon | SoilGrids 2.0 | 250 m | CC BY 4.0 | |
| Rainfall, 30-year normal | CHIRPS 2.0 | ~5 km | public | annual and June–December |
| Land cover | ESA WorldCover | 10 m | CC BY 4.0 | decides what is graded at all |
| Waterlogging | flow accumulation from the same DEMs | 30 m | — | reuses the Hydrogeology arithmetic |

Licence terms must be re-checked at ingestion (`reference-data-ingestion`).

**Better soil data, where Pattadar has it.** India's Soil Health Card scheme
gives farmers a lab test of their own field: pH, organic carbon, N, P, K and
others. If the owner files a Soil Health Card under the property's documents,
its values replace SoilGrids for that parcel. The card would then say "from
your Soil Health Card of DD/MM/YYYY" instead of "from public maps". That turns
a 250 m estimate into a measurement of the field. Reading the card is a
separate AI-reading feature (async job, no automatic retry; invariant 3) and a
separate decision.

## 3. Scoring (starting proposal; the numbers are Reddy's to set)

Each factor is scored 4 (best) to 1:

| Factor | 4 | 3 | 2 | 1 |
|---|---|---|---|---|
| Slope | 0–2% | 2–5% | 5–10% | over 10% |
| Texture | loam, clay loam, silt loam | sandy loam, sandy clay loam | clay, loamy sand | sand |
| pH | 6.0–7.5 | 5.5–6.0 or 7.5–8.0 | 5.0–5.5 or 8.0–8.5 | below 5.0 or above 8.5 |
| Organic carbon | over 0.75% | 0.5–0.75% | 0.25–0.5% | under 0.25% |
| Rainfall (annual normal) | over 900 mm | 700–900 mm | 500–700 mm | under 500 mm |
| Waterlogging | well drained | — | low-lying | collects water most seasons |

Proposed weights: rainfall 25%, slope 20%, texture 20%, pH 15%,
organic carbon 10%, waterlogging 10%.

- **Combining:** score = Σ weight × factor score, so it runs from 1.0 to 4.0.
- **Class bands:** ≥ 3.25, 2.5–3.25, 1.75–2.5, < 1.75.
- **Limiting factor:** the factor that lost the most weighted points on that
  parcel.

**Not graded at all:** built-up land, water, and tree cover (WorldCover
classes 50, 80 and 10). These show as "Not assessed", never as "not
suitable". Forest is often not legally farmable, and a house is not poor land.

**Irrigation is the biggest gap.** A canal or bore well makes rainfall far
less important, and no public map says reliably which plots are irrigated.
Options:

- (a) Ask the owner: an "Irrigated (canal / bore / none)" fact on the property
  that drops rainfall's weight.
- (b) Infer it from Sentinel-2 crop-health seasons (crop in the dry season
  suggests water).
- (c) Leave it out and say so.

The proposal is (a) now and (b) later.

## 4. How it is computed

The calculation runs **once per village, not per view**. Reference rasters
are cut to the village outline from its cadastral map, the same outline the
Cadastral maps page already has. Inputs are resampled to a common 30 m grid
over that window.

**Outputs, all reference data with no owner in them:**

- a classified raster (one class byte per 30 m pixel);
- a colour PNG with its bounds, drawn as one image overlay (no tile server
  needed at village size);
- the per-plot class shares and the acres per class.

**Per property:** the class shares inside the saved boundary. These are
computed on request and cached by boundary hash, the same pattern as
`terrain_parcel_result`. An edited boundary is recomputed.

**Where it runs:**

- The Hydrogeology layer computes on the API host from local tiles, and its
  own `shortcut:` note says that must move to a batch job before deployment.
  Suitability should **not** copy that shortcut.
- Proposal: a batch script under `scripts/` that writes the village outputs
  as reference data. The API then only reads the outputs plus the per-boundary
  shares.
- The exact runtime (ECS task, or the founder's machine first) is an
  infrastructure decision.

**Recomputation:** whenever an input dataset or the scoring version changes
(a `DATA_VERSION` like terrain.py's).

## 5. Data and privacy

- **No calls at view time:** all inputs are global public datasets downloaded
  in advance, so nothing about a property leaves Pattadar.
- **Reference data:** village outputs contain no owner. They are like the
  village maps already served from `/vm`.
- **Owner data:** per-property shares are derived from the owner's boundary
  and are owner data. They stay behind the existing owner-only access check
  (`_record_kind`), as Hydrogeology's do.
- **Soil Health Card values** are owner data held in the owner's documents
  (invariant 8). They are never published into the village layer.

## 6. Wording (the sensitive part)

A grade on someone's land can move a sale price or a loan decision. Proposal:

- **Class names for owners:** **Best · Good · Fair · Limited**, plus **Not
  assessed**. Never "Unsuitable" on a person's property.
- **Every grade carries its reason:** the limiting factor and the data it came
  from.
- **Fixed disclaimer on the card and the key:** "An estimate from public
  satellite and soil maps (250 m soil, 5 km rain). A soil test of this field
  will be more accurate."
- **For general field crops only.** Crop-specific grades (paddy, cotton,
  chilli, mango) each need their own scoring and come later.
- **Never shown on public share links or in exports to others** unless the
  owner chooses to include it.

## 7. Accuracy limits, stated plainly

- Soil comes in 250 m blocks, so a 4-acre parcel (about 130 m square) usually
  sits inside **one soil block**. Most of the variation inside a parcel comes
  from slope and drainage. The card must not imply field-level soil knowledge
  unless a Soil Health Card was filed.
- Rainfall at about 5 km is the same across a village. It separates mandals,
  not neighbours.
- The weights are a judgement. Two agronomists would set them differently, so
  the key names the weights used.

## 8. Phases

1. **Village layer on Cadastral maps** (no owner data): slope, SoilGrids,
   CHIRPS, WorldCover; chip, key, area table. Proves the pipeline on the
   village maps in `data/vm`.
2. **Property card and chip:** per-boundary shares, limiting factor,
   disclaimer; the "Irrigated" property fact.
3. **Soil Health Card:** read the card (AI reading, async), then override the
   soil layers for that parcel.
4. **Crop-specific grades**, and irrigation inferred from Sentinel-2 seasons.

## 9. Decisions for Reddy

1. **Product promise and wording:** whether Pattadar grades land at all, and
   the § 6 names, disclaimer and visibility rules.
2. **Scoring:** the § 3 thresholds and weights, and whose authority they rest
   on (published Andhra Pradesh studies, an agronomist, or both).
3. **Data sources:** ingesting SoilGrids, CHIRPS and WorldCover as reference
   data, with their attribution in the key.
4. **Compute location:** the batch job's runtime and where its outputs are
   stored (infrastructure and cost).
5. **Irrigation:** option (a), (b) or (c) in § 3.
6. **Schema:** new tables for the village outputs and the per-boundary cache
   (additive), and the "Irrigated" property field.
7. **Soil Health Card reading:** phase 3, a new AI reading type.
