-- =====================================================================
-- Seed: sociedades del tenant Grupo Cresta (de empresas.md). Sin conexión
-- asignada aún (se asigna en el portal al crear la conexión). Idempotente.
-- =====================================================================
INSERT INTO gobierno.sociedades (empresa_id, nombre, nit, esquema_origen, activo, orden)
VALUES
  ('proavisa',  'Productos Avícolas, S.A.',            '1230263',   'SBOPROAVISA_', true, 1),
  ('loreto',    'Avícola Loreto, S.A.',                '109967739', 'SBOLORETO_',   true, 2),
  ('organicos', 'Orgánicos El Paraíso, S.A.',          '90738772',  'SBOORGANICOS', true, 3),
  ('sepesa',    'Servicios Pecuarios, S.A.',           '4733851',   'SBOSEPESA',    true, 4),
  ('seragro',   'Servicios Agropecuarios, S.A.',       '4733843',   'SBOSERAGRO',   true, 5),
  ('inavisa',   'Industrias Avícolas Integradas, S.A.','5333814',   'SBOINAVISA',   true, 6)
ON CONFLICT (empresa_id) DO NOTHING;
