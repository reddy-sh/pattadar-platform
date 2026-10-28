# Rainfall card (phase 1 of field-map climate layers)

Approved by Reddy on 23/10/2026 (provider, product wording, schema).

## What it is

A **Rainfall** card on a record's Location tab, in the right column under
Location. It shows area rainfall for the NASA POWER grid square the land sits
in:

- rain over the last 7 days and the last 30 days;
- rain since 1 June (the season), compared with the 1991–2020 normal for the
  same span ("18% below normal"; within 5% reads "Close to normal");
- the high and low temperature over the last 7 days.

The card always says this is area rainfall for a ~60 km grid square, not a
gauge on the land, and gives the date of the latest day. There is no forecast.

States:

- **Hidden:** the record has neither a pin nor a boundary.
- **Loading:** row skeletons.
- **Failed:** the shared `Failed` panel with Try again.

## Contract

`Query.web.rainfall(recordId, retry=false) → RainfallView | null`. The result
is `null` when the record is not the caller's (owner-only `_record_kind`). The
field is used by the web app only; iOS parity is NOTE.

| Code | Path |
|---|---|
| Server | `services/api/src/weather.py`, resolver in `services/api/src/web360.py` |
| Web | `useRainfall` / `useRetryRainfall` in `apps/web/src/w360/api.ts`; `apps/web/src/w360/RainfallCard.tsx` |
| Tests | `services/api/tests/test_weather.py` |

## Provider and privacy

- **Location sent:** the record's point (its pin, otherwise its boundary
  centre) is snapped to its POWER grid cell (½° lat × ⅝° lon) before any
  request leaves the server. NASA receives only the cell centre.
- **Cache:** the `weather_cell` table (additive) is keyed by cell and kind
  (`daily`, `normal`). It holds no owner and no record id. Daily figures are
  refreshed after 6 hours; the normal is fetched once per cell.
- **Failures:**
  - A failure is remembered for 10 minutes.
  - Only Try again (`retry`) asks POWER again sooner.
  - When POWER fails, a stale copy is served if one exists.
  - A read-only GET is never repeated automatically.

## Known provider defect (checked 23/10/2026)

POWER's **daily** endpoint reports rainfall 24 times too high for its newest
days, which come from GEOS-IT (near real time). For example, on 15/10/2026 at
16.0° N, 80.0° E the daily endpoint gave 744 mm, while the hourly endpoint's
24 hours add up to 31 mm. Days served from MERRA-2 match the monthly totals.

The workaround:

- The last 92 days are summed from the **hourly** endpoint. This covers
  MERRA-2's lag of one to two months.
- Older days come from the daily endpoint.
- A daily window that still contains GEOS-IT is refused, and so are
  unexpected units: the card shows Failed instead of a wrong figure.

If POWER fixes the daily endpoint, the hourly read can be dropped.

## Climate map chip (approved by Reddy, 23/10/2026)

A **Climate** chip on the Location map, beside Satellite, Measure and
Hydrogeology. It shows for any record with a boundary or a pin, and takes
turns with Measure and Hydrogeology. Turning it on:

- zooms out to the district around the land (zoom 8), marking the property
  with a gold dot, because the boundary is smaller than a pixel at that zoom;
- lays a NASA GIBS layer over the basemap at 70% opacity;
- opens a key on the map with four layer chips, NASA's own colour scale, the
  date of the picture and a note on resolution.

Turning it off returns the map to the parcel.

| Chip | GIBS layer | Data resolution | First date tried |
|---|---|---|---|
| Rainfall | `IMERG_Precipitation_Rate` (mm/hr) | ~10 km | today − 2 |
| Temperature | `MODIS_Terra_Land_Surface_Temp_Day` (shown in °C) | ~1 km; gaps are cloud | today |
| Soil moisture | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` (% water by volume) | ~9 km | today − 4 |
| Crop health | `MODIS_Terra_NDVI_8Day` | ~250 m | today − 1 |

How it works:

- **Dates:** NASA publishes some days late or skips them, and a missing date
  returns 404 for every tile. When every tile on screen fails, the map tries
  the day before, up to 10 days back. The key says which date loaded, or that
  none did.
- **Colours:** the key's colours and end values come from each layer's GIBS
  v1.3 colour map, fetched at run time (GIBS allows any origin). The code
  holds no colour literals.
- **Privacy:** the browser fetches tiles from NASA directly; no Pattadar
  service is involved. NASA sees only the map area being viewed.

**Cadastral maps** (rail → Cadastral maps) has the same chip, beside Numbers
and Measure on satellite, on a village's map and on the all-villages
overview:

- It zooms out to zoom 8 around whatever is on screen and opens the same key
  in the top-left stack.
- Turning it off returns to the exact view that was left.
- Measuring and marking a boundary need the parcels up close, so starting
  either turns Climate off, and the chip is disabled while measuring.
- Opening another village, or going back to the overview, starts with Climate
  off.

Code:

- `apps/web/src/w360/climateLayers.ts`: the layers, dates and colour key.
- `climateTiles.ts`: the shared Leaflet layer and its date fallback.
- `ClimateKey.tsx`: the on-map key.
- The `climate` prop of `MapCanvas.tsx` and `VillageCanvas.tsx`.
- The chips in `pages/RecordBoundary.tsx` and `pages/VillageMaps.tsx`.

## Later phases (each needs its own approval)

- **Phase 2:** Sentinel-2 NDVI overlay and season history, with
  stable-high / stable-low / swinging zones. These are the satellite stand-in
  for the yield stability zones that yield maps give (Cotton Grower / UGA).
- **Phase 3:** rain and cyclone alerts. These need a forecast provider and a
  scheduler decision.
- **Phase 4:** location-tagged notes and photos drawn on the boundary map.
