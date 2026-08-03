-- =====================================================================
-- Rollback de 112_nits_afiliados.sql
-- Elimina la tabla de NIT afiliados. Antes de correrlo: el worker vuelve
-- a depender de pasar nits_grupo a mano (correr.sh) y el portal pierde
-- la pantalla de configuración — revertir también el código si aplica.
-- =====================================================================

DROP TABLE IF EXISTS gobierno.nits_afiliados;
