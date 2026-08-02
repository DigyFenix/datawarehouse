-- =====================================================================
-- Propósito : TIPOS DE CAMBIO en la ingesta (pedido de Edwin 2026-08-01).
--               · SAP B1 : ORTT (RateDate, Currency, Rate) — Rate ya es "moneda local por
--                 1 unidad de la moneda extranjera".
--               · Odoo   : res_currency_rate — rate es unidades de la MONEDA por 1 unidad
--                 de moneda de la compañía → Plata lo invierte (1/rate).
--             La tabla es INFORMATIVA/analítica: los importes de los hechos NO se
--             reconvierten con estas tasas (decisión C1 — el ERP ya convirtió).
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Impacto   : bajo; solo metadatos.
-- Idempotente: sí.
-- =====================================================================

\set ON_ERROR_STOP on

-- ================================================================= SAP B1 (grupocresta)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'tipos_cambio', 'Tipos de cambio', 'finanzas', 'hecho', 'abiertos', 'ORTT',
       NULL, NULL, NULL, 'RateDate', '{}'::text[], 'data_owner_finanzas', 'plata_tipo_cambio+',
       '"RateDate" >= ''2025-01-01'''
FROM org
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET estrategia = EXCLUDED.estrategia, fuente_objeto = EXCLUDED.fuente_objeto,
       modelos_dbt = EXCLUDED.modelos_dbt, filtro_origen = EXCLUDED.filtro_origen,
       actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, 'tipos_cambio', 'ORTT', v.campo, false, v.tipo, v.descripcion,
       'tipo_cambio', v.canonico, 'directo', true, true, 'paquete_base', NULL, NULL
FROM org, (VALUES
  ('RateDate', 'date',    'Fecha de la tasa',                       'fecha'),
  ('Currency', 'text',    'Moneda',                                 'moneda_codigo'),
  ('Rate',     'numeric', 'Moneda local por 1 unidad de la moneda', 'tasa')
) AS v(campo, tipo, descripcion, canonico)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       actualizado_en = now();

-- ================================================================= Odoo (ironnetwork)
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'tipos_cambio', 'Tipos de cambio', 'finanzas', 'hecho', 'abiertos',
       'res_currency_rate', NULL, NULL, NULL, 'id', '{}'::text[],
       'data_owner_finanzas', 'plata_tipo_cambio+', NULL
FROM org
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET estrategia = EXCLUDED.estrategia, fuente_objeto = EXCLUDED.fuente_objeto,
       modelos_dbt = EXCLUDED.modelos_dbt, actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, 'tipos_cambio', 'res_currency_rate', v.campo, false, v.tipo, v.descripcion,
       'tipo_cambio', v.canonico, 'directo', true, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  ('id',          'int',     'Identificador',                                     NULL,           NULL, NULL),
  ('name',        'date',    'Fecha de la tasa',                                  'fecha',        NULL, NULL),
  ('currency_id', 'int',     'Moneda (id → se traduce con res_currency)',         'moneda_codigo',NULL, NULL),
  ('rate',        'numeric', 'Unidades de la moneda por 1 de moneda compañía → Plata invierte', 'tasa', NULL, NULL),
  ('company_id',  'int',     'Compañía',                                          NULL,           '=',  '1')
) AS v(campo, tipo, descripcion, canonico, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
