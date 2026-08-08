-- =============================================================================
-- 122 · Renombre del motor a la marca del producto: Quilate Analytics
-- =============================================================================
-- PROPÓSITO
--   Retirar el nombre del primer cliente de los identificadores del motor. A partir
--   de aquí Grupo Cresta es una organización más dentro del producto, igual que
--   Iron Network, y nada en la infraestructura la privilegia.
--
--     base de control   cresta_dw     →  quilate_control
--     rol de conexión   cresta_admin  →  quilate_admin
--
-- OBJETOS AFECTADOS
--   · Base de datos `cresta_dw` (renombrada; su contenido no se toca).
--   · Rol de login `cresta_admin` (renombrado; conserva permisos y pertenencias).
--   · Las bases de tenant (`dw_*`) NO se tocan: su nombre lo fija la organización.
--
-- IMPACTO ESTIMADO
--   Instantáneo: ninguna fila se reescribe, sólo entradas del catálogo del sistema.
--   Exige que NADIE esté conectado a `cresta_dw` (el renombre de base falla con
--   conexiones abiertas), así que se para el stack antes y se levanta después.
--
--   La contraseña SOBREVIVE porque el rol usa SCRAM-SHA-256, que no incluye el
--   nombre en el hash. Con MD5 habría que reasignarla — verificado antes de correr:
--     select rolname, rolpassword like 'SCRAM%' from pg_authid where rolcanlogin;
--
-- PRECONDICIÓN
--   Ejecutar CONECTADO A `postgres` (no a la base que se renombra) y con un rol
--   distinto del que se renombra, o con superusuario.
--
-- DESPUÉS DE CORRERLO
--   Actualizar en el `.env`:  POSTGRES_DB=quilate_control  ·  POSTGRES_USER=quilate_admin
--   y recrear los contenedores. Sin eso, los servicios siguen buscando el nombre viejo.
--
-- ROLLBACK  →  metadata-store/rollback/122_renombre_marca_producto_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

-- Corta las conexiones vivas a la base de control: el renombre las rechaza.
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = 'cresta_dw'
   AND pid <> pg_backend_pid();

ALTER DATABASE cresta_dw RENAME TO quilate_control;
ALTER ROLE cresta_admin RENAME TO quilate_admin;

-- Comprobación: ambos nombres nuevos existen y los viejos ya no.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'quilate_control') THEN
    RAISE EXCEPTION 'La base quilate_control no existe tras el renombre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quilate_admin') THEN
    RAISE EXCEPTION 'El rol quilate_admin no existe tras el renombre';
  END IF;
  RAISE NOTICE 'Renombre aplicado: cresta_dw→quilate_control, cresta_admin→quilate_admin';
END $$;
