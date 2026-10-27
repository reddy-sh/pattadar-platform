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
#   6. smoke-check gateway + api through CloudFront and the ECS service
#      counts, remind about pending SNS subscription confirmations
#
# Companion: scripts/platform-down.sh. Details: docs/runbooks/up-down.md.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/platform-up.sh <dev|prod>

Brings the given environment up: applies infra/terraform/envs/<env>/persistent
then infra/terraform/envs/<env>/runtime, restoring RDS from the latest parked
final snapshot when one exists.

prod also requires SHARED_HOST_SECURITY_SIGNOFF=<review id/date>: Reddy's
pattadar-security-review sign-off for the one shared ECS host.

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

# Decision 1 (Reddy, 26/10/2026): gateway, api and assistant share one host
# and kernel, accepted for PRE-LAUNCH only. Step 2 restores the latest prod
# snapshot, which can hold real Aadhaar rows, so prod comes up only with
# Reddy's pattadar-security-review sign-off named. The launch trigger is
# GuardDuty Runtime Monitoring for EC2 (modules/persistent/guardduty.tf) or
# the revert to Fargate. Dev proofs run on synthetic data only.
if [[ "$ENV" == "prod" && -z "${SHARED_HOST_SECURITY_SIGNOFF:-}" ]]; then
  cat >&2 <<'EOF'
ERROR: prod runs on one shared ECS host, accepted for pre-launch only.
Before real Aadhaar data reaches it, Reddy signs off pattadar-security-review
for the shared host. Set SHARED_HOST_SECURITY_SIGNOFF=<review id/date> to
record that sign-off. Nothing was changed.
EOF
  exit 1
fi

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
# principal in the account decrypt through SSM, including the instance role.
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
log "Applying runtime layer (${ENV}) — each CloudFront VPC origin takes up to ~15 minutes"
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
log "Smoke-checking gateway + api through CloudFront"
api_domain="$(terraform -chdir="$RUNTIME_DIR" output -raw api_domain)"
cluster="$(terraform -chdir="$RUNTIME_DIR" output -raw ecs_cluster_name)"
# Assigned first: a failure inside <<<"$(...)" would not stop the script.
service_list="$(terraform -chdir="$RUNTIME_DIR" output -json ecs_service_names | jq -r 'join(" ")')"
read -r -a services <<<"$service_list"

got=""
reply=""
status_is() {  # status_is <code> <curl args...>
  local want="$1" out
  shift
  out="$(curl -s --max-time 15 -w '\n%{http_code}' "$@" || true)"
  got="$(tail -n 1 <<<"$out")"
  reply="$(sed '$d' <<<"$out")"
  [[ "$got" == "$want" ]]
}
replies() {  # replies <code> <jq test on the body> <curl args...>
  local want="$1" test="$2"
  shift 2
  status_is "$want" "$@" && jq -e "$test" >/dev/null 2>&1 <<<"$reply"
}
services_running() {
  aws ecs describe-services --cluster "$cluster" --services "${services[@]}" --output json |
    jq -e --argjson n "${#services[@]}" \
      '(.services | length) == $n and all(.services[]; .desiredCount > 0 and .runningCount == .desiredCount)' >/dev/null
}
# Retries for up to 5 minutes: a fresh host is still pulling images and the
# api runs its boot-time backfills.
poll() {  # poll <label> <check> [args...]
  local label="$1" _
  shift
  got=""
  for _ in $(seq 1 30); do
    if "$@"; then
      echo "OK   ${label}"
      return 0
    fi
    sleep 10
  done
  echo "FAIL ${label} — not within 5 minutes${got:+ (last status ${got}; 000 = no connection, e.g. DNS)}." >&2
  echo "     Triage: aws logs tail /pattadar/${ENV}/gateway --since 15m (and .../api, .../assistant)" >&2
  exit 1
}

# Unauthenticated probes only: each answer comes from the layer named and
# changes nothing (the cron rejects a missing x-cron-secret before any work).
poll "anonymous https://${api_domain}/api/gateway/pattadar/health is 401 (gateway)" \
  status_is 401 "https://${api_domain}/api/gateway/pattadar/health"
# The one anonymous query the gateway forwards, a single SELECT: proves
# CloudFront -> gateway -> api proxy secret -> 172.17.0.1:8081 -> api -> RDS.
poll "anonymous invitePreview via https://${api_domain}/api/gateway/pattadar/graphql is 200 \"invalid\" (gateway -> api -> RDS)" \
  replies 200 '.data.invitePreview.state == "invalid"' -H 'content-type: application/json' \
  --data '{"query":"{ invitePreview(token: \"platform-up-smoke\") { state } }"}' \
  "https://${api_domain}/api/gateway/pattadar/graphql"
# Only the cron handler answers {"error":"forbidden"}; private_ingress's
# "Forbidden" would mean the exemption no longer matches and every real cron
# is refused.
poll "POST https://${api_domain}/cron/inactivity-check without x-cron-secret is the cron handler's 403 (api, CRON_SECRET set)" \
  replies 403 '. == {"error": "forbidden"}' --data '' "https://${api_domain}/cron/inactivity-check"
poll "https://${api_domain}/graphql is 404 (edge default; api not exposed)" \
  status_is 404 "https://${api_domain}/graphql"
if [[ "$ENV" == "prod" ]]; then
  poll "anonymous https://pattadar.com/api/gateway/pattadar/health is 401 (SPA /api/* -> gateway)" \
    status_is 401 "https://pattadar.com/api/gateway/pattadar/health"
fi
poll "ECS ${services[*]}: runningCount == desiredCount" services_running

pending_sns="$(aws sns list-subscriptions \
  --query "length(Subscriptions[?SubscriptionArn=='PendingConfirmation'])" \
  --output text 2>/dev/null || echo 0)"
if [[ "${pending_sns:-0}" != "0" ]]; then
  echo "" >&2
  echo "FAIL: ${pending_sns} SNS subscription(s) are still PendingConfirmation." >&2
  echo "      Every alarm — RDS storage, the inactivity cron, no running task —" >&2
  echo "      fires into the void until someone clicks 'Confirm subscription'." >&2
  echo "      The platform is up; confirm the subscription, then re-run to verify." >&2
  echo "      (ALLOW_PENDING_ALARMS=1 skips this check.)" >&2
  [[ "${ALLOW_PENDING_ALARMS:-0}" = "1" ]] || exit 1
fi

log "Platform ${ENV} is UP. https://pattadar.com (once DNS cutover is done — see docs/runbooks/account-bootstrap.md)."
