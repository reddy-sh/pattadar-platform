# Platform up / down

One-click environment lifecycle. Run locally or via the `Platform up` /
`Platform down` GitHub workflows (prod down requires typing
`decommission-prod` in the confirm input).

```sh
scripts/platform-up.sh dev      # bring dev up
scripts/platform-down.sh dev    # park dev
```

## What platform-up.sh does

0. **prod only:** refuses to start unless `SHARED_HOST_SECURITY_SIGNOFF` names
   Reddy's `pattadar-security-review` sign-off for the one shared ECS host
   (accepted for pre-launch only; step 2 restores a snapshot that can hold
   real Aadhaar data). See [tested-release.md](tested-release.md)
   § "One-host runtime cutover gates" for the launch trigger. The `Platform up`
   workflow passes the repository variable of the same name. Dev runs on
   synthetic data and needs no sign-off.
1. `terraform apply` on `envs/<env>/persistent` — idempotent, usually a no-op.
2. Finds the newest RDS snapshot `pattadar-<env>-pg-final-*` and exports it as
   `TF_VAR_restore_snapshot_identifier` so the runtime layer restores the
   database instead of creating an empty one. No snapshot → fresh DB (the api's
   `init_db()` bootstraps its ~28 tables).
3. Checks that the five app SSM SecureStrings exist:
   `/pattadar/<env>/{db-app-password, cron-secret, anthropic-api-key,
   internal-proxy-secret-api, internal-proxy-secret-assistant}`, each a
   SecureString under the persistent CMK (`alias/pattadar-<env>`; the default
   `aws/ssm` key would let the instance role decrypt it). It reads names and
   key ids only, never values, and SSM refuses an empty value, so CRON_SECRET
   is always set. When one fails it exits 1 and prints the out-of-band fix. A
   missing `db-app-password` is **reserved for Reddy**, because it must match
   the `pattadar_app` role in the database (copy the old value, or set a new
   one with a master-user `ALTER ROLE`). Creating them:
   [account-bootstrap.md](account-bootstrap.md) § "App SSM SecureStrings".
4. `terraform apply` on `envs/<env>/runtime`: VPC, the ECS host and its three
   services, RDS, the api CloudFront distribution with its VPC origins (each
   takes up to ~15 minutes), the SPA distribution (prod), and the EventBridge
   cron.
5. Checks the documents bucket for Glacier-class objects and, if any, prints a
   pointer to [s3-thaw.md](s3-thaw.md). It never auto-restores.
6. Smoke, over HTTPS through CloudFront, retrying for up to 5 minutes each:
   - anonymous `https://<api_domain>/api/gateway/pattadar/health` is `401`
     from the gateway;
   - an anonymous `invitePreview` query to
     `https://<api_domain>/api/gateway/pattadar/graphql` is `200` with state
     `invalid`: one SELECT that proves CloudFront, the gateway, the api proxy
     secret, the `172.17.0.1:8081` hop, the api and RDS together;
   - `POST https://<api_domain>/cron/inactivity-check` without `x-cron-secret`
     is `403` with body `{"error":"forbidden"}` from the cron handler. A `503`
     would mean CRON_SECRET is unset, and `{"error":"Forbidden"}` that the
     private-ingress exemption no longer matches the cron path;
   - `https://<api_domain>/graphql` is `404` from the edge, showing the api is
     not exposed;
   - prod only: anonymous `https://pattadar.com/api/gateway/pattadar/health` is
     `401`;
   - `aws ecs describe-services` shows all three services with
     `runningCount == desiredCount`.

   On a FAIL it prints the last status (`000` means no connection, for example
   DNS) and the log groups to tail, `/pattadar/<env>/<service>`. It then exits
   1 while any SNS alarm subscription is still `PendingConfirmation`.

## What platform-down.sh does

1. Confirmation prompt (or `PLATFORM_DOWN_CONFIRM=yes` in CI). The persistent
   layer and users are **not** touched. It then checks that
   `/pattadar/<env>/cron-secret` exists (name only): the scheduler reads it
   through a data source, so without it the apply and destroy fail.
2. Full runtime `apply` with `TF_VAR_deletion_protection=false`.
3. Runtime `destroy` with `TF_VAR_final_snapshot_suffix=$(date +%Y%m%d%H%M)` —
   RDS writes the final snapshot `pattadar-<env>-pg-final-<timestamp>` before
   dying. This snapshot is what the next `platform-up.sh` restores. VPC-origin
   deletion adds about 15-30 minutes. Prod's SPA bucket goes with its objects
   (`force_destroy`). Deploy re-uploads the site, but the release backups under
   `releases/<id>/previous/` (each release's rollback copy) are lost.
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
- **`force_destroy` must reach state before any down.** Step 2 re-applies only
  while the RDS instance is still in state. After a partial down it skips the
  apply, so a SPA bucket created before `force_destroy` existed still blocks
  the destroy, and parking never runs. Land it with a full
  `scripts/platform-up.sh` apply first. This applies to today's partial prod
  state. Do not empty the bucket by hand.
- The SSM SecureStrings and the persistent Secrets Manager secrets are outside
  the runtime state, so a down never deletes them and an up never recreates
  them.

## Parked-state monthly cost (approx, ap-south-1)

| Item | ~USD/month |
| --- | --- |
| Route53 hosted zone | 0.50 |
| KMS CMKs (shared + Aadhaar) | 2.00 |
| Secrets Manager (6 persistent secrets; 2 after the 4 unused containers are deleted) | 2.40 (0.80) |
| SSM SecureStrings (5, standard tier) | 0.00 |
| Documents bucket, ~1.4 GB in DEEP_ARCHIVE | < 0.01 |
| RDS final snapshot (~1 GB) | 0.10 |
| ECR images (~2 GB) | 0.20 |
| CloudTrail bucket + logs/state buckets | < 0.50 |
| Cognito (pilot MAU, free tier) | 0.00 |
| **Total parked** | **~5–6 (~4 after the Secrets Manager cleanup)** |

Estimates from list prices, not billing. The running runtime (one host, RDS,
CloudFront) is costed in
[the one-server runtime decision](../specs/2026-10-26-one-server-runtime.md).

Reminder: DEEP_ARCHIVE has a **180-day minimum storage charge** — parking is
for months, not days, and never park-then-delete within 6 months
([s3-thaw.md](s3-thaw.md)).

## SNS / SES confirmation clicks

- **SNS** (alarm topic): every email subscription starts as
  `PendingConfirmation` — click **Confirm subscription** in the email or
  alarms go nowhere. `platform-up.sh` exits 1 while any are pending; only a
  human sets `ALLOW_PENDING_ALARMS=1` to skip that check.
- **SES**: domain identity verifies via Route53 DKIM records automatically
  once DNS is cut over; any **email-address** identities (pre-cutover testing)
  need their own confirmation click. Production sending requires the sandbox
  exit in [account-bootstrap.md](account-bootstrap.md).

## Un-parking note

The in-place copy used for parking/un-parking writes a new object version, so
GuardDuty re-scans (and re-tags) each object on the way back — a few paise of
scan cost, and the scan-tag gate stays satisfied.
