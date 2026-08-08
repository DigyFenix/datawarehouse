-- =====================================================================
-- Propósito : Ajustes salidos de la validación adversarial (2026-08-01):
--   1. Odoo: extraer `amount_residual_signed` — `amount_residual` está en MONEDA DEL
--      DOCUMENTO y positivo incluso en NC; el saldo local con signo canónico necesita
--      el campo *_signed (ver plata_documento_comercial).
--   2. SAP: variante de capitalización `Canceled` en ORCT/OVPM como campo SUGERIDO sin
--      incluir — los documentos de marketing usan CANCELED pero las tablas de pago pueden
--      usar Canceled según la versión. Descubrir confirma cuál existe; incluir esa y
--      excluir la otra (una columna inexistente en el SELECT tumba la extracción).
-- Tablas    : metadatos.campo_ingesta
-- Impacto   : bajo; solo metadatos. Requiere re-extraer `movimientos` (Odoo).
-- Idempotente: sí.
-- =====================================================================

\set ON_ERROR_STOP on

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'ironnetwork')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, 'movimientos', 'account_move', 'amount_residual_signed', false, 'numeric',
       'Saldo pendiente en moneda de la compañía, con signo (amount_residual va en moneda del documento)',
       'documento_comercial', 'saldo_documento_local', 'directo', true, true, 'paquete_base',
       NULL, NULL
FROM org
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       incluido = true, actualizado_en = now();

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = 'grupocresta')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, 'Canceled', false, 'text',
       'Variante de capitalización de CANCELED — Descubrir confirma cuál existe en esta versión; incluir esa y excluir la otra',
       'pago', NULL, 'directo', true, false, 'paquete_base', NULL, NULL
FROM org, (VALUES ('pagos_recibidos','ORCT'), ('pagos_efectuados','OVPM')) AS v(objeto, tabla)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, actualizado_en = now();
