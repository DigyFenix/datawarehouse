-- =====================================================================
-- Propósito : Registro de organizaciones (tenants) que administra el portal.
--             El portal (plano de control) las gestiona; no mueve datos.
-- Tablas    : gobierno.organizaciones
-- Impacto   : bajo; tabla de administración.
-- Rollback  : metadata-store/rollback/60_organizaciones_down.sql
-- Ref       : CLAUDE.md §4 (planos), §12 (Admin del portal), §3 (tenant)
-- =====================================================================

CREATE TABLE IF NOT EXISTS gobierno.organizaciones (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                text        NOT NULL UNIQUE,     -- p.ej. 'grupocresta'
  nombre                text        NOT NULL,
  sector                text,
  erp_tipo              text        NOT NULL DEFAULT 'sap_b1',  -- sap_b1 | odoo
  estado                text        NOT NULL DEFAULT 'en_arranque', -- activa | inactiva | en_arranque
  -- NUNCA el secreto: solo la referencia (nombre de variable/secreto en el secrets manager).
  secreto_conexion_ref  text,
  -- Marca (white-label): color primario del tenant en hex. Los demás tonos derivan de éste.
  color_marca           text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gobierno.organizaciones IS
  'Tenants administrados por el portal (§3, §4). El campo de conexión guarda SOLO una referencia al secreto, nunca el valor (§12).';
COMMENT ON COLUMN gobierno.organizaciones.secreto_conexion_ref IS
  'Referencia al secreto (nombre en secrets manager / variable .env). El valor real NUNCA se persiste aquí.';
