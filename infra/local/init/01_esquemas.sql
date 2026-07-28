-- =====================================================================
-- Propósito : Crear los esquemas del plano de datos (medallion) y de
--             gobierno/metadatos para el tenant Grupo Cresta.
-- Ejecución : automática por Postgres en el PRIMER arranque
--             (docker-entrypoint-initdb.d). Idempotente.
-- Esquemas  : bronce, plata, oro, metadatos, gobierno
-- Nombres   : español, sin mezcla (canónico v2 §1). Bases creadas antes del
--             2026-07-26 se migran con metadata-store/schema/99_renombrar_esquemas_espanol.sql
-- Impacto   : estructura vacía; no crea tablas de negocio.
-- Rollback  : DROP SCHEMA ... CASCADE (ver metadata-store/rollback/).
-- =====================================================================

-- Capas medallion
CREATE SCHEMA IF NOT EXISTS bronce;    -- crudo por ERP (distinto por fuente)
CREATE SCHEMA IF NOT EXISTS plata;     -- canónico + calidad + cuarentena (costura agnóstica)
CREATE SCHEMA IF NOT EXISTS oro;       -- modelo dimensional estrella + métricas materializadas

-- Metadatos y gobierno
CREATE SCHEMA IF NOT EXISTS metadatos; -- catálogo (métricas, hechos, dims, glosario, linaje)
CREATE SCHEMA IF NOT EXISTS gobierno;  -- roles, autorizaciones, RLS, auditoría

COMMENT ON SCHEMA bronce    IS 'Crudo por ERP. Bronce es distinto por fuente. Trazabilidad de origen.';
COMMENT ON SCHEMA plata     IS 'Modelo canónico agnóstico + calidad + cuarentena. Costura agnóstica; no se salta.';
COMMENT ON SCHEMA oro       IS 'Estrella (hecho_/dim_) + métricas materializadas. Consumo y semántica.';
COMMENT ON SCHEMA metadatos IS 'Catálogo de metadatos. El portal escribe; el plano de datos lee.';
COMMENT ON SCHEMA gobierno  IS 'Roles, autorizaciones, RLS y auditoría del tenant.';
