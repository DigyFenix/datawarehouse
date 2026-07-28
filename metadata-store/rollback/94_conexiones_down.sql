-- Rollback de 94_conexiones.sql
-- sociedades (95) referencia conexiones por FK; eliminar 95 antes (ver 95_down).
DROP TABLE IF EXISTS gobierno.conexiones;
