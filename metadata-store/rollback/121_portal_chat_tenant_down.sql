-- =====================================================================
-- Rollback de 121_portal_chat_tenant.sql (por cada base de tenant).
-- Elimina el historial de conversaciones del agente.
-- =====================================================================

DROP TABLE IF EXISTS portal.chat_mensajes;
DROP TABLE IF EXISTS portal.chat_conversaciones;
