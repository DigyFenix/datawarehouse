-- =====================================================================
-- Seed: organización (tenant) de esta instancia — Grupo Cresta.
-- La conexión guarda SOLO la referencia al secreto (§12), nunca el valor.
-- Idempotente (ON CONFLICT sobre codigo).
-- =====================================================================
INSERT INTO gobierno.organizaciones (codigo, nombre, sector, erp_tipo, estado, secreto_conexion_ref)
VALUES
  ('grupocresta', 'Grupo Cresta', 'Avícola — venta de huevos', 'sap_b1', 'en_arranque', 'HANA_* (.env)')
ON CONFLICT (codigo) DO NOTHING;
