-- Rollback de 90_politica_ingesta.sql
-- plan_ingesta (91) no referencia por FK a politica_ingesta (usa arrays), pero
-- por orden conceptual eliminar primero 91_down.
DROP TABLE IF EXISTS metadatos.politica_ingesta;
