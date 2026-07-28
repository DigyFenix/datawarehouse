-- =====================================================================
-- Propósito : Conexiones a orígenes. Guardan host/puerto/base y la REFERENCIA
--             al secreto (nunca la credencial). Cada sociedad apunta a una
--             conexión (soporta empresas en distintos servidores).
-- Tablas    : gobierno.conexiones
-- Impacto   : bajo; config de administración. NUNCA guarda contraseñas.
-- Rollback  : metadata-store/rollback/94_conexiones_down.sql
-- Ref       : CLAUDE.md §12 (secretos por tenant), §Seguridad
-- =====================================================================

CREATE TABLE IF NOT EXISTS gobierno.conexiones (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre         text        NOT NULL UNIQUE,   -- 'HANA Server Principal'
  entorno_clave  text        NOT NULL,          -- FK lógica a metadatos.entornos_ejecucion.clave
  host           text        NOT NULL,
  puerto         integer     NOT NULL,
  base_datos     text,                          -- catálogo/BD por defecto (opcional)
  -- NUNCA el secreto: solo la referencia (nombre de variable/secreto en el secrets manager / .env).
  secreto_ref    text        NOT NULL,          -- p.ej. 'HANA_PRINCIPAL' -> HANA_PRINCIPAL_USER/PASSWORD
  activo         boolean     NOT NULL DEFAULT true,
  notas          text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gobierno.conexiones IS
  'Conexiones a orígenes (server/host/puerto/base). Guarda SOLO la referencia al secreto, nunca la credencial (§12).';
COMMENT ON COLUMN gobierno.conexiones.secreto_ref IS
  'Referencia al secreto en .env/secrets manager. El usuario/contraseña real NUNCA se persiste aquí.';
