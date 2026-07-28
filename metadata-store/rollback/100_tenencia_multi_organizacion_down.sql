-- =====================================================================
-- Rollback de 100_tenencia_multi_organizacion.sql
-- Quita la tenencia multi-organización del plano de control.
-- ADVERTENCIA: si ya hay más de una organización con datos, revertir deja el
-- sistema sin forma de saber a qué base escribir. Verificar antes:
--   SELECT count(*) FROM gobierno.organizaciones;   -- debe ser 1
-- No destruye bases de datos de tenants: eso se hace manualmente y a conciencia.
-- =====================================================================

DROP INDEX IF EXISTS gobierno.ix_sociedades_organizacion;

ALTER TABLE gobierno.sociedades
  DROP CONSTRAINT IF EXISTS fk_sociedad_organizacion;

ALTER TABLE gobierno.sociedades
  DROP COLUMN IF EXISTS organizacion_id;

ALTER TABLE gobierno.organizaciones
  DROP COLUMN IF EXISTS base_datos_dw;
