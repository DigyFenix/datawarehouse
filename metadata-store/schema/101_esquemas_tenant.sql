-- =====================================================================
-- Propósito : Crear las capas medallion DENTRO de la base de datos de un
--             tenant. Se ejecuta una vez por cada base `dw_<codigo>`.
-- Ejecución : psql -d dw_<codigo> -f 101_esquemas_tenant.sql
--             (NO se ejecuta sobre la base de control `cresta_dw`)
-- Esquemas  : bronce, plata, oro
-- Nota      : `metadatos` y `gobierno` NO se replican por tenant: viven una sola
--             vez en la base de control, porque el portal administra a todas las
--             organizaciones desde un solo lugar. Lo que se aísla son los DATOS.
-- Impacto   : estructura vacía.
-- Rollback  : DROP SCHEMA bronce, plata, oro CASCADE;  (destruye datos del tenant)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS bronce;
CREATE SCHEMA IF NOT EXISTS plata;
CREATE SCHEMA IF NOT EXISTS oro;

COMMENT ON SCHEMA bronce IS 'Crudo por ERP de este tenant. Trazabilidad de origen.';
COMMENT ON SCHEMA plata  IS 'Modelo canónico agnóstico + calidad + cuarentena. Costura agnóstica.';
COMMENT ON SCHEMA oro    IS 'Estrella (hecho_/dim_) + métricas materializadas.';
