-- Rollback de 137_tablero_personal_y_demanda_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: se pierde la bitácora de demanda no atendida y la configuración de «Mi tablero»
-- (las consultas guardadas se conservan). Revertir antes el código que lee estas columnas.
DROP TABLE IF EXISTS portal.solicitudes_no_atendidas;
DROP INDEX IF EXISTS portal.ix_consultas_guardadas_tablero;
ALTER TABLE portal.consultas_guardadas
  DROP CONSTRAINT IF EXISTS ck_consultas_guardadas_tablero_ancho,
  DROP COLUMN IF EXISTS en_tablero,
  DROP COLUMN IF EXISTS tablero_orden,
  DROP COLUMN IF EXISTS tablero_ancho;
