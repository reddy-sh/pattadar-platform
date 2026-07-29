#!/usr/bin/env bash
# Keep the phone's two tunnels alive on STABLE addresses.
#
# Why fixed subdomains: the tunnel URL is compiled into the iOS build, so a
# random URL means a full rebuild every time the tunnel dies. With a reserved
# subdomain the address never changes — a dead tunnel just needs to come back,
# and this script does that automatically.
#
#   https://pattadar-api-rt.loca.lt  → api      :8080
#   https://pattadar-gw-rt.loca.lt   → gateway  :8082  (file storage)
#
# SECURITY: these expose local services to the public internet. The API trusts
# the x-user-id header, so anyone with the URL can read this data. Run it only
# while testing on the phone and Ctrl-C when done.
set -uo pipefail

API_SUB="${API_SUB:-pattadar-api-rt}"
GW_SUB="${GW_SUB:-pattadar-gw-rt}"

echo "⚠️  Exposing localhost:8080 and localhost:8082 publicly. Ctrl-C when finished."
echo "    api     https://${API_SUB}.loca.lt"
echo "    storage https://${GW_SUB}.loca.lt"

supervise() {                       # $1 = port, $2 = subdomain, $3 = label
  local port="$1" sub="$2" label="$3"
  while true; do
    npx --yes localtunnel --port "$port" --subdomain "$sub" >/tmp/tunnel-$label.log 2>&1
    echo "  · $label tunnel dropped — restarting in 3s" >&2
    sleep 3
  done
}

supervise 8080 "$API_SUB" api &
API_PID=$!
supervise 8082 "$GW_SUB" gw &
GW_PID=$!
trap 'echo; echo "» stopping tunnels"; kill $API_PID $GW_PID 2>/dev/null; pkill -f localtunnel 2>/dev/null; exit 0' INT TERM

# Health loop: report when either side stops answering so a silent death is visible.
while true; do
  sleep 30
  for pair in "api:${API_SUB}" "storage:${GW_SUB}"; do
    name="${pair%%:*}"; sub="${pair##*:}"
    code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" -H "Bypass-Tunnel-Reminder: 1" "https://${sub}.loca.lt/health" || echo 000)
    [ "$code" = "200" ] || echo "  · $name unhealthy (HTTP $code) — supervisor will recycle it" >&2
  done
done
