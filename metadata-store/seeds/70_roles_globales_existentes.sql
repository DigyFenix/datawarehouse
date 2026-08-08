-- =====================================================================
-- Seed de COMPATIBILIDAD (una sola vez, tras la migración 116/117 y el
-- enforcement usuario-organización): asigna el rol `admin_portal` con
-- alcance GLOBAL (organizacion_id NULL) a todos los usuarios ACTIVOS
-- existentes del portal admin.
--
-- Por qué: hasta hoy el portal no distinguía membresías — todos los
-- usuarios existentes son operadores del proveedor (Grupo Cresta como
-- operador del producto) y perderían acceso el día del deploy del
-- enforcement. Después de aplicar, RECORTAR a mano desde la pantalla de
-- usuarios los que no deban ser globales.
--
-- Idempotente vía NOT EXISTS (el UNIQUE de usuario_roles no dispara ON
-- CONFLICT con organizacion_id NULL: Postgres trata los NULL como
-- distintos). En una instalación limpia no hace nada (0 usuarios).
-- =====================================================================

INSERT INTO gobierno.usuario_roles (usuario_id, rol_id, organizacion_id)
SELECT u.id, r.id, NULL
  FROM gobierno.usuarios u
 CROSS JOIN gobierno.roles r
 WHERE u.activo
   AND r.clave = 'admin_portal'
   AND NOT EXISTS (
     SELECT 1 FROM gobierno.usuario_roles ur
      WHERE ur.usuario_id = u.id AND ur.rol_id = r.id AND ur.organizacion_id IS NULL
   );
