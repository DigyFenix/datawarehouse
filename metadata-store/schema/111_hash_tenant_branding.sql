-- =====================================================================
-- Propósito : Habilitar el PORTAL DE USUARIO: cada organización recibe un
--             hash de tenant (su URL de ingreso es portal/<hash>/...) y su
--             marca completa (color existente + logo) administrada desde el
--             portal admin y consumida por el portal de usuario.
-- Ejecución : sobre la base de control `quilate_control`.
-- Tablas    : gobierno.organizaciones (+ hash_tenant, logo, logo_mime)
-- Impacto   : bajo; columnas nuevas con backfill idempotente.
-- Idempotente: sí.
-- Rollback  : metadata-store/rollback/111_hash_tenant_branding_down.sql
-- Ref       : CLAUDE.md §3 (tenant), §12 (Admin del portal)
-- =====================================================================

-- 1) Hash de tenant: identificador OPACO para la URL de ingreso del portal de
--    usuario. No es un secreto criptográfico (la URL se comparte con el cliente),
--    pero no debe ser adivinable ni revelar el código de la organización.
ALTER TABLE gobierno.organizaciones
  ADD COLUMN IF NOT EXISTS hash_tenant text;

COMMENT ON COLUMN gobierno.organizaciones.hash_tenant IS
  'Identificador opaco del tenant en la URL del portal de usuario (portal/<hash>/...). '
  'Se genera al crear la organización; rotarlo invalida la URL entregada al cliente.';

-- 2) Logo del tenant (white-label). Se guarda en la base de control porque es
--    metadato de marca, no dato de negocio; el portal de usuario lo sirve con caché.
ALTER TABLE gobierno.organizaciones
  ADD COLUMN IF NOT EXISTS logo bytea;

ALTER TABLE gobierno.organizaciones
  ADD COLUMN IF NOT EXISTS logo_mime text;

COMMENT ON COLUMN gobierno.organizaciones.logo IS
  'Logo del tenant (binario, límite aplicativo ~300 KB; png/svg/jpg). NULL = sin logo.';
COMMENT ON COLUMN gobierno.organizaciones.logo_mime IS
  'MIME del logo (image/png | image/svg+xml | image/jpeg).';

-- 3) Backfill: hash para las organizaciones existentes (32 hex, no adivinable).
UPDATE gobierno.organizaciones
   SET hash_tenant = replace(gen_random_uuid()::text, '-', '')
 WHERE hash_tenant IS NULL;

-- 4) Unicidad y obligatoriedad (después del backfill).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_organizaciones_hash_tenant'
  ) THEN
    ALTER TABLE gobierno.organizaciones
      ADD CONSTRAINT uq_organizaciones_hash_tenant UNIQUE (hash_tenant);
  END IF;
END $$;

ALTER TABLE gobierno.organizaciones
  ALTER COLUMN hash_tenant SET NOT NULL;
