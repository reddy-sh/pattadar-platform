#!/usr/bin/env bash
# DEV-ONLY: bridge the loopback pattadar API onto the LAN so a physical phone
# build can reach real data. ⚠️  While this runs, ANYONE on this Wi-Fi can call
# the API and impersonate any user (it trusts x-user-id blindly). Run it only
# on a trusted network, and Ctrl-C the moment you finish testing.
set -euo pipefail
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)"
# replace any previous bridge instance instead of failing with EADDRINUSE
lsof -ti :8085 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.5
echo "⚠️  Bridging http://${LAN_IP}:8085 → 127.0.0.1:8080 (Ctrl-C to stop)"
exec python3 - "$LAN_IP" <<'PY'
import socket, socketserver, sys, threading
LAN = sys.argv[1]
class Fwd(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
class H(socketserver.BaseRequestHandler):
    def handle(self):
        up = socket.create_connection(("127.0.0.1", 8080))
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
with Fwd((LAN, 8085), H) as s:
    s.serve_forever()
PY
