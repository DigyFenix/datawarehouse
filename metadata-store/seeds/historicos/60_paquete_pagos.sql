-- =====================================================================
-- Propósito : PAGOS en la ingesta — entidad canónica `pago` + políticas y mapeo
--             para los dos paquetes base:
--               · SAP B1 : pagos_recibidos (ORCT) y pagos_efectuados (OVPM)
--               · Odoo   : pagos (account_payment; payment_type da el sentido)
-- Tablas    : metadatos.canonico_entidad, metadatos.canonico_campo,
--             metadatos.politica_ingesta, metadatos.campo_ingesta
-- Impacto   : bajo; solo metadatos de configuración. No mueve datos.
-- Idempotente: sí (ON CONFLICT sobre las claves naturales).
-- Rollback  : delete de las políticas/campos por objeto + entidad 'pago'.
-- Notas     :
--  · ORCT/OVPM no tienen DocTotal: el monto es la suma de los medios de pago
--    (CashSum + CheckSum + TrsfrSum + CreditSum). CANCELED = 'N' obligatorio
--    (misma trampa que los documentos: la cancelación 'C' duplica el importe).
--  · Los *SumFC (moneda del documento) van sugeridos PERO NO incluidos hasta
--    confirmarlos con Descubrir contra HANA: una columna inexistente en el
--    SELECT tumba la extracción completa del objeto.
--  · Odoo 18: el pago es account_payment; su asiento ya llega por `movimientos`.
--    amount_company_currency_signed es negativo en outbound → Plata toma abs().
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- entidad canónica
INSERT INTO metadatos.canonico_entidad (clave, nombre, dominio, tipo, descripcion) VALUES
  ('pago', 'Pago', 'tesoreria', 'hecho_cabecera',
   'Documento de pago: cobro a cliente (recibido) o pago a proveedor (efectuado). INFORMATIVO para flujo de caja — el saldo de cartera sale del mayor, no de aquí.')
ON CONFLICT (clave) DO UPDATE
   SET nombre = EXCLUDED.nombre, dominio = EXCLUDED.dominio,
       tipo = EXCLUDED.tipo, descripcion = EXCLUDED.descripcion;

INSERT INTO metadatos.canonico_campo (entidad_clave, nombre, tipo, requerido, descripcion, orden) VALUES
  ('pago', 'pago_id',          'texto',   true,  'Llave interna del ERP (DocEntry / id)', 1),
  ('pago', 'pago_numero',      'texto',   false, 'Número visible (DocNum / name)', 2),
  ('pago', 'tipo_pago',        'texto',   true,  'recibido | efectuado', 3),
  ('pago', 'socio_codigo',     'texto',   false, 'Cliente (recibido) o proveedor (efectuado)', 4),
  ('pago', 'fecha_pago',       'fecha',   true,  'Fecha del pago', 5),
  ('pago', 'fecha_registro',   'fecha',   false, 'Fecha contable', 6),
  ('pago', 'moneda_documento', 'texto',   false, 'Moneda del pago', 7),
  ('pago', 'moneda_local',     'texto',   true,  'Moneda de la compañía', 8),
  ('pago', 'tipo_cambio',      'decimal', false, 'Tasa aplicada', 9),
  ('pago', 'monto_doc',        'decimal', false, 'Monto en moneda del documento', 10),
  ('pago', 'monto_local',      'decimal', true,  'Monto en moneda local (siempre positivo; el sentido lo da tipo_pago)', 11),
  ('pago', 'medio_pago',       'texto',   false, 'efectivo | cheque | transferencia | tarjeta | mixto', 12),
  ('pago', 'referencia',       'texto',   false, 'Referencia externa', 13),
  ('pago', 'estado',           'texto',   false, 'Estado en el ERP', 14)
ON CONFLICT (entidad_clave, nombre) DO UPDATE
   SET tipo = EXCLUDED.tipo, requerido = EXCLUDED.requerido,
       descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

-- ================================================================= SAP B1 (grupocresta)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  ('pagos_recibidos',  'Pagos recibidos',  'tesoreria', 'hecho', 'incremental_ventana', 'ORCT',
   'DocDate', 12, 'meses', 'DocEntry', '{}'::text[], 'data_owner_finanzas', 'plata_pago+',
   '"DocDate" >= ''2026-01-01'''),
  ('pagos_efectuados', 'Pagos efectuados', 'tesoreria', 'hecho', 'incremental_ventana', 'OVPM',
   'DocDate', 12, 'meses', 'DocEntry', '{}'::text[], 'data_owner_finanzas', 'plata_pago+',
   '"DocDate" >= ''2026-01-01''')
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, campo_fecha = EXCLUDED.campo_fecha,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       'pago', v.canonico, 'directo', v.sugerido, v.incluido, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ ORCT → pago (recibido) ============
  ('pagos_recibidos','ORCT','DocEntry',  'int',    'Llave interna del pago',        'pago_id',          true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocNum',    'int',    'Número visible',                'pago_numero',      true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocType',   'text',   'rCustomer / rAccount',          NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocDate',   'date',   'Fecha del pago',                'fecha_pago',       true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','TaxDate',   'date',   'Fecha contable',                'fecha_registro',   true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CardCode',  'text',   'Cliente',                       'socio_codigo',     true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CardName',  'text',   'Nombre del cliente',            NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocCurr',   'text',   'Moneda del pago',               'moneda_documento', true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocRate',   'numeric','Tasa',                          'tipo_cambio',      true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CashSum',   'numeric','Efectivo (moneda local)',       NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CheckSum',  'numeric','Cheques (moneda local)',        NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','TrsfrSum',  'numeric','Transferencia (moneda local)',  NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CreditSum', 'numeric','Tarjeta (moneda local)',        NULL,               true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','NoDocSum',  'numeric','Pago a cuenta (sin documento)', NULL,               true,  true,  NULL, NULL),
  -- *SumFC: confirmar con Descubrir antes de incluir (columna inexistente = extracción caída).
  ('pagos_recibidos','ORCT','CashSumFC', 'numeric','Efectivo (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_recibidos','ORCT','CheckSumFC','numeric','Cheques (moneda documento) — CONFIRMAR con Descubrir',  NULL, true, false, NULL, NULL),
  ('pagos_recibidos','ORCT','TrsfrSumFC','numeric','Transferencia (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_recibidos','ORCT','CreditSumFC','numeric','Tarjeta (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_recibidos','ORCT','Ref1',      'text',   'Referencia',                    'referencia',       false, true,  NULL, NULL),
  ('pagos_recibidos','ORCT','DocStatus', 'text',   'O abierto / C cerrado',         'estado',           true,  true,  NULL, NULL),
  ('pagos_recibidos','ORCT','CANCELED',  'text',   'N vigente; Y anulado, C cancelación (se excluyen)', NULL, true, true, '=', 'N'),
  ('pagos_recibidos','ORCT','CreateDate','date',   'Creación',                      NULL,               false, true,  NULL, NULL),
  ('pagos_recibidos','ORCT','UpdateDate','date',   'Última actualización',          NULL,               false, true,  NULL, NULL),

  -- ============ OVPM → pago (efectuado) ============
  ('pagos_efectuados','OVPM','DocEntry',  'int',    'Llave interna del pago',        'pago_id',          true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocNum',    'int',    'Número visible',                'pago_numero',      true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocType',   'text',   'rSupplier / rAccount',          NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocDate',   'date',   'Fecha del pago',                'fecha_pago',       true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','TaxDate',   'date',   'Fecha contable',                'fecha_registro',   true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CardCode',  'text',   'Proveedor',                     'socio_codigo',     true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CardName',  'text',   'Nombre del proveedor',          NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocCurr',   'text',   'Moneda del pago',               'moneda_documento', true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocRate',   'numeric','Tasa',                          'tipo_cambio',      true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CashSum',   'numeric','Efectivo (moneda local)',       NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CheckSum',  'numeric','Cheques (moneda local)',        NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','TrsfrSum',  'numeric','Transferencia (moneda local)',  NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CreditSum', 'numeric','Tarjeta (moneda local)',        NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','NoDocSum',  'numeric','Pago a cuenta (sin documento)', NULL,               true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CashSumFC', 'numeric','Efectivo (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_efectuados','OVPM','CheckSumFC','numeric','Cheques (moneda documento) — CONFIRMAR con Descubrir',  NULL, true, false, NULL, NULL),
  ('pagos_efectuados','OVPM','TrsfrSumFC','numeric','Transferencia (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_efectuados','OVPM','CreditSumFC','numeric','Tarjeta (moneda documento) — CONFIRMAR con Descubrir', NULL, true, false, NULL, NULL),
  ('pagos_efectuados','OVPM','Ref1',      'text',   'Referencia',                    'referencia',       false, true,  NULL, NULL),
  ('pagos_efectuados','OVPM','DocStatus', 'text',   'O abierto / C cerrado',         'estado',           true,  true,  NULL, NULL),
  ('pagos_efectuados','OVPM','CANCELED',  'text',   'N vigente; Y anulado, C cancelación (se excluyen)', NULL, true, true, '=', 'N'),
  ('pagos_efectuados','OVPM','CreateDate','date',   'Creación',                      NULL,               false, true,  NULL, NULL),
  ('pagos_efectuados','OVPM','UpdateDate','date',   'Última actualización',          NULL,               false, true,  NULL, NULL)
) AS v(objeto, tabla, campo, tipo, descripcion, canonico, sugerido, incluido, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, sugerido = EXCLUDED.sugerido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();

-- ================================================================= Odoo (ironnetwork)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'pagos', 'Pagos', 'tesoreria', 'hecho', 'abiertos', 'account_payment',
       NULL, NULL, NULL, 'id', '{}'::text[], 'data_owner_finanzas', 'plata_pago+', NULL
FROM org
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
SELECT org.id, 'pagos', 'account_payment', v.campo, false, v.tipo, v.descripcion,
       'pago', v.canonico, 'directo', v.sugerido, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  ('id',            'int',    'Llave interna del pago',                       'pago_id',          true,  NULL, NULL),
  ('name',          'text',   'Número visible',                               'pago_numero',      true,  NULL, NULL),
  ('payment_type',  'text',   'inbound = recibido / outbound = efectuado',    'tipo_pago',        true,  NULL, NULL),
  ('partner_type',  'text',   'customer / supplier',                          NULL,               true,  NULL, NULL),
  ('partner_id',    'int',    'Socio',                                        'socio_codigo',     true,  NULL, NULL),
  ('date',          'date',   'Fecha del pago',                               'fecha_pago',       true,  NULL, NULL),
  ('amount',        'numeric','Monto en moneda del pago (positivo)',          'monto_doc',        true,  NULL, NULL),
  ('amount_company_currency_signed', 'numeric', 'Monto en moneda de la compañía (negativo en outbound)', 'monto_local', true, NULL, NULL),
  ('currency_id',   'int',    'Moneda (id → se traduce con res_currency)',    'moneda_documento', true,  NULL, NULL),
  ('state',         'text',   'draft/canceled/rejected se excluyen',          'estado',           true,  'not in', 'draft,canceled,rejected'),
  ('memo',          'text',   'Referencia / memo',                            'referencia',       false, NULL, NULL),
  ('move_id',       'int',    'Asiento contable del pago',                    NULL,               true,  NULL, NULL),
  ('company_id',    'int',    'Compañía',                                     NULL,               true,  '=',  '1'),
  ('is_reconciled', 'bool',   'Conciliado',                                   NULL,               false, NULL, NULL),
  ('create_date',   'timestamp', 'Creación',                                  NULL,               false, NULL, NULL),
  ('write_date',    'timestamp', 'Última actualización',                      NULL,               false, NULL, NULL)
) AS v(campo, tipo, descripcion, canonico, sugerido, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, sugerido = EXCLUDED.sugerido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
