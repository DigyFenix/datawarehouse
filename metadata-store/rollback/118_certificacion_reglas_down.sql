-- =====================================================================
-- Rollback de 118_certificacion_reglas.sql
-- Restaura el default previo ('en_revision', el original de 40_certificacion)
-- y elimina el índice de exclusividad.
-- =====================================================================

DROP INDEX IF EXISTS metadatos.uq_metrica_una_en_revision;

ALTER TABLE metadatos.metrica_versiones
  ALTER COLUMN estado SET DEFAULT 'en_revision';
