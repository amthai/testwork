#!/usr/bin/env bash
set -euo pipefail

DOMAIN=proof.uisamurai.ru
TARGET_IP=178.212.13.134
WEBROOT=/var/www/uisamurai-hold
ACTIVE_CONFIG=/etc/nginx/sites-available/proof.uisamurai.ru
FINAL_CONFIG=/etc/nginx/sites-available/proof.uisamurai.ru.final
BOOTSTRAP_BACKUP=/etc/nginx/sites-available/proof.uisamurai.ru.bootstrap-backup
READY_MARKER=/var/lib/testwork-proof/subdomain-ready
DNS_CHECK_CONTAINER=testwork-proof

if [[ -f "$READY_MARKER" ]]; then
  exit 0
fi

resolvectl flush-caches >/dev/null 2>&1 || true
authoritative_lookup="$(
  docker exec "$DNS_CHECK_CONTAINER" nslookup "$DOMAIN" ns.hostland.ru 2>/dev/null || true
)"

if ! grep -Eq "(^|[^0-9])${TARGET_IP//./\\.}([^0-9]|$)" <<<"$authoritative_lookup"; then
  echo "Waiting for authoritative DNS for $DOMAIN to resolve to $TARGET_IP; lookup: ${authoritative_lookup:-failed}"
  exit 0
fi

install -d -m 0755 "$WEBROOT/.well-known/acme-challenge"

certbot certonly \
  --webroot \
  --webroot-path "$WEBROOT" \
  --cert-name "$DOMAIN" \
  --domains "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email

if [[ ! -f "$BOOTSTRAP_BACKUP" ]]; then
  cp -a "$ACTIVE_CONFIG" "$BOOTSTRAP_BACKUP"
fi

install -o root -g root -m 0644 "$FINAL_CONFIG" "$ACTIVE_CONFIG"

if ! nginx -t; then
  cp -a "$BOOTSTRAP_BACKUP" "$ACTIVE_CONFIG"
  exit 1
fi

systemctl reload nginx
health_ok=0
for attempt in $(seq 1 15); do
  if curl --fail --silent --show-error \
    --resolve "$DOMAIN:443:$TARGET_IP" \
    "https://$DOMAIN/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

if (( health_ok == 0 )); then
  echo "HTTPS health check did not pass after nginx reload"
  exit 1
fi

install -d -m 0755 "$(dirname "$READY_MARKER")"
printf '%s\n' "$(date -u +%FT%TZ)" >"$READY_MARKER"

systemctl disable proof-subdomain-finalizer.timer >/dev/null 2>&1 || true
systemctl stop proof-subdomain-finalizer.timer >/dev/null 2>&1 || true

echo "$DOMAIN is live over HTTPS"
