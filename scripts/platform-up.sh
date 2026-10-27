#!/usr/bin/env bash
# platform-up.sh — one-click bring-up of a pattadar environment.
#
#   1. apply the persistent layer (idempotent, safe on every run)
#   2. resolve the latest RDS final snapshot (pattadar-<env>-pg-final-*) and
#      restore the runtime database from it when one exists
#   3. check the five out-of-band SSM SecureStrings exist (names only; values
#      are never read)
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

# --- 3. App SSM SecureStrings (existence only, values never read) -----------
# The tasks take PG_PASSWORD, CRON_SECRET, ANTHROPIC_API_KEY and the gateway's
# per-target proxy secrets from these, and the scheduler's cron connection
# reads cron-secret through a data source. They live outside Terraform, so a
# missing one would otherwise surface as a failed apply or crash-looping tasks
# with no explanation. SSM rejects an empty value, so existing means non-empty.
# They must be under the persistent CMK: the aws/ssm default key lets any
# principal in the account decrypt through SSM.
ssm_prefix="/pattadar/${ENV}"
ssm_names=()
for name in db-app-password cron-secret anthropic-api-key \
  internal-proxy-secret-api internal-proxy-secret-assistant; do
  ssm_names+=("${ssm_prefix}/${name}")
done
log "Checking the app SSM SecureStrings (${ssm_prefix}/*)"
kms_arn="$(terraform -chdir="$PERSISTENT_DIR" output -raw kms_key_arn)"
kms_alias="alias/pattadar-${ENV}"
params="$(aws ssm describe-parameters \
  --parameter-filters "Key=Name,Values=$(IFS=,; echo "${ssm_names[*]}")" --output json)"
found="$(jq -r --arg arn "$kms_arn" --arg id "${kms_arn##*/}" --arg alias "$kms_alias" \
  --arg alias_arn "${kms_arn%%:key/*}:${kms_alias}" \
  '.Parameters[] | select(.Type == "SecureString" and (.KeyId | IN($arn, $id, $alias, $alias_arn))) | .Name' <<<"$params")"
missing=()
for name in "${ssm_names[@]}"; do
  grep -qxF "$name" <<<"$found" || missing+=("$name")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  {
    echo "ERROR: missing, not a SecureString, or not under ${kms_alias}: ${missing[*]}"
    cat <<EOF

Create each one out of band (never in tfvars or Terraform state), reading
the value from a file so it stays off the command line. One that exists under
another key (such as the default aws/ssm) must be re-put with --overwrite and
the key below. Neither this check nor the fix reads a value:

  aws ssm put-parameter --type SecureString --key-id alias/pattadar-${ENV} \\
    --name <name> --value file://<file holding the value>

  cron-secret, anthropic-api-key: copy from the Secrets Manager secrets of
    the same name (pattadar/${ENV}/...).
  internal-proxy-secret-api, internal-proxy-secret-assistant: a separate
    'openssl rand -hex 32' each, never the same value.
EOF
    if [[ " ${missing[*]} " == *" ${ssm_prefix}/db-app-password "* ]]; then
      cat <<EOF

  db-app-password is RESERVED (Reddy's approval): every service logs in as
  pattadar_app with it, so it must match the role in the database. Copy it
  from pattadar/${ENV}/db-app-password in Secrets Manager if it is still
  recoverable. Otherwise generate one ('openssl rand -base64 30 | tr -d /+=')
  and, as the master user (docs/runbooks/migration.md):
    restored database: ALTER ROLE pattadar_app PASSWORD '<that value>';
    fresh database:    CREATE ROLE pattadar_app LOGIN PASSWORD '<that value>';
                       CREATE DATABASE hub OWNER pattadar_app;
                       GRANT ALL PRIVILEGES ON DATABASE hub TO pattadar_app;
EOF
    fi
  } >&2
  exit 1
fi

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
    echo "     Triage: aws logs tail /pattadar/${ENV}/gateway --since 15m (and .../api)" >&2
    exit 1
  fi
done

pending_sns="$(aws sns list-subscriptions \
  --query "length(Subscriptions[?SubscriptionArn=='PendingConfirmation'])" \
  --output text 2>/dev/null || echo 0)"
if [[ "${pending_sns:-0}" != "0" ]]; then
  echo "" >&2
  echo "FAIL: ${pending_sns} SNS subscription(s) are still PendingConfirmation." >&2
  echo "      Every alarm — RDS storage, the inactivity cron, healthy-host counts —" >&2
  echo "      fires into the void until someone clicks 'Confirm subscription'." >&2
  echo "      The platform is up; confirm the subscription, then re-run to verify." >&2
  echo "      (ALLOW_PENDING_ALARMS=1 skips this check.)" >&2
  [[ "${ALLOW_PENDING_ALARMS:-0}" = "1" ]] || exit 1
fi

log "Platform ${ENV} is UP. https://pattadar.com (once DNS cutover is done — see docs/runbooks/account-bootstrap.md)."
