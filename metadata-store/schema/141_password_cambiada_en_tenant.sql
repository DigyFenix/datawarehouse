-- =====================================================================
-- Propósito : Revocación de JWT del PORTAL DE USUARIO al cambiar o
--             restablecer la contraseña (gemela de la 139 del portal admin).
--             El guard rechaza todo token cuyo `iat` sea anterior a
--             `password_cambiada_en`: cambiar la contraseña cierra las sesiones
--             abiertas en otros equipos sin esperar las 8 h de expiración.
--             El API la fija al cambiar/restablecer y un trigger la sella en
--             cualquier UPDATE de hash_password (incluido SQL manual de soporte).
-- Ejecución : POR CADA base de tenant (dw_<codigo>). La aplica Provisionar.
-- Tablas    : portal.usuarios (+ password_cambiada_en, + trigger)
-- Impacto   : bajo; columna nullable. NULL = nunca cambiada ⇒ ningún token
--             existente se invalida al aplicar la migración.
-- Orden     : aplicar ANTES de desplegar el API que la lee.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/141_password_cambiada_en_tenant_down.sql
-- Ref       : docs/auditoria-2026-10-31.md §2 M3
-- =====================================================================

ALTER TABLE portal.usuarios
  ADD COLUMN IF NOT EXISTS password_cambiada_en timestamptz;

COMMENT ON COLUMN portal.usuarios.password_cambiada_en IS
  'Último cambio/restablecimiento de contraseña. Los JWT emitidos antes (iat) se rechazan. NULL = nunca cambiada.';

CREATE OR REPLACE FUNCTION portal.sellar_password_cambiada_en()
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

DROP TRIGGER IF EXISTS trg_usuarios_password_cambiada_en ON portal.usuarios;
CREATE TRIGGER trg_usuarios_password_cambiada_en
  BEFORE UPDATE OF hash_password ON portal.usuarios
  FOR EACH ROW EXECUTE FUNCTION portal.sellar_password_cambiada_en();
