-- =====================================================================
-- Propósito : Agregar la selección dbt gobernada a la política de ingesta,
--             para que la transformación (Bronze→Silver→Gold) se dispare
--             desde el portal por objeto. Migración forward idempotente
--             (aplica a BD ya inicializadas; en instalaciones nuevas la
--             columna ya viene en 90_politica_ingesta.sql).
-- Tablas    : metadatos.politica_ingesta (ADD COLUMN modelos_dbt)
-- Impacto   : bajo; columna nueva NULLable, sin backfill.
-- Rollback  : metadata-store/rollback/98_politica_modelos_dbt_down.sql
-- Ref       : CLAUDE.md §13 (migraciones versionadas + rollback)
-- =====================================================================

ALTER TABLE metadatos.politica_ingesta
  ADD COLUMN IF NOT EXISTS modelos_dbt text;

COMMENT ON COLUMN metadatos.politica_ingesta.modelos_dbt IS
  'Selección dbt (--select) que transforma este objeto Bronze→Silver→Gold. Admite operadores de grafo (ej. silver_socio_negocio+). El portal la gobierna; el worker corre dbt build con ella. NULL = sin transformación disparable.';
