-- =====================================================================
-- Propósito : EXTENSIÓN del paquete base SAP B1 — PEDIDOS DE VENTA (backlog /
--             fill rate) y MAYOR CONTABLE COMPLETO (gastos → P&L).
--             PARAMETRIZADO por organización (onboarding SAP B1).
-- Ejecución : psql -d cresta_dw -v org=<codigo> -f 66_paquete_sap_b1_pedidos_mayor.sql
--             (después de 58/58b/64)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí.
-- Notas     :
--   · El objeto `cartera` se AMPLÍA a mayor contable: mismo destino bronce
--     (JDT1/OJDT), filtro = partidas ABIERTAS de cualquier fecha (cartera, que
--     es saldo) + TODO el 2026 (resultados, que es flujo). No se crea un objeto
--     nuevo sobre JDT1: dos objetos con la misma fuente pisarían el mismo
--     bronce y la corrida de uno borraría al otro.
--   · `ProfitCode` (centro de costo de la partida) se agrega a JDT1 para el
--     P&L por centro de costo.
--   · Pedidos: ORDR/RDR1 con los MISMOS nombres de la familia de documentos
--     verificados con Descubrir (58b): Dscription, LineTotal, TotalFrgn,
--     DiscPrcnt, GTotal... + OpenQty/LineStatus (estándar de líneas B1).
--   · Filtro de fecha FIJO (regla de corte 2026) — revisar al entrar 2027.
-- =====================================================================

\set ON_ERROR_STOP on

-- ------------------------------------------------- política: pedidos de venta
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, 'pedidos_venta', 'Pedidos de venta', 'ventas', 'hecho', 'incremental_ventana',
       'ORDR+RDR1', 'DocDate', 12, 'meses', 'DocEntry', '{}'::text[],
       'data_owner_ventas', 'plata_pedido_linea+ campo_usuario', '"DocDate" >= ''' || :'corte' || ''''
FROM org
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, fuente_objeto = EXCLUDED.fuente_objeto,
       estrategia = EXCLUDED.estrategia, campo_fecha = EXCLUDED.campo_fecha,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

-- ------------------------------------------------- política: cartera → mayor
-- Partidas abiertas de CARTERA (saldo, sin límite de fecha, solo cuentas de control) +
-- TODO el período de resultados de TODAS las cuentas. La lista de cuentas de control se
-- ABSORBE en el filtro_origen (antes era filtro de campo `Account IN ...`, que se elimina:
-- un filtro de campo se combina con AND y anularía el OR del período).
-- La corrida sigue siendo full-replace por empresa (estrategia `abiertos`).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org'),
lista AS (
    SELECT string_agg('''' || trim(x) || '''', ', ') AS cuentas
    FROM metadatos.campo_ingesta ci
    JOIN org ON org.id = ci.organizacion_id
    CROSS JOIN LATERAL unnest(string_to_array(ci.filtro_valor, ',')) AS x
    WHERE ci.objeto = 'cartera' AND ci.campo_origen = 'Account' AND ci.filtro_op = 'in'
)
UPDATE metadatos.politica_ingesta p
   SET nombre_negocio = 'Mayor contable (cartera + resultados)',
       filtro_origen  = '(("Account" IN (' || lista.cuentas || ') AND "BalDueDeb" <> "BalDueCred") OR "RefDate" >= ''' || :'corte' || ''')',
       modelos_dbt    = 'plata_partida_cartera+ plata_movimiento_contable+',
       actualizado_en = now()
  FROM org, lista
 WHERE p.organizacion_id = org.id AND p.objeto = 'cartera'
   -- Idempotencia: en una segunda corrida el filtro de campo ya fue absorbido y la lista
   -- viene vacía; sin este guardián se pisaría el filtro_origen con NULL.
   AND lista.cuentas IS NOT NULL;

-- El filtro de campo se retira (queda absorbido arriba).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.campo_ingesta ci
   SET filtro_op = NULL, filtro_valor = NULL, actualizado_en = now()
  FROM org
 WHERE ci.organizacion_id = org.id AND ci.objeto = 'cartera'
   AND ci.campo_origen = 'Account' AND ci.filtro_op = 'in';

-- ------------------------------------------------- campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descripcion,
       v.entidad, v.canonico, 'directo', true, true, 'paquete_base', v.fop, v.fval
FROM org, (VALUES
  -- ============ JDT1 → centro de costo de la partida (P&L por centro) ============
  ('cartera','JDT1','ProfitCode','text','Centro de costo de la partida','partida_cartera',NULL, NULL, NULL),

  -- ============ ORDR → pedido (cabecera) ============
  ('pedidos_venta','ORDR','DocEntry',  'int',    'Llave interna del pedido',        'pedido','pedido_id',        NULL, NULL),
  ('pedidos_venta','ORDR','DocNum',    'int',    'Número visible',                  'pedido','pedido_numero',    NULL, NULL),
  ('pedidos_venta','ORDR','Series',    'int',    'Serie de numeración (rastreo)',   'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','ORDR','DocDate',   'date',   'Fecha del pedido',                'pedido','fecha_pedido',     NULL, NULL),
  ('pedidos_venta','ORDR','DocDueDate','date',   'Fecha de entrega prometida',      'pedido','fecha_entrega',    NULL, NULL),
  ('pedidos_venta','ORDR','CardCode',  'text',   'Cliente',                         'pedido','socio_codigo',     NULL, NULL),
  ('pedidos_venta','ORDR','CardName',  'text',   'Nombre del cliente',              'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','ORDR','SlpCode',   'int',    'Vendedor',                        'pedido','vendedor_codigo',  NULL, NULL),
  ('pedidos_venta','ORDR','DocStatus', 'text',   'O=abierto, C=cerrado',            'pedido','estado',           NULL, NULL),
  ('pedidos_venta','ORDR','CANCELED',  'text',   'Cancelado: N=vigente (se excluyen Y/C)','pedido',NULL,         '=',  'N'),
  ('pedidos_venta','ORDR','DocCur',    'text',   'Moneda del pedido',               'pedido','moneda_documento', NULL, NULL),
  ('pedidos_venta','ORDR','DocRate',   'numeric','Tasa',                            'pedido','tipo_cambio',      NULL, NULL),
  ('pedidos_venta','ORDR','DocTotal',  'numeric','Total CON impuesto, moneda local','pedido',NULL,               NULL, NULL),
  ('pedidos_venta','ORDR','DocTotalFC','numeric','Total CON impuesto, moneda doc',  'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','ORDR','VatSum',    'numeric','Impuesto del documento',          'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','ORDR','Comments',  'text',   'Comentarios',                     'pedido',NULL,               NULL, NULL),

  -- ============ RDR1 → pedido (líneas, el grano del hecho) ============
  ('pedidos_venta','RDR1','DocEntry',  'int',    'Pedido padre',                    'pedido','pedido_id',        NULL, NULL),
  ('pedidos_venta','RDR1','LineNum',   'int',    'Número de línea',                 'pedido','linea_numero',     NULL, NULL),
  ('pedidos_venta','RDR1','LineStatus','text',   'O=abierta, C=cerrada',            'pedido','estado_linea',     NULL, NULL),
  ('pedidos_venta','RDR1','ItemCode',  'text',   'Producto',                        'pedido','producto_codigo',  NULL, NULL),
  ('pedidos_venta','RDR1','Dscription','text',   'Descripción de la línea',         'pedido','descripcion_linea',NULL, NULL),
  ('pedidos_venta','RDR1','WhsCode',   'text',   'Bodega',                          'pedido','almacen_codigo',   NULL, NULL),
  ('pedidos_venta','RDR1','Quantity',  'numeric','Cantidad pedida',                 'pedido','cantidad',         NULL, NULL),
  ('pedidos_venta','RDR1','OpenQty',   'numeric','Cantidad pendiente (backlog)',    'pedido','cantidad_abierta', NULL, NULL),
  ('pedidos_venta','RDR1','Price',     'numeric','Precio unitario, moneda del doc', 'pedido','precio_unitario_doc',NULL,NULL),
  ('pedidos_venta','RDR1','DiscPrcnt', 'numeric','Descuento %',                     'pedido','descuento_pct',    NULL, NULL),
  ('pedidos_venta','RDR1','LineTotal', 'numeric','Base SIN impuesto, moneda local', 'pedido','monto_sin_impuesto_local',NULL,NULL),
  ('pedidos_venta','RDR1','TotalFrgn', 'numeric','Base SIN impuesto, moneda doc',   'pedido','monto_sin_impuesto_doc',NULL,NULL),
  ('pedidos_venta','RDR1','VatSum',    'numeric','Impuesto de la línea',            'pedido',NULL,               NULL, NULL),
  ('pedidos_venta','RDR1','Currency',  'text',   'Moneda de la línea',              'pedido',NULL,               NULL, NULL)
) AS v(objeto, tabla, campo, tipo, descripcion, entidad, canonico, fop, fval)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, campo_canonico = EXCLUDED.campo_canonico,
       canonico_entidad = EXCLUDED.canonico_entidad, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       actualizado_en = now();
