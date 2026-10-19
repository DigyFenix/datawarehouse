#!/usr/bin/env bash
# =====================================================================
# Certificado TLS de Postgres = el de Let's Encrypt que Caddy ya obtuvo y
# renueva para DOMINIO_PORTAL. Así el gateway de Power BI se conecta CIFRADO
# a <cliente>.digyfenix.com:5432 con un certificado de confianza, sin
# certificados propios que mantener.
#
# Copia .crt/.key del volumen de Caddy a ./pg-tls (dueño uid 70 = postgres
# en la imagen alpine, permisos 600, como exige Postgres) y recarga Postgres.
# Si Caddy aún no tiene el certificado (primer arranque), deja uno
# autofirmado temporal para que Postgres pueda iniciar con ssl=on.
#
# Uso (root): sudo bash tls-postgres.sh   — idempotente.
# Programado: /etc/cron.d/quilate-tls-postgres (diario), ver RUNBOOK §5.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

DOMINIO="$(grep '^DOMINIO_PORTAL=' .env | cut -d= -f2-)"
ORIGEN="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$DOMINIO"
DESTINO="./pg-tls"
mkdir -p "$DESTINO"

if docker exec quilate-caddy test -f "$ORIGEN/$DOMINIO.crt" 2>/dev/null; then
  docker exec quilate-caddy cat "$ORIGEN/$DOMINIO.crt" > "$DESTINO/server.crt.nuevo"
  docker exec quilate-caddy cat "$ORIGEN/$DOMINIO.key" > "$DESTINO/server.key.nuevo"
  if cmp -s "$DESTINO/server.crt.nuevo" "$DESTINO/server.crt" 2>/dev/null; then
    rm -f "$DESTINO"/*.nuevo
    echo "[tls] sin cambios ($DOMINIO)"
    exit 0
  fi
  mv "$DESTINO/server.crt.nuevo" "$DESTINO/server.crt"
  mv "$DESTINO/server.key.nuevo" "$DESTINO/server.key"
  echo "[tls] certificado de Let's Encrypt instalado para $DOMINIO"
elif [ ! -f "$DESTINO/server.crt" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$DOMINIO" \
    -keyout "$DESTINO/server.key" -out "$DESTINO/server.crt" 2>/dev/null
  echo "[tls] Caddy aún sin certificado: autofirmado temporal para $DOMINIO"
fi

chown 70:70 "$DESTINO/server.crt" "$DESTINO/server.key"
chmod 600 "$DESTINO/server.key"
chmod 644 "$DESTINO/server.crt"

# Recarga sin cortar conexiones (solo si Postgres está corriendo).
if docker ps --format '{{.Names}}' | grep -qx quilate-postgres; then
  docker exec -u postgres quilate-postgres sh -c 'pg_ctl reload -D "$PGDATA"' >/dev/null && echo "[tls] Postgres recargado"
fi
