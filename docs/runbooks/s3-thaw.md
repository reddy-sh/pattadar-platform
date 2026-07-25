# S3 thaw (un-parking documents)

`platform-down.sh` parks documents-bucket objects in a Glacier-class storage
tier. Objects in `GLACIER` / `DEEP_ARCHIVE` are **unreadable** until restored —
downloads and AI extraction 4xx on them. `platform-up.sh` detects this and
points here; it never auto-restores.

## Which class am I in?

```sh
terraform -chdir=infra/terraform/envs/<env>/persistent output parking_storage_class
```

| Class | Restore needed? | Standard | Bulk |
| --- | --- | --- | --- |
| `GLACIER_IR` | **No** — reads are instant (higher per-GB retrieval cost) | — | — |
| `GLACIER` (Flexible) | Yes | 3–5 h | 5–12 h |
| `DEEP_ARCHIVE` | Yes | **~12 h** | **~48 h** |

If the parking class is `GLACIER_IR`, stop here — nothing to thaw.

## Restore every parked object

Keys are `{owner}/{node}/{version}`. Restore each with `restore-object`:

```sh
BUCKET=$(terraform -chdir=infra/terraform/envs/<env>/persistent output -raw documents_bucket_name)

aws s3api list-objects-v2 --bucket "$BUCKET" \
  --query "Contents[?StorageClass=='DEEP_ARCHIVE' || StorageClass=='GLACIER'].Key" \
  --output json | jq -r '.[]' | while IFS= read -r key; do
    aws s3api restore-object --bucket "$BUCKET" --key "$key" \
      --restore-request '{"Days":14,"GlacierJobParameters":{"Tier":"Standard"}}'
    echo "restore requested: $key"
done
```

`Tier`: `Standard` (~12 h from DEEP_ARCHIVE) for a planned platform-up;
`Bulk` (~48 h) only if you are truly not in a hurry. Already-in-progress
requests return `RestoreAlreadyInProgress` — safe to re-run.

## Check progress

```sh
aws s3api head-object --bucket "$BUCKET" --key "<owner>/<node>/<version>" \
  --query Restore
# ongoing-request="true"              -> still thawing
# ongoing-request="false", expiry-date -> readable now
```

## Temporary-copy expiry — make it permanent

A restore produces a **temporary readable copy** that disappears after `Days`
(14 above); the object then goes cold again. If the environment is staying up,
convert restored objects back to a warm class before the copy expires:

```sh
aws s3 cp "s3://$BUCKET/$key" "s3://$BUCKET/$key" --storage-class STANDARD
```

(In-place copy; only valid while the restored copy is readable. The next
`platform-down.sh` re-parks everything anyway.)

## 180-day minimum — never park-then-delete

`DEEP_ARCHIVE` (and `GLACIER`) bill a **180-day minimum** per object. Deleting
or re-transitioning an object within 6 months of parking still charges the
remainder. Park for months, thaw when needed — never park as a step toward
deletion within 6 months.
