# Village maps

The revenue village's own shape file — one polygon per survey plot, as issued
by the survey department. Nine files here cover eight villages: `CHINTHAGUNTA`
alone is 2,100 plots.

The KMZ is the **source**. The browser never reads it: it is written for
desktop GIS, at 15 decimal places, inside a zip. Convert the folder with

    python3 scripts/village-map-import.py data/vm

which writes `apps/web/public/vm/<village>.geojson` — the same plots at 6
decimals (~0.11 m, finer than any FMB corner), about 100 KB over the wire —
and the `index.json` the browser looks a village up in.

Keep both. The KMZ is what the department gave us and what a dispute would be
argued from; the GeoJSON is a derived artefact and can be rebuilt at any time.

## Two files, one village

The older exports (Komarolu and Podili mandals) do not put the plot number on
the plot. `Burada_Palem.kmz` is 219 polygons every one of which is named
"Burada Palem"; the numbers are in `Burada_Palem_Label.kmz`, as label points
floating over them. Neither half is a map. The importer pools the labels across
every file it is given and asks which polygon each one stands in, so the pair
converts into one village with plots 1–219 — which is why both files are kept
here and why the folder, not the file, is the thing to convert.

## Duplicates

Files are grouped by folded village name (`villageKey`, the same fold the
records use, so "Chintagunta" and "CHINTHAGUNTA" are one place). Only the best
set is written: most plots that end up numbered, then fewest left nameless,
then the smaller source. Every file that loses is printed with the reason.

That is how `asw.kml` — a 806 KB Google Earth working copy of Burada Palem,
carrying a hand-drawn shape and a measurement that are not plots — was left
out in favour of the department's own 30 KB export. It is not kept here.

## Uploading instead

`/app/villages` takes a KMZ or KML directly, for anyone who has one and no
reason to open a terminal. Those are stored in the database rather than the
bundle and shadow the shipped map of the same village, so re-uploading is how
you correct one. Same parser (`services/api/src/villagemap.py`), so a village
uploaded there and one built here cannot come out different.
