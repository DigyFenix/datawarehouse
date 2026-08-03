#!/bin/bash
# =====================================================================
# Aplica el DDL versionado del metadata-store (esquema `metadata`) en el
# primer arranque de Postgres, en orden alfabético. Solo archivos forward
# (metadata-store/schema/*.sql); los rollbacks viven aparte y NO se aplican.
# =====================================================================
set -euo pipefail

echo "[init] Aplicando DDL del catálogo desde /opt/metadata-store/schema"
for f in /opt/metadata-store/schema/*.sql; do
  # Los archivos *_tenant.sql se aplican por base de tenant (dw_<codigo>), no aquí.
  case "$f" in
    *_tenant.sql)
      echo "[init]  -- omitido (solo tenant): $f"
      continue
      ;;
  esac
  echo "[init]  -> $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "[init] Aplicando seeds desde /opt/metadata-store/seeds"
for f in /opt/metadata-store/seeds/*.sql; do
  [ -e "$f" ] || continue
  # Los seeds PARAMETRIZADOS por organización (:'org') son de ONBOARDING, no de init:
  # se aplican por tenant con `psql -v org=<codigo>` (ver docs/ONBOARDING). Sin la
  # variable, psql revienta con error de sintaxis y el init completo fallaría.
  if grep -q ":'org'" "$f"; then
    echo "[init]  -- omitido (seed de onboarding por organización): $f"
    continue
  fi
  echo "[init]  -> $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "[init] Catálogo aplicado."
