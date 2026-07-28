-- =====================================================================
-- Rollback de 104_plan_por_organizacion.sql
-- Devuelve `plan_ingesta` a plan global: unicidad por nombre y sin organización.
-- ATENCIÓN: si hay planes con el mismo nombre en distintas organizaciones, la
-- unicidad global falla. Resolver el choque (renombrar o borrar) antes de correr.
-- Impacto   : BAJO. Tabla de configuración; no borra planes.
-- =====================================================================

ALTER TABLE metadatos.plan_ingesta
  DROP CONSTRAINT IF EXISTS uq_plan_org_nombre;

DROP INDEX IF EXISTS metadatos.ix_plan_organizacion;

ALTER TABLE metadatos.plan_ingesta
  DROP CONSTRAINT IF EXISTS fk_plan_organizacion;

ALTER TABLE metadatos.plan_ingesta
  DROP COLUMN IF EXISTS organizacion_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_ingesta_nombre_key'
  ) THEN
    ALTER TABLE metadatos.plan_ingesta
      ADD CONSTRAINT plan_ingesta_nombre_key UNIQUE (nombre);
  END IF;
END $$;
