-- =====================================================================
-- Seed: glosario de negocio BASE del producto (§7).
--
-- Términos cuyo significado lo define el MOTOR (no un tenant): el agente
-- de IA los usa para entender cómo habla la gente sin exponer tablas.
-- Los términos propios de cada organización (p. ej. "cartón", "huevo AA")
-- los captura su administrador en el portal — no van aquí.
--
-- Editable después desde el portal (CRUD de glosario). Idempotente.
-- =====================================================================
INSERT INTO metadatos.glosario_negocio (termino, definicion, equivale_a, dominio)
VALUES
  ('ventas netas',
   'Ventas brutas menos devoluciones (notas de crédito). Salvo que se pida lo contrario, sin IVA.',
   'ventas_netas_sin_iva', 'ventas'),
  ('devoluciones',
   'Notas de crédito de venta. Restan a la venta bruta para llegar a la neta.',
   'devoluciones_sin_iva', 'ventas'),
  ('margen bruto',
   'Venta neta menos costo de lo vendido. En tenants cuyo ERP no registra costo por línea (Odoo sin valoración), sale en cero: degrada, no rompe.',
   'margen_bruto', 'ventas'),
  ('cartera',
   'Saldo VIVO por cobrar (o pagar) según el mayor contable. Es una foto al corte (stock), no un flujo del período.',
   'saldo_cxc', 'tesoreria'),
  ('aging',
   'Antigüedad de los saldos de cartera por rangos: corriente, 1-30, 31-60, 61-90 y +90 días.',
   'saldo_cxc', 'tesoreria'),
  ('antigüedad de saldos',
   'Lo mismo que aging: saldos de cartera clasificados por días de vencimiento.',
   'saldo_cxc', 'tesoreria'),
  ('cobranza',
   'Cobros DE CLIENTES. No incluye operaciones de tesorería contra cuenta contable (depósitos, traslados), que el ERP mezcla en los mismos documentos de pago.',
   'cobros_de_clientes', 'tesoreria'),
  ('backlog',
   'Pedidos de venta abiertos: cantidad pedida menos facturada, valorizada. El backlog VENCIDO es la parte con fecha de entrega ya pasada.',
   'backlog', 'pedidos'),
  ('quiebre de stock',
   'Producto CON demanda reciente y SIN existencia: venta en riesgo por no tener qué despachar.',
   'venta_en_riesgo_por_quiebre', 'inventario'),
  ('inventario ocioso',
   'Producto con existencia que SÍ tuvo historia de venta y dejó de venderse. No confundir con lo que nunca se facturó (insumos de producción): eso es "sin rotación comercial".',
   'valor_inventario_ocioso', 'inventario'),
  ('sin rotación comercial',
   'Existencia que NUNCA pasó por una factura de venta (materia prima, insumos, consumibles). En una comercializadora es alarma; en una productora es lo normal.',
   'valor_sin_rotacion_comercial', 'inventario'),
  ('intercompañía',
   'Operación entre compañías del mismo grupo (el NIT de la contraparte está en los NIT afiliados). Pesa en cualquier ranking comercial: separarla antes de comparar clientes.',
   NULL, 'ventas'),
  ('resultado contable',
   'Ingresos contables menos gastos y costos, según el mayor. Puede diferir de lo facturado (anticipos, ajustes): esa brecha es una métrica propia.',
   'resultado_contable', 'rentabilidad'),
  ('moneda de presentación',
   'Moneda a la que consolidan las cifras del grupo. Los montos sin sufijo de Oro rigen en ella; la moneda del documento queda como referencia.',
   NULL, 'ventas')
ON CONFLICT (termino) DO NOTHING;
