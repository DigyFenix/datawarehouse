-- =====================================================================
-- Propósito : Hacer el PLAN de ingesta propio de cada organización.
-- Motivo    : la migración 102 llevó política y campos a grano de organización,
--             pero `plan_ingesta` quedó global. Con dos tenants eso es ambiguo:
--             un plan lista objetos por nombre (`productos`) y sociedades por
--             empresa_id, y ambos existen en más de una organización — el worker
--             no puede saber qué política aplicar. Además `nombre` era UNIQUE
--             global, así que dos tenants no podían tener su plan 'diario'.
-- Tablas    : metadatos.plan_ingesta (+ organizacion_id, UNIQUE nueva)
-- Impacto   : BAJO. Tabla de configuración, sin filas al momento de migrar
--             (las que hubiera se asignan a la organización más antigua).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/104_plan_por_organizacion_down.sql
-- Ref       : migración 102 (ingesta por organización), CLAUDE.md §4
-- =====================================================================

ALTER TABLE metadatos.plan_ingesta
  ADD COLUMN IF NOT EXISTS organizacion_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_plan_organizacion'
       AND table_schema = 'metadatos' AND table_name = 'plan_ingesta'
  ) THEN
    ALTER TABLE metadatos.plan_ingesta
      ADD CONSTRAINT fk_plan_organizacion FOREIGN KEY (organizacion_id)
      REFERENCES gobierno.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill antes de exigir la nueva unicidad (misma regla que la migración 102).
UPDATE metadatos.plan_ingesta
   SET organizacion_id = (SELECT id FROM gobierno.organizaciones ORDER BY id LIMIT 1)
 WHERE organizacion_id IS NULL;

-- La unicidad pasa a ser (organización, nombre).
ALTER TABLE metadatos.plan_ingesta
  DROP CONSTRAINT IF EXISTS plan_ingesta_nombre_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_plan_org_nombre'
  ) THEN
    ALTER TABLE metadatos.plan_ingesta
      ADD CONSTRAINT uq_plan_org_nombre UNIQUE (organizacion_id, nombre);
  END IF;
END $$;

COMMENT ON COLUMN metadatos.plan_ingesta.organizacion_id IS
  'Organización dueña del plan. Los objetos y sociedades que lista solo tienen '
  'sentido dentro de su organización (el mismo objeto sale de otra tabla en otro ERP).';

CREATE INDEX IF NOT EXISTS ix_plan_organizacion
  ON metadatos.plan_ingesta (organizacion_id);
