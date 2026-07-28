-- =====================================================================
-- Propósito : Tipos enumerados compartidos del catálogo de metadatos.
-- Tablas    : (tipos) metadatos.estado_metrica
-- Impacto   : bajo; solo define dominios de valores.
-- Rollback  : metadata-store/rollback/10_tipos_down.sql
-- Ref       : CLAUDE.md §7, §9 (ciclo de certificación de métricas)
-- =====================================================================

-- Estado de certificación de una métrica (§9). El agente SOLO usa 'certificada'.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_metrica') THEN
    CREATE TYPE metadatos.estado_metrica AS ENUM (
      'borrador',
      'en_revision',
      'certificada',
      'deprecada',
      'exploratoria'
    );
  END IF;
END$$;
