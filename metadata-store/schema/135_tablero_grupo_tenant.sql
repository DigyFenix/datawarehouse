-- =====================================================================
-- Propósito : Agrupar los tableros del portal de usuario por familia
--             (Ventas, Clientes, Inventario, Finanzas…), como Kraken 360.
--             Permite publicar un tablero por HOJA del reporte (URL con
--             &pageName=) y navegar entre las hojas del mismo grupo desde
--             el portal, sin la barra de Power BI (que trae el botón
--             «abrir en otra ventana» y expone el vínculo público).
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.tableros (+ grupo)
-- Impacto   : bajo; columna nueva NULL (sin grupo = se lista como hasta hoy).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/135_tablero_grupo_tenant_down.sql
-- =====================================================================

ALTER TABLE portal.tableros
  ADD COLUMN IF NOT EXISTS grupo text;

COMMENT ON COLUMN portal.tableros.grupo IS
  'Familia del tablero en el portal (Ventas, Clientes, Inventario, Finanzas…). NULL = sin agrupar. Los tableros del mismo grupo se navegan como pestañas en el visor.';
