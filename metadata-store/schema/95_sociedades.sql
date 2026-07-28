-- =====================================================================
-- Propósito : Sociedades (empresas del grupo) administrables. Cada una apunta
--             a una conexión y define su esquema/BD de origen. Reemplaza el
--             registro estático de empresas.md como fuente de verdad.
-- Tablas    : gobierno.sociedades
-- Impacto   : bajo; config de administración.
-- Rollback  : metadata-store/rollback/95_sociedades_down.sql
-- Ref       : CLAUDE.md §3 (tenencia: empresa_id + RLS), empresas.md
-- =====================================================================

CREATE TABLE IF NOT EXISTS gobierno.sociedades (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id     text        NOT NULL UNIQUE,   -- canónico ('proavisa'); etiqueta cada fila Bronze
  nombre         text        NOT NULL,
  nit            text,
  -- Conexión a usar (FK lógica a gobierno.conexiones.id). Nullable hasta asignarla en el portal.
  conexion_id    bigint,
  -- Esquema/BD de origen en esa conexión (schema HANA / catálogo SQL Server / BD Odoo).
  esquema_origen text,                          -- 'SBOPROAVISA_'
  activo         boolean     NOT NULL DEFAULT true,
  orden          integer     NOT NULL DEFAULT 0,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_sociedad_conexion FOREIGN KEY (conexion_id)
    REFERENCES gobierno.conexiones(id) ON DELETE SET NULL
);

COMMENT ON TABLE  gobierno.sociedades IS
  'Sociedades del tenant. empresa_id canónico + conexión + esquema de origen. El extractor conecta por sociedad y etiqueta Bronze con empresa_id (§3).';
COMMENT ON COLUMN gobierno.sociedades.esquema_origen IS
  'Schema HANA / catálogo SQL Server / BD Odoo de esta sociedad en su conexión (p.ej. SBOPROAVISA_).';
