-- =====================================================================
-- Propósito : PAQUETE BASE SAP B1 (parte 2) — mapeo de DOCUMENTOS y CARTERA.
--             Las 4 cabeceras (OINV/ORIN/OPCH/ORPC) comparten estructura, igual
--             que las 4 tablas de línea (INV1/RIN1/PCH1/RPC1): el mapeo se define
--             UNA vez y se cruza con los objetos. Verificado contra SBOPROAVISA_.
-- Tablas    : metadatos.campo_ingesta
-- Ejecución : psql -d quilate_control -v org=grupocresta -f 58b_paquete_sap_b1_documentos.sql
-- Idempotente: sí.
-- Ref       : data-plane/canonico/DISENO-plata-oro.md §2.2, §2.3
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- documentos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org'),
objetos(objeto, tabla_cab, tabla_lin) AS (VALUES
  ('ventas_factura',      'OINV','INV1'),
  ('ventas_nota_credito', 'ORIN','RIN1'),
  ('compras_factura',     'OPCH','PCH1'),
  ('compras_nota_credito','ORPC','RPC1')
),
-- Campos de CABECERA. `flujo` y `tipo_documento` NO se mapean: los deriva Plata
-- del objeto (ventas_* / compras_*, factura / nota_credito), que es donde vive la
-- regla de negocio (incluido el signo negativo de la nota de crédito).
cab(campo, tipo, descripcion, canonico, transformacion, sugerido, filtro_op, filtro_valor) AS (VALUES
  ('DocEntry',  'int', 'Identificador interno del documento','documento_id','directo',true,NULL,NULL),
  ('DocNum',    'int', 'Número visible','documento_numero','directo',true,NULL,NULL),
  ('CardCode',  'text','Socio de negocio','socio_codigo','directo',true,NULL,NULL),
  ('SlpCode',   'int', 'Vendedor','vendedor_codigo','directo',true,NULL,NULL),
  ('DocDate',   'date','Fecha del documento (puede ser futura)','fecha_documento','cast_fecha',true,NULL,NULL),
  ('DocDueDate','date','Vencimiento','fecha_vencimiento','cast_fecha',true,NULL,NULL),
  ('TaxDate',   'date','Fecha contable/fiscal','fecha_registro','cast_fecha',true,NULL,NULL),
  ('DocCur',    'text','Moneda del documento','moneda_documento','directo',true,NULL,NULL),
  ('DocRate',   'num', 'Tasa de cambio aplicada','tipo_cambio','cast_numeric',true,NULL,NULL),
  ('DocTotal',  'num', 'Total CON impuesto, moneda local','total_con_impuesto_local','cast_numeric',true,NULL,NULL),
  ('DocTotalFC','num', 'Total CON impuesto, moneda del documento','total_con_impuesto_doc','cast_numeric',true,NULL,NULL),
  ('VatSum',    'num', 'Impuesto, moneda local','total_impuesto_local','cast_numeric',true,NULL,NULL),
  ('VatSumFC',  'num', 'Impuesto, moneda del documento','total_impuesto_doc','cast_numeric',true,NULL,NULL),
  ('DiscSum',   'num', 'Descuento total, moneda local','total_descuento_local','cast_numeric',true,NULL,NULL),
  ('PaidToDate','num', 'Pagado a la fecha (INFORMATIVO: la cartera sale del mayor)',NULL,'cast_numeric',true,NULL,NULL),
  ('DocStatus', 'text','O=abierto, C=cerrado','estado','directo',true,NULL,NULL),
  ('NumAtCard', 'text','Referencia del socio','referencia_externa','directo',false,NULL,NULL),
  ('ObjType',   'text','Tipo nativo (13/14/18/19)','tipo_documento_origen','directo',true,NULL,NULL),
  ('CreateDate','date','Alta en el ERP','creado_en','directo',false,NULL,NULL),
  ('UpdateDate','date','Última modificación (ventana de producción)','actualizado_en','directo',false,NULL,NULL),
  -- FILTRO DURO: SOLO 'N'. Verificado en vivo (2026-07-26): SAP B1 usa TRES valores y
  -- hay que excluir dos. Por cada documento anulado ('Y') crea un documento de
  -- cancelación ('C') por el MISMO importe: en el histórico de Proavisa son 1,819 y
  -- 1,819, ambos por Q132,639,220.39. Filtrar solo `<> 'Y'` dejaba pasar los 'C' e
  -- inflaba las ventas de junio en Q1,634,294.22.
  ('CANCELED',  'text','Cancelado: N=vigente, Y=anulado, C=documento de cancelación','estado','directo',true,'=','N')
),
-- Campos de LÍNEA (el grano del hecho).
lin(campo, tipo, descripcion, canonico, transformacion, sugerido) AS (VALUES
  ('DocEntry',  'int', 'Documento padre','documento_id','directo',true),
  ('LineNum',   'int', 'Número de línea','linea_numero','directo',true),
  ('ItemCode',  'text','Producto','producto_codigo','directo',true),
  ('Dscription','text','Descripción de la línea','descripcion_linea','directo',true),
  ('WhsCode',   'text','Bodega','almacen_codigo','directo',true),
  ('OcrCode',   'text','Centro de costo','centro_costo_codigo','directo',true),
  ('AcctCode',  'text','Cuenta contable','cuenta_codigo','directo',true),
  ('Quantity',  'num', 'Cantidad','cantidad','cast_numeric',true),
  ('unitMsr',   'text','Unidad de medida','unidad_medida','directo',true),
  ('Price',     'num', 'Precio unitario, moneda del documento','precio_unitario_doc','cast_numeric',true),
  ('PriceBefDi','num', 'Precio antes de descuento','precio_antes_descuento','cast_numeric',true),
  ('DiscPrcnt', 'num', 'Descuento %','descuento_pct','cast_numeric',true),
  ('LineTotal', 'num', 'Base SIN impuesto, moneda local','monto_sin_impuesto_local','cast_numeric',true),
  ('TotalFrgn', 'num', 'Base SIN impuesto, moneda del documento','monto_sin_impuesto_doc','cast_numeric',true),
  ('VatSum',    'num', 'Impuesto de la línea, moneda local','monto_impuesto_local','cast_numeric',true),
  ('GTotal',    'num', 'Total CON impuesto, moneda local','monto_con_impuesto_local','cast_numeric',true),
  ('GTotalFC',  'num', 'Total CON impuesto, moneda del documento','monto_con_impuesto_doc','cast_numeric',true),
  ('StockPrice','num', 'Costo de la línea (base del margen)','costo_local','cast_numeric',true),
  ('GrssProfit','num', 'Margen bruto de la línea','margen_local','cast_numeric',true),
  ('Currency',  'text','Moneda de la línea','moneda_documento','directo',false),
  ('BaseEntry', 'int', 'Documento base (nota de crédito → factura)','documento_referencia','directo',false)
)
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
  SELECT org.id, o.objeto, o.tabla_cab, c.campo, false, c.tipo, c.descripcion,
         'documento_comercial', c.canonico, c.transformacion, c.sugerido, true, 'paquete_base',
         c.filtro_op, c.filtro_valor
    FROM org, objetos o, cab c
UNION ALL
  SELECT org.id, o.objeto, o.tabla_lin, l.campo, false, l.tipo, l.descripcion,
         'documento_linea', l.canonico, l.transformacion, l.sugerido, true, 'paquete_base',
         NULL, NULL
    FROM org, objetos o, lin l
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, canonico_entidad = EXCLUDED.canonico_entidad,
       campo_canonico = EXCLUDED.campo_canonico, transformacion = EXCLUDED.transformacion,
       sugerido = EXCLUDED.sugerido, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       origen = 'paquete_base', actualizado_en = now();

-- ---------------------------------------------------------------- cartera (el mayor)
-- JDT1 es la tabla PRINCIPAL (lleva el saldo); OJDT es la hija, se encadena por TransId
-- para traer el tipo de documento que originó cada partida.
--
-- §CUENTAS DE CARTERA — LO ÚNICO PROPIO DE CADA INSTALACIÓN:
-- son las cuentas de control de los socios (OCRD.DebPayAcct). En Proavisa el filtro
-- reduce el mayor de 1,043,823 partidas con saldo a 9,682 de cartera real.
-- Para dar de alta OTRO cliente SAP B1, ejecutar y sustituir la lista:
--   SELECT DISTINCT "DebPayAcct" FROM "<ESQUEMA>"."OCRD" WHERE "DebPayAcct" IS NOT NULL;
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org'),
campos(tabla, campo, tipo, descripcion, canonico, transformacion, filtro_op, filtro_valor) AS (VALUES
  ('JDT1','TransId',   'int', 'Asiento contable','documento_origen','directo',NULL,NULL),
  ('JDT1','Line_ID',   'int', 'Línea del asiento',NULL,'directo',NULL,NULL),
  ('JDT1','Account',   'text','Cuenta contable de la partida','cuenta_codigo','directo',
   'in','_SYS00000000487,_SYS00000000491,_SYS00000000583,_SYS00000000584,_SYS00000000585,_SYS00000000586,_SYS00000000588,_SYS00000000590'),
  ('JDT1','ShortName', 'text','Socio de negocio de la partida','socio_codigo','directo',NULL,NULL),
  ('JDT1','Debit',     'num', 'Débito, moneda local',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','Credit',    'num', 'Crédito, moneda local',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','FCDebit',   'num', 'Débito, moneda extranjera',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','FCCredit',  'num', 'Crédito, moneda extranjera',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','FCCurrency','text','Moneda de la partida','moneda_documento','directo',NULL,NULL),
  ('JDT1','BalDueDeb', 'num', 'Saldo deudor pendiente — BASE DE LA CARTERA',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','BalDueCred','num', 'Saldo acreedor pendiente — BASE DE LA CARTERA',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','BalFcDeb',  'num', 'Saldo deudor, moneda extranjera',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','BalFcCred', 'num', 'Saldo acreedor, moneda extranjera',NULL,'cast_numeric',NULL,NULL),
  ('JDT1','DueDate',   'date','Vencimiento — BASE DEL AGING','fecha_vencimiento','cast_fecha',NULL,NULL),
  ('JDT1','RefDate',   'date','Fecha de la partida','fecha_documento','cast_fecha',NULL,NULL),
  ('JDT1','TransType', 'text','Tipo de documento origen','tipo_documento_origen','directo',NULL,NULL),
  ('JDT1','BaseRef',   'text','Referencia al documento origen',NULL,'directo',NULL,NULL),
  ('JDT1','LineMemo',  'text','Memo de la partida','descripcion_partida','directo',NULL,NULL),
  ('OJDT','TransId',   'int', 'Asiento',NULL,'directo',NULL,NULL),
  ('OJDT','TransType', 'text','Tipo de documento que generó el asiento',NULL,'directo',NULL,NULL),
  ('OJDT','RefDate',   'date','Fecha del asiento',NULL,'cast_fecha',NULL,NULL),
  ('OJDT','BaseRef',   'text','Referencia del documento origen',NULL,'directo',NULL,NULL),
  ('OJDT','Memo',      'text','Memo del asiento',NULL,'directo',NULL,NULL)
)
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, 'cartera', c.tabla, c.campo, false, c.tipo, c.descripcion,
       'partida_cartera', c.canonico, c.transformacion, true, true, 'paquete_base',
       c.filtro_op, c.filtro_valor
  FROM org, campos c
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, canonico_entidad = EXCLUDED.canonico_entidad,
       campo_canonico = EXCLUDED.campo_canonico, transformacion = EXCLUDED.transformacion,
       sugerido = EXCLUDED.sugerido, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       origen = 'paquete_base', actualizado_en = now();
