-- =====================================================================
-- Rollback de 113_sociedades_moneda.sql
-- =====================================================================

ALTER TABLE gobierno.sociedades DROP COLUMN IF EXISTS moneda;
