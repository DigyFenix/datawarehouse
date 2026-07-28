-- =====================================================================
-- Propósito : Exigir que toda sociedad pertenezca a una organización.
-- Motivo    : `organizacion_id` se agregó nullable (migración 100) y el portal
--             creaba sociedades sin asignarla. Una sociedad huérfana es inútil y
--             peligrosa: el worker resuelve la organización (y la base del tenant)
--             a partir de la sociedad, así que con NULL la extracción falla o —peor—
--             quedaría sin base destino definida.
-- Tablas    : gobierno.sociedades (organizacion_id → NOT NULL)
-- Impacto   : BAJO. Backfill de huérfanas a la organización más antigua antes de
--             exigir la restricción; no borra filas.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/105_sociedad_organizacion_obligatoria_down.sql
-- Nota      : `empresa_id` sigue siendo UNIQUE GLOBAL a propósito: el worker
--             identifica la sociedad por empresa_id (sin organización) y es la
--             etiqueta de trazabilidad en Bronce. Si algún día dos tenants necesitan
--             el mismo empresa_id, hay que cambiar antes esa resolución en el worker.
-- Ref       : migración 100 (tenencia), catalogo.py::resolver_origen
-- =====================================================================

-- Backfill de huérfanas (no debería haber; si hay, van a la organización más antigua).
UPDATE gobierno.sociedades
   SET organizacion_id = (SELECT id FROM gobierno.organizaciones ORDER BY id LIMIT 1)
 WHERE organizacion_id IS NULL;

-- Falla explícitamente si no hay ninguna organización a la que asignarlas.
DO $$
DECLARE huerfanas int;
BEGIN
  SELECT count(*) INTO huerfanas FROM gobierno.sociedades WHERE organizacion_id IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION 'Hay % sociedad(es) sin organización y ninguna organización registrada. '
                    'Crea la organización y asígnalas antes de correr esta migración.', huerfanas;
  END IF;
END $$;

ALTER TABLE gobierno.sociedades
  ALTER COLUMN organizacion_id SET NOT NULL;

COMMENT ON COLUMN gobierno.sociedades.organizacion_id IS
  'Organización dueña de la sociedad. Obligatoria: determina el ERP, la configuración '
  'de ingesta aplicable y la base del tenant donde aterrizan sus datos.';
