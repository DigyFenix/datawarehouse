-- Rollback de 134_tablero_barra_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: todos los tableros vuelven a recortar la barra de Power BI (revertir antes el código que la lee).
ALTER TABLE portal.tableros DROP COLUMN IF EXISTS mostrar_barra;
