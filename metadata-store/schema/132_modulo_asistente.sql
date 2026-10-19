-- =====================================================================
-- Propósito : Interruptor por organización del módulo Asistente (agente de
--             IA). El asistente se vende como módulo aparte: si la
--             organización no lo contrató, el portal de usuario lo oculta y
--             el API rechaza sus rutas (la guarda real es el backend).
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : gobierno.organizaciones (+ modulo_asistente)
-- Impacto   : bajo; columna nueva con DEFAULT false. Toda organización
--             existente queda SIN asistente hasta activarlo en el portal admin.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/132_modulo_asistente_down.sql
-- Ref       : CLAUDE.md §11 (agente), §12 (Admin del portal)
-- =====================================================================

ALTER TABLE gobierno.organizaciones
  ADD COLUMN IF NOT EXISTS modulo_asistente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gobierno.organizaciones.modulo_asistente IS
  'Módulo Asistente (agente de IA) contratado. false = el portal de usuario lo oculta y el API responde 403 en /agente.';
