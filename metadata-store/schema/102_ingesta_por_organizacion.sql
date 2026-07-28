-- =====================================================================
-- Propósito : Hacer la configuración de INGESTA propia de cada organización.
-- Motivo    : el diseño anterior asumía un solo ERP por instalación. Con dos
--             tenants en el mismo portal eso se rompe: el objeto 'clientes' sale
--             de OCRD en SAP B1 y de res_partner en Odoo, con campos, estrategia
--             y filtros distintos. `politica_ingesta.objeto` era UNIQUE global,
--             así que la segunda organización no podía registrar sus objetos.
-- Tablas    : metadatos.politica_ingesta (+ organizacion_id, UNIQUE nueva)
--             metadatos.campo_ingesta    (+ organizacion_id, UNIQUE nueva)
-- Impacto   : MEDIO. Cambia claves únicas. Las filas existentes se asignan a la
--             primera organización (la única que había).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/102_ingesta_por_organizacion_down.sql
-- Ref       : migración 100 (tenencia), DISENO-plata-oro.md §5
-- =====================================================================

-- ---------------------------------------------------------------- política
ALTER TABLE metadatos.politica_ingesta
  ADD COLUMN IF NOT EXISTS organizacion_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_politica_organizacion'
       AND table_schema = 'metadatos' AND table_name = 'politica_ingesta'
  ) THEN
    ALTER TABLE metadatos.politica_ingesta
      ADD CONSTRAINT fk_politica_organizacion FOREIGN KEY (organizacion_id)
      REFERENCES gobierno.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill antes de exigir la nueva unicidad.
UPDATE metadatos.politica_ingesta
   SET organizacion_id = (SELECT id FROM gobierno.organizaciones ORDER BY id LIMIT 1)
 WHERE organizacion_id IS NULL;

-- La unicidad pasa a ser (organización, objeto).
ALTER TABLE metadatos.politica_ingesta
  DROP CONSTRAINT IF EXISTS politica_ingesta_objeto_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_politica_org_objeto'
  ) THEN
    ALTER TABLE metadatos.politica_ingesta
      ADD CONSTRAINT uq_politica_org_objeto UNIQUE (organizacion_id, objeto);
  END IF;
END $$;

COMMENT ON COLUMN metadatos.politica_ingesta.organizacion_id IS
  'Organización dueña de la política. El mismo objeto canónico (p.ej. clientes) tiene '
  'fuente y estrategia distintas según el ERP del tenant.';

-- ---------------------------------------------------------------- campos
ALTER TABLE metadatos.campo_ingesta
  ADD COLUMN IF NOT EXISTS organizacion_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_campo_organizacion'
       AND table_schema = 'metadatos' AND table_name = 'campo_ingesta'
  ) THEN
    ALTER TABLE metadatos.campo_ingesta
      ADD CONSTRAINT fk_campo_organizacion FOREIGN KEY (organizacion_id)
      REFERENCES gobierno.organizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE metadatos.campo_ingesta
   SET organizacion_id = (SELECT id FROM gobierno.organizaciones ORDER BY id LIMIT 1)
 WHERE organizacion_id IS NULL;

ALTER TABLE metadatos.campo_ingesta
  DROP CONSTRAINT IF EXISTS uq_campo;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_campo_org'
  ) THEN
    ALTER TABLE metadatos.campo_ingesta
      ADD CONSTRAINT uq_campo_org
      UNIQUE (organizacion_id, objeto, tabla_origen, campo_origen);
  END IF;
END $$;

COMMENT ON COLUMN metadatos.campo_ingesta.organizacion_id IS
  'Organización dueña del mapeo. Las columnas de origen son propias de cada ERP.';

CREATE INDEX IF NOT EXISTS ix_politica_organizacion
  ON metadatos.politica_ingesta (organizacion_id);
CREATE INDEX IF NOT EXISTS ix_campo_organizacion
  ON metadatos.campo_ingesta (organizacion_id, objeto);
