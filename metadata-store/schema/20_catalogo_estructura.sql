-- =====================================================================
-- Propósito : Catálogo estructural — hechos y dimensiones del modelo Oro.
--             El agente razona sobre estos metadatos, NUNCA sobre nombres
--             físicos de tabla (CLAUDE.md §7).
-- Tablas    : metadatos.catalogo_hechos, metadatos.catalogo_dimensiones
-- Impacto   : bajo; tablas de catálogo (no de negocio).
-- Rollback  : metadata-store/rollback/20_catalogo_estructura_down.sql
-- Ref       : CLAUDE.md §7, §8
-- =====================================================================

-- Hechos del modelo dimensional (grano = línea de documento, §8).
CREATE TABLE IF NOT EXISTS metadatos.catalogo_hechos (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave          text        NOT NULL UNIQUE,          -- p.ej. 'hecho_venta_linea'
  nombre_negocio text        NOT NULL,
  grano          text        NOT NULL,                 -- 'línea de documento'
  dominio        text        NOT NULL,                 -- ventas | tesoreria | ...
  descripcion    text,
  tabla_oro      text,                                 -- referencia física (no expuesta al agente)
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadatos.catalogo_hechos IS
  'Hechos del modelo estrella (§8). El agente los referencia por clave, no por tabla física.';

-- Dimensiones. Regla: toda dimensión tiene miembro default/desconocido (§8).
CREATE TABLE IF NOT EXISTS metadatos.catalogo_dimensiones (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave                text        NOT NULL UNIQUE,     -- p.ej. 'dim_cliente'
  nombre_negocio       text        NOT NULL,
  descripcion          text,
  tiene_miembro_default boolean    NOT NULL DEFAULT true,
  tabla_oro            text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadatos.catalogo_dimensiones IS
  'Dimensiones del modelo estrella (§8). Toda dimensión debe tener miembro default para que el hecho siempre cruce.';
