-- =====================================================================
-- Rollback de 98_politica_modelos_dbt.sql
-- Quita la columna de selección dbt de la política de ingesta.
-- Impacto: se pierde la configuración de qué modelos dbt corre cada objeto.
-- =====================================================================

ALTER TABLE metadatos.politica_ingesta
  DROP COLUMN IF EXISTS modelos_dbt;
