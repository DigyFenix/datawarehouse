-- =====================================================================
-- Seed: hechos del primer corte order-to-cash (§8, §15).
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadata.catalogo_hechos (clave, nombre_negocio, grano, dominio, descripcion)
VALUES
  ('fct_ventas_facturacion', 'Ventas / Facturación', 'línea de documento', 'ventas',
   'Facturas y notas de crédito a nivel línea. Base de Ventas Brutas, Devoluciones y Ventas Netas.'),
  ('fct_cobros_cxc',         'Cobros / Cuentas por Cobrar', 'línea de documento', 'tesoreria',
   'Documentos de CxC a nivel línea. Base de Saldo Pendiente de Cobro y Aging.')
ON CONFLICT (clave) DO NOTHING;
