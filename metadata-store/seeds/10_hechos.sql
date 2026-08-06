-- =====================================================================
-- Seed: catálogo de hechos del canónico v2 (§7, §8).
--
-- REESCRITO 2026-08-06. La versión anterior sembraba `fct_ventas_facturacion` y
-- `fct_cobros_cxc`, nombres de la Fase 0 que NUNCA llegaron a existir como modelo dbt.
-- Como `catalogo_metricas.hecho_origen` es FK a esta tabla, el portal era incapaz de
-- registrar una métrica sobre un hecho real: el desplegable solo ofrecía dos claves
-- fantasma. Esto siembra los hechos que de verdad materializa dbt en el esquema `oro`.
--
-- Las bases YA instaladas se corrigen con la migración 115 (que reapunta las métricas
-- existentes y retira los dos fantasma); este seed cubre las instalaciones nuevas.
--
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadatos.catalogo_hechos (clave, nombre_negocio, grano, dominio, descripcion, tabla_oro)
VALUES
  ('hecho_venta_linea', 'Ventas / Facturación', 'línea de documento', 'ventas',
   'Facturas y notas de crédito de venta a nivel línea, con costo y margen (SAP; en Odoo el costo de línea no existe). Base de las métricas de venta y rentabilidad comercial.',
   'oro.hecho_venta_linea'),

  ('hecho_compra_linea', 'Compras', 'línea de documento', 'compras',
   'Facturas y notas de crédito de compra a nivel línea. Base de las métricas de compra y del precio pagado por insumo.',
   'oro.hecho_compra_linea'),

  ('hecho_cartera_cobrar', 'Cartera por Cobrar', 'partida abierta del mayor', 'tesoreria',
   'Saldo por cobrar vivo, tomado del mayor contable y no de la factura. Foto a la fecha de corte: es un stock, no un flujo.',
   'oro.hecho_cartera_cobrar'),

  ('hecho_cartera_pagar', 'Cartera por Pagar', 'partida abierta del mayor', 'tesoreria',
   'Saldo por pagar vivo desde el mayor contable, expuesto en positivo para poder compararlo con la cartera por cobrar.',
   'oro.hecho_cartera_pagar'),

  ('hecho_cartera_cobrar_diaria', 'Cartera por Cobrar (histórico)', 'partida × fecha de corte', 'tesoreria',
   'Foto diaria acumulada de la cartera por cobrar. Única fuente de evolución: los hechos de cartera son el saldo de hoy y no guardan historia.',
   'oro.hecho_cartera_cobrar_diaria'),

  ('hecho_cartera_pagar_diaria', 'Cartera por Pagar (histórico)', 'partida × fecha de corte', 'tesoreria',
   'Foto diaria acumulada de la cartera por pagar.',
   'oro.hecho_cartera_pagar_diaria'),

  ('hecho_pago_recibido', 'Pagos Recibidos', 'documento de pago', 'tesoreria',
   'Cobros. La columna `contraparte` separa la cobranza real de clientes de las operaciones de tesorería contra cuenta contable; sin ese filtro la cobranza se triplica.',
   'oro.hecho_pago_recibido'),

  ('hecho_pago_efectuado', 'Pagos Efectuados', 'documento de pago', 'tesoreria',
   'Pagos a proveedores y movimientos de tesorería de salida, con la misma separación por contraparte.',
   'oro.hecho_pago_efectuado'),

  ('hecho_inventario', 'Inventario', 'empresa × almacén × producto', 'inventario',
   'Existencia y valor contable a la fecha de corte. Es una foto: no guarda historia, así que la rotación compara el costo de 12 meses contra el stock actual.',
   'oro.hecho_inventario'),

  ('hecho_pedido_linea', 'Pedidos de Venta', 'línea de pedido', 'ventas',
   'Compromiso con el cliente antes de facturarlo. Base del backlog, el fill rate y el cumplimiento de fecha de entrega.',
   'oro.hecho_pedido_linea'),

  ('hecho_movimiento_contable', 'Movimientos Contables', 'partida del mayor (solo resultados)', 'rentabilidad',
   'Mayor contable restringido a cuentas de resultados. `monto_resultado` viene volteado a la naturaleza de la cuenta para poder sumarlo sin pensar en signos.',
   'oro.hecho_movimiento_contable'),

  ('analisis_producto', 'Análisis de Producto', 'empresa × producto', 'inventario',
   'Ficha que cruza demanda contra existencia: inventario ocioso, quiebre de stock, cobertura y clase ABC de producto.',
   'oro.analisis_producto'),

  ('metrica_venta_diaria', 'Venta Diaria', 'empresa × día', 'ventas',
   'Serie densa sin huecos (un día sin venta vale cero). Base de tendencias, medias móviles y ritmo por día hábil.',
   'oro.metrica_venta_diaria'),

  ('proyeccion_caja_semanal', 'Proyección de Caja', 'empresa × flujo × semana ISO', 'tesoreria',
   'Entradas y salidas contractuales por semana de vencimiento, con lo ya vencido anclado al corte.',
   'oro.proyeccion_caja_semanal'),

  ('estado_carga', 'Estado de Carga', 'empresa × dominio', 'gobierno',
   'Frescura del dato: cuándo corrió la extracción y hasta qué fecha llega la operación. Son dos relojes distintos.',
   'oro.estado_carga')
ON CONFLICT (clave) DO NOTHING;
