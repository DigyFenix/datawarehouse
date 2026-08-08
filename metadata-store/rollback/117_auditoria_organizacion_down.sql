-- =====================================================================
-- Rollback de 117_auditoria_organizacion.sql
-- =====================================================================

DROP INDEX IF EXISTS gobierno.ix_auditoria_org_fecha;

ALTER TABLE gobierno.auditoria
  DROP COLUMN IF EXISTS organizacion_id;
