---
name: functional-acceptance
description: "Use this skill when a change touches a Pattadar surface that creates, reads, updates, deletes, uploads or adds content (records, passbooks, parcels, properties, documents, photos, members, shares), including its controls, styling and empty/loading/error states, to prove every operation and its failure path end to end in the local app. Not for global token or theme changes (design-system-governance) or choosing checks alone (verify-change)."
compatibility: Runnable mutation instruments cover apps/web only (sealed e2e-app, disposable-DB e2e-web360); native iOS live suites are approval-gated and Expo has none, so both report NOT_RUN by default. Never point mutating runs at founder/production data or claim live evidence not obtained.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
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
tag/note, share, reorder. A change to such a surface's empty, loading, or error
state, its controls, or its styling still fires this skill, because the empty
state is one state of a CRUD feature, not the feature. Global token, theme,
font, or icon changes made outside such a surface do not.

Surfaces include records, passbooks, parcels, properties, documents, photos, groups, members, tickets, notes and shares, and the check usually means running or clicking through the local app.

## Operation inventory — enumerate before verifying

List every operation the surface exposes and its expected result AND its
failure result. Do not stop at the happy path. For a media/document surface the
inventory is at least:

- **Create / upload**: the file reaches storage, a row is filed, and it appears
  in the gallery/list with its metadata — and in Documents under its feature
  folder, named for whose it is, never by an Aadhaar number (invariant 8 in
  `.Codex/rules/pattadar-standards.md`). An upload that never reaches
  Documents is FAIL. The failure path (storage unreachable, oversize, wrong
  type) shows one honest message and files nothing partial.
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

- **Sealed `e2e-app`** (apps/web): answers every `/api` call from fixtures, so
  it verifies the client-side operation logic and its failure handling with no
  real backend, DB, or storage. It drives the dev server already running at
  `APP_WEB_URL` (default :5180) and never starts or stops it. Proves the flows,
  not the wiring.
- **Disposable `e2e-web360`** (apps/web): starts its own API (:18080) on a
  disposable DB and a built bundle (:5175) as `w360-demo`, so it proves real
  GraphQL/DB mutations. Storage is NOT real: the gateway proxy points at an
  unused port (:15182) and specs answer storage from an in-browser byte store
  (`withStorageFixture`), so a green run proves nothing about gateway or MinIO.
  `TEST_PG_DSN` must name a database ending in `_test`, `_ci` or `_e2e` (such
  as `pattadar_e2e`, which both guards accept), initialized first with
  `APP_PG_DSN=<same dsn> .local/api-venv/bin/python scripts/init-test-db.py`.
  State the exact scope and get approval before standing that up.
- **Real storage bytes** (browser → gateway → MinIO): no suite covers it;
  `services/gateway/tests` check the contracts against a fake S3. Proving it
  needs the founder's running stack and a Bearer from
  `POST :8082/local-auth/token` — explicit approval first, a throwaway user,
  never founder records. Otherwise report the storage leg NOT_RUN.
- **Native iOS** (`apps/ios/PattadarKit`): a default `swift test` covers pure
  logic only. `LiveAPITests`, `CRUDTests`, `PhotoTests`, `WriteFlowTests`
  (`PATTADAR_LIVE_API_TESTS=1`) and `UploadTests`
  (`PATTADAR_LIVE_UPLOAD_TESTS=1`) return early and still show as passed, so
  report their operations NOT_RUN. Enabled, they write through whatever DB backs
  :8080, and `UploadTests` sends a real deed to the paid extraction provider
  and retries once (against invariant 3). Never set the flags without explicit
  approval and a disposable DB behind :8080.
- **Expo** (`apps/mobile`): no mutation instrument; `tests/e2e-mobile` holds
  three hand-run Maestro smoke flows. Report its operations NOT_RUN.

If no instrument can run, report each operation BLOCKED or NOT_RUN with the
reason — do not present typecheck/build as functional proof, and do not claim
an operation works because its code looks right.

## Distinguish a code defect from a missing backend

A failing operation is one of two things, and they need different fixes: a
defect in the request/handler, or a dependency that is not running (local dev
has no cloud storage unless `scripts/start-local.sh` brought up MinIO and the
gateway). Before reporting, determine which — check whether the service is up
rather than guessing. A correct app reporting a real outage is not a UI bug; a
whole feature that cannot be exercised locally is still a gap worth naming.

That stack is the founder's, on his real local records: api :8080, assistant
:8081, gateway :8082, MinIO :9000, web :5173 (real sign-in) or :5180
(`LOCAL_AUTH=mock`, where the Vite proxy asks as `DEV_USER_ID`, default
`shankarreddy.t`). Never start, stop, or rerun it — a rerun kills every
listener on 8080–8082. Probe it read-only (`curl -fsS localhost:8080/health`,
`:8082/health`). Mutating on :5173/:5180 by hand, the built-in `run`,
Playwright MCP, or Codex in Chrome needs explicit approval first, and that
evidence is labelled unsealed. A demo uses `bun run dev:demo` in apps/web
(`w360-demo` on :5175; it needs a disposable-DB API on :18080).

## Report

Report each operation with the vocabulary in
[evidence-and-status.md](../test-governance/references/evidence-and-status.md):
PASS / FAIL / BLOCKED / NOT_RUN / SKIPPED, the instrument, tests collected
versus executed, and what a failure's message and partial-state behaviour were.
An operation covered only by a `test.fail()` marker is FAIL (a known defect),
never PASS. Hand harness design to `test-governance`, execution to
`verify-change`, contract questions to `backend-contract-change`, and
interaction/affordance review to `design-system-governance` /
`web-feature-delivery`. This skill owns one question only: was every operation
actually exercised?
