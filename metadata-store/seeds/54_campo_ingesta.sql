-- =====================================================================
-- Seed: catálogo de campos (diccionario base SAP B1) para las entidades del
-- primer flujo: clientes (OCRD) y ventas (OINV cabecera + INV1 líneas).
-- Solo columnas NATIVAS; los campos de usuario (U_*) los agrega la
-- introspección real. Descripciones en español para el usuario. Idempotente.
--   sugerido = el motor lo recomienda ; incluido = entra al flujo por default.
-- =====================================================================

INSERT INTO metadatos.campo_ingesta
  (objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion, campo_canonico, transformacion, sugerido, incluido)
VALUES
  -- ===== clientes / OCRD =====
  ('clientes','OCRD','CardCode',   false,'texto',   'Código del cliente (identificador único)',        'socio_negocio_codigo','directo',     true, true),
  ('clientes','OCRD','CardName',   false,'texto',   'Razón social / nombre del cliente',               'nombre',              'directo',     true, true),
  ('clientes','OCRD','LicTradNum', false,'texto',   'NIT / identificación tributaria',                 'nit',                 'directo',     true, true),
  ('clientes','OCRD','CardType',   false,'texto',   'Tipo de socio (C=cliente; se usa como filtro)',   NULL,                  'directo',     true, false),
  ('clientes','OCRD','Territory',  false,'entero',  'Territorio / zona de ventas (candidato a región)','region',              'region',      true, true),
  ('clientes','OCRD','validFor',   false,'texto',   'Cliente activo (Y/N)',                            'activo',              'booleano_yn', true, true),
  ('clientes','OCRD','GroupCode',  false,'entero',  'Grupo / segmento comercial del cliente',          NULL,                  'directo',     true, false),
  ('clientes','OCRD','Currency',   false,'texto',   'Moneda por defecto del cliente',                  NULL,                  'directo',     true, false),
  ('clientes','OCRD','SlpCode',    false,'entero',  'Vendedor asignado',                               NULL,                  'directo',     true, false),
  ('clientes','OCRD','PymCode',    false,'entero',  'Condición de pago',                               NULL,                  'directo',     false, false),
  ('clientes','OCRD','ListNum',    false,'entero',  'Lista de precios asignada',                       NULL,                  'directo',     false, false),
  ('clientes','OCRD','Balance',    false,'numerico','Saldo actual del cliente',                        NULL,                  'cast_numeric',false, false),
  ('clientes','OCRD','CreditLine', false,'numerico','Límite de crédito',                               NULL,                  'cast_numeric',false, false),
  ('clientes','OCRD','Phone1',     false,'texto',   'Teléfono principal',                              NULL,                  'directo',     false, false),
  ('clientes','OCRD','E_Mail',     false,'texto',   'Correo electrónico',                              NULL,                  'directo',     false, false),

  -- ===== ventas_facturas / OINV (cabecera) =====
  ('ventas_facturas','OINV','DocEntry',   false,'entero',  'Id interno del documento',                    'documento_codigo','directo',     true, true),
  ('ventas_facturas','OINV','DocNum',     false,'entero',  'Número visible de la factura',                'documento_numero','directo',     true, true),
  ('ventas_facturas','OINV','CardCode',   false,'texto',   'Cliente (FK OCRD)',                           'socio_negocio_codigo','directo', true, true),
  ('ventas_facturas','OINV','DocDate',    false,'fecha',   'Fecha contable del documento',                'fecha_documento', 'cast_fecha',  true, true),
  ('ventas_facturas','OINV','DocDueDate', false,'fecha',   'Fecha de vencimiento (CxC / aging)',          'fecha_vencimiento','cast_fecha', true, true),
  ('ventas_facturas','OINV','DocTotal',   false,'numerico','Total del documento (con impuestos)',         'total_documento', 'cast_numeric',true, true),
  ('ventas_facturas','OINV','VatSum',     false,'numerico','Monto de IVA del documento',                  NULL,              'cast_numeric',true, true),
  ('ventas_facturas','OINV','DiscSum',    false,'numerico','Descuento total del documento',               NULL,              'cast_numeric',true, false),
  ('ventas_facturas','OINV','PaidToDate', false,'numerico','Pagado a la fecha (para saldo CxC)',          'saldo_pagado',    'cast_numeric',true, true),
  ('ventas_facturas','OINV','DocCur',     false,'texto',   'Moneda del documento',                        'moneda',          'directo',     true, true),
  ('ventas_facturas','OINV','DocStatus',  false,'texto',   'Estado (O=abierto, C=cerrado)',               'estado_documento','directo',     true, true),
  ('ventas_facturas','OINV','CANCELED',   false,'texto',   'Cancelado (Y/N)',                             'cancelado',       'directo',     true, true),
  ('ventas_facturas','OINV','SlpCode',    false,'entero',  'Vendedor',                                    'vendedor_codigo', 'directo',     true, true),
  ('ventas_facturas','OINV','TaxDate',    false,'fecha',   'Fecha de impuestos',                          NULL,              'cast_fecha',  false, false),
  ('ventas_facturas','OINV','DocRate',    false,'numerico','Tipo de cambio del documento',                NULL,              'cast_numeric',false, false),

  -- ===== ventas_facturas / INV1 (líneas) — GRANO DEL HECHO =====
  ('ventas_facturas','INV1','DocEntry',   false,'entero',  'Documento padre',                             'documento_codigo','directo',     true, true),
  ('ventas_facturas','INV1','LineNum',    false,'entero',  'Número de línea',                             'linea_numero',    'directo',     true, true),
  ('ventas_facturas','INV1','ItemCode',   false,'texto',   'Producto (FK OITM)',                          'item_codigo',     'directo',     true, true),
  ('ventas_facturas','INV1','Dscription', false,'texto',   'Descripción del ítem',                        NULL,              'directo',     true, false),
  ('ventas_facturas','INV1','Quantity',   false,'numerico','Cantidad',                                    'cantidad',        'cast_numeric',true, true),
  ('ventas_facturas','INV1','Price',      false,'numerico','Precio unitario (sin IVA)',                   'precio_unitario', 'cast_numeric',true, true),
  ('ventas_facturas','INV1','LineTotal',  false,'numerico','Total de línea (neto, sin IVA)',              'monto_linea',     'cast_numeric',true, true),
  ('ventas_facturas','INV1','VatSum',     false,'numerico','IVA de la línea',                             NULL,              'cast_numeric',true, true),
  ('ventas_facturas','INV1','VatPrcnt',   false,'numerico','% de IVA de la línea',                        NULL,              'cast_numeric',true, false),
  ('ventas_facturas','INV1','StockPrice', false,'numerico','Costo del ítem (base para margen)',           NULL,              'cast_numeric',true, true),
  ('ventas_facturas','INV1','GrssProfit', false,'numerico','Utilidad bruta de la línea',                  NULL,              'cast_numeric',true, false),
  ('ventas_facturas','INV1','WhsCode',    false,'texto',   'Almacén / sucursal',                          'sucursal_codigo', 'directo',     true, true),
  ('ventas_facturas','INV1','OcrCode',    false,'texto',   'Centro de costo',                             'centro_costo_codigo','directo',  true, true),
  ('ventas_facturas','INV1','AcctCode',   false,'texto',   'Cuenta contable',                             'cuenta_codigo',   'directo',     true, true),
  ('ventas_facturas','INV1','PriceAfVAT', false,'numerico','Precio unitario (con IVA)',                   NULL,              'cast_numeric',false, false),
  ('ventas_facturas','INV1','GTotal',     false,'numerico','Total de línea (bruto, con IVA)',             NULL,              'cast_numeric',false, false),
  ('ventas_facturas','INV1','DiscPrcnt',  false,'numerico','% de descuento de la línea',                  NULL,              'cast_numeric',false, false),
  ('ventas_facturas','INV1','GrossBuyPr', false,'numerico','Precio de compra bruto',                      NULL,              'cast_numeric',false, false)
ON CONFLICT (objeto, tabla_origen, campo_origen) DO NOTHING;
