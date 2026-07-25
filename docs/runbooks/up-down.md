# Platform up / down

One-click environment lifecycle. Run locally or via the `Platform up` /
`Platform down` GitHub workflows (prod down requires typing
`decommission-prod` in the confirm input).

```sh
scripts/platform-up.sh dev      # bring dev up
scripts/platform-down.sh dev    # park dev
```

## What platform-up.sh does

1. `terraform apply` on `envs/<env>/persistent` — idempotent, usually a no-op.
2. Finds the newest RDS snapshot `pattadar-<env>-pg-final-*` and exports it as
   `TF_VAR_restore_snapshot_identifier` so the runtime layer restores the
   database instead of creating an empty one. No snapshot → fresh DB (the api's
   `init_db()` bootstraps its ~28 tables).
3. Reads `pattadar/<env>/cron-secret` from Secrets Manager into
   `TF_VAR_cron_secret_header_value` (never printed) — CRON_SECRET is always
   set, per the platform invariants.
4. `terraform apply` on `envs/<env>/runtime` (VPC, ALB, ECS, RDS, CloudFront,
   EventBridge cron).
5. Checks the documents bucket for Glacier-class objects and, if any, prints a
   pointer to [s3-thaw.md](s3-thaw.md). It never auto-restores.
6. Smoke: curls `http://<alb_dns>/health` (gateway) and
   `http://<alb_dns>/api/gateway/pattadar/health` (api via gateway), retrying
   up to 5 minutes each; then reminds you about pending SNS confirmations.

## What platform-down.sh does

1. Confirmation prompt (or `PLATFORM_DOWN_CONFIRM=yes` in CI). The persistent
   layer and users are **not** touched.
2. Full runtime `apply` with `TF_VAR_deletion_protection=false`.
3. Runtime `destroy` with `TF_VAR_final_snapshot_suffix=$(date +%Y%m%d%H%M)` —
   RDS writes the final snapshot `pattadar-<env>-pg-final-<timestamp>` before
   dying. This snapshot is what the next `platform-up.sh` restores.
4. Parks every documents-bucket object into `parking_storage_class`
   (Terraform output; default `DEEP_ARCHIVE`) via in-place `aws s3 cp`,
   paginated over the whole `{owner}/...` keyspace, logging counts.

## The deletion-protection flip, explained

RDS is created with `deletion_protection = true` so nobody (including
Terraform) can drop the database by accident. `terraform destroy` refuses to
delete a protected instance, so the down script first runs a **full** runtime
apply with the variable flipped to `false` — a one-line diff on the RDS
resource — and only then destroys. There are deliberately **no targeted
applies** (`-target` desyncs state and skips dependencies); flipping via a
full apply keeps state honest.

## Half-completed down (or up): recovery

**Re-run the same script.** Terraform state knows exactly what is left; both
scripts are idempotent from any interruption point.

- Never delete stuck resources in the console — that desyncs state and turns a
  5-minute rerun into an afternoon of `terraform state rm` archaeology.
- If destroy fails on RDS with "deletion protection enabled", the apply in
  step 2 didn't complete — just re-run `platform-down.sh`.
- If parking (step 4) was interrupted, re-running the whole script is safe:
  destroy is a no-op on an empty state and the parking loop skips
  already-parked objects.

## Parked-state monthly cost (approx, ap-south-1)

| Item | ~USD/month |
| --- | --- |
| Route53 hosted zone | 0.50 |
| KMS CMK | 1.00 |
| Secrets Manager (2 secrets) | 0.80 |
| Documents bucket, ~1.4 GB in DEEP_ARCHIVE | < 0.01 |
| RDS final snapshot (~1 GB) | 0.10 |
| ECR images (~2 GB) | 0.20 |
| CloudTrail + logs/state buckets | < 0.50 |
| Cognito (pilot MAU, free tier) | 0.00 |
| **Total parked** | **~3–4** |

Reminder: DEEP_ARCHIVE has a **180-day minimum storage charge** — parking is
for months, not days, and never park-then-delete within 6 months
([s3-thaw.md](s3-thaw.md)).

## SNS / SES confirmation clicks

- **SNS** (alarm topic): every email subscription starts as
  `PendingConfirmation` — click **Confirm subscription** in the email or
  alarms go nowhere. `platform-up.sh` prints a reminder when any are pending.
- **SES**: domain identity verifies via Route53 DKIM records automatically
  once DNS is cut over; any **email-address** identities (pre-cutover testing)
  need their own confirmation click. Production sending requires the sandbox
  exit in [account-bootstrap.md](account-bootstrap.md).

## Un-parking note

The in-place copy used for parking/un-parking writes a new object version, so
GuardDuty re-scans (and re-tags) each object on the way back — a few paise of
scan cost, and the scan-tag gate stays satisfied.
