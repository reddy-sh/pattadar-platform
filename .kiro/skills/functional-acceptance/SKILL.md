A
---
name: functional-acceptance
description: Use this skill whenever a change touches a data-mutating surface in Pattadar — any create, read, update, delete, upload/attach, or add-content operation on records, passbooks, parcels, properties, documents, photos, groups, members, tickets, notes, or shares — to prove every operation of that surface actually works end to end (including its failure path) before it is called done, rather than stopping at typecheck, build, or a passing empty state.
compatibility: Requires pattadar-platform apps/web or apps/mobile plus the sealed e2e-app harness or a disposable-DB e2e-web360 run. Never point mutating runs at founder/production data or claim live evidence not obtained.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Functional Acceptance

A feature is not done because it compiles, builds, or renders. It is done when
every operation a user can perform on it has been exercised and observed to
work — and to fail safely. Typecheck and build prove the code is well-formed;
they say nothing about whether uploading, deleting, editing, or adding content
actually happens. This skill closes that gap. It is the answer to "have you
checked the full functionality, not just the empty state?"

## When this fires

Any change to a surface where the user creates, reads, updates, deletes, or adds
content — upload/attach a file, edit a caption or field, delete a row, add a
tag/note, share, reorder. An empty-state or styling change to such a surface
still fires this skill, because the empty state is one state of a CRUD feature,
not the feature.

## Operation inventory — enumerate before verifying

List every operation the surface exposes and its expected result AND its
failure result. Do not stop at the happy path. For a media/document surface the
inventory is at least:

- **Create / upload**: the file reaches storage, a row is filed, and it appears
  in the gallery/list with its metadata. The failure path (storage unreachable,
  oversize, wrong type) shows one honest message and files nothing partial.
- **Read**: the stored bytes come back and render (thumbnail and full size),
  including a legacy/absent ref degrading to a placeholder, not an error.
- **Update / add content**: a caption, tag, cover choice, or field edit persists
  and survives a reload/refetch, and lands on the right row when the list moves.
- **Delete**: the row is removed, references elsewhere behave as documented, and
  a failed delete says so rather than looking dead.

Empty state, loading, and error states are part of the inventory, not extras.

## Exercise it, do not assume it

For each operation, run it, not read it. Choose the instrument with
`test-governance` and execute with `verify-change`:

- **Sealed `e2e-app`**: intercepts every `/api` call, so it verifies the
  client-side operation logic and its failure handling with no real backend,
  DB, or storage. Fastest true functional check; safe to run. Proves the flows,
  not the live gateway.
- **Disposable `e2e-web360`**: real API/DB/storage wiring — the only instrument
  that reproduces a genuine upload/delete against the gateway and MinIO/S3. It
  needs a disposable `TEST_PG_DSN`, a served bundle, and local storage; state
  the exact scope and get approval before standing that up. Never point it at
  founder/production data.

If neither can be run in the current environment, say so explicitly and report
each operation as UNVERIFIED with the reason — do not present typecheck/build
as functional proof, and do not claim an operation works because its code looks
right.

## Distinguish a code defect from a missing backend

A failing operation is one of two things, and they need different fixes: a
defect in the request/handler, or a dependency that is not running (local dev
has no cloud storage unless `scripts/start-local.sh` brought up MinIO and the
gateway). Before reporting, determine which — check whether the service is up
rather than guessing. A correct app reporting a real outage is not a UI bug; a
whole feature that cannot be exercised locally is still a gap worth naming.

## Report

State each operation and its status: worked / failed / unverified, the
instrument used, and what a failure's message and partial-state behaviour were.
Hand harness design to `test-governance`, execution to `verify-change`,
contract questions to `backend-contract-change`, and interaction/affordance
review to `design-system-governance` / `web-feature-delivery`. This skill owns
one question only: was every operation actually exercised?
