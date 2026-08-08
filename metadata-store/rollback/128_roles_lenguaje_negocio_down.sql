-- =============================================================================
-- ROLLBACK 128 · Devuelve los roles a los nombres del oficio de datos
-- =============================================================================
-- Sólo texto visible; ninguna clave ni autorización se ve afectada.
-- =============================================================================

\set ON_ERROR_STOP on

UPDATE gobierno.roles SET nombre = 'Responsable del dato',
  descripcion = 'Aprueba y certifica las métricas de su área. Mientras no firme, una métrica no llega a los usuarios.'
WHERE clave = 'data_owner';
UPDATE gobierno.roles SET nombre = 'Custodio del dato',
  descripcion = 'Cuida la calidad de la información, el catálogo de métricas y el vocabulario del negocio.'
WHERE clave = 'data_steward';
UPDATE gobierno.roles SET nombre = 'Ingeniero de datos',
  descripcion = 'Construye y opera las cargas desde el ERP y las capas del almacén.'
WHERE clave = 'data_engineer';
UPDATE gobierno.roles SET nombre = 'Arquitecto de análisis',
  descripcion = 'Define la capa semántica, las métricas certificadas y el asistente de consulta.'
WHERE clave = 'bi_architect';
UPDATE gobierno.roles SET nombre = 'Administrador del portal',
  descripcion = 'Da de alta organizaciones y usuarios, y decide quién ve qué datos.'
WHERE clave = 'admin_portal';
UPDATE gobierno.roles SET nombre = 'Usuario de negocio',
  descripcion = 'Consulta tableros y métricas certificadas dentro del alcance que se le asignó.'
WHERE clave = 'usuario_negocio';
