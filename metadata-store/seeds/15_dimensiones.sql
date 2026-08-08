-- =====================================================================
-- Seed: catálogo de dimensiones del canónico v2 (§7, §8).
--
-- La tabla existía desde la Fase 0 SIN seed ni consumo (muerta). Cobra vida
-- con el agente de IA: el catálogo describe el modelo completo (hechos +
-- dimensiones) en lenguaje de negocio, que es lo que el agente lee para
-- explicar por qué ejes se puede cortar una métrica — nunca los nombres
-- físicos directamente (CLAUDE.md §7).
--
-- Idempotente (ON CONFLICT sobre clave).
-- =====================================================================
INSERT INTO metadatos.catalogo_dimensiones (clave, nombre_negocio, descripcion, tiene_miembro_default, tabla_oro)
VALUES
  ('dim_tiempo', 'Calendario',
   'Calendario continuo con jerarquía año-trimestre-mes-día, días hábiles (descuenta feriados del país del tenant) y año fiscal. Gobierna toda la inteligencia de tiempo.',
   false, 'oro.dim_tiempo'),

  ('dim_organizacion', 'Empresa',
   'Sociedades del grupo (empresa → sucursal). Eje del RLS: qué filas ve cada perfil.',
   true, 'oro.dim_organizacion'),

  ('dim_cliente', 'Cliente',
   'Maestro de clientes con región, segmento y clase ABC vigente. Miembro default para ventas sin cliente identificado.',
   true, 'oro.dim_cliente'),

  ('dim_proveedor', 'Proveedor',
   'Maestro de proveedores con su clase ABC de compra.',
   true, 'oro.dim_proveedor'),

  ('dim_socio_negocio', 'Socio de negocio',
   'Vista 360° por NIT: unifica al que es cliente y proveedor a la vez (socios duales) para leer la relación completa con el grupo.',
   true, 'oro.dim_socio_negocio'),

  ('dim_producto', 'Producto',
   'Maestro de artículos con grupo y unidad. Incluye el miembro SERVICIO para líneas sin código de artículo (fletes, servicios, gastos).',
   true, 'oro.dim_producto'),

  ('dim_vendedor', 'Vendedor',
   'Fuerza de ventas. Miembro default para documentos sin vendedor asignado.',
   true, 'oro.dim_vendedor'),

  ('dim_almacen', 'Bodega',
   'Almacenes / bodegas donde vive el inventario.',
   true, 'oro.dim_almacen'),

  ('dim_moneda', 'Moneda',
   'Monedas de los documentos. Las cifras del grupo rigen en moneda de presentación; la moneda del documento queda como referencia.',
   true, 'oro.dim_moneda'),

  ('dim_cuenta', 'Cuenta contable',
   'Plan de cuentas homologado con jerarquía multinivel aplanada (5 niveles) y ruta completa.',
   true, 'oro.dim_cuenta'),

  ('dim_centro_costo', 'Centro de costo',
   'Centros de costo / dimensiones analíticas del ERP. Mucho asiento llega sin centro: el miembro default lo hace visible en vez de perderlo.',
   true, 'oro.dim_centro_costo'),

  ('dim_tipo_documento', 'Tipo de documento',
   'Factura, nota de crédito y demás tipos canónicos, con su signo de negocio.',
   true, 'oro.dim_tipo_documento'),

  ('dim_rango_aging', 'Antigüedad',
   'Rangos de antigüedad de saldos (corriente, 1-30, 31-60, 61-90, +90) con severidad y orden de presentación. Catálogo cerrado del motor.',
   false, 'oro.dim_rango_aging'),

  ('dim_direccion', 'Dirección de entrega',
   'Direcciones de entrega de los socios (departamento / municipio) para el análisis territorial de la venta.',
   true, 'oro.dim_direccion'),

  ('dim_anio', 'Año de clasificación',
   'Puente entre lo que se mide por día y lo que se clasifica por año (ABC anual).',
   false, 'oro.dim_anio')
ON CONFLICT (clave) DO NOTHING;
