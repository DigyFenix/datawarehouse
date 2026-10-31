-- =====================================================================
-- Propósito : Pasar a estado EXPLORATORIA las métricas del catálogo que siguen en
--             BORRADOR aunque ya se calculan en Oro y se validaron contra el ERP
--             (ESTADO.md, Fase 7). En borrador el asistente ni las ve; en exploratoria
--             las responde MARCADAS «no certificada», que es exactamente lo que son.
--             La certificación (multi-aprobador) sigue siendo un acto del portal admin:
--             este script no certifica nada.
-- Base      : quilate_control (catálogo global)
-- Tablas    : metadatos.catalogo_metricas (estado)
-- Impacto   : 21 filas; sin efecto en Power BI ni en dbt. Solo cambia qué puede
--             contestar el asistente y cómo lo marca.
-- Rollback  : al final del archivo (vuelve a borrador exactamente las mismas claves).
-- Ref       : CLAUDE.md §7 y §11.2 (exploratoria = marcada y visualmente distinta)
-- =====================================================================

BEGIN;

UPDATE metadatos.catalogo_metricas
   SET estado = 'exploratoria', actualizado_en = now()
 WHERE estado = 'borrador'
   AND clave IN (
     'backlog', 'backlog_vencido',
     'compras_brutas_sin_iva', 'compras_netas_con_iva', 'compras_netas_sin_iva', 'notas_credito_compra',
     'costo_contable', 'gasto_operativo', 'ingresos_contables', 'resultado_contable',
     'costo_de_ventas', 'devoluciones_con_iva', 'margen_perdido_bajo_costo', 'ventas_bajo_costo',
     'ventas_brutas_con_iva', 'ventas_netas_con_iva',
     'pagos_a_proveedores',
     'valor_inventario', 'valor_inventario_ocioso', 'valor_sin_rotacion_comercial', 'venta_en_riesgo_por_quiebre'
   );

COMMIT;

-- ---------------------------------------------------------------- rollback
-- UPDATE metadatos.catalogo_metricas
--    SET estado = 'borrador', actualizado_en = now()
--  WHERE estado = 'exploratoria'
--    AND clave IN ('backlog','backlog_vencido','compras_brutas_sin_iva','compras_netas_con_iva',
--                  'compras_netas_sin_iva','notas_credito_compra','costo_contable','gasto_operativo',
--                  'ingresos_contables','resultado_contable','costo_de_ventas','devoluciones_con_iva',
--                  'margen_perdido_bajo_costo','ventas_bajo_costo','ventas_brutas_con_iva',
--                  'ventas_netas_con_iva','pagos_a_proveedores','valor_inventario',
--                  'valor_inventario_ocioso','valor_sin_rotacion_comercial','venta_en_riesgo_por_quiebre');
