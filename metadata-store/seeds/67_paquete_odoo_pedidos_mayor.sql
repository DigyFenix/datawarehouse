-- =====================================================================
-- Propósito : EXTENSIÓN del paquete base Odoo — PEDIDOS DE VENTA (backlog /
--             fill rate) y P&L desde el mayor (que Odoo YA extrae completo en
--             el objeto `movimientos`, sin filtro por cuenta).
--             PARAMETRIZADO por organización y compañía (onboarding Odoo).
-- Ejecución : psql -d quilate_control -v org=<codigo> -v company=<id> -f 67_paquete_odoo_pedidos_mayor.sql
--             (después de 59/65)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí.
-- Notas     :
--   · sale_order.state: solo pedidos CONFIRMADOS ('sale' y 'done' — done quedó
--     en desuso en 17+ pero se acepta por compatibilidad).
--   · Montos de pedido en Odoo van en la MONEDA DE LA ORDEN (no hay *_signed
--     como en account_move): la conversión a local la hace plata con el tipo
--     de cambio del día.
--   · El mayor completo ya está en bronce (account_move_line, posted): solo se
--     encadena `plata_movimiento_contable` a la transformación del objeto.
-- =====================================================================

\set ON_ERROR_STOP on

-- ------------------------------------------------- política: pedidos de venta
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'pedidos_venta', 'Pedidos de venta', 'ventas', 'hecho', 'incremental_ventana',
       'sale_order+sale_order_line', 'date_order', 12, 'meses', 'id>order_id', '{}'::text[],
       'data_owner_ventas', 'plata_pedido_linea+ campo_usuario', '"date_order" >= ''' || :'corte' || ''''
FROM org
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, fuente_objeto = EXCLUDED.fuente_objeto,
       estrategia = EXCLUDED.estrategia, campo_fecha = EXCLUDED.campo_fecha,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

-- ------------------------------------------------- política: movimientos → +P&L
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET nombre_negocio = 'Mayor contable (cartera + resultados)',
       modelos_dbt    = 'plata_partida_cartera+ plata_movimiento_contable+',
       actualizado_en = now()
  FROM org
 WHERE p.organizacion_id = org.id AND p.objeto = 'movimientos';

-- ------------------------------------------------- campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', true, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ sale_order → pedido (cabecera) ============
  ('pedidos_venta','sale_order','id',             'int',      'Llave interna del pedido',      'pedido','pedido_id',        NULL, NULL),
  ('pedidos_venta','sale_order','name',           'text',     'Número visible (S000xx)',       'pedido','pedido_numero',    NULL, NULL),
  ('pedidos_venta','sale_order','date_order',     'timestamp','Fecha del pedido',              'pedido','fecha_pedido',     NULL, NULL),
  ('pedidos_venta','sale_order','commitment_date','timestamp','Fecha de entrega prometida',    'pedido','fecha_entrega',    NULL, NULL),
  ('pedidos_venta','sale_order','partner_id',     'int',      'Cliente',                       'pedido','socio_codigo',     NULL, NULL),
  ('pedidos_venta','sale_order','user_id',        'int',      'Vendedor (res.users)',          'pedido','vendedor_codigo',  NULL, NULL),
  ('pedidos_venta','sale_order','state',          'text',     'Solo confirmados (sale/done)',  'pedido','estado',           'in', 'sale,done'),
  ('pedidos_venta','sale_order','invoice_status', 'text',     'Estado de facturación',         'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','sale_order','amount_untaxed', 'numeric',  'Base SIN impuesto, moneda orden','pedido',NULL,              NULL, NULL),
  ('pedidos_venta','sale_order','amount_tax',     'numeric',  'Impuesto, moneda orden',        'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','sale_order','amount_total',   'numeric',  'Total CON impuesto, moneda orden','pedido',NULL,             NULL, NULL),
  ('pedidos_venta','sale_order','currency_id',    'int',      'Moneda de la orden',            'pedido','moneda_documento', NULL, NULL),
  ('pedidos_venta','sale_order','company_id',     'int',      'Compañía',                      'pedido',NULL,               '=',  :'company'),

  -- ============ sale_order_line → pedido (líneas, el grano del hecho) ============
  ('pedidos_venta','sale_order_line','id',             'int',    'Llave de la línea',            'pedido',NULL,                NULL, NULL),
  ('pedidos_venta','sale_order_line','order_id',       'int',    'Pedido padre',                 'pedido','pedido_id',         NULL, NULL),
  ('pedidos_venta','sale_order_line','product_id',     'int',    'Producto',                     'pedido','producto_codigo',   NULL, NULL),
  ('pedidos_venta','sale_order_line','name',           'text',   'Descripción de la línea',      'pedido','descripcion_linea', NULL, NULL),
  ('pedidos_venta','sale_order_line','product_uom_qty','numeric','Cantidad pedida',              'pedido','cantidad',          NULL, NULL),
  ('pedidos_venta','sale_order_line','qty_delivered',  'numeric','Cantidad entregada',           'pedido',NULL,                NULL, NULL),
  ('pedidos_venta','sale_order_line','qty_invoiced',   'numeric','Cantidad facturada',           'pedido',NULL,                NULL, NULL),
  ('pedidos_venta','sale_order_line','price_unit',     'numeric','Precio unitario, moneda orden','pedido','precio_unitario_doc',NULL,NULL),
  ('pedidos_venta','sale_order_line','discount',       'numeric','Descuento %',                  'pedido','descuento_pct',     NULL, NULL),
  ('pedidos_venta','sale_order_line','price_subtotal', 'numeric','Base SIN impuesto, moneda orden','pedido','monto_sin_impuesto_doc',NULL,NULL),
  ('pedidos_venta','sale_order_line','price_total',    'numeric','Total CON impuesto, moneda orden','pedido',NULL,             NULL, NULL),
  ('pedidos_venta','sale_order_line','display_type',   'text',   'Solo líneas de producto (excluye notas/secciones)','pedido',NULL, 'is', 'null'),
  ('pedidos_venta','sale_order_line','company_id',     'int',    'Compañía',                     'pedido',NULL,                '=',  :'company')
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
