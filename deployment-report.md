# Deployment report

## Current migration status

- Timestamp: 2026-09-06T06:05:00Z
- Target URL: `https://proof.uisamurai.ru/`
- Status: `WAITING_FOR_USER_MANAGED_DNS`
- Required DNS record: `A proof.uisamurai.ru -> 178.212.13.134`
- Application release: `cc298d9`
- Deployment automation commit: `ed7defe`
- Container: `testwork-proof`
- Image: `testwork-proof:cc298d9`
- Private upstream: `127.0.0.1:4174 -> 8080`

All server-side work is complete. The authoritative Hostland DNS servers still
return the previous parking address `185.26.122.80`. A temporary systemd timer
checks DNS once per minute. When the new A record appears, it will obtain a
Let's Encrypt certificate, install the final HTTPS Nginx configuration, verify
`/health`, and disable itself.

## Completed checks

- Root-path production build: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Temporary staging container on port 4175: passed and removed.
- Production container: healthy, 0 restarts.
- Nginx bootstrap host for `proof.uisamurai.ru`: HTTP 200 when tested directly
  against the VPS with the correct Host header.
- Root asset URLs use `/assets/...` and are suitable for the subdomain.
- Old Nginx routes `/proof` and `/proof/` were removed from `uisamurai.ru`.
- `https://uisamurai.ru/proof` now returns 404.

## Installed finalizer

- Script: `/usr/local/sbin/finalize-proof-subdomain`
- Service: `proof-subdomain-finalizer.service`
- Timer: `proof-subdomain-finalizer.timer`
- Success marker: `/var/lib/testwork-proof/subdomain-ready`
- Final Nginx config: `/etc/nginx/sites-available/proof.uisamurai.ru.final`

## Rollback

The pre-migration Nginx configuration is retained at
`/etc/nginx/sites-available/uisamurai.backup-pre-proof-subdomain-20260906T0549Z`.
The previous application image `testwork-proof:f24f19d` is also retained.

## Current functional boundary

Screen sharing, microphone capture, screen snapshots, the UI flow, and the
container deployment are live. The voice transport remains the project's mock
adapter until OpenAI Realtime credentials and the server-side ephemeral-token
endpoint are added.

