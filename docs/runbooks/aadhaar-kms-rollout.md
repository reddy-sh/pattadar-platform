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
- Existing prefixed or unprefixed Fernet ciphertext remains readable while
  `AADHAAR_ENC_KEY` is retained. A temporary deployed bridge requires both the
  approved secret injection and `AADHAAR_LEGACY_WRITE_BRIDGE=1`; ordinary local
  Fernet writes still require `ALLOW_INSECURE_LOCAL=1`.
- Aadhaar extraction returns only `aadhaarMasked` and an owner-scoped,
  single-use `aadhaarCandidateId`. Candidate ciphertext expires after 30
  minutes; provider raw output and full digits are not returned to clients or
  stored in completed `document_read_jobs.result`.
- The active web member form retains the original card only after explicit
  opt-in. Expo Aadhaar forms do not copy the card to Drive or plaintext local
  app storage. The transient picker/cache file is removed when supported.
- Gateway and assistant S3 writers explicitly send `aws:kms`, the configured
  document key ARN, and bucket-key enablement. Deployed gateway construction
  fails without `STORAGE_KMS_KEY_ARN`; a custom endpoint is exempt only when
  `APP_ENV` is local/test and `ALLOW_INSECURE_LOCAL=1` is also explicit.
- Terraform declares a dedicated single-Region Aadhaar field key, least-
  privilege API permissions constrained by encryption context, gateway/
  assistant document-key configuration, and a default-off bucket-policy gate
  that denies a missing/wrong SSE-KMS key after compatible writers are proven.

## Remaining known exposure and prerequisites

- Durable Aadhaar reading jobs temporarily hold source bytes in the encrypted
  RDS `document_read_jobs.source` column until completion/failure cleanup. The
  completed result is masked-only, but moving queued source bytes to an
  owner-scoped S3 reference is a separate architecture change.
- The production legacy Fernet inventory and the availability/ownership of
  `AADHAAR_ENC_KEY` are unknown. Do not deploy a reader that cannot decrypt
  legacy rows, and do not remove that key before reconciliation proves zero
  legacy ciphertext remains.
- Full reveal is owner-scoped and audited but still relies on the ordinary
  authenticated session; a server-issued recent-reauthentication capability and
  reveal rate limit are not implemented. That auth-contract change requires a
  separate security design and Reddy approval before production acceptance.
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
   - masked extraction creates a candidate, rejects a different owner, expires,
     and cannot be used twice;
   - account/member reveal is owner-scoped and audited;
   - new-file, new-version and assistant attachment writes report the expected
     SSE algorithm, key ARN and bucket-key state; and
   - a write with missing/wrong encryption headers is denied.
6. Capture redacted evidence (request IDs, counts and policy/task revision IDs),
   never plaintext or ciphertext values.

## Approval gate 2 — legacy migration

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

## Rollback

- Application rollback: redeploy the previous compatible revision through the
  normal release workflow. Do not roll back to a version that cannot read
  `kms-direct:v1:` after any new write or migration.
- Policy rollback: use a reviewed Terraform change; never remove the bucket
  encryption deny while incompatible writers are active.
- Data rollback: restore from the approved point only under the safe-data-
  migration/restore workflow. Do not decrypt KMS rows back to Fernet ad hoc.
- Keep the dedicated KMS key enabled and protected from destruction throughout
  rollback and the evidence-retention period.

## Exit criteria

The rollout is complete only when evidence shows: exact release SHA; applied
persistent/runtime plans; healthy task revisions; successful synthetic
write/reveal/candidate tests; S3 encryption metadata and negative bucket-policy
test; zero unreconciled legacy ciphertext (before Fernet retirement); backup and
rollback evidence; and Reddy's recorded acceptance. Until then, describe the
state as “implemented in repository” or “deployed with migration pending,” not
“fully migrated” or “production verified.”
