-- =====================================================================
-- Seed: roles de gobernanza del portal (§12) + rol de consumo.
-- Idempotente (ON CONFLICT sobre clave).
--
-- La CLAVE es el identificador del que dependen las guardas y no cambia nunca.
-- El NOMBRE y la DESCRIPCIÓN son lo que lee quien administra, así que van en
-- español y explican qué concede el rol, sin jerga del oficio.
-- =====================================================================
INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('data_owner',      'Aprobador de indicadores',
   'Da el visto bueno a los indicadores de su área. Hasta que aprueba, la cifra no llega a nadie.'),
  ('data_steward',    'Encargado de calidad',
   'Vigila que la información esté completa y bien clasificada, y mantiene el vocabulario del negocio.'),
  ('data_engineer',   'Encargado de conexiones',
   'Configura de dónde vienen los datos y con qué frecuencia se actualizan.'),
  ('bi_architect',    'Diseñador de indicadores',
   'Define qué se mide y cómo se calcula, y prepara el asistente de consultas.'),
  ('admin_portal',    'Administrador',
   'Da de alta empresas y personas, y decide quién ve qué. Control total de la plataforma.'),
  ('usuario_negocio', 'Consulta',
   'Ve tableros e indicadores dentro de lo que se le haya autorizado. No configura nada.')
ON CONFLICT (clave) DO NOTHING;
