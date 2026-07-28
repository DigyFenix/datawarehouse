-- =====================================================================
-- Rollback de 102_ingesta_por_organizacion.sql
-- Devuelve la ingesta a configuración global (un solo ERP por instalación).
-- ADVERTENCIA: si hay más de una organización con políticas, las claves únicas
-- globales van a colisionar. Verificar antes:
--   SELECT objeto, count(*) FROM metadatos.politica_ingesta GROUP BY 1 HAVING count(*) > 1;
--   SELECT objeto, tabla_origen, campo_origen, count(*) FROM metadatos.campo_ingesta
--    GROUP BY 1,2,3 HAVING count(*) > 1;
-- Si devuelven filas, hay que borrar las de la organización sobrante primero.
-- =====================================================================

DROP INDEX IF EXISTS metadatos.ix_campo_organizacion;
DROP INDEX IF EXISTS metadatos.ix_politica_organizacion;

-- campos
ALTER TABLE metadatos.campo_ingesta DROP CONSTRAINT IF EXISTS uq_campo_org;
ALTER TABLE metadatos.campo_ingesta DROP CONSTRAINT IF EXISTS fk_campo_organizacion;
ALTER TABLE metadatos.campo_ingesta
  ADD CONSTRAINT uq_campo UNIQUE (objeto, tabla_origen, campo_origen);
ALTER TABLE metadatos.campo_ingesta DROP COLUMN IF EXISTS organizacion_id;

-- política
ALTER TABLE metadatos.politica_ingesta DROP CONSTRAINT IF EXISTS uq_politica_org_objeto;
ALTER TABLE metadatos.politica_ingesta DROP CONSTRAINT IF EXISTS fk_politica_organizacion;
ALTER TABLE metadatos.politica_ingesta
  ADD CONSTRAINT politica_ingesta_objeto_key UNIQUE (objeto);
ALTER TABLE metadatos.politica_ingesta DROP COLUMN IF EXISTS organizacion_id;
