-- =============================================================================
-- ROLLBACK 129 · Restituye los roles del oficio de datos
-- =============================================================================
-- Las ASIGNACIONES que hubieran tenido no se restauran (la migración sólo se
-- aplica cuando no hay ninguna, así que no había nada que perder).
-- =============================================================================

\set ON_ERROR_STOP on

INSERT INTO gobierno.roles (clave, nombre, descripcion) VALUES
  ('data_owner',      'Aprobador de indicadores',
   'Da el visto bueno a los indicadores de su área. Hasta que aprueba, la cifra no llega a nadie.'),
  ('data_steward',    'Encargado de calidad',
   'Vigila que la información esté completa y bien clasificada, y mantiene el vocabulario del negocio.'),
  ('data_engineer',   'Encargado de conexiones',
   'Configura de dónde vienen los datos y con qué frecuencia se actualizan.'),
  ('bi_architect',    'Diseñador de indicadores',
   'Define qué se mide y cómo se calcula, y prepara el asistente de consultas.'),
  ('usuario_negocio', 'Consulta',
   'Ve tableros e indicadores dentro de lo que se le haya autorizado. No configura nada.')
ON CONFLICT (clave) DO NOTHING;

DELETE FROM gobierno.roles WHERE clave = 'admin_organizacion';

UPDATE gobierno.roles SET nombre = 'Administrador',
  descripcion = 'Da de alta empresas y personas, y decide quién ve qué. Control total de la plataforma.'
WHERE clave = 'admin_portal';
