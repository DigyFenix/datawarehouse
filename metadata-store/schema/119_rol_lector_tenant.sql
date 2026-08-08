-- =====================================================================
-- Propósito : Acceso del rol de solo lectura `portal_lector` a la base de
--             UN TENANT (dw_<codigo>): el agente de IA lee oro bajo RLS y
--             resuelve los alcances del usuario en el esquema portal.
--             SIN acceso a bronce ni plata (el agente jamás toca crudos).
-- Ejecución : POR CADA base de tenant (sufijo _tenant: el init de la base
--             de control lo omite):
--               docker exec -i cresta-postgres psql -U <user> -d dw_<codigo> \
--                 -f /opt/metadata-store/schema/119_rol_lector_tenant.sql
--             Requiere el rol creado (infra/local/init/03_rol_lector.sh o
--             a mano en instalaciones previas).
-- Impacto   : bajo; solo GRANTs. Las policies de RLS las aplica dbt
--             (macro aplicar_rls_oro como post-hook de oro).
-- Idempotente: sí (GRANT repetido no falla).
-- Rollback  : metadata-store/rollback/119_rol_lector_tenant_down.sql
-- Ref       : CLAUDE.md §11 (RLS siempre), plan sesión 18 (Fase C3)
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_lector') THEN
    RAISE EXCEPTION
      'El rol portal_lector no existe en el clúster. Crearlo primero '
      '(infra/local/init/03_rol_lector.sh con PORTAL_LECTOR_PASSWORD).';
  END IF;

  -- CONNECT a ESTA base (dynamic: el nombre difiere por tenant).
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO portal_lector', current_database());
END $$;

-- Lectura gobernada del warehouse (RLS aplica: NOBYPASSRLS y no es dueño).
GRANT USAGE ON SCHEMA oro TO portal_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA oro TO portal_lector;
-- Los modelos que dbt recree a futuro reciben el grant vía +grants de dbt_project.yml;
-- este default cubre objetos creados por otras vías con el mismo dueño.
ALTER DEFAULT PRIVILEGES IN SCHEMA oro GRANT SELECT ON TABLES TO portal_lector;

-- Resolución de alcances del usuario del portal (solo las tablas necesarias).
GRANT USAGE ON SCHEMA portal TO portal_lector;
GRANT SELECT ON portal.perfiles, portal.usuario_perfiles, portal.perfil_alcances
  TO portal_lector;

-- Nada de bronce/plata: el agente no accede a hechos crudos ni staging (§14).
