-- =============================================================================
-- 128 · Roles con nombres de negocio, no de oficio
-- =============================================================================
-- PROPÓSITO
--   «Responsable del dato», «Custodio del dato» o «Arquitecto de análisis» son
--   nombres del oficio de datos: describen una disciplina, no lo que la persona
--   hace en el portal. Quien asigna un rol es un gerente eligiendo qué puede tocar
--   alguien de su equipo, y necesita leer la acción, no la profesión.
--
--   Cada nombre pasa a decir QUÉ HACE quien lo tiene, y la descripción explica el
--   alcance en una frase.
--
--     Responsable del dato    → Aprobador de indicadores
--     Custodio del dato       → Encargado de calidad
--     Ingeniero de datos      → Encargado de conexiones
--     Arquitecto de análisis  → Diseñador de indicadores
--     Administrador del portal→ Administrador
--     Usuario de negocio      → Consulta
--
--   La CLAVE (`data_owner`, `bi_architect`…) no se toca: de ella dependen las
--   guardas del API, los seeds y el paquete del agente.
--
-- OBJETOS AFECTADOS
--   `gobierno.roles` — `nombre` y `descripcion` de 6 filas. Ninguna autorización
--   cambia: el permiso vive en `gobierno.autorizaciones` y en las claves.
--
-- ROLLBACK  →  metadata-store/rollback/128_roles_lenguaje_negocio_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

UPDATE gobierno.roles SET
  nombre = 'Aprobador de indicadores',
  descripcion = 'Da el visto bueno a los indicadores de su área. Hasta que aprueba, la cifra no llega a nadie.'
WHERE clave = 'data_owner';

UPDATE gobierno.roles SET
  nombre = 'Encargado de calidad',
  descripcion = 'Vigila que la información esté completa y bien clasificada, y mantiene el vocabulario del negocio.'
WHERE clave = 'data_steward';

UPDATE gobierno.roles SET
  nombre = 'Encargado de conexiones',
  descripcion = 'Configura de dónde vienen los datos y con qué frecuencia se actualizan.'
WHERE clave = 'data_engineer';

UPDATE gobierno.roles SET
  nombre = 'Diseñador de indicadores',
  descripcion = 'Define qué se mide y cómo se calcula, y prepara el asistente de consultas.'
WHERE clave = 'bi_architect';

UPDATE gobierno.roles SET
  nombre = 'Administrador',
  descripcion = 'Da de alta empresas y personas, y decide quién ve qué. Control total de la plataforma.'
WHERE clave = 'admin_portal';

UPDATE gobierno.roles SET
  nombre = 'Consulta',
  descripcion = 'Ve tableros e indicadores dentro de lo que se le haya autorizado. No configura nada.'
WHERE clave = 'usuario_negocio';

DO $$
DECLARE tecnicos int;
BEGIN
  SELECT count(*) INTO tecnicos FROM gobierno.roles
   WHERE nombre ~* '(dato|arquitect|ingenier|custodi)';
  IF tecnicos > 0 THEN
    RAISE EXCEPTION 'Quedan % roles con nombre de oficio', tecnicos;
  END IF;
  RAISE NOTICE 'Roles renombrados en lenguaje de negocio';
END $$;
