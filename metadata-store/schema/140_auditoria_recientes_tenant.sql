-- =====================================================================
-- Propósito : Índice para «Seguir donde quedaste» en Inicio del portal de
--             usuario: los últimos tableros que abrió cada usuario salen de
--             su propia auditoría (accion = 'ver_tablero'), ordenados por
--             fecha. Sin índice, cada carga de Inicio recorre toda la
--             auditoría del tenant, que crece con cada apertura de tablero.
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.auditoria (+ índice parcial)
-- Impacto   : bajo; índice parcial solo sobre las filas ver_tablero.
--             CREATE INDEX toma un lock de escritura breve sobre la tabla.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/140_auditoria_recientes_tenant_down.sql
-- Ref       : docs/auditoria-2026-10-31.md §3 (recientes)
-- =====================================================================

CREATE INDEX IF NOT EXISTS ix_portal_auditoria_ver_tablero
  ON portal.auditoria (usuario_id, ocurrido_en DESC)
  WHERE accion = 'ver_tablero';
