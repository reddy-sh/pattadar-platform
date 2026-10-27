# Release Readiness Evidence Matrix

Verified against repository release sources on 09/10/2026, and the one-host
runtime release path on 26/10/2026 (code only, not applied).

| Gate | Evidence | Source |
|---|---|---|
| Exact revision | full SHA is current main and CI passed for it | `.github/workflows/{ci,deploy}.yml` |
| Runtime state | prod runtime is up: deploy reads runtime Terraform outputs (including `task_definition_arns`, the `--templates` input) and promotion requires ACTIVE services; unknown is a blocker | `deploy.yml`, `scripts/deploy-release.py`, `docs/runbooks/up-down.md` |
| Web origin | `deploy.yml` hardcodes `--web-origin spa`; anything else, including Terraform `web_origin = "ecs"`, is a blocker (the web ECS service, task and target group were removed on 26/10/2026, so `ecs` has no template) | `deploy.yml`, `infra/terraform/README.md` |
| Immutable images | every required service image exists for the SHA/digest | `scripts/deploy-release.py` |
| SPA revision | bundle stamped with the exact SHA | `apps/web/dist/.release-sha` contract |
| Functional acceptance | every changed create/read/update/delete/add-content operation and its failure path; NOT_RUN legs (simulator, live backend) are not a pass | `functional-acceptance` output |
| Identity | complete owner/admin inventory and reviewed bindings | `docs/runbooks/identity-migration.md` |
| Attachments | first durable release: complete copy/readback receipt with writers drained; routine release: read-only `durable_verified` receipt whose writer image matches the running assistant | `docs/runbooks/assistant-attachment-migration.md`, `tested-release.md` |
| Rollback | tested durable assistant task and evidence; on the one-host runtime a digest-pinned EC2/bridge revision (the shape check refuses a FARGATE/awsvpc one before any change) | `docs/runbooks/tested-release.md` |
| One-host cutover | every gate in `tested-release.md` § "One-host runtime cutover gates" holds, or the first release on it is NO-GO: Reddy's shared-host `pattadar-security-review` sign-off before real Aadhaar data, iOS passbook on `-async` or 180 s accepted, dev proof passed, KMS policy admits `events.amazonaws.com` | `docs/specs/2026-10-26-one-server-runtime.md` |
| Release window | each service is out about 1-2 minutes (the gateway step takes the app and API down, and an api restart fails in-flight readings); the health gate waits up to about 5 minutes per service; no api update starts at 05:50-06:10 UTC; release gates refuse `ALLOW_INSECURE_LOCAL`, proxy secrets not from their own SSM parameter, command overrides and host namespaces (full list in `tested-release.md`) | `scripts/deploy-release.py`, `tested-release.md` |
| Infrastructure | reviewed task/IAM/S3/KMS configuration applied, including the Aadhaar KMS key (the API refuses to start without `AADHAAR_KMS_KEY_ARN` outside local/test, and preflight does not check it), `STORAGE_KMS_KEY_ARN` for gateway storage, and the `github_deploy` policy | `tested-release.md`, `docs/specs/TODO-prod-persistent-pending.md`, `docs/runbooks/aadhaar-kms-rollout.md` |
| Operations | restore/alert exercise and provider setup recorded | `docs/compliance/engineering-checklist.md`, `docs/runbooks/rds-restore-drill.md`, provider runbooks such as `razorpay-payments.md` |
| Preflight artifact | private, exact-SHA, under 24 hours, complete | `tested-release.md` |
| University | own typecheck/test/build only, no CI gate; `aws s3 sync --delete` with no backup or receipt, so no automated rollback; smoke test checks `/.release-sha` | `.github/workflows/deploy-university.yml`, `scripts/deploy-static-site.sh` |

Dated repository notes are recorded state, a separate evidence class: for
example `TODO-prod-persistent-pending.md` (a 27/09/2026 plan showed 24 pending
prod persistent changes) and the runtime recorded as destroyed by `platform-down.sh` in
`docs/architecture/2026-09-21-dynamodb-migration-review.md`. Cite their date,
treat them as unresolved until fresh approved evidence says otherwise, and never
present them as live state. After any restore, rerun the identity and attachment
preflight.

Read `.github/workflows/deploy.yml`, `scripts/deploy-release.py`, and
`docs/runbooks/tested-release.md` when assessing a real release. Use actual tool
outputs, not illustrative empty objects.

## Go/no-go template

| Gate | Status (ready/blocker/unknown) | Evidence | Owner | Next action |
|---|---|---|---|---|

An exact-SHA assessment ends with one recommendation for Reddy: **GO** or
**NO-GO**. A gap analysis ends with its open blockers, not a verdict. Unknown
external evidence is a blocker, not an assumed pass.
