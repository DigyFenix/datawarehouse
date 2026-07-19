-- =====================================================================
-- Propósito : Auditoría de todo cambio en el portal (§12). El portal
--             gobierna a la gobernanza: cada cambio queda registrado con
--             quién, qué, cuándo y el antes/después.
-- Tablas    : gobierno.auditoria
-- Impacto   : bajo; tabla append-only de trazabilidad.
-- Rollback  : metadata-store/rollback/80_auditoria_down.sql
-- Ref       : CLAUDE.md §12 (auditoría + versionado de metadatos)
-- =====================================================================

CREATE TABLE IF NOT EXISTS gobierno.auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en  timestamptz NOT NULL DEFAULT now(),
  usuario_id   bigint      REFERENCES gobierno.usuarios (id) ON DELETE SET NULL,
  usuario_email text,                                    -- desnormalizado (sobrevive al borrado del usuario)
  accion       text        NOT NULL,                     -- crear | actualizar | eliminar | certificar | login | ...
  entidad      text        NOT NULL,                     -- tabla/objeto afectado (p.ej. 'organizaciones')
  entidad_id   text,                                     -- id del registro afectado
  antes        jsonb,                                    -- estado previo (null en creación)
  despues      jsonb,                                    -- estado posterior (null en borrado)
  ip           text
);

COMMENT ON TABLE gobierno.auditoria IS
  'Log append-only de todo cambio del portal (§12). No se actualiza ni se borra; base de la trazabilidad de la administración.';

CREATE INDEX IF NOT EXISTS ix_auditoria_entidad ON gobierno.auditoria (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha   ON gobierno.auditoria (ocurrido_en);
