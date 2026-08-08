-- =====================================================================
-- Rollback de 119_rol_lector_tenant.sql (por cada base de tenant).
-- No borra el rol del clúster (compartido entre tenants): solo revoca
-- los privilegios sobre ESTA base.
-- =====================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA oro REVOKE SELECT ON TABLES FROM portal_lector;
REVOKE SELECT ON ALL TABLES IN SCHEMA oro FROM portal_lector;
REVOKE USAGE ON SCHEMA oro FROM portal_lector;

REVOKE SELECT ON portal.perfiles, portal.usuario_perfiles, portal.perfil_alcances
  FROM portal_lector;
REVOKE USAGE ON SCHEMA portal FROM portal_lector;

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM portal_lector', current_database());
END $$;
