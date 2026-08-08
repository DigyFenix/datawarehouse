-- =============================================================================
-- ROLLBACK 125 · Retira el glosario propio del tenant
-- =============================================================================
-- ⚠ DESTRUCTIVO: elimina los términos que haya agregado el admin de la
--   organización. El glosario base del producto (base de control) no se toca, así
--   que el agente vuelve a funcionar sólo con él.
--   Respaldar antes:  \copy portal.glosario to 'glosario_<tenant>.csv' csv header
-- =============================================================================

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS portal.glosario;
