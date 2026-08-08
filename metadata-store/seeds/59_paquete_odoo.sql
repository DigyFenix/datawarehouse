-- =====================================================================
-- Propósito : PAQUETE BASE ODOO 18 — plantilla de onboarding para un cliente Odoo.
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Ejecución : psql -d quilate_control -v org=ironnetwork -v company=1 -f 59_paquete_odoo.sql
-- Idempotente: sí.
-- Validado  : columnas verificadas contra Odoo 18.0.1.3 de Iron Network (2026-07-26).
--
-- DIFERENCIAS DE FONDO CON EL PAQUETE SAP B1 (todas verificadas en vivo):
--  1. UN SOLO OBJETO PARA LOS MOVIMIENTOS. Odoo unifica facturas de venta, de compra,
--     notas de crédito y asientos manuales en account_move, y sus líneas (de producto
--     Y de cartera) en account_move_line. Separarlos en Bronce obligaría a escribir la
--     misma tabla dos veces con filtros distintos; la separación la hace Plata, que es
--     su trabajo. Con 1,054 asientos y 2,923 líneas el volumen lo permite de sobra.
--  2. SIN VENTANA. La cartera necesita partidas de cualquier fecha; se trae todo lo
--     contabilizado y Plata recorta el período para los documentos.
--  3. FILTRO state='posted' OBLIGATORIO: los borradores y cancelados viven en la MISMA
--     tabla. En Iron Network hay 37 facturas de compra en borrador contra 150
--     contabilizadas: colarlas inflaría las compras un 25%.
--  4. FILTRO company_id: una base Odoo alberga varias compañías. Aquí solo la 1 tiene
--     movimiento (las otras 3 están vacías).
--  5. CAMPOS jsonb: account_account.code_store (código por compañía) y .name /
--     product_template.name (traducciones por idioma) NO son columnas de texto. Se
--     traen crudos y Plata extrae la clave que corresponde.
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- políticas
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  ('socios',        'Socios de negocio', 'datos_maestros', 'maestro', 'full_replace', 'res_partner',
   NULL::text, NULL::integer, NULL::text,'id','{}'::text[],'data_steward','plata_socio_negocio+',NULL::text),
  ('productos',     'Productos',         'datos_maestros', 'maestro', 'full_replace', 'product_product+product_template',
   NULL,NULL,NULL,'product_tmpl_id>id','{}'::text[],'data_steward','plata_producto+',NULL),
  ('cuentas',       'Plan de cuentas',   'finanzas',       'maestro', 'full_replace', 'account_account',
   NULL,NULL,NULL,'id','{}'::text[],'data_owner_finanzas','plata_cuenta+',NULL),
  ('almacenes',     'Bodegas',           'datos_maestros', 'maestro', 'full_replace', 'stock_warehouse',
   NULL,NULL,NULL,'id','{}'::text[],'data_steward','plata_almacen+',NULL),
  ('monedas',       'Monedas',           'finanzas',       'maestro', 'full_replace', 'res_currency',
   NULL,NULL,NULL,'id','{}'::text[],'data_owner_finanzas','plata_moneda+',NULL),
  ('centros_costo', 'Centros de costo',  'finanzas',       'maestro', 'full_replace', 'account_analytic_account',
   NULL,NULL,NULL,'id','{}'::text[],'data_owner_finanzas','plata_centro_costo+',NULL),
  -- Movimientos: cabecera + líneas. Alimenta documento_comercial, documento_linea Y
  -- partida_cartera (ver nota 1 arriba). `abiertos` = snapshot completo por corrida.
  ('movimientos',   'Asientos y documentos', 'ventas_compras', 'hecho', 'abiertos',
   'account_move+account_move_line',
   NULL,NULL,NULL,'id>move_id','{}'::text[],'data_owner_finanzas','plata_documento_comercial+',NULL)
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, campo_fecha = EXCLUDED.campo_fecha,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

-- ---------------------------------------------------------------- mapeo de campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.* FROM org, (VALUES
  -- ============ res_partner → socio_negocio ============
  -- OJO: 225 filas pero solo 74 son socios comerciales; el resto son contactos y
  -- direcciones. El filtro por rango comercial lo aplica Plata (necesita OR).
  ('socios','res_partner','id',            false,'int','Identificador del socio','socio_negocio','socio_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','name',          false,'text','Nombre / razón social','socio_negocio','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','vat',           false,'text','NIT','socio_negocio','nit','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','customer_rank', false,'int','>0 ⇒ es cliente','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','supplier_rank', false,'int','>0 ⇒ es proveedor','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','parent_id',     false,'int','Padre: si no es NULL es un contacto, no un socio','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','is_company',    false,'bool','Es empresa','socio_negocio',NULL,'directo',false,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','country_id',    false,'int','País','socio_negocio','pais','directo',false,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','property_payment_term_id',false,'int','Condición de pago','socio_negocio','condicion_pago_codigo','directo',false,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','company_id',    false,'int','Compañía','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','res_partner','active',        false,'bool','Activo','socio_negocio','activo','directo',true,true,'paquete_base','=','true'),

  -- ============ product_product + product_template → producto ============
  ('productos','product_product','id',             false,'int','Variante de producto','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_product','product_tmpl_id',false,'int','Plantilla del producto','producto','producto_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_product','default_code',   false,'text','Referencia interna','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_product','active',         false,'bool','Activo','producto','activo','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_template','id',            false,'int','Plantilla','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_template','name',          false,'jsonb','Nombre TRADUCIDO (jsonb por idioma) → Plata extrae es_GT','producto','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_template','categ_id',      false,'int','Categoría','producto','grupo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_template','type',          false,'text','consu/service → bien|servicio en Plata','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('productos','product_template','uom_id',        false,'int','Unidad de medida','producto','unidad_medida','directo',true,true,'paquete_base',NULL,NULL),

  -- ============ account_account → cuenta (PIEZA CLAVE DE LA CARTERA) ============
  ('cuentas','account_account','id',          false,'int','Identificador de la cuenta','cuenta','cuenta_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','account_account','code_store',  false,'jsonb','Código POR COMPAÑÍA (jsonb) → Plata extrae la clave de la compañía','cuenta','cuenta_codigo_visible','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','account_account','name',        false,'jsonb','Nombre TRADUCIDO (jsonb por idioma)','cuenta','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','account_account','account_type',false,'text','asset_receivable / liability_payable / ... → DEFINE LA CARTERA','cuenta',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','account_account','reconcile',   false,'bool','Se concilia por partida','cuenta','permite_conciliacion','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','account_account','deprecated',  false,'bool','Dada de baja → se invierte en Plata','cuenta',NULL,'directo',true,true,'paquete_base',NULL,NULL),

  -- ============ stock_warehouse → almacen ============
  ('almacenes','stock_warehouse','id',        false,'int','Identificador','almacen','almacen_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','stock_warehouse','code',      false,'text','Código corto','almacen',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','stock_warehouse','name',      false,'text','Nombre','almacen','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','stock_warehouse','active',    false,'bool','Activo','almacen','activo','directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','stock_warehouse','company_id',false,'int','Compañía','almacen',NULL,'directo',true,true,'paquete_base',NULL,NULL),

  -- ============ res_currency → moneda ============
  ('monedas','res_currency','id',    false,'int','Identificador','moneda',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('monedas','res_currency','name',  false,'text','Código ISO','moneda','moneda_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('monedas','res_currency','active',false,'bool','Activa','moneda',NULL,'directo',true,true,'paquete_base','=','true'),

  -- ============ account_analytic_account → centro_costo ============
  ('centros_costo','account_analytic_account','id',    false,'int','Identificador','centro_costo','centro_costo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('centros_costo','account_analytic_account','name',  false,'text','Nombre','centro_costo','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('centros_costo','account_analytic_account','active',false,'bool','Activo','centro_costo','activo','directo',true,true,'paquete_base',NULL,NULL),

  -- ============ account_move → documento_comercial ============
  ('movimientos','account_move','id',                  false,'int','Asiento/documento','documento_comercial','documento_id','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','name',                false,'text','Número del documento','documento_comercial','documento_numero','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','move_type',           false,'text','out_invoice/out_refund/in_invoice/in_refund/entry → flujo+tipo en Plata','documento_comercial','tipo_documento_origen','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','state',               false,'text','FILTRO DURO: solo posted','documento_comercial',NULL,'directo',true,true,'paquete_base','=','posted'),
  ('movimientos','account_move','payment_state',       false,'text','Estado de pago (informativo)','documento_comercial','estado_pago','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','partner_id',          false,'int','Socio','documento_comercial','socio_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','invoice_date',        false,'date','Fecha de factura','documento_comercial','fecha_documento','cast_fecha',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','invoice_date_due',    false,'date','Vencimiento','documento_comercial','fecha_vencimiento','cast_fecha',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','date',                false,'date','Fecha contable','documento_comercial','fecha_registro','cast_fecha',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','currency_id',         false,'int','Moneda del documento','documento_comercial','moneda_documento','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_untaxed',      false,'num','Base sin impuesto, moneda del documento','documento_comercial','total_sin_impuesto_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_tax',          false,'num','Impuesto, moneda del documento','documento_comercial','total_impuesto_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_total',        false,'num','Total, moneda del documento','documento_comercial','total_con_impuesto_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_untaxed_signed',false,'num','Base, moneda local CON signo','documento_comercial','total_sin_impuesto_local','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_total_signed', false,'num','Total, moneda local CON signo','documento_comercial','total_con_impuesto_local','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','amount_residual',     false,'num','Saldo del documento (INFORMATIVO: la cartera sale del mayor)','documento_comercial','saldo_documento_local','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','ref',                 false,'text','Referencia externa','documento_comercial','referencia_externa','directo',false,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','invoice_origin',      false,'text','Documento de origen','documento_comercial',NULL,'directo',false,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','reversed_entry_id',   false,'int','Nota de crédito → factura revertida','documento_comercial','documento_referencia','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','invoice_user_id',     false,'int','Usuario responsable → vendedor','documento_comercial','vendedor_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','journal_id',          false,'int','Diario contable','documento_comercial',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','company_id',          false,'int','FILTRO DURO: solo la compañía operativa','documento_comercial',NULL,'directo',true,true,'paquete_base','=',:'company'),
  ('movimientos','account_move','create_date',         false,'text','Alta en el ERP','documento_comercial','creado_en','directo',false,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move','write_date',          false,'text','Última modificación (ventana de producción)','documento_comercial','actualizado_en','directo',false,true,'paquete_base',NULL,NULL),

  -- ============ account_move_line → documento_linea Y partida_cartera ============
  -- Una sola tabla alimenta las dos entidades canónicas; Plata las separa por el
  -- tipo de cuenta (cartera) y por display_type (líneas de producto).
  ('movimientos','account_move_line','id',                      false,'int','Línea del asiento','documento_linea','linea_numero','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','move_id',                 false,'int','Documento padre','documento_linea','documento_id','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','account_id',              false,'int','Cuenta contable — CLASIFICA LA CARTERA','documento_linea','cuenta_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','partner_id',              false,'int','Socio de la línea','documento_linea','socio_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','name',                    false,'text','Descripción','documento_linea','descripcion_linea','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','display_type',            false,'text','product / tax / payment_term → separa línea de documento vs partida de cartera','documento_linea',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','parent_state',            false,'text','Estado del asiento padre','documento_linea',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','product_id',              false,'int','Producto','documento_linea','producto_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','product_uom_id',          false,'int','Unidad de medida','documento_linea','unidad_medida','directo',false,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','quantity',                false,'num','Cantidad','documento_linea','cantidad','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','price_unit',              false,'num','Precio unitario','documento_linea','precio_unitario_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','discount',                false,'num','Descuento %','documento_linea','descuento_pct','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','price_subtotal',          false,'num','Base SIN impuesto','documento_linea','monto_sin_impuesto_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','price_total',             false,'num','Total CON impuesto','documento_linea','monto_con_impuesto_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','balance',                 false,'num','Débito−crédito en MONEDA LOCAL','documento_linea','monto_sin_impuesto_local','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','debit',                   false,'num','Débito, moneda local','documento_linea',NULL,'cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','credit',                  false,'num','Crédito, moneda local','documento_linea',NULL,'cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','amount_currency',         false,'num','Importe en moneda del documento','documento_linea',NULL,'cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','currency_id',             false,'int','Moneda de la línea','documento_linea','moneda_documento','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','amount_residual',         false,'num','SALDO PENDIENTE — LA MEDIDA DE LA CARTERA','partida_cartera','saldo_pendiente_local','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','amount_residual_currency',false,'num','Saldo pendiente, moneda del documento','partida_cartera','saldo_pendiente_doc','cast_numeric',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','date_maturity',           false,'date','Vencimiento — BASE DEL AGING','partida_cartera','fecha_vencimiento','cast_fecha',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','reconciled',              false,'bool','Conciliada','partida_cartera','conciliada','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','full_reconcile_id',       false,'int','Conciliación completa','partida_cartera',NULL,'directo',false,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','tax_line_id',             false,'int','Si no es NULL, la línea ES de impuesto','documento_linea',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','analytic_distribution',   false,'jsonb','Centro de costo con % (jsonb) → MULTIPLE si hay más de uno','documento_linea','centro_costo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','date',                    false,'date','Fecha de la línea','documento_linea','fecha_documento','cast_fecha',true,true,'paquete_base',NULL,NULL),
  ('movimientos','account_move_line','company_id',              false,'int','FILTRO DURO: solo la compañía operativa','documento_linea',NULL,'directo',true,true,'paquete_base','=',:'company')
) AS v(objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
       canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
       filtro_op, filtro_valor)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, canonico_entidad = EXCLUDED.canonico_entidad,
       campo_canonico = EXCLUDED.campo_canonico, transformacion = EXCLUDED.transformacion,
       sugerido = EXCLUDED.sugerido, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       origen = 'paquete_base', actualizado_en = now();
