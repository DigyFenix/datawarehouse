-- =====================================================================
-- Rollback de 116_conexiones_por_organizacion.sql
-- Restaura UNIQUE(nombre) global y elimina organizacion_id.
-- OJO: falla si dos organizaciones tienen conexiones homónimas — renombrar
-- antes de revertir.
-- =====================================================================

ALTER TABLE gobierno.conexiones
  DROP CONSTRAINT IF EXISTS uq_conexiones_org_nombre;

DROP INDEX IF EXISTS gobierno.ix_conexiones_organizacion;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conexiones_nombre_key'
  ) THEN
    ALTER TABLE gobierno.conexiones
      ADD CONSTRAINT conexiones_nombre_key UNIQUE (nombre);
  END IF;
END $$;

ALTER TABLE gobierno.conexiones
  DROP COLUMN IF EXISTS organizacion_id;
