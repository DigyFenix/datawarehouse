-- =====================================================================
-- Propósito : Usuarios, roles y autorizaciones (grants) del portal.
--             Dos controles independientes (§12): AUTORIZACIÓN (qué invoca)
--             y RLS (qué filas ve, se define en su módulo, Fase 3).
-- Tablas    : gobierno.usuarios, gobierno.roles, gobierno.usuario_roles,
--             gobierno.autorizaciones
-- Impacto   : medio; base del control de acceso del portal.
-- Rollback  : metadata-store/rollback/70_usuarios_roles_down.sql
-- Ref       : CLAUDE.md §12 (roles y acceso), §11 (rol autorizado)
-- =====================================================================

-- Usuarios del portal. Solo se persiste el HASH de la contraseña (nunca en claro).
CREATE TABLE IF NOT EXISTS gobierno.usuarios (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          text        NOT NULL UNIQUE,
  nombre         text        NOT NULL,
  hash_password  text        NOT NULL,                  -- argon2/bcrypt; NUNCA texto plano
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN gobierno.usuarios.hash_password IS 'Hash de contraseña (argon2/bcrypt). Nunca almacenar la contraseña en claro.';

-- Catálogo de roles (§12).
CREATE TABLE IF NOT EXISTS gobierno.roles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave       text NOT NULL UNIQUE,                      -- 'data_owner', 'admin_portal', ...
  nombre      text NOT NULL,
  descripcion text
);

-- Asignación usuario ↔ rol, opcionalmente acotada a una organización.
CREATE TABLE IF NOT EXISTS gobierno.usuario_roles (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id      bigint NOT NULL REFERENCES gobierno.usuarios (id) ON DELETE CASCADE,
  rol_id          bigint NOT NULL REFERENCES gobierno.roles (id)    ON DELETE CASCADE,
  organizacion_id bigint          REFERENCES gobierno.organizaciones (id) ON DELETE CASCADE,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, rol_id, organizacion_id)
);

-- Autorizaciones (grants): qué recurso puede invocar un rol (§12, control de AUTORIZACIÓN).
CREATE TABLE IF NOT EXISTS gobierno.autorizaciones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rol_id        bigint NOT NULL REFERENCES gobierno.roles (id) ON DELETE CASCADE,
  recurso_tipo  text   NOT NULL,                         -- 'dominio' | 'metrica' | 'portal'
  recurso_clave text   NOT NULL,                         -- 'ventas' | 'ventas_netas' | '*'
  permiso       text   NOT NULL,                         -- 'leer' | 'invocar' | 'certificar' | 'administrar'
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rol_id, recurso_tipo, recurso_clave, permiso)
);

COMMENT ON TABLE gobierno.autorizaciones IS
  'Grants por rol/dominio/métrica (§12). Control de AUTORIZACIÓN (qué se invoca), independiente del RLS (qué filas se ven).';

CREATE INDEX IF NOT EXISTS ix_usuario_roles_usuario ON gobierno.usuario_roles (usuario_id);
CREATE INDEX IF NOT EXISTS ix_autorizaciones_rol    ON gobierno.autorizaciones (rol_id);
