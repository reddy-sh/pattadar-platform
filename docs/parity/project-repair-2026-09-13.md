# Review closeout — 13 September 2026

Scope: what remained of `.local/reviews/project-review-2026-09-12.md` after the
repair passes of 12 September. Findings 1–5, 7–12, 14, 15 and 17 were verified
closed against the working tree before any change was made here; this covers the
residue of 6, 13, 16 and 18, plus two hazards found while verifying.

## Verified already closed — no work done

Eleven of the eighteen findings were fixed on 12 September and are recorded in
`project-repair-2026-09-12.md` and the runbooks. Re-confirmed by reading the
current code, not by trusting the log:

| # | What now holds |
|---|---|
| 1 | `principal_id_from_claims` hashes `[iss, sub]`; the email-stripping path is reachable only under the local issuer + `LocalTrust` |
| 2 | `public_graphql.py` parses the document and compares root selection names |
| 3 | `_verify_by_token` locks `FOR UPDATE`, checks expiry, consumes the token, rejects replays |
| 7 | `create_share_link` mints a token, stores only its SHA-256, freezes a manifest; `/share/:token` → `RecipientAccess` serves it |
| 8 | `attachmentManifest` is re-validated server-side by `capabilities.snapshot()` and dispatched as a real link |
| 9 | `accept_ticket`/`cancel_ticket` run inside `_ticket_transaction()` with `SELECT … FOR UPDATE` |
| 11 | Attachment bytes go to S3 or a BYTEA column; no ECS volume needed |
| 12 | Deploy fires on `workflow_run` success for an exact SHA and refuses an obsolete one |
| 14 | MultiPolygon selection sorts by `ringAreaSqM`, not vertex count |
| 15 | Unknown-kid refresh is forced, serialized and cooldown-bounded |

## Repaired here

### Finding 13 — checks that were not gates

- Every `scripts/*-tests.ts` now runs in CI, **discovered by glob rather than
  enumerated**. Twelve of the fifteen assertion scripts ran nowhere; a hand-listed
  step is what let that happen, so the list is gone. All fifteen pass.
- `apps/web/src/lib` joined the `bun test` paths — `zip.test.ts` was the one unit
  test file no gate executed. 65 tests across 9 files now run, which is all of them.
- `pytest scripts/tests` now runs. `deploy-release.py` decides what reaches
  production ECS and its nine tests gated nothing. They pass.
- `maps.config.ts` now runs in CI. `map-drawing.spec.ts` and
  `map-portfolio.spec.ts` are `testIgnore`d by the default config and executed
  nowhere; that is 18 tests across 3 files, including boundary drawing.

**Running it found the rot an ungated test collects.** `map-portfolio.spec.ts`
still asserted the pre-Bloom copy — it waited for the text `No matching land`
and a button called `Clear search and filters`. The screen has said
`Nothing matches “<query>”` with a `Clear search` button for weeks. The app was
right and the test was stale; the empty state quotes the query back and offers a
working way out, which is the standard. The spec now asserts what the screen
actually says, so it can rot no further. This is the whole argument for the gate:
a test nothing runs is not a safety net, it is a document decaying in place.

**And a second, harder one: a race.** `map-drawing.spec.ts`'s corner-drag test
failed one full run in three, landing 6.8px off (-96.77 where it expected -90),
while passing every time it ran alone. Entering redraw calls `map.fitBounds`, and
`FIT` in `MapCanvas.tsx` sets no `animate: false`, so Leaflet animates it. The
corner markers exist as soon as the draft renders, so `toHaveCount(4)` resolves
while the frame is still sliding underneath them — the test was measuring an
animation and then asserting exact pixels against it. `restingBox()` in
`mapsHarness.ts` now waits for the element to stop moving before any pixel
measurement. The app was not at fault; the measurement was taken too early.

### Two hazards found while verifying finding 13

Neither was in the review. Both could destroy the founder's records.

- `tests/e2e-web360/maps.config.ts` **defaulted `APP_PG_DSN` to the real
  `pattadar` database** when the variable was unset. These specs create and
  delete records.
- `tests/e2e-ux/playwright.config.ts` **hardcoded the same real database** with
  no override at all, and does a profile edit/save round-trip.

`tests/disposable-db.ts` now holds the rule once: `requireDisposableDatabase()`
refuses any database whose name does not read as throwaway. `maps.config.ts` and
the main w360 config both call it — the w360 config previously carried its own
copy of the check, which is why the sibling config could drift without anyone
noticing. e2e-ux keeps the real database as its **documented local default**
(reviewing real data is its stated purpose) but now accepts `TEST_PG_DSN`, so it
can run somewhere else; it is deliberately not wired into CI, because it gates
`apps/web-next`, which is not the shipping client.

### Finding 12 — a latent way to ship the unrepaired client

`WEB_ORIGIN` defaults to `spa`, which ships `apps/web`. Any other value builds
`apps/web-next`, last touched 28 July, which contains **none** of the repair
work — no scoped recipient access, no account data/consent screens, no durable
extraction. A variable flip would have silently reinstated the defects this
release exists to fix. `deploy.yml` now fails loudly on that path.

### Finding 6 — the remaining ceiling, correctly described

The client half is genuinely fixed: extraction is a durable job and the blanket
20s deadline is gone. What was left was **documentation that actively misleads a
deployer**: four places still said 60s is the "extraction ceiling" and that long
extraction calls go to `api.pattadar.com` directly. The browser only ever calls
relative `/api` paths, so that route does not exist. Corrected in
`infra/terraform/README.md`, both `envs/*/runtime/variables.tf` descriptions and
the `cloudfront.tf` comment, and restated as what the cap actually binds now: a
large upload. See "Still open" below — the ceiling itself is not closed.

### Finding 16 — parity

- `apps/mobile/README.md` claimed the Cognito native client was "not yet
  created", the GraphQL client unwired, and sign-in and documents/storage
  screens blocked. All three ship; each was checked against the code before
  being rewritten. ML Kit, `eas.json` and push credentials are still genuinely
  open and were left saying so.
- `cornerLabel`, `ringSides` and `compassPoint` are recorded as **web-only
  presentation helpers** in `scripts/parity-map.json` and the parity contract,
  rather than left as silent drift. Checked rather than assumed: core's
  `ringSides().metres` is haversine and Swift's `boundarySideMetres` is
  equirectangular, and at parcel scale they agree to ~1.6 ppm — 0.1 mm on a 64 m
  side. Revisit only if a native screen computes side lengths for a traced ring.

### Finding 18 — the consent gate failed open, permanently

`require_purpose` waved through any account with no saved consent row. The grace
is deliberate — closing it at release would lock out every existing user — but it
was not closable, so no amount of backfill could ever satisfy the checklist.
`CONSENT_STRICT=1` now turns a missing row into a 403. The default is unchanged,
`test_consent_grace_for_old_accounts_can_be_closed` pins both sides, and
`docs/runbooks/account-data.md` carries the cutover order.

## Still open — founder or product, not code

- **CloudFront 60s vs a 100 MB advertised upload.** No single HTTP hop carries
  extraction any more, but the gateway still accepts uploads that the edge will
  cut at 60s on a slow rural link. Closing it needs either the AWS "Response
  timeout per origin" quota increase (then `cloudfront_origin_read_timeout = 180`)
  or presigned S3 PUTs that bypass CloudFront. Both are outside a local session.
- **DPDP consent at Aadhaar upload** and **verifiable parental consent** for a
  guardian adding a minor. Neither exists; a grep for `guardian_consent` returns
  nothing. These are legal/product decisions, not omissions to be invented.
- **Native first-use consent.** `AccountScreen.swift` deep-links to the web
  account page; there is no in-app equivalent of the web's `acceptedAt == null`
  redirect.
- **Backup-restore drill** and **confirmed alarm delivery.** Both are operational
  execution against real AWS: the SNS email subscription needs a human to click
  its confirmation link, and the restore drill needs a snapshot restored and its
  evidence recorded. `docs/runbooks/rds-restore-drill.md` is ready to follow.

## Validation

Everything below was run in this session, locally.

- `bun run typecheck`: all five workspaces, exit 0.
- `bun test` over the five paths: **65 passed, 0 failed**, 9 files.
- All 15 offline assertion scripts, run the way CI now runs them: **all pass**.
- `bun run build`: exit 0.
- `pytest`: api **178**, gateway **106**, assistant **15**, `scripts/tests` **9** —
  308 passed, 0 failed. Includes the new consent-cutover test.
- `terraform fmt -check -recursive`: clean. `terraform validate`: all four roots OK.
- `bun run scripts/parity-check.ts`: exit 0.
- The disposable-database guard was tested in all three directions: it refuses
  `dbname=pattadar`, refuses an unset DSN, and accepts a disposable one.
- The newly gated maps suite: **18 passed** on three consecutive full runs after
  the race fix. Before it, one full run in three failed on the corner drag —
  which is exactly the confidence a gate is supposed to buy, and exactly why it
  was worth running three times rather than once.

Not run: `apps/ios/verify.sh` (founder's, by hand), any AWS call, any deploy, and
the e2e-ux suite (it targets `apps/web-next`).
