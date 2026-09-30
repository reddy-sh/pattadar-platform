#!/usr/bin/env bash
# Start the local stack with REAL sign-in (Google or email/password). Real
# sign-in is now start-local.sh's own default, so this is kept only as an
# alias for old habits: a thin wrapper over start-local.sh LOCAL_AUTH=real, so
# the two can never drift apart.
#
#   ./scripts/start-local-google.sh     # then open http://localhost:5173/login
#
# Web runs on :5173 because that is the loopback callback the live web client
# allows; any other port fails at Google with error=redirect_mismatch.
# Pool/client ids and your local identity binding come from the gitignored
# .local/cognito-local.env — without it a Google login lands on an empty
# account instead of your local records.
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$PLATFORM_DIR/.local/cognito-local.env" ]; then
  echo "note: .local/cognito-local.env not found — Google sign-in will work, but"
  echo "      it lands on a fresh account, not on your local records."
fi

if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port 5173 is already in use — stop whatever is on it first (Google only"
  echo "accepts sign-ins returning to localhost:5173)."
  exit 1
fi

LOCAL_AUTH=real exec "$PLATFORM_DIR/scripts/start-local.sh" "$@"
