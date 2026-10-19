-- =====================================================================
-- Propósito : Mostrar u ocultar la barra inferior de Power BI por tablero.
--             Oculta (default): el visor la recorta porque trae el botón
--             «compartir», que expone el vínculo público. Visible: el usuario
--             navega entre las páginas del reporte con sus flechas (caso de
--             un tablero = reporte completo, como Iron Network).
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.tableros (+ mostrar_barra)
-- Impacto   : bajo; columna nueva con DEFAULT false (todo sigue igual).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/134_tablero_barra_tenant_down.sql
-- =====================================================================

ALTER TABLE portal.tableros
  ADD COLUMN IF NOT EXISTS mostrar_barra boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN portal.tableros.mostrar_barra IS
  'true = el visor muestra la barra de Power BI (flechas de página y botón compartir, que expone el vínculo). false = se recorta.';
