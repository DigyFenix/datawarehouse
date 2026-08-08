-- =====================================================================
-- Propósito : Conexiones POR ORGANIZACIÓN (cierre de fuga multi-tenant).
--             `gobierno.conexiones` no tenía organizacion_id: cualquier
--             usuario autenticado del portal admin veía host/puerto/base y
--             secreto_ref de TODOS los tenants. La columna habilita el
--             scoping por membresía (guard @AlcanceOrg + filtro en servicio).
-- Ejecución : sobre la base de control `cresta_dw`.
-- Tablas    : gobierno.conexiones (+ organizacion_id NOT NULL,
--             UNIQUE(organizacion_id, nombre) en vez de UNIQUE(nombre))
-- Impacto   : bajo; backfill derivado de las sociedades que ya apuntan a
--             cada conexión. FALLA A PROPÓSITO si una conexión quedara sin
--             organización o compartida entre dos organizaciones (duplicar
--             la conexión a mano antes de re-aplicar).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/116_conexiones_por_organizacion_down.sql
-- Ref       : CLAUDE.md §12 (secretos por tenant); plan sesión 18 (Fase C1)
-- =====================================================================

-- 1) Columna (nullable durante el backfill).
ALTER TABLE gobierno.conexiones
  ADD COLUMN IF NOT EXISTS organizacion_id bigint REFERENCES gobierno.organizaciones (id) ON DELETE RESTRICT;

-- 2) Backfill: la organización de una conexión es la de las sociedades que la usan.
UPDATE gobierno.conexiones c
   SET organizacion_id = s.organizacion_id
  FROM gobierno.sociedades s
 WHERE s.conexion_id = c.id
   AND c.organizacion_id IS NULL;

-- 3) Guardas de consistencia ANTES del NOT NULL: ni huérfanas ni compartidas.
DO $$
DECLARE
  huerfanas bigint;
  compartidas bigint;
BEGIN
  SELECT count(*) INTO huerfanas
    FROM gobierno.conexiones WHERE organizacion_id IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'Hay % conexiones sin organización (sin sociedades que las usen). '
      'Asignarles organizacion_id a mano o eliminarlas antes de re-aplicar.', huerfanas;
  END IF;

  SELECT count(*) INTO compartidas
    FROM (
      SELECT s.conexion_id
        FROM gobierno.sociedades s
       WHERE s.conexion_id IS NOT NULL
       GROUP BY s.conexion_id
      HAVING count(DISTINCT s.organizacion_id) > 1
    ) x;
  IF compartidas > 0 THEN
    RAISE EXCEPTION
      'Hay % conexiones usadas por sociedades de MÁS DE UNA organización. '
      'Duplicar la conexión por organización antes de re-aplicar.', compartidas;
  END IF;
END $$;

ALTER TABLE gobierno.conexiones
  ALTER COLUMN organizacion_id SET NOT NULL;

-- 4) La unicidad del nombre pasa a ser por organización: dos tenants pueden
--    llamar 'HANA Principal' a su conexión sin chocar.
ALTER TABLE gobierno.conexiones
  DROP CONSTRAINT IF EXISTS conexiones_nombre_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_conexiones_org_nombre'
  ) THEN
    ALTER TABLE gobierno.conexiones
      ADD CONSTRAINT uq_conexiones_org_nombre UNIQUE (organizacion_id, nombre);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_conexiones_organizacion
  ON gobierno.conexiones (organizacion_id);

COMMENT ON COLUMN gobierno.conexiones.organizacion_id IS
  'Organización dueña de la conexión. El portal solo la muestra/edita a usuarios con membresía en esa organización (o rol global).';
