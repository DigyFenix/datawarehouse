-- =====================================================================
-- Propósito : Catálogo de entornos de ejecución (tipo de origen). Define el
--             ERP + motor + driver que usa una conexión. Determina cómo el
--             extractor conecta e introspecta (dialecto de metadatos).
-- Tablas    : metadatos.entornos_ejecucion
-- Impacto   : bajo; catálogo de referencia.
-- Rollback  : metadata-store/rollback/93_entornos_ejecucion_down.sql
-- Ref       : CLAUDE.md §2 (agnóstico a ERP), §5 (stack por tenant)
-- =====================================================================

CREATE TABLE IF NOT EXISTS metadatos.entornos_ejecucion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave       text        NOT NULL UNIQUE,   -- 'sap_b1_hana', 'sap_b1_sqlserver', 'odoo'
  nombre      text        NOT NULL,          -- etiqueta legible
  erp         text        NOT NULL,          -- sap_b1 | odoo
  motor       text        NOT NULL,          -- hana | sqlserver | postgres
  driver      text        NOT NULL,          -- hdbcli | pyodbc | psycopg
  puerto_default integer,                    -- sugerencia de puerto (editable en la conexión)
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_entorno_erp   CHECK (erp   IN ('sap_b1', 'odoo')),
  CONSTRAINT ck_entorno_motor CHECK (motor IN ('hana', 'sqlserver', 'postgres'))
);

COMMENT ON TABLE metadatos.entornos_ejecucion IS
  'Tipos de origen (ERP + motor + driver). Una conexión referencia un entorno; el extractor elige driver e introspección según él (§2).';
