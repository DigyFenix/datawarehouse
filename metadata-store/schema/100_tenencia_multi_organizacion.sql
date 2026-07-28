-- =====================================================================
-- Propósito : Habilitar DOS O MÁS ORGANIZACIONES-CLIENTE (tenants) en el mismo
--             portal, con los DATOS aislados en una base de datos por tenant.
-- Motivo    : entran Grupo Cresta (SAP B1/HANA) e Iron Network (Odoo 18).
--             Un solo plano de control (para comparar y administrar desde un
--             lugar) + planos de datos separados (para que no se crucen jamás).
-- Tablas    : gobierno.organizaciones (+ base_datos_dw)
--             gobierno.sociedades     (+ organizacion_id)
-- Impacto   : medio. `sociedades` no estaba ligada a `organizaciones`: con un
--             solo tenant no se notaba, con dos es un hueco de aislamiento.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/100_tenencia_multi_organizacion_down.sql
-- Ref       : CLAUDE.md §3 (base + instancias), §12 (tenencia)
-- =====================================================================

-- 1) Base de datos destino del plano de datos, por organización.
--    Convención: dw_<codigo>. La base actual (cresta_dw) queda como PLANO DE
--    CONTROL (metadatos + gobierno) y deja de recibir datos de negocio.
ALTER TABLE gobierno.organizaciones
  ADD COLUMN IF NOT EXISTS base_datos_dw text;

COMMENT ON COLUMN gobierno.organizaciones.base_datos_dw IS
  'Base de datos Postgres donde viven bronce/plata/oro de esta organización. '
  'Aislamiento por tenant: los datos de dos clientes nunca comparten base. '
  'NULL = todavía no aprovisionada.';

-- 2) Ligar cada sociedad a su organización. Sin esto, con dos tenants no se
--    puede saber a qué base de datos escribir ni qué RLS aplicar.
ALTER TABLE gobierno.sociedades
  ADD COLUMN IF NOT EXISTS organizacion_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_sociedad_organizacion'
       AND table_schema = 'gobierno' AND table_name = 'sociedades'
  ) THEN
    ALTER TABLE gobierno.sociedades
      ADD CONSTRAINT fk_sociedad_organizacion FOREIGN KEY (organizacion_id)
      REFERENCES gobierno.organizaciones(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN gobierno.sociedades.organizacion_id IS
  'Organización-cliente (tenant) dueña de la sociedad. Determina la base de datos '
  'destino y el alcance de RLS.';

-- 3) Backfill: las sociedades existentes pertenecen a la única organización previa.
UPDATE gobierno.sociedades s
   SET organizacion_id = (SELECT id FROM gobierno.organizaciones ORDER BY id LIMIT 1)
 WHERE s.organizacion_id IS NULL;

-- 4) Base de datos de la organización existente.
UPDATE gobierno.organizaciones
   SET base_datos_dw = 'dw_' || codigo
 WHERE base_datos_dw IS NULL;

-- 5) Índice para resolver sociedad → organización en cada corrida del extractor.
CREATE INDEX IF NOT EXISTS ix_sociedades_organizacion
  ON gobierno.sociedades (organizacion_id);
