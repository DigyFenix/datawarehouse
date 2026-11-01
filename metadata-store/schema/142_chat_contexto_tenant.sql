-- =====================================================================
-- Propósito : Memoria corta de cada conversación del asistente: la última
--             empresa y el último período consultados ({empresa_id, periodo}),
--             para que «¿y en septiembre?» no obligue a repetir la empresa.
--             La escribe el portal de usuario tras cada turno (código validado
--             con Zod en @quilate/agente, normalizarContexto) y se inyecta en
--             el bloque dinámico del prompt. No guarda cifras ni texto libre.
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.chat_conversaciones (columna nueva `contexto`)
-- Impacto   : bajo; ADD COLUMN nullable sin default (solo metadatos, sin reescritura).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/142_chat_contexto_tenant_down.sql
-- =====================================================================

ALTER TABLE portal.chat_conversaciones
  ADD COLUMN IF NOT EXISTS contexto jsonb;

COMMENT ON COLUMN portal.chat_conversaciones.contexto IS
  'Contexto de la conversación {empresa_id, periodo:{desde,hasta}} que el asistente reutiliza cuando la pregunta no indica otro. NULL = sin contexto.';
