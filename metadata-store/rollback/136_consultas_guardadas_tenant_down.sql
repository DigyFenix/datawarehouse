-- Rollback de 136_consultas_guardadas_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: se pierden las consultas guardadas de los usuarios y los conjuntos de datos
-- persistidos en los mensajes (el texto y las tarjetas se conservan). Revertir antes el
-- código que lee `datos` y `consultas_guardadas`.
DROP TABLE IF EXISTS portal.consultas_guardadas;
ALTER TABLE portal.chat_mensajes DROP COLUMN IF EXISTS datos;
