# Preserve assistant files before replacing the old task

Older assistant rows point into the current task's upload directory. Deploying
new object-storage code does not copy those bytes. Copy them **while the old
volume still exists**, before ECS replaces that task. A missing source file is
reported as blocked; metadata alone cannot recreate it.

1. Apply the reviewed Terraform runtime changes for the assistant attachment
   bucket and task IAM policy. This must happen before release preflight: the
   release script clones existing task configuration, and refuses a task that
   has not received the durable bucket and permissions.
2. Prepare a known-good assistant rollback revision containing the durable
   reader/writer, `r_attachments.content` schema addition, and attachment
   download/chat integration. It may be a small bridge revision based on the
   previous stable assistant. Run the attachment suites and verify download of
   a migrated sample in staging. A disk-only image is not a valid rollback
   after migration.
3. Build and register the bridge without replacing the old task. Example:

   ```sh
   git worktree add /tmp/pattadar-assistant-bridge "$BRIDGE_SHA"
   docker buildx build --platform linux/arm64 --provenance=false \
     --tag "$ASSISTANT_REPO:$BRIDGE_SHA" --push \
     /tmp/pattadar-assistant-bridge/services/assistant
   aws ecr describe-images --repository-name "$ASSISTANT_REPOSITORY_NAME" \
     --image-ids "imageTag=$BRIDGE_SHA" --query 'imageDetails[0].imageDigest'
   ```

   Export the current assistant task definition with
   `aws ecs describe-task-definition --task-definition "$CURRENT_ASSISTANT_TASK"`.
   Produce a register-task-definition JSON containing only writable fields;
   retain the applied task role, environment and secrets and set its assistant
   image to `$ASSISTANT_REPO@sha256:...` from the preceding lookup. Register it
   with `aws ecs register-task-definition --cli-input-json file://bridge-task.json`.
   Record the returned ARN and staging read/download evidence in the release
   preflight's `rollback.assistant`. Do not update the running service yet.
4. Copy the migration utility to a controlled process that can read the old
   upload volume and reach its database. Supply `ASSISTANT_DSN`, and for S3,
   `ASSISTANT_ATTACHMENTS_BUCKET` plus a role authorized for that prefix/KMS key.
   Run a read-only inventory first:

   ```sh
   python services/assistant/scripts/migrate_attachments.py \
     --legacy-root /tmp/assistant_uploads --storage s3 \
     --release-sha "$RELEASE_SHA" --receipt attachment-plan.json
   ```

5. Pause new assistant work and drain existing requests so no old process can
   add disk-only uploads during the final copy. Repeat with
   `--execute --writers-drained --receipt attachment-migration.json`. The runner
   checks recorded file size and S3 readback SHA-256 before updating metadata in
   a transaction. It preserves original files. If metadata fails, it deletes
   only the just-created object version after confirming no row points to it;
   ambiguous commit failures retain bytes for reconciliation.
6. Resolve every missing, mismatched-owner or failed row. A complete receipt has
   zero remaining legacy rows and is tied to the target release SHA. Repeat
   safely after partial success. If the old task's bytes have already vanished,
   recover them from a real retained copy or arrange a user re-upload; never
   label those rows migrated.
7. Include the complete receipt in the release preflight and deploy. The runner
   can roll back to the verified durable-compatible assistant ARN, preserving
   access to copied bytes. Resume work once service and download checks pass.
   Keep the original volume until the release and rollback window are closed.

For local database-backed storage, use `--storage database`; bytes move into
PostgreSQL BYTEA and survive process replacement. Production release requires
S3 in its task configuration. A no-op check with no legacy rows can produce a
complete receipt with `--writers-drained` without writing data.

Routine releases after durable storage is established do not need a maintenance
window. Run the read-only migration check with
`--durable-writer-evidence last-successful-release-receipt.json`. If no legacy
rows remain, it produces mode `durable_verified` using the previous promoter's
versioned durable-storage proof. Release preflight checks that evidence against
the current assistant image digest. A disk-only first rollout cannot use this
shortcut; it still needs drained old writers and completed backfill.
