-- =====================================================================
-- Propósito : Iron Network — dar de alta en el portal las 6 HOJAS DE GESTIÓN (sesión 34)
--             y las 4 HOJAS DE ANÁLISIS (sesión 35: Vendedores, Pulso diario, Salud del
--             inventario, Compras). Las 6 primeras:
--             nuevas de PulsoIron (sesión 34): Resumen ejecutivo, Segmentación
--             y riesgo de clientes, Concentración 80/20, Tesorería y flujo de
--             caja, Pedidos y entregas, Resultados contables. Misma mecánica que
--             el seed 57: la URL pública del reporte + &pageName=<id de la hoja>
--             (ids estables: sha1 del slug en consumo/powerbi/pbir.js).
-- Ejecución : psql -d dw_ironnetwork -v ON_ERROR_STOP=1 -f 58_hojas_gestion_ironnetwork.sql
--             DESPUÉS de que Edwin publique el reporte con las hojas nuevas en Power
--             BI (si no, la URL abre la hoja pero Power BI muestra «página no
--             encontrada» hasta que se publique).
-- Tablas    : portal.tableros (10 altas), portal.perfil_tableros (los perfiles que
--             ven «Histórico» ven las nuevas; la dirección ve todas).
-- Impacto   : bajo. Idempotente por clave (no duplica si ya existen).
-- Supuesto  : existe al menos un tablero activo con &pageName= (hojas del seed 57)
--             del que tomar la URL pública base.
-- Rollback  : al final del archivo (comentado).
-- =====================================================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM portal.tableros WHERE activo AND url_publica ILIKE '%pageName=%';
  IF n = 0 THEN
    RAISE EXCEPTION 'No hay hojas publicadas por pageName (seed 57): no se puede derivar la URL base';
  END IF;
END $$;

CREATE TEMP TABLE hojas (clave text, nombre text, descripcion text, grupo text, pagina text, orden int) ON COMMIT DROP;
INSERT INTO hojas VALUES
  ('gerencia_resumen',        'Resumen ejecutivo',   'Ventas, cartera, caja, backlog y focos de atención en una pantalla',      'Gerencia',  '832047263182449dc14c',   5),
  ('clientes_segmentacion',   'Segmentación',        'Segmentos RFM, clientes en riesgo y perfil de pago',                       'Clientes',  '9a897af3275adade9982',  65),
  ('clientes_concentracion',  'Concentración 80/20', 'Qué clientes y productos hacen el 80 % de la venta',                       'Clientes',  '7a9154dedc86f43a4fdf',  66),
  ('finanzas_tesoreria',      'Tesorería',           'Cobros, pagos, flujo neto, caja pactada y evolución de la cartera',        'Finanzas',  'e684596211fc2365bec1', 115),
  ('finanzas_pedidos',        'Pedidos',             'Pedido vs facturado, backlog y entregas pendientes',                       'Finanzas',  'cdbb8becf907e43b36d2', 125),
  ('finanzas_resultados',     'Resultados',          'Resultado según el mayor y control contra facturación',                    'Finanzas',  '8dde20768346e93d33df', 135),
  -- Hojas de análisis (sesión 35)
  ('ventas_vendedores',       'Vendedores',          'Desempeño comercial: facturado, pedido, clientes y ticket por vendedor',    'Ventas',    '9639d34be202baedb8f3',  25),
  ('ventas_pulso',            'Pulso diario',        'Venta por día, medias móviles, día de la semana y estacionalidad',          'Ventas',    '99b3e639c10160cddcf6',  26),
  ('inventario_salud',        'Salud del inventario','Inventario ocioso, quiebres de stock, ABC y cobertura por línea',          'Inventario','b54cc37f19ed5ac4c272',  95),
  ('finanzas_compras',        'Compras',             'Compras por mes, Pareto de proveedores, por pagar y pagos',                'Finanzas',  '3066aefb928d56b50338', 120);

-- URL base: la de cualquier hoja activa, sin su pageName.
CREATE TEMP TABLE base ON COMMIT DROP AS
  SELECT regexp_replace(url_publica, '&pageName=[^&]*', '') AS url_publica
    FROM portal.tableros WHERE activo AND url_publica ILIKE '%pageName=%'
   ORDER BY orden LIMIT 1;

INSERT INTO portal.tableros (clave, nombre, descripcion, url_publica, orden, activo, mostrar_barra, grupo)
SELECT h.clave, h.nombre, h.descripcion, b.url_publica || '&pageName=' || h.pagina, h.orden, true, false, h.grupo
  FROM hojas h CROSS JOIN base b
 WHERE NOT EXISTS (SELECT 1 FROM portal.tableros t WHERE t.clave = h.clave);

-- Los perfiles que ven «Histórico» (la hoja de ventas base) ven también las nuevas.
INSERT INTO portal.perfil_tableros (perfil_id, tablero_id)
SELECT pt.perfil_id, t.id
  FROM portal.perfil_tableros pt
  JOIN portal.tableros h ON h.id = pt.tablero_id AND h.clave = 'ventas_historico'
  JOIN portal.tableros t ON t.clave IN (SELECT clave FROM hojas)
ON CONFLICT (perfil_id, tablero_id) DO NOTHING;

SELECT grupo, count(*) AS hojas FROM portal.tableros WHERE activo GROUP BY grupo ORDER BY min(orden);

COMMIT;

-- ---------------------------------------------------------------------
-- ROLLBACK:
-- DELETE FROM portal.tableros WHERE clave IN ('gerencia_resumen','clientes_segmentacion',
--   'clientes_concentracion','finanzas_tesoreria','finanzas_pedidos','finanzas_resultados');
