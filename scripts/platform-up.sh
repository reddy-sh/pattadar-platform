#!/usr/bin/env bash
# platform-up.sh — one-click bring-up of a pattadar environment.
#
#   1. apply the persistent layer (idempotent, safe on every run)
#   2. resolve the latest RDS final snapshot (pattadar-<env>-pg-final-*) and
#      restore the runtime database from it when one exists
#   3. fetch CRON_SECRET from Secrets Manager (never printed)
#   4. apply the runtime layer
#   5. warn if parked documents need thawing (docs/runbooks/s3-thaw.md)
#   6. smoke-check gateway + api through the ALB, remind about pending SNS
#      subscription confirmations
#
# Companion: scripts/platform-down.sh. Details: docs/runbooks/up-down.md.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/platform-up.sh <dev|prod>

Brings the given environment up: applies infra/terraform/envs/<env>/persistent
then infra/terraform/envs/<env>/runtime, restoring RDS from the latest parked
final snapshot when one exists.

Requires: aws (authenticated), terraform >= 1.10, jq, curl.
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

for cmd in aws terraform jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: '$cmd' is required but not installed." >&2; exit 1; }
done

tf_version="$(terraform version -json | jq -r .terraform_version)"
if [[ "$(printf '%s\n' "1.10.0" "$tf_version" | sort -V | head -n1)" != "1.10.0" ]]; then
  echo "ERROR: terraform >= 1.10 required (found ${tf_version})." >&2
  exit 1
fi

# --- 1. Persistent layer (idempotent) ---------------------------------------
log "Applying persistent layer (${ENV}) — idempotent"
terraform -chdir="$PERSISTENT_DIR" init -input=false
terraform -chdir="$PERSISTENT_DIR" apply -input=false -auto-approve

# --- 2. Latest RDS final snapshot -------------------------------------------
log "Looking for latest RDS final snapshot pattadar-${ENV}-pg-final-*"
snapshot="$(aws rds describe-db-snapshots \
  --query "reverse(sort_by(DBSnapshots[?starts_with(DBSnapshotIdentifier, 'pattadar-${ENV}-pg-final-')], &SnapshotCreateTime))[0].DBSnapshotIdentifier" \
  --output text 2>/dev/null || true)"
if [[ -n "$snapshot" && "$snapshot" != "None" ]]; then
  echo "Restoring RDS from snapshot: ${snapshot}"
  export TF_VAR_restore_snapshot_identifier="$snapshot"
else
  echo "No final snapshot found — RDS will be created fresh (api's init_db() bootstraps the schema)."
fi

# --- 3. CRON_SECRET (never echoed) ------------------------------------------
log "Fetching CRON_SECRET from Secrets Manager (pattadar/${ENV}/cron-secret)"
cron_secret="$(aws secretsmanager get-secret-value \
  --secret-id "pattadar/${ENV}/cron-secret" \
  --query SecretString --output text)"
if [[ -z "$cron_secret" || "$cron_secret" == "None" ]]; then
  echo "ERROR: secret pattadar/${ENV}/cron-secret is empty. Fill it first:" >&2
  echo "  aws secretsmanager put-secret-value --secret-id pattadar/${ENV}/cron-secret --secret-string \"\$(openssl rand -hex 32)\"" >&2
  exit 1
fi
unset cron_secret
# (The runtime layer reads the secret VALUE itself via a Terraform data source —
# the check above only guarantees it is non-empty before the apply.)

# --- 4. Runtime layer --------------------------------------------------------
log "Applying runtime layer (${ENV})"
terraform -chdir="$RUNTIME_DIR" init -input=false
terraform -chdir="$RUNTIME_DIR" apply -input=false -auto-approve

# --- 5. Parked-documents check (report only — never auto-restore) ------------
log "Checking documents bucket for parked (Glacier-class) objects"
docs_bucket="$(terraform -chdir="$PERSISTENT_DIR" output -raw documents_bucket_name)"
frozen_count="$(aws s3api list-objects-v2 --bucket "$docs_bucket" \
  --query "Contents[?StorageClass=='GLACIER' || StorageClass=='DEEP_ARCHIVE'].Key" \
  --output text 2>/dev/null | tr '\t' '\n' | sed '/^None$/d;/^$/d' | wc -l | tr -d ' ')"
if [[ "${frozen_count:-0}" -gt 0 ]]; then
  cat <<EOF

WARNING: ${frozen_count} object(s) in s3://${docs_bucket} are in a Glacier
storage class and are NOT readable until thawed. Document downloads and AI
extraction will fail for them. This script does NOT auto-restore.

  Follow docs/runbooks/s3-thaw.md to restore them (DEEP_ARCHIVE: ~12h Standard
  / ~48h Bulk). GLACIER_IR objects need no thaw and are not counted here.
EOF
else
  echo "No parked objects — documents bucket is fully readable."
fi

# --- 6. Post-up smoke --------------------------------------------------------
log "Smoke-checking gateway + api via the ALB"
alb_dns="$(terraform -chdir="$RUNTIME_DIR" output -raw alb_dns_name)"
for path in "/health" "/api/gateway/pattadar/health"; do
  ok=""
  for _ in $(seq 1 30); do
    code="$(curl -sk --max-time 15 -o /dev/null -w '%{http_code}' \
      -H "Host: api.pattadar.com" "https://${alb_dns}${path}" || echo 000)"
    if [[ "$code" == "200" ]]; then
      ok=1
      break
    fi
    sleep 10
  done
  if [[ -n "$ok" ]]; then
    echo "OK   ${path}"
  else
    echo "FAIL ${path} — did not become healthy within 5 minutes." >&2
    echo "     Triage: aws logs tail /ecs/pattadar-${ENV}/gateway --since 15m (and .../api)" >&2
    exit 1
  fi
done

pending_sns="$(aws sns list-subscriptions \
  --query "length(Subscriptions[?SubscriptionArn=='PendingConfirmation'])" \
  --output text 2>/dev/null || echo 0)"
if [[ "${pending_sns:-0}" != "0" ]]; then
  echo ""
  echo "REMINDER: ${pending_sns} SNS subscription(s) are pending confirmation —"
  echo "check the inbox and click 'Confirm subscription' or alarms will not reach you."
fi

log "Platform ${ENV} is UP. https://pattadar.com (once DNS cutover is done — see docs/runbooks/account-bootstrap.md)."
