#!/usr/bin/env bash
# The local test loop: the iPhone talks to THIS laptop instead of AWS, so a
# change is proven before anything rolls — no ECS cycles, no image pushes,
# no cloud cost per iteration.
#
#   Terminal 1:  ./scripts/start-local.sh     # api :8080 · gateway :8082 · MinIO
#   Terminal 2:  ./scripts/phone-local.sh     # bridge + build + install, stays up
#
# What it does:
#   1. Checks the LOCAL gateway is up (real Cognito validation — you sign in
#      with your real account; nothing is mocked).
#   2. Bridges http://<LAN-IP>:8086 → 127.0.0.1:8082 so the phone can reach
#      the gateway (which deliberately binds loopback).
#   3. Rebuilds the app with the bundle URL pointed at the bridge and
#      installs it on the phone. project.yml is restored on exit — the repo
#      never keeps the LAN URL, and the next verify.sh puts production back
#      on the phone.
#
# Phone and laptop must share a Wi-Fi. Ctrl-C ends the bridge; run verify.sh
# afterwards to reinstall the production build, then push the api image once
# everything tested clean.
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$PLATFORM_DIR/apps/ios"
DEVICE_ID="1524B702-D5DD-53CA-B0A5-9A55D39C0A33"
BRIDGE_PORT=8086

# --- preflight ---------------------------------------------------------------
curl -fsS -m 2 http://127.0.0.1:8082/health >/dev/null || {
  echo "Local gateway is not answering on :8082 — run ./scripts/start-local.sh first."
  exit 1
}
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)"
[ -n "$LAN_IP" ] || { echo "No LAN address — is Wi-Fi on?"; exit 1; }
BASE_URL="http://${LAN_IP}:${BRIDGE_PORT}/api/gateway/pattadar"

# --- build the app against the bridge ---------------------------------------
# The bundle plist carries the URL, so the override happens at generate time
# and is UNDONE the moment this script exits, however it exits.
cd "$IOS_DIR"
cp project.yml project.yml.phone-local-backup
trap 'cd "$IOS_DIR"; mv -f project.yml.phone-local-backup project.yml; xcodegen generate >/dev/null 2>&1 || true' EXIT

python3 - "$BASE_URL" <<'PY'
import sys
url = sys.argv[1]
path = "project.yml"
text = open(path).read()
marker = "PattadarAPIURL: "
start = text.index(marker) + len(marker)
end = text.index("\n", start)
open(path, "w").write(text[:start] + url + text[end:])
print(f"» bundle URL for this build: {url}")
PY

echo "» xcodegen + device build (this is the slow part)…"
xcodegen generate >/dev/null
xcodebuild -project Pattadar.xcodeproj -scheme Pattadar \
  -destination "id=${DEVICE_ID}" -derivedDataPath build-device -quiet build
xcrun devicectl device install app --device "$DEVICE_ID" \
  build-device/Build/Products/Debug-iphoneos/Pattadar.app
echo "» installed — the phone now talks to this laptop."

# --- bridge (foreground; Ctrl-C ends the session) ---------------------------
lsof -ti :"$BRIDGE_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.5
echo "⚠️  Bridging http://${LAN_IP}:${BRIDGE_PORT} → 127.0.0.1:8082 (real Cognito auth"
echo "   applies — but run this only on a trusted Wi-Fi). Ctrl-C to stop."
echo ""
echo "   When everything tests clean:  cd apps/ios && ./verify.sh   (production"
echo "   build back on the phone), then push the api image and roll ECS once."
exec python3 - "$LAN_IP" "$BRIDGE_PORT" <<'PY'
import socket, socketserver, sys, threading
LAN, PORT = sys.argv[1], int(sys.argv[2])
class Fwd(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
class H(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            up = socket.create_connection(("127.0.0.1", 8082))
        except OSError:
            self.request.close(); return
        def pump(a, b):
            try:
                while (d := a.recv(65536)):
                    b.sendall(d)
            except OSError:
                pass
            finally:
                a.close(); b.close()
        t = threading.Thread(target=pump, args=(self.request, up), daemon=True)
        t.start(); pump(up, self.request); t.join()
with Fwd((LAN, PORT), H) as s:
    s.serve_forever()
PY
