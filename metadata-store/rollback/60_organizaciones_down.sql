-- Rollback de 60_organizaciones.sql
-- (usuario_roles referencia organizaciones; eliminar 70 antes — ver 70_down)
DROP TABLE IF EXISTS gobierno.organizaciones;
