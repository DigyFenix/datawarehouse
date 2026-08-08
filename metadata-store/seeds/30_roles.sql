-- =====================================================================
-- Seed: roles de gobernanza del portal (§12) + rol de consumo.
-- Idempotente (ON CONFLICT sobre clave).
--
-- La CLAVE es el identificador del que dependen las guardas y no cambia nunca.
-- El NOMBRE y la DESCRIPCIÓN son lo que lee quien administra, así que van en
-- español y explican qué concede el rol, sin jerga del oficio.
-- =====================================================================
INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('data_owner',      'Responsable del dato',
   'Aprueba y certifica las métricas de su área. Mientras no firme, una métrica no llega a los usuarios.'),
  ('data_steward',    'Custodio del dato',
   'Cuida la calidad de la información, el catálogo de métricas y el vocabulario del negocio.'),
  ('data_engineer',   'Ingeniero de datos',
   'Construye y opera las cargas desde el ERP y las capas del almacén.'),
  ('bi_architect',    'Arquitecto de análisis',
   'Define la capa semántica, las métricas certificadas y el asistente de consulta.'),
  ('admin_portal',    'Administrador del portal',
   'Da de alta organizaciones y usuarios, y decide quién ve qué datos.'),
  ('usuario_negocio', 'Usuario de negocio',
   'Consulta tableros y métricas certificadas dentro del alcance que se le asignó.')
ON CONFLICT (clave) DO NOTHING;
