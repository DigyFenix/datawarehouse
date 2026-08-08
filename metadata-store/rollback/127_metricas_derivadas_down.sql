-- =============================================================================
-- ROLLBACK 127 · Retira las métricas derivadas del tenant
-- =============================================================================
-- ⚠ DESTRUCTIVO: elimina los indicadores que haya compuesto la organización. Las
--   métricas base del catálogo del producto no se ven afectadas.
--   Respaldar antes:
--     \copy portal.metricas_derivadas to 'derivadas_<tenant>.csv' csv header
-- =============================================================================

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS portal.metricas_derivadas;
