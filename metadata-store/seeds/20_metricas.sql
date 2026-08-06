-- =====================================================================
-- Seed: fichas del catálogo de métricas certificadas (§9).
--
-- REESCRITO 2026-08-06. La versión anterior registraba 5 métricas (`ventas_brutas`,
-- `devoluciones`, `ventas_netas`, `saldo_pendiente_cobro`, `aging`) sobre dos hechos que
-- no existen, y ninguna de esas claves coincidía con las que dbt materializa en
-- `oro.metrica_valor`. El catálogo describía un warehouse imaginario.
--
-- Ahora las claves son EXACTAMENTE las que emite `oro.metrica_valor`, para que el agente
-- pueda pedir una métrica por clave y obtener el valor sin traducción intermedia, y para que
-- la ficha de gobierno y el número publicado hablen de lo mismo.
--
-- IVA GUATEMALTECO: va incluido en el precio, así que ventas y compras se publican explícitas
-- en versión sin IVA y con IVA en lugar de dejar la ambigüedad que este producto existe para
-- eliminar. El "con IVA" sale de la CABECERA del documento (a nivel línea el prorrateo desvía
-- centavos contra el ERP); el "sin IVA", el costo y el margen salen de la línea.
--
-- Todas entran en 'borrador': la certificación es multi-aprobador y se hace en el portal.
-- El agente solo puede usar las que lleguen a 'certificada' (§11).
--
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadatos.catalogo_metricas
  (clave, nombre_oficial, definicion_negocio, formula, hecho_origen, periodicidad, owner, estado)
VALUES
  -- ------------------------------------------------------------------ ventas
  ('ventas_brutas_sin_iva', 'Ventas Brutas (sin IVA)',
   'Facturación del período sin impuesto, antes de restar devoluciones.',
   'suma de monto_sin_impuesto de las líneas con tipo_documento = factura',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('ventas_brutas_con_iva', 'Ventas Brutas (con IVA)',
   'Facturación del período con impuesto incluido, tomada de la cabecera del documento.',
   'suma de total_con_impuesto de los documentos de venta con tipo_documento = factura',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('devoluciones_sin_iva', 'Devoluciones (sin IVA)',
   'Notas de crédito de venta del período, en positivo.',
   'valor absoluto de la suma de monto_sin_impuesto de las líneas con tipo_documento = nota_credito',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('devoluciones_con_iva', 'Devoluciones (con IVA)',
   'Notas de crédito de venta del período con impuesto, desde la cabecera, en positivo.',
   'valor absoluto de la suma de total_con_impuesto de los documentos con tipo_documento = nota_credito',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('ventas_netas_sin_iva', 'Ventas Netas (sin IVA)',
   'Ventas Brutas menos Devoluciones, sin impuesto. Es la cifra de venta oficial del grupo.',
   'suma de monto_sin_impuesto de todas las líneas de venta (la nota de crédito ya viene negativa)',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('ventas_netas_con_iva', 'Ventas Netas (con IVA)',
   'Ventas Brutas menos Devoluciones con impuesto incluido, desde la cabecera.',
   'suma de total_con_impuesto de todos los documentos de venta',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('costo_de_ventas', 'Costo de Ventas',
   'Costo registrado en la línea al momento de facturar. Solo disponible en SAP B1; en Odoo la línea no lleva costo y la métrica sale en cero.',
   'suma de costo de las líneas de venta',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('margen_bruto', 'Margen Bruto',
   'Ventas Netas sin IVA menos Costo de Ventas, calculado línea a línea.',
   'suma de margen de las líneas de venta',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('ventas_bajo_costo', 'Ventas Bajo Costo',
   'Venta facturada por debajo del costo registrado en la línea. Es fuga de margen, no promoción: nadie la autorizó.',
   'suma de monto_sin_impuesto de las líneas de venta cuyo margen es negativo',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  ('margen_perdido_bajo_costo', 'Margen Perdido Bajo Costo',
   'Cuánto margen se dejó en la mesa al vender por debajo del costo, en positivo para poder priorizarlo.',
   'valor absoluto de la suma de margen de las líneas de venta cuyo margen es negativo',
   'hecho_venta_linea', 'mensual', 'data_owner_ventas', 'borrador'),

  -- ------------------------------------------------------------------ compras
  ('compras_brutas_sin_iva', 'Compras Brutas (sin IVA)',
   'Compras facturadas del período sin impuesto, antes de notas de crédito.',
   'suma de monto_sin_impuesto de las líneas de compra con tipo_documento = factura',
   'hecho_compra_linea', 'mensual', 'data_owner_compras', 'borrador'),

  ('notas_credito_compra', 'Notas de Crédito Compra',
   'Devoluciones a proveedor del período, en positivo.',
   'valor absoluto de la suma de monto_sin_impuesto de las líneas de compra con tipo_documento = nota_credito',
   'hecho_compra_linea', 'mensual', 'data_owner_compras', 'borrador'),

  ('compras_netas_sin_iva', 'Compras Netas (sin IVA)',
   'Compras Brutas menos notas de crédito, sin impuesto.',
   'suma de monto_sin_impuesto de todas las líneas de compra',
   'hecho_compra_linea', 'mensual', 'data_owner_compras', 'borrador'),

  ('compras_netas_con_iva', 'Compras Netas (con IVA)',
   'Compras netas con impuesto incluido, desde la cabecera del documento.',
   'suma de total_con_impuesto de todos los documentos de compra',
   'hecho_compra_linea', 'mensual', 'data_owner_compras', 'borrador'),

  -- ------------------------------------------------------------------ tesorería
  ('saldo_cxc', 'Saldo Cuentas por Cobrar',
   'Saldo vivo por cobrar a la fecha de corte, tomado del mayor contable y no de la factura. Es un stock: no se filtra por período.',
   'suma de saldo_pendiente de las partidas abiertas de cartera por cobrar',
   'hecho_cartera_cobrar', 'diaria', 'data_owner_tesoreria', 'borrador'),

  ('saldo_cxp', 'Saldo Cuentas por Pagar',
   'Saldo vivo por pagar a la fecha de corte desde el mayor contable, en positivo.',
   'valor absoluto de la suma de saldo_pendiente de las partidas abiertas de cartera por pagar',
   'hecho_cartera_pagar', 'diaria', 'data_owner_tesoreria', 'borrador'),

  ('cobros_de_clientes', 'Cobros de Clientes',
   'Cobranza real del período. Excluye las operaciones de tesorería contra cuenta contable (depósitos y traslados), que en SAP viven en la misma tabla y triplican la cifra si se mezclan.',
   'suma de monto de los pagos recibidos con contraparte = cliente',
   'hecho_pago_recibido', 'mensual', 'data_owner_tesoreria', 'borrador'),

  ('pagos_a_proveedores', 'Pagos a Proveedores',
   'Salidas de caja hacia proveedores en el período, con la misma separación por contraparte.',
   'suma de monto de los pagos efectuados con contraparte = proveedor',
   'hecho_pago_efectuado', 'mensual', 'data_owner_tesoreria', 'borrador'),

  -- ------------------------------------------------------------------ rentabilidad
  ('ingresos_contables', 'Ingresos Contables',
   'Ingresos según el mayor. No tiene por qué coincidir exactamente con la venta facturada: la diferencia son anticipos, ajustes y cuentas de ingreso no comerciales, y vigilarla es un control de calidad contable.',
   'suma de monto_resultado de las partidas del mayor con naturaleza = ingreso',
   'hecho_movimiento_contable', 'mensual', 'data_owner_finanzas', 'borrador'),

  ('gasto_operativo', 'Gasto Operativo',
   'Gasto del período según el mayor, por cuenta y centro de costo.',
   'suma de monto_resultado de las partidas del mayor con naturaleza = gasto',
   'hecho_movimiento_contable', 'mensual', 'data_owner_finanzas', 'borrador'),

  ('costo_contable', 'Costo Contable',
   'Costo del período según el mayor. Es la cifra contable, no el costo de línea de la factura.',
   'suma de monto_resultado de las partidas del mayor con naturaleza = costo',
   'hecho_movimiento_contable', 'mensual', 'data_owner_finanzas', 'borrador'),

  ('resultado_contable', 'Resultado Contable',
   'Ingresos menos costos menos gastos del mayor: el resultado del período antes de ajustes de cierre.',
   'ingresos_contables − costo_contable − gasto_operativo',
   'hecho_movimiento_contable', 'mensual', 'data_owner_finanzas', 'borrador'),

  -- ------------------------------------------------------------------ inventario
  ('valor_inventario', 'Valor de Inventario',
   'Valor contable de la existencia a la fecha de corte. Es una foto, no un flujo.',
   'suma de valor de las posiciones de inventario',
   'hecho_inventario', 'diaria', 'data_owner_inventario', 'borrador'),

  ('valor_inventario_ocioso', 'Valor de Inventario Ocioso',
   'Existencia de productos que SÍ se vendieron alguna vez y llevan más de 90 días sin facturarse. Dinero muerto y accionable.',
   'suma de stock_valor de la ficha de producto donde es_ocioso',
   'analisis_producto', 'diaria', 'data_owner_inventario', 'borrador'),

  ('valor_sin_rotacion_comercial', 'Valor sin Rotación Comercial',
   'Existencia de artículos que nunca se han facturado. En una comercializadora es alarma; en una productora es insumo que se consume sin pasar por factura. Se separa del ocioso para no confundir las dos cosas.',
   'suma de stock_valor de la ficha de producto donde es_sin_rotacion_comercial',
   'analisis_producto', 'diaria', 'data_owner_inventario', 'borrador'),

  ('venta_en_riesgo_por_quiebre', 'Venta Anual en Riesgo por Quiebre',
   'Lo que facturaron en 12 meses los productos que hoy están agotados y tuvieron demanda en los últimos 30 días.',
   'suma de venta_12m de la ficha de producto donde es_quiebre',
   'analisis_producto', 'diaria', 'data_owner_inventario', 'borrador'),

  -- ------------------------------------------------------------------ pedidos
  ('backlog', 'Backlog',
   'Valor de los pedidos confirmados pendientes de entregar. Es el compromiso vivo con el cliente.',
   'suma de monto_abierto de las líneas de pedido abiertas',
   'hecho_pedido_linea', 'diaria', 'data_owner_ventas', 'borrador'),

  ('backlog_vencido', 'Backlog Vencido',
   'La parte del backlog cuya fecha de entrega prometida ya pasó: incumplimiento que el cliente está viviendo hoy.',
   'suma de monto_abierto de las líneas de pedido abiertas con fecha_entrega anterior a hoy',
   'hecho_pedido_linea', 'diaria', 'data_owner_ventas', 'borrador')
ON CONFLICT (clave) DO NOTHING;
