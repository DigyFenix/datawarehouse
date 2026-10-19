-- Rollback de 135_tablero_grupo_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: los tableros vuelven a listarse sin agrupar (revertir antes el código que lee `grupo`).
ALTER TABLE portal.tableros DROP COLUMN IF EXISTS grupo;
