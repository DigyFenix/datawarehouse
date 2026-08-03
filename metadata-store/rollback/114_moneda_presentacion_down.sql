-- =====================================================================
-- Rollback de 114_moneda_presentacion.sql
-- =====================================================================

ALTER TABLE gobierno.sociedades DROP COLUMN IF EXISTS moneda_presentacion;
