# Architecture review: DynamoDB, S3, Amplify and the subdomain topology

**Date:** 21/09/2026  
**Status:** Review complete — decision pending founder sign-off  
**Scope:** The five-part proposal — migrate the platform to DynamoDB; S3 presigned direct uploads with SSE; build and host on AWS Amplify; a five-subdomain topology (`platform.` / `university.` / `auth.` / apex / `assistant.`); a separate university login.  
**Method:** Ten parallel reviews against the live repository, the live `pattadar` database and live DNS/HTTP endpoints. Every finding was then put to three independent adversarial verifiers — one checking the cited evidence against the actual files, one checking the AWS limits and prices, one recalibrating severity for a pre-launch solo-founder platform — and dropped on a majority refutation. 137 findings raised, 133 survived, 4 refuted.

Full evidence for every finding is in [2026-09-21-dynamodb-migration-findings.md](./2026-09-21-dynamodb-migration-findings.md).

---

## Verdict

Hybrid, weighted hard against the database half. Three of your five items are sound and should ship inside a month — S3 presigned uploads, Amplify Hosting for the static frontends, and four of the five subdomains — and one of them (auth.pattadar.com) is already built and live. The DynamoDB migration is a 40–58 engineer-week solo rewrite of a 1,554-call-site raw-SQL data layer to save at most ~$95/month, on a platform whose largest business table holds 77 rows, and it ends with you operating DynamoDB *plus* OpenSearch *plus* Postgres where you run one Postgres today. The separate university login is the one item to reject outright: a second user pool permanently forks identity for anyone who is both a landowner and a student, and your own apps/university/ARCHITECTURE.md:55 already specifies a shared pool with a dedicated app client.

## Scorecard

The five proposal items do not deserve the same answer. Rated separately:

| Element | Rating | Reasoning |
|---|---|---|
| DynamoDB — wholesale migration of the 83-table OLTP core | **reject** | 1,554 psycopg call sites with no repository seam, 46–49 FOR UPDATE locks and 16 partial-unique invariants that DynamoDB cannot express; 40–58 engineer-weeks to save ~$95/month at a scale where the biggest business table is 77 rows. |
| DynamoDB — the 290 GB land corpus (party / real_estate_records / boundary_vectors) | **reject** | pg_trgm similarity over 140,527,280 party rows and HNSW ANN over 44,360,232 halfvec(1024) embeddings have no DynamoDB expression at any price; the replacement is OpenSearch on top of DynamoDB, not instead of it. |
| DynamoDB — new, high-write, single-tenant-keyed state (university progress, assistant conversations, idempotency/session) | **adopt-with-changes** | Genuinely good fit and greenfield, so zero migration cost — but adopt it as the written policy from apps/university/ARCHITECTURE.md:280, one table at a time, only after a measured need. |
| S3 presigned uploads + SSE encryption | **adopt-with-changes** | The strongest part of the proposal and fully independent of DynamoDB — but use presigned POST (not PUT) so content-length-range still enforces the 100 MB cap, add the bucket CORS rule that does not exist today, and keep downloads proxied. |
| AWS Amplify — Gen2 backend (AppSync + DynamoDB) | **reject** | Would mean reproducing 36,845 lines of Python, 270 GraphQL operations and 69 REST routes; Amplify cannot host FastAPI at all, so this is the DynamoDB rewrite wearing a different name. |
| AWS Amplify — Hosting for the static frontends | **adopt-with-changes** | Right tool for the one real gap — apps/university has no deployment path anywhere in .github/workflows or deploy-release.py — but use it for university and the portal only, keep the app on the existing CloudFront distribution, and use repo-less manual-deploy mode so no GitHub PAT enters Terraform state. |
| 5-subdomain topology — platform / university / auth / pattadar.com | **adopt-with-changes** | Fine, but every origin must serve its own same-origin /api/* (cloudfront.tf:1-3 states the zero-CORS design explicitly) and the Cognito callback list must be pinned in Terraform before the DNS flip, not after. |
| 5-subdomain topology — assistant.pattadar.com | **defer** | There is nothing to host: the assistant is a FastAPI SSE service with no frontend, and pointing a public DNS name at it turns services/assistant/src/main.py:172's x-user-id header into a complete auth bypass. |
| auth.pattadar.com — authentication routing | **adopt** | Already built and live (cognito.tf:464-471, prod main.tf:39, resolving to CloudFront today) — do not rebuild it and do not put an Amplify app on that hostname. |
| Separate university login (second Cognito user pool) | **reject** | Two pools means two `sub` values for one human, so university progress can never join a Pattadar account; use a fourth app client on the existing pool with its own branding and landing page. |

## Cost

Prod as coded costs roughly $102-109/month all-on (3 ARM64 Fargate tasks ~$43, 3 public IPv4 ~$11, ALB ~$22, RDS db.t4g.micro + 20 GiB gp3 ~$15, WAF $8, 2 CMKs $2, Route53 $0.50). Right now it is ~$5-8/month, because the runtime layer is destroyed — so today's migration saving is negative.
A fully serverless rebuild idles at roughly $9/month, which puts a hard ceiling of ~$93-100/month (~₹8,000) on everything the DynamoDB half could ever save. Against 40-58 engineer-weeks solo for the OLTP half alone, payback is 70-150 months.
The genuinely large line is the one nobody has costed: the land corpus needs ~$167-220/month for the party + real_estate_records subset, or $290-1,170/month with the HNSW vector indexes resident — 1x to 7x the entire ₹15/account-month infrastructure reserve (~$176/month at 1,000 accounts, costing-model.md:45), from day zero, independent of user count.
DynamoDB does not touch a single one of the four lines that actually dominate at scale — S3 storage, download egress, Cognito MAU, and GuardDuty malware scanning — and Amplify Hosting is modestly *more* expensive than the CloudFront already in the repo ($0.15/GB served with a 12-month free tier, versus CloudFront's perpetual 1 TB/month), plus $15/month per app for WAF integration.
Net: the database is not what you are paying for, and at 77 rows in your largest business table it will not be for years.

## Blockers

Independent of whether the migration happens. Several fire on the next `terraform apply`.

1. Prod has no compute: the entire runtime layer (ALB, ECS, RDS, CloudFront, Route53) is destroyed, and route53.tf:72-78 aliases api.pattadar.com at aws_lb.main — so the hostname vanished with the ALB and apps/ios/project.yml:137 hardcodes it. Nothing in this proposal fixes that; only a runtime apply does.
2. A hand-rolled `terraform apply` on envs/prod/runtime will create a FRESH EMPTY database: rds.tf restores only when TF_VAR_restore_snapshot_identifier is set, which only scripts/platform-up.sh:62-68 does. Run the script, never the apply.
3. Terraform will delete the localhost:5173 Cognito callback on the next prod persistent apply: spa_callback_urls defaults to the one-element list ["https://pattadar.com/auth/callback"] (variables.tf:113-117), envs/prod/persistent/main.tf overrides nothing, and platform-up.sh:59 applies with -auto-approve. You are Google-federated, so there is no password fallback.
4. platform.pattadar.com and university.pattadar.com fail sign-in today: the live SPA client accepts exactly two redirect URIs and everything else returns redirect_mismatch. Register the new URLs before the DNS flip, keeping the old ones through the transition.
5. assistant.pattadar.com as a public origin is a full authentication bypass: services/assistant/src/main.py:172 takes identity straight from the x-user-id header, and INTERNAL_PROXY_SECRET appears nowhere in infra/terraform, so internal_auth.py:28-31 returns True unconditionally. Today only network placement protects it.
6. There is no CORS anywhere in the platform: zero CORSMiddleware in services/, zero aws_s3_bucket_cors_configuration in infra/. Splitting origins without carrying a same-origin /api/* behavior onto each one breaks every API call, and browser presigned uploads fail at OPTIONS before any signature is checked.
7. Two columns cannot be DynamoDB items at all: document_read_jobs.source is capped at 25 MB (ai_reading/jobs.py:24) — 64x the 400 KB hard limit — and village_maps.geojson measured 781,028 bytes on the shipped corpus. Both need S3 offload regardless of what you decide about DynamoDB.
8. Aadhaar ciphertext is bound by KMS encryption context to owner_user_id AND record id (aadhaar.py:92-101, 122-140). Any migration that changes users.id, family_members.id or owner_user_id makes it undecryptable unless the ids are carried byte-for-byte or the values are decrypted and re-encrypted under a reviewed gate.

---

## The shape in one sentence

PostgreSQL stays the system of record for everything that exists today; S3 gets the bytes and the direct-upload path; Amplify gets the two static sites that have no home; every browser origin keeps a same-origin `/api/*`; and DynamoDB is held in reserve for greenfield tables only.

---

## Store by store

| Store | Holds | Why this store |
|---|---|---|
| **RDS PostgreSQL** (`db.t4g.micro` today) | The 83-table public schema: properties, parcels, passbooks, documents, family_members, groups, associates, work_requests, ticket_dispatches, governance, geography reference data | 21–27 MB total. The largest business table is `documents` at 77 rows. There is no access pattern here that Postgres cannot serve, and 30% of the 519 read sites need denormalisation or stream-maintained aggregates to work at all in DynamoDB. |
| **RDS PostgreSQL — permanently, do not migrate** | `audit_events_v2` + `audit_chain_head` + `audit_outbox`; `payment_intents` / `payment_operations` / `payment_webhook_events` / `service_payments`; `ticket_dispatches`; `account_erasure_jobs` | These are correct *because of* Postgres primitives. The audit chain is a gapless hash chain serialised by `SELECT ... FOR UPDATE` on a single row (audit.py:861-866) with append-only enforced by a trigger plus a DB role. The payments capture path writes `payment_intents` twice inside one transaction (payments.py:437, :446) — a request DynamoDB rejects with ValidationException. `uq_dispatch_one_accept` is the partial-unique index that stops two associates being paid for one job, and associates.py:399-405 calls it "THE BACKSTOP" in so many words. |
| **PostgreSQL, separate instance — the `land` corpus** | `land.party` (140,527,280 rows / 35 GB), `land.real_estate_records` (45,144,496 / 28 GB), `land.boundary_vectors` bv_p0..bv_p7 (44,360,232 rows, ~108 GB of HNSW index) | pg_trgm fuzzy name match and pgvector HNSW ANN have no DynamoDB equivalent at any budget. Keep it behind its own DSN — which services/assistant/src/public_records/settings.py:21 already does — and its own read-only role. **Its default DSN currently points at the same database as the OLTP schema; give it its own instance before it goes to production.** |
| **S3 `documents` bucket** | All user bytes: deed scans, parcel/property photos, storage_nodes/storage_versions payloads, and (new) `document_read_jobs.source` and `village_maps.geojson` | Already SSE-KMS with the app CMK and Bucket Keys on (storage.py:163-168, s3.tf:173-182). Erasure already enumerates by bucket prefix (`erase_account.py:48-74`), which is why abandoned presigned uploads are still erased — a property most systems get wrong. |
| **DynamoDB — reserved, zero tables today** | Nothing yet. Candidates, in order: university learning progress (no tables exist, so genuinely greenfield), assistant conversation/tutor state, idempotency and session records | Adopt only under the policy already written at apps/university/ARCHITECTURE.md:280 — new, high-write, single-tenant-keyed state, when measured throughput or cost supports it. Caveat the assistant candidate: conversation_store.py:224/:252/:290 has joins today, so it is a denormalisation, not a lift-and-shift. |
| **Cognito — one user pool, `ap-south-1_XfgAF21Z3`** | Every human identity across every product | Four app clients: `spa` (the app), `local_dev` (loopback), `mobile` (native, id `44gv48ihjlgub7h0lnvjbdmj89` — do not recreate it, it is in installed builds), and a new `university` client. Roles stay server-side grants in the database, never token claims — a 60-minute-stale `reviewer` grant that cannot be revoked mid-life is wrong for a revocation-sensitive role. |

---

## What serves `/api/*`

Unchanged from what is already coded, and this is the invariant to protect through the subdomain split:

```
browser (any *.pattadar.com origin)
  → that origin's own CloudFront distribution
      → ordered_cache_behavior path_pattern "/api/*"   (cloudfront.tf:350-351)
      → origin request policy Managed-AllViewerExceptHostHeader  (so Authorization survives)
  → ALB
      → priority 20  /api/*  → gateway target group   (alb.tf:208-216)
  → gateway   (validates the Cognito access token, strips every client-supplied
               identity header in raw ASGI before any handler runs, re-injects
               x-user-id from validated iss+sub claims)
  → api / assistant   (private SGs only, no listener rule, no DNS name)
```

Three rules that fall out of this and must be written down:

1. **Every browser origin serves its own same-origin `/api/*`.** Never `api.pattadar.com` from a browser. cloudfront.tf:1-3 says why: *"SAME-ORIGIN API — the browser never leaves https://pattadar.com, so no CORS anywhere."* There is no CORS middleware in `services/` to fall back on.
2. **`api.pattadar.com` comes back, but for native clients only.** route53.tf:72-78 aliases it at the ALB; apps/ios/project.yml:137 and Info.plist:46 hardcode `https://api.pattadar.com/api/gateway/pattadar`. URLSession does not preflight, so native is unaffected by the CORS rule above. This is a sixth DNS name your list omits and it is not optional.
3. **The api and assistant containers never get a DNS name or an ALB listener rule.** The only internet-reachable api route is `/cron/inactivity-check` at priority 10, and it is HMAC-gated.

---

## The DNS map

| Name | Points at | Serves | State today |
|---|---|---|---|
| `pattadar.com` | CloudFront → S3 (marketing bundle) + `/api/*` → ALB | The portal / marketing site | Live, serving the SPA; `/api/*` 502 because the ALB is gone |
| `www.pattadar.com` | CloudFront function, 301 → apex | Nothing — the redirect exists to keep a single origin | Live |
| `platform.pattadar.com` | New CloudFront distribution → S3 (apps/web bundle), **with its own `/api/*` behavior to the same ALB** | The app | Does not resolve; Cognito returns `redirect_mismatch` |
| `university.pattadar.com` | Amplify Hosting app → apps/university build | The learning product | Does not resolve; **and apps/university has no deployment path at all** |
| `auth.pattadar.com` | Cognito-managed CloudFront, Managed Login v2 | Hosted UI for the one user pool | **Already live and correct.** Google federation anchored at `/oauth2/idpresponse`, so new subdomains need no change in the Google/Meta/Apple consoles. |
| `api.pattadar.com` | ALB directly | Native iOS and Expo clients only | Does not resolve; returns with the runtime layer |
| `assistant.pattadar.com` | **Nothing — drop it** | — | The assistant is a backend SSE service with no frontend. It stays a route inside the app at `platform.pattadar.com/api/gateway/assistant/*`. If a standalone assistant product is ever built, that is a new SPA plus a new Cognito client, not a hosting decision. |

---

## Storage path, after the presigned change

```
client → POST /storage/upload-intent      (gateway chooses the key, returns a
                                           presigned POST policy with
                                           content-length-range and a short TTL)
client → POST direct to S3                (bucket CORS rule required; bucket
                                           default SSE-KMS applies the app CMK)
client → POST /storage/files/{id}/complete (gateway HeadObject's the object and
                                           writes the RETURNED ContentLength into
                                           storage_versions.size_bytes, never the
                                           client's number, then inserts the row)
```

Three constraints that decide the design:

- **Presigned POST, not PUT.** `s3:content-length-range` is a POST-policy condition with no PUT equivalent, and `MAX_UPLOAD_BYTES = 100 MB` (routes/storage.py:46) is currently the only thing between a Free-tier user and an uncapped storage bill.
- **Downloads stay proxied.** The gateway download route is where the `nosniff` + `sandbox` CSP headers live (routes/storage.py:136-156), where HEIC→JPEG and `?thumb=` happen, where `_access()` re-evaluates share revocation on every read, and where the `download_document` and `recipient.download` audit events are written. Presigned GET deletes all five. Add presigned GET later for full-size originals only, with a 60–120s TTL and the audit row written at issuance.
- **Change `_key()` first.** It is `f"{owner}/{node_id}/{version_id}"` (storage.py:181-182), so a derived identity is baked into every object key — the live DB already holds the same 5,330,712-byte deed twice under two different `subject_` owners. Drop the owner segment to `f"{node_id}/{version_id}"`. Authorization is done in SQL by `_access()`, never by key prefix, so nothing depends on it. At ~280 objects this is a ten-minute sweep; it will never be this cheap again.

---

## Explicitly out of scope

Do not migrate: the audit trail, payments, ticketing, the account-erasure runner, the gateway's storage tree, or the land corpus. Do not create a second Cognito user pool. Do not enable DynamoDB TTL on anything carrying a retention claim. Do not put a browser-held AWS credential anywhere — a browser→Identity Pool→DynamoDB path removes the API from the request path and therefore removes the audit trail for exactly the operations SOC 2 cares about most.

---

# Phased plan

## Phase 0 — Get `/api/*` answering again (1–3 days)

Nothing in the proposal touches this. Prod is 502 because the runtime layer was torn down by `scripts/platform-down.sh`, not because of anything to do with the datastore. Amplify would still return 502 from the same absent origin.

**Do these in order. Steps 1 and 2 are not optional.**

1. **Pin the Cognito callback lists in Terraform before anything applies.** In `infra/terraform/envs/prod/persistent/main.tf`, set `spa_callback_urls` and `spa_logout_urls` explicitly to the full live list, and set `enable_local_dev_client = true` so the loopback URLs move to their own client. `platform-up.sh:59` applies the persistent layer with `-auto-approve`, and the module default is a one-element list — an apply today deletes `http://localhost:5173/auth/callback` and you are Google-federated with no password fallback. Require a clean `terraform plan` before proceeding.
2. **Bring it up with the script, not by hand:** `scripts/platform-up.sh prod`. It resolves the latest `pattadar-prod-pg-final-*` snapshot and exports `TF_VAR_restore_snapshot_identifier` before applying runtime (platform-up.sh:62-68). A hand-rolled `terraform -chdir=envs/prod/runtime apply` skips that and creates a fresh empty instance that `init_db()` bootstraps with a blank schema.
3. **Thaw parked documents** if `platform-down.sh` moved objects to DEEP_ARCHIVE — see `docs/runbooks/s3-thaw.md`. Budget ~12h for the restore, which is why it goes first.
4. **Set `INTERNAL_PROXY_SECRET` in all three ECS task definitions** and change both guards (`services/assistant/src/internal_auth.py:28-31`, `services/api/src/main.py:1212-1216`) to fail CLOSED when `APP_ENV != local`. Right now the grep returns zero hits across `infra/terraform` and both guards return `True` unconditionally; the only thing protecting the api and assistant containers is that they have no listener rule.
5. Let CI's `deploy.yml` roll images. Verify `/api/*` and `api.pattadar.com` resolve — the iOS build depends on the latter.

*Alternative worth considering honestly:* stay parked. There are no users, all-on costs ~$102–109/month versus ~$5–8 parked, and every month you stay down is ~$95 of credit not spent serving nobody. If you take this option, still do steps 1 and 4 now — they are landmines either way.

---

## Phase 1 — The wins that need no DynamoDB decision (3–4 weeks)

Every item here is independently valuable, ships against the current stack, and de-risks any future migration.

**Presigned uploads (1–2 weeks).** Add `aws_s3_bucket_cors_configuration` scoped to the real origins with `ExposeHeaders: [ETag]`; add `abort_incomplete_multipart_upload` and a `pending/` prefix expiry rule; add the `upload-intent` / `complete` routes using presigned **POST** with `content-length-range`; keep `POST /files` working as the fallback for iOS. Do not sign the SSE headers — bucket default encryption already applies the CMK, and `enforce_documents_sse_kms_headers` is `false` in both envs. No multipart: the largest real object is 14,439,064 bytes against a 100 MB cap.

**The two item-size fixes (4–6 days).** Move `village_maps.geojson` bytes to S3 behind CloudFront, keeping only the index row (which `main.py:7259` already selects). Move `document_read_jobs.source` to an S3 key under SSE-KMS and delete the object on all three terminal paths (jobs.py:171, :184, :204). This takes a 25 MB blob out of every WAL segment and RDS backup and out of the "Very high" sensitivity class at gdpr-dpdp.md:13.

**Fix `_key()` (2–3 days).** Drop the owner segment, CopyObject-sweep the ~280 existing objects, update `storage_versions.object_key`. Must land before presigning, since presigned URLs bake the key into client-issued URLs.

**Small correctness debts (2–3 days).** Fail the idempotency middleware CLOSED for record-creating mutations (main.py:6977-6982) and drop `_IDEM_MAX_RESPONSE` from 256 KB to ~32 KB. Add `associate_training_certificates` to `CHILD_LINKS` — it stores associate_id, recipient_name and trainer_name and is in neither the DPDP export nor the erasure sweep today, and `verify()` passes anyway. Add a CI test that fails when a public table exists that the erasure manifest does not name.

---

## Phase 2 — University gets a home, domains get pinned (2–3 weeks)

This is the one real capability gap in the whole proposal. 7,087 lines of university TypeScript plus a full SEO prerender pipeline are built in CI and thrown away — `grep -rn "university" .github/workflows/ scripts/deploy-release.py` returns nothing.

- **Stand up `university.pattadar.com` on Amplify Hosting**, in repo-less manual-deploy mode (`aws_amplify_app` with no `repository`, pushed by the existing OIDC workflow via `aws amplify start-deployment`) so no GitHub PAT lands in Terraform state. One `preBuild` line installs bun at a pinned version; bun is not in Amplify's monorepo auto-detection list or default image. Verify the three prerendered route objects (`states/index.html` and the two published state pages) are served as real paths — the existing `spa_router` CloudFront function rewrites every extension-less URI to `/index.html` and would swallow them.
- **Add a fourth Cognito app client** `pattadar-university` on the existing pool, with its own callback URLs and its own `aws_cognito_managed_login_branding`. One pool, one `sub`, one MFA posture, one custom domain. Reversing a second pool later is a migration-runbook-class change; today it is free.
- **Decide and execute the apex question.** If the app moves to `platform.pattadar.com`: expand the us-east-1 ACM cert (it currently covers apex + www only), stand up the distribution with its own `/api/*` behavior, keep `https://pattadar.com/auth/callback` registered through the transition, 301 `pattadar.com/app/*`, and only then bump `APP_PUBLIC_URL` — ticket and invitation links minted from it are already in the wild.
- **Drop `assistant.pattadar.com`** from the topology and write down why.

---

## Phase 3 — The repository seam (6–8 weeks) — *this is the actual decision point*

This is the highest-value refactor in the repo whether or not DynamoDB ever happens, and it is the only honest prerequisite for it.

- Define ~12–15 Protocols (PropertyRepository, DocumentRepository, FamilyRepository, TicketRepository, PaymentRepository, AuditRepository, AssociateRepository, GeographyRepository…) plus Postgres adapters holding today's SQL **verbatim**. Move code; do not rewrite it. Copy the pattern already in the repo at `services/assistant/src/ports.py` and `services/api/src/ai_reading/ports.py`.
- Consolidate the ~3 test-fixture families so the 134 Postgres-bound tests can be parameterised over an adapter. Note that `test_ticketing.py` already asserts `"import psycopg" not in src` — 76 tests that survive any datastore swap, which is the pattern to extend.
- Adopt Alembic in offline (`--sql`) mode and freeze the 89 `CREATE TABLE` / 227 `ALTER TABLE ADD COLUMN` boot block as migration 0001. Then: no new `ALTER TABLE` in application source. `ADD COLUMN IF NOT EXISTS` silently no-ops when the column exists with a different type or default, and nothing reports the drift.

This collapses 1,554 individually-reasoned call sites into a countable API surface, makes `web360.py`'s 476 call sites reviewable, and — the point — lets you answer "could aggregate X live in DynamoDB?" by writing one adapter and A/B-ing it, instead of committing ten months up front.

---

## Phase 4 — Stop. Re-decide with real numbers.

Do not schedule Phase 5. Set a written trigger instead: *"a specific named Postgres access pattern exceeds X at Y QPS."* Revisit after ~6 months of production load.

The reason to wait is not duration, it is irreversibility. A DynamoDB partition/sort key cannot be altered — changing it means a new table and a full re-import, and `ImportTable` (the only path that costs ~$30–45 instead of hundreds of dollars of write units) works exclusively into a table that does not yet exist. Committing a key design now means committing on guesses, because there is no production traffic to derive access patterns from.

---

## Phase 5 — Conditional, one table only

If and when a measured need appears, take **one** greenfield table: university learning progress (no tables exist yet, so genuinely zero migration cost) or assistant conversation state (denormalise the `r_conversation_runs` join first). Customer-managed CMK, PITR explicitly set to 7 days to match the written commitment at gdpr-dpdp.md:50, no TTL on anything carrying a retention claim, and no browser-held AWS credentials. Prove the pattern on that one table before anything else moves.

---

## What this sequence costs you

Phases 0–2 are roughly 6–8 weeks and deliver: a working prod API, native clients reconnected, direct-to-S3 uploads, the university product actually reachable, and the domain topology you asked for minus one subdomain. Phase 3 is another 6–8 weeks and is the refactor you want regardless. That is ~3–4 months to a materially better platform, against 10–14 months to the same product on different storage.

---

## Open questions — founder decisions

- Is the 290 GB land corpus going to production at launch, and who funds it? It has no line item in docs/specs/2026-09-19-platform-costing-model.md, the terraform provisions 20 GiB on a db.t4g.micro, and ecs.tf:482/486 already points the assistant at `land` on that instance — a guaranteed failure on the next runtime apply.

- Is semantic boundary search a launch feature or not? It ships disabled (PUBLIC_RECORDS_EMBEDDINGS_ENABLED=0, settings.py:30), and the boundary_vectors partitions plus their HNSW indexes are ~224 GB of the 290. Turning it off permanently shrinks the corpus to ~63-66 GB and every hosting option gets roughly 4x cheaper.

- Does the app move off the apex to platform.pattadar.com, or does pattadar.com stay the app with the portal somewhere else? The move costs an ACM cert expansion, a second distribution, a callback cutover and a forced sign-out — cheap today with zero users, expensive after launch.

- Is assistant.pattadar.com a product (a standalone assistant surface people sign into) or just a URL you liked the look of? If it is a product, that is a new SPA plus a new Cognito client, not a hosting decision.

- Does university need its own login *page*, or its own login *identity*? The first is an app client and costs three days. The second forks identity permanently and cannot be merged later — Cognito has no pool-merge.

- Do you bring prod back up now or stay parked until launch? Parked is ~$5-8/month versus ~$102-109 all-on, and there are no users to serve either way — but staying down means the domain and upload work of Phases 1-2 gets verified only locally.

- Which retention number is true: gdpr-dpdp.md:50 and soc2-controls.md:53 both say 7-day PITR (enforced by rds.tf:42), and DynamoDB defaults to 35. If any table ever moves, is the answer to configure 7 or to restate the commitment as 35?

- Is the `app` schema (17 tables, 40 of the database's 42 FK constraints, app.users empty) dead? Several cost and complexity figures in circulation come from it rather than from the live `public` schema, and it should be dropped or documented before anyone sizes a migration off it.

---

## Findings index

| # | Dimension | Sev | Finding |
|---|---|---|---|
| 1 | Query shapes vs DynamoDB | blocker | village_maps.geojson holds whole-village cadastre inline — measured 781,028 bytes vs DynamoDB's 400KB hard item limit |
| 2 | Query shapes vs DynamoDB | blocker | document_read_jobs.source is a 25MB BYTEA held in the row, and the queue claim does SELECT * on it under a lock |
| 3 | Query shapes vs DynamoDB | blocker | pg_trgm fuzzy name search over land.party (140,527,280 rows / 35 GB) has no DynamoDB equivalent |
| 4 | Query shapes vs DynamoDB | major | 30% of the read surface (159/519) needs denormalisation or stream-maintained aggregates: 27 GROUP BY, 37 JOIN, 98 aggregate-function queries |
| 5 | Query shapes vs DynamoDB | major | The associates desk roster is one SQL statement that becomes ~5 GSIs + 2 stream-maintained aggregates + an OpenSearch index |
| 6 | Query shapes vs DynamoDB | major | The coverage grid GROUP BYs every tenant's parcels and properties with no owner predicate — a cross-tenant Scan in DynamoDB |
| 7 | Query shapes vs DynamoDB | major | 16 of 46 pessimistic row locks are acquired through a non-primary-key lookup — and DynamoDB GSIs cannot be read strongly consistently |
| 8 | Query shapes vs DynamoDB | major | Four FOR UPDATE SKIP LOCKED work queues have no DynamoDB equivalent |
| 9 | Query shapes vs DynamoDB | major | The hash-chained audit ledger depends on a single-row FOR UPDATE counter and a Postgres trigger that reads DB roles |
| 10 | Query shapes vs DynamoDB | moderate | DynamoDB's Limit applies before FilterExpression — 17 filtered-LIMIT queries will silently return fewer results than exist, including typeahead |
| 11 | Query shapes vs DynamoDB | moderate | Multi-table transactions exceed TransactWriteItems' 100-item / 4MB cap, and 57 of 141 UPDATE/DELETE statements use a non-key predicate |
| 12 | Query shapes vs DynamoDB | moderate | Hot partition: one village_norm value extrapolates to ~637,000 records, and a single partition key is capped at 3,000 RCU/s regardless of table capacity |
| 13 | Query shapes vs DynamoDB | moderate | Storage cost goes the wrong way: 393 bytes of repeated attribute names per row on a 45M-row table |
| 14 | Query shapes vs DynamoDB | positive | POSITIVE: binary payloads are already externalised to S3, so the presigned-upload half of the proposal is sound and low-risk |
| 15 | Query shapes vs DynamoDB | positive | POSITIVE: the schema already evolves additively, there is no PostGIS, and 39% of reads are single-key — the codebase is not hostile to DynamoDB, it is just bigger than DynamoDB's shape |
| 16 | Transactions, invariants, audit chain | blocker | TransactWriteItems forbids two operations on the same item — the payment capture path does exactly that, twice |
| 17 | Transactions, invariants, audit chain | blocker | The audit module's fail-open/fail-closed policy depends on SAVEPOINT, which DynamoDB has no equivalent for at any price |
| 18 | Transactions, invariants, audit chain | blocker | IAM cannot express "INSERT only" on a DynamoDB table, so the append-only privilege boundary has no equivalent and tamper-evidence is genuinely weakened |
| 19 | Transactions, invariants, audit chain | major | The hash chain's `FOR UPDATE` on a single row becomes an optimistic CAS on a single DynamoDB item — correct, but with different failure behaviour and a hard 1,000 WCU/s ceiling that adaptive capacity cannot lift |
| 20 | Transactions, invariants, audit chain | major | DynamoDB Streams does not cleanly replace audit_outbox — it moves the seal to *after* the write and caps replay at 24 hours |
| 21 | Transactions, invariants, audit chain | major | 34 non-PK unique indexes, 16 of them PARTIAL — DynamoDB cannot express a conditional uniqueness constraint in any form |
| 22 | Transactions, invariants, audit chain | major | 11 `COALESCE(MAX(sort),0)+1` counters are read-then-write with no unique constraint to catch the collision |
| 23 | Transactions, invariants, audit chain | major | The idempotency middleware fails OPEN on any datastore error — under DynamoDB throttling that becomes routine, and a retried payment mutation runs twice |
| 24 | Transactions, invariants, audit chain | major | Two safety gates that must not be wrong read through non-PK unique columns, which become eventually-consistent GSI queries |
| 25 | Transactions, invariants, audit chain | moderate | The `accept_ticket` transaction scales with deliverable count and has no upper bound — it will cross the 100-item TransactWriteItems cap |
| 26 | Transactions, invariants, audit chain | moderate | The erasure runner discovers its own delete order by querying pg_constraint at runtime — that introspection disappears entirely |
| 27 | Transactions, invariants, audit chain | moderate | Account erasure and audit redaction are predicate-scoped multi-row UPDATEs with no DynamoDB equivalent |
| 28 | Transactions, invariants, audit chain | positive | No SERIAL/BIGSERIAL columns and zero sequences in the live schema — all ids are already application-generated |
| 29 | Transactions, invariants, audit chain | positive | The compare-and-set idioms already in the code translate 1:1, and the repo's own architecture doc already says not to migrate the transactional half |
| 30 | Concrete DynamoDB table design | blocker | Four partial-UNIQUE constraints are load-bearing correctness invariants that DynamoDB cannot express — one is explicitly documented as the last line of defence |
| 31 | Concrete DynamoDB table design | blocker | The 290 GB land corpus runs on pg_trgm fuzzy search and a pgvector HNSW index — DynamoDB has neither, and the replacement costs more than the Postgres it replaces |
| 32 | Concrete DynamoDB table design | major | The marketplace half is cross-tenant by design and cannot live in an owner-partitioned table — you need at least two tables |
| 33 | Concrete DynamoDB table design | major | 18 GROUP BY and 242 aggregate call sites have no DynamoDB equivalent — you must build and maintain counter items plus a Streams pipeline |
| 34 | Concrete DynamoDB table design | major | The hash-chained audit ledger requires a global gapless sequence — DynamoDB Streams guarantees ordering only per partition key, so the control has to be redesigned |
| 35 | Concrete DynamoDB table design | major | DPDP export and erasure are derived at runtime from information_schema — DynamoDB has no catalog, so a fail-safe control becomes a hand-maintained list |
| 36 | Concrete DynamoDB table design | major | Reference and geography data does not belong in DynamoDB — the whole set is 102 KB and fits inside a single DynamoDB item |
| 37 | Concrete DynamoDB table design | major | Honest fit rating: ~45% good, ~35% forced, ~20% wrong — and the forced 35% is where 12 months of solo work goes |
| 38 | Concrete DynamoDB table design | moderate | Cascade deletes are hand-written multi-statement transactions that exceed the 100-item TransactWriteItems limit on realistic data |
| 39 | Concrete DynamoDB table design | moderate | GSI count is survivable only because entity types share indexes — and the 20-GSI quota leaves less headroom than it looks |
| 40 | Concrete DynamoDB table design | positive | The design works: sharing is by snapshot and token, not by grant — so PK=OWNER#<uid> is actually possible |
| 41 | Concrete DynamoDB table design | positive | Item size is NOT a problem — measured max row is 506 bytes, and the entire reference dataset is 102 KB |
| 42 | The 290GB land corpus | blocker | Hard blocker: fuzzy name search over 140.5M parties has no DynamoDB equivalent — a full Scan costs ~2.9M RRU and 23,200 sequential pages per search |
| 43 | The 290GB land corpus | blocker | Hard blocker: every aggregation tool (count, SUM, count DISTINCT, percentile_cont median, six GROUP BY rollups) has to be reimplemented as full-partition reads — 254 MB and ~254 serial round trips for the largest village |
| 44 | The 290GB land corpus | major | The corpus has never been deployed to AWS under any engine — terraform provisions db.t4g.micro with 20 GiB for a 290 GB dataset |
| 45 | The 290GB land corpus | major | Four more query patterns with no DynamoDB expression: fuzzy village resolution (on the hot path of 5 of 8 tools), OFFSET pagination in a public response contract, POSIX regex on survey_no, and the party⋈records join |
| 46 | The 290GB land corpus | moderate | Aurora Serverless v2 is more expensive than provisioned RDS here, not less — 64 ACU for the vector working set is ~$6,450/month |
| 47 | The 290GB land corpus | moderate | Ongoing reparse passes would cost ~$140 each in DynamoDB versus effectively free in Postgres, because UpdateItem bills the full item plus every affected GSI |
| 48 | The 290GB land corpus | positive | The initial load is NOT the problem — $30 via ImportTable, $383–$766 via BatchWriteItem. Do not reject DynamoDB on load cost. |
| 49 | The 290GB land corpus | positive | The corpus is already correctly isolated behind its own DSN and an 8-tool read-only interface — this decision is independent of any OLTP DynamoDB decision |
| 50 | Cognito + 5-subdomain auth | blocker | Live callback allowlist accepts exactly two redirect URIs; platform.* and university.* fail with redirect_mismatch today |
| 51 | Cognito + 5-subdomain auth | blocker | Terraform will DELETE the localhost:5173 callback on the next prod apply, locking the founder out of local sign-in |
| 52 | Cognito + 5-subdomain auth | blocker | assistant.pattadar.com as a public origin exposes a service with no authentication whose only guard fails OPEN |
| 53 | Cognito + 5-subdomain auth | major | There is no CORS configuration anywhere in the platform — splitting the app onto platform.pattadar.com breaks every API call |
| 54 | Cognito + 5-subdomain auth | major | "University login" as a SEPARATE login forks identity permanently; your own ARCHITECTURE.md already says one pool |
| 55 | Cognito + 5-subdomain auth | major | "Authentication routing" as a service you own is not worth building — the hosted UI already is it |
| 56 | Cognito + 5-subdomain auth | major | Tokens live in localStorage with no CSP and no security-headers policy; the assistant is the XSS-to-token-theft path you asked about |
| 57 | Cognito + 5-subdomain auth | moderate | Moving the app off the apex to platform.pattadar.com signs every existing user out and needs a redirect plan for pattadar.com/app/* |
| 58 | Cognito + 5-subdomain auth | moderate | Authorization has no roles, groups or scopes — University's six roles have nothing to attach to |
| 59 | Cognito + 5-subdomain auth | positive | auth.pattadar.com is already live and correct — item 3 of the proposal is complete, do not rebuild it |
| 60 | Cognito + 5-subdomain auth | positive | The gateway's identity handling is genuinely sound and should be the blueprint for the new subdomains |
| 61 | S3 presigned uploads + SSE | blocker | Presigned PUT + the repo's own SSE-KMS deny policy is the #1 way this will break: both headers must be signed AND sent byte-identical, and SSEKMSKeyId must be the full ARN |
| 62 | S3 presigned uploads + SSE | blocker | The bucket has no CORS configuration — browser direct upload is impossible until one exists |
| 63 | S3 presigned uploads + SSE | blocker | The object key already embeds a derived identity, and the live subject_ bug is that derivation changing — Amplify/Cognito rebuild makes this strictly worse |
| 64 | S3 presigned uploads + SSE | blocker | Presigned GET would delete the XSS sandbox, HEIC transcode, thumbnailing, share revocation and the download_document audit record in one move |
| 65 | S3 presigned uploads + SSE | major | No presigned URLs exist anywhere — the platform is 100% proxy today, and the proxy reads whole objects into RAM |
| 66 | S3 presigned uploads + SSE | major | A presigned PUT cannot enforce size — and there is no storage quota code anywhere in the platform |
| 67 | S3 presigned uploads + SSE | major | No orphan/abandoned-upload reaping: the bucket has no abort_incomplete_multipart_upload rule and there is no unconfirmed-upload lifecycle |
| 68 | S3 presigned uploads + SSE | moderate | A presigned URL signed by an ECS task role dies when the role's session rotates, not at the TTL you asked for |
| 69 | S3 presigned uploads + SSE | moderate | Direct upload does NOT bypass malware scanning — GuardDuty already covers it — but the deny policy has a documented gap and DEEP_ARCHIVE parking breaks it |
| 70 | S3 presigned uploads + SSE | moderate | The client would start telling the server what it uploaded, which inverts an invariant the code states explicitly |
| 71 | S3 presigned uploads + SSE | moderate | Presigned upload breaks the iOS write queue's single-call idempotency contract |
| 72 | S3 presigned uploads + SSE | positive | Multipart upload is not needed and should not be built — the real corpus tops out at 14 MB |
| 73 | Amplify as build/host | blocker | Amplify Gen2 backend means rewriting 36,845 lines of Python, 270 GraphQL operations and 69 REST routes over 83 Postgres tables |
| 74 | Amplify as build/host | major | auth.pattadar.com is already built as a Cognito custom domain and cannot be an Amplify app |
| 75 | Amplify as build/host | major | The five-subdomain split destroys the repo's explicit zero-CORS same-origin design and invalidates every registered Cognito callback |
| 76 | Amplify as build/host | major | apps/university has no deployment path at all today — this, not Amplify, is the real gap the subdomain plan is reaching for |
| 77 | Amplify as build/host | major | Amplify Hosting is more expensive than the CloudFront+S3 already in the repo, at every volume this platform will see pre-launch |
| 78 | Amplify as build/host | major | Amplify does not help the 502: the minimum path back to a serving API is a runtime-layer terraform apply, and hosting work delays it |
| 79 | Amplify as build/host | moderate | Amplify contradicts the repo's Terraform + GitHub-OIDC conventions and cannot be fully provisioned as code |
| 80 | Amplify as build/host | moderate | assistant.pattadar.com has nothing to host — the assistant is a backend SSE service with no frontend of its own |
| 81 | Amplify as build/host | minor | Bun workspaces are not in Amplify's monorepo auto-detection list |
| 82 | Amplify as build/host | positive | SSR is genuinely off the table — both frontends are pure Vite SPAs, which removes Amplify's strongest technical argument |
| 83 | Amplify as build/host | positive | Amplify's real advantage is atomic deploys and branch previews, which would retire fragile homegrown release machinery |
| 84 | Cost model | blocker | The 289.75 GB land corpus is the single largest cost item on the platform and appears in neither the costing model nor the deployed infrastructure |
| 85 | Cost model | blocker | The migration's total addressable saving is bounded at ~$100/month, and today it is ~$0 because the runtime layer is already destroyed |
| 86 | Cost model | major | Lambda/AppSync bills the assistant's streaming wall-clock; the crossover against one Fargate task is ~120 streaming-hours/month |
| 87 | Cost model | major | GuardDuty Malware Protection for S3 is costed ~4.5x low in the costing model, and it is the largest per-GB variable cost on the platform |
| 88 | Cost model | major | The one cost lever with the largest effect that is not 'switch databases': keep the 290 GB corpus out of the hot transactional database |
| 89 | Cost model | moderate | DynamoDB attribute-name overhead is measurable on this schema and pushes items over the 1 KB write boundary; GSI writes then multiply it |
| 90 | Cost model | moderate | At 50k MAU the bill is Cognito + S3 + CloudFront egress + malware scanning; the database line is ~2% at every scale |
| 91 | Cost model | moderate | Two separate logins (platform.pattadar.com and university.pattadar.com) risk double-billing the same human as two Cognito MAUs |
| 92 | Cost model | moderate | Aurora Serverless v2 as the hybrid option is a cost regression at this scale, not a saving |
| 93 | Cost model | minor | RDS final snapshots accumulate with no pruning; each park cycle leaves a permanent billed line |
| 94 | Cost model | minor | AWS Config records a configuration item on every resource change, and the down/up cycle churns hundreds per run |
| 95 | Cost model | positive | Presigned S3 uploads are the strongest part of the proposal and are worth doing on their own merits, independent of DynamoDB |
| 96 | Cost model | positive | Amplify Hosting for the two static SPAs is correct and cheap; it would not replace CloudFront for the API path |
| 97 | Cost model | positive | The VPC deliberately has no NAT gateway and S3 Bucket Keys are already on — the two cost traps this review was asked to check for are already closed |
| 98 | DPDP / SOC2 / data lifecycle | blocker | Erasure scope is derived from information_schema at runtime; DynamoDB has no catalog, so coverage becomes a hand-maintained registry that drifts silently |
| 99 | DPDP / SOC2 / data lifecycle | blocker | Whole-account erasure is one Postgres transaction with a table lock; DynamoDB caps a transaction at 100 items / 4 MB, so erasure becomes non-atomic |
| 100 | DPDP / SOC2 / data lifecycle | blocker | DynamoDB TTL is structurally incompatible with the audit hash chain and cannot evidence a fixed retention period |
| 101 | DPDP / SOC2 / data lifecycle | blocker | The natural Amplify + DynamoDB pattern (browser -> Cognito Identity Pool -> DynamoDB) deletes the audit trail and the x-user-id trust boundary |
| 102 | DPDP / SOC2 / data lifecycle | blocker | Aadhaar ciphertext is bound by KMS encryption context to the owner id AND the record id — re-keying during migration makes it permanently undecryptable |
| 103 | DPDP / SOC2 / data lifecycle | major | DynamoDB's default AWS-owned encryption key contradicts the platform's own written SOC 2 control |
| 104 | DPDP / SOC2 / data lifecycle | major | DynamoDB is an internet-facing API endpoint; the Aadhaar ciphertext blast radius widens from VPC-only to credential-only |
| 105 | DPDP / SOC2 / data lifecycle | major | Presigned PUT cannot enforce the 100 MB upload cap; only presigned POST can |
| 106 | DPDP / SOC2 / data lifecycle | major | Presigned GET blinds the download audit events and cannot express the existing share-link expiry |
| 107 | DPDP / SOC2 / data lifecycle | major | PITR window grows from 7 days to 35, and the ROPA's backup-erasure sentence becomes false |
| 108 | DPDP / SOC2 / data lifecycle | major | There is no cross-table point-in-time consistent restore; restoring audit_events_v2 and audit_chain_head separately guarantees a permanent CHAIN BROKEN verdict |
| 109 | DPDP / SOC2 / data lifecycle | major | DynamoDB Streams republish the full OldImage of every erased item and retain it for 24 hours — an erasure emits the data it is erasing |
| 110 | DPDP / SOC2 / data lifecycle | major | foreign_children() reads pg_constraint's 42 foreign keys to refuse erasing into another owner's rows — no DynamoDB equivalent exists |
| 111 | DPDP / SOC2 / data lifecycle | moderate | A separate Cognito user pool for university.pattadar.com would leave a live identity behind after a completed erasure |
| 112 | DPDP / SOC2 / data lifecycle | moderate | GSI erasure works, but GSI reads are always eventually consistent, so verify() can pass while a GSI still serves the erased item |
| 113 | DPDP / SOC2 / data lifecycle | moderate | aadhaar_candidates' 30-minute lifetime cannot be delivered by TTL, and the ROPA states 30 minutes as fact |
| 114 | DPDP / SOC2 / data lifecycle | moderate | Data residency under the proposal is fine; the us-east-1 elements are control-plane, not customer data — but WAF logging would change that |
| 115 | DPDP / SOC2 / data lifecycle | minor | The audit chain head becomes a single hot DynamoDB item with a 1,000 WCU/s ceiling, but that is not a launch problem |
| 116 | DPDP / SOC2 / data lifecycle | minor | Records of Processing is stale against the code: photos are file references not data-URLs, and the 290 GB land corpus has no ROPA entry at all |
| 117 | DPDP / SOC2 / data lifecycle | positive | POSITIVE: DynamoDB's 400 KB item limit forces the document_read_jobs.source fix the Aadhaar runbook already wants |
| 118 | DPDP / SOC2 / data lifecycle | positive | POSITIVE: S3 owner-prefixed keys and prefix-based deletion survive presigned uploads unchanged, including orphans |
| 119 | DPDP / SOC2 / data lifecycle | positive | POSITIVE: IAM on a DynamoDB audit table is a stronger privilege boundary than the Postgres trigger, by the code's own admission |
| 120 | How the migration would actually run | blocker | No data-access seam exists: 1,554 psycopg call sites are inline in resolvers, so the port is 1,554 hand-edits |
| 121 | How the migration would actually run | blocker | The 287 GB land corpus cannot run on DynamoDB — its three query shapes (trigram similarity, HNSW vector search, SQL aggregates) have no DynamoDB equivalent |
| 122 | How the migration would actually run | blocker | 39 unbounded set-deletes and 59 multi-statement transactions exceed TransactWriteItems' 100-item / 4 MB ceiling by construction |
| 123 | How the migration would actually run | blocker | The audit hash chain and the payments state machine depend on FOR UPDATE row locks (49 sites) — in DynamoDB the chain head becomes a single hot partition capped at ~1,000 WCU/s |
| 124 | How the migration would actually run | major | 16 partial unique indexes enforce business invariants DynamoDB cannot express at all — a GSI key is not unique |
| 125 | How the migration would actually run | major | AWS DMS is not usable for this migration — its DynamoDB target cannot join, so all 85 tables need custom ETL |
| 126 | How the migration would actually run | major | Dual-write has no distributed transaction here, and after the first DynamoDB-only write there is no rollback without a purpose-built reverse-ETL |
| 127 | How the migration would actually run | major | 509 tests would need re-platforming; 16 files stand up a real PostgreSQL and encode SQL-level behaviour |
| 128 | How the migration would actually run | major | Calibrated effort: 40-58 engineer-weeks solo (10-14 calendar months) for the OLTP half, during which nothing else ships |
| 129 | How the migration would actually run | major | Irreversible vs reversible: only three decisions in the proposal are one-way doors, and all three are on the DynamoDB side |
| 130 | How the migration would actually run | moderate | The boot-time DDL (89 CREATE TABLE, 225 ALTER TABLE ADD COLUMN) is the real migration liability today, and DynamoDB would make it disappear for the wrong reason |
| 131 | How the migration would actually run | moderate | Item-size and page-size limits need measuring before commitment: 8 jsonb columns include full AI deed-extraction payloads |
| 132 | How the migration would actually run | positive | POSITIVE: the GraphQL schema is a real contract seam — a datastore swap does not touch any of the four frontends |
| 133 | How the migration would actually run | positive | POSITIVE: S3 presigned uploads are the right call and are independent of DynamoDB — but the bucket needs CORS and signed SSE-KMS headers first |
