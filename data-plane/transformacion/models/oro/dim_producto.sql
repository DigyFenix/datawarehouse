{#
  `producto_codigo` es la llave de negocio del ERP: ItemCode en SAP B1, product_tmpl_id en Odoo.
#}
{{ config(materialized='table') }}

select
    k.llave                                           as producto_clave,
    d.empresa_id,
    d.producto_codigo,
    d.nombre,
    d.grupo_codigo,
    d.unidad_medida,
    d.tipo_producto,
    d.activo,
    {{ columnas_vigencia() }}
from {{ ref('plata_producto') }} d
join {{ ref('llave_producto') }} k
     on k.empresa_id = d.empresa_id and k.producto_codigo = d.producto_codigo

union all

select
    {{ clave_no_definido() }}, 'GLOBAL', {{ codigo_no_definido() }}, {{ nombre_no_definido() }},
    null, null, null, true,
    {{ columnas_vigencia() }}
