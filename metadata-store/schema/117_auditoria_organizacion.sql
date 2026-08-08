-- =====================================================================
-- Propósito : Auditoría con eje de ORGANIZACIÓN. `gobierno.auditoria` no
--             distinguía tenant: GET /auditoria devolvía el log completo a
--             cualquier usuario. La columna permite filtrar por membresía
--             y paginar por organización.
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : gobierno.auditoria (+ organizacion_id nullable — los eventos
--             globales como login/bootstrap no pertenecen a una organización)
-- Impacto   : bajo; columna nueva sin backfill (la historia previa queda
--             como eventos globales, visibles solo para roles globales).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/117_auditoria_organizacion_down.sql
-- Ref       : plan sesión 18 (Fase C1)
-- =====================================================================

ALTER TABLE gobierno.auditoria
  ADD COLUMN IF NOT EXISTS organizacion_id bigint;

-- Sin FK dura: la auditoría debe sobrevivir al borrado de una organización
-- (la evidencia no se pierde con el objeto auditado — mismo criterio que
-- actor_email desnormalizado).

CREATE INDEX IF NOT EXISTS ix_auditoria_org_fecha
  ON gobierno.auditoria (organizacion_id, ocurrido_en DESC);

COMMENT ON COLUMN gobierno.auditoria.organizacion_id IS
  'Organización afectada por el evento (NULL = evento global: login, bootstrap, catálogos del producto). Sin FK: la evidencia sobrevive al borrado de la organización.';
