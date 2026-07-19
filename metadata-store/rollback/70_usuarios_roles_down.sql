-- Rollback de 70_usuarios_roles.sql (orden inverso por FKs)
DROP TABLE IF EXISTS gobierno.autorizaciones;
DROP TABLE IF EXISTS gobierno.usuario_roles;
DROP TABLE IF EXISTS gobierno.roles;
DROP TABLE IF EXISTS gobierno.usuarios;
