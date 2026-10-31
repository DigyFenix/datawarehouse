-- =====================================================================
-- Propósito : Costo del asistente de IA por usuario. Cada turno del chat
--             registra los tokens que consumió (compuerta + agente) y su
--             costo estimado en USD a la tarifa vigente. Lo ve SOLO el
--             administrador de la organización (Administración → Uso de IA)
--             para saber cuánto gasta cada usuario y cada perfil y decidir
--             cuándo recargar su saldo de Anthropic. El usuario nunca lo ve.
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.uso_ia (nueva)
-- Impacto   : bajo; una tabla nueva, una fila por turno del chat.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/138_uso_ia_tenant_down.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.uso_ia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id             bigint NOT NULL REFERENCES portal.usuarios (id) ON DELETE CASCADE,
  conversacion_id        bigint,
  -- Modelos usados en el turno (p. ej. {"claude-haiku-5-5","claude-opus-5"}); el detalle por modelo va en `detalle`.
  modelos                text[] NOT NULL DEFAULT '{}',
  llamadas               int    NOT NULL DEFAULT 0,
  tokens_entrada         bigint NOT NULL DEFAULT 0,
  tokens_salida          bigint NOT NULL DEFAULT 0,
  tokens_cache_lectura   bigint NOT NULL DEFAULT 0,
  tokens_cache_escritura bigint NOT NULL DEFAULT 0,
  -- Costo estimado a la tarifa configurada en el servidor al momento del turno (USD).
  costo_usd              numeric(12, 6) NOT NULL DEFAULT 0,
  detalle                jsonb,
  ocurrido_en            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_uso_ia_usuario_fecha ON portal.uso_ia (usuario_id, ocurrido_en);
CREATE INDEX IF NOT EXISTS ix_uso_ia_fecha ON portal.uso_ia (ocurrido_en);

COMMENT ON TABLE portal.uso_ia IS 'Tokens y costo estimado de cada turno del asistente, por usuario. Solo lo lee el administrador de la organización.';
