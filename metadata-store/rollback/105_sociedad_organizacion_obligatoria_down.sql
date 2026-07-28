-- =====================================================================
-- Rollback de 105_sociedad_organizacion_obligatoria.sql
-- Vuelve `organizacion_id` a nullable. No revierte el backfill: las sociedades
-- que se asignaron a una organización conservan esa asignación (revertirlo las
-- dejaría huérfanas otra vez, que es justo lo que la migración corrige).
-- Impacto   : BAJO. Solo relaja la restricción.
-- =====================================================================

ALTER TABLE gobierno.sociedades
  ALTER COLUMN organizacion_id DROP NOT NULL;
