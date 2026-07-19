-- =====================================================================
-- Propósito : Glosario de negocio y linaje/trazabilidad (§7, §12).
-- Tablas    : metadata.glosario_negocio, metadata.linaje
-- Impacto   : bajo; catálogo de apoyo.
-- Rollback  : metadata-store/rollback/50_glosario_linaje_down.sql
-- Ref       : CLAUDE.md §7 (glosario traduce vocabulario), §12 (linaje)
-- =====================================================================

-- Glosario: traduce el vocabulario del negocio al canónico genérico sin ensuciarlo.
CREATE TABLE IF NOT EXISTS metadata.glosario_negocio (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  termino        text        NOT NULL UNIQUE,            -- término del negocio (p.ej. 'cartón')
  definicion     text        NOT NULL,
  equivale_a     text,                                   -- entidad/atributo canónico
  dominio        text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadata.glosario_negocio IS
  'Traduce el vocabulario del negocio al canónico. No ensucia el modelo canónico genérico (§7).';

-- Linaje: trazabilidad de cada objeto (tabla o métrica) hasta su origen (§12).
CREATE TABLE IF NOT EXISTS metadata.linaje (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objeto                 text        NOT NULL,           -- 'gold.fct_ventas_facturacion' | 'metrica:ventas_netas'
  tipo_objeto            text        NOT NULL,           -- 'tabla' | 'metrica'
  source_origen          text,                           -- ERP/schema/tabla de origen
  extraido_en            timestamptz,
  proceso_transformacion text,                           -- modelo dbt / script
  version_proceso        text,
  creado_en              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadata.linaje IS
  'Trazabilidad: reconstruir fuente, transformación y versión de cualquier dato o métrica (§12).';

CREATE INDEX IF NOT EXISTS ix_linaje_objeto ON metadata.linaje (objeto);
