-- =====================================================================
-- Propósito : (1) INVENTARIO en la ingesta — existencias y valor por bodega/artículo.
--               · SAP B1 : OITW (OnHand, AvgPrice por bodega); valor = OnHand × AvgPrice.
--               · Odoo   : stock_quant (+stock_location para el almacén) y
--                          stock_valuation_layer (valor: sum(value) por producto).
--             (2) TRAZABILIDAD de documentos — serie de numeración del ERP:
--               · SAP B1 : campo Series en OINV/ORIN/OPCH/ORPC/ORCT/OVPM.
--               · Odoo   : sequence_prefix y journal_id en account_move.
-- Tablas    : metadatos.canonico_entidad, metadatos.canonico_campo,
--             metadatos.politica_ingesta, metadatos.campo_ingesta
-- Impacto   : bajo; solo metadatos de configuración. No mueve datos.
-- Idempotente: sí (ON CONFLICT sobre las claves naturales).
-- Rollback  : delete por objeto ('inventario','valor_inventario') y de los campos nuevos.
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- entidad canónica
INSERT INTO metadatos.canonico_entidad (clave, nombre, dominio, tipo, descripcion) VALUES
  ('inventario', 'Inventario', 'inventario', 'hecho_linea',
   'Existencias y valor por (empresa, almacén, producto). Foto al momento de la extracción: no es kardex ni histórico de movimientos.')
ON CONFLICT (clave) DO UPDATE
   SET nombre = EXCLUDED.nombre, dominio = EXCLUDED.dominio,
       tipo = EXCLUDED.tipo, descripcion = EXCLUDED.descripcion;

INSERT INTO metadatos.canonico_campo (entidad_clave, nombre, tipo, requerido, descripcion, orden) VALUES
  ('inventario', 'empresa_id',      'texto',   true,  'Empresa (RLS)', 1),
  ('inventario', 'almacen_codigo',  'texto',   false, 'Bodega', 2),
  ('inventario', 'producto_codigo', 'texto',   true,  'Artículo', 3),
  ('inventario', 'cantidad',        'decimal', true,  'Existencia disponible', 4),
  ('inventario', 'costo_promedio',  'decimal', false, 'Costo promedio unitario (moneda local)', 5),
  ('inventario', 'valor',           'decimal', false, 'Valor del inventario (moneda local)', 6),
  ('inventario', 'moneda_local',    'texto',   true,  'Moneda de la compañía', 7)
ON CONFLICT (entidad_clave, nombre) DO UPDATE
   SET tipo = EXCLUDED.tipo, requerido = EXCLUDED.requerido,
       descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

-- ================================================================= SAP B1 (grupocresta)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'inventario', 'Inventario por bodega', 'inventario', 'hecho', 'abiertos', 'OITW',
       NULL, NULL, NULL, 'ItemCode', '{}'::text[], 'data_owner_inventario', 'plata_inventario+',
       '"OnHand" <> 0'
FROM org
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, clave_natural = EXCLUDED.clave_natural,
       modelos_dbt = EXCLUDED.modelos_dbt, filtro_origen = EXCLUDED.filtro_origen,
       actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', v.sugerido, v.incluido, 'paquete_base', NULL, NULL
FROM org, (VALUES
  -- ============ OITW → inventario ============
  ('inventario','OITW','ItemCode',  'text',   'Artículo',                    'inventario','producto_codigo', true, true),
  ('inventario','OITW','WhsCode',   'text',   'Bodega',                      'inventario','almacen_codigo',  true, true),
  ('inventario','OITW','OnHand',    'numeric','Existencia',                  'inventario','cantidad',        true, true),
  ('inventario','OITW','IsCommited','numeric','Comprometido',                'inventario',NULL,              true, true),
  ('inventario','OITW','OnOrder',   'numeric','Pedido a proveedor',          'inventario',NULL,              true, true),
  ('inventario','OITW','AvgPrice',  'numeric','Costo promedio por bodega',   'inventario','costo_promedio',  true, true),

  -- ============ Series (trazabilidad en el ERP) ============
  ('ventas_factura',      'OINV','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, true),
  ('ventas_nota_credito', 'ORIN','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, true),
  ('compras_factura',     'OPCH','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, true),
  ('compras_nota_credito','ORPC','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, true),
  ('pagos_recibidos',     'ORCT','Series','int','Serie de numeración (rastreo en el ERP)','pago',NULL, true, true),
  ('pagos_efectuados',    'OVPM','Series','int','Serie de numeración (rastreo en el ERP)','pago',NULL, true, true)
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, sugerido, incluido)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, sugerido = EXCLUDED.sugerido,
       actualizado_en = now();

-- ================================================================= Odoo (ironnetwork)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  -- Quants + ubicaciones: la hija (stock_location) se encadena por location_id para traer
  -- solo las ubicaciones usadas. El tipo (internal/customer/...) lo filtra Plata: excluirlo
  -- aquí dejaría quants huérfanas de ubicación.
  ('inventario', 'Inventario por ubicación', 'inventario', 'hecho', 'abiertos',
   'stock_quant+stock_location', NULL::text, NULL::integer, NULL::text,
   'location_id>id', '{}'::text[], 'data_owner_inventario', 'plata_inventario+', NULL::text),
  -- Capas de valoración: el VALOR del inventario en Odoo vive aquí (sum(value) por producto),
  -- no en las quants.
  ('valor_inventario', 'Valoración de inventario', 'inventario', 'hecho', 'abiertos',
   'stock_valuation_layer', NULL, NULL, NULL, 'id', '{}'::text[],
   'data_owner_inventario', 'plata_inventario+', NULL)
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, clave_natural = EXCLUDED.clave_natural,
       modelos_dbt = EXCLUDED.modelos_dbt, actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', v.sugerido, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ stock_quant + stock_location → inventario ============
  ('inventario','stock_quant','id',                'int',    'Identificador de la quant', 'inventario',NULL,              true, NULL, NULL),
  ('inventario','stock_quant','product_id',        'int',    'Producto (variante)',       'inventario','producto_codigo', true, NULL, NULL),
  ('inventario','stock_quant','location_id',       'int',    'Ubicación',                 'inventario',NULL,              true, NULL, NULL),
  ('inventario','stock_quant','quantity',          'numeric','Existencia física',         'inventario','cantidad',        true, NULL, NULL),
  ('inventario','stock_quant','reserved_quantity', 'numeric','Reservado',                 'inventario',NULL,              true, NULL, NULL),
  ('inventario','stock_quant','company_id',        'int',    'Compañía',                  'inventario',NULL,              true, '=', '1'),
  ('inventario','stock_location','id',             'int',    'Ubicación',                 'inventario',NULL,              true, NULL, NULL),
  ('inventario','stock_location','complete_name',  'text',   'Ruta completa (WH/Stock/...): el 1er tramo es el código del almacén', 'inventario',NULL, true, NULL, NULL),
  ('inventario','stock_location','usage',          'text',   'internal = existencias propias; customer/supplier/inventory se excluyen en Plata', 'inventario',NULL, true, NULL, NULL),

  -- ============ stock_valuation_layer → valor de inventario ============
  ('valor_inventario','stock_valuation_layer','id',           'int',    'Capa de valoración',            'inventario',NULL,   true, NULL, NULL),
  ('valor_inventario','stock_valuation_layer','product_id',   'int',    'Producto (variante)',           'inventario',NULL,   true, NULL, NULL),
  ('valor_inventario','stock_valuation_layer','quantity',     'numeric','Cantidad de la capa',           'inventario',NULL,   true, NULL, NULL),
  ('valor_inventario','stock_valuation_layer','value',        'numeric','Valor de la capa (moneda cía)', 'inventario','valor',true, NULL, NULL),
  ('valor_inventario','stock_valuation_layer','remaining_qty','numeric','Cantidad restante',             'inventario',NULL,   true, NULL, NULL),
  ('valor_inventario','stock_valuation_layer','company_id',   'int',    'Compañía',                      'inventario',NULL,   true, '=', '1'),

  -- ============ Serie / rastreo en account_move ============
  ('movimientos','account_move','sequence_prefix','text','Prefijo de la serie (INV/2026/...): rastreo en el ERP','documento_comercial',NULL, true, NULL, NULL),
  ('movimientos','account_move','journal_id',     'int', 'Diario contable de origen',                            'documento_comercial',NULL, true, NULL, NULL)
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, sugerido, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, sugerido = EXCLUDED.sugerido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
