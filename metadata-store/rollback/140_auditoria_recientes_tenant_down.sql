-- Rollback de 140_auditoria_recientes_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: Inicio sigue funcionando, solo más lento al crecer la auditoría.
DROP INDEX IF EXISTS portal.ix_portal_auditoria_ver_tablero;
