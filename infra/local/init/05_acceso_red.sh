#!/bin/bash
# =====================================================================
# Acceso por red a Postgres (pg_hba.conf), defensa en profundidad detrás del
# firewall del servidor:
#
#   · Red interna de Docker (RED_INTERNA): todos los roles, con contraseña.
#   · Cualquier otra IP: SOLO pbi_lector (gateway de Power BI), SOLO a las
#     bases de tenant (dw_*) y SOLO cifrado (hostssl). El superusuario jamás entra desde fuera.
#
# Se activa solo si RED_INTERNA está definida (producción la fija en el
# compose junto con la subred). En local no se toca el pg_hba de la imagen.
# Requiere desactivar el userland-proxy de Docker en el servidor (RUNBOOK §3):
# con él, las conexiones externas llegan con la IP interna del gateway.
# =====================================================================
set -euo pipefail

if [ -z "${RED_INTERNA:-}" ]; then
  echo "[init] RED_INTERNA no definida — pg_hba por defecto (entorno local)"
  exit 0
fi

# Lo que entra por el puerto publicado puede llegar con la IP del gateway de la red de
# Docker (.1) — pasa con el userland-proxy y en Docker Desktop. Esa IP es "de fuera":
# se rechaza para todos menos pbi_lector, ANTES de la regla de la red interna.
PUERTA="$(echo "${RED_INTERNA%/*}" | sed 's/\.0$/.1/')/32"

echo "[init] Restringiendo pg_hba: interna=$RED_INTERNA (sin $PUERTA), externa solo pbi_lector → dw_*"
cat > "$PGDATA/pg_hba.conf" <<HBA
# Generado por init/05_acceso_red.sh — no editar a mano. Se evalúa de arriba abajo.
# local=trust: el socket solo lo alcanza quien ya tiene `docker exec` (root del servidor).
# TYPE  DATABASE   USER         ADDRESS          METHOD
local   all        all                           trust
host    all        all          127.0.0.1/32     scram-sha-256
host    all        all          ::1/128          scram-sha-256
hostssl "/^dw_"    pbi_lector   0.0.0.0/0        scram-sha-256
hostssl "/^dw_"    pbi_lector   ::/0             scram-sha-256
host    all        all          $PUERTA          reject
host    all        all          $RED_INTERNA     scram-sha-256
HBA
# La base de control no admite conexiones por defecto (PUBLIC): solo quien tiene GRANT.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"   -c "REVOKE CONNECT ON DATABASE \"$POSTGRES_DB\" FROM PUBLIC;"   -c "SELECT pg_reload_conf();" >/dev/null
