-- =====================================================================
-- Seed: políticas + plan de ingesta del primer corte order-to-cash (§15).
-- Ventana por defecto 12 meses para hechos; CxC = abiertos (todos los
-- DocStatus=O, sin filtro de fecha); maestros full_replace salvo clientes
-- (versionado por cambios de nombre/región). Idempotente (ON CONFLICT).
-- =====================================================================

-- Hechos (ventana móvil por fecha de documento) y CxC (documentos abiertos).
INSERT INTO metadatos.politica_ingesta
  (objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado, owner)
VALUES
  ('ventas_facturas', 'Ventas — Facturas', 'ventas', 'hecho', 'incremental_ventana',
   'OINV+INV1', 'DocDate', 12, 'meses', 'DocEntry,LineNum', '{}', 'data_engineer'),

  ('ventas_notas_credito', 'Ventas — Notas de crédito', 'ventas', 'hecho', 'incremental_ventana',
   'ORIN+RIN1', 'DocDate', 12, 'meses', 'DocEntry,LineNum', '{}', 'data_engineer'),

  -- CxC/Aging: trae TODOS los documentos abiertos (DocStatus='O') sin ventana de
  -- fecha, para no perder saldos anteriores a la ventana de ventas.
  ('cxc', 'Cuentas por cobrar (abiertos)', 'tesoreria', 'hecho', 'abiertos',
   'OINV', NULL, NULL, NULL, 'DocEntry', '{}', 'data_engineer'),

  -- Maestros.
  ('clientes', 'Clientes', 'datos_maestros', 'maestro', 'versionado',
   'OCRD', NULL, NULL, NULL, 'CardCode', '{nombre,region}', 'data_steward'),

  ('items', 'Productos', 'datos_maestros', 'maestro', 'full_replace',
   'OITM', NULL, NULL, NULL, 'ItemCode', '{}', 'data_steward'),

  ('vendedores', 'Vendedores', 'datos_maestros', 'maestro', 'full_replace',
   'OSLP', NULL, NULL, NULL, 'SlpCode', '{}', 'data_steward'),

  ('centros_costo', 'Centros de costo', 'datos_maestros', 'maestro', 'full_replace',
   'OOCR', NULL, NULL, NULL, 'OcrCode', '{}', 'data_steward'),

  ('cuentas', 'Cuentas contables', 'datos_maestros', 'maestro', 'full_replace',
   'OACT', NULL, NULL, NULL, 'AcctCode', '{}', 'data_steward')
ON CONFLICT (objeto) DO NOTHING;

-- Plan de corrida: una sola corrida encadenada (extracción → Bronze → dbt → Gold),
-- un cron, par piloto proavisa+loreto, todos los objetos order-to-cash.
INSERT INTO metadatos.plan_ingesta
  (nombre, descripcion, cron, empresas, objetos, encadena_transformacion)
VALUES
  ('order-to-cash',
   'Corrida diaria del primer corte order-to-cash (par piloto).',
   '0 5 * * *',
   '{proavisa,loreto}',
   '{ventas_facturas,ventas_notas_credito,cxc,clientes,items,vendedores,centros_costo,cuentas}',
   true)
ON CONFLICT (nombre) DO NOTHING;
