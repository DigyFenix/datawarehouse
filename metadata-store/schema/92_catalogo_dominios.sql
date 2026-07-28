-- =====================================================================
-- Propósito : Catálogo administrable de dominios de negocio. Los usan las
--             políticas de ingesta, el catálogo de métricas/hechos y el
--             glosario para clasificar por área (ventas, tesoreria, ...).
--             Se administra desde el portal (no valores libres sueltos).
-- Tablas    : metadatos.catalogo_dominios
-- Impacto   : bajo; tabla de catálogo.
-- Rollback  : metadata-store/rollback/92_catalogo_dominios_down.sql
-- Ref       : CLAUDE.md §2 (dominios por negocio), §7
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadatos.catalogo_dominios (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave       text        NOT NULL UNIQUE,   -- 'ventas', 'tesoreria', ...
  nombre      text        NOT NULL,          -- etiqueta legible
  descripcion text,
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metadatos.catalogo_dominios IS
  'Dominios de negocio administrables (§2). Regla: dominio = dueño del dato; consulta cruzada = permiso, no reasignación.';
