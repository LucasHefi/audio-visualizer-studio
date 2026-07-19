# Deployment, health and recovery runbook

This app is a static Vite build. Audio and project settings stay in the browser; the server does not own a database, uploads directory, or account store. The delivery boundary is therefore `dist/` plus the loopback preview process and the Tailscale service in front of it.

## Build and local readiness

Run from the repository root:

```bash
export PATH="/usr/bin:/usr/local/bin:/bin:$PATH"
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run typecheck
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js test -- --run
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run build
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run preview -- --host 127.0.0.1 --port 4174
```

For explicit startup diagnostics use the equivalent wrapper:

```bash
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run preview:diagnostic -- --host 127.0.0.1 --port 4174
```

In a second shell:

```bash
/usr/bin/node scripts/probe-readiness.mjs --base=http://127.0.0.1:4174
```

The probe checks `/health.json`, the application root, and every Vite asset referenced by the root document. It is an application/serving-layer check, not a Tailscale or browser-device check.

To prove the negative path without changing source:

```bash
/usr/bin/node scripts/probe-readiness.mjs \
  --base=http://127.0.0.1:4174 \
  --path=/assets/known-missing-release-gate.js \
  --expect-unhealthy
```

Expected result: `UNHEALTHY probe PASS` with the missing-path failure listed.

## Startup diagnostics

`npm run preview` uses `scripts/preview.mjs`. It logs the repository root, the loopback contract, the readiness endpoint, the Vite Local URL and the final process exit code. Keep the preview bound to `127.0.0.1`; never replace this with `0.0.0.0` for the public target.

## Controlled restart

1. Capture the current release identity and process:

```bash
git rev-parse HEAD
pgrep -af 'vite.*preview|scripts/preview.mjs'
```

2. Stop only the preview process that owns the configured port. Do not kill unrelated Node processes.
3. Start the same command again on `127.0.0.1:4174`.
4. Run `scripts/probe-readiness.mjs` against the loopback URL.
5. Record the timestamp, commit, command, HTTP result and any warnings in the Taiga Task comment.

A restart PASS does not imply tunnel or device PASS.

## Rollback and configuration safety

The static release is rollback-safe when the previous `dist/` directory or previous commit is retained outside the live process:

```bash
mv dist dist.failed-$(date +%Y%m%d-%H%M%S)
# restore the reviewed previous dist/ directory, or checkout/build the reviewed commit
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run build
/usr/bin/node scripts/probe-readiness.mjs --base=http://127.0.0.1:4174
```

Do not delete browser storage during a code rollback: local project settings are user data and are not part of `dist/`. Do not introduce a database, uploads mount, or secrets into this deployment without a new Taiga scope and data-boundary review.

## Tailscale serving and access boundary

The existing delivery shape is:

```bash
tailscale funnel --https=8443 --bg --yes 4174
tailscale funnel status
```

Use the exact hostname/port returned by `tailscale funnel status`; do not copy a guessed hostname into a release record. Run the read-only diagnostic helper:

```bash
scripts/tailscale-diagnostics.sh "https://<verified-hostname>:8443"
```

Current product intent is an Internet-reachable preview through Funnel. Therefore “no unintended public exposure” is not a local PASS: it requires an explicit review that the public exposure is intentional, plus a controlled outside-tailnet probe if the release requires one. A local app health response cannot prove ACL behavior, allowed-device access, or public exposure state.

## Failure matrix and release gate

| Failure | Probe | Evidence | Release state |
|---|---|---|---|
| app process stopped | loopback `/health.json` | connection failure | OPEN until restart + probe |
| static asset missing | readiness probe asset list | HTTP 404/asset name | RELEASE-BLOCKED |
| app root broken | loopback `/` | HTTP/body failure | RELEASE-BLOCKED |
| tunnel down | `tailscale funnel status` + verified URL | status + external HTTP result | OPEN until real network probe |
| allowed-device browser broken | real device/browser smoke | date, device, URL, console result | OPEN until observed |
| unexpected public exposure | outside-tailnet probe + Funnel config review | source network + HTTP result | OPEN until reviewed |

Never promote a local health PASS to a tunnel, ACL, physical-device, or release PASS.
