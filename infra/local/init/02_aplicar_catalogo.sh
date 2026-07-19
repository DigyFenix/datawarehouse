#!/bin/bash
# =====================================================================
# Aplica el DDL versionado del metadata-store (esquema `metadata`) en el
# primer arranque de Postgres, en orden alfabético. Solo archivos forward
# (metadata-store/schema/*.sql); los rollbacks viven aparte y NO se aplican.
# =====================================================================
set -euo pipefail

echo "[init] Aplicando DDL del catálogo desde /opt/metadata-store/schema"
for f in /opt/metadata-store/schema/*.sql; do
  echo "[init]  -> $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "[init] Aplicando seeds desde /opt/metadata-store/seeds"
for f in /opt/metadata-store/seeds/*.sql; do
  [ -e "$f" ] || continue
  echo "[init]  -> $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "[init] Catálogo aplicado."
