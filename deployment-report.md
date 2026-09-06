# Deployment report

## Production release

- Date: 2026-09-06
- URL: https://uisamurai.ru/proof/
- Git commit: `f24f19d4d4a98f02191c8224653d8b34c7fa6fba`
- Release directory: `/opt/testwork-proof/releases/f24f19d`
- Current symlink: `/opt/testwork-proof/current`
- Compose project: `testwork-proof`
- Container: `testwork-proof`
- Image: `testwork-proof:f24f19d`
- Private upstream: `127.0.0.1:4174 -> 8080`

The service runs in a dedicated Docker network and container. Its root
filesystem is read-only, all Linux capabilities are dropped, and the
container has CPU, memory, and process limits. Only the host Nginx can reach
the published port.

## Verification

- `npm run build` with `VITE_BASE_PATH=/proof/`: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Temporary VPS staging container on port 4175: healthy; removed after smoke test.
- Production container: healthy, 0 restarts after deployment.
- `https://uisamurai.ru/proof/`: HTTP 200 over valid TLS.
- Static JS bundle and SPA fallback: HTTP 200.
- Public `/proof/health`: `ok`.
- Playwright: landing and preflight flow loaded; 0 console errors and 0 warnings.
- Existing `https://uisamurai.ru/`: still HTTP 200.

The expired `uisamurai.ru` certificate was renewed during deployment. It is
valid through 2026-12-05. The HTTP ACME challenge location was restored in
Nginx so the enabled Certbot timer can renew it automatically.

## Rollback

This is the first containerized release of Proof, so rollback means removing
the public route and stopping only this new service. The prepared Nginx
rollback file keeps the ACME renewal fix intact:

```bash
install -o root -g root -m 0644 \
  /etc/nginx/sites-available/uisamurai.rollback-testwork-f24f19d \
  /etc/nginx/sites-available/uisamurai
nginx -t && systemctl reload nginx
cd /opt/testwork-proof/current
docker compose down
```

The pre-deployment host configuration is also retained at
`/etc/nginx/sites-available/uisamurai.backup-testwork-20260906T0532Z`.

## Current functional boundary

Screen sharing, microphone capture, screen snapshots, the UI flow, and the
container deployment are live. The voice transport is still the project's
mock adapter; OpenAI Realtime credentials and the server-side ephemeral-token
endpoint have not yet been added.

