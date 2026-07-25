# RDS restore drill (quarterly)

Prove the final snapshots actually restore. Run **quarterly**; keep the
evidence (see bottom). Cost: a db.t4g.micro for ~1 hour (~$0.02).

## 1. Restore the latest final snapshot to a scratch instance

```sh
export AWS_DEFAULT_REGION=ap-south-1
SNAP=$(aws rds describe-db-snapshots \
  --query "reverse(sort_by(DBSnapshots[?starts_with(DBSnapshotIdentifier, 'pattadar-prod-pg-final-')], &SnapshotCreateTime))[0].DBSnapshotIdentifier" \
  --output text)
echo "Restoring: $SNAP"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier pattadar-restore-drill \
  --db-snapshot-identifier "$SNAP" \
  --db-instance-class db.t4g.micro \
  --no-multi-az \
  --no-publicly-accessible \
  --tags Key=purpose,Value=restore-drill

aws rds wait db-instance-available --db-instance-identifier pattadar-restore-drill
HOST=$(aws rds describe-db-instances --db-instance-identifier pattadar-restore-drill \
  --query 'DBInstances[0].Endpoint.Address' --output text)
```

Connect from inside the VPC (the instance is not public) — e.g. an ECS exec
shell or a temporary bastion task. Credentials: same master secret as prod.

## 2. Verify schema + data

```sh
# ~28 tables expected in the pattadar database
psql -h "$HOST" -U postgres -d pattadar -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

# Spot-check row counts against the last known-good numbers
psql -h "$HOST" -U postgres -d pattadar -c "
  SELECT 'parcels' t, count(*) FROM parcels
  UNION ALL SELECT 'groups', count(*) FROM groups
  UNION ALL SELECT 'notification_log', count(*) FROM notification_log;"

# hub database (gateway storage metadata)
psql -h "$HOST" -U postgres -d hub -c \
  "SELECT count(*) FROM storage_nodes; SELECT count(*), sum(size) FROM storage_versions;"
```

## 3. One document round-trip

Pick one `storage_versions` row and confirm its S3 object exists and the size
matches — proves DB metadata and bucket bytes are still consistent:

```sh
# key format is {owner_id}/{node_id}/{version_id}
psql -h "$HOST" -U postgres -d hub -Atc \
  "SELECT node_id || ' ' || id || ' ' || size FROM storage_versions LIMIT 1;"

aws s3api head-object --bucket <documents-bucket> \
  --key "<owner>/<node>/<version>" --query ContentLength
```

Sizes must match. (If the object is parked in DEEP_ARCHIVE, `head-object`
still returns metadata — no thaw needed for this check.)

## 4. Delete the scratch instance

```sh
aws rds delete-db-instance \
  --db-instance-identifier pattadar-restore-drill \
  --skip-final-snapshot
```

## Evidence (SOC2)

Record in `docs/compliance/` (or the drill log): date, snapshot id, table
count, spot-check row counts, the round-trip key + size match, and who ran it.
This is the recurring evidence for the backup-restore control — a snapshot you
have never restored is not a backup.
