-- Rollback de 141_password_cambiada_en_tenant.sql — POR CADA base de tenant (dw_<codigo>).
-- Efecto: el portal de usuario deja de revocar tokens por cambio de contraseña. Revertir ANTES
-- el código que lee la columna (auth/sesion.service.ts, auth/auth.service.ts, admin/admin.service.ts).
DROP TRIGGER IF EXISTS trg_usuarios_password_cambiada_en ON portal.usuarios;
DROP FUNCTION IF EXISTS portal.sellar_password_cambiada_en();
ALTER TABLE portal.usuarios DROP COLUMN IF EXISTS password_cambiada_en;
