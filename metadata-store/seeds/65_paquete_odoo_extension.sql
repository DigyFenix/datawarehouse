-- =====================================================================
-- Propósito : EXTENSIÓN del paquete base Odoo — pagos, inventario, valoración,
--             tipos de cambio y serie de rastreo. PARAMETRIZADO por organización
--             y compañía: archivo de ONBOARDING para cualquier tenant Odoo nuevo.
-- Ejecución : psql -d cresta_dw -v org=<codigo> -v company=<id> -f 65_paquete_odoo_extension.sql
--             (después de 59_paquete_odoo.sql)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí.
-- Nota      : consolida para onboarding lo aplicado a ironnetwork en los seeds
--             60/61/62/63. Verificado contra Odoo 18: el pago es account_payment
--             (amount_company_currency_signed va NEGATIVO en outbound), el valor
--             de inventario vive en stock_valuation_layer, y res_currency_rate
--             guarda la tasa INVERSA (Plata la invierte).
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- políticas
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  ('pagos', 'Pagos', 'tesoreria', 'hecho', 'abiertos', 'account_payment',
   NULL::text, NULL::integer, NULL::text, 'id', '{}'::text[], 'data_owner_finanzas',
   'plata_pago+ campo_usuario', NULL::text),
  ('inventario', 'Inventario por ubicación', 'inventario', 'hecho', 'abiertos',
   'stock_quant+stock_location', NULL, NULL, NULL, 'location_id>id', '{}'::text[],
   'data_owner_inventario', 'plata_inventario+', NULL),
  ('valor_inventario', 'Valoración de inventario', 'inventario', 'hecho', 'abiertos',
   'stock_valuation_layer', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_owner_inventario', 'plata_inventario+', NULL),
  ('tipos_cambio', 'Tipos de cambio', 'finanzas', 'hecho', 'abiertos',
   'res_currency_rate', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_owner_finanzas', 'plata_tipo_cambio+', NULL)
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, clave_natural = EXCLUDED.clave_natural,
       modelos_dbt = EXCLUDED.modelos_dbt, actualizado_en = now();

-- Selectores enriquecidos: movimientos arrastra calendario + catálogo de tipos + UDFs.
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET modelos_dbt = 'plata_documento_comercial+ plata_documento_linea+ plata_partida_cartera+ dim_rango_aging+ clasificacion_abc_cliente+ clasificacion_abc_proveedor+ dim_tiempo dim_tipo_documento campo_usuario',
       actualizado_en = now()
  FROM org WHERE p.organizacion_id = org.id AND p.objeto = 'movimientos';

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET modelos_dbt = 'plata_socio_negocio+ campo_usuario', actualizado_en = now()
  FROM org WHERE p.organizacion_id = org.id AND p.objeto = 'socios';

-- ---------------------------------------------------------------- campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', true, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ account_payment → pago ============
  ('pagos','account_payment','id',            'int',    'Llave interna del pago',                    'pago','pago_id',          NULL, NULL),
  ('pagos','account_payment','name',          'text',   'Número visible',                            'pago','pago_numero',      NULL, NULL),
  ('pagos','account_payment','payment_type',  'text',   'inbound = recibido / outbound = efectuado', 'pago','tipo_pago',        NULL, NULL),
  ('pagos','account_payment','partner_type',  'text',   'customer / supplier',                       'pago',NULL,               NULL, NULL),
  ('pagos','account_payment','partner_id',    'int',    'Socio',                                     'pago','socio_codigo',     NULL, NULL),
  ('pagos','account_payment','date',          'date',   'Fecha del pago',                            'pago','fecha_pago',       NULL, NULL),
  ('pagos','account_payment','amount',        'numeric','Monto en moneda del pago (positivo)',       'pago','monto_doc',        NULL, NULL),
  ('pagos','account_payment','amount_company_currency_signed','numeric','Monto moneda compañía (negativo en outbound)','pago','monto_local', NULL, NULL),
  ('pagos','account_payment','currency_id',   'int',    'Moneda (id → res_currency)',                'pago','moneda_documento', NULL, NULL),
  ('pagos','account_payment','state',         'text',   'draft/canceled/rejected se excluyen',       'pago','estado',           'not in', 'draft,canceled,rejected'),
  ('pagos','account_payment','memo',          'text',   'Referencia / memo',                         'pago','referencia',       NULL, NULL),
  ('pagos','account_payment','move_id',       'int',    'Asiento contable del pago',                 'pago',NULL,               NULL, NULL),
  ('pagos','account_payment','company_id',    'int',    'Compañía',                                  'pago',NULL,               '=',  :'company'),
  ('pagos','account_payment','is_reconciled', 'bool',   'Conciliado',                                'pago',NULL,               NULL, NULL),
  ('pagos','account_payment','create_date',   'timestamp','Creación',                                'pago',NULL,               NULL, NULL),
  ('pagos','account_payment','write_date',    'timestamp','Última actualización',                    'pago',NULL,               NULL, NULL),

  -- ============ stock_quant + stock_location → inventario ============
  ('inventario','stock_quant','id',                'int',    'Identificador de la quant', 'inventario',NULL,               NULL, NULL),
  ('inventario','stock_quant','product_id',        'int',    'Producto (variante)',       'inventario','producto_codigo', NULL, NULL),
  ('inventario','stock_quant','location_id',       'int',    'Ubicación',                 'inventario',NULL,               NULL, NULL),
  ('inventario','stock_quant','quantity',          'numeric','Existencia física',         'inventario','cantidad',        NULL, NULL),
  ('inventario','stock_quant','reserved_quantity', 'numeric','Reservado',                 'inventario',NULL,               NULL, NULL),
  ('inventario','stock_quant','company_id',        'int',    'Compañía',                  'inventario',NULL,               '=', :'company'),
  ('inventario','stock_location','id',             'int',    'Ubicación',                 'inventario',NULL,               NULL, NULL),
  ('inventario','stock_location','complete_name',  'text',   'Ruta (WH/Stock/...): 1er tramo = código del almacén', 'inventario',NULL, NULL, NULL),
  ('inventario','stock_location','usage',          'text',   'internal = existencias propias',       'inventario',NULL,   NULL, NULL),

  -- ============ stock_valuation_layer → valor de inventario ============
  ('valor_inventario','stock_valuation_layer','id',           'int',    'Capa de valoración',            'inventario',NULL,    NULL, NULL),
  ('valor_inventario','stock_valuation_layer','product_id',   'int',    'Producto (variante)',           'inventario',NULL,    NULL, NULL),
  ('valor_inventario','stock_valuation_layer','quantity',     'numeric','Cantidad de la capa',           'inventario',NULL,    NULL, NULL),
  ('valor_inventario','stock_valuation_layer','value',        'numeric','Valor de la capa (moneda cía)', 'inventario','valor', NULL, NULL),
  ('valor_inventario','stock_valuation_layer','remaining_qty','numeric','Cantidad restante',             'inventario',NULL,    NULL, NULL),
  ('valor_inventario','stock_valuation_layer','company_id',   'int',    'Compañía',                      'inventario',NULL,    '=', :'company'),

  -- ============ res_currency_rate → tipo de cambio ============
  ('tipos_cambio','res_currency_rate','id',          'int',    'Identificador',                             'tipo_cambio',NULL,            NULL, NULL),
  ('tipos_cambio','res_currency_rate','name',        'date',   'Fecha de la tasa',                          'tipo_cambio','fecha',         NULL, NULL),
  ('tipos_cambio','res_currency_rate','currency_id', 'int',    'Moneda (id → res_currency)',                'tipo_cambio','moneda_codigo', NULL, NULL),
  ('tipos_cambio','res_currency_rate','rate',        'numeric','INVERSA: unidades de la moneda por 1 de compañía', 'tipo_cambio','tasa',   NULL, NULL),
  ('tipos_cambio','res_currency_rate','company_id',  'int',    'Compañía',                                  'tipo_cambio',NULL,            '=', :'company'),

  -- ============ Rastreo en account_move ============
  ('movimientos','account_move','sequence_prefix',       'text',   'Prefijo de la serie (INV/2026/...)',    'documento_comercial',NULL,                    NULL, NULL),
  ('movimientos','account_move','journal_id',            'int',    'Diario contable de origen',             'documento_comercial',NULL,                    NULL, NULL),
  ('movimientos','account_move','amount_residual_signed','numeric','Saldo pendiente moneda compañía, con signo', 'documento_comercial','saldo_documento_local', NULL, NULL)
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
