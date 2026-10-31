-- Rollback de 138_uso_ia_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: se pierde el historial de consumo del asistente por usuario. Revertir antes el código que lo escribe.
DROP TABLE IF EXISTS portal.uso_ia;
