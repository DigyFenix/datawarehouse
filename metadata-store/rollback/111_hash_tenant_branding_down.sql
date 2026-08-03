-- Rollback de 111_hash_tenant_branding.sql — sobre la base de control `cresta_dw`.
-- ADVERTENCIA: invalida las URLs de ingreso entregadas a los clientes y borra los logos.
ALTER TABLE gobierno.organizaciones DROP CONSTRAINT IF EXISTS uq_organizaciones_hash_tenant;
ALTER TABLE gobierno.organizaciones DROP COLUMN IF EXISTS hash_tenant;
ALTER TABLE gobierno.organizaciones DROP COLUMN IF EXISTS logo;
ALTER TABLE gobierno.organizaciones DROP COLUMN IF EXISTS logo_mime;
