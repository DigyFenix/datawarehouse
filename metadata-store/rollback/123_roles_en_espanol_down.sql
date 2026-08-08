-- =============================================================================
-- ROLLBACK 123 · Devuelve los nombres de rol a su forma anterior (en inglés)
-- =============================================================================
-- Sólo texto visible; ninguna clave ni autorización se ve afectada.
-- =============================================================================

\set ON_ERROR_STOP on

UPDATE gobierno.roles SET nombre = 'Data Owner',
  descripcion = 'Certifica las métricas de su dominio.' WHERE clave = 'data_owner';
UPDATE gobierno.roles SET nombre = 'Data Steward',
  descripcion = 'Calidad de datos, catálogo y glosario.' WHERE clave = 'data_steward';
UPDATE gobierno.roles SET nombre = 'Data Engineer',
  descripcion = 'Pipelines, capas medallion y mapeos.' WHERE clave = 'data_engineer';
UPDATE gobierno.roles SET nombre = 'BI Architect',
  descripcion = 'Capa semántica y agente de IA.' WHERE clave = 'bi_architect';
UPDATE gobierno.roles SET nombre = 'Admin del Portal',
  descripcion = 'Organizaciones, usuarios, RLS y secretos.' WHERE clave = 'admin_portal';
UPDATE gobierno.roles SET nombre = 'Usuario de Negocio',
  descripcion = 'Consulta métricas certificadas según su autorización y RLS.' WHERE clave = 'usuario_negocio';
