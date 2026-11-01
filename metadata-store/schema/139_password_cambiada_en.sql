-- =====================================================================
-- Propósito : Revocación de JWT del portal admin al cambiar o restablecer la
--             contraseña. El guard rechaza todo token cuyo `iat` sea anterior
--             a `password_cambiada_en`: cambiar la contraseña cierra las
--             sesiones abiertas en otros equipos sin esperar la expiración.
--             Un trigger la sella en cualquier UPDATE de hash_password (API o
--             SQL manual de soporte), así ninguna vía de cambio la olvida.
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : gobierno.usuarios (+ password_cambiada_en, + trigger)
-- Impacto   : bajo; columna nullable. NULL = nunca cambiada ⇒ ningún token
--             existente se invalida al aplicar la migración.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/139_password_cambiada_en_down.sql
-- Ref       : docs/auditoria-2026-10-31.md §2 M3; CLAUDE.md §12
-- =====================================================================

ALTER TABLE gobierno.usuarios
  ADD COLUMN IF NOT EXISTS password_cambiada_en timestamptz;

COMMENT ON COLUMN gobierno.usuarios.password_cambiada_en IS
  'Último cambio/restablecimiento de contraseña. Los JWT emitidos antes (iat) se rechazan. NULL = nunca cambiada.';

CREATE OR REPLACE FUNCTION gobierno.sellar_password_cambiada_en()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hash_password IS DISTINCT FROM OLD.hash_password THEN
    NEW.password_cambiada_en := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_password_cambiada_en ON gobierno.usuarios;
CREATE TRIGGER trg_usuarios_password_cambiada_en
  BEFORE UPDATE OF hash_password ON gobierno.usuarios
  FOR EACH ROW EXECUTE FUNCTION gobierno.sellar_password_cambiada_en();
