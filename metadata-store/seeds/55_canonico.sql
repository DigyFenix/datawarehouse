-- =====================================================================
-- Seed: modelo canónico (capa plata) del primer corte order-to-cash.
-- Sembrado de los contratos data-plane/canonico/entidades/*.yml. Solo los
-- campos MAPEABLES desde el origen (empresa_id se asigna en extracción;
-- tipo_documento es constante por objeto). Idempotente.
-- =====================================================================

INSERT INTO metadatos.canonico_entidad (clave, nombre, dominio, tipo, descripcion)
VALUES
  ('socio_negocio',        'Socio de negocio (cliente)', 'datos_maestros', 'dimension',       'Maestro de clientes.'),
  ('documento_venta',      'Documento de venta (cabecera)', 'ventas',      'hecho_cabecera',  'Cabecera de factura / nota de crédito.'),
  ('linea_documento_venta','Línea de documento de venta',   'ventas',      'hecho_linea',     'Línea de factura / NC (grano del hecho).')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO metadatos.canonico_campo (entidad_clave, nombre, tipo, requerido, descripcion, orden)
VALUES
  -- socio_negocio
  ('socio_negocio', 'socio_negocio_codigo', 'text',    true,  'Código del cliente en el origen', 1),
  ('socio_negocio', 'nombre',               'text',    true,  'Razón social / nombre',           2),
  ('socio_negocio', 'nit',                  'text',    false, 'Identificación tributaria',       3),
  ('socio_negocio', 'region',               'text',    false, 'Región / zona (eje de RLS de cartera)', 4),
  ('socio_negocio', 'activo',               'boolean', false, 'Cliente activo',                  5),

  -- documento_venta (cabecera)
  ('documento_venta', 'documento_codigo',    'text',          true,  'Id del documento en el origen', 1),
  ('documento_venta', 'documento_numero',    'text',          false, 'Número visible del documento',  2),
  ('documento_venta', 'socio_negocio_codigo','text',          true,  'Cliente (FK socio_negocio)',    3),
  ('documento_venta', 'vendedor_codigo',     'text',          false, 'Vendedor',                      4),
  ('documento_venta', 'fecha_documento',     'date',          true,  'Fecha contable',                5),
  ('documento_venta', 'fecha_vencimiento',   'date',          false, 'Vencimiento (CxC / aging)',     6),
  ('documento_venta', 'moneda',              'text',          true,  'Código de moneda',              7),
  ('documento_venta', 'total_documento',     'numeric(18,4)', true,  'Total (signo según tipo)',      8),
  ('documento_venta', 'saldo_pagado',        'numeric(18,4)', false, 'Pagado a la fecha (CxC)',       9),
  ('documento_venta', 'estado_documento',    'text',          false, 'abierto | cerrado',            10),
  ('documento_venta', 'cancelado',           'text',          false, 'Cancelado (Y/N)',              11),

  -- linea_documento_venta (grano del hecho)
  ('linea_documento_venta', 'documento_codigo',    'text',          true,  'Documento padre',        1),
  ('linea_documento_venta', 'linea_numero',        'integer',       true,  'Número de línea',        2),
  ('linea_documento_venta', 'item_codigo',         'text',          true,  'Producto (FK item)',     3),
  ('linea_documento_venta', 'cantidad',            'numeric(18,4)', true,  'Cantidad',               4),
  ('linea_documento_venta', 'precio_unitario',     'numeric(18,4)', true,  'Precio unitario',        5),
  ('linea_documento_venta', 'monto_linea',         'numeric(18,4)', true,  'Monto de línea',         6),
  ('linea_documento_venta', 'sucursal_codigo',     'text',          false, 'Sucursal (dim_organizacion)', 7),
  ('linea_documento_venta', 'centro_costo_codigo', 'text',          false, 'Centro de costo',        8),
  ('linea_documento_venta', 'cuenta_codigo',       'text',          false, 'Cuenta contable',        9)
ON CONFLICT (entidad_clave, nombre) DO NOTHING;
