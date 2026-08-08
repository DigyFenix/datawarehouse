-- =====================================================================
-- Propósito : Conversaciones del agente de IA en el portal de usuario
--             (Fase 4). Cada usuario conserva su historial; cada respuesta
--             guarda las TARJETAS DE DATO (métrica + período + valor +
--             estado de certificación) para poder re-renderizarlas sin
--             volver a consultar ni depender del texto del modelo.
-- Ejecución : POR CADA base de tenant (sufijo _tenant: el init lo omite):
--               docker exec -i quilate-postgres psql -U <user> -d dw_<codigo> \
--                 -f /opt/metadata-store/schema/121_portal_chat_tenant.sql
-- Impacto   : bajo; dos tablas nuevas en el esquema portal.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/121_portal_chat_tenant_down.sql
-- Ref       : CLAUDE.md §11 (respuesta con dato + métrica + período + estado)
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.chat_conversaciones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id    bigint NOT NULL REFERENCES portal.usuarios (id) ON DELETE CASCADE,
  titulo        text   NOT NULL DEFAULT 'Nueva conversación',
  creada_en     timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_conversaciones_usuario
  ON portal.chat_conversaciones (usuario_id, actualizada_en DESC);

CREATE TABLE IF NOT EXISTS portal.chat_mensajes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id bigint NOT NULL REFERENCES portal.chat_conversaciones (id) ON DELETE CASCADE,
  rol             text   NOT NULL CHECK (rol IN ('usuario', 'asistente')),
  contenido       text   NOT NULL,
  -- TarjetaDato[]: el dato gobernado que sustenta la respuesta. Se guarda
  -- estructurado (no como texto) para que la UI muestre siempre métrica,
  -- período y estado de certificación aunque cambie la redacción del modelo.
  tarjetas        jsonb,
  creado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_mensajes_conversacion
  ON portal.chat_mensajes (conversacion_id, id);

COMMENT ON TABLE portal.chat_conversaciones IS
  'Conversaciones del agente de IA por usuario del portal (Fase 4).';
COMMENT ON COLUMN portal.chat_mensajes.tarjetas IS
  'Tarjetas de dato de la respuesta (métrica, período, valor, estado de certificación). '
  'Se generan del catálogo y del resultado SQL, nunca del texto del modelo.';
