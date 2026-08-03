-- =====================================================================
-- Propósito : Moneda de PRESENTACIÓN por sociedad: a qué moneda se
--             consolidan sus cifras en Oro. Regla del producto (genérica,
--             sin fuente maestra): si difiere de la moneda local, la
--             conversión usa la serie de tipo de cambio de la PROPIA
--             sociedad (ORTT en SAP / rates en Odoo); sin tasa válida no
--             se convierte y la sociedad solo se lee en su moneda — quien
--             quiera consolidar, captura su tasa en el ERP.
-- Ejecución : sobre la base de control `cresta_dw`.
-- Tablas    : gobierno.sociedades (+ moneda_presentacion)
-- Impacto   : bajo; columna nueva con backfill = moneda local.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/114_moneda_presentacion_down.sql
-- =====================================================================

ALTER TABLE gobierno.sociedades
  ADD COLUMN IF NOT EXISTS moneda_presentacion text;

COMMENT ON COLUMN gobierno.sociedades.moneda_presentacion IS
  'Moneda a la que consolidan las cifras de la sociedad (ISO 4217). Igual a `moneda` = sin '
  'conversión. Distinta = convertir con la serie de tipo de cambio de la propia sociedad; '
  'sin tasa válida, los montos de grupo quedan nulos (la sociedad solo se lee en su moneda).';

-- Backfill: por defecto cada sociedad presenta en su propia moneda…
UPDATE gobierno.sociedades
   SET moneda_presentacion = moneda
 WHERE moneda_presentacion IS NULL;

-- …y Proavisa de El Salvador (USD) consolida al GTQ del grupo (solicitud 2026-08-02).
UPDATE gobierno.sociedades
   SET moneda_presentacion = 'GTQ', actualizado_en = now()
 WHERE empresa_id = 'svproavis';
