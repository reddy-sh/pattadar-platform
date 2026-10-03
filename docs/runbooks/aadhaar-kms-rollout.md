# Aadhaar KMS and SSE-KMS rollout

This runbook governs the additive rollout of direct AWS KMS field encryption for
Aadhaar numbers and explicit SSE-KMS for uploaded document objects. Repository
source is implemented; it is **not** evidence that a key, policy, task revision,
bucket control, or data migration has been applied in any environment.

Reddy must approve the exact environment, revision, Terraform plan, migration
manifest, maintenance/writer-control window, rollback point, and evidence
location before any cloud change or data migration. Never print plaintext
Aadhaar, ciphertext, owner inventories, account identifiers, or KMS request
payloads in logs or evidence.

## Implemented contract

- `services/api/src/aadhaar.py` writes versioned `kms-direct:v1:` ciphertext by
  direct KMS `Encrypt`, with `app`, environment, purpose, hashed owner reference,
  record ID and schema as non-PII encryption context.
- Production/non-test startup fails when `AADHAAR_KMS_KEY_ARN` is absent.
  New KMS writes additionally require `AADHAAR_KMS_WRITES_ENABLED=1`; until
  that gate is approved, the runtime is a dual-reader with protected writes
  disabled or a separately enabled legacy bridge.
- Legacy Fernet ciphertext in `family_members.aadhaar_enc` and
  `users.kyc_ref_enc` is no longer read by any runtime path; it is cleared, not
  migrated (see "Clearing existing Aadhaar data"). Fernet writes into the vault
  need `AADHAAR_ENC_KEY` plus either `ALLOW_INSECURE_LOCAL=1` (local/test only)
  or a temporary deployed bridge, which requires both the approved secret
  injection and `AADHAAR_LEGACY_WRITE_BRIDGE=1`.
- Local Aadhaar scans and saves also need `AADHAAR_ENC_KEY` (or a local
  `AADHAAR_KMS_KEY_ARN`), because every reading is protected in the vault.
  `scripts/start-local.sh` reads it from the gitignored `.local/aadhaar-key.env`
  and passes it to the API process only (`docs/qa/tester-onboarding.md`).
  Without a write path the reading is refused with 503 before the provider is
  called (no job row, no source bytes), and local startup logs
  `aadhaar.write_path_missing`. A protection failure after a paid read is
  reported as the one fixed 503 "Aadhaar protection is temporarily unavailable.
  Nothing was saved.", never retried.
- Gateway and assistant S3 writers explicitly send `aws:kms`, the configured
  document key ARN, and bucket-key enablement. Deployed gateway construction
  fails without `STORAGE_KMS_KEY_ARN`; a custom endpoint is exempt only when
  `APP_ENV` is local/test and `ALLOW_INSECURE_LOCAL=1` is also explicit.
- Terraform declares a dedicated single-Region Aadhaar field key, least-
  privilege API permissions constrained by encryption context, gateway/
  assistant document-key configuration, and a default-off bucket-policy gate
  that denies a missing/wrong SSE-KMS key after compatible writers are proven.

### Vault model

Retention change pending Reddy's compliance review: the records below are kept
until no person or account references them, not for 30 minutes.

- **Records.** `aadhaar_candidates` is the Aadhaar table: one row per read or
  typed Aadhaar, holding the extracted name, date of birth, gender, address,
  confidence, last 4, mask, `origin` (`scan`/`typed`), job id and an optional
  card link. It never holds the full number. A scanned reading stays one-use
  for 30 minutes until a save consumes it; consumed and typed records are
  durable (`expires_at` is the far-future sentinel `9999-01-01 00:00:00+00`).
  Legacy pending readings without a vault row are refused with "read the card
  again".
- **Vault.** `aadhaar_vault` holds only `token`, `owner_user_id`, `ciphertext`
  and `created_at`. The full number is encrypted once per Aadhaar instance
  under encryption context `purpose=aadhaar-vault` with the vault token as
  `record` (direct KMS `Encrypt` in AWS, Fernet locally). No runtime code path
  decrypts it.
- **References.** `family_members.aadhaar_record_id` and
  `users.kyc_aadhaar_record_id` point at a record; `applyMyKyc` points the
  account and every self member at the same record. Writers blank the legacy
  `aadhaar_enc`/`kyc_ref_enc` columns, which are no longer read.
- **Release, sweep and reconcile.** A record and its vault row are deleted in
  the writer's transaction as soon as no subject references them (replace,
  clear, member/group removal). The 60-second sweep deletes unconsumed
  readings after 30 minutes and, as a backstop, unreferenced records and
  orphaned vault rows older than 5 minutes; it logs counts only
  (`aadhaar.sweep expired=N orphaned=N`). Boot blanks subject pointers to
  records that no longer exist.
- **Responses.** Extraction returns only `aadhaarMasked` and an owner-scoped
  `aadhaarCandidateId` (the record id); completed `document_read_jobs.result`
  holds exactly that. GraphQL returns `XXXX-XXXX-1234` masks only, and clients
  show the last 4 digits. **Reveal is retired; no API returns the full
  number.** `revealMyAadhaar`/`revealMemberAadhaar` remain in the schema for
  older clients and always answer "Full Aadhaar numbers are not shown. Only the
  last 4 digits are kept for display."
- **Opt-in card.** The web member form keeps the original card only when "Also
  keep the original card in my encrypted Drive" is ticked (unticked by
  default). It is uploaded through the existing gateway storage API (`{node}/
  {version}` key, SSE-KMS in AWS) under the fixed safe name `Aadhaar card.<ext>`
  (never the picked filename), then linked to the record with
  `linkAadhaarCard(candidateId, nodeId, versionId)` (audited as
  `link_aadhaar_card`, "Kept an Aadhaar card"). The link is a pointer only; the
  gateway still authorizes every read by owner in SQL. A kept card holds the
  full printed number and is the owner-requested exception to "full number
  never stored". Expo Aadhaar forms do not copy the card to Drive or plaintext
  local app storage, and the transient picker/cache file is removed when
  supported.
- **Isolation boundary (D3a).** The vault is logical separation, not UIDAI ADV
  isolation: it shares the database, DB role, CMK and the API task role's
  `kms:Decrypt` grant on `aadhaar-*`. In AWS the gateway and assistant share the
  `hub` database and `pattadar_app` role, so they can read vault ciphertext and
  the plaintext record fields, but cannot decrypt. Hardening options are **open
  decisions for Reddy**, each with its own approval: (i) an IAM `Deny
  kms:Decrypt` on `purpose=aadhaar-vault` for the API task role (Terraform);
  (ii) a dedicated API-only DB role or schema for the vault and records;
  (iii) a dedicated vault CMK.

## Remaining known exposure and prerequisites

- Durable Aadhaar reading jobs temporarily hold source bytes in the encrypted
  RDS `document_read_jobs.source` column until completion/failure cleanup. The
  completed result is masked-only, but moving queued source bytes to an
  owner-scoped S3 reference is a separate architecture change.
- The production legacy Fernet inventory is unknown. Legacy ciphertext is no
  longer read and is removed by the production clear, which awaits Reddy's
  approval; until that clear has evidence it remains in the database. (Historical:
  the earlier rule "do not deploy a reader that cannot decrypt legacy rows" was
  written for the superseded migration in approval gate 2.)
- Reveal is retired; no API returns the full number. (Historical: the earlier
  owner-scoped, audited reveal relied on the ordinary authenticated session,
  without recent-reauthentication or a rate limit.) The ciphertext is kept, so
  masked display is not irreversible truncation.
- The vault isolation boundary (D3a above) is logical only; its hardening
  options are open decisions for Reddy.
- Native iOS still offers an on-device tap-to-reveal of the full number read
  from the user's own scan, and reads Aadhaar through the synchronous
  `POST /extract-aadhaar` route; both are recorded divergences in
  `docs/specs/2026-08-22-web-ios-parity-contract.md`.
- GuardDuty malware verdict gating is not implemented for retained card images.
  Opt-in retention must not be represented as malware-cleared.
- No current repository evidence proves applied key rotation, bucket-policy
  enforcement, CloudTrail events, restore/reveal success, or production IAM.

## Approval gate 1 — static plan review

Before running Terraform or accessing AWS, prepare a release packet containing:

1. exact git SHA and target environment (`dev` before `prod`);
2. saved Terraform plan generated under the infrastructure-change workflow;
3. resource impact for the new key, API task policy/revision, gateway task
   revision, and documents bucket policy;
4. confirmation that every current documents-bucket writer sends the required
   SSE-KMS headers (gateway and assistant/operational writers included);
5. rollback sequence and expected CloudTrail/task/bucket evidence;
6. a legacy-ciphertext inventory method that reports counts only; and
7. named custodian and evidence location for the legacy Fernet key.

Required approval: **Reddy approves the exact SHA, environment, saved plan and
rollback/evidence packet for apply.** A plan for one environment does not approve
another.

## Deployment order

After approval, use the normal tested-release and platform lifecycle procedures;
do not target resources or edit Terraform state manually.

1. Apply the persistent layer with
   `enforce_documents_sse_kms_headers=false` to create the dedicated Aadhaar
   key/output and the legacy-secret container without changing bucket writes.
2. Deploy the dual-reader API with `aadhaar_kms_writes_enabled=false`. If the
   count-only inventory finds legacy rows, first populate and explicitly enable
   the legacy bridge; if it proves an empty installation, the approved packet
   may instead enable KMS writes directly. The prior rollback target must be
   upgraded to read `kms-direct:v1:` before enabling KMS writes.
3. Deploy gateway and assistant writer revisions with the shared document key
   ARN and prove that every new-file/new-version/attachment path sends explicit
   SSE-KMS headers. Keep bucket enforcement off during rolling replacement.
4. In a separate reviewed persistent plan, set
   `enforce_documents_sse_kms_headers=true` and prove missing/wrong headers are
   denied.
5. In staging/dev, use synthetic data only to prove:
   - manual Aadhaar write produces `kms-direct:v1:` ciphertext and a mask;
   - masked extraction creates a reading whose vault row holds
     `kms-direct:v1:` ciphertext, rejects a different owner, expires, and
     cannot be used twice;
   - both reveal mutations return the retirement message and no digits;
   - new-file, new-version and assistant attachment writes report the expected
     SSE algorithm, key ARN and bucket-key state; and
   - a write with missing/wrong encryption headers is denied.
6. Capture redacted evidence (request IDs, counts and policy/task revision IDs),
   never plaintext or ciphertext values.

## Approval gate 2 — legacy migration

**SUPERSEDED.** Existing Aadhaar data is cleared, not migrated, because the
product is still incubating (see "Clearing existing Aadhaar data"). The text
below is kept as history and must not be executed.

Migration is a separate reserved operation. Build a reviewed utility that:

1. obtains writer control or uses a bounded dual-write-compatible window;
2. selects only non-empty ciphertext not beginning `kms-direct:v1:`;
3. decrypts each row with the retained Fernet key in memory, validates exactly
   12 digits, and immediately encrypts with the dedicated KMS key using the
   row's final account/member context;
4. updates by primary key with an old-ciphertext compare-and-swap predicate;
5. records only aggregate attempted/succeeded/skipped/failed counts;
6. checkpoints in bounded batches and can resume without reprocessing KMS rows;
7. reconciles account/member totals and samples owner-scoped reveal using
   synthetic or explicitly approved records; and
8. preserves a restore point and tested rollback procedure.

Required approval: **Reddy approves the migration code SHA, environment,
backup/restore point, writer-control method, batch size, reconciliation
thresholds and immediate execution window.** Obtain fresh confirmation directly
before execution.

## Clearing existing Aadhaar data

`services/api/scripts/clear_aadhaar.py` clears every stored Aadhaar identifier.
`--environment {local,dev,prod}` is required and the default is a read-only dry
run. Output is counts only (`linked=N`, `stage1 dry_run|executed …`, optional
`stage2 …`); names, numbers, ciphertext, ids, keys, DSNs and passwords are never
printed, and a re-run reports zeros. It refuses (exit 2, before any write) when
the vault-schema API has not booted on the target, and it refuses `--execute`
while linked cards exist unless `--cards-linked-first` or
`--abandon-linked-cards` is given.

- **Stage 1** (one transaction on the API database): deletes pending
  `extract-aadhaar` reads, blanks the Aadhaar mask, legacy ciphertext and
  record pointer on `users`, `family_members` and `beneficiaries`, and deletes
  every `aadhaar_candidates` and `aadhaar_vault` row.
- **Stage 2** (card files): deletes a kept card only after checking its owner,
  that it is a file, and that no text `file_ref`/`photo_ref`/`evidence_ref`/
  `*_file_ref`/`*_photo_ref` column references it.

### Local run (allowed now)

1. Boot the new API once so the schema exists, then stop the local stack
   (Ctrl-C on `start-local.sh`) so no local reading can create a record
   mid-clear.
2. Run, against the local database only, with the local values from
   `start-local.sh` (never values from `.local/*.env`):

```sh
cd services/api
export API_DSN="host=localhost port=5432 dbname=pattadar user=rhub" PGPASSWORD=<local>
export HUB_DSN="host=localhost port=5432 dbname=pattadar_hub user=rhub" STORAGE_BUCKET=pattadar-local-documents
export STORAGE_S3_ENDPOINT=http://127.0.0.1:9000 AWS_ACCESS_KEY_ID=<local minio> AWS_SECRET_ACCESS_KEY=<local minio>
PY=../../.local/api-venv/bin/python   # card deletion needs boto3: use ../../.local/gateway-venv/bin/python
CANDIDATES="$(mktemp -u)"   # the script creates it (new file only, mode 0600)
# 1. dry run: counts only (linked=N included); also lists unlinked heuristic card candidates for review
$PY scripts/clear_aadhaar.py --environment local --candidates-out "$CANDIDATES"
# 2. execute: linked cards first (verified, in-process), then stage 1
$PY scripts/clear_aadhaar.py --environment local --execute --cards-linked-first
# 3. optional: unlinked legacy cards, from the reviewed and pruned candidates file
$PY scripts/clear_aadhaar.py --environment local --card-nodes "$CANDIDATES" --execute   # after review and pruning
# 4. re-run: expect all zeros
$PY scripts/clear_aadhaar.py --environment local
```

The zero-count re-run is the evidence. `STORAGE_S3_ENDPOINT` must be loopback
for local card deletion. The candidates file is a scratch artifact: delete it
(`rm "$CANDIDATES"`) after review.

### Production procedure: AWAITING REDDY'S APPROVAL; NOT TO BE RUN BY AGENTS

**Scope:** the prod API database: every `aadhaar_candidates` and
`aadhaar_vault` row and every `document_read_jobs` row with
`operation='extract-aadhaar'`, plus blanking of the Aadhaar columns on `users`,
`family_members` and `beneficiaries`, for all owners. Optionally, a reviewed
stage-2 list in the prod hub database and documents bucket.

**Preconditions:** the vault-schema release is deployed through tested-release
and healthy; a fresh RDS snapshot is taken and its id recorded; the
documents-bucket versioning state is noted; a writer-control window is open
(API, gateway and workers drained, or maintenance held, per
[account-data.md](account-data.md) step 4).

**Command:** an ECS one-off task on the current API task definition, in the API
service's subnets and security group. The image contains `scripts/`; the
environment has the `PG_*` parts (`PG_PASSWORD` from Secrets Manager) and
`APP_ENV=prod`. **Never pass a password, DSN or credential in
`containerOverrides`**: overrides are visible in the RunTask request,
CloudTrail and `describe-tasks`. Only `command` and, for card work, the
non-secret `STORAGE_BUCKET` may be overridden.

```sh
aws ecs run-task --cluster <prod-cluster> --task-definition <prod-api-taskdef:rev> --launch-type FARGATE \
  --network-configuration '<api service awsvpc config>' \
  --overrides '{"containerOverrides":[{"name":"api","command":["python","scripts/clear_aadhaar.py",
    "--environment","prod","--allow-remote","--approval-ref","<ticket>"]}]}'
```

1. Run the dry run first (as above) and review the counts, including `linked=N`.
2. If `linked=0`, run the same command with `--execute --writers-drained`
   (stage 1 only).
3. If `linked>0`, stop; the script refuses `--execute` anyway. Return to Reddy
   with the count. The options are `--cards-linked-first` together with an S3
   permission route for the one-off task (an open IAM decision: neither task
   role can list or delete object versions today), or Reddy's explicit
   `--abandon-linked-cards`, which drops the links (counted) and leaves those
   files in Drive.
4. Run the zero-count re-run.
5. Heuristic cleanup of unlinked legacy cards is not available in prod until
   Reddy approves a transfer location for the reviewed list and the S3
   permission route; `--candidates-out` and `--card-nodes` are refused for
   dev/prod.

**Side effects:** every stored Aadhaar mask and ciphertext is gone; users see
no Aadhaar on file and must re-enter or re-scan; pending readings fail with
"read the card again"; audit history is untouched.

**Data exposure:** counts only. No candidate file is written in dev/prod,
linked pairs stay inside the task process, and the RunTask request carries no
secret.

**Reversibility: irreversible** in the live database, and in S3 once versions
are deleted. Recovery is only by RDS snapshot restore under
`safe-data-migration` and [rds-restore-drill.md](rds-restore-drill.md). The
data persists in automated backups until their retention expires, so it is not
claimed as erased from backups.

**Evidence:** dry-run, execute and zero re-run counts, the snapshot id, the
task ARN suffix and the SHA, all redacted.

**Required approval:** Reddy approves the exact SHA, the environment, the
snapshot id and the writer-control window, and either stage 1 alone or, if
`linked>0`, `--cards-linked-first` with its S3 role route or
`--abandon-linked-cards`. Heuristic card cleanup in prod is a later, separate
approval. **A fresh confirmation is required immediately before `--execute`.**
Dev, if running, gets the same procedure with its own approval.

## Rollback

- Application rollback: redeploy the previous compatible revision through the
  normal release workflow. Do not roll back to a version that cannot read
  `kms-direct:v1:` after any new write or migration.
- **Deploy overlap.** The API uses the ECS default rolling update, so old tasks
  run their 60-second sweep (`expires_at<now() OR consumed_at<now()-interval
  '1 day'`) beside new tasks during every deployment and after any rollback.
  Every durable record carries `expires_at = 9999-01-01 00:00:00+00`, so the old
  sweep deletes unconsumed readings 30 minutes after the read (as the new one
  does) and consumed records only one day after consumption. A deploy overlap
  lasts minutes, so no durable record is lost.
- **Vault-model rollback is schema-safe but lossy if the window exceeds a
  day.** The previous revision ignores the new table and columns, but while it
  runs: its sweep deletes consumed records one day after consumption, including
  referenced ones (dangling subject pointers, orphaned vault rows); its
  candidate consume fails (masked 500) on new readings, whose legacy
  `ciphertext` is NULL; and its writers set `aadhaar_masked`/`aadhaar_enc`
  without clearing `*_record_id`. On roll-forward the boot reconcile blanks
  dangling pointers, the sweep backstop removes orphaned vault rows, and writers
  blank legacy `*_enc` on the next write. Any rollback window **requires
  re-running the clear above**, with its approval, before the legacy columns are
  dropped.
- Policy rollback: use a reviewed Terraform change; never remove the bucket
  encryption deny while incompatible writers are active.
- Data rollback: restore from the approved point only under the safe-data-
  migration/restore workflow. Do not decrypt KMS rows back to Fernet ad hoc.
- Keep the dedicated KMS key enabled and protected from destruction throughout
  rollback and the evidence-retention period.

## Exit criteria

The rollout is complete only when evidence shows: exact release SHA; applied
persistent/runtime plans; healthy task revisions; successful synthetic
write/candidate/retired-reveal tests; S3 encryption metadata and negative
bucket-policy test; the approved production clear's zero-count re-run (before
Fernet retirement and before dropping the legacy columns); backup and rollback
evidence; and Reddy's recorded acceptance. Until then, describe the
state as “implemented in repository” or “deployed with migration pending,” not
“fully migrated” or “production verified.”
