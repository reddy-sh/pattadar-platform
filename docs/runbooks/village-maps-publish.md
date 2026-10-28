# Village maps: build and publish `/vm/*`

Shipped village maps are public survey reference data. They are built at the
desk from KMZ archives and served from a persistent S3 bucket through the web
CloudFront distribution at `/vm/*`. They are not in the SPA bundle: the 2021
Prakasam archive alone builds to ~132 MB, 902 villages in 56 mandals. Format and
addressing are in `data/vm/README.md`.

Publishing is an operator act on AWS. CI does not publish maps. Each step below
that touches AWS needs Reddy's explicit approval for that environment.

## Where it lives

| Piece | Owner | Notes |
|---|---|---|
| `pattadar-<env>-vm-<account>` bucket | persistent (`modules/persistent/village_maps.tf`) | private, versioned, SSE-S3, public access blocked; survives platform-down |
| bucket policy (CloudFront OAC read, TLS only) | runtime (`modules/runtime/cloudfront.tf`) | names the distribution; gone while runtime is down |
| `/vm/*` origin + cache behavior | runtime | only when `enable_cdn` and the persistent output exists (`village_maps_origin_enabled`) |

Dev has `enable_cdn = false`, so it has no `/vm/*` origin. Use `VM_DIR` locally.

## 1. Build and reconcile (local, no AWS)

    python3 scripts/village-map-import.py --dry-run --out .local/vm-build \
        data/vm "<archive>/Prakasam=data/vm/sources/prakasam-2021.json"

Check the printed summary before writing:

- `balanced: true`: files in = used + duplicate + superseded + rejected.
- `keysUnique: true`.
- Every `REJECTED` line has an explanation you accept. On the 29/09/2026 build
  the only rejects were `Kandukur/Mekapadu.kmz` and its label sheet, whose
  labels fall outside the polygons.
- `SUPERSEDED` lines are the eight resurvey villages in `data/vm`, which win
  over the 2021 edition.

Then drop `--dry-run`. The receipt lands in `.local/vm-receipts/`.

Look at it before publishing:

    VM_DIR=../../.local/vm-build bun run dev:web     # then /maps

## 2. Apply the infrastructure (approval required)

This is a persistent apply followed by a runtime apply, in the usual order
(`docs/runbooks/up-down.md`). Review the plan before applying. Expect:

- persistent: +1 bucket, plus versioning, encryption, public access block,
  ownership controls, lifecycle and 3 outputs.
- runtime: +1 bucket policy, plus an origin and a `/vm/*` behavior on the
  existing distribution. It is an in-place distribution update, no replacement.

Until the bucket has objects, `/vm/*` answers 403 from S3 and the Maps screen
shows no shipped villages (uploads still work). Publish straight after the
runtime apply.

## 3. Publish (approval required)

    BUCKET=$(terraform -chdir=infra/terraform/envs/prod/persistent output -raw village_maps_bucket_name)
    DIST=$(terraform -chdir=infra/terraform/envs/prod/runtime output -raw cloudfront_distribution_id)
    python3 scripts/vm-publish.py --bucket "$BUCKET" --distribution "$DIST"            # dry run
    python3 scripts/vm-publish.py --bucket "$BUCKET" --distribution "$DIST" --execute

The script:

1. Publishes under the bucket's `vm/` prefix: CloudFront forwards `/vm/<key>`
   unchanged (the origin has no `origin_path`), so a key at the bucket root
   answers 403.
2. Refuses a build with any file no manifest names, any name outside `[a-z/]`,
   or duplicate keys. Receipts and local paths cannot be published.
3. Uploads the GeoJSON first (`max-age=86400`), then the manifests
   (`max-age=300`).
4. Deletes stale keys under `vm/`.
5. Invalidates `/vm/*`.

## Verify

- `https://<domain>/vm/catalog.json` lists 56 mandals.
- `/vm/index.json` and `/vm/overview.json` each list 902 unique village keys.
- With no Area filter, `/maps` lists and fits all 902 outlines globally.
  District and Mandal filters narrow both the list and map to the same scope.
- A parcel filed in a village with a shared name (e.g. MYLAVARAM, mandal
  Addanki) shows Addanki's plots.

## Elevation tiles (Hydrogeology)

The Hydrogeology reading (`services/api/src/terrain.py`) works out water flow
for one parcel from four elevation maps. In AWS the api reads them from this
same bucket, under `dem/{source}/{file}` (`TERRAIN_DEM_BUCKET`), fetches each
tile it needs on first use and keeps it on its disk; `/vm/*` never serves that
prefix. Publish once per data version (approval required):

    BUCKET=$(terraform -chdir=infra/terraform/envs/prod/persistent output -raw village_maps_bucket_name)
    python3 scripts/dem-publish.py --bucket "$BUCKET"            # dry run: tiles and GB per source
    python3 scripts/dem-publish.py --bucket "$BUCKET" --execute

Order: publish the tiles, then apply the runtime root, then release the api
(an apply alone does not roll the running service). The default box is
Andhra Pradesh (12–20°N, 76–84°E, about 3.7 GB). A parcel outside the
published box answers "There is no elevation map for this area yet." as a
failure, so Try again works once its tiles are published. A reading takes
about 65 s at the api's CPU share, peaks near 0.95 GiB in a child process that
exits after each reading (hence `api_task_memory = 1500`), and gives up after
8 minutes.

shortcut: the tile cache sits in the api container's writable layer, at most
the published box (~3.7 GB of the host's 30 GB), refetched after each deploy;
move it to a host volume or cap it before widening the box beyond a state.

## Roll back

The bucket is versioned and keeps noncurrent versions for 90 days. To undo a
publish, publish the previous build (the importer is deterministic from the
same sources and manifests), or restore object versions. To stop serving from
the bucket entirely, revert the runtime `/vm/*` behavior and apply. `/vm/*` then
falls back to the small fixture in the SPA bundle.

## Adding an archive

Add `data/vm/sources/<id>.json`, with every mandal folder mapped to a
`DISTRICT_CODE-MANDAL_CODE` from `services/api/data/mandals.csv`. Map to the
mandal's district today, not the one on the archive. Pair misspelt label sheets
by hand. Record authority, licence and checksum. Then rebuild with every source,
newest edition first.
