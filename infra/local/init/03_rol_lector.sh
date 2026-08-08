#!/bin/bash
# =====================================================================
# Crea el rol de SOLO LECTURA `portal_lector` (primer arranque del clúster).
#
# Es el rol con el que el AGENTE DE IA (y cualquier consumo gobernado) lee
# el esquema oro de cada tenant: LOGIN + NOBYPASSRLS, sin ownership — las
# policies de RLS (macro aplicar_rls_oro de dbt) le aplican SIEMPRE y sin
# la variable de sesión `app.empresas` no ve ni una fila (fail-closed).
#
# La contraseña viene de PORTAL_LECTOR_PASSWORD (del .env de la raíz, vía
# compose). Si no está definida, se avisa y NO se crea: el resto del init
# no depende de este rol.
#
# Los GRANT por base de tenant los aplica la migración
# metadata-store/schema/119_rol_lector_tenant.sql (por cada dw_<codigo>).
# =====================================================================
set -euo pipefail

if [ -z "${PORTAL_LECTOR_PASSWORD:-}" ]; then
  echo "[init] PORTAL_LECTOR_PASSWORD no definida — se omite la creación de portal_lector"
  exit 0
fi

echo "[init] Creando rol de solo lectura portal_lector"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_lector') THEN
    EXECUTE format(
      'CREATE ROLE portal_lector LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
      '$PORTAL_LECTOR_PASSWORD'
    );
  END IF;
END \$\$;
SQL
echo "[init] portal_lector listo."
