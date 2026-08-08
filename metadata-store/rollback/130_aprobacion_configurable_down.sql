-- =============================================================================
-- ROLLBACK 130 · Vuelve a la aprobación por unanimidad con elegibilidad fija
-- =============================================================================
-- ⚠ Se pierde el quórum configurado por métrica: todas vuelven a exigir que
--   firmen TODOS sus aprobadores. Respaldar antes si hubiera alguno definido:
--     \copy (select clave, firmas_requeridas from metadatos.catalogo_metricas
--            where firmas_requeridas is not null) to 'quorum.csv' csv header
-- =============================================================================

\set ON_ERROR_STOP on

ALTER TABLE metadatos.catalogo_metricas DROP CONSTRAINT IF EXISTS ck_firmas_requeridas;
ALTER TABLE metadatos.catalogo_metricas DROP COLUMN IF EXISTS firmas_requeridas;
ALTER TABLE gobierno.roles DROP COLUMN IF EXISTS puede_aprobar;
