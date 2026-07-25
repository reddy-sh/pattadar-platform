# Phase 1 data migration (rhub → pattadar-platform AWS)

Moves the pattadar database, the gateway's storage metadata (subset of `hub`),
and the MinIO document bytes to RDS + S3. Expected end-state in the documents
bucket: **228 objects, 1,397,852,638 bytes, single owner**.

## 0. Pre-backup (before touching anything)

```sh
STAMP=$(date +%Y%m%d)

# pattadar DB — exclude the legacy 'land' schema
pg_dump -h localhost -U rhub -N land -Fc -f "pattadar-${STAMP}.dump" pattadar

# hub DB — ONLY the tables the new gateway needs
pg_dump -h localhost -U rhub -Fc -f "hub-subset-${STAMP}.dump" \
  -t storage_nodes -t storage_versions -t storage_shares \
  -t storage_tags -t storage_node_tags \
  -t workspaces -t platform_models -t platform_model_providers \
  -t platform_model_audit \
  hub
```

MinIO export is via the **S3 API only** (`mc mirror`). **NEVER** copy the
MinIO data directory from the filesystem — the on-disk `xl.meta` erasure
format is not the object bytes.

```sh
mc alias set rhubminio http://<minio-host>:9000 <access-key> <secret-key>
mc alias set awss3 https://s3.ap-south-1.amazonaws.com <aws-key> <aws-secret>
```

## 1. Delete `tags_e2e/` orphans FIRST

Test residue that must not be migrated:

```sh
mc rm --recursive --force rhubminio/<bucket>/tags_e2e/

# Verify the expected end-state before mirroring:
mc du rhubminio/<bucket>          # expect 1,397,852,638 bytes
mc ls --recursive rhubminio/<bucket> | wc -l   # expect 228
```

If the counts differ, stop and reconcile against `storage_versions` before
mirroring — do not carry unknown objects into the new bucket.

## 2. Enable GuardDuty malware protection BEFORE the mirror

The malware-protection plan scans **only new PUTs** — objects uploaded before
enablement are never scanned and would sit untagged behind the scan-tag bucket
policy (unreadable). It is part of the persistent layer; confirm it is ACTIVE
on the documents bucket (GuardDuty console → Malware Protection for S3)
**before** starting the mirror.

## 3. Mirror the objects

Keys are `{owner}/{node}/{version}` and must land **verbatim** so the
`storage_nodes`/`storage_versions` rows need zero changes:

```sh
mc mirror rhubminio/<bucket> awss3/<documents-bucket>
```

After the mirror, verify every object got scanned:

```sh
aws s3api list-objects-v2 --bucket <documents-bucket> --query 'Contents[].Key' \
  --output json | jq -r '.[]' | while IFS= read -r key; do
    status=$(aws s3api get-object-tagging --bucket <documents-bucket> --key "$key" \
      --query "TagSet[?Key=='GuardDutyMalwareScanStatus'].Value" --output text)
    [ "$status" = "NO_THREATS_FOUND" ] || echo "NOT CLEAN: $key -> ${status:-<untagged>}"
done
```

Expected: no output. Untagged objects mean the plan was enabled too late —
re-PUT them (in-place `aws s3 cp`) to trigger a scan.

## 4. Reconcile by count + size — NOT etags

SSE-KMS etags are **not** MD5s, so they will never match MinIO's — compare
object count and total bytes instead:

```sh
mc du rhubminio/<bucket>
aws s3 ls "s3://<documents-bucket>" --recursive --summarize | tail -2
# Both must show: 228 objects, 1,397,852,638 bytes
```

## 5. Databases on RDS

```sh
# hub database does not exist on the fresh instance
psql -h <rds-endpoint> -U postgres -d postgres -c "CREATE DATABASE hub;"

# gateway DDL (storage/workspace/model tables), then the subset restore
psql -h <rds-endpoint> -U postgres -d hub -f services/gateway/sql/schema.sql
pg_restore -h <rds-endpoint> -U postgres -d hub --no-owner "hub-subset-${STAMP}.dump"

# pattadar database (created by Terraform/RDS as the default DB)
pg_restore -h <rds-endpoint> -U postgres -d pattadar --no-owner "pattadar-${STAMP}.dump"
```

Start the api service afterwards — `init_db()` reconciles anything additive
under its advisory lock.

## 6. Write-freeze + final incremental

Content changed since step 0 must be caught with the old stack **frozen**:

1. Stop writes: scale the rhub gateway to zero (or put it in maintenance).
2. Final incremental object sync, **paired with** a final dump taken during
   the same freeze so bytes and metadata are consistent:

   ```sh
   mc mirror --overwrite rhubminio/<bucket> awss3/<documents-bucket>
   pg_dump -h localhost -U rhub -N land -Fc -f pattadar-final.dump pattadar
   pg_dump -h localhost -U rhub -Fc -f hub-subset-final.dump \
     -t storage_nodes -t storage_versions -t storage_shares \
     -t storage_tags -t storage_node_tags \
     -t workspaces -t platform_models -t platform_model_providers \
     -t platform_model_audit hub
   ```

3. Restore the final dumps over RDS (drop/recreate the two databases or
   `pg_restore --clean`), re-run the step 4 reconcile, then cut traffic over.

## 7. Old-host cleanup (after cutover verified)

The old host's `pattadar` database still contains the excluded `land` schema
(never migrated, by design). Once the new platform has run clean for a couple
of weeks and backups exist, drop it on the old host
(`DROP SCHEMA land CASCADE;`) before archiving/decommissioning the rhub
Postgres — so no stale copy of user data lingers.
