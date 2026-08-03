-- =====================================================================
-- Propósito : EXTENSIÓN del paquete Odoo — DIRECCIONES: campos de dirección
--             y coordenadas en res_partner, y partner_shipping_id en el
--             documento. Con esto plata_direccion (rama Odoo) llena la
--             dimensión con hijos delivery/invoice y coordenadas.
--             (País/departamento con NOMBRE requieren res_country/
--             res_country_state: pendiente, quedan null — V1.)
-- Ejecución : psql -d cresta_dw -v org=<codigo> -f 69_paquete_odoo_direcciones.sql
-- Tablas    : metadatos.campo_ingesta
-- Idempotente: sí.
-- =====================================================================

\set ON_ERROR_STOP on

WITH org AS (SELECT id FROM gobierno.organizaciones WHERE codigo = :'org')
INSERT INTO metadatos.campo_ingesta
  (organizacion_id, objeto, tabla_origen, campo_origen, es_udf, tipo_origen, descripcion,
   transformacion, incluido, origen)
SELECT org.id, v.objeto, v.tabla, v.campo, false, v.tipo, v.descr, 'directo', true, 'paquete_base'
  FROM org, (VALUES
    ('socios','res_partner','type','varchar','delivery = entrega, invoice = facturación'),
    ('socios','res_partner','parent_id','int4','Socio padre (la dirección es un partner hijo)'),
    ('socios','res_partner','street','varchar','Calle'),
    ('socios','res_partner','street2','varchar','Calle (línea 2)'),
    ('socios','res_partner','city','varchar','Ciudad'),
    ('socios','res_partner','zip','varchar','Código postal'),
    ('socios','res_partner','partner_latitude','numeric','Latitud'),
    ('socios','res_partner','partner_longitude','numeric','Longitud'),
    ('ventas_factura','account_move','partner_shipping_id','int4','Dirección de entrega (partner hijo)')
  ) AS v (objeto, tabla, campo, tipo, descr)
ON CONFLICT (organizacion_id, objeto, tabla_origen, campo_origen)
DO UPDATE SET incluido = true, actualizado_en = now();
