#!/usr/bin/env bash
# Local design-preview stack: pattadar API (FastAPI, real local Postgres data)
# + web dev server (Vite, hot reload). NO AWS, NO deploys.
#
#   ./scripts/start-local.sh          # api on :8080, web on :5173
#
# Stops both on Ctrl-C. API log: .local/api.log
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RHUB_API_DIR="${RHUB_API_DIR:-$HOME/reddy.sh/projects/rhub/api/services/apps/pattadar}"
VENV="$PLATFORM_DIR/.local/api-venv"
API_LOG="$PLATFORM_DIR/.local/api.log"
export PATH="$HOME/.bun/bin:$PATH"

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

# --- web (Vite dev server, proxies /api/gateway/pattadar -> :8080) -----------
cd "$PLATFORM_DIR"
bun install
echo "» starting web on http://localhost:5173  (Ctrl-C stops both)"
bun run dev:web
