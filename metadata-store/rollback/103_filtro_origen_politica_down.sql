-- =====================================================================
-- Rollback de 103_filtro_origen_politica.sql
-- ADVERTENCIA: los objetos que dependan de `filtro_origen` para acotar el volumen
-- (p.ej. la cartera de SAP B1) pasarán a extraer el mayor completo. Verificar antes:
--   SELECT objeto, filtro_origen FROM metadatos.politica_ingesta WHERE filtro_origen IS NOT NULL;
-- =====================================================================

ALTER TABLE metadatos.politica_ingesta
  DROP CONSTRAINT IF EXISTS ck_politica_filtro_origen_seguro;

ALTER TABLE metadatos.politica_ingesta
  DROP COLUMN IF EXISTS filtro_origen;
