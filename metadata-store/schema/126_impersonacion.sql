-- =============================================================================
-- 126 · Tickets de impersonación  (SE APLICA EN LA BASE DEL TENANT)
-- =============================================================================
-- PROPÓSITO
--   Que el operador del producto pueda ver el portal EXACTAMENTE como lo ve un
--   usuario, sin conocer su contraseña. Es la mitad del soporte: «no me aparece
--   el tablero» se resuelve mirando, no preguntando.
--
--   Se descartó la alternativa de una contraseña maestra: sería UNA credencial
--   que abre cualquier cuenta de cualquier organización, y en la auditoría
--   quedaría el usuario suplantado en vez de quién entró de verdad.
--
--   El portal admin y el de usuario tienen secretos JWT DISTINTOS a propósito, así
--   que no se comparte firma: el admin deja aquí un ticket de un solo uso y el
--   portal de usuario lo canjea por una sesión suya.
--
-- OBJETOS AFECTADOS
--   Crea `portal.impersonaciones` en la base del tenant.
--
-- IMPACTO ESTIMADO
--   Tabla nueva y vacía.
--
-- DECISIONES DE SEGURIDAD
--   · Se guarda el HASH del ticket, no el ticket: quien lea la tabla no puede usarlo.
--   · Un solo uso (`usado_en`) y vida corta (`expira_en`, 2 minutos al emitirlo).
--   · La sesión resultante es de SOLO LECTURA: el portal rechaza toda mutación
--     mientras se está suplantando.
--   · Queda registrado quién suplantó a quién, aquí y en portal.auditoria.
--
-- APLICACIÓN
--   Por cada base `dw_*`:  psql -U <admin> -d dw_<codigo> -f 126_impersonacion.sql
--
-- ROLLBACK  →  metadata-store/rollback/126_impersonacion_down.sql
-- =============================================================================

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS portal.impersonaciones (
  id          bigserial   PRIMARY KEY,
  -- SHA-256 del ticket. El valor en claro sólo existe en la URL que se entrega.
  token_hash  text        NOT NULL UNIQUE,
  usuario_id  bigint      NOT NULL REFERENCES portal.usuarios(id) ON DELETE CASCADE,
  -- Correo del operador del producto que la solicitó (vive en OTRA base: sin FK).
  emitido_por text        NOT NULL,
  emitido_en  timestamptz NOT NULL DEFAULT now(),
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz,
  ip_emisor   text
);

CREATE INDEX IF NOT EXISTS ix_impersonaciones_usuario
    ON portal.impersonaciones (usuario_id, emitido_en DESC);

COMMENT ON TABLE portal.impersonaciones IS
  'Tickets de un solo uso para que el operador del producto vea el portal como un usuario, sin conocer su contraseña. La sesión resultante es de solo lectura.';
COMMENT ON COLUMN portal.impersonaciones.token_hash IS
  'SHA-256 del ticket: quien lea la tabla no puede usarlo.';
