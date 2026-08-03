-- =====================================================================
-- Propósito : Moneda local por SOCIEDAD. El grupo dejó de ser monomoneda:
--             Proavisa de El Salvador (SBOSVPROAVIS) opera en USD y las
--             demás en GTQ. La maestra de empresas del plano de datos
--             (plata_organizacion) toma este valor por sociedad en vez de
--             la var global moneda_local.
-- Ejecución : sobre la base de control `cresta_dw`.
-- Tablas    : gobierno.sociedades (+ moneda)
-- Impacto   : bajo; columna nueva opcional (ISO 4217: GTQ, USD).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/113_sociedades_moneda_down.sql
-- =====================================================================

ALTER TABLE gobierno.sociedades
  ADD COLUMN IF NOT EXISTS moneda text;

COMMENT ON COLUMN gobierno.sociedades.moneda IS
  'Moneda local de la sociedad (ISO 4217: GTQ, USD). Se toma de OADM.MainCurncy al dar de '
  'alta (QTZ de SAP = GTQ). NULL = usar la moneda por defecto de la organización.';
