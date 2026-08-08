-- =============================================================================
-- ROLLBACK 124 · Retira el índice único de los roles globales
-- =============================================================================
-- Las filas duplicadas que borró la migración NO se restauran: eran repeticiones
-- exactas y no concedían nada que la fila conservada no conceda.
-- =============================================================================

\set ON_ERROR_STOP on

DROP INDEX IF EXISTS gobierno.ux_usuario_roles_global;
