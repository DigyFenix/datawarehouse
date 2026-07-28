-- =====================================================================
-- Propósito : Modelo canónico administrable (la "capa plata"). Define las
--             entidades canónicas y sus campos (el destino del mapeo desde el
--             origen). El portal lo administra; el mapeo de ingesta lo referencia.
--             Sembrado de los contratos en data-plane/canonico/entidades/*.yml.
-- Tablas    : metadatos.canonico_entidad, metadatos.canonico_campo
-- Impacto   : bajo; catálogo de metadatos.
-- Rollback  : metadata-store/rollback/97_canonico_down.sql
-- Ref       : CLAUDE.md §6 (Silver = costura agnóstica), §8, §13
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadatos.canonico_entidad (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave       text        NOT NULL UNIQUE,   -- 'socio_negocio', 'documento_venta', ...
  nombre      text        NOT NULL,
  dominio     text        NOT NULL,
  tipo        text        NOT NULL,          -- dimension | hecho_cabecera | hecho_linea
  descripcion text,
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metadatos.canonico_campo (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidad_clave text        NOT NULL,        -- FK lógica a canonico_entidad.clave
  nombre        text        NOT NULL,        -- 'socio_negocio_codigo', 'region', ...
  tipo          text        NOT NULL,        -- text | numeric | date | integer | boolean
  requerido     boolean     NOT NULL DEFAULT false,
  descripcion   text,
  orden         integer     NOT NULL DEFAULT 0,
  activo        boolean     NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_canonico_campo UNIQUE (entidad_clave, nombre),
  CONSTRAINT fk_canonico_campo_entidad FOREIGN KEY (entidad_clave)
    REFERENCES metadatos.canonico_entidad(clave) ON DELETE CASCADE
);

COMMENT ON TABLE metadatos.canonico_entidad IS
  'Entidades de la capa canónica (Silver). Destino agnóstico del mapeo desde el origen (§6).';
COMMENT ON TABLE metadatos.canonico_campo IS
  'Campos de una entidad canónica. El mapeo de ingesta (campo_ingesta.campo_canonico) apunta a estos.';
