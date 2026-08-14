# Photos for every holding — capture, upload, gallery

**Date:** 2026-08-14
**Ask:** "for every property there are photos. allow user to take a picture
or upload photos for the properties."

## What exists, what's missing

"Property" in this platform is two entities, and the photo story is
lopsided:

- **Parcel** (agricultural, inside a passbook): the server has a complete
  photo backend — `parcel_photos` table, `ParcelPhotoType`,
  `addParcelPhoto` / `updateParcelPhoto` / `setCoverPhoto` /
  `deleteParcelPhoto`, owner-scoped `parcelPhotos(parcelId)`. The iOS app
  never calls any of it: `PhotoSection` renders metadata as text, shows no
  image, and offers no add button.
- **Property** (non-agri: open plot, flat, house): no photo concept
  anywhere — no table, no type, no UI.

The storage gateway already does everything bytes need: authenticated
multipart upload (`POST /api/gateway/storage/files`), streamed reads, and
on-the-fly `?thumb=<px>` JPEG downscaling (HEIC included) that today has
zero callers.

## Design

One rule: **a photo is a storage file plus an evidence row**. The row
(category, caption, GPS, captured-at, cover flag) lives beside the holding;
the bytes live in the storage gateway under the owner's prefix.

### Server (services/api)

Mirror the parcel photo block for properties, with the simpler direct
ownership check (`properties.owner_user_id = uid` — no passbook join):

- `property_photos` table: same columns as `parcel_photos` with
  `property_id` in place of `parcel_id`; same partial-unique cover index.
- `PropertyPhotoType`, `propertyPhotos(propertyId)` query (owner-scoped),
  and `addPropertyPhoto` / `updatePropertyPhoto` / `setPropertyCoverPhoto` /
  `deletePropertyPhoto` mutations.
- `propertyDossier` carries `propertyPhotos`, exactly as `parcelDossier`
  carries `parcelPhotos`.
- All mutations honour `x-idempotency-key` like the rest of the write
  surface.

### iOS — one gallery, two owners

- **`HoldingPhotos` gallery component** replaces the text-only
  `PhotoSection`: a thumbnail grid (cover badged), tap for full-screen,
  context menu for *Set as cover* / *Delete*, and an **Add photos** button
  offering *Take photo* (camera) and *Choose from library* (multi-select
  PhotosPicker). Used by both the parcel and the property detail screens
  ("On the land" / "On the property" tabs).
- **Offline-first add** through the existing `WriteQueue` outbox: a new
  photo entry kind copies the image bytes to durable storage first, then on
  drain uploads to the storage gateway (checkpointing the node id), then
  calls the add-photo mutation with the entry's idempotency key. Photos
  taken in the field with no signal upload themselves when the network
  returns — same behaviour as document filings today.
- **Pending photos are visible immediately**: the gallery merges queued
  entries (rendered from their local bytes, marked as uploading) with
  server rows.
- **Thumbnails** come from the gateway's `?thumb=` endpoint through a small
  authenticated loader with a disk cache in `Caches/thumbs/` (the location
  the offline-architecture spec already reserved) and an in-memory layer.
  Full-screen fetches `?format=web`. A photo just added renders from its
  local copy without any network.
- **Evidence metadata, cheaply**: camera captures stamp `capturedAt` now
  and attach the device location when permission is already granted;
  library picks read EXIF date/GPS when present. Nothing prompts for new
  permissions beyond the camera itself (`NSCameraUsageDescription`).
- Cover selection stays explicit (the server deliberately never
  auto-covers).

### Out of scope (deliberately)

- The SwiftData `FileRecord` migration and background-`URLSession`
  download tiers from the offline spec §5 — this feature takes only the
  `Caches/thumbs/` idea; the bigger refactor lands with the offline
  workstream.
- Passbook photos (a passbook is a document bundle, not land).
- Editing captions/categories on iOS beyond what add provides — the server
  mutation exists; UI can follow when it earns its place.

## Testing

- API: pytest mirroring the parcel-photo tests — owner scoping, add/list/
  cover/delete, idempotent add, dossier inclusion.
- PattadarKit: decode/encode tests for the new models and queue entry;
  queue drain checkpointing.
- End-to-end on the local stack: upload a real image via the gateway,
  attach to a seeded u01 property and parcel, list, thumb-fetch.
- `apps/ios/verify.sh` green on all destinations.
