-- =============================================================================
-- ROLLBACK 126 · Retira los tickets de impersonación
-- =============================================================================
-- Se pierde el historial de quién suplantó a quién en esta tabla; el registro
-- equivalente en `portal.auditoria` (acción `impersonar`) NO se toca.
-- =============================================================================

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS portal.impersonaciones;
