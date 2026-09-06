# Deployment report

## Current migration status

- Timestamp: 2026-09-06T06:41:00Z
- Target URL: `https://proof.uisamurai.ru/`
- Status: `SUCCESS`
- Required DNS record: `A proof.uisamurai.ru -> 178.212.13.134`
- Application release: `cc298d9`
- Deployment automation commits: `ed7defe`, `ed55831`, current DNS-check retry update
- Container: `testwork-proof`
- Image: `testwork-proof:cc298d9`
- Private upstream: `127.0.0.1:4174 -> 8080`

The authoritative Hostland DNS servers and the major public resolvers return
`178.212.13.134`. The finalizer obtained a Let's Encrypt certificate for
`proof.uisamurai.ru`, installed the HTTPS Nginx configuration, verified
`/health`, wrote the success marker, and disabled its temporary timer.

Some local recursive DNS caches may continue serving the previous parking
address until their old TTL expires; this does not affect the authoritative
record or the deployed server.

## Completed checks

- Root-path production build: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Temporary staging container on port 4175: passed and removed.
- Production container: healthy, 0 restarts.
- Nginx bootstrap host for `proof.uisamurai.ru`: HTTP 200 when tested directly
  against the VPS with the correct Host header.
- Final HTTPS host: certificate issued for `proof.uisamurai.ru`, valid through
  2026-12-05; HTTPS `/health` returns `ok`.
- External browser clients reached the new root-path app and its assets with
  HTTP 200 after DNS propagation.
- Root asset URLs use `/assets/...` and are suitable for the subdomain.
- Old Nginx routes `/proof` and `/proof/` were removed from `uisamurai.ru`.
- `https://uisamurai.ru/proof` now returns 404.

## Installed finalizer

- Script: `/usr/local/sbin/finalize-proof-subdomain`
- Service: `proof-subdomain-finalizer.service`
- Timer: `proof-subdomain-finalizer.timer`
- Success marker: `/var/lib/testwork-proof/subdomain-ready`
- Final Nginx config: `/etc/nginx/sites-available/proof.uisamurai.ru.final`
- The DNS check uses Hostland authoritative DNS, and the post-reload HTTPS
  check retries briefly to allow graceful Nginx workers to drain.

## Rollback

The pre-migration Nginx configuration is retained at
`/etc/nginx/sites-available/uisamurai.backup-pre-proof-subdomain-20260906T0549Z`.
The previous application image `testwork-proof:f24f19d` is also retained.

## Current functional boundary

Screen sharing, microphone capture, screen snapshots, the UI flow, and the
container deployment are live. The voice transport remains the project's mock
adapter until OpenAI Realtime credentials and the server-side ephemeral-token
endpoint are added.
