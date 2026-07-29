#!/usr/bin/env bash
# DEV-ONLY: expose the loopback pattadar API through a PUBLIC tunnel so a
# phone on ANY network can reach real data. ⚠️  EVEN RISKIER than phone-live.sh:
# anyone who learns the URL can call the API and impersonate any user (it
# trusts x-user-id blindly). Use only for short test sessions; Ctrl-C ends it.
#
# Usage:
#   ./scripts/phone-live-tunnel.sh          # prints https://<random>.loca.lt
#   then rebuild the app with EXPO_PUBLIC_API_URL=<that url>
set -euo pipefail
curl -fsS -m 2 http://127.0.0.1:8080/health >/dev/null || {
  echo "API is not running on :8080 — start it first (start-local.sh)"; exit 1; }
echo "⚠️  Tunnelling 127.0.0.1:8080 to a PUBLIC URL — Ctrl-C to stop."
exec bunx localtunnel --port 8080
