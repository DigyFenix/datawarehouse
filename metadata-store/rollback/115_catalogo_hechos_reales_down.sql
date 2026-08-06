-- =====================================================================
-- ROLLBACK de la migración 115 — devuelve el catálogo de hechos al estado de Fase 0.
--
-- Restaura los dos hechos originales, reapunta las métricas que la 115 movió y retira los
-- hechos del canónico v2.
--
-- OJO: el reapuntado inverso solo puede ser aproximado. La 115 mandó TODAS las métricas de
-- `fct_ventas_facturacion` a `hecho_venta_linea`, y desde entonces pueden haberse creado
-- métricas nuevas directamente sobre `hecho_venta_linea` que nunca vivieron en el hecho
-- fantasma. Este rollback las manda a `fct_ventas_facturacion` junto con las demás: es la
-- única forma de poder borrar el hecho sin violar la FK. Si eso importa, exporte
-- `catalogo_metricas` antes de ejecutarlo.
--
-- El DELETE final falla —y revierte todo— si alguna métrica sigue colgando de un hecho del
-- canónico v2 que este script no reapuntó. Es deliberado: mejor abortar que dejar el
-- catálogo inconsistente.
-- =====================================================================

BEGIN;

INSERT INTO metadatos.catalogo_hechos (clave, nombre_negocio, grano, dominio, descripcion)
VALUES
  ('fct_ventas_facturacion', 'Ventas / Facturación', 'línea de documento', 'ventas',
   'Facturas y notas de crédito a nivel línea. Base de Ventas Brutas, Devoluciones y Ventas Netas.'),
  ('fct_cobros_cxc', 'Cobros / Cuentas por Cobrar', 'línea de documento', 'tesoreria',
   'Documentos de CxC a nivel línea. Base de Saldo Pendiente de Cobro y Aging.')
ON CONFLICT (clave) DO NOTHING;

UPDATE metadatos.catalogo_metricas
   SET hecho_origen  = 'fct_ventas_facturacion',
       actualizado_en = now()
 WHERE hecho_origen IN ('hecho_venta_linea', 'hecho_compra_linea', 'hecho_pedido_linea',
                        'hecho_movimiento_contable', 'metrica_venta_diaria');

UPDATE metadatos.catalogo_metricas
   SET hecho_origen  = 'fct_cobros_cxc',
       actualizado_en = now()
 WHERE hecho_origen IN ('hecho_cartera_cobrar', 'hecho_cartera_pagar',
                        'hecho_cartera_cobrar_diaria', 'hecho_cartera_pagar_diaria',
                        'hecho_pago_recibido', 'hecho_pago_efectuado',
                        'hecho_inventario', 'analisis_producto',
                        'proyeccion_caja_semanal', 'estado_carga');

DELETE FROM metadatos.catalogo_hechos
 WHERE clave IN ('hecho_venta_linea', 'hecho_compra_linea',
                 'hecho_cartera_cobrar', 'hecho_cartera_pagar',
                 'hecho_cartera_cobrar_diaria', 'hecho_cartera_pagar_diaria',
                 'hecho_pago_recibido', 'hecho_pago_efectuado',
                 'hecho_inventario', 'hecho_pedido_linea', 'hecho_movimiento_contable',
                 'analisis_producto', 'metrica_venta_diaria', 'proyeccion_caja_semanal',
                 'estado_carga');

COMMIT;
