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
The deployment role needs read-only `iam:SimulatePrincipalPolicy`, S3 encryption
configuration access, and KMS describe access in addition to its deployment
permissions. Policy simulation checks the task identity policy; the recorded
staging read verifies actual bucket/key access as well.

Execution snapshots the whole current website, including mutable public files.
Old hashed assets remain available for open tabs. API/gateway rollback task
images are pinned to the digest actually running before the release, even if
their old task definitions used mutable tags. Backend services promote one at a
time and must reach the requested task revision. The web index publishes last.

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
