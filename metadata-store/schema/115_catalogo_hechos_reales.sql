-- =====================================================================
-- Migración 115 — el catálogo de hechos apunta a los modelos que existen de verdad.
--
-- PROBLEMA QUE RESUELVE
-- `metadatos.catalogo_hechos` traía solo `fct_ventas_facturacion` y `fct_cobros_cxc`,
-- nomenclatura de la Fase 0 que nunca llegó a materializarse: los modelos reales son
-- `hecho_venta_linea`, `hecho_cartera_cobrar`, etc. Como `catalogo_metricas.hecho_origen`
-- es FK a esa tabla, el efecto práctico era que el portal NO PODÍA registrar una métrica
-- sobre ningún hecho real — el desplegable de `GET /api/hechos` solo ofrecía las dos claves
-- fantasma. El catálogo de gobierno describía un warehouse que no existe.
--
-- QUÉ HACE
--   1. Inserta los 15 hechos reales del canónico v2 (idempotente).
--   2. Reapunta las 5 métricas v1 al hecho real equivalente, para no perder su historia de
--      versiones ni sus aprobaciones (la FK impide borrar el hecho mientras alguien lo use).
--   3. Retira los dos hechos fantasma.
--
-- Las métricas v1 se conservan a propósito: sus claves (`ventas_brutas`, `ventas_netas`…)
-- son las que se sembraron el día uno y pueden tener versiones o votos de certificación
-- asociados. Quedan como sinónimos históricos de las claves del canónico v2
-- (`ventas_brutas_sin_iva`, `ventas_netas_sin_iva`…), que son las que emite
-- `oro.metrica_valor`. Depurarlas es decisión del Data Owner en el portal, no de una
-- migración.
--
-- TABLAS AFECTADAS: metadatos.catalogo_hechos (INSERT/DELETE),
--                   metadatos.catalogo_metricas (UPDATE de hecho_origen).
-- IMPACTO: bajo. Solo metadatos de gobierno; no toca datos del warehouse ni el pipeline.
-- ROLLBACK: rollback/115_catalogo_hechos_reales_down.sql
-- =====================================================================

BEGIN;

-- 1) Los hechos que dbt materializa de verdad en el esquema `oro`.
INSERT INTO metadatos.catalogo_hechos (clave, nombre_negocio, grano, dominio, descripcion, tabla_oro)
VALUES
  ('hecho_venta_linea', 'Ventas / Facturación', 'línea de documento', 'ventas',
   'Facturas y notas de crédito de venta a nivel línea, con costo y margen (SAP; en Odoo el costo de línea no existe).',
   'oro.hecho_venta_linea'),
  ('hecho_compra_linea', 'Compras', 'línea de documento', 'compras',
   'Facturas y notas de crédito de compra a nivel línea.',
   'oro.hecho_compra_linea'),
  ('hecho_cartera_cobrar', 'Cartera por Cobrar', 'partida abierta del mayor', 'tesoreria',
   'Saldo por cobrar vivo desde el mayor contable, no desde la factura. Foto a la fecha de corte.',
   'oro.hecho_cartera_cobrar'),
  ('hecho_cartera_pagar', 'Cartera por Pagar', 'partida abierta del mayor', 'tesoreria',
   'Saldo por pagar vivo desde el mayor contable, expuesto en positivo.',
   'oro.hecho_cartera_pagar'),
  ('hecho_cartera_cobrar_diaria', 'Cartera por Cobrar (histórico)', 'partida × fecha de corte', 'tesoreria',
   'Foto diaria acumulada: única fuente de evolución de la cartera.',
   'oro.hecho_cartera_cobrar_diaria'),
  ('hecho_cartera_pagar_diaria', 'Cartera por Pagar (histórico)', 'partida × fecha de corte', 'tesoreria',
   'Foto diaria acumulada de la cartera por pagar.',
   'oro.hecho_cartera_pagar_diaria'),
  ('hecho_pago_recibido', 'Pagos Recibidos', 'documento de pago', 'tesoreria',
   'Cobros. `contraparte` separa la cobranza de clientes de la tesorería contra cuenta contable.',
   'oro.hecho_pago_recibido'),
  ('hecho_pago_efectuado', 'Pagos Efectuados', 'documento de pago', 'tesoreria',
   'Pagos a proveedores y salidas de tesorería, con la misma separación por contraparte.',
   'oro.hecho_pago_efectuado'),
  ('hecho_inventario', 'Inventario', 'empresa × almacén × producto', 'inventario',
   'Existencia y valor contable a la fecha de corte. Foto sin historia.',
   'oro.hecho_inventario'),
  ('hecho_pedido_linea', 'Pedidos de Venta', 'línea de pedido', 'ventas',
   'Compromiso con el cliente antes de facturarlo. Base del backlog y el cumplimiento de entrega.',
   'oro.hecho_pedido_linea'),
  ('hecho_movimiento_contable', 'Movimientos Contables', 'partida del mayor (solo resultados)', 'rentabilidad',
   'Mayor restringido a cuentas de resultados; `monto_resultado` viene volteado a la naturaleza de la cuenta.',
   'oro.hecho_movimiento_contable'),
  ('analisis_producto', 'Análisis de Producto', 'empresa × producto', 'inventario',
   'Cruce de demanda contra existencia: ocioso, quiebre, cobertura y clase ABC de producto.',
   'oro.analisis_producto'),
  ('metrica_venta_diaria', 'Venta Diaria', 'empresa × día', 'ventas',
   'Serie densa sin huecos. Base de tendencias y ritmo por día hábil.',
   'oro.metrica_venta_diaria'),
  ('proyeccion_caja_semanal', 'Proyección de Caja', 'empresa × flujo × semana ISO', 'tesoreria',
   'Entradas y salidas contractuales por semana de vencimiento.',
   'oro.proyeccion_caja_semanal'),
  ('estado_carga', 'Estado de Carga', 'empresa × dominio', 'gobierno',
   'Frescura del dato: cuándo corrió la extracción y hasta qué fecha llega la operación.',
   'oro.estado_carga')
ON CONFLICT (clave) DO NOTHING;

-- 2) Las métricas v1 pasan a colgar del hecho real equivalente.
UPDATE metadatos.catalogo_metricas
   SET hecho_origen  = 'hecho_venta_linea',
       actualizado_en = now()
 WHERE hecho_origen = 'fct_ventas_facturacion';

UPDATE metadatos.catalogo_metricas
   SET hecho_origen  = 'hecho_cartera_cobrar',
       actualizado_en = now()
 WHERE hecho_origen = 'fct_cobros_cxc';

-- 3) Fuera los fantasma. La FK ya no los referencia: si algo quedó apuntando a ellos, el
--    DELETE falla y la transacción entera se revierte — que es el comportamiento correcto.
DELETE FROM metadatos.catalogo_hechos
 WHERE clave IN ('fct_ventas_facturacion', 'fct_cobros_cxc');

COMMIT;
