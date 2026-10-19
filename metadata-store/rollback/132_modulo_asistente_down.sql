-- Rollback de 132_modulo_asistente.sql — sobre la base de control `quilate_control`.
-- Efecto: el portal de usuario vuelve a no conocer el interruptor (el código que lo lee debe revertirse antes).
ALTER TABLE gobierno.organizaciones DROP COLUMN IF EXISTS modulo_asistente;
