# Village maps

The revenue village's own shape file — one polygon per survey plot, as issued
by the survey department. The KMZ is the **source**; the browser never reads
it. The importer turns it into GeoJSON at 6 decimals (~0.11 m).

Keep both. The KMZ is what the department gave us and what a dispute would be
argued from; the GeoJSON is a derived artefact and can be rebuilt at any time.

## Addressed by state, district, mandal, village

A village name is not an address. The 2021 Prakasam archive has MYLAVARAM in
Addanki and in Chimakurthi and POTHAVARAM in four mandals, so a map lives at
`mapKey(state, district, mandal, village)` (`packages/core`, twin `map_key` in
`services/api/src/village_map.py`), every segment folded by `villageKey`:

    ap/markapuram/konakanamitla/chintagunta.geojson

The district is the one the mandal has **today** in
`services/api/data/mandals.csv` (AP-IGRS), not the one on the archive. The 2021
"Prakasam" archive's mandals now sit in Prakasam, Markapuram, Bapatla and SPSR
Nellore. A record that names only a village still finds it when the name is
unique; a shared name needs the record's mandal or district
(`apps/web/src/w360/villageResolve.ts`), and without either there is no map
rather than a guess.

## Manifests: nothing is placed or paired by guess

Every source folder has a manifest:

- `placement.json` — this folder. Eight resurvey (LP-numbered) exports, each
  file placed by `DISTRICT_CODE-MANDAL_CODE`. A newer, finer edition than the
  2021 archive for the same villages (Chinthagunta 2,100 plots against 276),
  so it is listed first in a full build and wins at a shared address.
- `sources/prakasam-2021.json` — the 2021 archive (1,810 KMZs, 56 mandal
  folders, kept off-repo). It maps each mandal folder to its reference mandal,
  records provenance and checksum, and pairs the eight label sheets whose file
  names are misspelt (`_Lable`, `_Laybel`, …) to their polygon files by hand.
  Authority and licence are still marked **UNCONFIRMED**.

A file the manifest does not place is rejected with the reason.

## Building

    # The small fixture in apps/web/public/vm (dev server, e2e suites, bundle):
    python3 scripts/village-map-import.py data/vm

    # The full dataset, for S3:
    python3 scripts/village-map-import.py --out .local/vm-build \
        data/vm "<archive>/Prakasam=data/vm/sources/prakasam-2021.json"

Add `--dry-run` to report without writing. Every run prints the reconciliation
(files in = used + duplicate + superseded + rejected, keys unique) and refuses
to write if it does not balance, and it writes a receipt with every input and
output checksum to `.local/vm-receipts/`. The receipt holds local paths, so it
is never published.

Output, per build:

    catalog.json                                   every mandal
    index.json                                     every village, no geometry
    overview.json                                  every outline, global view
    <state>/<district>/<mandal>/overview.json      one mandal's outlines
    <state>/<district>/<mandal>/<village>.geojson  the plots

The browser reads the index to find a record's village. With no Area filter it
loads the root `overview.json` and fits every village in the list; District
filters that same global answer, and Mandal loads its smaller overview. The
root outline file is about 13 MB for this archive, so it is served and cached
as one S3/CloudFront object rather than 56 requests.

## Serving

In AWS, `/vm/*` goes to the persistent village-maps bucket through CloudFront.
See `docs/runbooks/village-maps-publish.md`. Locally, `vite dev` serves
`.local/vm-build` whenever it exists and `apps/web/public/vm` otherwise. Use
`VM_DIR=<dir>` to point elsewhere, or `VM_DIR=off` for the fixture only.
`vite preview`, which the e2e suites use, serves the fixture unless `VM_DIR` is
set.

## Two files, one village

The older exports (Komarolu and Podili mandals, most of the 2021 archive) do
not put the plot number on the plot. `Burada_Palem.kmz` is 219 polygons every
one of which is named "Burada Palem"; the numbers are in
`Burada_Palem_Label.kmz`, as label points floating over them. The importer
pools the labels across a village's files and asks which polygon each one
stands in. That is why both files are kept, and why the folder, not the file,
is the thing to convert.

Files are grouped by folded village name within one mandal. Only the best set
is written: most plots that end up numbered, then fewest left nameless, then
the smaller source. Every file that loses is reported.

## Uploading instead

`/app/villages` takes a KMZ or KML directly. Those are stored in the database,
keyed by village name only. An upload replaces the shipped village of that name
when there is exactly one. When several mandals share the name, it is listed on
its own without a mandal. Same parser (`services/api/src/village_map.py`).
