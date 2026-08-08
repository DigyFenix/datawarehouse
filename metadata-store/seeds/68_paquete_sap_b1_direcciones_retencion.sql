-- =====================================================================
-- Propósito : EXTENSIÓN del paquete SAP B1 — DIRECCIONES (CRD1 + catálogo
--             OCST + ShipToCode del documento) y RETENCIÓN (WTSum/WTSumFC
--             en cabeceras). PARAMETRIZADO por organización: forma parte
--             del ONBOARDING de cualquier tenant SAP B1 desde 2026-08-02.
--             Sin este seed, plata_direccion falla en el primer build
--             (bronce.crd1/ocst no existirían) y el cuadre se desvía en
--             sociedades que retienen (El Salvador: 1%).
-- Ejecución : psql -d quilate_control -v org=<codigo> -f 68_paquete_sap_b1_direcciones_retencion.sql
--             (después de 58/58b/64/66)
-- Tablas    : metadatos.politica_ingesta, metadatos.campo_ingesta
-- Idempotente: sí. Aplicado a grupocresta el 2026-08-02 (equivalente manual).
-- =====================================================================

\set ON_ERROR_STOP on

-- CRD1 viaja ENCADENADA al objeto socios (clave CardCode).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
UPDATE metadatos.politica_ingesta p
   SET fuente_objeto = 'OCRD+CRD1', actualizado_en = now()
  FROM org
 WHERE p.organizacion_id = org.id AND p.objeto = 'socios' AND p.fuente_objeto = 'OCRD';

-- OCST no tiene CardCode: objeto propio (catálogo chico, full_replace).
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.politica_ingesta
  (organizacion_id, objeto, nombre_negocio, dominio, tipo_objeto, estrategia, fuente_objeto,
   clave_natural, owner, modelos_dbt)
SELECT org.id, 'departamentos', 'Departamentos (catálogo geográfico)', 'datos_maestros',
       'maestro', 'full_replace', 'OCST', 'Code', 'data_steward', 'dim_direccion+'
  FROM org
ON CONFLICT (organizacion_id, objeto) DO NOTHING;

-- ---------------------------------------------------------------- campos
WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   transformacion, incluido, origen)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descr, 'directo', true, 'paquete_base'
  FROM org, (VALUES
    -- Direcciones del socio (solo lo principal)
    ('socios','CRD1','CardCode','TEXT','Socio dueño de la dirección'),
    ('socios','CRD1','Address','TEXT','Código/nombre de la dirección (lo referencia ShipToCode)'),
    ('socios','CRD1','AdresType','TEXT','S = entrega, B = facturación'),
    ('socios','CRD1','Street','TEXT','Calle / dirección libre'),
    ('socios','CRD1','City','TEXT','Ciudad'),
    ('socios','CRD1','County','TEXT','Municipio'),
    ('socios','CRD1','State','TEXT','Código de departamento (OCST)'),
    ('socios','CRD1','Country','TEXT','País (ISO-2 de SAP)'),
    ('socios','CRD1','ZipCode','TEXT','Código postal'),
    ('departamentos','OCST','Code','TEXT','Código de departamento'),
    ('departamentos','OCST','Name','TEXT','Nombre del departamento'),
    -- OCST tiene clave COMPUESTA (Code, Country): el mismo código existe en varios países.
    -- Sin este campo, una sociedad con catálogo de más de un país (svproavis: GT y SV) hace
    -- que el join de plata_direccion DUPLIQUE la dirección — y una dimensión con clave
    -- repetida rompe el refresco de Power BI, no el build de dbt.
    ('departamentos','OCST','Country','TEXT','País del departamento (clave compuesta con Code)'),
    -- Dirección de entrega del documento de venta
    ('ventas_factura','OINV','ShipToCode','TEXT','Dirección de entrega (CRD1 tipo S)'),
    -- Retención en cabeceras: DocTotal llega NETO de retención
    -- (base = DocTotal - VatSum + WTSum; verificado con El Salvador, 1%).
    ('ventas_factura','OINV','WTSum','DECIMAL','Retención (DocTotal llega neto de ella)'),
    ('ventas_factura','OINV','WTSumFC','DECIMAL','Retención en moneda del documento'),
    ('ventas_nota_credito','ORIN','WTSum','DECIMAL','Retención (DocTotal llega neto de ella)'),
    ('ventas_nota_credito','ORIN','WTSumFC','DECIMAL','Retención en moneda del documento'),
    ('compras_factura','OPCH','WTSum','DECIMAL','Retención (DocTotal llega neto de ella)'),
    ('compras_factura','OPCH','WTSumFC','DECIMAL','Retención en moneda del documento'),
    ('compras_nota_credito','ORPC','WTSum','DECIMAL','Retención (DocTotal llega neto de ella)'),
    ('compras_nota_credito','ORPC','WTSumFC','DECIMAL','Retención en moneda del documento')
  ) AS v (objeto, tabla, campo, tipo, descr)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen)
DO UPDATE SET incluido = true, actualizado_en = now();
