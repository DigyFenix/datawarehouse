-- =============================================================================
-- 123 · Nombres y descripciones de los roles, en español
-- =============================================================================
-- PROPÓSITO
--   Los seis roles de gobernanza se mostraban con su nombre en inglés («Data
--   Owner», «BI Architect») y descripciones escritas para quien construyó el
--   sistema, no para quien lo administra. El portal es en español y quien asigna
--   un rol necesita entender qué concede sin conocer la jerga del oficio.
--
--   Se cambia SOLO lo visible. La clave (`data_owner`, `bi_architect`…) es un
--   identificador del que dependen guardas y seeds: no se toca.
--
-- OBJETOS AFECTADOS
--   `gobierno.roles` — columnas `nombre` y `descripcion` de 6 filas.
--
-- IMPACTO ESTIMADO
--   6 filas actualizadas. Ninguna autorización cambia: el permiso vive en
--   `gobierno.autorizaciones` y en las claves, no en el texto.
--
-- ROLLBACK  →  metadata-store/rollback/123_roles_en_espanol_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

UPDATE gobierno.roles SET
  nombre = 'Responsable del dato',
  descripcion = 'Aprueba y certifica las métricas de su área. Mientras no firme, una métrica no llega a los usuarios.'
WHERE clave = 'data_owner';

UPDATE gobierno.roles SET
  nombre = 'Custodio del dato',
  descripcion = 'Cuida la calidad de la información, el catálogo de métricas y el vocabulario del negocio.'
WHERE clave = 'data_steward';

UPDATE gobierno.roles SET
  nombre = 'Ingeniero de datos',
  descripcion = 'Construye y opera las cargas desde el ERP y las capas del almacén.'
WHERE clave = 'data_engineer';

UPDATE gobierno.roles SET
  nombre = 'Arquitecto de análisis',
  descripcion = 'Define la capa semántica, las métricas certificadas y el asistente de consulta.'
WHERE clave = 'bi_architect';

UPDATE gobierno.roles SET
  nombre = 'Administrador del portal',
  descripcion = 'Da de alta organizaciones y usuarios, y decide quién ve qué datos.'
WHERE clave = 'admin_portal';

UPDATE gobierno.roles SET
  nombre = 'Usuario de negocio',
  descripcion = 'Consulta tableros y métricas certificadas dentro del alcance que se le asignó.'
WHERE clave = 'usuario_negocio';

DO $$
DECLARE faltan int;
BEGIN
  SELECT count(*) INTO faltan FROM gobierno.roles WHERE nombre ~ '[Dd]ata |Architect|Admin del';
  IF faltan > 0 THEN
    RAISE EXCEPTION 'Quedan % roles con nombre en inglés', faltan;
  END IF;
  RAISE NOTICE 'Roles traducidos al español';
END $$;
