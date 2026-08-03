{#
  Dimensión DIRECCIÓN — geografía de la operación. Una fila por dirección registrada del
  socio (entrega / facturación / principal), con país, departamento, municipio, ciudad y
  coordenadas donde el ERP las tenga.

  El hecho de ventas cruza por su DIRECCIÓN DE ENTREGA (ShipToCode del documento en SAP;
  partner_shipping_id en Odoo): responde "¿a dónde se vende?", que es distinto de "¿quién
  compra?" (un cliente con 20 puntos de entrega). Documento sin dirección → miembro
  No definido: el total siempre cuadra.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as direccion_clave,
    d.empresa_id,
    d.socio_codigo,
    d.direccion_codigo,
    d.tipo,
    d.calle,
    d.ciudad,
    d.municipio,
    d.departamento,
    d.pais,
    d.codigo_postal,
    d.latitud,
    d.longitud,
    {{ columnas_vigencia() }}
from {{ ref('plata_direccion') }} d
join {{ ref('llave_direccion') }} k
     on  k.empresa_id       = d.empresa_id
     and k.socio_codigo     = d.socio_codigo
     and k.tipo             = d.tipo
     and k.direccion_codigo = d.direccion_codigo

union all

-- MIEMBRO NO DEFINIDO: documentos sin dirección de entrega registrada.
select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ codigo_no_definido() }},
    'no_definido', {{ nombre_no_definido() }}, null, null, null, null, null, null, null,
    {{ columnas_vigencia() }}
