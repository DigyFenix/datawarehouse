-- =====================================================================
-- Propósito : Iron Network — pasar de UN tablero (reporte completo con la
--             barra de Power BI) a UN TABLERO POR HOJA, agrupados como
--             Kraken 360 (Ventas · Clientes · Inventario · Finanzas). Sin la
--             barra, el visor ya no muestra «abrir en otra ventana» ni
--             «compartir», que exponían el vínculo público.
--             Cada hoja usa la MISMA URL pública + &pageName=<id de la hoja>
--             (ids estables: los fija el generador PBIR por slug).
-- Ejecución : psql -d dw_ironnetwork -v ON_ERROR_STOP=1 -f 57_tableros_por_hoja_ironnetwork.sql
--             DESPUÉS de 135_tablero_grupo_tenant.sql y del despliegue del portal.
-- Tablas    : portal.tableros (13 altas + 1 desactivado), portal.perfil_tableros
--             (los perfiles que veían el reporte completo ven las 13 hojas).
-- Impacto   : bajo. No borra nada: el tablero original queda inactivo.
--             Los usuarios no-admin solo ven lo que su perfil ya veía.
-- Supuesto  : hay EXACTAMENTE un tablero activo con mostrar_barra = true (el
--             reporte completo). Si no, el script aborta sin cambios.
-- Rollback  : al final del archivo (comentado).
-- =====================================================================

BEGIN;

-- 0 · Guarda: exactamente un reporte completo, sin pageName en su URL.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM portal.tableros
   WHERE activo AND mostrar_barra AND url_publica NOT ILIKE '%pageName=%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 tablero activo con barra (reporte completo), hay %', n;
  END IF;
END $$;

-- 1 · Las 13 hojas (orden = orden de Kraken dentro de cada grupo).
CREATE TEMP TABLE hojas (clave text, nombre text, descripcion text, grupo text, pagina text, orden int) ON COMMIT DROP;
INSERT INTO hojas VALUES
  ('ventas_historico',      'Histórico',        'Venta por año y mes, sucursal, canal, cliente y producto', 'Ventas',     'e72883913ec240d905bc',  10),
  ('ventas_seguimiento',    'Seguimiento',      'Venta del día y del mes contra el año anterior',            'Ventas',     '6138f48678b1ab3a1a2a',  20),
  ('clientes_oportunidades','Oportunidades',    'Atrición y penetración por cliente, línea y producto',      'Clientes',   '27c73b36093438e6c6c7',  30),
  ('clientes_cartera',      'Cartera 12 meses', 'Clientes activos, frecuencia y meses sin compra',           'Clientes',   '2ea40ce84165f9e1d00f',  40),
  ('clientes_nuevos',       'Nuevos',           'Clientes nuevos y su retención',                            'Clientes',   '4eae8851e42ff9637b1e',  50),
  ('clientes_recuperados',  'Recuperados',      'Clientes que volvieron a comprar y su retención',           'Clientes',   'b529f14da00000c56d3c',  60),
  ('inventario_existencias','Existencias',      'Unidades por bodega, línea y producto',                     'Inventario', '772a674cadef8ec1f6b6',  70),
  ('inventario_costo',      'Costo',            'Valor del inventario y meses de cobertura',                 'Inventario', '9c6e14510b09c6886da1',  80),
  ('inventario_reposicion', 'Reposición',       'Punto de pedido y sugerencia de compra',                    'Inventario', '3b8436c25656a6f78627',  90),
  ('finanzas_por_cobrar',   'Por cobrar',       'Saldos de clientes por antigüedad',                         'Finanzas',   'b367ac8e004a5ea5a5b4', 100),
  ('finanzas_cobros',       'Cobros',           'Cargos, abonos y días de crédito',                          'Finanzas',   '35bd46c3cf8d5a576d8c', 110),
  ('finanzas_por_pagar',    'Por pagar',        'Saldos con proveedores por antigüedad',                     'Finanzas',   'c77806777de9884d9870', 120),
  ('finanzas_utilidad',     'Utilidad',         'Costo, ganancia y margen',                                  'Finanzas',   '321e4ffa3d40cab8fbbf', 130);

CREATE TEMP TABLE original ON COMMIT DROP AS
  SELECT id, url_publica FROM portal.tableros
   WHERE activo AND mostrar_barra AND url_publica NOT ILIKE '%pageName=%';

INSERT INTO portal.tableros (clave, nombre, descripcion, url_publica, orden, activo, mostrar_barra, grupo)
SELECT h.clave, h.nombre, h.descripcion, o.url_publica || '&pageName=' || h.pagina, h.orden, true, false, h.grupo
  FROM hojas h CROSS JOIN original o;

-- 2 · Los perfiles que veían el reporte completo ven cada hoja.
INSERT INTO portal.perfil_tableros (perfil_id, tablero_id)
SELECT pt.perfil_id, t.id
  FROM portal.perfil_tableros pt
  JOIN original o ON o.id = pt.tablero_id
  JOIN portal.tableros t ON t.clave IN (SELECT clave FROM hojas)
ON CONFLICT (perfil_id, tablero_id) DO NOTHING;

-- 3 · El reporte completo queda inactivo (no se borra: su URL y su auditoría se conservan).
UPDATE portal.tableros SET activo = false, actualizado_en = now()
 WHERE id IN (SELECT id FROM original);

-- Comprobación: 13 hojas activas en 4 grupos y ninguna con barra.
SELECT grupo, count(*) AS hojas, bool_or(mostrar_barra) AS alguna_con_barra
  FROM portal.tableros WHERE activo GROUP BY grupo ORDER BY min(orden);

COMMIT;

-- ---------------------------------------------------------------------
-- ROLLBACK (ejecutar a mano si hace falta volver al reporte completo):
-- BEGIN;
-- UPDATE portal.tableros SET activo = true, actualizado_en = now()
--  WHERE mostrar_barra AND url_publica NOT ILIKE '%pageName=%';
-- DELETE FROM portal.tableros
--  WHERE clave IN ('ventas_historico','ventas_seguimiento','clientes_oportunidades','clientes_cartera',
--                  'clientes_nuevos','clientes_recuperados','inventario_existencias','inventario_costo',
--                  'inventario_reposicion','finanzas_por_cobrar','finanzas_cobros','finanzas_por_pagar',
--                  'finanzas_utilidad');   -- perfil_tableros cae por ON DELETE CASCADE
-- COMMIT;
-- ---------------------------------------------------------------------
