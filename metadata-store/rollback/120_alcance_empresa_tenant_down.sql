-- =====================================================================
-- Rollback de 120_alcance_empresa_tenant.sql (por cada base de tenant).
-- Elimina los alcances de tipo empresa y restaura el CHECK original.
-- =====================================================================

DELETE FROM portal.perfil_alcances WHERE recurso_tipo = 'empresa';

ALTER TABLE portal.perfil_alcances DROP CONSTRAINT IF EXISTS ck_alcance_tipo;
ALTER TABLE portal.perfil_alcances ADD CONSTRAINT ck_alcance_tipo
  CHECK (recurso_tipo IN ('dominio', 'metrica'));

COMMENT ON TABLE portal.perfil_alcances IS
  'Alcances por perfil para el agente/chatbot (Fase 4 del roadmap). Se administran desde ya '
  'junto con los perfiles para no rehacer el modelo de acceso cuando entre el agente.';
