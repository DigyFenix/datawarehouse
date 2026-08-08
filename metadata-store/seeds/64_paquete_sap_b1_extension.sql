-- =====================================================================
-- Propósito : EXTENSIÓN del paquete base SAP B1 — pagos, inventario, tipos de
--             cambio y serie de rastreo. PARAMETRIZADO por organización: es el
--             archivo de ONBOARDING para cualquier tenant SAP B1 nuevo.
-- Ejecución : psql -d quilate_control -v org=<codigo> -f 64_paquete_sap_b1_extension.sql
--             (después de 58_paquete_sap_b1.sql y 58b_..._documentos.sql)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí.
-- Nota      : consolida y REEMPLAZA para onboarding a los seeds 60/61/63 (que
--             quedaron aplicados a grupocresta/ironnetwork con nombres ya
--             corregidos). Nombres de columna VERIFICADOS con Descubrir contra
--             HANA (Cresta 2026-08-01): ORCT/OVPM usan `Canceled` y `Status`
--             (no CANCELED/DocStatus), la FC de tarjeta es `CredSumFC`, y
--             OITW trae `StockValue` (valor contable del inventario).
--             El filtro de fecha de pagos es FIJO (regla de corte 2026) —
--             revisar al entrar 2027, igual que en los documentos.
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- políticas
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  ('pagos_recibidos',  'Pagos recibidos',  'tesoreria', 'hecho', 'incremental_ventana', 'ORCT',
   'DocDate', 12, 'meses', 'DocEntry', '{}'::text[], 'data_owner_finanzas',
   'plata_pago+ campo_usuario', '"DocDate" >= ''' || :'corte' || ''''),
  ('pagos_efectuados', 'Pagos efectuados', 'tesoreria', 'hecho', 'incremental_ventana', 'OVPM',
   'DocDate', 12, 'meses', 'DocEntry', '{}'::text[], 'data_owner_finanzas',
   'plata_pago+ campo_usuario', '"DocDate" >= ''' || :'corte' || ''''),
  ('inventario', 'Inventario por bodega', 'inventario', 'hecho', 'abiertos', 'OITW',
   NULL, NULL, NULL, 'ItemCode', '{}'::text[], 'data_owner_inventario',
   'plata_inventario+', '"OnHand" <> 0'),
  ('tipos_cambio', 'Tipos de cambio', 'finanzas', 'hecho', 'abiertos', 'ORTT',
   NULL, NULL, NULL, 'RateDate', '{}'::text[], 'data_owner_finanzas',
   'plata_tipo_cambio+', '"RateDate" >= ''2025-01-01''')
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, campo_fecha = EXCLUDED.campo_fecha,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

-- Los selectores de DOCUMENTOS arrastran el calendario y el catálogo de tipos: son los
-- modelos que ningún objeto genera solo y que deben refrescarse a diario (es_hoy).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET modelos_dbt = 'plata_documento_comercial+ plata_documento_linea+ clasificacion_abc_cliente+ clasificacion_abc_proveedor+ dim_tiempo dim_tipo_documento campo_usuario',
       actualizado_en = now()
  FROM org WHERE p.organizacion_id = org.id AND p.objeto = 'ventas_factura';

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET modelos_dbt = 'plata_socio_negocio+ campo_usuario', actualizado_en = now()
  FROM org WHERE p.organizacion_id = org.id AND p.objeto = 'socios';

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET modelos_dbt = 'plata_producto+ campo_usuario', actualizado_en = now()
  FROM org WHERE p.organizacion_id = org.id AND p.objeto = 'productos';

-- ---------------------------------------------------------------- campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', true, v.incluido, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ ORCT → pago (recibido) ============
  ('pagos_recibidos','ORCT','DocEntry',  'int',    'Llave interna del pago',        'pago','pago_id',          true, NULL, NULL),
  ('pagos_recibidos','ORCT','DocNum',    'int',    'Número visible',                'pago','pago_numero',      true, NULL, NULL),
  ('pagos_recibidos','ORCT','Series',    'int',    'Serie de numeración (rastreo)', 'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','DocType',   'text',   'C=cliente A=cuenta contable (tesorería)', 'pago',NULL,     true, NULL, NULL),
  ('pagos_recibidos','ORCT','DocDate',   'date',   'Fecha del pago',                'pago','fecha_pago',       true, NULL, NULL),
  ('pagos_recibidos','ORCT','TaxDate',   'date',   'Fecha contable',                'pago','fecha_registro',   true, NULL, NULL),
  ('pagos_recibidos','ORCT','CardCode',  'text',   'Cliente',                       'pago','socio_codigo',     true, NULL, NULL),
  ('pagos_recibidos','ORCT','CardName',  'text',   'Nombre del cliente',            'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','DocCurr',   'text',   'Moneda del pago',               'pago','moneda_documento', true, NULL, NULL),
  ('pagos_recibidos','ORCT','DocRate',   'numeric','Tasa',                          'pago','tipo_cambio',      true, NULL, NULL),
  ('pagos_recibidos','ORCT','CashSum',   'numeric','Efectivo (moneda local)',       'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','CheckSum',  'numeric','Cheques (moneda local)',        'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','TrsfrSum',  'numeric','Transferencia (moneda local)',  'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','CreditSum', 'numeric','Tarjeta (moneda local)',        'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','NoDocSum',  'numeric','Pago a cuenta (sin documento)', 'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','CashSumFC', 'numeric','Efectivo (moneda documento)',   'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','CheckSumFC','numeric','Cheques (moneda documento)',    'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','TrsfrSumFC','numeric','Transferencia (moneda documento)','pago',NULL,             true, NULL, NULL),
  ('pagos_recibidos','ORCT','CredSumFC', 'numeric','Tarjeta (moneda documento)',    'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','NoDocSumFC','numeric','A cuenta (moneda documento)',   'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','Ref1',      'text',   'Referencia',                    'pago','referencia',       true, NULL, NULL),
  ('pagos_recibidos','ORCT','Status',    'text',   'O abierto / C cerrado',         'pago','estado',           true, NULL, NULL),
  ('pagos_recibidos','ORCT','Canceled',  'text',   'N vigente; Y anulado, C cancelación (se excluyen)', 'pago',NULL, true, '=', 'N'),
  ('pagos_recibidos','ORCT','CreateDate','date',   'Creación',                      'pago',NULL,               true, NULL, NULL),
  ('pagos_recibidos','ORCT','UpdateDate','date',   'Última actualización',          'pago',NULL,               true, NULL, NULL),

  -- ============ OVPM → pago (efectuado) ============
  ('pagos_efectuados','OVPM','DocEntry',  'int',    'Llave interna del pago',        'pago','pago_id',          true, NULL, NULL),
  ('pagos_efectuados','OVPM','DocNum',    'int',    'Número visible',                'pago','pago_numero',      true, NULL, NULL),
  ('pagos_efectuados','OVPM','Series',    'int',    'Serie de numeración (rastreo)', 'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','DocType',   'text',   'S=proveedor A=cuenta contable', 'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','DocDate',   'date',   'Fecha del pago',                'pago','fecha_pago',       true, NULL, NULL),
  ('pagos_efectuados','OVPM','TaxDate',   'date',   'Fecha contable',                'pago','fecha_registro',   true, NULL, NULL),
  ('pagos_efectuados','OVPM','CardCode',  'text',   'Proveedor',                     'pago','socio_codigo',     true, NULL, NULL),
  ('pagos_efectuados','OVPM','CardName',  'text',   'Nombre del proveedor',          'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','DocCurr',   'text',   'Moneda del pago',               'pago','moneda_documento', true, NULL, NULL),
  ('pagos_efectuados','OVPM','DocRate',   'numeric','Tasa',                          'pago','tipo_cambio',      true, NULL, NULL),
  ('pagos_efectuados','OVPM','CashSum',   'numeric','Efectivo (moneda local)',       'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','CheckSum',  'numeric','Cheques (moneda local)',        'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','TrsfrSum',  'numeric','Transferencia (moneda local)',  'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','CreditSum', 'numeric','Tarjeta (moneda local)',        'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','NoDocSum',  'numeric','Pago a cuenta (sin documento)', 'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','CashSumFC', 'numeric','Efectivo (moneda documento)',   'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','CheckSumFC','numeric','Cheques (moneda documento)',    'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','TrsfrSumFC','numeric','Transferencia (moneda documento)','pago',NULL,             true, NULL, NULL),
  ('pagos_efectuados','OVPM','CredSumFC', 'numeric','Tarjeta (moneda documento)',    'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','NoDocSumFC','numeric','A cuenta (moneda documento)',   'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','Ref1',      'text',   'Referencia',                    'pago','referencia',       true, NULL, NULL),
  ('pagos_efectuados','OVPM','Status',    'text',   'O abierto / C cerrado',         'pago','estado',           true, NULL, NULL),
  ('pagos_efectuados','OVPM','Canceled',  'text',   'N vigente; Y anulado, C cancelación (se excluyen)', 'pago',NULL, true, '=', 'N'),
  ('pagos_efectuados','OVPM','CreateDate','date',   'Creación',                      'pago',NULL,               true, NULL, NULL),
  ('pagos_efectuados','OVPM','UpdateDate','date',   'Última actualización',          'pago',NULL,               true, NULL, NULL),

  -- ============ OITW → inventario ============
  ('inventario','OITW','ItemCode',  'text',   'Artículo',                        'inventario','producto_codigo', true, NULL, NULL),
  ('inventario','OITW','WhsCode',   'text',   'Bodega',                          'inventario','almacen_codigo',  true, NULL, NULL),
  ('inventario','OITW','OnHand',    'numeric','Existencia',                      'inventario','cantidad',        true, NULL, NULL),
  ('inventario','OITW','IsCommited','numeric','Comprometido',                    'inventario',NULL,              true, NULL, NULL),
  ('inventario','OITW','OnOrder',   'numeric','Pedido a proveedor',              'inventario',NULL,              true, NULL, NULL),
  ('inventario','OITW','AvgPrice',  'numeric','Costo promedio por bodega',       'inventario','costo_promedio',  true, NULL, NULL),
  ('inventario','OITW','StockValue','numeric','Valor contable del inventario',   'inventario','valor',           true, NULL, NULL),

  -- ============ ORTT → tipo de cambio ============
  ('tipos_cambio','ORTT','RateDate', 'date',    'Fecha de la tasa',                       'tipo_cambio','fecha',         true, NULL, NULL),
  ('tipos_cambio','ORTT','Currency', 'text',    'Moneda',                                 'tipo_cambio','moneda_codigo', true, NULL, NULL),
  ('tipos_cambio','ORTT','Rate',     'numeric', 'Moneda local por 1 unidad de la moneda', 'tipo_cambio','tasa',          true, NULL, NULL),

  -- ============ Serie de rastreo en los documentos ============
  ('ventas_factura',      'OINV','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, NULL, NULL),
  ('ventas_nota_credito', 'ORIN','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, NULL, NULL),
  ('compras_factura',     'OPCH','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, NULL, NULL),
  ('compras_nota_credito','ORPC','Series','int','Serie de numeración (rastreo en el ERP)','documento_comercial',NULL, true, NULL, NULL)
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, incluido, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
