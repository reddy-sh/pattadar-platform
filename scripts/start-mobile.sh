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

# --- LAN address for on-phone development ------------------------------------
# A phone running Expo Go cannot reach 127.0.0.1 on this Mac; give the app the
# Mac's LAN IP for when API calls are wired in (harmless until then).
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://${LAN_IP}:8081}"

# Metro defaults to :8081 — the same port the local gateway uses. If anything
# is already listening there (start-local.sh, or another Metro), move to :8082
# instead of hitting Expo's interactive port prompt.
PORT=8081
PORT_FLAG=""
if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  PORT=8082
  PORT_FLAG="--port 8082"
  echo "» :8081 busy — Metro will use :8082"
fi

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
  android) FLAG="--android" ;;
  web)     FLAG="--web" ;;
  tunnel)  FLAG="--tunnel" ;;
  "")      ;;
  *) echo "unknown mode '$MODE' (use: ios | android | web | tunnel, or nothing for QR)"; exit 1 ;;
esac

echo "» starting Expo (${MODE:-QR for Expo Go}) — EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"
echo "»   keys once running: i = iOS simulator, a = Android, w = web, r = reload"
cd "$MOBILE_DIR"
# shellcheck disable=SC2086  # FLAG/PORT_FLAG are intentionally word-split
exec bunx expo start $FLAG $PORT_FLAG "$@"
