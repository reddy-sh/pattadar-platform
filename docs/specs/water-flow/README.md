# Water flow layer: prototype and validation

Supporting material for [the design](../2026-10-13-water-flow-layer.md). Nothing here runs in production.

| Path | What it is |
| --- | --- |
| `prototype/water_flow.py` | Reference implementation for one parcel: lines, drainage areas and bore-point suggestions for each map and the combined map, as GeoJSON. The production terrain job must reproduce its output on the fixtures. |
| `prototype/compare_with_consultant.py` | Validation: share of the consultant's drawn lines that fall within 30 m of ours, against chance, per map and line threshold. |
| `prototype/offset_test.py` | Validation: the constant shift that best lines his lines up with ours. |
| `prototype/download_dem.py`, `tiles_india.csv` | Downloads the four elevation maps for all 368 India tiles (26.6 GB) and checks every file's size. |
| `reference/simulator.html` | UI reference: the interactive prototype with its data removed. |

## Data and fixtures (outside the repo)

- Elevation maps: `~/india-ref-data-crawlings/elevation/{srtm,nasadem,aw3d30,copernicus}/` on the founder's Mac.
- Fixtures: `~/india-ref-data-crawlings/elevation/fixtures/`. They hold the founder's own parcels and the
  consultant's video frames, so they are kept out of git on purpose. Ask Reddy for a copy.

## Run

Python 3.10+ with numpy, scipy, rasterio, shapely, pysheds (and opencv-python, scikit-image for the
comparison tools).

```sh
E=~/india-ref-data-crawlings/elevation
python3 -I prototype/water_flow.py --elevation $E --boundary $E/fixtures/owner-parcel.kml --out /tmp/owner.json
# compare with $E/fixtures/expected-owner-parcel.json: same pins, catchment areas and confidence

F=$E/fixtures/consultant-site1
EXTRA="nasadem:$E/nasadem/NASADEM_HGT_n13e078.tif,aw3d30:$E/aw3d30/ALPSMLC30_N013E078_DSM.tif" \
python3 -I prototype/compare_with_consultant.py $F/screenshot.png $F/georef.json $F/frame.json \
  $E/copernicus/Copernicus_DSM_COG_10_N13_00_E078_00_DEM.tif /vsigzip/$E/srtm/N13E078.hgt.gz /tmp/site1
python3 -I prototype/offset_test.py $F/screenshot.png $F/georef.json $F/frame.json /tmp/site1/win_srtm.tif 10
```

Expected at site 1: SRTM first, about 85% of his lines within 30 m (chance 54%), best shift under 10 m.
Site 2 uses the N17E078 tiles, `$E/fixtures/consultant-site2/` and line threshold 3.
