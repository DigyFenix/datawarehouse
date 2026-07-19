-- Rollback de 20_catalogo_estructura.sql
-- (catalogo_metricas referencia catalogo_hechos; eliminar métricas primero — ver 30_down)
DROP TABLE IF EXISTS metadata.catalogo_dimensiones;
DROP TABLE IF EXISTS metadata.catalogo_hechos;
