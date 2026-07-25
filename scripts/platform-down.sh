#!/usr/bin/env bash
# platform-down.sh — one-click decommission of a pattadar environment's
# RUNTIME layer. The persistent layer (Cognito users, KMS, ECR, documents +
# state buckets, Route53 zone, secrets) is NEVER touched.
#
#   1. confirm
#   2. full runtime apply with TF_VAR_deletion_protection=false
#      (flips RDS deletion protection off — NO targeted applies)
#   3. destroy runtime with TF_VAR_final_snapshot_suffix=<timestamp>
#      (RDS takes a final snapshot pattadar-<env>-pg-final-<timestamp>;
#      platform-up.sh restores from the latest one)
#   4. park documents-bucket objects into the cheap storage class
#      (terraform output parking_storage_class)
#
# Non-interactive use (CI): set PLATFORM_DOWN_CONFIRM=yes.
# Companion: scripts/platform-up.sh. Details: docs/runbooks/up-down.md.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/platform-down.sh <dev|prod>

Destroys infra/terraform/envs/<env>/runtime after snapshotting RDS, then parks
documents-bucket objects in the parking storage class. Persistent layer and
users are NOT touched. Re-run scripts/platform-up.sh to bring it all back.

If a run fails partway, RE-RUN THIS SCRIPT — never delete resources in the
console (that desyncs Terraform state). See docs/runbooks/up-down.md.

Requires: aws (authenticated), terraform >= 1.10, jq.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 || ! "${1}" =~ ^(dev|prod)$ ]]; then
  usage >&2
  exit 1
fi
ENV="$1"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERSISTENT_DIR="${REPO_ROOT}/infra/terraform/envs/${ENV}/persistent"
RUNTIME_DIR="${REPO_ROOT}/infra/terraform/envs/${ENV}/runtime"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"

log() { printf '\n==> %s\n' "$*"; }

for cmd in aws terraform jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: '$cmd' is required but not installed." >&2; exit 1; }
done

tf_version="$(terraform version -json | jq -r .terraform_version)"
if [[ "$(printf '%s\n' "1.10.0" "$tf_version" | sort -V | head -n1)" != "1.10.0" ]]; then
  echo "ERROR: terraform >= 1.10 required (found ${tf_version})." >&2
  exit 1
fi

# --- 1. Confirm ---------------------------------------------------------------
cat <<EOF

  You are about to bring DOWN the '${ENV}' runtime layer:
    - ECS services, ALB, CloudFront, VPC, EventBridge cron are DESTROYED
    - RDS is snapshotted (pattadar-${ENV}-pg-final-<timestamp>) then DESTROYED
    - documents are PARKED into a cold storage class (bytes kept, cheap)

  The persistent layer and users are NOT touched:
  Cognito (all user accounts), KMS, ECR images, documents + Terraform state
  buckets, Route53 zone and secrets all survive. scripts/platform-up.sh
  restores the environment from the snapshot.

EOF
if [[ "${PLATFORM_DOWN_CONFIRM:-}" != "yes" ]]; then
  read -r -p "Type '${ENV}' to continue: " reply
  if [[ "$reply" != "$ENV" ]]; then
    echo "Aborted — nothing was changed."
    exit 1
  fi
fi

# --- 2. Flip RDS deletion protection off (full apply, no -target) -------------
export TF_VAR_deletion_protection=false
terraform -chdir="$RUNTIME_DIR" init -input=false

# GUARD (review finding): if a prior down partially destroyed the stack, the
# database may be GONE from state. Re-applying would recreate it EMPTY, and the
# destroy below would then snapshot that empty database as the NEWEST final
# snapshot — which the next up would silently restore. Skip the apply instead.
if terraform -chdir="$RUNTIME_DIR" state list 2>/dev/null | grep -q 'aws_db_instance'; then
  log "Runtime apply with deletion_protection=false (${ENV})"
  terraform -chdir="$RUNTIME_DIR" apply -input=false -auto-approve
else
  log "WARNING: RDS instance not in runtime state (partial prior down?)."
  log "Skipping re-apply — destroying remaining resources only (no new snapshot)."
fi

# --- 3. Destroy runtime (RDS takes a final snapshot) --------------------------
TF_VAR_final_snapshot_suffix="$(date +%Y%m%d%H%M)"
export TF_VAR_final_snapshot_suffix
log "Destroying runtime layer — RDS final snapshot: pattadar-${ENV}-pg-final-${TF_VAR_final_snapshot_suffix}"
terraform -chdir="$RUNTIME_DIR" destroy -input=false -auto-approve

# --- 4. Park documents into the cold storage class -----------------------------
terraform -chdir="$PERSISTENT_DIR" init -input=false >/dev/null
docs_bucket="$(terraform -chdir="$PERSISTENT_DIR" output -raw documents_bucket_name)"
parking_class="$(terraform -chdir="$PERSISTENT_DIR" output -raw parking_storage_class)"
log "Parking s3://${docs_bucket} objects ({owner}/... keyspace) to ${parking_class}"

parked=0
skipped=0
token=""
while :; do
  if [[ -n "$token" ]]; then
    resp="$(aws s3api list-objects-v2 --bucket "$docs_bucket" --max-keys 1000 \
      --continuation-token "$token" --output json)"
  else
    resp="$(aws s3api list-objects-v2 --bucket "$docs_bucket" --max-keys 1000 \
      --output json)"
  fi
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    # In-place copy re-writes the object into the parking class (new version;
    # bucket-default SSE-KMS reapplies; GuardDuty rescans on un-park PUTs).
    aws s3 cp "s3://${docs_bucket}/${key}" "s3://${docs_bucket}/${key}" \
      --storage-class "$parking_class" --only-show-errors
    parked=$((parked + 1))
  done < <(jq -r --arg pc "$parking_class" \
    '.Contents[]? | select((.StorageClass // "STANDARD") != $pc) | .Key' <<<"$resp")
  skipped=$((skipped + $(jq -r --arg pc "$parking_class" \
    '[.Contents[]? | select((.StorageClass // "STANDARD") == $pc)] | length' <<<"$resp")))
  token="$(jq -r '.NextContinuationToken // empty' <<<"$resp")"
  [[ -z "$token" ]] && break
done
echo "Parked ${parked} object(s) to ${parking_class}; ${skipped} already parked."
if [[ "$parking_class" == "DEEP_ARCHIVE" || "$parking_class" == "GLACIER" ]]; then
  echo "NOTE: minimum storage charge is 180 days — never park-then-delete within 6 months."
  echo "      Thawing before the next platform-up: docs/runbooks/s3-thaw.md."
fi

# --- 5. What remains ----------------------------------------------------------
cat <<EOF

Platform '${ENV}' runtime is DOWN.

Still running (persistent, ~\$3-5/month while parked — see
docs/runbooks/up-down.md for the cost table):
  - Cognito user pool (ALL user accounts intact)
  - KMS CMK, ECR images, Secrets Manager secrets
  - Documents bucket (parked in ${parking_class}) + Terraform state bucket
  - Route53 zone, CloudTrail

Bring it back any time: scripts/platform-up.sh ${ENV}
EOF
