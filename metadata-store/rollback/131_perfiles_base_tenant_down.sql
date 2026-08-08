-- =============================================================================
-- ROLLBACK 131 · Retira los perfiles base
-- =============================================================================
-- ⚠ Solo borra los perfiles base QUE NADIE TENGA ASIGNADO. Si el admin ya se los
--   dio a alguien, se conservan: quitarlos dejaría a esas personas sin acceso.
-- =============================================================================

\set ON_ERROR_STOP on

DELETE FROM portal.perfil_alcances a
 USING portal.perfiles p
 WHERE a.perfil_id = p.id
   AND p.clave IN ('direccion','ventas','cobranza','compras','inventario','finanzas')
   AND NOT EXISTS (SELECT 1 FROM portal.usuario_perfiles up WHERE up.perfil_id = p.id);

DELETE FROM portal.perfiles p
 WHERE p.clave IN ('direccion','ventas','cobranza','compras','inventario','finanzas')
   AND NOT EXISTS (SELECT 1 FROM portal.usuario_perfiles up WHERE up.perfil_id = p.id);
