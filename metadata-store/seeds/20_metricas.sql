-- =====================================================================
-- Seed: fichas de las 5 métricas del primer corte (§9, §15).
-- Estado = 'borrador': la fórmula se define y certifica en Fase 2/3.
-- NO son certificadas todavía; el agente aún no puede usarlas (§11).
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadatos.catalogo_metricas
  (clave, nombre_oficial, definicion_negocio, hecho_origen, periodicidad, owner, estado)
VALUES
  ('ventas_brutas', 'Ventas Brutas',
   'Suma de facturas activas del período.',
   'fct_ventas_facturacion', 'mensual', 'data_owner_ventas', 'borrador'),

  ('devoluciones', 'Devoluciones',
   'Suma de notas de crédito por devolución del período.',
   'fct_ventas_facturacion', 'mensual', 'data_owner_ventas', 'borrador'),

  ('ventas_netas', 'Ventas Netas',
   'Ventas Brutas menos Devoluciones.',
   'fct_ventas_facturacion', 'mensual', 'data_owner_ventas', 'borrador'),

  ('saldo_pendiente_cobro', 'Saldo Pendiente de Cobro',
   'Saldo de documentos abiertos en Cuentas por Cobrar.',
   'fct_cobros_cxc', 'diaria', 'data_owner_tesoreria', 'borrador'),

  ('aging', 'Aging / Antigüedad de Saldos',
   'Saldo por rangos: corriente, 1-30, 31-60, 61-90, +90.',
   'fct_cobros_cxc', 'diaria', 'data_owner_tesoreria', 'borrador')
ON CONFLICT (clave) DO NOTHING;
