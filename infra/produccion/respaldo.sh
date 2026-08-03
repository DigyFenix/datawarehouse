#!/bin/sh
# =====================================================================
# Respaldo diario: pg_dump -Fc de la base de control y de cada base dw_*.
# Corre dentro del contenedor `respaldo` (bucle de 24 h). Rotación por
# RETENCION_DIAS (default 14). Restauración: pg_restore -d <base> <archivo>.
# =====================================================================
set -eu

FECHA=$(date +%Y%m%d_%H%M%S)
DESTINO=/backups
RETENCION=${RETENCION_DIAS:-14}

echo "[respaldo] $FECHA — iniciando"

# Base de control (metadatos + gobierno).
pg_dump -Fc -d "$BASE_CONTROL" -f "$DESTINO/${BASE_CONTROL}_$FECHA.dump"

# Cada base de tenant (dw_*).
for BASE in $(psql -d "$BASE_CONTROL" -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'dw_%'"); do
  pg_dump -Fc -d "$BASE" -f "$DESTINO/${BASE}_$FECHA.dump"
done

# Rotación.
find "$DESTINO" -name '*.dump' -mtime +"$RETENCION" -delete

echo "[respaldo] $FECHA — completado:"
ls -lh "$DESTINO" | tail -5
