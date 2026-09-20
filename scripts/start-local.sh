#!/usr/bin/env bash
# Local full-fidelity stack: pattadar API (FastAPI, real local Postgres data)
# + the REAL gateway (storage on MinIO standing in for S3, local pattadar_hub
# metadata DB, the full token-validation pipeline — no auth bypass anywhere)
# + web dev server (Vite, hot reload). NO deploys.
#
#   ./scripts/start-local.sh                  # api :8080, assistant :8081, gateway :8082, minio :9000, web :5180
#   LOCAL_AUTH=real ./scripts/start-local.sh  # exercise the REAL hosted-UI sign-in
#   WEB_PORT=5173 ./scripts/start-local.sh    # put web back on Vite's default port
#   LOCAL_COGNITO=0 ./scripts/start-local.sh  # trust the real pool instead (online)
#
# SIGN-IN IS SKIPPED LOCALLY by default (LOCAL_AUTH=mock). The web env simply
# does not carry VITE_COGNITO_AUTHORITY, which puts AuthProvider into the mock
# mode it has always had: you land straight in /app and the shell shows a
# visible "Auth mocked — dev only" chip so nobody mistakes it for a session.
#
# Why this is the default. Local dev signs in against the PROD Cognito client,
# whose callback allowlist holds only localhost:5173 and pattadar.com — so the
# moment this script's port moved, every start ended on Cognito's
# "Something went wrong" (error=redirect_mismatch). Fixing that properly is a
# production Cognito change; skipping sign-in locally costs nothing, because
# the identity that actually decides what you see is the x-user-id the Vite
# proxy injects, not the token.
#
# Mock mode is NOT token-less: AuthProvider mints a Bearer from the gateway's
# own local trust root (POST /local-auth/token, LOCAL_COGNITO=1) so storage,
# papers and photos work exactly as they do signed in. Without that it would be
# a half-door — GraphQL answering while every shelf renders empty.
#
# LOCAL_AUTH=real restores the hosted UI. Pair it with WEB_PORT=5173 or it will
# fail the allowlist again.
#
# Cognito is LOCAL by default: the gateway runs its unchanged validation
# pipeline against a keypair on this laptop (services/gateway/src/
# local_issuer.py) and mints tokens for any local user through the app's dev
# door — the entire loop, sign-in included, works with NO internet. The real
# pool is trusted ALONGSIDE it, so hosted-UI sign-in with your pattadar.com
# account works too while online. LOCAL_COGNITO=0 drops the laptop key and
# trusts the real pool alone. Uploads, preview, delete all work
# exactly like the cloud either way; bytes stay in .local/minio-data. NO mock
# mode: if Docker/MinIO/gateway cannot start, this script FAILS instead of
# degrading.
# Stops api+assistant+gateway on Ctrl-C (MinIO container stays).
# Logs: .local/api.log, .local/assistant.log, .local/gateway.log
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RHUB_API_DIR="${RHUB_API_DIR:-$PLATFORM_DIR/services/api}"

# WEB_NEXT=1 ./scripts/start-local.sh  — serve web-next (Next.js, :5273) instead
# of the vite web app (:5180). The API's APP_PUBLIC_URL (invite/verify links)
# follows whichever web head is actually running.
WEB_NEXT="${WEB_NEXT:-0}"
# 5173 is Vite's default, so every project on the laptop competes for it.
# Pattadar takes 5180 and leaves the default to whoever got there first. This
# number is PINNED: it is the one the e2e suites default to and the one every
# bookmark holds, and moving it once already cost an afternoon of
# redirect_mismatch. Override per-run with WEB_PORT, never by editing this.
WEB_PUBLIC_PORT="${WEB_PORT:-5180}"
[ "$WEB_NEXT" = "1" ] && WEB_PUBLIC_PORT=5273
VENV="$PLATFORM_DIR/.local/api-venv"
ASSISTANT_VENV="$PLATFORM_DIR/.local/assistant-venv"
GW_VENV="$PLATFORM_DIR/.local/gateway-venv"
API_LOG="$PLATFORM_DIR/.local/api.log"
ASSISTANT_LOG="$PLATFORM_DIR/.local/assistant.log"
GW_LOG="$PLATFORM_DIR/.local/gateway.log"
export PATH="$HOME/.bun/bin:$PATH"

# Cognito (same pool as pattadar.com — validation only, no secrets involved)
COGNITO_USER_POOL_ID="ap-south-1_XfgAF21Z3"
# web SPA + native iOS app clients on the same pool (gateway matches exactly
# against this allowlist).
COGNITO_CLIENT_ID="10okivmth1rv58ed8f2k7eq4mm,44gv48ihjlgub7h0lnvjbdmj89"

# Local storage stand-ins
MINIO_NAME="pattadar-minio"
STORAGE_BUCKET_LOCAL="pattadar-local-documents"
GW_DB="pattadar_hub"
LOCAL_ASSISTANT_MODEL="${ASSISTANT_MODEL:-claude-sonnet-4-6}"
export PGPASSWORD="rhub-dev-pwd"

mkdir -p "$PLATFORM_DIR/.local"

# Local trust root (default 1): the gateway trusts this laptop keypair and
# mints tokens itself — offline sign-in. 0 = trust the real Cognito pool.
LOCAL_COGNITO="${LOCAL_COGNITO:-1}"
# mock (default) = no Cognito env reaches the SPA, so sign-in is skipped.
# real           = the hosted UI, exactly like production. Needs WEB_PORT=5173.
LOCAL_AUTH="${LOCAL_AUTH:-mock}"
LOCAL_AUTH_KEY="$PLATFORM_DIR/.local/local-auth-key.pem"
GW_LOCAL_KEY=""
if [ "$LOCAL_COGNITO" = "1" ]; then
  if [ ! -f "$LOCAL_AUTH_KEY" ]; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
      -out "$LOCAL_AUTH_KEY" 2>/dev/null
    chmod 600 "$LOCAL_AUTH_KEY"
    echo "» local trust-root keypair created (.local/local-auth-key.pem)"
  fi
  GW_LOCAL_KEY="$LOCAL_AUTH_KEY"
fi

# --- preflight ---------------------------------------------------------------
command -v bun >/dev/null || { echo "bun not found — install: curl -fsSL https://bun.sh/install | bash"; exit 1; }
pg_isready -h localhost -p 5432 -q || { echo "Postgres not running on localhost:5432 — start it first"; exit 1; }
[ -d "$RHUB_API_DIR" ] || { echo "rhub pattadar api not found at $RHUB_API_DIR (override with RHUB_API_DIR=...)"; exit 1; }

stop_port_listeners() {
  local port="$1" pids pid
  pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)"
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done <<<"$pids"
}

# Hosted-UI sign-in only works on a port registered as a Cognito callback
# (infra/terraform/.../variables.tf; web-next uses its own fixed :5273). The
# local trust root does not care. Check the port before bringing up the API
# and gateway:
# starting Vite first and discovering a collision would otherwise tear the
# whole stack down again. We may replace a leftover Pattadar server, but never
# terminate a listener owned by another project.
prepare_web_port() {
  local pids pid cwd other_listener=0
  pids="$(lsof -ti "tcp:${WEB_PUBLIC_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] || return 0

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
    case "$cwd" in
      "$PLATFORM_DIR"|"$PLATFORM_DIR"/*) ;;
      *)
        echo "web cannot start: http://localhost:${WEB_PUBLIC_PORT} is already in use"
        echo "  pid ${pid}: ${cwd:-unknown working directory}"
        other_listener=1
        ;;
    esac
  done <<<"$pids"

  if [ "$other_listener" = 1 ]; then
    echo "Stop that process, then rerun this script. The Pattadar web app cannot use a different port because its Cognito callback is fixed."
    exit 1
  fi

  echo "» stopping stale Pattadar web listener on :${WEB_PUBLIC_PORT}"
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done <<<"$pids"

  for _ in $(seq 1 10); do
    lsof -ti "tcp:${WEB_PUBLIC_PORT}" -sTCP:LISTEN >/dev/null 2>&1 || return
    sleep 0.2
  done
  echo "Could not free web port ${WEB_PUBLIC_PORT}; stop the listener and rerun this script."
  exit 1
}

prepare_web_port

# --- api (FastAPI + Strawberry against your real local 'pattadar' DB) --------
if [ ! -x "$VENV/bin/uvicorn" ]; then
  echo "» creating api virtualenv (first run only)..."
  PY=python3
  for cand in /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13 python3.13; do
    command -v "$cand" >/dev/null && PY="$cand" && break
  done
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$RHUB_API_DIR/requirements.txt" uvicorn
fi

if [ ! -x "$ASSISTANT_VENV/bin/uvicorn" ]; then
  echo "» creating assistant virtualenv (first run only)..."
  PY=python3
  for cand in /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13 python3.13; do
    command -v "$cand" >/dev/null && PY="$cand" && break
  done
  "$PY" -m venv "$ASSISTANT_VENV"
  "$ASSISTANT_VENV/bin/pip" install --quiet --upgrade pip
  "$ASSISTANT_VENV/bin/pip" install --quiet -r "$PLATFORM_DIR/services/assistant/requirements.txt"
fi

# Anthropic key (enables AI extraction endpoints locally) — optional
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f "$HOME/reddy.sh/projects/rhub/.env" ]; then
  ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' "$HOME/reddy.sh/projects/rhub/.env" | cut -d= -f2- || true)"
fi

# AWS_DB=1 used to run this same local stack against the AWS PRODUCTION
# database so the phone loop showed real records. It is gone. It depended on
# flipping the prod RDS instance to publicly-accessible — guarded by nothing
# but a password, reverted by hand, and easy to forget — and on reading the
# RDS-managed MASTER credential onto this laptop. The secret it read no longer
# exists either: the services take the pattadar_app password instead.
#
# To work against real data: restore a snapshot into a throwaway instance, or
# port-forward through SSM Session Manager so nothing becomes internet-facing.
if [ "${AWS_DB:-0}" = "1" ]; then
  echo "AWS_DB=1 is no longer supported: it exposed the production database to"
  echo "the internet and pulled the RDS master credential onto this laptop."
  echo "Restore a snapshot to a scratch instance, or use an SSM port-forward."
  exit 1
fi
APP_DSN="host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd"

# A LEFTOVER api from a previous session answers the health check and gets
# silently adopted — running yesterday's code against yesterday's database
# while looking alive. A stale listener is replaced, never adopted.
stop_port_listeners 8080
stop_port_listeners 8081
stop_port_listeners 8082
sleep 0.5

echo "» starting api on http://localhost:8080 (log: .local/api.log)"
(
  cd "$RHUB_API_DIR"
  APP_PG_DSN="$APP_DSN" \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  APP_PUBLIC_URL="http://localhost:${WEB_PUBLIC_PORT}" \
  ALLOW_INSECURE_LOCAL=1 \
  "$VENV/bin/uvicorn" src.main:app --host 127.0.0.1 --port 8080 --reload >"$API_LOG" 2>&1
) &
API_PID=$!

# Uvicorn --reload forks a child that owns the listening socket. Killing only
# the background parent leaves that child behind when a later startup step
# fails, so clean up both parent PIDs and their listeners.
CLEANUP_COMPLETE=0
cleanup_local_stack() {
  [ "$CLEANUP_COMPLETE" = 1 ] && return
  CLEANUP_COMPLETE=1
  echo
  echo "» stopping api + assistant + gateway"
  kill "$API_PID" 2>/dev/null || true
  [ -n "${ASSISTANT_PID:-}" ] && kill "$ASSISTANT_PID" 2>/dev/null || true
  [ -n "${GW_PID:-}" ] && kill "$GW_PID" 2>/dev/null || true
  stop_port_listeners 8080
  stop_port_listeners 8081
  stop_port_listeners 8082
}
trap cleanup_local_stack EXIT INT TERM

for i in $(seq 1 30); do
  curl -fsS http://localhost:8080/health >/dev/null 2>&1 && break
  kill -0 $API_PID 2>/dev/null || { echo "api failed to start — tail .local/api.log:"; tail -20 "$API_LOG"; exit 1; }
  sleep 1
done
curl -fsS http://localhost:8080/health >/dev/null && echo "» api healthy ✓ (your real data: 88 parcels, 11 passbooks)"

# --- storage: MinIO container + local pattadar_hub DB + the real gateway -----
docker info >/dev/null 2>&1 || { echo "Docker is not running — start Docker Desktop first (storage needs the MinIO container)"; exit 1; }
  if [ -n "$(docker ps -q -f name="^${MINIO_NAME}$")" ]; then
    echo "» minio already running ✓"
  elif [ -n "$(docker ps -aq -f name="^${MINIO_NAME}$")" ]; then
    docker start "$MINIO_NAME" >/dev/null && echo "» minio started ✓"
  else
    mkdir -p "$PLATFORM_DIR/.local/minio-data"
    docker run -d --name "$MINIO_NAME" \
      -p 127.0.0.1:9000:9000 \
      -v "$PLATFORM_DIR/.local/minio-data:/data" \
      -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
      minio/minio server /data >/dev/null
    echo "» minio created ✓ (bytes live in .local/minio-data)"
  fi

  # gateway metadata DB (separate from rhub's local 'hub' — clean slate)
  psql -h localhost -U rhub -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${GW_DB}'" | grep -q 1 \
    || createdb -h localhost -U rhub "$GW_DB"

  if [ ! -x "$GW_VENV/bin/uvicorn" ]; then
    echo "» creating gateway virtualenv (first run only)..."
    PY=python3
    for cand in /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13 python3.13; do
      command -v "$cand" >/dev/null && PY="$cand" && break
    done
    "$PY" -m venv "$GW_VENV"
    "$GW_VENV/bin/pip" install --quiet --upgrade pip
    "$GW_VENV/bin/pip" install --quiet -r "$PLATFORM_DIR/services/gateway/requirements.txt"
  fi

  # bucket (idempotent; MinIO needs a moment on cold start)
  for i in $(seq 1 15); do
    AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
    "$GW_VENV/bin/python" - "$STORAGE_BUCKET_LOCAL" <<'PYEOF' 2>/dev/null && break
import sys, boto3
from botocore.config import Config
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:9000",
                  region_name="ap-south-1", config=Config(s3={"addressing_style": "path"}))
try:
    s3.head_bucket(Bucket=sys.argv[1])
except Exception:
    s3.create_bucket(Bucket=sys.argv[1])
PYEOF
    sleep 1
  done

  echo "» starting gateway on http://localhost:8082 (log: .local/gateway.log)"
  (
    cd "$PLATFORM_DIR/services/gateway"
    PG_HOST=localhost PG_PORT=5432 PG_USER=rhub PG_PASSWORD="$PGPASSWORD" PG_DATABASE="$GW_DB" \
    STORAGE_BUCKET="$STORAGE_BUCKET_LOCAL" \
    STORAGE_S3_ENDPOINT="http://127.0.0.1:9000" \
    APP_ENV=local ALLOW_INSECURE_LOCAL=1 \
    AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin AWS_REGION=ap-south-1 \
    COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
    LOCAL_AUTH_KEY_FILE="$GW_LOCAL_KEY" \
    API_BASE_URL="http://localhost:8080" \
    ASSISTANT_BASE_URL="http://localhost:8081" \
    "$GW_VENV/bin/uvicorn" src.main:app --host 127.0.0.1 --port 8082 --reload >"$GW_LOG" 2>&1
  ) &
  GW_PID=$!

  GATEWAY_UP=0
  for i in $(seq 1 30); do
    curl -fsS http://localhost:8082/health >/dev/null 2>&1 && GATEWAY_UP=1 && break
    kill -0 $GW_PID 2>/dev/null || break
    sleep 1
  done
  if [ "$GATEWAY_UP" != 1 ]; then
    echo "gateway FAILED to start — tail .local/gateway.log:"; tail -20 "$GW_LOG"; exit 1
  fi
  if [ "$LOCAL_COGNITO" = "1" ]; then
    echo "» gateway healthy ✓ (LOCAL trust root, offline dev door — real-pool hosted-UI sign-in ALSO accepted when online)"
  else
    echo "» gateway healthy ✓ (real Cognito pool ONLY — hosted-UI sign-in, needs internet; no dev door)"
  fi

  # The production catalog remains admin-authoritative. For the disposable
  # local catalog only, bootstrap one enabled assistant model when the admin
  # has not enabled any model yet; never overwrite an existing local policy.
  if ! psql -h localhost -U rhub -d "$GW_DB" -tAc \
    "SELECT 1 FROM platform_models WHERE enabled=true AND provider_id='anthropic' AND (use_cases='[]'::jsonb OR use_cases @> '[\"assistant\"]'::jsonb) LIMIT 1" \
    | grep -q 1; then
    psql -h localhost -U rhub -d "$GW_DB" -v model="$LOCAL_ASSISTANT_MODEL" -v ON_ERROR_STOP=1 <<'SQLEOF' >/dev/null
INSERT INTO platform_models
  (id, provider_id, model_id, display_name, family, tier, enabled,
   use_cases, enabled_at, enabled_by, provider_status)
VALUES
  ('anthropic:' || :'model', 'anthropic', :'model', :'model', 'sonnet',
   'Balanced', true, '["assistant"]'::jsonb, now(), 'local-bootstrap', 'active')
ON CONFLICT (id) DO UPDATE
  SET enabled = true,
      use_cases = '["assistant"]'::jsonb,
      enabled_at = now(),
      enabled_by = 'local-bootstrap',
      provider_status = 'active';
SQLEOF
    echo "» local assistant model enabled ✓ ($LOCAL_ASSISTANT_MODEL)"
  fi

  echo "» starting assistant on http://localhost:8081 (log: .local/assistant.log)"
  (
    cd "$PLATFORM_DIR/services/assistant"
    PG_HOST=localhost PG_PORT=5432 PG_USER=rhub PG_PASSWORD="$PGPASSWORD" PG_DATABASE="$GW_DB" \
    PUBLIC_RECORDS_DATABASE_URL="$APP_DSN" \
    PUBLIC_RECORDS_SCHEMA=land \
    PUBLIC_RECORDS_EMBEDDINGS_ENABLED=0 \
    ASSISTANT_CHAT_TIMEOUT_SECONDS="${ASSISTANT_CHAT_TIMEOUT_SECONDS:-180}" \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    PORT=8081 \
    "$ASSISTANT_VENV/bin/uvicorn" src.main:app --host 127.0.0.1 --port 8081 --reload >"$ASSISTANT_LOG" 2>&1
  ) &
  ASSISTANT_PID=$!

  ASSISTANT_UP=0
  for i in $(seq 1 30); do
    if curl -fsS http://localhost:8081/health 2>/dev/null | grep -q '"status":"ok"'; then
      ASSISTANT_UP=1
      break
    fi
    kill -0 "$ASSISTANT_PID" 2>/dev/null || break
    sleep 1
  done
  if [ "$ASSISTANT_UP" != 1 ]; then
    echo "assistant FAILED to start — tail .local/assistant.log:"
    tail -20 "$ASSISTANT_LOG"
    exit 1
  fi
  echo "» assistant healthy ✓ (internal public-record capability is reported separately)"

# --- web (Vite: graphql -> :8080, storage/admin/assistant -> :8082) -----------
cd "$PLATFORM_DIR"
bun install
if [ "$WEB_NEXT" = "1" ]; then
  echo "» starting web-next on http://localhost:5273  (Ctrl-C stops everything)"
  DEV_API_TARGET="http://localhost:8080" \
  DEV_GATEWAY_TARGET="http://localhost:8082" \
  DEV_USER_ID="sankara.telukutla" \
  bun run --filter @pattadar/web-next dev:local
else
  echo "» starting web on http://localhost:${WEB_PUBLIC_PORT}  (Ctrl-C stops everything)"
  if [ "$LOCAL_AUTH" = "real" ]; then
    echo "   sign-in: REAL hosted UI (the prod pool)."
    if [ "$WEB_PUBLIC_PORT" != "5173" ]; then
      # Said before the browser opens, because Cognito's own error page names
      # neither the port nor the fix.
      echo "   WARNING: the prod client allows only localhost:5173 — :${WEB_PUBLIC_PORT} will fail"
      echo "            with error=redirect_mismatch. Re-run: WEB_PORT=5173 LOCAL_AUTH=real $0"
    fi
    # REAL sign-in, exactly like pattadar.com — no mock mode.
    VITE_COGNITO_AUTHORITY="https://cognito-idp.ap-south-1.amazonaws.com/${COGNITO_USER_POOL_ID}" \
    VITE_COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID%%,*}" \
    VITE_COGNITO_DOMAIN="auth.pattadar.com" \
    VITE_SOCIAL_PROVIDERS="Google" \
    VITE_GATEWAY_PROXY_TARGET="http://localhost:8082" \
    WEB_PORT="${WEB_PUBLIC_PORT}" \
    bun run dev:web
  else
    echo "   sign-in: SKIPPED (LOCAL_AUTH=mock). The shell shows an 'Auth mocked' chip."
    echo "            Use LOCAL_AUTH=real WEB_PORT=5173 to exercise the hosted UI."
    # No VITE_COGNITO_AUTHORITY: that absence IS the switch. AuthProvider's
    # mock mode signs a dev user in and mints its gateway Bearer from
    # /local-auth/token, so storage behaves as it does signed in.
    VITE_GATEWAY_PROXY_TARGET="http://localhost:8082" \
    VITE_DEV_USER_ID="${DEV_USER_ID:-shankarreddy.t}" \
    DEV_USER_ID="${DEV_USER_ID:-shankarreddy.t}" \
    WEB_PORT="${WEB_PUBLIC_PORT}" \
    bun run dev:web
  fi
fi
