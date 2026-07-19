-- =====================================================================
-- Propósito : Crear los esquemas del plano de datos (medallion) y de
--             gobierno/metadatos para el tenant Grupo Cresta.
-- Ejecución : automática por Postgres en el PRIMER arranque
--             (docker-entrypoint-initdb.d). Idempotente.
-- Esquemas  : bronze, silver, gold, metadata, gobierno
-- Impacto   : estructura vacía; no crea tablas de negocio.
-- Rollback  : DROP SCHEMA ... CASCADE (ver 99_rollback en metadata-store).
-- =====================================================================

-- Capas medallion
CREATE SCHEMA IF NOT EXISTS bronze;   -- crudo por ERP (distinto por fuente)
CREATE SCHEMA IF NOT EXISTS silver;   -- canónico + calidad + cuarentena (costura agnóstica)
CREATE SCHEMA IF NOT EXISTS gold;     -- modelo dimensional estrella + métricas materializadas

-- Metadatos y gobierno
CREATE SCHEMA IF NOT EXISTS metadata; -- catálogo (métricas, hechos, dims, glosario, linaje)
CREATE SCHEMA IF NOT EXISTS gobierno; -- roles, autorizaciones, RLS, auditoría

COMMENT ON SCHEMA bronze   IS 'Crudo por ERP. Bronze es distinto por fuente. Trazabilidad de origen.';
COMMENT ON SCHEMA silver   IS 'Modelo canónico agnóstico + calidad + cuarentena. Costura agnóstica; no se salta.';
COMMENT ON SCHEMA gold     IS 'Estrella (fct_/dim_) + métricas materializadas. Consumo y semántica.';
COMMENT ON SCHEMA metadata IS 'Catálogo de metadatos. El portal escribe; el plano de datos lee.';
COMMENT ON SCHEMA gobierno IS 'Roles, autorizaciones, RLS y auditoría del tenant.';
