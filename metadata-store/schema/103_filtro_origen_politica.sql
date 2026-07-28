-- =====================================================================
-- Propósito : Escotilla controlada para filtros de origen que NO se pueden
--             expresar como "campo operador valor".
-- Motivo    : la cartera de SAP B1 se acota con `"BalDueDeb" <> "BalDueCred"`
--             (campo contra campo). Sin esto habría que traer 1,043,823 partidas
--             del mayor en lugar de 9,682: 100x más datos para el mismo resultado.
-- Tablas    : metadatos.politica_ingesta (+ filtro_origen)
-- Impacto   : bajo (columna nueva, nullable).
--
-- SEGURIDAD: `filtro_origen` es un fragmento SQL que se concatena al WHERE de la
-- consulta READ-ONLY contra el ERP. Es configuración del PAQUETE BASE, versionada
-- en git y revisada — NO entrada de usuario final ni de un LLM. No confundir con
-- la prohibición de SQL libre del agente (CLAUDE.md §11/§14), que aplica a
-- consultas generadas por el modelo contra el warehouse.
-- Reglas: solo lectura, sin punto y coma, sin comentarios SQL, sin DML/DDL.
--
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/103_filtro_origen_politica_down.sql
-- =====================================================================

ALTER TABLE metadatos.politica_ingesta
  ADD COLUMN IF NOT EXISTS filtro_origen text;

COMMENT ON COLUMN metadatos.politica_ingesta.filtro_origen IS
  'Fragmento SQL adicional para el WHERE de la extracción read-only (campo contra campo, '
  'expresiones). Config del paquete base, versionada y revisada. Sin ";", sin comentarios, '
  'sin DML/DDL: solo una condición booleana.';

-- Guarda mínima: rechaza lo obvio (terminadores, comentarios, palabras de escritura).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_politica_filtro_origen_seguro') THEN
    ALTER TABLE metadatos.politica_ingesta
      ADD CONSTRAINT ck_politica_filtro_origen_seguro CHECK (
        filtro_origen IS NULL OR (
          position(';'  in filtro_origen) = 0 AND
          position('--' in filtro_origen) = 0 AND
          position('/*' in filtro_origen) = 0 AND
          filtro_origen !~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|call|exec)\y'
        )
      );
  END IF;
END $$;
