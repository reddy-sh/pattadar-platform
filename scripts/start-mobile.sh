#!/usr/bin/env bash
# Start the Pattadar mobile dev loop (Expo / Metro) in a REAL interactive
# terminal. Do not launch this through `bun run --filter` — bun's output
# multiplexer hides Expo's QR code and swallows the i/a/w keys (that is the
# problem this script exists to avoid).
#
#   ./scripts/start-mobile.sh            # QR code for Expo Go on your phone (same Wi-Fi)
#   ./scripts/start-mobile.sh ios        # open iOS simulator (needs Xcode)
#   ./scripts/start-mobile.sh android    # open Android emulator (needs Android Studio)
#   ./scripts/start-mobile.sh web        # browser preview
#   ./scripts/start-mobile.sh tunnel     # QR over a tunnel (phone NOT on your Wi-Fi)
#
# Backend note: the app does not call the local API yet (GraphQL wiring is a
# later Phase 4 step). When it does, run ./scripts/start-local.sh alongside —
# this script already avoids its port (8081) and exports EXPO_PUBLIC_API_URL
# with your Mac's LAN IP so a phone can reach the local gateway.
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$PLATFORM_DIR/apps/mobile"
export PATH="$HOME/.bun/bin:$PATH"

# --- preflight ---------------------------------------------------------------
command -v bun >/dev/null || { echo "bun not found — install: curl -fsSL https://bun.sh/install | bash"; exit 1; }
[ -f "$MOBILE_DIR/package.json" ] || { echo "mobile app missing — expected $MOBILE_DIR/package.json"; exit 1; }
[ -d "$PLATFORM_DIR/node_modules" ] || { echo "» first run — installing workspace..."; (cd "$PLATFORM_DIR" && bun install); }

# --- backend URL + dev identity ----------------------------------------------
# GraphQL goes STRAIGHT to the local pattadar API (:8080, same one
# start-local.sh runs) with a dev-only x-user-id header — the exact trust
# model the web Vite proxy uses. 127.0.0.1 works from the iOS simulator
# (it shares the Mac's network). SECURITY: the local API trusts x-user-id
# blindly — keep it loopback-only. Do NOT bind it to the LAN for a physical
# phone; use `./scripts/start-mobile.sh tunnel` for Metro and keep API work
# on the simulator until real Cognito auth lands.
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://127.0.0.1:8080}"
export EXPO_PUBLIC_DEV_USER="${EXPO_PUBLIC_DEV_USER:-sankara.telukutla}"

if ! curl -fsS -m 2 "${EXPO_PUBLIC_API_URL}/health" >/dev/null 2>&1; then
  echo "» WARNING: no API at ${EXPO_PUBLIC_API_URL} — app will show sample data (run ./scripts/start-local.sh for real data)"
fi

# Metro defaults to :8081 — but that port is RESERVED for the local gateway
# (start-local.sh). Always start scanning at :8082 so a running Metro never
# blocks the gateway from starting later; skip any taken port.
PORT=8082
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  [ "$PORT" -gt 8099 ] && { echo "no free port in 8082-8099"; exit 1; }
done
PORT_FLAG="--port $PORT"
echo "» Metro on :$PORT (:8081 is reserved for the local gateway)"

# Xcode 27 (beta) replaced Simulator.app with DeviceHub.app; Expo CLI 57 still
# waits for Simulator.app and dies with SIMULATOR_TIMEOUT. When that's the
# case, drive the simulator ourselves: boot a device, open DeviceHub, install
# the cached Expo Go, and open the exp:// URL once Metro answers.
ios_without_simulator_app() {
  local devicehub="/Applications/Xcode.app/Contents/Applications/DeviceHub.app"
  if ! xcrun simctl list devices 2>/dev/null | grep -q Booted; then
    local udid
    udid="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/ {print $2; exit}')"
    [ -n "$udid" ] && xcrun simctl boot "$udid" 2>/dev/null || true
  fi
  [ -d "$devicehub" ] && open "$devicehub" 2>/dev/null || true
  local expo_go
  expo_go="$(ls -d "$HOME"/.expo/ios-simulator-app-cache/*.app 2>/dev/null | tail -1)"
  if [ -n "$expo_go" ]; then
    xcrun simctl install booted "$expo_go" 2>/dev/null || true
  else
    echo "» no cached Expo Go under ~/.expo/ios-simulator-app-cache — press i once (it downloads it), then rerun"
  fi
  ( tries=0
    until curl -fsS "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; do
      sleep 1; tries=$((tries + 1)); [ "$tries" -ge 120 ] && exit 0
    done
    xcrun simctl openurl booted "exp://127.0.0.1:${PORT}" ) &
  echo "» simulator ready — app will open automatically once Metro is up"
}

# --- target ------------------------------------------------------------------
MODE="${1:-}"
[ $# -gt 0 ] && shift
FLAG=""
case "$MODE" in
  ios)
    if [ -d "$(xcode-select -p)/Applications/Simulator.app" ]; then
      FLAG="--ios"
    else
      ios_without_simulator_app
    fi
    ;;
  android)
    FLAG="--android"
    # Inside the Android emulator, 127.0.0.1 is the emulator itself;
    # 10.0.2.2 is its alias for this Mac.
    if [ "$EXPO_PUBLIC_API_URL" = "http://127.0.0.1:8080" ]; then
      export EXPO_PUBLIC_API_URL="http://10.0.2.2:8080"
      echo "» android emulator — API URL rewritten to $EXPO_PUBLIC_API_URL"
    fi
    ;;
  web)     FLAG="--web" ;;
  tunnel)  FLAG="--tunnel" ;;
  "")      ;;
  *) echo "unknown mode '$MODE' (use: ios | android | web | tunnel, or nothing for QR)"; exit 1 ;;
esac

echo "» starting Expo (${MODE:-QR for Expo Go}) — API=$EXPO_PUBLIC_API_URL as $EXPO_PUBLIC_DEV_USER (dev header)"
echo "»   keys once running: i = iOS simulator, a = Android, w = web, r = reload"
cd "$MOBILE_DIR"
# shellcheck disable=SC2086  # FLAG/PORT_FLAG are intentionally word-split
exec bunx expo start $FLAG $PORT_FLAG "$@"
