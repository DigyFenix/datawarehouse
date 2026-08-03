-- Rollback de 110_portal_tenant.sql — se ejecuta sobre la base del tenant (dw_<codigo>).
-- ADVERTENCIA: destruye usuarios, perfiles, tableros y auditoría del portal de usuario
-- de esta organización. No toca bronce/plata/oro.
DROP SCHEMA IF EXISTS portal CASCADE;
