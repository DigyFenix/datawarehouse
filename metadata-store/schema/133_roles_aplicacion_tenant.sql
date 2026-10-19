-- =====================================================================
-- Propósito : Permisos de los roles de APLICACIÓN en la base de UN TENANT
--             (dw_<codigo>), para que nada expuesto a internet use el
--             superusuario del clúster:
--               · portal_app  → API del portal de usuario: esquema portal
--                               completo + lectura de oro.estado_carga y
--                               oro.dim_organizacion (frescura y empresas).
--               · pbi_lector  → gateway de Power BI: lectura de oro, nada más.
--             Bronce y plata quedan fuera para ambos (§14).
-- Ejecución : POR CADA base de tenant (sufijo _tenant: el init de la base de
--             control lo omite). La aplica Provisionar; a mano:
--               psql -d dw_<codigo> -f /opt/metadata-store/schema/133_roles_aplicacion_tenant.sql
--             Los roles los crea infra/local/init/04_roles_aplicacion.sh. Si
--             un rol no existe, se avisa y se sigue (entorno sin ese rol).
-- Impacto   : bajo; solo GRANTs. Las tablas de oro que dbt recrea reciben el
--             SELECT en la macro aplicar_rls_oro (post-hook de oro).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/133_roles_aplicacion_tenant_down.sql
-- Ref       : CLAUDE.md §12 (secretos/roles), §14
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO portal_app', current_database());
    GRANT USAGE ON SCHEMA portal TO portal_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA portal TO portal_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA portal TO portal_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA portal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA portal GRANT USAGE, SELECT ON SEQUENCES TO portal_app;
    -- La auditoría es solo de inserción: quien comprometa el API no puede borrar su rastro.
    REVOKE UPDATE, DELETE, TRUNCATE ON portal.auditoria FROM portal_app;
    -- Oro: solo USAGE aquí; el SELECT puntual (estado_carga, dim_organizacion) lo da
    -- la macro de dbt en cada build, porque dbt recrea las tablas.
    GRANT USAGE ON SCHEMA oro TO portal_app;
  ELSE
    RAISE NOTICE 'Rol portal_app inexistente: se omiten sus permisos en %', current_database();
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pbi_lector') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO pbi_lector', current_database());
    GRANT USAGE ON SCHEMA oro TO pbi_lector;
    GRANT SELECT ON ALL TABLES IN SCHEMA oro TO pbi_lector;
  ELSE
    RAISE NOTICE 'Rol pbi_lector inexistente: se omiten sus permisos en %', current_database();
  END IF;
END $$;
