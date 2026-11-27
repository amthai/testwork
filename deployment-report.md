# Deployment report

## Production — 0.11.1 — 2026-11-27

Published «Вслух» from commit `3b10943` at 04:57 UTC. All 113 tests and release CI passed. All 76 public files matched the release build over HTTPS. Health, readiness and bootstrap returned HTTP 200. Both services were healthy with zero restarts. [Verification, backup and rollback](docs/knowledge/entries/2026-11/2026-11-27-vslukh-release.md).

## Production — 0.11.0 — 2026-11-26

Published commit `1828a9f` at 11:03 UTC. All 112 tests and release CI passed. HTTPS checks matched 18 files including all four interviewer portraits. Health, readiness and bootstrap returned 200. Both services were healthy. [Verification, backup and rollback](docs/knowledge/entries/2026-11/2026-11-26-call-portraits-release.md).

## Production — 0.10.0 — 2026-11-26

Proof switched to commit `90fad44` at 10:41:37 UTC (19:41:37 Chita). The release images are `testwork-proof:0.10.0-20261126` and `proof-speech:0.10.0-20261126`. The clean build passed all 112 tests. The dependency audit found four moderate issues and zero high or critical issues. [Release CI](https://github.com/amthai/testwork/actions/runs/45802437322).

The isolated candidate preserved access and assignment text across a restart. A scripted interview exercised four Piper voices and GigaAM, including three handoffs from Denis and six attributed turns, without paid API calls. After the switch, all 13 public assets matched the release build. HTTPS health, readiness and bootstrap returned HTTP 200. Bootstrap reported DeepSeek and Yandex. The public homepage showed all three specialists in the in-app browser. Both services were healthy with zero restarts. [Backup, verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-interview-team-release.md).

## Production — 0.9.4 — 2026-11-26

Published commit `fe1a762` at 10:02 UTC. The release build displayed the original and suggested wording together for a saved test report. The Markdown export test verified the same pair and its note. All 98 tests and release CI passed. All 13 public HTML, CSS and JavaScript files matched the clean build. Health, readiness and bootstrap returned HTTP 200. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-restore-rewrite-comparison-release.md)

## Production — 0.9.3 — 2026-11-26

Published commit `3fb5de1` at 09:47 UTC. All 98 tests and release CI passed. All 13 public HTML, CSS and JavaScript files matched the clean build. Health, readiness and bootstrap returned HTTP 200. The production preparation screen showed both main navigation links and a focused assignment field with a #f3f3f3 fill. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-report-navigation-fields-release.md)

## Production — 0.9.2 — 2026-11-26

Published commit `475a6ce` at 09:25 UTC. All 98 tests and the release CI passed. All 13 public HTML, CSS and JavaScript files matched the clean build. HTTPS health and readiness returned 200. The production homepage rendered its button and navigation at 14 px and its description at 16 px. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-text-sizes-release.md)

## Production — 0.9.1 — 2026-11-26

Published commit `0dd0526` at 08:56 UTC. All 98 tests and CI passed. The 13 public HTML, CSS and JavaScript files matched the release build. Public health and readiness returned HTTP 200. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-confirmation-marks-release.md)

## Production — 0.9.0 — 2026-11-26

Published commit `fea11f2` at 08:38 UTC. GitHub Actions passed. The public HTML, stylesheet and three JavaScript bundles matched the local build byte for byte. Public health and readiness returned HTTP 200. Bootstrap confirmed a 30-minute limit. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-preparation-call-release.md)

## Production — 0.8.4 — 2026-11-26

Published the centered screen loader at 06:54 UTC (15:54 Chita). The isolated candidate passed readiness and restart checks. Public health and readiness returned HTTP 200. HTML, CSS, the main JavaScript bundle and the history module matched the local build byte for byte. Both services are healthy. The previous web image is `testwork-proof:0.8.3-20261126`. [Verification and rollback](docs/knowledge/entries/2026-11/2026-11-26-screen-loader-release.md)

## Production — 0.8.3 — 2026-11-26

Published at 04:58:41 UTC (13:58 Chita) on [Proof](https://proof.uisamurai.ru/). White report sections and history cards, filled status colors and the return-to-history button are live. Build and all 98 tests passed; audit has zero high/critical findings and four existing moderate findings. The isolated candidate passed readiness, access, asset equality and authorization/assignment persistence after restart. Public HTTPS health checks and all four UI assets passed; the history screen loaded in IAB. Web and speech are healthy with zero restarts. [Verification](docs/knowledge/entries/2026-11/2026-11-26-report-cards-release.md)

Both pre-switch checks found zero active calls/reports. The consistent SQLite backup contains four sessions at `/opt/testwork-proof/rollback/0.8.3-20261126/pre-release.sqlite`. Roll back by running `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.8.2-20261126`, checking readiness and repointing `current` there. Preserve the existing production volume. Backend and speech source files are unchanged; no new paid voice call was made for this UI release. The isolated candidate and its test volume were removed.

## Production — 0.8.2 — 2026-11-26

Published at 02:38 UTC on [Proof](https://proof.uisamurai.ru/). Six synthetic voice turns exercised the deployed image with GigaAM, the live DeepSeek API and Piper on isolated data. The four conversational replies, uninterrupted narration and explicit request for time all matched the expected behavior. The clean build and all 98 tests passed. The public site loaded in the in-app browser, HTTPS readiness passed and the production bootstrap reported DeepSeek and Yandex. [Verification](docs/knowledge/entries/2026-11/2026-11-26-free-conversation.md)

Both pre-switch checks found zero active calls or reports. The verified SQLite backup contains four sessions at `/opt/testwork-proof/rollback/0.8.2-20261126/pre-release.sqlite`. To roll back, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.8.1-20261125`, verify readiness and repoint `current` there.

## Production — 0.8.1 — 2026-11-25

Published at 14:54 UTC on [Proof](https://proof.uisamurai.ru/). The isolated candidate recognized spoken permission and presence checks and returned playable replies over both WAV and streamed Opus. All 94 tests passed. [Voice regression and verification](docs/knowledge/entries/2026-11/2026-11-25-presentation-check-in.md)

Two pre-switch checks found zero active calls or reports. The verified SQLite backup contains four sessions at `/opt/testwork-proof/rollback/0.8.1-20261125/pre-release.sqlite`. To roll back, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.8.0-20261125`, verify readiness and repoint `current` there. Both versions use the same schema.

## Production — 0.8.0 — 2026-11-25

Published at 14:42 UTC on [Proof](https://proof.uisamurai.ru/). The release combines the redesigned studio with the assignment and voice changes from 0.7.0. Both health endpoints passed. The public HTML, entry assets, logo, favicon and portrait matched the candidate. The web and speech containers reported healthy with zero restarts. [Candidate and production checks](docs/knowledge/entries/2026-11/2026-11-25-studio-release.md)

Both pre-switch checks found zero active calls or reports. The SQLite backup passed its integrity check and contained three sessions. It is stored in `/opt/testwork-proof/rollback/0.8.0-20261125/pre-release.sqlite`. To roll back, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.7.0-20261125`, verify HTTPS readiness and point `current` to that release. Both versions use the same database schema.

## Production — 0.7.0 — 2026-11-25

Published at 12:12 UTC on [Proof](https://proof.uisamurai.ru/). The isolated candidate verified raw assignment storage, the new browser bundle, real local speech recognition, spoken introduction and farewell. Browser QA verified the one-click transition to devices and the red exit. Both pre-switch checks found zero active calls or reports. The integrity-checked SQLite backup contained three sessions. [Verification](docs/knowledge/entries/2026-11/2026-11-25-assignment-and-voice-controls.md)

For rollback, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.6.0-20261125`, verify readiness and repoint `current`. Both releases read the same SQLite schema. The pre-release backup is in `/opt/testwork-proof/rollback/0.7.0-20261125/`.

## Production — 0.6.0 — 2026-11-25

Published at 11:43 UTC on [Proof](https://proof.uisamurai.ru/). Candidate checks covered the spoken introduction, the participant's name, farewell playback and the saved result using an isolated store, synthetic model responses and local speech. The online backup passed its integrity check and both checks before the switch found zero active calls or reports. HTTPS readiness, bootstrap and the production adapter confirmed DeepSeek and SpeechKit LiveTTS with the conversational Denis voice. [Verification](docs/knowledge/entries/2026-11/2026-11-25-denis-introduction-farewell.md)

The database backup is in `/opt/testwork-proof/rollback/0.6.0-20261125/`. For a web rollback, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.5.1-20261125` and verify readiness before restoring the previous `current` link. A saved session in the new meeting stage needs its stage mapped back to intro before a 0.5.1 reader opens it. Retain the current database when preserving calls made after release.

## Production — 0.5.1 — 2026-11-25

Published at 10:02 UTC on [Proof](https://proof.uisamurai.ru/). The candidate delivered the full cached Yandex introduction as Opus and accepted the playback acknowledgement. Both pre-switch checks found zero active calls or reports. The consistent SQLite backup covers all three saved sessions and passed its integrity check. HTTPS readiness and bootstrap confirmed DeepSeek and Yandex after the switch. [Call and feedback verification](docs/knowledge/entries/2026-11/2026-11-25-turns-and-feedback.md)

The backup is under `/opt/testwork-proof/rollback/0.5.1-20261125/`. To roll back the web service, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.5.0-20261125`, verify readiness and repoint `current` to that directory. The existing speech service and persistent volumes are used by both releases.

## Production — 0.5.0 — 2026-11-25

Published at 09:17 UTC on [Proof](https://proof.uisamurai.ru/). The web container uses `testwork-proof:0.5.0-20261125`. The production bootstrap advertises Yandex TTS with DeepSeek. The release candidate delivered a new utterance through the SpeechKit API and stopped playback on interruption. [Browser and server verification](docs/knowledge/entries/2026-11/2026-11-25-yandex-voice-release.md)

A consistent SQLite backup and a restricted copy of the previous server environment are under `/opt/testwork-proof/rollback/0.5.0-20261125/`. To roll back, restore the saved environment to `/opt/testwork-proof/shared/production.env` with mode 0600, run `docker compose up -d --no-deps --no-build web` in release 0.4.2-20261125, verify readiness and repoint `current`.

## Production — 0.4.2 — 2026-11-25

Published at 08:18 UTC. [Open Proof](https://proof.uisamurai.ru/)

- Released `testwork-proof:0.4.2-20261125` after the candidate delivered the entire introduction in 12 Opus segments. A synthetic portfolio conversation exercised the real DeepSeek and Piper services. [Dialogue and browser checks](docs/knowledge/entries/2026-11/2026-11-25-conversational-style.md)
- Both checks before the switch found zero active calls or reports. The SQLite online backup passed its integrity check at `/opt/testwork-proof/rollback/0.4.2-20261125/pre-release.sqlite`.
- For rollback, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.4.1-20261125`, confirm readiness and repoint `current` to that release.

## Production — 0.4.1 — 2026-11-25

Published at 07:56 UTC (16:56 Asia/Chita). [Open Proof](https://proof.uisamurai.ru/?v=0.4.1)

- Released `testwork-proof:0.4.1-20261125` on port 4181. The candidate delivered a complete greeting as nine Opus segments with invitation access enabled and the existing GigaAM and Piper service.
- Checked for active calls and reports twice before switching. Verified a consistent SQLite backup at `/opt/testwork-proof/rollback/0.4.1-20261125/pre-release.sqlite`. The existing sessions survived the rollout.
- To roll back, run `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.4.0-20261125`. After checking readiness, point `current` back to that release and retain the database volume. [Browser measurements and QA](docs/knowledge/entries/2026-11/2026-11-25-streamed-voice.md)

## Production — 0.4.0 — 2026-11-25

Published at 05:57 UTC (14:57 Asia/Chita). [Open Proof](https://proof.uisamurai.ru/?v=0.4.0)

- Switched `proof-live-web` to `testwork-proof:0.4.0-20261125` on port 4181. The speech container and its model volume continue to serve GigaAM and Piper. Both containers reported healthy with zero restarts.
- The candidate passed readiness and invitation checks on loopback port 4182. No live calls or reports were in progress before the switch. The SQLite online backup passed its integrity check and the existing session was present after deployment.
- The browser test used synthetic microphone input and real audio playback, GigaAM, Piper and DeepSeek. It covered echo during the greeting, a spoken interruption, an answer grounded in the brief and a spoken transition into questions. [QA evidence](docs/knowledge/entries/2026-11/2026-11-25-duplex-dialogue.md)
- To roll back the web application, use `docker compose up -d --no-deps --no-build web` in `/opt/testwork-proof/releases/0.3.0-20261123`. Verify readiness and repoint `current` to that release. Retain the live database. A consistent pre-release copy is in `/opt/testwork-proof/rollback/0.4.0-20261125/pre-release.sqlite`.

## Production — 0.3.0 — 2026-11-23

Published at 12:43 UTC (21:43 Asia/Chita). [Open Proof](https://proof.uisamurai.ru/)

- Release directory `/opt/testwork-proof/releases/0.3.0-20261123`. The `current` link points to this directory. Both web and speech images carry the tag `0.3.0-20261123`. The release was built from the working tree.
- Host Nginx serves HTTPS on the public domain and points to `127.0.0.1:4181`. The web and speech containers in project `proof-live` passed their health checks with zero restarts. The backend uses DeepSeek Flash. GigaAM and Piper use the private Compose network.
- Candidate checks covered invitation enforcement, authorization after restart, real speech round trips and DeepSeek model access. Public checks passed for page and asset loading, HTTPS cookies, invitation entry, upload body size, and three consecutive readiness probes. [QA details](docs/knowledge/entries/2026-11/2026-11-23-production-deployment.md)
- The previous image `testwork-proof:cc298d9` is running at 127.0.0.1:4174. That version had no server-side data mounts. New sessions use volume `proof-live_proof-data`. The disposable candidate volume was removed.
- To revert routing, first verify the previous container answers at port 4174. Restore `/opt/testwork-proof/rollback/0.3.0-20261123/nginx.conf` to `/etc/nginx/sites-available/proof.uisamurai.ru`, run `nginx -t` and reload Nginx. Point `/opt/testwork-proof/current` back to the directory listed in `previous-release` next to the saved config and check the public homepage. Preserve the new database and model volumes for a forward rollout.

## Preflight steps and photos candidate — 2026-09-06

- Local implementation: three-step preparation, real vision input for assignment photos, source-grounded extraction and neutral service errors.
- npm test: 63 passed; npm run build and strict test typecheck passed; npm audit --audit-level=high: 0 vulnerabilities.
- Local image proof:preflight-candidate built; compiled API/static UI/schema smoke passed with network disabled and read-only filesystem, no secrets or persistent volumes. Temporary smoke container removed automatically.
- Desktop/mobile flow verified using synthetic assignment and isolated API fixtures, including upload/retry/back navigation and connection failure. Interceptions removed afterwards; no runtime mock mode added.
- Host Nginx templates now specify client_max_body_size 4m. Not applied to the live host: nginx -t and HTTPS photo-upload verification remain release gates.
- No paid OpenAI requests, deployment or commits. Live photo recognition/model quality remains unverified pending API availability. Public production remains the older version described below.
- Evidence: docs/knowledge/entries/2026-09/2026-09-06-preflight-steps-and-images.md.

## Design-lead methodology candidate — 2026-09-06

- Added employer brief analysis, server-owned interview phases, bounded follow-ups and evidence-grounded detailed feedback.
- Local image: proof:methodology-candidate. Docker build and compiled runtime/SQLite smoke check passed; temporary smoke container removed automatically.
- npm test: 50 passed. npm run build passed. npm audit --audit-level=high: 0 vulnerabilities.
- Desktop/mobile UI flow verified using explicitly synthetic test fixtures, not an OpenAI conversation. Interceptions removed afterwards.
- No paid API requests in this iteration, no deployment, no commits. Real voice/model quality remains pending API balance and the live evaluation gate.
- Methodology and evidence: docs/product/design-lead.md and docs/knowledge/entries/2026-09/2026-09-06-design-lead-methodology.md.

## Live-product candidate — 2026-09-06

- Working version: 0.2.0, uncommitted local changes; no new public release.
- Local image: proof:live-candidate. Node backend, real OpenAI provider, SQLite volume.
- npm test: 23 passed. npm run build and Docker build: passed. Production dependency audit: 0 vulnerabilities.
- Candidate: read-only, non-root, local port 4180; process and readiness checks passed.
- Production configuration: access-code guard and Secure cookie verified; authorization survives restart on the dedicated QA volume.
- Secret checks: /.env.local returns 404, no .env.local in the runtime image.
- External integration gate: BLOCKED. The supplied key is valid, but actual paid calls return credit_balance_exhausted / insufficient_quota.
- No successful live voice exchange, screen understanding or generated AI report is claimed. The public deployment below remains the older mock implementation.
- Full results: docs/qa/test-cases.md and docs/knowledge/entries/2026-09/2026-09-06-live-product-implementation.md.

## Previous successful deployment (historical)

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

## Functional boundary of the public historical release

Screen sharing, microphone capture, screen snapshots, the UI flow, and the
container deployment are live. The voice transport remains the project's mock
adapter. The new local candidate replaces that adapter with server-mediated
WebRTC and sideband control, but has not yet passed paid live QA or been published.
