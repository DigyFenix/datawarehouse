-- =============================================================================
-- 129 · El plano de control se queda con dos roles
-- =============================================================================
-- PROPÓSITO
--   El portal de administración lo usan una o dos personas: el operador del
--   producto y, como mucho, un administrador designado de una organización. Nadie
--   de ventas o tesorería entra aquí — esa gente vive en el portal de su empresa.
--
--   Sin embargo el catálogo arrastraba seis roles del oficio de datos
--   (`data_owner`, `data_steward`, `data_engineer`, `bi_architect`,
--   `usuario_negocio`) que NADIE tenía asignado: cero asignaciones en producción.
--   Eran una lista larga que obligaba a elegir sin que ninguna opción cambiara
--   nada, y sugerían que aquí se configuran los accesos por área.
--
--   **Los accesos por área ya existen y viven donde deben**: los PERFILES del
--   portal de cada organización, con alcance por dominio y por empresa. Duplicarlos
--   aquí daría dos sitios para lo mismo, y el de arriba no serviría porque esos
--   usuarios no entran al portal de administración.
--
--     admin_portal        Administrador de la plataforma  (global: el operador)
--     admin_organizacion  Administrador de organización   (acotado a una empresa)
--
-- OBJETOS AFECTADOS
--   `gobierno.roles`: se crea `admin_organizacion` y se retiran los cuatro roles
--   del oficio de datos más `usuario_negocio`. `usuario_roles` los borra en
--   cascada — pero se comprueba antes que ninguno esté asignado.
--
-- IMPACTO ESTIMADO
--   Ninguna persona pierde acceso: los roles retirados tienen cero asignaciones.
--   Si alguna llegara a tenerla, la migración ABORTA en vez de quitarle el acceso.
--
-- ROLLBACK  →  metadata-store/rollback/129_roles_del_plano_de_control_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Nadie puede quedarse sin acceso por esta migración.
DO $$
DECLARE asignados int;
BEGIN
  SELECT count(*) INTO asignados
    FROM gobierno.usuario_roles ur
    JOIN gobierno.roles r ON r.id = ur.rol_id
   WHERE r.clave IN ('data_owner','data_steward','data_engineer','bi_architect','usuario_negocio');
  IF asignados > 0 THEN
    RAISE EXCEPTION
      'Hay % asignaciones sobre los roles a retirar. Reasígnalas a admin_portal o admin_organizacion antes de aplicar esta migración.',
      asignados;
  END IF;
END $$;

-- 2. El rol acotado que faltaba: administrar UNA organización sin ser operador.
INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('admin_organizacion', 'Administrador de organización',
   'Administra una empresa concreta: sus conexiones, su ingesta y sus indicadores. No ve las demás.')
ON CONFLICT (clave) DO UPDATE
  SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;

UPDATE gobierno.roles SET
  nombre = 'Administrador de la plataforma',
  descripcion = 'Da de alta empresas, configura la ingesta y certifica indicadores. Control total del producto.'
WHERE clave = 'admin_portal';

-- 3. Fuera los del oficio de datos.
DELETE FROM gobierno.roles
 WHERE clave IN ('data_owner','data_steward','data_engineer','bi_architect','usuario_negocio');

DO $$
DECLARE quedan int;
BEGIN
  SELECT count(*) INTO quedan FROM gobierno.roles;
  IF quedan <> 2 THEN
    RAISE EXCEPTION 'Se esperaban 2 roles en el plano de control, hay %', quedan;
  END IF;
  RAISE NOTICE 'Plano de control con dos roles: plataforma y organización';
END $$;
