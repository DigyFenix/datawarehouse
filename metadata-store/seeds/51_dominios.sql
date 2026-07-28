-- =====================================================================
-- Seed: dominios de negocio (§2). Incluye los del corte order-to-cash + los
-- previstos en la arquitectura. Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadatos.catalogo_dominios (clave, nombre, descripcion)
VALUES
  ('datos_maestros', 'Datos maestros', 'Clientes, productos, vendedores, cuentas, centros de costo.'),
  ('ventas',         'Ventas',         'Facturación, notas de crédito, devoluciones.'),
  ('tesoreria',      'Tesorería',      'Cobros, cuentas por cobrar, aging.'),
  ('inventario',     'Inventario',     'Existencias, movimientos, almacenes.'),
  ('compras',        'Compras',        'Órdenes de compra, recepciones, cuentas por pagar.'),
  ('crm',            'CRM',            'Oportunidades, actividades comerciales.'),
  ('produccion',     'Producción',     'Órdenes de producción, consumos.'),
  ('finanzas',       'Finanzas',       'Contabilidad, centros de costo, cuentas.'),
  ('gobierno',       'Gobierno',       'Roles, autorizaciones, auditoría, RLS.')
ON CONFLICT (clave) DO NOTHING;
