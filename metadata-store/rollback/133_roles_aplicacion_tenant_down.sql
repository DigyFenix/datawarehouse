-- Rollback de 133_roles_aplicacion_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: el portal de usuario y el gateway de Power BI pierden acceso a esta base
-- (volver a credenciales de superusuario antes de aplicarlo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA portal REVOKE ALL ON TABLES FROM portal_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA portal REVOKE ALL ON SEQUENCES FROM portal_app;
    REVOKE ALL ON ALL TABLES IN SCHEMA portal FROM portal_app;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA portal FROM portal_app;
    REVOKE ALL ON ALL TABLES IN SCHEMA oro FROM portal_app;
    REVOKE USAGE ON SCHEMA portal, oro FROM portal_app;
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM portal_app', current_database());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pbi_lector') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA oro FROM pbi_lector;
    REVOKE USAGE ON SCHEMA oro FROM pbi_lector;
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM pbi_lector', current_database());
  END IF;
END $$;
