-- =============================================================================
-- 130 · Quién puede aprobar, y cuántas firmas hacen falta
-- =============================================================================
-- PROPÓSITO
--   La certificación mezclaba dos preguntas distintas y resolvía mal las dos:
--
--   1. ¿QUIÉN puede firmar?  Estaba clavado en el código: el rol `data_owner`.
--      Cambiar quién es elegible exigía tocar y desplegar el API.
--   2. ¿CUÁNTAS firmas?      Exigía UNANIMIDAD, sin alternativa. Si se nombraban
--      tres aprobadores y uno se iba de vacaciones o dejaba la empresa, esa
--      métrica NO SE PODÍA CERTIFICAR NUNCA. No es hipotético: es lo que pasa en
--      cualquier organización real en cuanto alguien se ausenta.
--
--   Ahora cada una tiene su propio control:
--
--     roles.puede_aprobar                 → qué roles habilitan a firmar
--     catalogo_metricas.firmas_requeridas → cuántas de las nombradas bastan
--
-- OBJETOS AFECTADOS
--   `gobierno.roles`            + columna `puede_aprobar` (default false)
--   `metadatos.catalogo_metricas` + columna `firmas_requeridas` (NULL = todas)
--
-- IMPACTO ESTIMADO
--   Dos columnas nuevas. Nada cambia de comportamiento hasta que se configuren:
--   `firmas_requeridas` en NULL conserva la unanimidad que había, y los dos roles
--   de administración se marcan como aprobadores para no dejar el flujo sin nadie.
--
-- DECISIÓN: EL RECHAZO SIGUE SIENDO UNILATERAL
--   Alcanzar el quórum de aprobaciones certifica, pero UN SOLO rechazo devuelve la
--   versión a borrador aunque otros ya hayan firmado. Es asimétrico a propósito:
--   una objeción fundada sobre cómo se calcula una cifra debe poder parar la
--   definición, y quien la levanta no debería tener que reunir mayoría para
--   hacerse oír.
--
-- ROLLBACK  →  metadata-store/rollback/130_aprobacion_configurable_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

ALTER TABLE gobierno.roles
  ADD COLUMN IF NOT EXISTS puede_aprobar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gobierno.roles.puede_aprobar IS
  'Habilita a quien tenga este rol para firmar la certificación de un indicador.';

-- Sin esto, nadie podría certificar nada al aplicar la migración.
UPDATE gobierno.roles SET puede_aprobar = true
 WHERE clave IN ('admin_portal', 'admin_organizacion');

ALTER TABLE metadatos.catalogo_metricas
  ADD COLUMN IF NOT EXISTS firmas_requeridas smallint;

COMMENT ON COLUMN metadatos.catalogo_metricas.firmas_requeridas IS
  'Cuántas de las firmas nombradas en `aprobadores` bastan para certificar. NULL = todas (unanimidad).';

-- Un quórum mayor que el número de aprobadores sería imposible de alcanzar, y uno
-- de cero certificaría sin que nadie firme.
ALTER TABLE metadatos.catalogo_metricas
  DROP CONSTRAINT IF EXISTS ck_firmas_requeridas;
ALTER TABLE metadatos.catalogo_metricas
  ADD CONSTRAINT ck_firmas_requeridas CHECK (
    firmas_requeridas IS NULL
    OR (firmas_requeridas >= 1 AND firmas_requeridas <= cardinality(aprobadores))
  );

DO $$
DECLARE aprobadores int;
BEGIN
  SELECT count(*) INTO aprobadores FROM gobierno.roles WHERE puede_aprobar;
  IF aprobadores = 0 THEN
    RAISE EXCEPTION 'Ningún rol quedó habilitado para aprobar: nadie podría certificar';
  END IF;
  RAISE NOTICE 'Aprobación configurable: % rol(es) habilitados, quórum por métrica disponible', aprobadores;
END $$;
