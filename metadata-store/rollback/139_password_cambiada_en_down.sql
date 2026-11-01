-- Rollback de 139_password_cambiada_en.sql — sobre la base de control `quilate_control`.
-- Efecto: el guard deja de poder revocar tokens por cambio de contraseña (revertir antes el
-- código que lee la columna: jwt-auth.guard.ts / sesion.service.ts / db/schema.ts).
DROP TRIGGER IF EXISTS trg_usuarios_password_cambiada_en ON gobierno.usuarios;
DROP FUNCTION IF EXISTS gobierno.sellar_password_cambiada_en();
ALTER TABLE gobierno.usuarios DROP COLUMN IF EXISTS password_cambiada_en;
