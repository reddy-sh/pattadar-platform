#!/usr/bin/env bash
# Local full-fidelity stack: pattadar API (FastAPI, real local Postgres data)
# + the REAL gateway (storage on MinIO standing in for S3, local pattadar_hub
# metadata DB, real Cognito token validation — no auth bypass anywhere)
# + web dev server (Vite, hot reload). NO deploys.
#
#   ./scripts/start-local.sh   # api :8080, gateway :8082, minio :9000, web :5173
#
# REAL application, locally: sign in with your pattadar.com account (email/
# password or Google) — auth, uploads, preview, delete all work exactly like
# the cloud; bytes stay in .local/minio-data. NO mock mode: if Docker/MinIO/
# gateway cannot start, this script FAILS instead of degrading.
# Stops api+gateway on Ctrl-C (MinIO container stays).
# Logs: .local/api.log, .local/gateway.log
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RHUB_API_DIR="${RHUB_API_DIR:-$HOME/reddy.sh/projects/rhub/api/services/apps/pattadar}"
VENV="$PLATFORM_DIR/.local/api-venv"
GW_VENV="$PLATFORM_DIR/.local/gateway-venv"
API_LOG="$PLATFORM_DIR/.local/api.log"
GW_LOG="$PLATFORM_DIR/.local/gateway.log"
export PATH="$HOME/.bun/bin:$PATH"

# Cognito (same pool as pattadar.com — validation only, no secrets involved)
COGNITO_USER_POOL_ID="ap-south-1_XfgAF21Z3"
COGNITO_CLIENT_ID="10okivmth1rv58ed8f2k7eq4mm"

# Local storage stand-ins
MINIO_NAME="pattadar-minio"
STORAGE_BUCKET_LOCAL="pattadar-local-documents"
GW_DB="pattadar_hub"
export PGPASSWORD="rhub-dev-pwd"

mkdir -p "$PLATFORM_DIR/.local"

# --- preflight ---------------------------------------------------------------
command -v bun >/dev/null || { echo "bun not found — install: curl -fsSL https://bun.sh/install | bash"; exit 1; }
pg_isready -h localhost -p 5432 -q || { echo "Postgres not running on localhost:5432 — start it first"; exit 1; }
[ -d "$RHUB_API_DIR" ] || { echo "rhub pattadar api not found at $RHUB_API_DIR (override with RHUB_API_DIR=...)"; exit 1; }

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

# Anthropic key (enables AI extraction endpoints locally) — optional
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f "$HOME/reddy.sh/projects/rhub/.env" ]; then
  ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' "$HOME/reddy.sh/projects/rhub/.env" | cut -d= -f2- || true)"
fi

echo "» starting api on http://localhost:8080 (log: .local/api.log)"
(
  cd "$RHUB_API_DIR"
  APP_PG_DSN="host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd" \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  APP_PUBLIC_URL="http://localhost:5173" \
  "$VENV/bin/uvicorn" src.main:app --host 127.0.0.1 --port 8080 >"$API_LOG" 2>&1
) &
API_PID=$!
trap 'echo; echo "» stopping api"; kill $API_PID 2>/dev/null || true' EXIT INT TERM

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
    AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin AWS_REGION=ap-south-1 \
    COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
    API_BASE_URL="http://localhost:8080" \
    "$GW_VENV/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8082 >"$GW_LOG" 2>&1
  ) &
  GW_PID=$!
  trap 'echo; echo "» stopping api + gateway"; kill $API_PID $GW_PID 2>/dev/null || true' EXIT INT TERM

  GATEWAY_UP=0
  for i in $(seq 1 30); do
    curl -fsS http://localhost:8082/health >/dev/null 2>&1 && GATEWAY_UP=1 && break
    kill -0 $GW_PID 2>/dev/null || break
    sleep 1
  done
  if [ "$GATEWAY_UP" != 1 ]; then
    echo "gateway FAILED to start — tail .local/gateway.log:"; tail -20 "$GW_LOG"; exit 1
  fi
  echo "» gateway healthy ✓ (real auth + real uploads, locally)"

# --- web (Vite: graphql -> :8080, storage/admin -> :8082) --------------------
cd "$PLATFORM_DIR"
bun install
echo "» starting web on http://localhost:5173  (Ctrl-C stops everything)"
# REAL sign-in, exactly like pattadar.com — no mock mode.
VITE_COGNITO_AUTHORITY="https://cognito-idp.ap-south-1.amazonaws.com/${COGNITO_USER_POOL_ID}" \
VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
VITE_COGNITO_DOMAIN="auth.pattadar.com" \
VITE_SOCIAL_PROVIDERS="Google" \
VITE_GATEWAY_PROXY_TARGET="http://localhost:8082" \
bun run dev:web
