-- =============================================================================
-- ROLLBACK 122 · Vuelve la base y el rol a sus nombres anteriores
-- =============================================================================
-- PROPÓSITO
--   Deshacer el renombre de marca si algo del stack no arranca con los nombres
--   nuevos. Simétrico y sin pérdida: el renombre no reescribe datos.
--
--     quilate_control  →  cresta_dw
--     quilate_admin    →  cresta_admin
--
-- PRECONDICIÓN
--   Conectado a `postgres`, con un rol distinto del que se renombra.
--
-- DESPUÉS
--   Revertir también el `.env` (POSTGRES_DB / POSTGRES_USER) y recrear los
--   contenedores; si no, los servicios seguirán buscando los nombres nuevos.
-- =============================================================================

\set ON_ERROR_STOP on

SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = 'quilate_control'
   AND pid <> pg_backend_pid();

ALTER DATABASE quilate_control RENAME TO cresta_dw;
ALTER ROLE quilate_admin RENAME TO cresta_admin;
