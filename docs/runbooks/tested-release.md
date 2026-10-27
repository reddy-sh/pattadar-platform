# Release one tested revision

The deploy workflow runs after CI succeeds for an exact main-branch SHA. It
checks out that revision, builds all images before changing services, and stamps
the web bundle with `apps/web/dist/.release-sha`. Release promotion pins ECR
image digests and checks the source tree is the tested commit.

Before the first repaired release, apply the reviewed Terraform task/IAM
configuration. Prepare the [identity migration](identity-migration.md) and
[attachment migration](assistant-attachment-migration.md) while old files still
exist. Neither a raw `{}` environment variable nor a boolean deployment approval
can replace the account inventory and completed attachment copy.

Set `RELEASE_PREFLIGHT_S3_URI` to a private, operator-reviewed JSON artifact for
that specific SHA. The workflow downloads it to a temporary path. Its shape is:

```json
{
  "version": 1,
  "releaseSha": "FULL_40_CHARACTER_COMMIT",
  "generatedAt": "2026-09-12T12:00:00Z",
  "identity": {
    "manifest": {"issuer": "COGNITO_ISSUER", "bindings": [], "admin_subjects": []},
    "cognito": {"Users": []},
    "owners": {"owner_ids": [], "admin_owner_ids": [], "sources": ["ALL_DATABASE_SOURCES"], "complete": true}
  },
  "attachments": {"COPY_THE_COMPLETE_MIGRATION_RECEIPT_HERE": true},
  "rollback": {
    "assistant": {
      "taskDefinition": "ARN_OF_TESTED_DURABLE_READER_TASK",
      "durableReadVerified": true,
      "evidence": "Staging migration/read/download verification reference"
    }
  }
}
```

Use actual outputs from the migration tools, not the illustrative empty objects.
The identity helper checks every existing owner/admin and requires explicit
review evidence for multiple Cognito subjects intentionally sharing one owner.
The artifact and attachment receipt must be refreshed within 24 hours and match
the exact release. Identity inventories stay in the private artifact and are not
printed to deployment logs. Configure restricted access and retention for it.

Run `scripts/deploy-release.py` with the workflow arguments and `--preflight`
to preview. Without `--execute` it performs read-only AWS checks. It refuses:
missing images or a different source revision, stale web bundles, incomplete
owner/attachment migrations, missing applied bucket configuration, an inactive
or unpinned assistant rollback definition, or missing S3/KMS task permissions.
It also refuses before any change when:

- the assistant rollback definition is not the same shape as the planned
  revision (`networkMode`, `requiresCompatibilities`). On the one-host runtime
  it must be an EC2/bridge revision, so an older FARGATE/awsvpc rollback ARN
  cannot fail halfway through a rollback;
- any container sets `ALLOW_INSECURE_LOCAL`;
- the api or the assistant lacks `INTERNAL_PROXY_SECRET`, or the gateway lacks
  `INTERNAL_PROXY_SECRET_API` and `INTERNAL_PROXY_SECRET_ASSISTANT`. It checks
  names only; that the SSM parameters exist is platform-up's check;
- `--templates` is given and a service is missing from it.

Deploy passes `--templates /tmp/release-templates.json`, the
`task_definition_arns` output of `envs/prod/runtime`. Each new revision is
built from the Terraform template, so Terraform changes to memory, ports,
environment, secrets or `linuxParameters` actually ship. The rollback images,
the original revisions and the durable-writer check still come from the
running revision.
The deployment role needs read-only `iam:SimulatePrincipalPolicy`, S3 encryption
configuration access, and KMS describe access in addition to its deployment
permissions. Policy simulation checks the task identity policy; the recorded
staging read verifies actual bucket/key access as well.

Execution snapshots the whole current website, including mutable public files.
Old hashed assets remain available for open tabs. API/gateway rollback task
images are pinned to the digest actually running before the release, even if
their old task definitions used mutable tags. Backend services promote one at a
time, in the order api, assistant, gateway, and must reach the requested task
revision. The web index publishes last.

On the one-host runtime every service has a fixed host port and deploys with
minimum 0 / maximum 100: ECS stops the old task before starting the new one.
**Expect about 1-2 minutes of outage per service per release.** The gateway
step is a full outage of the app and the API, and an api restart fails any
reading in flight (never retried; the user re-submits). With no load balancer
health check, a service counts as healthy only when every running task is on
the requested revision with container `healthStatus` HEALTHY. The script polls
30 times at 10 s intervals, up to about 5 minutes per service, and otherwise
rolls back. The api update never starts between 05:50 and 06:10 UTC, so the
06:00 UTC inactivity cron never meets an api restart, and a release can wait
up to 20 minutes (it prints a line before it waits). The cron reaches only the
api, so the assistant and gateway updates and every rollback update do not
wait. Deploy takes a fresh one-hour AWS session just before the release, so
the waits cannot outlast the credentials.

Before any change, the release refuses a revision (the planned one, built on
the Terraform template, and the preflight's assistant rollback) that sets
`ALLOW_INSECURE_LOCAL` or `LOCAL_AUTH_KEY_FILE`, overrides the image command or
entry point, runs privileged, uses the host network, PID or IPC namespace,
mounts a host path, sets a non-numeric `UVICORN_WORKERS` or
`UVICORN_TIMEOUT_KEEP_ALIVE`, or takes a proxy secret from anywhere but its own
target's SSM parameter (the assistant must never hold the api's). The
assistant rollback must also keep the planned ports and a health check.

Any failure rolls changed services back, restores all previous public files even
if asset upload stopped halfway, and waits for cache invalidation. Each attempt
uses a distinct backup prefix and writes `release-receipt.json`, identifying the
source SHA, immutable images, old/new definitions, snapshot and final status.
`rollback-incomplete` requires operator attention; the workflow must not report
a successful release in that state. Database changes must remain additive and
backward compatible; this script does not reverse schema/data migrations.

After the first durable release, the migration utility accepts the previous
successful release receipt and can issue a read-only `durable_verified` receipt
when no legacy rows remain. Promotion compares its writer image to the current
assistant task, so routine releases need no drain window. Rollback restores all
previous file contents but deliberately retains newly introduced, unreferenced
filenames and hashed assets; it does not delete the entire new S3 namespace.

## One-host runtime cutover gates

Since 26/10/2026 the gateway, api and assistant run on one ECS host behind
CloudFront VPC origins ([decision](../specs/2026-10-26-one-server-runtime.md)).
The first release onto it is blocked until each of these holds:

1. **Assistant rollback is EC2/bridge.** Regenerate the preflight
   `rollback.assistant.taskDefinition` from a digest-pinned EC2/bridge assistant
   revision, with `durableReadVerified` and its evidence. A Fargate-era ARN is
   refused by the shape check.
2. **Synchronous readings fit the edge.** The CloudFront origin timeout is
   120 s, and the model may take 170 s. Either the iOS passbook read (and
   Expo's passbook and deed reads) moves to the `-async` routes, or the
   "Response timeout per origin" quota is raised and Reddy accepts
   `cloudfront_origin_read_timeout = 180` with a 10 s margin.
3. **Shared-host acceptance.** Reddy signs off `pattadar-security-review` for
   the shared kernel before any real Aadhaar data reaches the host;
   `scripts/platform-up.sh prod` refuses to run until
   `SHARED_HOST_SECURITY_SIGNOFF` names that review. The launch trigger is
   GuardDuty Runtime Monitoring for EC2 (flip `RUNTIME_MONITORING` to
   `ENABLED`, with EC2 agent management, in
   `infra/terraform/modules/persistent/guardduty.tf`; enabling it outside
   Terraform is reverted by the next persistent apply), or the revert to
   Fargate.
4. **Template output present.** `envs/prod/runtime` exports
   `task_definition_arns`; without it Deploy fails at Resolve.
5. **Dev proof passed.** The unproven AWS behaviours in the decision record
   were proved on a disposable dev runtime, or their fallbacks were chosen.
6. **Crash alerts can publish.** The persistent CMK key policy admits
   `events.amazonaws.com` (statement `EventsUse`, in code, not applied), so the
   ECS task-stopped rule reaches the encrypted alarm topic. This is a
   persistent change; until it is applied, do not count the rule as alerting.
7. **Edge access logs are on.** Both distributions deliver CloudFront access
   logs to the persistent access-logs bucket (`cloudfront/`), the only
   per-request record of API traffic now that the ALB is gone. It needs the
   persistent `CloudFrontAccessLogsDelivery` bucket-policy statement applied
   before the runtime.

To return to Fargate, revert the compute commit, regenerate the preflight with
a FARGATE-shaped assistant rollback, then apply persistent (approved; it
restores the ALB access-log grant) and runtime (approved, outside 05:30-06:30
UTC) and run Deploy. The steps are in the decision record.

The first release that carries the fail-closed api and the split proxy secrets
(commit A of the one-server change) briefly refuses the old gateway: the api and
assistant roll before the gateway, so expect a few minutes of 403s on the
API until the gateway rolls.
