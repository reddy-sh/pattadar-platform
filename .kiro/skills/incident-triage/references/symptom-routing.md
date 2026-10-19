# Incident Symptom Routing

"Execute via `platform-lifecycle`" means: diagnose here, then hand the run to
that skill, which needs a fresh confirmation from Reddy.

| Symptom | Start with | Key safety rule |
|---|---|---|
| Personal data exposed, altered or lost; another account's record visible | `docs/runbooks/incident-response.md` | confirmed until disproven; contain first (each step approval-gated); start the `incidents/` log; tell Reddy the DPDP/GDPR clock is running |
| `/api/*` 502 or every service down | `docs/runbooks/up-down.md` | check parked versus up before tracing; fully parked gives no answer, SPA served with `/api/*` 502 is a partial runtime; neither is a new outage; bring-up is a Reddy decision via `platform-lifecycle` |
| AI extraction failed/stuck | `services/api/src/ai_reading/jobs.py`; `docs/runbooks/extraction-triage.md` predates durable jobs and tails a wrong log group (runtime groups are `/pattadar/<env>/<service>`) | `document_read_jobs.state` is `queued`/`running`/`done`/`failed`; poll `GET /api/gateway/pattadar/import-status/<job>`; 429 = three readings already queued or running for that owner; 503 "not retried automatically" = stopped by the 15-minute sweep; resending the same `idempotency-key` returns the same job; never auto-retry the POST |
| Uploaded file unreadable | `services/gateway/src/storage.py` | read the key from `storage_versions.object_key` (new keys are `{node}/{version}`; runbooks that build `<owner>/<node>/<version>` are stale); the only scan gate is the documents-bucket policy denying `THREATS_FOUND`: untagged objects are served, there is no gateway gate, local MinIO has no scan; do not bypass owner checks |
| Cold/archived object | `docs/runbooks/s3-thaw.md` | never auto-thaw; account for restore time/cost; execute via `platform-lifecycle` |
| Wrong/empty account | `docs/runbooks/identity-migration.md` (rollout preflight; its Cognito export is a live, approval-gated query) | immutable subject + reviewed binding; no email inference; a visible foreign record is the first row |
| Local stack (`scripts/start-local.sh`) | ports api :8080, assistant :8081, gateway :8082, MinIO :9000, university :5181, web :5173 (mock :5180); logs `.local/api.log`, `.local/assistant.log`, `.local/gateway.log`; identity is Vite's `x-user-id` (`DEV_USER_ID`, default `shankarreddy.t`) in mock mode, otherwise the gateway with `.local/cognito-local.env` bindings | local DB/log reads of founder data need approval; errors met while building a feature go to the delivery skills |
| University site (`university.pattadar.com`) | `infra/terraform/envs/prod/university/main.tf`, `.github/workflows/deploy-university.yml` | own S3, CloudFront (GET/HEAD), WAF, ACM and Cognito client on the prod pool; not parked by `platform-down.sh` |
| Release unhealthy/stuck | `docs/runbooks/tested-release.md`; receipt is the `release-<sha>` artifact (reading it is an approval-gated GitHub query) | exact SHA; statuses are `deploying`, `deployed`, `rolled-back`, `rollback-incomplete`; a stuck `deploying` or `rollback-incomplete` is an incident |
| Platform up/down failure | `docs/runbooks/up-down.md` | no manual state surgery; rerun executes via `platform-lifecycle` |
| Database recovery | `docs/runbooks/up-down.md` (`platform-up.sh` restores the newest `pattadar-<env>-pg-final-*` snapshot) | execute via `platform-lifecycle`; row/object reconciliation via `safe-data-migration`; `docs/runbooks/rds-restore-drill.md` and `scripts/recovery-drill.py` are the scratch drill, not a cutover |
| Alert missing/noisy | `infra/terraform/modules/runtime/observability.tf`; `scripts/recovery-drill.py` | alarms and the SNS topic go away when parked; the drill's default mode makes read-only AWS calls and `--execute`/`--cleanup`/`--send-test-alert` create, delete or notify, so each needs approval; exercise records go to `compliance-evidence` |
| Share/recipient access | `docs/runbooks/scoped-recipient-access.md` | token scope/expiry and server authorization |
| Payment/provider | `docs/runbooks/razorpay-payments.md` | preserve idempotency and signed webhook checks; re-queue only the same operation (same UUID, payload and idempotency key), after verifying it and with approval |
| Account export/erasure | `docs/runbooks/account-data.md` | receipt completeness; payments can block erasure |

## Triage output

| Time | Observation | Evidence | Hypothesis | Next discriminating check |
|---|---|---|---|---|

Add containment status and the notification decision. Keep resource
identifiers and PII redacted. Record what was not checked.
