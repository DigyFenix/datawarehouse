#!/bin/bash
# =====================================================================
# Crea los roles de APLICACIÓN del clúster (primer arranque) para que nada
# expuesto a internet use el superusuario:
#
#   portal_app  API del portal de usuario. BYPASSRLS porque lee dos tablas
#               de oro (estado_carga, dim_organizacion) cuyas policies son
#               solo para portal_lector; los GRANT limitan qué tablas ve.
#               En la base de control: gobierno.organizaciones y metadatos.
#   pbi_lector  Gateway de Power BI. Solo lectura de oro (GRANT por tenant
#               en 133_roles_aplicacion_tenant.sql y en cada build de dbt).
#               BYPASSRLS: Power BI no fija `app.empresas` y vería cero filas.
#
# Contraseñas: PORTAL_APP_PASSWORD y PBI_LECTOR_PASSWORD. Si una no está
# definida, ese rol no se crea (el resto del init no depende de ellos).
# =====================================================================
set -euo pipefail

crear_rol() {
  local rol="$1" clave="$2" atributos="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
       -v rol="$rol" -v clave="$clave" -v atributos="$atributos" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE %s PASSWORD %L',
              :'rol', :'atributos', :'clave')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'rol') \gexec
SQL
}

if [ -n "${PORTAL_APP_PASSWORD:-}" ]; then
  echo "[init] Creando rol portal_app"
  crear_rol portal_app "$PORTAL_APP_PASSWORD" "BYPASSRLS"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO portal_app;
GRANT USAGE ON SCHEMA gobierno, metadatos TO portal_app;
GRANT SELECT ON gobierno.organizaciones TO portal_app;
GRANT SELECT ON ALL TABLES IN SCHEMA metadatos TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA metadatos GRANT SELECT ON TABLES TO portal_app;
SQL
else
  echo "[init] PORTAL_APP_PASSWORD no definida — se omite portal_app"
fi

if [ -n "${PBI_LECTOR_PASSWORD:-}" ]; then
  echo "[init] Creando rol pbi_lector"
  crear_rol pbi_lector "$PBI_LECTOR_PASSWORD" "BYPASSRLS"
else
  echo "[init] PBI_LECTOR_PASSWORD no definida — se omite pbi_lector"
fi
