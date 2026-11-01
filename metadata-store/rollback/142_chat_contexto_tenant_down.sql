-- Rollback de 142_chat_contexto_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: las conversaciones pierden su memoria de empresa/período. El portal tolera la columna
-- ausente (lee contexto vacío), pero conviene revertir antes el código que la escribe.
ALTER TABLE portal.chat_conversaciones DROP COLUMN IF EXISTS contexto;
