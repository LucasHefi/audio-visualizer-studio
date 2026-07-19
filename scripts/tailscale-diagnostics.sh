#!/usr/bin/env bash
set -u

BASE_URL="${1:-https://jolanda-system-product-name.tail40af21.ts.net:8443}"

printf '%s\n' "== Tailscale/app diagnostics =="
printf 'base_url=%s\n' "$BASE_URL"

if command -v tailscale >/dev/null 2>&1; then
  printf '%s\n' '-- tailscale funnel status (read-only) --'
  tailscale funnel status || printf '%s\n' 'OPEN: tailscale funnel status failed; inspect daemon/auth state.'
else
  printf '%s\n' 'OPEN: tailscale binary is not available on this host.'
fi

printf '%s\n' '-- app health --'
if curl --fail --silent --show-error --max-time 10 "$BASE_URL/health.json"; then
  printf '\n%s\n' 'APP HEALTH PASS'
else
  printf '%s\n' 'APP HEALTH OPEN: health endpoint is not reachable or not healthy.'
fi

printf '%s\n' '-- root HTTP probe --'
if curl --fail --silent --show-error --max-time 10 -o /dev/null -w 'http_status=%{http_code} total_seconds=%{time_total}\n' "$BASE_URL/"; then
  printf '%s\n' 'ROOT PROBE PASS'
else
  printf '%s\n' 'ROOT PROBE OPEN: application root is not reachable.'
fi

printf '%s\n' '-- release boundary --'
printf '%s\n' 'App health does not prove tunnel reachability, ACL correctness, allowed-device browser behavior, or absence of public exposure.'
printf '%s\n' 'Those gates require a real network/device probe and remain OPEN until recorded.'
