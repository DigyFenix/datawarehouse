-- =====================================================================
-- Propósito : Eje de EMPRESA en los alcances del perfil (RLS del agente).
--             `portal.perfil_alcances` solo admitía dominio/metrica (qué
--             puede consultar); el tipo 'empresa' define QUÉ FILAS ve:
--             recurso_clave = empresa_id ('*' = todas). Semántica
--             FAIL-CLOSED: un perfil SIN filas de tipo empresa no ve
--             ninguna fila vía agente (igual que el RLS de Postgres).
-- Ejecución : POR CADA base de tenant (sufijo _tenant: el init lo omite):
--               docker exec -i cresta-postgres psql -U <user> -d dw_<codigo> \
--                 -f /opt/metadata-store/schema/120_alcance_empresa_tenant.sql
-- Impacto   : bajo; amplía un CHECK + compatibilidad de una sola vez:
--             los perfiles EXISTENTES reciben ('empresa','*') para no
--             quedar sin acceso al entrar el agente. De aquí en adelante
--             todo alcance de empresa es explícito (lo administra el
--             admin del tenant en su portal).
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/120_alcance_empresa_tenant_down.sql
-- Ref       : CLAUDE.md §11 (RLS siempre), §12 (RLS scoping por empresa)
-- =====================================================================

ALTER TABLE portal.perfil_alcances DROP CONSTRAINT IF EXISTS ck_alcance_tipo;
ALTER TABLE portal.perfil_alcances ADD CONSTRAINT ck_alcance_tipo
  CHECK (recurso_tipo IN ('dominio', 'metrica', 'empresa'));

COMMENT ON TABLE portal.perfil_alcances IS
  'Alcances por perfil para el agente/chatbot: dominio/metrica = qué puede consultar '
  '(autorización); empresa = qué filas ve (RLS; recurso_clave = empresa_id o ''*''). '
  'FAIL-CLOSED: sin filas de tipo empresa, el agente no devuelve datos al perfil.';

-- Compatibilidad de una sola vez: los perfiles creados ANTES de este eje reciben
-- acceso a todas las empresas (comportamiento que tenían implícito). Idempotente.
INSERT INTO portal.perfil_alcances (perfil_id, recurso_tipo, recurso_clave, permiso)
SELECT p.id, 'empresa', '*', 'consultar'
  FROM portal.perfiles p
 WHERE NOT EXISTS (
   SELECT 1 FROM portal.perfil_alcances a
    WHERE a.perfil_id = p.id AND a.recurso_tipo = 'empresa'
 )
ON CONFLICT DO NOTHING;
