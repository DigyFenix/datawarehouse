-- =====================================================================
-- Seed: roles de gobernanza del portal (§12) + rol de consumo.
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('data_owner',    'Data Owner',    'Certifica las métricas de su dominio.'),
  ('data_steward',  'Data Steward',  'Calidad de datos, catálogo y glosario.'),
  ('data_engineer', 'Data Engineer', 'Pipelines, capas medallion y mapeos.'),
  ('bi_architect',  'BI Architect',  'Capa semántica y agente de IA.'),
  ('admin_portal',  'Admin del Portal', 'Organizaciones, usuarios, RLS y secretos.'),
  ('usuario_negocio', 'Usuario de Negocio', 'Consulta métricas certificadas según su autorización y RLS.')
ON CONFLICT (clave) DO NOTHING;
