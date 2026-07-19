# Audio Visualizer Studio

Local-first React/Vite editor for creating audio-reactive visual previews. Audio files are processed in the browser and are never uploaded by the application.

## Commands

The host's npm wrapper is unstable in this environment. Use the system Node + npm CLI directly:

```bash
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js install
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run typecheck
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js test
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run build
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run dev -- --host 127.0.0.1 --port 4173
```

## Scope

MVP includes local MP3 selection/drop, browser playback, normalized Web Audio frames, four modular canvas scenes, palette/profile/inspector controls, local project settings, accessible responsive controls, and an explicit export seam. Production MP4 export and accounts are intentionally not implemented.

## Deployment

The app is designed for a loopback Vite preview/dev server behind a Tailscale Serve/Funnel target. Do not expose the dev server directly to the network; keep it bound to `127.0.0.1`.

Verified local deployment shape used for this MVP:

```bash
export PATH="/usr/bin:/usr/local/bin:/bin:$PATH"
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run build
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run preview -- --host 127.0.0.1 --port 4174
tailscale funnel --https=8443 --bg --yes 4174
```

The current public endpoint is intentionally on HTTPS port 8443 so an existing HTTPS root on port 443 is not replaced. The exact hostname is environment-specific and must be taken from `tailscale funnel status`; no Tailscale secrets belong in this repository.

Health and recovery:

```bash
/usr/bin/node /usr/share/nodejs/npm/bin/npm-cli.js run probe:readiness -- --base=http://127.0.0.1:4174
scripts/tailscale-diagnostics.sh "https://<verified-hostname>:8443"
```

`/health.json` and the readiness probe cover the application/serving layer only. They do not prove Tailscale reachability, ACL behavior, allowed-device browser behavior, or absence of public exposure. See `DEPLOYMENT_RUNBOOK.md` for restart, rollback, negative probes and the release matrix.
