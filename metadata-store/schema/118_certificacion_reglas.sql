-- =====================================================================
-- Propósito : Reglas duras del flujo de certificación en la BD (no solo en
--             el servicio):
--             (1) el default del estado de una versión nueva es 'borrador'
--                 — el DDL decía 'en_revision' mientras el servicio inserta
--                 'borrador': divergencia si alguien inserta por SQL;
--             (2) UNA sola versión 'en_revision' por métrica — certificar
--                 dos versiones en paralelo pisaría la fórmula vigente sin
--                 comparar versiones (índice único parcial).
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : metadatos.metrica_versiones
-- Impacto   : bajo; falla a propósito si HOY existieran dos versiones
--             en_revision de la misma métrica (resolver a mano y re-aplicar).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/118_certificacion_reglas_down.sql
-- Ref       : CLAUDE.md §9 (multi-aprobador, nueva versión + recertificar)
-- =====================================================================

ALTER TABLE metadatos.metrica_versiones
  ALTER COLUMN estado SET DEFAULT 'borrador';

CREATE UNIQUE INDEX IF NOT EXISTS uq_metrica_una_en_revision
  ON metadatos.metrica_versiones (metrica_id)
  WHERE estado = 'en_revision';

COMMENT ON INDEX metadatos.uq_metrica_una_en_revision IS
  'Una métrica solo puede tener UNA versión en revisión a la vez: certificar versiones en paralelo pisaría la fórmula vigente sin control.';
