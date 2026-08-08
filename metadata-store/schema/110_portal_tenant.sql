-- =====================================================================
-- Propósito : Esquema `portal` del PORTAL DE USUARIO dentro de la base del
--             tenant. Cada organización se auto-administra: su admin crea
--             usuarios, perfiles y decide qué tablero ve cada perfil.
--             Los tableros son URLs de Power BI (Publish to Web) dadas de
--             alta por el proveedor desde el portal admin.
-- Ejecución : psql -d dw_<codigo> -f 110_portal_tenant.sql
--             (NO se ejecuta sobre la base de control `quilate_control`)
-- Tablas    : portal.usuarios, portal.perfiles, portal.usuario_perfiles,
--             portal.tableros, portal.perfil_tableros, portal.perfil_alcances,
--             portal.auditoria
-- Impacto   : bajo; estructura nueva, no toca bronce/plata/oro.
-- Rollback  : metadata-store/rollback/110_portal_tenant_down.sql
-- Ref       : CLAUDE.md §3 (instancia por tenant), §12 (acceso y auditoría)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS portal;

COMMENT ON SCHEMA portal IS
  'Portal de usuario de ESTA organización: usuarios finales, perfiles, tableros y auditoría. '
  'Vive en la base del tenant para aislar errores y accesos entre organizaciones.';

-- Usuarios finales de la organización. Solo se persiste el HASH (argon2).
CREATE TABLE IF NOT EXISTS portal.usuarios (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email                 text        NOT NULL UNIQUE,
  nombre                text        NOT NULL,
  hash_password         text        NOT NULL,             -- argon2; NUNCA texto plano
  es_admin              boolean     NOT NULL DEFAULT false, -- admin de la org: gestiona usuarios/perfiles
  debe_cambiar_password boolean     NOT NULL DEFAULT true,  -- alta con contraseña temporal
  activo                boolean     NOT NULL DEFAULT true,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN portal.usuarios.hash_password IS 'Hash argon2. Nunca almacenar la contraseña en claro.';

-- Perfiles de acceso de la organización ('gerencia', 'finanzas', ...).
-- Hoy gobiernan tableros; mañana, los alcances del chatbot (perfil_alcances).
CREATE TABLE IF NOT EXISTS portal.perfiles (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave          text        NOT NULL UNIQUE,
  nombre         text        NOT NULL,
  descripcion    text,
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal.usuario_perfiles (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES portal.usuarios (id) ON DELETE CASCADE,
  perfil_id  bigint NOT NULL REFERENCES portal.perfiles (id) ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, perfil_id)
);

-- Tableros publicados por el PROVEEDOR (Publish to Web). El alta se hace
-- desde el portal admin; aquí solo se consumen y asignan a perfiles.
CREATE TABLE IF NOT EXISTS portal.tableros (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave          text        NOT NULL UNIQUE,
  nombre         text        NOT NULL,
  descripcion    text,
  modulo         text        NOT NULL DEFAULT 'powerbi',
  url_publica    text        NOT NULL,                    -- URL del iframe (Publish to Web)
  orden          int         NOT NULL DEFAULT 0,
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tablero_modulo CHECK (modulo IN ('powerbi', 'chatbot'))
);

COMMENT ON COLUMN portal.tableros.url_publica IS
  'URL pública de Publish to Web. Es pública por naturaleza (riesgo aceptado): el portal '
  'solo la entrega a usuarios autenticados con perfil autorizado y audita cada apertura.';

CREATE TABLE IF NOT EXISTS portal.perfil_tableros (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  perfil_id  bigint NOT NULL REFERENCES portal.perfiles (id) ON DELETE CASCADE,
  tablero_id bigint NOT NULL REFERENCES portal.tableros (id) ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, tablero_id)
);

-- Alcances del perfil para el CHATBOT (preparado desde ya, se consume en Fase 4
-- del roadmap): qué dominios/métricas del catálogo podrá consultar cada perfil.
CREATE TABLE IF NOT EXISTS portal.perfil_alcances (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  perfil_id     bigint NOT NULL REFERENCES portal.perfiles (id) ON DELETE CASCADE,
  recurso_tipo  text   NOT NULL,                          -- 'dominio' | 'metrica'
  recurso_clave text   NOT NULL,                          -- 'ventas' | 'ventas_netas' | '*'
  permiso       text   NOT NULL DEFAULT 'consultar',
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, recurso_tipo, recurso_clave, permiso),
  CONSTRAINT ck_alcance_tipo CHECK (recurso_tipo IN ('dominio', 'metrica'))
);

COMMENT ON TABLE portal.perfil_alcances IS
  'Alcances por perfil para el agente/chatbot (Fase 4 del roadmap). Se administran desde ya '
  'junto con los perfiles para no rehacer el modelo de acceso cuando entre el agente.';

-- Auditoría del portal de usuario (espejo de gobierno.auditoria, append-only).
CREATE TABLE IF NOT EXISTS portal.auditoria (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en   timestamptz NOT NULL DEFAULT now(),
  usuario_id    bigint      REFERENCES portal.usuarios (id) ON DELETE SET NULL,
  usuario_email text,                                     -- desnormalizado (sobrevive al borrado)
  accion        text        NOT NULL,                     -- login | crear | actualizar | eliminar | ver_tablero | siembra_admin
  entidad       text        NOT NULL,
  entidad_id    text,
  antes         jsonb,
  despues       jsonb,
  ip            text
);

COMMENT ON TABLE portal.auditoria IS
  'Log append-only del portal de usuario. Incluye cada apertura de tablero (ver_tablero): '
  'trazabilidad de quién consumió qué y cuándo.';

CREATE INDEX IF NOT EXISTS ix_portal_usuario_perfiles_usuario ON portal.usuario_perfiles (usuario_id);
CREATE INDEX IF NOT EXISTS ix_portal_perfil_tableros_perfil   ON portal.perfil_tableros (perfil_id);
CREATE INDEX IF NOT EXISTS ix_portal_perfil_alcances_perfil   ON portal.perfil_alcances (perfil_id);
CREATE INDEX IF NOT EXISTS ix_portal_auditoria_entidad        ON portal.auditoria (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS ix_portal_auditoria_fecha          ON portal.auditoria (ocurrido_en);
