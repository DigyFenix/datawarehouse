-- =====================================================================
-- Propósito : PAQUETE BASE SAP BUSINESS ONE — la plantilla que hace el onboarding
--             de un cliente SAP B1 en días en lugar de semanas.
--             Define QUÉ objetos se ingestan, CÓMO y el mapeo campo→canónico.
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Organización: parámetro :org (código del tenant). Reutilizable en cualquier
--             cliente SAP B1: solo cambian las cuentas de cartera (ver §CARTERA).
-- Ejecución : psql -d quilate_control -v org=grupocresta -f 58_paquete_sap_b1.sql
-- Idempotente: sí.
-- Validado  : columnas verificadas contra SBOPROAVISA_ (2026-07-26).
-- Ref       : data-plane/canonico/DISENO-plata-oro.md §2, §4
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- políticas
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
   owner, modelos_dbt, filtro_origen)
SELECT org.id, v.* FROM org, (VALUES
  -- maestros: snapshot completo por corrida
  ('socios',              'Socios de negocio',       'datos_maestros', 'maestro', 'full_replace', 'OCRD',
   NULL, NULL, NULL, 'CardCode', '{}'::text[], 'data_steward', 'plata_socio_negocio+', NULL),
  ('productos',           'Productos',               'datos_maestros', 'maestro', 'full_replace', 'OITM',
   NULL, NULL, NULL, 'ItemCode', '{}'::text[], 'data_steward', 'plata_producto+', NULL),
  ('vendedores',          'Vendedores',              'datos_maestros', 'maestro', 'full_replace', 'OSLP',
   NULL, NULL, NULL, 'SlpCode', '{}'::text[], 'data_steward', 'plata_vendedor+', NULL),
  ('cuentas',             'Plan de cuentas',         'finanzas',       'maestro', 'full_replace', 'OACT',
   NULL, NULL, NULL, 'AcctCode', '{}'::text[], 'data_owner_finanzas', 'plata_cuenta+', NULL),
  ('almacenes',           'Bodegas',                 'datos_maestros', 'maestro', 'full_replace', 'OWHS',
   NULL, NULL, NULL, 'WhsCode', '{}'::text[], 'data_steward', 'plata_almacen+', NULL),
  ('monedas',             'Monedas',                 'finanzas',       'maestro', 'full_replace', 'OCRN',
   NULL, NULL, NULL, 'CurrCode', '{}'::text[], 'data_owner_finanzas', 'plata_moneda+', NULL),
  ('centros_costo',       'Centros de costo',        'finanzas',       'maestro', 'full_replace', 'OPRC',
   NULL, NULL, NULL, 'PrcCode', '{}'::text[], 'data_owner_finanzas', 'plata_centro_costo+', NULL),

  -- documentos: ventana por fecha. OJO: la ventana de PRODUCCIÓN debe ser por UpdateDate
  -- (en Cresta las facturas con DocDate futura son normales). Para la carga de MODELADO se
  -- pasa --desde/--hasta con DocDate, que es lo que permite cuadrar contra los reportes.
  ('ventas_factura',      'Facturas de venta',       'ventas_compras', 'hecho', 'incremental_ventana', 'OINV+INV1',
   'DocDate', 1, 'meses', 'DocEntry', '{}'::text[], 'data_owner_ventas', 'plata_documento_comercial+', NULL),
  ('ventas_nota_credito', 'Notas de crédito venta',  'ventas_compras', 'hecho', 'incremental_ventana', 'ORIN+RIN1',
   'DocDate', 1, 'meses', 'DocEntry', '{}'::text[], 'data_owner_ventas', 'plata_documento_comercial+', NULL),
  ('compras_factura',     'Facturas de compra',      'ventas_compras', 'hecho', 'incremental_ventana', 'OPCH+PCH1',
   'DocDate', 1, 'meses', 'DocEntry', '{}'::text[], 'data_owner_compras', 'plata_documento_comercial+', NULL),
  ('compras_nota_credito','Notas de crédito compra', 'ventas_compras', 'hecho', 'incremental_ventana', 'ORPC+RPC1',
   'DocDate', 1, 'meses', 'DocEntry', '{}'::text[], 'data_owner_compras', 'plata_documento_comercial+', NULL),

  -- §CARTERA: se lee del MAYOR, no de las facturas. Dos filtros la acotan:
  --   1) filtro_origen: solo partidas con saldo (campo contra campo)
  --   2) filtro por cuenta (campo_ingesta): solo cuentas de control de socios
  -- Sin (2) serían 1,043,823 partidas; con ambos, 9,682. Las cuentas son PROPIAS DE CADA
  -- INSTALACIÓN: al dar de alta otro cliente SAP B1 hay que ajustarlas (ver abajo).
  ('cartera',             'Cartera CxC y CxP',       'tesoreria',      'hecho', 'abiertos', 'JDT1+OJDT',
   NULL, NULL, NULL, 'TransId', '{}'::text[], 'data_owner_tesoreria', 'plata_partida_cartera+',
   '"BalDueDeb" <> "BalDueCred"')
) AS v(objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
       campo_fecha, lookback_valor, lookback_unidad, clave_natural, columnas_versionado,
       owner, modelos_dbt, filtro_origen)
ON CONFLICT (organizacion_id, objeto) DO UPDATE
   SET nombre_negocio = EXCLUDED.nombre_negocio, dominio = EXCLUDED.dominio,
       tipo_objeto = EXCLUDED.tipo_objeto, estrategia = EXCLUDED.estrategia,
       fuente_objeto = EXCLUDED.fuente_objeto, campo_fecha = EXCLUDED.campo_fecha,
       lookback_valor = EXCLUDED.lookback_valor, lookback_unidad = EXCLUDED.lookback_unidad,
       clave_natural = EXCLUDED.clave_natural, modelos_dbt = EXCLUDED.modelos_dbt,
       filtro_origen = EXCLUDED.filtro_origen, actualizado_en = now();

-- ---------------------------------------------------------------- mapeo de campos
-- `campo_canonico` se llena solo cuando el mapeo es 1:1 directo. Los derivados
-- (es_cliente desde CardType, saldo desde BalDueDeb−BalDueCred, signo de la nota de
-- crédito) los resuelve la capa Plata con SQL explícito: son reglas de negocio, no mapeo.
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
   filtro_op, filtro_valor)
SELECT org.id, v.* FROM org, (VALUES
  -- ============ OCRD → socio_negocio ============
  ('socios','OCRD','CardCode',  false,'text','Código del socio','socio_negocio','socio_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','CardName',  false,'text','Razón social','socio_negocio','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','LicTradNum',false,'text','NIT','socio_negocio','nit','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','CardType',  false,'text','C=cliente, S=proveedor, L=lead → es_cliente/es_proveedor en Plata','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','GroupCode', false,'int','Grupo comercial','socio_negocio','grupo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','GroupNum',  false,'int','Condición de pago','socio_negocio','condicion_pago_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','Currency',  false,'text','Moneda del socio','socio_negocio','moneda_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','Country',   false,'text','País','socio_negocio','pais','directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','Territory', false,'int','Zona/territorio','socio_negocio','region','directo',false,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','validFor',  false,'text','Activo (Y/N)','socio_negocio','activo','booleano_yn',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','DebPayAcct',false,'text','Cuenta de control del socio (define las cuentas de cartera)','socio_negocio',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','CreateDate',false,'date','Alta en el ERP','socio_negocio',NULL,'cast_fecha',false,true,'paquete_base',NULL,NULL),
  ('socios','OCRD','UpdateDate',false,'date','Última modificación (ventana de producción)','socio_negocio',NULL,'cast_fecha',false,true,'paquete_base',NULL,NULL),

  -- ============ OITM → producto ============
  ('productos','OITM','ItemCode',  false,'text','Código de artículo','producto','producto_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','OITM','ItemName',  false,'text','Descripción','producto','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','OITM','ItmsGrpCod',false,'int','Grupo de artículos','producto','grupo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','OITM','InvntryUom',false,'text','Unidad de medida','producto','unidad_medida','directo',true,true,'paquete_base',NULL,NULL),
  ('productos','OITM','InvntItem', false,'text','Y=inventariable → bien/servicio en Plata','producto',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('productos','OITM','validFor',  false,'text','Activo (Y/N)','producto','activo','booleano_yn',true,true,'paquete_base',NULL,NULL),

  -- ============ OSLP → vendedor ============
  ('vendedores','OSLP','SlpCode',false,'int','Código de vendedor','vendedor','vendedor_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','OSLP','SlpName',false,'text','Nombre','vendedor','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('vendedores','OSLP','Active', false,'text','Activo (Y/N)','vendedor','activo','booleano_yn',true,true,'paquete_base',NULL,NULL),

  -- ============ OACT → cuenta ============
  ('cuentas','OACT','AcctCode',  false,'text','Código interno de la cuenta','cuenta','cuenta_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','OACT','FormatCode',false,'text','Código legible del plan','cuenta','cuenta_codigo_visible','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','OACT','AcctName',  false,'text','Nombre de la cuenta','cuenta','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','OACT','ActType',   false,'text','I=ingreso, E=gasto, N=otro','cuenta',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','OACT','Postable',  false,'text','Admite asientos (Y/N)','cuenta',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('cuentas','OACT','FatherNum', false,'text','Cuenta padre (jerarquía)','cuenta',NULL,'directo',false,true,'paquete_base',NULL,NULL),

  -- ============ OWHS → almacen ============
  ('almacenes','OWHS','WhsCode', false,'text','Código de bodega','almacen','almacen_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','OWHS','WhsName', false,'text','Nombre de la bodega','almacen','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('almacenes','OWHS','Inactive',false,'text','Inactiva (Y/N) → se invierte en Plata','almacen',NULL,'directo',true,true,'paquete_base',NULL,NULL),

  -- ============ OCRN → moneda ============
  ('monedas','OCRN','CurrCode',false,'text','Código de moneda','moneda','moneda_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('monedas','OCRN','CurrName',false,'text','Nombre de la moneda','moneda','nombre','directo',true,true,'paquete_base',NULL,NULL),

  -- ============ OPRC → centro_costo ============
  ('centros_costo','OPRC','PrcCode',false,'text','Código de centro de costo','centro_costo','centro_costo_codigo','directo',true,true,'paquete_base',NULL,NULL),
  ('centros_costo','OPRC','PrcName',false,'text','Nombre','centro_costo','nombre','directo',true,true,'paquete_base',NULL,NULL),
  ('centros_costo','OPRC','Locked', false,'text','Bloqueado (Y/N) → se invierte en Plata','centro_costo',NULL,'directo',true,true,'paquete_base',NULL,NULL),
  ('centros_costo','OPRC','DimCode',false,'int','Dimensión a la que pertenece','centro_costo',NULL,'directo',false,true,'paquete_base',NULL,NULL)
) AS v(objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
       canonico_entidad, campo_canonico, transformacion, sugerido, incluido, origen,
       filtro_op, filtro_valor)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, canonico_entidad = EXCLUDED.canonico_entidad,
       campo_canonico = EXCLUDED.campo_canonico, transformacion = EXCLUDED.transformacion,
       sugerido = EXCLUDED.sugerido, incluido = EXCLUDED.incluido,
       filtro_op = EXCLUDED.filtro_op, filtro_valor = EXCLUDED.filtro_valor,
       origen = 'paquete_base', actualizado_en = now();
