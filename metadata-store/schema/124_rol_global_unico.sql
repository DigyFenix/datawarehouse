-- =============================================================================
-- 124 · El rol global deja de poder duplicarse
-- =============================================================================
-- PROPÓSITO
--   `usuario_roles` tiene UNIQUE (usuario_id, rol_id, organizacion_id), pero en
--   SQL `NULL <> NULL`: dos filas con la misma pareja usuario+rol y organización
--   NULL no violan la restricción. El resultado es que el rol GLOBAL —justo el de
--   más alcance— se podía asignar una y otra vez, y el portal lo mostraba repetido
--   (visto en Usuarios: «Responsable del dato · Global» dos veces).
--
--   Se limpian los duplicados existentes y se añade un índice único PARCIAL sobre
--   las filas globales, que es lo que la restricción no cubría.
--
-- OBJETOS AFECTADOS
--   `gobierno.usuario_roles` — se borran filas repetidas (se conserva la de menor
--   id, la primera asignación) y se crea `ux_usuario_roles_global`.
--
-- IMPACTO ESTIMADO
--   Sólo elimina duplicados exactos: ninguna persona pierde un rol, porque la fila
--   que queda concede exactamente lo mismo que la que se borra.
--
-- ROLLBACK  →  metadata-store/rollback/124_rol_global_unico_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Duplicados globales: se conserva la asignación más antigua.
DELETE FROM gobierno.usuario_roles ur
 WHERE ur.organizacion_id IS NULL
   AND EXISTS (
     SELECT 1 FROM gobierno.usuario_roles otra
      WHERE otra.organizacion_id IS NULL
        AND otra.usuario_id = ur.usuario_id
        AND otra.rol_id     = ur.rol_id
        AND otra.id         < ur.id
   );

-- 2. Que no vuelva a ocurrir. El UNIQUE de la tabla ya cubre las filas CON
--    organización; este índice parcial cubre las que la tienen nula.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_roles_global
    ON gobierno.usuario_roles (usuario_id, rol_id)
 WHERE organizacion_id IS NULL;

DO $$
DECLARE repetidos int;
BEGIN
  SELECT count(*) INTO repetidos FROM (
    SELECT usuario_id, rol_id FROM gobierno.usuario_roles
     WHERE organizacion_id IS NULL
     GROUP BY usuario_id, rol_id HAVING count(*) > 1
  ) d;
  IF repetidos > 0 THEN
    RAISE EXCEPTION 'Quedan % parejas usuario+rol global duplicadas', repetidos;
  END IF;
  RAISE NOTICE 'Roles globales sin duplicados y protegidos por índice único';
END $$;
