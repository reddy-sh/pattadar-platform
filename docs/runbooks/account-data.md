# Account export, choices and deletion

The account settings page uses the authenticated `/api/gateway/account` routes.
The gateway derives ownership from the verified subject and never accepts a
caller-supplied owner or subject. Private `/internal/account` routes in the API
and assistant are unreachable through the generic public proxies.

- `GET /export` downloads JSON containing the owner's API records, legacy
  children of owned records, stored-file/version manifest with authenticated
  download URLs, assistant conversation metadata, attachments, and full
  checkpoint archive. It omits authentication bearer credentials, encrypted
  KYC columns and raw document-read job source bytes. File bytes are downloaded
  separately using the manifest; binary assistant checkpoints use base64.
  A failed component fails the export rather than quietly omitting it.
- `GET /consent` returns `version`, `purposes`, and `acceptedAt`; no saved choice
  returns an empty list with a null timestamp. `POST /consent` accepts version
  `2026-09-12` and a list drawn from `document_processing`, `ai_extraction`, and
  `service_notifications`. Every update is appended with a server timestamp.
  Explicit withdrawal is enforced through `require_purpose`; an absent record
  preserves older clients. These records are not proof of guardian authority.
- `POST /erasure` requires `{"confirmation":"DELETE MY ACCOUNT"}` and an
  original Cognito `auth_time` within five minutes. Refreshing an access token
  does not qualify. It returns a durable 202 receipt. Repeated requests return
  the active receipt rather than create duplicate jobs.
- `GET /erasure` returns `{"request": receipt-or-null}`. A receipt carries
  `id`, `status`, timestamps, per-stage state and `needsOperator`. The request
  remains pending until the reviewed runner completes every stage. The
  settings page must not say the data was deleted when only requested.

## Closing the pre-consent grace (`CONSENT_STRICT`)

`require_purpose` gates document processing, AI extraction and service
notifications. An account with **no saved consent row** predates the consent
screen, and by default it is still served — otherwise the consent release would
lock out every existing user at once.

That grace is deliberate but it is not the finished state: while it is open, an
old account keeps having its documents processed with no recorded choice, and
the DPDP checklist cannot be satisfied by anything the code does.

Close it in this order:

1. List the accounts with no row:
   `SELECT DISTINCT owner_user_id FROM passbooks WHERE owner_user_id NOT IN (SELECT owner_user_id FROM account_consents);`
2. Ask each one — they land on the account settings page at next sign-in, which
   already redirects when `acceptedAt` is null.
3. When that list is empty (or the remainder are knowingly abandoned), set
   `CONSENT_STRICT=1` on the API task. From then on a missing row is a 403
   `CONSENT_REQUIRED`, not a pass.

`test_consent_grace_for_old_accounts_can_be_closed` pins both sides of the
switch, so neither default can drift silently.

## Executing a requested deletion

This is an operator workflow. No scheduled runner, live database deletion,
Cognito operation or object deletion is performed by installing this code.
Customer deletion requests work immediately; completing them requires a
configured operator role and a maintenance window that drains writers.

1. Review the request, any relevant retention obligations, and the approved
   identity migration manifest. The runner deletes all explicitly linked
   Cognito subjects for that owner. An email match is never sufficient.
2. Supply explicit `API_DSN`, `HUB_DSN`, and `ASSISTANT_DSN` environment values.
   The hub and assistant may use the same database. Supply `STORAGE_BUCKET`
   and `ASSISTANT_ATTACHMENTS_BUCKET` for production S3 storage. Use an IAM role
   limited to the target pool and buckets, including `ListBucketVersions`,
   `DeleteObjectVersion`, Cognito list/disable/delete, and ordinary object
   list/delete. The running app's task role need not have deletion powers.
3. Inspect a read-only plan:

   ```sh
   python services/api/scripts/erase_account.py --request-id RECEIPT_ID \
     --identity-manifest approved-identities.json --assistant-storage s3
   ```

   The command reads only until `--execute` is supplied. Its output contains
   row counts and stage names, not credentials or document contents. If old
   assistant attachments still use disk paths, additionally supply their
   verified `--legacy-attachments-dir`; paths outside it fail closed. For a
   database-only assistant use `--assistant-storage database` explicitly.
4. Drain gateway/API/assistant requests and background workers in a maintenance
   window. Stop accepting new work until deletion is finished. Disabling a
   Cognito user cannot stop work already in flight, so the runner deliberately
   requires operator confirmation that writers have drained.
5. Repeat the reviewed command with `--execute --writers-drained`. Stages are:
   freeze all linked subjects and owner access, remove every storage object
   version and delete marker, remove assistant objects and legacy files,
   delete assistant history/checkpoints, delete owned API data and its child
   rows, remove storage metadata, delete Cognito identities, then verify.
   Gateway access-block entries reject already-issued tokens as well as new
   ones; the receipt remains readable during processing.
6. On failure, status becomes `retry_required`. Resolve the reported provider
   error and run the same receipt again. Completed stages are not duplicated;
   object deletions and database deletions are idempotent, and final checks
   rerun before completion. Do not restore access after partially completed
   deletion without a separate recovery review.
7. Remove obsolete legacy identity bindings through the reviewed deployment
   configuration after deletion. The durable access block remains, keyed by
   one-way principal/owner hashes. Completed receipts clear plaintext subject,
   issuer and owner alias while retaining the requesting principal hash so a
   still-valid token can view its final receipt.

The runner preserves an optional minimal audit record with event type, time,
request reference and an expiry, with no original actor, target or free-text
personal details. `--audit-retention-days` defaults to 365; set it to the
approved operational policy, or 0 to retain none. Schedule
`python services/api/scripts/prune_account_audit.py --execute` with a restricted
DB role to enforce those expiry dates; without `--execute` it reports counts.
Backups, provider logs and externally delivered recipient copies require their
own documented retention/cleanup procedures and are not falsely reported as
erased by this runner.

## Verification

The account tests start an isolated temporary PostgreSQL cluster. They check
cross-account export isolation, legacy children, secret-column omission,
consent withdrawal, idempotent owner-scoped deletion receipts, owned-record
purging, refusal to cascade into foreign-owned rows, anonymized audit retention,
and removal of all S3 versions/delete markers with explicit partial-failure
handling. Gateway tests exercise recent-authentication checks and rejection of
unexpired tokens after an account has been frozen.
